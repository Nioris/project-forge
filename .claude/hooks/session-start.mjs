/**
 * @file session-start.mjs
 * @description SessionStart hook — injects project context at every entry point:
 *              startup, resume, compact. Reads `source` from stdin.
 *
 *              Inject order (most volatile last):
 *                1. Compaction banner (only if source === "compact")
 *                2. context-essentials.md — sticky rules
 *                3. wiki/_current.md — active session state
 *                4. wiki/_plan.md summary — in_progress tasks with next steps
 *                5. wiki/_map.md — project-wide status
 *                6. Recent session logs (3 days, auto-discover old + new layout)
 *                7. Protocol reminder
 *
 *              Reads sessions from BOTH layouts for backward compatibility:
 *                - new: wiki/sessions/YYYY/MM/DD.md
 *                - old: wiki/sessions/YYYY-MM-DD.md
 *
 * @input  JSON via stdin  { session_id, source, cwd, ... }
 * @output JSON with hookSpecificOutput.additionalContext
 */

import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadPlan } from './lib/parse-plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const CAP_MAP = 8000;
const CAP_CURRENT = 3000;
const CAP_ESSENTIALS = 4000;
const CAP_LOG = 2500;
const LOG_DAYS = 3;

function readCapped(path, cap) {
  if (!existsSync(path)) return null;
  let s = readFileSync(path, 'utf-8');
  if (s.length > cap) {
    const head = s.substring(0, Math.floor(cap * 0.3));
    const tail = s.substring(s.length - Math.floor(cap * 0.7));
    s = head + '\n...(middle trimmed — read full file)...\n' + tail;
  }
  return s;
}

