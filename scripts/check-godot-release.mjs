#!/usr/bin/env node
/** Adversarial deterministic regression suite for the standalone Godot Windows release lane. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createGodotReleaseReceiptPayload,
  recordGodotReleaseReceipt,
} from '../.claude/skills/status/references/godot-release-receipts.mjs';
import { sha256File } from './godot-export-contract.mjs';
import { openSafeZip } from './lib/safe-zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builder = path.join(ROOT, 'scripts', 'build-godot-release.mjs');
const verifier = path.join(ROOT, 'scripts', 'godot-release-verify.mjs');
const shim = path.join(ROOT, 'scripts', 'fixtures', 'godot-release', 'fake-godot-exporter.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-fixture-'));
const good = path.join(temp, 'good');
const passed = [];
const failed = [];
let receiptFile = null;

function ok(value, message, details = '') { (value ? passed : failed).push(`${message}${details ? `: ${details}` : ''}`); }
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
function seed(root = good, { architecture = 'x86_64', consoleWrapper = null } = {}) {
  fs.mkdirSync(root, { recursive: true });
  write(path.join(root, 'forge.engine.json'), '{"schemaVersion":1,"kind":"forge.engine-profile","engine":"godot"}\n');
  write(path.join(root, 'forge.godot.json'), '{"schemaVersion":1,"kind":"forge.godot-project","projectPath":".","scripting":"gdscript","entryScene":"res://main.tscn","smoke":{"successMarker":"DONE","quitAfterFrames":2},"sceneContract":{"minimumNodeCount":1,"requiredNodes":["Main"],"requiredNodeTypes":{"Main":"Node"},"requiredScripts":[],"requiredScriptAttachments":{}}}\n');
  write(path.join(root, 'forge.godot.export.json'), '{"schemaVersion":1,"kind":"forge.godot-export","preset":"Windows Desktop","target":"windows-x86_64"}\n');
  write(path.join(root, 'project.godot'), 'config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n');
  write(path.join(root, 'main.tscn'), '[gd_scene format=3]\n[node name="Main" type="Node"]\n');
  write(path.join(root, 'export_presets.cfg'), `[preset.0]\nname="Windows Desktop"\nplatform="Windows Desktop"\nrunnable=true\n${architecture ? `binary_format/architecture="${architecture}"\n` : ''}${consoleWrapper !== null ? `debug/export_console_wrapper=${consoleWrapper}\n` : ''}`);
  const review = path.join(root, 'screens', 'review', 'godot', 'r1');
  const rel = 'screens/review/godot/r1';
  write(path.join(review, 'capture-manifest.json'), `{"captures":[{"file":"${rel}/capture.png"}]}`);
  write(path.join(review, 'proof-manifest.json'), `{"samples":[{"file":"${rel}/proof.png"}]}`);
  write(path.join(review, 'capture.png'), 'png');
  write(path.join(review, 'proof.png'), 'png');
}
function run(root = good, mode = 'pass', version = null, extraEnv = {}) {
  const result = spawnSync(process.execPath, [builder, 'test-game', ...(version ? [version] : []), '--root', root, '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    env: { ...process.env, FORGE_ALLOW_TEST_HARNESS: '1', FORGE_GODOT_EXPORT_TEST_SHIM: shim, FORGE_GODOT_EXPORT_MODE: mode, ...extraEnv },
  });
  let value; try { value = JSON.parse(result.stdout); } catch {}
  return { result, value };
}
function runAsync(root, mode = 'pass', version = null, extraEnv = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [builder, 'test-game', ...(version ? [version] : []), '--root', root, '--json'], {
      cwd: ROOT, windowsHide: true,
      env: { ...process.env, FORGE_ALLOW_TEST_HARNESS: '1', FORGE_GODOT_EXPORT_TEST_SHIM: shim, FORGE_GODOT_EXPORT_MODE: mode, ...extraEnv },
    });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 20_000);
    child.on('close', status => {
      clearTimeout(timer);
      let value; try { value = JSON.parse(stdout); } catch {}
      resolve({ result: { status, stdout, stderr }, value });
    });
  });
}
function verify(root = good) {
  const result = spawnSync(process.execPath, [verifier, root, '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 30_000, windowsHide: true, env: process.env,
  });
  let value; try { value = JSON.parse(result.stdout); } catch {}
  return { result, value };
}
function publishFixture(root, build) {
  const source = path.dirname(build.value.manifest);
  const destination = path.join(root, 'Release', 'test-game', 'godot', 'windows', build.value.version);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  return { directory: destination, manifestFile: path.join(destination, path.basename(build.value.manifest)) };
}
function trustFixture(root, published, mutate = null) {
  const manifest = JSON.parse(fs.readFileSync(published.manifestFile, 'utf8'));
  if (mutate) mutate(manifest);
  fs.writeFileSync(published.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestPath = path.relative(root, published.manifestFile).replaceAll('\\', '/');
  const payload = createGodotReleaseReceiptPayload({ manifestPath, manifestSha256: sha256File(published.manifestFile), manifest });
  return recordGodotReleaseReceipt({ projectRoot: root, slug: manifest.slug, version: manifest.version, payload });
}
function tinyZip(file, name, { symlink = false } = {}) {
  const fileName = Buffer.from(name);
  const data = Buffer.from(symlink ? '../../outside' : 'x');
  const local = Buffer.alloc(30 + fileName.length + data.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
  local.writeUInt32LE(0, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
  fileName.copy(local, 30); data.copy(local, 30 + fileName.length);
  const central = Buffer.alloc(46 + fileName.length);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 16);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE((symlink ? 0o120777 << 16 : 0o100644 << 16) >>> 0, 38); central.writeUInt32LE(0, 42); fileName.copy(central, 46);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length, 16);
  fs.writeFileSync(file, Buffer.concat([local, central, end]));
}
function throwsCode(fn, code) { try { fn(); return false; } catch (error) { return error.code === code; } }

try {
  seed();
  const before = fs.readFileSync(path.join(good, 'project.godot'), 'utf8');
  const first = run();
  ok(first.result.status === 1 && first.value?.status === 'test_harness', 'test exporter is explicitly non-production');
  ok(first.value?.version === 'v1.0.0', 'first test build starts at v1.0.0');
  ok(!fs.existsSync(path.join(good, 'Release')), 'test exporter never publishes under normal Release');
  ok(first.value?.manifest && fs.existsSync(first.value.manifest) && first.value.artifacts?.length === 3, 'test harness still exercises immutable trio construction');
  const manifest = JSON.parse(fs.readFileSync(first.value.manifest, 'utf8'));
  ok(manifest.exports.production.flag === '--export-release' && manifest.exports.debug.flag === '--export-debug', 'manifest binds distinct release/debug export provenance');
  ok(manifest.artifacts.production.exe && manifest.artifacts.debug.pck && manifest.artifacts.debug.consoleExe
    && !manifest.artifacts.production.consoleExe && !manifest.artifacts.marketing.exe,
  'manifest binds production binaries, the debug console wrapper and marketing-only media');
  ok(fs.readFileSync(path.join(good, 'project.godot'), 'utf8') === before, 'isolated export leaves source project unchanged');
  ok(openSafeZip(first.value.artifacts[0].file).entries.length === 2, 'safe ZIP reader accepts the generated binary bundle');
  const debugArtifact = first.value.artifacts.find(item => item.variant === 'debug');
  ok(JSON.stringify(openSafeZip(debugArtifact.file).entries.map(item => item.name).sort())
    === JSON.stringify(['test-game.console.exe', 'test-game.exe', 'test-game.pck']),
  'debug ZIP contains the exact hash-bound Godot console wrapper set');

  const certificateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-certificate-')); seed(certificateRoot);
  const certificateBuild = run(certificateRoot, 'certificate-noise');
  ok(certificateBuild.result.status === 1 && certificateBuild.value?.status === 'test_harness'
    && certificateBuild.value?.artifacts?.length === 3,
  'root-certificate noise is nonblocking after both exports produce complete non-empty artifacts');
  fs.rmSync(certificateRoot, { recursive: true, force: true });

  const certificateMissingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-certificate-missing-')); seed(certificateMissingRoot);
  const certificateMissing = run(certificateMissingRoot, 'certificate-missing-pck');
  ok(certificateMissing.result.status === 1 && certificateMissing.value?.status === 'failed'
    && certificateMissing.value?.issues?.some(item => ['GODOT_RELEASE_EXPORT', 'GODOT_RELEASE_ARTIFACT'].includes(item.code)),
  'root-certificate noise cannot hide an incomplete export artifact set');
  ok(!fs.existsSync(path.join(certificateMissingRoot, 'Release')), 'certificate noise plus missing artifacts cannot publish production output');
  fs.rmSync(certificateMissingRoot, { recursive: true, force: true });

  const second = run(good, 'pass', 'v1.0.0');
  ok(second.result.status === 1 && second.value?.version === 'v1.0.1', 'same requested version auto-bumps instead of overwriting');
  const third = run();
  ok(third.value?.version === 'v1.0.2', 'automatic test build increments patch');

  const concurrentRoot = path.join(temp, 'concurrent'); seed(concurrentRoot);
  const barrier = path.join(temp, 'concurrent-barrier');
  const concurrent = await Promise.all([
    runAsync(concurrentRoot, 'pass', 'v1.0.0', { FORGE_GODOT_EXPORT_BARRIER: barrier }),
    runAsync(concurrentRoot, 'pass', 'v1.0.0', { FORGE_GODOT_EXPORT_BARRIER: barrier }),
  ]);
  const statuses = concurrent.map(item => item.value?.status).sort();
  const concurrentVersion = path.join(concurrentRoot, 'qa', 'godot-release-test-output', 'test-game', 'godot', 'windows', 'v1.0.0');
  ok(JSON.stringify(statuses) === JSON.stringify(['failed', 'test_harness']), 'concurrent builders produce one winner and one immutable conflict');
  ok(concurrent.some(item => item.value?.issues?.some(issue => issue.code === 'GODOT_RELEASE_IMMUTABLE')), 'concurrent loser reports an immutable version conflict');
  ok(fs.existsSync(concurrentVersion)
    && fs.readdirSync(concurrentVersion).filter(name => name.endsWith('.zip')).length === 3
    && fs.readdirSync(concurrentVersion).some(name => name.endsWith('.release-manifest.json')), 'concurrent loser cannot delete the winning release');
  const concurrentOutput = path.dirname(concurrentVersion);
  ok(!fs.readdirSync(concurrentOutput).some(name => name.startsWith('.forge-publish-')), 'concurrent publication leaves no staging directories');

  for (const [mode, code, status] of [['missing-templates', 'GODOT_RELEASE_TEMPLATES', 2], ['export-fail', 'GODOT_RELEASE_EXPORT', 1], ['missing-pck', 'GODOT_RELEASE_ARTIFACT', 1], ['missing-console', 'GODOT_RELEASE_ARTIFACT_SET', 1], ['bad-artifact', 'GODOT_RELEASE_ARTIFACT', 1], ['unexpected-production-file', 'GODOT_RELEASE_ARTIFACT_SET', 1], ['unexpected-debug-file', 'GODOT_RELEASE_ARTIFACT_SET', 1]]) {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), `forge-godot-release-${mode}-`)); seed(fixture);
    const trial = run(fixture, mode);
    ok(trial.result.status === status && trial.value?.issues?.some(item => item.code === code), `${mode} is rejected with classified failure`);
    ok(!fs.existsSync(path.join(fixture, 'Release')), `${mode} cannot publish production output`);
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  const timeoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-timeout-')); seed(timeoutRoot);
  const timeoutTrial = run(timeoutRoot, 'timeout', null, { FORGE_GODOT_EXPORT_TIMEOUT_MS: '250' });
  const timeoutIssue = timeoutTrial.value?.issues?.find(item => item.code === 'GODOT_RELEASE_EXPORT_TIMEOUT');
  ok(timeoutTrial.result.status === 2 && timeoutTrial.value?.status === 'environment_failure' && timeoutIssue,
    'hung exporter is killed and classified as an environment timeout');
  ok(timeoutIssue?.message.includes('250 ms')
    && timeoutIssue.message.includes('Godot is importing project resources')
    && timeoutIssue.message.includes('Still waiting for editor lock'),
  'timeout diagnostic preserves bounded stdout and stderr context');
  ok(!fs.existsSync(path.join(timeoutRoot, 'qa', 'godot-release-test-output', 'test-game', 'godot', 'windows', 'v1.0.0')),
    'timed-out export cannot publish a test release directory');
  fs.rmSync(timeoutRoot, { recursive: true, force: true });

  const invalidTimeoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-timeout-config-')); seed(invalidTimeoutRoot);
  const invalidTimeout = run(invalidTimeoutRoot, 'pass', null, { FORGE_GODOT_EXPORT_TIMEOUT_MS: '249' });
  ok(invalidTimeout.result.status === 2 && invalidTimeout.value?.issues?.some(item => item.code === 'GODOT_RELEASE_TIMEOUT_CONFIG'),
    'invalid export timeout configuration fails before export');
  fs.rmSync(invalidTimeoutRoot, { recursive: true, force: true });

  const configuredTimeoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-timeout-valid-')); seed(configuredTimeoutRoot);
  const configuredTimeout = run(configuredTimeoutRoot, 'pass', null, { FORGE_GODOT_EXPORT_TIMEOUT_MS: '2000' });
  ok(configuredTimeout.result.status === 1 && configuredTimeout.value?.status === 'test_harness',
    'valid bounded export timeout override is accepted');
  fs.rmSync(configuredTimeoutRoot, { recursive: true, force: true });

  const noPreset = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-preset-')); seed(noPreset);
  write(path.join(noPreset, 'export_presets.cfg'), '[preset.0]\nname="Linux"\nplatform="Linux/X11"\n');
  const noPresetRun = run(noPreset); ok(noPresetRun.value?.issues?.some(item => item.code === 'GODOT_EXPORT_PRESET'), 'missing exact Windows preset is rejected');
  fs.rmSync(noPreset, { recursive: true, force: true });

  const missingArch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-no-arch-')); seed(missingArch, { architecture: '' });
  const missingArchRun = run(missingArch); ok(missingArchRun.value?.issues?.some(item => item.code === 'GODOT_EXPORT_ARCHITECTURE'), 'missing explicit x86_64 architecture is rejected');
  fs.rmSync(missingArch, { recursive: true, force: true });
  const arm = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-arm-')); seed(arm, { architecture: 'arm64' });
  const armRun = run(arm); ok(armRun.value?.issues?.some(item => item.code === 'GODOT_EXPORT_ARCHITECTURE'), 'non-x86_64 architecture is rejected');
  fs.rmSync(arm, { recursive: true, force: true });

  for (const wrapper of [0, 2, 'false']) {
    const wrapperRoot = fs.mkdtempSync(path.join(os.tmpdir(), `forge-godot-release-console-${wrapper}-`)); seed(wrapperRoot, { consoleWrapper: wrapper });
    const wrapperRun = run(wrapperRoot);
    ok(wrapperRun.value?.issues?.some(item => item.code === 'GODOT_EXPORT_CONSOLE_WRAPPER'),
      `console-wrapper mode ${wrapper} is rejected before export`);
    fs.rmSync(wrapperRoot, { recursive: true, force: true });
  }

  const secret = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-secret-')); seed(secret);
  fs.appendFileSync(path.join(secret, 'export_presets.cfg'), 'api_key="nope"\n');
  const secretRun = run(secret); ok(secretRun.value?.issues?.some(item => item.code === 'GODOT_EXPORT_SECRETS'), 'credentials in export presets are rejected');
  fs.rmSync(secret, { recursive: true, force: true });

  const embedded = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-embedded-')); seed(embedded);
  fs.appendFileSync(path.join(embedded, 'export_presets.cfg'), 'binary_format/embed_pck=true\n');
  ok(run(embedded).value?.issues?.some(item => item.code === 'GODOT_EXPORT_PCK'), 'embedded PCK is rejected');
  fs.rmSync(embedded, { recursive: true, force: true });
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-custom-')); seed(custom);
  fs.appendFileSync(path.join(custom, 'export_presets.cfg'), 'custom_template/release="untrusted.exe"\n');
  ok(run(custom).value?.issues?.some(item => item.code === 'GODOT_EXPORT_CUSTOM_TEMPLATE'), 'custom template is rejected');
  fs.rmSync(custom, { recursive: true, force: true });

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-link-'));
  const linkedOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-link-outside-'));
  try {
    seed(linkedRoot);
    fs.writeFileSync(path.join(linkedRoot, 'forge.godot.json'), '{"schemaVersion":1,"kind":"forge.godot-project","projectPath":"Game","scripting":"gdscript","entryScene":"res://main.tscn","smoke":{"successMarker":"DONE","quitAfterFrames":2},"sceneContract":{"minimumNodeCount":1,"requiredNodes":["Main"],"requiredNodeTypes":{"Main":"Node"},"requiredScripts":[],"requiredScriptAttachments":{}}}\n');
    for (const name of ['project.godot', 'main.tscn', 'export_presets.cfg']) fs.renameSync(path.join(linkedRoot, name), path.join(linkedOutside, name));
    fs.symlinkSync(linkedOutside, path.join(linkedRoot, 'Game'), process.platform === 'win32' ? 'junction' : 'dir');
    const linkedRun = run(linkedRoot);
    ok(linkedRun.value?.issues?.some(item => item.code === 'GODOT_EXPORT_PROJECT_LINK'), 'implementation root junction cannot escape the release source tree');
  } finally {
    fs.rmSync(linkedRoot, { recursive: true, force: true });
    fs.rmSync(linkedOutside, { recursive: true, force: true });
  }

  const linkedOutputRoot = path.join(temp, 'linked-output');
  const linkedOutputOutside = path.join(temp, 'linked-output-outside');
  seed(linkedOutputRoot); fs.mkdirSync(path.join(linkedOutputRoot, 'qa'), { recursive: true }); fs.mkdirSync(linkedOutputOutside, { recursive: true });
  fs.symlinkSync(linkedOutputOutside, path.join(linkedOutputRoot, 'qa', 'godot-release-test-output'), process.platform === 'win32' ? 'junction' : 'dir');
  const linkedOutputRun = run(linkedOutputRoot);
  ok(linkedOutputRun.value?.issues?.some(item => item.code === 'GODOT_RELEASE_OUTPUT_PATH'), 'release output junction cannot redirect publication outside the project');
  ok(fs.readdirSync(linkedOutputOutside).length === 0, 'rejected output junction is not written through');

  const forged = publishFixture(good, first);
  const noReceipt = verify();
  ok(noReceipt.result.status === 1 && noReceipt.value?.issues?.[0]?.code === 'GODOT_RELEASE_RECEIPT_MISSING', 'hand-authored manifest and ZIP trio cannot PASS without an engine-owned receipt', noReceipt.value?.issues?.[0]?.code);
  const receipt = trustFixture(good, forged);
  receiptFile = receipt.file;
  const testReceipt = verify();
  ok(testReceipt.result.status === 1 && testReceipt.value?.issues?.[0]?.code === 'GODOT_RELEASE_VERIFY_TEST_HARNESS', 'signed test-export receipt still cannot PASS production verification', testReceipt.value?.issues?.[0]?.code);

  const future = path.join(good, 'Release', 'test-game', 'godot', 'windows', 'v999.0.0');
  fs.cpSync(forged.directory, future, { recursive: true });
  const futureManifest = path.join(future, 'test-game-v1.0.0.release-manifest.json');
  const futureValue = JSON.parse(fs.readFileSync(futureManifest, 'utf8')); futureValue.version = 'v999.0.0';
  fs.renameSync(futureManifest, path.join(future, 'test-game-v999.0.0.release-manifest.json'));
  fs.writeFileSync(path.join(future, 'test-game-v999.0.0.release-manifest.json'), JSON.stringify(futureValue));
  const futureIgnored = verify();
  ok(futureIgnored.value?.issues?.[0]?.code === 'GODOT_RELEASE_VERIFY_TEST_HARNESS' && futureIgnored.value?.version === 'v1.0.0', 'untrusted future-dated/versioned manifest cannot hijack latest release selection');

  const manifestBytes = fs.readFileSync(forged.manifestFile);
  const edited = JSON.parse(manifestBytes); edited.engine.version = 'forged-after-receipt'; fs.writeFileSync(forged.manifestFile, JSON.stringify(edited));
  const receiptTamper = verify();
  ok(receiptTamper.value?.issues?.[0]?.code === 'GODOT_RELEASE_RECEIPT_PAYLOAD', 'manifest edit after receipt is rejected');
  fs.writeFileSync(forged.manifestFile, manifestBytes);

  const archiveRoot = path.join(temp, 'archive-check'); seed(archiveRoot); const archiveBuild = run(archiveRoot);
  const archivePublished = publishFixture(archiveRoot, archiveBuild);
  trustFixture(archiveRoot, archivePublished, value => { value.engine.testHarness = false; value.visualEvidence.fixture = false; });
  const prodZip = path.join(archivePublished.directory, 'test-game-v1.0.0.zip'); fs.appendFileSync(prodZip, 'tamper');
  const archiveTamper = verify(archiveRoot);
  ok(archiveTamper.value?.issues?.[0]?.code === 'GODOT_RELEASE_VERIFY_ZIP_HASH', 'ZIP changed after the trusted receipt is rejected', archiveTamper.value?.issues?.[0]?.code);

  const linkZip = path.join(temp, 'link.zip'); tinyZip(linkZip, 'escape', { symlink: true });
  ok(throwsCode(() => openSafeZip(linkZip), 'SAFE_ZIP_LINK'), 'safe ZIP reader rejects symlink entries before extraction');
  const traversalZip = path.join(temp, 'traversal.zip'); tinyZip(traversalZip, '../escape');
  ok(throwsCode(() => openSafeZip(traversalZip), 'SAFE_ZIP_PATH'), 'safe ZIP reader rejects traversal entries before extraction');

  const noTool = spawnSync(process.execPath, [builder, 'test-game', '--root', good, '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 30_000, env: { ...process.env, FORGE_GODOT_BIN: path.join(temp, 'none.exe') },
  });
  let noToolValue; try { noToolValue = JSON.parse(noTool.stdout); } catch {}
  ok(noTool.status === 2 && noToolValue?.status === 'environment_failure', 'missing Godot tool is an environment failure');

} finally {
  try { if (receiptFile) fs.rmSync(receiptFile, { force: true }); } catch {}
  for (const text of passed) console.log(`[OK] ${text}`);
  for (const text of failed) console.error(`[FAIL] ${text}`);
  fs.rmSync(temp, { recursive: true, force: true });
}
if (failed.length) { console.error(`Godot release regressions: ${failed.length} failed, ${passed.length} passed`); process.exit(1); }
console.log(`Godot release regressions: ${passed.length} passed`);
