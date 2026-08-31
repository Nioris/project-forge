#!/usr/bin/env node
/**
 * @file build-all-platforms.mjs
 * @description Storefront release coordinator.
 *
 * The project-owned `forge.targets.json` is the only source of selected
 * storefronts. This command deliberately coordinates/verifies; it never
 * pretends that one Windows ZIP is a build for every storefront and it never
 * submits anything to a store.
 *
 * Compatibility: the former WorkProgress/<Project>-ok|max|web copies are
 * still discoverable and can have their historical pre-submit gates run with
 * `--legacy-gates`. They are legacy adapters, not release storefront targets.
 *
 * Usage:
 *   node scripts/build-all-platforms.mjs <project-root> [--level local|submit] [--json]
 *   node scripts/build-all-platforms.mjs --list
 *   node scripts/build-all-platforms.mjs <legacy-project-name> --legacy-gates
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listPlatformProfiles, readPlatformTargets, PlatformProfileError } from './platform-profile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LEGACY_ADAPTERS = ['ok', 'max', 'web'];
const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/u;

class CoordinatorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CoordinatorError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) { throw new CoordinatorError(code, message, details); }
function posix(value) { return value.replaceAll('\\', '/'); }
function compareVersions(left, right) {
  const a = VERSION.exec(left); const b = VERSION.exec(right);
  if (!a || !b) return 0;
  for (let index = 1; index <= 3; index += 1) {
    const av = BigInt(a[index]); const bv = BigInt(b[index]);
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function readJson(file, code, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `Cannot read ${label}: ${error.message}`, { file }); }
}

function regularFile(file, code, label) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(code, `${label} must be a regular file`, { file });
  return file;
}

function manifestAt(directory, fileName, kind, slug, version) {
  const file = path.join(directory, fileName);
  regularFile(file, 'BUILD_ALL_BASE_MANIFEST', `Base manifest ${fileName}`);
  const value = readJson(file, 'BUILD_ALL_BASE_MANIFEST', `base manifest ${fileName}`);
  if (value?.schemaVersion !== 1 || value?.kind !== kind || value?.slug !== slug || value?.version !== version) {
    fail('BUILD_ALL_BASE_MANIFEST', `Base manifest ${posix(fileName)} does not match ${slug} ${version}`, { file: posix(file) });
  }
  return value;
}

function artifactAt(directory, name, code, label) {
  if (typeof name !== 'string' || !name || path.basename(name) !== name) {
    fail(code, `${label} has an unsafe artifact name`, { name });
  }
  return regularFile(path.join(directory, name), code, label);
}

function requiredInputs(selection) {
  const wanted = { web: false, windows: false, androidApk: false, androidAab: false };
  for (const profile of selection.profiles) {
    if (profile.artifactFamily === 'web') wanted.web = true;
    if (profile.artifactFamily === 'windows') wanted.windows = true;
    if (profile.artifactFamily === 'android') {
      if (profile.artifactFormat === 'signed-aab') wanted.androidAab = true;
      else wanted.androidApk = true; // flexible stores deliberately get an installable APK when present.
    }
  }
  return wanted;
}

function inspectBaseVersion(projectRoot, slug, version, wanted) {
  const base = path.join(projectRoot, 'Release', slug, 'godot');
  const inputs = {};
  let sourceSnapshot = null;
  function coherence(manifest, family) {
    if (typeof manifest.sourceSnapshotSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(manifest.sourceSnapshotSha256)) {
      fail('BUILD_ALL_BASE_MANIFEST', `${family} base manifest has no valid source snapshot`, { slug, version });
    }
    if (sourceSnapshot && sourceSnapshot !== manifest.sourceSnapshotSha256) {
      fail('BUILD_ALL_BASE_INCOHERENT', `Base artifacts for ${slug} ${version} were built from different source snapshots`, { slug, version });
    }
    sourceSnapshot = manifest.sourceSnapshotSha256;
  }
  if (wanted.web) {
    const web = path.join(base, 'web', version);
    if (!fs.statSync(web, { throwIfNoEntry: false })?.isDirectory()) return null;
    const manifestName = `${slug}-${version}.web-manifest.json`;
    const manifest = manifestAt(web, manifestName, 'forge.godot-web-android-local-manifest', slug, version);
    coherence(manifest, 'Web');
    inputs.web = artifactAt(web, manifest.web?.artifact, 'BUILD_ALL_BASE_ARTIFACT', 'Web base artifact');
  }
  if (wanted.androidApk || wanted.androidAab) {
    const android = path.join(base, 'android', version);
    if (!fs.statSync(android, { throwIfNoEntry: false })?.isDirectory()) return null;
    const androidManifest = manifestAt(android, `${slug}-${version}.android-manifest.json`, 'forge.godot-web-android-local-manifest', slug, version);
    coherence(androidManifest, 'Android');
    const artifacts = new Map((androidManifest.android?.artifacts || []).map(item => [item?.format, item?.file]));
    if (wanted.androidApk) inputs.androidApk = artifactAt(android, artifacts.get('apk'), 'BUILD_ALL_BASE_ARTIFACT', 'Android APK base artifact');
    if (wanted.androidAab) inputs.androidAab = artifactAt(android, artifacts.get('aab'), 'BUILD_ALL_BASE_ARTIFACT', 'Android AAB base artifact');
  }
  if (wanted.windows) {
    const windows = path.join(base, 'windows', version);
    if (!fs.statSync(windows, { throwIfNoEntry: false })?.isDirectory()) return null;
    const manifest = manifestAt(windows, `${slug}-${version}.release-manifest.json`, 'forge.godot-windows-release-manifest', slug, version);
    coherence(manifest, 'Windows');
    inputs.windows = artifactAt(windows, manifest.artifacts?.production?.file, 'BUILD_ALL_BASE_ARTIFACT', 'Windows production base artifact');
  }
  return { slug, version, inputs, sourceSnapshotSha256: sourceSnapshot };
}

function discoverCoherentBase(projectRoot, selection) {
  const release = path.join(projectRoot, 'Release');
  if (!fs.statSync(release, { throwIfNoEntry: false })?.isDirectory()) {
    fail('BUILD_ALL_BASE_MISSING', 'Release/ is missing; build immutable base artifacts before packaging storefront candidates');
  }
  const wanted = requiredInputs(selection);
  const eligible = [];
  const diagnostics = [];
  for (const entry of fs.readdirSync(release, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
    const godot = path.join(release, entry.name, 'godot');
    if (!fs.statSync(godot, { throwIfNoEntry: false })?.isDirectory()) continue;
    const versions = new Set();
    for (const family of ['web', 'android', 'windows']) {
      const familyRoot = path.join(godot, family);
      if (!fs.statSync(familyRoot, { throwIfNoEntry: false })?.isDirectory()) continue;
      for (const versionEntry of fs.readdirSync(familyRoot, { withFileTypes: true })) {
        if (versionEntry.isDirectory() && VERSION.test(versionEntry.name)) versions.add(versionEntry.name);
      }
    }
    const matches = [];
    for (const version of versions) {
      try {
        const inspected = inspectBaseVersion(projectRoot, entry.name, version, wanted);
        if (inspected) matches.push(inspected);
      } catch (error) {
        diagnostics.push({ slug: entry.name, version, code: error.code || 'BUILD_ALL_BASE_INVALID', message: error.message });
      }
    }
    matches.sort((a, b) => compareVersions(b.version, a.version));
    if (matches.length) eligible.push(matches[0]);
  }
  if (!eligible.length) {
    fail('BUILD_ALL_BASE_MISSING', 'No coherent immutable Godot base artifact set satisfies the selected storefront families', { wanted, diagnostics });
  }
  if (eligible.length > 1) {
    fail('BUILD_ALL_BASE_AMBIGUOUS', 'More than one release slug has a coherent base artifact set; select one explicitly by removing ambiguity', {
      candidates: eligible.map(item => ({ slug: item.slug, version: item.version })),
    });
  }
  return eligible[0];
}

function usage(exitCode = 0) {
  const output = [
    'Usage:',
    '  node scripts/build-all-platforms.mjs <project-root> [--level local|submit] [--json]',
    '  node scripts/build-all-platforms.mjs --list',
    '  node scripts/build-all-platforms.mjs <legacy-project-name> --legacy-gates',
  ].join('\n');
  (exitCode ? console.error : console.log)(output);
  process.exitCode = exitCode;
}

function parseArgs(argv) {
  const result = { json: false, list: false, legacyGates: false, level: 'local', positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') result.json = true;
    else if (arg === '--list') result.list = true;
    else if (arg === '--legacy-gates' || arg === '--gate-only') result.legacyGates = true;
    else if (arg === '--level') { result.level = argv[index + 1] || ''; index += 1; }
    else if (arg.startsWith('--level=')) result.level = arg.slice('--level='.length);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else result.positional.push(arg);
  }
  if (!['local', 'submit'].includes(result.level)) throw new Error('--level must be local or submit');
  if (result.positional.length > 1) throw new Error('Specify one project root or legacy project name');
  return result;
}

function workProgressRoot() { return path.join(ROOT, 'WorkProgress'); }

function listLegacyProjects() {
  const wp = workProgressRoot();
  if (!fs.existsSync(wp)) return [];
  const names = fs.readdirSync(wp, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
    .map(entry => entry.name);
  const projects = new Map();
  for (const name of names) {
    for (const platform of LEGACY_ADAPTERS) {
      const suffix = `-${platform}`;
      if (name.endsWith(suffix)) {
        const base = name.slice(0, -suffix.length);
        projects.set(base, [...(projects.get(base) || []), platform]);
      }
    }
  }
  return [...projects.entries()].map(([name, platforms]) => ({ name, platforms })).sort((a, b) => a.name.localeCompare(b.name));
}

function printList(json) {
  const profiles = listPlatformProfiles().profiles;
  const legacyProjects = listLegacyProjects();
  const result = {
    storefrontTargets: profiles.map(({ id, displayName, tier, artifactFamily, adapterStatus }) => ({ id, displayName, tier, artifactFamily, adapterStatus })),
    legacyAdapters: LEGACY_ADAPTERS,
    legacyProjects,
  };
  if (json) return console.log(JSON.stringify(result, null, 2));
  console.log('Storefront targets (selected only through forge.targets.json):');
  for (const item of result.storefrontTargets) {
    console.log(`  ${item.id.padEnd(12)} ${item.artifactFamily.padEnd(8)} ${item.adapterStatus.padEnd(11)} ${item.displayName}`);
  }
  console.log('\nLegacy compatibility adapters (not storefront targets): ' + LEGACY_ADAPTERS.join(', '));
  if (!legacyProjects.length) console.log('  (no legacy platform copies in WorkProgress/)');
  for (const project of legacyProjects) console.log(`  ${project.name}: ${project.platforms.join(', ')}`);
}

function findLegacyCopies(projectName) {
  const wp = workProgressRoot();
  if (!fs.existsSync(wp)) return [];
  return LEGACY_ADAPTERS
    .map(platform => ({ platform, workDir: path.join(wp, `${projectName}-${platform}`) }))
    .filter(item => fs.statSync(item.workDir, { throwIfNoEntry: false })?.isDirectory());
}

function runLegacyGates(projectName) {
  const copies = findLegacyCopies(projectName);
  if (!copies.length) throw new Error(`No legacy copies found for ${projectName}. Expected WorkProgress/${projectName}-ok|max|web.`);
  const results = copies.map(({ platform, workDir }) => {
    const script = path.join(ROOT, 'platforms', platform, 'scripts', 'pre-submit.mjs');
    if (!fs.existsSync(script)) return { platform, workDir, status: 'skipped', reason: 'no historical pre-submit gate' };
    const run = spawnSync(process.execPath, [script, workDir], { cwd: ROOT, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    return {
      platform,
      workDir,
      status: run.status === 0 ? 'passed' : 'failed',
      exitCode: run.status ?? 1,
      output: `${run.stdout || ''}${run.stderr || ''}`.trim(),
    };
  });
  return { mode: 'legacy-gates', project: projectName, results };
}

function runTargetVerifier(projectRoot, level) {
  const verifier = path.join(ROOT, 'scripts', 'platform-release-verify.mjs');
  const run = spawnSync(process.execPath, [verifier, projectRoot, '--level', level, '--json'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  let verification = null;
  try { verification = JSON.parse(run.stdout); } catch {}
  return {
    mode: 'storefront-targets', projectRoot, level, packaged: false,
    exitCode: run.status ?? 1,
    ok: run.status === 0 && verification?.ok === true,
    verification,
    stderr: (run.stderr || '').trim(),
  };
}

function packageMatrix(projectRoot, base) {
  const packager = path.join(ROOT, 'scripts', 'package-platform-release-matrix.mjs');
  const args = [packager, projectRoot, '--slug', base.slug, '--version', base.version, '--json'];
  if (base.inputs.web) args.push('--web', base.inputs.web);
  if (base.inputs.androidApk) args.push('--android-apk', base.inputs.androidApk);
  if (base.inputs.androidAab) args.push('--android-aab', base.inputs.androidAab);
  if (base.inputs.windows) args.push('--windows', base.inputs.windows);
  const run = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  let packaging = null;
  try { packaging = JSON.parse(run.stdout); } catch {}
  if (run.status !== 0 || packaging?.ok !== true) {
    const message = packaging?.message || (run.stderr || run.stdout || 'canonical storefront packager failed').trim();
    fail(packaging?.code || 'BUILD_ALL_PACKAGE_FAILED', message, { base: { slug: base.slug, version: base.version }, stderr: (run.stderr || '').trim() });
  }
  return packaging;
}

function coordinateStorefrontTargets(projectRoot, level) {
  if (level === 'submit') return runTargetVerifier(projectRoot, level); // Submission never creates files.
  const selection = readPlatformTargets(projectRoot); // This is the sole source of targets.
  if (!selection.configured) return runTargetVerifier(projectRoot, level);
  const base = discoverCoherentBase(projectRoot, selection);
  const matrix = path.join(projectRoot, 'Release', base.slug, 'storefront', base.version);
  let packaged = false;
  let packaging = null;
  // An existing immutable matrix is never rebuilt, even if verification later blocks it as stale.
  if (!fs.existsSync(matrix)) {
    packaging = packageMatrix(projectRoot, base);
    packaged = true;
  }
  const result = runTargetVerifier(projectRoot, level);
  result.packaged = packaged;
  result.base = { slug: base.slug, version: base.version, sourceSnapshotSha256: base.sourceSnapshotSha256 };
  if (packaging) result.packaging = packaging;
  return result;
}

function printResult(result, json) {
  if (json) return console.log(JSON.stringify(result, null, 2));
  if (result.mode === 'legacy-gates') {
    console.log('Legacy compatibility gates (not storefront release verification):');
    for (const row of result.results) console.log(`  [${row.status.toUpperCase()}] ${row.platform}${row.reason ? ` — ${row.reason}` : ''}`);
    return;
  }
  const selected = result.verification?.targets || [];
  console.log(`Storefront release verification: ${result.ok ? 'PASS' : 'BLOCKED'} (${result.level})${result.packaged ? ' — matrix packaged' : ''}`);
  console.log(`Project: ${result.projectRoot}`);
  console.log(`Selected targets: ${selected.length ? selected.map(item => item.target).join(', ') : '(none)'}`);
  for (const failure of result.verification?.failures || []) console.log(`  [BLOCKED] ${failure.code}: ${failure.message}`);
  if (result.stderr) console.log(result.stderr);
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); return usage(2); }
  if (args.list || args.positional.length === 0) return printList(args.json);
  const supplied = args.positional[0];
  try {
    if (args.legacyGates) {
      const result = runLegacyGates(supplied);
      printResult(result, args.json);
      if (result.results.some(row => row.status === 'failed')) process.exitCode = 1;
      return;
    }
    const projectRoot = path.resolve(supplied);
    if (!fs.statSync(projectRoot, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Project root does not exist: ${projectRoot}. For old OK/MAX/Web copies, add --legacy-gates.`);
    }
    const result = coordinateStorefrontTargets(projectRoot, args.level);
    printResult(result, args.json);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof PlatformProfileError || error instanceof CoordinatorError ? error.code : 'BUILD_ALL_USAGE';
    const result = { ok: false, code, message: error.message, ...(error.details ? { details: error.details } : {}) };
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.error(`[${code}] ${error.message}`);
    process.exitCode = 2;
  }
}

main();
