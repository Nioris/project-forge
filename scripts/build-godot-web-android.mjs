#!/usr/bin/env node
/**
 * Build immutable Godot Web and Android *local* candidates from an isolated copy.
 *
 * This intentionally does not accept signing material.  Android files made by this
 * lane are debug/local artifacts, never a claim that a store-ready release exists.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readEngineProfile } from './engine-profile.mjs';
import { readGodotApplicationIcon, safeSlug, sha256File, snapshotTree } from './godot-export-contract.mjs';
import { copyGodotImplementation, isolatedGodotUserEnv, runBounded, combinedOutput } from './godot-visual-runtime.mjs';
import { godotAndroidMinSdk, godotTemplateVersion } from './lib/godot-version.mjs';
import { withAndroidEtc2AstcImport } from './lib/godot-android-project.mjs';
import { hardenGodotGradleTemplate } from './lib/godot-gradle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'godot-web-android');
const args = process.argv.slice(2);
const json = args.includes('--json');
const rootAt = args.indexOf('--root');
const rootArg = rootAt >= 0 ? args[rootAt + 1] : null;
const positional = args.filter((value, index) => !value.startsWith('--') && index !== rootAt + 1);
const [slug, version] = positional;
const result = { schemaVersion: 1, kind: 'forge.godot-web-android-local-build', status: 'failed', projectRoot: null, slug, version, artifacts: [], manifest: null, issues: [] };
let environmentFailure = false;
let temporary = null;

function fail(code, message, environment = false) { const error = new Error(message); error.code = code; error.environment = environment === true; throw error; }
function issue(code, message, environment = false) { result.issues.push({ code, message: String(message).slice(0, 1000) }); if (environment) environmentFailure = true; }
function inside(root, candidate) { const rel = path.relative(path.resolve(root), path.resolve(candidate)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }
function exactVersion(value) { return /^v\d+\.\d+\.\d+$/u.test(String(value || '')); }
function outputTail(run) {
  const lines = combinedOutput(run).split(/\r?\n/u).map(value => value.trim()).filter(Boolean);
  const diagnostic = lines.filter(line => /(?:exception|caused by:|could not|unable to|failed|failure|ssl|pkix|certificate|unknownhost|connect|download|distribution|gradle)/iu.test(line));
  const selected = [...diagnostic.slice(0, 8), ...lines.slice(-8)]
    .filter((line, index, all) => all.indexOf(line) === index);
  return selected.join(' | ').slice(0, 950) || 'no diagnostic output';
}

function safeOutput(root, target) {
  const canonical = fs.realpathSync(root); const targetPath = path.resolve(target);
  if (!inside(canonical, targetPath)) fail('GODOT_MULTI_OUTPUT_PATH', 'release output escapes project root');
  let cursor = canonical;
  for (const segment of path.relative(canonical, targetPath).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment); if (!fs.existsSync(cursor)) break;
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !inside(canonical, fs.realpathSync(cursor))) fail('GODOT_MULTI_OUTPUT_PATH', `unsafe release output ancestor: ${segment}`);
  }
}
function parsePresets(text) {
  const chunks = String(text).split(/(?=^\[preset(?:\.\d+)?\])/mu); const found = new Map();
  for (const chunk of chunks) {
    const name = chunk.match(/^name="([^"]+)"/mu)?.[1]; const platform = chunk.match(/^platform="([^"]+)"/mu)?.[1];
    if (name && platform) found.set(name, { platform, text: chunk });
  }
  return found;
}
function credentials(text) {
  return String(text).split(/\r?\n/u).some(line => {
    const match = line.match(/^\s*([^=]+)\s*=\s*(.*?)\s*$/u); if (!match || !/(?:password|token|secret|api[_-]?key|keystore|private[_-]?key|credential)/iu.test(match[1])) return false;
    return match[2].replace(/^"|"$/gu, '').trim() !== '';
  });
}
function androidPresetMetadata(text, requestedVersion) {
  if (/^\s*package\/(?:version_code|version_name|min_sdk|target_sdk)\s*=/mu.test(text)) {
    fail('GODOT_MULTI_ANDROID_LEGACY_OPTIONS', 'Android preset uses ignored legacy package/version or package/sdk option names');
  }
  const integer = key => Number(text.match(new RegExp(`^\\s*${key.replace('/', '\\/')}\\s*=\\s*\"?(\\d+)\"?\\s*$`, 'mu'))?.[1] || NaN);
  const versionName = text.match(/^\s*version\/name\s*=\s*"([^"]+)"\s*$/mu)?.[1] || '';
  const versionCode = integer('version/code'); const minSdk = integer('gradle_build/min_sdk'); const targetSdk = integer('gradle_build/target_sdk');
  const exportFormat = integer('gradle_build/export_format');
  if (!Number.isInteger(versionCode) || versionCode < 1) fail('GODOT_MULTI_ANDROID_VERSION_CODE', 'Android preset requires a positive version/code');
  if (versionName !== requestedVersion.slice(1)) fail('GODOT_MULTI_ANDROID_VERSION_NAME', `Android version/name must equal ${requestedVersion.slice(1)}`);
  if (!Number.isInteger(minSdk) || !Number.isInteger(targetSdk) || minSdk < 21 || targetSdk < minSdk) fail('GODOT_MULTI_ANDROID_SDK_LEVELS', 'Android preset requires valid gradle_build/min_sdk and gradle_build/target_sdk');
  if (exportFormat !== 0) fail('GODOT_MULTI_ANDROID_EXPORT_FORMAT', 'Committed Android preset must use gradle_build/export_format=0 as the APK base');
  return { versionCode, versionName, minSdk, targetSdk, apkExportFormat: 0, aabExportFormat: 1 };
}
function contract(projectRoot, requestedVersion) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const engine = readEngineProfile(root); if (engine.engine !== 'godot') fail('GODOT_MULTI_ENGINE', `Godot engine required; got ${engine.engine}`);
  let project; try { project = JSON.parse(fs.readFileSync(path.join(root, 'forge.godot.json'), 'utf8')); } catch { fail('GODOT_MULTI_PROJECT', 'forge.godot.json is missing or invalid'); }
  if (project?.kind !== 'forge.godot-project' || project?.schemaVersion !== 1 || typeof project.projectPath !== 'string') fail('GODOT_MULTI_PROJECT', 'forge.godot.json is not a Godot project contract');
  const relative = project.projectPath.replaceAll('\\', '/');
  if (!(relative === '.' || /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(relative))) fail('GODOT_MULTI_PROJECT', 'unsafe Godot implementation path');
  const implementation = path.resolve(root, relative);
  if (!inside(root, implementation) || !fs.existsSync(implementation) || fs.lstatSync(implementation).isSymbolicLink()) fail('GODOT_MULTI_PROJECT', 'Godot implementation root is unavailable or linked');
  const implementationRoot = fs.realpathSync(implementation);
  if (!inside(root, implementationRoot) || !fs.existsSync(path.join(implementationRoot, 'project.godot'))) fail('GODOT_MULTI_PROJECT', 'Godot project.godot is missing');
  const icon = readGodotApplicationIcon(implementationRoot);
  const presetFile = path.join(implementationRoot, 'export_presets.cfg'); let presetsText;
  try { presetsText = fs.readFileSync(presetFile, 'utf8'); } catch { fail('GODOT_MULTI_PRESETS', 'export_presets.cfg is required for Web and Android export'); }
  if (credentials(presetsText)) fail('GODOT_MULTI_SECRETS', 'export_presets.cfg must not contain signing credentials or API secrets');
  const presets = parsePresets(presetsText);
  if (presets.get('Web')?.platform !== 'Web') fail('GODOT_MULTI_PRESET_WEB', 'exact Godot preset name="Web" platform="Web" is required');
  if (presets.get('Android')?.platform !== 'Android') fail('GODOT_MULTI_PRESET_ANDROID', 'exact Godot preset name="Android" platform="Android" is required');
  if (!/^gradle_build\/use_gradle_build\s*=\s*true\s*$/mu.test(presets.get('Android').text)) {
    fail('GODOT_MULTI_ANDROID_GRADLE', 'Android preset must set gradle_build/use_gradle_build=true for an AAB export');
  }
  const android = androidPresetMetadata(presets.get('Android').text, requestedVersion);
  return { root, implementationRoot, sourceHash: snapshotTree(implementationRoot), icon, presets: { web: presets.get('Web').text, android: presets.get('Android').text }, android };
}
function detectGodot() {
  const rawShim = process.env.FORGE_ALLOW_TEST_HARNESS === '1' ? String(process.env.FORGE_GODOT_WEB_ANDROID_TEST_SHIM || '').trim() : '';
  let command = String(process.env.FORGE_GODOT_BIN || '').trim(); let prefix = [];
  if (rawShim) { const shim = path.resolve(rawShim); if (!inside(FIXTURES, shim) || !fs.existsSync(shim)) fail('GODOT_MULTI_TEST_SHIM', 'test exporter must be inside scripts/fixtures/godot-web-android'); command = process.execPath; prefix = [shim]; }
  if (!command) {
    const candidates = process.platform === 'win32'
      ? [path.join('C:', 'Tools', 'Godot', 'godot_console.exe'), path.join('C:', 'Tools', 'Godot', 'godot.exe'), 'godot_console.exe', 'godot.exe', 'godot_console', 'godot']
      : ['godot'];
    command = candidates.find(candidate => spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 }).status === 0) || 'godot';
  }
  const check = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (check.status !== 0 || check.error) fail('GODOT_MULTI_TOOLCHAIN', 'Godot editor is unavailable', true);
  return { command, prefix, version: String(check.stdout || check.stderr || '').trim().split(/\r?\n/u).find(Boolean) || null, testHarness: prefix.length > 0 };
}
function templateSource(godot) {
  const editorVersion = String(godot.version || '').trim();
  const version = godot.testHarness
    ? editorVersion
    : godotTemplateVersion(editorVersion);
  if (!version) fail('GODOT_MULTI_TEMPLATE_VERSION', `Godot returned an unsupported template version: ${editorVersion || '(empty)'}`, true);
  const source = godot.testHarness
    ? path.join(FIXTURES, 'export_templates', version)
    : path.join(String(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')), 'Godot', 'export_templates', version);
  if (!fs.existsSync(source) || !fs.lstatSync(source).isDirectory() || fs.lstatSync(source).isSymbolicLink()) {
    fail('GODOT_MULTI_TEMPLATES', `matching official Godot export templates are missing: ${source}`, true);
  }
  const required = ['web_release.zip', 'web_nothreads_release.zip', 'android_debug.apk', 'android_release.apk', 'android_source.zip'];
  for (const name of required) {
    const file = path.join(source, name);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size < 1) {
      fail('GODOT_MULTI_TEMPLATES', `matching Godot template is missing or unsafe: ${name}`, true);
    }
  }
  return { version, editorVersion, source, required };
}
function installTemplates(runtime, templates) {
  const destination = path.join(runtime, 'godot-user', 'AppData', 'Roaming', 'Godot', 'export_templates', templates.version);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of templates.required) fs.copyFileSync(path.join(templates.source, name), path.join(destination, name), fs.constants.COPYFILE_EXCL);
  return destination;
}
function zip(source, destination) { const run = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'zip', process.platform === 'win32' ? ['-a', '-cf', destination, '.'] : ['-rq', destination, '.'], { cwd: source, encoding: 'utf8', windowsHide: true, timeout: 120_000 }); if (run.status !== 0 || run.error || !fs.existsSync(destination)) fail('GODOT_MULTI_ZIP', `unable to create web ZIP: ${run.stderr || run.error?.message || 'unknown error'}`, true); }
function zipMagic(file) { const bytes = fs.readFileSync(file); return bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50; }
function writeAndroidSettings(runtime, version, sdk, java) {
  const series = String(version).match(/^(\d+\.\d+)/u)?.[1]; if (!series) fail('GODOT_MULTI_SETTINGS_VERSION', `cannot derive Godot editor settings version from ${version}`, true);
  const settings = path.join(runtime, 'godot-user', 'AppData', 'Roaming', 'Godot', `editor_settings-${series}.tres`); fs.mkdirSync(path.dirname(settings), { recursive: true });
  const quote = value => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  fs.writeFileSync(settings, `[gd_resource type="EditorSettings" format=3]\n\n[resource]\nexport/android/android_sdk_path = "${quote(sdk)}"\nexport/android/java_sdk_path = "${quote(java)}"\n`);
}
function exportArtifact(godot, isolated, env, mode, preset, destination, label) {
  const run = runBounded(godot.command, [...godot.prefix, '--headless', '--path', isolated, mode, preset, destination], { cwd: isolated, timeoutMs: Number(process.env.FORGE_GODOT_MULTI_EXPORT_TIMEOUT_MS || 600000), env });
  if (run.timedOut) fail('GODOT_MULTI_EXPORT_TIMEOUT', `${label} export timed out: ${outputTail(run)}`, true);
  if (run.status !== 0 || run.error || !fs.existsSync(destination) || fs.statSync(destination).size < 1) fail('GODOT_MULTI_EXPORT', `${label} export failed: ${outputTail(run)}`, /templates?|sdk|java|gradle/iu.test(outputTail(run)));
}
function installAndroidBuildTemplate(templates, isolated) {
  const archive = path.join(templates.source, 'android_source.zip');
  const list = process.platform === 'win32'
    ? spawnSync('tar.exe', ['-tf', archive], { encoding: 'utf8', windowsHide: true, timeout: 60_000 })
    : spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8', timeout: 60_000 });
  if (list.status !== 0 || list.error) fail('GODOT_MULTI_ANDROID_TEMPLATE_ARCHIVE', `Cannot inspect official Android build template: ${list.stderr || list.error?.message || 'unknown error'}`, true);
  const members = String(list.stdout || '').split(/\r?\n/u).map(value => value.trim()).filter(Boolean);
  if (!members.length || members.some(value => {
    const normalized = value.replaceAll('\\', '/');
    return normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized) || normalized.split('/').includes('..');
  })) fail('GODOT_MULTI_ANDROID_TEMPLATE_ARCHIVE', 'Official Android build template has an unsafe or empty archive layout', true);
  const androidRoot = path.join(isolated, 'android'); const buildRoot = path.join(androidRoot, 'build');
  fs.mkdirSync(buildRoot, { recursive: true });
  const unpack = process.platform === 'win32'
    ? spawnSync('tar.exe', ['-xf', archive, '-C', buildRoot], { encoding: 'utf8', windowsHide: true, timeout: 180_000 })
    : spawnSync('unzip', ['-q', archive, '-d', buildRoot], { encoding: 'utf8', timeout: 180_000 });
  if (unpack.status !== 0 || unpack.error) fail('GODOT_MULTI_ANDROID_TEMPLATE_ARCHIVE', `Cannot extract official Android build template: ${unpack.stderr || unpack.error?.message || 'unknown error'}`, true);
  for (const required of ['build.gradle', 'settings.gradle', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew', path.join('gradle', 'wrapper', 'gradle-wrapper.properties')]) {
    if (!fs.existsSync(path.join(buildRoot, required))) fail('GODOT_MULTI_ANDROID_TEMPLATE', `Installed Android build template is missing ${required}`, true);
  }
  fs.writeFileSync(path.join(androidRoot, '.build_version'), `${templates.version}\n`, 'utf8');
  fs.writeFileSync(path.join(buildRoot, '.gdignore'), '', { encoding: 'utf8', flag: 'a' });
  return { archive, buildRoot, versionFile: path.join(androidRoot, '.build_version'), gradle: hardenGodotGradleTemplate(buildRoot) };
}
function setIsolatedAndroidExportFormat(isolated, format) {
  const presetFile = path.join(isolated, 'export_presets.cfg');
  const text = fs.readFileSync(presetFile, 'utf8');
  const chunks = text.split(/(?=^\[preset(?:\.\d+)?\])/mu);
  let changed = false;
  const next = chunks.map(chunk => {
    if (!/^name="Android"$/mu.test(chunk) || !/^platform="Android"$/mu.test(chunk)) return chunk;
    const updated = chunk.replace(/^\s*gradle_build\/export_format\s*=\s*\d+\s*$/mu, `gradle_build/export_format=${format}`);
    changed = updated !== chunk;
    return updated;
  }).join('');
  if (!changed && !new RegExp(`^\\s*gradle_build/export_format\\s*=\\s*${format}\\s*$`, 'mu').test(text)) {
    fail('GODOT_MULTI_ANDROID_EXPORT_FORMAT', `Cannot set isolated Android export format ${format}`);
  }
  fs.writeFileSync(presetFile, next, 'utf8');
}
function preparePublish(staged, published, nonce) {
  const parent = path.dirname(published);
  fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(published)) fail('GODOT_MULTI_IMMUTABLE', `refusing to overwrite existing version: ${published}`);
  const transfer = path.join(parent, `.${path.basename(published)}.forge-stage-${nonce}`);
  if (fs.existsSync(transfer)) fail('GODOT_MULTI_PUBLISH_STAGE', `publish transaction already exists: ${transfer}`, true);
  fs.cpSync(staged, transfer, { recursive: true, force: false, errorOnExist: true });
  return { transfer, published, committed: false };
}
function commitPublishes(entries) {
  try {
    for (const entry of entries) {
      if (fs.existsSync(entry.published)) fail('GODOT_MULTI_IMMUTABLE', `refusing to overwrite existing version: ${entry.published}`);
      fs.renameSync(entry.transfer, entry.published);
      entry.committed = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.committed && fs.existsSync(entry.published) && !fs.existsSync(entry.transfer)) fs.renameSync(entry.published, entry.transfer);
      } catch (rollback) { rollbackErrors.push(rollback.message || String(rollback)); }
    }
    for (const entry of entries) {
      try { if (fs.existsSync(entry.transfer)) fs.rmSync(entry.transfer, { recursive: true, force: true }); } catch {}
    }
    if (rollbackErrors.length) fail('GODOT_MULTI_PUBLISH_ROLLBACK', `${error.message || error}; rollback failed: ${rollbackErrors.join('; ')}`, true);
    throw error;
  }
}

try {
  if (!safeSlug(slug) || !exactVersion(version) || !rootArg) fail('GODOT_MULTI_USAGE', 'usage: build-godot-web-android.mjs <slug> <vN.N.N> --root <project> [--json]');
  const spec = contract(rootArg, version); result.projectRoot = spec.root;
  const godot = detectGodot();
  const engineMinSdk = godotAndroidMinSdk(godot.version);
  if (!godot.testHarness && (!engineMinSdk || spec.android.minSdk < engineMinSdk)) {
    fail('GODOT_MULTI_ANDROID_SDK_LEVELS', `Godot ${godot.version} requires gradle_build/min_sdk >= ${engineMinSdk || 'a known supported level'}`);
  }
  const templates = templateSource(godot);
  const webVersion = path.join(spec.root, godot.testHarness ? 'qa' : 'Release', slug, 'godot', 'web', version);
  const androidVersion = path.join(spec.root, godot.testHarness ? 'qa' : 'Release', slug, 'godot', 'android', version);
  safeOutput(spec.root, webVersion); safeOutput(spec.root, androidVersion);
  if (fs.existsSync(webVersion) || fs.existsSync(androidVersion)) fail('GODOT_MULTI_IMMUTABLE', `version ${version} already exists in Web or Android output`);
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-web-android-'));
  const isolated = path.join(temporary, 'source'); copyGodotImplementation(spec.implementationRoot, isolated);
  const runtimeEnv = isolatedGodotUserEnv(temporary);
  const gradleUserHome = path.resolve(String(process.env.FORGE_GRADLE_USER_HOME || path.join(os.homedir(), '.gradle')).trim());
  if (inside(spec.root, gradleUserHome)) fail('GODOT_MULTI_GRADLE_CACHE', 'Gradle cache must be outside the project source');
  fs.mkdirSync(gradleUserHome, { recursive: true });
  const env = { ...runtimeEnv, GRADLE_USER_HOME: gradleUserHome };
  const isolatedTemplates = installTemplates(temporary, templates);
  const webStage = path.join(temporary, 'web'); fs.mkdirSync(webStage); const index = path.join(webStage, 'index.html');
  exportArtifact(godot, isolated, env, '--export-release', 'Web', index, 'Web release');
  const webFiles = fs.readdirSync(webStage); if (!webFiles.includes('index.html') || !webFiles.some(name => /\.(?:wasm|pck|js)$/iu.test(name))) fail('GODOT_MULTI_WEB_ARTIFACT', 'Web export must contain index.html and Godot runtime files');
  const webZip = path.join(temporary, `${slug}-${version}-web.zip`); zip(webStage, webZip);
  const sdk = String(process.env.FORGE_ANDROID_SDK_PATH || process.env.ANDROID_HOME || '').trim(); const java = String(process.env.FORGE_ANDROID_JAVA_PATH || process.env.JAVA_HOME || '').trim();
  if (!godot.testHarness && (!sdk || !java || !fs.existsSync(sdk) || !fs.existsSync(java))) fail('GODOT_MULTI_ANDROID_TOOLCHAIN', 'Android export requires existing FORGE_ANDROID_SDK_PATH and FORGE_ANDROID_JAVA_PATH outside the project', true);
  const editorSettings = writeAndroidSettings(temporary, templates.version, sdk || 'fixture-sdk', java || 'fixture-java');
  const androidBuildTemplate = installAndroidBuildTemplate(templates, isolated);
  const isolatedProjectSettings = path.join(isolated, 'project.godot');
  fs.writeFileSync(isolatedProjectSettings, withAndroidEtc2AstcImport(fs.readFileSync(isolatedProjectSettings, 'utf8')), 'utf8');
  const androidStage = path.join(temporary, 'android'); fs.mkdirSync(androidStage);
  const apk = path.join(androidStage, `${slug}-${version}-debug.apk`); const aab = path.join(androidStage, `${slug}-${version}-debug.aab`);
  setIsolatedAndroidExportFormat(isolated, spec.android.apkExportFormat);
  exportArtifact(godot, isolated, env, '--export-debug', 'Android', apk, 'Android debug APK');
  setIsolatedAndroidExportFormat(isolated, spec.android.aabExportFormat);
  exportArtifact(godot, isolated, env, '--export-debug', 'Android', aab, 'Android debug AAB');
  if (!zipMagic(apk) || !zipMagic(aab)) fail('GODOT_MULTI_ANDROID_ARTIFACT', 'Android APK/AAB must be non-empty ZIP-compatible Android packages');
  if (snapshotTree(spec.implementationRoot) !== spec.sourceHash) fail('GODOT_MULTI_SOURCE_MUTATED', 'source changed during isolated export');
  const webPublishStage = path.join(temporary, 'publish-web'); const androidPublishStage = path.join(temporary, 'publish-android'); fs.mkdirSync(webPublishStage); fs.mkdirSync(androidPublishStage);
  fs.renameSync(webZip, path.join(webPublishStage, path.basename(webZip))); fs.cpSync(androidStage, androidPublishStage, { recursive: true });
  const manifest = { schemaVersion: 1, kind: 'forge.godot-web-android-local-manifest', slug, version, createdAt: new Date().toISOString(), engine: { name: 'godot', version: godot.version, testHarness: godot.testHarness }, sourceSnapshotSha256: spec.sourceHash, applicationIcon: { resource: spec.icon.resource, sha256: spec.icon.sha256 }, templates: { source: godot.testHarness ? 'fixture-only' : templates.source, version: templates.version, isolatedPath: isolatedTemplates }, web: { preset: 'Web', exportMode: 'release', artifact: path.basename(webZip), sha256: sha256File(path.join(webPublishStage, path.basename(webZip))), format: 'zip-root-index-html' }, android: { preset: 'Android', exportMode: 'debug', customBuildTemplate: 'official-archive-installed-in-isolated-source', templateArchive: godot.testHarness ? 'fixture-only' : androidBuildTemplate.archive, gradle: { ...androidBuildTemplate.gradle, cache: 'external-user-home' }, editorSettings, engineMinSdk: engineMinSdk || spec.android.minSdk, isolatedProjectSettings: { textureImportEtc2Astc: true }, versionCode: spec.android.versionCode, versionName: spec.android.versionName, minSdk: spec.android.minSdk, targetSdk: spec.android.targetSdk, signing: 'debug-local-only', productionSigning: 'blocked', blockers: ['A production Android keystore and store-specific enrollment are required outside this project.'], artifacts: [{ file: path.basename(apk), format: 'apk', exportFormat: spec.android.apkExportFormat }, { file: path.basename(aab), format: 'aab', exportFormat: spec.android.aabExportFormat }].map(item => ({ ...item, sha256: sha256File(path.join(androidPublishStage, item.file)), bytes: fs.statSync(path.join(androidPublishStage, item.file)).size })) } };
  fs.writeFileSync(path.join(webPublishStage, `${slug}-${version}.web-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(androidPublishStage, `${slug}-${version}.android-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  const publishNonce = `${process.pid}-${Date.now()}`;
  const publishes = [];
  try {
    publishes.push(preparePublish(webPublishStage, webVersion, publishNonce));
    publishes.push(preparePublish(androidPublishStage, androidVersion, publishNonce));
  } catch (error) {
    for (const entry of publishes) {
      try { if (fs.existsSync(entry.transfer)) fs.rmSync(entry.transfer, { recursive: true, force: true }); } catch {}
    }
    throw error;
  }
  commitPublishes(publishes);
  result.status = godot.testHarness ? 'test_harness' : 'local_verified'; result.manifest = path.join(webVersion, `${slug}-${version}.web-manifest.json`); result.artifacts = [path.join(webVersion, path.basename(webZip)), path.join(androidVersion, path.basename(apk)), path.join(androidVersion, path.basename(aab))];
} catch (error) { issue(error.code || 'GODOT_MULTI_INTERNAL', error.message || String(error), error.environment === true); result.status = environmentFailure ? 'environment_failure' : 'failed'; }
finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
if (json) console.log(JSON.stringify(result, null, 2)); else console.log(`${result.status}: ${result.issues.map(item => item.code).join(', ') || result.artifacts.join(', ')}`);
process.exitCode = result.status === 'local_verified' ? 0 : result.status === 'environment_failure' ? 2 : 1;
