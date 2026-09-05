/** Strict browser-playtest contract and engine-owned receipt payload. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const WEB_PLAYTEST_FILE = 'forge.web.playtest.json';
export const WEB_PLAYTEST_PROTOCOL = 'forge-web-playtest-v1';
// Available in an ordinary player launch. This observer deliberately has no setter.
export const FORGE_PLAYTEST_GLOBAL = '__FORGE_PLAYTEST__';

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/u;
const SAFE_REL = /^(?:[A-Za-z0-9._-]+)(?:\/[A-Za-z0-9._-]+)*$/u;
const TECH_FACTS = new Set(['sdk-init', 'loading-ready', 'gameplay-start', 'gameplay-stop', 'ad', 'pointer-input']);
// Only Forge-owned evidence/metadata is excluded. A game may deliberately serve
// `dist`, `build`, `node_modules`, or `qa` code from its entrypoint, so hiding
// those directories would make a receipt stale-proof blind.
const IGNORE = new Set(['.git', '.claude', '.agents', '.codex', 'playtest-out', 'stage-out', 'screens', 'test-results']);

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('WEB_PLAYTEST_CONTRACT', `${label} must be an object`); }
function exact(value, keys, label) { object(value, label); if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail('WEB_PLAYTEST_CONTRACT', `${label} has invalid keys`); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(file) { return hash(fs.readFileSync(file)); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function safeRealFile(root, rel, label) {
  if (!SAFE_REL.test(String(rel || '')) || String(rel).split('/').includes('..')) fail('WEB_PLAYTEST_PATH', `${label} must be a safe project-relative path`);
  const lexical = path.resolve(root, rel);
  if (!inside(root, lexical)) fail('WEB_PLAYTEST_PATH', `${label} escapes project root`);
  let real; try { real = fs.realpathSync(lexical); } catch { fail('WEB_PLAYTEST_PATH', `${label} is missing`); }
  if (!inside(root, real) || !fs.statSync(real).isFile()) fail('WEB_PLAYTEST_PATH', `${label} is unsafe`);
  return real;
}
function safeRealDirectory(root, rel, label) {
  if (!SAFE_REL.test(String(rel || '')) || String(rel).split('/').includes('..')) fail('WEB_PLAYTEST_PATH', `${label} must be a safe project-relative path`);
  const lexical = path.resolve(root, rel);
  if (!inside(root, lexical)) fail('WEB_PLAYTEST_PATH', `${label} escapes project root`);
  let real; try { real = fs.realpathSync(lexical); } catch { fail('WEB_PLAYTEST_PATH', `${label} is missing`); }
  if (!inside(root, real) || !fs.statSync(real).isDirectory()) fail('WEB_PLAYTEST_PATH', `${label} is unsafe`);
  return real;
}

export function snapshotWebGameSource(root) {
  const realRoot = fs.realpathSync(root);
  const entries = [];
  const walk = (directory, relative = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(directory, entry.name); const label = relative ? `${relative}/${entry.name}` : entry.name;
      if (IGNORE.has(entry.name.toLowerCase())) continue;
      if (entry.isSymbolicLink()) fail('WEB_PLAYTEST_SOURCE_LINK', `game source contains a symlink/junction: ${label}`);
      if (entry.isDirectory()) walk(next, label);
      else if (entry.isFile()) entries.push(`${label.replaceAll('\\', '/')}\0${sha256File(next)}`);
    }
  };
  walk(realRoot);
  return hash(entries.join('\n'));
}

export function readWebPlaytestContract(projectRoot = process.cwd()) {
  let root; try { root = fs.realpathSync(path.resolve(projectRoot)); } catch { fail('WEB_PLAYTEST_PROJECT', 'project root is unavailable'); }
  const file = safeRealFile(root, WEB_PLAYTEST_FILE, WEB_PLAYTEST_FILE);
  let value; try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { fail('WEB_PLAYTEST_CONTRACT', `${WEB_PLAYTEST_FILE} is invalid JSON`); }
  exact(value, ['schemaVersion', 'kind', 'gameRoot', 'adapter', 'initialState', 'steps', 'persistence', ...(value.tech === undefined ? [] : ['tech'])], WEB_PLAYTEST_FILE);
  if (value.schemaVersion !== 1 || value.kind !== 'forge.web-playtest') fail('WEB_PLAYTEST_CONTRACT', 'wrong schemaVersion/kind');
  if (!SAFE_REL.test(String(value.gameRoot || '')) || String(value.gameRoot).split('/').includes('..')) fail('WEB_PLAYTEST_CONTRACT', 'gameRoot must be a safe project-relative directory');
  const gameRoot = safeRealDirectory(root, value.gameRoot, 'gameRoot');
  if (!fs.existsSync(path.join(gameRoot, 'index.html'))) fail('WEB_PLAYTEST_CONTRACT', 'gameRoot must contain index.html');
  exact(value.adapter, ['global'], 'adapter');
  if (value.adapter.global !== FORGE_PLAYTEST_GLOBAL) fail('WEB_PLAYTEST_CONTRACT', 'contract must use the production-safe Forge playtest observer');
  if (!SAFE_ID.test(String(value.initialState || ''))) fail('WEB_PLAYTEST_CONTRACT', 'initialState is invalid');
  if (!Array.isArray(value.steps) || value.steps.length < 3 || value.steps.length > 20) fail('WEB_PLAYTEST_CONTRACT', 'steps must contain 3..20 bounded actions');
  const ids = new Set(); let changedPlayerActions = 0; let unchangedPlayerActions = 0; let playerActions = 0;
  const steps = value.steps.map((step, index) => {
    exact(step, ['id', 'action', 'expect'], `steps[${index}]`);
    if (!SAFE_ID.test(String(step.id || '')) || ids.has(step.id)) fail('WEB_PLAYTEST_CONTRACT', 'step ids must be unique safe identifiers');
    ids.add(step.id);
    const action = step.action; object(action, `steps[${index}].action`);
    if (!['click', 'key', 'platform-event'].includes(action.kind)) fail('WEB_PLAYTEST_CONTRACT', `steps[${index}] has an unsupported action kind`);
    const actionKeys = action.kind === 'click' ? ['kind', 'x', 'y'] : action.kind === 'key' ? ['kind', 'key'] : ['kind', 'event'];
    exact(action, actionKeys, `steps[${index}].action`);
    if (action.kind === 'click' && (!Number.isFinite(action.x) || !Number.isFinite(action.y) || action.x < 0 || action.x > 1 || action.y < 0 || action.y > 1)) fail('WEB_PLAYTEST_CONTRACT', `steps[${index}] click coordinates must be 0..1`);
    if (action.kind === 'key' && (typeof action.key !== 'string' || !action.key || action.key.length > 32)) fail('WEB_PLAYTEST_CONTRACT', `steps[${index}] key is invalid`);
    if (action.kind === 'platform-event' && !['game_api_pause', 'game_api_resume'].includes(action.event)) fail('WEB_PLAYTEST_CONTRACT', `steps[${index}] platform event is invalid`);
    exact(step.expect, ['state', 'changed'], `steps[${index}].expect`);
    if (!SAFE_ID.test(String(step.expect.state || '')) || typeof step.expect.changed !== 'boolean') fail('WEB_PLAYTEST_CONTRACT', `steps[${index}] expectation is invalid`);
    if (step.expect.changed && action.kind !== 'platform-event') changedPlayerActions += 1;
    if (!step.expect.changed && action.kind !== 'platform-event') unchangedPlayerActions += 1;
    if (action.kind !== 'platform-event') playerActions += 1;
    return { id: step.id, action, expect: step.expect };
  });
  if (changedPlayerActions < 2 || unchangedPlayerActions < 1 || playerActions < 3) fail('WEB_PLAYTEST_CONTRACT', 'contract requires at least two changing real player actions and one negative no-change player action');
  exact(value.persistence, value.persistence?.mode === 'required' ? ['mode', 'expectState'] : ['mode'], 'persistence');
  if (!['none', 'required'].includes(value.persistence.mode) || (value.persistence.mode === 'required' && !SAFE_ID.test(String(value.persistence.expectState || '')))) fail('WEB_PLAYTEST_CONTRACT', 'persistence must explicitly be none or required with expectState');
  let tech = null;
  if (value.tech !== undefined) {
    exact(value.tech, ['required'], 'tech');
    if (!Array.isArray(value.tech.required) || !value.tech.required.length || value.tech.required.some(item => !TECH_FACTS.has(item)) || new Set(value.tech.required).size !== value.tech.required.length) fail('WEB_PLAYTEST_CONTRACT', 'tech.required is invalid');
    tech = { required: [...value.tech.required].sort() };
  }
  return { root, file, fileRelative: WEB_PLAYTEST_FILE, hash: sha256File(file), gameRoot, gameRootRelative: value.gameRoot.replaceAll('\\', '/'), adapter: value.adapter, initialState: value.initialState, steps, persistence: value.persistence, tech, value };
}

export function webPlaytestReceiptPayload({ reportPath, report }) {
  return { protocol: WEB_PLAYTEST_PROTOCOL, reportPath, gameRoot: report.gameRoot, contract: report.contract, sourceSnapshotSha256: report.sourceSnapshotSha256, initialState: report.initialState, steps: report.steps, persistence: report.persistence, runtime: report.runtime, status: report.status };
}

export function canonicalWebPlaytestPayload(value) { return canonicalJson(value); }