function parseSource(raw) {
  try {
    const data = JSON.parse(raw || '{}');
    return String(data.source || 'startup');
  } catch {
    return 'startup';
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Enumerate the last N session log files across BOTH layouts:
 *   wiki/sessions/YYYY/MM/DD.md  (new)
 *   wiki/sessions/YYYY-MM-DD.md  (old, flat)
 * Returns an array of absolute paths, most-recent first.
 */
function recentSessionLogs(days) {
  const sessRoot = join(root, 'wiki', 'sessions');
  if (!existsSync(sessRoot)) return [];
  const found = []; // { date, path }

  // New nested layout
  try {
    for (const yyyy of readdirSync(sessRoot)) {
      if (!/^\d{4}$/.test(yyyy)) continue;
      const yDir = join(sessRoot, yyyy);
      for (const mm of readdirSync(yDir)) {
        if (!/^\d{2}$/.test(mm)) continue;
        const mDir = join(yDir, mm);
        for (const f of readdirSync(mDir)) {
          const m = f.match(/^(\d{2})\.md$/);
          if (!m) continue;
          found.push({
            date: `${yyyy}-${mm}-${m[1]}`,
            path: join(mDir, f),
          });
        }
      }
    }
  } catch { /* ignore — partial layout ok */ }

  // Old flat layout
  try {
    for (const f of readdirSync(sessRoot)) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
      if (!m) continue;
      const path = join(sessRoot, f);
      if (!statSync(path).isFile()) continue;
      // Avoid double-counting if migrated already.
      if (found.some(x => x.date === m[1])) continue;
      found.push({ date: m[1], path });
    }
  } catch { /* ignore */ }

  found.sort((a, b) => b.date.localeCompare(a.date));
  return found.slice(0, days);
}

/**
 * Compact summary of the plan: in_progress tasks, counts of planned/done.
 */
function planSummary() {
  let tasks;
  try { tasks = loadPlan(); } catch { return null; }
  if (!tasks.length) return null;

  const groups = { in_progress: [], planned: [], blocked: [], done: [] };
  for (const t of tasks) {
    if (groups[t.status]) groups[t.status].push(t);
    else groups.planned.push(t);
  }

  const lines = [];
  if (groups.in_progress.length) {
    lines.push('### In progress');
    for (const t of groups.in_progress) {
      const p = t.acceptance;
      const prog = p.total ? ` [${p.done}/${p.total}]` : '';
      lines.push(`- **${t.id}** ${t.title}${prog}`);
      if (t.acceptance.next) lines.push(`  next: ${t.acceptance.next}`);
      if (t.files.length)    lines.push(`  files: ${t.files.join(', ')}`);
    }
  }
  if (groups.blocked.length) {
    lines.push('### Blocked');
    for (const t of groups.blocked) lines.push(`- ${t.id} ${t.title}`);
  }
  if (groups.planned.length) {
    lines.push('### Planned (next up)');
    for (const t of groups.planned.slice(0, 5)) lines.push(`- ${t.id} ${t.title}`);
    if (groups.planned.length > 5) {
      lines.push(`- ...and ${groups.planned.length - 5} more`);
    }
  }
  lines.push(`### Done: ${groups.done.length} task(s)`);
  return lines.join('\n');
}

// ── Страховка данных: снимок пользовательских файлов не чаще раза в сутки ──
// Обновление движка ставит папку чистой заменой; если пользователь забыл backup-data.mjs,
// свежая копия всё равно лежит в forge-data/backups (полевой инцидент 31.07.2026).
function snapshotUserData() {
  try {
    const dataDir = resolve(__dirname, '..', '..', '..', 'forge-data'); // .claude/hooks → движок → рядом
    const src = join(dataDir, 'asset-library.json');
    if (!existsSync(src)) return;
    const bdir = join(dataDir, 'backups');
    mkdirSync(bdir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const dest = join(bdir, `asset-library.json.${today}.bak`);
    if (existsSync(dest)) return;                       // уже делали сегодня
    copyFileSync(src, dest);
    const mine = readdirSync(bdir).filter(f => f.startsWith('asset-library.json.')).sort();
    while (mine.length > 10) { try { unlinkSync(join(bdir, mine.shift())); } catch {} }
  } catch {}
}

function run() {
  snapshotUserData();
  let rawStdin = '';
  try { rawStdin = readFileSync(0, 'utf-8'); } catch {}
  const source = parseSource(rawStdin);

  const parts = [];

  // 1. Compaction banner
  if (source === 'compact') {
    parts.push(
      '=== ⚠ COMPACTION DETECTED ===',
      'Your prior context was summarised. Treat the notes below as the',
      'ONLY source of truth about this project state. Re-read wiki/_map.md',
      'and wiki/_current.md in full before continuing work.',
      ''
    );
  } else if (source === 'resume') {
    parts.push('=== Session resumed ===', '');
  }

  // 2. Context essentials
  const essentials = readCapped(
    join(root, '.claude', 'context-essentials.md'),
    CAP_ESSENTIALS
  );
  if (essentials) {
    parts.push('=== CONTEXT ESSENTIALS (wiki protocol & hard nevers) ===');
    parts.push(essentials);
    parts.push('');
  }

  // 3. Current session state
  const current = readCapped(join(root, 'wiki', '_current.md'), CAP_CURRENT);
  if (current) {
    parts.push('=== CURRENT SESSION STATE (wiki/_current.md) ===');
    parts.push(current);
    parts.push('');
  } else {
    parts.push(
      '=== wiki/_current.md NOT FOUND ===',
      'Before writing any code this session, fill wiki/_current.md using',
      'the template at wiki/_current.md.template. It is the single source',
      'of truth for "what we are doing right now".',
      ''
    );
  }

  // 4. Plan summary
  const plan = planSummary();
  if (plan) {
    parts.push('=== PLAN SUMMARY (wiki/plan/) ===');
    parts.push(plan);
    parts.push('');
  }

  // 5. Project map
  const map = readCapped(join(root, 'wiki', '_map.md'), CAP_MAP);
  if (map) {
    parts.push('=== PROJECT MAP (wiki/_map.md) ===');
    parts.push(map);
    parts.push('');
  } else {
    parts.push(
      '=== wiki/_map.md NOT FOUND ===',
      'This project has no wiki yet. Run /game or /app to begin (or /continue to resume).'
    );
  }

  // 6. Recent session logs (from both layouts)
  const recent = recentSessionLogs(LOG_DAYS);
  if (recent.length > 0) {
    parts.push('=== RECENT SESSION LOGS (last ' + LOG_DAYS + ' days) ===');
    for (const { path: p } of recent) {
      const content = readCapped(p, CAP_LOG);
      if (content) {
        parts.push(content);
        parts.push('');
      }
    }
  }

  // 7. Protocol reminder
  parts.push(
    '=== WIKI PROTOCOL REMINDER ===',
    'Before coding: check wiki/_current.md "Active task" and wiki/plan/ in_progress.',
    'After each meaningful edit: update wiki/_current.md progress.',
    'On new feature: create wiki/features/<n>.md AND link in wiki/_map.md.',
    'On architectural choice: create wiki/decisions/<NNN>-<n>.md.',
    'On mistake: append to wiki/pitfalls.md.',
    'Edit a file outside active task files: plan-check will warn you.',
    'End of session: wiki-audit will block stop if docs are out of sync.'
  );

  const additionalContext = parts.join('\n').trim();
  if (!additionalContext) {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  process.stdout.write(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  }));
}

try { run(); } catch {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
}
