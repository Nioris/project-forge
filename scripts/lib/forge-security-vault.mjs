/**
 * Local, external security vault for stable mobile signing identities.
 *
 * Public identity is deliberately separate from passwords/private keys.  The
 * latter never enter a project, Git, stdout or exception message.  This module
 * is Node-only and intentionally fails closed on hosts without the supported
 * OS protection backend.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FORGE_ROOT = path.resolve(HERE, '..', '..');
export const IDENTITY_FILE = 'forge.identity.json';
export const VAULT_SCHEMA_VERSION = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const NAMESPACE_RE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const ALIAS_RE = /^[a-z0-9][a-z0-9._-]{2,79}$/u;
const SHA_RE = /^[A-F0-9]{64}$/u;
const TEST_BACKEND = 'plaintext-test';

// Fixed scripts: stdin is data only, never executable PowerShell.  `Add-Type`
// avoids a broken module-autoload path on some locked-down Windows hosts.
const DPAPI_ENCRYPT = "Add-Type -AssemblyName System.Security;$ErrorActionPreference='Stop';$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$e=[Text.Encoding]::UTF8.GetBytes('ProjectForge.SecurityVault.v1');$p=[System.Security.Cryptography.ProtectedData]::Protect($b,$e,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))";
const DPAPI_DECRYPT = "Add-Type -AssemblyName System.Security;$ErrorActionPreference='Stop';$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$e=[Text.Encoding]::UTF8.GetBytes('ProjectForge.SecurityVault.v1');$p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$e,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))";

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function inside(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
function assertExternalDataRoot(project, dataRoot) {
  // A caller-controlled FORGE_DATA_DIR must never turn the project itself into
  // the private vault.  Ignore rules are defense in depth, not a substitute
  // for keeping signing material physically outside every project repository.
  if (inside(project, dataRoot)) fail('FORGE_SECURITY_DATA_ROOT_INSIDE_PROJECT');
}
function now() { return new Date().toISOString(); }
function normalProjectBinding(project) { return sha256(process.platform === 'win32' ? project.toLowerCase() : project); }

export function forgeDataRoot() {
  return process.env.FORGE_DATA_DIR ? path.resolve(process.env.FORGE_DATA_DIR) : path.join(path.dirname(FORGE_ROOT), 'forge-data');
}

function existingDirectory(value, code) {
  try {
    const resolved = fs.realpathSync(path.resolve(String(value || '')));
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not-directory');
    return resolved;
  } catch { fail(code); }
}

function assertNoSymlink(root, target) {
  const base = path.resolve(root); const full = path.resolve(target);
  if (!inside(base, full)) fail('FORGE_SECURITY_PATH_ESCAPE');
  const parts = path.relative(base, full).split(path.sep).filter(Boolean);
  let current = base;
  try { if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail('FORGE_SECURITY_SYMLINK'); } catch (error) { if (error?.code) throw error; fail('FORGE_SECURITY_PATH'); }
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail('FORGE_SECURITY_SYMLINK');
  }
}

function secureMode(file, directory = false) {
  try { fs.chmodSync(file, directory ? 0o700 : 0o600); } catch { /* Windows ACL below is authoritative there. */ }
  if (process.platform !== 'win32') return;
  const user = String(process.env.USERNAME || '').trim();
  if (!user || /[\r\n\0]/u.test(user)) fail('FORGE_SECURITY_ACL_UNAVAILABLE');
  const grant = directory ? `${user}:(OI)(CI)F` : `${user}:F`;
  const applied = spawnSync('icacls.exe', [file, '/inheritance:r', '/grant:r', grant], { encoding: 'utf8', windowsHide: true });
  if (applied.error || applied.status !== 0) fail('FORGE_SECURITY_ACL_UNAVAILABLE');
  const checked = spawnSync('icacls.exe', [file], { encoding: 'utf8', windowsHide: true });
  if (checked.error || checked.status !== 0) fail('FORGE_SECURITY_ACL_UNAVAILABLE');
  const acl = `${checked.stdout || ''}\n${checked.stderr || ''}`;
  // icacls prefixes a local account with COMPUTER\\ on some Windows builds.
  if (!new RegExp(`${escapeRegExp(user)}.*\\(F\\)`, 'i').test(acl)
    || /(?:Everyone|BUILTIN\\Users|Authenticated Users).*\((?:F|M|W)\)/iu.test(acl)) fail('FORGE_SECURITY_ACL_UNSAFE');
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); }

