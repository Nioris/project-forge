#!/usr/bin/env node
/**
 * Build immutable, production-signed Godot Android APK/AAB artifacts.
 *
 * This is deliberately separate from build-godot-web-android.mjs: that script
 * remains a debug/local candidate builder.  Private signing material is read
 * only from the host-owned security vault and is never written to the project,
 * export preset, manifest or diagnostic output.
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
import { verifyAndroidProductionSignature } from './platform-release-verify.mjs';
import { initializeProjectSecurity, publicStatus, materializeAndroidSigning } from './lib/forge-security-vault.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'godot-web-android');
const VERSION = /^v\d+\.\d+\.\d+$/u;
const PACKAGE_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const MAX_TIMEOUT_MS = 20 * 60_000;

function fail(code, message, environment = false) { const error = new Error(message); error.code = code; error.environment = environment === true; throw error; }
function inside(root, candidate) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function regularExternalFile(file, projectRoot) {
  const lexical = path.resolve(String(file || ''));
  if (!lexical || inside(projectRoot, lexical)) fail('GODOT_ANDROID_RELEASE_KEY_PATH', 'Android signing keystore must stay outside the project');
  const stat = fs.lstatSync(lexical, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) fail('GODOT_ANDROID_RELEASE_KEY_PATH', 'Android signing keystore must be an external regular file');
  const real = fs.realpathSync(lexical);
  if (inside(projectRoot, real)) fail('GODOT_ANDROID_RELEASE_KEY_PATH', 'Android signing keystore real path must stay outside the project');
  return real;
}
function redact(value, secrets) {
  let text = String(value || '');
  for (const secret of secrets) if (typeof secret === 'string' && secret) text = text.split(secret).join('[REDACTED]');
  return text;
}
function outputTail(run, secrets) {
  const lines = redact(combinedOutput(run), secrets).split(/\r?\n/u).map(value => value.trim()).filter(Boolean);
  const diagnostic = lines.filter(line => /(?:exception|caused by:|could not|unable to|failed|failure|ssl|pkix|certificate|unknownhost|connect|download|distribution|gradle|keystore)/iu.test(line));
  return [...diagnostic.slice(0, 8), ...lines.slice(-8)].filter((line, index, all) => all.indexOf(line) === index).join(' | ').slice(0, 950) || 'no diagnostic output';
}
function parsePresets(text) {
  const chunks = String(text).split(/(?=^\[preset(?:\.\d+)?\])/mu); const found = new Map();
  for (const chunk of chunks) { const name = chunk.match(/^name="([^"]+)"/mu)?.[1]; const platform = chunk.match(/^platform="([^"]+)"/mu)?.[1]; if (name && platform) found.set(name, { platform, text: chunk }); }
  return found;
}
function hasCredentialValue(text) {
  return String(text).split(/\r?\n/u).some(line => { const match = line.match(/^\s*([^=]+)\s*=\s*(.*?)\s*$/u); return Boolean(match && /(?:password|token|secret|api[_-]?key|keystore|private[_-]?key|credential)/iu.test(match[1]) && match[2].replace(/^"|"$/gu, '').trim()); });
}
function integer(text, key) { return Number(text.match(new RegExp(`^\\s*${key.replace('/', '\\/')}\\s*=\\s*"?(\\d+)"?\\s*$`, 'mu'))?.[1] || NaN); }
function androidContract(root, version) {
  const engine = readEngineProfile(root); if (engine.engine !== 'godot') fail('GODOT_ANDROID_RELEASE_ENGINE', `Godot engine required; got ${engine.engine}`);
  let contract; try { contract = JSON.parse(fs.readFileSync(path.join(root, 'forge.godot.json'), 'utf8')); } catch { fail('GODOT_ANDROID_RELEASE_PROJECT', 'forge.godot.json is missing or invalid'); }
  const relative = String(contract?.projectPath || '').replaceAll('\\', '/');
  if (!(relative === '.' || /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(relative))) fail('GODOT_ANDROID_RELEASE_PROJECT', 'unsafe Godot implementation path');
  const implementation = path.resolve(root, relative);
  if (!inside(root, implementation) || !fs.lstatSync(implementation, { throwIfNoEntry: false })?.isDirectory() || fs.lstatSync(implementation).isSymbolicLink()) fail('GODOT_ANDROID_RELEASE_PROJECT', 'Godot implementation root is unavailable or linked');
  const source = fs.realpathSync(implementation);
  if (!inside(root, source) || !fs.lstatSync(path.join(source, 'project.godot'), { throwIfNoEntry: false })?.isFile()) fail('GODOT_ANDROID_RELEASE_PROJECT', 'Godot implementation root is missing project.godot');
  const presetFile = path.join(source, 'export_presets.cfg'); let presetText;
  try { presetText = fs.readFileSync(presetFile, 'utf8'); } catch { fail('GODOT_ANDROID_RELEASE_PRESET', 'export_presets.cfg is required'); }
  if (hasCredentialValue(presetText)) fail('GODOT_ANDROID_RELEASE_SECRETS', 'export_presets.cfg must not contain signing credentials or API secrets');
  const android = parsePresets(presetText).get('Android');
  if (android?.platform !== 'Android') fail('GODOT_ANDROID_RELEASE_PRESET', 'exact Godot preset name="Android" platform="Android" is required');
  if (!/^gradle_build\/use_gradle_build\s*=\s*true\s*$/mu.test(android.text)) fail('GODOT_ANDROID_RELEASE_GRADLE', 'Android preset must use Gradle builds');
  const code = integer(android.text, 'version/code'); const name = android.text.match(/^\s*version\/name\s*=\s*"([^"]+)"\s*$/mu)?.[1] || '';
  const minSdk = integer(android.text, 'gradle_build/min_sdk'); const targetSdk = integer(android.text, 'gradle_build/target_sdk');
  if (!Number.isInteger(code) || code < 1 || name !== version.slice(1) || !Number.isInteger(minSdk) || !Number.isInteger(targetSdk) || minSdk < 21 || targetSdk < minSdk) fail('GODOT_ANDROID_RELEASE_METADATA', 'Android preset has invalid version or SDK metadata');
  return { source, sourceHash: snapshotTree(source), icon: readGodotApplicationIcon(source), versionCode: code, versionName: name, minSdk, targetSdk };
}
function detectGodot() {
  const shim = process.env.FORGE_ALLOW_TEST_HARNESS === '1' ? String(process.env.FORGE_GODOT_ANDROID_RELEASE_TEST_SHIM || '').trim() : '';
  let command = String(process.env.FORGE_GODOT_BIN || '').trim(); let prefix = [];
  if (shim) { const resolved = path.resolve(shim); if (!inside(FIXTURES, resolved) || !fs.existsSync(resolved)) fail('GODOT_ANDROID_RELEASE_TEST_SHIM', 'test exporter must stay inside the trusted fixture directory'); command = process.execPath; prefix = [resolved]; }
  if (!command) command = (process.platform === 'win32' ? ['godot_console.exe', 'godot.exe'] : ['godot4', 'godot']).find(candidate => spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 }).status === 0) || 'godot';
  const check = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (check.status !== 0 || check.error) fail('GODOT_ANDROID_RELEASE_TOOLCHAIN', 'Godot editor is unavailable', true);
  return { command, prefix, version: String(check.stdout || check.stderr || '').trim().split(/\r?\n/u).find(Boolean) || '', testHarness: prefix.length > 0 };
}
function zip(source, destination) { const run = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'zip', process.platform === 'win32' ? ['-a', '-cf', destination, '.'] : ['-rq', destination, '.'], { cwd: source, encoding: 'utf8', windowsHide: true, timeout: 120_000 }); if (run.status !== 0 || run.error || !fs.existsSync(destination)) fail('GODOT_ANDROID_RELEASE_ZIP', 'unable to create fixture template ZIP', true); }
function materializeFixtureTemplates(version, runtime) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(version)) fail('GODOT_ANDROID_RELEASE_TEMPLATE_VERSION', 'unsafe fixture template version', true);
  const bundled = path.join(FIXTURES, 'export_templates', version); const destination = path.join(runtime, 'fixture-export-templates', version);
  if (!inside(FIXTURES, bundled) || !fs.lstatSync(bundled, { throwIfNoEntry: false })?.isDirectory()) fail('GODOT_ANDROID_RELEASE_TEMPLATES', 'packaged fixture templates are missing', true);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ['android_debug.apk', 'android_release.apk']) fs.copyFileSync(path.join(bundled, name), path.join(destination, name), fs.constants.COPYFILE_EXCL);
  const web = path.join(runtime, 'fixture-web-template'); fs.mkdirSync(web); fs.writeFileSync(path.join(web, 'template.txt'), 'fixture\n'); zip(web, path.join(destination, 'web_release.zip')); zip(web, path.join(destination, 'web_nothreads_release.zip')); zip(path.join(FIXTURES, 'android-source'), path.join(destination, 'android_source.zip'));
  return destination;
}
function templates(godot, runtime) {
  const version = godot.testHarness ? godot.version : godotTemplateVersion(godot.version);
  if (!version) fail('GODOT_ANDROID_RELEASE_TEMPLATE_VERSION', 'unsupported Godot template version', true);
  const source = godot.testHarness ? materializeFixtureTemplates(version, runtime) : path.join(String(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')), 'Godot', 'export_templates', version);
  const required = ['android_debug.apk', 'android_release.apk', 'android_source.zip'];
  for (const name of required) if (!fs.lstatSync(path.join(source, name), { throwIfNoEntry: false })?.isFile()) fail('GODOT_ANDROID_RELEASE_TEMPLATES', `missing matching Godot template: ${name}`, true);
  return { version, source, required };
}
function installTemplates(runtime, template) { const destination = path.join(runtime, 'godot-user', 'AppData', 'Roaming', 'Godot', 'export_templates', template.version); fs.mkdirSync(destination, { recursive: true }); for (const name of template.required) fs.copyFileSync(path.join(template.source, name), path.join(destination, name), fs.constants.COPYFILE_EXCL); return destination; }
function writeSettings(runtime, version, sdk, java) { const series = version.match(/^(\d+\.\d+)/u)?.[1]; if (!series) fail('GODOT_ANDROID_RELEASE_SETTINGS', 'cannot derive Godot settings version', true); const file = path.join(runtime, 'godot-user', 'AppData', 'Roaming', 'Godot', `editor_settings-${series}.tres`); fs.mkdirSync(path.dirname(file), { recursive: true }); const quote = value => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"'); fs.writeFileSync(file, `[gd_resource type="EditorSettings" format=3]\n\n[resource]\nexport/android/android_sdk_path = "${quote(sdk)}"\nexport/android/java_sdk_path = "${quote(java)}"\n`); }
function installAndroidTemplate(template, isolated) {
  const archive = path.join(template.source, 'android_source.zip'); const root = path.join(isolated, 'android', 'build'); fs.mkdirSync(root, { recursive: true });
  const inspect = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'unzip', process.platform === 'win32' ? ['-tf', archive] : ['-Z1', archive], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  const names = String(inspect.stdout || '').split(/\r?\n/u).map(v => v.trim()).filter(Boolean);
  if (inspect.status !== 0 || inspect.error || !names.length || names.some(name => name.replaceAll('\\', '/').startsWith('/') || /^[A-Za-z]:/u.test(name) || name.replaceAll('\\', '/').split('/').includes('..'))) fail('GODOT_ANDROID_RELEASE_TEMPLATE_ARCHIVE', 'Android template archive is invalid or unsafe', true);
  const unpack = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'unzip', process.platform === 'win32' ? ['-xf', archive, '-C', root] : ['-q', archive, '-d', root], { encoding: 'utf8', windowsHide: true, timeout: 180_000 });
  if (unpack.status !== 0 || unpack.error || !fs.existsSync(path.join(root, 'build.gradle'))) fail('GODOT_ANDROID_RELEASE_TEMPLATE_ARCHIVE', 'cannot install Android Gradle template', true);
  fs.writeFileSync(path.join(isolated, 'android', '.build_version'), `${template.version}\n`); fs.writeFileSync(path.join(root, '.gdignore'), ''); return hardenGodotGradleTemplate(root);
}
function setIsolatedAndroidPreset(isolated, { packageId, format }) {
  const file = path.join(isolated, 'export_presets.cfg'); const text = fs.readFileSync(file, 'utf8'); const chunks = text.split(/(?=^\[preset(?:\.\d+)?\])/mu); let found = false;
  const set = (chunk, key, value) => { const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*=.*$`, 'mu'); return pattern.test(chunk) ? chunk.replace(pattern, `${key}=${value}`) : `${chunk.replace(/\s*$/u, '')}\n${key}=${value}\n`; };
  const output = chunks.map(chunk => { if (!/^name="Android"$/mu.test(chunk) || !/^platform="Android"$/mu.test(chunk)) return chunk; found = true; let result = set(chunk, 'gradle_build/export_format', String(format)); result = set(result, 'package/unique_name', JSON.stringify(packageId)); result = set(result, 'package/signed', 'true'); return result; }).join('');
  if (!found) fail('GODOT_ANDROID_RELEASE_PRESET', 'cannot locate Android preset in isolated source'); fs.writeFileSync(file, output, 'utf8');
}
function safeOutput(root, target) { if (!inside(root, target)) fail('GODOT_ANDROID_RELEASE_OUTPUT', 'release output escapes project root'); let current = fs.realpathSync(root); for (const segment of path.relative(current, target).split(path.sep).filter(Boolean)) { current = path.join(current, segment); const stat = fs.lstatSync(current, { throwIfNoEntry: false }); if (!stat) break; if (!stat.isDirectory() || stat.isSymbolicLink() || !inside(root, fs.realpathSync(current))) fail('GODOT_ANDROID_RELEASE_OUTPUT', 'release output has unsafe ancestor'); } }
function exportArtifact(godot, isolated, env, target, label, secrets) { const raw = String(process.env.FORGE_GODOT_ANDROID_RELEASE_TIMEOUT_MS || '600000'); const timeout = Number(raw); if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > MAX_TIMEOUT_MS) fail('GODOT_ANDROID_RELEASE_TIMEOUT', 'invalid Android release export timeout'); const run = runBounded(godot.command, [...godot.prefix, '--headless', '--path', isolated, '--export-release', 'Android', target], { cwd: isolated, timeoutMs: timeout, env }); if (run.timedOut) fail('GODOT_ANDROID_RELEASE_TIMEOUT', `${label} export timed out`, true); if (run.status !== 0 || run.error || !fs.lstatSync(target, { throwIfNoEntry: false })?.isFile()) fail('GODOT_ANDROID_RELEASE_EXPORT', `${label} export failed: ${outputTail(run, secrets)}`, /(?:template|sdk|java|gradle)/iu.test(outputTail(run, secrets))); }
function parseArgs(argv) { const result = { root: null, slug: null, version: null, json: false }; for (let index = 0; index < argv.length; index += 1) { const arg = argv[index]; if (arg === '--json') { result.json = true; continue; } if (arg === '--root') { if (!argv[index + 1]) fail('GODOT_ANDROID_RELEASE_USAGE', '--root requires a project path'); result.root = argv[++index]; continue; } if (arg.startsWith('-')) fail('GODOT_ANDROID_RELEASE_USAGE', `unknown option: ${arg}`); if (!result.slug) result.slug = arg; else if (!result.version) result.version = arg; else fail('GODOT_ANDROID_RELEASE_USAGE', 'too many positional arguments'); } if (!safeSlug(result.slug) || !VERSION.test(result.version) || !result.root) fail('GODOT_ANDROID_RELEASE_USAGE', 'usage: build-godot-android-release.mjs <slug> <vN.N.N> --root <project> [--json]'); return result; }

const parsed = parseArgs(process.argv.slice(2));
const result = { schemaVersion: 1, kind: 'forge.godot-android-production-build', status: 'failed', slug: parsed.slug, version: parsed.version, projectRoot: null, artifacts: [], manifest: null, issues: [] };
let temporary = null;
let publishStage = null;
let security = null;
let signingMaterial = null;
try {
  const root = fs.realpathSync(path.resolve(parsed.root)); result.projectRoot = root;
  let spec = androidContract(root, parsed.version);
  // Provisioning is idempotent. It creates the external identity only after
  // the owner configured the one-time publisher namespace; nothing private is
  // ever created inside the project.
  initializeProjectSecurity({ projectRoot: root });
  // First provisioning writes only the public identity. Re-read the immutable
  // source contract so its snapshot includes that identity binding.
  spec = androidContract(root, parsed.version);
  security = publicStatus({ projectRoot: root });
  const signing = materializeAndroidSigning({ projectRoot: root }); signingMaterial = signing;
  if (!signing || !PACKAGE_ID.test(String(signing.packageId || '')) || !/^[A-Za-z0-9._-]{1,128}$/u.test(String(signing.keyAlias || '')) || !/^[A-Fa-f0-9]{64}$/u.test(String(signing.certificateSha256 || '')) || typeof signing.storePassword !== 'string' || !signing.storePassword || typeof signing.keyPassword !== 'string' || !signing.keyPassword) fail('GODOT_ANDROID_RELEASE_VAULT', 'security vault has no valid Android release signing record');
  if (signing.storePassword !== signing.keyPassword) fail('GODOT_ANDROID_RELEASE_VAULT', 'Godot Android release requires equal keystore and key passwords');
  signing.certificateSha256 = signing.certificateSha256.toLowerCase();
  const keystore = regularExternalFile(signing.keystorePath, root);
  const godot = detectGodot(); const minimum = godotAndroidMinSdk(godot.version);
  if (!godot.testHarness && (!minimum || spec.minSdk < minimum)) fail('GODOT_ANDROID_RELEASE_SDK', `Godot ${godot.version} requires gradle_build/min_sdk >= ${minimum || 'known level'}`);
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-android-release-'));
  const template = templates(godot, temporary); const output = path.join(root, 'Release', parsed.slug, 'godot', 'android-release', parsed.version); safeOutput(root, output); if (fs.existsSync(output)) fail('GODOT_ANDROID_RELEASE_IMMUTABLE', `refusing to overwrite existing Android production release: ${parsed.version}`);
  const isolated = path.join(temporary, 'source'); copyGodotImplementation(spec.source, isolated); const runtime = isolatedGodotUserEnv(temporary); const sdk = String(process.env.FORGE_ANDROID_SDK_PATH || process.env.ANDROID_HOME || '').trim(); const java = String(process.env.FORGE_ANDROID_JAVA_PATH || process.env.JAVA_HOME || '').trim();
  if (!godot.testHarness && (!sdk || !java || !fs.existsSync(sdk) || !fs.existsSync(java))) fail('GODOT_ANDROID_RELEASE_TOOLCHAIN', 'Android release export requires existing FORGE_ANDROID_SDK_PATH and FORGE_ANDROID_JAVA_PATH outside the project', true);
  writeSettings(temporary, template.version, sdk || 'fixture-sdk', java || 'fixture-java'); const templateInfo = installAndroidTemplate(template, isolated); installTemplates(temporary, template); fs.writeFileSync(path.join(isolated, 'project.godot'), withAndroidEtc2AstcImport(fs.readFileSync(path.join(isolated, 'project.godot'), 'utf8')), 'utf8');
  const gradleHome = path.resolve(String(process.env.FORGE_GRADLE_USER_HOME || path.join(os.homedir(), '.gradle')).trim()); if (inside(root, gradleHome)) fail('GODOT_ANDROID_RELEASE_GRADLE_CACHE', 'Gradle cache must stay outside the project'); fs.mkdirSync(gradleHome, { recursive: true });
  const childEnv = { ...runtime, GRADLE_USER_HOME: gradleHome, GODOT_ANDROID_KEYSTORE_RELEASE_PATH: keystore, GODOT_ANDROID_KEYSTORE_RELEASE_USER: signing.keyAlias, GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD: signing.storePassword };
  if (godot.testHarness) childEnv.FORGE_GODOT_ANDROID_RELEASE_TEST_SIGN = '1';
  const secrets = [signing.storePassword, signing.keyPassword]; const stage = path.join(temporary, 'android'); fs.mkdirSync(stage); const apk = path.join(stage, `${parsed.slug}-${parsed.version}-release.apk`); const aab = path.join(stage, `${parsed.slug}-${parsed.version}-release.aab`);
  setIsolatedAndroidPreset(isolated, { packageId: signing.packageId, format: 0 }); exportArtifact(godot, isolated, childEnv, apk, 'Android release APK', secrets);
  setIsolatedAndroidPreset(isolated, { packageId: signing.packageId, format: 1 }); exportArtifact(godot, isolated, childEnv, aab, 'Android release AAB', secrets);
  const signatures = [apk, aab].map(file => ({ file, ...verifyAndroidProductionSignature(file, { minSdk: spec.minSdk }) }));
  for (const signature of signatures) { if (!signature.ok) fail(signature.code || 'GODOT_ANDROID_RELEASE_SIGNATURE', signature.message || 'Android release signing verification failed'); if (signature.certificateSha256 !== signing.certificateSha256) fail('GODOT_ANDROID_RELEASE_CERTIFICATE', 'Android release artifact certificate does not match the vault binding'); }
  if (snapshotTree(spec.source) !== spec.sourceHash) fail('GODOT_ANDROID_RELEASE_SOURCE_MUTATED', 'source changed during isolated export');
  // The final rename must stay on the project's volume. os.tmpdir() may be on
  // C: while the project lives on F:, where renameSync correctly fails EXDEV.
  // Keep secret-bearing build work in os.tmpdir(), but copy only verified
  // public artifacts into a same-volume sibling stage before the atomic rename.
  const outputParent = path.dirname(output); safeOutput(root, outputParent); fs.mkdirSync(outputParent, { recursive: true }); safeOutput(root, outputParent);
  publishStage = fs.mkdtempSync(path.join(outputParent, `.forge-stage-${parsed.slug}-${parsed.version}-`)); safeOutput(root, publishStage);
  for (const file of [apk, aab]) fs.copyFileSync(file, path.join(publishStage, path.basename(file)), fs.constants.COPYFILE_EXCL);
  const manifest = { schemaVersion: 1, kind: 'forge.godot-android-production-manifest', slug: parsed.slug, version: parsed.version, createdAt: new Date().toISOString(), engine: { name: 'godot', version: godot.version, testHarness: godot.testHarness }, sourceSnapshotSha256: spec.sourceHash, applicationIcon: { resource: spec.icon.resource, sha256: spec.icon.sha256 }, android: { packageId: signing.packageId, versionCode: spec.versionCode, versionName: spec.versionName, minSdk: spec.minSdk, targetSdk: spec.targetSdk, exportMode: 'release', signing: { certificateSha256: signing.certificateSha256, vaultId: security.vaultId || null }, customBuildTemplate: 'official-archive-installed-in-isolated-source', gradle: { ...templateInfo, cache: 'external-user-home' }, artifacts: [apk, aab].map(file => ({ file: path.basename(file), format: path.extname(file).slice(1), sha256: sha256File(file), bytes: fs.statSync(file).size, certificateSha256: signing.certificateSha256 })) } };
  fs.writeFileSync(path.join(publishStage, `${parsed.slug}-${parsed.version}.android-production-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  if (fs.existsSync(output)) fail('GODOT_ANDROID_RELEASE_IMMUTABLE', `refusing to overwrite existing Android production release: ${parsed.version}`); fs.renameSync(publishStage, output); publishStage = null;
  result.status = godot.testHarness ? 'test_harness' : 'local_verified'; result.artifacts = [apk, aab].map(file => path.join(output, path.basename(file))); result.manifest = path.join(output, `${parsed.slug}-${parsed.version}.android-production-manifest.json`);
} catch (error) { result.issues.push({ code: error.code || 'GODOT_ANDROID_RELEASE_INTERNAL', message: redact(error.message || String(error), signingMaterial ? [signingMaterial.storePassword, signingMaterial.keyPassword] : []).slice(0, 1000) }); result.status = error.environment ? 'environment_failure' : 'failed'; }
finally { if (signingMaterial) { signingMaterial.storePassword = ''; signingMaterial.keyPassword = ''; } if (publishStage && inside(result.projectRoot || '', publishStage) && path.basename(publishStage).startsWith(`.forge-stage-${parsed.slug}-${parsed.version}-`)) fs.rmSync(publishStage, { recursive: true, force: true }); if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
if (parsed.json) console.log(JSON.stringify(result, null, 2)); else console.log(`${result.status}: ${result.issues.map(item => item.code).join(', ') || result.artifacts.join(', ')}`);
process.exitCode = result.status === 'local_verified' ? 0 : result.status === 'environment_failure' ? 2 : 1;
