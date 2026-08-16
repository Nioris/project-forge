/**
 * @file pre-claim-fixed.mjs
 * @description Stop hook — detects AI claiming completion ("fixed", "applied",
 *              "готово", "done") в final message but without actual file changes
 *              in last N turns. Blocks Stop and injects feedback к force real action.
 *
 *              Catches AI hallucination class:
 *                User: "почини collision X"
 *                AI: "Fixed the spacing issue"  ← textual claim
 *                Reality: no Edit tool called, git diff empty
 *                User: "I see no change"
 *                AI: "Sorry, fixed again"  ← still nothing
 *                ... loop
 *
 *              The hook receives Stop event payload containing transcript
 *              (final assistant message text). If text contains completion
 *              phrases AND no git diff в last N turns, blocks с reminder.
 *
 *              Logic:
 *                1. Parse transcript для last assistant message
 *                2. Match completion phrases (RU + EN): fixed, fixed it, done, готово,
 *                   applied, исправил, починил, сделал, ready, complete
 *                3. Check git diff HEAD~N (default N=2)
 *                4. If diff empty AND completion claim present → block + inject reminder
 *                5. AI gets next turn с visibility on "you said fixed but no changes"
 *
 *              Escape: env FORGE_SKIP_FIXED_CHECK=1 bypasses (logged).
 *              Edge cases:
 *                - "fixed yesterday" — context word matching mitigates
 *                - Read-only sessions — N=2 prevents triggering on chat-only turns
 *                - Untracked files — `git status --porcelain` counts those too
 *
 * @input  JSON via stdin (Stop hook payload)
 * @output { decision: "block", reason: "..." } or { continue: true }
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Не-git папка (обычная игра) — хук не применим. Молча выходим, чтобы git не писал в stderr:
// Claude Code показывает любой stderr хука как "hook error" (полевой кейс 02.08.2026).
function isGitRepo(dir) {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dir, encoding: 'utf-8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']
    });
    return true;
  } catch { return false; }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

// Completion phrases — multilingual + case-insensitive matching
// Use word boundaries carefully (Cyrillic не работает с \b in JS regex,
// use whitespace/punctuation context)
const COMPLETION_PHRASES = [
  // Russian (most common in Forge user base)
  'исправил', 'починил', 'сделал', 'применил', 'добавил',
  'готово', 'готов', 'выполнил', 'завершил', 'починено',
  'исправлено', 'сделано', 'применено',
  // English
  'fixed it', 'fixed the', 'applied the', 'applied fix',
  'done', 'all done', 'complete', 'completed',
  'all set', 'ready', "i've fixed", "i have fixed",
  "i've applied", "i've updated", "i've added",
];

// Context words that suggest historical mention, not claim
// (skip if any of these are within 5 words before the phrase)
const HISTORICAL_HINTS = [
  'yesterday', 'previously', 'before', 'earlier',
  'вчера', 'раньше', 'ранее', 'когда-то', 'давно',
];

// Min turns to look back at git
const GIT_LOOKBACK = parseInt(process.env.FORGE_FIXED_CHECK_LOOKBACK || '2', 10);

function readInput() {
  try {
    const raw = readFileSync(0, 'utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function logEvent(message) {
  try {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const dir = join(root, 'wiki', 'sessions', yyyy, mm);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, `${dd}.md`);
    if (!existsSync(file)) {
      const header = `---\ndate: ${yyyy}-${mm}-${dd}\ntags: [session]\n---\n\n# Session — ${yyyy}-${mm}-${dd}\n\n`;
      appendFileSync(file, header, 'utf-8');
    }
    appendFileSync(file, `- ${hh}:${mi} **[pre-claim-fixed]** ${message}\n`, 'utf-8');
  } catch { /* silent */ }
}

function extractLastAssistantMessage(payload) {
  // Stop hook payload may contain Codex last_assistant_message, a Claude transcript
  // path, or inline messages. Keep all strategies for cross-agent compatibility.

  // Strategy 0: Codex native Stop payload.
  if (typeof payload.last_assistant_message === 'string') return payload.last_assistant_message;

  // Strategy 1: payload.transcript_path (Claude Code v2.x)
  if (payload.transcript_path && existsSync(payload.transcript_path)) {
    try {
      const tr = readFileSync(payload.transcript_path, 'utf-8');
      // Transcript is JSON-lines; find last assistant message
      const lines = tr.trim().split('\n').reverse();
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'assistant' || obj.role === 'assistant') {
            // Text content can be string or array of content blocks
            const content = obj.message?.content || obj.content || '';
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) {
              return content
                .filter(c => c.type === 'text' && c.text)
                .map(c => c.text)
                .join('\n');
            }
          }
        } catch { /* skip malformed line */ }
      }
    } catch { /* fallthrough */ }
  }

  // Strategy 2: inline message text
  if (typeof payload.message === 'string') return payload.message;
  if (payload.message?.content) {
    const c = payload.message.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.filter(b => b.text).map(b => b.text).join('\n');
  }

  return '';
}

