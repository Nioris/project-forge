#!/usr/bin/env node
/** Offline adversarial regressions for storefront release receipts and verification levels. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPlatformRegistry } from './platform-profile.mjs';
import { validatePlatformReleaseReceipt } from './platform-release-receipt.mjs';
import { snapshotTree } from './godot-export-contract.mjs';
import { computePlatformSourceSnapshot, hashExternalPlatformProof, verifyAndroidProductionSignature, verifyPlatformReleases } from './platform-release-verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY = path.join(ROOT, 'scripts', 'platform-release-verify.mjs');
const CHECK = path.join(ROOT, 'scripts', 'check-platform-release.mjs');
const registry = loadPlatformRegistry();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-platform-release-'));
const passed = [];
const failed = [];

function ok(condition, message, detail = '') {
  if (condition) passed.push(message);
  else failed.push(`${message}${detail ? `: ${detail}` : ''}`);
}
function json(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function zip(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]));
}
function jdkBin(name) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidates = [process.env.JAVA_HOME, process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Android', 'Android Studio', 'jbr') : null]
    .filter(Boolean).map(home => path.join(home, 'bin', `${name}${suffix}`));
  return candidates.find(file => fs.existsSync(file)) || null;
}
function runTool(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${label}: ${(result.stderr || result.stdout || result.error?.message || 'failed').trim()}`);
}
function makeAab(root, name, { signed = true, tamper = false } = {}) {
  const jar = jdkBin('jar'); const keytool = jdkBin('keytool'); const jarsigner = jdkBin('jarsigner');
  if (!jar || !keytool || !jarsigner) throw new Error('JDK jar/keytool/jarsigner are required for Android signing regression fixtures');
  const content = path.join(root, `${name}-content`); const aab = path.join(root, 'Release', 'google-play', 'v3.1.0', `${name}.aab`);
  fs.mkdirSync(content, { recursive: true }); fs.writeFileSync(path.join(content, 'AndroidManifest.xml'), '<manifest package="fixture"/>', 'utf8');
  fs.mkdirSync(path.dirname(aab), { recursive: true }); runTool(jar, ['--create', '--file', aab, '-C', content, '.'], 'create AAB fixture');
  if (signed) {
    const keystore = path.join(root, `${name}.p12`);
    runTool(keytool, ['-genkeypair', '-alias', 'upload', '-keystore', keystore, '-storetype', 'PKCS12', '-storepass', 'fixturepass', '-keypass', 'fixturepass', '-dname', 'CN=Release Upload,O=Forge Fixture,C=US', '-keyalg', 'RSA', '-validity', '2'], 'create self-signed upload key');
    runTool(jarsigner, ['-keystore', keystore, '-storetype', 'PKCS12', '-storepass', 'fixturepass', '-keypass', 'fixturepass', aab, 'upload'], 'sign AAB fixture');
  }
  if (tamper) { fs.writeFileSync(path.join(content, 'AndroidManifest.xml'), '<manifest package="tampered"/>', 'utf8'); runTool(jar, ['--update', '--file', aab, '-C', content, 'AndroidManifest.xml'], 'tamper signed AAB fixture'); }
  return aab;
}
function selection(root, targets) { json(path.join(root, 'forge.targets.json'), { schemaVersion: 1, kind: 'forge.target-selection', targets }); }
function receipt(root, target, version, options = {}) {
  const profile = registry.profiles[target];
  const extension = options.extension || (profile.artifactFamily === 'android' ? (profile.artifactFormat === 'signed-aab' ? '.aab' : '.apk') : '.zip');
  const candidate = options.candidate || `Release/${target}/${version}/${target}${extension}`;
  const candidateFile = path.join(root, ...candidate.split('/'));
  if (!options.skipCandidate) zip(candidateFile);
  const integrations = profile.requiredIntegrations.map(id => ({ id, status: options.integrationStatus || 'passed', evidence: options.integrationStatus === 'blocked' ? null : `verified:${id}` }));
  const value = {
    schemaVersion: 1,
    kind: 'forge.platform-release-receipt',
    target,
    version,
    engine: options.engine || 'godot',
    generatedAt: '2026-08-30T12:00:00.000Z',
    sourceSnapshotSha256: options.sourceSnapshotSha256 || computePlatformSourceSnapshot(root, options.engine || 'godot'),
    candidate: {
      path: candidate,
      artifactFamily: options.artifactFamily || profile.artifactFamily,
      sha256: options.sha256 || (options.skipCandidate ? 'b'.repeat(64) : sha256(candidateFile)),
      bytes: options.bytes || (options.skipCandidate ? 5 : fs.statSync(candidateFile).size),
    },
    integrations,
    delivery: {
      status: options.deliveryStatus || 'verified',
      reference: options.reference === undefined ? 'https://delivery.example.invalid/release' : options.reference,
      evidence: options.deliveryEvidence || ['delivery receipt'],
    },
    readiness: options.readiness || 'submit-ready',
    blockers: options.blockers || [],
  };
  const receiptFile = path.join(root, 'Release', target, version, `${target}.platform-release-receipt.json`);
  json(receiptFile, value);
  return { value, receiptFile, candidateFile };
}
function fixture(name) {
  const root = path.join(temp, name);
  fs.mkdirSync(root, { recursive: true });
  json(path.join(root, 'forge.godot.json'), { schemaVersion: 1, kind: 'forge.godot-project', projectPath: '.', scripting: 'gdscript' });
  fs.writeFileSync(path.join(root, 'project.godot'), '[application]\nconfig/name="Release fixture"\n', 'utf8');
  fs.writeFileSync(path.join(root, 'main.gd'), 'extends Node\n', 'utf8');
  return root;
}
function codes(result) { return result.failures.map(item => item.code); }
function submissionRegistry() {
  const copy = clone(registry);
  for (const profile of Object.values(copy.profiles)) profile.submitVerifier.status = 'implemented';
  return copy;
}
function proofKind(profile) {
  return profile.artifactFamily === 'android' ? 'android-production-submission'
    : profile.artifactFamily === 'windows' ? 'windows-store-submission'
      : profile.artifactFormat === 'https-static-bundle' ? 'hosted-deployment' : 'web-store-upload';
}
function testVerifier(target, mutate = null) {
  return {
    id: `${target}-submit-verifier`,
    verify({ receipt, profile, androidSigning }) {
      const payload = {
        target,
        version: receipt.version,
        artifactFamily: receipt.candidate.artifactFamily,
        candidateSha256: receipt.candidate.sha256,
        sourceSnapshotSha256: receipt.sourceSnapshotSha256,
        proofKind: proofKind(profile),
        proofReference: receipt.delivery.reference,
        signingCertificateSha256: profile.artifactFamily === 'android' ? androidSigning?.certificateSha256 || null : null,
      };
      const evidence = {
        verifierId: `${target}-submit-verifier`,
        proofPointer: `https://verifier.example.invalid/${target}/immutable-proof`,
        proofSha256: hashExternalPlatformProof(payload),
        payload,
      };
      return mutate ? mutate(evidence, payload) : evidence;
    },
  };
}
function testVerifiers(targets, mutateByTarget = {}) {
  return Object.fromEntries(targets.map(target => [target, testVerifier(target, mutateByTarget[target] || null)]));
}

try {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'platform-release-receipt.schema.json'), 'utf8'));
  ok(schema.additionalProperties === false && schema.required.length === 12, 'receipt schema preserves the v1 local receipt contract');
  ok(schema.properties.candidate.additionalProperties === false && schema.properties.delivery.additionalProperties === false && !schema.properties.trustedEvidence,
    'receipt schema rejects smuggled candidate, delivery and local trusted-evidence fields');

  const valid = fixture('valid');
  selection(valid, ['yandex', 'steam']);
  receipt(valid, 'yandex', 'v1.2.3');
  receipt(valid, 'steam', 'v1.2.3');
  const validSubmit = verifyPlatformReleases({ projectRoot: valid, level: 'submit', registry: submissionRegistry(), externalVerifiers: testVerifiers(['yandex', 'steam']) });
  ok(validSubmit.ok && validSubmit.version === 'v1.2.3' && validSubmit.targets.length === 2,
    'same-version target matrix passes submit verification', JSON.stringify(validSubmit.failures));
  const validLocal = verifyPlatformReleases({ projectRoot: valid, level: 'local', registry });
  ok(validLocal.ok, 'submit-ready receipts also satisfy local verification');
  const wrongVerifierId = verifyPlatformReleases({ projectRoot: valid, level: 'submit', registry: submissionRegistry(), externalVerifiers: {
    yandex: { ...testVerifier('yandex'), id: 'other-target-verifier' }, steam: testVerifier('steam'),
  } });
  ok(codes(wrongVerifierId).includes('PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE'),
    'registered verifier id must match the target descriptor');
  const wrongPointer = verifyPlatformReleases({ projectRoot: valid, level: 'submit', registry: submissionRegistry(), externalVerifiers: testVerifiers(['yandex', 'steam'], {
    yandex: evidence => { evidence.proofPointer = 'http://localhost/proof'; return evidence; },
  }) });
  ok(codes(wrongPointer).includes('PLATFORM_RELEASE_TRUST_POINTER'),
    'external proof pointer must be a non-local HTTPS reference');
  const wrongProofHash = verifyPlatformReleases({ projectRoot: valid, level: 'submit', registry: submissionRegistry(), externalVerifiers: testVerifiers(['yandex', 'steam'], {
    yandex: evidence => { evidence.proofSha256 = '0'.repeat(64); return evidence; },
  }) });
  ok(codes(wrongProofHash).includes('PLATFORM_RELEASE_TRUST_PROOF_HASH'),
    'external proof hash must bind the complete proof payload');
  const wrongPayload = verifyPlatformReleases({ projectRoot: valid, level: 'submit', registry: submissionRegistry(), externalVerifiers: testVerifiers(['yandex', 'steam'], {
    yandex: (evidence, payload) => { payload.target = 'steam'; evidence.proofSha256 = hashExternalPlatformProof(payload); return evidence; },
  }) });
  ok(codes(wrongPayload).includes('PLATFORM_RELEASE_TRUST_PAYLOAD_BINDING'),
    'external proof payload binds target, version, family, candidate, source, kind, reference and certificate');

  const manualSubmit = fixture('manual-submit');
  selection(manualSubmit, ['yandex']);
  receipt(manualSubmit, 'yandex', 'v1.2.3');
  const manualSubmitResult = verifyPlatformReleases({ projectRoot: manualSubmit, level: 'submit', registry });
  ok(!manualSubmitResult.ok && codes(manualSubmitResult).includes('PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE'),
    'hand-authored submit-ready receipt cannot pass without a registered target-specific external verifier');

  const legacy = fixture('legacy-local');
  selection(legacy, ['yandex']);
  receipt(legacy, 'yandex', 'v1.2.3');
  ok(verifyPlatformReleases({ projectRoot: legacy, level: 'local', registry }).ok,
    'legacy v1 receipt without external proof remains valid for local verification');
  const legacySubmit = verifyPlatformReleases({ projectRoot: legacy, level: 'submit', registry });
  ok(!legacySubmit.ok && codes(legacySubmit).includes('PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE'),
    'legacy v1 receipt without an external verifier fails submit closed');

  const oldRetained = receipt(valid, 'yandex', 'v1.2.2');
  ok(fs.existsSync(oldRetained.receiptFile) && verifyPlatformReleases({ projectRoot: valid, level: 'submit', registry: submissionRegistry(), externalVerifiers: testVerifiers(['yandex', 'steam']) }).ok,
    'retained older receipts do not override the highest target version');

  const missingManifest = fixture('missing-manifest');
  const missingManifestResult = verifyPlatformReleases({ projectRoot: missingManifest, level: 'local', registry });
  ok(!missingManifestResult.ok && codes(missingManifestResult).includes('PLATFORM_RELEASE_TARGETS_MISSING'),
    'missing forge.targets.json fails closed without guessing');

  const missingReceipt = fixture('missing-receipt');
  selection(missingReceipt, ['yandex', 'steam']);
  receipt(missingReceipt, 'yandex', 'v1.0.0');
  const missingReceiptResult = verifyPlatformReleases({ projectRoot: missingReceipt, level: 'local', registry });
  ok(!missingReceiptResult.ok && codes(missingReceiptResult).includes('PLATFORM_RELEASE_RECEIPT_MISSING'),
    'every selected target requires its own receipt');

  const mixed = fixture('mixed-version');
  selection(mixed, ['yandex', 'steam']);
  receipt(mixed, 'yandex', 'v2.0.0');
  receipt(mixed, 'steam', 'v1.9.9');
  const mixedResult = verifyPlatformReleases({ projectRoot: mixed, level: 'local', registry });
  ok(!mixedResult.ok && mixedResult.version === null && codes(mixedResult).includes('PLATFORM_RELEASE_MIXED_VERSION'),
    'mixed latest target versions are rejected');

  const crossFamily = fixture('cross-family');
  selection(crossFamily, ['yandex']);
  receipt(crossFamily, 'yandex', 'v1.0.0', { artifactFamily: 'windows' });
  const crossFamilyResult = verifyPlatformReleases({ projectRoot: crossFamily, level: 'local', registry });
  ok(!crossFamilyResult.ok && codes(crossFamilyResult).includes('PLATFORM_RELEASE_FAMILY'),
    'cross-family candidate substitution is rejected');

  const badHash = fixture('bad-hash');
  selection(badHash, ['yandex']);
  receipt(badHash, 'yandex', 'v1.0.0', { sha256: '0'.repeat(64) });
  const badHashResult = verifyPlatformReleases({ projectRoot: badHash, level: 'local', registry });
  ok(!badHashResult.ok && codes(badHashResult).includes('PLATFORM_RELEASE_CANDIDATE_HASH'),
    'candidate content changed after receipt is rejected');

  const staleSource = fixture('stale-source');
  selection(staleSource, ['yandex']);
  receipt(staleSource, 'yandex', 'v1.0.0');
  fs.appendFileSync(path.join(staleSource, 'main.gd'), '# source changed after release\n', 'utf8');
  const staleSourceResult = verifyPlatformReleases({ projectRoot: staleSource, level: 'local', registry });
  ok(!staleSourceResult.ok && codes(staleSourceResult).includes('PLATFORM_RELEASE_SOURCE_STALE'),
    'source edits after receipt invalidate the target release');

  const webSource = fixture('web-source');
  selection(webSource, ['yandex']);
  const webReceipt = receipt(webSource, 'yandex', 'v1.0.0', { engine: 'web' });
  ok(webReceipt.value.sourceSnapshotSha256 === snapshotTree(webSource)
    && verifyPlatformReleases({ projectRoot: webSource, level: 'local', registry }).ok,
  'web receipts snapshot the project root with canonical runtime-noise exclusions');

  const linkedGodot = fixture('linked-godot');
  selection(linkedGodot, ['yandex']);
  receipt(linkedGodot, 'yandex', 'v1.0.0');
  const linkedOutside = path.join(temp, 'linked-godot-outside');
  fs.mkdirSync(linkedOutside, { recursive: true });
  fs.writeFileSync(path.join(linkedOutside, 'project.godot'), '[application]\nconfig/name="Outside"\n', 'utf8');
  fs.symlinkSync(linkedOutside, path.join(linkedGodot, 'LinkedProject'), process.platform === 'win32' ? 'junction' : 'dir');
  json(path.join(linkedGodot, 'forge.godot.json'), { schemaVersion: 1, kind: 'forge.godot-project', projectPath: 'LinkedProject', scripting: 'gdscript' });
  const linkedGodotResult = verifyPlatformReleases({ projectRoot: linkedGodot, level: 'local', registry });
  ok(!linkedGodotResult.ok && codes(linkedGodotResult).includes('PLATFORM_RELEASE_SOURCE_CONTRACT'),
    'Godot source snapshot rejects a projectPath junction escape');

  const wrongSignature = fixture('wrong-signature');
  selection(wrongSignature, ['yandex']);
  const signatureFixture = receipt(wrongSignature, 'yandex', 'v1.0.0');
  fs.writeFileSync(signatureFixture.candidateFile, 'plain text', 'utf8');
  signatureFixture.value.candidate.bytes = fs.statSync(signatureFixture.candidateFile).size;
  signatureFixture.value.candidate.sha256 = sha256(signatureFixture.candidateFile);
  json(signatureFixture.receiptFile, signatureFixture.value);
  const wrongSignatureResult = verifyPlatformReleases({ projectRoot: wrongSignature, level: 'local', registry });
  ok(!wrongSignatureResult.ok && codes(wrongSignatureResult).includes('PLATFORM_RELEASE_SIGNATURE'),
    'renamed non-ZIP payload is rejected by file signature');

  const unsigned = fixture('unsigned-android');
  selection(unsigned, ['google-play']);
  receipt(unsigned, 'google-play', 'v3.0.0', {
    deliveryStatus: 'blocked',
    reference: null,
    deliveryEvidence: [],
    integrationStatus: 'blocked',
    readiness: 'external-blocked',
    blockers: ['release signing and Play enrollment are not verified'],
  });
  const unsignedLocal = verifyPlatformReleases({ projectRoot: unsigned, level: 'local', registry });
  ok(unsignedLocal.ok, 'valid Android candidate may honestly remain external-blocked at local level');
  const unsignedSubmit = verifyPlatformReleases({ projectRoot: unsigned, level: 'submit', registry });
  ok(!unsignedSubmit.ok
    && codes(unsignedSubmit).includes('PLATFORM_RELEASE_DELIVERY')
    && codes(unsignedSubmit).includes('PLATFORM_RELEASE_INTEGRATION')
    && codes(unsignedSubmit).includes('PLATFORM_RELEASE_BLOCKERS'),
  'unsigned-by-contract Android receipt cannot pass submit verification');

  const fakeSignedAndroid = fixture('fake-signed-android');
  selection(fakeSignedAndroid, ['google-play']);
  receipt(fakeSignedAndroid, 'google-play', 'v3.0.0');
  const fakeSignedAndroidResult = verifyPlatformReleases({ projectRoot: fakeSignedAndroid, level: 'submit', registry });
  ok(!fakeSignedAndroidResult.ok && (codes(fakeSignedAndroidResult).includes('PLATFORM_RELEASE_ANDROID_UNSIGNED') || codes(fakeSignedAndroidResult).includes('PLATFORM_RELEASE_ANDROID_SIGNER_TOOL')),
    'unsigned APK/AAB cannot pass submit even with a trusted external-evidence fixture');

  const signedAndroidFixture = fixture('trusted-signed-android-fixture');
  selection(signedAndroidFixture, ['google-play']);
  receipt(signedAndroidFixture, 'google-play', 'v3.0.0');
  const fixtureInspector = () => ({ ok: true, certificateSha256: 'c'.repeat(64) });
  ok(verifyPlatformReleases({ projectRoot: signedAndroidFixture, level: 'submit', registry: submissionRegistry(),
    androidSignatureInspector: fixtureInspector, externalVerifiers: testVerifiers(['google-play']) }).ok,
  'test-signed Android fixture passes only with injected target-specific external proof and matching actual certificate');
  const mismatchAndroid = fixture('android-signature-mismatch');
  selection(mismatchAndroid, ['google-play']);
  receipt(mismatchAndroid, 'google-play', 'v3.0.0');
  const mismatchResult = verifyPlatformReleases({ projectRoot: mismatchAndroid, level: 'submit', registry: submissionRegistry(),
    androidSignatureInspector: () => ({ ok: true, certificateSha256: 'd'.repeat(64) }),
    externalVerifiers: testVerifiers(['google-play'], {
      'google-play': (evidence, payload) => {
        payload.signingCertificateSha256 = 'c'.repeat(64);
        evidence.proofSha256 = hashExternalPlatformProof(payload);
        return evidence;
      },
    }) });
  ok(!mismatchResult.ok && codes(mismatchResult).includes('PLATFORM_RELEASE_TRUST_SIGNING_MISMATCH'),
    'Android trusted evidence certificate hash must match the actual signing certificate');

  const realAndroid = fixture('real-self-signed-aab');
  selection(realAndroid, ['google-play']);
  const signedAab = makeAab(realAndroid, 'signed');
  const signedInspection = verifyAndroidProductionSignature(signedAab);
  receipt(realAndroid, 'google-play', 'v3.1.0', { candidate: path.relative(realAndroid, signedAab).replaceAll('\\', '/'), skipCandidate: true,
    sha256: sha256(signedAab), bytes: fs.statSync(signedAab).size });
  ok(signedInspection.ok && verifyPlatformReleases({ projectRoot: realAndroid, level: 'submit', registry: submissionRegistry(), externalVerifiers: testVerifiers(['google-play']) }).ok,
    'real self-signed upload-key AAB passes jarsigner/keytool only with matching injected external proof');
  const unsignedAab = fixture('real-unsigned-aab');
  selection(unsignedAab, ['google-play']);
  const unsignedAabFile = makeAab(unsignedAab, 'unsigned', { signed: false });
  receipt(unsignedAab, 'google-play', 'v3.1.0', { candidate: path.relative(unsignedAab, unsignedAabFile).replaceAll('\\', '/'), skipCandidate: true, sha256: sha256(unsignedAabFile), bytes: fs.statSync(unsignedAabFile).size });
  ok(codes(verifyPlatformReleases({ projectRoot: unsignedAab, level: 'submit', registry })).includes('PLATFORM_RELEASE_ANDROID_UNSIGNED'),
    'real unsigned AAB fails jarsigner verification');
  const tamperedAab = fixture('real-tampered-aab');
  selection(tamperedAab, ['google-play']);
  const tamperedAabFile = makeAab(tamperedAab, 'tampered', { tamper: true });
  receipt(tamperedAab, 'google-play', 'v3.1.0', { candidate: path.relative(tamperedAab, tamperedAabFile).replaceAll('\\', '/'), skipCandidate: true, sha256: sha256(tamperedAabFile), bytes: fs.statSync(tamperedAabFile).size });
  ok(codes(verifyPlatformReleases({ projectRoot: tamperedAab, level: 'submit', registry })).includes('PLATFORM_RELEASE_ANDROID_UNSIGNED'),
    'real tampered AAB fails jarsigner verification');

  const hosted = fixture('hosted-missing');
  selection(hosted, ['vk']);
  receipt(hosted, 'vk', 'v1.0.0', { reference: null, integrationStatus: 'blocked' });
  const hostedResult = verifyPlatformReleases({ projectRoot: hosted, level: 'submit', registry });
  ok(!hostedResult.ok
    && codes(hostedResult).includes('PLATFORM_RELEASE_HTTPS')
    && codes(hostedResult).includes('PLATFORM_RELEASE_INTEGRATION'),
  'hosted target requires HTTPS delivery and initialized required SDK');

  const wrongFormat = fixture('wrong-format');
  selection(wrongFormat, ['google-play']);
  receipt(wrongFormat, 'google-play', 'v1.0.0', { extension: '.apk' });
  const wrongFormatResult = verifyPlatformReleases({ projectRoot: wrongFormat, level: 'local', registry });
  ok(!wrongFormatResult.ok && codes(wrongFormatResult).includes('PLATFORM_RELEASE_FORMAT'),
    'profile-specific AAB requirement rejects an APK');

  const malformed = fixture('malformed');
  selection(malformed, ['yandex']);
  const malformedReceipt = receipt(malformed, 'yandex', 'v1.0.0');
  const extra = clone(malformedReceipt.value);
  extra.command = 'publish';
  json(malformedReceipt.receiptFile, extra);
  const malformedResult = verifyPlatformReleases({ projectRoot: malformed, level: 'local', registry });
  ok(!malformedResult.ok && codes(malformedResult).includes('PLATFORM_RELEASE_RECEIPT_KEYS'),
    'receipt cannot smuggle executable or unknown fields');
  let directReject = false;
  try { validatePlatformReleaseReceipt(extra); } catch (error) { directReject = error.code === 'PLATFORM_RELEASE_RECEIPT_KEYS'; }
  ok(directReject, 'receipt contract rejects unknown fields before filesystem verification');

  const cli = spawnSync(process.execPath, [VERIFY, valid, '--level', 'submit', '--json'], { cwd: ROOT, encoding: 'utf8' });
  let cliValue = null;
  try { cliValue = JSON.parse(cli.stdout); } catch {}
  ok(cli.status === 1 && cliValue?.ok === false && codes(cliValue).includes('PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE')
    && JSON.stringify(Object.keys(cliValue)) === JSON.stringify(['ok', 'level', 'version', 'targets', 'failures']),
  'canonical CLI has no local trust adapter and fails closed while retaining the exact JSON result surface', cli.stderr);
  const humanCli = spawnSync(process.execPath, [CHECK, valid, '--level', 'submit'], { cwd: ROOT, encoding: 'utf8' });
  ok(humanCli.status === 1 && /Targets: yandex, steam/u.test(humanCli.stdout) && !humanCli.stdout.includes('[object Object]'),
    'human storefront summary prints readable target ids when submit is correctly blocked');
  const cliFailure = spawnSync(process.execPath, [VERIFY, missingReceipt, '--level=local'], { cwd: ROOT, encoding: 'utf8' });
  ok(cliFailure.status === 1, 'CLI exits one for verification failures');
  const cliUsage = spawnSync(process.execPath, [VERIFY, valid, '--level', 'unknown'], { cwd: ROOT, encoding: 'utf8' });
  ok(cliUsage.status === 2, 'CLI exits two for invocation errors');
} finally {
  for (const message of passed) console.log(`[OK] ${message}`);
  for (const message of failed) console.error(`[FAIL] ${message}`);
  fs.rmSync(temp, { recursive: true, force: true });
}

if (failed.length) {
  console.error(`Platform release regressions: ${failed.length} failed, ${passed.length} passed`);
  process.exit(1);
}
console.log(`Platform release regressions: ${passed.length} passed`);
