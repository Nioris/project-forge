#!/usr/bin/env node
/** Strict, source-read-only contract for a Godot Windows x86_64 release. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readEngineProfile } from './engine-profile.mjs';

export const GODOT_EXPORT_CONTRACT_FILE = 'forge.godot.export.json';
export const GODOT_EXPORT_PRESET = 'Windows Desktop';

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys, label) {
  if (!object(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail('GODOT_EXPORT_CONTRACT', `${label} has invalid keys`);
}
export function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
export function safeSlug(value) { return /^[a-z0-9][a-z0-9-]{1,63}$/u.test(String(value || '')); }
export function snapshotTree(root) {
  const entries = [];
  const skip = new Set(['.git', '.godot', '.mono', '.claude', '.agents', '.codex', 'bin', 'obj', 'build', 'dist', 'release', 'node_modules', 'qa', 'wiki', 'test-results', 'playtest-out', 'stage-out']);
  function walk(dir, rel = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (skip.has(item.name.toLowerCase())) continue;
      const next = path.join(dir, item.name); const label = rel ? `${rel}/${item.name}` : item.name;
      if (item.isSymbolicLink()) fail('GODOT_EXPORT_SNAPSHOT', `symbolic links are forbidden: ${label}`);
      if (item.isDirectory() && label.replaceAll('\\', '/').toLowerCase() !== 'screens/review') walk(next, label);
      else if (item.isFile()) entries.push(`${label}\0${sha256File(next)}`);
    }
  }
  walk(root);
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}
function findPreset(text) {
  const chunks = String(text).split(/(?=^\[preset(?:\.\d+)?\])/mu);
  for (const chunk of chunks) {
    if (!/^\[preset(?:\.\d+)?\]/mu.test(chunk)) continue;
    const name = chunk.match(/^name="([^"]+)"/mu)?.[1];
    const platform = chunk.match(/^platform="([^"]+)"/mu)?.[1];
    if (name === GODOT_EXPORT_PRESET && platform === 'Windows Desktop') return chunk;
  }
  return null;
}
function hasCredentialValue(text) {
  return String(text).split(/\r?\n/u).some(line => {
    const match = line.match(/^\s*([^=]+)\s*=\s*(.*?)\s*$/u);
    if (!match || !/(?:password|token|secret|api[_-]?key|keystore|private[_-]?key|credential)/iu.test(match[1])) return false;
    const value = match[2].replace(/^"|"$/gu, '').trim();
    return value !== '' && value !== '0' && value.toLowerCase() !== 'false';
  });
}
export function readGodotExportContract(projectRoot = process.cwd()) {
  let root;
  try { root = fs.realpathSync(path.resolve(projectRoot)); }
  catch (error) { fail('GODOT_EXPORT_PROJECT', `project root is unavailable: ${error.message}`); }
  const engine = readEngineProfile(root);
  if (engine.engine !== 'godot') fail('GODOT_EXPORT_ENGINE', `Godot export requires forge.engine.json engine=godot; got ${engine.engine}`);
  const projectFile = path.join(root, 'forge.godot.json');
  let project; try { project = JSON.parse(fs.readFileSync(projectFile, 'utf8')); } catch (error) { fail('GODOT_EXPORT_PROJECT', `forge.godot.json missing/invalid: ${error.message}`); }
  if (!object(project) || project.kind !== 'forge.godot-project' || project.schemaVersion !== 1 || !['gdscript', 'csharp'].includes(project.scripting)) fail('GODOT_EXPORT_PROJECT', 'forge.godot.json is not a valid Godot project contract');
  const projectPath = String(project.projectPath || '.').replaceAll('\\', '/');
  if (!(projectPath === '.' || /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(projectPath))) fail('GODOT_EXPORT_PROJECT', 'unsafe projectPath');
  const lexicalImplementationRoot = path.resolve(root, projectPath);
  const rootRelative = path.relative(root, lexicalImplementationRoot);
  if (rootRelative.startsWith('..') || path.isAbsolute(rootRelative)) fail('GODOT_EXPORT_PROJECT', 'Godot implementation root escapes the project');
  let cursor = root;
  for (const segment of rootRelative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let stat; try { stat = fs.lstatSync(cursor); } catch { fail('GODOT_EXPORT_PROJECT', 'Godot implementation root is missing'); }
    if (stat.isSymbolicLink()) fail('GODOT_EXPORT_PROJECT_LINK', `Godot implementation path cannot contain a symlink/junction: ${segment}`);
  }
  let implementationRoot;
  try { implementationRoot = fs.realpathSync(lexicalImplementationRoot); }
  catch { fail('GODOT_EXPORT_PROJECT', 'Godot implementation root is missing'); }
  const canonicalRelative = path.relative(root, implementationRoot);
  if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)
    || !fs.existsSync(path.join(implementationRoot, 'project.godot'))) fail('GODOT_EXPORT_PROJECT', 'Godot implementation root/project.godot is missing');
  const contractFile = path.join(root, GODOT_EXPORT_CONTRACT_FILE);
  let value; try { value = JSON.parse(fs.readFileSync(contractFile, 'utf8')); } catch (error) { fail('GODOT_EXPORT_CONTRACT', `forge.godot.export.json missing/invalid: ${error.message}`); }
  exact(value, ['schemaVersion', 'kind', 'preset', 'target'], GODOT_EXPORT_CONTRACT_FILE);
  if (value.schemaVersion !== 1 || value.kind !== 'forge.godot-export' || value.preset !== GODOT_EXPORT_PRESET || value.target !== 'windows-x86_64') fail('GODOT_EXPORT_CONTRACT', 'only Windows Desktop / windows-x86_64 is supported');
  const presetsFile = path.join(implementationRoot, 'export_presets.cfg');
  let presets; try { presets = fs.readFileSync(presetsFile, 'utf8'); } catch (error) { fail('GODOT_EXPORT_PRESET', `export_presets.cfg missing: ${error.message}`); }
  const preset = findPreset(presets);
  if (!preset) fail('GODOT_EXPORT_PRESET', 'exact named Windows Desktop export preset is required');
  if (hasCredentialValue(presets)) fail('GODOT_EXPORT_SECRETS', 'export_presets.cfg must not contain credential values or secrets');
  const architecture = preset.match(/^binary_format\/architecture\s*=\s*"([^"]+)"/mu)?.[1];
  if (architecture !== 'x86_64') fail('GODOT_EXPORT_ARCHITECTURE', 'Windows Desktop preset must explicitly target x86_64');
  const consoleWrapper = preset.match(/^debug\/export_console_wrapper\s*=\s*([^\r\n]+?)\s*$/mu)?.[1] || null;
  if (consoleWrapper !== null && consoleWrapper !== '1') {
    fail('GODOT_EXPORT_CONSOLE_WRAPPER', 'Windows Desktop preset must keep the Godot debug console wrapper enabled only for debug (default or 1)');
  }
  if (/^binary_format\/embed_pck\s*=\s*true\s*$/mu.test(preset)) fail('GODOT_EXPORT_PCK', 'Windows Desktop preset must keep PCK separate for verifiable release artifacts');
  if (/^custom_template\/(?:debug|release)\s*=\s*"[^"\r\n]+"\s*$/mu.test(preset)) fail('GODOT_EXPORT_CUSTOM_TEMPLATE', 'custom export templates are not accepted; install the matching official Godot templates');
  return { root, engine, project, implementationRoot, contractFile, presetsFile, preset, contract: value, hashes: { contract: sha256File(contractFile), presets: sha256File(presetsFile), project: sha256File(path.join(implementationRoot, 'project.godot')), source: snapshotTree(implementationRoot) } };
}
