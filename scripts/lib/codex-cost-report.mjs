import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export const CODEX_COST_REPORT_SCHEMA_VERSION = 1;
export const DEFAULT_COST_THRESHOLDS = Object.freeze({
  contextAmplificationMinInputTokens: 1_000_000,
  contextReuseWarningRatio: 0.85,
  largestToolOutputWarningBytes: 1_000_000,
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function usageFrom(value = {}) {
  return {
    inputTokens: number(value.input_tokens ?? value.inputTokens),
    cachedInputTokens: number(value.cached_input_tokens ?? value.cachedInputTokens),
    cacheWriteInputTokens: number(value.cache_write_input_tokens ?? value.cacheWriteInputTokens),
    outputTokens: number(value.output_tokens ?? value.outputTokens),
    reasoningOutputTokens: number(value.reasoning_output_tokens ?? value.reasoningOutputTokens),
  };
}

function addUsage(target, source) {
  for (const key of Object.keys(target)) target[key] += number(source?.[key]);
  return target;
}

function emptyUsage() {
  return usageFrom();
}

function byteLength(value) {
  if (value == null) return 0;
  try { return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8'); }
  catch { return 0; }
}

export function createExecTelemetry() {
  return {
    jsonEvents: 0,
    eventBytes: 0,
    largestEventBytes: 0,
    toolEvents: 0,
    toolEventBytes: 0,
    largestToolEventBytes: 0,
    completedTurns: 0,
    usage: emptyUsage(),
  };
}

export function observeExecTelemetry(telemetry, line, parsed) {
  const bytes = byteLength(line);
  telemetry.eventBytes += bytes;
  telemetry.largestEventBytes = Math.max(telemetry.largestEventBytes, bytes);
  if (parsed?.kind !== 'raw') telemetry.jsonEvents++;
  if (parsed?.kind === 'tool') {
    telemetry.toolEvents++;
    telemetry.toolEventBytes += bytes;
    telemetry.largestToolEventBytes = Math.max(telemetry.largestToolEventBytes, bytes);
  }
  if (parsed?.kind === 'turn') {
    telemetry.completedTurns++;
    addUsage(telemetry.usage, usageFrom(parsed.usage));
  }
  return telemetry;
}

export function mergeExecTelemetry(target, source) {
  for (const key of [
    'jsonEvents', 'eventBytes', 'toolEvents', 'toolEventBytes', 'completedTurns',
  ]) target[key] += number(source?.[key]);
  target.largestEventBytes = Math.max(target.largestEventBytes, number(source?.largestEventBytes));
  target.largestToolEventBytes = Math.max(target.largestToolEventBytes, number(source?.largestToolEventBytes));
  addUsage(target.usage, source?.usage);
  return target;
}

function firstLineMetadata(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(128 * 1024);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, read).toString('utf8');
    const id = head.match(/"(?:session_id|id)":"([^"]+)"/)?.[1] || path.basename(file).match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i)?.[1] || null;
    const parentId = head.match(/"parent_thread_id":"([^"]+)"/)?.[1] || null;
    return { id, parentId };
  } catch {
    return { id: null, parentId: null };
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

function rolloutFiles(root, startMs, endMs) {
  if (!root || !fs.existsSync(root)) return [];
  const files = [];
  const stack = [root];
  const min = number(startMs) - 120_000;
  const max = number(endMs || Date.now()) + 120_000;
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/^rollout-.+\.jsonl$/i.test(entry.name)) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs >= min && stat.mtimeMs <= max) files.push(full);
        } catch {}
      }
    }
  }
  return files;
}

export function resolveRolloutTree({ sessionId, sessionsRoot, startedAtMs, completedAtMs }) {
  if (!sessionId) return [];
  const candidates = rolloutFiles(sessionsRoot, startedAtMs, completedAtMs).map(file => ({ file, ...firstLineMetadata(file) }));
  const root = candidates.find(item => item.id === sessionId || path.basename(item.file).includes(sessionId));
  if (!root) return [];
  const selected = [root];
  const ids = new Set([root.id || sessionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of candidates) {
      if (selected.includes(item) || !item.parentId || !ids.has(item.parentId)) continue;
      selected.push(item);
      if (item.id) ids.add(item.id);
      changed = true;
    }
  }
  return selected.map((item, index) => ({ ...item, root: index === 0 }));
}

