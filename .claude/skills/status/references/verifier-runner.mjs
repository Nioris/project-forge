#!/usr/bin/env node
/** Registry-backed deterministic verifier runner for durable Forge Tasks. */
import {
  closeSync, existsSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadWorkflow, makeRunResult, normalizeProjectPath, readTaskRun, recordTaskResult, taskRunPath,
} from './execution-contract.mjs';
import { assertSkillTaskCompatibility, readSkillContract } from './skill-contract.mjs';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MAX_TASK_VERIFIERS = 20;
const MAX_ISSUES = 50;
const VERIFY_LOCK_TTL_MS = 2 * 60 * 60 * 1000;
const ANSI_RE = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;

function safeText(value, limit = 500) {
  return String(value ?? '').replace(ANSI_RE, '').replaceAll('\0', '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isCanonicalEngineRoot(root) {
  return existsSync(path.join(root, '.claude-plugin', 'plugin.json'))
    && existsSync(path.join(root, 'mcp-server', 'verifiers.json'));
}

function registryCandidates(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  const candidates = [];
  if (process.env.FORGE_ENGINE_ROOT) candidates.push(path.join(path.resolve(process.env.FORGE_ENGINE_ROOT), 'mcp-server', 'verifiers.json'));
  // A project being verified is untrusted input. Do not execute a registry it
  // happens to contain: only the installed Forge engine may define scripts.
  candidates.push(path.join(MODULE_ROOT, 'mcp-server', 'verifiers.json'));
  candidates.push(path.join(path.dirname(root), 'project-forge', 'mcp-server', 'verifiers.json'));
  return [...new Set(candidates)].filter(candidate => isCanonicalEngineRoot(path.resolve(path.dirname(candidate), '..')));
}

export function resolveVerifierRegistry(projectRoot, explicitPath = null, { allowUntrustedRegistry = false } = {}) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!allowUntrustedRegistry) {
      const engineRoot = path.resolve(path.dirname(resolved), '..');
      if (!isCanonicalEngineRoot(engineRoot)) {
        throw new Error('Explicit verifier registry is not trusted. Use the installed Forge engine registry.');
      }
    }
    if (!existsSync(resolved)) throw new Error(`Explicit verifier registry is unavailable: ${resolved}`);
    return resolved;
  }
  const found = registryCandidates(projectRoot).find(candidate => existsSync(candidate));
  if (!found) throw new Error('Forge verifier registry is unavailable. Set FORGE_ENGINE_ROOT or install the sibling project-forge engine.');
  return found;
}

function validateTaskRunnerMetadata(entry) {
  if (entry.taskRunner == null) return;
  const value = entry.taskRunner;
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || keys.some(key => !['cwd', 'target', 'json'].includes(key))
    || !['engine-root', 'project-root'].includes(value.cwd)
    || !['verification-target', 'project-root', 'none'].includes(value.target)
    || typeof value.json !== 'boolean') {
    throw new Error(`Verifier registry taskRunner metadata is invalid for ${entry.id}`);
  }
}

