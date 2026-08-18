#!/usr/bin/env node
/**
 * @file build-yandex-3zips.mjs
 * @description Builds 3 ZIP variants для Yandex Games submission per Forge standard:
 *
 *   1. {project}-v{N}.zip                  — PRODUCTION (clean, для submission)
 *   2. {project}-v{N}-debug.zip            — DEBUG (с debugcheck.js + cheats-base.js)
 *   3. {project}-v{N}-marketing.zip        — MARKETING (с debugcheck.js + cheats-base.js + screenshots.js)
 *
 * Source folder: WorkProgress/{Project}-yandex/ (must exist)
 * Output folder: Release/{Project}/yandex/
 *
 * Variants determined by which support files copied:
 *   - debugcheck.js  → debug + marketing
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
 *   node scripts/build-yandex-3zips.mjs <project-name> [requested-version]
 *   node scripts/build-yandex-3zips.mjs parkour
 *   node scripts/build-yandex-3zips.mjs parkour v1.2.0 --root F:\\Games\\parkour
 *
 * Every successful invocation creates a NEW release version. When the requested
 * version is absent, equal to, or older than the latest existing build, Forge
 * automatically increments the latest version instead of overwriting ZIPs.
 *
 * Exit:
 *   0 = all 3 zips built + validated
 *   1 = build errors
 *   2 = invocation error
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
const rootIndex = args.indexOf('--root');
const explicitRoot = rootIndex >= 0 ? args[rootIndex + 1] : null;
if (rootIndex >= 0 && (!explicitRoot || explicitRoot.startsWith('--'))) {
  console.error('[X] --root requires a project-root path');
  process.exit(2);
}
const positional = args.filter((value, index) => value!=='--self-test' && index !== rootIndex && index !== rootIndex + 1);
const ENGINE_ROOT = path.resolve(__dirname, '..');
const ROOT = explicitRoot ? path.resolve(explicitRoot) : ENGINE_ROOT;
const PROJECT = positional[0];
const REQUESTED_VERSION = positional[1] || null;

function parseVersionLabel(value) {
  const match=String(value||'').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/i);
  if(!match) return null;
  const parts=[Number(match[1])];
  if(match[2]!==undefined) parts.push(Number(match[2]));
  if(match[3]!==undefined) parts.push(Number(match[3]));
  return {label:`v${parts.join('.')}`,parts};
}

function compareVersions(a,b) {
  for(let i=0;i<3;i++){
    const delta=(a.parts[i]||0)-(b.parts[i]||0);
    if(delta) return delta;
  }
  return a.parts.length-b.parts.length;
}

function incrementVersion(version) {
  const parts=[...version.parts];
  parts[parts.length-1]=(parts[parts.length-1]||0)+1;
  return {label:`v${parts.join('.')}`,parts};
}

function chooseReleaseVersion(existing,requestedLabel=null){
  const ordered=existing.map(parseVersionLabel).filter(Boolean).sort(compareVersions);
  const latest=ordered.at(-1)||null;
  const requested=parseVersionLabel(requestedLabel);
  if(requestedLabel && !requested) throw new Error(`Invalid requested version: ${requestedLabel}. Use vN, vN.N, or vN.N.N.`);
  let selected=requested || (latest?incrementVersion(latest):parseVersionLabel('v1.0.0'));
  let autoBumped=false;
  if(latest && (!requested || compareVersions(selected,latest)<=0)){
    selected=incrementVersion(latest);
    autoBumped=true;
  }
  return {selected,latest,autoBumped};
}

if(SELF_TEST){
  const checks=[
    ['first build starts at v1.0.0',chooseReleaseVersion([],null).selected.label==='v1.0.0'],
    ['automatic rebuild increments patch',chooseReleaseVersion(['v1.0.0'],null).selected.label==='v1.0.1'],
    ['same requested version auto-bumps',chooseReleaseVersion(['v1.0.0'],'v1.0.0').selected.label==='v1.0.1'],
    ['older requested version auto-bumps latest',chooseReleaseVersion(['v1.2.8'],'v1.1.0').selected.label==='v1.2.9'],
    ['newer requested version is respected',chooseReleaseVersion(['v1.2.8'],'v2.0.0').selected.label==='v2.0.0'],
    ['single-component convention increments',chooseReleaseVersion(['v7'],'v7').selected.label==='v8'],
  ];
  for(const [name,ok] of checks) console.log(`${ok?'[OK]':'[FAIL]'} ${name}`);
  process.exit(checks.every(([,ok])=>ok)?0:1);
}

if (!PROJECT) {
  console.error('Usage: node scripts/build-yandex-3zips.mjs <project-name> [version]');
  console.error('Example: node scripts/build-yandex-3zips.mjs parkour v1.0.0');
  process.exit(2);
}

const OUTPUT_DIR = path.join(ROOT, 'Release', PROJECT, 'yandex');
const SOURCE_CANDIDATES = [
  path.join(ROOT, 'WorkProgress', `${PROJECT}-yandex`),
  path.join(ROOT, 'WorkProgress', PROJECT),
];
const SOURCE_DIR = SOURCE_CANDIDATES.find(dir => fs.existsSync(path.join(dir, 'index.html'))) || SOURCE_CANDIDATES[0];

function existingProductionVersions() {
  if(!fs.existsSync(OUTPUT_DIR)) return [];
  const prefix=`${PROJECT}-`;
  return fs.readdirSync(OUTPUT_DIR).map(name=>{
    if(!name.startsWith(prefix) || /-(?:debug|marketing)\.zip$/i.test(name)) return null;
    const match=name.slice(prefix.length).match(/^(v\d+(?:\.\d+){0,2})\.zip$/i);
    return match?parseVersionLabel(match[1]):null;
  }).filter(Boolean).sort(compareVersions);
}

const existingVersions=existingProductionVersions();
let versionChoice;
try{versionChoice=chooseReleaseVersion(existingVersions.map(x=>x.label),REQUESTED_VERSION);}catch(error){console.error(`[X] ${error.message}`);process.exit(2);}
const latestVersion=versionChoice.latest;
const selectedVersion=versionChoice.selected;
const autoBumped=versionChoice.autoBumped;
const VERSION=selectedVersion.label;

// Support files (debugcheck.js, cheats-base.js, screenshots.js) live в
// platforms/yandex/templates/ — NOT tools/ (tools/ has only game-screenshot-ext/).
// v4.10.37 fix: was pointing к tools/, causing "debugcheck.js not found".
const SUPPORT_DIRS = [
  path.join(ROOT, 'platforms', 'yandex', 'templates'),
  path.join(ROOT, 'templates', 'html5'),
  path.join(ENGINE_ROOT, 'platforms', 'yandex', 'templates'),
  path.join(ENGINE_ROOT, 'templates', 'html5'),
];

// Verify source
if (!fs.existsSync(path.join(SOURCE_DIR, 'index.html'))) {
  console.error(`[X] Source missing: ${SOURCE_DIR}/index.html`);
  console.error(`    Checked: ${SOURCE_CANDIDATES.join(', ')}`);
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
const BUILD_STARTED_AT=new Date().toISOString();
console.log(`[Forge] Release version: ${VERSION}${latestVersion?` (previous: ${latestVersion.label})`:''}${autoBumped?` — requested ${REQUESTED_VERSION||'auto'} was not newer, auto-bumped`:''}`);

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
    include: [debugcheck, cheatsBase, screenshots].filter(Boolean),
    forbid: [],
  },
];

function createZip(stageDir, zipPath) {
  const windows = process.platform === 'win32';
  const command = windows ? 'tar.exe' : 'zip';
  const args = windows ? ['-a', '-cf', zipPath, '.'] : ['-rq', zipPath, '.'];
  const result = spawnSync(command, args, { cwd: stageDir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

const results = [];

for (const variant of VARIANTS) {
  console.log(`📦 Building ${variant.name} variant...`);

  // Create staging dir
  const stageDir = path.join(os.tmpdir(), `forge-build-${PROJECT}-${variant.name}-${Date.now()}`);
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    // Copy source (excluding any stray support files first)
    fs.cpSync(SOURCE_DIR, stageDir, { recursive: true });

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

    if (fs.existsSync(zipPath)) throw new Error(`Refusing to overwrite existing release artifact: ${zipPath}`);

    createZip(stageDir, zipPath);

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
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch { /* ignore */ }
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

