#!/usr/bin/env node
/**
 * Project Forge local-first Git lifecycle.
 * Local repositories and checkpoint commits are automatic. GitHub is touched only when the
 * workspace policy explicitly enables private repository creation/push.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
.env
.env.*
!.env.example
.*_key
.*_token
*.key
*.pem
*.p12
*.pfx
*.secret
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
    || /\.(?:key|pem|p12|pfx|secret)$/.test(name);
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

export function checkpointProjectGit({ projectRoot = process.cwd(), message = 'forge: project checkpoint', allowRemoteFailure = true, allowRemote = true } = {}) {
  const root = path.resolve(projectRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Project folder not found: ${root}`);
  const { policy, sources } = loadProjectGitPolicy(root);
  if (!policy.enabled || !policy.localCheckpoints) return { skipped: true, reason: 'disabled', root, sources };

  ensureManagedIgnore(root);
  const initialized = ensureLocalRepository(root);
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
