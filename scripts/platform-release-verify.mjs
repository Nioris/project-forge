#!/usr/bin/env node
/** Verify that every explicitly selected storefront has a matching, current release receipt. */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlatformRegistry, readPlatformTargets } from './platform-profile.mjs';
import { snapshotTree } from './godot-export-contract.mjs';
import {
  PlatformReleaseReceiptError,
  compareReleaseVersions,
  isPlatformReleaseReceiptFile,
  readPlatformReleaseReceipt,
} from './platform-release-receipt.mjs';

const LEVELS = ['local', 'submit'];
const ZIP_MAGICS = new Set(['504b0304', '504b0506', '504b0708']);
const EXTERNAL_VERIFIER_ID = /^[a-z][a-z0-9._-]*$/u;
const EXTERNAL_PROOF_KEYS = ['payload', 'proofPointer', 'proofSha256', 'verifierId'];
const EXTERNAL_PAYLOAD_KEYS = ['artifactFamily', 'candidateSha256', 'proofKind', 'proofReference', 'signingCertificateSha256', 'sourceSnapshotSha256', 'target', 'version'];
// Deliberately empty until an installed, reviewed target integration is added.
// This module never loads submission handlers from project files, environment, or CLI options.
const INSTALLED_EXTERNAL_VERIFIERS = Object.freeze({});

function failure(code, message, details = {}) {
  return { code, message, ...details };
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const handle = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let count;
    do {
      count = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (count) hash.update(buffer.subarray(0, count));
    } while (count);
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest('hex');
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function expectedProofKind(profile) {
  if (profile.artifactFamily === 'android') return 'android-production-submission';
  if (profile.artifactFamily === 'windows') return 'windows-store-submission';
  return profile.artifactFormat === 'https-static-bundle' ? 'hosted-deployment' : 'web-store-upload';
}

function externalHttpsPointer(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== '::1';
  } catch { return false; }
}

/**
 * Hash the exact proof payload returned by a target-specific external verifier.
 * This is intentionally a deterministic integrity check, not a local signature.
 * The only production path that can provide such payloads is an injected verifier;
 * the CLI deliberately has no way to load or configure one.
 */
export function hashExternalPlatformProof(payload) {
  if (!exactKeys(payload, EXTERNAL_PAYLOAD_KEYS)) return null;
  const canonical = {
    target: payload.target,
    version: payload.version,
    artifactFamily: payload.artifactFamily,
    candidateSha256: payload.candidateSha256,
    sourceSnapshotSha256: payload.sourceSnapshotSha256,
    proofKind: payload.proofKind,
    proofReference: payload.proofReference,
    signingCertificateSha256: payload.signingCertificateSha256,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function verifyExternalPlatformProof({ externalVerifiers, target, receipt, profile, androidSigning }) {
  const handlers = externalVerifiers === undefined ? INSTALLED_EXTERNAL_VERIFIERS : externalVerifiers;
  if (profile.submitVerifier?.status !== 'implemented') {
    throw Object.assign(new Error(`No installed submit verifier is implemented for ${target}`), {
      code: 'PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE',
    });
  }
  const adapter = handlers && Object.prototype.hasOwnProperty.call(handlers, target) ? handlers[target] : null;
  if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)
    || typeof adapter.id !== 'string' || !EXTERNAL_VERIFIER_ID.test(adapter.id)
    || adapter.id !== profile.submitVerifier.id || typeof adapter.verify !== 'function') {
    throw Object.assign(new Error(`No registered target-specific external uploader/verifier is available for ${target}`), {
      code: 'PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE',
    });
  }
  const evidence = adapter.verify({
    target,
    receipt,
    profile,
    candidate: receipt.candidate,
    expectedProofKind: expectedProofKind(profile),
    androidSigning,
  });
  if (!exactKeys(evidence, EXTERNAL_PROOF_KEYS)) {
    throw Object.assign(new Error(`External verifier ${adapter.id} returned an invalid proof envelope`), {
      code: 'PLATFORM_RELEASE_TRUST_PROOF_ENVELOPE',
    });
  }
  if (evidence.verifierId !== adapter.id) {
    throw Object.assign(new Error(`External proof verifier id does not match registered adapter for ${target}`), {
      code: 'PLATFORM_RELEASE_TRUST_VERIFIER_ID',
    });
  }
  if (!externalHttpsPointer(evidence.proofPointer)) {
    throw Object.assign(new Error(`External proof pointer for ${target} must be a non-local HTTPS URL`), {
      code: 'PLATFORM_RELEASE_TRUST_POINTER',
    });
  }
  const payload = evidence.payload;
  if (!exactKeys(payload, EXTERNAL_PAYLOAD_KEYS)) {
    throw Object.assign(new Error(`External proof payload for ${target} has an invalid shape`), {
      code: 'PLATFORM_RELEASE_TRUST_PAYLOAD',
    });
  }
  const expected = {
    target,
    version: receipt.version,
    artifactFamily: receipt.candidate.artifactFamily,
    candidateSha256: receipt.candidate.sha256,
    sourceSnapshotSha256: receipt.sourceSnapshotSha256,
    proofKind: expectedProofKind(profile),
    proofReference: receipt.delivery.reference,
    signingCertificateSha256: profile.artifactFamily === 'android' ? androidSigning?.certificateSha256 || null : null,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (payload[key] !== value) {
      throw Object.assign(new Error(`External proof payload ${key} does not bind to the selected ${target} release`), {
        code: key === 'signingCertificateSha256' ? 'PLATFORM_RELEASE_TRUST_SIGNING_MISMATCH' : 'PLATFORM_RELEASE_TRUST_PAYLOAD_BINDING',
      });
    }
  }
  if (!/^[a-f0-9]{64}$/u.test(evidence.proofSha256) || evidence.proofSha256 !== hashExternalPlatformProof(payload)) {
    throw Object.assign(new Error(`External proof hash for ${target} does not match its payload`), {
      code: 'PLATFORM_RELEASE_TRUST_PROOF_HASH',
    });
  }
  return evidence;
}

