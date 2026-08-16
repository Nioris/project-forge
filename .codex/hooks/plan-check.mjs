#!/usr/bin/env node
/**
 * @file plan-check.mjs
 * @description Codex PreToolUse plan-scope reminder for apply_patch/file edits.
 * @dependencies .codex/hooks/lib.mjs, .claude/hooks/lib/parse-plan.mjs
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadActive, isInScope } from '../../.claude/hooks/lib/parse-plan.mjs';
import { normalizePath, readHookInput, touchedPaths } from './lib.mjs';

const data = readHookInput();
const cwd = data.cwd || process.cwd();
const paths = touchedPaths(data).map(p => normalizePath(p, cwd));
if (!paths.length || !existsSync(join(cwd, 'wiki', 'plan'))) process.exit(0);
let active = [];
try { active = loadActive(); } catch { process.exit(0); }
if (!active.length) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Forge plan drift: source editing started while no wiki/plan task is in_progress. Mark or create the active task before continuing substantial work.',
    },
  }));
  process.exit(0);
}
const outOfScope = paths.filter(p => !/(^|\/)wiki\//.test(p) && !isInScope(p, active).inScope);
if (outOfScope.length) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Forge plan drift: this edit touches files outside every in_progress task. Read wiki/plan/, update the task files/scope or record the side-quest before finishing the turn.',
    },
  }));
}
