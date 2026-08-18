#!/usr/bin/env node
import { appendForgeDiagnostic, summarizeForgeDiagnostics } from '../../../hooks/lib/forge-diagnostics.mjs';

function flags(args) {
  const result = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) { result._.push(token); continue; }
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = args[i + 1];
    result[key] = next && !next.startsWith('--') ? (i += 1, next) : true;
  }
  return result;
}

function usage(exitCode = 0) {
  console.log(`Forge behavioral diagnostics

Report:
  node .claude/skills/status/references/forge-event.mjs report --code STOP_FORMAT_WRONG --component phase-1-analyze --message "STOP response was malformed" [--severity error] [--kind stop_protocol] [--operation ask-user] [--phase 1] [--host codex] [--expected "..."] [--actual "..."] [--evidence wiki/phases/phase-1.json]

Resolve after verification:
  node .claude/skills/status/references/forge-event.mjs resolve --fingerprint <id> --message "Verified after fix"

Inspect this project:
  node .claude/skills/status/references/forge-event.mjs list [--json]`);
  process.exit(exitCode);
}

const parsed = flags(process.argv.slice(2));
const command = parsed._[0] || 'list';
const projectRoot = process.cwd();

if (command === 'report') {
  if (!parsed.code || !parsed.component || !parsed.message) usage(2);
  const result = appendForgeDiagnostic(projectRoot, {
    action: 'report',
    severity: parsed.severity,
    code: parsed.code,
    kind: parsed.kind,
    source: parsed.source || 'ai',
    host: parsed.host,
    phase: parsed.phase,
    component: parsed.component,
    operation: parsed.operation,
    message: parsed.message,
    expected: parsed.expected,
    actual: parsed.actual,
    evidence: parsed.evidence ? String(parsed.evidence).split(',').map((item) => item.trim()) : [],
  });
  if (!result.ok) { console.error(`[Forge diagnostics] ${result.error}`); process.exit(1); }
  console.log(`[Forge diagnostics] recorded ${result.event.severity} ${result.event.code}`);
  console.log(`fingerprint=${result.event.fingerprint}`);
  console.log(`log=${result.path}`);
  process.exit(0);
}

if (command === 'resolve') {
  if (!parsed.fingerprint) usage(2);
  const result = appendForgeDiagnostic(projectRoot, {
    action: 'resolve',
    severity: 'info',
    code: parsed.code || 'FORGE_INCIDENT_RESOLVED',
    kind: parsed.kind || 'resolution',
    source: parsed.source || 'ai',
    host: parsed.host,
    phase: parsed.phase,
    component: parsed.component || 'forge',
    operation: parsed.operation,
    message: parsed.message || 'Verified resolution',
    fingerprint: parsed.fingerprint,
    evidence: parsed.evidence ? String(parsed.evidence).split(',').map((item) => item.trim()) : [],
  });
  if (!result.ok) { console.error(`[Forge diagnostics] ${result.error}`); process.exit(1); }
  console.log(`[Forge diagnostics] resolved fingerprint=${result.event.fingerprint}`);
  process.exit(0);
}

if (command === 'list') {
  const summary = summarizeForgeDiagnostics(projectRoot);
  if (parsed.json) {
    console.log(JSON.stringify({ open: summary.open, counts: summary.counts, parseErrors: summary.parseErrors }, null, 2));
  } else {
    console.log(`[Forge diagnostics] open=${summary.open.length} critical=${summary.counts.critical} error=${summary.counts.error} warn=${summary.counts.warn} info=${summary.counts.info}`);
    for (const event of summary.open) {
      console.log(`- ${event.severity.toUpperCase()} ${event.code} [${event.fingerprint}] ${event.component}: ${event.message}`);
    }
    for (const error of summary.parseErrors) console.log(`- PARSE_ERROR ${error.file}:${error.line} ${error.error}`);
  }
  process.exit(0);
}

usage(2);