function hasZipMagic(file) {
  const handle = fs.openSync(file, 'r');
  const header = Buffer.alloc(4);
  try { return fs.readSync(handle, header, 0, 4, 0) === 4 && ZIP_MAGICS.has(header.toString('hex')); }
  finally { fs.closeSync(handle); }
}

function androidSignerTool() {
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
    || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null);
  if (!sdk || !fs.existsSync(path.join(sdk, 'build-tools'))) return null;
  const versions = fs.readdirSync(path.join(sdk, 'build-tools')).sort().reverse();
  for (const version of versions) {
    const tool = path.join(sdk, 'build-tools', version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
    if (fs.existsSync(tool)) return tool;
  }
  return null;
}
function javaTool(name) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', `${name}${suffix}`) : null,
    process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Android', 'Android Studio', 'jbr', 'bin', `${name}${suffix}`) : null,
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || `${name}${suffix}`;
}
function normalizeCertificateSha256(value) {
  const normalized = String(value || '').replace(/[^a-fA-F0-9]/gu, '').toLowerCase();
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
}
export function extractAndroidCertificateSha256(output) {
  const match = String(output || '').match(/(?:certificate\s+SHA-?256\s+digest|SHA256)\s*:\s*([A-Fa-f0-9:]{32,})/iu);
  return match ? normalizeCertificateSha256(match[1]) : null;
}
export function verifyAndroidProductionSignature(file) {
  const tool = androidSignerTool();
  const extension = path.extname(file).toLowerCase();
  if (extension === '.apk') {
    if (!tool) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_SIGNER_TOOL', message: 'APK submit verification requires the local apksigner tool' };
    const result = spawnSync(tool, ['verify', '--verbose', '--print-certs', file], { encoding: 'utf8', windowsHide: true });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.error && result.error.code === 'ENOENT') return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_SIGNER_TOOL', message: 'APK submit verification requires the local apksigner tool' };
    if (result.error || result.status !== 0) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_UNSIGNED', message: 'APK candidate is not verified as production-signed by apksigner' };
    const certificateSha256 = extractAndroidCertificateSha256(output);
    if (!certificateSha256) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_CERTIFICATE', message: 'apksigner did not report a SHA-256 signing certificate fingerprint' };
    if (/Android Debug/iu.test(output)) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_DEBUG_CERT', message: 'APK uses the standard Android Debug certificate' };
    return { ok: true, certificateSha256 };
  }
  if (extension === '.aab') {
    const jarsigner = javaTool('jarsigner'); const keytool = javaTool('keytool');
    const verify = spawnSync(jarsigner, ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', '-strict', '-certs', file], { encoding: 'utf8', windowsHide: true });
    if (verify.error && verify.error.code === 'ENOENT') return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_SIGNER_TOOL', message: 'AAB submit verification requires JDK jarsigner and keytool' };
    const verifyOutput = `${verify.stdout || ''}\n${verify.stderr || ''}`;
    // jarsigner -strict returns 4 for a structurally valid upload-key AAB when the self-signed
    // certificate has no public PKIX chain. It remains safe only with the explicit success marker;
    // unsigned, tampered and malformed archives do not emit that marker and still fail closed.
    const selfSignedWarning = /(?:self-signed|certificate chain.*(?:not trusted|invalid)|PKIX path building failed)/iu.test(verifyOutput);
    const verifiedSelfSigned = verify.status === 4 && /jar verified/iu.test(verifyOutput) && selfSignedWarning;
    if (verify.error || (verify.status !== 0 && !verifiedSelfSigned)) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_UNSIGNED', message: 'AAB candidate is not verified as production-signed by jarsigner' };
    const cert = spawnSync(keytool, ['-printcert', '-jarfile', file], { encoding: 'utf8', windowsHide: true });
    const output = `${verify.stdout || ''}\n${verify.stderr || ''}\n${cert.stdout || ''}\n${cert.stderr || ''}`;
    if (cert.error && cert.error.code === 'ENOENT') return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_SIGNER_TOOL', message: 'AAB submit verification requires JDK jarsigner and keytool' };
    if (cert.error || cert.status !== 0) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_CERTIFICATE', message: 'keytool could not read the AAB signing certificate' };
    const certificateSha256 = extractAndroidCertificateSha256(output);
    if (!certificateSha256) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_CERTIFICATE', message: 'keytool did not report a SHA-256 signing certificate fingerprint for the AAB' };
    if (/Android Debug/iu.test(output)) return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_DEBUG_CERT', message: 'AAB uses the standard Android Debug certificate' };
    return { ok: true, certificateSha256 };
  }
  return { ok: false, code: 'PLATFORM_RELEASE_ANDROID_FORMAT', message: 'Android submit verification requires an APK or AAB' };
}

