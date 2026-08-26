#!/usr/bin/env node
/** Collect and report privacy-bounded Project Forge delivery metrics. */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  appendProductTelemetryEvent,
  compareProductTelemetry,
  formatDuration,
  formatProductTelemetry,
  loadPortfolioTelemetry,
  refreshProductTelemetry,
  summarizeProductTelemetry,
} from '../.claude/skills/status/references/product-telemetry.mjs';

function option(args, name) {
  const exact = args.find(value => value.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) { return args.includes(`--${name}`); }

function positiveIntegerOption(args, name, fallback) {
  const raw = option(args, name);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new Error(`--${name} must be an integer 1..100000`);
  return value;
}

function usage() {
  console.log(`Usage:
  node scripts/forge-metrics.mjs snapshot [--cwd PROJECT] [--json]
  node scripts/forge-metrics.mjs portfolio --root FLEET [--split-at ISO] [--minimum-cohort 30] [--json] [--output FILE]
  node scripts/forge-metrics.mjs event ai-cost --cwd PROJECT --usd N --provider ID [--model ID] [--scope request|phase|release-total] [--source api|invoice|manual] [--release-id ID]
  node scripts/forge-metrics.mjs event moderation --cwd PROJECT --platform ID --status submitted|passed|rejected [--attempt-id ID] [--release-id ID]
  node scripts/forge-metrics.mjs event defect --cwd PROJECT --severity critical|major|minor|unclassified --stage pre_release|post_release --fingerprint ID [--source ID] [--release-id ID]
  node scripts/forge-metrics.mjs event repair --cwd PROJECT --category product|infrastructure --code CODE [--fingerprint ID] [--release-id ID]
  node scripts/forge-metrics.mjs event manual-step --cwd PROJECT [--count N] [--category ID] [--release-id ID]
  node scripts/forge-metrics.mjs event release --cwd PROJECT --release-id ID [--version ID] [--released-at ISO] [--cycle-started-at ISO] [--forge-version X]

Reports stay under .forge/metrics/ and are excluded from Git. External cost and moderation facts are
accepted only through bounded fields; Forge never stores prompts, source files, messages or secrets.`);
}

function eventInput(kind, args) {
  const common = { releaseId: option(args, 'release-id'), at: option(args, 'at') };
  if (kind === 'ai-cost') return {
    ...common, type: 'ai_cost', usd: option(args, 'usd'), provider: option(args, 'provider'),
    model: option(args, 'model'), scope: option(args, 'scope'), source: option(args, 'source'),
  };
  if (kind === 'moderation') return {
    ...common, type: 'moderation', platform: option(args, 'platform'), status: option(args, 'status'),
    attemptId: option(args, 'attempt-id'),
  };
  if (kind === 'defect') return {
    ...common, type: 'defect', severity: option(args, 'severity'), stage: option(args, 'stage'),
    fingerprint: option(args, 'fingerprint'), source: option(args, 'source'),
  };
  if (kind === 'repair') return {
    ...common, type: 'repair', category: option(args, 'category'), code: option(args, 'code'),
    fingerprint: option(args, 'fingerprint'),
  };
  if (kind === 'manual-step') return {
    ...common, type: 'manual_step', count: option(args, 'count'), category: option(args, 'category'),
  };
  if (kind === 'release') return {
    ...common, type: 'release', version: option(args, 'version'), releasedAt: option(args, 'released-at'),
    cycleStartedAt: option(args, 'cycle-started-at'), forgeVersion: option(args, 'forge-version'),
  };
  throw new Error(`Unknown event kind: ${kind}`);
}

function metricLine(label, metric, formatter = value => String(value)) {
  return `${label}: ${metric.median == null ? 'n/a' : formatter(metric.median)} (n=${metric.samples}, coverage ${metric.coveragePct}%)`;
}

function formatPortfolio(summary) {
  return [
    `Forge portfolio metrics — ${summary.releases} released record(s)`,
    metricLine('Median time-to-release', summary.timeToReleaseMs, formatDuration),
    metricLine('Median tracked active time', summary.trackedActiveMs, formatDuration),
    metricLine('Median AI cost', summary.aiCostUsd, value => `$${Number(value).toFixed(4)}`),
    metricLine('Median repair cycles', summary.repairCycles),
    metricLine('Median pre-release defects', summary.preReleaseDefects),
    metricLine('Median automated workflow', summary.automationPercent, value => `${value}%`),
    `Moderation first-pass: ${summary.moderation.firstPassRatePct == null ? 'n/a' : `${summary.moderation.firstPassRatePct}%`} (n=${summary.moderation.samples}, coverage ${summary.moderation.coveragePct}%)`,
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === 'help' || flag(args, 'help')) { usage(); return 0; }
  if (command === 'snapshot') {
    const root = path.resolve(option(args, 'cwd') || process.cwd());
    const { report, latestPath, releasePath } = refreshProductTelemetry(root);
    if (flag(args, 'json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(formatProductTelemetry(report));
      console.log(`Saved: ${path.relative(root, latestPath).replaceAll('\\', '/')}${releasePath ? `; ${path.relative(root, releasePath).replaceAll('\\', '/')}` : ''}`);
    }
    return 0;
  }
  if (command === 'event') {
    const kind = args[1];
    if (!kind) throw new Error('event requires a kind');
    const root = path.resolve(option(args, 'cwd') || process.cwd());
    const event = appendProductTelemetryEvent(root, eventInput(kind, args));
    const { report } = refreshProductTelemetry(root);
    if (flag(args, 'json')) console.log(JSON.stringify({ event, report }, null, 2));
    else {
      console.log(`[OK] recorded ${event.type} event ${event.id}`);
      console.log(formatProductTelemetry(report));
    }
    return 0;
  }
  if (command === 'portfolio') {
    const root = path.resolve(option(args, 'root') || process.cwd());
    const records = loadPortfolioTelemetry(root);
    const summary = summarizeProductTelemetry(records);
    const splitAt = option(args, 'split-at');
    const comparison = splitAt ? compareProductTelemetry(records, splitAt, {
      minimumCohort: positiveIntegerOption(args, 'minimum-cohort', 30),
    }) : null;
    const payload = { schemaVersion: 1, kind: 'forge.portfolio-metrics', generatedAt: new Date().toISOString(), root: path.basename(root), summary, comparison };
    const output = option(args, 'output');
    if (output) {
      const target = path.resolve(output);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      console.log(`[OK] portfolio metrics saved: ${target}`);
    } else if (flag(args, 'json')) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(formatPortfolio(summary));
      if (comparison) {
        console.log(`\nCohort comparison at ${comparison.splitAt}: ${comparison.claimEligible ? 'CLAIM-READY' : 'NOT CLAIM-READY'}`);
        console.log(`Baseline releases: ${comparison.baseline.releases}; current releases: ${comparison.current.releases}`);
        for (const [key, value] of Object.entries(comparison.changes)) {
          console.log(`${key}: ${value.improvementPct == null ? 'n/a' : `${value.improvementPct}% improvement`} (n=${value.baselineSamples}/${value.currentSamples})`);
        }
        if (comparison.warning) console.log(`Warning: ${comparison.warning}`);
      }
    }
    return 0;
  }
  throw new Error(`Unknown command: ${command}`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`[X] ${error.message}`);
    process.exitCode = 1;
  });
}
