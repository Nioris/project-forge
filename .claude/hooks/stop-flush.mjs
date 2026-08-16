/**
 * @file stop-flush.mjs
 * @description Stop hook — runs wiki-audit.mjs and BLOCKS the stop if any
 *              finding is present. No once-per-day flag: every stop attempt
 *              is audited until findings are cleared.
 *
 *              Escape hatch: set env FORGE_SKIP_AUDIT=1 to bypass.
 *              This is logged to wiki/sessions/YYYY/MM/DD.md — not silent.
 *
 * @input  JSON via stdin
 * @output { decision: "block", reason: "..." } or { continue: true }
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { auditToday } from './wiki-audit.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function pad(n) { return String(n).padStart(2, '0'); }

function todayLogPath() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const dir = join(root, 'wiki', 'sessions', yyyy, mm);
  const file = join(dir, `${dd}.md`);
  return { dir, file, dateStr: `${yyyy}-${mm}-${dd}` };
}

function run() {
  try { readFileSync(0, 'utf-8'); } catch {}

  if (process.env.FORGE_SKIP_AUDIT === '1') {
    logBypass();
    process.stdout.write('{"continue":true,"suppressOutput":true}');
    return;
  }

  let result;
  try { result = auditToday(); }
  catch {
    process.stdout.write('{"continue":true,"suppressOutput":true}');
    return;
  }

  if (result.ok) {
    process.stdout.write('{"continue":true,"suppressOutput":true}');
    return;
  }

  // v4.10.4: terse output. Previously 6 lines pushed user questions out of view.
  // Aim: 2 lines max, with explicit "finish wiki then end turn" guidance for the AI
  // so it doesn't keep working past user-facing questions.
  const issueList = result.findings.map((f, i) => `${i + 1}) ${f}`).join('; ');
  const reason = `Wiki out of sync — fix BEFORE asking user questions or ending turn: ${issueList}. Bypass: FORGE_SKIP_AUDIT=1.`;

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason,
  }));
}

function logBypass() {
  try {
    const { dir, file, dateStr } = todayLogPath();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const now = new Date();
    const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    if (!existsSync(file)) {
      writeFileSync(
        file,
        `---\ndate: ${dateStr}\ntags: [session]\n---\n\n# Session — ${dateStr}\n\n`,
        'utf-8'
      );
    }
    appendFileSync(
      file,
      `- ${stamp} **⚠ bypass** FORGE_SKIP_AUDIT=1 — wiki audit skipped on stop\n`,
      'utf-8'
    );
  } catch { /* silent */ }
}

try { run(); } catch {
  process.stdout.write('{"continue":true,"suppressOutput":true}');
}