function resolveGodotSourceRoot(projectRoot) {
  const contractFile = path.join(projectRoot, 'forge.godot.json');
  let contract;
  try { contract = JSON.parse(fs.readFileSync(contractFile, 'utf8')); }
  catch (error) { throw new Error(`forge.godot.json is missing or invalid: ${error.message}`); }
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) throw new Error('forge.godot.json must be an object');
  const projectPath = contract.projectPath === undefined ? '.' : contract.projectPath;
  if (typeof projectPath !== 'string' || !projectPath) throw new Error('forge.godot.json projectPath must be a non-empty string');
  const portable = projectPath.replaceAll('\\', '/');
  const segments = portable === '.' ? [] : portable.split('/');
  if ((portable !== '.' && (portable.startsWith('/') || /^[a-zA-Z]:/u.test(portable)))
    || segments.some(segment => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/u.test(segment))) {
    throw new Error('forge.godot.json projectPath must be a safe project-relative path');
  }
  const lexicalRoot = path.resolve(projectRoot, ...segments);
  if (!inside(projectRoot, lexicalRoot)) throw new Error('Godot projectPath escapes the project root');
  let cursor = projectRoot;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch { throw new Error(`Godot projectPath component is missing: ${segment}`); }
    if (stat.isSymbolicLink()) throw new Error(`Godot projectPath cannot contain a symlink or junction: ${segment}`);
    if (!stat.isDirectory()) throw new Error(`Godot projectPath component is not a directory: ${segment}`);
  }
  let realRoot;
  try { realRoot = fs.realpathSync(lexicalRoot); } catch (error) { throw new Error(`Godot projectPath is unavailable: ${error.message}`); }
  if (!inside(projectRoot, realRoot)) throw new Error('Godot projectPath real path escapes the project root');
  const projectFile = path.join(realRoot, 'project.godot');
  let projectStat;
  try { projectStat = fs.lstatSync(projectFile); } catch { throw new Error('Godot implementation root is missing project.godot'); }
  if (projectStat.isSymbolicLink() || !projectStat.isFile()) throw new Error('project.godot must be a regular file inside the Godot implementation root');
  return realRoot;
}

export function computePlatformSourceSnapshot(projectRoot, engine) {
  if (engine === 'web') return snapshotTree(projectRoot);
  if (engine === 'godot') return snapshotTree(resolveGodotSourceRoot(projectRoot));
  throw new Error(`Unsupported receipt engine: ${engine}`);
}

