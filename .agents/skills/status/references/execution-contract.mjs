#!/usr/bin/env node
/** Host-neutral Task, RunResult and durable workflow graph runtime for Project Forge. */
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FORGE_ROOT, assertSkillTaskCompatibility, contractScopeAllows, readSkillContract,
  skillContractReference,
} from './skill-contract.mjs';

export const TASK_MODES = Object.freeze(['phase', 'change', 'review', 'diagnose', 'release']);
export const TASK_STATUSES = Object.freeze(['pending', 'running', 'waiting', 'blocked', 'completed', 'cancelled']);
export const RUN_RESULT_STATUSES = Object.freeze([
  'completed', 'in_progress', 'user_decision_required', 'retryable_failure', 'blocked',
  'environment_failure', 'provider_failure',
]);
export const FAILURE_TYPES = Object.freeze([
  'CODE_ERROR', 'VERIFIER_FAILURE', 'ENVIRONMENT_ERROR', 'PROVIDER_ERROR',
  'USER_DECISION_REQUIRED', 'MISSING_CREDENTIAL', 'EXTERNAL_SERVICE_DOWN',
  'FORGE_RUNTIME_BUG', 'REQUIREMENT_CONFLICT',
]);
export const STOP_OWNERS = Object.freeze(['user', 'agent', 'infrastructure']);
export const RESUME_POLICIES = Object.freeze(['user_answer', 'agent_retry', 'environment_change', 'none']);

const RESULT_SET = new Set(RUN_RESULT_STATUSES);
const WORKFLOW_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'workflows');
const TASK_ID_RE = /^[A-Za-z][A-Za-z0-9._-]{1,79}$/;
const NODE_ID_RE = /^[a-z][a-z0-9-]*$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{1,79}$/;
const ATTEMPT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const FAILURE_RESULTS = new Set(['retryable_failure', 'blocked', 'environment_failure', 'provider_failure']);
const RETRY_RESULTS = new Set(['retryable_failure', 'provider_failure']);

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function boundedString(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map(String).map(x => x.trim()).filter(Boolean))]; }

export function normalizeProjectPath(value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.includes('\0') || /^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) return null;
  const segments = normalized.split('/');
  if (segments.some(part => !part || part === '..')) return null;
  return normalized;
}

function checkKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) errors.push(`${label} has unknown field ${key}`);
}

function validatePathList(value, label, errors) {
  if (!Array.isArray(value) || value.length > 100) { errors.push(`${label} must be an array with at most 100 entries`); return; }
  for (const item of value) if (!normalizeProjectPath(item)) errors.push(`${label} contains unsafe project path: ${String(item)}`);
}

export function validateTask(task) {
  const errors = [];
  if (!isObject(task)) return ['Task must be an object'];
  checkKeys(task, new Set(['schemaVersion', 'id', 'mode', 'phase', 'goal', 'skill', 'contract', 'scope', 'acceptance', 'verifiers', 'verificationTarget', 'status', 'createdAt', 'updatedAt']), 'Task', errors);
  if (task.schemaVersion !== 1) errors.push('Task schemaVersion must be 1');
  if (!TASK_ID_RE.test(String(task.id || ''))) errors.push('Task id is invalid');
  if (!TASK_MODES.includes(task.mode)) errors.push(`Task mode is invalid: ${task.mode}`);
  if (task.phase !== null && (!Number.isInteger(task.phase) || task.phase < 1 || task.phase > 9)) errors.push('Task phase must be null or 1..9');
  if (!boundedString(task.goal, 2000)) errors.push('Task goal must contain 1..2000 characters');
  if (task.skill !== null && !/^[a-z0-9][a-z0-9-]*$/.test(String(task.skill || ''))) errors.push('Task skill is invalid');
  if (task.contract !== undefined && task.contract !== null) {
    if (!isObject(task.contract)) errors.push('Task contract must be null or an object');
    else {
      checkKeys(task.contract, new Set(['kind', 'id', 'version', 'hash']), 'Task contract', errors);
      if (task.contract.kind !== 'skill' || !/^[a-z0-9][a-z0-9-]*$/.test(String(task.contract.id || ''))
        || task.contract.version !== 1 || !/^[a-f0-9]{64}$/.test(String(task.contract.hash || ''))) errors.push('Task contract reference is invalid');
      if (task.skill !== task.contract.id) errors.push('Task skill must match its contract id');
    }
  }
  if (!isObject(task.scope)) errors.push('Task scope must be an object');
  else {
    checkKeys(task.scope, new Set(['read', 'write']), 'Task scope', errors);
    validatePathList(task.scope.read, 'Task scope.read', errors);
    validatePathList(task.scope.write, 'Task scope.write', errors);
  }
  if (!Array.isArray(task.acceptance) || task.acceptance.length > 100) errors.push('Task acceptance must be an array with at most 100 entries');
  else for (const item of task.acceptance) {
    if (!isObject(item)) { errors.push('Task acceptance item must be an object'); continue; }
    checkKeys(item, new Set(['id', 'text', 'status']), 'Task acceptance item', errors);
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(item.id || ''))) errors.push('Task acceptance id is invalid');
    if (!boundedString(item.text, 1000)) errors.push('Task acceptance text must contain 1..1000 characters');
    if (!['pending', 'satisfied'].includes(item.status)) errors.push(`Task acceptance status is invalid: ${item.status}`);
  }
  if (!Array.isArray(task.verifiers) || task.verifiers.length > 20
    || task.verifiers.some(item => !/^[a-z0-9][a-z0-9-]*$/.test(String(item)))) errors.push('Task verifiers must contain at most 20 safe verifier ids');
  if (task.verificationTarget !== undefined && !normalizeProjectPath(task.verificationTarget)) errors.push('Task verificationTarget must be a safe project-relative path');
  if (!TASK_STATUSES.includes(task.status)) errors.push(`Task status is invalid: ${task.status}`);
  if (!validDate(task.createdAt) || !validDate(task.updatedAt)) errors.push('Task timestamps must be ISO date-time strings');
  return errors;
}

