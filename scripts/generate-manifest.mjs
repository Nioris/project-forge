#!/usr/bin/env node
/**
 * @file generate-manifest.mjs
 * @description Generates MANIFEST.txt — newline-separated list of relative file
 *              paths that SHOULD exist в this version of Forge. Used by
 *              upgrade.ps1 to detect orphan files automatically (files that
 *              exist on disk but not в new MANIFEST).
 *
 *              Run during build (before zip). Manifest gets packaged inside
 *              the zip. When user extracts new zip over old folder, MANIFEST.txt
 *              gets overwritten. upgrade.ps1 reads MANIFEST and removes files
 *              not listed there.
 *
 *              This is more robust than maintaining $Orphans by hand:
 *              forgotten removals get caught automatically.
 *
 * Excluded paths (treated as user data, not Forge content):
 *   - node_modules/, .git/, .context-backups/
 *   - wiki/sessions/  (session logs accumulate per-user)
 *   - output/, dist/, build/, *.zip  (build artifacts)
 *   - .DS_Store, *.tmp, *.bak  (OS/editor junk)
 *   - .dashboard-structure-baseline.json  (user-mutable state)
 *   - MANIFEST.txt  (this file)
 *
 * Usage:
 *   node scripts/generate-manifest.mjs           — writes MANIFEST.txt
 *   node scripts/generate-manifest.mjs --check   — exits 1 if MANIFEST stale
 */

import fs from 'node:fs';
import path from 'node:path';

const FORGE_ROOT = path.resolve(process.cwd());
const MANIFEST_PATH = path.join(FORGE_ROOT, 'MANIFEST.txt');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');

// Patterns to exclude (relative path patterns)
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.context-backups',
  'output',
  'dist',
  'build',
]);

const EXCLUDE_PATH_PREFIXES = [
  'wiki/sessions/',
];

const EXCLUDE_FILES = new Set([
  '.DS_Store',
  'MANIFEST.txt',
  '.dashboard-structure-baseline.json',
]);

const EXCLUDE_EXTENSIONS = new Set([
  '.tmp', '.bak', '.swp', '.zip',
]);

function shouldExclude(relPath, name) {
  if (EXCLUDE_FILES.has(name)) return true;
  if (EXCLUDE_EXTENSIONS.has(path.extname(name))) return true;
  const normalized = relPath.replace(/\\/g, '/');
  for (const prefix of EXCLUDE_PATH_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

function walk(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), results);
    } else if (entry.isFile()) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(FORGE_ROOT, fullPath);
      if (shouldExclude(relPath, entry.name)) continue;
      results.push(relPath.replace(/\\/g, '/'));
    }
  }
  return results;
}

const files = walk(FORGE_ROOT).sort();
const manifest = files.join('\n') + '\n';

if (CHECK) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('[X] MANIFEST.txt missing. Run: node scripts/generate-manifest.mjs');
    process.exit(1);
  }
  const existing = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  if (existing === manifest) {
    console.log(`[OK] MANIFEST.txt up to date (${files.length} files).`);
    process.exit(0);
  } else {
    console.error('[X] MANIFEST.txt stale. Regenerate: node scripts/generate-manifest.mjs');
    // Show diff summary
    const existingSet = new Set(existing.trim().split('\n'));
    const newSet = new Set(files);
    const added = [...newSet].filter(f => !existingSet.has(f));
    const removed = [...existingSet].filter(f => !newSet.has(f));
    if (added.length > 0) {
      console.error(`    Added (${added.length}): ${added.slice(0, 5).join(', ')}${added.length > 5 ? '...' : ''}`);
    }
    if (removed.length > 0) {
      console.error(`    Removed (${removed.length}): ${removed.slice(0, 5).join(', ')}${removed.length > 5 ? '...' : ''}`);
    }
    process.exit(1);
  }
}

fs.writeFileSync(MANIFEST_PATH, manifest, 'utf-8');
console.log(`[OK] MANIFEST.txt written: ${files.length} files`);
