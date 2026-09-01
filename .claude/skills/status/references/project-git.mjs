#!/usr/bin/env node
/**
 * Project Forge local-first Git lifecycle.
 * Local repositories and checkpoint commits are automatic. GitHub is touched only when the
 * workspace policy explicitly enables private repository creation/push.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { atomicWriteJson, ensureRuntimeGitExclude } from './execution-contract.mjs';

const DEFAULT_POLICY = {
  schemaVersion: 1,
  enabled: true,
  localCheckpoints: true,
  github: { enabled: false, owner: null, visibility: 'private', autoCreate: false, autoPush: false },
};

const IGNORE_BLOCK = `# >>> Project Forge managed secrets and generated data
node_modules/
output/
handoff/
screens/video/
screens/review/
assets/bible/
assets/refs/
assets/target/
backend/node_modules/
wiki/diagnostics/forge-events*.jsonl
wiki/diagnostics/codex-cost/*.json
.forge/runs/
.forge/metrics/
.forge/git-checkpoints.json
.forge/git-checkpoints.lock
.forge/git-checkpoint-operation.lock
.forge/*.tmp
.env
.env.*
!.env.example
.*_key
.*_token
*.key
*.pem
*.jks
*.keystore
*.p12
*.pfx
*.secret
pepk_out.zip
SIGNING_CREDENTIALS.md
StoreData/signing/
security/
# <<< Project Forge managed secrets and generated data
`;

function command(bin, args, cwd, allowFailure = false) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error) {
    if (allowFailure) return { status: 127, stdout: '', stderr: result.error.message };
    throw result.error;
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = String(result.stderr || result.stdout || `${bin} exited ${result.status}`).trim();
    throw new Error(detail);
  }
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function mergePolicy(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  return { ...base, ...extra, github: { ...base.github, ...(extra.github || {}) } };
}

export function policyPathForWorkspace(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot), 'forge-data', 'git-policy.json');
}

export function loadProjectGitPolicy(projectRoot) {
  const root = path.resolve(projectRoot);
  const candidates = [
    policyPathForWorkspace(path.dirname(root)),
    path.join(root, '.forge-git.json'),
  ];
  let policy = structuredClone(DEFAULT_POLICY);
  const sources = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    policy = mergePolicy(policy, parsed);
    sources.push(candidate);
  }
  if (policy.github?.enabled && String(policy.github.visibility).toLowerCase() !== 'private') {
    throw new Error('Forge automation only creates private GitHub repositories.');
  }
  return { policy, sources };
}

export function phaseCheckpointRemotePolicy(phase, { preflight = false } = {}) {
  const publish = !preflight && Number(phase) >= 8;
  return { allowRemote: publish, allowRemoteFailure: !publish };
}

export const GIT_CHECKPOINTS_RELATIVE_PATH = '.forge/git-checkpoints.json';

export function gitCheckpointStatePath(projectRoot) {
  return path.join(path.resolve(projectRoot), ...GIT_CHECKPOINTS_RELATIVE_PATH.split('/'));
}

function emptyGitCheckpointLedger() {
  return { schemaVersion: 1, updatedAt: null, phases: {} };
}

function validCheckpointRecord(record, phase) {
  const structurallyValid = record && typeof record === 'object'
    && Number(record.phase) === Number(phase)
    && ['pending', 'complete', 'failed'].includes(record.status)
    && ['complete', 'reconcile'].includes(record.stage)
    && typeof record.requiredRemote === 'boolean'
    && (record.commit === null || (typeof record.commit === 'string' && record.commit.length <= 80))
    && typeof record.pushed === 'boolean'
    && (record.remote === null || (typeof record.remote === 'string' && record.remote.length <= 200))
    && typeof record.remoteDeferred === 'boolean'
    && typeof record.skipped === 'boolean'
    && (record.message === null || (typeof record.message === 'string' && record.message.length <= 1000))
    && typeof record.updatedAt === 'string' && Number.isFinite(Date.parse(record.updatedAt));
  if (!structurallyValid) return false;
  if (record.status === 'complete' && Number(phase) >= 8) {
    return record.requiredRemote === true && record.pushed === true && Boolean(record.remote);
  }
  return !(record.status === 'complete' && record.requiredRemote && (!record.pushed || !record.remote));
}

export function readGitCheckpointLedger(projectRoot) {
  const file = gitCheckpointStatePath(projectRoot);
  if (!fs.existsSync(file)) {
    return { present: false, valid: true, file, ledger: emptyGitCheckpointLedger(), error: null };
  }
  try {
    const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
    const valid = ledger?.schemaVersion === 1 && ledger.phases && typeof ledger.phases === 'object'
      && !Array.isArray(ledger.phases)
      && Object.entries(ledger.phases).every(([phase, record]) => /^[1-9]$/.test(phase) && validCheckpointRecord(record, phase));
    if (!valid) throw new Error('Git checkpoint ledger schema is invalid.');
    return { present: true, valid: true, file, ledger, error: null };
  } catch (error) {
    return { present: true, valid: false, file, ledger: emptyGitCheckpointLedger(), error: String(error.message || error) };
  }
}

export function readPhaseGitCheckpoint(projectRoot, phase) {
  const state = readGitCheckpointLedger(projectRoot);
  return { ...state, record: state.valid ? state.ledger.phases[String(Number(phase))] || null : null };
}

export function sanitizeGitCheckpointMessage(value) {
  return String(value || '')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[redacted-github-token]')
    .replace(/gh[pousr]_[A-Za-z0-9]{30,}/g, '[redacted-github-token]')
    .replace(/sk-[A-Za-z0-9_-]{24,}/g, '[redacted-api-key]')
    .replace(/([?&](?:access_token|token|key)=)[^&\s]+/gi, '$1[redacted]');
}

function boundedCheckpointMessage(value) {
  const text = sanitizeGitCheckpointMessage(value).replace(/[\r\n]+/g, ' ').trim();
  return text ? text.slice(0, 1000) : null;
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function withOwnedCheckpointLock(root, fileName, conflictCode, action) {
  const lock = path.join(root, '.forge', fileName);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  let handle = null;
  try {
    for (let attempt = 0; attempt < 2 && handle == null; attempt++) {
      try {
        handle = fs.openSync(lock, 'wx');
        fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }) + '\n', 'utf8');
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        let owner = null;
        try {
          owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
        } catch {}
        const malformedStale = !owner?.pid && Date.now() - fs.statSync(lock).mtimeMs > 30_000;
        if ((!owner?.pid || processIsAlive(Number(owner.pid))) && !malformedStale) break;
        try { fs.unlinkSync(lock); } catch { break; }
      }
    }
    if (handle == null) {
      const conflict = new Error(`${conflictCode}: another checkpoint operation is active.`);
      conflict.code = conflictCode;
      throw conflict;
    }
    return action();
  } finally {
    if (handle != null) {
      try { fs.closeSync(handle); } catch {}
      try {
        const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
        if (owner.token === token) fs.unlinkSync(lock);
      } catch {}
    }
  }
}

function withGitCheckpointLedgerLock(root, action) {
  return withOwnedCheckpointLock(root, 'git-checkpoints.lock', 'GIT_CHECKPOINT_LEDGER_CONFLICT', action);
}

function withPhaseGitCheckpointLease(root, action) {
  return withOwnedCheckpointLock(root, 'git-checkpoint-operation.lock', 'GIT_CHECKPOINT_CONFLICT', action);
}

export function recordPhaseGitCheckpoint(projectRoot, {
  phase, status, stage = 'complete', remotePolicy, result = null, error = null,
} = {}) {
  const phaseNumber = Number(phase);
  if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 9) throw new Error('Git checkpoint phase must be 1..9.');
  if (!['pending', 'complete', 'failed'].includes(status)) throw new Error(`Invalid Git checkpoint status: ${status}`);
  if (!['complete', 'reconcile'].includes(stage)) throw new Error(`Invalid Git checkpoint stage: ${stage}`);
  if (!remotePolicy || typeof remotePolicy.allowRemote !== 'boolean' || typeof remotePolicy.allowRemoteFailure !== 'boolean') {
    throw new Error('Git checkpoint remote policy is required.');
  }
  const root = path.resolve(projectRoot);
  ensureRuntimeGitExclude(root);
  return withGitCheckpointLedgerLock(root, () => {
    const loaded = readGitCheckpointLedger(root);
    const ledger = loaded.valid ? loaded.ledger : emptyGitCheckpointLedger();
    const now = new Date().toISOString();
    const requiredRemote = remotePolicy.allowRemote && remotePolicy.allowRemoteFailure === false;
    const record = {
      phase: phaseNumber,
      status,
      stage,
      requiredRemote,
      commit: result?.commit || null,
      pushed: result?.pushed === true,
      remote: result?.remote?.fullName || null,
      remoteDeferred: result?.remoteDeferred === true,
      skipped: result?.skipped === true,
      message: status === 'failed'
        ? boundedCheckpointMessage(error)
        : boundedCheckpointMessage(result?.warning || result?.reason),
      updatedAt: now,
    };
    ledger.schemaVersion = 1;
    ledger.updatedAt = now;
    ledger.phases = { ...ledger.phases, [String(phaseNumber)]: record };
    atomicWriteJson(gitCheckpointStatePath(root), ledger);
    return record;
  });
}

export function configureWorkspaceGitPolicy(workspaceRoot, owner) {
  if (!owner || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) {
    throw new Error('A valid GitHub owner is required.');
  }
  const out = policyPathForWorkspace(workspaceRoot);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const policy = {
    schemaVersion: 1,
    enabled: true,
    localCheckpoints: true,
    github: { enabled: true, owner, visibility: 'private', autoCreate: true, autoPush: true },
  };
  fs.writeFileSync(out, JSON.stringify(policy, null, 2) + '\n', 'utf8');
  return out;
}

function ensureManagedIgnore(root) {
  const file = path.join(root, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.includes('# >>> Project Forge managed secrets and generated data')) return false;
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, current + separator + IGNORE_BLOCK, 'utf8');
  return true;
}

function sensitiveName(rel) {
  const p = rel.replace(/\\/g, '/').toLowerCase();
  const name = p.split('/').pop();
  if (name === '.env.example') return false;
  return name === '.env' || name.startsWith('.env.') || name === '.npmrc' || name === 'id_rsa'
    || /^\..*_(?:key|token)$/.test(name)
    || name === 'signing_credentials.md' || name === 'pepk_out.zip'
    || p.startsWith('storedata/signing/') || p.includes('/storedata/signing/')
    || p.startsWith('security/') || p.includes('/security/')
    || /\.(?:key|pem|jks|keystore|p12|pfx|secret)$/.test(name);
}

const SECRET_CONTENT = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /sk-[A-Za-z0-9_-]{24,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  // A bare PEM marker is common in security/payment documentation. Require a
  // plausible encoded body plus the matching footer before blocking a commit.
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{80,}-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

function stagedFiles(root) {
  const out = command('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], root).stdout;
  return out.split('\0').filter(Boolean);
}

function assertNoStagedSecrets(root) {
  const tracked = command('git', ['ls-files', '-z'], root).stdout.split('\0').filter(Boolean);
  const named = tracked.filter(sensitiveName);
  if (named.length) throw new Error(`Refusing checkpoint/push: sensitive files are tracked: ${named.slice(0, 8).join(', ')}`);

  const contentHits = [];
  for (const rel of stagedFiles(root)) {
    const abs = path.join(root, rel);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;
    const buffer = fs.readFileSync(abs);
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    if (SECRET_CONTENT.some(re => re.test(text))) contentHits.push(rel);
  }
  if (contentHits.length) throw new Error(`Refusing checkpoint/push: probable secret content in ${contentHits.slice(0, 8).join(', ')}`);
}

function repoSlug(root) {
  const slug = path.basename(root).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  if (!slug) throw new Error('Cannot derive a GitHub repository name from the project folder.');
  return slug;
}

function ensureLocalRepository(root) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    let init = command('git', ['init', '-q', '-b', 'main'], root, true);
    if (init.status !== 0) {
      command('git', ['init', '-q'], root);
      command('git', ['branch', '-M', 'main'], root, true);
    }
    return true;
  }
  const top = path.resolve(command('git', ['rev-parse', '--show-toplevel'], root).stdout.trim());
  if (top.toLowerCase() !== root.toLowerCase()) throw new Error(`Git root mismatch: expected ${root}, got ${top}`);
  return false;
}

function commitCheckpoint(root, message) {
  command('git', ['add', '-A'], root);
  assertNoStagedSecrets(root);
  const pending = command('git', ['diff', '--cached', '--quiet'], root, true).status !== 0;
  if (!pending) return null;
  const name = command('git', ['config', '--get', 'user.name'], root, true).stdout.trim();
  const email = command('git', ['config', '--get', 'user.email'], root, true).stdout.trim();
  const args = [];
  if (!name) args.push('-c', 'user.name=Project Forge');
  if (!email) args.push('-c', 'user.email=forge@local');
  args.push('commit', '-q', '-m', message);
  command('git', args, root);
  return command('git', ['rev-parse', '--short', 'HEAD'], root).stdout.trim();
}

function parseGitHubRemote(url) {
  const match = String(url).trim().match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function ensurePrivateGitHub(root, github) {
  const auth = command('gh', ['auth', 'status'], root, true);
  if (auth.status !== 0) throw new Error('GitHub CLI is not authenticated. Run: gh auth login');
  const owner = github.owner;
  if (!owner) throw new Error('GitHub owner is missing from Forge Git policy.');
  const fullName = `${owner}/${github.repository || repoSlug(root)}`;
  const origin = command('git', ['remote', 'get-url', 'origin'], root, true);
  if (origin.status === 0) {
    const actual = parseGitHubRemote(origin.stdout);
    if (actual?.toLowerCase() !== fullName.toLowerCase()) {
      throw new Error(`Existing origin points to ${actual || origin.stdout.trim()}, expected ${fullName}.`);
    }
  }

  let view = command('gh', ['repo', 'view', fullName, '--json', 'visibility,url'], root, true);
  if (view.status !== 0) {
    const missing = /Could not resolve to a Repository|Could not resolve|not found/i.test(view.stderr + view.stdout);
    if (!missing) throw new Error(String(view.stderr || view.stdout).trim());
    if (!github.autoCreate) throw new Error(`Private GitHub repository ${fullName} does not exist.`);
    command('gh', ['repo', 'create', fullName, '--private', '--source', '.', '--remote', 'origin'], root);
    view = command('gh', ['repo', 'view', fullName, '--json', 'visibility,url'], root);
  } else if (origin.status !== 0) {
    command('git', ['remote', 'add', 'origin', `https://github.com/${fullName}.git`], root);
  }
  const info = JSON.parse(view.stdout);
  if (String(info.visibility).toUpperCase() !== 'PRIVATE') {
    throw new Error(`Refusing automatic push: ${fullName} is not private.`);
  }
  return { fullName, url: info.url };
}

function checkpointProjectGitUnlocked({ projectRoot = process.cwd(), message = 'forge: project checkpoint', allowRemoteFailure = true, allowRemote = true } = {}) {
  const root = path.resolve(projectRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Project folder not found: ${root}`);
  const { policy, sources } = loadProjectGitPolicy(root);
  if (!policy.enabled || !policy.localCheckpoints) return { skipped: true, reason: 'disabled', root, sources };

  ensureManagedIgnore(root);
  const initialized = ensureLocalRepository(root);
  ensureRuntimeGitExclude(root);
  const commit = commitCheckpoint(root, initialized ? 'forge: initialize project repository' : message);
  const result = { root, initialized, commit, pushed: false, remote: null, remoteDeferred: false, sources, warning: null };
  if (!policy.github?.enabled) return result;
  if (!allowRemote) {
    result.remoteDeferred = true;
    return result;
  }
  try {
    const remote = ensurePrivateGitHub(root, policy.github);
    result.remote = remote;
    if (policy.github.autoPush) {
      command('git', ['push', '-u', 'origin', 'HEAD'], root);
      result.pushed = true;
    }
  } catch (error) {
    if (!allowRemoteFailure) throw error;
    result.warning = error.message;
  }
  return result;
}

export function checkpointProjectGit(options = {}) {
  const root = path.resolve(options.projectRoot || process.cwd());
  return withPhaseGitCheckpointLease(root, () => {
    ensureRuntimeGitExclude(root);
    return checkpointProjectGitUnlocked({ ...options, projectRoot: root });
  });
}

export function runPhaseGitCheckpoint({
  projectRoot = process.cwd(), phase, phaseName, stage = 'complete', checkpoint = checkpointProjectGit,
} = {}) {
  if (!['preflight', 'complete', 'reconcile'].includes(stage)) throw new Error(`Invalid host Git checkpoint stage: ${stage}`);
  const root = path.resolve(projectRoot);
  const durableCompletion = stage !== 'preflight';
  const remotePolicy = phaseCheckpointRemotePolicy(phase, { preflight: !durableCompletion });
  const message = stage === 'complete'
    ? `forge: complete phase ${phase} ${phaseName}`
    : stage === 'reconcile'
      ? `forge: reconcile complete phase ${phase} ${phaseName}`
      : `forge: preserve work before phase ${phase} ${phaseName}`;

  return withPhaseGitCheckpointLease(root, () => {
    ensureRuntimeGitExclude(root);
    const pending = durableCompletion
      ? recordPhaseGitCheckpoint(root, { phase, status: 'pending', stage, remotePolicy })
      : null;
    try {
      const executeCheckpoint = checkpoint === checkpointProjectGit ? checkpointProjectGitUnlocked : checkpoint;
      const result = executeCheckpoint({ projectRoot: root, message, ...remotePolicy });
      if (pending?.requiredRemote && result?.pushed !== true) {
        throw new Error(`Required private GitHub push was not confirmed for Phase ${phase}.`);
      }
      if (durableCompletion) {
        recordPhaseGitCheckpoint(root, { phase, status: 'complete', stage, remotePolicy, result });
      }
      return { result, remotePolicy, message };
    } catch (error) {
      if (durableCompletion) {
        recordPhaseGitCheckpoint(root, { phase, status: 'failed', stage, remotePolicy, error });
      }
      throw error;
    }
  });
}

function valueAfter(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

export async function runProjectGitCli(args = process.argv.slice(2), defaultWorkspaceRoot = path.dirname(process.cwd())) {
  const commandName = args[0] || 'status';
  if (commandName === 'configure') {
    const owner = valueAfter(args, '--owner');
    const workspaceRoot = path.resolve(valueAfter(args, '--workspace') || defaultWorkspaceRoot);
    const out = configureWorkspaceGitPolicy(workspaceRoot, owner);
    console.log(`[OK] Private GitHub automation enabled for future checkpoints: ${out}`);
    return 0;
  }
  const projectRoot = path.resolve(valueAfter(args, '--project') || process.cwd());
  if (commandName === 'status') {
    const loaded = loadProjectGitPolicy(projectRoot);
    console.log(JSON.stringify({ projectRoot, ...loaded }, null, 2));
    return 0;
  }
  if (!['ensure', 'checkpoint'].includes(commandName)) {
    console.error('Usage: project-git.mjs configure --owner OWNER [--workspace PATH] | ensure|checkpoint [--project PATH] [--message TEXT]');
    return 2;
  }
  const result = checkpointProjectGit({
    projectRoot,
    message: valueAfter(args, '--message') || 'forge: manual checkpoint',
    allowRemoteFailure: false,
  });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}
