#!/usr/bin/env node
/**
 * @file check-bat-comments.mjs
 * @description Detects `::` style comments inside () blocks в .bat files.
 *
 *              cmd.exe landmine: `::` is a label-style comment. Inside a
 *              parenthesized block (if/for/else body), `::` breaks the parser
 *              с cryptic errors like "Непредвиденное появление: or" /
 *              "X was unexpected at this time".
 *
 *              `REM` comments work fine inside () blocks. `::` does NOT.
 *
 *              Rule: inside any () block, use REM not ::. Top-level :: is fine.
 *
 *              Lesson #68 (v4.10.35): discovered when sync.bat broke с
 *              "Непредвиденное появление: or" — :: comments containing
 *              "/release-ready ... /fill-yandex" inside a for-loop body.
 *
 * Usage:
 *   node scripts/check-bat-comments.mjs            # checks all .bat в repo
 *   node scripts/check-bat-comments.mjs <file>     # checks one file
 *
 * Exit: 0 = clean, 1 = violations found, 2 = error
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const singleFile = args.find(a => !a.startsWith('--'));

function findBatFiles(dir, depth = 0, results = []) {
  if (depth > 6) return results;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.context-backups'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.endsWith('.bat')) results.push(full);
      else if (e.isDirectory()) findBatFiles(full, depth + 1, results);
    }
  } catch { /* skip */ }
  return results;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();

    // Check for :: comment while inside a () block
    if (stripped.startsWith('::') && depth > 0) {
      violations.push({
        line: i + 1,
        text: stripped.slice(0, 70),
        depth,
      });
    }

    // Update paren depth — rough count (ignores quoted parens, но good enough
    // for typical .bat structure where () are block delimiters)
    // Skip parens inside quoted strings
    let inQuote = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') inQuote = !inQuote;
      if (inQuote) continue;
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
    }
  }

  return violations;
}

const files = singleFile ? [path.resolve(singleFile)] : findBatFiles(ROOT);

if (files.length === 0) {
  console.log('No .bat files found.');
  process.exit(0);
}

let totalViolations = 0;
const report = [];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`[X] File not found: ${file}`);
    continue;
  }
  const violations = checkFile(file);
  const rel = path.relative(ROOT, file);
  if (violations.length > 0) {
    totalViolations += violations.length;
    report.push({ file: rel, violations });
  }
}

if (totalViolations === 0) {
  console.log(`✓ All ${files.length} .bat file(s) clean — no :: comments inside () blocks.`);
  for (const f of files) {
    console.log(`  ✓ ${path.relative(ROOT, f)}`);
  }
  process.exit(0);
}

console.log(`✗ ${totalViolations} :: comment(s) inside () blocks:\n`);
for (const r of report) {
  for (const v of r.violations) {
    console.log(`  ${r.file}:${v.line}  (paren depth ${v.depth})`);
    console.log(`     ${v.text}`);
  }
}

console.log('');
console.log('Why this matters (Lesson #68):');
console.log('  cmd.exe `::` is a label-style comment. Inside () blocks (if/for/else');
console.log('  bodies) it breaks the parser — cryptic errors like');
console.log('  "Непредвиденное появление: or" / "X was unexpected at this time".');
console.log('');
console.log('Fix: replace `::` with `REM` inside () blocks. REM works everywhere.');
console.log('     Top-level :: (column 0, outside blocks) is fine — leave those.');

process.exit(1);
