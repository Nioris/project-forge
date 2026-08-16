#!/usr/bin/env node
/**
 * Project Forge phase-state writer (v4.67.1).
 * Stores machine-readable phase progression in wiki/phases/ without treating chat/wiki prose as authority.
 *
 * Usage from a managed project root:
 *   node .claude/skills/status/references/phase-state.mjs start 1
 *   node .claude/skills/status/references/phase-state.mjs block 1 "Awaiting KPI approval"
 *   node .claude/skills/status/references/phase-state.mjs complete 1 wiki/architecture/metrics.md wiki/design/brief.md
 */
import fs from 'node:fs';
import path from 'node:path';

const PHASES = {
  1: 'Analyze', 2: 'Design', 3: 'Construct', 4: 'Visual', 5: 'Tech',
  6: 'Listing', 7: 'Test', 8: 'Release', 9: 'Live',
};

const [command, rawPhase, ...rest] = process.argv.slice(2);
const phase = Number(rawPhase);
if (!['start', 'block', 'complete', 'reopen'].includes(command) || !Number.isInteger(phase) || !PHASES[phase]) {
  console.error('Usage: phase-state.mjs <start|block|complete|reopen> <1..9> [reason|evidence paths...]');
  process.exit(2);
}

const root = process.cwd();
const outDir = path.join(root, 'wiki', 'phases');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `phase-${phase}.json`);
let prev = {};
try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
const now = new Date().toISOString();
let forgeVersion = null;
try { forgeVersion = JSON.parse(fs.readFileSync(path.join(root, '.forge-managed.json'), 'utf8')).forgeVersion || null; } catch {}

const record = {
  schemaVersion: 1,
  phase,
  name: PHASES[phase],
  state: prev.state || 'pending',
  startedAt: prev.startedAt || null,
  updatedAt: now,
  completedAt: prev.completedAt || null,
  reason: prev.reason || null,
  evidence: Array.isArray(prev.evidence) ? prev.evidence : [],
  forgeVersion,
};

if (command === 'start' || command === 'reopen') {
  record.state = 'in_progress';
  record.startedAt = command === 'reopen' ? now : (record.startedAt || now);
  record.completedAt = command === 'reopen' ? null : record.completedAt;
  record.reason = null;
} else if (command === 'block') {
  record.state = 'blocked';
  record.startedAt = record.startedAt || now;
  record.reason = rest.join(' ').trim() || 'Awaiting user decision or required evidence';
  record.completedAt = null;
} else if (command === 'complete') {
  record.state = phase === 9 ? 'ongoing' : 'complete';
  record.startedAt = record.startedAt || now;
  record.completedAt = now;
  record.reason = null;
  record.evidence = [...new Set(rest.map(x => x.replace(/\\/g, '/')).filter(Boolean))];
}

fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
console.log(`[OK] Phase ${phase} ${PHASES[phase]} -> ${record.state}${record.reason ? ` (${record.reason})` : ''}`);