function mkdirSecure(dir, root) {
  assertNoSymlink(root, dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  assertNoSymlink(root, dir);
  secureMode(dir, true);
}
function writeNew(file, text, root) {
  assertNoSymlink(root, file);
  try { fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error?.code === 'EEXIST') fail('FORGE_SECURITY_IMMUTABLE_EXISTS'); fail('FORGE_SECURITY_WRITE_FAILED'); }
  secureMode(file, false);
}
function writeReplace(file, text, root) {
  assertNoSymlink(root, file);
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); secureMode(temp, false);
    fs.renameSync(temp, file); secureMode(file, false);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}
function readJson(file, code) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail(code); } }
function isTempDirectory(dir) {
  const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function activeBackend(dataRoot) {
  if (process.env.FORGE_SECURITY_TEST_BACKEND === TEST_BACKEND && isTempDirectory(dataRoot)) return TEST_BACKEND;
  if (process.platform === 'win32') return 'windows-dpapi-current-user';
  fail('FORGE_SECURITY_BACKEND_UNAVAILABLE');
}
function dpapi(script, input) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    input, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0 || !String(result.stdout || '').trim()) fail('FORGE_SECURITY_DPAPI_FAILED');
  return String(result.stdout).trim();
}
function protect(value, backend) {
  if (backend === 'windows-dpapi-current-user') return dpapi(DPAPI_ENCRYPT, value);
  if (backend === TEST_BACKEND) return Buffer.from(value, 'utf8').toString('base64');
  fail('FORGE_SECURITY_BACKEND_UNAVAILABLE');
}
function unprotect(value, backend) {
  if (backend === 'windows-dpapi-current-user') return dpapi(DPAPI_DECRYPT, value);
  if (backend === TEST_BACKEND) return Buffer.from(value, 'base64').toString('utf8');
  fail('FORGE_SECURITY_BACKEND_UNAVAILABLE');
}

function publisherPath(dataRoot) { return path.join(dataRoot, 'security', 'publisher-profile.json'); }
function validateNamespace(value) {
  const namespace = String(value || '').trim().toLowerCase();
  if (!NAMESPACE_RE.test(namespace) || namespace.length > 120) fail('FORGE_SECURITY_PUBLISHER_NAMESPACE_INVALID');
  return namespace;
}
export function setPublisherProfile(namespace, { dataRoot = forgeDataRoot() } = {}) {
  const root = path.resolve(dataRoot); const security = path.join(root, 'security');
  mkdirSecure(root, root); mkdirSecure(security, root);
  const profile = { schemaVersion: 1, kind: 'forge.security-publisher-profile', publisherNamespace: validateNamespace(namespace), updatedAt: now() };
  writeReplace(publisherPath(root), `${JSON.stringify(profile, null, 2)}\n`, root);
  return { publisherNamespace: profile.publisherNamespace };
}
export function getPublisherProfile({ dataRoot = forgeDataRoot() } = {}) {
  const root = path.resolve(dataRoot); const file = publisherPath(root);
  if (!fs.existsSync(file)) fail('FORGE_SECURITY_PUBLISHER_PROFILE_REQUIRED');
  assertNoSymlink(root, file);
  const profile = readJson(file, 'FORGE_SECURITY_PUBLISHER_PROFILE_INVALID');
  if (profile?.schemaVersion !== 1 || profile?.kind !== 'forge.security-publisher-profile') fail('FORGE_SECURITY_PUBLISHER_PROFILE_INVALID');
  return { publisherNamespace: validateNamespace(profile.publisherNamespace) };
}

