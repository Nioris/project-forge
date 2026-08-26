#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendProductTelemetryEvent,
  collectProductTelemetry,
  compareProductTelemetry,
  loadPortfolioTelemetry,
  saveProductTelemetry,
  summarizeProductTelemetry,
} from '../.claude/skills/status/references/product-telemetry.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-product-metrics-'));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const failures = [];
const passed = [];
function check(condition, message) {
  if (condition) passed.push(message);
  else failures.push(message);
}
function write(relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

try {
  fs.mkdirSync(path.join(root, '.git', 'info'), { recursive: true });
  const phase = (number, startedAt, completedAt, forgeVersion = '4.68.61') => ({
    schemaVersion: 3, phase: number, name: `Phase ${number}`, state: 'complete',
    startedAt, updatedAt: completedAt, completedAt, forgeVersion,
    engineRuntime: { engine: 'godot' }, modelRuntime: { selection: { host: 'codex' } },
  });
  write('wiki/phases/phase-1.json', phase(1, '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z'));
  write('wiki/phases/phase-2.json', phase(2, '2026-01-01T01:30:00.000Z', '2026-01-01T03:00:00.000Z'));
  write('wiki/phases/phase-8.json', phase(8, '2026-01-01T09:00:00.000Z', '2026-01-01T10:00:00.000Z'));
  write('.forge/git-checkpoints.json', { schemaVersion: 1, phases: { 8: { commit: 'abc1234', pushed: true } } });
  write('.forge/runs/phase-1.json', {
    schemaVersion: 1,
    task: { id: 'phase-1-fixture', phase: 1 },
    events: [
      { event: 'run_result', result: 'in_progress', code: 'PHASE_STARTED', at: '2026-01-01T00:00:00.000Z' },
      { event: 'run_result', result: 'user_decision_required', code: 'USER_DECISION_REQUIRED', at: '2026-01-01T00:10:00.000Z' },
      { event: 'run_result', result: 'in_progress', code: 'USER_DECISION_RECEIVED', at: '2026-01-01T00:20:00.000Z' },
      { event: 'run_result', result: 'retryable_failure', code: 'COMPLETION_GATE_REJECTED', at: '2026-01-01T00:50:00.000Z' },
      { event: 'run_result', result: 'in_progress', code: 'PHASE_REOPENED', at: '2026-01-01T00:55:00.000Z' },
      { event: 'run_result', result: 'completed', code: 'PHASE_CONTRACT_PASSED', at: '2026-01-01T01:00:00.000Z' },
    ],
    lastResult: {
      createdAt: '2026-01-01T00:50:00.000Z',
      verification: { items: [{ id: 'fixture', issues: [{ message: 'Broken save path' }] }] },
    },
  });
  write('.forge/runs/phase-2.json', {
    schemaVersion: 1,
    task: { id: 'phase-2-fixture', phase: 2 },
    events: [
      { event: 'run_result', result: 'environment_failure', code: 'ENGINE_TOOLCHAIN', at: '2026-01-01T02:00:00.000Z' },
      { event: 'run_result', result: 'in_progress', code: 'PHASE_STARTED', at: '2026-01-01T02:30:00.000Z' },
      { event: 'run_result', result: 'completed', code: 'PHASE_CONTRACT_PASSED', at: '2026-01-01T03:00:00.000Z' },
    ],
    lastResult: { createdAt: '2026-01-01T03:00:00.000Z', verification: null },
  });
  write('wiki/qa/phase-4-visual-evidence.json', {
    reviewedAt: '2026-01-01T04:00:00.000Z', verdict: 'reject',
    reviews: [
      { defects: [{ severity: 'major', summary: 'HUD is too small' }] },
      { defects: [{ severity: 'major', summary: 'HUD is too small' }] },
    ],
    proofReview: { defects: [{ severity: 'minor', summary: 'Reward motion is weak' }] },
  });
  write('.forge/metrics/pricing.json', {
    schemaVersion: 1, currency: 'USD', models: {
      'fixture-model': { inputPerMillion: 1, cachedInputPerMillion: 0.5, outputPerMillion: 2 },
    },
  });
  const cost = (phaseNumber, startedAt, completedAt, generatedAt) => ({
    schemaVersion: 1, generatedAt, phase: { number: phaseNumber }, timing: { startedAt, completedAt },
    policy: { expectedModel: 'fixture-model', actualModels: ['fixture-model'] },
    tokens: { input: 1000, cachedInput: 500, output: 200, reasoningOutput: 20 },
  });
  write('wiki/diagnostics/codex-cost/phase-1-2026.json', cost(1, '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z', '2026-01-01T01:00:01.000Z'));
  write('wiki/diagnostics/codex-cost/phase-8-2026.json', {
    ...cost(8, '2026-01-01T09:00:00.000Z', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:02.000Z'),
    billing: { costUsd: 0.75 },
  });

  let report = collectProductTelemetry(root, { now: '2026-01-01T10:05:00.000Z' });
  check(report.release.status === 'released' && report.release.id.includes('abc1234'), 'Phase 8 creates a stable release identity');
  check(report.time.leadTimeMs === 10 * 60 * 60 * 1000, 'calendar time-to-release is Phase 1 start to Phase 8 completion');
  check(report.time.userDecisionWaitMs === 10 * 60 * 1000 && report.time.infrastructureWaitMs === 30 * 60 * 1000,
    'tracked user and infrastructure waits are paired separately');
  check(report.repairs.product === 2 && report.repairs.infrastructure === 1 && report.repairs.total === 3,
    'product, visual and infrastructure repair cycles remain distinct');
  check(report.defects.preRelease === 3 && report.defects.severity.major === 1,
    'structured verifier and deduplicated visual defects are counted before release');
  check(report.ai.reports === 2 && report.ai.costBasis === 'estimated' && report.ai.costUsd === 0.75115
    && report.ai.pricingCoveragePct === 100,
  'post-Phase-8 cost is attributed by start time and exact/estimated reports form one complete estimate');
  check(report.automation.percent != null && report.automation.manualTransitions === 1,
    'workflow automation uses durable automatic transitions and user answers');
  check(!JSON.stringify(report).includes(root), 'release metrics never persist the absolute project path');
  const schema = JSON.parse(fs.readFileSync(path.resolve(scriptDir, '..', 'schemas', 'release-metrics.schema.json'), 'utf8'));
  check(schema.additionalProperties === false && schema.required.every(key => Object.hasOwn(report, key)),
    'strict release-metrics schema covers every required report section');

  appendProductTelemetryEvent(root, {
    type: 'repair', at: '2026-01-01T04:00:00.000Z', category: 'product',
    code: 'PHASE4_VISUAL_REJECT', fingerprint: 'review-fixture-1',
  });
  appendProductTelemetryEvent(root, {
    type: 'repair', at: '2026-01-01T04:00:00.000Z', category: 'product',
    code: 'PHASE4_VISUAL_REJECT', fingerprint: 'review-fixture-1',
  });
  report = collectProductTelemetry(root, { now: '2026-01-01T10:05:00.000Z' });
  check(report.repairs.product === 2 && report.repairs.visualReviewRejects === 1,
    'append-only review repair events are deduplicated and replace the latest-evidence fallback');

  appendProductTelemetryEvent(root, {
    type: 'ai_cost', releaseId: report.release.id, at: '2026-01-02T00:00:00.000Z',
    usd: 4.25, provider: 'invoice-provider', scope: 'release-total', source: 'invoice',
  });
  appendProductTelemetryEvent(root, {
    type: 'moderation', releaseId: report.release.id, at: '2026-01-02T01:00:00.000Z',
    platform: 'fixture-store', status: 'submitted', attemptId: 'attempt-1',
  });
  appendProductTelemetryEvent(root, {
    type: 'moderation', releaseId: report.release.id, at: '2026-01-02T02:00:00.000Z',
    platform: 'fixture-store', status: 'passed', attemptId: 'attempt-1',
  });
  report = collectProductTelemetry(root, { now: '2026-01-02T03:00:00.000Z' });
  check(report.ai.costBasis === 'exact' && report.ai.costUsd === 4.25,
    'an exact release invoice overrides token-price estimates without double-counting');
  check(report.moderation.firstPass === true && report.moderation.eventualPass === true,
    'post-release moderation outcomes are attributed by release id');
  appendProductTelemetryEvent(root, {
    type: 'moderation', releaseId: report.release.id, at: '2026-01-02T02:10:00.000Z',
    platform: 'second-store', status: 'submitted', attemptId: 'attempt-1',
  });
  appendProductTelemetryEvent(root, {
    type: 'moderation', releaseId: report.release.id, at: '2026-01-02T02:20:00.000Z',
    platform: 'second-store', status: 'rejected', attemptId: 'attempt-1',
  });
  report = collectProductTelemetry(root, { now: '2026-01-02T03:00:00.000Z' });
  check(report.moderation.attempts === 2 && report.moderation.firstPass === false
    && report.moderation.eventualPass === false,
  'multi-platform moderation requires every platform to pass and namespaces attempt ids');
  fs.appendFileSync(path.join(root, '.forge', 'metrics', 'events.jsonl'), `${JSON.stringify({
    schemaVersion: 1, id: 'evt-tampered', type: 'ai_cost', at: '2026-01-02T02:30:00.000Z',
    releaseId: report.release.id, data: { usd: -999, provider: 'tampered', model: null, scope: 'release-total', source: 'invoice' },
  })}\n`, 'utf8');
  report = collectProductTelemetry(root, { now: '2026-01-02T03:00:00.000Z' });
  check(report.coverage.invalidEventLines === 1 && report.ai.costUsd === 4.25,
    'tampered event lines are rejected without changing release KPIs');
  const saved = saveProductTelemetry(root, report);
  check(fs.existsSync(saved.latestPath) && fs.existsSync(saved.releasePath)
    && fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8').includes('.forge/metrics/'),
  'latest and release snapshots stay local and Git-excluded');
  const unsafeInputs = [
    { type: 'ai_cost', usd: 1, provider: 'bad\nsecret', scope: 'request' },
    { type: 'ai_cost', usd: 1, provider: 'fixture', scope: 'release-totl' },
    { type: 'manual_step', count: 'many', category: 'workflow' },
  ];
  check(unsafeInputs.every(input => {
    try { appendProductTelemetryEvent(root, input); return false; } catch { return true; }
  }), 'event ledger rejects unsafe or ambiguous fields instead of silently coercing them');

  const fleet = path.join(root, 'fleet');
  for (let index = 0; index < 60; index++) {
    const baseline = index < 30;
    const record = JSON.parse(JSON.stringify(report));
    record.project = `project-${index + 1}`;
    record.release.id = `release-${index + 1}`;
    record.release.releasedAt = baseline ? `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`
      : `2026-03-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`;
    record.time.leadTimeMs = baseline ? 100 : 28;
    record.time.trackedActiveMs = baseline ? 80 : 32;
    record.ai.costUsd = baseline ? 10 : 6;
    record.repairs.total = baseline ? 5 : 2;
    record.defects.preRelease = baseline ? 10 : 4;
    record.automation.percent = baseline ? 50 : 80;
    record.moderation.firstPass = baseline ? index % 3 === 0 : index % 10 !== 0;
    record.moderation.eventualPass = true;
    const file = path.join(fleet, record.project, '.forge', 'metrics', 'releases', `${record.release.id}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record), 'utf8');
  }
  const records = loadPortfolioTelemetry(fleet);
  const summary = summarizeProductTelemetry(records);
  const comparison = compareProductTelemetry(records, '2026-02-01T00:00:00.000Z');
  check(records.length === 60 && summary.releases === 60, 'portfolio scanner aggregates local release records');
  check(comparison.claimEligible && comparison.baseline.releases === 30 && comparison.current.releases === 30,
    'sixty releases form two claim-ready cohorts with explicit sample sizes');
  check(comparison.changes.timeToReleaseMs.improvementPct === 72
    && comparison.changes.aiCostUsd.improvementPct === 40
    && comparison.changes.preReleaseDefects.improvementPct === 60,
  'cohort comparison calculates median improvements with metric directionality');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

for (const message of passed) console.log(`[OK] ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`[FAIL] ${message}`);
  process.exit(1);
}
console.log(`Forge product metrics fixture regressions: ${passed.length} passed`);
