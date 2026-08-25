#!/usr/bin/env node
/** Offline regressions for installed engine-profile authority. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ENGINE_REGISTRY_FILE,
  EngineProfileError,
  createEngineProfileDocument,
  listEngineProfiles,
  loadEngineRegistry,
  readEngineProfile,
  validateEngineProfileDocument,
  validateEngineRegistry,
} from './engine-profile.mjs';

const ROOT = resolve(process.cwd());
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
    if (error instanceof EngineProfileError && error.code === code) pass(label);
    else fail(`${label}: expected ${code}, got ${error?.code || error?.message || error}`);
  }
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8'); }

const registry = loadEngineRegistry();
expect('installed registry validates', registry.kind === 'forge.engine-profile-registry');
expect('stable web is the installed default', registry.defaultEngine === 'web' && registry.profiles.web?.status === 'stable');
expect('Godot is explicitly experimental', registry.profiles.godot?.status === 'experimental');
expect('Godot exposes only completed construct and native visual capabilities', registry.profiles.godot?.capabilities?.constructVerifier === true
  && registry.profiles.godot?.capabilities?.visualCapture === true
  && registry.profiles.godot?.capabilities?.proofVideo === true
  && Object.entries(registry.profiles.godot?.capabilities || {})
    .filter(([key]) => !['constructVerifier', 'visualCapture', 'proofVideo'].includes(key))
    .every(([, value]) => value === false));
expect('Godot C# profile does not claim web export', registry.profiles.godot?.webExport === false);

const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'engine-profile.schema.json'), 'utf8'));
const schemaEngines = [...(schema.properties?.engine?.enum || [])].sort();
const registryEngines = Object.keys(registry.profiles).sort();
expect('schema engine enum matches installed registry', JSON.stringify(schemaEngines) === JSON.stringify(registryEngines));
expect('schema rejects additional project fields', schema.additionalProperties === false);

const listed = listEngineProfiles({ registry });
expect('profile listing is deterministic', listed.defaultEngine === 'web' && listed.profiles.map(item => item.id).join(',') === 'web,godot');
expect('pure document factory creates Godot contract', createEngineProfileDocument('godot', registry).engine === 'godot');

expectCode('unknown project engine is rejected', () => validateEngineProfileDocument({
  schemaVersion: 1,
  kind: 'forge.engine-profile',
  engine: 'unity',
}, registry), 'ENGINE_PROFILE_UNKNOWN_ENGINE');
expectCode('additional project field is rejected', () => validateEngineProfileDocument({
  schemaVersion: 1,
  kind: 'forge.engine-profile',
  engine: 'web',
  command: 'run anything',
}, registry), 'ENGINE_PROFILE_INVALID_KEYS');
expectCode('wrong contract kind is rejected', () => validateEngineProfileDocument({
  schemaVersion: 1,
  kind: 'forge.agent-profile',
  engine: 'web',
}, registry), 'ENGINE_PROFILE_KIND');

const registryWithCommand = clone(registry);
registryWithCommand.profiles.web.command = 'npm run dev';
expectCode('registry cannot smuggle project commands', () => validateEngineRegistry(registryWithCommand), 'ENGINE_PROFILE_INVALID_KEYS');
const registryWithUnsafeMarker = clone(registry);
registryWithUnsafeMarker.profiles.web.projectMarkers = ['../index.html'];
expectCode('registry rejects escaping markers', () => validateEngineRegistry(registryWithUnsafeMarker), 'ENGINE_REGISTRY_MARKER');
const registryWithExperimentalDefault = clone(registry);
registryWithExperimentalDefault.defaultEngine = 'godot';
expectCode('experimental engine cannot become implicit default', () => validateEngineRegistry(registryWithExperimentalDefault), 'ENGINE_REGISTRY_DEFAULT');

const fixture = mkdtempSync(join(tmpdir(), 'forge-engine-profile-'));
try {
  const legacy = join(fixture, 'legacy');
  const web = join(fixture, 'web');
  const godot = join(fixture, 'godot');
  const invalid = join(fixture, 'invalid');
  for (const path of [legacy, web, godot, invalid]) mkdirSync(path, { recursive: true });
  writeJson(join(web, 'forge.engine.json'), createEngineProfileDocument('web', registry));
  writeJson(join(godot, 'forge.engine.json'), createEngineProfileDocument('godot', registry));
  writeFileSync(join(invalid, 'forge.engine.json'), '{ not json', 'utf8');

  const legacyResult = readEngineProfile(legacy, { registry });
  expect('legacy project defaults to web without migration', legacyResult.engine === 'web' && legacyResult.source === 'default' && legacyResult.defaulted === true);
  const webResult = readEngineProfile(web, { registry });
  expect('explicit web profile is read from file', webResult.engine === 'web' && webResult.source === 'file' && webResult.defaulted === false);
  const godotResult = readEngineProfile(godot, { registry });
  expect('explicit Godot profile preserves experimental capability state', godotResult.engine === 'godot' && godotResult.status === 'experimental' && godotResult.capabilities.constructVerifier === true);
  expectCode('malformed project profile fails closed', () => readEngineProfile(invalid, { registry }), 'ENGINE_PROFILE_INVALID_JSON');

  const cli = spawnSync(process.execPath, ['scripts/engine-profile.mjs', 'read', legacy], { cwd: ROOT, encoding: 'utf8' });
  const cliValue = cli.status === 0 ? JSON.parse(cli.stdout) : null;
  expect('CLI reader uses the same default authority', cli.status === 0 && cliValue?.engine === 'web' && cliValue?.source === 'default', cli.stderr);

  const badCli = spawnSync(process.execPath, ['scripts/engine-profile.mjs', 'check', invalid], { cwd: ROOT, encoding: 'utf8' });
  let badValue = null;
  try { badValue = JSON.parse(badCli.stderr); } catch {}
  expect('CLI check returns structured failure', badCli.status === 2 && badValue?.code === 'ENGINE_PROFILE_INVALID_JSON', badCli.stderr);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const registryText = readFileSync(ENGINE_REGISTRY_FILE, 'utf8');
expect('installed registry contains no executable command keys', !/"(?:command|args|script|executable|shell)"\s*:/.test(registryText));

const newDefault = spawnSync(process.execPath, [
  'scripts/new-project.mjs', 'engine-profile-default-fixture', '--type', 'game', '--validate-only',
], { cwd: ROOT, encoding: 'utf8' });
let newDefaultValue = null;
try { newDefaultValue = JSON.parse(newDefault.stdout); } catch {}
expect('new-project defaults legacy-compatible creation to web', newDefault.status === 0 && newDefaultValue?.profile?.engine === 'web' && newDefaultValue?.status === 'stable', newDefault.stderr);

const newWeb = spawnSync(process.execPath, [
  'scripts/new-project.mjs', 'engine-profile-web-fixture', '--type', 'game', '--engine', 'web', '--validate-only',
], { cwd: ROOT, encoding: 'utf8' });
let newWebValue = null;
try { newWebValue = JSON.parse(newWeb.stdout); } catch {}
expect('new-project accepts explicit stable web profile', newWeb.status === 0 && newWebValue?.profile?.engine === 'web', newWeb.stderr);

const newGodot = spawnSync(process.execPath, [
  'scripts/new-project.mjs', 'engine-profile-godot-fixture', '--type', 'game', '--engine', 'godot', '--validate-only',
], { cwd: ROOT, encoding: 'utf8' });
let newGodotValue = null;
try { newGodotValue = JSON.parse(newGodot.stdout); } catch {}
expect('new-project accepts experimental Godot game', newGodot.status === 0 && newGodotValue?.profile?.engine === 'godot' && newGodotValue?.status === 'experimental', newGodot.stderr);

const invalidApp = spawnSync(process.execPath, [
  'scripts/new-project.mjs', 'engine-profile-invalid-app', '--type', 'app', '--engine', 'godot', '--validate-only',
], { cwd: ROOT, encoding: 'utf8' });
expect('new-project rejects app + Godot', invalidApp.status === 2 && /does not support project type app/.test(invalidApp.stderr), invalidApp.stderr);

for (const message of passed) console.log(`[OK] ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`[FAIL] ${message}`);
  console.error(`Engine profile regressions: ${errors.length} failed, ${passed.length} passed`);
  process.exit(1);
}
console.log(`Engine profile regressions: ${passed.length} passed`);
