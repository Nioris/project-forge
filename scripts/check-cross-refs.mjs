#!/usr/bin/env node
/**
 * @file check-cross-refs.mjs
 * @description Automated audit: advisor SKILL.md catalog vs .claude/skills/ filesystem.
 *
 *   Catches two failure modes:
 *
 *   1. MISSING — skill exists в filesystem (.claude/skills/X/) но не упомянут
 *      в advisor SKILL.md. Юзер не узнает что skill доступен.
 *
 *   2. PHANTOM — skill упомянут в advisor SKILL.md но папки .claude/skills/X/
 *      не существует. Юзер вызовет команду — Claude скажет "skill not found".
 *
 *   Этот bug повторялся 6+ раз за v4.5.x → v4.7.10 track:
 *     - v4.7.5: rewriting advisor accidentally lost 4 skills (convert, convert-all,
 *               plan, rustore-publish)
 *     - v4.6.4: caught up advisor с reality после tracking platform additions
 *     - другие случаи где manually grep + add
 *
 *   Каждый раз — manual Python snippet. Теперь автоматизированно.
 *
 *  Usage:
 *    node scripts/check-cross-refs.mjs              # audit current dir
 *    node scripts/check-cross-refs.mjs <path>       # audit specific Forge install
 *    node scripts/check-cross-refs.mjs --json       # machine-readable output
 *    node scripts/check-cross-refs.mjs --strict     # also fail on phantom mentions
 *
 *  Exit:
 *    0 — coverage 100%, no missing, no phantoms (or phantoms allowed in non-strict)
 *    1 — missing skills (catalog drift) or phantoms in --strict
 *    2 — invocation error (advisor SKILL.md not found, etc)
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const JSON_MODE = args.includes('--json');
const STRICT = args.includes('--strict');

const ROOT = path.resolve(positional[0] || process.cwd());
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const ADVISOR_PATH = path.join(SKILLS_DIR, 'advisor', 'SKILL.md');

// Validate paths
if (!fs.existsSync(SKILLS_DIR)) {
  const msg = `.claude/skills/ not found at ${SKILLS_DIR}`;
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
  } else {
    console.error(`✗ ${msg}`);
  }
  process.exit(2);
}

if (!fs.existsSync(ADVISOR_PATH)) {
  const msg = `advisor SKILL.md not found at ${ADVISOR_PATH}`;
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
  } else {
    console.error(`✗ ${msg}`);
  }
  process.exit(2);
}

// Read advisor catalog
const advisorContent = fs.readFileSync(ADVISOR_PATH, 'utf8');

// Extract mentioned skill names from advisor.
//
// Three patterns where advisor mentions skills:
//   Pattern A: Markdown table rows starting with `| skill-name |` or `| /skill-name |`
//   Pattern B: Backtick-wrapped slash commands `/skill-name` in prose
//   Pattern C: Bare slash commands /skill-name (without backticks) — less reliable
//
// Pattern A is the primary catalog format. Pattern B is reinforcement.
// We use both, dedupe.

const tableRowSkills = new Set();
{
  // Match: "| skill-name |" or "| /skill-name |" or "| `/skill-name` |"
  // Also handles arguments: "| `/skill-name {arg}` |" or "| `/skill-name <arg>` |"
  // First column of markdown table row, must be lowercase-with-dashes
  // Allow optional backticks, optional leading slash, optional whitespace + args
  // Skill names can start with digit (e.g. 3d-perf) — first char is [a-z0-9]
  const re = /^\|\s*`?\/?([a-z0-9][a-z0-9-]+)(?:\s+[^|`]*)?`?\s*\|/gm;
  let m;
  while ((m = re.exec(advisorContent)) !== null) {
    tableRowSkills.add(m[1]);
  }
}

const inlineSkills = new Set();
{
  // Match: `/skill-name` in backticks (intentional skill mention)
  // Also handles: `/skill-name {arg}` or `/skill-name <arg>`
  // Skill names can start with digit (e.g. 3d-perf)
  const re = /`\/([a-z0-9][a-z0-9-]+)(?:\s+[^`]*)?`/g;
  let m;
  while ((m = re.exec(advisorContent)) !== null) {
    inlineSkills.add(m[1]);
  }
}

// Combined mentioned set
const mentioned = new Set([...tableRowSkills, ...inlineSkills]);

// Filesystem skills (excluding advisor itself)
const filesystem = new Set();
for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== 'advisor') {
    // Verify SKILL.md exists in folder
    if (fs.existsSync(path.join(SKILLS_DIR, entry.name, 'SKILL.md'))) {
      filesystem.add(entry.name);
    }
  }
}

// Compute drift
const missing = [...filesystem].filter(s => !mentioned.has(s)).sort();
const phantoms = [...mentioned].filter(s => !filesystem.has(s)).sort();

// Phantom whitelist — skills that intentionally appear in advisor as references
// to commands that aren't standalone skills. E.g., "/release-{platform}" is a pattern,
// individual platforms have their own skills (release-yandex, release-vk, etc).
//
// Also: pattern fragments captured as words (e.g., "/analyze" from "/analyze-game",
// "/release" from "/release-yandex"). These are partial captures of valid skill names.
const PHANTOM_WHITELIST = new Set([
  'analyze',       // captured from /analyze-game, /analyze-project
  'release',       // captured from /release-yandex, /release-vk, etc
  'orchestrator',  // metaphorical reference, not a real command
  'find',          // captured from /find-or-make-skill
  // Smart router commands (v4.10.9+) — live в .claude/commands/, not .claude/skills/
  'game',          // /game smart router (commands/game.md)
  'app',           // /app smart router (commands/app.md)
  'do',            // /do action router (commands/do.md) — executes instead of advising (v4.11.1+)
  'continue',      // /continue (commands/continue.md, also a skill folder exists actually)
  // Claude Code built-in commands (not Forge skills)
  'goal',          // /goal — Claude Code v2.1.139+ built-in (autonomous workflow)
  'clear',         // /clear — Claude Code built-in (new session)
]);

const realPhantoms = phantoms.filter(s => !PHANTOM_WHITELIST.has(s));

// Also check sub-section: each skill has a folder-name match in mentioned
// (skip — already covered above)

const result = {
  ok: missing.length === 0 && (!STRICT || realPhantoms.length === 0),
  filesystem_count: filesystem.size,
  mentioned_count: mentioned.size,
  coverage_count: [...filesystem].filter(s => mentioned.has(s)).length,
  missing,
  phantoms: realPhantoms,
  whitelisted_phantoms: phantoms.filter(s => PHANTOM_WHITELIST.has(s)),
};

if (JSON_MODE) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

// Human-readable output
console.log(`Advisor catalog audit — ${path.relative(process.cwd(), ROOT) || '.'}`);
console.log('');
console.log(`  Skills в filesystem:  ${result.filesystem_count}`);
console.log(`  Mentioned в advisor:  ${result.coverage_count}/${result.filesystem_count}`);
console.log('');

if (missing.length === 0 && realPhantoms.length === 0) {
  console.log('✓ No drift — advisor catalog matches filesystem.');
  process.exit(0);
}

if (missing.length > 0) {
  console.log(`✗ Missing from advisor catalog (${missing.length}):`);
  for (const skill of missing.slice(0, 20)) {
    console.log(`    /${skill}`);
  }
  if (missing.length > 20) console.log(`    ... and ${missing.length - 20} more`);
  console.log('');
  console.log('  Fix: add these skills to .claude/skills/advisor/SKILL.md catalog.');
  console.log('');
}

if (realPhantoms.length > 0) {
  const severity = STRICT ? '✗' : '⚠';
  console.log(`${severity} Phantom mentions in advisor (${realPhantoms.length}):`);
  for (const skill of realPhantoms.slice(0, 20)) {
    console.log(`    /${skill}  (in advisor SKILL.md, but no .claude/skills/${skill}/ folder)`);
  }
  if (realPhantoms.length > 20) console.log(`    ... and ${realPhantoms.length - 20} more`);
  console.log('');
  console.log('  Fix: either create the skill or remove mention from advisor catalog.');
  if (!STRICT) console.log('  (Currently warning only — re-run with --strict to fail on phantoms)');
  console.log('');
}

if (result.whitelisted_phantoms.length > 0 && process.env.VERBOSE) {
  console.log(`  Whitelisted partial captures (ignored): ${result.whitelisted_phantoms.join(', ')}`);
  console.log('');
}

process.exit(result.ok ? 0 : 1);