function discoverReceiptFiles(projectRoot, failures) {
  const release = path.join(projectRoot, 'Release');
  if (!fs.existsSync(release)) return [];
  const files = [];
  const pending = [{ directory: release, depth: 0 }];
  while (pending.length) {
    const { directory, depth } = pending.pop();
    if (depth > 12) {
      failures.push(failure('PLATFORM_RELEASE_RECEIPT_DEPTH', 'Release receipt discovery exceeded its maximum depth', { path: path.relative(projectRoot, directory).replaceAll('\\', '/') }));
      continue;
    }
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch (error) {
      failures.push(failure('PLATFORM_RELEASE_RECEIPT_SCAN', `Cannot read release directory: ${error.message}`, { path: path.relative(projectRoot, directory).replaceAll('\\', '/') }));
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      let info;
      try { info = fs.lstatSync(absolute); } catch { continue; }
      if (info.isSymbolicLink()) {
        if (entry.isDirectory() || isPlatformReleaseReceiptFile(entry.name)) {
          failures.push(failure('PLATFORM_RELEASE_RECEIPT_LINK', 'Receipt discovery does not follow symbolic links', { path: path.relative(projectRoot, absolute).replaceAll('\\', '/') }));
        }
        continue;
      }
      if (info.isDirectory()) pending.push({ directory: absolute, depth: depth + 1 });
      else if (info.isFile() && isPlatformReleaseReceiptFile(entry.name)) files.push(absolute);
      if (files.length > 4096) {
        failures.push(failure('PLATFORM_RELEASE_RECEIPT_LIMIT', 'Too many platform release receipts under Release/'));
        return files;
      }
    }
  }
  return files.sort();
}

