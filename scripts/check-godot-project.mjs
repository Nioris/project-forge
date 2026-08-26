#!/usr/bin/env node
/** Read-only Godot 4 construct verifier. Runtime work happens in an isolated temporary copy. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readEngineProfile } from './engine-profile.mjs';
import { isolatedGodotUserEnv, writeIsolatedGdscriptClassCache } from './godot-visual-runtime.mjs';

const CONTRACT_FILE = 'forge.godot.json';
const MAX_FILES = 20_000;
const MAX_BYTES = 512 * 1024 * 1024;
const TOOL_MAX_BUFFER = 4 * 1024 * 1024;
const COPY_SKIP = new Set(['.git', '.godot', '.mono', 'bin', 'obj', 'build', 'dist', 'Release', 'node_modules']);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BOUNDED_RUNNER = path.join(SCRIPT_DIR, 'run-bounded-command.mjs');
const FIXTURE_ROOT = path.join(SCRIPT_DIR, 'fixtures');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const projectRoot = path.resolve(args.find(value => !value.startsWith('--')) || '.');

const result = {
  schemaVersion: 1,
  kind: 'forge.godot-project-check',
  status: 'failed',
  projectRoot,
  engine: null,
  contract: null,
  toolchain: { godot: null, dotnet: null },
  checks: [],
  issues: [],
};
let environmentFailure = false;

function addCheck(id, status, message, durationMs = 0) {
  result.checks.push({ id, status, message: String(message).slice(0, 1000), durationMs: Math.max(0, Math.round(durationMs)) });
}

function addIssue(rule, message, file = null, line = null, environment = false) {
  result.issues.push({ file, line, rule, message: String(message).slice(0, 1000) });
  if (environment) environmentFailure = true;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} has invalid keys`);
}

function safeRelative(value, { allowDot = false } = {}) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (allowDot && (value === '.' || normalized === '')) return '.';
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)
    || normalized.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return normalized;
}

function safeResource(value, extensions) {
  const raw = String(value || '');
  if (!raw.startsWith('res://')) return null;
  const rel = safeRelative(raw.slice('res://'.length));
  if (!rel || !extensions.some(ext => rel.toLowerCase().endsWith(ext))) return null;
  return { resource: `res://${rel}`, rel };
}

function inside(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function parseContract(root) {
  const file = path.join(root, CONTRACT_FILE);
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${CONTRACT_FILE} is missing or invalid JSON: ${error.message}`); }
  exactKeys(value, ['schemaVersion', 'kind', 'projectPath', 'scripting', 'entryScene', 'smoke', 'sceneContract'], CONTRACT_FILE);
  if (value.schemaVersion !== 1 || value.kind !== 'forge.godot-project') throw new Error(`${CONTRACT_FILE} has invalid version/kind`);
  const projectPath = safeRelative(value.projectPath, { allowDot: true });
  if (!projectPath || !['gdscript', 'csharp'].includes(value.scripting)) throw new Error(`${CONTRACT_FILE} has invalid projectPath or scripting`);
  const entry = safeResource(value.entryScene, ['.tscn', '.scn']);
  if (!entry) throw new Error(`${CONTRACT_FILE} entryScene must be a safe res:// .tscn/.scn path`);
  exactKeys(value.smoke, ['successMarker', 'quitAfterFrames'], `${CONTRACT_FILE} smoke`);
  if (!/^[A-Z0-9_:-]{4,80}$/u.test(String(value.smoke.successMarker || ''))
    || !Number.isInteger(value.smoke.quitAfterFrames) || value.smoke.quitAfterFrames < 2 || value.smoke.quitAfterFrames > 600) {
    throw new Error(`${CONTRACT_FILE} smoke contract is invalid`);
  }
  exactKeys(value.sceneContract,
    ['minimumNodeCount', 'requiredNodes', 'requiredNodeTypes', 'requiredScripts', 'requiredScriptAttachments'],
    `${CONTRACT_FILE} sceneContract`);
  const { minimumNodeCount, requiredNodes, requiredNodeTypes, requiredScripts, requiredScriptAttachments } = value.sceneContract;
  if (!Number.isInteger(minimumNodeCount) || minimumNodeCount < 1 || minimumNodeCount > 10_000
    || !Array.isArray(requiredNodes) || requiredNodes.length < 1 || requiredNodes.length > 200
    || new Set(requiredNodes).size !== requiredNodes.length
    || requiredNodes.some(item => !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u.test(String(item)))) {
    throw new Error(`${CONTRACT_FILE} required node contract is invalid`);
  }
  if (!isObject(requiredNodeTypes) || Object.keys(requiredNodeTypes).length !== requiredNodes.length
    || Object.keys(requiredNodeTypes).sort().join('\n') !== [...requiredNodes].sort().join('\n')
    || Object.values(requiredNodeTypes).some(item => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(String(item)))) {
    throw new Error(`${CONTRACT_FILE} requiredNodeTypes must define one exact Godot type for every required node`);
  }
  if (!Array.isArray(requiredScripts) || requiredScripts.length > 200 || new Set(requiredScripts).size !== requiredScripts.length) {
    throw new Error(`${CONTRACT_FILE} requiredScripts is invalid`);
  }
  const scripts = requiredScripts.map(item => safeResource(item, ['.gd', '.cs']));
  if (scripts.some(item => !item)) throw new Error(`${CONTRACT_FILE} requiredScripts contains an unsafe resource path`);
  if (!isObject(requiredScriptAttachments) || Object.keys(requiredScriptAttachments).length > 200
    || Object.keys(requiredScriptAttachments).some(nodePath => !requiredNodes.includes(nodePath))) {
    throw new Error(`${CONTRACT_FILE} requiredScriptAttachments may target only required nodes`);
  }
  const scriptAttachments = Object.entries(requiredScriptAttachments).map(([nodePath, resource]) => ({
    nodePath,
    script: safeResource(resource, ['.gd', '.cs']),
  }));
  if (scriptAttachments.some(item => !item.script)
    || scriptAttachments.some(item => !requiredScripts.includes(item.script.resource))
    || scripts.some(script => !scriptAttachments.some(item => item.script.resource === script.resource))) {
    throw new Error(`${CONTRACT_FILE} requiredScriptAttachments must attach every required script to an explicit required node`);
  }
  const implementationRoot = path.resolve(root, projectPath);
  if (!inside(root, implementationRoot) || !fs.existsSync(implementationRoot) || !fs.statSync(implementationRoot).isDirectory()) {
    throw new Error(`${CONTRACT_FILE} projectPath is missing or outside the managed project`);
  }
  return { value, projectPath, entry, scripts, scriptAttachments, implementationRoot };
}

function projectFileLabel(contract, rel) {
  return contract.projectPath === '.' ? rel : `${contract.projectPath}/${rel}`;
}

function parseProjectSettings(contract) {
  const file = path.join(contract.implementationRoot, 'project.godot');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { throw new Error(`project.godot is missing: ${error.message}`); }
  if (!/^config_version\s*=\s*\d+/mu.test(text)) throw new Error('project.godot lacks config_version');
  const main = text.match(/^run\/main_scene\s*=\s*"([^"]+)"\s*$/mu)?.[1] || null;
  if (main !== contract.entry.resource) throw new Error(`project.godot run/main_scene must equal ${contract.entry.resource}`);
  return { file, text };
}

function parseAttributes(line) {
  const attrs = {};
  for (const match of line.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/gu)) attrs[match[1]] = match[2];
  return attrs;
}

function inspectTextScene(contract) {
  const sceneFile = path.join(contract.implementationRoot, contract.entry.rel);
  if (!fs.existsSync(sceneFile) || !fs.statSync(sceneFile).isFile()) throw new Error(`entry scene is missing: ${contract.entry.resource}`);
  if (path.extname(sceneFile).toLowerCase() !== '.tscn') {
    throw new Error('Forge construct verification requires a text .tscn entry scene so serialization can be audited');
  }
  const text = fs.readFileSync(sceneFile, 'utf8');
  if (!/^\s*\[gd_scene\b/mu.test(text)) throw new Error('entry .tscn lacks a gd_scene header');
  const extResources = new Map();
  for (const line of text.split(/\r?\n/u)) {
    if (!/^\[ext_resource\b/u.test(line)) continue;
    const attrs = parseAttributes(line);
    if (attrs.id && /\.(?:gd|cs)$/iu.test(String(attrs.path || ''))) extResources.set(attrs.id, attrs.path);
  }
  const nodes = [];
  let rootName = null;
  let currentNode = null;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (/^\[/u.test(line)) {
      currentNode = null;
      if (!/^\[node\b/u.test(line)) continue;
      const attrs = parseAttributes(line);
      if (!attrs.name) throw new Error(`scene node at line ${index + 1} lacks a name`);
      if (rootName === null) {
        if (attrs.parent != null) throw new Error('first serialized node must be the scene root');
        rootName = attrs.name;
        currentNode = { path: rootName, parent: null, type: attrs.type || null, scriptId: null, line: index + 1 };
        nodes.push(currentNode);
        continue;
      }
      if (attrs.parent == null) throw new Error(`additional root node at line ${index + 1} is not allowed`);
      const parent = attrs.parent === '.' ? rootName : `${rootName}/${attrs.parent}`;
      currentNode = { path: `${parent}/${attrs.name}`, parent, type: attrs.type || null, scriptId: null, line: index + 1 };
      nodes.push(currentNode);
      continue;
    }
    if (currentNode) {
      const scriptMatch = line.match(/^script\s*=\s*ExtResource\("([^"]+)"\)\s*$/u);
      if (scriptMatch) currentNode.scriptId = scriptMatch[1];
    }
  }
  if (!nodes.length) throw new Error('entry scene contains no serialized nodes');
  const paths = new Set();
  for (const node of nodes) {
    if (paths.has(node.path)) throw new Error(`duplicate serialized node path: ${node.path}`);
    if (node.parent && !paths.has(node.parent)) throw new Error(`serialized node parent is missing or ordered after child: ${node.parent}`);
    paths.add(node.path);
  }
  const missingNodes = contract.value.sceneContract.requiredNodes.filter(item => !paths.has(item));
  if (nodes.length < contract.value.sceneContract.minimumNodeCount) {
    throw new Error(`entry scene serializes ${nodes.length} nodes; contract requires ${contract.value.sceneContract.minimumNodeCount}`);
  }
  if (missingNodes.length) throw new Error(`entry scene lost required serialized nodes: ${missingNodes.join(', ')}`);
  const nodeByPath = new Map(nodes.map(node => [node.path, node]));
  const wrongTypes = Object.entries(contract.value.sceneContract.requiredNodeTypes)
    .filter(([nodePath, expected]) => nodeByPath.get(nodePath)?.type !== expected)
    .map(([nodePath, expected]) => `${nodePath} must be ${expected}, got ${nodeByPath.get(nodePath)?.type || 'missing'}`);
  if (wrongTypes.length) throw new Error(`entry scene has invalid required node types: ${wrongTypes.join('; ')}`);
  for (const node of nodes) node.scriptPath = node.scriptId ? extResources.get(node.scriptId) || null : null;
  const missingScripts = [];
  for (const script of contract.scripts) {
    const absolute = path.join(contract.implementationRoot, script.rel);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) missingScripts.push(`${script.resource} (file missing)`);
    else if (![...extResources.values()].includes(script.resource)) missingScripts.push(`${script.resource} (not declared as an ext_resource)`);
    else if (!nodes.some(node => node.scriptPath === script.resource)) missingScripts.push(`${script.resource} (declared but not attached to a node)`);
  }
  if (missingScripts.length) throw new Error(`required scene scripts are missing: ${missingScripts.join(', ')}`);
  const wrongAttachments = contract.scriptAttachments
    .filter(item => nodeByPath.get(item.nodePath)?.scriptPath !== item.script.resource)
    .map(item => `${item.nodePath} must attach ${item.script.resource}, got ${nodeByPath.get(item.nodePath)?.scriptPath || 'none'}`);
  if (wrongAttachments.length) throw new Error(`entry scene has invalid required script attachments: ${wrongAttachments.join('; ')}`);
  return { sceneFile, text, nodes, scripts: [...new Set(nodes.map(node => node.scriptPath).filter(Boolean))].sort() };
}

function copyImplementation(source, target) {
  let files = 0;
  let bytes = 0;
  function visit(from, to) {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error(`project contains an unsupported symlink/junction: ${from}`);
    if (stat.isDirectory()) {
      if (COPY_SKIP.has(path.basename(from)) && from !== source) return;
      fs.mkdirSync(to, { recursive: true });
      for (const entry of fs.readdirSync(from)) visit(path.join(from, entry), path.join(to, entry));
      return;
    }
    if (!stat.isFile()) return;
    files++;
    bytes += stat.size;
    if (files > MAX_FILES || bytes > MAX_BYTES) throw new Error(`Godot project exceeds verifier copy budget (${MAX_FILES} files / ${MAX_BYTES} bytes)`);
    fs.copyFileSync(from, to);
  }
  visit(source, target);
  return { files, bytes };
}

function toolOutput(run, logFile = null) {
  let log = '';
  if (logFile && fs.existsSync(logFile)) {
    try { log = fs.readFileSync(logFile, 'utf8'); } catch {}
  }
  return `${run.stdout || ''}\n${run.stderr || ''}\n${log}`.slice(-TOOL_MAX_BUFFER);
}

function runTool(command, toolArgs, options = {}) {
  const timeoutMs = options.timeoutMs || 30_000;
  const run = spawnSync(process.execPath, [
    BOUNDED_RUNNER,
    '--timeout', String(timeoutMs),
    '--max-bytes', String(TOOL_MAX_BUFFER),
    '--', command, ...toolArgs,
  ], {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    timeout: timeoutMs + 10_000,
    maxBuffer: TOOL_MAX_BUFFER * 2,
    windowsHide: true,
  });
  let value = null;
  try { value = JSON.parse(run.stdout || ''); } catch {}
  if (!value) {
    value = {
      status: null,
      signal: run.signal || null,
      timedOut: run.error?.code === 'ETIMEDOUT',
      error: { code: run.error?.code || 'BOUNDED_RUNNER', message: run.error?.message || run.stderr || 'bounded command runner failed' },
      stdout: '',
      stderr: run.stderr || '',
      durationMs: timeoutMs,
    };
  }
  return {
    command,
    args: toolArgs,
    status: Number.isInteger(value.status) ? value.status : null,
    signal: value.signal || null,
    error: value.error ? Object.assign(new Error(value.error.message), { code: value.error.code }) : null,
    durationMs: Number(value.durationMs) || 0,
    stdout: value.stdout || '',
    stderr: value.stderr || '',
    timedOut: value.timedOut === true,
  };
}

function detectTool(command, versionArgs = ['--version'], prefix = []) {
  const run = runTool(command, [...prefix, ...versionArgs], { timeoutMs: 10_000 });
  const version = `${run.stdout}\n${run.stderr}`.trim().split(/\r?\n/u).find(Boolean) || null;
  return { ok: run.status === 0 && !run.error, command, prefix, version, run, testHarness: prefix.length > 0 };
}

function godotCommand() {
  const shim = String(process.env.FORGE_GODOT_TEST_SHIM || '').trim();
  if (shim && process.env.FORGE_ALLOW_TEST_HARNESS === '1') {
    const resolved = path.resolve(shim);
    if (!inside(FIXTURE_ROOT, resolved) || !fs.existsSync(resolved)) {
      return { ...detectTool(process.execPath), ok: false, version: null, testHarness: true,
        run: { ...detectTool(process.execPath).run, error: new Error('Godot test shim must stay inside scripts/fixtures') } };
    }
    return detectTool(process.execPath, ['--version'], [resolved]);
  }
  const explicit = String(process.env.FORGE_GODOT_BIN || '').trim();
  const candidates = explicit ? [explicit] : (process.platform === 'win32'
    ? ['godot_console', 'godot', 'godot4', 'godot-mono']
    : ['godot4', 'godot', 'godot-mono']);
  for (const candidate of candidates) {
    const detected = detectTool(candidate);
    if (detected.ok) return detected;
    if (explicit) return detected;
  }
  return detectTool(candidates[0]);
}

function errorLines(output) {
  return [...new Set(String(output).split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => /^(?:ERROR:|SCRIPT ERROR:|Parse Error:|Parser Error:|E\s+\d+:)|\berror\s+CS\d+\b/iu.test(line)))]
    .slice(0, 20);
}

function dotnetEnvironmentError(output) {
  return /(?:no \.net sdks were found|compatible installed \.net sdk|hostfxr|not compiled with (?:mono|\.net)|\.net-enabled|unable to find package Godot\.NET\.Sdk|could not (?:find|execute).*dotnet|dotnet.*not found)/iu.test(output);
}

function godotUserEnvironmentError(output) {
  return /(?:failed to read (?:the )?root certificate store|could not (?:open|create).*user:\/\/|cannot (?:save|write|open).*editor_settings|error saving editor settings)/iu.test(output);
}

function godotProjectErrorLines(output) {
  return [...new Set(String(output).split(/\r?\n/u).map(line => line.trim()).filter(line =>
    /(?:^|\s)(?:SCRIPT ERROR:|Parse Error:|Parser Error:)|\berror\s+CS\d+\b/iu.test(line)))].slice(0, 20);
}

function runGodotCheck(id, command, commandArgs, { cwd, timeoutMs, logFile, marker = null, csharp = false, timeoutEnvironment = false, env = {} } = {}) {
  const run = runTool(command, commandArgs, { cwd, timeoutMs, env });
  const output = toolOutput(run, logFile);
  const errors = errorLines(output);
  const projectErrors = godotProjectErrorLines(output);
  const markerMissing = marker && !output.includes(marker);
  if (run.status === 0 && !run.error && !errors.length && !markerMissing) {
    addCheck(id, 'passed', marker ? `startup reached ${marker}` : `${id} completed`, run.durationMs);
    return true;
  }
  const environment = !projectErrors.length && Boolean((timeoutEnvironment && run.timedOut)
    || (csharp && dotnetEnvironmentError(output)) || godotUserEnvironmentError(output));
  const summary = run.timedOut
    ? projectErrors[0] || `${id} timed out after ${timeoutMs} ms`
    : run.error
      ? projectErrors[0] || `${id} could not run: ${run.error.message}`
      : markerMissing && run.status === 0 && !errors.length
        ? `${id} exited without smoke marker ${marker}`
        : projectErrors[0] || errors[0] || `${id} exited with code ${run.status ?? 'unknown'}`;
  addCheck(id, environment ? 'environment_failure' : 'failed', summary, run.durationMs);
  addIssue(id, summary, null, null, environment);
  for (const line of errors.slice(0, 5)) addIssue(id, line);
  return false;
}

let tempRoot = null;
try {
  try {
    const engine = readEngineProfile(projectRoot);
    result.engine = { engine: engine.engine, status: engine.status, source: engine.source };
    if (engine.engine !== 'godot') throw new Error(`Godot verifier requires forge.engine.json engine=godot; got ${engine.engine}`);
    addCheck('engine-profile', 'passed', `trusted profile selects ${engine.engine} (${engine.status})`);
  } catch (error) {
    addCheck('engine-profile', 'failed', error.message);
    addIssue(error.code || 'engine-profile', error.message, 'forge.engine.json');
  }

  let contract = null;
  if (!result.issues.length) {
    try {
      contract = parseContract(projectRoot);
      result.contract = {
        projectPath: contract.projectPath,
        scripting: contract.value.scripting,
        entryScene: contract.entry.resource,
        smoke: contract.value.smoke,
      };
      addCheck('godot-contract', 'passed', `${CONTRACT_FILE} is strict and project-local`);
    } catch (error) {
      addCheck('godot-contract', 'failed', error.message);
      addIssue('godot-contract', error.message, CONTRACT_FILE);
    }
  }

  if (contract) {
    try {
      parseProjectSettings(contract);
      addCheck('project-settings', 'passed', `project.godot points to ${contract.entry.resource}`);
    } catch (error) {
      addCheck('project-settings', 'failed', error.message);
      addIssue('project-settings', error.message, projectFileLabel(contract, 'project.godot'));
    }
    try {
      const scene = inspectTextScene(contract);
      addCheck('scene-serialization', 'passed', `${scene.nodes.length} serialized nodes and ${scene.scripts.length} script resources satisfy the contract`);
    } catch (error) {
      addCheck('scene-serialization', 'failed', error.message);
      addIssue('scene-serialization', error.message, projectFileLabel(contract, contract.entry.rel));
    }
  }

  const godot = godotCommand();
  result.toolchain.godot = { command: godot.command, version: godot.version, testHarness: godot.testHarness === true };
  if (!godot.ok) {
    const message = `Godot executable is unavailable${godot.run?.error ? `: ${godot.run.error.message}` : ''}`;
    addCheck('godot-toolchain', 'environment_failure', message, godot.run.durationMs);
    addIssue('godot-toolchain', message, null, null, true);
  } else {
    addCheck('godot-toolchain', 'passed', `detected ${godot.version}`, godot.run.durationMs);
  }

  if (contract?.value.scripting === 'csharp') {
    const dotnet = detectTool(String(process.env.FORGE_DOTNET_BIN || 'dotnet'));
    result.toolchain.dotnet = { command: dotnet.command, version: dotnet.version };
    if (!dotnet.ok) {
      const message = `dotnet SDK is unavailable${dotnet.run.error ? `: ${dotnet.run.error.message}` : ''}`;
      addCheck('dotnet-toolchain', 'environment_failure', message, dotnet.run.durationMs);
      addIssue('dotnet-toolchain', message, null, null, true);
    } else addCheck('dotnet-toolchain', 'passed', `detected ${dotnet.version}`, dotnet.run.durationMs);
  }

  const staticFailure = result.checks.some(check => check.status === 'failed');
  if (contract && godot.ok && !staticFailure && !environmentFailure) {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-check-'));
    const isolatedProject = path.join(tempRoot, 'project');
    try {
      const copied = copyImplementation(contract.implementationRoot, isolatedProject);
      addCheck('isolated-copy', 'passed', `copied ${copied.files} files / ${copied.bytes} bytes outside the project`);
    } catch (error) {
      addCheck('isolated-copy', 'failed', error.message);
      addIssue('isolated-copy', error.message);
    }

    if (!result.checks.some(check => check.status === 'failed')) {
      const godotUserEnv = isolatedGodotUserEnv(tempRoot);
      if (contract.value.scripting === 'csharp') {
        const importLog = path.join(tempRoot, 'import.log');
        runGodotCheck('headless-import', godot.command,
          [...godot.prefix, '--headless', '--path', isolatedProject, '--import', '--quit', '--log-file', importLog],
          { cwd: isolatedProject, timeoutMs: 120_000, logFile: importLog, timeoutEnvironment: true, env: godotUserEnv });
      } else {
        try {
          const cache = writeIsolatedGdscriptClassCache(isolatedProject);
          addCheck('gdscript-class-cache', 'passed', `generated isolated class cache for ${cache.classes} class_name declarations across ${cache.scripts} scripts`);
          addCheck('gdscript-runtime-policy', 'passed', 'GDScript resources are loaded by bounded game startup; editor-only --import is skipped');
        } catch (error) {
          addCheck('gdscript-class-cache', 'failed', error.message);
          addIssue('gdscript-class-cache', error.message);
        }
      }

      if (contract.value.scripting === 'csharp' && !result.checks.some(check => check.status !== 'passed')) {
        const buildLog = path.join(tempRoot, 'build.log');
        runGodotCheck('csharp-build', godot.command,
          [...godot.prefix, '--headless', '--path', isolatedProject, '--build-solutions', '--quit', '--log-file', buildLog],
          { cwd: isolatedProject, timeoutMs: 120_000, logFile: buildLog, csharp: true, env: godotUserEnv });
      }

      if (!result.checks.some(check => check.status === 'failed' || check.status === 'environment_failure')) {
        const startupLog = path.join(tempRoot, 'startup.log');
        runGodotCheck('headless-startup', godot.command,
          [...godot.prefix, '--headless', '--path', isolatedProject, '--quit-after', String(contract.value.smoke.quitAfterFrames), '--log-file', startupLog],
          { cwd: isolatedProject, timeoutMs: 45_000, logFile: startupLog, marker: contract.value.smoke.successMarker, csharp: contract.value.scripting === 'csharp', env: godotUserEnv });
      }
    }
  }
} catch (error) {
  addCheck('verifier-internal', 'environment_failure', error.message);
  addIssue('verifier-internal', error.stack || error.message, null, null, true);
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}

const hasFailed = result.checks.some(check => check.status === 'failed');
const hasEnvironment = environmentFailure || result.checks.some(check => check.status === 'environment_failure');
result.status = hasEnvironment ? 'environment_failure' : hasFailed ? 'failed' : 'passed';
result.summary = result.status === 'passed'
  ? `Godot construct verified (${result.toolchain.godot?.version || 'unknown version'})`
  : `${result.issues.length} issue(s); ${result.checks.filter(check => check.status === 'passed').length}/${result.checks.length} checks passed`;

if (jsonMode) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`[${result.status.toUpperCase()}] ${result.summary}`);
  for (const check of result.checks) console.log(`  ${check.status === 'passed' ? 'OK' : check.status === 'failed' ? 'FAIL' : 'ENV'} ${check.id}: ${check.message}`);
}
process.exitCode = result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : 2;
