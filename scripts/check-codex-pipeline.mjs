#!/usr/bin/env node
/** Offline regression for the one-window, fresh-session-per-phase Codex orchestrator. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  classifyAfterTurn, firstExecArgs, loadPolicy, looksLikeQuestion, parseExecEvent,
  resolveCodexLauncher, resumeExecArgs, runPipeline, unavailableLocalMcpOverrides,
} from './codex-pipeline.mjs';
import {
  auditRolloutFile, buildPhaseCostReport, createExecTelemetry, formatPhaseCostReport,
  observeExecTelemetry, savePhaseCostReport,
} from './lib/codex-cost-report.mjs';

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
check(first.selected.model === 'gpt-5.6-sol' && second.selected.model === 'gpt-5.6-sol',
  'separate phases stay on Sol');

const resumed = resumeExecArgs(policy, 1, 'thread-123', 'утверждаю');
check(resumed.args[0] === 'exec' && resumed.args[1] === 'resume' && resumed.args.includes('thread-123'),
  'STOP answer resumes the current phase session');
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

const launcher = resolveCodexLauncher();
const version = spawnSync(launcher.command, [...launcher.prefixArgs, '--version'], { encoding: 'utf8' });
check(version.status === 0 && /codex-cli/.test(version.stdout), 'Windows launcher resolves the real Codex CLI without cmd nesting');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-codex-pipeline-'));
try {
  fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), '# Fixture\n\n## Project type\ngame\n');
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
  const dry = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'codex-pipeline.mjs'), '--cwd', tmp, '--from', '2', '--dry-run'], { encoding: 'utf8' });
  check(dry.status === 0 && /Phase 2 Design/.test(dry.stdout) && /Phase 9 Live/.test(dry.stdout)
    && (dry.stdout.match(/fresh-session=yes/g) || []).length === 8,
  'dry run shows one fresh session for every remaining phase without calling a model');

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
const prompt=args.at(-1)||''; const m=prompt.match(/\\$phase-(\\d+)-/); const phase=Number(m?.[1]||1); const resumed=args[0]==='exec'&&args[1]==='resume';
if(args.includes('mcp_servers.unityMCP.enabled=false')) fs.writeFileSync(path.join(root,'mcp-override-ok'),'yes');
fs.mkdirSync(path.join(root,'wiki','phases'),{recursive:true});
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
  const answers = [];
  const integrated = await runPipeline({
    projectRoot: tmp, fromPhase: 1, autoAdvance: true,
    launcher: { command: process.execPath, prefixArgs: [fake] },
    prompter: { async ask(question) { answers.push(question); return 'утверждаю'; }, close() {} },
  });
  const allComplete = Array.from({ length: 9 }, (_, i) => i + 1).every(phase => {
    const marker = JSON.parse(fs.readFileSync(path.join(tmp, 'wiki', 'phases', `phase-${phase}.json`), 'utf8'));
    return marker.state === 'complete';
  });
  check(integrated === 0 && allComplete && answers.length === 1,
    'full loop resumes one STOP inside Phase 1, then launches clean sessions through Phase 9');
  check(fs.existsSync(path.join(tmp, 'mcp-override-ok')),
    'full pipeline applies the unavailable local MCP override to real phase launches');
  check(Array.from({ length: 9 }, (_, i) => i + 1).every(phase =>
    fs.existsSync(path.join(tmp, 'wiki', 'diagnostics', 'codex-cost', `phase-${phase}-latest.json`))),
    'one-window pipeline saves a local cost/context report after every completed phase');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) process.exit(1);
console.log('\nPASS: one terminal can switch clean Codex sessions between Forge phases');