function verifyCandidate({ projectRoot, receipt, profile, level, receiptFile, externalVerifiers, androidSignatureInspector }) {
  const failures = [];
  const target = receipt.target;
  const candidateLexical = path.resolve(projectRoot, receipt.candidate.path);
  if (!inside(projectRoot, candidateLexical)) {
    return [failure('PLATFORM_RELEASE_CANDIDATE_ESCAPE', 'Candidate path escapes the project', { target, receipt: receiptFile })];
  }
  if (!fs.existsSync(candidateLexical)) {
    return [failure('PLATFORM_RELEASE_CANDIDATE_MISSING', 'Candidate file is missing', { target, candidate: receipt.candidate.path })];
  }
  let candidateReal;
  try { candidateReal = fs.realpathSync(candidateLexical); }
  catch (error) { return [failure('PLATFORM_RELEASE_CANDIDATE_REALPATH', `Cannot resolve candidate: ${error.message}`, { target })]; }
  if (!inside(projectRoot, candidateReal)) {
    return [failure('PLATFORM_RELEASE_CANDIDATE_ESCAPE', 'Candidate real path escapes the project', { target, candidate: receipt.candidate.path })];
  }
  const stat = fs.statSync(candidateReal);
  if (!stat.isFile()) failures.push(failure('PLATFORM_RELEASE_CANDIDATE_TYPE', 'Candidate must be a regular file', { target }));
  if (stat.size !== receipt.candidate.bytes) failures.push(failure('PLATFORM_RELEASE_CANDIDATE_BYTES', 'Candidate byte count does not match the receipt', { target, expected: receipt.candidate.bytes, actual: stat.size }));
  if (stat.isFile()) {
    const actualHash = sha256File(candidateReal);
    if (actualHash !== receipt.candidate.sha256) failures.push(failure('PLATFORM_RELEASE_CANDIDATE_HASH', 'Candidate SHA-256 does not match the receipt', { target, expected: receipt.candidate.sha256, actual: actualHash }));
  }

  if (receipt.candidate.artifactFamily !== profile.artifactFamily) {
    failures.push(failure('PLATFORM_RELEASE_FAMILY', `Candidate family ${receipt.candidate.artifactFamily} does not match ${profile.artifactFamily}`, { target }));
  }
  if (!profile.compatibleEngines.includes(receipt.engine)) {
    failures.push(failure('PLATFORM_RELEASE_ENGINE', `Engine ${receipt.engine} is not compatible with target ${target}`, { target }));
  }

  const extension = path.extname(candidateReal).toLowerCase();
  const expectedFamilyExtension = profile.artifactFamily === 'android' ? ['.apk', '.aab'] : ['.zip'];
  if (!expectedFamilyExtension.includes(extension)) {
    failures.push(failure('PLATFORM_RELEASE_EXTENSION', `Candidate extension ${extension || '<none>'} does not match ${profile.artifactFamily}`, { target }));
  } else if (stat.isFile() && !hasZipMagic(candidateReal)) {
    failures.push(failure('PLATFORM_RELEASE_SIGNATURE', 'Candidate does not have a ZIP-family file signature', { target }));
  }

  const format = profile.artifactFormat;
  if (format === 'signed-aab' && extension !== '.aab') failures.push(failure('PLATFORM_RELEASE_FORMAT', 'Target requires a signed AAB candidate', { target }));
  if (format === 'signed-apk' && extension !== '.apk') failures.push(failure('PLATFORM_RELEASE_FORMAT', 'Target requires a signed APK candidate', { target }));
  if (format === 'signed-apk-or-aab' && !['.apk', '.aab'].includes(extension)) failures.push(failure('PLATFORM_RELEASE_FORMAT', 'Target requires an APK or AAB candidate', { target }));
  if (['zip-root-index-html', 'html5-build', 'https-static-bundle', 'steampipe-depot', 'vkplay-distribution'].includes(format) && extension !== '.zip') {
    failures.push(failure('PLATFORM_RELEASE_FORMAT', `Target format ${format} requires a ZIP candidate`, { target }));
  }

  if (level === 'submit') {
    let androidSigning = null;
    if (!['submit-ready', 'published'].includes(receipt.readiness)) failures.push(failure('PLATFORM_RELEASE_READINESS', `Submit verification rejects readiness ${receipt.readiness}`, { target }));
    if (receipt.delivery.status !== 'verified') failures.push(failure('PLATFORM_RELEASE_DELIVERY', 'Submit verification requires verified delivery', { target }));
    if (receipt.blockers.length !== 0) failures.push(failure('PLATFORM_RELEASE_BLOCKERS', 'Submit verification requires an empty blockers list', { target, blockers: receipt.blockers }));
    if (profile.artifactFamily === 'android') {
      const signing = (androidSignatureInspector || verifyAndroidProductionSignature)(candidateReal);
      if (!signing.ok) failures.push(failure(signing.code, signing.message, { target }));
      else androidSigning = signing;
    }
    for (const required of profile.requiredIntegrations) {
      const integration = receipt.integrations.find(item => item.id === required);
      if (!integration || integration.status !== 'passed') failures.push(failure('PLATFORM_RELEASE_INTEGRATION', `Required integration ${required} has not passed`, { target, integration: required }));
    }
    if (format === 'https-static-bundle') {
      let validHttps = false;
      try { validHttps = new URL(receipt.delivery.reference).protocol === 'https:'; } catch {}
      if (!validHttps) failures.push(failure('PLATFORM_RELEASE_HTTPS', 'Hosted static bundle requires a verified HTTPS delivery reference', { target }));
    }
    try {
      verifyExternalPlatformProof({ externalVerifiers, target, receipt, profile, androidSigning });
    } catch (error) {
      failures.push(failure(error.code || 'PLATFORM_RELEASE_TRUST_INTERNAL', error.message, { target }));
    }
  }
  return failures;
}

