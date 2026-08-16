/**
 * @file wiki-audit.mjs
 * @description Shared library used by stop-flush.mjs to detect undocumented
 *              work. Also invokable standalone:
 *                node .claude/hooks/wiki-audit.mjs
 *
 *              Checks:
 *                1. Source files edited today without a matching feature page
 *                2. Git commits today with "feat:" not reflected in changelog
 *                3. Build/deploy artifacts touched today without deploy-log entry
 *                4. wiki/_map.md mtime older than today's session log
 *                5. wiki/_current.md missing or stale
 *                6. Files edited today that are NOT in any plan task's files[]
 *                7. In_progress tasks whose acceptance criteria are all checked
 *                   (should be marked done)
 *
 *              Reads sessions from BOTH layouts:
 *                - new: wiki/sessions/YYYY/MM/DD.md
 *                - old: wiki/sessions/YYYY-MM-DD.md
 *
 * @export auditToday() — returns { findings: string[], ok: boolean }
 */

import {
  readFileSync, readdirSync, existsSync, statSync,
} from 'fs';
import { join, dirname, basename, extname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadPlan } from './lib/parse-plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function pad(n) { return String(n).padStart(2, '0'); }

function todayParts() {
  const d = new Date();
  return {
    yyyy: String(d.getFullYear()),
    mm: pad(d.getMonth() + 1),
    dd: pad(d.getDate()),
    full: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  };
}

/**
 * Return the path to today's session log, preferring the new nested layout
 * but falling back to the old flat one if the nested doesn't exist yet.
 */
function todayLogPath() {
  const { yyyy, mm, dd, full } = todayParts();
  const nested = join(root, 'wiki', 'sessions', yyyy, mm, `${dd}.md`);
  if (existsSync(nested)) return nested;
  const flat = join(root, 'wiki', 'sessions', `${full}.md`);
  if (existsSync(flat)) return flat;
  return nested;  // return the expected new path even if missing
}

function readSessionLog() {
  const p = todayLogPath();
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf-8');
}

function extractEditedSourceFiles(logText) {
  const files = new Set();
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(logText)) !== null) {
    const p = m[1];
    if (/^(src|app|lib|scripts)\//.test(p)) files.add(p);
  }
  return [...files];
}

/**
 * For a file like `src/auth/login.ts` → `auth`.
 * For a flat file like `src/auth.js` → `auth`.
 */
function featureKey(filePath) {
  const parts = filePath.split('/');
  if (parts.length < 2) return basename(filePath, extname(filePath));
  const second = parts[1];
  if (second.includes('.')) return basename(second, extname(second));
  return second;
}

function hasFeaturePage(key) {
  const dir = join(root, 'wiki', 'features');
  if (!existsSync(dir)) return false;
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    const kLow = key.toLowerCase();
    return files.some(f => f.toLowerCase().includes(kLow));
  } catch { return false; }
}

