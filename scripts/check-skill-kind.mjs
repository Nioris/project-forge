#!/usr/bin/env node
/**
 * @file check-skill-kind.mjs
 * @description Verify every SKILL.md has `kind: architectural | tactical` in frontmatter.
 *
 *   Introduced в v4.9.0 для skill categorization (item A from v4.9 backlog).
 *   Architectural skills auto-invoked from /start или /design-pipeline.
 *   Tactical skills opt-in by user.
 *
 *   Without this verifier, new skills could be added без kind:, breaking
 *   /advisor's ability to recommend architectural skills first.
 *
 *  Usage:
 *    node scripts/check-skill-kind.mjs
 *    node scripts/check-skill-kind.mjs --json
 *
 *  Exit:
 *    0 — all skills have valid kind:
 *    1 — missing/invalid kind: detected
 *    2 — invocation error
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const JSON_MODE = args.includes('--json');

const ROOT = path.resolve(positional[0] || process.cwd());
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');

if (!fs.existsSync(SKILLS_DIR)) {
  if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: 'skills dir not found' }));
  else console.error(`✗ ${SKILLS_DIR} not found`);
  process.exit(2);
}

const VALID_KINDS = ['architectural', 'tactical'];
const issues = [];
const stats = { architectural: 0, tactical: 0 };

for (const dir of fs.readdirSync(SKILLS_DIR)) {
  const skillPath = path.join(SKILLS_DIR, dir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) continue;

  const content = fs.readFileSync(skillPath, 'utf8');

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    issues.push({ skill: dir, problem: 'no frontmatter' });
    continue;
  }

  const fm = fmMatch[1];
  const kindMatch = fm.match(/^kind:\s*(\S+)/m);

  if (!kindMatch) {
    issues.push({ skill: dir, problem: 'missing kind: line' });
    continue;
  }

  const kind = kindMatch[1].trim();
  if (!VALID_KINDS.includes(kind)) {
    issues.push({ skill: dir, problem: `invalid kind '${kind}', must be architectural or tactical` });
    continue;
  }

  stats[kind]++;
}

if (JSON_MODE) {
  console.log(JSON.stringify({ ok: issues.length === 0, stats, issues }, null, 2));
  process.exit(issues.length === 0 ? 0 : 1);
}

console.log(`Skill kind audit:`);
console.log(`  architectural: ${stats.architectural}`);
console.log(`  tactical:      ${stats.tactical}`);
console.log(`  total:         ${stats.architectural + stats.tactical}`);
console.log('');

if (issues.length === 0) {
  console.log('✓ All skills have valid kind: in frontmatter.');
  process.exit(0);
}

console.log(`✗ ${issues.length} skill(s) with kind: issues:\n`);
for (const i of issues.slice(0, 20)) {
  console.log(`  ${i.skill}: ${i.problem}`);
}
if (issues.length > 20) console.log(`  ... and ${issues.length - 20} more`);
console.log('');
console.log('Fix: every SKILL.md frontmatter must have `kind: architectural | tactical`.');
console.log('');
console.log('  architectural — sets up patterns BEFORE writing logic (foundations,');
console.log('                  orchestrators). Auto-invoked from /start or /design-pipeline.');
console.log('  tactical      — applied as-needed during development. User invokes manually.');
console.log('');
console.log('See [[wiki/decisions/010-architectural-vs-tactical-skills]].');
process.exit(1);
