/**
 * Engine-owned, tamper-evident receipts for native Godot releases.
 *
 * The project contains the distributable manifest, while the signing key and signed receipt live
 * beside the trusted installed Forge engine. This prevents project-local JSON/ZIP edits from
 * becoming release evidence. Like every local HMAC receipt, this detects project tampering; it is
 * not an OS security boundary against a process that already controls the Forge installation.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTrustedForgeEngineRoot } from './forge-engine-root.mjs';

export const GODOT_RELEASE_RECEIPT_SCHEMA_VERSION = 1;
export const GODOT_RELEASE_RECEIPT_KEY_FILE = 'godot-release-receipts.key';
const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const SAFE_VERSION = /^v\d+\.\d+\.\d+$/u;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hmac(key, value) { return crypto.createHmac('sha256', key).update(value).digest('hex'); }
function equal(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function existingDirectory(value, label) {
  try {
    const resolved = fs.realpathSync(path.resolve(String(value || '')));
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
    return resolved;
  } catch { fail('GODOT_RELEASE_RECEIPT_PROJECT', `${label} is not an existing directory`); }
}
function safePayload(payload) {
  let encoded;
  try { encoded = canonicalJson(payload); } catch { fail('GODOT_RELEASE_RECEIPT_PAYLOAD', 'release receipt payload must be JSON data'); }
  if (Buffer.byteLength(encoded, 'utf8') > 256 * 1024) fail('GODOT_RELEASE_RECEIPT_PAYLOAD', 'release receipt payload is too large');
  const clone = JSON.parse(encoded);
  if (!clone || typeof clone !== 'object' || Array.isArray(clone)) fail('GODOT_RELEASE_RECEIPT_PAYLOAD', 'release receipt payload must be an object');
  return clone;
}
function loadKey(store, create = true) {
  if (create) fs.mkdirSync(store.secretsDir, { recursive: true, mode: 0o700 });
  const file = path.join(store.secretsDir, GODOT_RELEASE_RECEIPT_KEY_FILE);
  if (!inside(store.dataDir, file)) fail('GODOT_RELEASE_RECEIPT_PATH', 'release receipt key escapes forge-data');
  try {
    const key = fs.readFileSync(file);
    if (key.length < 32) fail('GODOT_RELEASE_RECEIPT_KEY', 'release receipt key is invalid');
    return key;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (!create) fail('GODOT_RELEASE_RECEIPT_KEY_MISSING', 'release receipt signing key is missing');
  }
  const key = crypto.randomBytes(48);
  try { fs.writeFileSync(file, key, { mode: 0o600, flag: 'wx' }); return key; }
  catch (error) { if (error?.code === 'EEXIST') return fs.readFileSync(file); throw error; }
}
function receiptPath(store, slug, version) {
  if (!SAFE_ID.test(slug) || !SAFE_VERSION.test(version)) fail('GODOT_RELEASE_RECEIPT_ID', 'unsafe release receipt identity');
  const file = path.resolve(store.receiptsDir, store.projectId, slug, `${version}.json`);
  if (!inside(store.receiptsDir, file)) fail('GODOT_RELEASE_RECEIPT_PATH', 'release receipt path escapes its engine-owned store');
  return file;
}
function unsigned(receipt) {
  return {
    schemaVersion: GODOT_RELEASE_RECEIPT_SCHEMA_VERSION,
    kind: 'forge.godot-release-receipt',
    slug: receipt.slug,
    version: receipt.version,
    projectId: receipt.projectId,
    issuedAt: receipt.issuedAt,
    payload: receipt.payload,
  };
}
function writeAtomicNew(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { fs.linkSync(temp, file); }
    catch (error) { if (error?.code === 'EEXIST') return false; throw error; }
    return true;
  } finally { try { fs.unlinkSync(temp); } catch {} }
}

export function resolveGodotReleaseReceiptStore({ projectRoot = process.cwd(), moduleRoot = MODULE_ROOT, environmentRoot } = {}) {
  const project = existingDirectory(projectRoot, 'Project root');
  const engineRoot = resolveTrustedForgeEngineRoot({ projectRoot: project, moduleRoot, environmentRoot });
  const dataDir = path.resolve(path.dirname(engineRoot), 'forge-data');
  const store = {
    engineRoot,
    dataDir,
    secretsDir: path.join(dataDir, 'secrets'),
    receiptsDir: path.join(dataDir, 'godot-release-receipts'),
    projectId: sha256(process.platform === 'win32' ? project.toLowerCase() : project),
  };
  if (!inside(path.dirname(engineRoot), dataDir) || !inside(dataDir, store.secretsDir) || !inside(dataDir, store.receiptsDir)) {
    fail('GODOT_RELEASE_RECEIPT_PATH', 'release receipt store is outside forge-data');
  }
  return store;
}

/** Canonical security-relevant subset bound by the engine-owned receipt. */
export function createGodotReleaseReceiptPayload({ manifestPath, manifestSha256, manifest } = {}) {
  const value = {
    manifestPath: String(manifestPath || '').replaceAll('\\', '/').replace(/^\.\//u, ''),
    manifestSha256,
    engine: manifest?.engine,
    exports: manifest?.exports,
    preset: manifest?.preset,
    sourceSnapshotSha256: manifest?.sourceSnapshotSha256,
    visualEvidence: manifest?.visualEvidence,
    artifacts: manifest?.artifacts,
  };
  if (!value.manifestPath || path.isAbsolute(value.manifestPath) || value.manifestPath.split('/').includes('..')
    || !/^[a-f0-9]{64}$/u.test(String(value.manifestSha256 || ''))) {
    fail('GODOT_RELEASE_RECEIPT_PAYLOAD', 'release receipt requires a safe manifest path and SHA-256');
  }
  return safePayload(value);
}

export function recordGodotReleaseReceipt({ projectRoot = process.cwd(), slug, version, payload, moduleRoot = MODULE_ROOT, environmentRoot } = {}) {
  const store = resolveGodotReleaseReceiptStore({ projectRoot, moduleRoot, environmentRoot });
  const clean = safePayload(payload);
  const envelope = {
    schemaVersion: GODOT_RELEASE_RECEIPT_SCHEMA_VERSION,
    kind: 'forge.godot-release-receipt',
    slug,
    version,
    projectId: store.projectId,
    issuedAt: new Date().toISOString(),
    payload: clean,
  };
  envelope.signature = hmac(loadKey(store), canonicalJson(unsigned(envelope)));
  const file = receiptPath(store, slug, version);
  if (!writeAtomicNew(file, `${JSON.stringify(envelope, null, 2)}\n`)) {
    const current = verifyGodotReleaseReceipt({ projectRoot, slug, version, expectedPayload: clean, moduleRoot, environmentRoot });
    if (!current.ok) fail('GODOT_RELEASE_RECEIPT_COLLISION', 'release receipt already exists with different or invalid data');
    return { ...current, written: false };
  }
  return { ok: true, written: true, file, receipt: envelope, store };
}

export function verifyGodotReleaseReceipt({ projectRoot = process.cwd(), slug, version, expectedPayload, moduleRoot = MODULE_ROOT, environmentRoot } = {}) {
  try {
    const store = resolveGodotReleaseReceiptStore({ projectRoot, moduleRoot, environmentRoot });
    const file = receiptPath(store, slug, version);
    let receipt;
    try { receipt = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return { ok: false, code: 'GODOT_RELEASE_RECEIPT_MISSING', failure: 'trusted release receipt is missing', file }; }
    const clean = safePayload(receipt?.payload);
    if (receipt?.schemaVersion !== GODOT_RELEASE_RECEIPT_SCHEMA_VERSION || receipt?.kind !== 'forge.godot-release-receipt'
      || receipt?.slug !== slug || receipt?.version !== version || receipt?.projectId !== store.projectId
      || typeof receipt?.issuedAt !== 'string' || !Number.isFinite(Date.parse(receipt.issuedAt))
      || new Date(receipt.issuedAt).toISOString() !== receipt.issuedAt) {
      return { ok: false, code: 'GODOT_RELEASE_RECEIPT_BINDING', failure: 'trusted release receipt identity is invalid', file };
    }
    if (!equal(receipt.signature, hmac(loadKey(store, false), canonicalJson(unsigned({ ...receipt, payload: clean }))))) {
      return { ok: false, code: 'GODOT_RELEASE_RECEIPT_SIGNATURE', failure: 'trusted release receipt signature is invalid', file };
    }
    if (expectedPayload !== undefined && canonicalJson(safePayload(expectedPayload)) !== canonicalJson(clean)) {
      return { ok: false, code: 'GODOT_RELEASE_RECEIPT_PAYLOAD', failure: 'trusted release receipt does not match the current release', file };
    }
    return { ok: true, file, receipt, store };
  } catch (error) {
    return { ok: false, code: error.code || 'GODOT_RELEASE_RECEIPT_ERROR', failure: error.message || String(error) };
  }
}