export async function auditRolloutFile(file) {
  const result = {
    file,
    modelCalls: 0,
    turns: 0,
    compactions: 0,
    toolOutputs: 0,
    toolOutputBytes: 0,
    largestToolOutputBytes: 0,
    usage: emptyUsage(),
    models: new Set(),
    reasoningEfforts: new Set(),
  };
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const payload = event?.payload || {};
    if (event.type === 'event_msg' && payload.type === 'token_count') {
      result.modelCalls++;
      result.usage = usageFrom(payload.info?.total_token_usage || payload.info?.last_token_usage || {});
    } else if (event.type === 'event_msg' && payload.type === 'task_started') {
      result.turns++;
    } else if (event.type === 'compacted' || payload.type === 'compacted' || payload.type === 'context_compacted') {
      result.compactions++;
    } else if (event.type === 'turn_context') {
      if (payload.model) result.models.add(String(payload.model));
      const effort = payload.effort ?? payload.reasoning_effort;
      if (effort) result.reasoningEfforts.add(String(effort));
    }
    if (event.type === 'response_item' && /tool_call_output$/i.test(String(payload.type || ''))) {
      const bytes = byteLength(payload.output);
      result.toolOutputs++;
      result.toolOutputBytes += bytes;
      result.largestToolOutputBytes = Math.max(result.largestToolOutputBytes, bytes);
    }
  }
  result.models = [...result.models];
  result.reasoningEfforts = [...result.reasoningEfforts];
  return result;
}

export async function auditCodexSessionTree(options) {
  const tree = resolveRolloutTree(options);
  if (!tree.length) return null;
  const files = [];
  const total = {
    source: 'local-rollout',
    sessions: tree.length,
    subagents: Math.max(0, tree.length - 1),
    modelCalls: 0,
    turns: 0,
    compactions: 0,
    toolOutputs: 0,
    toolOutputBytes: 0,
    largestToolOutputBytes: 0,
    usage: emptyUsage(),
    rootModels: [],
    rootReasoningEfforts: [],
  };
  for (const item of tree) {
    const audit = await auditRolloutFile(item.file);
    files.push({ file: item.file, root: item.root, ...audit });
    for (const key of ['modelCalls', 'turns', 'compactions', 'toolOutputs', 'toolOutputBytes']) total[key] += audit[key];
    total.largestToolOutputBytes = Math.max(total.largestToolOutputBytes, audit.largestToolOutputBytes);
    addUsage(total.usage, audit.usage);
    if (item.root) {
      total.rootModels = audit.models;
      total.rootReasoningEfforts = audit.reasoningEfforts;
    }
  }
  return { ...total, files };
}

function warning(code, severity, message) { return { code, severity, message }; }