function todaysCommits() {
  try {
    const out = execSync(`git log --since=midnight --pretty=format:%s`, {
      stdio: ['ignore', 'pipe', 'ignore'],   // не-git папка: молчим, иначе Claude Code покажет hook error
      cwd: root, encoding: 'utf-8', timeout: 3000,
    });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch { return []; }
}

function changelogMentions(subject) {
  const p = join(root, 'wiki', 'changelog.md');
  if (!existsSync(p)) return false;
  const t = readFileSync(p, 'utf-8');
  const needle = subject.substring(0, 60).toLowerCase();
  return t.toLowerCase().includes(needle);
}

// Mtime tolerance for wiki sync check (v4.8+, lesson #24).
//
// Background: strict `mtime >= sessionStart` gave false positives when wiki
// files were edited within milliseconds of session log creation, or when
// filesystem clock skew (Windows FAT32 has 2-second granularity, NFS can drift).
//
// Real-world bug: user saves wiki/_current.md at 14:32:17.234, session log
// touched at 14:32:17.890 — strict comparison says "wiki not updated" even
// though it WAS just updated.
//
// Fix: allow wiki file mtime to be up to MTIME_TOLERANCE_MS earlier than session start.
// v4.10.2: bumped from 2s to 10s. Real-world race: between Write tool firing and
// session log append, multiple slow ops (lint, format, hook chain) can intervene.
const MTIME_TOLERANCE_MS = 10000;  // 10 seconds — covers FAT32 granularity + hook chain delay

// v4.9.3 fix: session log mtime advances every time post-tool-capture appends.
// This caused infinite loop — user updates wiki, but each touch/edit appends
// to session log, advancing log mtime past wiki mtime again.
//
// v4.10.2 robustness improvements:
//   - Combine frontmatter `date:` (YYYY-MM-DD) с first entry `HH:MM:SS`
//     для unambiguous local-timezone reconstruction
//   - Add 5-min grace period before parsed start time — accounts for session-start
//     hook firing slightly before first user tool call (template render etc.)
//   - Verbose mode via FORGE_WIKI_AUDIT_VERBOSE=1 для diagnostic output на stderr
//
// Strategies (in order of preference):
//   1. Frontmatter `date:` + first `HH:MM:SS` entry → exact local datetime
//   2. First entry only → today's date + entry time
//   3. Frontmatter `date:` only → start-of-day
//   4. Final fallback: file mtime (legacy)
let _sessionStartCache = null;
function sessionStartMs() {
  if (_sessionStartCache !== null) return _sessionStartCache;
  _sessionStartCache = _computeSessionStartMs();
  return _sessionStartCache;
}
function _computeSessionStartMs() {
  const log = todayLogPath();
  if (!existsSync(log)) return Date.now();
  let content;
  try { content = readFileSync(log, 'utf-8'); } catch { return statSync(log).mtimeMs; }

  const verbose = process.env.FORGE_WIKI_AUDIT_VERBOSE === '1';

  const dateMatch = content.match(/^date:\s*(\d{4})-(\d{2})-(\d{2})/m);
  const entryMatch = content.match(/^- (\d{2}):(\d{2}):(\d{2})\b/m);

  let result;
  let strategy;

  if (dateMatch && entryMatch) {
    // BEST: combine frontmatter date + first entry time
    const d = new Date(
      parseInt(dateMatch[1], 10),
      parseInt(dateMatch[2], 10) - 1,
      parseInt(dateMatch[3], 10),
      parseInt(entryMatch[1], 10),
      parseInt(entryMatch[2], 10),
      parseInt(entryMatch[3], 10),
      0
    );
    result = d.getTime();
    strategy = 'frontmatter+entry';
  } else if (entryMatch) {
    const d = new Date();
    d.setHours(parseInt(entryMatch[1], 10), parseInt(entryMatch[2], 10), parseInt(entryMatch[3], 10), 0);
    result = d.getTime();
    strategy = 'entry-only';
  } else if (dateMatch) {
    const d = new Date(
      parseInt(dateMatch[1], 10),
      parseInt(dateMatch[2], 10) - 1,
      parseInt(dateMatch[3], 10)
    );
    result = d.getTime();
    strategy = 'date-only';
  } else {
    // FALLBACK: never use the log's mtime here — it advances on every tool-call append
    // (post-tool-capture), which re-creates the exact race this function exists to prevent
    // (wiki edit at 18:43:44 looks "stale" vs log mtime 18:43:50). Prefer the log's BIRTH time
    // (when the session log was created = session start), then today's midnight. Both are fixed.
    try {
      const st = statSync(log);
      const birth = st.birthtimeMs && st.birthtimeMs > 0 ? st.birthtimeMs : 0;
      const ctime = st.ctimeMs || 0;
      // birthtime is ideal; if unavailable (some FS report 0), fall back to midnight, NOT mtime.
      if (birth > 0) { result = birth; strategy = 'birthtime-fallback'; }
      else {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        result = d.getTime(); strategy = 'midnight-fallback';
      }
    } catch {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      result = d.getTime(); strategy = 'midnight-fallback';
    }
  }

  // v4.10.2: 5-min grace period — session-start hook fires before first tool call,
  // template renders may touch wiki shortly before. Subtracting 5min ensures
  // legitimate session-start-time wiki edits aren't flagged stale.
  const GRACE_MS = 5 * 60 * 1000;
  result = result - GRACE_MS;

  if (verbose) {
    process.stderr.write(`[wiki-audit] sessionStartMs strategy=${strategy} result=${new Date(result).toISOString()} (after grace -5min)\n`);
  }

  return result;
}

function mapTouchedSinceSessionStart() {
  const map = join(root, 'wiki', '_map.md');
  if (!existsSync(map)) return true;
  // Use session START time (first entry timestamp), not log mtime.
  // Log mtime advances on every tool-call append → false positive feedback loop.
  return statSync(map).mtimeMs + MTIME_TOLERANCE_MS >= sessionStartMs();
}

function currentTouchedSinceSessionStart() {
  const cur = join(root, 'wiki', '_current.md');
  if (!existsSync(cur)) return false;
  return statSync(cur).mtimeMs + MTIME_TOLERANCE_MS >= sessionStartMs();
}

function buildRanToday(logText) {
  return /\*\*(build|build:android|build:docker|deploy|verify)\*\*/.test(logText);
}

function deployLogMentionsToday(fullDate) {
  const p = join(root, 'wiki', 'deploy-log.md');
  if (!existsSync(p)) return false;
  return readFileSync(p, 'utf-8').includes(fullDate);
}

/**
 * Check if any file edited today is NOT in ANY plan task's files[].
 * If no plan exists, skip this check (return []).
 */
function filesOutOfPlan(editedFiles) {
  let plan;
  try { plan = loadPlan(); } catch { return []; }
  if (plan.length === 0) return [];

  const allPlanFiles = new Set();
  for (const t of plan) {
    for (const f of t.files) {
      allPlanFiles.add(f.replace(/\\/g, '/'));
    }
  }
  const missing = [];
  for (const f of editedFiles) {
    const norm = f.replace(/\\/g, '/');
    // If any plan file is a suffix of this or vice versa, it's covered.
    let covered = false;
    for (const pf of allPlanFiles) {
      if (norm === pf || norm.endsWith('/' + pf) || pf.endsWith('/' + norm)) {
        covered = true;
        break;
      }
    }
    if (!covered) missing.push(f);
  }
  return missing;
}

/**
 * Find in_progress tasks whose acceptance criteria are all checked — these
 * should be transitioned to done.
 */
function completedButStillInProgress() {
  let plan;
  try { plan = loadPlan(); } catch { return []; }
  return plan
    .filter(t => t.status === 'in_progress')
    .filter(t => t.acceptance.total > 0 && t.acceptance.done === t.acceptance.total)
    .map(t => t.id);
}

/**
 * Main audit. Returns a list of human-readable findings.
 */
export function auditToday() {
  const { full } = todayParts();
  const log = readSessionLog();
  const findings = [];

  if (!log) {
    return { findings: [], ok: true };
  }

  // 1. Source files without feature pages.
  const edited = extractEditedSourceFiles(log);
  const missingFeatureKeys = new Set();
  for (const f of edited) {
    const k = featureKey(f);
    if (!hasFeaturePage(k)) missingFeatureKeys.add(k);
  }
  if (missingFeatureKeys.size > 0) {
    const first = [...missingFeatureKeys][0];
    findings.push(
      'No feature page for edited module(s): ' +
      [...missingFeatureKeys].map(k => `\`${k}\``).join(', ') +
      ` — create wiki/features/${first}.md`
    );
  }

  // 2. feat: commits not in changelog.
  const featCommits = todaysCommits().filter(s => /^feat[:(]/i.test(s));
  const unchangelogged = featCommits.filter(s => !changelogMentions(s));
  if (unchangelogged.length > 0) {
    findings.push(
      'Unlogged feat commit(s) — append to wiki/changelog.md: ' +
      unchangelogged.map(s => `"${s}"`).join('; ')
    );
  }

  // 3. Build/deploy without deploy-log entry.
  if (buildRanToday(log) && !deployLogMentionsToday(full)) {
    findings.push(
      `Build/deploy ran today but wiki/deploy-log.md has no entry for ${full} — append one`
    );
  }

  // 4. _map.md not touched.
  // v4.9.3: only require if today had source edits OR feat commits.
  // Read-only sessions (just /help, /continue, viewing files) don't need wiki updates.
  const hadEdits = edited.length > 0 || featCommits.length > 0;
  if (hadEdits && !mapTouchedSinceSessionStart()) {
    findings.push(
      'wiki/_map.md has not been updated since today\'s session started — ' +
      'refresh "Done / In Progress / Next" sections'
    );
  }

  // 5. _current.md missing or stale.
  // Same v4.9.3 conditional as #4.
  if (hadEdits && !currentTouchedSinceSessionStart()) {
    findings.push(
      'wiki/_current.md missing or stale — update it to reflect the active task'
    );
  }

  // 6. Files edited today outside any plan task.
  const outOfPlan = filesOutOfPlan(edited);
  if (outOfPlan.length > 0) {
    findings.push(
      'Edited files not in any plan task\'s `files:` list: ' +
      outOfPlan.map(f => `\`${f}\``).join(', ') +
      ' — add to the relevant task in wiki/plan/, or create a new task'
    );
  }

  // 7. Tasks that are complete but still in_progress.
  const shouldClose = completedButStillInProgress();
  if (shouldClose.length > 0) {
    findings.push(
      'Task(s) with all acceptance criteria checked but still `status: in_progress`: ' +
      shouldClose.map(id => `\`${id}\``).join(', ') +
      ' — mark them `status: done` in wiki/plan/'
    );
  }

  // 8. Plan file schema issues (v4.6+): surface malformed frontmatter
  //    instead of silent-skipping. Helps catch typos like `status: doing`.
  try {
    const planTasks = loadPlan();
    const allIssues = planTasks.flatMap(t => t.schemaIssues || []);
    if (allIssues.length > 0) {
      findings.push(
        'Plan schema issue(s) in wiki/plan/: ' +
        allIssues.slice(0, 3).map(s => `"${s}"`).join('; ') +
        (allIssues.length > 3 ? ` (and ${allIssues.length - 3} more)` : '') +
        ' — fix the frontmatter or remove the bogus field'
      );
    }
  } catch { /* non-fatal */ }

  return { findings, ok: findings.length === 0 };
}

// CLI mode — `node .claude/hooks/wiki-audit.mjs`
const isCli = process.argv[1] && process.argv[1].endsWith('wiki-audit.mjs');
if (isCli) {
  const { findings, ok } = auditToday();
  if (ok) {
    console.log('✓ Wiki audit clean.');
    process.exit(0);
  } else {
    console.log('✗ Wiki audit found ' + findings.length + ' issue(s):\n');
    for (const f of findings) console.log('  • ' + f);
    process.exit(1);
  }
}
