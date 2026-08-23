#!/usr/bin/env node
/** Bridge existing Claude Bash guards into structured Codex PreToolUse deny decisions. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendForgeDiagnostic } from '../../.claude/hooks/lib/forge-diagnostics.mjs';
import { writePreToolDeny } from './lib.mjs';

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch {}
let input = {};
try { input = raw ? JSON.parse(raw) : {}; } catch {}
const projectRoot = path.resolve(input?.cwd || process.cwd());
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guards = [
  { script: path.join(root, '.claude', 'hooks', 'block-dangerous.mjs'), code: 'CODEX_DANGEROUS_COMMAND_DENIED', component: 'block-dangerous' },
  { script: path.join(root, '.claude', 'hooks', 'approval-gate.mjs'), code: 'CODEX_ASSET_APPROVAL_DENIED', component: 'approval-gate' },
];

for (const guard of guards) {
  const result = spawnSync(process.execPath, [guard.script], {
    cwd: projectRoot, input: raw, encoding: 'utf8', windowsHide: true,
  });
  if (result.status === 0) continue;
  const reason = String(result.stderr || result.stdout || `${guard.component} exited ${result.status}`).trim().slice(0, 4000);
  const expectedBlock = result.status === 2;
  appendForgeDiagnostic(projectRoot, {
    severity: expectedBlock ? 'warn' : 'error',
    code: expectedBlock ? guard.code : 'CODEX_BASH_GUARD_FAILURE',
    kind: expectedBlock ? 'policy_guard' : 'hook_failure', source: 'hook', host: 'codex',
    component: `codex-${guard.component}`, operation: 'Bash',
    message: expectedBlock ? 'Codex Bash command was denied by Project Forge policy.' : 'Codex Bash policy guard failed closed.',
    expected: 'A successful policy evaluation before Bash execution.', actual: reason,
  });
  writePreToolDeny(reason || 'Blocked by Project Forge Bash policy.');
  process.exit(0);
}
