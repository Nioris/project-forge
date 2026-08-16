/**
 * @file post-tool-capture.mjs
 * @description PostToolUse hook — logs Write/Edit/Bash activity into
 *              wiki/sessions/YYYY/MM/DD.md with semantic enrichment:
 *                - classifies Bash commands (build/test/verify/install/git/deploy/…)
 *                - extracts intent from tool_input.description
 *                - groups repeated edits on the same file within 5 minutes
 *                - extracts commit messages as first-class entries
 *                - tags each edit with the active task id (from wiki/plan/)
 *                - auto-lints edited source files
 *
 *              Session path: wiki/sessions/YYYY/MM/DD.md (nested structure).
 *              The wiki-audit and session-start readers support the old flat
 *              wiki/sessions/YYYY-MM-DD.md layout too for backward compat.
 *
 * @input  JSON via stdin  { tool_name, tool_input, ... }
 * @output { "continue": true, "suppressOutput": true }
 */

import {
  readFileSync, writeFileSync, appendFileSync,
  existsSync, mkdirSync,
} from 'fs';
import { join, extname, dirname, relative } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadActive } from './lib/parse-plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Session log path for today: wiki/sessions/YYYY/MM/DD.md
 */
function todayLogPath() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const dir = join(root, 'wiki', 'sessions', yyyy, mm);
  const file = join(dir, `${dd}.md`);
  return { dir, file, dateStr: `${yyyy}-${mm}-${dd}` };
}

