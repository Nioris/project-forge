/**
 * Engine-owned, tamper-evident local receipts for visual evidence.
 *
 * The receipt key and the receipts both live beside the trusted installed engine, never in the
 * game/app directory and never in the Forge ZIP.  A receipt is an HMAC-signed, immutable JSON
 * envelope binding a JSON payload to one resolved project root. This detects later project-local
 * evidence edits; it is not a privilege boundary against a process with full host shell access.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTrustedForgeEngineRoot } from './forge-engine-root.mjs';

export const VISUAL_RECEIPT_SCHEMA_VERSION = 1;
// Kept in the same engine-owned store because a web playtest is another bounded
// runtime attestation. The name is historical; receipts never live in a game.
export const VISUAL_RECEIPT_KINDS = new Set(['capture', 'proof', 'review', 'web-playtest']);
export const VISUAL_RECEIPT_KEY_FILE = 'phase4-visual-receipts.key';
export const VISUAL_RECEIPT_MAX_PAYLOAD_BYTES = 512 * 1024;

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const RECEIPT_ID_RE = /^[a-z0-9][a-z0-9._-]{15,127}$/iu;
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function error(code, message) {
  const result = new Error(message);
  result.code = code;
  return result;
}

function existingDirectory(value, label) {
  const resolved = path.resolve(String(value || ''));
  try {
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
    return fs.realpathSync(resolved);
  } catch {
    throw error('VISUAL_RECEIPT_PROJECT_UNAVAILABLE', `${label} is not an existing directory`);
  }
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeReceiptId(value) {
  const receiptId = String(value || '').trim();
  if (!RECEIPT_ID_RE.test(receiptId) || receiptId.includes('..')) {
    throw error('VISUAL_RECEIPT_INVALID_ID', 'Receipt ID must be a safe 16..128 character identifier');
  }
  return receiptId;
}

function assertReceiptKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (!VISUAL_RECEIPT_KINDS.has(kind)) throw error('VISUAL_RECEIPT_INVALID_KIND', 'Receipt kind must be capture, proof, review, or web-playtest');
  return kind;
}

function assertSafePayload(value, trail = '$', seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw error('VISUAL_RECEIPT_INVALID_PAYLOAD', `${trail} must not contain non-finite numbers`);
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw error('VISUAL_RECEIPT_INVALID_PAYLOAD', `${trail} contains a cycle`);
    seen.add(value);
    value.forEach((item, index) => assertSafePayload(item, `${trail}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw error('VISUAL_RECEIPT_INVALID_PAYLOAD', `${trail} must be plain JSON data`);
  }
  if (seen.has(value)) throw error('VISUAL_RECEIPT_INVALID_PAYLOAD', `${trail} contains a cycle`);
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) throw error('VISUAL_RECEIPT_INVALID_PAYLOAD', `${trail}.${key} is not allowed`);
    // Receipt payloads may contain human prose with slashes.  Treat only explicit path fields as paths.
    if (/(?:^|_)(?:path|file|manifest)$/iu.test(key) && typeof item === 'string') {
      const normalized = item.replaceAll('\\', '/');
      if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
        throw error('VISUAL_RECEIPT_PATH_ESCAPE', `${trail}.${key} must be a safe project-relative path`);
      }
    }
    assertSafePayload(item, `${trail}.${key}`, seen);
  }
  seen.delete(value);
}

function clonePayload(payload) {
  assertSafePayload(payload);
  const encoded = canonicalJson(payload);
  if (Buffer.byteLength(encoded, 'utf8') > VISUAL_RECEIPT_MAX_PAYLOAD_BYTES) {
    throw error('VISUAL_RECEIPT_PAYLOAD_TOO_LARGE', `Receipt payload exceeds ${VISUAL_RECEIPT_MAX_PAYLOAD_BYTES} bytes`);
  }
  return JSON.parse(encoded);
}

function receiptUnsigned(envelope) {
  return {
    schemaVersion: VISUAL_RECEIPT_SCHEMA_VERSION,
    kind: envelope.kind,
    receiptId: envelope.receiptId,
    project: envelope.project,
    issuedAt: envelope.issuedAt,
    payload: envelope.payload,
  };
}

function safeReceiptFile(store, kind, receiptId) {
  const file = path.resolve(store.receiptsDir, store.project.id, kind, `${receiptId}.json`);
  const expectedParent = path.resolve(store.receiptsDir, store.project.id, kind);
  if (!isInside(store.receiptsDir, file) || path.dirname(file) !== expectedParent) {
    throw error('VISUAL_RECEIPT_PATH_ESCAPE', 'Receipt path escapes the engine-owned receipt store');
  }
  return file;
}

function writeAtomicNew(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try {
      fs.linkSync(temp, file);
    } catch (cause) {
      if (cause?.code === 'EEXIST') return false;
      throw cause;
    }
    return true;
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

function loadReceiptKey(store) {
  fs.mkdirSync(store.secretsDir, { recursive: true, mode: 0o700 });
  const file = path.join(store.secretsDir, VISUAL_RECEIPT_KEY_FILE);
  if (!isInside(store.dataDir, file)) throw error('VISUAL_RECEIPT_PATH_ESCAPE', 'Receipt key path escapes forge-data');
  try {
    const existing = fs.readFileSync(file);
    if (existing.length < 32) throw error('VISUAL_RECEIPT_KEY_INVALID', 'Engine visual receipt key is too short');
    return existing;
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  }
  const generated = crypto.randomBytes(48);
  try {
    fs.writeFileSync(file, generated, { mode: 0o600, flag: 'wx' });
    return generated;
  } catch (cause) {
    if (cause?.code === 'EEXIST') return fs.readFileSync(file);
    throw cause;
  }
}

/** Resolve the private, engine-adjacent store and immutable identity for one project. */
export function resolveVisualReceiptStore({ projectRoot = process.cwd(), moduleRoot = MODULE_ROOT, environmentRoot } = {}) {
  const projectPath = existingDirectory(projectRoot, 'Project root');
  const engineRoot = resolveTrustedForgeEngineRoot({ projectRoot: projectPath, moduleRoot, environmentRoot });
  const dataDir = path.resolve(path.dirname(engineRoot), 'forge-data');
  const secretsDir = path.join(dataDir, 'secrets');
  const receiptsDir = path.join(dataDir, 'visual-receipts');
  if (!isInside(path.dirname(engineRoot), dataDir) || !isInside(dataDir, secretsDir) || !isInside(dataDir, receiptsDir)) {
    throw error('VISUAL_RECEIPT_PATH_ESCAPE', 'Engine receipt store is outside its sibling forge-data directory');
  }
  const canonicalProjectPath = process.platform === 'win32' ? projectPath.toLowerCase() : projectPath;
  return {
    engineRoot,
    dataDir,
    secretsDir,
    receiptsDir,
    project: {
      algorithm: 'sha256-realpath-v1',
      id: sha256(canonicalProjectPath),
    },
  };
}

