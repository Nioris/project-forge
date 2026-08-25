/** Machine-readable Phase 2 screen inventory consumed by Phase 4 visual QA. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readTrustedProjectEngine } from './project-engine.mjs';

export const SCREEN_FLOW_PATH = 'wiki/design/screen-flow.json';
export const SCREEN_FLOW_SCHEMA_VERSION = 1;
export const SCREEN_FLOW_KIND = 'forge.screen-flow';
export const FORGE_VISUAL_QA_GLOBAL = '__FORGE_VISUAL_QA__';
export const FORGE_VISUAL_QA_QUERY = 'forgeVisualQa=1';
export const FORGE_GODOT_VISUAL_ADAPTER_KIND = 'godot-runtime';
export const FORGE_GODOT_VISUAL_PROTOCOL = 'forge-godot-visual-v1';
export const DEDICATED_TARGET_ARCHETYPES = new Set(['start', 'home', 'hq', 'map', 'gameplay', 'result']);

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/u;
const ALLOWED_TARGET_POLICIES = new Set(['dedicated', 'inherited']);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Stable Phase 2 approval subject.  It deliberately excludes status/approval metadata while
 * covering every player-visible state and every transition.  Sorting makes a harmless JSON
 * reformat/reordering unable to invalidate the user decision, while a graph/content change does.
 */
export function screenInventoryPayload(flow = {}) {
  const sort = list => [...(Array.isArray(list) ? list : [])]
    .map(item => JSON.parse(JSON.stringify(item || {})))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  return {
    schemaVersion: flow.schemaVersion || null,
    kind: flow.kind || null,
    entryState: flow.entryState || null,
    qaAdapter: flow.qaAdapter || null,
    states: sort(flow.states),
    transitions: sort(flow.transitions),
  };
}

export function screenInventorySha256(flow = {}) {
  return crypto.createHash('sha256').update(canonicalJson(screenInventoryPayload(flow))).digest('hex');
}

function isCanonicalIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function safeFile(root, rel) {
  if (rel !== SCREEN_FLOW_PATH) return null;
  try {
    const realRoot = fs.realpathSync(path.resolve(root));
    const lexical = path.resolve(realRoot, rel);
    const realFile = fs.realpathSync(lexical);
    return inside(realRoot, realFile) && fs.statSync(realFile).isFile() ? realFile : null;
  } catch {
    return null;
  }
}

