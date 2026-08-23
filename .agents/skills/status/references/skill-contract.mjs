#!/usr/bin/env node
/** Strict machine-readable contracts for canonical Project Forge skills. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTrustedForgeEngineRoot } from './forge-engine-root.mjs';

export const SKILL_CONTRACT_VERSION = 1;
export const SKILL_MODES = Object.freeze(['phase', 'change', 'review', 'diagnose', 'release']);
export const SHELL_RISKS = Object.freeze(['none', 'read', 'write', 'elevated']);
export const EXTERNAL_RISKS = Object.freeze(['none', 'read', 'write']);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_FORGE_ROOT = path.resolve(HERE, '../../../..');
export const DEFAULT_FORGE_ROOT = resolveTrustedForgeEngineRoot({
  projectRoot: process.cwd(),
  moduleRoot: MODULE_FORGE_ROOT,
});
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const REQUIREMENT_RE = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/;
const STOP_RE = /^[a-z][a-z0-9._-]*$/;
const BASE_FIELDS = new Set(['name', 'kind', 'description']);
const CONTRACT_FIELDS = new Set([
  'contract_version', 'phases', 'modes', 'requires', 'reads', 'writes', 'verifiers',
  'stop_points', 'risk_shell', 'risk_external', 'references', 'completion_contract',
]);

function unquote(value) {
  const text = String(value ?? '').trim();
  if (text.length >= 2 && ((text[0] === '"' && text.at(-1) === '"') || (text[0] === "'" && text.at(-1) === "'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function inlineList(value) {
  const text = String(value ?? '').trim();
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map(unquote).map(item => item.trim()).filter(Boolean);
}

/** Parse the intentionally flat YAML subset used by Forge contracts. */
export function parseForgeFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { fields: null, errors: ['missing YAML frontmatter'] };
  const fields = {};
  const errors = [];
  let listKey = null;
  for (const [index, raw] of match[1].split(/\r?\n/).entries()) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const item = raw.match(/^\s+-\s+(.+?)\s*$/);
    if (item && listKey) {
      fields[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (!kv) {
      errors.push(`unsupported frontmatter syntax at line ${index + 1}`);
      listKey = null;
      continue;
    }
    const [, key, rawValue] = kv;
    if (Object.hasOwn(fields, key)) errors.push(`duplicate frontmatter field ${key}`);
    const list = inlineList(rawValue);
    if (list) {
      fields[key] = list;
      listKey = null;
    } else if (rawValue === '') {
      fields[key] = [];
      listKey = key;
    } else {
      fields[key] = unquote(rawValue);
      listKey = null;
    }
  }
  return { fields, errors };
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean))];
}

function safeContractPath(value, { allowGlob = true } = {}) {
  const text = String(value || '').trim().replaceAll('\\', '/');
  if (!text || text.includes('\0') || /^[A-Za-z]:/.test(text) || text.startsWith('/') || text.includes('//')) return false;
  if (text.split('/').some(part => !part || part === '..')) return false;
  if (!allowGlob && /[*?{}[\]]/.test(text)) return false;
  return !/[<>|]/.test(text);
}

