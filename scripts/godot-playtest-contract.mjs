#!/usr/bin/env node
/** Strict, production-inert contract for native Godot tech/playtest runs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEngineProfile } from './engine-profile.mjs';

export const GODOT_PLAYTEST_PROTOCOL = 'forge-godot-playtest-v1';
export const GODOT_PLAYTEST_FILE = 'forge.godot.playtest.json';
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function obj(v, label) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail('GODOT_PLAYTEST_CONTRACT', `${label} must be an object`); }
function expectation(v, label) { obj(v, label); if (!Object.keys(v).length) fail('GODOT_PLAYTEST_CONTRACT', `${label} must contain at least one expected state field`); }
function exact(v, keys, label) { obj(v, label); const a = Object.keys(v).sort(), b = [...keys].sort(); if (JSON.stringify(a) !== JSON.stringify(b)) fail('GODOT_PLAYTEST_CONTRACT', `${label} keys must be exactly ${b.join(', ')}`); }
function rel(value, dot = false) { const x = String(value || '').replaceAll('\\', '/').replace(/^\.\//, ''); if ((dot && (x === '.' || !x)) || (!x || x.startsWith('/') || /^[A-Za-z]:/.test(x) || x.split('/').some(p => !p || p === '.' || p === '..'))) return dot && (x === '.' || !x) ? '.' : null; return x; }
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function real(file, code, message) { try { return fs.realpathSync.native(file); } catch { fail(code, message); } }
function noReparsePath(root, candidate, code, label) {
  const relative = path.relative(root, candidate);
  if (!inside(root, candidate)) fail(code, `${label} escapes the canonical project root`);
  let current = root;
  for (const part of relative ? relative.split(path.sep) : []) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch { fail(code, `${label} is missing`); }
    if (stat.isSymbolicLink()) fail(code, `${label} crosses a symlink, junction, or reparse point`);
  }
}
function secureDirectory(root, pieces) {
  let current = root;
  for (const piece of pieces) {
    current = path.join(current, piece);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('GODOT_PLAYTEST_REPORT_PATH', `QA report directory is unsafe: ${current}`);
    } else {
      fs.mkdirSync(current);
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('GODOT_PLAYTEST_REPORT_PATH', `QA report directory is unsafe: ${current}`);
    }
  }
  return current;
}
export function writeGodotQaReport(projectRoot, channel, value) {
  const root = real(projectRoot, 'GODOT_PLAYTEST_REPORT_PATH', 'canonical project root is unavailable');
  const dir = secureDirectory(root, ['qa', channel]);
  const destination = path.join(dir, 'report.json');
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) fail('GODOT_PLAYTEST_REPORT_PATH', 'QA report target is a symlink, junction, or reparse point');
  const temp = path.join(dir, `.report-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  if (fs.lstatSync(temp).isSymbolicLink()) { fs.rmSync(temp, { force: true }); fail('GODOT_PLAYTEST_REPORT_PATH', 'QA temporary report target is unsafe'); }
  fs.renameSync(temp, destination);
  return destination;
}
function iniSection(text, wanted) { let section = ''; const values = new Map(); for (const line of String(text).split(/\r?\n/)) { const h = line.trim().match(/^\[([^\]]+)\]$/); if (h) { section = h[1]; continue; } if (section !== wanted) continue; const m = line.trim().match(/^([^=]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) values.set(m[1].trim(), m[2].trim()); } return values; }
function actionNames(text) { return [...String(text).matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*\{/gm)].map(m => m[1]); }
export function readGodotPlaytestContract(projectRoot = process.cwd()) {
  const inputRoot = path.resolve(projectRoot); const root = real(inputRoot, 'GODOT_PLAYTEST_PROJECT', 'project root is unavailable');
  if (!fs.lstatSync(root).isDirectory()) fail('GODOT_PLAYTEST_PROJECT', 'project root must be a directory');
  const engine = readEngineProfile(root);
  if (engine.engine !== 'godot') fail('GODOT_PLAYTEST_ENGINE', 'Native playtest requires forge.engine.json engine=godot');
  const projectConfig = path.join(root, 'forge.godot.json');
  noReparsePath(root, projectConfig, 'GODOT_PLAYTEST_PROJECT', 'forge.godot.json');
  let project; try { project = JSON.parse(fs.readFileSync(projectConfig, 'utf8').replace(/^\uFEFF/, '')); } catch { fail('GODOT_PLAYTEST_PROJECT', 'forge.godot.json is missing or invalid'); }
  if (project.schemaVersion !== 1 || project.kind !== 'forge.godot-project' || !['gdscript', 'csharp'].includes(project.scripting)) fail('GODOT_PLAYTEST_PROJECT', 'forge.godot.json must be a v1 forge.godot-project with explicit scripting');
  if (project.scripting === 'csharp') fail('GODOT_PLAYTEST_CSHARP_ENVIRONMENT', 'Godot C# native QA requires a separately installed .NET adapter; Q3-007 currently supports GDScript');
  const projectPath = rel(project.projectPath, true); const implementationCandidate = path.resolve(root, projectPath || '');
  if (!projectPath || !inside(root, implementationCandidate) || !fs.existsSync(path.join(implementationCandidate, 'project.godot'))) fail('GODOT_PLAYTEST_PROJECT', 'Godot projectPath is unsafe or missing');
  noReparsePath(root, implementationCandidate, 'GODOT_PLAYTEST_PROJECT', 'Godot projectPath');
  const implementationRoot = real(implementationCandidate, 'GODOT_PLAYTEST_PROJECT', 'Godot implementation root is unavailable');
  if (!inside(root, implementationRoot)) fail('GODOT_PLAYTEST_PROJECT', 'Godot projectPath escapes the canonical project root');
  const godotProjectFile = path.join(implementationRoot, 'project.godot');
  noReparsePath(implementationRoot, godotProjectFile, 'GODOT_PLAYTEST_PROJECT', 'project.godot');
  const playtestFile = path.join(root, GODOT_PLAYTEST_FILE);
  noReparsePath(root, playtestFile, 'GODOT_PLAYTEST_JSON', GODOT_PLAYTEST_FILE);
  let value; try { value = JSON.parse(fs.readFileSync(playtestFile, 'utf8').replace(/^\uFEFF/, '')); } catch { fail('GODOT_PLAYTEST_JSON', `${GODOT_PLAYTEST_FILE} is missing or invalid`); }
  exact(value, ['schemaVersion', 'kind', 'adapter', 'timeoutSeconds', 'scenario'], GODOT_PLAYTEST_FILE);
  if (value.schemaVersion !== 1 || value.kind !== 'forge.godot-playtest') fail('GODOT_PLAYTEST_CONTRACT', 'wrong schemaVersion/kind');
  exact(value.adapter, ['autoloadName', 'protocol', 'script', 'targetNode'], 'adapter');
  if (value.adapter.protocol !== GODOT_PLAYTEST_PROTOCOL || !/^[A-Za-z_][A-Za-z0-9_]{2,63}$/.test(value.adapter.autoloadName)) fail('GODOT_PLAYTEST_CONTRACT', 'invalid adapter protocol/autoload name');
  const script = String(value.adapter.script || ''); const scriptRel = script.startsWith('res://') ? rel(script.slice(6)) : null;
  if (!scriptRel || !scriptRel.endsWith('.gd')) fail('GODOT_PLAYTEST_CONTRACT', 'Q3-007 requires the trusted GDScript QA adapter');
  const scriptFile = path.join(implementationRoot, scriptRel); if (!fs.existsSync(scriptFile)) fail('GODOT_PLAYTEST_CONTRACT', 'adapter script is missing');
  noReparsePath(implementationRoot, scriptFile, 'GODOT_PLAYTEST_CONTRACT', 'adapter script');
  const trustedAdapter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'godot', 'ForgePlaytestQA.gd');
  if (!fs.existsSync(trustedAdapter) || !fs.readFileSync(scriptFile).equals(fs.readFileSync(trustedAdapter))) fail('GODOT_PLAYTEST_ADAPTER_UNTRUSTED', 'QA adapter must be an exact copy of the installed inert ForgePlaytestQA.gd template');
  const targetNode = String(value.adapter.targetNode); if (targetNode !== '.' && !rel(targetNode)) fail('GODOT_PLAYTEST_CONTRACT', 'unsafe targetNode');
  if (!Number.isInteger(value.timeoutSeconds) || value.timeoutSeconds < 5 || value.timeoutSeconds > 90) fail('GODOT_PLAYTEST_CONTRACT', 'timeoutSeconds must be 5..90');
  exact(value.scenario, ['initialExpect', 'steps', 'progress', 'saveReload'], 'scenario'); expectation(value.scenario.initialExpect, 'initialExpect'); expectation(value.scenario.progress, 'progress'); expectation(value.scenario.saveReload, 'saveReload');
  if (!Array.isArray(value.scenario.steps) || value.scenario.steps.length < 2 || value.scenario.steps.length > 30) fail('GODOT_PLAYTEST_CONTRACT', 'scenario.steps must contain 2..30 actions');
  const steps = value.scenario.steps.map((step, i) => { exact(step, ['action', 'expect'], `steps[${i}]`); if (!/^[A-Za-z0-9_]{2,64}$/.test(String(step.action))) fail('GODOT_PLAYTEST_CONTRACT', 'unsafe InputMap action'); expectation(step.expect, `steps[${i}].expect`); return { action: String(step.action), expect: step.expect }; });
  const godotText = fs.readFileSync(path.join(implementationRoot, 'project.godot'), 'utf8'); const autoload = iniSection(godotText, 'autoload').get(value.adapter.autoloadName) || '';
  if (autoload.replace(/^\*/, '') !== script) fail('GODOT_PLAYTEST_CONTRACT', 'project.godot missing required inert QA autoload');
  const inputs = new Set(actionNames(godotText)); const missing = steps.map(s => s.action).filter(a => !inputs.has(a)); if (missing.length) fail('GODOT_PLAYTEST_INPUTMAP', `project.godot missing InputMap actions: ${[...new Set(missing)].join(', ')}`);
  return { root, engine, project, projectPath, implementationRoot, value, adapter: { ...value.adapter, scriptRel, targetNode, trustedAdapter }, scenario: { ...value.scenario, steps } };
}
