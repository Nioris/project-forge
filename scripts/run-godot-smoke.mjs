#!/usr/bin/env node
/** Run one project-specific Godot smoke in an isolated copy with a bounded process tree. */
import fs from 'node:fs';
import path from 'node:path';
import {
  combinedOutput,
  detectGodotVisualTool,
  godotErrorLines,
  inside,
  isolatedGodotUserEnv,
  makeIsolatedGodotCopy,
  runBounded,
} from './godot-visual-runtime.mjs';
import { readEngineProfile } from './engine-profile.mjs';

const argv = process.argv.slice(2);
const parsed = {
  projectRoot: '.',
  projectSet: false,
  scene: null,
  script: null,
  marker: null,
  timeoutMs: 45_000,
  quitAfterFrames: 600,
  json: false,
  userArgs: [],
};

function takeValue(index, option) {
  const value = argv[index + 1];
  if (value == null || value === '--') throw new Error(`${option} requires a value`);
  return value;
}

try {
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--') {
      parsed.userArgs = argv.slice(index + 1);
      break;
    }
    if (value === '--json') parsed.json = true;
    else if (value === '--scene') parsed.scene = takeValue(index++, value);
    else if (value === '--script') parsed.script = takeValue(index++, value);
    else if (value === '--marker') parsed.marker = takeValue(index++, value);
    else if (value === '--timeout-ms') parsed.timeoutMs = Number(takeValue(index++, value));
    else if (value === '--quit-after') parsed.quitAfterFrames = Number(takeValue(index++, value));
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`);
    else if (!parsed.projectSet) {
      parsed.projectRoot = value;
      parsed.projectSet = true;
    } else throw new Error(`unexpected positional argument: ${value}`);
  }
} catch (error) {
  console.error(`[X] ${error.message}`);
  console.error('Usage: run-godot-smoke.mjs [project-root] (--scene res://x.tscn | --script res://x.gd) --marker MARKER [--timeout-ms 45000] [--quit-after 600] [--json] [-- user args]');
  process.exit(2);
}

const projectRoot = path.resolve(parsed.projectRoot);
const result = {
  schemaVersion: 1,
  kind: 'forge.godot-supplemental-smoke',
  status: 'failed',
  projectRoot,
  target: null,
  marker: parsed.marker,
  engine: null,
  isolated: true,
  timedOut: false,
  durationMs: 0,
  issues: [],
  summary: '',
};

function fail(code, message, status = 'failed') {
  const error = new Error(message);
  error.code = code;
  error.resultStatus = status;
  throw error;
}

function safeRelative(value, { allowDot = false } = {}) {
  const raw = String(value || '').replaceAll('\\', '/');
  const normalized = raw.replace(/^\.\//u, '');
  if (allowDot && (raw === '.' || raw === './')) return '.';
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)
    || normalized.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return normalized;
}

function safeResource(value, extension) {
  const raw = String(value || '');
  if (!raw.startsWith('res://')) return null;
  const relative = safeRelative(raw.slice('res://'.length));
  if (!relative || path.extname(relative).toLowerCase() !== extension) return null;
  return { resource: `res://${relative}`, relative };
}

function readContract() {
  const file = path.join(projectRoot, 'forge.godot.json');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail('GODOT_SMOKE_CONTRACT', `forge.godot.json is missing or invalid: ${error.message}`); }
  const projectPath = safeRelative(value?.projectPath, { allowDot: true });
  if (!projectPath) fail('GODOT_SMOKE_CONTRACT', 'forge.godot.json projectPath is unsafe');
  const implementationRoot = path.resolve(projectRoot, projectPath);
  if (!inside(projectRoot, implementationRoot) || !fs.existsSync(path.join(implementationRoot, 'project.godot'))) {
    fail('GODOT_SMOKE_PROJECT', 'Godot implementation root is missing or escapes the managed project');
  }
  return { implementationRoot };
}

