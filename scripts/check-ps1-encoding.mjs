#!/usr/bin/env node
/**
 * @file check-ps1-encoding.mjs
 * @description Gate against PowerShell parser crashes on non-ASCII content.
 *
 *   Background (Lesson #49):
 *
 *   Windows PowerShell (powershell.exe 5.x) reads .ps1 files using the system
 *   ANSI code page (cp1251 in Russia) by default. Files saved as UTF-8
 *   WITHOUT BOM get misread - em-dashes (—), cyrillic letters, smart quotes,
 *   arrows all turn into garbage. Worse: those garbage bytes can include
 *   unbalanced parens or quotes, causing parse errors like:
 *
 *     "Missing closing ')' in expression"
 *     "Unexpected token"
 *
 *   v4.10.15 had this bug: upgrade.ps1 was UTF-8 без BOM with em-dashes in
 *   comments. powershell.exe parsed them as cp1251 garbage and crashed.
 *
 *   FIX: either
 *     A. Save .ps1 files as UTF-8 WITH BOM (powershell.exe respects BOM), OR
 *     B. Keep .ps1 files ASCII-only (no em-dashes, no cyrillic).
 *
 *   This verifier requires one of those. Both is fine. Neither = fail.
 *
 *   PowerShell 7+ (pwsh.exe) reads UTF-8 without BOM correctly, но we can't
 *   assume users have pwsh — Windows ships powershell.exe 5.x by default.
 *
 *   Affected files: any .ps1 in repository.
 *
 *   Exit:
 *     0 = all .ps1 files safe (have BOM OR pure ASCII)
 *     1 = one or more .ps1 files have non-ASCII without BOM (parse risk)
 *     2 = invocation error
 */

import fs from 'node:fs';
import path from 'node:path';

const FORGE_ROOT = path.resolve(process.cwd());

function findPs1Files(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findPs1Files(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.ps1')) {
      results.push(full);
    }
  }
  return results;
}

function checkFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const hasBOM = buf.length >= 3 &&
                 buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;

  // Scan for non-ASCII bytes (after BOM if present)
  const start = hasBOM ? 3 : 0;
  const nonAscii = [];
  for (let i = start; i < buf.length; i++) {
    if (buf[i] > 127) {
      // Find line number
      let line = 1;
      for (let j = 0; j < i; j++) {
        if (buf[j] === 0x0A) line++;
      }
      nonAscii.push({ offset: i, line, byte: buf[i] });
      if (nonAscii.length >= 5) break;  // first 5 only
    }
  }

  return {
    path: filePath,
    relPath: path.relative(FORGE_ROOT, filePath),
    hasBOM,
    nonAscii,
    safe: hasBOM || nonAscii.length === 0,
  };
}

const files = findPs1Files(FORGE_ROOT);
if (files.length === 0) {
  console.log('No .ps1 files found.');
  process.exit(0);
}

const reports = files.map(checkFile);
const failed = reports.filter(r => !r.safe);

console.log(`Checked ${files.length} .ps1 file(s).\n`);

for (const r of reports) {
  const status = r.safe ? '✓' : '✗';
  const tag = r.hasBOM ? '[BOM]' : '[ASCII]';
  if (r.safe) {
    console.log(`  ${status} ${r.relPath}  ${tag}`);
  } else {
    console.log(`  ${status} ${r.relPath}`);
    console.log(`      no BOM + has non-ASCII at line(s): ${r.nonAscii.map(n => n.line).join(', ')}`);
    console.log(`      → either add UTF-8 BOM or strip non-ASCII chars`);
  }
}

if (failed.length === 0) {
  console.log('\n✓ All .ps1 files are safe for Windows PowerShell.');
  process.exit(0);
} else {
  console.log(`\n✗ ${failed.length} .ps1 file(s) at risk of parse errors on Windows PowerShell.`);
  console.log('  Fix: save as UTF-8 with BOM, OR strip all non-ASCII chars (em-dash, cyrillic, etc).');
  process.exit(1);
}
