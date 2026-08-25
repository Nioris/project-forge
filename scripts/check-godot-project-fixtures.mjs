#!/usr/bin/env node
/** Deterministic fixture regressions for the Godot construct verifier. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePhaseCompletion } from '../.claude/skills/status/references/phase-completion-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = path.join(ROOT, 'scripts', 'check-godot-project.mjs');
const fixtures = path.join(ROOT, 'scripts', 'fixtures', 'godot-projects');
const shim = path.join(ROOT, 'scripts', 'fixtures', 'godot-tools', 'fake-godot.mjs');
const errors = [];
const passed = [];

function check(condition, message, details = '') {
  if (condition) passed.push(message);
  else errors.push(`${message}${details ? `: ${details}` : ''}`);
}

function run(target, env = {}) {
  const child = spawnSync(process.execPath, [checker, target, '--json'], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  let value = null;
  try { value = JSON.parse(child.stdout); } catch {}
  return { child, value };
}

const harness = { FORGE_ALLOW_TEST_HARNESS: '1', FORGE_GODOT_TEST_SHIM: shim, FORGE_GODOT_BIN: '' };
const passRoot = path.join(fixtures, 'pass-gdscript');
const sourceCache = path.join(passRoot, '.godot');
const sourceCacheBefore = fs.existsSync(sourceCache) ? fs.statSync(sourceCache).mtimeMs : null;
const pass = run(passRoot, harness);
check(pass.child.status === 0 && pass.value?.status === 'passed', 'valid GDScript fixture passes the isolated construct verifier', `${pass.child.stdout}\n${pass.child.stderr}`);
check(pass.value?.checks?.some(item => item.id === 'headless-import' && item.status === 'passed')
  && pass.value?.checks?.some(item => item.id === 'headless-startup' && item.status === 'passed'),
'pass fixture proves both import and bounded startup');
check(pass.value?.toolchain?.godot?.version === '4.7.test.fixture', 'verifier records the factual Godot version returned by the tool');
const sourceCacheAfter = fs.existsSync(sourceCache) ? fs.statSync(sourceCache).mtimeMs : null;
check(sourceCacheAfter === sourceCacheBefore, 'isolated verification does not create or touch the source .godot cache');

const broken = run(path.join(fixtures, 'fail-serialization'), harness);
check(broken.child.status === 1 && broken.value?.status === 'failed', 'broken serialization fixture is a project failure');
check(broken.value?.issues?.some(item => item.rule === 'scene-serialization' && /(?:serializes .* contract requires|lost required serialized nodes)/u.test(item.message)),
'scene serialization loss has its own classified failure');
check(!broken.value?.checks?.some(item => item.id === 'headless-import'), 'static serialization failure stops before expensive runtime tools');

const detachedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-detached-script-'));
try {
  fs.cpSync(passRoot, detachedRoot, { recursive: true, filter: source => path.basename(source) !== '.godot' });
  const sceneFile = path.join(detachedRoot, 'main.tscn');
  fs.writeFileSync(sceneFile, fs.readFileSync(sceneFile, 'utf8').replace(/^script\s*=.*\r?\n/mu, ''));
  const detached = run(detachedRoot, harness);
  check(detached.child.status === 1 && detached.value?.status === 'failed', 'declared but detached required script is a project failure');
  check(detached.value?.issues?.some(item => item.rule === 'scene-serialization' && /declared but not attached/u.test(item.message)),
    'scene verifier proves a required script is actually attached to a node');
} finally {
  fs.rmSync(detachedRoot, { recursive: true, force: true });
}

const wrongTypeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-wrong-node-type-'));
try {
  fs.cpSync(passRoot, wrongTypeRoot, { recursive: true, filter: source => path.basename(source) !== '.godot' });
  const sceneFile = path.join(wrongTypeRoot, 'main.tscn');
  fs.writeFileSync(sceneFile, fs.readFileSync(sceneFile, 'utf8').replace('name="UI" type="Control"', 'name="UI" type="Node2D"'));
  const wrongType = run(wrongTypeRoot, harness);
  check(wrongType.child.status === 1 && wrongType.value?.status === 'failed', 'wrong required node type is a project failure');
  check(wrongType.value?.issues?.some(item => item.rule === 'scene-serialization' && /Main\/UI must be Control, got Node2D/u.test(item.message)),
    'scene verifier binds required node paths to exact Godot types');
} finally {
  fs.rmSync(wrongTypeRoot, { recursive: true, force: true });
}

const missingTool = path.join(fixtures, process.platform === 'win32' ? 'missing-godot.exe' : 'missing-godot');
const missing = run(passRoot, {
  FORGE_ALLOW_TEST_HARNESS: '',
  FORGE_GODOT_TEST_SHIM: '',
  FORGE_GODOT_BIN: missingTool,
});
check(missing.child.status === 2 && missing.value?.status === 'environment_failure', 'missing Godot executable is an environment failure');
check(missing.value?.issues?.some(item => item.rule === 'godot-toolchain'), 'missing tool reports a classified godot-toolchain issue');

const gateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-phase3-'));
try {
  fs.cpSync(passRoot, gateRoot, { recursive: true, filter: source => path.basename(source) !== '.godot' });
  fs.mkdirSync(path.join(gateRoot, 'wiki', 'plan'), { recursive: true });
  fs.writeFileSync(path.join(gateRoot, 'wiki', 'plan', '02-development-plan.md'), `# Development plan\n\n${'Implemented native Godot construct sprint with serialized World and UI nodes. '.repeat(4)}\n`);
  fs.writeFileSync(path.join(gateRoot, 'wiki', 'testing.md'), `# Testing\n\n${'Headless import and startup smoke are verified by the installed Godot adapter. '.repeat(3)}\n`);
  const previousHarness = process.env.FORGE_ALLOW_TEST_HARNESS;
  const previousShim = process.env.FORGE_GODOT_TEST_SHIM;
  process.env.FORGE_ALLOW_TEST_HARNESS = '1';
  process.env.FORGE_GODOT_TEST_SHIM = shim;
  const gate = validatePhaseCompletion({
    root: gateRoot,
    phase: 3,
    evidence: ['wiki/plan/02-development-plan.md', 'wiki/testing.md'],
  });
  if (previousHarness == null) delete process.env.FORGE_ALLOW_TEST_HARNESS; else process.env.FORGE_ALLOW_TEST_HARNESS = previousHarness;
  if (previousShim == null) delete process.env.FORGE_GODOT_TEST_SHIM; else process.env.FORGE_GODOT_TEST_SHIM = previousShim;
  check(gate.ok && gate.engineVerification?.status === 'passed', 'Phase 3 completion dispatches to the native Godot verifier');
  check(!gate.failures.some(item => /browser|playtest-out/u.test(item)), 'native Phase 3 completion does not require browser evidence');
} finally {
  fs.rmSync(gateRoot, { recursive: true, force: true });
}

const bounded = spawnSync(process.execPath, [
  path.join(ROOT, 'scripts', 'run-bounded-command.mjs'),
  '--timeout', '250', '--max-bytes', '65536', '--', process.execPath, '-e', 'setInterval(()=>{},1000)',
], { cwd: ROOT, encoding: 'utf8', timeout: 5000, windowsHide: true });
let boundedValue = null;
try { boundedValue = JSON.parse(bounded.stdout); } catch {}
check(bounded.status === 0 && boundedValue?.timedOut === true && boundedValue?.durationMs < 5000,
'bounded runner kills a hung process tree instead of leaking it');

for (const message of passed) console.log(`[OK] ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`[FAIL] ${message}`);
  console.error(`Godot project fixture regressions: ${errors.length} failed, ${passed.length} passed`);
  process.exit(1);
}
console.log(`Godot project fixture regressions: ${passed.length} passed`);
