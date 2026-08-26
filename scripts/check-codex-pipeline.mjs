#!/usr/bin/env node
/** Offline regression for the one-window, fresh-session-per-phase Codex orchestrator. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bindPhaseTaskMarker, classifyAfterTurn, classifyTurnResult, firstExecArgs, loadPolicy, looksLikeQuestion, parseExecEvent,
  reconcileCompletedGitCheckpoints, resolveCodexLauncher, resumeExecArgs, runPipeline, unavailableLocalMcpOverrides,
} from './codex-pipeline.mjs';
import { ensurePhaseTaskRun, readTaskRun } from '../.claude/skills/status/references/execution-contract.mjs';
import {
  phaseCheckpointRemotePolicy, readPhaseGitCheckpoint, recordPhaseGitCheckpoint,
} from '../.claude/skills/status/references/project-git.mjs';
import {
  auditRolloutFile, buildPhaseCostReport, createExecTelemetry, formatPhaseCostReport,
  observeExecTelemetry, savePhaseCostReport,
} from './lib/codex-cost-report.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) failures.push(message);
};

const policy = loadPolicy();
const first = firstExecArgs(policy, 1, 'F:\\fixture');
const second = firstExecArgs(policy, 2, 'F:\\fixture');
check(first.args[0] === 'exec' && first.args.includes('--json') && first.args.at(-1).includes('$phase-1-analyze'),
  'phase launch uses non-interactive JSON exec with the canonical skill');
check(first.args.includes('approval_policy="never"')
  && first.args[first.args.indexOf('-s') + 1] === 'workspace-write'
  && !first.args.includes('sandbox_mode="danger-full-access"')
  && !first.args.includes('--dangerously-bypass-hook-trust')
  && !first.args.includes('--dangerously-bypass-approvals-and-sandbox'),
  'phase launch grants unattended write access only inside the project workspace');
check(first.selected.model === 'gpt-5.6-sol' && second.selected.model === 'gpt-5.6-sol',
  'separate phases stay on Sol');

const resumed = resumeExecArgs(policy, 1, 'thread-123', 'утверждаю');
check(resumed.args[0] === 'exec' && resumed.args[1] === 'resume' && resumed.args.includes('thread-123'),
  'STOP answer resumes the current phase session');
check(!resumed.args.includes('-s') && !resumed.args.some(arg => String(arg).startsWith('sandbox_mode='))
  && !resumed.args.some(arg => String(arg).startsWith('approval_policy='))
  && !resumed.args.includes('--dangerously-bypass-hook-trust')
  && !resumed.args.includes('--dangerously-bypass-approvals-and-sandbox'),
  'STOP resume inherits the original session sandbox without unsafe overrides');
check(!second.args.includes('thread-123'), 'next phase launch does not inherit the previous session id');
const mcpFirst = firstExecArgs(policy, 4, 'F:\\fixture', null, ['mcp_servers.unityMCP.enabled=false']);
const mcpResume = resumeExecArgs(policy, 4, 'thread-456', 'continue', null, ['mcp_servers.unityMCP.enabled=false']);
check(mcpFirst.args.includes('mcp_servers.unityMCP.enabled=false')
  && mcpResume.args.includes('mcp_servers.unityMCP.enabled=false'),
  'phase start and STOP resume preserve run-local MCP overrides');

const thread = parseExecEvent(JSON.stringify({ type: 'thread.started', thread_id: 'abc' }));
const message = parseExecEvent(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Готово' } }));
check(thread.kind === 'thread' && thread.threadId === 'abc', 'exec JSON captures the session id');
check(message.kind === 'agent' && message.text === 'Готово', 'exec JSON renders the final agent message');

const liveTelemetry = createExecTelemetry();
const usageEvent = JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1200, cached_input_tokens: 900, output_tokens: 30 } });
observeExecTelemetry(liveTelemetry, usageEvent, parseExecEvent(usageEvent));
check(liveTelemetry.completedTurns === 1 && liveTelemetry.usage.inputTokens === 1200
  && liveTelemetry.usage.cachedInputTokens === 900,
  'exec JSON telemetry captures bounded fallback usage without entering model context');

check(classifyAfterTurn({ state: 'complete' }, '', 0) === 'complete', 'durable complete advances the pipeline');
check(classifyAfterTurn({ state: 'blocked' }, '', 0) === 'needs-answer', 'durable blocked requests an answer');
check(classifyAfterTurn({ state: 'in_progress' }, 'Утверждаете план?', 0) === 'needs-answer' && looksLikeQuestion('Начинаем?'),
  'question-shaped STOP is not auto-resumed blindly');
check(classifyAfterTurn({ state: 'in_progress' }, 'Продолжу работу.', 0) === 'continue',
  'premature in-progress ending is automatically continued');
const now = new Date().toISOString();
const structuredUserStop = {
  status: 'user_decision_required', code: 'GDD_APPROVAL', createdAt: now,
  failure: { type: 'USER_DECISION_REQUIRED', retryable: false, message: 'Approve GDD' },
  stop: { owner: 'user', code: 'GDD_APPROVAL', decisionKey: 'phase2-gdd', resumePolicy: 'user_answer' },
};
check(classifyTurnResult({ state: 'in_progress' }, 'No question mark', 0, { structuredResult: structuredUserStop }).action === 'needs-answer',
  'structured user-owned STOP requests an answer without prose heuristics');
check(classifyTurnResult({ state: 'blocked', block: { owner: 'agent' }, updatedAt: now }, 'Fix required', 0).action === 'continue',
  'agent-owned completion rejection continues repair instead of asking the user');
const repairAttempt = 'codex-fixture-repair-attempt';
const structuredAgentRepair = {
  attemptId: repairAttempt, status: 'retryable_failure', code: 'COMPLETION_GATE_REJECTED', createdAt: now,
  failure: { type: 'VERIFIER_FAILURE', retryable: true, message: 'Completion evidence failed' },
  stop: { owner: 'agent', code: 'COMPLETION_GATE_REJECTED', decisionKey: null, resumePolicy: 'agent_retry' },
};
check(classifyTurnResult({
  schemaVersion: 3, state: 'blocked', block: { owner: 'agent', code: 'COMPLETION_GATE_REJECTED' },
  updatedAt: now, execution: { attemptId: repairAttempt },
}, 'Repair required', 1, { structuredResult: structuredAgentRepair, turnAttemptId: repairAttempt }).action === 'continue',
  'correlated completion-gate exit 1 routes to automatic agent repair');
check(classifyTurnResult({
  schemaVersion: 3, state: 'blocked', block: { owner: 'agent', code: 'COMPLETION_GATE_REJECTED' },
  updatedAt: now, execution: { attemptId: repairAttempt, status: 'blocked', currentNode: 'blocked' },
}, 'Repair budget exhausted', 1, { structuredResult: structuredAgentRepair, turnAttemptId: repairAttempt }).action === 'blocked',
  'exhausted repair budget is terminal and cannot be reset by automatic resume');
check(classifyTurnResult({ state: 'blocked', block: { owner: 'infrastructure' }, updatedAt: now }, '', 0).action === 'blocked',
  'infrastructure-owned blocker stops automatic execution explicitly');
check(classifyTurnResult({ state: 'blocked', updatedAt: now }, '', 0).source === 'legacy_marker',
  'old blocked markers remain a named compatibility path');
check(classifyTurnResult({ state: 'blocked', updatedAt: '2020-01-01T00:00:00.000Z' }, '', 0, { turnStartedAtMs: Date.now() }).action === 'continue',
  'a stale blocked/STOP marker cannot control a new turn');
check(classifyTurnResult({
  schemaVersion: 3, state: 'blocked', block: { owner: 'user' }, updatedAt: now,
  execution: { attemptId: 'codex-old-stop-attempt' },
}, '', 0, {
  structuredResult: { ...structuredUserStop, attemptId: 'codex-old-stop-attempt' },
  turnStartedAtMs: Date.now(), turnAttemptId: 'codex-new-resume-attempt',
}).action === 'continue', 'an immediate resume cannot consume the previous turn STOP by timestamp alone');
check(!looksLikeQuestion('Не создавай STOP-POINT.') && !looksLikeQuestion('В отчёте была цитата «утверждаете?»'),
  'negative instructions and quoted questions do not create a false STOP');
check(classifyTurnResult({ state: 'in_progress' }, 'Начинаем?', 0).source === 'legacy_text',
  'real unstructured legacy questions remain a visible fallback');
check(classifyTurnResult({ state: 'complete' }, 'Утверждаете?', 0, { structuredResult: structuredUserStop }).action === 'complete',
  'durable completion outranks question-shaped assistant text');
const completedWithoutMarker = classifyTurnResult({
  schemaVersion: 3, state: 'in_progress', updatedAt: now, execution: { attemptId: 'codex-complete-attempt' },
}, 'Task says done', 0, {
  structuredResult: { status: 'completed', code: 'PHASE_CONTRACT_PASSED', createdAt: now, attemptId: 'codex-complete-attempt' },
  turnAttemptId: 'codex-complete-attempt',
});
check(completedWithoutMarker.action === 'continue' && completedWithoutMarker.protocolInconsistency === true,
  'supplemental completed RunResult cannot advance an in-progress canonical phase');
check(classifyTurnResult({ state: 'complete' }, 'Everything passed', 7, { structuredResult: { status: 'completed', createdAt: now } }).action === 'failed',
  'non-zero process exit outranks optimistic markers and text');

const launcher = resolveCodexLauncher();
const version = spawnSync(launcher.command, [...launcher.prefixArgs, '--version'], { encoding: 'utf8' });
check(version.status === 0 && /codex-cli/.test(version.stdout), 'Windows launcher resolves the real Codex CLI without cmd nesting');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-codex-pipeline-'));
try {
  fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), '# Fixture\n\n## Project type\ngame\n');
  fs.writeFileSync(path.join(tmp, '.forge-git.json'), JSON.stringify({
    github: { enabled: true, owner: 'Nioris', visibility: 'private', autoCreate: false, autoPush: true },
  }));
  fs.mkdirSync(path.join(tmp, 'wiki', 'phases'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'wiki', 'phases', 'phase-1.json'), JSON.stringify({ phase: 1, state: 'complete' }));
  fs.writeFileSync(path.join(tmp, 'wiki', 'phases', 'phase-2.json'), JSON.stringify({ phase: 2, state: 'in_progress' }));

  const rolloutFixture = path.join(tmp, 'rollout-fixture.jsonl');
  fs.writeFileSync(rolloutFixture, [
    { type: 'session_meta', payload: { session_id: 'fixture-session' } },
    { type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'high' } },
    { type: 'event_msg', payload: { type: 'task_started' } },
    { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 600000, cached_input_tokens: 500000, output_tokens: 8000 } } } },
    { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1200000, cached_input_tokens: 1100000, output_tokens: 12000, reasoning_output_tokens: 2000 } } } },
    { type: 'response_item', payload: { type: 'custom_tool_call_output', output: 'fixture output' } },
    { type: 'compacted', payload: {} },
  ].map(event => JSON.stringify(event)).join('\n') + '\n');
  const rollout = await auditRolloutFile(rolloutFixture);
  check(rollout.modelCalls === 2 && rollout.compactions === 1 && rollout.usage.inputTokens === 1200000
    && rollout.usage.cachedInputTokens === 1100000 && rollout.models[0] === 'gpt-5.6-sol',
    'local rollout audit counts model calls, compactions, cache usage, and actual model policy');
  const fixtureReport = buildPhaseCostReport({
    projectRoot: tmp, phase: 4, phaseName: 'Visual', startedAtMs: Date.now() - 1000,
    expectedModel: 'gpt-5.6-sol', expectedReasoning: 'high', serviceTier: 'standard', maxSubagents: 1,
    sessionId: 'fixture-session', execTelemetry: liveTelemetry,
    rolloutAudit: { ...rollout, source: 'local-rollout', sessions: 1, subagents: 0, rootModels: rollout.models, rootReasoningEfforts: rollout.reasoningEfforts },
    unexpectedStops: 2,
  });
  const fixtureSaved = savePhaseCostReport(tmp, fixtureReport);
  check(fixtureReport.tokens.contextReuseRatio > 0.9
    && fixtureReport.warnings.some(item => item.code === 'CONTEXT_AMPLIFICATION')
    && fixtureReport.warnings.some(item => item.code === 'UNEXPECTED_AGENT_STOPS')
    && fs.existsSync(fixtureSaved.latestPath)
    && /Output\/input is intentionally not labeled as efficiency/.test(fs.readFileSync(fixtureSaved.latestPath, 'utf8'))
    && /Forge Cost Report/.test(formatPhaseCostReport(fixtureReport)),
    'phase report persists transparent ratios, warnings, and measurement notes');
  const dry = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'codex-pipeline.mjs'), '--cwd', tmp, '--from', '2', '--dry-run'], { encoding: 'utf8' });
  check(dry.status === 0 && /Phase 2 Design/.test(dry.stdout) && /Phase 9 Live/.test(dry.stdout)
    && (dry.stdout.match(/fresh-session=yes/g) || []).length === 8,
  'dry run shows one fresh session for every remaining phase without calling a model');

  const prebound = ensurePhaseTaskRun({ projectRoot: tmp, phase: 2, phaseName: 'Design' });
  const boundMarker = bindPhaseTaskMarker(tmp, 2, prebound);
  const phaseState = spawnSync(process.execPath, [path.join(REPO_ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs'), 'start', '2', '--host', 'codex'], {
    cwd: tmp, encoding: 'utf8', env: { ...process.env, FORGE_RUN_ATTEMPT_ID: 'codex-prebound-task-fixture' },
  });
  const afterPhaseState = JSON.parse(fs.readFileSync(path.join(tmp, 'wiki', 'phases', 'phase-2.json'), 'utf8'));
  check(boundMarker.execution.taskId === prebound.task.id && phaseState.status === 0
    && afterPhaseState.execution.taskId === prebound.task.id && readTaskRun(tmp, prebound.task.id)?.task.id === prebound.task.id,
  'host pre-binds the phase Task in the marker and phase-state reuses that exact durable Task');

  const fake = path.join(tmp, 'fake-codex.mjs');
  fs.writeFileSync(fake, `
import fs from 'node:fs'; import path from 'node:path';
const args=process.argv.slice(2); const ci=args.indexOf('-C'); const root=ci>=0?args[ci+1]:process.cwd();
if(args[0]==='mcp'&&args[1]==='list'){
  console.log(JSON.stringify([
    {name:'unityMCP',enabled:true,transport:{type:'streamable_http',url:'http://127.0.0.1:65534/mcp'}},
    {name:'remoteMCP',enabled:true,transport:{type:'streamable_http',url:'https://example.invalid/mcp'}},
    {name:'stdioMCP',enabled:true,transport:{type:'stdio',command:'fixture'}}
  ])); process.exit(0);
}
fs.appendFileSync(path.join(root,'model-launch-count'),'1\\n');
if(process.env.FORGE_HOST_OWNS_GIT_CHECKPOINT==='1') fs.writeFileSync(path.join(root,'host-git-env-ok'),'yes');
if(process.env.FORGE_TASK_SCOPE_ENFORCE==='1'&&/^phase-\\d+-/.test(process.env.FORGE_TASK_ID||'')&&/^[a-f0-9]{64}$/.test(process.env.FORGE_TASK_CONTRACT_HASH||'')) fs.writeFileSync(path.join(root,'task-scope-env-ok'),'yes');
const prompt=args.at(-1)||''; const m=prompt.match(/\\$phase-(\\d+)-/); const phase=Number(m?.[1]||1); const resumed=args[0]==='exec'&&args[1]==='resume';
if(args.includes('mcp_servers.unityMCP.enabled=false')) fs.writeFileSync(path.join(root,'mcp-override-ok'),'yes');
fs.mkdirSync(path.join(root,'wiki','phases'),{recursive:true});
if(phase===2&&/Ответ пользователя на восстановленный STOP/.test(prompt)){
  try{const prior=JSON.parse(fs.readFileSync(path.join(root,'wiki','phases','phase-2.json'),'utf8'));
    if(prior.schemaVersion===3&&prior.state==='in_progress'&&prior.block===null) fs.writeFileSync(path.join(root,'legacy-answer-upgraded'),'yes');
  }catch{}
}
const state=phase===1&&!resumed?'blocked':'complete';
fs.writeFileSync(path.join(root,'wiki','phases','phase-'+phase+'.json'),JSON.stringify({phase,state,reason:state==='blocked'?'Approve fixture':null})+'\\n');
console.log(JSON.stringify({type:'thread.started',thread_id:'fresh-phase-'+phase}));
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:state==='blocked'?'Утверждаете fixture?':'Phase '+phase+' complete'}}));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:2}}));
`);
  const disabledMcp = await unavailableLocalMcpOverrides(
    { command: process.execPath, prefixArgs: [fake] }, tmp,
    { probe: async (endpoint) => endpoint.port !== 65534 },
  );
  check(disabledMcp.length === 1 && disabledMcp[0].name === 'unityMCP'
    && disabledMcp[0].override === 'mcp_servers.unityMCP.enabled=false',
    'preflight disables only an unreachable loopback HTTP MCP and leaves remote/stdio servers alone');
  const noGitCheckpoint = () => ({ skipped: true, reason: 'fixture' });
  fs.writeFileSync(path.join(tmp, 'wiki', 'phases', 'phase-2.json'), JSON.stringify({
    schemaVersion: 3, phase: 2, state: 'blocked', reason: 'Approve restored fixture',
    block: { owner: 'user', code: 'RESTORED_APPROVAL', decisionKey: 'phase2-restored', resumePolicy: 'user_answer' },
    execution: { attemptId: 'codex-restored-stop', taskId: null }, updatedAt: new Date().toISOString(),
  }));
  fs.rmSync(path.join(tmp, 'model-launch-count'), { force: true });
  let restoredPromptSawNoModel = false;
  const restoredStop = await runPipeline({
    projectRoot: tmp, fromPhase: 2, autoAdvance: true,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    gitCheckpoint: noGitCheckpoint,
    prompter: { async ask() { restoredPromptSawNoModel = !fs.existsSync(path.join(tmp, 'model-launch-count')); return ':stop'; }, close() {} },
  });
  check(restoredStop === 0 && restoredPromptSawNoModel && !fs.existsSync(path.join(tmp, 'model-launch-count')),
    'pipeline restores a durable user STOP and asks before launching a model');
  fs.writeFileSync(path.join(tmp, 'wiki', 'phases', 'phase-2.json'), JSON.stringify({
    schemaVersion: 2, phase: 2, state: 'blocked', reason: 'Approve legacy restored fixture',
    updatedAt: new Date().toISOString(),
  }));
  fs.rmSync(path.join(tmp, 'model-launch-count'), { force: true });
  let legacyRestoredPromptSawNoModel = false;
  const legacyRestoredStop = await runPipeline({
    projectRoot: tmp, fromPhase: 2, autoAdvance: true,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    gitCheckpoint: noGitCheckpoint,
    prompter: { async ask() { legacyRestoredPromptSawNoModel = !fs.existsSync(path.join(tmp, 'model-launch-count')); return ':stop'; }, close() {} },
  });
  check(legacyRestoredStop === 0 && legacyRestoredPromptSawNoModel && !fs.existsSync(path.join(tmp, 'model-launch-count')),
    'pipeline restores a legacy blocked marker before launching a model');
  const legacyAnswers = [];
  const legacyAccepted = await runPipeline({
    projectRoot: tmp, fromPhase: 2, autoAdvance: false,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    gitCheckpoint: noGitCheckpoint,
    prompter: { async ask(question) { legacyAnswers.push(question); return legacyAnswers.length === 1 ? 'утверждаю' : 'n'; }, close() {} },
  });
  check(legacyAccepted === 0 && fs.existsSync(path.join(tmp, 'legacy-answer-upgraded')),
    'answering a legacy STOP upgrades its marker before the first model turn');
  fs.writeFileSync(path.join(tmp, 'wiki', 'phases', 'phase-2.json'), JSON.stringify({ phase: 2, state: 'in_progress' }));
  const answers = [];
  const gitCalls = [];
  const integrated = await runPipeline({
    projectRoot: tmp, fromPhase: 1, autoAdvance: true,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    gitCheckpoint: (options) => {
      gitCalls.push(options);
      return {
        commit: `fixture-${gitCalls.length}`, pushed: options.allowRemote === true,
        remote: options.allowRemote ? { fullName: 'Nioris/fixture' } : null,
        remoteDeferred: !options.allowRemote, warning: null,
      };
    },
    prompter: { async ask(question) { answers.push(question); return answers.length > 3 ? 'stop' : 'утверждаю'; }, close() {} },
  });
  const allComplete = Array.from({ length: 9 }, (_, i) => i + 1).every(phase => {
    const marker = JSON.parse(fs.readFileSync(path.join(tmp, 'wiki', 'phases', `phase-${phase}.json`), 'utf8'));
    return marker.state === 'complete';
  });
  check(integrated === 0 && allComplete && answers.length === 1,
    'full loop resumes one STOP inside Phase 1, then launches clean sessions through Phase 9');
  check(fs.existsSync(path.join(tmp, 'mcp-override-ok')),
    'full pipeline applies the unavailable local MCP override to real phase launches');
  check(fs.existsSync(path.join(tmp, 'task-scope-env-ok')),
    'phase launch pre-binds a durable Task identity and contract hash before model access');
  check(fs.existsSync(path.join(tmp, 'host-git-env-ok')),
    'nested phase runtime knows that Git metadata is owned by the pipeline host');
  const preflightGitCalls = gitCalls.filter(item => /^forge: preserve work before phase/.test(item.message));
  const completedGitCalls = gitCalls.filter(item => /^forge: complete phase/.test(item.message));
  check(preflightGitCalls.length === 9 && completedGitCalls.length === 9
    && preflightGitCalls.every(item => item.allowRemote === false)
    && completedGitCalls.slice(0, 7).every(item => item.allowRemote === false)
    && completedGitCalls.slice(7).every(item => item.allowRemote === true && item.allowRemoteFailure === false),
  'host checkpoints pre-phase state locally, commits every completed phase, and pushes only Phase 8+ privately');
  const durableGitRecords = Array.from({ length: 9 }, (_, i) => readPhaseGitCheckpoint(tmp, i + 1).record);
  check(durableGitRecords.every(record => record?.status === 'complete')
    && durableGitRecords.slice(0, 7).every(record => record.requiredRemote === false)
    && durableGitRecords.slice(7).every(record => record.requiredRemote === true && record.pushed === true),
  'completed phase checkpoints are durable across restart, with strict private publication only for Phase 8+');
  check(Array.from({ length: 9 }, (_, i) => i + 1).every(phase =>
    fs.existsSync(path.join(tmp, 'wiki', 'diagnostics', 'codex-cost', `phase-${phase}-latest.json`))),
    'one-window pipeline saves a local cost/context report after every completed phase');

  const makeRestartFixture = name => {
    const project = path.join(tmp, name);
    fs.mkdirSync(path.join(project, 'wiki', 'phases'), { recursive: true });
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Restart fixture\n\n## Project type\ngame\n');
    fs.writeFileSync(path.join(project, '.forge-git.json'), JSON.stringify({
      github: { enabled: true, owner: 'Nioris', visibility: 'private', autoCreate: false, autoPush: true },
    }));
    fs.writeFileSync(path.join(project, 'wiki', 'phases', 'phase-8.json'), JSON.stringify({ phase: 8, state: 'complete' }));
    fs.writeFileSync(path.join(project, 'wiki', 'phases', 'phase-9.json'), JSON.stringify({ phase: 9, state: 'in_progress' }));
    recordPhaseGitCheckpoint(project, {
      phase: 8, status: 'failed', stage: 'complete', remotePolicy: phaseCheckpointRemotePolicy(8),
      error: 'fixture push failed before restart',
    });
    return project;
  };

  const restartSuccessProject = makeRestartFixture('restart-success');
  const restartCalls = [];
  const restartSuccess = await runPipeline({
    projectRoot: restartSuccessProject, fromPhase: 9, autoAdvance: true,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    gitCheckpoint: options => {
      restartCalls.push(options);
      return {
        commit: null, pushed: options.allowRemote === true,
        remote: options.allowRemote ? { fullName: 'Nioris/restart-success' } : null,
        remoteDeferred: !options.allowRemote, warning: null,
      };
    },
    prompter: { async ask() { return ':stop'; }, close() {} },
  });
  const firstRestartCall = restartCalls[0];
  check(restartSuccess === 0
    && /^forge: reconcile complete phase 8 Release/.test(firstRestartCall?.message || '')
    && firstRestartCall?.allowRemote === true && firstRestartCall?.allowRemoteFailure === false
    && readPhaseGitCheckpoint(restartSuccessProject, 8).record?.status === 'complete'
    && fs.existsSync(path.join(restartSuccessProject, 'model-launch-count')),
  'restart reconciles the failed strict Phase 8 push before any Phase 9 model launch, even with --from 9');

  const missingMigrationProject = makeRestartFixture('restart-missing-ledger');
  fs.rmSync(path.join(missingMigrationProject, '.forge', 'git-checkpoints.json'), { force: true });
  const missingMigrationCalls = [];
  const missingMigrated = reconcileCompletedGitCheckpoints({
    projectRoot: missingMigrationProject,
    checkpoint: options => {
      missingMigrationCalls.push(options);
      return { commit: null, pushed: true, remote: { fullName: 'Nioris/restart-missing-ledger' }, remoteDeferred: false, warning: null };
    },
  });
  check(JSON.stringify(missingMigrated) === JSON.stringify([8])
    && missingMigrationCalls[0]?.allowRemote === true && missingMigrationCalls[0]?.allowRemoteFailure === false
    && readPhaseGitCheckpoint(missingMigrationProject, 8).record?.status === 'complete',
  'a legacy completed Phase 8 marker with no ledger is migrated through the same strict private reconciliation');

  const ongoingLiveProject = makeRestartFixture('restart-live-ongoing');
  recordPhaseGitCheckpoint(ongoingLiveProject, {
    phase: 8, status: 'complete', stage: 'reconcile', remotePolicy: phaseCheckpointRemotePolicy(8),
    result: { commit: null, pushed: true, remote: { fullName: 'Nioris/restart-live-ongoing' }, remoteDeferred: false, warning: null },
  });
  fs.writeFileSync(path.join(ongoingLiveProject, 'wiki', 'phases', 'phase-9.json'), JSON.stringify({ phase: 9, state: 'ongoing' }));
  const ongoingCalls = [];
  const ongoingReconciled = reconcileCompletedGitCheckpoints({
    projectRoot: ongoingLiveProject,
    checkpoint: options => {
      ongoingCalls.push(options);
      return { commit: null, pushed: true, remote: { fullName: 'Nioris/restart-live-ongoing' }, remoteDeferred: false, warning: null };
    },
  });
  check(JSON.stringify(ongoingReconciled) === JSON.stringify([9])
    && ongoingCalls[0]?.allowRemote === true && readPhaseGitCheckpoint(ongoingLiveProject, 9).record?.status === 'complete',
  'an ongoing Phase 9 marker is reconciled as a strict completed Live checkpoint after restart');

  const restartFailureProject = makeRestartFixture('restart-failure');
  let reconcileFailureCalls = 0;
  let reconcileFailurePrompts = 0;
  const restartFailure = await runPipeline({
    projectRoot: restartFailureProject, fromPhase: 9, autoAdvance: true,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    gitCheckpoint: options => {
      reconcileFailureCalls++;
      throw new Error(`still cannot publish: ${options.message}`);
    },
    prompter: { async ask() { reconcileFailurePrompts++; return ':stop'; }, close() {} },
  });
  const failedRestartRecord = readPhaseGitCheckpoint(restartFailureProject, 8).record;
  check(restartFailure === 2 && reconcileFailureCalls === 1 && reconcileFailurePrompts === 0
    && !fs.existsSync(path.join(restartFailureProject, 'model-launch-count'))
    && failedRestartRecord?.status === 'failed' && /still cannot publish/.test(failedRestartRecord?.message || ''),
  'failed restart reconciliation remains durable and stops before model launch or user prompt');

  fs.writeFileSync(path.join(tmp, 'wiki', 'phases', 'phase-2.json'), JSON.stringify({ phase: 2, state: 'in_progress' }));
  fs.rmSync(path.join(tmp, 'model-launch-count'), { force: true });
  let failingGitCalls = 0;
  let failurePrompts = 0;
  const blockedByGit = await runPipeline({
    projectRoot: tmp, fromPhase: 2, autoAdvance: false,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    gitCheckpoint: () => {
      failingGitCalls++;
      if (failingGitCalls === 2) throw new Error('fixture host Git inaccessible');
      return { commit: null, pushed: false, remote: null, remoteDeferred: true, warning: null };
    },
    prompter: { async ask() { failurePrompts++; return 'n'; }, close() {} },
  });
  const markerAfterGitFailure = JSON.parse(fs.readFileSync(path.join(tmp, 'wiki', 'phases', 'phase-2.json'), 'utf8'));
  check(blockedByGit === 2 && markerAfterGitFailure.state === 'complete'
    && failingGitCalls === 2 && failurePrompts === 0
    && readPhaseGitCheckpoint(tmp, 2).record?.status === 'failed',
  'host checkpoint failure preserves the completed phase but stops before the next phase or prompt');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) process.exit(1);
console.log('\nPASS: one terminal can switch clean Codex sessions between Forge phases');
