/**
 * @file status-line.mjs
 * @description StatusLine hook — outputs a single line shown in Claude Code's
 *              status bar. Gives the user real-time visibility into what
 *              Claude thinks it's doing.
 *
 *              Format:
 *                [Q1-001] VK Bridge auth · 2/4 · → persist to dexie
 *
 *              Logic:
 *                1. Find the single in_progress task in wiki/plan/.
 *                2. Show id, title, progress, next unchecked item.
 *                3. If multiple in_progress → warn user that focus is split.
 *                4. If no plan → show what's in wiki/_current.md "Session goal".
 *                5. Fallback to "Project Forge" if nothing is set up.
 *
 *              Output must be a single line, under ~120 chars to avoid wrap.
 *              Must be fast — Claude Code calls this frequently.
 *
 * @output plain text (not JSON) — single line to stdout
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { loadPlan } from './lib/parse-plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const MAX_LEN = 110;

/**
 * Truncate a string to max length with ellipsis, preserving head.
 */
function trim(s, max) {
  if (!s) return '';
  return s.length > max ? s.substring(0, max - 1) + '…' : s;
}

/**
 * Detect project name. Order of preference (v4.9.4+):
 *   1. wiki/_map.md  "# Project Map — Foo"  or  "# Foo — Project Map"  → Foo
 *   2. package.json  "name": "foo"  → titlecase → Foo
 *   3. Project folder basename  "strategy-runner"  → titlecase → Strategy Runner
 *
 * Returns null if Forge itself (folder named project-forge / Project-forge).
 */
function projectName() {
  // Reject Forge itself — no point showing "Project Forge" в statusline of Forge meta-project
  const folder = basename(root);
  if (/^project-forge$/i.test(folder) || /^forge-v\d/i.test(folder)) return null;

  // 1. wiki/_map.md
  const mapPath = join(root, 'wiki', '_map.md');
  if (existsSync(mapPath)) {
    try {
      const first = readFileSync(mapPath, 'utf-8').split('\n')[0];
      // Match "# Project Map — Foo" or "# Foo — Project Map" or "# Foo"
      const m = first.match(/^#\s*(?:Project Map\s*[—–-]\s*)?(.+?)(?:\s*[—–-]\s*Project Map)?$/);
      if (m && m[1] && !/^project map$/i.test(m[1])) {
        return m[1].trim();
      }
    } catch {}
  }

  // 2. package.json
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name && typeof pkg.name === 'string') {
        return titlecase(pkg.name);
      }
    } catch {}
  }

  // 3. Folder basename
  return titlecase(folder);
}

function titlecase(s) {
  return s.replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extract "Session goal" line from wiki/_current.md.
 */
function currentGoal() {
  const p = join(root, 'wiki', '_current.md');
  if (!existsSync(p)) return null;
  let raw;
  try { raw = readFileSync(p, 'utf-8'); } catch { return null; }
  // Look for line after "## Session goal" heading, first non-empty non-italic.
  const m = raw.match(/^##\s*Session goal\s*\n([\s\S]*?)(?=\n##|\n$)/m);
  if (!m) return null;
  for (const line of m[1].split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('_') && t.endsWith('_')) continue;  // template placeholder
    if (t.startsWith('<!')) continue;
    return t.replace(/^[>*]\s*/, '');
  }
  return null;
}

function run() {
  const proj = projectName();
  const projPrefix = proj ? `${proj} · ` : '';

  let tasks;
  try { tasks = loadPlan(); } catch { tasks = []; }
  const active = tasks.filter(t => t.status === 'in_progress');

  if (active.length === 1) {
    const t = active[0];
    const p = t.acceptance;
    const progress = p.total ? ` · ${p.done}/${p.total}` : '';
    const nextBit = p.next ? ` · → ${trim(p.next, 50)}` : '';
    const line = `${projPrefix}[${t.id}] ${t.title}${progress}${nextBit}`;
    process.stdout.write(trim(line, MAX_LEN));
    return;
  }

  if (active.length > 1) {
    const ids = active.map(t => t.id).join(', ');
    process.stdout.write(trim(`${projPrefix}⚠ ${active.length} tasks in_progress: ${ids} — focus one`, MAX_LEN));
    return;
  }

  // No in_progress task — check _current.md
  const goal = currentGoal();
  if (goal) {
    process.stdout.write(trim(`${projPrefix}· ${goal}`, MAX_LEN));
    return;
  }

  // Nothing — minimal fallback (project name if available, else "Project Forge").
  process.stdout.write(proj || 'Project Forge · no active plan');
}

try { run(); } catch {
  process.stdout.write('');
}
