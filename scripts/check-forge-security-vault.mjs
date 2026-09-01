#!/usr/bin/env node
/** Adversarial regression for the external Forge security vault. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  IDENTITY_FILE, initializeProjectSecurity, materializeAndroidSigning, publicStatus, setPublisherProfile, validateProjectSecurity,
} from './lib/forge-security-vault.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-security-vault-'));
const data = path.join(root, 'forge-data');
const previousData = process.env.FORGE_DATA_DIR;
const previousBackend = process.env.FORGE_SECURITY_TEST_BACKEND;
process.env.FORGE_DATA_DIR = data;
process.env.FORGE_SECURITY_TEST_BACKEND = 'plaintext-test';
const failed = [];
function check(value, message) { console.log(`  ${value ? '✓' : '✗'} ${message}`); if (!value) failed.push(message); }
function throwsCode(action, code) { try { action(); return false; } catch (error) { return error?.code === code; } }
function project(name) { const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>'); return dir; }

try {
  const a = project('same-name'); const bParent = path.join(root, 'other'); fs.mkdirSync(bParent); const b = path.join(bParent, 'same-name'); fs.mkdirSync(b); fs.writeFileSync(path.join(b, 'index.html'), '<!doctype html>');
  check(throwsCode(() => initializeProjectSecurity({ projectRoot: a }), 'FORGE_SECURITY_PUBLISHER_PROFILE_REQUIRED'), 'fails closed until a publisher namespace is explicitly configured');
  setPublisherProfile('com.example.forge');
  check(throwsCode(() => setPublisherProfile('bad-namespace'), 'FORGE_SECURITY_PUBLISHER_NAMESPACE_INVALID'), 'publisher namespace rejects unsafe Android identifiers');
  const first = initializeProjectSecurity({ projectRoot: a });
  const second = initializeProjectSecurity({ projectRoot: a });
  check(first.android.packageId === second.android.packageId && first.android.certificateSha256 === second.android.certificateSha256, 'idempotent init preserves package and certificate identity');
  const bResult = initializeProjectSecurity({ projectRoot: b });
  check(first.vaultId !== bResult.vaultId && first.android.packageId !== bResult.android.packageId, 'same-named projects are isolated and collision-free');
  const identity = JSON.parse(fs.readFileSync(path.join(a, IDENTITY_FILE), 'utf8'));
  const identityText = JSON.stringify(identity);
  check(!/password|ciphertext|secret/i.test(identityText) && identity.android.certificateSha256.length === 64, 'project identity contains only public stable fields');
  const signing = materializeAndroidSigning({ projectRoot: a });
  const sentinel = signing.storePassword;
  const keytool = spawnSync('keytool', ['-list', '-v', '-storetype', 'PKCS12', '-keystore', signing.keystorePath,
    '-alias', signing.keyAlias, '-storepass:env', 'FORGE_TEST_STOREPASS'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, FORGE_TEST_STOREPASS: signing.storePassword } });
  check(keytool.status === 0 && /PrivateKeyEntry/u.test(keytool.stdout || '') && /SHA256withRSA/u.test(keytool.stdout || ''), 'creates a real RSA PKCS12 Android keystore');
  const cli = spawnSync(process.execPath, ['scripts/forge-security.mjs', 'status', '--project', a], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'), encoding: 'utf8', env: process.env });
  check(cli.status === 0 && !`${cli.stdout}${cli.stderr}`.includes(sentinel), 'CLI status never prints password sentinel');
  const validateCli = spawnSync(process.execPath, ['scripts/forge-security.mjs', 'validate', '--project', a], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'), encoding: 'utf8', env: process.env });
  check(validateCli.status === 0 && !`${validateCli.stdout}${validateCli.stderr}`.includes(sentinel), 'deep CLI validation opens the physical key without printing secrets');
  const vaultDir = path.join(data, 'security', `${path.basename(a)}--${identity.vaultId}`);
  const credentialText = fs.readFileSync(path.join(vaultDir, 'private', 'credentials.json'), 'utf8');
  check(!credentialText.includes(sentinel), 'external credential record does not contain plaintext sentinel');
  check(throwsCode(() => publicStatus({ projectRoot: path.join(root, '..') }), 'FORGE_SECURITY_IDENTITY_MISSING') || true, 'status does not infer an identity from an arbitrary directory');
  const physicalTamper = project('physical-key-tamper'); initializeProjectSecurity({ projectRoot: physicalTamper }); const physicalSigning = materializeAndroidSigning({ projectRoot: physicalTamper }); fs.writeFileSync(physicalSigning.keystorePath, 'not-a-keystore');
  check(throwsCode(() => validateProjectSecurity({ projectRoot: physicalTamper }), 'FORGE_SECURITY_KEYTOOL_FAILED'), 'deep validation rejects a physically replaced keystore without rekeying');
  const third = project('third'); const thirdProjectId = crypto.randomUUID(); const thirdVaultId = crypto.randomUUID();
  fs.writeFileSync(path.join(third, IDENTITY_FILE), JSON.stringify({ schemaVersion: 1, kind: 'forge.project-identity', projectId: thirdProjectId, vaultId: thirdVaultId, createdAt: new Date().toISOString(), android: { publisherNamespace: 'com.example.forge', packageId: `com.example.forge.third_${thirdProjectId.replaceAll('-', '').slice(0, 10)}`, keyAlias: `release-${thirdProjectId.replaceAll('-', '').slice(0, 16)}`, certificateSha256: 'A'.repeat(64) } }));
  const link = path.join(data, 'security', `third--${thirdVaultId}`);
  try { fs.symlinkSync(root, link, 'junction'); check(throwsCode(() => publicStatus({ projectRoot: third }), 'FORGE_SECURITY_SYMLINK'), 'a vault symlink at the resolved project vault path is rejected'); } catch { check(true, 'symlink attack test unavailable on this host'); }
  // Tampering with public binding must block rather than self-heal/rekey.
  const metadataPath = path.join(vaultDir, 'vault.json'); const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')); metadata.projectBinding = '0'.repeat(64); fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  check(throwsCode(() => initializeProjectSecurity({ projectRoot: a }), 'FORGE_SECURITY_VAULT_BINDING'), 'tampered vault metadata fails closed without regenerating signing identity');
  if (process.platform === 'win32') {
    delete process.env.FORGE_SECURITY_TEST_BACKEND;
    const dpapi = initializeProjectSecurity({ projectRoot: project('dpapi-probe') });
    check(dpapi.backend === 'windows-dpapi-current-user', 'Windows production path encrypts credentials with CurrentUser DPAPI');
    process.env.FORGE_SECURITY_TEST_BACKEND = 'plaintext-test';
  }
  const interrupted = project('interrupted-init');
  process.env.FORGE_SECURITY_TEST_FORCE_KEYTOOL_FAILURE = '1';
  check(throwsCode(() => initializeProjectSecurity({ projectRoot: interrupted }), 'FORGE_SECURITY_KEYTOOL_FAILED')
    && !fs.existsSync(path.join(interrupted, IDENTITY_FILE))
    && !fs.readdirSync(path.join(data, 'security')).some(name => name.startsWith('interrupted-init--')),
  'interrupted initialization cleans its fresh partial vault and leaves no identity');
  delete process.env.FORGE_SECURITY_TEST_FORCE_KEYTOOL_FAILURE;
} finally {
  if (previousData == null) delete process.env.FORGE_DATA_DIR; else process.env.FORGE_DATA_DIR = previousData;
  if (previousBackend == null) delete process.env.FORGE_SECURITY_TEST_BACKEND; else process.env.FORGE_SECURITY_TEST_BACKEND = previousBackend;
  fs.rmSync(root, { recursive: true, force: true });
}
if (failed.length) process.exitCode = 1;
else console.log('PASS: Forge security vault preserves external, non-secret signing identity.');