export function buildPhaseCostReport({
  projectRoot,
  phase,
  phaseName,
  startedAtMs,
  completedAtMs = Date.now(),
  expectedModel,
  expectedReasoning,
  serviceTier,
  maxSubagents = 0,
  sessionId = null,
  execTelemetry = createExecTelemetry(),
  rolloutAudit = null,
  unexpectedStops = 0,
  failedExecs = 0,
  stopPrompts = 0,
  thresholds = DEFAULT_COST_THRESHOLDS,
}) {
  const hasRollout = Boolean(rolloutAudit);
  const usage = hasRollout ? rolloutAudit.usage : execTelemetry.usage;
  const inputTokens = number(usage.inputTokens);
  const cachedInputTokens = number(usage.cachedInputTokens);
  const contextReuseRatio = inputTokens > 0 ? cachedInputTokens / inputTokens : null;
  const actualModels = hasRollout ? rolloutAudit.rootModels : [];
  const actualReasoning = hasRollout ? rolloutAudit.rootReasoningEfforts : [];
  const modelPolicyObserved = actualModels.length > 0;
  const modelPolicyRespected = !modelPolicyObserved || (
    actualModels.every(model => model === expectedModel)
    && actualReasoning.every(effort => effort === expectedReasoning)
  );
  const toolOutputBytes = hasRollout ? rolloutAudit.toolOutputBytes : execTelemetry.toolEventBytes;
  const largestToolOutputBytes = hasRollout ? rolloutAudit.largestToolOutputBytes : execTelemetry.largestToolEventBytes;
  const subagents = hasRollout ? rolloutAudit.subagents : null;
  const warnings = [];
  if (inputTokens >= thresholds.contextAmplificationMinInputTokens && contextReuseRatio >= thresholds.contextReuseWarningRatio) {
    warnings.push(warning('CONTEXT_AMPLIFICATION', 'warn',
      `${Math.round(contextReuseRatio * 100)}% of input tokens were cached/reused across a high-volume phase.`));
  }
  if (largestToolOutputBytes >= thresholds.largestToolOutputWarningBytes) {
    warnings.push(warning('OVERSIZED_TOOL_OUTPUT', 'warn',
      `Largest tool output was ${formatBytes(largestToolOutputBytes)}.`));
  }
  if (modelPolicyObserved && !modelPolicyRespected) {
    warnings.push(warning('MODEL_POLICY_MISMATCH', 'error',
      `Expected ${expectedModel}/${expectedReasoning}; observed ${actualModels.join(', ') || 'unknown'}/${actualReasoning.join(', ') || 'unknown'}.`));
  }
  if (unexpectedStops > 0) {
    warnings.push(warning('UNEXPECTED_AGENT_STOPS', 'warn', `${unexpectedStops} incomplete agent ending(s) required automatic continuation.`));
  }
  if (failedExecs > 0) warnings.push(warning('CODEX_EXEC_FAILURES', 'error', `${failedExecs} Codex exec process failure(s) occurred.`));
  if (subagents != null && subagents > maxSubagents) {
    warnings.push(warning('SUBAGENT_LIMIT_EXCEEDED', 'warn', `${subagents} subagents were observed; phase policy allows ${maxSubagents}.`));
  }
  if (hasRollout && rolloutAudit.compactions > 0) {
    warnings.push(warning('CONTEXT_COMPACTIONS', 'info', `${rolloutAudit.compactions} context compaction event(s) occurred.`));
  }
  return {
    schemaVersion: CODEX_COST_REPORT_SCHEMA_VERSION,
    generatedAt: new Date(completedAtMs).toISOString(),
    project: path.basename(path.resolve(projectRoot)),
    phase: { number: Number(phase), name: phaseName },
    timing: {
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      elapsedMs: Math.max(0, completedAtMs - startedAtMs),
    },
    dataSource: hasRollout ? 'local-rollout+exec-json' : 'exec-json',
    policy: {
      expectedModel,
      expectedReasoning,
      serviceTier,
      maxSubagents,
      observed: modelPolicyObserved,
      respected: modelPolicyRespected,
      actualModels,
      actualReasoningEfforts: actualReasoning,
    },
    orchestration: {
      sessionId,
      sessions: hasRollout ? rolloutAudit.sessions : sessionId ? 1 : 0,
      subagents,
      turns: hasRollout ? rolloutAudit.turns : execTelemetry.completedTurns,
      modelCalls: hasRollout ? rolloutAudit.modelCalls : null,
      unexpectedStops,
      failedExecs,
      stopPrompts,
    },
    tokens: {
      input: inputTokens,
      cachedInput: cachedInputTokens,
      cacheWriteInput: number(usage.cacheWriteInputTokens),
      output: number(usage.outputTokens),
      reasoningOutput: number(usage.reasoningOutputTokens),
      contextReuseRatio,
    },
    tools: {
      outputs: hasRollout ? rolloutAudit.toolOutputs : execTelemetry.toolEvents,
      outputBytes: toolOutputBytes,
      largestOutputBytes: largestToolOutputBytes,
      execJsonEventBytes: execTelemetry.eventBytes,
      largestExecJsonEventBytes: execTelemetry.largestEventBytes,
    },
    compactions: hasRollout ? rolloutAudit.compactions : null,
    warnings,
    thresholds: {
      ...thresholds,
      status: 'Forge heuristic; calibrate from real project runs',
    },
    measurementNotes: [
      'Cached/input ratio measures cache reuse, not duplicated semantic content.',
      'Model calls are counted from local Codex token_count events; null means the local rollout was unavailable.',
      'No prompts, messages, file contents, rate-limit state, or secrets are stored in this report.',
      'Output/input is intentionally not labeled as efficiency because code edits and verified artifacts are also phase output.',
    ],
  };
}

