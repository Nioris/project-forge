#!/usr/bin/env node
/** Offline regression for local-first Git checkpoints and private-only policy. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkpointProjectGit, configureWorkspaceGitPolicy, loadProjectGitPolicy,
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
  const first = checkpointProjectGit({ projectRoot: project, message: 'forge: initial test' });
  check(first.initialized && Boolean(first.commit), 'new project gets a local main repository and first commit');
  const ignore = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  check(ignore.includes('custom-cache/') && ignore.match(/Project Forge managed secrets/g)?.length === 2,
    'managed ignores are appended without destroying project rules');

  fs.writeFileSync(path.join(project, 'game.js'), 'export const score = 1;\n');
  const second = checkpointProjectGit({ projectRoot: project, message: 'forge: phase checkpoint' });
  check(Boolean(second.commit) && second.commit !== first.commit, 'changed project gets a new checkpoint commit');

  fs.writeFileSync(path.join(project, '.openai_key'), 'must-not-be-tracked');
  checkpointProjectGit({ projectRoot: project, message: 'forge: ignored secret test' });
  check(!git('status', '--porcelain').stdout.includes('.openai_key'), 'dot-prefixed API key files stay untracked');

  const policyPath = configureWorkspaceGitPolicy(tmp, 'Nioris');
  const loaded = loadProjectGitPolicy(project);
  check(fs.existsSync(policyPath) && loaded.policy.github.enabled && loaded.policy.github.visibility === 'private'
    && loaded.policy.github.autoCreate && loaded.policy.github.autoPush,
  'workspace policy enables only private auto-create and auto-push');

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
