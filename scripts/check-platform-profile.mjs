#!/usr/bin/env node
/** Offline regressions for installed platform-profile authority. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  PlatformProfileError,
  createForgeTargetsDocument,
  listPlatformProfiles,
  loadPlatformRegistry,
  readPlatformTargets,
  validateForgeTargetsDocument,
  validatePlatformRegistry,
} from './platform-profile.mjs';

const ROOT = resolve(process.cwd());
const EXPECTED_IDS = ['yandex', 'vk', 'telegram', 'rustore', 'google-play', 'appgallery', 'vkplay', 'steam', 'crazygames', 'taptap'];
const errors = [];
const passed = [];

function pass(message) { passed.push(message); }
function fail(message) { errors.push(message); }
function expect(label, condition, details = '') {
  if (condition) pass(label);
  else fail(`${label}${details ? `: ${details}` : ''}`);
}
function expectCode(label, fn, code) {
  try {
    fn();
    fail(`${label}: expected ${code}, but no error was thrown`);
  } catch (error) {
    if (error instanceof PlatformProfileError && error.code === code) pass(label);
    else fail(`${label}: expected ${code}, got ${error?.code || error?.message || error}`);
  }
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function writeJson(file, value) { writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8'); }

const registry = loadPlatformRegistry();
expect('installed registry validates', registry.kind === 'forge.platform-profile-registry');
expect('registry contains exactly all ten target ids', JSON.stringify(Object.keys(registry.profiles)) === JSON.stringify(EXPECTED_IDS));
expect('primary and considering tiers are explicit',
  EXPECTED_IDS.every(id => ['primary', 'considering'].includes(registry.profiles[id]?.tier))
  && registry.profiles.crazygames.tier === 'considering'
  && registry.profiles.taptap.tier === 'considering');
expect('every platform has bounded engine compatibility and official documentation',
  EXPECTED_IDS.every(id => registry.profiles[id].compatibleEngines.length > 0 && registry.profiles[id].officialDocs.length > 0));
expect('local packaging and external submit verification are separately declared',
  EXPECTED_IDS.every(id => registry.profiles[id].adapterStatus === 'implemented'
    && registry.profiles[id].submitVerifier.status === 'unavailable'
    && registry.profiles[id].submitVerifier.id === `${id}-submit-verifier`));

const listed = listPlatformProfiles({ registry });
expect('profile listing preserves deterministic registry order', listed.profiles.map(item => item.id).join(',') === EXPECTED_IDS.join(','));
const validDocument = createForgeTargetsDocument(['yandex', 'steam'], registry);
expect('successful target document is exact and preserves selection order',
  validDocument.kind === 'forge.target-selection' && validDocument.targets.join(',') === 'yandex,steam');

expectCode('duplicate target is rejected', () => validateForgeTargetsDocument({
  schemaVersion: 1,
  kind: 'forge.target-selection',
  targets: ['yandex', 'yandex'],
}, registry), 'PLATFORM_TARGETS_DUPLICATE');
expectCode('unknown target is rejected', () => validateForgeTargetsDocument({
  schemaVersion: 1,
  kind: 'forge.target-selection',
  targets: ['unknown-store'],
}, registry), 'PLATFORM_TARGETS_UNKNOWN');
expectCode('empty target list is rejected', () => validateForgeTargetsDocument({
  schemaVersion: 1,
  kind: 'forge.target-selection',
  targets: [],
}, registry), 'PLATFORM_TARGETS_INVALID_LIST');
expectCode('missing target field is rejected', () => validateForgeTargetsDocument({
  schemaVersion: 1,
  kind: 'forge.target-selection',
}, registry), 'PLATFORM_PROFILE_INVALID_KEYS');
expectCode('additional target document field is rejected', () => validateForgeTargetsDocument({
  schemaVersion: 1,
  kind: 'forge.target-selection',
  targets: ['vk'],
  command: 'publish',
}, registry), 'PLATFORM_PROFILE_INVALID_KEYS');

const invalidRegistry = clone(registry);
invalidRegistry.profiles.yandex.command = 'publish';
expectCode('registry profile cannot smuggle executable fields', () => validatePlatformRegistry(invalidRegistry), 'PLATFORM_PROFILE_INVALID_KEYS');
const duplicateReleasePath = clone(registry);
duplicateReleasePath.profiles.vk.releasePathSegment = 'yandex';
expectCode('registry rejects duplicate release paths', () => validatePlatformRegistry(duplicateReleasePath), 'PLATFORM_REGISTRY_RELEASE_PATH');
const unsafeDocs = clone(registry);
unsafeDocs.profiles.telegram.officialDocs = ['http://example.invalid/docs'];
expectCode('registry requires HTTPS official documentation', () => validatePlatformRegistry(unsafeDocs), 'PLATFORM_PROFILE_INVALID_VALUE');
const invalidSubmitVerifier = clone(registry);
invalidSubmitVerifier.profiles.yandex.submitVerifier.status = 'local-hmac';
expectCode('registry rejects local or unrecognised submit trust modes', () => validatePlatformRegistry(invalidSubmitVerifier), 'PLATFORM_PROFILE_INVALID_VALUE');

const targetSchema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'forge-targets.schema.json'), 'utf8'));
expect('target schema enum matches installed registry',
  JSON.stringify(targetSchema.properties.targets.items.enum) === JSON.stringify(EXPECTED_IDS));
expect('target schema rejects additional fields', targetSchema.additionalProperties === false);
const registrySchema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'platform-profile.schema.json'), 'utf8'));
expect('registry schema requires exactly the installed profile ids',
  JSON.stringify(registrySchema.properties.profiles.required) === JSON.stringify(EXPECTED_IDS)
  && registrySchema.properties.profiles.additionalProperties === false);

const fixture = mkdtempSync(join(tmpdir(), 'forge-platform-profile-'));
try {
  const missing = join(fixture, 'missing');
  const valid = join(fixture, 'valid');
  const malformed = join(fixture, 'malformed');
  for (const dir of [missing, valid, malformed]) mkdirSync(dir, { recursive: true });
  writeJson(join(valid, 'forge.targets.json'), validDocument);
  writeFileSync(join(malformed, 'forge.targets.json'), '{ invalid json', 'utf8');

  const missingResult = readPlatformTargets(missing, { registry });
  expect('missing forge.targets.json never guesses defaults',
    missingResult.configured === false && missingResult.targets.length === 0 && missingResult.source === 'missing');
  const validResult = readPlatformTargets(valid, { registry });
  expect('configured targets resolve their installed profiles',
    validResult.configured === true && validResult.targets.join(',') === 'yandex,steam'
    && validResult.profiles.map(item => item.id).join(',') === 'yandex,steam');
  expectCode('malformed forge.targets.json fails closed',
    () => readPlatformTargets(malformed, { registry }), 'PLATFORM_TARGETS_INVALID_JSON');

  const listCli = spawnSync(process.execPath, ['scripts/platform-profile.mjs', 'list'], { cwd: ROOT, encoding: 'utf8' });
  let listValue = null;
  try { listValue = JSON.parse(listCli.stdout); } catch {}
  expect('CLI list exposes all ten profiles', listCli.status === 0 && listValue?.profiles?.length === 10, listCli.stderr);

  const coordinatorList = spawnSync(process.execPath, ['scripts/build-all-platforms.mjs', '--list', '--json'], { cwd: ROOT, encoding: 'utf8' });
  let coordinatorValue = null;
  try { coordinatorValue = JSON.parse(coordinatorList.stdout); } catch {}
  expect('storefront coordinator derives all targets from registry and labels legacy adapters separately',
    coordinatorList.status === 0
    && coordinatorValue?.storefrontTargets?.map(item => item.id).join(',') === EXPECTED_IDS.join(',')
    && coordinatorValue?.legacyAdapters?.join(',') === 'ok,max,web', coordinatorList.stderr);

  const completeness = spawnSync(process.execPath, ['scripts/check-platform-completeness.mjs', '--json'], { cwd: ROOT, encoding: 'utf8' });
  let completenessValue = null;
  try { completenessValue = JSON.parse(completeness.stdout); } catch {}
  expect('platform completeness keeps the ten targets separate from three legacy adapters',
    completeness.status === 0
    && completenessValue?.registryTargets?.join(',') === EXPECTED_IDS.join(',')
    && completenessValue?.legacyAdapters?.join(',') === 'ok,max,web'
    && completenessValue?.entries?.filter(item => item.kind === 'storefront-target').length === 10,
  completeness.stderr);

  const missingCli = spawnSync(process.execPath, ['scripts/platform-profile.mjs', 'check', missing], { cwd: ROOT, encoding: 'utf8' });
  let missingValue = null;
  try { missingValue = JSON.parse(missingCli.stdout); } catch {}
  expect('CLI check reports an unconfigured project without defaulting',
    missingCli.status === 0 && missingValue?.configured === false && missingValue?.targets?.length === 0, missingCli.stderr);

  const coordinatorMissing = spawnSync(process.execPath, ['scripts/build-all-platforms.mjs', missing, '--json'], { cwd: ROOT, encoding: 'utf8' });
  let coordinatorMissingValue = null;
  try { coordinatorMissingValue = JSON.parse(coordinatorMissing.stdout); } catch {}
  expect('storefront coordinator does not guess a target when forge.targets.json is absent',
    coordinatorMissing.status === 1
    && coordinatorMissingValue?.mode === 'storefront-targets'
    && coordinatorMissingValue?.verification?.failures?.some(item => item.code === 'PLATFORM_RELEASE_TARGETS_MISSING'),
  coordinatorMissing.stderr);

  const malformedCli = spawnSync(process.execPath, ['scripts/platform-profile.mjs', 'check', malformed], { cwd: ROOT, encoding: 'utf8' });
  let malformedValue = null;
  try { malformedValue = JSON.parse(malformedCli.stderr); } catch {}
  expect('CLI check returns a structured malformed-document failure',
    malformedCli.status === 2 && malformedValue?.code === 'PLATFORM_TARGETS_INVALID_JSON', malformedCli.stderr);

  const newProject = spawnSync(process.execPath, [
    'scripts/new-project.mjs', 'platform-target-fixture', '--type', 'game', '--engine', 'godot',
    '--platform', 'yandex,steam', '--platform', 'telegram', '--validate-only',
  ], { cwd: ROOT, encoding: 'utf8' });
  let newProjectValue = null;
  try { newProjectValue = JSON.parse(newProject.stdout); } catch {}
  expect('new-project validates repeated and comma-separated storefront selections',
    newProject.status === 0 && newProjectValue?.targets?.targets?.join(',') === 'yandex,steam,telegram', newProject.stderr);

  const badNewProject = spawnSync(process.execPath, [
    'scripts/new-project.mjs', 'platform-target-invalid', '--platform', 'not-a-store', '--validate-only',
  ], { cwd: ROOT, encoding: 'utf8' });
  expect('new-project rejects an unknown storefront before filesystem writes',
    badNewProject.status === 2 && /Invalid --platform selection/u.test(badNewProject.stderr), badNewProject.stderr);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

for (const message of passed) console.log(`[OK] ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`[FAIL] ${message}`);
  console.error(`Platform profile regressions: ${errors.length} failed, ${passed.length} passed`);
  process.exit(1);
}
console.log(`Platform profile regressions: ${passed.length} passed`);
