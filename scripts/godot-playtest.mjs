#!/usr/bin/env node
/** Two-process native Godot scenario: real InputMap actions, progress, save and fresh reload. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readGodotPlaytestContract, GODOT_PLAYTEST_FILE, GODOT_PLAYTEST_PROTOCOL, writeGodotQaReport } from './godot-playtest-contract.mjs';
import {
  combinedOutput,
  detectGodotVisualTool,
  godotErrorLines,
  isVisualEnvironmentFailure,
  isolatedUserEnv,
  makeIsolatedGodotCopy,
  runBounded,
  snapshotGodotVisualInputs,
} from './godot-playtest-runtime.mjs';

const args = process.argv.slice(2);
const noReport = args.includes('--no-report');
const positional = args.filter(value => !value.startsWith('--'));
const root = path.resolve(positional[0] || '.');
const report = {
  schemaVersion: 1,
  kind: 'forge.godot-playtest-report',
  generatedAt: new Date().toISOString(),
  status: 'failed',
  engine: null,
  renderer: 'real-window',
  testHarness: false,
  runtimeProcesses: 0,
  issues: [],
};
let isolated = null;

function fail(code, message, environment = false) {
  const error = new Error(message);
  error.code = code;
  error.environment = environment;
  throw error;
}
function usableRenderer(proof) {
  const renderer = proof?.renderer;
  const viewport = renderer?.viewport;
  const window = renderer?.window;
  const display = String(renderer?.displayServer || '').trim().toLowerCase();
  return renderer?.headless === false
    && display.length > 0 && !/(?:headless|dummy|null|none)/u.test(display)
    && Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height) && viewport.width > 0 && viewport.height > 0
    && Number.isFinite(window?.width) && Number.isFinite(window?.height) && window.width > 0 && window.height > 0;
}

function matches(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length
      && expected.every((value, index) => matches(actual[index], value));
  }
  if (expected && typeof expected === 'object') {
    return actual && typeof actual === 'object' && !Array.isArray(actual)
      && Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && matches(actual[key], value));
  }
  return Object.is(actual, expected);
}

function runPhase(tool, contract, userRoot, mode) {
  const nativeReport = path.join(userRoot, `${mode}.json`);
  fs.mkdirSync(userRoot, { recursive: true });
  const run = runBounded(tool.command, [
    ...tool.prefix,
    '--path', isolated.isolatedProject,
    '--fixed-fps', '30',
    '--quit-after', '360',
    '--',
    `--forge-playtest-mode=${mode}`,
    `--forge-playtest-target=${contract.adapter.targetNode}`,
    `--forge-playtest-contract=${path.join(root, GODOT_PLAYTEST_FILE)}`,
    `--forge-playtest-report=${nativeReport}`,
  ], {
    cwd: isolated.isolatedProject,
    timeoutMs: contract.value.timeoutSeconds * 1000,
    env: isolatedUserEnv(userRoot),
  });
  const output = combinedOutput(run);
  const nativeReportExists = fs.existsSync(nativeReport);
  let value = null;
  let reportParseError = null;
  if (nativeReportExists) {
    try { value = JSON.parse(fs.readFileSync(nativeReport, 'utf8')); }
    catch (error) { reportParseError = error; }
  }
  const trustedProtocolSuccess = run.status === 0 && !run.timedOut && !run.error && value
    && value.protocol === GODOT_PLAYTEST_PROTOCOL && value.mode === mode
    && value.testHarness !== true && usableRenderer(value);
  const errors = godotErrorLines(output, { ignoreRootCertificateWarning: trustedProtocolSuccess });
  if (run.status !== 0 || run.timedOut || run.error || errors.length || !nativeReportExists) {
    const environment = isVisualEnvironmentFailure(run, output);
    fail('GODOT_PLAYTEST_RUNTIME', errors[0] || (environment
      ? 'Godot visual environment is unavailable'
      : `${mode} process did not produce native evidence`), environment);
  }
  if (reportParseError || !value) fail('GODOT_PLAYTEST_PROTOCOL', `${mode} report is invalid JSON`);
  if (value.protocol !== GODOT_PLAYTEST_PROTOCOL || value.mode !== mode || value.testHarness === true) {
    fail('GODOT_PLAYTEST_PROTOCOL', `${mode} report is not native protocol evidence`);
  }
  if (!usableRenderer(value)) fail('GODOT_PLAYTEST_RENDERER', `${mode} report lacks a usable non-headless window and viewport`);
  report.runtimeProcesses += 1;
  return value;
}

try {
  const contract = readGodotPlaytestContract(root);
  const tool = detectGodotVisualTool();
  report.engine = { name: 'godot', command: tool.command, version: tool.version };
  report.testHarness = tool.testHarness === true;
  if (!tool.ok) fail('GODOT_PLAYTEST_TOOLCHAIN', 'Godot executable is unavailable', true);

  const before = snapshotGodotVisualInputs(contract.implementationRoot);
  isolated = makeIsolatedGodotCopy(contract.implementationRoot);
  const userRoot = path.join(isolated.tempRoot, 'playtest-user');
  const save = runPhase(tool, contract, userRoot, 'save');
  const reload = runPhase(tool, contract, userRoot, 'reload');

  if (!matches(save.initial, contract.scenario.initialExpect)) fail('GODOT_PLAYTEST_INITIAL', 'initial state does not match the host contract');
  if (!Array.isArray(save.steps) || save.steps.length !== contract.scenario.steps.length) fail('GODOT_PLAYTEST_STEPS', 'not every declared action produced a state observation');
  for (const [index, expected] of contract.scenario.steps.entries()) {
    const actual = save.steps[index];
    if (actual?.action !== expected.action || !matches(actual?.state, expected.expect)) {
      fail('GODOT_PLAYTEST_STEP_STATE', `action ${index + 1} did not produce its expected state`);
    }
  }
  if (!matches(save.progress, contract.scenario.progress) || save.saved !== true) fail('GODOT_PLAYTEST_PROGRESS', 'progress assertion or production save failed');
  if (reload.loaded !== true || !matches(reload.state, contract.scenario.saveReload)) fail('GODOT_PLAYTEST_RELOAD', 'fresh process did not load the expected state');
  if (!matches(reload.state, save.progress) || !matches(save.progress, reload.state)) fail('GODOT_PLAYTEST_PERSISTENCE', 'fresh-process state differs from the state passed to production save');

  const after = snapshotGodotVisualInputs(contract.implementationRoot);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('GODOT_PLAYTEST_SOURCE_MUTATED', 'source changed during playtest');
  if (tool.testHarness) fail('GODOT_PLAYTEST_TEST_HARNESS', 'test harness cannot PASS native playtest');

  report.status = 'passed';
  report.contract = {
    path: GODOT_PLAYTEST_FILE,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, GODOT_PLAYTEST_FILE))).digest('hex'),
  };
  report.adapter = {
    script: contract.adapter.script,
    trustedTemplate: 'templates/godot/ForgePlaytestQA.gd',
    sha256: crypto.createHash('sha256').update(fs.readFileSync(contract.adapter.trustedAdapter)).digest('hex'),
  };
  report.userData = { isolated: true, reusedAcrossProcesses: true, projectUserDataUntouched: true };
  report.scenario = {
    initial: save.initial,
    steps: save.steps,
    progress: save.progress,
    saved: true,
    reload: reload.state,
    reloadMatchesSave: true,
    renderer: { save: save.renderer, reload: reload.renderer },
  };
  report.sourceSnapshot = before;
} catch (error) {
  const environmentFailure = error.environment === true || error.code === 'GODOT_PLAYTEST_CSHARP_ENVIRONMENT';
  report.status = environmentFailure ? 'environment_failure' : 'failed';
  report.issues.push({ code: error.code || 'GODOT_PLAYTEST', message: String(error.message).slice(0, 1000) });
} finally {
  if (isolated?.tempRoot) fs.rmSync(isolated.tempRoot, { recursive: true, force: true });
}

if (!noReport) writeGodotQaReport(root, 'godot-playtest', report);
console.log(JSON.stringify(report));
process.exitCode = report.status === 'passed' ? 0 : (report.status === 'environment_failure' ? 2 : 1);