export function validateRunResult(result) {
  const errors = [];
  if (!isObject(result)) return ['RunResult must be an object'];
  checkKeys(result, new Set(['schemaVersion', 'taskId', 'node', 'attemptId', 'status', 'code', 'message', 'host', 'phase', 'evidence', 'checks', 'failure', 'stop', 'verification', 'createdAt']), 'RunResult', errors);
  if (result.schemaVersion !== 1) errors.push('RunResult schemaVersion must be 1');
  if (!TASK_ID_RE.test(String(result.taskId || ''))) errors.push('RunResult taskId is invalid');
  if (!NODE_ID_RE.test(String(result.node || ''))) errors.push('RunResult node is invalid');
  if (result.attemptId !== null && !ATTEMPT_ID_RE.test(String(result.attemptId || ''))) errors.push('RunResult attemptId is invalid');
  if (!RUN_RESULT_STATUSES.includes(result.status)) errors.push(`RunResult status is invalid: ${result.status}`);
  if (!CODE_RE.test(String(result.code || ''))) errors.push('RunResult code is invalid');
  if (!boundedString(result.message, 2000)) errors.push('RunResult message must contain 1..2000 characters');
  if (!/^[a-z][a-z0-9-]*$/.test(String(result.host || ''))) errors.push('RunResult host is invalid');
  if (result.phase !== null && (!Number.isInteger(result.phase) || result.phase < 1 || result.phase > 9)) errors.push('RunResult phase must be null or 1..9');
  validatePathList(result.evidence, 'RunResult evidence', errors);
  if (!Array.isArray(result.checks) || result.checks.length > 100 || result.checks.some(item => typeof item !== 'string' || item.length > 500)) errors.push('RunResult checks must be bounded strings');
  if (result.failure !== null) {
    if (!isObject(result.failure)) errors.push('RunResult failure must be null or an object');
    else {
      checkKeys(result.failure, new Set(['type', 'retryable', 'message']), 'RunResult failure', errors);
      if (!FAILURE_TYPES.includes(result.failure.type)) errors.push(`RunResult failure type is invalid: ${result.failure.type}`);
      if (typeof result.failure.retryable !== 'boolean') errors.push('RunResult failure.retryable must be boolean');
      if (!boundedString(result.failure.message, 2000)) errors.push('RunResult failure.message must contain 1..2000 characters');
    }
  }
  if (result.stop !== null) {
    if (!isObject(result.stop)) errors.push('RunResult stop must be null or an object');
    else {
      checkKeys(result.stop, new Set(['owner', 'code', 'decisionKey', 'resumePolicy']), 'RunResult stop', errors);
      if (!STOP_OWNERS.includes(result.stop.owner)) errors.push(`RunResult stop owner is invalid: ${result.stop.owner}`);
      if (!CODE_RE.test(String(result.stop.code || ''))) errors.push('RunResult stop code is invalid');
      if (result.stop.decisionKey !== null && (typeof result.stop.decisionKey !== 'string' || result.stop.decisionKey.length > 160)) errors.push('RunResult stop decisionKey is invalid');
      if (!RESUME_POLICIES.includes(result.stop.resumePolicy)) errors.push(`RunResult resumePolicy is invalid: ${result.stop.resumePolicy}`);
    }
  }
  if (result.verification !== undefined && result.verification !== null) {
    const verification = result.verification;
    if (!isObject(verification)) errors.push('RunResult verification must be null or an object');
    else {
      checkKeys(verification, new Set(['status', 'startedAt', 'completedAt', 'items']), 'RunResult verification', errors);
      if (!['passed', 'failed', 'environment_failure', 'contract_error'].includes(verification.status)) errors.push('RunResult verification.status is invalid');
      if (!validDate(verification.startedAt) || !validDate(verification.completedAt)) errors.push('RunResult verification timestamps must be ISO date-time strings');
      if (!Array.isArray(verification.items) || verification.items.length > 20) errors.push('RunResult verification.items must contain at most 20 entries');
      else for (const item of verification.items) {
        if (!isObject(item)) { errors.push('RunResult verification item must be an object'); continue; }
        checkKeys(item, new Set(['id', 'status', 'exitCode', 'durationMs', 'timedOut', 'issues']), 'RunResult verification item', errors);
        if (!/^[a-z0-9][a-z0-9-]*$/.test(String(item.id || ''))) errors.push('RunResult verifier id is invalid');
        if (!['passed', 'failed', 'environment_failure'].includes(item.status)) errors.push('RunResult verifier status is invalid');
        if (item.exitCode !== null && (!Number.isInteger(item.exitCode) || item.exitCode < 0 || item.exitCode > 255)) errors.push('RunResult verifier exitCode is invalid');
        if (!Number.isInteger(item.durationMs) || item.durationMs < 0 || item.durationMs > 3_600_000) errors.push('RunResult verifier durationMs is invalid');
        if (typeof item.timedOut !== 'boolean') errors.push('RunResult verifier timedOut must be boolean');
        if (!Array.isArray(item.issues) || item.issues.length > 50) errors.push('RunResult verifier issues must contain at most 50 entries');
        else for (const issue of item.issues) {
          if (!isObject(issue)) { errors.push('RunResult verifier issue must be an object'); continue; }
          checkKeys(issue, new Set(['file', 'line', 'rule', 'message']), 'RunResult verifier issue', errors);
          if (issue.file !== null && !normalizeProjectPath(issue.file)) errors.push('RunResult verifier issue.file is invalid');
          if (issue.line !== null && (!Number.isInteger(issue.line) || issue.line < 1)) errors.push('RunResult verifier issue.line is invalid');
          if (issue.rule !== null && !/^[A-Za-z0-9._-]{1,120}$/.test(String(issue.rule || ''))) errors.push('RunResult verifier issue.rule is invalid');
          if (!boundedString(issue.message, 500)) errors.push('RunResult verifier issue.message must contain 1..500 characters');
        }
      }
    }
  }
  if (FAILURE_RESULTS.has(result.status) && !isObject(result.failure)) errors.push(`${result.status} requires failure metadata`);
  if (['completed', 'in_progress'].includes(result.status) && result.failure !== null) errors.push(`${result.status} cannot carry failure metadata`);
  if (result.status === 'user_decision_required') {
    if (result.stop?.owner !== 'user' || result.stop?.resumePolicy !== 'user_answer') errors.push('user_decision_required requires a user-owned stop with user_answer policy');
    if (result.failure?.type !== 'USER_DECISION_REQUIRED') errors.push('user_decision_required requires USER_DECISION_REQUIRED failure metadata');
  }
  if (!validDate(result.createdAt)) errors.push('RunResult createdAt must be an ISO date-time string');
  return errors;
}

