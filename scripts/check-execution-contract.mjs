#!/usr/bin/env node
/** Offline regression for Task, RunResult, failure taxonomy and durable workflow graphs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  FAILURE_TYPES, TASK_MODES, atomicWriteJson, configureTaskSkillContract, configureTaskVerifierPlan, ensurePhaseTaskRun, loadWorkflow, makeRunResult, makeTask,
  readTaskRun, recordTaskResult, startTaskRun, taskRunPath, validateRunResult, validateTask, validateWorkflow,
} from '../.claude/skills/status/references/execution-contract.mjs';

const ROOT = process.cwd();
const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) failures.push(message);
};
const throws = fn => { try { fn(); return false; } catch { return true; } };
const resultFor = (run, status, extra = {}) => makeRunResult({
  taskId: run.task.id,
  node: run.state.currentNode,
  status,
  code: extra.code || (status === 'completed' ? 'NODE_COMPLETED' : 'NODE_FAILED'),
  message: extra.message || `Fixture ${status}`,
  host: 'fixture',
  phase: run.task.phase,
  evidence: extra.evidence || [],
  checks: extra.checks || [],
  failure: extra.failure || null,
  stop: extra.stop || null,
});

console.log('Project Forge durable execution contract audit');
console.log('──────────────────────────────────────────────');

for (const file of ['task.schema.json', 'run-result.schema.json', 'workflow.schema.json']) {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', file), 'utf8'));
  check(schema.$schema?.includes('2020-12') && schema.additionalProperties === false, `${file} is a strict JSON Schema document`);
}

for (const mode of TASK_MODES) {
  const workflow = loadWorkflow(mode);
  check(workflow.mode === mode && validateWorkflow(workflow).length === 0, `${mode} workflow graph validates`);
}

const validTask = makeTask({
  id: 'task-contract-fixture', mode: 'change', phase: 4, goal: 'Implement a bounded fixture change',
  scope: { read: ['WorkProgress/**'], write: ['WorkProgress/demo/**'] },
  acceptance: [{ id: 'AC-1', text: 'Focused verification passes', status: 'pending' }],
  verifiers: ['fixture-check'],
});
check(validateTask(validTask).length === 0, 'Task contract accepts a bounded project-relative scope');
check(throws(() => makeTask({ ...validTask, id: 'unsafe-task', scope: { read: ['../outside'], write: [] } })), 'Task contract rejects traversal scope');
check(throws(() => makeTask({ ...validTask, id: 'drive-relative-task', scope: { read: ['C:outside'], write: [] } })), 'Task contract rejects drive-relative scope');
check(throws(() => makeTask({ ...validTask, id: 'unsafe-verification-target', verificationTarget: '../outside' })),
  'Task contract rejects an unsafe verification target');
check(validateRunResult({ ...resultFor({ task: validTask, state: { currentNode: 'implement' } }, 'completed'), status: 'invented' }).length > 0, 'RunResult rejects unknown statuses');
const validFailureResult = resultFor({ task: validTask, state: { currentNode: 'implement' } }, 'retryable_failure', {
  failure: { type: 'CODE_ERROR', retryable: true, message: 'bad' },
});
check(FAILURE_TYPES.length === 9 && validateRunResult({
  ...validFailureResult, failure: { ...validFailureResult.failure, type: 'NOT_A_FAILURE_TYPE' },
}).length > 0, 'RunResult rejects unknown FailureType');
check(validateRunResult({
  ...resultFor({ task: validTask, state: { currentNode: 'verify' } }, 'completed'),
  verification: { status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), items: [{
    id: 'fixture', status: 'passed', exitCode: 0, durationMs: 1, timedOut: false,
    issues: [{ file: '../outside', line: 1, rule: 'FIXTURE', message: 'unsafe' }],
  }] },
}).length > 0, 'RunResult rejects unsafe normalized verifier evidence');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-execution-contract-'));
try {
  fs.mkdirSync(path.join(tmp, '.git', 'info'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'wiki', 'phases'), { recursive: true });
  const markerPath = path.join(tmp, 'wiki', 'phases', 'phase-4.json');
  fs.writeFileSync(markerPath, JSON.stringify({ schemaVersion: 2, phase: 4, state: 'in_progress' }) + '\n');
  const markerBefore = fs.readFileSync(markerPath, 'utf8');
  check(throws(() => atomicWriteJson(markerPath, { schemaVersion: 3, phase: 4, state: 'blocked' }, {
    beforeRename() { throw new Error('fixture crash before rename'); },
  })) && fs.readFileSync(markerPath, 'utf8') === markerBefore
    && JSON.parse(fs.readFileSync(markerPath, 'utf8')).state === 'in_progress',
  'atomic marker failure preserves the previous canonical phase state');

  let run = startTaskRun({ projectRoot: tmp, task: validTask });
  check(run.state.currentNode === 'implement' && run.task.status === 'running', 'change Task starts at the declarative implement node');
  run = configureTaskVerifierPlan({ projectRoot: tmp, taskId: run.task.id, verifiers: ['fixture-check'], verificationTarget: '.' });
  check(run.task.verifiers[0] === 'fixture-check' && run.task.verificationTarget === '.'
    && run.events.at(-1).event === 'verifier_plan_configured', 'host can attach a bounded verifier plan before implementation completes');
  check(fs.readFileSync(markerPath, 'utf8') === markerBefore, 'creating a Task does not mutate canonical phase state');
  check(fs.readFileSync(path.join(tmp, '.git', 'info', 'exclude'), 'utf8').includes('.forge/runs/'), 'durable local runs are excluded from project Git');

  const lockPath = `${taskRunPath(tmp, run.task.id)}.lock`;
  fs.writeFileSync(lockPath, 'held');
  check(throws(() => recordTaskResult({ projectRoot: tmp, taskId: run.task.id, result: resultFor(run, 'completed') })),
    'a concurrent Task transition is rejected instead of silently overwriting state');
  fs.unlinkSync(lockPath);

  run = recordTaskResult({ projectRoot: tmp, taskId: run.task.id, result: resultFor(run, 'completed') });
  check(run.state.currentNode === 'verify', 'completed implementation advances to verifier node');
  check(throws(() => configureTaskVerifierPlan({ projectRoot: tmp, taskId: run.task.id, verifiers: ['fixture-check'] })),
    'verifier plan cannot be changed once the verifier node owns the Task');
  run = recordTaskResult({ projectRoot: tmp, taskId: run.task.id, result: resultFor(run, 'retryable_failure', {
    code: 'FIXTURE_VERIFIER_FAILED', failure: { type: 'VERIFIER_FAILURE', retryable: true, message: 'Fixture verifier failed' },
  }) });
  check(run.state.currentNode === 'repair' && run.state.attempts.repair === 1, 'verifier failure enters bounded repair');
  run = recordTaskResult({ projectRoot: tmp, taskId: run.task.id, result: resultFor(run, 'completed') });
  check(run.state.currentNode === 'verify', 'successful repair returns to verification');
  run = recordTaskResult({ projectRoot: tmp, taskId: run.task.id, result: resultFor(run, 'completed', { checks: ['fixture-check'] }) });
  check(run.state.currentNode === 'done' && run.task.status === 'completed'
    && run.task.acceptance.every(item => item.status === 'satisfied'), 'verified change reaches terminal done and satisfies acceptance');
  check(readTaskRun(tmp, validTask.id).state.currentNode === 'done', 'durable run resumes from the same node after a fresh read');

  let contracted = startTaskRun({ projectRoot: tmp, task: makeTask({
    id: 'task-skill-contract-fixture', mode: 'change', phase: 8, goal: 'Bind a trusted gacha skill contract',
    scope: { read: ['WorkProgress/**'], write: ['WorkProgress/**'] },
  }) });
  contracted = configureTaskSkillContract({ projectRoot: tmp, taskId: contracted.task.id, skill: 'gacha-meta' });
  check(contracted.task.contract?.id === 'gacha-meta' && contracted.task.scope.write.includes('assets/**')
    && contracted.events.at(-1).event === 'skill_contract_configured',
  'host can bind an exact declared SkillContract while an agent owns the Task');
  check(throws(() => configureTaskVerifierPlan({ projectRoot: tmp, taskId: contracted.task.id, verifiers: ['inline-strings'] })),
    'SkillContract blocks an undeclared verifier plan');
  contracted = configureTaskVerifierPlan({ projectRoot: tmp, taskId: contracted.task.id, verifiers: ['gacha-integration'], verificationTarget: 'WorkProgress/demo' });
  check(contracted.task.verifiers[0] === 'gacha-integration', 'SkillContract permits its exact registered verifier');
  const driftPath = taskRunPath(tmp, contracted.task.id);
  const drifted = JSON.parse(fs.readFileSync(driftPath, 'utf8'));
  drifted.task.contract.hash = '0'.repeat(64);
  fs.writeFileSync(driftPath, JSON.stringify(drifted));
  check(throws(() => readTaskRun(tmp, contracted.task.id))
    && throws(() => recordTaskResult({ projectRoot: tmp, taskId: contracted.task.id, result: resultFor(contracted, 'completed') })),
  'SkillContract hash drift blocks both durable reads and Task transitions');
  check(throws(() => makeTask({ mode: 'change', phase: 1, goal: 'Wrong phase', skill: 'gacha-meta' })),
    'Task creation rejects a declared skill outside its phase/mode contract');

  let decision = startTaskRun({ projectRoot: tmp, task: makeTask({
    id: 'task-decision-fixture', mode: 'change', phase: 4, goal: 'Wait for a real decision',
    scope: { read: ['WorkProgress/**'], write: ['WorkProgress/**'] },
  }) });
  decision = recordTaskResult({ projectRoot: tmp, taskId: decision.task.id, result: resultFor(decision, 'user_decision_required', {
    code: 'MONETIZATION_CHOICE',
    failure: { type: 'USER_DECISION_REQUIRED', retryable: false, message: 'Choose monetization' },
    stop: { owner: 'user', code: 'MONETIZATION_CHOICE', decisionKey: 'monetization', resumePolicy: 'user_answer' },
  }) });
  check(decision.state.currentNode === 'wait-user' && decision.task.status === 'waiting', 'structured user decision enters wait-user without text parsing');
  decision = recordTaskResult({ projectRoot: tmp, taskId: decision.task.id, result: resultFor(decision, 'in_progress', { code: 'USER_DECISION_RECEIVED' }) });
  check(decision.state.currentNode === 'implement' && decision.task.status === 'running', 'user answer resumes the durable graph deterministically');

  let exhausted = startTaskRun({ projectRoot: tmp, task: makeTask({
    id: 'task-retry-fixture', mode: 'change', phase: 3, goal: 'Exercise retry budget',
    scope: { read: ['WorkProgress/**'], write: ['WorkProgress/**'] },
  }) });
  exhausted = recordTaskResult({ projectRoot: tmp, taskId: exhausted.task.id, result: resultFor(exhausted, 'completed') });
  for (let attempt = 0; attempt < 4; attempt++) {
    exhausted = recordTaskResult({ projectRoot: tmp, taskId: exhausted.task.id, result: resultFor(exhausted, 'retryable_failure', {
      code: 'REPAIR_STILL_FAILING', failure: { type: 'CODE_ERROR', retryable: true, message: `Attempt ${attempt + 1}` },
    }) });
  }
  check(exhausted.state.currentNode === 'blocked' && exhausted.task.status === 'blocked'
    && exhausted.events.at(-1).event === 'attempt_budget_exhausted', 'repair loop stops mechanically after three attempts');
  let exhaustedPhase = ensurePhaseTaskRun({ projectRoot: tmp, phase: 3, phaseName: 'Construct' });
  for (let attempt = 0; attempt < 4; attempt++) {
    exhaustedPhase = recordTaskResult({ projectRoot: tmp, taskId: exhaustedPhase.task.id, result: resultFor(exhaustedPhase, 'retryable_failure', {
      code: 'PHASE_REPAIR_STILL_FAILING', failure: { type: 'VERIFIER_FAILURE', retryable: true, message: `Phase attempt ${attempt + 1}` },
    }) });
  }
  const exhaustedResume = ensurePhaseTaskRun({ projectRoot: tmp, phase: 3, phaseName: 'Construct', taskId: exhaustedPhase.task.id });
  check(exhaustedResume.task.id === exhaustedPhase.task.id && exhaustedResume.task.status === 'blocked',
    'terminal phase repair budget cannot silently reset without an explicit reopen action');

  const phaseRun = ensurePhaseTaskRun({ projectRoot: tmp, phase: 2, phaseName: 'Design' });
  check(phaseRun.workflow.id === 'phase' && phaseRun.task.phase === 2 && phaseRun.task.contract?.id === 'phase-2-design'
    && phaseRun.task.scope.write.length === 1 && phaseRun.task.scope.write[0] === 'wiki/**',
  'canonical phase execution derives scope and provenance from its SkillContract without replacing phase state');

  const corruptRun = startTaskRun({ projectRoot: tmp, task: makeTask({
    id: 'task-corrupt-result', mode: 'review', phase: null, goal: 'Reject corrupt persisted result',
    scope: { read: ['**'], write: [] },
  }) });
  const corruptPath = taskRunPath(tmp, corruptRun.task.id);
  fs.writeFileSync(corruptPath, JSON.stringify({ ...corruptRun, lastResult: { status: 'invented' } }));
  check(throws(() => readTaskRun(tmp, corruptRun.task.id)), 'corrupt persisted RunResult is rejected before an adapter can route on it');

  const worktree = path.join(tmp, 'linked-worktree');
  const commonGit = path.join(tmp, 'common-git');
  const linkedGit = path.join(commonGit, 'worktrees', 'linked-worktree');
  fs.mkdirSync(linkedGit, { recursive: true });
  fs.mkdirSync(path.join(commonGit, 'info'), { recursive: true });
  fs.mkdirSync(worktree, { recursive: true });
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${linkedGit}\n`);
  fs.writeFileSync(path.join(linkedGit, 'commondir'), '../..\n');
  const worktreeRun = startTaskRun({ projectRoot: worktree, task: makeTask({
    id: 'task-worktree-fixture', mode: 'review', phase: null, goal: 'Verify linked worktree runtime',
    scope: { read: ['**'], write: [] },
  }) });
  check(worktreeRun.state.currentNode === 'review'
    && fs.readFileSync(path.join(commonGit, 'info', 'exclude'), 'utf8').includes('.forge/runs/'),
  'linked Git worktrees persist Task state and resolve the shared exclude file');

  const phaseScript = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
  const phaseFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-phase-graph-'));
  try {
    fs.mkdirSync(path.join(phaseFixture, 'wiki', 'phases'), { recursive: true });
    const started = spawnSync(process.execPath, [phaseScript, 'start', '2', '--host', 'codex'], {
      cwd: phaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-attempt-start' },
    });
    let marker = JSON.parse(fs.readFileSync(path.join(phaseFixture, 'wiki', 'phases', 'phase-2.json'), 'utf8'));
    check(started.status === 0 && marker.schemaVersion === 3 && marker.execution?.resultStatus === 'in_progress'
      && marker.execution?.attemptId === 'fixture-attempt-start', 'phase start emits a correlated structured RunResult');
    const blocked = spawnSync(process.execPath, [phaseScript, 'block', '2', 'Approve GDD', '--host', 'codex', '--owner', 'user', '--code', 'GDD_APPROVAL', '--decision-key', 'phase2-gdd'], {
      cwd: phaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-attempt-block' },
    });
    marker = JSON.parse(fs.readFileSync(path.join(phaseFixture, 'wiki', 'phases', 'phase-2.json'), 'utf8'));
    check(blocked.status === 0 && marker.block?.owner === 'user' && marker.execution?.currentNode === 'wait-user', 'phase user STOP transitions to wait-user with an explicit owner');
    const resumed = spawnSync(process.execPath, [phaseScript, 'answer', '2', '--host', 'codex'], {
      cwd: phaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-attempt-answer' },
    });
    marker = JSON.parse(fs.readFileSync(path.join(phaseFixture, 'wiki', 'phases', 'phase-2.json'), 'utf8'));
    check(resumed.status === 0 && marker.execution?.currentNode === 'execute'
      && marker.execution?.resultCode === 'USER_DECISION_RECEIVED', 'phase answer resumes a waiting graph exactly once');
    const invalidPolicy = spawnSync(process.execPath, [phaseScript, 'block', '2', 'Invalid policy fixture', '--host', 'codex', '--owner', 'infrastructure', '--resume-policy', 'rerun'], {
      cwd: phaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-attempt-invalid-policy' },
    });
    const afterInvalidPolicy = JSON.parse(fs.readFileSync(path.join(phaseFixture, 'wiki', 'phases', 'phase-2.json'), 'utf8'));
    check(invalidPolicy.status === 2 && /user_answer, agent_retry, environment_change, none/.test(invalidPolicy.stderr)
      && !/at makeRunResult/u.test(invalidPolicy.stderr) && afterInvalidPolicy.state === 'in_progress'
      && afterInvalidPolicy.execution?.attemptId === 'fixture-attempt-answer',
    'phase-state rejects an unknown resume policy before mutating state or printing a stack');
    const rejected = spawnSync(process.execPath, [phaseScript, 'complete', '2', 'wiki/irrelevant.md', '--host', 'codex'], {
      cwd: phaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-attempt-reject' },
    });
    marker = JSON.parse(fs.readFileSync(path.join(phaseFixture, 'wiki', 'phases', 'phase-2.json'), 'utf8'));
    check(rejected.status === 1 && marker.block?.owner === 'agent' && marker.execution?.resultStatus === 'retryable_failure'
      && marker.execution?.currentNode === 'repair', 'completion rejection routes back to agent repair instead of asking the user');
  } finally {
    fs.rmSync(phaseFixture, { recursive: true, force: true });
  }

  const terminalPhaseFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-phase-terminal-block-'));
  try {
    let terminalRun = ensurePhaseTaskRun({ projectRoot: terminalPhaseFixture, phase: 3, phaseName: 'Construct' });
    for (let attempt = 0; attempt < 4; attempt++) {
      terminalRun = recordTaskResult({
        projectRoot: terminalPhaseFixture,
        taskId: terminalRun.task.id,
        result: resultFor(terminalRun, 'retryable_failure', {
          code: 'COMPLETION_GATE_REJECTED',
          failure: { type: 'VERIFIER_FAILURE', retryable: true, message: `Terminal phase failure ${attempt + 1}` },
          stop: { owner: 'agent', code: 'COMPLETION_GATE_REJECTED', decisionKey: null, resumePolicy: 'agent_retry' },
        }),
      });
    }
    const terminalMarkerPath = path.join(terminalPhaseFixture, 'wiki', 'phases', 'phase-3.json');
    atomicWriteJson(terminalMarkerPath, {
      schemaVersion: 3,
      phase: 3,
      name: 'Construct',
      state: 'blocked',
      startedAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
      completedAt: null,
      reason: 'Original completion failure',
      block: { owner: 'agent', code: 'COMPLETION_GATE_REJECTED', decisionKey: null, resumePolicy: 'agent_retry' },
      evidence: [],
      execution: {
        taskId: terminalRun.task.id,
        workflow: terminalRun.workflow.id,
        currentNode: terminalRun.state.currentNode,
        status: terminalRun.state.status,
        resultStatus: terminalRun.lastResult.status,
        resultCode: terminalRun.lastResult.code,
        resultAt: terminalRun.lastResult.createdAt,
        attemptId: terminalRun.lastResult.attemptId,
      },
    });
    const terminalTaskPath = taskRunPath(terminalPhaseFixture, terminalRun.task.id);
    const markerBeforeReplay = fs.readFileSync(terminalMarkerPath, 'utf8');
    const taskBeforeReplay = fs.readFileSync(terminalTaskPath, 'utf8');
    const identicalReplay = spawnSync(process.execPath, [
      phaseScript, 'block', '3', 'A later generic explanation', '--host', 'codex', '--owner', 'agent',
      '--code', 'COMPLETION_GATE_REJECTED', '--resume-policy', 'agent_retry',
    ], { cwd: terminalPhaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-terminal-replay' } });
    check(identicalReplay.status === 0 && /same durable terminal block/u.test(identicalReplay.stdout)
      && fs.readFileSync(terminalMarkerPath, 'utf8') === markerBeforeReplay
      && fs.readFileSync(terminalTaskPath, 'utf8') === taskBeforeReplay,
    'an equivalent terminal block replay is idempotent and preserves the first durable cause byte-for-byte');

    const conflictingReplay = spawnSync(process.execPath, [
      phaseScript, 'block', '3', 'Conflicting relabel', '--host', 'codex', '--owner', 'infrastructure',
      '--code', 'DIFFERENT_BLOCK', '--resume-policy', 'environment_change',
    ], { cwd: terminalPhaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-terminal-conflict' } });
    check(conflictingReplay.status === 2 && /terminal \(blocked\).*use .*reopen 3/iu.test(conflictingReplay.stderr)
      && !/at recordTaskResult|execution-contract\.mjs:\d+/u.test(conflictingReplay.stderr)
      && fs.readFileSync(terminalMarkerPath, 'utf8') === markerBeforeReplay
      && fs.readFileSync(terminalTaskPath, 'utf8') === taskBeforeReplay,
    'a conflicting terminal block is rejected before marker mutation and without a stack trace');

    const terminalStart = spawnSync(process.execPath, [phaseScript, 'start', '3', '--host', 'codex'], {
      cwd: terminalPhaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-terminal-start' },
    });
    check(terminalStart.status === 2 && /use .*reopen 3/iu.test(terminalStart.stderr)
      && fs.readFileSync(terminalMarkerPath, 'utf8') === markerBeforeReplay
      && fs.readFileSync(terminalTaskPath, 'utf8') === taskBeforeReplay,
    'start cannot mutate or reset a terminal blocked phase; recovery requires explicit reopen');

    const reopened = spawnSync(process.execPath, [phaseScript, 'reopen', '3', '--host', 'codex'], {
      cwd: terminalPhaseFixture, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-terminal-reopen' },
    });
    const reopenedMarker = JSON.parse(fs.readFileSync(terminalMarkerPath, 'utf8'));
    const reopenedRun = readTaskRun(terminalPhaseFixture, reopenedMarker.execution?.taskId);
    check(reopened.status === 0 && reopenedMarker.state === 'in_progress'
      && reopenedMarker.execution?.taskId !== terminalRun.task.id
      && reopenedRun?.state?.currentNode === 'execute' && reopenedRun?.task?.status === 'running'
      && fs.readFileSync(terminalTaskPath, 'utf8') === taskBeforeReplay,
    'reopen is the only transition that creates a fresh running Task while preserving the terminal history');
  } finally {
    fs.rmSync(terminalPhaseFixture, { recursive: true, force: true });
  }

  const managedFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-managed-runtime-'));
  try {
    const installedEngine = path.join(managedFixture, 'project-forge');
    const managedProject = path.join(managedFixture, 'card-game');
    fs.symlinkSync(ROOT, installedEngine, process.platform === 'win32' ? 'junction' : 'dir');
    fs.cpSync(path.join(ROOT, '.claude', 'skills', 'status'), path.join(managedProject, '.claude', 'skills', 'status'), { recursive: true });
    fs.cpSync(path.join(ROOT, '.claude', 'skills', 'phase-1-analyze'), path.join(managedProject, '.claude', 'skills', 'phase-1-analyze'), { recursive: true });
    fs.cpSync(path.join(ROOT, '.claude', 'skills', 'gacha-meta'), path.join(managedProject, '.claude', 'skills', 'gacha-meta'), { recursive: true });
    const localSkill = path.join(managedProject, '.claude', 'skills', 'phase-1-analyze', 'SKILL.md');
    fs.writeFileSync(localSkill, fs.readFileSync(localSkill, 'utf8').replace('contract_version: 1', 'contract_version: 999'));
    const localGachaSkill = path.join(managedProject, '.claude', 'skills', 'gacha-meta', 'SKILL.md');
    fs.writeFileSync(localGachaSkill, fs.readFileSync(localGachaSkill, 'utf8').replace('contract_version: 1', 'contract_version: 999'));
    fs.writeFileSync(path.join(managedProject, '.forge-managed.json'), JSON.stringify({ forgeVersion: 'fixture' }));
    fs.mkdirSync(path.join(managedProject, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(managedProject, 'mcp-server'), { recursive: true });
    fs.mkdirSync(path.join(managedProject, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(managedProject, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'project-forge' }));
    fs.writeFileSync(path.join(managedProject, 'mcp-server', 'verifiers.json'), JSON.stringify({ schemaVersion: 1, verifiers: [] }));
    fs.writeFileSync(path.join(managedProject, 'scripts', 'forge-sync-spec.mjs'), '// untrusted fixture\n');

    const portablePhaseScript = path.join(managedProject, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
    const managedEnv = { ...process.env, FORGE_RUN_ATTEMPT_ID: 'fixture-managed-runtime' };
    delete managedEnv.FORGE_ENGINE_ROOT;
    const portable = spawnSync(process.execPath, [portablePhaseScript, 'start', '1', '--host', 'codex'], {
      cwd: managedProject, encoding: 'utf8', env: managedEnv,
    });
    let portableMarker = null;
    let portableRun = null;
    try {
      portableMarker = JSON.parse(fs.readFileSync(path.join(managedProject, 'wiki', 'phases', 'phase-1.json'), 'utf8'));
      portableRun = JSON.parse(fs.readFileSync(taskRunPath(managedProject, portableMarker.execution?.taskId), 'utf8'));
    } catch {}
    check(portable.status === 0 && portableMarker?.execution?.resultStatus === 'in_progress'
      && portableRun?.task?.contract?.id === 'phase-1-analyze',
    'copied managed runtime binds a phase Task through the trusted sibling engine and ignores project-local authority');

    const verifierSmoke = path.join(managedProject, 'managed-verifier-smoke.mjs');
    fs.writeFileSync(verifierSmoke, `
import { makeRunResult, makeTask, recordTaskResult, startTaskRun } from './.claude/skills/status/references/execution-contract.mjs';
import { runTaskVerifiers } from './.claude/skills/status/references/verifier-runner.mjs';
const root=process.cwd();
let run=startTaskRun({projectRoot:root,task:makeTask({id:'task-managed-verifier-smoke',mode:'change',phase:8,goal:'Verify trusted portable contract',skill:'gacha-meta',acceptance:[{id:'AC-1',text:'Trusted verifier passes',status:'pending'}],verifiers:['gacha-integration']})});
run=recordTaskResult({projectRoot:root,taskId:run.task.id,result:makeRunResult({taskId:run.task.id,node:run.state.currentNode,status:'completed',code:'FIXTURE_IMPLEMENTED',message:'Fixture implemented',host:'fixture',phase:8})});
const outcome=runTaskVerifiers({projectRoot:root,taskId:run.task.id,spawn:()=>({status:0,stdout:JSON.stringify({ok:true,issues:[]}),stderr:'',error:null})});
console.log(JSON.stringify({exitCode:outcome.exitCode,node:outcome.run.state.currentNode,contract:outcome.run.task.contract?.id}));
`);
    const verifiedPortable = spawnSync(process.execPath, [verifierSmoke], {
      cwd: managedProject, encoding: 'utf8', env: managedEnv,
    });
    check(verifiedPortable.status === 0 && /"exitCode":0/.test(verifiedPortable.stdout)
      && /"node":"done"/.test(verifiedPortable.stdout) && /"contract":"gacha-meta"/.test(verifiedPortable.stdout),
    'copied verifier runtime revalidates the SkillContract and registry through the same trusted sibling engine');
  } finally {
    fs.rmSync(managedFixture, { recursive: true, force: true });
  }

  const isolatedFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-untrusted-runtime-'));
  try {
    const isolatedProject = path.join(isolatedFixture, 'project-forge');
    fs.cpSync(path.join(ROOT, '.claude', 'skills', 'status'), path.join(isolatedProject, '.claude', 'skills', 'status'), { recursive: true });
    fs.writeFileSync(path.join(isolatedProject, '.forge-managed.json'), JSON.stringify({ forgeVersion: 'fixture' }));
    fs.mkdirSync(path.join(isolatedProject, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(isolatedProject, 'mcp-server'), { recursive: true });
    fs.mkdirSync(path.join(isolatedProject, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(isolatedProject, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'project-forge' }));
    fs.writeFileSync(path.join(isolatedProject, 'mcp-server', 'verifiers.json'), JSON.stringify({ schemaVersion: 1, verifiers: [] }));
    fs.writeFileSync(path.join(isolatedProject, 'scripts', 'forge-sync-spec.mjs'), '// untrusted fixture\n');
    const isolatedEnv = { ...process.env };
    delete isolatedEnv.FORGE_ENGINE_ROOT;
    const isolated = spawnSync(process.execPath, [
      path.join(isolatedProject, '.claude', 'skills', 'status', 'references', 'phase-state.mjs'), 'start', '1', '--host', 'codex',
    ], { cwd: isolatedProject, encoding: 'utf8', env: isolatedEnv });
    check(isolated.status !== 0 && /Forge engine is unavailable/.test(`${isolated.stdout}\n${isolated.stderr}`),
      'a managed project named project-forge cannot turn its own fake registry into engine authority');
    const localOverride = spawnSync(process.execPath, [
      path.join(isolatedProject, '.claude', 'skills', 'status', 'references', 'phase-state.mjs'), 'start', '1', '--host', 'codex',
    ], { cwd: isolatedProject, encoding: 'utf8', env: { ...isolatedEnv, FORGE_ENGINE_ROOT: isolatedProject } });
    check(localOverride.status !== 0 && /Forge engine is unavailable/.test(`${localOverride.stdout}\n${localOverride.stderr}`),
      'FORGE_ENGINE_ROOT cannot promote an in-project fake registry for a managed project');
  } finally {
    fs.rmSync(isolatedFixture, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} execution contract regression(s)`);
  process.exit(1);
}
console.log('\nPASS: Forge Task and RunResult drive bounded restart-safe workflow graphs');
