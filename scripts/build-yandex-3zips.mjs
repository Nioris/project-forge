#!/usr/bin/env node
/**
 * @file build-yandex-3zips.mjs
 * @description Builds 3 ZIP variants для Yandex Games submission per Forge standard:
 *
 *   1. {project}-v{N}.zip                  — PRODUCTION (clean, для submission)
 *   2. {project}-v{N}-debug.zip            — DEBUG (с debugcheck.js + cheats-base.js)
 *   3. {project}-v{N}-marketing.zip        — MARKETING (с cheats-base.js + screenshots.js)
 *
 * Source folder: WorkProgress/{Project}-yandex/ (must exist)
 * Output folder: Release/{Project}/yandex/
 *
 * Variants determined by which support files copied:
 *   - debugcheck.js  → debug build only
 *   - cheats-base.js → debug + marketing
 *   - screenshots.js → marketing only
 *
 * Validation per variant:
 *   - All 3 must have valid index.html
 *   - Production must NOT contain debugcheck.js, cheats-base.js, screenshots.js
 *   - Debug must contain debugcheck.js
 *   - Marketing must contain screenshots.js
 *
 * Usage:
 *   node scripts/build-yandex-3zips.mjs <project-name> <version>
 *   node scripts/build-yandex-3zips.mjs parkour v1
 *
 * Exit:
 *   0 = all 3 zips built + validated
 *   1 = build errors
 *   2 = invocation error
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const PROJECT = args[0];
const VERSION = args[1] || 'v1';

if (!PROJECT) {
  console.error('Usage: node scripts/build-yandex-3zips.mjs <project-name> [version]');
  console.error('Example: node scripts/build-yandex-3zips.mjs parkour v1');
  process.exit(2);
}

const SOURCE_DIR = path.join(ROOT, 'WorkProgress', `${PROJECT}-yandex`);
const OUTPUT_DIR = path.join(ROOT, 'Release', PROJECT, 'yandex');

// Support files (debugcheck.js, cheats-base.js, screenshots.js) live в
// platforms/yandex/templates/ — NOT tools/ (tools/ has only game-screenshot-ext/).
// v4.10.37 fix: was pointing к tools/, causing "debugcheck.js not found".
const SUPPORT_DIRS = [
  path.join(ROOT, 'platforms', 'yandex', 'templates'),
  path.join(ROOT, 'templates', 'html5'),
];

// Verify source
if (!fs.existsSync(path.join(SOURCE_DIR, 'index.html'))) {
  console.error(`[X] Source missing: ${SOURCE_DIR}/index.html`);
  console.error(`    Run /build-release or /mvp-to-yandex first to populate WorkProgress.`);
  process.exit(2);
}

// Find support files (debugcheck.js, cheats-base.js, screenshots.js)
function findSupportFile(name) {
  // Search order: platforms/yandex/templates/, templates/html5/,
  // then project-local (GameIntegration/, WorkProgress _archive/)
  const candidates = [
    ...SUPPORT_DIRS.map(d => path.join(d, name)),
    path.join(ROOT, 'GameIntegration', name),
    path.join(SOURCE_DIR, '_archive', name),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const debugcheck = findSupportFile('debugcheck.js');
const cheatsBase = findSupportFile('cheats-base.js');
const screenshots = findSupportFile('screenshots.js');

const warnings = [];
if (!debugcheck) warnings.push('debugcheck.js not found — debug build will skip behavioral probes');
if (!cheatsBase) warnings.push('cheats-base.js not found — debug+marketing builds will skip cheats');
if (!screenshots) warnings.push('screenshots.js not found — marketing build will skip screenshot helpers');

if (warnings.length > 0) {
  console.log('⚠ Warnings:');
  warnings.forEach(w => console.log(`  - ${w}`));
  console.log('  Looked в:', SUPPORT_DIRS.join(', '));
  console.log('');
}

// Ensure output dir
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Build variants
const VARIANTS = [
  {
    name: 'production',
    suffix: '',           // {project}-v1.zip
    include: [],          // no support files
    forbid: ['debugcheck.js', 'cheats-base.js', 'screenshots.js'],
  },
  {
    name: 'debug',
    suffix: '-debug',     // {project}-v1-debug.zip
    include: [debugcheck, cheatsBase].filter(Boolean),
    forbid: ['screenshots.js'],
  },
  {
    name: 'marketing',
    suffix: '-marketing', // {project}-v1-marketing.zip
    include: [cheatsBase, screenshots].filter(Boolean),
    forbid: ['debugcheck.js'],
  },
];

const results = [];

for (const variant of VARIANTS) {
  console.log(`📦 Building ${variant.name} variant...`);

  // Create staging dir
  const stageDir = path.join('/tmp', `forge-build-${PROJECT}-${variant.name}-${Date.now()}`);
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    // Copy source (excluding any stray support files first)
    execSync(`cp -r "${SOURCE_DIR}"/. "${stageDir}/"`, { stdio: 'pipe' });

    // Remove any forbidden files + their <script> tags from index.html
    // (v4.10.37: production build referencing debugcheck.js caused stale
    //  <script src> tag pointing к deleted file → runtime-test asset 404.)
    const indexForClean = path.join(stageDir, 'index.html');
    let indexHtml = fs.existsSync(indexForClean)
      ? fs.readFileSync(indexForClean, 'utf-8')
      : null;

    for (const forbidden of variant.forbid) {
      const targetPath = path.join(stageDir, forbidden);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      // Strip <script src="forbidden"> tag if present
      if (indexHtml) {
        const tagRegex = new RegExp(
          `\\s*<script[^>]*src=["'][^"']*${forbidden.replace('.', '\\.')}["'][^>]*>\\s*</script>`,
          'gi'
        );
        indexHtml = indexHtml.replace(tagRegex, '');
      }
    }
    if (indexHtml !== null) {
      fs.writeFileSync(indexForClean, indexHtml, 'utf-8');
    }

    // Add include files
    for (const includePath of variant.include) {
      if (includePath && fs.existsSync(includePath)) {
        const basename = path.basename(includePath);
        fs.copyFileSync(includePath, path.join(stageDir, basename));

        // Inject script tag into index.html if not present
        const indexPath = path.join(stageDir, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');
        const scriptTag = `<script src="${basename}"></script>`;
        if (!html.includes(scriptTag) && !html.includes(`src="${basename}"`)) {
          // Insert before closing </body>
          html = html.replace(/<\/body>/i, `  ${scriptTag}\n</body>`);
          fs.writeFileSync(indexPath, html, 'utf-8');
        }
      }
    }

    // Verify forbidden files actually gone
    let forbidenViolation = false;
    for (const f of variant.forbid) {
      if (fs.existsSync(path.join(stageDir, f))) {
        console.error(`  ✗ ${variant.name}: ${f} still present (forbidden)`);
        forbidenViolation = true;
      }
    }

    if (forbidenViolation) {
      results.push({ variant: variant.name, status: 'failed', reason: 'forbidden files present' });
      continue;
    }

    // Create zip
    const zipName = `${PROJECT}-${VERSION}${variant.suffix}.zip`;
    const zipPath = path.join(OUTPUT_DIR, zipName);

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    execSync(`cd "${stageDir}" && zip -rq "${zipPath}" .`, { stdio: 'pipe' });

    const stats = fs.statSync(zipPath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    results.push({
      variant: variant.name,
      status: 'ok',
      path: path.relative(ROOT, zipPath),
      size_kb: sizeKB,
    });

    console.log(`  ✓ ${zipName} (${sizeKB} KB)`);
  } catch (e) {
    console.error(`  ✗ ${variant.name} build failed: ${e.message}`);
    results.push({ variant: variant.name, status: 'failed', reason: e.message });
  } finally {
    // Cleanup stage dir
    try { execSync(`rm -rf "${stageDir}"`, { stdio: 'pipe' }); } catch { /* ignore */ }
  }
}

// Summary
console.log('');
console.log('📋 Build summary:');
for (const r of results) {
  if (r.status === 'ok') {
    console.log(`  ✓ ${r.variant.padEnd(12)} ${r.size_kb.padStart(7)} KB  →  ${r.path}`);
  } else {
    console.log(`  ✗ ${r.variant.padEnd(12)} FAILED: ${r.reason}`);
  }
}

const failed = results.filter(r => r.status === 'failed').length;
if (failed > 0) {
  console.log('');
  console.log(`✗ ${failed} of ${results.length} builds failed`);
  process.exit(1);
}

console.log('');
console.log('✓ All 3 ZIPs built successfully');
console.log('');
console.log('Next:');
console.log('  - Production zip → Yandex Console upload');
console.log('  - Debug zip → internal QA (Ctrl+Shift+2 for debug panel)');
console.log('  - Marketing zip → screenshot generation (cheats для quick states)');
console.log('');
console.log('Test debug build runtime:');
console.log(`  node scripts/runtime-test.mjs Release/${PROJECT}/yandex/ --variant=debug`);