let isolated = null;
try {
  const profile = readEngineProfile(projectRoot);
  if (profile.engine !== 'godot') fail('GODOT_SMOKE_ENGINE', `supplemental smoke requires engine=godot; got ${profile.engine}`);
  if (Boolean(parsed.scene) === Boolean(parsed.script)) fail('GODOT_SMOKE_TARGET', 'select exactly one --scene or --script target');
  if (!/^[A-Z0-9_:-]{4,80}$/u.test(String(parsed.marker || ''))) fail('GODOT_SMOKE_MARKER', 'marker must be 4-80 uppercase ASCII characters');
  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 250 || parsed.timeoutMs > 120_000) {
    fail('GODOT_SMOKE_TIMEOUT', 'timeout must be an integer from 250 to 120000 ms');
  }
  if (!Number.isInteger(parsed.quitAfterFrames) || parsed.quitAfterFrames < 2 || parsed.quitAfterFrames > 3600) {
    fail('GODOT_SMOKE_QUIT_AFTER', 'quit-after must be an integer from 2 to 3600 frames');
  }
  if (parsed.userArgs.some(value => value.length > 500 || /[\r\n\0]/u.test(value))) {
    fail('GODOT_SMOKE_USER_ARGS', 'user arguments contain an invalid or oversized value');
  }

  const contract = readContract();
  const target = parsed.scene ? safeResource(parsed.scene, '.tscn') : safeResource(parsed.script, '.gd');
  if (!target) fail('GODOT_SMOKE_TARGET', `unsafe ${parsed.scene ? 'scene' : 'script'} resource path`);
  if (!fs.existsSync(path.join(contract.implementationRoot, target.relative))) {
    fail('GODOT_SMOKE_TARGET', `smoke target does not exist: ${target.resource}`);
  }
  result.target = { kind: parsed.scene ? 'scene' : 'script', resource: target.resource };

  const godot = detectGodotVisualTool();
  result.engine = { command: godot.command, version: godot.version, testHarness: godot.testHarness === true };
  if (!godot.ok) fail('GODOT_SMOKE_TOOLCHAIN', godot.run?.error?.message || 'Godot executable is unavailable', 'environment_failure');

  isolated = makeIsolatedGodotCopy(contract.implementationRoot);
  const modeArgs = parsed.scene ? ['--scene', target.resource] : ['--script', target.resource];
  const commandArgs = [
    ...godot.prefix,
    '--headless',
    '--path', isolated.isolatedProject,
    ...modeArgs,
    '--quit-after', String(parsed.quitAfterFrames),
  ];
  if (parsed.userArgs.length) commandArgs.push('--', ...parsed.userArgs);
  const run = runBounded(godot.command, commandArgs, {
    cwd: isolated.isolatedProject,
    timeoutMs: parsed.timeoutMs,
    env: isolatedGodotUserEnv(isolated.tempRoot),
  });
  result.durationMs = run.durationMs;
  result.timedOut = run.timedOut;
  const output = combinedOutput(run);
  const markerFound = output.includes(parsed.marker);
  const trustedSuccess = run.status === 0 && !run.error && !run.timedOut && markerFound;
  const errors = godotErrorLines(output, { ignoreRootCertificateWarning: trustedSuccess });

  if (run.timedOut) fail('GODOT_SMOKE_TIMEOUT', `supplemental smoke timed out after ${parsed.timeoutMs} ms`);
  if (run.error) fail('GODOT_SMOKE_RUNTIME', run.error.message, 'environment_failure');
  if (run.status !== 0) fail('GODOT_SMOKE_RUNTIME', errors[0] || `Godot exited with code ${run.status ?? 'unknown'}`);
  if (!markerFound) fail('GODOT_SMOKE_MARKER', `Godot exited without required marker ${parsed.marker}`);
  if (errors.length) fail('GODOT_SMOKE_RUNTIME', errors[0]);

  result.status = 'passed';
  result.summary = `Supplemental ${result.target.kind} smoke reached ${parsed.marker} in an isolated headless process`;
} catch (error) {
  result.status = error.resultStatus || 'failed';
  result.issues.push({ code: error.code || 'GODOT_SMOKE_INTERNAL', message: error.message || String(error) });
  result.summary = result.issues[0].message;
} finally {
  if (isolated?.tempRoot) {
    try {
      fs.rmSync(isolated.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      result.issues.push({ code: 'GODOT_SMOKE_CLEANUP', message: `isolated runtime cleanup failed: ${error.message}` });
      if (result.status === 'passed') {
        result.status = 'environment_failure';
        result.summary = result.issues.at(-1).message;
      }
    }
  }
}

if (parsed.json) console.log(JSON.stringify(result, null, 2));
else console.log(`[${result.status.toUpperCase()}] ${result.summary}`);
process.exitCode = result.status === 'passed' ? 0 : result.status === 'environment_failure' ? 2 : 1;
