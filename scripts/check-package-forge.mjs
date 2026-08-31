#!/usr/bin/env node
/** Regression: informational/invalid package CLI calls must never create a release artifact. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-package-cli-'));
const helpArtifact = path.join(temp, 'help-must-not-build.zip');
const invalidArtifact = path.join(temp, 'invalid-must-not-build.zip');
const packageArtifact = path.join(temp, 'package-like-forge.zip');
const extracted = path.join(temp, 'package-like-forge');
const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) failures.push(message);
};
function seedInstalledGodotHarness(project) {
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'forge.engine.json'), '{"schemaVersion":1,"kind":"forge.engine-profile","engine":"godot"}\n', 'utf8');
  fs.writeFileSync(path.join(project, 'forge.godot.json'), '{"schemaVersion":1,"kind":"forge.godot-project","projectPath":".","scripting":"gdscript","entryScene":"res://main.tscn","smoke":{"successMarker":"DONE","quitAfterFrames":2},"sceneContract":{"minimumNodeCount":1,"requiredNodes":["Main"],"requiredNodeTypes":{"Main":"Node"},"requiredScripts":[],"requiredScriptAttachments":{}}}\n', 'utf8');
  fs.writeFileSync(path.join(project, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#59bdd8"/></svg>\n', 'utf8');
  fs.writeFileSync(path.join(project, 'project.godot'), '[application]\nconfig/name="Installed fixture"\nconfig/icon="res://icon.svg"\n', 'utf8');
  fs.writeFileSync(path.join(project, 'export_presets.cfg'), '[preset.0]\nname="Web"\nplatform="Web"\n[preset.1]\nname="Android"\nplatform="Android"\ngradle_build/use_gradle_build=true\ngradle_build/export_format=0\ngradle_build/min_sdk="23"\ngradle_build/target_sdk="36"\nversion/code=100\nversion/name="1.0.0"\n', 'utf8');
}

try {
  const help = spawnSync(process.execPath, [path.join(root, 'scripts', 'package-forge.mjs'), helpArtifact, '--help'], {
    cwd: root,
    encoding: 'utf8',
  });
  check(help.status === 0 && /Usage: node scripts\/package-forge\.mjs/.test(help.stdout),
    '--help exits successfully and prints usage');
  check(!fs.existsSync(helpArtifact), '--help cannot create a ZIP even when an output path is supplied');

  const invalid = spawnSync(process.execPath, [path.join(root, 'scripts', 'package-forge.mjs'), invalidArtifact, '--unknown'], {
    cwd: root,
    encoding: 'utf8',
  });
  check(invalid.status === 2 && /Unknown option/.test(invalid.stderr), 'unknown options fail closed');
  check(!fs.existsSync(invalidArtifact), 'an invalid package command cannot create a ZIP');

  const packaged = spawnSync(process.execPath, [path.join(root, 'scripts', 'package-forge.mjs'), packageArtifact], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
  check(packaged.status === 0 && fs.existsSync(packageArtifact), 'package command creates a manifest-bound package-like ZIP');
  const listed = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'unzip',
    process.platform === 'win32' ? ['-tf', packageArtifact] : ['-Z1', packageArtifact], { encoding: 'utf8' });
  const entries = String(listed.stdout || '').replaceAll('\\', '/');
  check(listed.status === 0 && !/scripts\/fixtures\/godot-web-android\/export_templates\/[^\r\n]*\.zip/mu.test(entries),
    'package deliberately excludes nested Godot fixture ZIPs');
  fs.mkdirSync(extracted, { recursive: true });
  const unpacked = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'unzip',
    process.platform === 'win32' ? ['-xf', packageArtifact, '-C', extracted] : ['-q', packageArtifact, '-d', extracted], { encoding: 'utf8' });
  const installedGodotCheck = spawnSync(process.execPath, [path.join(extracted, 'scripts', 'check-godot-web-android.mjs')], {
    cwd: extracted,
    encoding: 'utf8',
    timeout: 90_000,
  });
  check(unpacked.status === 0 && installedGodotCheck.status === 0,
    'packaged Forge regenerates test-only Godot template ZIPs at runtime and passes its installed regression');

  const installedHarness = path.join(temp, 'installed-godot-harness');
  seedInstalledGodotHarness(installedHarness);
  const installedBuild = spawnSync(process.execPath, [path.join(extracted, 'scripts', 'build-godot-web-android.mjs'), 'installed-game', 'v1.0.0', '--root', installedHarness, '--json'], {
    cwd: extracted,
    encoding: 'utf8',
    timeout: 90_000,
    env: {
      ...process.env,
      FORGE_ALLOW_TEST_HARNESS: '1',
      FORGE_GODOT_WEB_ANDROID_TEST_SHIM: path.join(extracted, 'scripts', 'fixtures', 'godot-web-android', 'fake-godot-exporter.mjs'),
    },
  });
  let installedBuildReport = null;
  let installedManifest = null;
  try {
    installedBuildReport = JSON.parse(installedBuild.stdout);
    installedManifest = JSON.parse(fs.readFileSync(installedBuildReport.manifest, 'utf8'));
  } catch {}
  check(installedBuild.status === 1
    && installedBuildReport?.status === 'test_harness'
    && installedManifest?.templates?.source === 'fixture-only'
    && installedManifest?.templates?.version === '4.7.fixture.web-android',
  'installed harness build records fixture-only regenerated template provenance in its manifest');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n[X] package CLI regression failed (${failures.length})`);
  process.exit(1);
}
console.log('\n[OK] package CLI informational and invalid calls are side-effect free');