export function validateWorkflow(workflow) {
  const errors = [];
  if (!isObject(workflow)) return ['Workflow must be an object'];
  checkKeys(workflow, new Set(['schemaVersion', 'id', 'mode', 'start', 'nodes']), 'Workflow', errors);
  if (workflow.schemaVersion !== 1) errors.push('Workflow schemaVersion must be 1');
  if (!NODE_ID_RE.test(String(workflow.id || ''))) errors.push('Workflow id is invalid');
  if (!TASK_MODES.includes(workflow.mode)) errors.push(`Workflow mode is invalid: ${workflow.mode}`);
  if (!isObject(workflow.nodes) || Object.keys(workflow.nodes).length < 2) errors.push('Workflow must define at least two nodes');
  const nodes = isObject(workflow.nodes) ? workflow.nodes : {};
  if (!nodes[workflow.start]) errors.push(`Workflow start node is missing: ${workflow.start}`);
  let terminalCount = 0;
  for (const [id, node] of Object.entries(nodes)) {
    if (!NODE_ID_RE.test(id) || !isObject(node)) { errors.push(`Workflow node is invalid: ${id}`); continue; }
    checkKeys(node, new Set(['type', 'maxAttempts', 'exhaustedTo', 'transitions']), `Workflow node ${id}`, errors);
    if (!['agent', 'verifier', 'decision', 'system', 'terminal'].includes(node.type)) errors.push(`Workflow node ${id} has invalid type`);
    if (node.maxAttempts !== undefined && (!Number.isInteger(node.maxAttempts) || node.maxAttempts < 1 || node.maxAttempts > 20)) errors.push(`Workflow node ${id} maxAttempts is invalid`);
    if (!isObject(node.transitions)) errors.push(`Workflow node ${id} transitions must be an object`);
    else for (const [status, target] of Object.entries(node.transitions)) {
      if (!RESULT_SET.has(status)) errors.push(`Workflow node ${id} uses unknown RunResult status ${status}`);
      if (!nodes[target]) errors.push(`Workflow node ${id} targets missing node ${target}`);
    }
    if (node.exhaustedTo !== undefined && !nodes[node.exhaustedTo]) errors.push(`Workflow node ${id} exhaustedTo target is missing`);
    if (node.type === 'terminal') {
      terminalCount++;
      if (Object.keys(node.transitions || {}).length) errors.push(`Terminal workflow node ${id} cannot have transitions`);
    }
  }
  if (!terminalCount) errors.push('Workflow must define a terminal node');
  return errors;
}