function containsCompletionClaim(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const phrase of COMPLETION_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx === -1) continue;

    // Word boundary check via surrounding context
    // (для Cyrillic \b не работает в JS regex)
    const before = lower[idx - 1];
    const after = lower[idx + phrase.length];
    const isWordChar = (c) => c && /[a-zа-яё0-9]/i.test(c);
    if (isWordChar(before)) continue;  // mid-word match
    if (isWordChar(after) && !/['"]/.test(after)) continue;

    // Historical context check — look 30 chars before
    const contextBefore = lower.slice(Math.max(0, idx - 30), idx).toLowerCase();
    const isHistorical = HISTORICAL_HINTS.some(h => contextBefore.includes(h));
    if (isHistorical) continue;

    return phrase;  // first real claim found
  }
  return null;
}

function hasFileChanges() {
  if (!isGitRepo(root)) return { hasChanges: true, scope: 'not a git repo — проверка пропущена' };
  try {
    // Check both staged/unstaged + untracked
    const status = execSync('git status --porcelain', {
      cwd: root,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    if (status) return { hasChanges: true, scope: 'working tree dirty' };

    // Also check last N commits in case work was committed
    try {
      const diff = execSync(`git diff HEAD~${GIT_LOOKBACK} --stat 2>/dev/null`, {
        cwd: root,
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
      if (diff) return { hasChanges: true, scope: `last ${GIT_LOOKBACK} commits` };
    } catch { /* HEAD~N may не exist в new repo */ }

    return { hasChanges: false };
  } catch (e) {
    // Not a git repo, или git unavailable — fail open (don't block)
    return { hasChanges: true, scope: 'no git, skip check' };
  }
}

function run() {
  if (process.env.FORGE_SKIP_FIXED_CHECK === '1') {
    logEvent('SKIP via FORGE_SKIP_FIXED_CHECK=1');
    process.stdout.write('{"continue":true,"suppressOutput":true}');
    return;
  }

  const payload = readInput();
  const messageText = extractLastAssistantMessage(payload);
  const claim = containsCompletionClaim(messageText);

  if (!claim) {
    // No completion claim — let Stop proceed normally
    process.stdout.write('{"continue":true,"suppressOutput":true}');
    return;
  }

  const { hasChanges, scope } = hasFileChanges();

  if (hasChanges) {
    // Claim + changes present = legitimate completion
    logEvent(`OK: claim "${claim}" matched changes (${scope})`);
    process.stdout.write('{"continue":true,"suppressOutput":true}');
    return;
  }

  // VIOLATION: claimed completion, no changes
  logEvent(`BLOCK: claim "${claim}" but no file changes detected`);

  const reason = [
    'Detected completion claim ("' + claim + '") в your message, но git diff пуст.',
    '',
    'Это значит ты НЕ вызывал Edit/Write/MultiEdit tools для этого turn.',
    'Либо ты галлюцинируешь "fixed" без actual action — это самый частый failure mode.',
    '',
    'Required action на следующий turn:',
    '1. Запусти Bash: `git status --porcelain` — покажи output user',
    '2. Если файлы не изменены — продолжай реально вызывая Edit/Write tools',
    '3. После Edit — снова `git diff` чтобы verify change applied',
    '4. ТОЛЬКО ПОТОМ говори "fixed" / "готово" / "applied"',
    '',
    'Если изменения уже сделаны в другом checkout / branch / не-git folder,',
    'или это intentional read-only turn (юзер просил только анализ) — скажи это явно.',
    '',
    'Bypass этой проверки: установить env FORGE_SKIP_FIXED_CHECK=1.'
  ].join('\n');

  // Block Stop — AI gets another turn with this reason injected
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: reason
  }));
}

try { run(); } catch (e) {
  // Fail open — don't block on hook errors
  process.stdout.write('{"continue":true,"suppressOutput":true}');
}
