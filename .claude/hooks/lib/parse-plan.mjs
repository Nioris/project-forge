/**
 * @file parse-plan.mjs
 * @description Reads `wiki/plan/*.md` files and extracts structured task
 *              data from their YAML frontmatter. Used by plan-check.mjs,
 *              wiki-audit.mjs, status-line.mjs, and session-start.mjs.
 *
 *              Task file shape:
 *                ---
 *                id: Q1-001
 *                title: VK Bridge auth
 *                status: planned | in_progress | blocked | done
 *                started: 2026-04-22
 *                deps: [Q1-000]
 *                files: [src/auth/vk.ts, src/lib/storage.ts]
 *                ---
 *                # Body (acceptance criteria as checkboxes, notes, etc.)
 *
 *              The parser is deliberately tiny — no YAML library dependency.
 *              It handles: strings, inline arrays `[a, b, c]`, and dashed
 *              lists. No nested maps. If the file is malformed, the task
 *              is skipped (with a warning logged to stderr when CLI).
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..', '..');  // .claude/hooks/lib → repo root

/**
 * Parse a minimal subset of YAML frontmatter.
 * Returns {} on any error.
 *
 * @param {string} raw
 * @returns {object}
 */
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const body = m[1];
  const out = {};
  const lines = body.split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Dash list item (continuation of previous key)
    if (/^\s*-\s+/.test(line) && currentList) {
      currentList.push(line.replace(/^\s*-\s+/, '').trim());
      continue;
    }

    // "key: value" (or "key:" to open a list)
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();

    if (value === '') {
      // Open a list.
      out[key] = [];
      currentKey = key;
      currentList = out[key];
    } else if (/^\[.*\]$/.test(value)) {
      // Inline array: [a, b, c]
      const inner = value.slice(1, -1).trim();
      out[key] = inner
        ? inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
        : [];
      currentKey = null;
      currentList = null;
    } else {
      // Scalar
      out[key] = value.replace(/^["']|["']$/g, '');
      currentKey = null;
      currentList = null;
    }
  }
  return out;
}

/**
 * Extract acceptance criteria from markdown body.
 * Looks for GitHub-style checkboxes anywhere in the body.
 *
 * @param {string} raw  full file contents
 * @returns {{done: number, total: number, next: string|null}}
 */
export function extractAcceptance(raw) {
  // Strip frontmatter before counting.
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const boxes = body.match(/^\s*-\s*\[[ xX]\].*$/gm) || [];
  let done = 0;
  let next = null;
  for (const b of boxes) {
    const checked = /\[[xX]\]/.test(b);
    if (checked) {
      done++;
    } else if (next === null) {
      next = b.replace(/^\s*-\s*\[\s\]\s*/, '').trim();
    }
  }
  return { done, total: boxes.length, next };
}

/**
 * Validate a task's frontmatter against the expected schema.
 * Returns an array of human-readable issues (empty if clean).
 *
 * This replaces the previous silent-skip behavior where malformed tasks
 * vanished without the user knowing. Now callers can surface warnings.
 *
 * @param {object} fm — parsed frontmatter
 * @param {string} filename — for the error message context
 * @returns {string[]} array of issue strings
 */
export function validateTask(fm, filename) {
  const issues = [];
  const VALID_STATUSES = new Set(['planned', 'in_progress', 'blocked', 'done']);

  // Required: id
  if (!fm.id) {
    issues.push(`${filename}: missing required field 'id'`);
  } else if (typeof fm.id !== 'string' && typeof fm.id !== 'number') {
    issues.push(`${filename}: 'id' must be string or number, got ${typeof fm.id}`);
  }

  // Required: title
  if (!fm.title) {
    issues.push(`${filename}: missing 'title'`);
  }

  // status — if present, must be one of the four
  if (fm.status !== undefined) {
    const s = String(fm.status).trim();
    if (!VALID_STATUSES.has(s)) {
      issues.push(
        `${filename}: status '${s}' is invalid. ` +
        `Use one of: ${[...VALID_STATUSES].join(', ')}. ` +
        `Common mistakes: 'doing' → 'in_progress', 'wip' → 'in_progress', 'waiting' → 'blocked', 'complete' → 'done'.`
      );
    }
  }

  // files — should be array (dashed list or inline [a, b])
  if (fm.files !== undefined && !Array.isArray(fm.files)) {
    issues.push(
      `${filename}: 'files' must be an array. ` +
      `Use dashed list: files:\\n  - src/a.js\\n  - src/b.js   OR inline: files: [src/a.js, src/b.js]`
    );
  }

  // deps — same
  if (fm.deps !== undefined && !Array.isArray(fm.deps)) {
    issues.push(`${filename}: 'deps' must be an array`);
  }

  // started — if present, should look like a date
  if (fm.started !== undefined && fm.started !== '') {
    const s = String(fm.started).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      issues.push(
        `${filename}: 'started' should be YYYY-MM-DD format, got '${s}'`
      );
    }
  }

  return issues;
}

