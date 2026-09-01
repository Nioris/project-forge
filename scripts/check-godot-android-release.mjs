#!/usr/bin/env node
/** Regression coverage for the isolated production Android lane. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER = path.join(ROOT, 'scripts', 'build-godot-android-release.mjs');
const BUILDER_SOURCE = fs.readFileSync(BUILDER, 'utf8');
const SECURITY = path.join(ROOT, 'scripts', 'forge-security.mjs');
const SHIM = path.join(ROOT, 'scripts', 'fixtures', 'godot-web-android', 'fake-godot-exporter.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-android-release-'));
const data = path.join(temp, 'forge-data'); const passed = []; const failed = [];
function ok(value, message, detail = '') { if (value) passed.push(message); else failed.push(`${message}${detail ? `: ${detail}` : ''}`); }
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
function environment(extra = {}) { return { ...process.env, FORGE_DATA_DIR: data, FORGE_SECURITY_TEST_BACKEND: 'plaintext-test', FORGE_ALLOW_TEST_HARNESS: '1', FORGE_GODOT_ANDROID_RELEASE_TEST_SHIM: SHIM, ...extra }; }
function project(name) {
  const root = path.join(temp, name); fs.mkdirSync(root, { recursive: true });
  write(path.join(root, 'forge.engine.json'), '{"schemaVersion":1,"kind":"forge.engine-profile","engine":"godot"}\n');
  write(path.join(root, 'forge.godot.json'), '{"schemaVersion":1,"kind":"forge.godot-project","projectPath":".","scripting":"gdscript"}\n');
  write(path.join(root, 'project.godot'), '[application]\nconfig/name="Fixture"\nconfig/icon="res://icon.svg"\n'); write(path.join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>\n');
  write(path.join(root, 'export_presets.cfg'), '[preset.0]\nname="Android"\nplatform="Android"\ngradle_build/use_gradle_build=true\ngradle_build/export_format=0\ngradle_build/min_sdk="24"\ngradle_build/target_sdk="36"\nversion/code=1\nversion/name="1.0.0"\n');
  return root;
}
function command(args, env = environment()) { return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 90_000, windowsHide: true, env }); }
function configurePublisher() { return command([SECURITY, 'profile', 'set-publisher', 'com.forge']).status === 0; }
function run(root, extra = {}) { const output = command([BUILDER, 'fixture-game', 'v1.0.0', '--root', root, '--json'], environment(extra)); let result; try { result = JSON.parse(output.stdout); } catch {} return { output, result }; }

try {
  const missing = project('missing-publisher-profile'); const missingRun = run(missing);
  ok(missingRun.result?.status === 'failed' && missingRun.result?.issues?.some(item => item.code === 'FORGE_SECURITY_PUBLISHER_PROFILE_REQUIRED'), 'fails closed until the owner configures a publisher namespace');
  ok(configurePublisher(), 'configures the one-time publisher namespace outside all projects');

  const clean = project('clean');
  const first = run(clean); const manifest = first.result?.manifest && fs.existsSync(first.result.manifest) ? JSON.parse(fs.readFileSync(first.result.manifest, 'utf8')) : null;
  ok(/mkdtempSync\(path\.join\(outputParent, `\.forge-stage-/u.test(BUILDER_SOURCE) && !/renameSync\(stageOutput, output\)/u.test(BUILDER_SOURCE), 'final publish staging is created on the project volume to prevent cross-device EXDEV');
  ok(first.output.status === 1 && first.result?.status === 'test_harness' && first.result.artifacts?.length === 2, 'exports immutable release APK and AAB through the isolated test harness', JSON.stringify(first.result?.issues || []));
  ok(manifest?.android?.exportMode === 'release' && /^[a-f0-9]{64}$/u.test(manifest?.android?.signing?.certificateSha256 || '') && !/storePassword|keyPassword|keystorePath/iu.test(JSON.stringify(manifest || {})), 'production manifest binds package/certificate without vault secrets or private paths');
  const replay = run(clean); ok(replay.result?.issues?.some(item => item.code === 'GODOT_ANDROID_RELEASE_IMMUTABLE'), 'refuses to overwrite an immutable production version');

  const leaked = project('leaked-preset'); fs.appendFileSync(path.join(leaked, 'export_presets.cfg'), 'keystore/release_password="sentinel-password"\n'); const leak = run(leaked);
  ok(leak.result?.issues?.some(item => item.code === 'GODOT_ANDROID_RELEASE_SECRETS') && !JSON.stringify(leak.result).includes('sentinel-password'), 'rejects preset passwords and redacts the sentinel from result JSON');

  const invalid = project('invalid-contract'); fs.writeFileSync(path.join(invalid, 'export_presets.cfg'), fs.readFileSync(path.join(invalid, 'export_presets.cfg'), 'utf8').replace('version/name="1.0.0"', 'version/name="wrong"')); const invalidRun = run(invalid);
  ok(invalidRun.result?.issues?.some(item => item.code === 'GODOT_ANDROID_RELEASE_METADATA'), 'rejects inconsistent Android version metadata before exporting');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(`Godot Android production regressions: ${passed.length} passed, ${failed.length} failed`);
for (const item of failed) console.error(`[FAIL] ${item}`);
process.exitCode = failed.length ? 1 : 0;
