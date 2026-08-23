#!/usr/bin/env node
/**
 * @file check-pipeline-state.mjs
 * @description Compatibility entry point for the canonical nine-phase Forge status model.
 *              The retired Analyze/Metrics/Design/Build/Test/Release-ready/Release step
 *              detector was a second source of progression truth and is intentionally gone.
 *              This command now delegates to project-status.mjs and never infers a separate
 *              pipeline state.
 *
 * Usage:
 *   node scripts/check-pipeline-state.mjs [project-path] [--json]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const positional = args.filter(arg => !arg.startsWith('--'));
const projectRoot = path.resolve(positional[0] || '.');
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localStatus = path.join(projectRoot, '.claude', 'skills', 'status', 'references', 'project-status.mjs');
const engineStatus = path.join(scriptRoot, '.claude', 'skills', 'status', 'references', 'project-status.mjs');
const statusScript = fs.existsSync(localStatus) ? localStatus : engineStatus;

if (!fs.existsSync(statusScript)) {
  const error = `canonical project-status.mjs not found for ${projectRoot}`;
  if (jsonMode) console.log(JSON.stringify({ ok: false, error }));
  else console.error(`[X] ${error}`);
  process.exit(2);
}

const child = spawnSync(process.execPath, [statusScript, projectRoot, '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (child.status !== 0) {
  const error = (child.stderr || child.stdout || `project-status exited ${child.status}`).trim();
  if (jsonMode) console.log(JSON.stringify({ ok: false, error }));
  else console.error(`[X] ${error}`);
  process.exit(child.status || 2);
}

let status;
try { status = JSON.parse(child.stdout); }
catch (error) {
  if (jsonMode) console.log(JSON.stringify({ ok: false, error: `invalid project-status JSON: ${error.message}` }));
  else console.error(`[X] invalid project-status JSON: ${error.message}`);
  process.exit(2);
}

const skills = {
  1: 'phase-1-analyze', 2: 'phase-2-design', 3: 'phase-3-construct',
  4: 'phase-4-visual', 5: 'phase-5-tech', 6: 'phase-6-listing',
  7: 'phase-7-test', 8: 'phase-8-release', 9: 'phase-9-live',
};
const report = {
  ok: true,
  schemaVersion: 2,
  stateModel: 'canonical-nine-phases',
  compatibilityEntryPoint: 'check-pipeline-state',
  project: status.project,
  currentPhase: status.currentPhase,
  currentPhaseName: status.currentPhaseName,
  currentState: status.currentState,
  stopPoint: status.stopPoint,
  phases: status.phases,
  nextSkill: skills[status.currentPhase] || null,
  warnings: status.warnings || [],
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Project Forge canonical phase status — ${status.project}`);
console.log('(legacy command; progression comes only from wiki/phases + project-status)');
console.log('');
for (const phase of status.phases) {
  const mark = phase.state === 'complete' ? '[OK]'
    : phase.state === 'blocked' ? '[BLOCKED]'
      : phase.state === 'ongoing' ? '[LIVE]'
        : ['in_progress', 'partial'].includes(phase.state) ? '[..]' : '[ ]';
  console.log(`${mark} Phase ${phase.phase} — ${phase.name}${phase.source === 'marker' ? ' [marker]' : ''}`);
}
console.log('');
console.log(`Current: Phase ${status.currentPhase} ${status.currentPhaseName} (${status.currentState})`);
if (report.nextSkill) console.log(`Continue with: /${report.nextSkill}`);
if (status.stopPoint) console.log(`STOP: ${status.stopPoint}`);
for (const warning of report.warnings) console.log(`WARN: ${warning}`);