export function verifyPlatformReleases({ projectRoot = process.cwd(), level = 'local', registry = null, externalVerifiers, androidSignatureInspector } = {}) {
  if (!LEVELS.includes(level)) throw new TypeError(`Unsupported verification level: ${level}`);
  const absoluteRoot = path.resolve(projectRoot);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) throw new TypeError(`Project root is not a directory: ${absoluteRoot}`);
  const realRoot = fs.realpathSync(absoluteRoot);
  const installedRegistry = registry || loadPlatformRegistry();
  const failures = [];
  const targetSelection = readPlatformTargets(realRoot, { registry: installedRegistry });
  if (!targetSelection.configured) {
    return { ok: false, level, version: null, targets: [], failures: [failure('PLATFORM_RELEASE_TARGETS_MISSING', 'forge.targets.json is missing; release targets are never guessed')] };
  }

  const receiptFiles = discoverReceiptFiles(realRoot, failures);
  const receipts = [];
  for (const file of receiptFiles) {
    try {
      const receipt = readPlatformReleaseReceipt(file);
      if (!installedRegistry.profiles[receipt.target]) {
        failures.push(failure('PLATFORM_RELEASE_PROFILE', `Receipt names unknown target ${receipt.target}`, { receipt: path.relative(realRoot, file).replaceAll('\\', '/') }));
      } else {
        receipts.push({ receipt, file });
      }
    } catch (error) {
      failures.push(failure(error instanceof PlatformReleaseReceiptError ? error.code : 'PLATFORM_RELEASE_RECEIPT_READ', error.message, { receipt: path.relative(realRoot, file).replaceAll('\\', '/') }));
    }
  }

  const selected = [];
  for (const target of targetSelection.targets) {
    const candidates = receipts.filter(item => item.receipt.target === target);
    if (!candidates.length) {
      failures.push(failure('PLATFORM_RELEASE_RECEIPT_MISSING', `No platform release receipt exists for selected target ${target}`, { target }));
      continue;
    }
    candidates.sort((a, b) => compareReleaseVersions(b.receipt.version, a.receipt.version));
    const latestVersion = candidates[0].receipt.version;
    const latest = candidates.filter(item => item.receipt.version === latestVersion);
    if (latest.length !== 1) {
      failures.push(failure('PLATFORM_RELEASE_RECEIPT_AMBIGUOUS', `Multiple receipts claim ${target} ${latestVersion}`, { target, version: latestVersion }));
      continue;
    }
    selected.push({ target, profile: installedRegistry.profiles[target], ...latest[0] });
  }

  const versions = [...new Set(selected.map(item => item.receipt.version))];
  if (versions.length > 1) failures.push(failure('PLATFORM_RELEASE_MIXED_VERSION', 'Selected targets do not share the same latest version', { versions: Object.fromEntries(selected.map(item => [item.target, item.receipt.version])) }));
  const version = versions.length === 1 && selected.length === targetSelection.targets.length ? versions[0] : null;
  const sourceSnapshots = new Map();
  for (const item of selected) {
    if (sourceSnapshots.has(item.receipt.engine)) continue;
    try {
      sourceSnapshots.set(item.receipt.engine, { hash: computePlatformSourceSnapshot(realRoot, item.receipt.engine) });
    } catch (error) {
      sourceSnapshots.set(item.receipt.engine, { error });
      failures.push(failure('PLATFORM_RELEASE_SOURCE_CONTRACT', `Cannot compute ${item.receipt.engine} source snapshot: ${error.message}`, { engine: item.receipt.engine }));
    }
  }
  for (const item of selected) {
    const currentSource = sourceSnapshots.get(item.receipt.engine);
    if (currentSource?.hash && currentSource.hash !== item.receipt.sourceSnapshotSha256) {
      failures.push(failure('PLATFORM_RELEASE_SOURCE_STALE', 'Current source snapshot does not match the release receipt', {
        target: item.target,
        expected: item.receipt.sourceSnapshotSha256,
        actual: currentSource.hash,
      }));
    }
    failures.push(...verifyCandidate({
      projectRoot: realRoot,
      receipt: item.receipt,
      profile: item.profile,
      level,
      externalVerifiers,
      androidSignatureInspector,
      receiptFile: path.relative(realRoot, item.file).replaceAll('\\', '/'),
    }));
  }

  const targets = selected.map(item => ({
    target: item.target,
    version: item.receipt.version,
    engine: item.receipt.engine,
    artifactFamily: item.receipt.candidate.artifactFamily,
    candidate: item.receipt.candidate.path,
    readiness: item.receipt.readiness,
    receipt: path.relative(realRoot, item.file).replaceAll('\\', '/'),
  }));
  return { ok: failures.length === 0, level, version, targets, failures };
}

function parseArgs(argv) {
  let projectRoot = '.';
  let projectSeen = false;
  let level = 'local';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') continue;
    if (arg === '--level') {
      if (!argv[index + 1]) throw new TypeError('--level requires local or submit');
      level = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--level=')) { level = arg.slice('--level='.length); continue; }
    if (arg.startsWith('-')) throw new TypeError(`Unknown option: ${arg}`);
    if (projectSeen) throw new TypeError('Only one project root may be supplied');
    projectRoot = arg;
    projectSeen = true;
  }
  if (!LEVELS.includes(level)) throw new TypeError(`Unsupported verification level: ${level}`);
  return { projectRoot, level };
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    const result = verifyPlatformReleases(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    const result = { ok: false, level: null, version: null, targets: [], failures: [failure('PLATFORM_RELEASE_USAGE', error.message)] };
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
  }
}
