#!/usr/bin/env node
/** Adversarial, offline regression checks for the immutable storefront packager. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packagePlatformReleaseMatrix, validateZipMemberNames } from './package-platform-release-matrix.mjs';
import { computePlatformSourceSnapshot, verifyPlatformReleases } from './platform-release-verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-storefront-package-'));
const passed = []; const failed = [];
function ok(value, message, detail = '') { if (value) passed.push(message); else failed.push(`${message}${detail ? `: ${detail}` : ''}`); }
function json(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function fixture(name, targets) {
  const root = path.join(temp, name); fs.mkdirSync(root, { recursive: true });
  json(path.join(root, 'forge.targets.json'), { schemaVersion: 1, kind: 'forge.target-selection', targets });
  json(path.join(root, 'forge.engine.json'), { schemaVersion: 1, kind: 'forge.engine-profile', engine: 'godot' });
  json(path.join(root, 'forge.godot.json'), { schemaVersion: 1, kind: 'forge.godot-project', projectPath: 'Game', scripting: 'gdscript' });
  fs.mkdirSync(path.join(root, 'Game'));
  fs.writeFileSync(path.join(root, 'Game', 'project.godot'), '[application]\nconfig/name="Fixture"\n'); fs.writeFileSync(path.join(root, 'Game', 'main.gd'), 'extends Node\n');
  return root;
}
function makeZip(file, files) { const source = fs.mkdtempSync(path.join(temp, 'zip-source-')); const archive = `${file}.zip`; try { fs.mkdirSync(path.dirname(file), { recursive: true }); for (const [name, text] of Object.entries(files)) { const dest = path.join(source, ...name.split('/')); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); } execFileSync('tar.exe', ['-a', '-c', '-f', archive, '-C', source, '.']); fs.copyFileSync(archive, file); } finally { fs.rmSync(source, { recursive: true, force: true }); fs.rmSync(archive, { force: true }); } }
function zipList(file) { return execFileSync('tar.exe', ['-tf', file], { encoding: 'utf8' }).replaceAll('\\', '/'); }
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function makeGodotBase(root, slug, version, { webFiles = { 'index.html': '<html><head><script src="assets/game.js"></script></head><body>game</body></html>', 'assets/game.js': 'console.log(1)' } } = {}) {
  const base = path.join(root, 'Release', slug, 'godot');
  const webDir = path.join(base, 'web', version); const androidDir = path.join(base, 'android', version); const windowsDir = path.join(base, 'windows', version);
  const web = path.join(webDir, `${slug}-${version}-web.zip`); const apk = path.join(androidDir, `${slug}-${version}-debug.apk`);
  const aab = path.join(androidDir, `${slug}-${version}-debug.aab`); const windows = path.join(windowsDir, `${slug}-${version}.zip`);
  makeZip(web, webFiles); makeZip(apk, { 'AndroidManifest.xml': 'fixture apk' });
  makeZip(aab, { 'base/manifest/AndroidManifest.xml': 'fixture aab' }); makeZip(windows, { 'Game.exe': 'fixture binary', 'Game.pck': 'fixture data' });
  const snapshot = computePlatformSourceSnapshot(root, 'godot');
  const multi = {
    schemaVersion: 1, kind: 'forge.godot-web-android-local-manifest', slug, version,
    engine: { name: 'godot', version: 'fixture', testHarness: false }, sourceSnapshotSha256: snapshot,
    web: { artifact: path.basename(web), sha256: hash(web) },
    android: { artifacts: [apk, aab].map(file => ({ file: path.basename(file), sha256: hash(file), bytes: fs.statSync(file).size })) },
  };
  json(path.join(webDir, `${slug}-${version}.web-manifest.json`), multi);
  json(path.join(androidDir, `${slug}-${version}.android-manifest.json`), multi);
  json(path.join(windowsDir, `${slug}-${version}.release-manifest.json`), {
    schemaVersion: 1, kind: 'forge.godot-windows-release-manifest', slug, version,
    engine: { name: 'godot', version: 'fixture', testHarness: false }, sourceSnapshotSha256: snapshot,
    artifacts: { production: { file: path.basename(windows), zipSha256: hash(windows) } },
  });
  return { web, apk, aab, windows };
}
function makeGodotProductionAndroidBase(root, slug, version) {
  const directory = path.join(root, 'Release', slug, 'godot', 'android-release', version);
  const apk = path.join(directory, `${slug}-${version}-release.apk`); const aab = path.join(directory, `${slug}-${version}-release.aab`);
  makeZip(apk, { 'AndroidManifest.xml': 'production fixture apk' }); makeZip(aab, { 'base/manifest/AndroidManifest.xml': 'production fixture aab' });
  const sourceSnapshotSha256 = computePlatformSourceSnapshot(root, 'godot');
  json(path.join(directory, `${slug}-${version}.android-production-manifest.json`), {
    schemaVersion: 1, kind: 'forge.godot-android-production-manifest', slug, version,
    engine: { name: 'godot', version: 'fixture', testHarness: false }, sourceSnapshotSha256,
    android: { packageId: 'com.forge.production', signing: { certificateSha256: 'a'.repeat(64), vaultId: 'public-vault-id' }, artifacts: [apk, aab].map(file => ({ file: path.basename(file), format: path.extname(file).slice(1), sha256: hash(file), bytes: fs.statSync(file).size, certificateSha256: 'a'.repeat(64) })) },
  });
  return { apk, aab };
}
try {
  const root = fixture('matrix', ['yandex', 'vk', 'telegram', 'crazygames', 'google-play', 'rustore', 'appgallery', 'taptap', 'steam', 'vkplay']);
  const { web, apk, aab, windows } = makeGodotBase(root, 'fixture-game', 'v1.2.3');
  const packaged = packagePlatformReleaseMatrix({ projectRoot: root, slug: 'fixture-game', version: 'v1.2.3', web, androidApk: apk, androidAab: aab, windows });
  ok(packaged.ok && packaged.targets.length === 10, 'packages every explicitly selected target');
  const local = verifyPlatformReleases({ projectRoot: root, level: 'local' });
  ok(local.ok && local.version === 'v1.2.3', 'fresh target matrix passes local verification', JSON.stringify(local.failures));
  const submit = verifyPlatformReleases({ projectRoot: root, level: 'submit' });
  ok(!submit.ok && submit.failures.some(item => item.code === 'PLATFORM_RELEASE_DELIVERY'), 'fresh target matrix cannot pretend it was submitted');
  for (const target of ['yandex', 'vk', 'telegram', 'crazygames']) {
    const candidate = path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', target, `fixture-game-v1.2.3-${target}.zip`);
    const index = execFileSync('tar.exe', ['-xOf', candidate, 'index.html'], { encoding: 'utf8' });
    const marker = target === 'yandex' ? 'yandex-games-sdk' : target === 'vk' ? 'vk-bridge' : target === 'telegram' ? 'telegram-mini-app-sdk' : 'crazygames-sdk';
    ok(index.includes(`forge-sdk:${marker}`), `${target} bundle contains its required bootstrap marker`);
    ok(index.includes('forgePlatform') && index.includes('local-preview') && index.includes('forced-standalone'), `${target} bundle has an explicit local/standalone preview path`);
    ok(index.includes('init-failed') && index.includes('sdk-load-failed'), `${target} bundle contains rejected-promise-safe SDK diagnostics`);
    if (target === 'yandex') {
      ok(index.includes('sdk.src="/sdk.js"'), 'Yandex archive uses the platform-relative current SDK loader');
      ok(index.includes('LoadingAPI') && index.includes('loading.ready') && index.includes('afterLoad'), 'Yandex bundle signals loading readiness only after SDK init and Web load');
    }
  }
  ok(zipList(path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'yandex', 'fixture-game-v1.2.3-yandex.zip')).includes('index.html'), 'web candidate keeps index.html at archive root');
  ok(zipList(path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'yandex', 'fixture-game-v1.2.3-yandex.zip')).includes('assets/game.js'), 'web candidate preserves valid nested asset directories');
  let unsafeNamesRejected = 0;
  for (const names of [['../escape'], ['C:/escape'], ['dir\\escape'], ['safe//escape']]) {
    try { validateZipMemberNames(names); } catch (error) { if (error.code === 'PLATFORM_PACKAGE_WEB_ARCHIVE') unsafeNamesRejected += 1; }
  }
  ok(unsafeNamesRejected === 4, 'archive member validation rejects traversal, drive, backslash and empty-segment paths');
  const google = path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'google-play', 'fixture-game-v1.2.3-google-play.aab');
  const rustore = path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'rustore', 'fixture-game-v1.2.3-rustore.apk');
  const appgallery = path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'appgallery', 'fixture-game-v1.2.3-appgallery.apk');
  const taptap = path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'taptap', 'fixture-game-v1.2.3-taptap.apk');
  ok(fs.existsSync(google) && fs.existsSync(rustore) && fs.existsSync(appgallery) && fs.existsSync(taptap),
    'Android mapping keeps Google Play on AAB and uses installable APKs for flexible/local targets');
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'steam', 'platform-release-receipt.json')));
  ok(receipt.readiness === 'external-blocked' && receipt.delivery.status === 'blocked' && receipt.blockers.includes('delivery:not-verified'), 'receipt defaults to honest external-blocked delivery');
  const yandexReceipt = JSON.parse(fs.readFileSync(path.join(root, 'Release', 'fixture-game', 'storefront', 'v1.2.3', 'yandex', 'platform-release-receipt.json')));
  ok(yandexReceipt.integrations.every(item => item.status === 'blocked') && yandexReceipt.blockers.some(item => item === 'integration:not-runtime-verified:yandex-games-sdk'), 'HTML marker never pretends external SDK runtime verification passed');
  let immutable = false; try { packagePlatformReleaseMatrix({ projectRoot: root, slug: 'fixture-game', version: 'v1.2.3', web, androidApk: apk, androidAab: aab, windows }); } catch (error) { immutable = error.code === 'PLATFORM_PACKAGE_IMMUTABLE'; }
  ok(immutable, 'existing release matrix is never overwritten');
  const production = fixture('production-android-base', ['google-play', 'rustore']); const productionBase = makeGodotProductionAndroidBase(production, 'production-game', 'v2.0.0');
  const productionPackaged = packagePlatformReleaseMatrix({ projectRoot: production, slug: 'production-game', version: 'v2.0.0', androidApk: productionBase.apk, androidAab: productionBase.aab });
  ok(productionPackaged.ok && productionPackaged.targets.length === 2, 'accepts the independent production-signed Android manifest as storefront provenance');
  const productionTampered = fixture('production-android-tampered', ['rustore']); const productionTamperedBase = makeGodotProductionAndroidBase(productionTampered, 'production-tampered', 'v2.0.0'); fs.appendFileSync(productionTamperedBase.apk, 'tamper');
  let productionTamperRejected = false; try { packagePlatformReleaseMatrix({ projectRoot: productionTampered, slug: 'production-tampered', version: 'v2.0.0', androidApk: productionTamperedBase.apk }); } catch (error) { productionTamperRejected = error.code === 'PLATFORM_PACKAGE_BASE_HASH'; }
  ok(productionTamperRejected, 'rejects a production Android artifact changed after its signed manifest');
  const bad = fixture('bad-web', ['yandex']); const noIndex = makeGodotBase(bad, 'bad-game', 'v1.0.0', { webFiles: { 'sub/index.html': 'wrong root' } }).web;
  let rejected = false; try { packagePlatformReleaseMatrix({ projectRoot: bad, slug: 'bad-game', version: 'v1.0.0', web: noIndex }); } catch (error) { rejected = error.code === 'PLATFORM_PACKAGE_WEB_ARCHIVE'; }
  ok(rejected && !fs.existsSync(path.join(bad, 'Release', 'bad-game', 'storefront', 'v1.0.0')), 'unsafe Web layout fails without a partial matrix');
  const missing = fixture('missing-input', ['taptap']); let missingRejected = false;
  try { packagePlatformReleaseMatrix({ projectRoot: missing, slug: 'missing-game', version: 'v1.0.0' }); } catch (error) { missingRejected = error.code === 'PLATFORM_PACKAGE_INPUT_REQUIRED'; }
  ok(missingRejected, 'target-specific base input is required rather than guessed');
  const stale = fixture('stale-base', ['yandex']); const staleBase = makeGodotBase(stale, 'stale-game', 'v1.0.0');
  fs.appendFileSync(path.join(stale, 'Game', 'main.gd'), '# changed after base build\n');
  let staleRejected = false;
  try { packagePlatformReleaseMatrix({ projectRoot: stale, slug: 'stale-game', version: 'v1.0.0', web: staleBase.web }); } catch (error) { staleRejected = error.code === 'PLATFORM_PACKAGE_BASE_STALE'; }
  ok(staleRejected && !fs.existsSync(path.join(stale, 'Release', 'stale-game', 'storefront', 'v1.0.0')), 'stale base binary cannot receive a receipt for newer source');
  const tampered = fixture('tampered-base', ['yandex']); const tamperedBase = makeGodotBase(tampered, 'tampered-game', 'v1.0.0');
  fs.appendFileSync(tamperedBase.web, 'tamper');
  let tamperedRejected = false;
  try { packagePlatformReleaseMatrix({ projectRoot: tampered, slug: 'tampered-game', version: 'v1.0.0', web: tamperedBase.web }); } catch (error) { tamperedRejected = error.code === 'PLATFORM_PACKAGE_BASE_HASH'; }
  ok(tamperedRejected, 'tampered base artifact is rejected against its trusted manifest');
  const linked = fixture('linked-output', ['yandex']); const linkedBase = makeGodotBase(linked, 'linked-game', 'v1.0.0');
  const external = fs.mkdtempSync(path.join(temp, 'external-release-'));
  const link = path.join(linked, 'Release', 'linked-game', 'storefront');
  let linkCreated = false;
  try {
    fs.symlinkSync(external, link, process.platform === 'win32' ? 'junction' : 'dir');
    linkCreated = true;
  } catch {}
  if (linkCreated) {
    let linkRejected = false;
    try { packagePlatformReleaseMatrix({ projectRoot: linked, slug: 'linked-game', version: 'v1.0.0', web: linkedBase.web }); } catch (error) { linkRejected = error.code === 'PLATFORM_PACKAGE_OUTPUT_LINK'; }
    ok(linkRejected && !fs.existsSync(path.join(external, 'v1.0.0')), 'release parent junction/symlink is rejected before staging or output writes');
  } else {
    // Some locked-down Windows environments prohibit junction creation. Keep
    // this explicit so the regression is not silently reported as exercised.
    ok(process.platform === 'win32', 'Windows junction regression is platform-blocked in this environment');
  }
} finally {
  for (const message of passed) console.log(`[OK] ${message}`); for (const message of failed) console.error(`[FAIL] ${message}`);
  fs.rmSync(temp, { recursive: true, force: true });
}
if (failed.length) { console.error(`Storefront packager regressions: ${failed.length} failed, ${passed.length} passed`); process.exit(1); }
console.log(`Storefront packager regressions: ${passed.length} passed`);
