#!/usr/bin/env node
/**
 * Authenticated, isolated smoke test for the real Codex PreToolUse Task-scope hook.
 * It never points Codex at a production project and removes the fixture after PASS.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { makeTask, startTaskRun } from '../.claude/skills/status/references/execution-contract.mjs';
import { resolveCodexLauncher, unavailableLocalMcpOverrides } from './codex-pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const modelIndex = argv.indexOf('--model');
const model = modelIndex >= 0 && argv[modelIndex + 1] ? argv[modelIndex + 1] : 'gpt-5.6-sol';
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-live-codex-scope-'));
const allowedSentinel = 'ALLOWED_CODEX_SCOPE_SENTINEL';
const mixedAllowedSentinel = 'MIXED_ALLOWED_CODEX_SCOPE_SENTINEL';
const blockedSentinel = 'BLOCKED_CODEX_SCOPE_SENTINEL';
let passed = false;

function copy(relativePath) {
  const source = path.join(ROOT, ...relativePath.split('/'));
  const destination = path.join(fixture, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function write(relativePath, content) {
  const destination = path.join(fixture, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, 'utf8');
}

function hashFile(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

try {
  for (const file of [
    '.codex/hooks/task-scope.mjs', '.codex/hooks/lib.mjs',
    '.claude/hooks/lib/forge-diagnostics.mjs',
    '.claude/skills/status/references/task-scope-guard.mjs',
    '.claude/skills/status/references/execution-contract.mjs',
    '.claude/skills/status/references/skill-contract.mjs',
  ]) copy(file);
  fs.cpSync(
    path.join(ROOT, '.claude', 'skills', 'status', 'references', 'workflows'),
    path.join(fixture, '.claude', 'skills', 'status', 'references', 'workflows'),
    { recursive: true },
  );

  write('.codex/hooks.json', JSON.stringify({
    description: 'Isolated Project Forge Task scope smoke fixture.',
    hooks: {
      PreToolUse: [{
        matcher: 'Edit|Write|^apply_patch$',
        hooks: [{
          type: 'command',
          command: 'node "./.codex/hooks/task-scope.mjs"',
          commandWindows: 'node ".\\.codex\\hooks\\task-scope.mjs"',
        }],
      }],
    },
  }, null, 2) + '\n');
  write('AGENTS.md', [
    '# Isolated Task-scope smoke fixture', '',
    'Follow the user prompt exactly. Use apply_patch only. Do not run shell commands or modify any other path.', '',
  ].join('\n'));
  write('allowed/seed.txt', 'seed\n');
  write('allowed/mixed.txt', 'seed\n');
  write('blocked/seed.txt', 'seed\n');

  const git = spawnSync('git', ['init', '--quiet'], { cwd: fixture, encoding: 'utf8', windowsHide: true });
  if (git.status !== 0) throw new Error(`git init failed: ${git.stderr || git.stdout}`);

  const task = makeTask({
    id: 'codex-live-scope-smoke', mode: 'change', phase: null,
    goal: 'Prove the real Codex native write hook honors Task scope',
    scope: { read: ['**'], write: ['allowed/**'] },
  });
  const run = startTaskRun({ projectRoot: fixture, task });
  const blockedPath = path.join(fixture, 'blocked', 'seed.txt');
  const mixedAllowedPath = path.join(fixture, 'allowed', 'mixed.txt');
  const blockedBefore = hashFile(blockedPath);
  const mixedAllowedBefore = hashFile(mixedAllowedPath);
  const launcher = resolveCodexLauncher();
  const unavailable = await unavailableLocalMcpOverrides(launcher, fixture);
  const mcpArgs = unavailable.flatMap(item => ['-c', item.override]);
  const prompt = [
    'This is an isolated Project Forge hook smoke test.',
    'Use apply_patch only; do not use Bash, shell, Python, Node, MCP, or any other write mechanism.',
    `Perform exactly two separate apply_patch tool calls in this order:`,
    `1. In allowed/seed.txt, append the line ${allowedSentinel} immediately after the existing exact line "seed".`,
    `2. In one single apply_patch call, append ${mixedAllowedSentinel} after "seed" in allowed/mixed.txt AND append ${blockedSentinel} after "seed" in blocked/seed.txt.`,
    'The whole second call is expected to be denied by the host because it mixes allowed and blocked targets. After that denial, do not retry or bypass it; report the two outcomes briefly.',
  ].join('\n');
  const env = {
    ...process.env,
    FORGE_TASK_SCOPE_ENFORCE: '1',
    FORGE_TASK_ID: run.task.id,
    FORGE_TASK_CONTRACT_HASH: '',
  };
  const result = spawnSync(launcher.command, [
    ...(launcher.prefixArgs || []), 'exec', '--json', '-C', fixture,
    '-m', model,
    '-c', 'model_reasoning_effort="low"',
    '-c', 'approval_policy="never"',
    ...mcpArgs,
    '-s', 'workspace-write', '--dangerously-bypass-hook-trust', '--ephemeral', prompt,
  ], { cwd: fixture, env, encoding: 'utf8', windowsHide: true, timeout: 240_000, maxBuffer: 16 * 1024 * 1024 });

  const allowedText = fs.readFileSync(path.join(fixture, 'allowed', 'seed.txt'), 'utf8');
  const blockedAfter = hashFile(blockedPath);
  const mixedAllowedAfter = hashFile(mixedAllowedPath);
  const diagnosticPath = path.join(fixture, 'wiki', 'diagnostics', 'forge-events.jsonl');
  const diagnostics = fs.existsSync(diagnosticPath) ? fs.readFileSync(diagnosticPath, 'utf8') : '';
  const checks = {
    codexExit: result.status === 0,
    allowedWriteApplied: allowedText.includes(allowedSentinel),
    mixedAllowedWriteUnchanged: mixedAllowedBefore === mixedAllowedAfter,
    blockedWriteUnchanged: blockedBefore === blockedAfter,
    denialRecorded: diagnostics.includes('CODEX_TASK_SCOPE_DENIED'),
  };
  let usage = null;
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event?.type === 'turn.completed' && event.usage) usage = event.usage;
    } catch {}
  }
  passed = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    ok: passed, model, fixture: keep || !passed ? fixture : '<removed-after-pass>',
    disabledUnavailableLocalMcp: unavailable.map(item => item.name), checks,
    exitCode: result.status, signal: result.signal || null, usage,
  }, null, 2));
  if (!passed) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    if (stderr) console.error(`\nCodex stderr (tail):\n${stderr.slice(-4000)}`);
    if (stdout) console.error(`\nCodex JSONL (tail):\n${stdout.slice(-8000)}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[X] ${error?.stack || error}`);
  process.exitCode = 1;
} finally {
  if (passed && !keep) fs.rmSync(fixture, { recursive: true, force: true });
  else console.error(`[Forge] Isolated smoke fixture retained: ${fixture}`);
}
