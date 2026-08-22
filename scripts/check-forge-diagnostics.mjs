#!/usr/bin/env node
/** Regression tests for local and fleet-wide Forge behavioral diagnostics. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendForgeDiagnostic, summarizeForgeDiagnostics } from '../.claude/hooks/lib/forge-diagnostics.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-diagnostics-'));
const failures = [];
const ok = (message) => console.log(`  ✓ ${message}`);
const fail = (message) => { failures.push(message); console.log(`  ✗ ${message}`); };
const check = (condition, message) => condition ? ok(message) : fail(message);
const write = (base, rel, content) => {
  const target = path.join(base, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
};

try {
  console.log('Project Forge behavioral diagnostics audit');
  console.log('──────────────────────────────────────────');
  const project1 = path.join(tmp, 'game-one');
  const project2 = path.join(tmp, 'game-two');
  fs.mkdirSync(project1, { recursive: true });
  fs.mkdirSync(project2, { recursive: true });
  fs.mkdirSync(path.join(project1, '.git', 'info'), { recursive: true });
  write(project1, '.git/info/exclude', '# local excludes\n');
  write(project1, '.forge-managed.json', JSON.stringify({ sourceVersion: '4.68.10' }));
  write(project2, '.forge-managed.json', JSON.stringify({ forgeVersion: '4.68.10' }));

  const secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
  const first = appendForgeDiagnostic(project1, {
    severity: 'error', code: 'STOP_FORMAT_WRONG', kind: 'stop_protocol', source: 'ai', host: 'codex',
    phase: 1, component: 'phase-1-analyze', operation: 'ask-user',
    message: `Wrong output at ${project1}; access_token=${secret}`,
    evidence: ['wiki/phases/phase-1.json', '../outside.txt'],
  });
  const second = appendForgeDiagnostic(project1, {
    severity: 'error', code: 'STOP_FORMAT_WRONG', component: 'phase-1-analyze', operation: 'ask-user',
    message: 'Repeated observation',
  });
  check(first.ok && second.ok, 'report writes fail-open JSONL events');
  check(first.event.fingerprint === second.event.fingerprint, 'stable code/component/operation deduplicates to one fingerprint');
  const raw = fs.readFileSync(first.path, 'utf8');
  check(!raw.includes(secret) && !raw.includes(project1), 'credentials and absolute project paths are redacted');
  check(fs.readFileSync(path.join(project1, '.git', 'info', 'exclude'), 'utf8').includes('wiki/diagnostics/forge-events*.jsonl'), 'diagnostic JSONL stays local through repository-local git exclude');
  check(first.event.evidence.length === 1 && first.event.evidence[0] === 'wiki/phases/phase-1.json', 'only project-relative evidence is retained');
  let summary = summarizeForgeDiagnostics(project1);
  check(summary.open.length === 1 && summary.counts.error === 1, 'repeated observations produce one unresolved incident');

  appendForgeDiagnostic(project1, {
    action: 'resolve', fingerprint: first.event.fingerprint, code: 'FORGE_INCIDENT_RESOLVED',
    component: 'phase-1-analyze', operation: 'ask-user', message: 'Verified repair', source: 'validator',
  });
  summary = summarizeForgeDiagnostics(project1);
  check(summary.open.length === 0, 'verified resolution closes the fingerprint');

  const cli = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'forge-event.mjs');
  const cliReport = spawnSync(process.execPath, [cli, 'report', '--code', 'ADAPTER_FORMAT_WRONG', '--component', 'codex-adapter', '--message', 'Wrong translated response', '--host', 'codex'], { cwd: project2, encoding: 'utf8' });
  check(cliReport.status === 0 && /fingerprint=/.test(cliReport.stdout), 'managed-project CLI records an AI-observed incident');
  const cliList = spawnSync(process.execPath, [cli, 'list', '--json'], { cwd: project2, encoding: 'utf8' });
  const listed = cliList.status === 0 ? JSON.parse(cliList.stdout) : null;
  check(listed?.open?.length === 1, 'managed-project CLI lists unresolved incidents');

  const auditor = path.join(ROOT, 'scripts', 'audit-forge-diagnostics.mjs');
  const fleet = spawnSync(process.execPath, [auditor, '--workspace', tmp, '--since', 'all', '--json'], { cwd: ROOT, encoding: 'utf8' });
  const fleetResult = fleet.status === 0 ? JSON.parse(fleet.stdout) : null;
  check(fleetResult?.projectsScanned === 2 && fleetResult?.openIncidents === 1, 'fleet auditor discovers managed siblings and current open state');
  check(fleetResult?.groups?.[0]?.code === 'ADAPTER_FORMAT_WRONG', 'fleet auditor groups incidents by stable behavioral class');

  const pluginVersion = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const giga = fs.readFileSync(path.join(ROOT, 'scripts', 'gigachat-agent.mjs'), 'utf8');
  const audited = giga.match(/const AUDITED_FORGE_VERSION = '([^']+)'/)?.[1];
  check(audited === pluginVersion, 'GigaChat audited contract matches the shipped Forge version');
  check(/'forge_diagnostic_report'/.test(giga) && /call forge_diagnostic_report immediately/.test(giga), 'GigaChat exposes and mandates native behavioral reporting');

  const neutral = fs.readFileSync(path.join(ROOT, 'FORGE.project.md'), 'utf8');
  const generator = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-agents-md.mjs'), 'utf8');
  check(/forge-event\.mjs report/.test(neutral) && /forge-event\.mjs report/.test(generator), 'generic and Codex generated instructions mandate the same logger');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.log(`\nFAILED: ${failures.length} issue(s)`);
  process.exit(1);
}
console.log('\nPASS: Forge behavioral diagnostics are safe, durable, resolvable, and fleet-auditable');