/** Record an immutable, HMAC-signed capture, proof, or review receipt in the engine-adjacent store. */
export function recordVisualReceipt({ projectRoot = process.cwd(), kind, payload, receiptId = '', moduleRoot = MODULE_ROOT, environmentRoot } = {}) {
  const store = resolveVisualReceiptStore({ projectRoot, moduleRoot, environmentRoot });
  const safeKind = assertReceiptKind(kind);
  const safePayload = clonePayload(payload);
  const safeReceiptId = receiptId ? assertSafeReceiptId(receiptId) : sha256(canonicalJson({ kind: safeKind, project: store.project, payload: safePayload }));
  const unsigned = {
    schemaVersion: VISUAL_RECEIPT_SCHEMA_VERSION,
    kind: safeKind,
    receiptId: safeReceiptId,
    project: store.project,
    issuedAt: new Date().toISOString(),
    payload: safePayload,
  };
  const envelope = { ...unsigned, signature: hmac(loadReceiptKey(store), canonicalJson(unsigned)) };
  const file = safeReceiptFile(store, safeKind, safeReceiptId);
  const written = writeAtomicNew(file, `${JSON.stringify(envelope, null, 2)}\n`);
  if (!written) {
    const existing = readVisualReceipt({ projectRoot, kind: safeKind, receiptId: safeReceiptId, moduleRoot, environmentRoot });
    if (!existing.ok || canonicalJson(existing.receipt.payload) !== canonicalJson(safePayload)) {
      throw error('VISUAL_RECEIPT_COLLISION', 'Receipt ID already exists with different or invalid receipt data');
    }
    return { ...existing, written: false };
  }
  return { ok: true, written: true, file, receipt: envelope, store };
}

/** Read and verify an engine-owned receipt. Never trusts a project-local receipt copy. */
export function readVisualReceipt({ projectRoot = process.cwd(), kind, receiptId, expectedPayload = undefined, moduleRoot = MODULE_ROOT, environmentRoot } = {}) {
  try {
    const store = resolveVisualReceiptStore({ projectRoot, moduleRoot, environmentRoot });
    const safeKind = assertReceiptKind(kind);
    const safeReceiptId = assertSafeReceiptId(receiptId);
    const file = safeReceiptFile(store, safeKind, safeReceiptId);
    let receipt;
    try { receipt = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (cause) {
      return { ok: false, code: cause?.code === 'ENOENT' ? 'VISUAL_RECEIPT_MISSING' : 'VISUAL_RECEIPT_INVALID', failure: 'Trusted visual receipt is missing or invalid', file, store };
    }
    const unsigned = receiptUnsigned(receipt || {});
    if (receipt?.schemaVersion !== VISUAL_RECEIPT_SCHEMA_VERSION || receipt?.kind !== safeKind || receipt?.receiptId !== safeReceiptId
      || canonicalJson(receipt?.project) !== canonicalJson(store.project) || typeof receipt?.issuedAt !== 'string'
      || !Number.isFinite(Date.parse(receipt.issuedAt)) || new Date(receipt.issuedAt).toISOString() !== receipt.issuedAt) {
      return { ok: false, code: 'VISUAL_RECEIPT_BINDING_MISMATCH', failure: 'Trusted visual receipt does not bind to this project/kind/id', file, store };
    }
    try { assertSafePayload(receipt.payload); } catch (cause) {
      return { ok: false, code: cause.code || 'VISUAL_RECEIPT_INVALID_PAYLOAD', failure: cause.message, file, store };
    }
    const signature = hmac(loadReceiptKey(store), canonicalJson(unsigned));
    if (!constantTimeEqual(receipt.signature, signature)) {
      return { ok: false, code: 'VISUAL_RECEIPT_SIGNATURE_INVALID', failure: 'Trusted visual receipt signature is invalid', file, store };
    }
    if (expectedPayload !== undefined && canonicalJson(clonePayload(expectedPayload)) !== canonicalJson(receipt.payload)) {
      return { ok: false, code: 'VISUAL_RECEIPT_PAYLOAD_MISMATCH', failure: 'Trusted visual receipt payload differs from current evidence', file, store };
    }
    return { ok: true, receipt, file, store };
  } catch (cause) {
    return { ok: false, code: cause.code || 'VISUAL_RECEIPT_ERROR', failure: cause.message || 'Unable to read trusted visual receipt' };
  }
}

/** Alias with intent-revealing name for gate code. */
export const verifyVisualReceipt = readVisualReceipt;
