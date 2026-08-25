#!/usr/bin/env node
/** Verify the newest immutable Godot Windows release against trusted build and visual receipts. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validatePhase4VisualEvidence } from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { createGodotReleaseReceiptPayload, verifyGodotReleaseReceipt } from '../.claude/skills/status/references/godot-release-receipts.mjs';
import { readGodotExportContract, sha256File, snapshotTree } from './godot-export-contract.mjs';
import { writeGodotQaReport } from './godot-playtest-contract.mjs';
import { openSafeZip, readSafeZipEntry } from './lib/safe-zip.mjs';

const args = process.argv.slice(2);
const noReport = args.includes('--no-report');
const root = path.resolve(args.find(value => !value.startsWith('--')) || '.');
const report = {
  schemaVersion: 1,
  kind: 'forge.godot-release-verification',
  generatedAt: new Date().toISOString(),
  status: 'failed',
  manifest: null,
  version: null,
  testHarness: false,
  trustedBuildReceipt: false,
  issues: [],
};

function fail(code, message, environment = false) {
  const error = new Error(message); error.code = code; error.environment = environment; throw error;
}
function parseJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function parseJsonBuffer(buffer, label) { try { return JSON.parse(buffer.toString('utf8')); } catch { fail('GODOT_RELEASE_VERIFY_JSON', `${label} is invalid JSON`); } }
function normalize(value) { return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, ''); }
function inside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function digest(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function versionParts(value) { const match = String(value || '').match(/^v(\d+)\.(\d+)\.(\d+)$/u); return match ? match.slice(1).map(Number) : null; }
function compareVersion(left, right) {
  const a = versionParts(left); const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}
function phaseStartedAt() {
  const marker = parseJson(path.join(root, 'wiki', 'phases', 'phase-8.json'));
  return typeof marker?.startedAt === 'string' && Number.isFinite(Date.parse(marker.startedAt)) ? Date.parse(marker.startedAt) : null;
}
function findManifestFiles() {
  const realRoot = fs.realpathSync(root);
  const release = path.join(realRoot, 'Release');
  if (!fs.existsSync(release)) return [];
  if (fs.lstatSync(release).isSymbolicLink()) fail('GODOT_RELEASE_VERIFY_PATH', 'Release cannot be a symlink/junction');
  const files = [];
  let visited = 0;
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      visited += 1;
      if (visited > 10_000) fail('GODOT_RELEASE_VERIFY_PATH', 'Release tree is too large');
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('GODOT_RELEASE_VERIFY_PATH', `Release contains a symlink/junction: ${normalize(path.relative(realRoot, file))}`);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.release-manifest.json')) files.push(file);
    }
  };
  walk(release);
  return files;
}
function manifestCandidate(file) {
  const relative = normalize(path.relative(root, file));
  const match = relative.match(/^Release\/([a-z0-9][a-z0-9-]{1,63})\/godot\/windows\/(v\d+\.\d+\.\d+)\/([a-z0-9][a-z0-9-]{1,63})-(v\d+\.\d+\.\d+)\.release-manifest\.json$/u);
  if (!match || match[1] !== match[3] || match[2] !== match[4]) return null;
  const manifest = parseJson(file);
  if (manifest?.kind !== 'forge.godot-windows-release-manifest' || manifest.slug !== match[1] || manifest.version !== match[2]) return null;
  const payload = createGodotReleaseReceiptPayload({ manifestPath: relative, manifestSha256: sha256File(file), manifest });
  const receipt = verifyGodotReleaseReceipt({ projectRoot: root, slug: match[1], version: match[2], expectedPayload: payload });
  return { file, relative, slug: match[1], version: match[2], manifest, receipt };
}
function entryMap(zipFile) {
  const zip = openSafeZip(zipFile);
  for (const entry of zip.entries) {
    if (/(?:^|\/)(?:secret|token|credential|password|\.env(?:\.|$)|export_credentials)/iu.test(entry.name)) {
      fail('GODOT_RELEASE_VERIFY_SECRET', `credential-like file in release: ${entry.name}`);
    }
  }
  return { zip, entries: new Map(zip.entries.map(entry => [entry.name, entry])) };
}
function exactBinaryBundle(zipFile, slug, facts, variant) {
  const { zip, entries } = entryMap(zipFile);
  const expected = [`${slug}.exe`, `${slug}.pck`].sort();
  if (JSON.stringify([...entries.keys()].sort()) !== JSON.stringify(expected)) {
    fail('GODOT_RELEASE_VERIFY_BINARY_SET', `${variant} ZIP must contain only ${expected.join(' and ')}`);
  }
  const exe = readSafeZipEntry(zip, entries.get(`${slug}.exe`));
  const pck = readSafeZipEntry(zip, entries.get(`${slug}.pck`));
  if (!exe.length || !pck.length || digest(exe) !== facts?.exe || digest(pck) !== facts?.pck) {
    fail('GODOT_RELEASE_VERIFY_BINARY_HASH', `${variant} EXE/PCK hashes do not match the release manifest`);
  }
  return { exe: digest(exe), pck: digest(pck) };
}
function verifyMarketing(zipFile, manifest) {
  const { zip, entries } = entryMap(zipFile);
  if ([...entries.keys()].some(name => /\.(?:exe|pck)$/iu.test(name))) fail('GODOT_RELEASE_VERIFY_MARKETING_BINARY', 'marketing ZIP must not contain executable payloads');
  const mediaEntry = entries.get('phase4-media-manifest.json');
  if (!mediaEntry) fail('GODOT_RELEASE_VERIFY_MARKETING', 'marketing ZIP lacks its Phase 4 media manifest');
  const media = parseJsonBuffer(readSafeZipEntry(zip, mediaEntry, 2 * 1024 * 1024), 'marketing media manifest');
  if (media?.kind !== 'forge.godot-marketing-media' || !Array.isArray(media.files) || !media.files.length || media.files.length > 500) {
    fail('GODOT_RELEASE_VERIFY_MARKETING', 'marketing ZIP has an invalid Phase 4 media manifest');
  }
  const declared = new Set(['phase4-media-manifest.json']);
  for (const item of media.files) {
    const name = normalize(item?.file);
    if (!name || name !== item.file || declared.has(name) || !/^[a-f0-9]{64}$/u.test(String(item.sha256 || ''))
      || !Number.isInteger(item.bytes) || item.bytes < 1) fail('GODOT_RELEASE_VERIFY_MARKETING', 'marketing media entry is invalid or duplicated');
    const entry = entries.get(name);
    if (!entry || entry.size !== item.bytes || digest(readSafeZipEntry(zip, entry)) !== item.sha256) {
      fail('GODOT_RELEASE_VERIFY_MARKETING_HASH', `marketing media differs from manifest: ${name}`);
    }
    declared.add(name);
  }
  if (JSON.stringify([...declared].sort()) !== JSON.stringify([...entries.keys()].sort())) {
    fail('GODOT_RELEASE_VERIFY_MARKETING_SET', 'marketing ZIP contains undeclared files');
  }
  const visual = manifest.visualEvidence || {};
  const bound = media.visualEvidence || {};
  if ((bound.evidencePath || null) !== (visual.path || null)
    || (bound.captureReceiptId || null) !== (visual.captureReceiptId || null)
    || (bound.reviewReceiptId || null) !== (visual.reviewReceiptId || null)
    || (bound.proofReceiptId || null) !== (visual.proofReceiptId || null)) {
    fail('GODOT_RELEASE_VERIFY_MARKETING_BINDING', 'marketing ZIP is not bound to the release Phase 4 receipt identities');
  }
}

try {
  const contract = readGodotExportContract(root);
  const raw = findManifestFiles().map(manifestCandidate).filter(Boolean);
  if (!raw.length) fail('GODOT_RELEASE_VERIFY_MISSING', 'no strictly located Godot release manifest exists under Release/');
  const trusted = raw.filter(item => item.receipt.ok);
  if (!trusted.length) {
    const failure = raw.map(item => item.receipt).find(item => !item.ok);
    fail(failure?.code || 'GODOT_RELEASE_RECEIPT_MISSING', failure?.failure || 'no release has a trusted engine-owned build receipt');
  }
  trusted.sort((left, right) => compareVersion(left.version, right.version));
  const selected = trusted.at(-1);
  const manifest = selected.manifest;
  report.manifest = selected.relative;
  report.version = manifest.version;
  report.testHarness = manifest.engine?.testHarness === true;
  report.trustedBuildReceipt = true;

  if (manifest.schemaVersion !== 1 || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))
    || new Date(manifest.createdAt).toISOString() !== manifest.createdAt) fail('GODOT_RELEASE_VERIFY_MANIFEST', 'release manifest version/time is invalid');
  const startedAt = phaseStartedAt();
  if (startedAt !== null && Date.parse(manifest.createdAt) < startedAt) fail('GODOT_RELEASE_VERIFY_STALE', 'release predates the current Phase 8 run');
  if (manifest.engine?.name !== 'godot' || typeof manifest.engine.version !== 'string' || !manifest.engine.version.trim()
    || !/^[a-f0-9]{64}$/u.test(String(manifest.engine.executableSha256 || '')) || manifest.engine.testHarness === true) {
    fail(manifest.engine?.testHarness === true ? 'GODOT_RELEASE_VERIFY_TEST_HARNESS' : 'GODOT_RELEASE_VERIFY_ENGINE', 'release lacks trusted real Godot engine identity');
  }
  if (manifest.exports?.production?.flag !== '--export-release' || manifest.exports?.production?.mode !== 'release'
    || manifest.exports?.debug?.flag !== '--export-debug' || manifest.exports?.debug?.mode !== 'debug') {
    fail('GODOT_RELEASE_VERIFY_VARIANTS', 'release/debug export provenance is invalid');
  }
  if (manifest.preset?.name !== contract.contract.preset || manifest.preset?.target !== contract.contract.target
    || manifest.preset?.contractSha256 !== contract.hashes.contract || manifest.preset?.presetsSha256 !== contract.hashes.presets
    || manifest.preset?.projectSha256 !== contract.hashes.project) fail('GODOT_RELEASE_VERIFY_PRESET', 'release preset/config hashes differ from the current export contract');
  if (manifest.sourceSnapshotSha256 !== contract.hashes.source || snapshotTree(contract.implementationRoot) !== manifest.sourceSnapshotSha256) {
    fail('GODOT_RELEASE_VERIFY_SOURCE', 'release source snapshot is stale or changed');
  }

  const directory = path.dirname(selected.file);
  const binary = {};
  for (const variant of ['production', 'debug', 'marketing']) {
    const facts = manifest.artifacts?.[variant];
    const expectedName = variant === 'production' ? `${manifest.slug}-${manifest.version}.zip` : `${manifest.slug}-${manifest.version}-${variant}.zip`;
    if (!facts || facts.file !== expectedName) fail('GODOT_RELEASE_VERIFY_TRIO', `${variant} artifact identity is invalid`);
    const zip = path.join(directory, expectedName);
    let realZip;
    try { realZip = fs.realpathSync(zip); } catch { fail('GODOT_RELEASE_VERIFY_ZIP_HASH', `${variant} ZIP is missing`); }
    if (!inside(directory, realZip) || fs.lstatSync(zip).isSymbolicLink() || !fs.statSync(realZip).isFile()
      || fs.statSync(realZip).size < 1 || sha256File(realZip) !== facts.zipSha256) fail('GODOT_RELEASE_VERIFY_ZIP_HASH', `${variant} ZIP is missing or differs from the manifest`);
    if (variant === 'marketing') verifyMarketing(realZip, manifest);
    else binary[variant] = exactBinaryBundle(realZip, manifest.slug, facts, variant);
  }
  if (binary.production.exe === binary.debug.exe && binary.production.pck === binary.debug.pck) fail('GODOT_RELEASE_VERIFY_VARIANTS', 'production and debug payloads are byte-identical');

  const visual = validatePhase4VisualEvidence({ root });
  if (!visual.ok) fail('GODOT_RELEASE_VERIFY_VISUAL', `current Phase 4 evidence failed: ${visual.failures.slice(0, 3).join('; ')}`);
  if (manifest.visualEvidence?.path !== visual.evidencePath || manifest.visualEvidence?.captureReceiptId !== visual.captureReceiptId
    || manifest.visualEvidence?.reviewReceiptId !== visual.reviewReceiptId || manifest.visualEvidence?.proofReceiptId !== visual.proofReceiptId
    || manifest.visualEvidence?.fixture === true) fail('GODOT_RELEASE_VERIFY_VISUAL_BINDING', 'release is not bound to the current trusted Phase 4 receipts');

  report.status = 'passed';
  report.artifacts = ['production', 'debug', 'marketing'];
  report.sourceSnapshotSha256 = manifest.sourceSnapshotSha256;
  report.receipt = { id: `${manifest.slug}/${manifest.version}`, issuedAt: selected.receipt.receipt.issuedAt, engineOwned: true };
} catch (error) {
  report.status = error.environment === true ? 'environment_failure' : 'failed';
  report.issues.push({ code: error.code || 'GODOT_RELEASE_VERIFY', message: String(error.message).slice(0, 1000) });
}

try { if (!noReport) writeGodotQaReport(root, 'godot-release', report); }
catch (error) {
  report.status = 'failed';
  report.issues.push({ code: error.code || 'GODOT_RELEASE_VERIFY_REPORT', message: String(error.message).slice(0, 1000) });
}
console.log(JSON.stringify(report));
process.exitCode = report.status === 'passed' ? 0 : (report.status === 'environment_failure' ? 2 : 1);
