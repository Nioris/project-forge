#!/usr/bin/env node
/** Offline adversarial regressions. A fixture can exercise validation, but can never PASS. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-playtest-'));
const shim = path.join(root, 'scripts', 'fixtures', 'godot-playtest', 'fake-godot-playtest.mjs');
const trustedAdapter = path.join(root, 'templates', 'godot', 'ForgePlaytestQA.gd');
let failures = 0;
let passed = 0;

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function make(name) {
  const project = path.join(temp, name);
  write(path.join(project, 'forge.engine.json'), JSON.stringify({
    schemaVersion: 1, kind: 'forge.engine-profile', engine: 'godot',
  }));
  write(path.join(project, 'forge.godot.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'forge.godot-project',
    projectPath: '.',
    scripting: 'gdscript',
    entryScene: 'res://Main.tscn',
    smoke: {},
    sceneContract: {},
  }));
  write(path.join(project, 'forge.godot.playtest.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'forge.godot-playtest',
    adapter: {
      autoloadName: 'ForgePlaytestQA',
      protocol: 'forge-godot-playtest-v1',
      script: 'res://ForgePlaytestQA.gd',
      targetNode: '.',
    },
    timeoutSeconds: 5,
    scenario: {
      initialExpect: { hp: 1 },
      steps: [
        { action: 'move_left', expect: { hp: 2 } },
        { action: 'move_right', expect: { hp: 3 } },
      ],
      progress: { hp: 3 },
      saveReload: { hp: 3 },
    },
  }));
  fs.copyFileSync(trustedAdapter, path.join(project, 'ForgePlaytestQA.gd'));
  write(path.join(project, 'fixture_playtest_class.gd'), 'class_name FixturePlaytestClass\nextends RefCounted\n');
  write(path.join(project, 'project.godot'), [
    '[autoload]',
    'ForgePlaytestQA="*res://ForgePlaytestQA.gd"',
    '',
    '[input]',
    'move_left = {',
    '}',
    'move_right = {',
    '}',
    '',
  ].join('\n'));
  return project;
}

function expectedCode(script, mode) {
  if (mode === 'environment' || mode === 'runtime-error' || mode === 'timeout') {
    return script === 'godot-tech-check.mjs' ? 'GODOT_TECH_RUNTIME' : 'GODOT_PLAYTEST_RUNTIME';
  }
  if (mode === 'stale-source') {
    return script === 'godot-tech-check.mjs' ? 'GODOT_TECH_SOURCE_MUTATED' : 'GODOT_PLAYTEST_SOURCE_MUTATED';
  }
  if (mode === 'harness-report-rejected') {
    return script === 'godot-tech-check.mjs' ? 'GODOT_TECH_PROOF' : 'GODOT_PLAYTEST_PROTOCOL';
  }
  if (['headless-renderer', 'dummy-renderer', 'empty-viewport', 'empty-window'].includes(mode)) {
    return script === 'godot-tech-check.mjs' ? 'GODOT_TECH_RENDERER' : 'GODOT_PLAYTEST_RENDERER';
  }
  if (script === 'godot-tech-check.mjs') {
    return mode === 'missing-action' ? 'GODOT_TECH_PROOF' : 'GODOT_TECH_TEST_HARNESS';
  }
  return {
    pass: 'GODOT_PLAYTEST_TEST_HARNESS',
    'missing-action': 'GODOT_PLAYTEST_STEPS',
    'state-mismatch': 'GODOT_PLAYTEST_STEP_STATE',
    'no-progress': 'GODOT_PLAYTEST_PROGRESS',
    'save-failure': 'GODOT_PLAYTEST_PROGRESS',
    'reload-failure': 'GODOT_PLAYTEST_RELOAD',
  }[mode];
}

function run(script, project, mode) {
  if (mode === 'path-escape') {
    const godot = JSON.parse(fs.readFileSync(path.join(project, 'forge.godot.json'), 'utf8'));
    godot.projectPath = '../outside';
    write(path.join(project, 'forge.godot.json'), JSON.stringify(godot));
  }
  let qaEscape = null;
  if (mode === 'qa-junction') {
    qaEscape = path.join(temp, `qa-escape-${path.basename(project)}`);
    fs.mkdirSync(qaEscape, { recursive: true });
    fs.symlinkSync(qaEscape, path.join(project, 'qa'), 'junction');
  }
  const child = spawnSync(process.execPath, [path.join(root, 'scripts', script), project], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORGE_ALLOW_TEST_HARNESS: '1',
      FORGE_GODOT_TEST_SHIM: shim,
      FORGE_GODOT_PLAYTEST_FIXTURE_MODE: mode,
      FORGE_GODOT_REQUIRE_ISOLATED_USER_ENV: '1',
      FORGE_GODOT_EXPECT_CLASS_CACHE: 'FixturePlaytestClass',
    },
    timeout: 20_000,
  });
  const reportFile = path.join(project, 'qa', script.includes('tech') ? 'godot-tech' : 'godot-playtest', 'report.json');
  let report = null;
  try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch {}
  const wanted = mode === 'path-escape' ? 'GODOT_PLAYTEST_PROJECT'
    : mode === 'qa-junction' ? 'QA report directory is unsafe' : expectedCode(script, mode);
  const actual = report?.issues?.[0]?.code;
  const environmentExpected = mode === 'environment';
  const output = `${child.stdout}\n${child.stderr}`;
  const okay = child.status !== 0 && (mode === 'qa-junction'
    ? output.includes(wanted) && !fs.existsSync(path.join(qaEscape, script.includes('tech') ? 'godot-tech' : 'godot-playtest', 'report.json'))
    : report?.status !== 'passed' && actual === wanted)
    && (!environmentExpected || report.status === 'environment_failure');
  if (!okay) {
    failures += 1;
    console.error(`FAIL ${script}/${mode}: wanted ${wanted}, got exit=${child.status} status=${report?.status} code=${actual}`);
  } else {
    passed += 1;
    console.log(`PASS ${script}/${mode}: rejected as ${actual}`);
  }
}

try {
  const modes = ['pass', 'missing-action', 'state-mismatch', 'no-progress', 'save-failure',
    'reload-failure', 'runtime-error', 'timeout', 'environment', 'stale-source', 'harness-report-rejected',
    'headless-renderer', 'dummy-renderer', 'empty-viewport', 'empty-window', 'path-escape', 'qa-junction'];
  for (const mode of modes) {
    run('godot-tech-check.mjs', make(`tech-${mode}`), mode);
    run('godot-playtest.mjs', make(`play-${mode}`), mode);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
if (failures) {
  console.error(`Godot playtest regressions: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed}/${passed} Godot tech/playtest adversarial checks passed`);
