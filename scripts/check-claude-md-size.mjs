#!/usr/bin/env node
/**
 * @file check-claude-md-size.mjs
 * @description CLAUDE.md gets injected into every session start via hook, so
 *   its size directly affects first-turn cache write cost. This script checks
 *   size and suggests rotation when approaching the limit.
 *
 *   Why: CLAUDE.md tends to accumulate changelog sections with every release.
 *   Without a rotation discipline, it grows past the point where cache writes
 *   become expensive. Rotating means moving the oldest changelog sections
 *   into docs/CHANGELOG.md, keeping only the latest 3 in CLAUDE.md itself.
 *
 * Usage:
 *   node scripts/check-claude-md-size.mjs            — report only
 *   node scripts/check-claude-md-size.mjs --suggest  — print rotation commands
 *
 * Exit codes:
 *   0 — under soft limit (safe)
 *   1 — over soft limit (36KB), rotation suggested
 *   2 — over hard limit (50KB), rotation required
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const CLAUDE_MD = join(root, 'CLAUDE.md');
const CHANGELOG = join(root, 'docs', 'CHANGELOG.md');

// Thresholds — tuned based on Claude Code's session-start injection behavior.
// Every new session starts with a cache write of the full CLAUDE.md prefix.
// At ~30KB the cache write is noticeable; at ~50KB it's painful.
const SOFT_LIMIT = 36 * 1024;  // 36 KB — поднят 02.08.2026, см. wiki/decisions/030
const HARD_LIMIT = 50 * 1024;  // 50 KB — block, require rotation

if (!existsSync(CLAUDE_MD)) {
  console.error('✗ CLAUDE.md not found at', CLAUDE_MD);
  process.exit(3);
}

const content = readFileSync(CLAUDE_MD, 'utf-8');
const size = Buffer.byteLength(content, 'utf-8');

// Find all version changelog sections: lines starting with "## vX.Y..."
const sections = [];
const headerRegex = /^## (v\d+\.\d+(?:\.\d+)?[^\n]*)$/gm;
let m;
let prevStart = 0;
let prevHeader = null;
while ((m = headerRegex.exec(content)) !== null) {
  if (prevHeader !== null) {
    sections.push({
      header: prevHeader,
      start: prevStart,
      end: m.index,
      size: m.index - prevStart,
    });
  }
  prevHeader = m[1];
  prevStart = m.index;
}
// Final section — up to next non-version heading or end of file
if (prevHeader !== null) {
  // Find next non-version heading after prevStart
  const tail = content.slice(prevStart);
  const nextSectionMatch = tail.slice(1).match(/\n## (?!v\d)/);
  const end = nextSectionMatch
    ? prevStart + 1 + nextSectionMatch.index
    : content.length;
  sections.push({
    header: prevHeader,
    start: prevStart,
    end,
    size: end - prevStart,
  });
}

const sizeKB = (size / 1024).toFixed(1);

console.log('');
console.log(`CLAUDE.md size: ${size} bytes (${sizeKB} KB)`);
console.log(`  Soft limit:  ${SOFT_LIMIT} bytes (36 KB) — cache cost starts to bite (порог поднят 02.08.2026: см. wiki/decisions)`);
console.log(`  Hard limit:  ${HARD_LIMIT} bytes (50 KB) — cache cost painful`);
console.log('');

if (sections.length > 0) {
  console.log('Version changelog sections found:');
  for (const s of sections) {
    const kb = (s.size / 1024).toFixed(1);
    console.log(`  • ${s.header.padEnd(55)} ${kb.padStart(6)} KB`);
  }
  console.log('');
}

let status;
let exitCode;
if (size < SOFT_LIMIT) {
  status = '✓ Under soft limit — no action needed';
  exitCode = 0;
} else if (size < HARD_LIMIT) {
  status = '⚠ Over soft limit — rotation suggested';
  exitCode = 1;
} else {
  status = '✗ Over hard limit — rotate now';
  exitCode = 2;
}

console.log(status);
console.log('');

const suggest = process.argv.includes('--suggest');

if (exitCode > 0 || suggest) {
  // Suggest which sections to rotate: keep latest 3, suggest moving the rest.
  // Latest = sections near the top of CLAUDE.md (the file is top-to-bottom descending).
  // v4.5.2 at top, v4.5.1 next, v4.5 next, older below — we keep top 3.
  const toKeep = sections.slice(0, 3);
  const toRotate = sections.slice(3);

  if (toRotate.length === 0) {
    console.log('All version sections should stay — file is large for another reason.');
    console.log('Consider moving standalone rule sections (Hook authoring, Platform encoding)');
    console.log('to a separate docs/ file if they have grown.');
  } else {
    console.log('Suggested rotation — move these sections to docs/CHANGELOG.md:');
    for (const s of toRotate) {
      const kb = (s.size / 1024).toFixed(1);
      console.log(`  - ${s.header} (${kb} KB)`);
    }
    console.log('');
    console.log('Keep in CLAUDE.md (latest 3 releases):');
    for (const s of toKeep) {
      console.log(`  + ${s.header}`);
    }
    console.log('');
    console.log('Rotation script:');
    console.log('  1. Copy the section text from CLAUDE.md (from "## v...changelog" to the next "## ")');
    console.log('  2. Prepend to docs/CHANGELOG.md after its header');
    console.log('  3. Delete from CLAUDE.md');
    console.log('  4. Re-run this script to verify');
    console.log('');
    console.log('Or do it manually — there is no automated rewrite (too risky for a');
    console.log('file that contains the entire working agreement with Claude).');
  }
  console.log('');
}

if (existsSync(CHANGELOG)) {
  const clSize = Buffer.byteLength(readFileSync(CHANGELOG, 'utf-8'), 'utf-8');
  console.log(`For reference, docs/CHANGELOG.md is currently ${(clSize / 1024).toFixed(1)} KB.`);
  console.log('');
}

process.exit(exitCode);
