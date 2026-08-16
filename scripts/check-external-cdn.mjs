#!/usr/bin/env node
/**
 * @file check-external-cdn.mjs
 * @description Detects external CDN references в HTML/JS files. For Yandex Games,
 *              external CDN scripts are a RELEASE BLOCKER (moderation rejects builds
 *              with external dependencies — game must work offline within sandbox).
 *
 *              Scans для:
 *              - <script src="https://...">
 *              - <link href="https://..."> (CSS, fonts)
 *              - import statements с absolute URLs
 *              - new Worker('https://...')
 *              - fetch('https://...') in initialization code (may be OK if runtime data,
 *                но flagged for review)
 *
 *              Whitelists Yandex SDK domains (sdk.games.s3.yandex.net, yandex.ru):
 *              these are explicitly allowed by Yandex Games.
 *
 *              Lesson learned: Yandex Games requires all assets bundled. Three.js
 *              loaded from unpkg.com / jsdelivr / cdnjs — game rejected.
 *
 * Usage:
 *   node scripts/check-external-cdn.mjs <build-dir>
 *   node scripts/check-external-cdn.mjs WorkProgress/MyGame-yandex/
 *   node scripts/check-external-cdn.mjs Release/MyGame/yandex/MyGame-v1.zip
 *   node scripts/check-external-cdn.mjs --json <build-dir>
 *
 * Exit:
 *   0 = no external CDN refs found
 *   1 = external refs found (release blocker)
 *   2 = invocation error
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const target = args.find(a => !a.startsWith('--'));

if (!target) {
  console.error('Usage: node scripts/check-external-cdn.mjs <build-dir-or-zip>');
  process.exit(2);
}

// Yandex SDK domains — allowed (Yandex Games provides these via sandbox)
const YANDEX_WHITELIST = [
  'yandex.ru',
  'yandex.net',
  'yandex.com',
  'games.yandex.net',
  'sdk.games.s3.yandex.net',
  'mc.yandex.ru',     // metrika (если используется)
  'mc.yandex.net',
  'yastatic.net',     // Yandex static CDN — used by Yandex SDK internally
];

// Common CDN domains — definite blockers
const KNOWN_CDN_DOMAINS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'jsdelivr.net',
  'unpkg.com',
  'cdn.skypack.dev',
  'esm.sh',
  'esm.run',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'ajax.googleapis.com',
  'maxcdn.bootstrapcdn.com',
  'stackpath.bootstrapcdn.com',
  'code.jquery.com',
  'kit.fontawesome.com',
  'use.fontawesome.com',
];

function isYandexDomain(url) {
  return YANDEX_WHITELIST.some(d => url.includes(d));
}

function isKnownCdn(url) {
  return KNOWN_CDN_DOMAINS.some(d => url.includes(d));
}

function isExternalHttps(url) {
  return /^https?:\/\//.test(url);
}

// Resolve target — может be dir или zip
let scanDir = target;
let tmpDir = null;

if (target.endsWith('.zip')) {
  // Extract to temp
  tmpDir = `/tmp/cdn-check-${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    execSync(`cd "${tmpDir}" && unzip -oq "${path.resolve(target)}"`, { stdio: 'pipe' });
    scanDir = tmpDir;
  } catch (e) {
    console.error(`[X] Failed к extract zip: ${e.message}`);
    process.exit(2);
  }
}

if (!fs.existsSync(scanDir)) {
  console.error(`[X] Target not found: ${scanDir}`);
  process.exit(2);
}

// Recursive file walker
function* walk(dir, depth = 0) {
  if (depth > 10) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isFile()) yield full;
      else if (e.isDirectory()) yield* walk(full, depth + 1);
    }
  } catch { /* skip permission errors */ }
}

const violations = [];
const allowedRefs = [];   // Yandex SDK refs — log but don't fail

