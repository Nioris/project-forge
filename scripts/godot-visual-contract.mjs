#!/usr/bin/env node
/** Strict project-local contract for native Godot Phase 4 capture. */
import fs from 'node:fs';
import path from 'node:path';
import { readEngineProfile } from './engine-profile.mjs';
import { FORGE_GODOT_VISUAL_PROTOCOL, validateScreenFlow } from '../.claude/skills/status/references/screen-flow-contract.mjs';

export const GODOT_VISUAL_CONTRACT_FILE = 'forge.godot.visual.json';
export const GODOT_PROJECT_CONTRACT_FILE = 'forge.godot.json';

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) fail('GODOT_VISUAL_CONTRACT', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail('GODOT_VISUAL_CONTRACT', `${label} has invalid keys`, {
      unknown: actual.filter(key => !wanted.includes(key)),
      missing: wanted.filter(key => !actual.includes(key)),
    });
  }
}

function parseJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')); }
  catch (error) { fail('GODOT_VISUAL_JSON', `${label} is missing or invalid JSON: ${error.message}`); }
}

function safeRelative(value, { allowDot = false } = {}) {
  const raw = String(value || '');
  const normalized = raw.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (allowDot && (raw === '.' || normalized === '')) return '.';
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

function noReparsePath(root, candidate, label) {
  if (!inside(root, candidate)) fail('GODOT_VISUAL_PROJECT_CONTRACT', `${label} escapes the canonical project root`);
  const relative = path.relative(root, candidate);
  let current = root;
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    let stat; try { stat = fs.lstatSync(current); } catch { fail('GODOT_VISUAL_PROJECT_CONTRACT', `${label} is missing`); }
    if (stat.isSymbolicLink()) fail('GODOT_VISUAL_PROJECT_LINK', `${label} crosses a symlink, junction, or reparse point`);
  }
}

function positiveInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail('GODOT_VISUAL_CONTRACT', `${label} must be an integer in ${min}..${max}`);
  return value;
}

