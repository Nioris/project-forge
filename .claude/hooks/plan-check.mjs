/**
 * @file plan-check.mjs
 * @description PreToolUse hook for Write|Edit|MultiEdit — detects when the
 *              agent is editing a file that is NOT in the files: list of any
 *              in_progress task in wiki/plan/.
 *
 *              Behaviour:
 *                - If no plan exists (wiki/plan/ empty) → allow, no warning.
 *                - If plan exists but 0 tasks are in_progress → inject a
 *                  reminder to set one in_progress.
 *                - If file is in scope → allow, silent.
 *                - If file is out of scope → allow, but inject a warning
 *                  into the context via hookSpecificOutput.additionalContext
 *                  so the model sees it. NEVER blocks — that's Stop's job.
 *
 *              We don't block edits mid-flow because that breaks UX. The
 *              signal is informational; the Stop audit is enforcement.
 *
 * @input  JSON via stdin  { tool_name, tool_input, ... }
 * @output JSON — always { continue: true }, sometimes with warning context
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadActive, isInScope } from './lib/parse-plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function allow(extraContext) {
  const out = { continue: true, suppressOutput: true };
  if (extraContext) {
    out.hookSpecificOutput = {
      hookEventName: 'PreToolUse',
      additionalContext: extraContext,
    };
  }
  process.stdout.write(JSON.stringify(out));
}

function run() {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch {}
  if (!raw) { allow(); return; }

  let data;
  try { data = JSON.parse(raw); } catch { allow(); return; }

  const toolName = String(data.tool_name || '');
  if (!/^(Write|Edit|MultiEdit)$/.test(toolName)) { allow(); return; }

  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

  // Skip wiki files — writing docs is always in scope.
  if (/\/wiki\//.test(filePath) || /[\\/]wiki[\\/]/.test(filePath)) {
    allow(); return;
  }

  // Skip files outside the repo (absolute paths to /tmp, etc.)
  // and dotfiles/config.
  if (!filePath) { allow(); return; }

  const planDir = join(root, 'wiki', 'plan');
  if (!existsSync(planDir)) { allow(); return; }  // no plan → no drift check

  let active;
  try { active = loadActive(); } catch { allow(); return; }

  if (active.length === 0) {
    // Plan exists but nothing is in_progress — remind, don't block.
    allow(
      '⚠ Plan drift: no task is marked `status: in_progress` in wiki/plan/.\n' +
      'Before editing source files, either mark an existing task in_progress ' +
      'or create a new task in wiki/plan/. See wiki/plan/_template.md.'
    );
    return;
  }

  const scope = isInScope(filePath, active);
  if (scope.inScope) { allow(); return; }

  // Out of scope — warn with STATIC text (cache-stable).
  //
  // We deliberately omit the {filePath} and the enumeration of active tasks
  // from this message. Reason: Claude Code injects additionalContext into the
  // PreToolUse turn, and if that content is unique on every call (because it
  // contains the current file path or changing task list), it breaks prompt
  // caching from that turn forward. Unique injection = cache miss = ~10× cost
  // on that turn's prefix.
  //
  // The signal ("drift!") is preserved. If Claude needs the specifics, it can
  // Read wiki/plan/ — that Read is itself cache-friendly once the file is
  // stable. The old version with interpolated filePath + enumerated tasks is
  // kept as a comment for reference; do NOT restore without understanding the
  // cache cost.
  //
  // See CLAUDE.md "Hook authoring: cache-stable additionalContext" for the
  // general rule.

  const warning = [
    '⚠ Plan drift: editing a file outside any in_progress task\'s scope.',
    '',
    'Before continuing, read wiki/plan/ and decide:',
    '  (a) add this file to the relevant task\'s `files:` list, or',
    '  (b) mark the current task `status: done` and start a new one, or',
    '  (c) log as an unplanned pitfall in wiki/pitfalls.md if it is a side-quest.',
    '',
    'This is informational — the edit proceeds. Stop audit will block the ',
    'session from ending if plan and wiki fall out of sync.',
  ].join('\n');

  allow(warning);
}

try { run(); } catch {
  process.stdout.write('{"continue":true,"suppressOutput":true}');
}
