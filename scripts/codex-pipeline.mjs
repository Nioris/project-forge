#!/usr/bin/env node
/**
 * One-window Project Forge Codex orchestrator.
 * Each phase runs in its own fresh Codex exec session; STOP answers resume only that phase.
 * The parent terminal stays open and offers the next phase after a durable complete marker.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  auditCodexSessionTree,
  buildPhaseCostReport,
  createExecTelemetry,
  formatPhaseCostReport,
  mergeExecTelemetry,
  observeExecTelemetry,
  savePhaseCostReport,
} from './lib/codex-cost-report.mjs';
import {
  atomicWriteJson, ensurePhaseTaskRun, latestPhaseRunResult, makeRunResult, makeTask,
  recordTaskResult, startTaskRun,
} from '../.claude/skills/status/references/execution-contract.mjs';
import { refreshProductTelemetry } from '../.claude/skills/status/references/product-telemetry.mjs';
import {
  checkpointProjectGit, readGitCheckpointLedger, runPhaseGitCheckpoint, sanitizeGitCheckpointMessage,
} from '../.claude/skills/status/references/project-git.mjs';
import { appendForgeDiagnostic } from '../.claude/hooks/lib/forge-diagnostics.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const POLICY_PATH = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'model-policy.json');
const STATUS_SCRIPT = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'project-status.mjs');
const PHASE_STATE_SCRIPT = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
const PHASE4_BIND_SCRIPT = path.join(ROOT, 'scripts', 'bind-phase4-visual-evidence.mjs');
const PHASE4_RECORD_SCRIPT = path.join(ROOT, 'scripts', 'record-phase4-visual-review.mjs');
const PHASE4_CHECK_SCRIPT = path.join(ROOT, 'scripts', 'check-phase4-visual-evidence.mjs');
const PHASE4_EVIDENCE_REL = 'wiki/qa/phase-4-visual-evidence.json';
const PHASE4_REPORT_REL = 'wiki/qa/phase-4-visual-review.md';
const PHASE_NAMES = {
  1: 'Analyze', 2: 'Design', 3: 'Construct', 4: 'Visual', 5: 'Tech',
  6: 'Listing', 7: 'Test', 8: 'Release', 9: 'Live',
};

function option(args, name) {
  const eq = args.find(x => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

function boolOption(args, name) { return args.includes(`--${name}`); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function sameSnapshot(left, right) {
  return Boolean(left && right && left.algorithm === right.algorithm && left.sha256 === right.sha256
    && Number(left.fileCount) === Number(right.fileCount) && Number(left.bytes) === Number(right.bytes));
}

/**
 * Detect the machine-produced hand-off from a Phase 4 builder to a host-owned reviewer.
 * A missing receipt is intentional here; every producer id/snapshot must already be current.
 */
export function phase4IndependentReviewCandidate(projectRoot) {
  const root = path.resolve(projectRoot);
  const evidence = readJson(path.join(root, ...PHASE4_EVIDENCE_REL.split('/')));
  const capture = readJson(path.join(root, 'screens', 'review', 'capture-manifest.json'));
  if (!evidence || !capture) return { ready: false, reason: 'missing evidence or capture manifest' };
  if (evidence.reviewReceiptId) return { ready: false, reason: 'review already has a receipt' };
  if (evidence.captureId !== capture.captureId || evidence.captureReceiptId !== capture.captureReceiptId) {
    return { ready: false, reason: 'evidence is not bound to the current capture' };
  }
  if (!Array.isArray(capture.captures) || capture.captures.length < 2
    || !Array.isArray(evidence.reviews) || evidence.reviews.length !== capture.captures.length
    || capture.runtimeErrors?.length || capture.missingStates?.length || capture.statePixelCollisions?.length) {
    return { ready: false, reason: 'capture is incomplete or review rows are not initialized' };
  }
  const godot = capture.generatedBy === 'godot-screens-shoot.mjs';
  if (godot) {
    const proof = readJson(path.join(root, 'screens', 'review', 'proof-video-manifest.json'));
    if (!proof || proof.generatedBy !== 'godot-proof-video.mjs' || proof.verdict !== 'pass'
      || evidence.nativeProof?.proofId !== proof.proofId
      || evidence.nativeProof?.proofReceiptId !== proof.proofReceiptId
      || !sameSnapshot(capture.implementationSnapshot, proof.implementationSnapshot)) {
      return { ready: false, reason: 'native proof is missing or does not match the capture' };
    }
  } else if (capture.generatedBy !== 'screens-shoot.mjs') {
    return { ready: false, reason: 'capture producer is not trusted' };
  }
  return { ready: true, engine: godot ? 'godot' : 'web', captureId: capture.captureId };
}

/** Legacy v4.68.61 builders could misclassify this internal hand-off as a user decision. */
export function hostReviewMayReopenPhase4(marker) {
  return marker?.state === 'blocked'
    && marker?.block?.code === 'PHASE4_INDEPENDENT_REVIEW_REQUIRED';
}

function configOverrideArgs(overrides = []) {
  return overrides.flatMap(value => ['-c', value]);
}

export function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

export function readPhaseMarker(projectRoot, phase) {
  const file = path.join(projectRoot, 'wiki', 'phases', `phase-${phase}.json`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return { phase, name: PHASE_NAMES[phase], state: 'pending', reason: null }; }
}

/** Persist host-owned Task identity before Codex receives any tool-capable prompt. */
export function bindPhaseTaskMarker(projectRoot, phase, taskRun) {
  const root = path.resolve(projectRoot);
  const file = path.join(root, 'wiki', 'phases', `phase-${phase}.json`);
  const previous = readPhaseMarker(root, phase);
  const now = new Date().toISOString();
  const marker = {
    ...previous,
    schemaVersion: Math.max(3, Number(previous.schemaVersion) || 0),
    phase: Number(phase),
    name: previous.name || PHASE_NAMES[phase],
    state: previous.state || 'pending',
    startedAt: previous.startedAt || null,
    updatedAt: now,
    completedAt: previous.completedAt || null,
    reason: previous.reason || null,
    block: previous.block || null,
    evidence: Array.isArray(previous.evidence) ? previous.evidence : [],
    execution: {
      ...(previous.execution && typeof previous.execution === 'object' ? previous.execution : {}),
      taskId: taskRun.task.id,
      workflow: taskRun.workflow.id,
      currentNode: taskRun.state.currentNode,
      status: taskRun.state.status,
    },
  };
  atomicWriteJson(file, marker);
  return marker;
}

