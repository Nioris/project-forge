#!/usr/bin/env node
/** Offline regression for local-first Git checkpoints and private-only policy. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkpointProjectGit, configureWorkspaceGitPolicy, loadProjectGitPolicy, phaseCheckpointRemotePolicy,
  readGitCheckpointLedger, readPhaseGitCheckpoint, recordPhaseGitCheckpoint, runPhaseGitCheckpoint,
  sanitizeGitCheckpointMessage,
} from '../.claude/skills/status/references/project-git.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-project-git-'));
const project = path.join(tmp, 'sample-game');
const fail = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) fail.push(message);
};
const git = (...args) => spawnSync('git', args, { cwd: project, encoding: 'utf8' });

try {
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'index.html'), '<!doctype html><title>Sample</title>\n');
  fs.writeFileSync(path.join(project, '.gitignore'), 'custom-cache/\n');
  fs.mkdirSync(path.join(project, '.forge', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(project, '.forge', 'runs', 'pending.json'), '{}\n');
  const phase1RemotePolicy = phaseCheckpointRemotePolicy(1);
  recordPhaseGitCheckpoint(project, {
    phase: 1, status: 'pending', stage: 'complete', remotePolicy: phase1RemotePolicy,
  });
  const first = checkpointProjectGit({ projectRoot: project, message: 'forge: initial test' });
  recordPhaseGitCheckpoint(project, {
    phase: 1, status: 'complete', stage: 'complete', remotePolicy: phase1RemotePolicy, result: first,
  });
  check(first.initialized && Boolean(first.commit), 'new project gets a local main repository and first commit');
  const ignore = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  check(ignore.includes('custom-cache/') && ignore.match(/Project Forge managed secrets/g)?.length === 2,
    'managed ignores are appended without destroying project rules');
  check(!git('ls-files', '--error-unmatch', '.forge/runs/pending.json').stdout.trim(),
    'late Git initialization keeps durable Task runs outside project history');
  const checkpointState = readPhaseGitCheckpoint(project, 1);
  check(git('check-ignore', '-q', '.forge/git-checkpoints.json').status === 0
    && git('check-ignore', '-q', '.forge/git-checkpoints.lock').status === 0
    && git('check-ignore', '-q', '.forge/git-checkpoint-operation.lock').status === 0
    && !git('ls-files', '--error-unmatch', '.forge/git-checkpoints.json').stdout.trim()
    && checkpointState.valid && checkpointState.record?.status === 'complete'
    && !fs.existsSync(path.join(project, '.forge', 'git-checkpoints.lock'))
    && !fs.existsSync(path.join(project, '.forge', 'git-checkpoint-operation.lock')),
  'durable Git checkpoint state survives late initialization but never enters project history');

  fs.writeFileSync(path.join(project, 'game.js'), 'export const score = 1;\n');
  const second = checkpointProjectGit({ projectRoot: project, message: 'forge: phase checkpoint' });
  check(Boolean(second.commit) && second.commit !== first.commit, 'changed project gets a new checkpoint commit');

  fs.mkdirSync(path.join(project, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(project, 'docs', 'pem-example.md'), 'Example:\n-----BEGIN PRIVATE KEY-----\n<base64 payload>\n-----END PRIVATE KEY-----\n');
  const docsCommit = checkpointProjectGit({ projectRoot: project, message: 'forge: documentation fixture' });
  check(Boolean(docsCommit.commit), 'bare PEM documentation markers do not trigger a false secret block');

  const realPem = path.join(project, 'leaked-private-key.txt');
  fs.writeFileSync(realPem, `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(96)}\n-----END PRIVATE KEY-----\n`);
  let pemBlocked = false;
  try { checkpointProjectGit({ projectRoot: project, message: 'forge: must refuse real PEM' }); }
  catch (error) { pemBlocked = /probable secret content/i.test(error.message); }
  check(pemBlocked, 'a plausible complete private key is still blocked');
  fs.rmSync(realPem, { force: true });
  git('add', '-A');

  fs.writeFileSync(path.join(project, '.openai_key'), 'must-not-be-tracked');
  checkpointProjectGit({ projectRoot: project, message: 'forge: ignored secret test' });
  check(!git('status', '--porcelain').stdout.includes('.openai_key'), 'dot-prefixed API key files stay untracked');

  const policyPath = configureWorkspaceGitPolicy(tmp, 'Nioris');
  const loaded = loadProjectGitPolicy(project);
  check(fs.existsSync(policyPath) && loaded.policy.github.enabled && loaded.policy.github.visibility === 'private'
    && loaded.policy.github.autoCreate && loaded.policy.github.autoPush,
  'workspace policy enables only private auto-create and auto-push');

  const phase7Policy = phaseCheckpointRemotePolicy(7);
  const phase8Policy = phaseCheckpointRemotePolicy(8);
  const phase8PreflightPolicy = phaseCheckpointRemotePolicy(8, { preflight: true });
  const phase9Policy = phaseCheckpointRemotePolicy(9);
  const phase9PreflightPolicy = phaseCheckpointRemotePolicy(9, { preflight: true });
  check(!phase7Policy.allowRemote && phase7Policy.allowRemoteFailure
    && phase8Policy.allowRemote && !phase8Policy.allowRemoteFailure
    && !phase8PreflightPolicy.allowRemote && phase8PreflightPolicy.allowRemoteFailure
    && phase9Policy.allowRemote && !phase9Policy.allowRemoteFailure
    && !phase9PreflightPolicy.allowRemote && phase9PreflightPolicy.allowRemoteFailure,
  'one shared policy keeps Phase 1-7/preflight local and makes configured Phase 8+ publication fail closed');

  let nestedCheckpointBlocked = false;
  let manualCheckpointBlocked = false;
  runPhaseGitCheckpoint({
    projectRoot: project, phase: 1, phaseName: 'Analyze', stage: 'reconcile',
    checkpoint: () => {
      try {
        runPhaseGitCheckpoint({
          projectRoot: project, phase: 2, phaseName: 'Design', stage: 'preflight',
          checkpoint: () => ({ commit: null, pushed: false, remote: null, remoteDeferred: true, warning: null }),
        });
      } catch (error) {
        nestedCheckpointBlocked = error.code === 'GIT_CHECKPOINT_CONFLICT';
      }
      try {
        checkpointProjectGit({ projectRoot: project, message: 'forge: forbidden parallel manual checkpoint' });
      } catch (error) {
        manualCheckpointBlocked = error.code === 'GIT_CHECKPOINT_CONFLICT';
      }
      return { commit: 'outer-fixture', pushed: false, remote: null, remoteDeferred: true, warning: null };
    },
  });
  check(nestedCheckpointBlocked && manualCheckpointBlocked
    && !fs.existsSync(path.join(project, '.forge', 'git-checkpoint-operation.lock')),
  'one owner lease covers phase and manual checkpoints and rejects a parallel commit/push');

  const malformedProject = path.join(tmp, 'malformed-ledger');
  fs.mkdirSync(path.join(malformedProject, '.forge'), { recursive: true });
  fs.writeFileSync(path.join(malformedProject, '.forge', 'git-checkpoints.json'), '{not-json\n');
  const malformed = readGitCheckpointLedger(malformedProject);
  check(malformed.present && !malformed.valid && malformed.ledger.phases['8'] == null,
    'a malformed checkpoint ledger is never interpreted as a successful release checkpoint');

  const noRemoteProject = path.join(tmp, 'phase8-without-private-push');
  fs.mkdirSync(noRemoteProject, { recursive: true });
  fs.writeFileSync(path.join(noRemoteProject, 'index.html'), '<!doctype html><title>No remote</title>\n');
  let strictRemoteBlocked = false;
  try {
    runPhaseGitCheckpoint({
      projectRoot: noRemoteProject, phase: 8, phaseName: 'Release', stage: 'complete',
      checkpoint: () => ({ commit: 'local-only', pushed: false, remote: null, remoteDeferred: false, warning: null }),
    });
  } catch (error) {
    strictRemoteBlocked = /push was not confirmed/i.test(error.message);
  }
  const noRemoteState = readPhaseGitCheckpoint(noRemoteProject, 8);
  check(strictRemoteBlocked && noRemoteState.record?.status === 'failed' && noRemoteState.record?.requiredRemote === true,
    'Phase 8 fails closed when no private GitHub push is configured or confirmed');

  const rawSecretMessage = 'push failed for https://alex:github_pat_123456789012345678901234567890@github.com/Nioris/game.git?token=secret-value';
  const safeSecretMessage = sanitizeGitCheckpointMessage(rawSecretMessage);
  check(!safeSecretMessage.includes('github_pat_') && !safeSecretMessage.includes('secret-value') && safeSecretMessage.includes('[redacted]'),
    'Git checkpoint diagnostics redact URL credentials and token query parameters');

  fs.writeFileSync(path.join(project, 'local-only.txt'), 'experimental phase checkpoint\n');
  const deferred = checkpointProjectGit({ projectRoot: project, message: 'forge: experimental local checkpoint', allowRemote: false });
  check(Boolean(deferred.commit) && deferred.remoteDeferred && !deferred.pushed,
    'experimental phase checkpoint can defer all GitHub contact while preserving the local commit');

  const privateFixture = process.env.FORGE_TEST_PRIVATE_REPO;
  if (privateFixture) {
    const [owner, repository] = privateFixture.split('/');
    const remoteProject = path.join(tmp, 'private-remote-check');
    fs.mkdirSync(remoteProject, { recursive: true });
    fs.writeFileSync(path.join(remoteProject, 'index.html'), '<!doctype html><title>Remote check</title>\n');
    fs.writeFileSync(path.join(remoteProject, '.forge-git.json'), JSON.stringify({
      github: { enabled: true, owner, repository, visibility: 'private', autoCreate: false, autoPush: false },
    }, null, 2));
    const remote = checkpointProjectGit({ projectRoot: remoteProject, message: 'forge: private remote check', allowRemoteFailure: false });
    check(remote.remote?.fullName === privateFixture && remote.pushed === false,
      'authenticated GitHub check accepts an existing private repository without pushing');
  }

  const publicFixture = process.env.FORGE_TEST_PUBLIC_REPO;
  if (publicFixture) {
    const [owner, repository] = publicFixture.split('/');
    const publicProject = path.join(tmp, 'public-remote-check');
    fs.mkdirSync(publicProject, { recursive: true });
    fs.writeFileSync(path.join(publicProject, 'index.html'), '<!doctype html><title>Public check</title>\n');
    fs.writeFileSync(path.join(publicProject, '.forge-git.json'), JSON.stringify({
      github: { enabled: true, owner, repository, visibility: 'private', autoCreate: false, autoPush: false },
    }, null, 2));
    let blocked = false;
    try { checkpointProjectGit({ projectRoot: publicProject, message: 'forge: public refusal check', allowRemoteFailure: false }); }
    catch (error) { blocked = /not private/i.test(error.message); }
    check(blocked, 'automatic GitHub workflow refuses an existing public repository');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (fail.length) process.exit(1);
console.log('\nPASS: Project Forge Git lifecycle is local-first, checkpointed and private-only');