function ensureLocalGitExclude(projectRoot) {
  try {
    const gitDir = path.join(projectRoot, '.git');
    if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return;
    const infoDir = path.join(gitDir, 'info');
    const excludePath = path.join(infoDir, 'exclude');
    const pattern = 'wiki/diagnostics/codex-cost/*.json';
    fs.mkdirSync(infoDir, { recursive: true });
    const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
    if (!current.split(/\r?\n/).includes(pattern)) {
      fs.appendFileSync(excludePath, `${current && !current.endsWith('\n') ? '\n' : ''}# Project Forge local Codex cost/context reports\n${pattern}\n`, 'utf8');
    }
  } catch {}
}

export function savePhaseCostReport(projectRoot, report) {
  const dir = path.join(projectRoot, 'wiki', 'diagnostics', 'codex-cost');
  fs.mkdirSync(dir, { recursive: true });
  ensureLocalGitExclude(projectRoot);
  const phase = report.phase.number;
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const historyPath = path.join(dir, `phase-${phase}-${stamp}.json`);
  const latestPath = path.join(dir, `phase-${phase}-latest.json`);
  const data = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(historyPath, data, 'utf8');
  fs.writeFileSync(latestPath, data, 'utf8');
  return { historyPath, latestPath };
}

export function formatNumber(value) {
  if (value == null) return 'n/a';
  const n = number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(n);
}

export function formatBytes(value) {
  const n = number(value);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function formatPhaseCostReport(report, relativePath = null) {
  const ratio = report.tokens.contextReuseRatio == null ? 'n/a' : `${Math.round(report.tokens.contextReuseRatio * 100)}%`;
  const policy = report.policy.observed
    ? `${report.policy.expectedModel}/${report.policy.expectedReasoning} — ${report.policy.respected ? 'respected' : 'MISMATCH'}`
    : `${report.policy.expectedModel}/${report.policy.expectedReasoning} — launch enforced; rollout unavailable`;
  const lines = [
    '',
    `[Forge Cost Report] Phase ${report.phase.number} ${report.phase.name}`,
    `Data source:          ${report.dataSource}`,
    `Sessions/subagents:  ${report.orchestration.sessions}/${report.orchestration.subagents ?? 'n/a'}`,
    `Turns/model calls:   ${report.orchestration.turns}/${report.orchestration.modelCalls ?? 'n/a'}`,
    `Input:                ${formatNumber(report.tokens.input)}`,
    `Cached/reused:        ${formatNumber(report.tokens.cachedInput)} (${ratio})`,
    `Output:               ${formatNumber(report.tokens.output)}`,
    `Compactions:          ${report.compactions ?? 'n/a'}`,
    `Tool output:          ${formatBytes(report.tools.outputBytes)}`,
    `Largest tool output:  ${formatBytes(report.tools.largestOutputBytes)}`,
    `Unexpected stops:     ${report.orchestration.unexpectedStops}`,
    `Model policy:         ${policy}`,
  ];
  if (report.warnings.length) {
    lines.push('', 'Warnings:');
    for (const item of report.warnings) lines.push(`  ${item.severity === 'error' ? 'X' : '!'} ${item.code}: ${item.message}`);
  } else {
    lines.push('', 'Warnings: none');
  }
  if (relativePath) lines.push(`Saved: ${relativePath}`);
  return lines.join('\n');
}
