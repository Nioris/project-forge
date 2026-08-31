#!/usr/bin/env node
/** Offline regressions for local storefront build coordination. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computePlatformSourceSnapshot } from './platform-release-verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-build-all-'));
const passed = []; const failed = [];
function expect(condition, label, detail = '') { (condition ? passed : failed).push(`${label}${detail ? `: ${detail}` : ''}`); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function zip(file, entries) {
  const source = fs.mkdtempSync(path.join(temp, 'zip-'));
  const archive = `${file}.tmp.zip`;
  try {
    for (const [name, value] of Object.entries(entries)) {
      const destination = path.join(source, ...name.split('/')); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, value);
    }
    execFileSync('tar.exe', ['-a', '-c', '-f', archive, '-C', source, '.']); fs.copyFileSync(archive, file);
  } finally { fs.rmSync(source, { recursive: true, force: true }); fs.rmSync(archive, { force: true }); }
}
function fixture(name, slug, version, targets = ['yandex', 'steam']) {
  const root = path.join(temp, name); fs.mkdirSync(root, { recursive: true });
  writeJson(path.join(root, 'forge.targets.json'), { schemaVersion: 1, kind: 'forge.target-selection', targets });
  writeJson(path.join(root, 'forge.engine.json'), { schemaVersion: 1, kind: 'forge.engine-profile', engine: 'godot' });
  writeJson(path.join(root, 'forge.godot.json'), { schemaVersion: 1, kind: 'forge.godot-project', projectPath: '.', scripting: 'gdscript' });
  fs.writeFileSync(path.join(root, 'project.godot'), '[application]\nconfig/name="Fixture"\n');
  fs.writeFileSync(path.join(root, 'main.gd'), 'extends Node\n');
  const hash = computePlatformSourceSnapshot(root, 'godot'); const release = path.join(root, 'Release', slug, 'godot');
  const web = path.join(release, 'web', version); const windows = path.join(release, 'windows', version);
  fs.mkdirSync(web, { recursive: true }); fs.mkdirSync(windows, { recursive: true });
  const webArtifact = `${slug}-${version}-web.zip`; const windowsArtifact = `${slug}-${version}.zip`;
  zip(path.join(web, webArtifact), { 'index.html': '<html><head></head><body>fixture</body></html>' });
  zip(path.join(windows, windowsArtifact), { 'Fixture.exe': 'fixture', 'Fixture.pck': 'fixture' });
  writeJson(path.join(web, `${slug}-${version}.web-manifest.json`), {
    schemaVersion: 1, kind: 'forge.godot-web-android-local-manifest', slug, version, sourceSnapshotSha256: hash,
    engine: { name: 'godot', testHarness: false }, web: { artifact: webArtifact, sha256: sha256(path.join(web, webArtifact)) }, android: { artifacts: [] },
  });
  writeJson(path.join(windows, `${slug}-${version}.release-manifest.json`), {
    schemaVersion: 1, kind: 'forge.godot-windows-release-manifest', slug, version, sourceSnapshotSha256: hash,
    engine: { name: 'godot', testHarness: false }, artifacts: { production: { file: windowsArtifact, zipSha256: sha256(path.join(windows, windowsArtifact)) } },
  });
  return root;
}
function run(root, level = 'local') {
  const command = spawnSync(process.execPath, ['scripts/build-all-platforms.mjs', root, '--level', level, '--json'], { cwd: ROOT, encoding: 'utf8' });
  let value = null; try { value = JSON.parse(command.stdout); } catch {}
  return { ...command, value };
}

try {
  const root = fixture('fresh', 'fixture-game', 'v1.2.3');
  const first = run(root);
  expect(first.status === 0 && first.value?.ok === true && first.value?.packaged === true,
    'local coordinator packages a missing matrix from coherent explicit base artifacts', first.stderr || first.stdout);
  expect(fs.existsSync(path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'yandex', 'platform-release-receipt.json')),
    'local coordinator creates receipts through the canonical packager');
  const second = run(root);
  expect(second.status === 0 && second.value?.ok === true && second.value?.packaged === false,
    'existing latest immutable matrix is verified without repackaging', second.stderr || second.stdout);
  fs.appendFileSync(path.join(root, 'project.godot'), '; source changed after immutable matrix\n');
  const stale = run(root);
  expect(stale.status === 1 && stale.value?.packaged === false && stale.value?.verification?.failures?.some(item => item.code === 'PLATFORM_RELEASE_SOURCE_STALE'),
    'stale latest matrix blocks without silently rebuilding the same version', stale.stderr || stale.stdout);

  const submitRoot = fixture('submit', 'submit-game', 'v2.0.0');
  const submit = run(submitRoot, 'submit');
  expect(submit.status === 1 && submit.value?.packaged === false && !fs.existsSync(path.join(submitRoot, 'Release', 'submit-game', 'storefront')),
    'submit verification never creates a local matrix', submit.stderr || submit.stdout);

  const ambiguous = fixture('ambiguous', 'one-game', 'v1.0.0');
  fixture('ambiguous', 'two-game', 'v1.0.0');
  const blocked = run(ambiguous);
  expect(blocked.status === 2 && blocked.value?.code === 'BUILD_ALL_BASE_AMBIGUOUS',
    'multiple coherent slugs are blocked instead of guessed', blocked.stderr || blocked.stdout);
} finally {
  for (const line of passed) console.log(`[OK] ${line}`);
  for (const line of failed) console.error(`[FAIL] ${line}`);
  fs.rmSync(temp, { recursive: true, force: true });
}
if (failed.length) { console.error(`Build-all coordinator regressions: ${failed.length} failed, ${passed.length} passed`); process.exit(1); }
console.log(`Build-all coordinator regressions: ${passed.length} passed`);
