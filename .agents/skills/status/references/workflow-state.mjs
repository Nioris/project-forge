#!/usr/bin/env node
/** CLI for Project Forge durable Task and workflow graph state. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cancelTaskRun, formatTaskRun, listTaskRuns, makeRunResult, makeTask, readTaskRun,
  loadWorkflow, recordTaskResult, startTaskRun,
} from './execution-contract.mjs';
import { formatTaskVerification, runTaskVerifiers } from './verifier-runner.mjs';

function option(args, name) {
  const direct = args.find(value => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}
function options(args, name) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`--${name}=`)) out.push(args[i].slice(name.length + 3));
    else if (args[i] === `--${name}` && args[i + 1] != null) out.push(args[++i]);
  }
  return out;
}
function list(values) { return values.flatMap(value => String(value).split(',')).map(value => value.trim()).filter(Boolean); }
function bool(value, fallback = false) {
  if (value == null) return fallback;
  return /^(?:1|true|yes|y)$/i.test(String(value));
}

function defaultFailure(status, message, type = null, retryable = null) {
  if (!['retryable_failure', 'blocked', 'environment_failure', 'provider_failure'].includes(status)) return null;
  const inferred = type || ({
    retryable_failure: 'CODE_ERROR', blocked: 'REQUIREMENT_CONFLICT',
    environment_failure: 'ENVIRONMENT_ERROR', provider_failure: 'PROVIDER_ERROR',
  })[status];
  return { type: inferred, retryable: retryable ?? ['retryable_failure', 'provider_failure'].includes(status), message };
}

export function runWorkflowCli(args = process.argv.slice(2), {
  cwd = process.cwd(), stdout = console.log, setExitCode = code => { process.exitCode = code; },
  allowUntrustedRegistry = false,
} = {}) {
  const command = args[0] || 'help';
  const projectRoot = path.resolve(option(args, 'project') || cwd);
  const json = args.includes('--json');
  if (command === 'create') {
    const mode = option(args, 'mode');
    const goal = option(args, 'goal');
    if (!mode || !goal) throw new Error('Usage: workflow-state.mjs create --mode <phase|change|review|diagnose|release> --goal "..." [--phase N]');
    const acceptance = options(args, 'acceptance').map((text, index) => ({ id: `AC-${index + 1}`, text, status: 'pending' }));
    const declaredReads = options(args, 'read');
    const declaredWrites = options(args, 'write');
    const task = makeTask({
      id: option(args, 'id') || undefined,
      mode,
      phase: option(args, 'phase'),
      goal,
      skill: option(args, 'skill'),
      scope: declaredReads.length || declaredWrites.length
        ? { read: declaredReads.length ? list(declaredReads) : undefined, write: declaredWrites.length ? list(declaredWrites) : undefined }
        : undefined,
      acceptance,
      verifiers: list(options(args, 'verifier')),
      verificationTarget: option(args, 'verifier-target') || '.',
    });
    const run = startTaskRun({ projectRoot, task });
    stdout(json ? JSON.stringify(run, null, 2) : formatTaskRun(run));
    return run;
  }
  if (command === 'verify') {
    const taskId = option(args, 'task');
    if (!taskId) throw new Error('Usage: workflow-state.mjs verify --task ID [--registry PATH]');
    const registryPath = option(args, 'registry');
    if (registryPath && !allowUntrustedRegistry) {
      throw new Error('Explicit verifier registry is disabled outside the Forge test/developer harness.');
    }
    const outcome = runTaskVerifiers({
      projectRoot,
      taskId,
      registryPath,
      allowUntrustedRegistry,
    });
    stdout(json ? JSON.stringify(outcome, null, 2) : formatTaskVerification(outcome));
    setExitCode(outcome.exitCode);
    return outcome;
  }
  if (command === 'result') {
    const taskId = option(args, 'task');
    const status = option(args, 'status');
    const code = option(args, 'code');
    const message = option(args, 'message');
    if (!taskId || !status || !code || !message) throw new Error('Usage: workflow-state.mjs result --task ID --status STATUS --code CODE --message "..."');
    const current = readTaskRun(projectRoot, taskId);
    if (!current) throw new Error(`Task run not found: ${taskId}`);
    const failureType = option(args, 'failure-type');
    const result = makeRunResult({
      taskId,
      node: option(args, 'node') || current.state.currentNode,
      status,
      code,
      message,
      host: option(args, 'host') || 'generic',
      phase: current.task.phase,
      evidence: list(options(args, 'evidence')),
      checks: list(options(args, 'check')),
      failure: status === 'user_decision_required'
        ? { type: 'USER_DECISION_REQUIRED', retryable: false, message }
        : defaultFailure(status, message, failureType, option(args, 'retryable') == null ? null : bool(option(args, 'retryable'))),
      stop: status === 'user_decision_required' ? {
        owner: 'user', code, decisionKey: option(args, 'decision-key'), resumePolicy: 'user_answer',
      } : null,
    });
    let run = recordTaskResult({ projectRoot, taskId, result });
    const workflow = loadWorkflow(run.workflow.id);
    const nextNode = workflow.nodes[run.state.currentNode];
    if (nextNode?.type === 'verifier' && run.task.verifiers.length > 0) {
      const registryPath = option(args, 'registry');
      if (registryPath && !allowUntrustedRegistry) {
        throw new Error('Explicit verifier registry is disabled outside the Forge test/developer harness.');
      }
      const outcome = runTaskVerifiers({
        projectRoot,
        taskId,
        registryPath,
        allowUntrustedRegistry,
      });
      run = outcome.run;
      setExitCode(outcome.exitCode);
    }
    stdout(json ? JSON.stringify(run, null, 2) : formatTaskRun(run));
    return run;
  }
  if (command === 'status' || command === 'resume') {
    const taskId = option(args, 'task');
    const run = taskId ? readTaskRun(projectRoot, taskId) : listTaskRuns(projectRoot)[0] || null;
    if (!run) throw new Error('No durable Forge Task run found.');
    stdout(json ? JSON.stringify(run, null, 2) : formatTaskRun(run));
    return run;
  }
  if (command === 'cancel') {
    const taskId = option(args, 'task');
    if (!taskId) throw new Error('Usage: workflow-state.mjs cancel --task ID [--message "..."]');
    const run = cancelTaskRun(projectRoot, taskId, option(args, 'message') || 'Task cancelled by user');
    stdout(json ? JSON.stringify(run, null, 2) : formatTaskRun(run));
    return run;
  }
  stdout('Project Forge workflow runtime\n\nCommands:\n  create --mode MODE --goal "..." [--phase N] [--skill ID] [--verifier ID] [--verifier-target PATH]\n  result --task ID --status STATUS --code CODE --message "..."\n  verify --task ID [--json]\n  status [--task ID] [--json]\n  resume --task ID [--json]\n  cancel --task ID');
  return null;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  try { runWorkflowCli(); }
  catch (error) { console.error(`[X] ${error.message}`); process.exitCode = 1; }
}