function parseIniSection(text, section) {
  const values = new Map();
  let current = '';
  for (const raw of String(text).split(/\r?\n/u)) {
    const line = raw.trim();
    const header = line.match(/^\[([^\]]+)\]$/u);
    if (header) { current = header[1]; continue; }
    if (current !== section || !line || line.startsWith(';') || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"\s*$/u);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function validateViewport(value, label, { widthMin, widthMax, heightMin, heightMax, exactWidth = null }) {
  exactKeys(value, ['height', 'width'], label);
  const width = positiveInteger(value.width, widthMin, widthMax, `${label}.width`);
  const height = positiveInteger(value.height, heightMin, heightMax, `${label}.height`);
  if (exactWidth !== null && width !== exactWidth) fail('GODOT_VISUAL_CONTRACT', `${label}.width must be exactly ${exactWidth}`);
  return { width, height };
}

export function readGodotVisualContract(projectRoot = process.cwd()) {
  let root;
  try { root = fs.realpathSync(path.resolve(projectRoot)); }
  catch { fail('GODOT_VISUAL_PROJECT_CONTRACT', 'project root is unavailable'); }
  const engine = readEngineProfile(root);
  if (engine.engine !== 'godot') fail('GODOT_VISUAL_ENGINE', `Godot visual capture requires forge.engine.json engine=godot; got ${engine.engine}`);

  const godotContractFile = path.join(root, GODOT_PROJECT_CONTRACT_FILE);
  noReparsePath(root, godotContractFile, GODOT_PROJECT_CONTRACT_FILE);
  const godotContract = parseJson(godotContractFile, GODOT_PROJECT_CONTRACT_FILE);
  exactKeys(godotContract, ['schemaVersion', 'kind', 'projectPath', 'scripting', 'entryScene', 'smoke', 'sceneContract'], GODOT_PROJECT_CONTRACT_FILE);
  if (godotContract.schemaVersion !== 1 || godotContract.kind !== 'forge.godot-project') {
    fail('GODOT_VISUAL_PROJECT_CONTRACT', `${GODOT_PROJECT_CONTRACT_FILE} has the wrong schemaVersion/kind`);
  }
  const projectPath = safeRelative(godotContract.projectPath, { allowDot: true });
  if (!projectPath || !['gdscript', 'csharp'].includes(godotContract.scripting)) {
    fail('GODOT_VISUAL_PROJECT_CONTRACT', `${GODOT_PROJECT_CONTRACT_FILE} has invalid projectPath/scripting`);
  }
  const implementationCandidate = path.resolve(root, projectPath);
  if (!inside(root, implementationCandidate) || !fs.existsSync(implementationCandidate)) {
    fail('GODOT_VISUAL_PROJECT_CONTRACT', 'Godot implementation root is missing or outside the managed project');
  }
  noReparsePath(root, implementationCandidate, 'Godot implementation root');
  const implementationRoot = fs.realpathSync(implementationCandidate);
  if (!inside(root, implementationRoot) || !fs.statSync(implementationRoot).isDirectory()) fail('GODOT_VISUAL_PROJECT_CONTRACT', 'Godot implementation root is not a canonical project directory');

  const visualContractFile = path.join(root, GODOT_VISUAL_CONTRACT_FILE);
  noReparsePath(root, visualContractFile, GODOT_VISUAL_CONTRACT_FILE);
  const visual = parseJson(visualContractFile, GODOT_VISUAL_CONTRACT_FILE);
  exactKeys(visual, ['schemaVersion', 'kind', 'adapter', 'capture', 'proofVideo'], GODOT_VISUAL_CONTRACT_FILE);
  if (visual.schemaVersion !== 1 || visual.kind !== 'forge.godot-visual') {
    fail('GODOT_VISUAL_CONTRACT', `${GODOT_VISUAL_CONTRACT_FILE} has the wrong schemaVersion/kind`);
  }

  exactKeys(visual.adapter, ['autoloadName', 'protocol', 'script', 'targetNode'], 'visual adapter');
  if (visual.adapter.protocol !== FORGE_GODOT_VISUAL_PROTOCOL) fail('GODOT_VISUAL_CONTRACT', `visual adapter protocol must be ${FORGE_GODOT_VISUAL_PROTOCOL}`);
  if (!/^[A-Za-z_][A-Za-z0-9_]{2,63}$/u.test(String(visual.adapter.autoloadName || ''))) fail('GODOT_VISUAL_CONTRACT', 'visual adapter autoloadName is invalid');
  const adapterScript = safeResource(visual.adapter.script, ['.gd', '.cs']);
  if (!adapterScript) fail('GODOT_VISUAL_CONTRACT', 'visual adapter script must be a safe res:// .gd/.cs path');
  if ((godotContract.scripting === 'gdscript' && !adapterScript.rel.endsWith('.gd'))
    || (godotContract.scripting === 'csharp' && !adapterScript.rel.endsWith('.cs'))) {
    fail('GODOT_VISUAL_CONTRACT', `visual adapter script must match project scripting=${godotContract.scripting}`);
  }
  const targetNode = String(visual.adapter.targetNode || '');
  if (targetNode !== '.' && !safeRelative(targetNode)) fail('GODOT_VISUAL_CONTRACT', 'visual adapter targetNode is unsafe');
  const adapterFile = path.join(implementationRoot, adapterScript.rel);
  if (!inside(implementationRoot, adapterFile) || !fs.existsSync(adapterFile)) {
    fail('GODOT_VISUAL_ADAPTER', `visual adapter script is missing: ${adapterScript.resource}`);
  }
  noReparsePath(implementationRoot, adapterFile, 'visual adapter script');
  if (!fs.statSync(adapterFile).isFile()) fail('GODOT_VISUAL_ADAPTER', `visual adapter script is not a regular file: ${adapterScript.resource}`);

  const projectFile = path.join(implementationRoot, 'project.godot');
  noReparsePath(implementationRoot, projectFile, 'project.godot');
  let projectText;
  try { projectText = fs.readFileSync(projectFile, 'utf8'); }
  catch (error) { fail('GODOT_VISUAL_ADAPTER', `project.godot is missing: ${error.message}`); }
  const autoload = parseIniSection(projectText, 'autoload').get(visual.adapter.autoloadName) || '';
  if (autoload.replace(/^\*/u, '') !== adapterScript.resource) {
    fail('GODOT_VISUAL_ADAPTER', `project.godot must autoload ${visual.adapter.autoloadName}="*${adapterScript.resource}"`);
  }

  exactKeys(visual.capture, ['settleFrames', 'timeoutSeconds', 'viewports'], 'visual capture');
  const settleFrames = positiveInteger(visual.capture.settleFrames, 2, 120, 'capture.settleFrames');
  const timeoutSeconds = positiveInteger(visual.capture.timeoutSeconds, 10, 90, 'capture.timeoutSeconds');
  exactKeys(visual.capture.viewports, ['desktop', 'mobile'], 'capture.viewports');
  const mobile = validateViewport(visual.capture.viewports.mobile, 'capture.viewports.mobile', {
    widthMin: 412, widthMax: 412, heightMin: 720, heightMax: 1024, exactWidth: 412,
  });
  const desktop = validateViewport(visual.capture.viewports.desktop, 'capture.viewports.desktop', {
    widthMin: 1280, widthMax: 3840, heightMin: 720, heightMax: 2160,
  });

  exactKeys(visual.proofVideo, ['durationSeconds', 'fps', 'states', 'viewport'], 'proofVideo');
  const fps = positiveInteger(visual.proofVideo.fps, 24, 60, 'proofVideo.fps');
  const durationSeconds = positiveInteger(visual.proofVideo.durationSeconds, 15, 20, 'proofVideo.durationSeconds');
  if (!['mobile', 'desktop'].includes(visual.proofVideo.viewport)) fail('GODOT_VISUAL_CONTRACT', 'proofVideo.viewport must be mobile or desktop');
  const proofStates = Array.isArray(visual.proofVideo.states) ? visual.proofVideo.states.map(String) : [];
  if (proofStates.length < 2 || proofStates.length > 12 || new Set(proofStates).size !== proofStates.length
    || proofStates.some(state => !/^[a-z0-9][a-z0-9_-]{1,63}$/u.test(state))) {
    fail('GODOT_VISUAL_CONTRACT', 'proofVideo.states must contain 2..12 unique safe state ids');
  }

  const screenFlow = validateScreenFlow({ root });
  if (!screenFlow.ok) fail('GODOT_VISUAL_SCREEN_FLOW', `Approved Godot screen flow is invalid: ${screenFlow.failures.join('; ')}`);
  const missingProofStates = proofStates.filter(state => !screenFlow.ids.includes(state));
  if (missingProofStates.length) fail('GODOT_VISUAL_CONTRACT', `proofVideo states are absent from screen-flow: ${missingProofStates.join(', ')}`);

  return {
    root,
    engine,
    godotContract,
    visual,
    projectPath,
    implementationRoot,
    adapter: { ...visual.adapter, script: adapterScript, targetNode },
    capture: { settleFrames, timeoutSeconds, viewports: { mobile, desktop } },
    proofVideo: { fps, durationSeconds, viewport: visual.proofVideo.viewport, states: proofStates },
    screenFlow,
  };
}