export function currentProjectPhase(projectRoot) {
  const result = spawnSync(process.execPath, [STATUS_SCRIPT, projectRoot, '--json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Project status failed');
  const status = JSON.parse(result.stdout);
  return Number(status.currentPhase || 1);
}

export function phaseSelection(policy, phase, routeId = null) {
  const phasePolicy = policy.phases?.[String(phase)];
  if (!phasePolicy) throw new Error(`Phase ${phase} is missing from model policy`);
  const route = routeId ? phasePolicy.routes?.[routeId] : null;
  if (routeId && !route) throw new Error(`Unknown Phase ${phase} route: ${routeId}`);
  return { phasePolicy, selected: route || phasePolicy.base, routeId: routeId || 'base' };
}

export function firstExecArgs(policy, phase, projectRoot, routeId = null, configOverrides = []) {
  const { phasePolicy, selected, routeId: selectedRoute } = phaseSelection(policy, phase, routeId);
  const prompt = `$${phasePolicy.skill}${phase === 1 ? ' .' : ''}\n\n` +
    'Работай автономно до настоящего Forge STOP-point или полного завершения фазы. ' +
    'Не заканчивай ход только ради сообщения о следующем шаге.';
  return {
    selected,
    phasePolicy,
    routeId: selectedRoute,
    args: [
      'exec', '--json', '-C', projectRoot,
      '-s', 'workspace-write',
      '-c', 'approval_policy="never"',
      '-m', selected.model,
      '-c', `model_reasoning_effort=${JSON.stringify(selected.reasoning)}`,
      '-c', `service_tier=${JSON.stringify(policy.serviceTier)}`,
      ...configOverrideArgs(configOverrides),
      prompt,
    ],
  };
}

export function resumeExecArgs(policy, phase, sessionId, prompt, routeId = null, configOverrides = []) {
  const { phasePolicy, selected, routeId: selectedRoute } = phaseSelection(policy, phase, routeId);
  return {
    selected,
    phasePolicy,
    routeId: selectedRoute,
    args: [
      'exec', 'resume', '--json',
      '-m', selected.model,
      '-c', `model_reasoning_effort=${JSON.stringify(selected.reasoning)}`,
      '-c', `service_tier=${JSON.stringify(policy.serviceTier)}`,
      ...configOverrideArgs(configOverrides),
      sessionId, prompt,
    ],
  };
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(x => typeof x === 'string' ? x : (x?.text || x?.content || '')).filter(Boolean).join('\n');
}

export function parseExecEvent(line) {
  let event;
  try { event = JSON.parse(line); } catch { return { kind: 'raw', text: line }; }
  const payload = event?.payload?.type ? event.payload : event;
  const type = String(payload?.type || event?.type || '').toLowerCase().replaceAll('_', '.');
  const item = payload?.item || event?.item || null;
  const itemType = String(item?.type || '').toLowerCase().replaceAll('_', '.');
  const threadId = payload?.thread_id || payload?.threadId || event?.thread_id || event?.threadId || null;

  if (type === 'thread.started') return { kind: 'thread', threadId };
  if (type.includes('error') || type.includes('failed')) {
    return { kind: 'error', text: payload?.message || payload?.error?.message || event?.message || line };
  }
  if (type === 'item.completed' && /agent.?message/.test(itemType)) {
    const text = item?.text || item?.message || textFromContent(item?.content);
    return { kind: 'agent', text: String(text || '').trim(), threadId };
  }
  if ((type === 'item.started' || type === 'item.completed') && /command|tool|mcp/.test(itemType)) {
    const command = item?.command || item?.name || item?.server || itemType;
    return { kind: 'tool', text: String(command), completed: type === 'item.completed' };
  }
  if (type === 'turn.completed') return { kind: 'turn', usage: payload?.usage || event?.usage || null, threadId };
  return { kind: 'other', threadId };
}

export function looksLikeQuestion(text) {
  const value = String(text || '').trim();
  if (!value || /не\s+(?:создавай|открывай|делай).*STOP-POINT/i.test(value)
    || /цитат[^\n]{0,120}[«"'].*(?:утверждаете|ответьте|начинаем).*\?/i.test(value)) return false;
  return /(?:^|\n)\s*(?:❓\s*|STOP-POINT\s*:|как ответить\s*:|ответьте(?=\s|[?:.!]|$)|утверждаете(?=\s|[?:.!]|$)|нужно решить(?=\s|[?:.!]|$)|нужен ваш ответ(?=\s|[?:.!]|$)|начинаем(?=\s|[?:.!]|$)|продолжаем(?=\s|[?:.!]|$))[^\n]{0,500}\??\s*$/i.test(value);
}

function freshTimestamp(value, turnStartedAtMs) {
  if (!turnStartedAtMs) return true;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) && parsed >= Number(turnStartedAtMs) - 1000;
}

function correlatedRunResult(result, turnStartedAtMs, turnAttemptId) {
  if (!result) return false;
  if (turnAttemptId && result.attemptId) return result.attemptId === turnAttemptId;
  return freshTimestamp(result.createdAt, turnStartedAtMs);
}

function correlatedMarker(marker, turnStartedAtMs, turnAttemptId) {
  const markerAttemptId = marker?.execution?.attemptId;
  if (turnAttemptId && markerAttemptId) return markerAttemptId === turnAttemptId;
  return freshTimestamp(marker?.updatedAt, turnStartedAtMs);
}

export function classifyTurnResult(marker, finalText, exitCode, {
  structuredResult = null, turnStartedAtMs = null, turnAttemptId = null,
} = {}) {
  const structuredFresh = correlatedRunResult(structuredResult, turnStartedAtMs, turnAttemptId);
  const markerFresh = correlatedMarker(marker, turnStartedAtMs, turnAttemptId);
  const attemptBudgetExhausted = structuredFresh && markerFresh
    && marker?.execution?.status === 'blocked' && marker?.execution?.currentNode === 'blocked';
  if (attemptBudgetExhausted) {
    return { action: 'blocked', source: 'attempt_budget_exhausted', legacyFallback: false, structuredResult };
  }
  const correlatedAgentGateRepair = exitCode === 1 && structuredFresh && markerFresh
    && structuredResult?.status === 'retryable_failure'
    && structuredResult?.code === 'COMPLETION_GATE_REJECTED'
    && structuredResult?.stop?.owner === 'agent'
    && marker?.state === 'blocked'
    && marker?.block?.owner === 'agent'
    && marker?.block?.code === 'COMPLETION_GATE_REJECTED';
  if (correlatedAgentGateRepair) {
    return { action: 'continue', source: 'completion_gate_repair', legacyFallback: false, structuredResult };
  }
  if (exitCode !== 0) return { action: 'failed', source: 'process_exit', legacyFallback: false };
  const legacyCompleteMarker = !marker?.execution || Number(marker?.schemaVersion || 0) < 3;
  if ((marker?.state === 'complete' || marker?.state === 'ongoing') && (markerFresh || legacyCompleteMarker)) {
    return { action: 'complete', source: 'phase_marker', legacyFallback: false };
  }

  if (structuredFresh) {
    const status = structuredResult.status;
    if (status === 'completed') {
      return { action: 'continue', source: 'run_result_without_phase_completion', legacyFallback: false, structuredResult, protocolInconsistency: true };
    }
    if (status === 'user_decision_required') return { action: 'needs-answer', source: 'run_result', legacyFallback: false, structuredResult };
    if (status === 'environment_failure' || status === 'blocked') return { action: 'blocked', source: 'run_result', legacyFallback: false, structuredResult };
    if (['in_progress', 'retryable_failure', 'provider_failure'].includes(status)) {
      return { action: 'continue', source: 'run_result', legacyFallback: false, structuredResult };
    }
  }

  if (marker?.state === 'blocked' && markerFresh) {
    if (marker.block?.owner === 'agent') return { action: 'continue', source: 'phase_marker_block', legacyFallback: false };
    if (marker.block?.owner === 'infrastructure') return { action: 'blocked', source: 'phase_marker_block', legacyFallback: false };
    return { action: 'needs-answer', source: marker.block?.owner === 'user' ? 'phase_marker_block' : 'legacy_marker', legacyFallback: !marker.block };
  }
  if (looksLikeQuestion(finalText)) return { action: 'needs-answer', source: 'legacy_text', legacyFallback: true };
  return { action: 'continue', source: structuredResult ? 'stale_run_result' : 'phase_state', legacyFallback: false };
}

function acceptPhaseUserAnswer(projectRoot, phase) {
  const marker = readPhaseMarker(projectRoot, phase);
  const legacyStop = marker?.state === 'blocked' && !marker?.block?.owner;
  const attemptId = `codex-answer-${phase}-${randomUUID()}`;
  const result = spawnSync(process.execPath, [PHASE_STATE_SCRIPT, legacyStop ? 'start' : 'answer', String(phase), '--host', 'codex'], {
    cwd: projectRoot,
    env: { ...process.env, FORGE_RUN_ATTEMPT_ID: attemptId },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Could not resume Phase ${phase} user STOP`);
}

export function classifyAfterTurn(marker, finalText, exitCode, options = {}) {
  return classifyTurnResult(marker, finalText, exitCode, options).action;
}

export function resolveCodexLauncher(explicit = process.env.CODEX_CLI_PATH || null) {
  const candidate = explicit ? path.resolve(explicit) : null;
  if (candidate && /\.m?js$/i.test(candidate)) return { command: process.execPath, prefixArgs: [candidate] };
  if (candidate && /\.cmd$/i.test(candidate)) {
    const js = path.join(path.dirname(candidate), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(js)) return { command: process.execPath, prefixArgs: [js] };
  }
  if (candidate) return { command: candidate, prefixArgs: [] };
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      const js = path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (fs.existsSync(js)) return { command: process.execPath, prefixArgs: [js] };
    }
  }
  return { command: 'codex', prefixArgs: [] };
}

function localEndpoint(urlValue) {
  try {
    const url = new URL(urlValue);
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return null;
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    return Number.isInteger(port) && port > 0 && port <= 65535 ? { host: url.hostname.replace(/^\[|\]$/g, ''), port } : null;
  } catch { return null; }
}

function canConnect({ host, port }, timeoutMs = 350) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function mcpOverrideKey(name) {
  return /^[A-Za-z0-9_-]+$/.test(name)
    ? `mcp_servers.${name}.enabled=false`
    : `mcp_servers.${JSON.stringify(name)}.enabled=false`;
}

export async function unavailableLocalMcpOverrides(launcher, cwd, { probe = null } = {}) {
  const result = spawnSync(launcher.command, [...(launcher.prefixArgs || []), 'mcp', 'list', '--json'], {
    cwd, encoding: 'utf8', shell: false, windowsHide: true,
  });
  if (result.status !== 0) return [];
  let servers;
  try { servers = JSON.parse(result.stdout); } catch { return []; }
  const check = probe || (endpoint => canConnect(endpoint));
  const disabled = [];
  for (const server of Array.isArray(servers) ? servers : []) {
    if (!server?.enabled || !server?.name) continue;
    const transport = server.transport || {};
    if (!/^(?:streamable_http|sse)$/i.test(String(transport.type || ''))) continue;
    const endpoint = localEndpoint(transport.url);
    if (!endpoint || await check(endpoint, server)) continue;
    disabled.push({
      name: String(server.name),
      endpoint: `${endpoint.host}:${endpoint.port}`,
      override: mcpOverrideKey(String(server.name)),
    });
  }
  return disabled;
}

function usageSummary(usage) {
  if (!usage || typeof usage !== 'object') return '';
  const input = usage.input_tokens ?? usage.inputTokens;
  const output = usage.output_tokens ?? usage.outputTokens;
  if (input == null && output == null) return '';
  return `input=${input ?? '?'} output=${output ?? '?'}`;
}

export async function runCodexTurn(launcher, args, cwd, env) {
  return await new Promise(resolve => {
    const startedAtMs = Date.now();
    const child = spawn(launcher.command, [...(launcher.prefixArgs || []), ...args], {
      cwd, env, shell: false, windowsHide: false, stdio: ['inherit', 'pipe', 'pipe'],
    });
    let sessionId = null;
    let finalText = '';
    let stderr = '';
    const telemetry = createExecTelemetry();
    const out = readline.createInterface({ input: child.stdout });
    out.on('line', line => {
      const parsed = parseExecEvent(line);
      observeExecTelemetry(telemetry, line, parsed);
      if (parsed.threadId) sessionId = parsed.threadId;
      if (parsed.kind === 'agent' && parsed.text) {
        finalText = parsed.text;
        process.stdout.write(`\n${parsed.text}\n`);
      } else if (parsed.kind === 'tool') {
        process.stdout.write(`[Codex ${parsed.completed ? 'done' : 'tool'}] ${parsed.text}\n`);
      } else if (parsed.kind === 'error') {
        process.stderr.write(`[Codex error] ${parsed.text}\n`);
      } else if (parsed.kind === 'turn') {
        const summary = usageSummary(parsed.usage);
        if (summary) process.stdout.write(`[Codex usage] ${summary}\n`);
      } else if (parsed.kind === 'raw' && parsed.text) {
        process.stdout.write(parsed.text + '\n');
      }
    });
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', error => resolve({ exitCode: 127, sessionId, finalText, stderr: error.message, telemetry, startedAtMs, completedAtMs: Date.now() }));
    child.on('close', code => resolve({ exitCode: code ?? 1, sessionId, finalText, stderr, telemetry, startedAtMs, completedAtMs: Date.now() }));
  });
}

function phase4ReviewerPrompt(candidate) {
  const proofInstruction = candidate.engine === 'godot'
    ? 'Также проверь полный AVI и все lossless PNG samples из screens/review/proof-video-manifest.json строго в timeline order.'
    : 'Проверь обе viewport-версии каждого состояния из capture manifest.';
  return `Ты — отдельная host-сессия независимого Phase 4 visual reviewer, не builder.

Работай только как read-heavy reviewer. Не делегируй задачу, не меняй WorkProgress, assets, targets, manifests, phase markers или Forge engine. Разрешены ровно два выходных файла: ${PHASE4_REPORT_REL} и ${PHASE4_EVIDENCE_REL}. Родительский Forge host сам выполнит bind, подпись receipt и checker после твоего выхода; не запускай эти три команды и не меняй identity/env.

Прочитай полностью .agents/skills/visual-qa/SKILL.md и, для Godot, .agents/skills/godot-engine/references/godot-visual-qa.md. Открой каждый live PNG из screens/review/capture-manifest.json рядом с его точным mobile/desktop target из assets/target/screens/manifest.json, а не оценивай имена файлов или старый отчёт. ${proofInstruction}

Существующие QA-файлы — только черновик: независимо перепроверь их и перепиши при любом расхождении. JSON обязан сохранять точные типы схемы: matches/differences — массивы строк, defects — массивы объектов {severity, summary}; никакого PowerShell object-to-string вида "@{...}". Для каждого кадра нужны пять целых scores, distanceScore, минимум 2 конкретных совпадения, минимум 3 конкретных различия и содержательная critique. PASS допустим только при каждом score и distanceScore >= 6 и без Critical/Major. Для Godot proofReview обязан содержать videoWatched, все states, все sample hashes по порядку, motionScore, конкретную critique и defects. При реальном дефекте честно запиши REJECT — builder получит его автоматически.

Не перечитывай прочие фазы и не исследуй проект заново. Заверши кратким фактом: PASS/REJECT и минимальный балл.`;
}

export function phase4PostReviewBuilderPrompt(review) {
  if (review?.passed) {
    return `HOST-OWNED PHASE 4 REVIEW: PASS. The independent authenticated parent reviewer and canonical checker already passed. You are the builder, not a reviewer. Do not spawn agents, run another review, or regenerate unchanged capture/proof. Inspect the signed receipt, update durable project memory, run the Phase 4 completion contract and complete the phase.`;
  }
  return `HOST-OWNED PHASE 4 REVIEW: REJECT. The signed independent verdict is authoritative for this repair cycle. You are the repair builder, not a reviewer. Do not spawn any agent/subagent, start nested Codex, seek a second opinion, rewrite the QA verdict, or rerun bind/receipt/check against unchanged pixels. Repair every concrete Major and below-threshold criterion in wiki/qa/phase-4-visual-review.md, even if one sentence seems debatable. Then generate a fresh capture and native proof, prepare/init reject-by-default evidence, leave Phase 4 in_progress and end the turn. The authenticated parent alone will launch the next reviewer.\n\nCanonical checker summary:\n${String(review?.reason || 'See the signed QA files.').slice(0, 1800)}`;
}

function runPhase4HostScript(script, projectRoot, env, extra = []) {
  return spawnSync(process.execPath, [script, projectRoot, ...extra], {
    cwd: projectRoot, env, encoding: 'utf8', timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  });
}

function shortProcessFailure(result) {
  return String(result?.stderr || result?.stdout || result?.error?.message || 'unknown failure').trim().slice(0, 1800);
}

/** Launch the reviewer from the authenticated parent process, never from the builder sandbox. */
export async function runHostPhase4Reviewer({
  projectRoot, launcher, policy, phaseEnv = {}, configOverrides = [], candidate = null,
} = {}) {
  const root = path.resolve(projectRoot);
  const reviewCandidate = candidate || phase4IndependentReviewCandidate(root);
  if (!reviewCandidate.ready) return { ran: false, passed: false, reason: reviewCandidate.reason };
  const reviewTask = makeTask({
    mode: 'review', phase: 4, goal: 'Independently review current Phase 4 visual evidence',
    scope: { read: ['**'], write: [PHASE4_REPORT_REL, PHASE4_EVIDENCE_REL] },
    acceptance: [{ id: 'visual-evidence', text: 'Every current frame and native proof sample is independently reviewed.' }],
    verificationTarget: '.', status: 'running',
  });
  const reviewRun = startTaskRun({ projectRoot: root, task: reviewTask });
  const reviewAttemptId = `codex-review-4-${randomUUID()}`;
  const { selected } = phaseSelection(policy, 4);
  const args = [
    'exec', '--json', '-C', root,
    '-s', 'workspace-write', '-c', 'approval_policy="never"',
    '-m', selected.model,
    '-c', `model_reasoning_effort=${JSON.stringify(selected.reasoning)}`,
    '-c', `service_tier=${JSON.stringify(policy.serviceTier)}`,
    ...configOverrideArgs(configOverrides),
    phase4ReviewerPrompt(reviewCandidate),
  ];
  const reviewEnv = {
    ...process.env, ...phaseEnv,
    FORGE_AI_HOST: 'codex', FORGE_MODEL: selected.model,
    FORGE_REASONING_EFFORT: selected.reasoning, FORGE_SERVICE_TIER: policy.serviceTier,
    FORGE_MODEL_ROUTE: 'phase4-independent-review', FORGE_MODEL_ENFORCED: '1',
    FORGE_MAX_PHASE_SUBAGENTS: '0', FORGE_RUN_ATTEMPT_ID: reviewAttemptId,
    FORGE_AGENT_ID: 'visual-qa', FORGE_TASK_ID: reviewRun.task.id,
    FORGE_TASK_SCOPE_ENFORCE: '1', FORGE_TASK_CONTRACT_HASH: '',
    FORGE_HOST_OWNS_GIT_CHECKPOINT: '1',
  };
  console.log('\n[Forge] Phase 4 — NEW authenticated independent visual review session');
  console.log(`[Forge] ${selected.model}/${selected.reasoning}, write scope=2 QA files`);
  const turn = await runCodexTurn(launcher, args, root, reviewEnv);
  if (turn.exitCode !== 0) {
    recordTaskResult({ projectRoot: root, taskId: reviewRun.task.id, result: makeRunResult({
      taskId: reviewRun.task.id, node: reviewRun.state.currentNode, attemptId: reviewAttemptId,
      status: 'provider_failure', code: 'PHASE4_REVIEW_PROVIDER_FAILURE', host: 'codex', phase: 4,
      message: `Independent reviewer process failed: ${shortProcessFailure(turn)}`,
      failure: { type: 'PROVIDER_ERROR', retryable: true, message: shortProcessFailure(turn) },
    }) });
    return { ran: true, completed: false, passed: false, reason: shortProcessFailure(turn), turn };
  }

  const bind = runPhase4HostScript(PHASE4_BIND_SCRIPT, root, reviewEnv);
  if (bind.status !== 0) {
    const reason = `Phase 4 evidence bind failed: ${shortProcessFailure(bind)}`;
    recordTaskResult({ projectRoot: root, taskId: reviewRun.task.id, result: makeRunResult({
      taskId: reviewRun.task.id, node: reviewRun.state.currentNode, attemptId: reviewAttemptId,
      status: 'environment_failure', code: 'PHASE4_REVIEW_BIND_FAILED', host: 'codex', phase: 4,
      message: reason, failure: { type: 'FORGE_RUNTIME_BUG', retryable: false, message: reason },
    }) });
    return { ran: true, completed: false, passed: false, reason, turn };
  }
  const recorded = runPhase4HostScript(PHASE4_RECORD_SCRIPT, root, reviewEnv);
  const checked = runPhase4HostScript(PHASE4_CHECK_SCRIPT, root, reviewEnv, ['--json']);
  const evidence = readJson(path.join(root, ...PHASE4_EVIDENCE_REL.split('/')));
  const identityRecorded = evidence?.reviewer?.id === 'visual-qa'
    && evidence?.reviewer?.sessionId === reviewAttemptId && Boolean(evidence?.reviewReceiptId);
  if (!identityRecorded) {
    const reason = `Independent review receipt was not recorded: ${shortProcessFailure(recorded)}`;
    recordTaskResult({ projectRoot: root, taskId: reviewRun.task.id, result: makeRunResult({
      taskId: reviewRun.task.id, node: reviewRun.state.currentNode, attemptId: reviewAttemptId,
      status: 'environment_failure', code: 'PHASE4_REVIEW_RECEIPT_FAILED', host: 'codex', phase: 4,
      message: reason, failure: { type: 'FORGE_RUNTIME_BUG', retryable: false, message: reason },
    }) });
    return { ran: true, completed: false, passed: false, reason, turn, bind, recorded, checked };
  }
  const passed = checked.status === 0;
  const checkText = String(checked.stdout || checked.stderr || '').trim().slice(0, 4000);
  const boundedCheck = checkText.slice(0, 500) || `checker exit ${checked.status}`;
  recordTaskResult({ projectRoot: root, taskId: reviewRun.task.id, result: makeRunResult({
    taskId: reviewRun.task.id, node: reviewRun.state.currentNode, attemptId: reviewAttemptId,
    status: 'completed', code: passed ? 'PHASE4_REVIEW_PASS' : 'PHASE4_REVIEW_REJECT', host: 'codex', phase: 4,
    message: passed ? 'Independent Phase 4 visual evidence passed the canonical checker.'
      : 'Independent Phase 4 visual evidence was recorded and rejected by the canonical checker.',
    evidence: [PHASE4_REPORT_REL, PHASE4_EVIDENCE_REL], checks: [boundedCheck],
  }) });
  console.log(passed
    ? `[Forge] Independent Phase 4 visual gate PASS; receipt=${evidence.reviewReceiptId}`
    : '[Forge] Independent Phase 4 visual gate REJECT; returning evidence to the builder.');
  if (!passed && checkText) console.log(checkText);
  return { ran: true, completed: true, passed, reason: passed ? null : checkText, turn, bind, recorded, checked };
}

function createPrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask(question) { return new Promise(resolve => rl.question(question, answer => resolve(answer.trim()))); },
    close() { rl.close(); },
  };
}

function answerIsYes(answer) { return answer === '' || /^(?:y|yes|д|да|начинаем|продолжай)$/i.test(answer); }
function answerIsStop(answer) { return /^(?:n|no|н|нет|stop|стоп|:stop|exit|выход)$/i.test(answer); }
function answerIsExitCommand(answer) { return /^(?:stop|стоп|:stop|exit|выход)$/i.test(answer); }

function formatGitCheckpoint(result, stage) {
  if (result?.skipped) return `skipped: ${result.reason}`;
  const parts = [result?.commit ? `commit ${result.commit}` : 'working tree unchanged'];
  if (result?.pushed) parts.push(`pushed private ${result.remote?.fullName || 'remote'}`);
  if (result?.remoteDeferred) parts.push(stage === 'preflight'
    ? 'private remote deferred to a completed release phase'
    : 'private remote deferred until Phase 8');
  if (result?.warning) parts.push(`remote warning: ${result.warning}`);
  return parts.join('; ');
}

export function hostGitCheckpoint({ projectRoot, phase, phaseName, stage, checkpoint = checkpointProjectGit }) {
  const { result } = runPhaseGitCheckpoint({ projectRoot, phase, phaseName, stage, checkpoint });
  console.log(`[Forge Git] host ${stage}: ${formatGitCheckpoint(result, stage)}`);
  return result;
}

export function completedPhaseMarkers(projectRoot) {
  const completed = [];
  for (let phase = 1; phase <= 9; phase++) {
    const marker = readPhaseMarker(projectRoot, phase);
    if (marker?.state === 'complete' || (phase === 9 && marker?.state === 'ongoing')) completed.push(phase);
  }
  return completed;
}

export function reconcileCompletedGitCheckpoints({ projectRoot, checkpoint = checkpointProjectGit } = {}) {
  const root = path.resolve(projectRoot);
  const state = readGitCheckpointLedger(root);
  const reconciled = [];
  for (const phase of completedPhaseMarkers(root)) {
    const record = state.valid ? state.ledger.phases[String(phase)] : null;
    if (record?.status === 'complete') continue;
    hostGitCheckpoint({
      projectRoot: root, phase, phaseName: PHASE_NAMES[phase], stage: 'reconcile', checkpoint,
    });
    reconciled.push(phase);
  }
  return reconciled;
}

function reportHostGitCheckpointFailure(projectRoot, phase, stage, error) {
  const message = sanitizeGitCheckpointMessage(error?.message || error || 'unknown Git checkpoint error');
  const diagnostic = appendForgeDiagnostic(projectRoot, {
    action: 'report', severity: 'error', code: 'HOST_GIT_CHECKPOINT_FAILED',
    kind: 'git_checkpoint', source: 'runtime', host: 'codex', phase,
    component: 'codex-pipeline', operation: `host-${stage}-checkpoint`,
    message, expected: 'A local checkpoint succeeds before the pipeline advances.',
    actual: 'The durable phase state is preserved and the pipeline stopped before the next model session.',
    evidence: [`wiki/phases/phase-${phase}.json`],
  });
  const suffix = diagnostic.ok ? `; fingerprint=${diagnostic.event.fingerprint}` : '';
  console.error(`[Forge Git] host ${stage} checkpoint blocked: ${message}${suffix}`);
}

function reopenPhaseAfterHostReview(projectRoot, phase) {
  const attemptId = `codex-host-review-resume-${phase}-${randomUUID()}`;
  const result = spawnSync(process.execPath, [PHASE_STATE_SCRIPT, 'reopen', String(phase), '--host', 'codex'], {
    cwd: projectRoot, env: {
      ...process.env, FORGE_AI_HOST: 'codex', FORGE_RUN_ATTEMPT_ID: attemptId,
      FORGE_HOST_OWNS_GIT_CHECKPOINT: '1',
    }, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Could not reopen Phase ${phase} after host review`);
  console.log(`[Forge] Phase ${phase} reopened automatically after host-owned independent review.`);
}

export async function runPipeline({
  projectRoot, fromPhase = null, autoAdvance = false, dryRun = false,
  keepLocalMcp = false,
  launcher = resolveCodexLauncher(),
  prompter = null,
  gitCheckpoint = checkpointProjectGit,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  if (!fs.existsSync(root)) throw new Error(`Project directory does not exist: ${root}`);
  const policy = loadPolicy();
  let phase = fromPhase || currentProjectPhase(root);

  if (dryRun) {
    console.log(`[Forge] One-window pipeline dry run: ${root}`);
    for (let p = phase; p <= 9; p++) {
      const { selected, phasePolicy } = phaseSelection(policy, p);
      console.log(`  Phase ${p} ${PHASE_NAMES[p]} -> ${phasePolicy.skill}: ${selected.model}/${selected.reasoning}, tier=${policy.serviceTier}, fresh-session=yes`);
    }
    return 0;
  }

  try {
    const reconciled = reconcileCompletedGitCheckpoints({ projectRoot: root, checkpoint: gitCheckpoint });
    if (reconciled.length) console.log(`[Forge Git] reconciled completed phase checkpoints: ${reconciled.join(', ')}`);
  } catch (error) {
    const blockedPhase = completedPhaseMarkers(root).find(candidate => {
      const state = readGitCheckpointLedger(root);
      return !state.valid || state.ledger.phases[String(candidate)]?.status !== 'complete';
    }) || phase;
    reportHostGitCheckpointFailure(root, blockedPhase, 'reconcile', error);
    return 2;
  }
  if (fromPhase == null) phase = currentProjectPhase(root);

  const unavailableMcp = keepLocalMcp ? [] : await unavailableLocalMcpOverrides(launcher, root);
  const mcpOverrides = unavailableMcp.map(item => item.override);
  for (const item of unavailableMcp) {
    console.log(`[Forge] MCP ${item.name} disabled for this pipeline run: local endpoint unavailable (${item.endpoint}).`);
  }

  const ownsPrompter = !prompter;
  const prompt = prompter || createPrompter();
  try {
    phaseLoop: while (phase <= 9) {
      let reviewBeforeBuilder = null;
      try {
        hostGitCheckpoint({
          projectRoot: root, phase, phaseName: PHASE_NAMES[phase], stage: 'preflight', checkpoint: gitCheckpoint,
        });
      } catch (error) {
        reportHostGitCheckpointFailure(root, phase, 'preflight', error);
        return 2;
      }
      const preflightReviewCandidate = phase === 4 ? phase4IndependentReviewCandidate(root) : { ready: false };
      if (preflightReviewCandidate.ready) {
        reviewBeforeBuilder = await runHostPhase4Reviewer({
          projectRoot: root, launcher, policy, configOverrides: mcpOverrides,
          candidate: preflightReviewCandidate,
        });
        if (!reviewBeforeBuilder.completed) {
          console.error(`[Forge] Independent Phase 4 reviewer could not complete: ${reviewBeforeBuilder.reason || 'unknown host failure'}`);
          return 2;
        }
        const markerAfterReview = readPhaseMarker(root, phase);
        if (hostReviewMayReopenPhase4(markerAfterReview)) {
          try { reopenPhaseAfterHostReview(root, phase); }
          catch (error) {
            console.error(`[Forge] Could not resume Phase ${phase} after independent review: ${error.message}`);
            return 2;
          }
        }
      }
      const initial = firstExecArgs(policy, phase, root, null, mcpOverrides);
      if (reviewBeforeBuilder?.completed) {
        initial.args[initial.args.length - 1] += `\n\n${phase4PostReviewBuilderPrompt(reviewBeforeBuilder)}`;
      }
      // Bind the durable phase Task before model tool access. Native Codex file hooks
      // inherit this immutable identity and reject writes outside its declared scope.
      const existingMarker = readPhaseMarker(root, phase);
      const taskRun = ensurePhaseTaskRun({
        projectRoot: root,
        phase,
        phaseName: PHASE_NAMES[phase],
        taskId: existingMarker?.execution?.taskId || null,
      });
      bindPhaseTaskMarker(root, phase, taskRun);
      const phaseEnv = {
        ...process.env,
        FORGE_AI_HOST: 'codex', FORGE_MODEL: initial.selected.model,
        FORGE_REASONING_EFFORT: initial.selected.reasoning, FORGE_SERVICE_TIER: policy.serviceTier,
        FORGE_MODEL_ROUTE: initial.routeId, FORGE_MODEL_ENFORCED: '1',
        FORGE_MAX_PHASE_SUBAGENTS: String(Math.min(policy.limits.maxPhaseSubagents, initial.phasePolicy.maxSubagents)),
        FORGE_TASK_ID: taskRun.task.id,
        FORGE_TASK_SCOPE_ENFORCE: '1',
        FORGE_TASK_CONTRACT_HASH: taskRun.task.contract?.hash || '',
        FORGE_HOST_OWNS_GIT_CHECKPOINT: '1',
      };
      console.log(`\n[Forge] Phase ${phase} ${PHASE_NAMES[phase]} — NEW clean Codex session`);
      console.log(`[Forge] ${initial.selected.model}/${initial.selected.reasoning}, tier=${policy.serviceTier}`);

      const phaseStartedAtMs = Date.now();
      const phaseTelemetry = createExecTelemetry();
      if (reviewBeforeBuilder?.turn?.telemetry) mergeExecTelemetry(phaseTelemetry, reviewBeforeBuilder.turn.telemetry);
      let sessionId = null;
      let nextArgs = initial.args;
      let restartPhaseSession = false;
      let automaticContinues = 0;
      let unexpectedStops = 0;
      let failedExecs = 0;
      let stopPrompts = 0;
      const restoredMarker = readPhaseMarker(root, phase);
      if (restoredMarker?.state === 'blocked' && restoredMarker?.block?.owner === 'infrastructure') {
        console.error(`\n[Forge] Phase ${phase} cannot continue automatically: ${restoredMarker.reason || 'Infrastructure blocker'}`);
        return 2;
      }
      if (restoredMarker?.state === 'blocked'
        && (restoredMarker?.block?.owner === 'user' || !restoredMarker?.block?.owner)) {
        stopPrompts++;
        if (!restoredMarker?.block?.owner) {
          console.warn('[Forge] Restoring a legacy user STOP and upgrading it to the structured phase contract after the answer.');
        }
        if (restoredMarker.reason) console.log(`\n[Forge] Restored STOP: ${restoredMarker.reason}`);
        const answer = await prompt.ask('\nВаш ответ для ИИ (:stop — закончить):\n> ');
        if (answerIsExitCommand(answer)) return 0;
        acceptPhaseUserAnswer(root, phase);
        nextArgs[nextArgs.length - 1] += `\n\nОтвет пользователя на восстановленный STOP: ${answer}`;
      }
      while (true) {
        const turnAttemptId = `codex-${phase}-${randomUUID()}`;
        const turn = await runCodexTurn(launcher, nextArgs, root, { ...phaseEnv, FORGE_RUN_ATTEMPT_ID: turnAttemptId });
        mergeExecTelemetry(phaseTelemetry, turn.telemetry);
        if (turn.sessionId) sessionId = turn.sessionId;
        let marker = readPhaseMarker(root, phase);
        const reviewCandidate = phase === 4 ? phase4IndependentReviewCandidate(root) : { ready: false };
        if (reviewCandidate.ready) {
          const review = await runHostPhase4Reviewer({
            projectRoot: root, launcher, policy, phaseEnv, configOverrides: mcpOverrides,
            candidate: reviewCandidate,
          });
          if (review.turn?.telemetry) mergeExecTelemetry(phaseTelemetry, review.turn.telemetry);
          if (!review.completed) {
            console.error(`[Forge] Independent Phase 4 reviewer could not complete: ${review.reason || 'unknown host failure'}`);
            return 2;
          }
          marker = readPhaseMarker(root, phase);
          if (hostReviewMayReopenPhase4(marker)) {
            try { reopenPhaseAfterHostReview(root, phase); }
            catch (error) {
              console.error(`[Forge] Could not resume Phase ${phase} after independent review: ${error.message}`);
              return 2;
            }
            restartPhaseSession = true;
            break;
          }
          if (marker?.state !== 'blocked') {
            if (!sessionId) throw new Error('Builder ended before the host reviewer could return its result.');
            nextArgs = resumeExecArgs(policy, phase, sessionId,
              phase4PostReviewBuilderPrompt(review), null, mcpOverrides).args;
            automaticContinues = 0;
            continue;
          }
        }
        const structured = latestPhaseRunResult(root, marker, phase);
        const outcome = classifyTurnResult(marker, turn.finalText, turn.exitCode, {
          structuredResult: structured?.result || null,
          turnStartedAtMs: turn.startedAtMs,
          turnAttemptId,
        });
        const state = outcome.action;
        if (outcome.legacyFallback) {
          console.warn(`[Forge] Legacy STOP fallback used (${outcome.source}); the phase skill should persist a structured phase-state block.`);
        }
        if (outcome.protocolInconsistency) {
          console.warn('[Forge] Structured Task reported completion without an authoritative complete phase marker; continuing the current phase.');
        }

        if (state === 'complete') {
          console.log(`\n[Forge] Phase ${phase} ${PHASE_NAMES[phase]} COMPLETE.`);
          break;
        }
        if (state === 'failed') {
          failedExecs++;
          console.error(`\n[Forge] Codex process failed with exit ${turn.exitCode}.`);
          const answer = await prompt.ask('Повторить текущую фазу в этой же сессии? [Y/n] ');
          if (answerIsStop(answer)) return turn.exitCode || 1;
          if (!sessionId) nextArgs = initial.args;
          else nextArgs = resumeExecArgs(policy, phase, sessionId,
            'Предыдущий запуск завершился технической ошибкой. Проверь состояние проекта и продолжай текущую фазу до STOP или complete.', null, mcpOverrides).args;
          continue;
        }
        if (state === 'blocked') {
          const reason = outcome.structuredResult?.failure?.message || marker?.reason || 'Infrastructure or policy blocker';
          console.error(`\n[Forge] Phase ${phase} cannot continue automatically: ${reason}`);
          return 2;
        }
        if (state === 'needs-answer') {
          stopPrompts++;
          const reason = marker?.reason ? `\n[Forge] STOP: ${marker.reason}` : '';
          if (reason) console.log(reason);
          const answer = await prompt.ask('\nВаш ответ для ИИ (:stop — закончить):\n> ');
          if (answerIsExitCommand(answer)) return 0;
          if (marker?.state === 'blocked'
            && (marker?.block?.owner === 'user' || !marker?.block?.owner)) acceptPhaseUserAnswer(root, phase);
          if (!sessionId) {
            nextArgs = firstExecArgs(policy, phase, root, null, mcpOverrides).args;
            nextArgs[nextArgs.length - 1] += `\n\nОтвет пользователя на открытый STOP: ${answer}`;
          } else {
            nextArgs = resumeExecArgs(policy, phase, sessionId,
              `${answer}\n\nПрими ответ, обнови durable state и продолжай эту же фазу до следующего настоящего STOP или complete.`, null, mcpOverrides).args;
          }
          automaticContinues = 0;
          continue;
        }

        automaticContinues++;
        unexpectedStops++;
        if (!sessionId) throw new Error('Codex ended an incomplete phase without reporting a session id.');
        if (automaticContinues <= 3) {
          console.log(`[Forge] Phase ${phase} is still in_progress; continuing automatically (${automaticContinues}/3).`);
          nextArgs = resumeExecArgs(policy, phase, sessionId,
            'Фаза всё ещё in_progress. Не завершай ход сообщением о будущем действии: выполни следующий фактический шаг и продолжай до настоящего STOP-point или phase complete.', null, mcpOverrides).args;
          continue;
        }
        const answer = await prompt.ask('Фаза остаётся in_progress после 3 продолжений. Продолжить? [Y/n] ');
        if (answerIsStop(answer)) return 0;
        nextArgs = resumeExecArgs(policy, phase, sessionId,
          'Пользователь подтвердил продолжение. Доведи текущую фазу до настоящего STOP-point или phase complete.', null, mcpOverrides).args;
        automaticContinues = 0;
      }

      if (restartPhaseSession) continue phaseLoop;

      const phaseCompletedAtMs = Date.now();
      let rolloutAudit = null;
      try {
        const codexDataRoot = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
        rolloutAudit = await auditCodexSessionTree({
          sessionId,
          sessionsRoot: path.join(codexDataRoot, 'sessions'),
          startedAtMs: phaseStartedAtMs,
          completedAtMs: phaseCompletedAtMs,
        });
      } catch (error) {
        console.warn(`[Forge] Local rollout audit unavailable: ${error.message}`);
      }
      const report = buildPhaseCostReport({
        projectRoot: root,
        phase,
        phaseName: PHASE_NAMES[phase],
        startedAtMs: phaseStartedAtMs,
        completedAtMs: phaseCompletedAtMs,
        expectedModel: initial.selected.model,
        expectedReasoning: initial.selected.reasoning,
        serviceTier: policy.serviceTier,
        maxSubagents: Math.min(policy.limits.maxPhaseSubagents, initial.phasePolicy.maxSubagents),
        sessionId,
        execTelemetry: phaseTelemetry,
        rolloutAudit,
        unexpectedStops,
        failedExecs,
        stopPrompts,
      });
      const saved = savePhaseCostReport(root, report);
      const relativeReport = path.relative(root, saved.latestPath).replaceAll('\\', '/');
      console.log(formatPhaseCostReport(report, relativeReport));

      try {
        hostGitCheckpoint({
          projectRoot: root, phase, phaseName: PHASE_NAMES[phase], stage: 'complete', checkpoint: gitCheckpoint,
        });
      } catch (error) {
        reportHostGitCheckpointFailure(root, phase, 'complete', error);
        return 2;
      }

      try {
        const { report: productReport } = refreshProductTelemetry(root);
        console.log(`[Forge Metrics] refreshed ${productReport.release.id} after Phase ${phase} cost/Git evidence.`);
      } catch (error) {
        console.warn(`[Forge Metrics] post-phase snapshot unavailable: ${String(error?.message || error).slice(0, 500)}`);
      }

      if (phase === 9) {
        console.log('\n[Forge] Все девять фаз пройдены.');
        return 0;
      }
      const next = phase + 1;
      if (!autoAdvance) {
        const answer = await prompt.ask(`\nНачинаем Phase ${next} ${PHASE_NAMES[next]} в новой чистой сессии? [Y/n] `);
        if (!answerIsYes(answer)) return 0;
      }
      console.log('[Forge] Старый контекст отброшен; окно терминала остаётся тем же.');
      phase = next;
    }
    return 0;
  } finally {
    if (ownsPrompter) prompt.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (boolOption(args, 'help')) {
    console.log('Usage: node scripts/codex-pipeline.mjs [--cwd PROJECT] [--from 1..9] [--auto] [--dry-run] [--keep-local-mcp]');
    return 0;
  }
  const projectRoot = path.resolve(option(args, 'cwd') || process.cwd());
  const fromRaw = option(args, 'from');
  const fromPhase = fromRaw == null ? null : Number(fromRaw);
  if (fromPhase != null && (!Number.isInteger(fromPhase) || fromPhase < 1 || fromPhase > 9)) {
    throw new Error('--from must be an integer from 1 to 9');
  }
  return await runPipeline({
    projectRoot, fromPhase,
    autoAdvance: boolOption(args, 'auto'),
    dryRun: boolOption(args, 'dry-run'),
    keepLocalMcp: boolOption(args, 'keep-local-mcp'),
  });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`[X] ${error.message}`);
    process.exitCode = 1;
  });
}
