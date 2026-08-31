#!/usr/bin/env node
/**
 * Make immutable, target-specific storefront candidates from already-built artifacts.
 * This is deliberately a packager, not a publisher: it never uploads or claims a console state.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPlatformRegistry, readPlatformTargets } from './platform-profile.mjs';
import { readEngineProfile } from './engine-profile.mjs';
import { computePlatformSourceSnapshot } from './platform-release-verify.mjs';
import { validatePlatformReleaseReceipt } from './platform-release-receipt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/u;

function webSdkBootstrap({ target, id, source, promiseName, available, initialize, onReady = '' }) {
  return `<!-- forge-sdk:${id} --><script>(function(){var forced=new URLSearchParams(window.location.search).get("forgePlatform");var host=String(window.location.hostname||"").toLowerCase();var local=window.location.protocol==="file:"||host==="localhost"||host==="::1"||host==="[::1]"||/^127(?:\\.\\d{1,3}){3}$/.test(host);var standalone=forced==="standalone"||(forced!=="platform"&&local);var state=window.__forgePlatform={target:"${target}",mode:standalone?"standalone":"platform",initialized:false,reason:standalone?(forced==="standalone"?"forced-standalone":"local-preview"):"loading-sdk"};var settle;window["${promiseName}"]=new Promise(function(resolve){settle=resolve;});function message(error){return String(error&&error.message||error||"unknown error").slice(0,240);}function finish(value){settle(value);return value;}function failed(reason,error){state.reason=reason;if(error)state.error=message(error);finish(null);}function afterLoad(callback){if(document.readyState==="complete")setTimeout(callback,0);else window.addEventListener("load",callback,{once:true});}if(standalone){finish(null);return;}function initializeSdk(){if(!(${available})){failed("sdk-unavailable");return;}Promise.resolve().then(function(){return ${initialize};}).then(function(value){state.initialized=true;state.reason="initialized";${onReady}finish(value);},function(error){failed("init-failed",error);});}if(${available}){initializeSdk();return;}var sdk=document.createElement("script");sdk.src="${source}";sdk.async=false;sdk.onload=initializeSdk;sdk.onerror=function(error){failed("sdk-load-failed",error);};document.head.appendChild(sdk);})();</script>`;
}

const WEB_SDK = {
  yandex: {
    id: 'yandex-games-sdk',
    html: webSdkBootstrap({
      target: 'yandex', id: 'yandex-games-sdk', source: '/sdk.js', promiseName: '__forgeYandexGamesSdk',
      available: 'window.YaGames&&typeof window.YaGames.init==="function"', initialize: 'window.YaGames.init()',
      onReady: 'afterLoad(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){var loading=value&&value.features&&value.features.LoadingAPI;if(loading&&typeof loading.ready==="function"){try{loading.ready();state.ready=true;}catch(error){state.readyError=message(error);}}});});});',
    }),
  },
  vk: {
    id: 'vk-bridge',
    html: webSdkBootstrap({
      target: 'vk', id: 'vk-bridge', source: 'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js', promiseName: '__forgeVkBridge',
      available: 'window.vkBridge&&typeof window.vkBridge.send==="function"', initialize: 'window.vkBridge.send("VKWebAppInit")',
    }),
  },
  telegram: {
    id: 'telegram-mini-app-sdk',
    html: webSdkBootstrap({
      target: 'telegram', id: 'telegram-mini-app-sdk', source: 'https://telegram.org/js/telegram-web-app.js?63', promiseName: '__forgeTelegramWebApp',
      available: 'window.Telegram&&window.Telegram.WebApp&&typeof window.Telegram.WebApp.ready==="function"', initialize: '(window.Telegram.WebApp.ready(),window.Telegram.WebApp)',
    }),
  },
  crazygames: {
    id: 'crazygames-sdk',
    html: webSdkBootstrap({
      target: 'crazygames', id: 'crazygames-sdk', source: 'https://sdk.crazygames.com/crazygames-sdk-v3.js', promiseName: '__forgeCrazyGamesSdk',
      available: 'window.CrazyGames&&window.CrazyGames.SDK&&typeof window.CrazyGames.SDK.init==="function"', initialize: 'window.CrazyGames.SDK.init()',
    }),
  },
};

function fail(code, message, details = {}) { const error = new Error(message); error.code = code; error.details = details; throw error; }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function posix(value) { return value.replaceAll('\\', '/'); }
function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function outputPathFailure(message, details = {}) { fail('PLATFORM_PACKAGE_OUTPUT_LINK', message, details); }
function assertSafeOutputDirectory(projectRoot, directory, label, { create = false } = {}) {
  const root = fs.realpathSync(projectRoot);
  const lexical = path.resolve(directory);
  if (!inside(root, lexical)) outputPathFailure(`${label} escapes the project root`, { path: lexical });
  const relative = path.relative(root, lexical);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const link = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!link) {
      if (!create) outputPathFailure(`${label} is missing`, { path: current });
      // Parents have already been checked one segment at a time.  Never use a
      // recursive create here: it could silently traverse a newly introduced
      // junction/reparse point.
      fs.mkdirSync(current);
    }
    const currentLink = fs.lstatSync(current);
    if (currentLink.isSymbolicLink()) {
      outputPathFailure(`${label} cannot traverse a symbolic link, junction or reparse point`, { path: current });
    }
    if (!currentLink.isDirectory()) outputPathFailure(`${label} component is not a directory`, { path: current });
    let real;
    try { real = fs.realpathSync(current); }
    catch (error) { outputPathFailure(`${label} cannot resolve`, { path: current, error: error.message }); }
    if (!inside(root, real)) outputPathFailure(`${label} real path escapes the project root`, { path: current, real });
  }
  return lexical;
}
function assertSafeOutputDestination(projectRoot, destination, label) {
  const root = fs.realpathSync(projectRoot);
  const lexical = path.resolve(destination);
  if (!inside(root, lexical)) outputPathFailure(`${label} escapes the project root`, { path: lexical });
  const link = fs.lstatSync(lexical, { throwIfNoEntry: false });
  if (!link) return lexical;
  if (link.isSymbolicLink()) outputPathFailure(`${label} cannot be a symbolic link, junction or reparse point`, { path: lexical });
  return lexical;
}
function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) fail('PLATFORM_PACKAGE_ARCHIVE', `${label} failed`, { command, args, stderr: (result.stderr || result.error?.message || '').trim() });
  return result.stdout;
}
function ensureRegularFile(value, label) {
  const file = path.resolve(value);
  let stat; let linkStat;
  try { stat = fs.statSync(file); linkStat = fs.lstatSync(file); } catch { fail('PLATFORM_PACKAGE_INPUT_MISSING', `${label} is missing: ${file}`); }
  if (!stat.isFile() || linkStat.isSymbolicLink()) fail('PLATFORM_PACKAGE_INPUT_TYPE', `${label} must be a non-linked regular file: ${file}`);
  return fs.realpathSync(file);
}

function readJsonManifest(file, label) {
  const manifestFile = ensureRegularFile(file, label);
  let value;
  try { value = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); }
  catch (error) { fail('PLATFORM_PACKAGE_BASE_MANIFEST', `${label} is invalid JSON: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PLATFORM_PACKAGE_BASE_MANIFEST', `${label} must contain an object`);
  return { file: manifestFile, value };
}

function requireGodotBaseProvenance(projectRoot, inputs, slug, version, sourceSnapshot) {
  const supplied = ['web', 'androidApk', 'androidAab', 'windows'].filter(field => inputs[field]);
  for (const field of supplied) {
    if (!inside(projectRoot, inputs[field])) fail('PLATFORM_PACKAGE_BASE_ESCAPE', `${field} base artifact must stay inside the project: ${inputs[field]}`);
  }

  const assertCommon = (manifest, label, kind) => {
    if (manifest.schemaVersion !== 1 || manifest.kind !== kind || manifest.slug !== slug || manifest.version !== version) {
      fail('PLATFORM_PACKAGE_BASE_MANIFEST', `${label} does not match ${slug} ${version}`);
    }
    if (manifest.engine?.name !== 'godot' || manifest.engine?.testHarness === true) {
      fail('PLATFORM_PACKAGE_BASE_MANIFEST', `${label} must describe a real Godot build`);
    }
    if (manifest.sourceSnapshotSha256 !== sourceSnapshot) {
      fail('PLATFORM_PACKAGE_BASE_STALE', `${label} source snapshot does not match the current Godot source`, {
        expected: sourceSnapshot, actual: manifest.sourceSnapshotSha256 || null,
      });
    }
  };

  let multi = null;
  if (inputs.web || inputs.androidApk || inputs.androidAab) {
    const anchor = inputs.web || inputs.androidApk || inputs.androidAab;
    const suffix = inputs.web ? 'web' : 'android';
    const file = path.join(path.dirname(anchor), `${slug}-${version}.${suffix}-manifest.json`);
    multi = readJsonManifest(file, `${suffix} base manifest`).value;
    assertCommon(multi, `${suffix} base manifest`, 'forge.godot-web-android-local-manifest');
  }
  if (inputs.web) {
    if (multi.web?.artifact !== path.basename(inputs.web) || multi.web?.sha256 !== sha256(inputs.web)) {
      fail('PLATFORM_PACKAGE_BASE_HASH', 'Web artifact does not match its trusted base manifest');
    }
  }
  for (const field of ['androidApk', 'androidAab']) {
    if (!inputs[field]) continue;
    const fact = multi.android?.artifacts?.find(item => item.file === path.basename(inputs[field]));
    if (!fact || fact.sha256 !== sha256(inputs[field]) || fact.bytes !== fs.statSync(inputs[field]).size) {
      fail('PLATFORM_PACKAGE_BASE_HASH', `${field} artifact does not match its trusted base manifest`);
    }
  }
  if (inputs.windows) {
    const file = path.join(path.dirname(inputs.windows), `${slug}-${version}.release-manifest.json`);
    const manifest = readJsonManifest(file, 'Windows base manifest').value;
    assertCommon(manifest, 'Windows base manifest', 'forge.godot-windows-release-manifest');
    if (manifest.artifacts?.production?.file !== path.basename(inputs.windows)
      || manifest.artifacts?.production?.zipSha256 !== sha256(inputs.windows)) {
      fail('PLATFORM_PACKAGE_BASE_HASH', 'Windows artifact does not match its trusted base manifest');
    }
  }
}
export function validateZipMemberNames(rawNames) {
  const members = [];
  for (const rawName of rawNames) {
    const raw = String(rawName || '').trim();
    if (!raw) continue;
    if (raw.includes('\\') || /[\u0000-\u001f\u007f]/u.test(raw)) {
      fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP contains an ambiguous or control-character path');
    }
    const item = raw.replace(/^(?:\.\/)+/u, '').replace(/\/+$/u, '');
    if (!item) continue;
    const parts = item.split('/');
    if (item.startsWith('/') || /^[A-Za-z]:/u.test(item) || parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
      fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP has an unsafe archive path');
    }
    members.push(item);
  }
  if (!members.length) fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP has an empty archive layout');
  return members;
}
function listZip(file) {
  const output = run('tar.exe', ['-tf', file], `Cannot inspect ${file}`);
  const members = validateZipMemberNames(output.split(/\r?\n/u));
  const verbose = run('tar.exe', ['-tvf', file], `Cannot inspect entry types in ${file}`)
    .split(/\r?\n/u).map(item => item.trimEnd()).filter(Boolean);
  if (verbose.some(item => !['-', 'd'].includes(item[0]))) {
    fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP may contain only regular files and directories');
  }
  if (!members.includes('index.html')) fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP must contain index.html at archive root');
  return members;
}
function unpackZip(file, directory) {
  listZip(file);
  fs.mkdirSync(directory, { recursive: true });
  run('tar.exe', ['-xf', file, '-C', directory], `Cannot unpack ${file}`);
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name); const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP must not contain links');
      const real = fs.realpathSync(absolute);
      if (!inside(directory, real)) fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP extracted outside its staging directory');
      if (stat.isDirectory()) pending.push(absolute);
      else if (!stat.isFile()) fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP may contain only regular files and directories');
    }
  }
  const index = path.join(directory, 'index.html');
  if (!fs.existsSync(index) || !fs.statSync(index).isFile()) fail('PLATFORM_PACKAGE_WEB_ARCHIVE', 'Web ZIP did not extract index.html at archive root');
}
function zipDirectory(directory, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  run('tar.exe', ['-a', '-c', '-f', output, '-C', directory, '.'], `Cannot package ${output}`);
  listZip(output);
}
function injectWebBootstrap(indexFile, target) {
  const bootstrap = WEB_SDK[target];
  if (!bootstrap) return null;
  let html = fs.readFileSync(indexFile, 'utf8');
  if (html.includes(`forge-sdk:${bootstrap.id}`)) fail('PLATFORM_PACKAGE_WEB_BOOTSTRAP', `Base Web ZIP already contains a target-specific ${bootstrap.id} marker`);
  const location = /<\/head\s*>/iu;
  html = location.test(html) ? html.replace(location, `${bootstrap.html}</head>`) : `${bootstrap.html}\n${html}`;
  fs.writeFileSync(indexFile, html, 'utf8');
  if (!fs.readFileSync(indexFile, 'utf8').includes(`forge-sdk:${bootstrap.id}`)) fail('PLATFORM_PACKAGE_WEB_BOOTSTRAP', `Cannot verify injected ${bootstrap.id} marker`);
  return { id: bootstrap.id, status: 'blocked', evidence: `candidate:index.html#forge-sdk:${bootstrap.id};runtime=external-verification-required` };
}
function candidateExtension(profile, inputs) {
  if (profile.artifactFamily === 'web' || profile.artifactFamily === 'windows') return '.zip';
  if (profile.artifactFormat === 'signed-aab') return '.aab';
  if (profile.artifactFormat === 'signed-apk') return '.apk';
  return inputs.androidApk ? '.apk' : '.aab';
}
function sourceFor(profile, inputs) {
  if (profile.artifactFamily === 'web') return inputs.web;
  if (profile.artifactFamily === 'windows') return inputs.windows;
  if (profile.artifactFormat === 'signed-aab') return inputs.androidAab;
  if (profile.artifactFormat === 'signed-apk') return inputs.androidApk;
  return inputs.androidApk || inputs.androidAab;
}
function parseArgs(argv) {
  const result = { projectRoot: null, slug: null, version: null, web: null, androidApk: null, androidAab: null, windows: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') { result.json = true; continue; }
    const field = { '--slug': 'slug', '--version': 'version', '--web': 'web', '--android-apk': 'androidApk', '--android-aab': 'androidAab', '--windows': 'windows' }[arg];
    if (field) { if (!argv[i + 1]) fail('PLATFORM_PACKAGE_USAGE', `${arg} requires a value`); result[field] = argv[++i]; continue; }
    if (arg.startsWith('-')) fail('PLATFORM_PACKAGE_USAGE', `Unknown option: ${arg}`);
    if (result.projectRoot) fail('PLATFORM_PACKAGE_USAGE', 'Only one project root may be supplied');
    result.projectRoot = arg;
  }
  if (!result.projectRoot || !result.slug || !result.version) fail('PLATFORM_PACKAGE_USAGE', 'Usage: package-platform-release-matrix.mjs <project-root> --slug <slug> --version vX.Y.Z [--web <base.zip>] [--android-apk <base.apk>] [--android-aab <base.aab>] [--windows <base.zip>] [--json]');
  if (!SLUG.test(result.slug)) fail('PLATFORM_PACKAGE_SLUG', 'slug must be lowercase ASCII letters, digits and hyphens');
  if (!VERSION.test(result.version)) fail('PLATFORM_PACKAGE_VERSION', 'version must be vMAJOR.MINOR.PATCH');
  result.projectRoot = path.resolve(result.projectRoot);
  for (const field of ['web', 'androidApk', 'androidAab', 'windows']) if (result[field]) result[field] = ensureRegularFile(result[field], `--${field.replace(/[A-Z]/gu, value => `-${value.toLowerCase()}`)}`);
  return result;
}

export function packagePlatformReleaseMatrix(options) {
  const inputs = { ...options };
  const projectRoot = fs.realpathSync(inputs.projectRoot);
  const registry = loadPlatformRegistry();
  const selection = readPlatformTargets(projectRoot, { registry });
  if (!selection.configured) fail('PLATFORM_PACKAGE_TARGETS', 'forge.targets.json is required; targets are never guessed');
  const engine = readEngineProfile(projectRoot).engine;
  if (!['web', 'godot'].includes(engine)) fail('PLATFORM_PACKAGE_ENGINE', `Unsupported receipt engine: ${engine}`);
  const snapshot = computePlatformSourceSnapshot(projectRoot, engine);
  const normalized = { ...inputs };
  for (const field of ['web', 'androidApk', 'androidAab', 'windows']) if (normalized[field]) normalized[field] = ensureRegularFile(normalized[field], field);
  if (engine === 'godot') requireGodotBaseProvenance(projectRoot, normalized, inputs.slug, inputs.version, snapshot);
  for (const target of selection.targets) {
    const profile = registry.profiles[target];
    if (!profile.compatibleEngines.includes(engine)) fail('PLATFORM_PACKAGE_ENGINE', `Target ${target} is not compatible with ${engine}`);
    if (!sourceFor(profile, normalized)) fail('PLATFORM_PACKAGE_INPUT_REQUIRED', `Target ${target} requires a ${profile.artifactFamily} base artifact`);
  }

  const relativeBase = `Release/${inputs.slug}/storefront/${inputs.version}`;
  const finalRoot = path.join(projectRoot, ...relativeBase.split('/'));
  const parent = path.dirname(finalRoot);
  assertSafeOutputDirectory(projectRoot, parent, 'Storefront release parent', { create: true });
  assertSafeOutputDestination(projectRoot, finalRoot, 'Storefront release matrix');
  if (fs.existsSync(finalRoot)) fail('PLATFORM_PACKAGE_IMMUTABLE', `Release matrix already exists: ${posix(path.relative(projectRoot, finalRoot))}`);
  const stage = fs.mkdtempSync(path.join(parent, `.forge-stage-${inputs.slug}-${inputs.version}-`));
  assertSafeOutputDirectory(projectRoot, stage, 'Storefront release staging directory');
  const targets = [];
  try {
    for (const target of selection.targets) {
      const profile = registry.profiles[target];
      const directory = path.join(stage, target);
      fs.mkdirSync(directory, { recursive: true });
      const extension = candidateExtension(profile, normalized);
      const fileName = `${inputs.slug}-${inputs.version}-${target}${extension}`;
      const candidate = path.join(directory, fileName);
      const candidatePath = `${relativeBase}/${target}/${fileName}`;
      const source = sourceFor(profile, normalized);
      let integrations = [];
      if (profile.artifactFamily === 'web') {
        const unpacked = path.join(directory, 'bundle');
        unpackZip(source, unpacked);
        const integration = injectWebBootstrap(path.join(unpacked, 'index.html'), target);
        zipDirectory(unpacked, candidate);
        fs.rmSync(unpacked, { recursive: true, force: true });
        integrations = profile.requiredIntegrations.map(id => integration && id === integration.id ? integration : ({ id, status: 'blocked', evidence: null }));
      } else {
        fs.copyFileSync(source, candidate, fs.constants.COPYFILE_EXCL);
        integrations = profile.requiredIntegrations.map(id => ({ id, status: 'blocked', evidence: null }));
      }
      const integrationBlockers = integrations.filter(item => item.status !== 'passed').map(item => `integration:not-runtime-verified:${item.id}`);
      const receipt = validatePlatformReleaseReceipt({
        schemaVersion: 1, kind: 'forge.platform-release-receipt', target, version: inputs.version, engine,
        generatedAt: new Date().toISOString(), sourceSnapshotSha256: snapshot,
        candidate: { path: candidatePath, artifactFamily: profile.artifactFamily, sha256: sha256(candidate), bytes: fs.statSync(candidate).size },
        integrations,
        delivery: { status: 'blocked', reference: null, evidence: [] },
        readiness: 'external-blocked',
        blockers: [...profile.externalPrerequisites.map(item => `external-prerequisite:${item}`), ...integrationBlockers, 'delivery:not-verified'],
      });
      const receiptFile = path.join(directory, 'platform-release-receipt.json');
      fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      targets.push({ target, candidate: candidatePath, receipt: `${relativeBase}/${target}/platform-release-receipt.json`, artifactFamily: profile.artifactFamily, readiness: receipt.readiness });
    }
    assertSafeOutputDirectory(projectRoot, parent, 'Storefront release parent');
    assertSafeOutputDestination(projectRoot, finalRoot, 'Storefront release matrix');
    if (fs.existsSync(finalRoot)) fail('PLATFORM_PACKAGE_IMMUTABLE', `Release matrix already exists: ${posix(path.relative(projectRoot, finalRoot))}`);
    fs.renameSync(stage, finalRoot);
    assertSafeOutputDirectory(projectRoot, finalRoot, 'Storefront release matrix');
  } catch (error) {
    try { assertSafeOutputDirectory(projectRoot, stage, 'Storefront release staging directory'); fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    throw error;
  }
  return { ok: true, version: inputs.version, engine, output: relativeBase, targets };
}

function output(value, json) { if (json) console.log(JSON.stringify(value, null, 2)); else console.log(`Packaged ${value.targets.length} local-only storefront candidates: ${value.output}`); }
const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  let parsed;
  try { parsed = parseArgs(process.argv.slice(2)); output(packagePlatformReleaseMatrix(parsed), parsed.json); }
  catch (error) { const result = { ok: false, code: error.code || 'PLATFORM_PACKAGE_INTERNAL', message: error.message, details: error.details || {} }; console.log(JSON.stringify(result, null, 2)); process.exitCode = error.code === 'PLATFORM_PACKAGE_USAGE' ? 2 : 1; }
}
