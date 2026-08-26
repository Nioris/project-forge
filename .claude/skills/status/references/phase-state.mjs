#!/usr/bin/env node
/**
 * Project Forge phase-state writer (v4.68.16).
 * Stores machine-readable phase progression in wiki/phases/ without treating chat/wiki prose as authority.
 *
 * Usage from a managed project root:
 *   node .claude/skills/status/references/phase-state.mjs start 1
 *   node .claude/skills/status/references/phase-state.mjs block 1 "Awaiting KPI approval"
 *   node .claude/skills/status/references/phase-state.mjs complete 1 wiki/architecture/metrics.md wiki/design/brief.md
 *   node .claude/skills/status/references/phase-state.mjs start 5 --model gpt-5.6-sol --reasoning high
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhaseCompletion } from './phase-completion-gate.mjs';
import { atomicWriteJson, ensurePhaseTaskRun, makeRunResult, readTaskRun, recordTaskResult, RESUME_POLICIES } from './execution-contract.mjs';
import { enginePhaseSupport, readTrustedProjectEngine } from './project-engine.mjs';
import { readGitCheckpointLedger, runPhaseGitCheckpoint, sanitizeGitCheckpointMessage } from './project-git.mjs';

const PHASES = {
  1: 'Analyze', 2: 'Design', 3: 'Construct', 4: 'Visual', 5: 'Tech',
  6: 'Listing', 7: 'Test', 8: 'Release', 9: 'Live',
};

const [command, rawPhase, ...rawRest] = process.argv.slice(2);
const phase = Number(rawPhase);
if (!['start', 'answer', 'block', 'complete', 'reopen'].includes(command) || !Number.isInteger(phase) || !PHASES[phase]) {
  console.error('Usage: phase-state.mjs <start|answer|block|complete|reopen> <1..9> [reason|evidence paths...] [--owner user|agent|infrastructure --code CODE --decision-key KEY --resume-policy user_answer|agent_retry|environment_change|none --model X --reasoning X --route X --subagents N]');
  process.exit(2);
}

const knownOptions = new Set(['model', 'reasoning', 'service-tier', 'route', 'subagents', 'host', 'enforced', 'owner', 'code', 'decision-key', 'resume-policy']);
const options = {};
const rest = [];
for (let i = 0; i < rawRest.length; i++) {
  const token = rawRest[i];
  const eq = token.match(/^--([a-z-]+)=(.*)$/i);
  if (eq && knownOptions.has(eq[1])) {
    options[eq[1]] = eq[2];
    continue;
  }
  const flag = token.match(/^--([a-z-]+)$/i);
  if (flag && knownOptions.has(flag[1])) {
    const value = rawRest[i + 1];
    if (value == null || value.startsWith('--')) {
      console.error(`Missing value for ${token}`);
      process.exit(2);
    }
    options[flag[1]] = value;
    i++;
    continue;
  }
  rest.push(token);
}

const helperDir = path.dirname(fileURLToPath(import.meta.url));
let modelPolicy = null;
try { modelPolicy = JSON.parse(fs.readFileSync(path.join(helperDir, 'model-policy.json'), 'utf8')); } catch {}
const phasePolicy = modelPolicy?.phases?.[String(phase)] || null;
const requestedRoute = options.route || process.env.FORGE_MODEL_ROUTE || 'base';
const routePolicy = requestedRoute === 'base' ? null : phasePolicy?.routes?.[requestedRoute];
if (requestedRoute !== 'base' && !routePolicy) {
  console.error(`Unknown Phase ${phase} model route: ${requestedRoute}`);
  process.exit(2);
}
const recommended = routePolicy || phasePolicy?.base || {};
const cliModelSelection = ['model', 'reasoning', 'service-tier', 'route', 'enforced'].some(k => options[k] != null);
const envModelSelection = ['FORGE_MODEL', 'FORGE_REASONING_EFFORT', 'FORGE_SERVICE_TIER', 'FORGE_MODEL_ROUTE'].some(k => process.env[k]);
const hostSelection = options.host != null || Boolean(process.env.FORGE_AI_HOST);
const declaredSelection = cliModelSelection || envModelSelection;
const selectedModel = declaredSelection ? (options.model || process.env.FORGE_MODEL || recommended.model || null) : null;
const selectedReasoning = declaredSelection ? (options.reasoning || process.env.FORGE_REASONING_EFFORT || recommended.reasoning || null) : null;
const selectedTier = declaredSelection ? (options['service-tier'] || process.env.FORGE_SERVICE_TIER || modelPolicy?.serviceTier || 'default') : null;
const enforced = /^(1|true|yes)$/i.test(options.enforced || process.env.FORGE_MODEL_ENFORCED || '');
const subagentLimit = Math.min(
  Number(modelPolicy?.limits?.maxPhaseSubagents ?? 0),
  Number(phasePolicy?.maxSubagents ?? modelPolicy?.limits?.maxPhaseSubagents ?? 0),
);

const root = process.cwd();
if (phase > 1) {
  const checkpointState = readGitCheckpointLedger(root);
  let blockedCheckpoint = null;
  for (let priorPhase = 1; priorPhase < phase; priorPhase++) {
    let priorMarker = null;
    try {
      priorMarker = JSON.parse(fs.readFileSync(path.join(root, 'wiki', 'phases', `phase-${priorPhase}.json`), 'utf8'));
    } catch {}
    const priorCompleted = priorMarker?.state === 'complete' || (priorPhase === 9 && priorMarker?.state === 'ongoing');
    if (!priorCompleted) continue;
    const checkpoint = checkpointState.valid ? checkpointState.ledger.phases[String(priorPhase)] : null;
    if (['pending', 'failed'].includes(checkpoint?.status)
      || (priorPhase >= 8 && (!checkpointState.valid || !checkpoint))) {
      blockedCheckpoint = { phase: priorPhase, checkpoint, ledgerError: checkpointState.error };
      break;
    }
  }
  if (blockedCheckpoint) {
    const detail = blockedCheckpoint.checkpoint?.message || blockedCheckpoint.ledgerError || blockedCheckpoint.checkpoint?.status || 'pending';
    console.error(`[BLOCKED] Phase ${phase} cannot start before Phase ${blockedCheckpoint.phase} Git checkpoint reconciliation succeeds: ${detail}`);
    process.exit(2);
  }
}
let engineProfile;
try {
  engineProfile = readTrustedProjectEngine(root);
} catch (error) {
  console.error(`[BLOCKED] Engine profile rejected (${error.code || 'ENGINE_PROFILE'}): ${error.message}`);
  process.exit(2);
}
const outDir = path.join(root, 'wiki', 'phases');
const outPath = path.join(outDir, `phase-${phase}.json`);
let prev = {};
try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
const rawSubagentsUsed = Number(options.subagents ?? process.env.FORGE_SUBAGENTS_USED ?? prev.modelRuntime?.subagents?.used ?? 0);
const subagentsUsed = Number.isFinite(rawSubagentsUsed) && rawSubagentsUsed >= 0 ? Math.floor(rawSubagentsUsed) : 0;
const now = new Date().toISOString();
const runAttemptId = String(process.env.FORGE_RUN_ATTEMPT_ID || '').trim() || null;
let forgeVersion = null;
try { forgeVersion = JSON.parse(fs.readFileSync(path.join(root, '.forge-managed.json'), 'utf8')).forgeVersion || null; } catch {}

const record = {
  schemaVersion: 3,
  phase,
  name: PHASES[phase],
  state: prev.state || 'pending',
  startedAt: prev.startedAt || null,
  updatedAt: now,
  completedAt: prev.completedAt || null,
  reason: prev.reason || null,
  block: prev.block && typeof prev.block === 'object' ? prev.block : null,
  evidence: Array.isArray(prev.evidence) ? prev.evidence : [],
  execution: prev.execution && typeof prev.execution === 'object'
    ? { ...prev.execution, attemptId: runAttemptId, resultStatus: null, resultCode: null, resultAt: null }
    : (runAttemptId ? { taskId: null, workflow: 'phase', currentNode: null, status: 'running', attemptId: runAttemptId, resultStatus: null, resultCode: null, resultAt: null } : null),
  forgeVersion,
  engineRuntime: {
    schemaVersion: engineProfile.schemaVersion,
    engine: engineProfile.engine,
    source: engineProfile.source,
    defaulted: engineProfile.defaulted,
    status: engineProfile.status,
    implementation: engineProfile.implementation,
    capture: engineProfile.capture,
    webExport: engineProfile.webExport,
    capabilities: engineProfile.capabilities,
  },
  modelRuntime: {
    policyVersion: modelPolicy?.policyVersion || null,
    mode: modelPolicy?.mode || null,
    recommendedCodex: {
      model: recommended.model || null,
      reasoning: recommended.reasoning || null,
      serviceTier: modelPolicy?.serviceTier || 'default',
      route: requestedRoute,
      routeKind: routePolicy?.kind || 'base',
    },
    selection: {
      host: options.host || process.env.FORGE_AI_HOST || prev.modelRuntime?.selection?.host || 'unknown',
      model: selectedModel || prev.modelRuntime?.selection?.model || null,
      reasoning: selectedReasoning || prev.modelRuntime?.selection?.reasoning || null,
      serviceTier: selectedTier || prev.modelRuntime?.selection?.serviceTier || null,
      route: declaredSelection ? requestedRoute : (prev.modelRuntime?.selection?.route || null),
      routeKind: declaredSelection ? (routePolicy?.kind || 'base') : (prev.modelRuntime?.selection?.routeKind || null),
      source: cliModelSelection ? 'cli-declared' : envModelSelection ? 'launcher-env' : hostSelection ? 'host-declared' : prev.modelRuntime?.selection?.source || 'unreported',
      enforced: declaredSelection ? enforced : Boolean(prev.modelRuntime?.selection?.enforced),
    },
    subagents: {
      limit: Number.isFinite(subagentLimit) ? subagentLimit : 0,
      used: subagentsUsed,
    },
  },
};

function linkedPhaseRun() {
  const taskId = prev.execution?.taskId || process.env.FORGE_TASK_ID || null;
  if (!taskId) return null;
  try {
    const run = readTaskRun(root, taskId);
    return run?.task?.mode === 'phase' && Number(run.task.phase) === phase ? run : null;
  } catch (error) {
    console.error(`[BLOCKED] Phase ${phase} linked Task is unreadable: ${String(error.message || error).slice(0, 500)}`);
    process.exit(2);
  }
}

function terminalPhaseRun(run) {
  return run && ['completed', 'cancelled', 'blocked'].includes(run.task.status);
}

function terminalTransitionRejected(run) {
  console.error(`[BLOCKED] Phase ${phase} Task ${run.task.id} is terminal (${run.task.status}); use "phase-state.mjs reopen ${phase}" before changing it.`);
  process.exit(2);
}

function executionProjection(run, result = run.lastResult) {
  return {
    taskId: run.task.id,
    workflow: run.workflow.id,
    currentNode: run.state.currentNode,
    status: run.state.status,
    resultStatus: result?.status || null,
    resultCode: result?.code || null,
    resultAt: result?.createdAt || null,
    attemptId: result?.attemptId || null,
  };
}

const linkedRun = linkedPhaseRun();
if (command !== 'reopen' && command !== 'block' && terminalPhaseRun(linkedRun)) {
  terminalTransitionRejected(linkedRun);
}

if (command === 'start' || command === 'reopen' || command === 'answer') {
  console.log(`[Forge] Engine -> ${engineProfile.engine} (${engineProfile.status}, ${engineProfile.source})`);
}

function persistMarker() {
  atomicWriteJson(outPath, record);
}

function executionResult({ status, code, message, failure = null, stop = null, evidence = [], checks = [], forceNew = false }) {
  const initial = ensurePhaseTaskRun({
    projectRoot: root,
    phase,
    phaseName: PHASES[phase],
    taskId: prev.execution?.taskId || process.env.FORGE_TASK_ID || null,
    forceNew,
  });
  const result = makeRunResult({
    taskId: initial.task.id,
    node: initial.state.currentNode,
    attemptId: runAttemptId,
    status,
    code,
    message: String(message || '').slice(0, 2000),
    host: options.host || process.env.FORGE_AI_HOST || 'unknown',
    phase,
    evidence,
    checks,
    failure,
    stop,
  });
  const run = recordTaskResult({ projectRoot: root, taskId: initial.task.id, result });
  record.execution = executionProjection(run, result);
  return run;
}

const startEngineSupport = enginePhaseSupport(engineProfile, phase);
if ((command === 'start' || command === 'reopen' || command === 'answer') && !startEngineSupport.supported) {
  record.state = 'blocked';
  record.startedAt = record.startedAt || now;
  record.completedAt = null;
  record.reason = startEngineSupport.message;
  record.block = { owner: 'infrastructure', code: 'ENGINE_CAPABILITY_UNAVAILABLE', decisionKey: null, resumePolicy: 'environment_change' };
  persistMarker();
  executionResult({
    status: 'environment_failure',
    code: 'ENGINE_CAPABILITY_UNAVAILABLE',
    message: record.reason,
    failure: { type: 'ENVIRONMENT_ERROR', retryable: false, message: record.reason },
    stop: record.block,
    forceNew: command === 'reopen',
  });
  persistMarker();
  console.error(`[BLOCKED] ${record.reason}`);
  process.exit(1);
}

if (command === 'start' || command === 'reopen' || command === 'answer') {
  if (command === 'answer' && (prev.state !== 'blocked' || prev.block?.owner !== 'user')) {
    console.error(`Phase ${phase} has no user-owned STOP to answer.`);
    process.exit(2);
  }
  record.state = 'in_progress';
  record.startedAt = command === 'reopen' ? now : (record.startedAt || now);
  record.completedAt = command === 'reopen' ? null : record.completedAt;
  record.reason = null;
  record.block = null;
  persistMarker();
  executionResult({
    status: 'in_progress',
    code: command === 'reopen' ? 'PHASE_REOPENED' : command === 'answer' ? 'USER_DECISION_RECEIVED' : 'PHASE_STARTED',
    message: `Phase ${phase} ${PHASES[phase]} is in progress`,
    forceNew: command === 'reopen',
  });
} else if (command === 'block') {
  const owner = options.owner || 'user';
  if (!['user', 'agent', 'infrastructure'].includes(owner)) {
    console.error('--owner must be user, agent or infrastructure');
    process.exit(2);
  }
  const defaults = owner === 'user'
    ? { status: 'user_decision_required', code: 'USER_DECISION_REQUIRED', policy: 'user_answer', failure: 'USER_DECISION_REQUIRED', retryable: false }
    : owner === 'agent'
      ? { status: 'retryable_failure', code: 'AGENT_WORK_REQUIRED', policy: 'agent_retry', failure: 'VERIFIER_FAILURE', retryable: true }
      : { status: 'environment_failure', code: 'INFRASTRUCTURE_BLOCKED', policy: 'environment_change', failure: 'ENVIRONMENT_ERROR', retryable: false };
  const code = options.code || defaults.code;
  const resumePolicy = options['resume-policy'] || defaults.policy;
  if (!RESUME_POLICIES.includes(resumePolicy)) {
    console.error(`--resume-policy must be one of: ${RESUME_POLICIES.join(', ')}`);
    process.exit(2);
  }
  const reason = rest.join(' ').trim() || (owner === 'user' ? 'Awaiting user decision' : owner === 'agent' ? 'Agent work is required' : 'Infrastructure capability is unavailable');
  const requestedStop = { owner, code, decisionKey: options['decision-key'] || null, resumePolicy };
  if (terminalPhaseRun(linkedRun)) {
    const previous = linkedRun.lastResult;
    const equivalent = linkedRun.task.status === 'blocked'
      && previous?.status === defaults.status
      && previous?.code === code
      && previous?.failure?.type === defaults.failure
      && previous?.failure?.retryable === defaults.retryable
      && previous?.stop?.owner === requestedStop.owner
      && previous?.stop?.code === requestedStop.code
      && (previous?.stop?.decisionKey ?? null) === requestedStop.decisionKey
      && previous?.stop?.resumePolicy === requestedStop.resumePolicy;
    if (equivalent) {
      console.log(`[OK] Phase ${phase} ${PHASES[phase]} already has the same durable terminal block; no state was changed.`);
      process.exit(0);
    }
    terminalTransitionRejected(linkedRun);
  }
  record.state = 'blocked';
  record.startedAt = record.startedAt || now;
  record.reason = reason;
  record.completedAt = null;
  record.block = requestedStop;
  persistMarker();
  executionResult({
    status: defaults.status,
    code,
    message: reason,
    failure: { type: defaults.failure, retryable: defaults.retryable, message: reason },
    stop: record.block,
  });
} else if (command === 'complete') {
  const gate = validatePhaseCompletion({ root, phase, evidence: rest });
  if (!gate.ok) {
    const engineCapabilityBlocked = gate.engine?.supported === false;
    const engineVerifierBlocked = gate.engineVerification?.status === 'environment_failure';
    const engineBlocked = engineCapabilityBlocked || engineVerifierBlocked;
    const engineBlockCode = engineCapabilityBlocked ? 'ENGINE_CAPABILITY_UNAVAILABLE' : 'ENGINE_VERIFIER_ENVIRONMENT';
    record.state = 'blocked';
    record.startedAt = record.startedAt || now;
    record.completedAt = null;
    record.reason = `Completion gate rejected: ${gate.failures.join('; ')}`;
    record.block = engineBlocked
      ? { owner: 'infrastructure', code: engineBlockCode, decisionKey: null, resumePolicy: 'environment_change' }
      : { owner: 'agent', code: 'COMPLETION_GATE_REJECTED', decisionKey: null, resumePolicy: 'agent_retry' };
    record.completionGate = { checkedAt: now, status: 'rejected', contract: gate.contract, engineVerification: gate.engineVerification || null, failures: gate.failures };
    persistMarker();
    executionResult({
      status: engineBlocked ? 'environment_failure' : 'retryable_failure',
      code: engineBlocked ? engineBlockCode : 'COMPLETION_GATE_REJECTED',
      message: record.reason,
      failure: engineBlocked
        ? { type: 'ENVIRONMENT_ERROR', retryable: false, message: record.reason.slice(0, 2000) }
        : { type: 'VERIFIER_FAILURE', retryable: true, message: record.reason.slice(0, 2000) },
      stop: record.block,
      evidence: gate.evidence || [],
    });
    persistMarker();
    console.error(`[BLOCKED] Phase ${phase} ${PHASES[phase]} completion rejected.`);
    for (const failure of gate.failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  record.state = phase === 9 ? 'ongoing' : 'complete';
  record.startedAt = record.startedAt || now;
  record.completedAt = now;
  record.reason = null;
  record.block = null;
  record.evidence = gate.evidence;
  record.completionGate = { checkedAt: now, status: 'passed', contract: gate.contract, engineVerification: gate.engineVerification || null, failures: [] };
  // Canonical phase state is authoritative; persist the passed gate before the supplemental graph result.
  persistMarker();
  executionResult({
    status: 'completed',
    code: 'PHASE_CONTRACT_PASSED',
    message: `Phase ${phase} ${PHASES[phase]} completion contract passed`,
    evidence: gate.evidence,
    checks: gate.contract?.projectChecks || [],
  });
}

persistMarker();
console.log(`[OK] Phase ${phase} ${PHASES[phase]} -> ${record.state}${record.reason ? ` (${record.reason})` : ''}`);

if (command === 'complete' && process.env.FORGE_HOST_OWNS_GIT_CHECKPOINT === '1') {
  console.log('[Forge Git] checkpoint delegated to the pipeline host');
} else if (command === 'complete') {
  try {
    const { result: git } = runPhaseGitCheckpoint({
      projectRoot: root, phase, phaseName: PHASES[phase], stage: 'complete',
    });
    if (git.skipped) console.log(`[Forge Git] skipped: ${git.reason}`);
    else {
      const parts = [git.commit ? `commit ${git.commit}` : 'working tree unchanged'];
      if (git.pushed) parts.push(`pushed private ${git.remote.fullName}`);
      if (git.remoteDeferred) parts.push('private remote deferred until Phase 8');
      if (git.warning) parts.push(`remote warning: ${git.warning}`);
      console.log(`[Forge Git] ${parts.join('; ')}`);
    }
  } catch (error) {
    console.error(`[Forge Git] phase checkpoint failed; phase advancement is blocked until retry: ${sanitizeGitCheckpointMessage(error.message)}`);
    process.exitCode = 2;
  }
}
