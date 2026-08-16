#!/usr/bin/env node
/**
 * @file check-workspace-discipline.mjs
 * @description Audit workspace discipline — find files modified outside WorkProgress/.
 *
 *              Forge rule: ALL active edits happen in WorkProgress/{Project}/.
 *              GameIntegration/ is read-only sources.
 *              Release/{X}/ is read-only (only release-* skills write).
 *
 *              This script scans `git status` for modified/new files outside
 *              WorkProgress/. If found — flag them.
 *
 *              Usage:
 *                node scripts/check-workspace-discipline.mjs        # audit current dir
 *                node scripts/check-workspace-discipline.mjs <path> # audit specific project
 *                node scripts/check-workspace-discipline.mjs --json # machine-readable
 *
 *              Exit:
 *                0 — no violations
 *                1 — found edits outside WorkProgress/
 *                2 — invocation error (not a git repo, etc)
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const JSON_MODE = args.includes('--json');

const ROOT = path.resolve(positional[0] || process.cwd());

function output(data) {
  if (JSON_MODE) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (data.error) {
      console.error(`✗ ${data.error}`);
      return;
    }
    if (data.violations.length === 0) {
      console.log('✓ Workspace discipline clean — no edits outside WorkProgress/.');
      return;
    }
    console.log(`✗ ${data.violations.length} violation(s):\n`);
    for (const v of data.violations) {
      console.log(`  ${v.status}  ${v.file}`);
    }
    console.log('');
    console.log('Forge rule: ALL active edits in WorkProgress/{Project}/.');
    console.log('Move any active work to WorkProgress/, leave GameIntegration/ and Release/ untouched.');
  }
}

// Verify git repo
try {
  execSync('git rev-parse --git-dir', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  // Не-git папка: проверка неприменима, это НЕ ошибка. Молчим и выходим 0 —
  // иначе Claude Code показывает вывод хука как "hook error" (кейс 02.08.2026).
  process.exit(0);
}

// Get git status
let statusOutput = '';
try {
  statusOutput = execSync('git status --porcelain=v1', {
    stdio: ['ignore', 'pipe', 'ignore'],
    cwd: ROOT,
    encoding: 'utf-8',
  });
} catch (e) {
  output({ error: `git status failed: ${e.message}` });
  process.exit(2);
}

if (!statusOutput.trim()) {
  output({ violations: [], message: 'no changes' });
  process.exit(0);
}

// Parse status output, find files outside WorkProgress/
const violations = [];
const lines = statusOutput.split('\n').filter(l => l.trim());

for (const line of lines) {
  // Format: XY <space> file
  const match = line.match(/^(.{2})\s+(.+)$/);
  if (!match) continue;
  const [, status, file] = match;

  // Untracked + ignored: skip — those aren't "active edits"
  if (status === '??' || status === '!!') continue;

  // Check if file path is outside WorkProgress/
  const segments = file.split('/').filter(Boolean);
  const isInWorkProgress = segments.includes('WorkProgress');
  const isInGameIntegration = segments.includes('GameIntegration');
  const isInRelease = segments.includes('Release');

  // We flag: edits inside GameIntegration/ OR Release/ subpaths (not toplevel)
  if (isInGameIntegration) {
    violations.push({ status: status.trim(), file, reason: 'inside GameIntegration/ (read-only)' });
  } else if (isInRelease) {
    const releaseIdx = segments.indexOf('Release');
    const afterRelease = segments.length - releaseIdx - 1;
    if (afterRelease > 0) {
      violations.push({ status: status.trim(), file, reason: 'inside Release/ subpath (only release-* skills write here)' });
    }
  }
}

output({ violations });
process.exit(violations.length > 0 ? 1 : 0);
