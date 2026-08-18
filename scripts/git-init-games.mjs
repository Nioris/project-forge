#!/usr/bin/env node
/**
 * Put existing sibling projects under Project Forge local-first Git management.
 * GitHub is used only when forge-data/git-policy.json explicitly enables private automation.
 * Usage: node scripts/git-init-games.mjs [--game NAME] [--dry]
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { checkpointProjectGit, loadProjectGitPolicy } from '../.claude/skills/status/references/project-git.mjs';

const ENGINE = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PARENT = resolve(ENGINE, '..');
const args = process.argv.slice(2);
const only = args.includes('--game') ? args[args.indexOf('--game') + 1] : null;
const dry = args.includes('--dry');
const isProject = p => existsSync(join(p, 'index.html')) || existsSync(join(p, 'CLAUDE.md')) || existsSync(join(p, 'GameIntegration'));
const projects = only ? [join(PARENT, only)] : readdirSync(PARENT, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== basename(ENGINE) && e.name !== 'forge-data')
  .map(e => join(PARENT, e.name)).filter(isProject);

if (!projects.length) { console.log('Projects not found next to', PARENT); process.exit(0); }
console.log(`Checking ${projects.length} project(s)${dry ? ' [DRY]' : ''}\n`);

let changed = 0, unchanged = 0, failed = 0;
for (const project of projects) {
  const name = basename(project);
  try {
    if (dry) {
      const { policy } = loadProjectGitPolicy(project);
      console.log(`  ${name.padEnd(24)} local=${existsSync(join(project, '.git')) ? 'existing' : 'create'} github=${policy.github?.enabled ? 'private/push' : 'off'}`);
      continue;
    }
    const result = checkpointProjectGit({ projectRoot: project, message: 'forge: onboard existing project', allowRemoteFailure: true });
    if (result.warning) console.warn(`  ${name.padEnd(24)} local OK; remote warning: ${result.warning}`);
    else console.log(`  ${name.padEnd(24)} ${result.commit ? `commit ${result.commit}` : 'clean'}${result.pushed ? ` → ${result.remote.fullName}` : ''}`);
    if (result.commit || result.pushed) changed++; else unchanged++;
  } catch (error) {
    console.error(`  ${name.padEnd(24)} ERROR ${error.message}`);
    failed++;
  }
}
console.log(`\nTotal: changed ${changed}, unchanged ${unchanged}${failed ? `, errors ${failed}` : ''}`);
if (failed) process.exitCode = 1;