export function loadTaskVerifierRegistry({ projectRoot, registryPath = null, allowUntrustedRegistry = false } = {}) {
  const file = resolveVerifierRegistry(projectRoot, registryPath, { allowUntrustedRegistry });
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Verifier registry is invalid: ${error.message}`); }
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.verifiers)) throw new Error('Verifier registry schema is invalid');
  const engineRoot = realpathSync(path.resolve(path.dirname(file), '..'));
  const ids = new Set();
  const entries = parsed.verifiers.map(entry => {
    if (!entry || !/^[a-z0-9][a-z0-9-]*$/.test(String(entry.id || '')) || ids.has(entry.id)) {
      throw new Error(`Verifier registry has invalid/duplicate id: ${entry?.id}`);
    }
    ids.add(entry.id);
    if (!/^scripts\/check-[a-z0-9-]+\.mjs$/.test(String(entry.script || ''))
      || typeof entry.public !== 'boolean' || !['project', 'engine'].includes(entry.scope)
      || entry.mutates !== false || !Number.isInteger(entry.timeoutMs) || entry.timeoutMs < 1000 || entry.timeoutMs > 300_000
      || !Array.isArray(entry.phases) || entry.phases.some(phase => !Number.isInteger(phase) || phase < 1 || phase > 9)
      || typeof entry.category !== 'string' || !entry.category) {
      throw new Error(`Verifier registry metadata is invalid for ${entry.id}`);
    }
    validateTaskRunnerMetadata(entry);
    const declaredFilepath = path.resolve(engineRoot, entry.script);
    const filepath = existsSync(declaredFilepath) ? realpathSync(declaredFilepath) : declaredFilepath;
    if (!inside(engineRoot, filepath) || !existsSync(filepath) || !statSync(filepath).isFile()) {
      throw new Error(`Registered verifier script is missing or unsafe: ${entry.script}`);
    }
    return { ...entry, filepath };
  });
  return { file, engineRoot, entries, byId: new Map(entries.map(entry => [entry.id, entry])) };
}

/**
 * Derive an executable plan only from structured successful host operations.
 * Model prose, requested checks and raw shell commands are deliberately ignored.
 */
export function deriveVerifierPlanFromOperations({
  projectRoot, operations = [], allowedVerifiers = null, phase = null,
  registryPath = null, allowUntrustedRegistry = false,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const registry = loadTaskVerifierRegistry({ projectRoot: root, registryPath, allowUntrustedRegistry });
  const allowed = allowedVerifiers == null ? null : new Set(allowedVerifiers);
  const groups = new Map();
  let index = 0;
  for (const operation of Array.isArray(operations) ? operations : []) {
    index++;
    if (!operation || operation.tool !== 'forge_script' || Number(operation.exitCode ?? operation.status) !== 0) continue;
    let script = String(operation.script || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
    if (script && !script.includes('/')) script = `scripts/${script}`;
    const entry = registry.entries.find(candidate => candidate.script.toLowerCase() === script.toLowerCase());
    if (!entry?.taskRunner || entry.scope !== 'project' || entry.mutates !== false) continue;
    if (allowed && !allowed.has(entry.id)) continue;
    if (phase != null && entry.phases.length && !entry.phases.includes(Number(phase))) continue;
    const args = Array.isArray(operation.args) ? operation.args.map(String) : [];
    let target = '.';
    if (entry.taskRunner.target === 'verification-target') {
      const raw = args[0];
      if (!raw || raw.startsWith('-')) continue;
      target = normalizeProjectPath(raw);
      if (!target) continue;
    }
    const bucket = groups.get(target) || { target, ids: [], checks: [], provenance: [], lastIndex: index };
    if (!bucket.ids.includes(entry.id)) bucket.ids.push(entry.id);
    bucket.checks.push(`forge_script ${entry.script} ${args.join(' ')}`.trim());
    bucket.provenance.push({ verifier: entry.id, tool: 'forge_script', script: entry.script, args, at: operation.at || null });
    bucket.lastIndex = index;
    groups.set(target, bucket);
  }
  if (groups.size > 1) {
    throw new Error(`Structured verifier operations resolve to conflicting targets: ${[...groups.keys()].sort().join(', ')}`);
  }
  const selected = [...groups.values()][0];
  if (!selected?.ids.length) return null;
  return { verifiers: selected.ids, verificationTarget: selected.target, checks: selected.checks, provenance: selected.provenance };
}

function normalizeIssuePath(value, projectRoot) {
  if (value == null || value === '') return null;
  let candidate = String(value).trim().replaceAll('\\', '/');
  if (/^[A-Za-z]:\//.test(candidate) || candidate.startsWith('/')) {
    const absolute = path.resolve(candidate);
    if (!inside(projectRoot, absolute)) return null;
    candidate = path.relative(projectRoot, absolute).replaceAll('\\', '/');
  }
  return normalizeProjectPath(candidate) || null;
}

function issueFromValue(value, verifierId, projectRoot) {
  if (typeof value === 'string') {
    const message = safeText(value);
    return message ? { file: null, line: null, rule: verifierId, message } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const file = normalizeIssuePath(value.file ?? value.path ?? value.source ?? null, projectRoot);
  const rawLine = Number(value.line ?? value.lineNumber ?? value.row ?? 0);
  const line = Number.isInteger(rawLine) && rawLine > 0 ? rawLine : null;
  const rawRule = safeText(value.rule ?? value.code ?? verifierId, 120);
  const rule = /^[A-Za-z0-9._-]{1,120}$/.test(rawRule) ? rawRule : verifierId;
  const message = safeText(value.message ?? value.reason ?? value.error ?? value.literal ?? value.snippet ?? JSON.stringify(value));
  return message ? { file, line, rule, message } : null;
}

function jsonValuesFromStdout(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return [];
  const values = [];
  try { values.push(JSON.parse(text)); } catch {
    // Most Forge checks write a one-line JSON report. Preserve useful JSON when
    // a banner/progress line was written before or after that report.
    for (const line of text.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate || (!candidate.startsWith('{') && !candidate.startsWith('['))) continue;
      try { values.push(JSON.parse(candidate)); } catch {}
    }
  }
  return values;
}

function jsonIssues(stdout, verifierId, projectRoot) {
  const issueKeys = new Set(['issues', 'violations', 'errors', 'failures']);
  const nestedKeys = new Set([...issueKeys, 'reports', 'report', 'results', 'checks']);
  const candidates = [];
  const seen = new Set();
  const add = value => {
    if (candidates.length >= MAX_ISSUES) return;
    const issue = issueFromValue(value, verifierId, projectRoot);
    if (!issue) return;
    const signature = `${issue.file || ''}:${issue.line || ''}:${issue.rule}:${issue.message}`;
    if (!seen.has(signature)) { seen.add(signature); candidates.push(issue); }
  };
  const walk = (value, depth = 0, hint = '') => {
    if (depth > 10 || candidates.length >= MAX_ISSUES || value == null) return;
    if (typeof value === 'string') {
      if (issueKeys.has(hint) || hint === 'error') add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1, hint);
      return;
    }
    if (typeof value !== 'object') return;
    const keys = Object.keys(value);
    const issueLike = ['file', 'path', 'source', 'line', 'lineNumber', 'row', 'message', 'reason', 'literal', 'snippet']
      .some(key => Object.hasOwn(value, key));
    if (issueLike) add(value);
    for (const key of keys) {
      const child = value[key];
      const normalizedKey = key.toLowerCase();
      if (nestedKeys.has(normalizedKey) || (child && typeof child === 'object')) walk(child, depth + 1, normalizedKey);
      else if (issueKeys.has(normalizedKey) || normalizedKey === 'error') walk(child, depth + 1, normalizedKey);
    }
  };
  for (const value of jsonValuesFromStdout(stdout)) walk(value);
  return candidates;
}

function textIssues(stdout, stderr, verifierId, projectRoot) {
  const lines = `${stderr || ''}\n${stdout || ''}`.replace(ANSI_RE, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const preferred = lines.filter(line => /(?:\[X\]|✗|\berror\b|\bfail(?:ed|ure)?\b|\bviolation\b|\bmissing\b|\bnot found\b)/i.test(line));
  const selected = (preferred.length ? preferred : lines).slice(0, MAX_ISSUES);
  return selected.map(lineText => {
    const match = lineText.match(/^\s*(?:\[X\]|✗|-)?\s*(.+):(\d+)(?::\d+)?\s+(.*)$/);
    if (match) {
      return issueFromValue({ file: match[1], line: Number(match[2]), rule: verifierId, message: match[3] }, verifierId, projectRoot);
    }
    return issueFromValue(lineText, verifierId, projectRoot);
  }).filter(Boolean);
}

export function normalizeVerifierExecution({ entry, result, durationMs, projectRoot }) {
  const timedOut = result?.error?.code === 'ETIMEDOUT' || /timed out/i.test(String(result?.error?.message || ''));
  const exitCode = Number.isInteger(result?.status) ? result.status : null;
  const environmentFailure = timedOut || Boolean(result?.error) || exitCode === null || exitCode >= 2;
  const status = exitCode === 0 && !environmentFailure ? 'passed' : environmentFailure ? 'environment_failure' : 'failed';
  let issues = status === 'passed' ? [] : jsonIssues(result?.stdout, entry.id, projectRoot);
  if (!issues.length && status !== 'passed') issues = textIssues(result?.stdout, result?.stderr || result?.error?.message, entry.id, projectRoot);
  if (!issues.length && status !== 'passed') {
    issues = [{
      file: null, line: null, rule: entry.id,
      message: timedOut ? `Verifier timed out after ${entry.timeoutMs} ms` : `Verifier exited with code ${exitCode ?? 'unknown'}`,
    }];
  }
  return { id: entry.id, status, exitCode, durationMs: Math.max(0, Math.min(3_600_000, Math.round(durationMs))), timedOut, issues };
}

function verificationResult(run, report, { status, code, message, failure, stop = null }) {
  return makeRunResult({
    taskId: run.task.id,
    node: run.state.currentNode,
    attemptId: `verify-${randomUUID()}`,
    status,
    code,
    message,
    host: 'forge-runtime',
    phase: run.task.phase,
    evidence: [],
    checks: report.items.map(item => `${item.id}:${item.status}`),
    failure,
    stop,
    verification: report,
  });
}

function recordContractFailure(projectRoot, run, message, failureType = 'FORGE_RUNTIME_BUG', code = 'VERIFIER_PLAN_INVALID') {
  const now = new Date().toISOString();
  const report = { status: 'contract_error', startedAt: now, completedAt: now, items: [] };
  const result = verificationResult(run, report, {
    status: 'blocked', code, message,
    failure: { type: failureType, retryable: false, message },
    stop: { owner: 'infrastructure', code, decisionKey: null, resumePolicy: 'none' },
  });
  const updated = recordTaskResult({ projectRoot, taskId: run.task.id, result });
  return { run: updated, result: updated.lastResult, report, exitCode: 2 };
}

function recordEnvironmentFailure(projectRoot, run, message, report = null) {
  const now = new Date().toISOString();
  const normalizedReport = report || { status: 'environment_failure', startedAt: now, completedAt: now, items: [] };
  const result = verificationResult(run, normalizedReport, {
    status: 'environment_failure', code: 'VERIFIER_ENVIRONMENT_FAILURE', message,
    failure: { type: 'ENVIRONMENT_ERROR', retryable: false, message },
    stop: { owner: 'infrastructure', code: 'VERIFIER_ENVIRONMENT_FAILURE', decisionKey: null, resumePolicy: 'environment_change' },
  });
  const updated = recordTaskResult({ projectRoot, taskId: run.task.id, result });
  return { run: updated, result: updated.lastResult, report: normalizedReport, exitCode: 2 };
}

function resolveVerificationTarget(projectRoot, task) {
  const relative = normalizeProjectPath(task.verificationTarget ?? '.');
  if (!relative) throw new Error('Task verificationTarget is unsafe');
  const absolute = path.resolve(projectRoot, relative);
  if (!inside(projectRoot, absolute)) throw new Error('Task verificationTarget escapes the project');
  if (!existsSync(absolute)) throw new Error(`Task verificationTarget does not exist: ${relative}`);
  const canonicalRoot = realpathSync(projectRoot);
  const canonicalTarget = realpathSync(absolute);
  if (!inside(canonicalRoot, canonicalTarget)) throw new Error('Task verificationTarget resolves outside the project through a symbolic link');
  return canonicalTarget;
}

function acquireVerifierLock(projectRoot, taskId) {
  const lock = `${taskRunPath(projectRoot, taskId)}.verify.lock`;
  const token = randomUUID();
  const lockBody = JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() });
  let handle;
  try {
    handle = openSync(lock, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') {
      let isStale = false;
      try { isStale = Date.now() - statSync(lock).mtimeMs > VERIFY_LOCK_TTL_MS; } catch {}
      if (isStale) {
        // Node has no portable compare-and-swap rename for a path. Stealing a
        // stale lock would permit contender B to rename a new lock created by
        // contender A in the stat/rename gap. Stop safely instead: an operator
        // can inspect/remove an abandoned lock once no verifier is running.
        const stale = new Error(`Task verifier lock is stale: ${taskId}. Confirm no verifier is running, then remove ${lock}.`);
        stale.code = 'TASK_VERIFY_STALE_LOCK';
        throw stale;
      }
    }
    if (handle == null) {
      const conflict = new Error(`Task verifier is already running: ${taskId}`);
      conflict.code = 'TASK_VERIFY_CONFLICT';
      throw conflict;
    }
  }
  writeFileSync(handle, lockBody, 'utf8');
  closeSync(handle);
  return () => {
    try {
      const current = JSON.parse(readFileSync(lock, 'utf8'));
      if (current?.token === token) unlinkSync(lock);
    } catch {}
  };
}

export function runTaskVerifiers({ projectRoot, taskId, registryPath = null, allowUntrustedRegistry = false, spawn = spawnSync } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const releaseLock = acquireVerifierLock(root, taskId);
  try {
    const run = readTaskRun(root, taskId);
    if (!run) throw new Error(`Task run not found: ${taskId}`);
    const workflow = loadWorkflow(run.workflow.id);
    const node = workflow.nodes[run.state.currentNode];
    if (!node || node.type !== 'verifier') throw new Error(`Task ${taskId} is not at a verifier node (current: ${run.state.currentNode})`);

    let registry;
    try { registry = loadTaskVerifierRegistry({ projectRoot: root, registryPath, allowUntrustedRegistry }); }
    catch (error) { return recordEnvironmentFailure(root, run, error.message); }

    if (!run.task.verifiers.length) return recordContractFailure(root, run, 'Task has no registered verifier plan.', 'REQUIREMENT_CONFLICT', 'VERIFIER_PLAN_EMPTY');
    if (run.task.verifiers.length > MAX_TASK_VERIFIERS) return recordContractFailure(root, run, `Task verifier plan exceeds ${MAX_TASK_VERIFIERS} checks.`);
    if (run.task.contract?.kind === 'skill') {
      try {
        const contract = readSkillContract(MODULE_ROOT, run.task.contract.id, { requireDeclared: true });
        if (contract.hash !== run.task.contract.hash || contract.schemaVersion !== run.task.contract.version) {
          return recordContractFailure(root, run, `Task SkillContract changed after Task creation: ${contract.id}`);
        }
        assertSkillTaskCompatibility(contract, { mode: run.task.mode, phase: run.task.phase, verifiers: run.task.verifiers });
      } catch (error) {
        return recordContractFailure(root, run, error.message);
      }
    }

    const entries = [];
    for (const id of run.task.verifiers) {
      const entry = registry.byId.get(id);
      if (!entry) return recordContractFailure(root, run, `Task references unknown verifier: ${id}`);
      if (!entry.taskRunner) return recordContractFailure(root, run, `Verifier is not approved for Task execution: ${id}`);
      if (entry.scope !== 'project' || entry.mutates !== false) return recordContractFailure(root, run, `Verifier is not a read-only project check: ${id}`);
      if (run.task.phase !== null && entry.phases.length && !entry.phases.includes(run.task.phase)) {
        return recordContractFailure(root, run, `Verifier ${id} is not valid for Phase ${run.task.phase}.`, 'REQUIREMENT_CONFLICT', 'VERIFIER_PHASE_MISMATCH');
      }
      entries.push(entry);
    }

    let target;
    try { target = resolveVerificationTarget(root, run.task); }
    catch (error) { return recordEnvironmentFailure(root, run, error.message); }

    const startedAt = new Date().toISOString();
    const items = [];
    for (const entry of entries) {
      const args = [entry.filepath];
      if (entry.taskRunner.target === 'verification-target') args.push(target);
      else if (entry.taskRunner.target === 'project-root') args.push(root);
      if (entry.taskRunner.json) args.push('--json');
      const cwd = entry.taskRunner.cwd === 'project-root' ? root : registry.engineRoot;
      const started = Date.now();
      const result = spawn(process.execPath, args, {
        cwd,
        env: { ...process.env, FORGE_TASK_ID: run.task.id, FORGE_TASK_MODE: run.task.mode },
        encoding: 'utf8', timeout: entry.timeoutMs, maxBuffer: 512 * 1024, windowsHide: true,
      });
      items.push(normalizeVerifierExecution({ entry, result, durationMs: Date.now() - started, projectRoot: root }));
    }
    const completedAt = new Date().toISOString();
    const environmentItems = items.filter(item => item.status === 'environment_failure');
    const failedItems = items.filter(item => item.status === 'failed');
    const report = {
      status: environmentItems.length ? 'environment_failure' : failedItems.length ? 'failed' : 'passed',
      startedAt, completedAt, items,
    };
    if (environmentItems.length) {
      const message = `Verifier environment failure: ${environmentItems.map(item => item.id).join(', ')}`;
      return recordEnvironmentFailure(root, run, message, report);
    }
    if (failedItems.length) {
      const issueSummary = failedItems.flatMap(item => item.issues.slice(0, 3).map(issue => `${item.id}: ${issue.message}`)).join('; ').slice(0, 1800);
      const message = `Verifier failure: ${failedItems.map(item => item.id).join(', ')}${issueSummary ? `. ${issueSummary}` : ''}`;
      const result = verificationResult(run, report, {
        status: 'retryable_failure', code: 'VERIFIER_FAILED', message,
        failure: { type: 'VERIFIER_FAILURE', retryable: true, message },
        stop: { owner: 'agent', code: 'VERIFIER_FAILED', decisionKey: null, resumePolicy: 'agent_retry' },
      });
      const updated = recordTaskResult({ projectRoot: root, taskId: run.task.id, result });
      return { run: updated, result: updated.lastResult, report, exitCode: updated.state.currentNode === 'blocked' ? 2 : 1 };
    }
    const message = `All Task verifiers passed: ${items.map(item => item.id).join(', ')}`;
    const result = verificationResult(run, report, { status: 'completed', code: 'VERIFIERS_PASSED', message, failure: null });
    const updated = recordTaskResult({ projectRoot: root, taskId: run.task.id, result });
    return { run: updated, result: updated.lastResult, report, exitCode: 0 };
  } finally {
    releaseLock();
  }
}

export function formatTaskVerification(outcome) {
  const lines = [
    `Task ${outcome.run.task.id}: verification ${outcome.report.status}`,
    `Workflow node: ${outcome.run.state.currentNode} (${outcome.run.task.status})`,
  ];
  for (const item of outcome.report.items) {
    lines.push(`  ${item.status === 'passed' ? 'PASS' : item.status === 'failed' ? 'FAIL' : 'ENV'} ${item.id} (${item.durationMs} ms)`);
    for (const issue of item.issues.slice(0, 5)) {
      const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}: ` : '';
      lines.push(`    - ${location}${issue.message}`);
    }
  }
  return lines.join('\n');
}
