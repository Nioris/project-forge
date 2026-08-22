#!/usr/bin/env node
/**
 * @file post-tool-capture.mjs
 * @description Codex PostToolUse logger. Records Bash and apply_patch activity without Claude-only output fields.
 * @dependencies .codex/hooks/lib.mjs
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePath, readHookInput, touchedPaths } from './lib.mjs';
import { appendForgeDiagnostic } from '../../.claude/hooks/lib/forge-diagnostics.mjs';

function pad(n) { return String(n).padStart(2, '0'); }
let diagnosticRoot = process.cwd();
try {
const data = readHookInput();
const cwd = data.cwd || process.cwd();
diagnosticRoot = cwd;
const now = new Date();
const yyyy = String(now.getFullYear()), mm = pad(now.getMonth() + 1), dd = pad(now.getDate());
const dir = join(cwd, 'wiki', 'sessions', yyyy, mm);
const file = join(dir, `${dd}.md`);
mkdirSync(dir, { recursive: true });
if (!existsSync(file)) writeFileSync(file, `---\ndate: ${yyyy}-${mm}-${dd}\ntags: [session]\n---\n\n# Session — ${yyyy}-${mm}-${dd}\n\n`, 'utf8');
const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
const toolName = String(data.tool_name || 'tool');
const paths = touchedPaths(data).map(p => normalizePath(p, cwd));
if (paths.length) {
  appendFileSync(file, `- ${stamp} **Codex:${toolName}** ${paths.map(p => `\`${p}\``).join(', ')}\n`, 'utf8');
} else if (toolName === 'Bash') {
  let command = String(data.tool_input?.command || '').replace(/\r?\n/g, ' ').trim();
  if (command.length > 180) command = command.slice(0, 180) + '…';
  command = command.replace(/`/g, "'");
  if (command) appendFileSync(file, `- ${stamp} **Codex:Bash** \`${command}\`\n`, 'utf8');
}
} catch (error) {
  appendForgeDiagnostic(diagnosticRoot, {
    severity: 'error', code: 'CODEX_POST_TOOL_CAPTURE_EXCEPTION', kind: 'hook_failure', source: 'hook', host: 'codex',
    component: 'codex-post-tool-capture', operation: 'capture', message: error?.message || 'Unexpected Codex post-tool hook failure',
  });
}
