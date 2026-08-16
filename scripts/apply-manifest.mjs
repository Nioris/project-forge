#!/usr/bin/env node
/**
 * @file apply-manifest.mjs
 * @description Reads MANIFEST.txt и removes files on disk that aren't listed.
 *              Counterpart to generate-manifest.mjs. Used by upgrade.sh and
 *              upgrade.ps1 (both call this или its equivalent logic).
 *
 *              Protected paths/files never removed (user data, build artifacts).
 *
 * Usage:
 *   node scripts/apply-manifest.mjs            — apply
 *   node scripts/apply-manifest.mjs --dry      — preview only
 */

import fs from 'node:fs';
import path from 'node:path';

const FORGE_ROOT = path.resolve(process.cwd());
const MANIFEST_PATH = path.join(FORGE_ROOT, 'MANIFEST.txt');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('      MANIFEST.txt not found - skipping.');
  process.exit(0);
}

// Load manifest
const manifest = new Set(
  fs.readFileSync(MANIFEST_PATH, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
);
console.log(`      Manifest has ${manifest.size} expected files.`);

// Protected paths/files
const PROTECTED_PREFIXES = [
  'node_modules/', '.git/', '.context-backups/',
  'output/', 'dist/', 'build/', 'wiki/sessions/',
];
// ПОЛЬЗОВАТЕЛЬСКИЕ ДАННЫЕ не входят в MANIFEST по определению — удалять их нельзя.
// Полевой инцидент 31.07.2026: asset-library.json (294 источника) вычищен как «сирота».
// Такие файлы не удаляем, а ПЕРЕНОСИМ в ../forge-data (см. moveToData ниже).
const USER_DATA_NAMES = new Set(['asset-library.json']);
const PROTECTED_NAMES = new Set([
  'MANIFEST.txt',
  '.dashboard-structure-baseline.json',
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
]);
const PROTECTED_EXTENSIONS = new Set(['.tmp', '.bak', '.swp', '.zip']);

function isProtected(relPath, name) {
  const norm = relPath.replace(/\\/g, '/');
  for (const prefix of PROTECTED_PREFIXES) {
    if (norm.startsWith(prefix)) return true;
  }
  if (PROTECTED_NAMES.has(name) || USER_DATA_NAMES.has(name)) return true;
  if (PROTECTED_EXTENSIONS.has(path.extname(name))) return true;
  return false;
}

// Walk actual files
const orphans = [];
function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(FORGE_ROOT, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      let prot = false;
      for (const p of PROTECTED_PREFIXES) {
        if ((rel + '/').startsWith(p)) { prot = true; break; }
      }
      if (!prot) walk(full);
    } else if (e.isFile()) {
      if (isProtected(rel, e.name)) continue;
      if (!manifest.has(rel)) orphans.push(rel);
    }
  }
}
walk(FORGE_ROOT);

if (orphans.length === 0) {
  console.log('      No manifest orphans found.');
  process.exit(0);
}

console.log(`      Found ${orphans.length} file(s) not in manifest:`);
let removed = 0;
for (const orphan of orphans) {
  if (DRY) {
    console.log(`      [DRY] ${orphan}`);
    continue;
  }
  try {
    fs.unlinkSync(path.join(FORGE_ROOT, orphan));
    console.log(`      [-] ${orphan}`);
    removed++;
  } catch (e) {
    console.log(`      [ERR] ${orphan}: ${e.message}`);
  }
}

if (DRY) {
  console.log(`\n      [DRY] Would remove ${orphans.length} file(s).`);
} else {
  console.log(`      Removed ${removed} of ${orphans.length}.`);
}