/**
 * Load all tasks from wiki/plan/*.md. Returns an array of
 * { id, title, status, deps, files, started, acceptance, filePath }.
 * Files starting with "_" or "README" are skipped.
 *
 * @returns {Array<object>}
 */
export function loadPlan() {
  const planDir = join(root, 'wiki', 'plan');
  if (!existsSync(planDir)) return [];
  let entries;
  try { entries = readdirSync(planDir); } catch { return []; }

  const tasks = [];
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    if (name.startsWith('_')) continue;
    if (/^readme/i.test(name)) continue;
    const fullPath = join(planDir, name);
    let raw;
    try { raw = readFileSync(fullPath, 'utf-8'); } catch { continue; }

    const fm = parseFrontmatter(raw);

    // v4.6: validate schema, attach issues to the task (don't silent-skip).
    // If id is missing entirely, we still can't index the task — include it
    // with a synthetic id so the schema issue surfaces to user.
    const schemaIssues = validateTask(fm, name);

    tasks.push({
      id: String(fm.id || `<malformed:${name}>`),
      title: String(fm.title || ''),
      status: String(fm.status || 'planned'),
      deps: Array.isArray(fm.deps) ? fm.deps : [],
      files: Array.isArray(fm.files) ? fm.files : [],
      started: String(fm.started || ''),
      acceptance: extractAcceptance(raw),
      filePath: fullPath,
      fileName: name,
      schemaIssues,  // v4.6: array of human-readable validation problems
    });
  }
  // Sort: in_progress first, then by id.
  tasks.sort((a, b) => {
    const pri = (t) => t.status === 'in_progress' ? 0
                    : t.status === 'blocked'     ? 1
                    : t.status === 'planned'     ? 2
                    : 3;
    const p = pri(a) - pri(b);
    return p !== 0 ? p : a.id.localeCompare(b.id);
  });
  return tasks;
}

/**
 * Return ALL schema issues across all plan files. Useful for hooks/tools
 * that want to warn users about plan drift in one place.
 *
 * @returns {string[]}
 */
export function loadPlanIssues() {
  return loadPlan().flatMap(t => t.schemaIssues || []);
}

/**
 * Return only currently active (in_progress) tasks.
 */
export function loadActive() {
  return loadPlan().filter(t => t.status === 'in_progress');
}

/**
 * Check if a file path is within the "files:" list of any in_progress task.
 * Comparison normalises slashes and makes it case-insensitive on Windows-like
 * paths (trailing match).
 *
 * @param {string} filePath  absolute or repo-relative path
 * @param {Array}  tasks     result of loadActive()
 * @returns {{inScope: boolean, match?: object}}
 */
export function isInScope(filePath, tasks) {
  if (!filePath) return { inScope: true };
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
  const target = norm(filePath);
  // Strip repo prefix if present.
  const repoRel = target.includes(norm(root))
    ? target.slice(norm(root).length + 1)
    : target;

  for (const t of tasks) {
    for (const f of t.files) {
      const nf = norm(f);
      if (repoRel === nf || target === nf || target.endsWith('/' + nf)) {
        return { inScope: true, match: t };
      }
    }
  }
  return { inScope: false };
}

// CLI mode: `node .claude/hooks/lib/parse-plan.mjs`
const isCli = process.argv[1] && process.argv[1].endsWith('parse-plan.mjs');
if (isCli) {
  const tasks = loadPlan();
  if (tasks.length === 0) {
    console.log('(no tasks in wiki/plan/)');
    process.exit(0);
  }
  for (const t of tasks) {
    const prog = t.acceptance.total
      ? ` [${t.acceptance.done}/${t.acceptance.total}]`
      : '';
    console.log(`${t.status.padEnd(12)} ${t.id}  ${t.title}${prog}`);
    if (t.files.length) console.log('  files: ' + t.files.join(', '));
    if (t.status === 'in_progress' && t.acceptance.next) {
      console.log('  next:  ' + t.acceptance.next);
    }
  }
}