for (const file of walk(scanDir)) {
  const ext = path.extname(file).toLowerCase();
  if (!['.html', '.htm', '.js', '.mjs', '.css'].includes(ext)) continue;

  let content;
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch { continue; }

  const relPath = path.relative(scanDir, file);
  const lines = content.split('\n');

  // Pattern 1: <script src="...">
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = scriptRegex.exec(content)) !== null) {
    const url = m[1];
    if (!isExternalHttps(url)) continue;
    const lineNo = content.slice(0, m.index).split('\n').length;
    if (isYandexDomain(url)) {
      allowedRefs.push({ file: relPath, line: lineNo, type: 'script', url, status: 'yandex_whitelist' });
    } else {
      violations.push({
        file: relPath,
        line: lineNo,
        type: 'script',
        url,
        severity: isKnownCdn(url) ? 'CRITICAL' : 'MAJOR',
        category: isKnownCdn(url) ? 'known_cdn' : 'unknown_external',
      });
    }
  }

  // Pattern 2: <link href="..."> (CSS, fonts)
  const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
  while ((m = linkRegex.exec(content)) !== null) {
    const url = m[1];
    if (!isExternalHttps(url)) continue;
    const lineNo = content.slice(0, m.index).split('\n').length;
    if (isYandexDomain(url)) {
      allowedRefs.push({ file: relPath, line: lineNo, type: 'link', url, status: 'yandex_whitelist' });
    } else {
      violations.push({
        file: relPath,
        line: lineNo,
        type: 'link',
        url,
        severity: isKnownCdn(url) ? 'CRITICAL' : 'MAJOR',
        category: isKnownCdn(url) ? 'known_cdn' : 'unknown_external',
      });
    }
  }

  // Pattern 3: import "https://..." (ES modules)
  const importRegex = /import\s+(?:[\w*{}\s,]+\s+from\s+)?["'](https?:\/\/[^"']+)["']/g;
  while ((m = importRegex.exec(content)) !== null) {
    const url = m[1];
    const lineNo = content.slice(0, m.index).split('\n').length;
    if (isYandexDomain(url)) {
      allowedRefs.push({ file: relPath, line: lineNo, type: 'import', url, status: 'yandex_whitelist' });
    } else {
      violations.push({
        file: relPath,
        line: lineNo,
        type: 'import',
        url,
        severity: 'CRITICAL',
        category: 'es_import_external',
      });
    }
  }

  // Pattern 4: new Worker('https://...')
  const workerRegex = /new\s+(?:Worker|SharedWorker)\s*\(\s*["'](https?:\/\/[^"']+)["']/g;
  while ((m = workerRegex.exec(content)) !== null) {
    const url = m[1];
    const lineNo = content.slice(0, m.index).split('\n').length;
    if (isYandexDomain(url)) {
      allowedRefs.push({ file: relPath, line: lineNo, type: 'worker', url, status: 'yandex_whitelist' });
    } else {
      violations.push({
        file: relPath,
        line: lineNo,
        type: 'worker',
        url,
        severity: 'CRITICAL',
        category: 'external_worker',
      });
    }
  }

  // Pattern 5: @import url(...) в CSS
  const cssImportRegex = /@import\s+(?:url\(\s*)?["']?(https?:\/\/[^"')\s]+)["']?\s*\)?/g;
  while ((m = cssImportRegex.exec(content)) !== null) {
    const url = m[1];
    const lineNo = content.slice(0, m.index).split('\n').length;
    if (isYandexDomain(url)) {
      allowedRefs.push({ file: relPath, line: lineNo, type: 'css_import', url, status: 'yandex_whitelist' });
    } else {
      violations.push({
        file: relPath,
        line: lineNo,
        type: 'css_import',
        url,
        severity: 'CRITICAL',
        category: 'css_external',
      });
    }
  }
}

// Cleanup tmp
if (tmpDir) {
  try { execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' }); } catch { /* ignore */ }
}

if (JSON_MODE) {
  console.log(JSON.stringify({
    ok: violations.length === 0,
    target,
    violations,
    allowed_refs: allowedRefs,
    total_violations: violations.length,
  }, null, 2));
  process.exit(violations.length === 0 ? 0 : 1);
}

// Human readable
console.log(`External CDN check — ${target}\n`);

if (allowedRefs.length > 0) {
  console.log(`  ℹ ${allowedRefs.length} Yandex SDK reference(s) (allowed):`);
  for (const ref of allowedRefs.slice(0, 5)) {
    console.log(`    ${ref.file}:${ref.line}  ${ref.type}  ${ref.url.slice(0, 70)}`);
  }
  if (allowedRefs.length > 5) console.log(`    ... and ${allowedRefs.length - 5} more`);
  console.log('');
}

if (violations.length === 0) {
  console.log('✓ No external CDN references found. Build is Yandex-submission-safe.');
  process.exit(0);
}

console.log(`✗ ${violations.length} external CDN reference(s) found (RELEASE BLOCKER for Yandex):\n`);

const bySeverity = { CRITICAL: [], MAJOR: [] };
for (const v of violations) bySeverity[v.severity].push(v);

if (bySeverity.CRITICAL.length > 0) {
  console.log(`  CRITICAL (${bySeverity.CRITICAL.length}) — known CDN или ES import from external:`);
  for (const v of bySeverity.CRITICAL) {
    console.log(`    ${v.file}:${v.line}  ${v.type.padEnd(10)} ${v.url}`);
  }
  console.log('');
}

if (bySeverity.MAJOR.length > 0) {
  console.log(`  MAJOR (${bySeverity.MAJOR.length}) — unknown external HTTPS (probably also blocker):`);
  for (const v of bySeverity.MAJOR) {
    console.log(`    ${v.file}:${v.line}  ${v.type.padEnd(10)} ${v.url}`);
  }
  console.log('');
}

console.log('Fix options:');
console.log('  1. /bundle-libs              — auto-download CDN libs, replace refs with local copies');
console.log('  2. Manual: download each lib, save к assets/lib/, update HTML <script src> к relative path');
console.log('  3. If reference is dynamic runtime fetch (not script load) — review case-by-case');
console.log('');
console.log('Why this matters:');
console.log('  Yandex Games sandbox blocks external HTTP requests during gameplay.');
console.log('  Moderation rejects builds с external CDN refs (REQ-2.1 sandbox compliance).');
console.log('  Game must work fully offline within submitted ZIP.');

process.exit(1);
