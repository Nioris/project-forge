#!/usr/bin/env node
/** Deterministic regression for Codex native Task write-scope enforcement. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTask, recordTaskResult, startTaskRun } from '../.claude/skills/status/references/execution-contract.mjs';
import { assertTaskWrite, authorizeTaskWrite, projectRelativePath, resolveActiveTaskScope, resolveTaskScopeAuthority, taskScopeMatches } from '../.claude/skills/status/references/task-scope-guard.mjs';

const failures = [];
const check = (value, label) => {
  console.log(`  ${value ? '✓' : '✗'} ${label}`);
  if (!value) failures.push(label);
};
const throws = fn => { try { fn(); return false; } catch { return true; } };

console.log('Project Forge native Task scope guard audit');
console.log('──────────────────────────────────────────');
check(taskScopeMatches('wiki/**', 'wiki/design/gdd.md') && taskScopeMatches('wiki/**', 'wiki/gdd.md')
  && taskScopeMatches('ANALYSIS.md', 'ANALYSIS.md') && !taskScopeMatches('wiki/**', 'assets/a.png'),
  'declared Task globs match nested project paths only');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-task-scope-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-task-scope-outside-'));
try {
  const task = makeTask({
    id: 'task-scope-fixture', mode: 'change', phase: 4, goal: 'Exercise native file scope guard',
    scope: { read: ['**'], write: ['WorkProgress/demo/**', 'wiki/**'] },
  });
  const run = startTaskRun({ projectRoot: tmp, task });
  const env = {
    FORGE_TASK_SCOPE_ENFORCE: '1', FORGE_TASK_ID: run.task.id,
    FORGE_TASK_CONTRACT_HASH: '',
  };
  fs.mkdirSync(path.join(tmp, 'wiki', 'phases'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'wiki', 'phases', 'phase-4.json'), JSON.stringify({
    schemaVersion: 3, phase: 4, state: 'in_progress', execution: { taskId: run.task.id },
  }));
  check(resolveActiveTaskScope({ projectRoot: tmp, phase: 4 }).active
    && assertTaskWrite({ projectRoot: tmp, phase: 4, target: 'wiki/from-phase.md', operation: 'fixture' }).target === 'wiki/from-phase.md'
    && !resolveActiveTaskScope({ projectRoot: tmp }).active,
  'a phase marker derives the exact Task scope while no-task/no-phase calls remain legacy-inactive');
  check(projectRelativePath(path.join(tmp, 'wiki', 'design.md'), tmp) === 'wiki/design.md'
    && projectRelativePath('../outside.md', tmp) === null,
  'native paths are normalized and project-root escape is rejected');
  const junction = path.join(tmp, 'WorkProgress', 'demo', 'outside-link');
  fs.mkdirSync(path.dirname(junction), { recursive: true });
  fs.symlinkSync(outside, junction, process.platform === 'win32' ? 'junction' : 'dir');
  check(projectRelativePath(path.join(junction, 'escape.txt'), tmp) === null,
    'nearest existing parent realpath rejects a junction/symlink write escape');
  check(authorizeTaskWrite({ projectRoot: tmp, paths: ['wiki/design.md', 'WorkProgress/demo/index.html'], env }).allowed,
    'native writes inside declared Task scope are allowed');
  const denied = authorizeTaskWrite({ projectRoot: tmp, paths: ['Release/game.zip'], env });
  check(!denied.allowed && /outside Task/.test(denied.reason),
    'native writes outside declared Task scope are denied');
  check(!authorizeTaskWrite({ projectRoot: tmp, paths: [], env }).allowed,
    'an unresolvable native write target fails closed while scope enforcement is active');
  check(!authorizeTaskWrite({ projectRoot: tmp, paths: ['wiki/valid.md', '../outside.md'], env }).allowed
    && !authorizeTaskWrite({ projectRoot: tmp, paths: ['wiki/valid.md', path.join(junction, 'escape.txt')], env }).allowed,
    'a mixed native write cannot hide an escaped or junction target behind an allowed path');
  check(authorizeTaskWrite({ projectRoot: tmp, paths: ['Release/game.zip'], env: {} }).allowed,
    'manual legacy Codex sessions stay compatible without an explicit Task scope binding');
  check(throws(() => resolveTaskScopeAuthority({ projectRoot: tmp, env: { FORGE_TASK_SCOPE_ENFORCE: '1' } })),
    'scope enforcement refuses an absent Task identity');
  check(throws(() => resolveTaskScopeAuthority({ projectRoot: tmp, env: { ...env, FORGE_TASK_CONTRACT_HASH: 'f'.repeat(64) } })),
    'scope enforcement refuses stale contract provenance');
  let blocked = startTaskRun({ projectRoot: tmp, task: makeTask({
    id: 'task-scope-blocked-fixture', mode: 'change', phase: 4, goal: 'Reject a terminal blocked Task',
    scope: { read: ['**'], write: ['wiki/**'] },
  }) });
  blocked = recordTaskResult({ projectRoot: tmp, taskId: blocked.task.id, result: {
    schemaVersion: 1, taskId: blocked.task.id, node: blocked.state.currentNode, attemptId: null,
    status: 'blocked', code: 'FIXTURE_BLOCKED', message: 'Fixture terminal block', host: 'fixture', phase: 4,
    evidence: [], checks: [], failure: { type: 'REQUIREMENT_CONFLICT', retryable: false, message: 'Fixture terminal block' }, stop: null, verification: null,
    createdAt: new Date().toISOString(),
  } });
  check(blocked.task.status === 'blocked' && throws(() => resolveActiveTaskScope({ projectRoot: tmp, taskId: blocked.task.id })),
    'a terminal blocked Task cannot authorize further model writes');
  const hook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.codex', 'hooks', 'task-scope.mjs');
  const hookInput = relativePath => JSON.stringify({
    cwd: tmp, tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Add File: ${relativePath}\n+x\n*** End Patch` },
  });
  const allowedHook = spawnSync(process.execPath, [hook], { input: hookInput('wiki/hook.md'), encoding: 'utf8', env: { ...process.env, ...env } });
  const deniedHook = spawnSync(process.execPath, [hook], { input: hookInput('Release/hook.zip'), encoding: 'utf8', env: { ...process.env, ...env } });
  let deniedDecision = null;
  try { deniedDecision = JSON.parse(deniedHook.stdout); } catch {}
  check(allowedHook.status === 0 && !allowedHook.stdout.trim() && deniedHook.status === 0
    && deniedDecision?.hookSpecificOutput?.permissionDecision === 'deny'
    && /outside Task/.test(deniedDecision?.hookSpecificOutput?.permissionDecisionReason || ''),
  'Codex PreToolUse hook returns a structured deny decision for apply_patch');
  const bashHook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.codex', 'hooks', 'bash-safety.mjs');
  const bashInput = command => JSON.stringify({ cwd: tmp, tool_name: 'Bash', tool_input: { command } });
  const safeBash = spawnSync(process.execPath, [bashHook], { input: bashInput('git status --short'), encoding: 'utf8' });
  const deniedBash = spawnSync(process.execPath, [bashHook], { input: bashInput('rm -rf /'), encoding: 'utf8' });
  let bashDecision = null;
  try { bashDecision = JSON.parse(deniedBash.stdout); } catch {}
  check(safeBash.status === 0 && !safeBash.stdout.trim() && deniedBash.status === 0
    && bashDecision?.hookSpecificOutput?.permissionDecision === 'deny',
  'Codex Bash bridge converts existing safety exit codes into structured deny decisions');
  const giga = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'gigachat-agent.mjs');
  const gigaShadow = spawnSync(process.execPath, [giga, '--project', tmp, '--self-test'], {
    encoding: 'utf8', env: { ...process.env, FORGE_SCOPE_SHADOW_PROBE: '1' },
  });
  check(gigaShadow.status === 0
    && /\[OK\] active Task resolves registered verifier from trusted engine despite local shadow/.test(gigaShadow.stdout)
    && /\[OK\] scope shadow probe leaves canonical verifier hash unchanged/.test(gigaShadow.stdout)
    && /\[OK\] active Task blocks unclassified shell execution fail-closed/.test(gigaShadow.stdout),
  'GigaChat active Task ignores a project-local shadow and blocks raw shell escapes');
  const diagnosticLog = path.join(tmp, 'wiki', 'diagnostics', 'forge-events.jsonl');
  check(fs.existsSync(diagnosticLog) && fs.readFileSync(diagnosticLog, 'utf8').includes('CODEX_TASK_SCOPE_DENIED'),
    'a blocked native write is recorded in local Forge behavioral diagnostics');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}

if (failures.length) process.exit(1);
console.log('\nPASS: Codex native file tools honor durable Task write scopes');
