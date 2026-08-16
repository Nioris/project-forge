#!/usr/bin/env node
/**
 * @file check-inline-strings.mjs
 * @description i18n foundation enforcement gate.
 *              Scan src/ for cyrillic string literals NOT inside i18n/ folder.
 *              Cyrillic in code OUTSIDE src/i18n/ = inline string = i18n violation.
 *
 *              Returns exit 1 if any found, 0 if clean.
 *              Comments and JSX text content are NOT scanned (intentional).
 *
 *  Usage:
 *    node scripts/check-inline-strings.mjs              # scan ./src/
 *    node scripts/check-inline-strings.mjs <project>    # scan project/src/
 *    node scripts/check-inline-strings.mjs <project> --max=10  # show max 10 violations
 *    node scripts/check-inline-strings.mjs <project> --json    # machine-readable
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const maxArg = args.find(a => a.startsWith('--max='));
const MAX_SHOW = maxArg ? parseInt(maxArg.split('=')[1], 10) : 30;
const JSON_MODE = args.includes('--json');

const ROOT = path.resolve(positional[0] || '.');
const SRC = path.join(ROOT, 'src');

if (!fs.existsSync(SRC)) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: false, error: `src/ not found at ${SRC}` }, null, 2));
  } else {
    console.error(`✗ src/ not found at ${SRC}`);
    console.error(`  This script expects a typical TypeScript/JS project layout.`);
  }
  process.exit(2);
}

const CYRILLIC = /[А-Яа-яЁё]/;
const SKIP_DIRS = new Set(['node_modules', 'i18n', 'dist', 'build', '.git']);
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

function walk(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (EXTS.some(x => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  let lines;
  try { lines = fs.readFileSync(file, 'utf8').split('\n'); }
  catch { continue; }

  let inBlockComment = false;

  lines.forEach((line, i) => {
    let stripped = line;

    // Strip block comments (multi-line aware)
    if (inBlockComment) {
      const closeIdx = stripped.indexOf('*/');
      if (closeIdx >= 0) { stripped = stripped.slice(closeIdx + 2); inBlockComment = false; }
      else { return; }  // entire line inside block comment
    }
    let blockOpen = stripped.indexOf('/*');
    while (blockOpen >= 0) {
      const blockClose = stripped.indexOf('*/', blockOpen + 2);
      if (blockClose >= 0) {
        stripped = stripped.slice(0, blockOpen) + stripped.slice(blockClose + 2);
        blockOpen = stripped.indexOf('/*');
      } else {
        stripped = stripped.slice(0, blockOpen);
        inBlockComment = true;
        break;
      }
    }

    // Strip line comments
    stripped = stripped.replace(/\/\/.*$/, '');

    // Match string literals
    const literals = stripped.match(/(['"`])([^'"`\\]|\\.)*?\1/g) || [];
    for (const lit of literals) {
      if (CYRILLIC.test(lit)) {
        violations.push({
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          line: i + 1,
          literal: lit.length > 60 ? lit.slice(0, 60) + '…' : lit,
        });
      }
    }
  });
}

if (JSON_MODE) {
  console.log(JSON.stringify({
    ok: violations.length === 0,
    total: violations.length,
    violations,
  }, null, 2));
  process.exit(violations.length === 0 ? 0 : 1);
}

if (violations.length === 0) {
  console.log('✓ No inline cyrillic strings in src/ (excluding i18n/)');
  console.log('  i18n discipline maintained.');
  process.exit(0);
}

console.log(`✗ ${violations.length} inline string violation(s):\n`);
for (const v of violations.slice(0, MAX_SHOW)) {
  console.log(`  ${v.file}:${v.line}  ${v.literal}`);
}
if (violations.length > MAX_SHOW) {
  console.log(`  … and ${violations.length - MAX_SHOW} more (use --max=${violations.length} to show all)`);
}
console.log('');
console.log('Fix: wrap each literal with t() / td(), add key to src/i18n/types.ts + ru.ts/en.ts.');
console.log('See /i18n-foundation skill for retrofit pipeline.');
process.exit(1);
