#!/usr/bin/env node
/**
 * @file check-bat-encoding.mjs
 * @description Gate against v4.7.1-style cmd.exe parser crashes.
 *
 *   Background (Lesson #20):
 *
 *   cmd.exe parses .bat files with subtle quirks:
 *
 *   - `chcp 65001` makes ECHO understand UTF-8, BUT the parser tokenizes
 *     bytes BEFORE chcp takes effect.
 *   - Multi-byte UTF-8 chars (em-dash —, arrows →, box-drawing ─│┌┐) are
 *     handled OK on their own lines.
 *   - **BUT** inside `(...)` groups (if/for/else blocks spanning multiple
 *     lines), the parser breaks on multi-byte chars with cryptic error
 *     "{char} was unexpected at this time."
 *
 *   v4.7.1 had this exact bug: em-dash in `if NOT EXIST (...) else (...)` body
 *   crashed `scripts\\sync.bat` for users. Fixed by rewriting affected blocks
 *   in pure ASCII.
 *
 *   Without a gate, regression is guaranteed: copy-pasting Russian text or
 *   emoji into a .bat file would re-introduce the bug.
 *
 *   This script:
 *     1. Reads each .bat file line-by-line
 *     2. Tracks parenthesis nesting depth (multi-line () blocks)
 *     3. When depth > 0 (inside a block), checks line for non-ASCII bytes
 *     4. Comments (`::` or `REM`) are ignored even inside blocks
 *     5. Strings inside `"..."` are checked (cmd.exe parses these too)
 *     6. Rejects bare LF line endings; shipped Windows entrypoints use CRLF
 *
 *  Usage:
 *    node scripts/check-bat-encoding.mjs              # scan all .bat in repo
 *    node scripts/check-bat-encoding.mjs <path>       # scan specific dir
 *    node scripts/check-bat-encoding.mjs --json       # machine-readable
 *
 *  Exit:
 *    0 — all .bat files clean (or no .bat files found)
 *    1 — non-ASCII detected inside () blocks
 *    2 — invocation error
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const JSON_MODE = args.includes('--json');

const ROOT = path.resolve(positional[0] || process.cwd());

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function findBatFiles(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findBatFiles(full));
    else if (e.name.toLowerCase().endsWith('.bat')) out.push(full);
  }
  return out;
}

/**
 * Scan a single .bat file for non-ASCII inside () blocks.
 *
 * State machine: track open parens count. Increment on `(` (not in comment,
 * not in string). Decrement on `)`. When count > 0, line is "inside a block".
 *
 * Returns array of violations.
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations = [];

  if (/(?<!\r)\n/.test(content)) {
    violations.push({
      file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
      line: 1,
      snippet: 'Bare LF line endings detected; convert the batch file to CRLF.',
      chars: ['LF_ONLY'],
    });
  }

  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    // Strip line comments — cmd uses :: or REM
    // (but `::` is also a label declaration — cmd treats single-line `::` as comment too)
    const trimmed = line.trimStart();
    const isComment = trimmed.startsWith('::') ||
                      /^rem\s/i.test(trimmed) ||
                      trimmed === 'rem' || /^rem$/i.test(trimmed);

    // v4.9.2 fix: previously comments were skipped entirely, but Lesson #20 (v4.7.1)
    // showed that cmd.exe parser tokenizes bytes BEFORE checking semantics — meaning
    // multi-byte chars in comments INSIDE `()` blocks STILL crash the parser.
    //
    // Strategy:
    //   - Outside () blocks: comments can have any chars (true comments)
    //   - Inside () blocks: comments still scanned for non-ASCII
    //   - Either way: don't update parens depth from comment text (comments can't open/close blocks)
    if (isComment && depth === 0) {
      // Top-level comment — safe, skip
      continue;
    }
    // If inside a block (depth > 0), fall through to scan для non-ASCII.
    // For depth tracking on comment lines we don't update — comments are treated as
    // text-only lines that don't affect block nesting.
    if (isComment) {
      // Scan только для non-ASCII chars, don't update depth
      for (let j = 0; j < line.length; j++) {
        const code = line.charCodeAt(j);
        if (code > 127) {
          violations.push({
            file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
            line: lineNum,
            snippet: line.length > 80 ? line.slice(0, 77) + '...' : line,
            chars: [`${line[j]}(U+${code.toString(16).padStart(4, '0').toUpperCase()})`],
          });
        }
      }
      continue;
    }

    // Track depth — count ( and ) outside of strings
    // Simple state: walk through chars, toggle inString on unescaped quote
    let inString = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth > 0) depth--;
      }
    }

    // After processing this line — check if line was inside a block
    // (i.e. depth was > 0 BEFORE this line OR became > 0 during this line)
    // For simplicity: check whether line had any character inside an active block.
    // We'll re-walk and check non-ASCII while tracking inline depth.
    let inlineDepth = depth - countOpens(line) + countOpens(line); // placeholder
    // Simpler approach: if line ENDED with depth > 0, OR had `(` that opened a multi-line block
    // OR closed one, treat as "inside block" for non-ASCII check purposes.

    // Determine if any char on this line is in a "block context".
    // We re-walk: track depth from start-of-line value (depth BEFORE this line minus opens in this line).
    let preLineDepth = depth;
    // Recompute opens on this line
    let opens = 0, closes = 0;
    let inS = false;
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === '"') { inS = !inS; continue; }
      if (inS) continue;
      if (c === '(') opens++;
      else if (c === ')') closes++;
    }
    preLineDepth = depth - opens + closes;
    if (preLineDepth < 0) preLineDepth = 0;

    // Now: line is "inside block" if either preLineDepth > 0
    // (line started inside a block) OR opens > 0 with multi-line content.
    // For non-ASCII detection, we treat ANY portion of the line under depth > 0 as "inside".
    //
    // Walk line again, tracking running depth from preLineDepth, check non-ASCII at positions
    // where running depth > 0.
    let runDepth = preLineDepth;
    let inS2 = false;
    const violationsOnLine = [];
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === '"') { inS2 = !inS2; }
      if (!inS2) {
        if (c === '(') runDepth++;
        else if (c === ')' && runDepth > 0) runDepth--;
      }
      // Check non-ASCII when inside block
      if (runDepth > 0) {
        const code = c.charCodeAt(0);
        if (code > 127) {
          violationsOnLine.push({ col: k + 1, char: c, code });
        }
      }
    }

    if (violationsOnLine.length > 0) {
      violations.push({
        file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
        line: lineNum,
        snippet: line.length > 80 ? line.slice(0, 77) + '...' : line,
        chars: violationsOnLine.map(v => `${v.char}(U+${v.code.toString(16).padStart(4, '0').toUpperCase()})`),
      });
    }
  }

  return violations;
}

function countOpens(line) {
  let count = 0;
  let inS = false;
  for (const c of line) {
    if (c === '"') { inS = !inS; continue; }
    if (!inS && c === '(') count++;
  }
  return count;
}

// Main
const batFiles = findBatFiles(ROOT);

if (batFiles.length === 0) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: true, total_files: 0, violations: [] }, null, 2));
  } else {
    console.log('No .bat files found — nothing to check.');
  }
  process.exit(0);
}

const allViolations = [];
const fileResults = [];

for (const file of batFiles) {
  let v;
  try {
    v = scanFile(file);
  } catch (e) {
    if (JSON_MODE) {
      console.log(JSON.stringify({ ok: false, error: `Failed to scan ${file}: ${e.message}` }, null, 2));
    } else {
      console.error(`✗ Failed to scan ${file}: ${e.message}`);
    }
    process.exit(2);
  }
  fileResults.push({ file: path.relative(ROOT, file), violations: v.length });
  allViolations.push(...v);
}

if (JSON_MODE) {
  console.log(JSON.stringify({
    ok: allViolations.length === 0,
    total_files: batFiles.length,
    files: fileResults,
    violations: allViolations,
  }, null, 2));
  process.exit(allViolations.length === 0 ? 0 : 1);
}

// Human output
if (allViolations.length === 0) {
  console.log(`✓ All ${batFiles.length} .bat file(s) clean — CRLF and no non-ASCII inside () blocks.`);
  for (const fr of fileResults) {
    console.log(`  ✓ ${fr.file}`);
  }
  process.exit(0);
}

console.log(`✗ ${allViolations.length} batch encoding/line-ending issue(s):\n`);
for (const v of allViolations.slice(0, 30)) {
  console.log(`  ${v.file}:${v.line}  ${v.chars.join(' ')}`);
  console.log(`    ${v.snippet}`);
}
if (allViolations.length > 30) {
  console.log(`  ... and ${allViolations.length - 30} more`);
}
console.log('');
console.log('Why this matters (Lesson #20):');
console.log('  cmd.exe parses .bat byte-by-byte BEFORE chcp 65001 takes effect.');
console.log('  Multi-byte chars (em-dash, arrows, box-drawing) inside () groups');
console.log('  cause cryptic "{char} was unexpected at this time" errors.');
console.log('');
console.log('Fix: replace non-ASCII chars with ASCII equivalents inside () blocks.');
console.log('  em-dash —    →   - or --');
console.log('  arrows  →    →   ->');
console.log('  box     ─│   →   - |');
console.log('  Russian text  →  English equivalent (or move outside () block)');
console.log('');
console.log('OUTSIDE () blocks (e.g., echo statements at top level), non-ASCII');
console.log('is OK provided "chcp 65001" was set first.');
console.log('All shipped .bat files must use CRLF line endings.');
process.exit(1);