const historyPath=path.join(OUTPUT_DIR,'build-history.json');
let history=[];
try{const parsed=JSON.parse(fs.readFileSync(historyPath,'utf8'));history=Array.isArray(parsed)?parsed:[];}catch{}
const completedAt=new Date().toISOString();
history.push({
  version:VERSION,
  requestedVersion:REQUESTED_VERSION,
  autoBumped,
  previousVersion:latestVersion?.label||null,
  startedAt:BUILD_STARTED_AT,
  completedAt,
  source:path.relative(ROOT,SOURCE_DIR).replace(/\\/g,'/'),
  artifacts:results.filter(r=>r.status==='ok').map(r=>({variant:r.variant,path:r.path.replace(/\\/g,'/'),sizeKB:Number(r.size_kb)})),
});
fs.writeFileSync(historyPath,JSON.stringify(history.slice(-100),null,2)+'\n','utf8');

console.log('');
console.log('✓ All 3 ZIPs built successfully');
console.log(`BUILD_VERSION: ${VERSION}`);
console.log(`BUILD_HISTORY: ${path.relative(ROOT,historyPath).replace(/\\/g,'/')}`);
console.log('');
console.log('Next:');
console.log('  - Production zip → Yandex Console upload');
console.log('  - Debug zip → internal QA (Ctrl+Shift+2 for debug panel)');
console.log('  - Marketing zip → screenshot generation (cheats для quick states)');
console.log('');
console.log('Test debug build runtime:');
console.log(`  node scripts/runtime-test.mjs Release/${PROJECT}/yandex/ --variant=debug`);
