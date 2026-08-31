#!/usr/bin/env node
/** Installed authority for storefront profiles and explicit per-project target selection. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLATFORM_ROOT = resolve(HERE, '..');
export const PLATFORM_TARGETS_FILE = 'forge.targets.json';
export const PLATFORM_REGISTRY_FILE = join(PLATFORM_ROOT, 'adapters', 'platform-profiles.json');

const REGISTRY_KEYS = ['kind', 'profiles', 'schemaVersion'];
const PROFILE_KEYS = [
  'adapterStatus',
  'artifactFamily',
  'artifactFormat',
  'compatibleEngines',
  'delivery',
  'displayName',
  'externalPrerequisites',
  'officialDocs',
  'releasePathSegment',
  'requiredIntegrations',
  'submitVerifier',
  'tier',
];
const SUBMIT_VERIFIER_KEYS = ['id', 'status'];
const TARGET_DOCUMENT_KEYS = ['kind', 'schemaVersion', 'targets'];
const TIERS = ['primary', 'considering'];
const ARTIFACT_FAMILIES = ['web', 'android', 'windows'];
const DELIVERIES = ['upload', 'hosted-url', 'platform-uploader'];
const ENGINES = ['web', 'godot'];
const ADAPTER_STATUSES = ['implemented', 'partial', 'planned'];
const SUBMIT_VERIFIER_STATUSES = ['unavailable', 'implemented'];

export class PlatformProfileError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlatformProfileError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new PlatformProfileError(code, message, details);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) fail('PLATFORM_PROFILE_INVALID_SHAPE', `${label} must be an object`);
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    fail('PLATFORM_PROFILE_INVALID_KEYS', `${label} has an invalid key set`, {
      unknown: keys.filter(key => !expected.includes(key)),
      missing: expected.filter(key => !keys.includes(key)),
    });
  }
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) fail('PLATFORM_PROFILE_INVALID_VALUE', `${label} has an unsupported value: ${String(value)}`);
}

function assertString(value, label, pattern = null) {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    fail('PLATFORM_PROFILE_INVALID_VALUE', `${label} must be a valid non-empty string`);
  }
}

function assertStringList(value, label, options = {}) {
  const { allowed = null, allowEmpty = true, url = false } = options;
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some(item => typeof item !== 'string' || !item)) {
    fail('PLATFORM_PROFILE_INVALID_LIST', `${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string array`);
  }
  if (new Set(value).size !== value.length) fail('PLATFORM_PROFILE_DUPLICATE_VALUE', `${label} contains duplicates`);
  if (allowed && value.some(item => !allowed.includes(item))) {
    fail('PLATFORM_PROFILE_INVALID_VALUE', `${label} contains an unsupported value`);
  }
  if (url && value.some(item => { try { return new URL(item).protocol !== 'https:'; } catch { return true; } })) {
    fail('PLATFORM_PROFILE_INVALID_VALUE', `${label} must contain only absolute HTTPS URLs`);
  }
}

function parseJson(text, source, code) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(code, `Invalid JSON in ${source}: ${error.message}`);
  }
}

export function validatePlatformRegistry(registry) {
  assertExactKeys(registry, REGISTRY_KEYS, 'platform registry');
  if (registry.schemaVersion !== 1) fail('PLATFORM_REGISTRY_VERSION', 'Platform registry schemaVersion must be 1');
  if (registry.kind !== 'forge.platform-profile-registry') fail('PLATFORM_REGISTRY_KIND', 'Platform registry kind is invalid');
  if (!isPlainObject(registry.profiles) || Object.keys(registry.profiles).length === 0) {
    fail('PLATFORM_REGISTRY_EMPTY', 'Platform registry profiles must be a non-empty object');
  }

  const releaseSegments = new Set();
  for (const [id, profile] of Object.entries(registry.profiles)) {
    if (!/^[a-z][a-z0-9-]*$/u.test(id)) fail('PLATFORM_REGISTRY_ID', `Invalid platform id: ${id}`);
    assertExactKeys(profile, PROFILE_KEYS, `platform profile ${id}`);
    assertString(profile.displayName, `Platform ${id} displayName`);
    assertEnum(profile.tier, TIERS, `Platform ${id} tier`);
    assertEnum(profile.artifactFamily, ARTIFACT_FAMILIES, `Platform ${id} artifactFamily`);
    assertEnum(profile.delivery, DELIVERIES, `Platform ${id} delivery`);
    assertString(profile.artifactFormat, `Platform ${id} artifactFormat`, /^[a-z0-9][a-z0-9-]*$/u);
    assertStringList(profile.compatibleEngines, `Platform ${id} compatibleEngines`, { allowed: ENGINES, allowEmpty: false });
    assertEnum(profile.adapterStatus, ADAPTER_STATUSES, `Platform ${id} adapterStatus`);
    assertExactKeys(profile.submitVerifier, SUBMIT_VERIFIER_KEYS, `Platform ${id} submitVerifier`);
    assertString(profile.submitVerifier.id, `Platform ${id} submitVerifier id`, /^[a-z][a-z0-9._-]*$/u);
    assertEnum(profile.submitVerifier.status, SUBMIT_VERIFIER_STATUSES, `Platform ${id} submitVerifier status`);
    assertString(profile.releasePathSegment, `Platform ${id} releasePathSegment`, /^[a-z][a-z0-9-]*$/u);
    if (releaseSegments.has(profile.releasePathSegment)) {
      fail('PLATFORM_REGISTRY_RELEASE_PATH', `Duplicate releasePathSegment: ${profile.releasePathSegment}`);
    }
    releaseSegments.add(profile.releasePathSegment);
    assertStringList(profile.requiredIntegrations, `Platform ${id} requiredIntegrations`);
    assertStringList(profile.externalPrerequisites, `Platform ${id} externalPrerequisites`);
    assertStringList(profile.officialDocs, `Platform ${id} officialDocs`, { allowEmpty: false, url: true });
  }
  return registry;
}

export function loadPlatformRegistry(registryPath = PLATFORM_REGISTRY_FILE) {
  if (!existsSync(registryPath)) fail('PLATFORM_REGISTRY_MISSING', `Installed platform registry is missing: ${registryPath}`);
  return validatePlatformRegistry(parseJson(
    readFileSync(registryPath, 'utf8'),
    registryPath,
    'PLATFORM_REGISTRY_INVALID_JSON',
  ));
}

export function validateForgeTargetsDocument(document, registry = loadPlatformRegistry()) {
  assertExactKeys(document, TARGET_DOCUMENT_KEYS, PLATFORM_TARGETS_FILE);
  if (document.schemaVersion !== 1) fail('PLATFORM_TARGETS_VERSION', `${PLATFORM_TARGETS_FILE} schemaVersion must be 1`);
  if (document.kind !== 'forge.target-selection') fail('PLATFORM_TARGETS_KIND', `${PLATFORM_TARGETS_FILE} kind is invalid`);
  if (!Array.isArray(document.targets) || document.targets.length === 0 || document.targets.some(item => typeof item !== 'string' || !item)) {
    fail('PLATFORM_TARGETS_INVALID_LIST', `${PLATFORM_TARGETS_FILE} targets must be a non-empty string array`);
  }
  if (new Set(document.targets).size !== document.targets.length) {
    fail('PLATFORM_TARGETS_DUPLICATE', `${PLATFORM_TARGETS_FILE} targets contains duplicates`);
  }
  const unknown = document.targets.filter(id => !registry.profiles[id]);
  if (unknown.length) {
    fail('PLATFORM_TARGETS_UNKNOWN', `${PLATFORM_TARGETS_FILE} contains unknown platform targets`, {
      unknown,
      allowed: Object.keys(registry.profiles),
    });
  }
  return document;
}

export function createForgeTargetsDocument(targets, registry = loadPlatformRegistry()) {
  return validateForgeTargetsDocument({ schemaVersion: 1, kind: 'forge.target-selection', targets }, registry);
}

export function readPlatformTargets(projectRoot = process.cwd(), options = {}) {
  const root = resolve(projectRoot);
  const registry = options.registry || loadPlatformRegistry(options.registryPath);
  const projectFile = join(root, PLATFORM_TARGETS_FILE);
  if (!existsSync(projectFile)) {
    return {
      ok: true,
      schemaVersion: 1,
      kind: 'forge.target-selection',
      configured: false,
      source: 'missing',
      targets: [],
      profiles: [],
      projectFile,
    };
  }
  const document = parseJson(readFileSync(projectFile, 'utf8'), projectFile, 'PLATFORM_TARGETS_INVALID_JSON');
  validateForgeTargetsDocument(document, registry);
  return {
    ok: true,
    schemaVersion: 1,
    kind: document.kind,
    configured: true,
    source: 'file',
    targets: [...document.targets],
    profiles: document.targets.map(id => ({ id, ...registry.profiles[id] })),
    projectFile,
  };
}

export function listPlatformProfiles(options = {}) {
  const registry = options.registry || loadPlatformRegistry(options.registryPath);
  return {
    ok: true,
    schemaVersion: registry.schemaVersion,
    kind: registry.kind,
    profiles: Object.entries(registry.profiles).map(([id, profile]) => ({ id, ...profile })),
  };
}

function formatError(error) {
  if (error instanceof PlatformProfileError) {
    return { ok: false, code: error.code, message: error.message, details: error.details };
  }
  return { ok: false, code: 'PLATFORM_PROFILE_INTERNAL', message: error?.message || String(error) };
}

function cli(argv) {
  const command = argv[0] || 'check';
  const project = argv[1] || process.cwd();
  if (command === 'check' || command === 'read') return readPlatformTargets(project);
  if (command === 'list') return listPlatformProfiles();
  fail('PLATFORM_PROFILE_USAGE', 'Usage: platform-profile.mjs list | check|read [project]');
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(JSON.stringify(formatError(error), null, 2));
    process.exitCode = error instanceof PlatformProfileError ? 2 : 1;
  }
}
