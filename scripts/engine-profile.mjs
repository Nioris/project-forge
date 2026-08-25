#!/usr/bin/env node
/**
 * Installed-engine authority for project game-engine selection.
 *
 * This module is deliberately read-only. Project creation writes forge.engine.json through its
 * own guarded workflow; phases and verifiers import this reader so they cannot diverge or trust a
 * project-local registry.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = resolve(HERE, '..');
export const ENGINE_PROFILE_FILE = 'forge.engine.json';
export const ENGINE_REGISTRY_FILE = join(ENGINE_ROOT, 'adapters', 'engine-profiles.json');

const TOP_LEVEL_KEYS = ['defaultEngine', 'kind', 'profiles', 'schemaVersion'];
const PROFILE_KEYS = [
  'capabilities',
  'capture',
  'displayName',
  'implementation',
  'projectMarkers',
  'projectTypes',
  'status',
  'webExport',
];
const CAPABILITY_KEYS = [
  'constructVerifier',
  'playtest',
  'proofVideo',
  'releaseExport',
  'techVerifier',
  'visualCapture',
];
const PROJECT_DOCUMENT_KEYS = ['engine', 'kind', 'schemaVersion'];

export class EngineProfileError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'EngineProfileError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new EngineProfileError(code, message, details);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) fail('ENGINE_PROFILE_INVALID_SHAPE', `${label} must be an object`);
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    const unknown = keys.filter(key => !expected.includes(key));
    const missing = expected.filter(key => !keys.includes(key));
    fail('ENGINE_PROFILE_INVALID_KEYS', `${label} has an invalid key set`, { unknown, missing });
  }
}

function assertStringList(value, label, allowedValues = null) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !item)) {
    fail('ENGINE_PROFILE_INVALID_LIST', `${label} must be a non-empty string array`);
  }
  if (new Set(value).size !== value.length) fail('ENGINE_PROFILE_DUPLICATE_VALUE', `${label} contains duplicates`);
  if (allowedValues && value.some(item => !allowedValues.includes(item))) {
    fail('ENGINE_PROFILE_INVALID_VALUE', `${label} contains an unsupported value`);
  }
}

function parseJson(text, source, code) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(code, `Invalid JSON in ${source}: ${error.message}`);
  }
}

export function validateEngineRegistry(registry) {
  assertExactKeys(registry, TOP_LEVEL_KEYS, 'engine registry');
  if (registry.schemaVersion !== 1) fail('ENGINE_REGISTRY_VERSION', 'Engine registry schemaVersion must be 1');
  if (registry.kind !== 'forge.engine-profile-registry') fail('ENGINE_REGISTRY_KIND', 'Engine registry kind is invalid');
  if (!isPlainObject(registry.profiles) || Object.keys(registry.profiles).length === 0) {
    fail('ENGINE_REGISTRY_EMPTY', 'Engine registry profiles must be a non-empty object');
  }

  for (const [id, profile] of Object.entries(registry.profiles)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail('ENGINE_REGISTRY_ID', `Invalid engine id: ${id}`);
    assertExactKeys(profile, PROFILE_KEYS, `engine profile ${id}`);
    if (typeof profile.displayName !== 'string' || !profile.displayName.trim()) {
      fail('ENGINE_REGISTRY_DISPLAY_NAME', `Engine ${id} needs a displayName`);
    }
    if (!['stable', 'experimental'].includes(profile.status)) {
      fail('ENGINE_REGISTRY_STATUS', `Engine ${id} has unsupported status ${profile.status}`);
    }
    assertStringList(profile.projectTypes, `engine ${id} projectTypes`, ['game', 'app']);
    if (!['browser', 'godot'].includes(profile.implementation)) {
      fail('ENGINE_REGISTRY_IMPLEMENTATION', `Engine ${id} has unsupported implementation ${profile.implementation}`);
    }
    if (!['browser', 'godot'].includes(profile.capture)) {
      fail('ENGINE_REGISTRY_CAPTURE', `Engine ${id} has unsupported capture ${profile.capture}`);
    }
    assertStringList(profile.projectMarkers, `engine ${id} projectMarkers`);
    if (profile.projectMarkers.some(marker => marker.includes('..') || marker.startsWith('/') || /^[A-Za-z]:/.test(marker))) {
      fail('ENGINE_REGISTRY_MARKER', `Engine ${id} has an unsafe project marker`);
    }
    if (typeof profile.webExport !== 'boolean') fail('ENGINE_REGISTRY_WEB_EXPORT', `Engine ${id} webExport must be boolean`);
    assertExactKeys(profile.capabilities, CAPABILITY_KEYS, `engine ${id} capabilities`);
    if (CAPABILITY_KEYS.some(key => typeof profile.capabilities[key] !== 'boolean')) {
      fail('ENGINE_REGISTRY_CAPABILITY', `Engine ${id} capabilities must be boolean`);
    }
  }

  const defaultProfile = registry.profiles[registry.defaultEngine];
  if (!defaultProfile) fail('ENGINE_REGISTRY_DEFAULT', `Unknown default engine: ${registry.defaultEngine}`);
  if (defaultProfile.status !== 'stable') fail('ENGINE_REGISTRY_DEFAULT', 'Default engine must be stable');
  return registry;
}

export function loadEngineRegistry(registryPath = ENGINE_REGISTRY_FILE) {
  if (!existsSync(registryPath)) fail('ENGINE_REGISTRY_MISSING', `Installed engine registry is missing: ${registryPath}`);
  const registry = parseJson(readFileSync(registryPath, 'utf8'), registryPath, 'ENGINE_REGISTRY_INVALID_JSON');
  return validateEngineRegistry(registry);
}

export function validateEngineProfileDocument(document, registry = loadEngineRegistry()) {
  assertExactKeys(document, PROJECT_DOCUMENT_KEYS, 'forge.engine.json');
  if (document.schemaVersion !== 1) fail('ENGINE_PROFILE_VERSION', 'forge.engine.json schemaVersion must be 1');
  if (document.kind !== 'forge.engine-profile') fail('ENGINE_PROFILE_KIND', 'forge.engine.json kind is invalid');
  if (typeof document.engine !== 'string' || !registry.profiles[document.engine]) {
    fail('ENGINE_PROFILE_UNKNOWN_ENGINE', `Unknown engine: ${String(document.engine)}`, {
      allowed: Object.keys(registry.profiles),
    });
  }
  return document;
}

export function createEngineProfileDocument(engine, registry = loadEngineRegistry()) {
  return validateEngineProfileDocument({ schemaVersion: 1, kind: 'forge.engine-profile', engine }, registry);
}

export function readEngineProfile(projectRoot = process.cwd(), options = {}) {
  const root = resolve(projectRoot);
  const registry = options.registry || loadEngineRegistry(options.registryPath);
  const profilePath = join(root, ENGINE_PROFILE_FILE);
  let source = 'file';
  let document;

  if (!existsSync(profilePath)) {
    source = 'default';
    document = createEngineProfileDocument(registry.defaultEngine, registry);
  } else {
    document = parseJson(readFileSync(profilePath, 'utf8'), profilePath, 'ENGINE_PROFILE_INVALID_JSON');
    validateEngineProfileDocument(document, registry);
  }

  const profile = registry.profiles[document.engine];
  return {
    ok: true,
    schemaVersion: 1,
    kind: document.kind,
    engine: document.engine,
    source,
    defaulted: source === 'default',
    status: profile.status,
    implementation: profile.implementation,
    capture: profile.capture,
    webExport: profile.webExport,
    capabilities: { ...profile.capabilities },
    projectFile: profilePath,
  };
}

export function listEngineProfiles(options = {}) {
  const registry = options.registry || loadEngineRegistry(options.registryPath);
  return {
    ok: true,
    schemaVersion: registry.schemaVersion,
    defaultEngine: registry.defaultEngine,
    profiles: Object.entries(registry.profiles).map(([id, profile]) => ({ id, ...profile })),
  };
}

function formatError(error) {
  if (error instanceof EngineProfileError) {
    return { ok: false, code: error.code, message: error.message, details: error.details };
  }
  return { ok: false, code: 'ENGINE_PROFILE_INTERNAL', message: error?.message || String(error) };
}

function cli(argv) {
  const command = argv[0] || 'read';
  const project = argv[1] || process.cwd();
  if (command === 'read' || command === 'check') return readEngineProfile(project);
  if (command === 'list') return listEngineProfiles();
  fail('ENGINE_PROFILE_USAGE', 'Usage: engine-profile.mjs read|check [project] | list');
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(JSON.stringify(formatError(error), null, 2));
    process.exitCode = error instanceof EngineProfileError ? 2 : 1;
  }
}