function classifyBash(cmd) {
  const c = cmd.toLowerCase();

  // ── Полевой кейс (Q1-101): классификатор искал слова ГДЕ УГОДНО в строке, поэтому
  // `grep "deploy..."` и `node -e "...deploy..."` получали тег deploy и дёргали стоп-хук
  // требованием записи в deploy-log. Различаем «команда ЯВЛЯЕТСЯ действием» и
  // «команда УПОМИНАЕТ слово». Read-only и инлайн-скрипты решаются ПЕРВЫМИ.
  const firstWord = (c.match(/^\s*[a-z0-9_./-]+/) || [''])[0].replace(/^.*\//, '');
  const READ_ONLY = ['grep','rg','ag','cat','head','tail','ls','find','wc','file','stat','du','df','which','echo','pwd','tree','diff','md5sum','sha256sum'];
  if (READ_ONLY.includes(firstWord)) return 'shell';
  if (/^\s*(node|python3?|deno|bun)\s+-[ec]\b/.test(c)) return 'shell';   // инлайн-скрипт: текст ≠ действие
  if (/^\s*(sed|awk)\s+-n\b/.test(c)) return 'shell';                     // печать, не правка

  if (/^git\s+commit/.test(c))                           return 'git:commit';
  if (/^git\s+push/.test(c))                             return 'git:push';
  if (/^git\s+(add|status|diff|log)/.test(c))            return 'git';
  if (/(npm|yarn|pnpm)\s+(install|add|i\b)/.test(c))     return 'install';
  if (/(npm|yarn|pnpm)\s+(run\s+)?build/.test(c))        return 'build';
  if (/(npm|yarn|pnpm)\s+(run\s+)?(test|check)/.test(c)) return 'test';
  if (/(npm|yarn|pnpm)\s+(run\s+)?(dev|start)/.test(c))  return 'dev';
  if (/gradle|\.\/gradlew/.test(c))                      return 'build:android';
  if (/docker\s+(build|compose)/.test(c))                return 'build:docker';
  if (/scripts\/verify|verify-i18n|verify-vk/.test(c))   return 'verify';
  if (/^\s*(rsync|scp|rclone)\s/.test(c)) return 'deploy';
  if (/^\s*(npm|yarn|pnpm)\s+(run\s+)?deploy\b/.test(c)) return 'deploy';
  if (/^\s*(bash|sh|\.\/)?[a-z0-9_./-]*deploy[a-z0-9_.-]*(\.(sh|bat|ps1|mjs))?\s*/.test(c) && !/["']/.test(c.slice(0, c.search(/deploy/)))) return 'deploy';
  if (/^node\s+scripts\//.test(c))                       return 'script';
  return 'shell';
}

function extractCommitMsg(cmd) {
  const m = cmd.match(/git\s+commit[^"']*["']([^"']+)["']/);
  return m ? m[1] : null;
}

/**
 * Ask the plan which in_progress task owns this file.
 * Returns the task id, or null.
 */
function activeTaskForFile(filePath) {
  if (!filePath) return null;
  let tasks;
  try { tasks = loadActive(); } catch { return null; }
  if (!tasks.length) return null;
  const normTarget = String(filePath).replace(/\\/g, '/');
  for (const t of tasks) {
    for (const f of t.files) {
      const nf = f.replace(/\\/g, '/');
      if (normTarget === nf || normTarget.endsWith('/' + nf)) return t.id;
    }
  }
  return null;
}

function isRecentDuplicate(logFile, toolName, rel) {
  if (!existsSync(logFile)) return false;
  const raw = readFileSync(logFile, 'utf-8');
  const lines = raw.split('\n').filter(l => l.startsWith('- '));
  if (lines.length === 0) return false;
  const last = lines[lines.length - 1];
  if (!last.includes('`' + rel + '`')) return false;
  if (!last.includes('**' + toolName + '**')) return false;
  const tm = last.match(/^- (\d{2}):(\d{2}):(\d{2})/);
  if (!tm) return false;
  const now = new Date();
  const lastDate = new Date(now);
  lastDate.setHours(parseInt(tm[1], 10), parseInt(tm[2], 10), parseInt(tm[3], 10), 0);
  return (now - lastDate) < GROUP_WINDOW_MS;
}

function bumpCounter(logFile) {
  const raw = readFileSync(logFile, 'utf-8');
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('- ')) {
      const xMatch = lines[i].match(/\s×(\d+)$/);
      if (xMatch) {
        lines[i] = lines[i].replace(/\s×\d+$/, ' ×' + (parseInt(xMatch[1], 10) + 1));
      } else {
        lines[i] = lines[i] + ' ×2';
      }
      break;
    }
  }
  writeFileSync(logFile, lines.join('\n'), 'utf-8');
}

function relPath(filePath) {
  if (!filePath) return '';
  try { return relative(root, filePath) || filePath; }
  catch { return filePath; }
}

function run() {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch {}
  if (!raw) { process.stdout.write('{"continue":true,"suppressOutput":true}'); return; }

  let data;
  try { data = JSON.parse(raw); }
  catch { process.stdout.write('{"continue":true,"suppressOutput":true}'); return; }

  const { dir: sessDir, file: logFile, dateStr } = todayLogPath();
  if (!existsSync(sessDir)) mkdirSync(sessDir, { recursive: true });

  const now = new Date();
  const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (!existsSync(logFile)) {
    writeFileSync(
      logFile,
      `---\ndate: ${dateStr}\ntags: [session]\n---\n\n# Session — ${dateStr}\n\n`,
      'utf-8'
    );
  }

  const toolName = String(data.tool_name || '');
  const description = String(data.tool_input?.description || '').trim();
  let line = null;
  let filePath = null;

  if (/^(Write|Edit|MultiEdit)$/.test(toolName)) {
    filePath = data.tool_input?.file_path || data.tool_input?.path || null;
    if (filePath) {
      const rel = relPath(filePath);
      if (isRecentDuplicate(logFile, toolName, rel)) {
        bumpCounter(logFile);
        tryLint(filePath);
        process.stdout.write('{"continue":true,"suppressOutput":true}');
        return;
      }
      const taskId = activeTaskForFile(rel);
      const taskTag = taskId ? ` [${taskId}]` : '';
      const intent = description ? ` — ${description}` : '';
      line = `- ${stamp} **${toolName}**${taskTag} \`${rel}\`${intent}`;
    }
  } else if (toolName === 'Bash') {
    const cmd = String(data.tool_input?.command || '');
    if (cmd) {
      const commitMsg = extractCommitMsg(cmd);
      if (commitMsg) {
        line = `- ${stamp} **git:commit** "${commitMsg}"`;
      } else {
        const tag = classifyBash(cmd);
        let snippet = cmd.replace(/\r?\n/g, ' ').trim();
        if (snippet.length > 140) snippet = snippet.substring(0, 140) + '…';
        snippet = snippet.replace(/`/g, "'");
        const intent = description ? ` — ${description}` : '';
        line = `- ${stamp} **${tag}** \`${snippet}\`${intent}`;
      }
    }
  }

  if (line) appendFileSync(logFile, line + '\n', 'utf-8');

  if (filePath && /^(Write|Edit|MultiEdit)$/.test(toolName)) {
    tryLint(filePath);
  }

  process.stdout.write('{"continue":true,"suppressOutput":true}');
}

function tryLint(filePath) {
  try {
    const ext = extname(filePath).replace('.', '');
    const eslintBin   = join(root, 'node_modules', '.bin', 'eslint');
    const prettierBin = join(root, 'node_modules', '.bin', 'prettier');
    switch (ext) {
      case 'js': case 'jsx': case 'ts': case 'tsx': case 'mjs':
        if (existsSync(eslintBin)) {
          execSync(`npx eslint --fix "${filePath}"`, {
            cwd: root, stdio: 'ignore', timeout: 10000,
          });
        }
        break;
      case 'svelte': case 'css': case 'scss':
        if (existsSync(prettierBin)) {
          execSync(`npx prettier --write "${filePath}"`, {
            cwd: root, stdio: 'ignore', timeout: 10000,
          });
        }
        break;
    }
  } catch { /* silent */ }
}

try { run(); } catch {
  process.stdout.write('{"continue":true,"suppressOutput":true}');
}
