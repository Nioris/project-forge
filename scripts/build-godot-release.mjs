#!/usr/bin/env node
/** Build immutable Windows Godot release/debug/marketing ZIPs from an isolated source copy. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePhase4VisualEvidence } from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { createGodotReleaseReceiptPayload, recordGodotReleaseReceipt } from '../.claude/skills/status/references/godot-release-receipts.mjs';
import { readGodotExportContract, safeSlug, sha256File, snapshotTree } from './godot-export-contract.mjs';
import { combinedOutput, runBounded } from './godot-visual-runtime.mjs';
import { isGodotRootCertificateWarning } from './lib/godot-output.mjs';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_FIXTURE_ROOT = path.join(SCRIPT_ROOT, 'fixtures', 'godot-release');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const rootIndex = args.indexOf('--root');
const explicitRoot = rootIndex >= 0 ? args[rootIndex + 1] : null;
const positional = args.filter((value, index) => !value.startsWith('--') && index !== rootIndex + 1);
const slug = positional[0];
const requested = positional[1] || null;
const projectRoot = path.resolve(explicitRoot || process.cwd());
const result = {
  schemaVersion: 1,
  kind: 'forge.godot-windows-release',
  status: 'failed',
  projectRoot,
  slug,
  version: null,
  artifacts: [],
  manifest: null,
  issues: [],
};
let environmentFailure = false;
let temp = null;
const DEFAULT_EXPORT_TIMEOUT_MS = 600_000;
const MAX_EXPORT_TIMEOUT_MS = 600_000;
const MIN_EXPORT_TIMEOUT_MS = 120_000;
const MIN_TEST_EXPORT_TIMEOUT_MS = 250;

function issue(code, message, environment = false) {
  result.issues.push({ code, message: String(message).slice(0, 1000) });
  if (environment) environmentFailure = true;
}

function fail(code, message, environment = false) {
  issue(code, message, environment);
  const error = new Error(message);
  error.code = code;
  throw error;
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeOutputPath(root, target) {
  const canonicalRoot = fs.realpathSync(root);
  const resolvedTarget = path.resolve(target);
  if (!inside(canonicalRoot, resolvedTarget)) fail('GODOT_RELEASE_OUTPUT_PATH', 'release output escapes the project root');
  const relative = path.relative(canonicalRoot, resolvedTarget);
  let cursor = canonicalRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('GODOT_RELEASE_OUTPUT_PATH', `release output ancestor is not a real directory: ${segment}`);
    }
    const canonicalCursor = fs.realpathSync(cursor);
    if (!inside(canonicalRoot, canonicalCursor)) {
      fail('GODOT_RELEASE_OUTPUT_PATH', `release output ancestor escapes the project: ${segment}`);
    }
  }
}

function parseVersion(value) {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)\.(\d+)$/u);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function versionLabel(parts) {
  return `v${parts.join('.')}`;
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function chooseVersion(output, request) {
  const versions = [];
  const scan = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const match = entry.name.match(/(?:^v|-v)(\d+\.\d+\.\d+)(?:-debug|-marketing)?(?:\.zip|\.release-manifest\.json)?$/u);
      const parsed = match ? parseVersion(match[1]) : null;
      if (parsed) versions.push(parsed);
      if (entry.isDirectory() && !entry.isSymbolicLink()) scan(path.join(directory, entry.name));
    }
  };
  scan(output);
  versions.sort(compareVersion);
  const latest = versions.at(-1) || null;
  const parsedRequest = request ? parseVersion(request) : null;
  if (request && !parsedRequest) fail('GODOT_RELEASE_VERSION', 'version must be vN.N.N');
  let selected = parsedRequest || (latest ? [latest[0], latest[1], latest[2] + 1] : [1, 0, 0]);
  if (latest && compareVersion(selected, latest) <= 0) selected = [latest[0], latest[1], latest[2] + 1];
  return versionLabel(selected);
}

function copyFilter(source) {
  return !new Set(['.git', '.godot', '.mono', 'bin', 'obj', 'build', 'dist', 'release', 'node_modules']).has(path.basename(source).toLowerCase());
}

function detectGodot() {
  const rawShim = process.env.FORGE_ALLOW_TEST_HARNESS === '1'
    ? String(process.env.FORGE_GODOT_EXPORT_TEST_SHIM || '').trim()
    : '';
  let command = String(process.env.FORGE_GODOT_BIN || '').trim() || 'godot';
  let prefix = [];
  if (rawShim) {
    const shim = path.resolve(rawShim);
    if (!inside(RELEASE_FIXTURE_ROOT, shim) || !fs.existsSync(shim)) {
      fail('GODOT_RELEASE_TEST_SHIM', 'test exporter must stay inside the trusted release fixture directory');
    }
    command = process.execPath;
    prefix = [shim];
  }
  const run = spawnSync(command, [...prefix, '--version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  });
  if (run.status !== 0 || run.error) fail('GODOT_RELEASE_TOOLCHAIN', 'Godot editor is unavailable', true);
  let executable = command;
  if (!path.isAbsolute(executable) && !executable.includes(path.sep) && !executable.includes('/')) {
    const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [executable], {
      encoding: 'utf8', windowsHide: true, timeout: 10_000,
    });
    executable = String(lookup.stdout || '').split(/\r?\n/u).map(value => value.trim()).find(Boolean) || '';
  }
  try { executable = fs.realpathSync(path.resolve(executable)); }
  catch { fail('GODOT_RELEASE_TOOLCHAIN', 'Godot executable path cannot be resolved', true); }
  if (!fs.statSync(executable).isFile()) fail('GODOT_RELEASE_TOOLCHAIN', 'Godot executable is not a regular file', true);
  return {
    command,
    prefix,
    version: String(run.stdout || run.stderr || '').trim().split(/\r?\n/u).find(Boolean) || null,
    testHarness: prefix.length > 0,
    executableSha256: sha256File(executable),
  };
}

function execute(command, commandArgs, cwd, timeout = 180_000) {
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function resolveExportTimeoutMs(testHarness) {
  const raw = String(process.env.FORGE_GODOT_EXPORT_TIMEOUT_MS || '').trim();
  if (!raw) return DEFAULT_EXPORT_TIMEOUT_MS;
  const timeoutMs = Number(raw);
  const minimum = testHarness ? MIN_TEST_EXPORT_TIMEOUT_MS : MIN_EXPORT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < minimum || timeoutMs > MAX_EXPORT_TIMEOUT_MS) {
    fail('GODOT_RELEASE_TIMEOUT_CONFIG',
      `FORGE_GODOT_EXPORT_TIMEOUT_MS must be an integer from ${minimum} to ${MAX_EXPORT_TIMEOUT_MS}`, true);
  }
  return timeoutMs;
}

function outputTail(value, limit = 8) {
  return String(value || '').split(/\r?\n/u).map(line => line.trim()).filter(Boolean).slice(-limit);
}

function actionableExportOutput(run) {
  const parts = [];
  const stdout = outputTail(run.stdout);
  const stderr = outputTail(run.stderr);
  if (stdout.length) parts.push(`stdout: ${stdout.join(' | ')}`);
  if (stderr.length) parts.push(`stderr: ${stderr.join(' | ')}`);
  if (run.error?.message) parts.push(`runner: ${run.error.message}`);
  return (parts.join(' ; ') || 'no diagnostic output').slice(0, 850);
}

function stagedBinaryFacts(directory, slugValue, variant) {
  const exeName = `${slugValue}.exe`;
  const pckName = `${slugValue}.pck`;
  const consoleName = `${slugValue}.console.exe`;
  const expected = new Set([exeName, pckName, ...(variant === 'debug' ? [consoleName] : [])]);
  const actual = fs.readdirSync(directory).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    fail('GODOT_RELEASE_ARTIFACT_SET',
      `${variant} export contains an unexpected binary set: ${actual.join(', ') || '(empty)'}`);
  }
  const facts = {};
  for (const [key, name] of [['exe', exeName], ['pck', pckName], ['consoleExe', consoleName]]) {
    if (!expected.has(name)) continue;
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) {
      fail('GODOT_RELEASE_ARTIFACT', `${variant} export contains an invalid ${name}`);
    }
    facts[key] = sha256File(file);
  }
  return facts;
}

function zip(stage, output) {
  const command = process.platform === 'win32' ? 'tar.exe' : 'zip';
  const zipArgs = process.platform === 'win32' ? ['-a', '-cf', output, '.'] : ['-rq', output, '.'];
  const run = execute(command, zipArgs, stage);
  if (run.status !== 0 || run.error) fail('GODOT_RELEASE_ZIP', `${command} failed: ${run.stderr || run.stdout || run.error?.message}`, true);
}

function safeMediaFile(root, value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) return null;
  try {
    const canonicalRoot = fs.realpathSync(root);
    const file = fs.realpathSync(path.resolve(canonicalRoot, normalized));
    if (!inside(canonicalRoot, file) || !fs.statSync(file).isFile()) return null;
    return file;
  } catch {
    return null;
  }
}

function fixtureMedia(root) {
  const review = path.join(root, 'screens', 'review');
  if (!fs.existsSync(review)) fail('GODOT_RELEASE_MEDIA', 'Phase 4 Godot review media is missing');
  const manifests = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /manifest\.json$/iu.test(entry.name)) manifests.push(file);
    }
  };
  walk(review);
  const proof = manifests.filter(file => /proof/iu.test(path.basename(file))).sort().at(-1);
  const capture = manifests.filter(file => /capture/iu.test(path.basename(file))).sort().at(-1);
  if (!proof || !capture) fail('GODOT_RELEASE_MEDIA', 'capture and proof manifests are required');
  return { files: [capture, proof], evidence: { ok: true, fixture: true } };
}

function findCurrentMedia(root, testHarness) {
  if (testHarness) return fixtureMedia(root);
  const evidence = validatePhase4VisualEvidence({ root });
  if (!evidence.ok) fail('GODOT_RELEASE_VISUAL_EVIDENCE', `current Phase 4 visual evidence is not accepted: ${evidence.failures.slice(0, 3).join('; ')}`);
  const initial = [evidence.evidencePath, evidence.captureManifest, evidence.proofManifest].filter(Boolean);
  const files = new Set();
  let visited = 0;
  const visit = (value, depth = 0) => {
    visited += 1;
    if (depth > 20 || visited > 10_000) fail('GODOT_RELEASE_MEDIA_SHAPE', 'Phase 4 evidence graph is too deep or large');
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, depth + 1));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (['file', 'path', 'output', 'manifest', 'report'].includes(key) && typeof item === 'string') {
        const media = safeMediaFile(root, item);
        if (media) files.add(media);
      } else {
        visit(item, depth + 1);
      }
    }
  };
  for (const relative of initial) {
    const file = safeMediaFile(root, relative);
    if (!file) fail('GODOT_RELEASE_MEDIA', `accepted Phase 4 file is missing: ${relative}`);
    files.add(file);
    if (file.toLowerCase().endsWith('.json')) {
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('GODOT_RELEASE_MEDIA', `accepted Phase 4 JSON is invalid: ${relative}`); }
      visit(parsed);
    }
  }
  const allowed = new Set(['.json', '.md', '.png', '.jpg', '.jpeg', '.webp', '.avi', '.mp4']);
  const selected = [...files].filter(file => allowed.has(path.extname(file).toLowerCase()));
  if (selected.length < 3) fail('GODOT_RELEASE_MEDIA', 'accepted Phase 4 evidence did not resolve capture/proof media');
  const bytes = selected.reduce((total, file) => total + fs.statSync(file).size, 0);
  if (bytes > 1024 * 1024 * 1024) fail('GODOT_RELEASE_MEDIA_SIZE', 'marketing evidence exceeds 1 GiB');
  return { files: selected, evidence };
}

try {
  if (!safeSlug(slug)) fail('GODOT_RELEASE_USAGE', 'usage: build-godot-release.mjs <slug> [vN.N.N] [--root <project>]');
  const contract = readGodotExportContract(projectRoot);
  const canonicalProjectRoot = contract.root;
  result.projectRoot = canonicalProjectRoot;
  const godot = detectGodot();
  const exportTimeoutMs = resolveExportTimeoutMs(godot.testHarness);
  const output = godot.testHarness
    ? path.join(canonicalProjectRoot, 'qa', 'godot-release-test-output', slug, 'godot', 'windows')
    : path.join(canonicalProjectRoot, 'Release', slug, 'godot', 'windows');
  assertSafeOutputPath(canonicalProjectRoot, output);
  const version = chooseVersion(output, requested);
  result.version = version;
  const names = {
    production: `${slug}-${version}.zip`,
    debug: `${slug}-${version}-debug.zip`,
    marketing: `${slug}-${version}-marketing.zip`,
    manifest: `${slug}-${version}.release-manifest.json`,
  };
  const versionDirectory = path.join(output, version);
  if (fs.existsSync(versionDirectory)) fail('GODOT_RELEASE_IMMUTABLE', `refusing to overwrite existing release directory: ${version}`);
  const visual = findCurrentMedia(canonicalProjectRoot, godot.testHarness);
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-release-'));
  const isolated = path.join(temp, 'source');
  fs.cpSync(contract.implementationRoot, isolated, { recursive: true, filter: copyFilter });
  const stage = path.join(temp, 'stage');
  fs.mkdirSync(stage);
  const exeName = `${slug}.exe`;
  const binaryHashes = {};
  for (const [variant, flag] of [['production', '--export-release'], ['debug', '--export-debug']]) {
    const directory = path.join(stage, variant);
    fs.mkdirSync(directory, { recursive: true });
    const exe = path.join(directory, exeName);
    const run = runBounded(godot.command, [
      ...godot.prefix,
      '--headless',
      '--path', isolated,
      flag, contract.contract.preset, exe,
    ], { cwd: isolated, timeoutMs: exportTimeoutMs });
    const outputText = combinedOutput(run);
    const templatesMissing = /export templates?.*(?:missing|not found|unavailable)|no export template/iu.test(outputText);
    const pck = path.join(directory, `${slug}.pck`);
    const artifactsReady = fs.existsSync(exe) && fs.existsSync(pck)
      && fs.statSync(exe).size > 0 && fs.statSync(pck).size > 0;
    const trustedExportSuccess = run.status === 0 && !run.error && artifactsReady;
    const exportErrors = String(outputText).split(/\r?\n/u).map(line => line.trim()).filter(line =>
      /^(?:ERROR|SCRIPT ERROR):/iu.test(line)
      && !(trustedExportSuccess && isGodotRootCertificateWarning(line)));
    if (run.timedOut || run.error?.code === 'ETIMEDOUT') {
      fail('GODOT_RELEASE_EXPORT_TIMEOUT',
        `${variant} export timed out after ${exportTimeoutMs} ms; verify Godot startup/import locks and retry. ${actionableExportOutput(run)}`, true);
    }
    if (run.status !== 0 || run.error || exportErrors.length) {
      fail(templatesMissing ? 'GODOT_RELEASE_TEMPLATES' : 'GODOT_RELEASE_EXPORT',
        `${variant} export failed: ${exportErrors.length ? `${exportErrors[0]}; ` : ''}${actionableExportOutput(run)}`, templatesMissing);
    }
    if (!artifactsReady) {
      fail('GODOT_RELEASE_ARTIFACT', `${variant} export must contain non-empty EXE and PCK`);
    }
    binaryHashes[variant] = stagedBinaryFacts(directory, slug, variant);
  }
  if (binaryHashes.production.exe === binaryHashes.debug.exe && binaryHashes.production.pck === binaryHashes.debug.pck) {
    fail('GODOT_RELEASE_VARIANTS', 'production and debug exports are byte-identical; variant provenance is not credible');
  }

  const marketing = path.join(stage, 'marketing');
  fs.mkdirSync(marketing);
  const mediaEntries = [];
  for (const source of visual.files) {
    const relative = path.relative(canonicalProjectRoot, source).replaceAll('\\', '/');
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('GODOT_RELEASE_MEDIA', 'marketing file escapes the project');
    const destination = path.join(marketing, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    mediaEntries.push({ file: relative, sha256: sha256File(destination), bytes: fs.statSync(destination).size });
  }
  fs.writeFileSync(path.join(marketing, 'phase4-media-manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'forge.godot-marketing-media',
    visualEvidence: visual.evidence,
    files: mediaEntries,
  }, null, 2)}\n`);

  const stagedZips = {};
  for (const [variant, name] of [['production', names.production], ['debug', names.debug], ['marketing', names.marketing]]) {
    const target = path.join(temp, name);
    zip(path.join(stage, variant), target);
    if (fs.statSync(target).size < 1) fail('GODOT_RELEASE_ZIP', 'empty ZIP');
    stagedZips[variant] = target;
  }
  if (snapshotTree(contract.implementationRoot) !== contract.hashes.source) fail('GODOT_RELEASE_SOURCE_MUTATED', 'source changed during isolated export');

  const manifest = {
    schemaVersion: 1,
    kind: 'forge.godot-windows-release-manifest',
    slug,
    version,
    createdAt: new Date().toISOString(),
    engine: {
      name: 'godot', version: godot.version, executableSha256: godot.executableSha256,
      testHarness: godot.testHarness,
    },
    exports: {
      production: { mode: 'release', flag: '--export-release' },
      debug: { mode: 'debug', flag: '--export-debug' },
    },
    preset: {
      name: contract.contract.preset,
      target: contract.contract.target,
      contractSha256: contract.hashes.contract,
      presetsSha256: contract.hashes.presets,
      projectSha256: contract.hashes.project,
    },
    sourceSnapshotSha256: contract.hashes.source,
    visualEvidence: {
      path: visual.evidence.evidencePath || null,
      captureReceiptId: visual.evidence.captureReceiptId || null,
      reviewReceiptId: visual.evidence.reviewReceiptId || null,
      proofReceiptId: visual.evidence.proofReceiptId || null,
      fixture: visual.evidence.fixture === true,
    },
    artifacts: {
      production: {
        file: names.production,
        ...binaryHashes.production,
        zipSha256: sha256File(stagedZips.production),
      },
      debug: {
        file: names.debug,
        ...binaryHashes.debug,
        zipSha256: sha256File(stagedZips.debug),
      },
      marketing: {
        file: names.marketing,
        zipSha256: sha256File(stagedZips.marketing),
        media: mediaEntries,
      },
    },
  };
  const manifestStage = path.join(temp, names.manifest);
  fs.writeFileSync(manifestStage, `${JSON.stringify(manifest, null, 2)}\n`);

  const outputExisted = fs.existsSync(output);
  fs.mkdirSync(output, { recursive: true });
  assertSafeOutputPath(canonicalProjectRoot, output);
  const publishStage = path.join(output, `.forge-publish-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(publishStage, { recursive: false });
  try {
    for (const [variant, name] of [['production', names.production], ['debug', names.debug], ['marketing', names.marketing]]) {
      fs.copyFileSync(stagedZips[variant], path.join(publishStage, name), fs.constants.COPYFILE_EXCL);
    }
    fs.copyFileSync(manifestStage, path.join(publishStage, names.manifest), fs.constants.COPYFILE_EXCL);
    fs.renameSync(publishStage, versionDirectory);
  } catch (publishError) {
    if (fs.existsSync(versionDirectory)) {
      fail('GODOT_RELEASE_IMMUTABLE', `another build already published immutable release directory: ${version}`);
    }
    throw publishError;
  } finally {
    fs.rmSync(publishStage, { recursive: true, force: true });
    if (!outputExisted) {
      try { if (fs.readdirSync(output).length === 0) fs.rmdirSync(output); } catch {}
    }
  }

  result.manifest = path.join(versionDirectory, names.manifest);
  result.artifacts = Object.entries(names)
    .filter(([variant]) => variant !== 'manifest')
    .map(([variant, name]) => ({
      variant,
      file: path.join(versionDirectory, name),
      sha256: sha256File(path.join(versionDirectory, name)),
    }));
  if (godot.testHarness) {
    result.status = 'test_harness';
  } else {
    const manifestRelative = path.relative(canonicalProjectRoot, result.manifest).replaceAll('\\', '/');
    const receiptPayload = createGodotReleaseReceiptPayload({
      manifestPath: manifestRelative,
      manifestSha256: sha256File(result.manifest),
      manifest,
    });
    try {
      const receipt = recordGodotReleaseReceipt({ projectRoot: canonicalProjectRoot, slug, version, payload: receiptPayload });
      result.receipt = { id: `${slug}/${version}`, engineOwned: true, issuedAt: receipt.receipt.issuedAt };
      result.status = 'passed';
    } catch (receiptError) {
      fail(receiptError.code || 'GODOT_RELEASE_RECEIPT', receiptError.message);
    }
  }
} catch (error) {
  if (!result.issues.length) issue(error.code || 'GODOT_RELEASE_FAILED', error.message, environmentFailure);
  result.status = environmentFailure ? 'environment_failure' : 'failed';
} finally {
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else console.log(`[Forge] Godot release ${result.status}${result.version ? ` ${result.version}` : ''}`);
}
process.exitCode = result.status === 'passed' ? 0 : (result.status === 'environment_failure' ? 2 : 1);
