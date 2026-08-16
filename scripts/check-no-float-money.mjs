#!/usr/bin/env node
/**
 * @file check-no-float-money.mjs
 * @description Finance app safety gate — scan for money-looking fields
 *              typed as `number` (float) instead of `bigint` or Money type.
 *
 *              Float arithmetic in JavaScript breaks for money:
 *                0.1 + 0.2 === 0.30000000000000004
 *                1.005 * 100 === 100.49999999999999
 *
 *              For finance apps this MUST be enforced. Use bigint minor units
 *              (cents/копейки) or Decimal library.
 *
 *  Usage:
 *    node scripts/check-no-float-money.mjs              # scan ./src/
 *    node scripts/check-no-float-money.mjs <project>    # scan project/src/
 *    node scripts/check-no-float-money.mjs --json       # machine-readable
 *
 *  Exit:
 *    0 — no violations
 *    1 — found float-typed money fields
 *    2 — invocation error
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const JSON_MODE = args.includes('--json');

const ROOT = path.resolve(positional[0] || process.cwd());
const SRC = path.join(ROOT, 'src');

if (!fs.existsSync(SRC)) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: false, error: `src/ not found at ${SRC}` }, null, 2));
  } else {
    console.error(`✗ src/ not found at ${SRC}`);
  }
  process.exit(2);
}

// Field names that strongly suggest money
const MONEY_FIELDS = [
  'balance', 'amount', 'price', 'total', 'subtotal', 'cost',
  'fee', 'tax', 'change', 'paid', 'owe', 'debit', 'credit',
  'principal', 'interest', 'commission', 'discount', 'refund',
  'salary', 'wage', 'income', 'expense', 'profit', 'loss',
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);
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
  let content;
  try { content = fs.readFileSync(file, 'utf8'); }
  catch { continue; }

  for (const field of MONEY_FIELDS) {
    // Match: `fieldName: number` or `fieldName?: number`
    // Capture: the field name as it appears (preserves casing)
    const re = new RegExp(
      `\\b(${field})\\??\\s*:\\s*number\\b`,
      'gi'
    );
    let m;
    while ((m = re.exec(content)) !== null) {
      const before = content.slice(0, m.index);
      const lineNum = before.split('\n').length;
      // Skip if in comment (line) — quick heuristic
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineSoFar = content.slice(lineStart, m.index);
      if (lineSoFar.trim().startsWith('//') || lineSoFar.trim().startsWith('*')) continue;

      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        line: lineNum,
        field: m[1],
        snippet: content.slice(m.index, m.index + 40).split('\n')[0],
      });
    }
  }
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
  console.log('✓ No float-typed money fields detected.');
  console.log('  All money fields use bigint or Money type — financial precision maintained.');
  process.exit(0);
}

console.log(`✗ ${violations.length} float-typed money field(s) detected:\n`);
for (const v of violations.slice(0, 30)) {
  console.log(`  ${v.file}:${v.line}  ${v.snippet.trim()}`);
}
if (violations.length > 30) console.log(`  ... and ${violations.length - 30} more`);
console.log('');
console.log('Why this matters:');
console.log('  JavaScript Number is IEEE 754 float — 0.1 + 0.2 === 0.30000000000000004');
console.log('  Money MUST use either bigint minor units (cents/копейки) or Decimal library.');
console.log('');
console.log('Fix: change `: number` to `: bigint` (and store as cents, divide by 100 for display)');
console.log('  OR use Decimal type from decimal.js / big.js.');
console.log('  See /finance-app-foundation skill for full guide.');
process.exit(1);
