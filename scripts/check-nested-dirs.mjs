#!/usr/bin/env node
/**
 * @file check-nested-dirs.mjs
 * @description Detect "nested duplicate" directories в sibling projects which
 *              accumulated from broken Copy-Item -Recurse calls на rerun (Lesson #46).
 *
 *              Symptom: siblings have platforms/platforms/, .claude/.claude/,
 *              wiki/wiki/, etc. — directories which contain a directory of the
 *              same name. Always a bug.
 *
 *              Why: PowerShell Copy-Item -Recurse -Force has quirk — if destination
 *              dir exists, source gets nested INTO it instead of merging. Multiple
 *              sync runs created multiple nesting levels.
 *
 *              Fixed sync.ps1 в v4.10.12 (platforms) и v4.10.13 (helper hardened).
 *              But existing artifacts from past syncs need cleanup. This script
 *              detects them.
 *
 * Usage:
 *   node scripts/check-nested-dirs.mjs           — human-readable
 *   node scripts/check-nested-dirs.mjs --json    — machine-readable
 *   node scripts/check-nested-dirs.mjs --fix     — auto-remove nested dupes
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const FIX_MODE = args.includes('--fix');

const FORGE_ROOT = path.resolve(process.cwd());
const PARENT = path.dirname(FORGE_ROOT);

if (!fs.existsSync(path.join(FORGE_ROOT, '.claude'))) {
  console.error('✗ Run from Forge folder root (no .claude/ here)');
  process.exit(2);
}

/**
 * Recursively find any directory which contains a subdirectory of the same name.
 * E.g., parent/platforms/platforms or wiki/wiki are flagged.
 *
 * Returns array of {path, name} objects.
 */
function findNestedDupes(rootDir, maxDepth = 5) {
  const found = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip well-known noise
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const childPath = path.join(dir, entry.name);
      const grandchildSameName = path.join(childPath, entry.name);
      if (fs.existsSync(grandchildSameName)) {
        try {
          const stat = fs.statSync(grandchildSameName);
          if (stat.isDirectory()) {
            found.push({
              parent: childPath,
              nested: grandchildSameName,
              name: entry.name,
            });
          }
        } catch { /* ignore */ }
      }
      walk(childPath, depth + 1);
    }
  }
  walk(rootDir, 0);
  return found;
}

function findSiblings() {
  if (!fs.existsSync(PARENT)) return [];
  const entries = fs.readdirSync(PARENT, { withFileTypes: true });
  const siblings = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const fullPath = path.join(PARENT, e.name);
    if (fullPath === FORGE_ROOT) continue;
    if (fs.existsSync(path.join(fullPath, '.claude'))) {
      siblings.push({ name: e.name, path: fullPath });
    }
  }
  return siblings;
}

function rmRecursive(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

// MAIN
const siblings = findSiblings();
const reports = [];

// Check Forge folder itself первым
const forgeReport = {
  name: path.basename(FORGE_ROOT) + ' (Forge)',
  path: FORGE_ROOT,
  nested: findNestedDupes(FORGE_ROOT),
};
reports.push(forgeReport);

for (const sib of siblings) {
  reports.push({
    name: sib.name,
    path: sib.path,
    nested: findNestedDupes(sib.path),
  });
}

const totalIssues = reports.reduce((sum, r) => sum + r.nested.length, 0);

if (JSON_MODE) {
  console.log(JSON.stringify({
    ok: totalIssues === 0,
    forge_root: FORGE_ROOT,
    reports,
    total_issues: totalIssues,
  }, null, 2));
  process.exit(totalIssues === 0 ? 0 : 1);
}

// Human-readable
console.log(`Nested-dupes audit — Forge: ${path.basename(FORGE_ROOT)}, ${siblings.length} sibling(s)\n`);

if (totalIssues === 0) {
  console.log('✓ No nested duplicate directories found.');
  process.exit(0);
}

for (const report of reports) {
  if (report.nested.length === 0) {
    console.log(`✓ ${report.name}`);
    continue;
  }
  console.log(`✗ ${report.name} — ${report.nested.length} nested dupe(s):`);
  for (const issue of report.nested) {
    const relPath = path.relative(report.path, issue.nested);
    console.log(`    ${relPath}/`);
  }
}

console.log(`\nTotal: ${totalIssues} nested duplicate director${totalIssues === 1 ? 'y' : 'ies'} across ${reports.filter(r => r.nested.length > 0).length} location(s).\n`);

if (FIX_MODE) {
  console.log('--fix mode: removing nested dupes...\n');
  let removed = 0;
  for (const report of reports) {
    for (const issue of report.nested) {
      try {
        rmRecursive(issue.nested);
        const relPath = path.relative(report.path, issue.nested);
        console.log(`  ✓ Removed ${report.name}/${relPath}`);
        removed++;
      } catch (e) {
        console.log(`  ✗ Failed ${report.name}: ${e.message}`);
      }
    }
  }
  console.log(`\n✓ Removed ${removed} nested duplicate(s). Re-run audit to verify.`);
} else {
  console.log('Run with --fix to auto-remove nested dupes.');
  console.log('Or manually:  Remove-Item -Recurse -Force <path-shown-above>');
}

process.exit(1);
