#!/usr/bin/env node
/** Strict data contract and filesystem helpers for storefront release receipts. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORM_RELEASE_RECEIPT_KIND = 'forge.platform-release-receipt';
export const PLATFORM_RELEASE_RECEIPT_SCHEMA_VERSION = 1;
export const PLATFORM_RELEASE_RECEIPT_SUFFIX = '.platform-release-receipt.json';

const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const ENGINES = ['web', 'godot'];
const FAMILIES = ['web', 'android', 'windows'];
const READINESS = ['local-verified', 'external-blocked', 'submit-ready', 'published'];
const RECEIPT_KEYS = ['blockers', 'candidate', 'delivery', 'engine', 'generatedAt', 'integrations', 'kind', 'readiness', 'schemaVersion', 'sourceSnapshotSha256', 'target', 'version'];
const CANDIDATE_KEYS = ['artifactFamily', 'bytes', 'path', 'sha256'];
const INTEGRATION_KEYS = ['evidence', 'id', 'status'];
const DELIVERY_KEYS = ['evidence', 'reference', 'status'];

export class PlatformReleaseReceiptError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlatformReleaseReceiptError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new PlatformReleaseReceiptError(code, message, details);
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!plain(value)) fail('PLATFORM_RELEASE_RECEIPT_SHAPE', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail('PLATFORM_RELEASE_RECEIPT_KEYS', `${label} has an invalid key set`, {
      missing: wanted.filter(key => !actual.includes(key)),
      unknown: actual.filter(key => !wanted.includes(key)),
    });
  }
}

function stringOrNull(value, label) {
  if (value !== null && (typeof value !== 'string' || !value.trim())) {
    fail('PLATFORM_RELEASE_RECEIPT_VALUE', `${label} must be a non-empty string or null`);
  }
}

function stringList(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some(item => typeof item !== 'string' || !item.trim())) {
    fail('PLATFORM_RELEASE_RECEIPT_VALUE', `${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string array`);
  }
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  try { return new Date(time).toISOString() === value; } catch { return false; }
}

export function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value)) return false;
  const portable = value.replaceAll('\\', '/');
  if (portable.startsWith('/') || /^[a-zA-Z]:/u.test(portable)) return false;
  const parts = portable.split('/');
  return parts.every(part => part && part !== '.' && part !== '..');
}

export function validatePlatformReleaseReceipt(receipt) {
  exactKeys(receipt, RECEIPT_KEYS, 'platform release receipt');
  if (receipt.schemaVersion !== PLATFORM_RELEASE_RECEIPT_SCHEMA_VERSION) {
    fail('PLATFORM_RELEASE_RECEIPT_VERSION', 'platform release receipt schemaVersion must be 1');
  }
  if (receipt.kind !== PLATFORM_RELEASE_RECEIPT_KIND) fail('PLATFORM_RELEASE_RECEIPT_KIND', 'platform release receipt kind is invalid');
  if (typeof receipt.target !== 'string' || !SAFE_ID.test(receipt.target)) fail('PLATFORM_RELEASE_RECEIPT_TARGET', 'receipt target is invalid');
  if (typeof receipt.version !== 'string' || !VERSION.test(receipt.version)) fail('PLATFORM_RELEASE_RECEIPT_SEMVER', 'receipt version must be vN.N.N');
  if (!ENGINES.includes(receipt.engine)) fail('PLATFORM_RELEASE_RECEIPT_ENGINE', 'receipt engine is invalid');
  if (!isoDate(receipt.generatedAt)) fail('PLATFORM_RELEASE_RECEIPT_DATE', 'receipt generatedAt must be a canonical ISO timestamp');
  if (typeof receipt.sourceSnapshotSha256 !== 'string' || !SHA256.test(receipt.sourceSnapshotSha256)) {
    fail('PLATFORM_RELEASE_RECEIPT_SOURCE_HASH', 'receipt sourceSnapshotSha256 must be lowercase SHA-256');
  }

  exactKeys(receipt.candidate, CANDIDATE_KEYS, 'receipt candidate');
  if (!safeRelativePath(receipt.candidate.path)) fail('PLATFORM_RELEASE_RECEIPT_CANDIDATE_PATH', 'candidate path must be a safe project-relative path');
  if (!FAMILIES.includes(receipt.candidate.artifactFamily)) fail('PLATFORM_RELEASE_RECEIPT_FAMILY', 'candidate artifactFamily is invalid');
  if (typeof receipt.candidate.sha256 !== 'string' || !SHA256.test(receipt.candidate.sha256)) fail('PLATFORM_RELEASE_RECEIPT_HASH', 'candidate sha256 must be lowercase SHA-256');
  if (!Number.isSafeInteger(receipt.candidate.bytes) || receipt.candidate.bytes < 1) fail('PLATFORM_RELEASE_RECEIPT_BYTES', 'candidate bytes must be a positive safe integer');

  if (!Array.isArray(receipt.integrations)) fail('PLATFORM_RELEASE_RECEIPT_INTEGRATIONS', 'receipt integrations must be an array');
  const integrationIds = new Set();
  for (const integration of receipt.integrations) {
    exactKeys(integration, INTEGRATION_KEYS, 'receipt integration');
    if (typeof integration.id !== 'string' || !SAFE_ID.test(integration.id)) fail('PLATFORM_RELEASE_RECEIPT_INTEGRATION_ID', 'integration id is invalid');
    if (integrationIds.has(integration.id)) fail('PLATFORM_RELEASE_RECEIPT_INTEGRATION_DUPLICATE', `duplicate integration: ${integration.id}`);
    integrationIds.add(integration.id);
    if (!['passed', 'blocked'].includes(integration.status)) fail('PLATFORM_RELEASE_RECEIPT_INTEGRATION_STATUS', `integration ${integration.id} status is invalid`);
    stringOrNull(integration.evidence, `integration ${integration.id} evidence`);
  }

  exactKeys(receipt.delivery, DELIVERY_KEYS, 'receipt delivery');
  if (!['blocked', 'verified'].includes(receipt.delivery.status)) fail('PLATFORM_RELEASE_RECEIPT_DELIVERY', 'delivery status is invalid');
  stringOrNull(receipt.delivery.reference, 'delivery reference');
  stringList(receipt.delivery.evidence, 'delivery evidence');
  if (!READINESS.includes(receipt.readiness)) fail('PLATFORM_RELEASE_RECEIPT_READINESS', 'receipt readiness is invalid');
  stringList(receipt.blockers, 'receipt blockers');
  return receipt;
}

export function compareReleaseVersions(left, right) {
  const a = VERSION.exec(left);
  const b = VERSION.exec(right);
  if (!a || !b) fail('PLATFORM_RELEASE_RECEIPT_SEMVER', 'cannot compare invalid release versions');
  for (let index = 1; index <= 3; index += 1) {
    const av = BigInt(a[index]);
    const bv = BigInt(b[index]);
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export function parsePlatformReleaseReceipt(text, source = '<memory>') {
  let value;
  try { value = JSON.parse(text); } catch (error) {
    fail('PLATFORM_RELEASE_RECEIPT_JSON', `invalid JSON in ${source}: ${error.message}`);
  }
  return validatePlatformReleaseReceipt(value);
}

export function readPlatformReleaseReceipt(file) {
  return parsePlatformReleaseReceipt(fs.readFileSync(file, 'utf8'), file);
}

export function isPlatformReleaseReceiptFile(name) {
  return name === 'platform-release-receipt.json' || name.endsWith(PLATFORM_RELEASE_RECEIPT_SUFFIX);
}

function formatError(error) {
  return error instanceof PlatformReleaseReceiptError
    ? { ok: false, code: error.code, message: error.message, details: error.details }
    : { ok: false, code: 'PLATFORM_RELEASE_RECEIPT_INTERNAL', message: error?.message || String(error) };
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    console.error(JSON.stringify({ ok: false, code: 'PLATFORM_RELEASE_RECEIPT_USAGE', message: 'Usage: platform-release-receipt.mjs <receipt.json>' }, null, 2));
    process.exitCode = 2;
  } else {
    try {
      const receipt = readPlatformReleaseReceipt(path.resolve(file));
      console.log(JSON.stringify({ ok: true, receipt }, null, 2));
    } catch (error) {
      console.error(JSON.stringify(formatError(error), null, 2));
      process.exitCode = error instanceof PlatformReleaseReceiptError ? 1 : 2;
    }
  }
}