function reachable(entry, transitions, reverse = false) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of transitions) {
      const from = reverse ? edge.to : edge.from;
      const to = reverse ? edge.from : edge.to;
      if (from === current && !seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return seen;
}

export function validateScreenFlow({ root = process.cwd(), rel = SCREEN_FLOW_PATH } = {}) {
  const failures = [];
  const file = safeFile(root, rel);
  if (!file) return { ok: false, failures: [`screen flow is missing or unsafe: ${SCREEN_FLOW_PATH}`], file: null, flow: null, states: [] };
  let flow;
  try { flow = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { flow = null; }
  if (!flow || flow.schemaVersion !== SCREEN_FLOW_SCHEMA_VERSION || flow.kind !== SCREEN_FLOW_KIND) {
    return { ok: false, failures: ['screen flow has the wrong schemaVersion/kind'], file, flow, states: [] };
  }
  if (flow.status !== 'approved') failures.push('screen flow status must be approved');
  const approval = flow.approval;
  if (!approval || typeof approval !== 'object') failures.push('screen flow requires a user inventory approval object');
  else {
    if (approval.decisionKey !== 'phase2-screen-inventory') failures.push('screen flow approval decisionKey must be phase2-screen-inventory');
    if (approval.approvedBy !== 'user') failures.push('screen flow inventory must be approvedBy=user');
    if (!isCanonicalIso(approval.approvedAt)) failures.push('screen flow approval needs a canonical approvedAt timestamp');
    const expectedInventoryHash = screenInventorySha256(flow);
    if (!/^[a-f0-9]{64}$/u.test(String(approval.inventorySha256 || '')) || approval.inventorySha256 !== expectedInventoryHash) {
      failures.push('screen flow approval inventorySha256 does not match the complete state/transition inventory');
    }
  }
  let engine = 'web';
  try { engine = readTrustedProjectEngine(root).engine; }
  catch (error) { failures.push(`screen flow engine profile rejected (${error.code || 'ENGINE_PROFILE'}): ${error.message}`); }
  if (engine === 'godot') {
    if (flow.qaAdapter?.kind !== FORGE_GODOT_VISUAL_ADAPTER_KIND || flow.qaAdapter?.protocol !== FORGE_GODOT_VISUAL_PROTOCOL) {
      failures.push(`Godot screen flow must declare ${FORGE_GODOT_VISUAL_ADAPTER_KIND}/${FORGE_GODOT_VISUAL_PROTOCOL}`);
    }
  } else if (flow.qaAdapter?.global !== FORGE_VISUAL_QA_GLOBAL || flow.qaAdapter?.query !== FORGE_VISUAL_QA_QUERY) {
    failures.push(`Web screen flow must declare ${FORGE_VISUAL_QA_GLOBAL} activated by ${FORGE_VISUAL_QA_QUERY}`);
  }
  const states = Array.isArray(flow.states) ? flow.states : [];
  if (states.length < 2) failures.push('screen flow must enumerate at least two player-visible states');
  const ids = states.map(item => String(item?.id || '').trim());
  if (new Set(ids).size !== ids.length) failures.push('screen flow contains duplicate state ids');
  const byId = new Map(states.map(item => [String(item?.id || '').trim(), item]));
  for (const [index, state] of states.entries()) {
    const id = ids[index];
    if (!SAFE_ID.test(id)) failures.push(`screen flow state ${index + 1} has an invalid id`);
    if (typeof state?.label !== 'string' || state.label.trim().length < 2) failures.push(`screen flow state "${id || index + 1}" needs a label`);
    if (!SAFE_ID.test(String(state?.archetype || ''))) failures.push(`screen flow state "${id}" has an invalid archetype`);
    if (typeof state?.visualDescription !== 'string' || state.visualDescription.trim().length < 40) failures.push(`screen flow state "${id}" needs a concrete visualDescription`);
    if (state?.required !== true) failures.push(`screen flow state "${id}" must be required; omit non-player-visible/transient states instead`);
    if (state?.capture?.adapterState !== id) failures.push(`screen flow state "${id}" capture.adapterState must equal its id`);
    if (!ALLOWED_TARGET_POLICIES.has(state?.targetPolicy)) failures.push(`screen flow state "${id}" targetPolicy must be dedicated or inherited`);
    if (DEDICATED_TARGET_ARCHETYPES.has(state?.archetype) && state?.targetPolicy !== 'dedicated') {
      failures.push(`core screen "${id}" (${state.archetype}) requires a dedicated GPT Image target`);
    }
    if (state?.targetPolicy === 'inherited') {
      const parent = byId.get(String(state?.inheritFrom || ''));
      if (!parent || parent.targetPolicy !== 'dedicated') failures.push(`inherited screen "${id}" must reference an existing dedicated state`);
    } else if (state?.inheritFrom !== null && state?.inheritFrom !== undefined && state?.inheritFrom !== '') {
      failures.push(`dedicated screen "${id}" cannot inherit another target`);
    }
  }
  const entryState = String(flow.entryState || '');
  if (!byId.has(entryState)) failures.push('screen flow entryState must reference an enumerated state');
  const transitions = Array.isArray(flow.transitions) ? flow.transitions : [];
  const transitionKeys = new Set();
  for (const [index, edge] of transitions.entries()) {
    const from = String(edge?.from || '');
    const to = String(edge?.to || '');
    if (!byId.has(from) || !byId.has(to)) failures.push(`screen flow transition ${index + 1} references an unknown state`);
    if (typeof edge?.trigger !== 'string' || edge.trigger.trim().length < 2) failures.push(`screen flow transition ${index + 1} needs a trigger`);
    const key = `${from}::${to}`;
    if (transitionKeys.has(key)) failures.push(`screen flow has a duplicate transition: ${key}`);
    transitionKeys.add(key);
  }
  if (byId.has(entryState)) {
    const forward = reachable(entryState, transitions);
    const backward = reachable(entryState, transitions, true);
    for (const id of ids) {
      if (!forward.has(id)) failures.push(`screen flow state "${id}" is unreachable from entryState`);
      if (!backward.has(id)) failures.push(`screen flow state "${id}" cannot return to entryState`);
    }
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)], file, flow, states, ids };
}
