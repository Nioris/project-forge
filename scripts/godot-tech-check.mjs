#!/usr/bin/env node
/** Bounded, non-headless native preflight for a GDScript Godot project. */
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
  kind: 'forge.godot-tech-report',
  generatedAt: new Date().toISOString(),
  status: 'failed',
  engine: null,
  renderer: 'real-window',
  testHarness: false,
  issues: [],
};
let isolated = null;
let environmentFailure = false;

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

try {
  const contract = readGodotPlaytestContract(root);
  const tool = detectGodotVisualTool();
  report.engine = { name: 'godot', command: tool.command, version: tool.version };
  report.testHarness = tool.testHarness === true;
  if (!tool.ok) fail('GODOT_TECH_TOOLCHAIN', 'Godot executable is unavailable', true);

  const before = snapshotGodotVisualInputs(contract.implementationRoot);
  isolated = makeIsolatedGodotCopy(contract.implementationRoot);
  const nativeReport = path.join(isolated.tempRoot, 'tech-native.json');
  const run = runBounded(tool.command, [
    ...tool.prefix,
    '--path', isolated.isolatedProject,
    '--fixed-fps', '30',
    '--quit-after', '180',
    '--',
    '--forge-playtest-mode=tech',
    `--forge-playtest-target=${contract.adapter.targetNode}`,
    `--forge-playtest-contract=${path.join(root, GODOT_PLAYTEST_FILE)}`,
    `--forge-playtest-report=${nativeReport}`,
  ], {
    cwd: isolated.isolatedProject,
    timeoutMs: contract.value.timeoutSeconds * 1000,
    env: isolatedUserEnv(isolated.tempRoot),
  });
  const output = combinedOutput(run);
  const errors = godotErrorLines(output);
  if (run.status !== 0 || run.timedOut || errors.length || !fs.existsSync(nativeReport)) {
    const environment = isVisualEnvironmentFailure(run, output);
    fail('GODOT_TECH_RUNTIME', errors[0] || (environment
      ? 'Godot visual environment is unavailable'
      : 'native tech protocol did not complete'), environment);
  }

  const proof = JSON.parse(fs.readFileSync(nativeReport, 'utf8'));
  if (proof.protocol !== GODOT_PLAYTEST_PROTOCOL || proof.mode !== 'tech' || proof.testHarness === true
    || proof.actions !== true || proof.methods !== true || proof.userDataWritten !== true) {
    fail('GODOT_TECH_PROOF', 'native tech report lacks InputMap, production methods, or isolated user-data proof');
  }
  if (!usableRenderer(proof)) fail('GODOT_TECH_RENDERER', 'native tech report lacks a usable non-headless window and viewport');
  const after = snapshotGodotVisualInputs(contract.implementationRoot);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('GODOT_TECH_SOURCE_MUTATED', 'source changed during tech check');
  if (tool.testHarness) fail('GODOT_TECH_TEST_HARNESS', 'test harness cannot PASS native tech check');

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
  report.sourceSnapshot = before;
  report.proof = proof;
} catch (error) {
  environmentFailure = error.environment === true || error.code === 'GODOT_PLAYTEST_CSHARP_ENVIRONMENT';
  report.status = environmentFailure ? 'environment_failure' : 'failed';
  report.issues.push({ code: error.code || 'GODOT_TECH', message: String(error.message).slice(0, 1000) });
} finally {
  if (isolated?.tempRoot) fs.rmSync(isolated.tempRoot, { recursive: true, force: true });
}

if (!noReport) writeGodotQaReport(root, 'godot-tech', report);
console.log(JSON.stringify(report));
process.exitCode = report.status === 'passed' ? 0 : (report.status === 'environment_failure' ? 2 : 1);