function loadVerifierMap(root) {
  const engineRoot = resolveTrustedForgeEngineRoot({ projectRoot: root, moduleRoot: MODULE_FORGE_ROOT });
  const file = path.join(engineRoot, 'mcp-server', 'verifiers.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.verifiers)) throw new Error('Verifier registry contract is invalid');
  return new Map(parsed.verifiers.map(entry => [entry.id, entry]));
}

function contractHash(contract) {
  const stable = {
    schemaVersion: contract.schemaVersion, id: contract.id, kind: contract.kind,
    phases: contract.phases, modes: contract.modes, requires: contract.requires,
    scope: contract.scope, verifiers: contract.verifiers, stopPoints: contract.stopPoints,
    risk: contract.risk, references: contract.references,
    completionContract: contract.completionContract, outputs: contract.outputs,
    projectChecks: contract.projectChecks,
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function asList(fields, key, errors, { required = true, max = 100 } = {}) {
  const value = fields[key];
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) { errors.push(`${key} must be a YAML list`); return []; }
  const normalized = unique(value);
  if (normalized.length !== value.length) errors.push(`${key} must not contain duplicates or empty values`);
  if (normalized.length > max) errors.push(`${key} may contain at most ${max} values`);
  return normalized;
}

function resolveCompletion(root, skillName, relativePath, phases, errors) {
  if (!relativePath) return { completionContract: null, outputs: [], projectChecks: [] };
  if (!safeContractPath(relativePath, { allowGlob: false })) {
    errors.push('completion_contract must be a safe project-relative JSON path');
    return { completionContract: null, outputs: [], projectChecks: [] };
  }
  // Completion contracts are canonical-skill-root relative so phase skills do not
  // need traversal (`../status/...`) in an authority-bearing path.
  const file = path.join(root, '.claude', 'skills', relativePath);
  if (!existsSync(file)) {
    errors.push(`completion_contract does not exist: ${relativePath}`);
    return { completionContract: relativePath, outputs: [], projectChecks: [] };
  }
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { errors.push(`completion_contract is invalid JSON: ${error.message}`); return { completionContract: relativePath, outputs: [], projectChecks: [] }; }
  if (parsed.schemaVersion !== 1 || !Number.isInteger(parsed.phase) || !Array.isArray(parsed.requiredEvidence) || !Array.isArray(parsed.projectChecks)) {
    errors.push('completion_contract is not a Forge phase contract');
  }
  if (phases.length !== 1 || parsed.phase !== phases[0]) errors.push('completion_contract phase must match the single declared skill phase');
  const outputs = (parsed.requiredEvidence || []).map(item => item?.path).filter(Boolean);
  if (outputs.some(item => !safeContractPath(item))) errors.push('completion_contract contains an unsafe evidence path');
  return { completionContract: relativePath, outputs, projectChecks: unique(parsed.projectChecks) };
}

export function inspectSkillContract(root, skillName) {
  const requestedRoot = path.resolve(root || DEFAULT_FORGE_ROOT);
  const forgeRoot = resolveTrustedForgeEngineRoot({ projectRoot: requestedRoot, moduleRoot: MODULE_FORGE_ROOT });
  const id = String(skillName || '').trim().toLowerCase();
  if (!ID_RE.test(id)) throw new Error(`Unsafe skill id: ${skillName}`);
  const source = path.join(forgeRoot, '.claude', 'skills', id, 'SKILL.md');
  if (!existsSync(source)) throw new Error(`Skill not found: ${id}`);
  const parsed = parseForgeFrontmatter(readFileSync(source, 'utf8'));
  const fields = parsed.fields || {};
  const base = {
    status: fields.contract_version === undefined ? 'legacy' : 'declared',
    id, name: String(fields.name || ''), kind: String(fields.kind || ''),
    description: String(fields.description || ''), source: `.claude/skills/${id}/SKILL.md`,
    errors: [...parsed.errors], contract: null,
  };
  if (fields.name !== id) base.errors.push(`frontmatter name must match directory (${id})`);
  if (!['architectural', 'tactical'].includes(fields.kind)) base.errors.push('kind must be architectural or tactical');
  if (fields.contract_version === undefined) return base;

  for (const key of Object.keys(fields)) if (!BASE_FIELDS.has(key) && !CONTRACT_FIELDS.has(key)) base.errors.push(`unknown contract field ${key}`);
  if (Number(fields.contract_version) !== SKILL_CONTRACT_VERSION) base.errors.push(`contract_version must be ${SKILL_CONTRACT_VERSION}`);
  const phases = asList(fields, 'phases', base.errors, { max: 9 }).map(Number);
  if (phases.some(phase => !Number.isInteger(phase) || phase < 1 || phase > 9)) base.errors.push('phases must contain only integers 1..9');
  const modes = asList(fields, 'modes', base.errors, { max: 5 });
  if (modes.some(mode => !SKILL_MODES.includes(mode))) base.errors.push(`modes must use ${SKILL_MODES.join(', ')}`);
  const requires = asList(fields, 'requires', base.errors, { required: false, max: 30 });
  if (requires.some(item => !REQUIREMENT_RE.test(item))) base.errors.push('requires entries must use namespace:value capability ids');
  const reads = asList(fields, 'reads', base.errors);
  const writes = asList(fields, 'writes', base.errors);
  if (reads.some(item => !safeContractPath(item)) || writes.some(item => !safeContractPath(item))) base.errors.push('reads/writes contain an unsafe project-relative path or glob');
  const verifiers = asList(fields, 'verifiers', base.errors, { max: 20 });
  if (verifiers.some(item => !ID_RE.test(item))) base.errors.push('verifiers contain an invalid id');
  const stopPoints = asList(fields, 'stop_points', base.errors, { max: 30 });
  if (stopPoints.some(item => !STOP_RE.test(item))) base.errors.push('stop_points contain an invalid decision id');
  const references = asList(fields, 'references', base.errors, { required: false, max: 50 });
  if (references.some(item => !safeContractPath(item, { allowGlob: false }) || !item.startsWith('references/'))) base.errors.push('references must be safe files below references/');
  if (!SHELL_RISKS.includes(fields.risk_shell)) base.errors.push(`risk_shell must use ${SHELL_RISKS.join(', ')}`);
  if (!EXTERNAL_RISKS.includes(fields.risk_external)) base.errors.push(`risk_external must use ${EXTERNAL_RISKS.join(', ')}`);

  let registry = new Map();
  try { registry = loadVerifierMap(forgeRoot); }
  catch (error) { base.errors.push(error.message); }
  for (const verifier of verifiers) {
    const entry = registry.get(verifier);
    if (!entry) { base.errors.push(`unknown verifier id ${verifier}`); continue; }
    if (!entry.taskRunner || entry.scope !== 'project' || entry.mutates !== false) base.errors.push(`verifier ${verifier} is not Task-runnable`);
    if (phases.length && entry.phases?.length && phases.some(phase => !entry.phases.includes(phase))) base.errors.push(`verifier ${verifier} is not valid for every declared phase`);
  }
  const completion = resolveCompletion(forgeRoot, id, fields.completion_contract || null, phases, base.errors);
  for (const reference of references) if (!existsSync(path.join(forgeRoot, '.claude', 'skills', id, reference))) base.errors.push(`reference does not exist: ${reference}`);
  const contract = {
    schemaVersion: SKILL_CONTRACT_VERSION, id, kind: fields.kind, description: fields.description,
    phases: [...new Set(phases)].sort((a, b) => a - b), modes: unique(modes), requires,
    scope: { read: reads, write: writes }, verifiers, stopPoints,
    risk: { shell: fields.risk_shell, external: fields.risk_external }, references,
    ...completion, source: base.source,
  };
  contract.hash = contractHash(contract);
  base.contract = contract;
  return base;
}

export function readSkillContract(root, skillName, { requireDeclared = false } = {}) {
  const inspected = inspectSkillContract(root, skillName);
  if (inspected.errors.length) throw new Error(`Skill contract ${inspected.id} rejected: ${inspected.errors.join('; ')}`);
  if (requireDeclared && inspected.status !== 'declared') throw new Error(`Skill ${inspected.id} has no executable contract`);
  return inspected.contract;
}

export function skillContractReference(contract) {
  if (!contract) return null;
  return { kind: 'skill', id: contract.id, version: contract.schemaVersion, hash: contract.hash };
}

export function assertSkillTaskCompatibility(contract, { mode, phase, verifiers = [] } = {}) {
  if (!contract) return true;
  if (!contract.modes.includes(mode)) throw new Error(`Skill ${contract.id} does not allow Task mode ${mode}`);
  if (contract.phases.length && (phase == null || !contract.phases.includes(Number(phase)))) {
    throw new Error(`Skill ${contract.id} does not allow Phase ${phase ?? 'none'}`);
  }
  const allowed = new Set(contract.verifiers);
  for (const verifier of unique(verifiers)) if (!allowed.has(verifier)) throw new Error(`Verifier ${verifier} is not declared by skill ${contract.id}`);
  return true;
}

export function contractScopeAllows(declaredPatterns, requestedPatterns) {
  const declared = unique(declaredPatterns);
  return unique(requestedPatterns).every(requested => declared.some(pattern => {
    if (pattern === '**' || pattern === requested) return true;
    if (!pattern.endsWith('/**')) return false;
    const prefix = pattern.slice(0, -3);
    return requested === prefix || requested.startsWith(`${prefix}/`);
  }));
}

export function formatSkillContract(contract) {
  if (!contract) return 'Legacy skill: manual invocation only; no automatic scope or verifier authority.';
  return [
    `SkillContract v${contract.schemaVersion}: ${contract.id}`,
    `Modes: ${contract.modes.join(', ')} | Phases: ${contract.phases.join(', ') || 'neutral'}`,
    `Reads: ${contract.scope.read.join(', ') || 'none'}`,
    `Writes: ${contract.scope.write.join(', ') || 'none'}`,
    `Verifiers: ${contract.verifiers.join(', ') || 'phase gate / host-owned'}`,
    `STOP points: ${contract.stopPoints.join(', ') || 'none'}`,
    `Outputs: ${contract.outputs.join(', ') || 'task-specific'}`,
    `Risk: shell=${contract.risk.shell}, external=${contract.risk.external}`,
    `Hash: ${contract.hash}`,
  ].join('\n');
}
