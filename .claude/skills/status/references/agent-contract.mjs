#!/usr/bin/env node
/** Strict role and structured-result contracts for Forge subagents. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_FORGE_ROOT, SKILL_MODES, parseForgeFrontmatter } from './skill-contract.mjs';

export const AGENT_CONTRACT_VERSION = 1;
export const AGENT_KINDS = Object.freeze(['builder', 'reviewer', 'researcher']);
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values) { return [...new Set((Array.isArray(values) ? values : []).map(String).map(item => item.trim()).filter(Boolean))]; }
function safePath(value) {
  const text = String(value || '').trim().replaceAll('\\', '/');
  return Boolean(text) && !text.includes('\0') && !/^[A-Za-z]:/.test(text) && !text.startsWith('/')
    && !text.includes('//') && !text.split('/').some(part => !part || part === '..') && !/[<>|]/.test(text);
}
function checkKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) errors.push(`${label} has unknown field ${key}`);
}
function validatePaths(values, label, errors, max = 100) {
  if (!Array.isArray(values) || values.length > max || unique(values).length !== values.length) { errors.push(`${label} must be a unique array with at most ${max} entries`); return; }
  for (const item of values) if (!safePath(item)) errors.push(`${label} contains unsafe path ${String(item)}`);
}

export function validateAgentContractRegistry(registry, root = DEFAULT_FORGE_ROOT) {
  const errors = [];
  if (!object(registry)) return ['AgentContract registry must be an object'];
  checkKeys(registry, new Set(['schemaVersion', 'contracts']), 'AgentContract registry', errors);
  if (registry.schemaVersion !== AGENT_CONTRACT_VERSION) errors.push(`AgentContract schemaVersion must be ${AGENT_CONTRACT_VERSION}`);
  if (!Array.isArray(registry.contracts) || !registry.contracts.length) return [...errors, 'AgentContract registry must contain contracts'];
  const ids = new Set();
  for (const contract of registry.contracts) {
    if (!object(contract)) { errors.push('AgentContract entry must be an object'); continue; }
    checkKeys(contract, new Set(['id', 'source', 'kind', 'taskModes', 'scope', 'outputKind', 'completion']), `AgentContract ${contract.id || '?'}`, errors);
    if (!ID_RE.test(String(contract.id || '')) || ids.has(contract.id)) errors.push(`AgentContract id is invalid or duplicate: ${contract.id}`);
    ids.add(contract.id);
    if (!AGENT_KINDS.includes(contract.kind) || contract.outputKind !== contract.kind) errors.push(`AgentContract ${contract.id} kind/outputKind mismatch`);
    if (!Array.isArray(contract.taskModes) || !contract.taskModes.length || unique(contract.taskModes).length !== contract.taskModes.length
      || contract.taskModes.some(mode => !SKILL_MODES.includes(mode))) errors.push(`AgentContract ${contract.id} has invalid taskModes`);
    if (!object(contract.scope)) errors.push(`AgentContract ${contract.id} scope must be an object`);
    else {
      checkKeys(contract.scope, new Set(['read', 'write']), `AgentContract ${contract.id} scope`, errors);
      validatePaths(contract.scope.read, `AgentContract ${contract.id} scope.read`, errors);
      validatePaths(contract.scope.write, `AgentContract ${contract.id} scope.write`, errors);
    }
    if (!object(contract.completion)) errors.push(`AgentContract ${contract.id} completion must be an object`);
    else {
      checkKeys(contract.completion, new Set(['requiresRecordedWrite', 'requiresEvidence', 'requiresVerifierPlan']), `AgentContract ${contract.id} completion`, errors);
      for (const field of ['requiresRecordedWrite', 'requiresEvidence', 'requiresVerifierPlan']) if (typeof contract.completion[field] !== 'boolean') errors.push(`AgentContract ${contract.id} completion.${field} must be boolean`);
    }
    if (!safePath(contract.source) || !/^\.claude\/agents\/[a-z0-9-]+\.md$/.test(contract.source)) errors.push(`AgentContract ${contract.id} source is unsafe`);
    else {
      const source = path.join(root, contract.source);
      if (!existsSync(source)) errors.push(`AgentContract ${contract.id} source does not exist`);
      else {
        const fm = parseForgeFrontmatter(readFileSync(source, 'utf8'));
        if (fm.errors.length || fm.fields?.name !== contract.id || fm.fields?.contract !== contract.id) errors.push(`AgentContract ${contract.id} source frontmatter does not declare contract: ${contract.id}`);
        const tools = Array.isArray(fm.fields?.tools) ? fm.fields.tools : String(fm.fields?.tools || '').split(',').map(value => value.trim()).filter(Boolean);
        const writeScope = Array.isArray(contract.scope?.write) ? contract.scope.write : null;
        if (writeScope?.length === 0 && tools.some(tool => /^(?:Write|Edit|MultiEdit)$/i.test(tool))) errors.push(`read-only AgentContract ${contract.id} source exposes write tools`);
      }
    }
  }
  return errors;
}

export function loadAgentContracts(root = DEFAULT_FORGE_ROOT) {
  const forgeRoot = path.resolve(root);
  const file = path.join(forgeRoot, 'adapters', 'agent-contracts.json');
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  const errors = validateAgentContractRegistry(registry, forgeRoot);
  if (errors.length) throw new Error(`AgentContract registry rejected: ${errors.join('; ')}`);
  return { ...registry, file, byId: new Map(registry.contracts.map(contract => [contract.id, contract])) };
}

function boundedString(value, max = 2000) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function validateStringList(values, label, errors, max = 100, itemMax = 1000) {
  if (!Array.isArray(values) || values.length > max) { errors.push(`${label} must contain at most ${max} entries`); return; }
  for (const item of values) if (!boundedString(item, itemMax)) errors.push(`${label} contains an invalid string`);
}

export function validateAgentResult(result, contract) {
  const errors = [];
  if (!object(result)) return ['AgentResult must be an object'];
  if (!contract || !AGENT_KINDS.includes(contract.outputKind)) return ['AgentResult requires a valid AgentContract'];
  if (result.schemaVersion !== 1 || result.contractId !== contract.id || result.kind !== contract.outputKind) errors.push('AgentResult identity does not match its AgentContract');
  if (!boundedString(result.summary)) errors.push('AgentResult summary must contain 1..2000 characters');
  validatePaths(result.evidence, 'AgentResult evidence', errors);
  if (contract.outputKind === 'builder') {
    checkKeys(result, new Set(['schemaVersion', 'contractId', 'kind', 'status', 'summary', 'evidence', 'changedFiles', 'acceptanceCovered', 'verificationRequested']), 'BuilderResult', errors);
    if (!['implemented', 'blocked', 'needs_user'].includes(result.status)) errors.push('BuilderResult status is invalid');
    validatePaths(result.changedFiles, 'BuilderResult changedFiles', errors);
    validateStringList(result.acceptanceCovered, 'BuilderResult acceptanceCovered', errors, 100, 64);
    validateStringList(result.verificationRequested, 'BuilderResult verificationRequested', errors, 20, 120);
    if (result.status === 'implemented' && contract.completion.requiresRecordedWrite
      && Array.isArray(result.changedFiles) && result.changedFiles.length === 0) errors.push('Implemented BuilderResult requires changedFiles');
  } else if (contract.outputKind === 'reviewer') {
    checkKeys(result, new Set(['schemaVersion', 'contractId', 'kind', 'decision', 'summary', 'evidence', 'issues']), 'ReviewerResult', errors);
    if (!['approved', 'changes_requested', 'blocked'].includes(result.decision)) errors.push('ReviewerResult decision is invalid');
    if (!Array.isArray(result.issues) || result.issues.length > 100) errors.push('ReviewerResult issues must contain at most 100 entries');
    else for (const issue of result.issues) {
      if (!object(issue)) { errors.push('ReviewerResult issue must be an object'); continue; }
      checkKeys(issue, new Set(['severity', 'file', 'line', 'rule', 'problem', 'suggestedFix']), 'ReviewerResult issue', errors);
      if (!['critical', 'major', 'minor', 'info'].includes(issue.severity)) errors.push('ReviewerResult issue severity is invalid');
      if (issue.file !== null && !safePath(issue.file)) errors.push('ReviewerResult issue file is unsafe');
      if (issue.line !== null && (!Number.isInteger(issue.line) || issue.line < 1)) errors.push('ReviewerResult issue line is invalid');
      if (!boundedString(issue.rule, 120) || !boundedString(issue.problem, 1000)) errors.push('ReviewerResult issue rule/problem is invalid');
      if (issue.suggestedFix !== null && (typeof issue.suggestedFix !== 'string' || issue.suggestedFix.length > 1000)) errors.push('ReviewerResult suggestedFix is invalid');
    }
    if (result.decision === 'approved' && Array.isArray(result.issues)
      && result.issues.some(issue => object(issue) && ['critical', 'major'].includes(issue.severity))) errors.push('ReviewerResult cannot approve with critical/major issues');
  } else {
    checkKeys(result, new Set(['schemaVersion', 'contractId', 'kind', 'summary', 'evidence', 'facts', 'unknowns', 'sources', 'decisionsRequired']), 'ResearcherResult', errors);
    if (!Array.isArray(result.facts) || result.facts.length > 100) errors.push('ResearcherResult facts must contain at most 100 entries');
    else for (const fact of result.facts) if (!object(fact) || !boundedString(fact.statement, 1000) || !boundedString(fact.source, 2000)) errors.push('ResearcherResult fact requires a bounded statement and source');
    validateStringList(result.unknowns, 'ResearcherResult unknowns', errors);
    validateStringList(result.sources, 'ResearcherResult sources', errors, 100, 2000);
    validateStringList(result.decisionsRequired, 'ResearcherResult decisionsRequired', errors, 50);
  }
  if (contract.completion.requiresEvidence && Array.isArray(result.evidence) && result.evidence.length === 0) errors.push('AgentContract requires factual evidence');
  return errors;
}

export function agentContractInstruction(contract) {
  return `Machine contract: adapters/agent-contracts.json#${contract.id}. Return AgentResult v1 (${contract.outputKind}); requested checks are advisory only. Runtime completion requires recorded operations/evidence and never trusts this report to expand scope, select executable verifiers, or close a Task.`;
}