function safeProjectLabel(project) {
  const raw = path.basename(project).toLowerCase();
  const label = raw.replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40);
  return label || 'project';
}
function packageSegment(project) {
  const value = safeProjectLabel(project).replace(/-/gu, '_').replace(/[^a-z0-9_]/gu, '').slice(0, 48);
  return /^[a-z]/u.test(value) ? value : `app_${value || 'project'}`;
}
function validIdentity(identity) {
  return identity && identity.schemaVersion === 1 && identity.kind === 'forge.project-identity'
    && UUID_RE.test(identity.projectId || '') && UUID_RE.test(identity.vaultId || '')
    && typeof identity.createdAt === 'string' && NAMESPACE_RE.test(identity.android?.publisherNamespace || '')
    && NAMESPACE_RE.test(identity.android?.packageId || '') && ALIAS_RE.test(identity.android?.keyAlias || '')
    && SHA_RE.test(identity.android?.certificateSha256 || '');
}
function vaultPath(dataRoot, project, vaultId) { return path.join(dataRoot, 'security', `${safeProjectLabel(project)}--${vaultId}`); }
function identityPath(project) { return path.join(project, IDENTITY_FILE); }
function publicIdentityHash(identity) { return sha256(canonical(identity)); }
function lockPath(dataRoot) { return path.join(dataRoot, 'security', '.vault-init.lock'); }
function withInitLock(dataRoot, action) {
  const file = lockPath(dataRoot); let handle = null;
  for (let attempt = 0; attempt < 100 && handle == null; attempt++) {
    try { handle = fs.openSync(file, 'wx', 0o600); }
    catch (error) { if (error?.code !== 'EEXIST') fail('FORGE_SECURITY_LOCK_FAILED'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15); }
  }
  if (handle == null) fail('FORGE_SECURITY_LOCK_CONFLICT');
  try { secureMode(file, false); return action(); }
  finally { try { fs.closeSync(handle); } catch {} try { fs.unlinkSync(file); } catch {} }
}
function scanPackageCollision(dataRoot, packageId, projectBinding) {
  const security = path.join(dataRoot, 'security');
  if (!fs.existsSync(security)) return;
  for (const entry of fs.readdirSync(security, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const file = path.join(security, entry.name, 'vault.json');
    if (!fs.existsSync(file)) continue;
    const other = readJson(file, 'FORGE_SECURITY_VAULT_INVALID');
    if (other?.android?.packageId === packageId && other?.projectBinding !== projectBinding) fail('FORGE_SECURITY_PACKAGE_COLLISION');
  }
}
function cleanupPartialVault(root, security, vault) {
  // Only delete the exact directory created by this invocation.  A replaced
  // junction is left untouched and causes a fail-closed next run instead.
  try {
    if (!inside(security, vault) || path.dirname(vault) !== path.resolve(security)) return;
    assertNoSymlink(root, vault);
    if (fs.existsSync(vault)) fs.rmSync(vault, { recursive: true, force: false, maxRetries: 1 });
  } catch { /* The original failure is authoritative; never broaden deletion. */ }
}
function runKeytool(args, env) {
  if (process.env.FORGE_SECURITY_TEST_BACKEND === TEST_BACKEND && process.env.FORGE_SECURITY_TEST_FORCE_KEYTOOL_FAILURE === '1') fail('FORGE_SECURITY_KEYTOOL_FAILED');
  const result = spawnSync('keytool', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env }, maxBuffer: 2 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail('FORGE_SECURITY_KEYTOOL_FAILED');
  return String(result.stdout || '');
}
function keytoolFingerprint(output) {
  const match = String(output || '').match(/SHA256:\s*([A-F0-9:]{95})/iu);
  if (!match) fail('FORGE_SECURITY_KEYTOOL_FINGERPRINT_FAILED');
  return match[1].replaceAll(':', '').toUpperCase();
}
function makeKeyStore(file, alias, storePassword, keyPassword, commonName) {
  const env = { FORGE_VAULT_STOREPASS: storePassword, FORGE_VAULT_KEYPASS: keyPassword };
  runKeytool(['-genkeypair', '-noprompt', '-storetype', 'PKCS12', '-keystore', file, '-alias', alias,
    '-keyalg', 'RSA', '-keysize', '3072', '-sigalg', 'SHA256withRSA', '-validity', '10000',
    '-dname', `CN=${commonName},OU=Forge,O=Forge,C=US`, '-storepass:env', 'FORGE_VAULT_STOREPASS', '-keypass:env', 'FORGE_VAULT_KEYPASS'], env);
  const inspect = runKeytool(['-list', '-v', '-storetype', 'PKCS12', '-keystore', file, '-alias', alias,
    '-storepass:env', 'FORGE_VAULT_STOREPASS'], env);
  return keytoolFingerprint(inspect);
}
function readCredentials(vault, metadata) {
  const file = path.join(vault, metadata.credentials.file);
  assertNoSymlink(vault, file);
  const record = readJson(file, 'FORGE_SECURITY_CREDENTIALS_INVALID');
  if (record?.schemaVersion !== 1 || record?.kind !== 'forge.security-vault-credentials' || record?.backend !== metadata.credentials.backend || typeof record?.ciphertext !== 'string') fail('FORGE_SECURITY_CREDENTIALS_INVALID');
  let parsed; try { parsed = JSON.parse(unprotect(record.ciphertext, record.backend)); } catch { fail('FORGE_SECURITY_CREDENTIALS_UNAVAILABLE'); }
  if (!parsed || typeof parsed.storePassword !== 'string' || typeof parsed.keyPassword !== 'string' || parsed.storePassword.length < 32 || parsed.keyPassword.length < 32) fail('FORGE_SECURITY_CREDENTIALS_INVALID');
  return parsed;
}
function loadIdentityAndVault(project, dataRoot) {
  assertExternalDataRoot(project, dataRoot);
  const idFile = identityPath(project); if (!fs.existsSync(idFile)) fail('FORGE_SECURITY_IDENTITY_MISSING');
  assertNoSymlink(project, idFile); const identity = readJson(idFile, 'FORGE_SECURITY_IDENTITY_INVALID');
  if (!validIdentity(identity)) fail('FORGE_SECURITY_IDENTITY_INVALID');
  const vault = vaultPath(dataRoot, project, identity.vaultId); const metadataFile = path.join(vault, 'vault.json');
  // Check the whole would-be path before existence: a dangling junction must
  // be rejected as an attack, not disguised as a missing vault.
  assertNoSymlink(dataRoot, metadataFile);
  if (!fs.existsSync(metadataFile)) fail('FORGE_SECURITY_VAULT_MISSING');
  const metadata = readJson(metadataFile, 'FORGE_SECURITY_VAULT_INVALID');
  if (metadata?.schemaVersion !== VAULT_SCHEMA_VERSION || metadata?.kind !== 'forge.security-vault'
    || metadata.vaultId !== identity.vaultId || metadata.projectId !== identity.projectId
    || metadata.projectBinding !== normalProjectBinding(project) || metadata.identitySha256 !== publicIdentityHash(identity)
    || metadata.android?.packageId !== identity.android.packageId || metadata.android?.keyAlias !== identity.android.keyAlias
    || metadata.android?.certificateSha256 !== identity.android.certificateSha256) fail('FORGE_SECURITY_VAULT_BINDING');
  const key = path.join(vault, metadata.android.keystoreFile || '');
  if (!inside(vault, key) || !fs.existsSync(key)) fail('FORGE_SECURITY_KEYSTORE_MISSING');
  assertNoSymlink(vault, key);
  return { identity, metadata, vault, key };
}

export function initializeProjectSecurity({ projectRoot = process.cwd(), dataRoot = forgeDataRoot() } = {}) {
  const project = existingDirectory(projectRoot, 'FORGE_SECURITY_PROJECT_UNAVAILABLE');
  const root = path.resolve(dataRoot); const security = path.join(root, 'security');
  assertExternalDataRoot(project, root);
  mkdirSecure(root, root); mkdirSecure(security, root);
  return withInitLock(root, () => {
    const idFile = identityPath(project);
    if (fs.existsSync(idFile)) {
      return validateProjectSecurity({ projectRoot: project, dataRoot: root });
    }
    // An unbound vault is a potentially interrupted/foreign initialization. Do not create a second identity.
    const binding = normalProjectBinding(project);
    for (const entry of fs.readdirSync(security, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const candidate = path.join(security, entry.name, 'vault.json');
      if (fs.existsSync(candidate) && readJson(candidate, 'FORGE_SECURITY_VAULT_INVALID')?.projectBinding === binding) fail('FORGE_SECURITY_ORPHANED_VAULT');
    }
    const publisher = getPublisherProfile({ dataRoot: root }).publisherNamespace;
    const projectId = crypto.randomUUID(); const vaultId = crypto.randomUUID();
    // A readable slug is retained, while a stable UUID suffix prevents two
    // sibling projects called e.g. "game" from receiving the same store ID.
    const packageId = `${publisher}.${packageSegment(project)}_${projectId.replaceAll('-', '').slice(0, 10)}`;
    const keyAlias = `release-${projectId.replaceAll('-', '').slice(0, 16)}`;
    if (!NAMESPACE_RE.test(packageId) || !ALIAS_RE.test(keyAlias)) fail('FORGE_SECURITY_IDENTITY_INVALID');
    scanPackageCollision(root, packageId, binding);
    const vault = vaultPath(root, project, vaultId); let committed = false;
    try {
      mkdirSecure(vault, root); mkdirSecure(path.join(vault, 'android'), root); mkdirSecure(path.join(vault, 'private'), root);
      // PKCS12 providers commonly require key and store passwords to match.  Keep
      // one strong secret internally rather than emitting an incompatible key.
      const storePassword = crypto.randomBytes(32).toString('base64url'); const keyPassword = storePassword;
      const key = path.join(vault, 'android', 'release.p12');
      let certificateSha256;
      try { certificateSha256 = makeKeyStore(key, keyAlias, storePassword, keyPassword, packageId); secureMode(key, false); }
      catch (error) { if (error?.code) throw error; fail('FORGE_SECURITY_KEYTOOL_FAILED'); }
      if (!SHA_RE.test(certificateSha256)) fail('FORGE_SECURITY_KEYTOOL_FINGERPRINT_FAILED');
      const identity = { schemaVersion: 1, kind: 'forge.project-identity', projectId, vaultId, createdAt: now(), android: { publisherNamespace: publisher, packageId, keyAlias, certificateSha256 } };
      const backend = activeBackend(root);
      const ciphertext = protect(JSON.stringify({ storePassword, keyPassword }), backend);
      const credentials = { schemaVersion: 1, kind: 'forge.security-vault-credentials', backend, ciphertext };
      writeNew(path.join(vault, 'private', 'credentials.json'), `${JSON.stringify(credentials)}\n`, root);
      const metadata = { schemaVersion: VAULT_SCHEMA_VERSION, kind: 'forge.security-vault', vaultId, projectId, projectBinding: binding, createdAt: identity.createdAt,
        identitySha256: publicIdentityHash(identity), android: { packageId, keyAlias, certificateSha256, keystoreFile: 'android/release.p12' }, credentials: { backend, file: 'private/credentials.json' } };
      writeNew(path.join(vault, 'vault.json'), `${JSON.stringify(metadata, null, 2)}\n`, root);
      // Identity is public and is intentionally the final commit point; no secret is written to the project.
      writeNew(idFile, `${JSON.stringify(identity, null, 2)}\n`, project);
      secureMode(idFile, false); committed = true;
      return publicStatus({ projectRoot: project, dataRoot: root });
    } catch (error) {
      if (!committed) cleanupPartialVault(root, security, vault);
      throw error;
    }
  });
}

export function publicStatus({ projectRoot = process.cwd(), dataRoot = forgeDataRoot() } = {}) {
  const project = existingDirectory(projectRoot, 'FORGE_SECURITY_PROJECT_UNAVAILABLE'); const root = path.resolve(dataRoot);
  const loaded = loadIdentityAndVault(project, root);
  // Do not decrypt credentials for status. Existence is enough; release code uses explicit materialization.
  const credentialFile = path.join(loaded.vault, loaded.metadata.credentials.file);
  if (!inside(loaded.vault, credentialFile) || !fs.existsSync(credentialFile)) fail('FORGE_SECURITY_CREDENTIALS_MISSING');
  return { configured: true, projectId: loaded.identity.projectId, vaultId: loaded.identity.vaultId,
    android: { packageId: loaded.identity.android.packageId, keyAlias: loaded.identity.android.keyAlias, certificateSha256: loaded.identity.android.certificateSha256 },
    backend: loaded.metadata.credentials.backend };
}

/** Deep validation that decrypts internally and verifies the physical key. */
export function validateProjectSecurity({ projectRoot = process.cwd(), dataRoot = forgeDataRoot() } = {}) {
  const project = existingDirectory(projectRoot, 'FORGE_SECURITY_PROJECT_UNAVAILABLE');
  const root = path.resolve(dataRoot); const loaded = loadIdentityAndVault(project, root);
  const credentials = readCredentials(loaded.vault, loaded.metadata);
  if (credentials.storePassword !== credentials.keyPassword) fail('FORGE_SECURITY_CREDENTIALS_INCOMPATIBLE');
  const env = { FORGE_VAULT_STOREPASS: credentials.storePassword };
  const inspect = runKeytool(['-list', '-v', '-storetype', 'PKCS12', '-keystore', loaded.key, '-alias', loaded.identity.android.keyAlias,
    '-storepass:env', 'FORGE_VAULT_STOREPASS'], env);
  if (keytoolFingerprint(inspect) !== loaded.identity.android.certificateSha256) fail('FORGE_SECURITY_KEYSTORE_FINGERPRINT_MISMATCH');
  return publicStatus({ projectRoot: project, dataRoot: root });
}

/** Internal build-only API. Returns passwords in memory; callers must never log them. */
export function materializeAndroidSigning({ projectRoot = process.cwd(), dataRoot = forgeDataRoot() } = {}) {
  const project = existingDirectory(projectRoot, 'FORGE_SECURITY_PROJECT_UNAVAILABLE'); const loaded = loadIdentityAndVault(project, path.resolve(dataRoot));
  const credentials = readCredentials(loaded.vault, loaded.metadata);
  return { keystorePath: loaded.key, keyAlias: loaded.identity.android.keyAlias, storePassword: credentials.storePassword, keyPassword: credentials.keyPassword,
    packageId: loaded.identity.android.packageId, certificateSha256: loaded.identity.android.certificateSha256 };
}