export function assertValid(value, validator, label) {
  const errors = validator(value);
  if (errors.length) throw new Error(`${label} contract rejected: ${errors.join('; ')}`);
  return value;
}

export function loadWorkflow(mode, workflowDir = WORKFLOW_DIR) {
  if (!TASK_MODES.includes(mode)) throw new Error(`Unknown Forge execution mode: ${mode}`);
  const file = path.join(workflowDir, `${mode}.json`);
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  assertValid(parsed, validateWorkflow, `Workflow ${mode}`);
  if (parsed.mode !== mode || parsed.id !== mode) throw new Error(`Workflow identity mismatch for ${mode}`);
  return parsed;
}

function runtimeDir(projectRoot) { return path.join(path.resolve(projectRoot), '.forge', 'runs'); }
export function taskRunPath(projectRoot, taskId) {
  if (!TASK_ID_RE.test(String(taskId || ''))) throw new Error('Unsafe Task id');
  return path.join(runtimeDir(projectRoot), `${taskId}.json`);
}

export function atomicWriteJson(file, value, { beforeRename = null } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    if (beforeRename) beforeRename(tmp, file);
    renameSync(tmp, file);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

function withTaskRunLock(file, action) {
  const lock = `${file}.lock`;
  mkdirSync(path.dirname(lock), { recursive: true });
  let handle;
  try {
    try {
      handle = openSync(lock, 'wx');
    } catch (error) {
      if (error?.code === 'EEXIST') {
        try {
          if (Date.now() - statSync(lock).mtimeMs > 30_000) {
            unlinkSync(lock);
            handle = openSync(lock, 'wx');
          }
        } catch {}
      }
      if (handle == null) {
        const conflict = new Error(`TASK_RUN_CONFLICT: ${path.basename(file, '.json')}`);
        conflict.code = 'TASK_RUN_CONFLICT';
        throw conflict;
      }
    }
    return action();
  } finally {
    if (handle != null) {
      try { closeSync(handle); } catch {}
      try { unlinkSync(lock); } catch {}
    }
  }
}

export function ensureRuntimeGitExclude(projectRoot) {
  const root = path.resolve(projectRoot);
  const dotGit = path.join(root, '.git');
  if (!existsSync(dotGit)) return false;
  try {
    let gitDir = dotGit;
    if (statSync(dotGit).isFile()) {
      const dotGitValue = readFileSync(dotGit, 'utf8').trim();
      const match = /^gitdir:\s*(.+)$/i.exec(dotGitValue);
      if (!match) return false;
      gitDir = path.resolve(root, match[1]);
      const commonDirFile = path.join(gitDir, 'commondir');
      if (existsSync(commonDirFile)) gitDir = path.resolve(gitDir, readFileSync(commonDirFile, 'utf8').trim());
    }
    const info = path.join(gitDir, 'info');
    mkdirSync(info, { recursive: true });
    const file = path.join(info, 'exclude');
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const needed = [
      '.forge/runs/', '.forge/git-checkpoints.json', '.forge/git-checkpoints.lock',
      '.forge/git-checkpoint-operation.lock', '.forge/*.tmp',
    ];
    const missing = needed.filter(line => !current.split(/\r?\n/).includes(line));
    if (!missing.length) return false;
    appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`, 'utf8');
    return true;
  } catch {
    // Runtime state still works when Git metadata is read-only; tracked projects also ship .gitignore.
    return false;
  }
}

function newTaskId(prefix = 'task') {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

export function makeTask(input = {}) {
  const now = input.now || new Date().toISOString();
  const skill = input.skill == null || input.skill === '' ? null : String(input.skill);
  const skillContract = skill ? readSkillContract(DEFAULT_FORGE_ROOT, skill) : null;
  const requestedVerifiers = uniqueStrings(input.verifiers);
  if (skillContract) assertSkillTaskCompatibility(skillContract, { mode: input.mode, phase: input.phase == null ? null : Number(input.phase), verifiers: requestedVerifiers });
  const requestedRead = input.scope?.read == null ? null : uniqueStrings(input.scope.read);
  const requestedWrite = input.scope?.write == null ? null : uniqueStrings(input.scope.write);
  if (skillContract && requestedRead && !contractScopeAllows(skillContract.scope.read, requestedRead)) throw new Error(`Task read scope exceeds SkillContract ${skill}`);
  if (skillContract && requestedWrite && !contractScopeAllows(skillContract.scope.write, requestedWrite)) throw new Error(`Task write scope exceeds SkillContract ${skill}`);
  const task = {
    schemaVersion: 1,
    id: input.id || newTaskId(input.mode || 'task'),
    mode: input.mode,
    phase: input.phase == null ? null : Number(input.phase),
    goal: String(input.goal || '').trim(),
    skill,
    contract: skillContractReference(skillContract),
    scope: {
      read: (requestedRead || skillContract?.scope.read || ['**']).map(normalizeProjectPath),
      write: (requestedWrite || skillContract?.scope.write || []).map(normalizeProjectPath),
    },
    acceptance: (Array.isArray(input.acceptance) ? input.acceptance : []).map((item, index) => ({
      id: String(item?.id || `AC-${index + 1}`), text: String(item?.text || item || '').trim(), status: item?.status || 'pending',
    })),
    verifiers: requestedVerifiers,
    verificationTarget: normalizeProjectPath(input.verificationTarget == null ? '.' : input.verificationTarget),
    status: input.status || 'running',
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  return assertValid(task, validateTask, 'Task');
}

/** Revalidate live authority for every non-terminal Task carrying a SkillContract. */
export function assertBoundSkillContract(task) {
  if (!task?.contract || task.contract.kind !== 'skill' || ['completed', 'cancelled'].includes(task.status)) return null;
  const contract = readSkillContract(DEFAULT_FORGE_ROOT, task.contract.id, { requireDeclared: true });
  if (contract.hash !== task.contract.hash || contract.schemaVersion !== task.contract.version) {
    throw new Error(`Task SkillContract changed after Task creation: ${contract.id}`);
  }
  assertSkillTaskCompatibility(contract, { mode: task.mode, phase: task.phase, verifiers: task.verifiers });
  if (!contractScopeAllows(contract.scope.read, task.scope.read)) throw new Error(`Task read scope exceeds SkillContract ${contract.id}`);
  if (!contractScopeAllows(contract.scope.write, task.scope.write)) throw new Error(`Task write scope exceeds SkillContract ${contract.id}`);
  return contract;
}

export function startTaskRun({ projectRoot, task, workflowDir = WORKFLOW_DIR, reuse = false } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  assertValid(task, validateTask, 'Task');
  assertBoundSkillContract(task);
  const workflow = loadWorkflow(task.mode, workflowDir);
  const file = taskRunPath(root, task.id);
  if (existsSync(file)) {
    if (reuse) return readTaskRun(root, task.id);
    throw new Error(`Task run already exists: ${task.id}`);
  }
  const now = new Date().toISOString();
  const run = {
    schemaVersion: 1,
    task: { ...task, status: 'running', updatedAt: now },
    workflow: { id: workflow.id, mode: workflow.mode, schemaVersion: workflow.schemaVersion },
    state: { status: 'running', currentNode: workflow.start, completedNodes: [], attempts: {}, lastFailure: null, updatedAt: now },
    lastResult: null,
    events: [{ event: 'task_created', node: workflow.start, at: now }],
  };
  ensureRuntimeGitExclude(root);
  atomicWriteJson(file, run);
  return run;
}

export function readTaskRun(projectRoot, taskId) {
  const file = taskRunPath(projectRoot, taskId);
  if (!existsSync(file)) return null;
  const run = JSON.parse(readFileSync(file, 'utf8'));
  if (run?.schemaVersion !== 1 || !isObject(run.task) || !isObject(run.state) || !isObject(run.workflow)) throw new Error(`Invalid durable Task run: ${taskId}`);
  assertValid(run.task, validateTask, 'Persisted Task');
  assertBoundSkillContract(run.task);
  if (run.task.id !== taskId || run.workflow.id !== run.task.mode || run.workflow.mode !== run.task.mode
    || !NODE_ID_RE.test(String(run.state.currentNode || '')) || !TASK_STATUSES.includes(run.state.status)) {
    throw new Error(`Invalid durable Task run identity/state: ${taskId}`);
  }
  if (run.lastResult !== null) {
    assertValid(run.lastResult, validateRunResult, 'Persisted RunResult');
    if (run.lastResult.taskId !== taskId) throw new Error(`Persisted RunResult task mismatch: ${taskId}`);
  }
  return run;
}

export function listTaskRuns(projectRoot) {
  const dir = runtimeDir(projectRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.json')).map(name => {
    try { return readTaskRun(projectRoot, name.slice(0, -5)); } catch { return null; }
  }).filter(Boolean).sort((a, b) => Date.parse(b.state.updatedAt) - Date.parse(a.state.updatedAt));
}

function taskStatusForNode(nodeId, node) {
  if (node.type === 'terminal') return nodeId === 'done' ? 'completed' : nodeId === 'cancelled' ? 'cancelled' : 'blocked';
  if (node.type === 'decision') return 'waiting';
  return 'running';
}

export function makeRunResult(input = {}) {
  const result = {
    schemaVersion: 1,
    taskId: String(input.taskId || ''),
    node: String(input.node || ''),
    attemptId: input.attemptId ?? process.env.FORGE_RUN_ATTEMPT_ID ?? null,
    status: input.status,
    code: String(input.code || '').trim(),
    message: String(input.message || '').trim(),
    host: String(input.host || 'unknown').trim().toLowerCase(),
    phase: input.phase == null ? null : Number(input.phase),
    evidence: uniqueStrings(input.evidence).map(normalizeProjectPath),
    checks: uniqueStrings(input.checks),
    failure: input.failure == null ? null : {
      type: input.failure.type,
      retryable: Boolean(input.failure.retryable),
      message: String(input.failure.message || input.message || '').trim(),
    },
    stop: input.stop == null ? null : {
      owner: input.stop.owner,
      code: String(input.stop.code || input.code || '').trim(),
      decisionKey: input.stop.decisionKey == null ? null : String(input.stop.decisionKey),
      resumePolicy: input.stop.resumePolicy || 'none',
    },
    verification: input.verification == null ? null : input.verification,
    createdAt: input.createdAt || new Date().toISOString(),
  };
  return assertValid(result, validateRunResult, 'RunResult');
}

export function recordTaskResult({ projectRoot, taskId, result, workflowDir = WORKFLOW_DIR } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const file = taskRunPath(root, taskId);
  return withTaskRunLock(file, () => {
    const run = readTaskRun(root, taskId);
    if (!run) throw new Error(`Task run not found: ${taskId}`);
    const workflow = loadWorkflow(run.workflow.id, workflowDir);
    const current = run.state.currentNode;
    const node = workflow.nodes[current];
    if (!node || node.type === 'terminal') throw new Error(`Task ${taskId} is terminal at ${current}`);
    const normalized = makeRunResult({ ...result, taskId, node: result?.node || current, phase: result?.phase ?? run.task.phase });
    if (normalized.node !== current) throw new Error(`RunResult node ${normalized.node} does not match durable current node ${current}`);
    let target = node.transitions[normalized.status];
    if (!target) throw new Error(`Workflow ${workflow.id} has no ${normalized.status} transition from ${current}`);
    const attempts = { ...(run.state.attempts || {}) };
    let exhausted = false;
    if (RETRY_RESULTS.has(normalized.status) && workflow.nodes[target]?.maxAttempts) {
      attempts[target] = Number(attempts[target] || 0) + 1;
      if (attempts[target] > workflow.nodes[target].maxAttempts) {
        target = workflow.nodes[target].exhaustedTo || 'blocked';
        exhausted = true;
      }
    }
    const targetNode = workflow.nodes[target];
    const now = new Date().toISOString();
    const taskStatus = taskStatusForNode(target, targetNode);
    const completedNodes = [...new Set([...(run.state.completedNodes || []), ...(target !== current ? [current] : [])])];
    const event = {
      event: exhausted ? 'attempt_budget_exhausted' : 'run_result',
      node: current,
      result: normalized.status,
      next: target,
      code: normalized.code,
      at: now,
    };
    const updated = {
      ...run,
      task: {
        ...run.task,
        status: taskStatus,
        acceptance: taskStatus === 'completed'
          ? run.task.acceptance.map(item => ({ ...item, status: 'satisfied' }))
          : run.task.acceptance,
        updatedAt: now,
      },
      state: {
        ...run.state,
        status: taskStatus,
        currentNode: target,
        completedNodes,
        attempts,
        lastFailure: normalized.failure,
        updatedAt: now,
      },
      lastResult: normalized,
      events: [...(run.events || []), event].slice(-100),
    };
    atomicWriteJson(file, updated);
    return updated;
  });
}

/**
 * Attach a bounded, host-derived verifier plan while an agent still owns a Task.
 * The plan never comes from a model-authored run result: adapters derive it from
 * canonical commands they have already recorded in their own durable ledger.
 */
export function configureTaskVerifierPlan({ projectRoot, taskId, verifiers, verificationTarget = '.', workflowDir = WORKFLOW_DIR } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const file = taskRunPath(root, taskId);
  return withTaskRunLock(file, () => {
    const run = readTaskRun(root, taskId);
    if (!run) throw new Error(`Task run not found: ${taskId}`);
    const workflow = loadWorkflow(run.workflow.id, workflowDir);
    const node = workflow.nodes[run.state.currentNode];
    if (!node || node.type !== 'agent') {
      throw new Error(`Task verifier plan can only be configured at an agent node (current: ${run.state.currentNode})`);
    }
    const nextVerifiers = uniqueStrings(verifiers);
    if (!nextVerifiers.length) throw new Error('Task verifier plan must contain at least one verifier');
    if (run.task.contract?.kind === 'skill') {
      const contract = readSkillContract(DEFAULT_FORGE_ROOT, run.task.contract.id, { requireDeclared: true });
      if (contract.hash !== run.task.contract.hash || contract.schemaVersion !== run.task.contract.version) throw new Error(`Task SkillContract changed after Task creation: ${contract.id}`);
      assertSkillTaskCompatibility(contract, { mode: run.task.mode, phase: run.task.phase, verifiers: nextVerifiers });
    }
    const target = normalizeProjectPath(verificationTarget);
    if (!target) throw new Error('Task verificationTarget is unsafe');
    const now = new Date().toISOString();
    const task = assertValid({ ...run.task, verifiers: nextVerifiers, verificationTarget: target, updatedAt: now }, validateTask, 'Task verifier plan');
    const updated = {
      ...run,
      task,
      events: [...(run.events || []), { event: 'verifier_plan_configured', node: run.state.currentNode, verifiers: nextVerifiers, verificationTarget: target, at: now }].slice(-100),
    };
    atomicWriteJson(file, updated);
    return updated;
  });
}

/** Attach a trusted declared skill to an agent-owned Task without trusting model prose. */
export function configureTaskSkillContract({ projectRoot, taskId, skill, workflowDir = WORKFLOW_DIR } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const file = taskRunPath(root, taskId);
  return withTaskRunLock(file, () => {
    const run = readTaskRun(root, taskId);
    if (!run) throw new Error(`Task run not found: ${taskId}`);
    const workflow = loadWorkflow(run.workflow.id, workflowDir);
    const node = workflow.nodes[run.state.currentNode];
    if (!node || node.type !== 'agent') throw new Error(`Task skill contract can only be configured at an agent node (current: ${run.state.currentNode})`);
    const contract = readSkillContract(DEFAULT_FORGE_ROOT, skill, { requireDeclared: true });
    assertSkillTaskCompatibility(contract, { mode: run.task.mode, phase: run.task.phase, verifiers: [] });
    if (run.task.skill && run.task.skill !== contract.id) throw new Error(`Task is already bound to skill ${run.task.skill}`);
    const now = new Date().toISOString();
    const task = assertValid({
      ...run.task,
      skill: contract.id,
      contract: skillContractReference(contract),
      scope: { read: [...contract.scope.read], write: [...contract.scope.write] },
      updatedAt: now,
    }, validateTask, 'Task SkillContract');
    const updated = {
      ...run,
      task,
      events: [...(run.events || []), { event: 'skill_contract_configured', node: run.state.currentNode, skill: contract.id, contractHash: contract.hash, at: now }].slice(-100),
    };
    atomicWriteJson(file, updated);
    return updated;
  });
}

export function cancelTaskRun(projectRoot, taskId, message = 'Task cancelled by user') {
  const file = taskRunPath(projectRoot, taskId);
  return withTaskRunLock(file, () => {
    const run = readTaskRun(projectRoot, taskId);
    if (!run) throw new Error(`Task run not found: ${taskId}`);
    if (['completed', 'cancelled'].includes(run.task.status)) return run;
    const now = new Date().toISOString();
    const updated = {
      ...run,
      task: { ...run.task, status: 'cancelled', updatedAt: now },
      state: { ...run.state, status: 'cancelled', updatedAt: now },
      events: [...(run.events || []), { event: 'task_cancelled', node: run.state.currentNode, code: 'USER_CANCELLED', message: String(message).slice(0, 500), at: now }].slice(-100),
    };
    atomicWriteJson(file, updated);
    return updated;
  });
}

const PHASE_SKILLS = {
  1: 'phase-1-analyze', 2: 'phase-2-design', 3: 'phase-3-construct', 4: 'phase-4-visual',
  5: 'phase-5-tech', 6: 'phase-6-listing', 7: 'phase-7-test', 8: 'phase-8-release', 9: 'phase-9-live',
};

export function ensurePhaseTaskRun({ projectRoot, phase, phaseName, taskId = null, forceNew = false } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  if (taskId && !forceNew) {
    const existing = readTaskRun(root, taskId);
    if (existing && existing.task.mode === 'phase' && existing.task.phase === Number(phase)
      && !['completed', 'cancelled'].includes(existing.task.status)) return existing;
  }
  const id = newTaskId(`phase-${Number(phase)}`);
  const task = makeTask({
    id,
    mode: 'phase',
    phase: Number(phase),
    goal: `Complete canonical Phase ${Number(phase)} ${phaseName}`,
    skill: PHASE_SKILLS[Number(phase)] || null,
    acceptance: [{ id: `PHASE-${Number(phase)}-CONTRACT`, text: `Pass the executable Phase ${Number(phase)} completion contract`, status: 'pending' }],
    verifiers: [],
  });
  return startTaskRun({ projectRoot: root, task });
}

export function latestPhaseRunResult(projectRoot, marker, phase) {
  const taskId = marker?.execution?.taskId;
  if (!taskId || Number(marker?.phase) !== Number(phase)) return null;
  try {
    const run = readTaskRun(projectRoot, taskId);
    if (!run || run.task.mode !== 'phase' || run.task.phase !== Number(phase) || !run.lastResult) return null;
    assertValid(run.lastResult, validateRunResult, 'Latest phase RunResult');
    return { taskId, run, result: run.lastResult };
  } catch { return null; }
}

export function formatTaskRun(run) {
  if (!run) return '[Forge] Task run not found.';
  const result = run.lastResult;
  return [
    `[Forge] Task ${run.task.id}: ${run.task.status}`,
    `Mode: ${run.task.mode}${run.task.phase ? ` | Phase ${run.task.phase}` : ''}`,
    `Node: ${run.state.currentNode} | Workflow: ${run.workflow.id}`,
    `Goal: ${run.task.goal}`,
    `Contract: ${run.task.contract ? `${run.task.contract.id}@${run.task.contract.hash.slice(0, 12)}` : 'legacy/manual'}`,
    `Verifier plan: ${run.task.verifiers.length ? run.task.verifiers.join(', ') : 'none'} | Target: ${run.task.verificationTarget || '.'}`,
    result ? `Last result: ${result.status} (${result.code})` : 'Last result: none',
    result?.verification ? `Verification: ${result.verification.status} (${result.verification.items.length} check(s))` : null,
  ].filter(Boolean).join('\n');
}
