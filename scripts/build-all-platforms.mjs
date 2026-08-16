#!/usr/bin/env node
/**
 * @file build-all-platforms.mjs
 * @description Cross-platform build orchestrator. Iterates through
 *              WorkProgress/{Project}-<platform>/ directories and runs
 *              each platform's pre-submit gate, then summarises.
 *
 *              Does NOT perform the actual ZIP/APK builds — those are
 *              platform-specific and live in each adapter's scripts/.
 *              This is the COORDINATION layer.
 *
 *   Usage:
 *     node scripts/build-all-platforms.mjs {ProjectName}
 *     node scripts/build-all-platforms.mjs {ProjectName} --gate-only
 *     node scripts/build-all-platforms.mjs --list           # list detected projects
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const PLATFORMS = ['yandex', 'vk', 'telegram', 'ok', 'max'];
// rustore and web don't have pre-submit.mjs yet; add when available

function listProjects() {
  const wp = path.join(root, 'WorkProgress');
  if (!fs.existsSync(wp)) return [];
  const raw = fs.readdirSync(wp, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map(d => d.name);
  // Strip platform suffixes so `TestProject-max` and `TestProject-telegram`
  // collapse into a single project `TestProject`.
  const baseNames = new Set();
  for (const name of raw) {
    let stripped = name;
    for (const p of PLATFORMS) {
      const suffix = '-' + p;
      if (stripped.endsWith(suffix)) { stripped = stripped.slice(0, -suffix.length); break; }
    }
    baseNames.add(stripped);
  }
  return [...baseNames].sort();
}

function findPlatformCopies(project) {
  const wp = path.join(root, 'WorkProgress');
  const all = fs.readdirSync(wp, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  const result = {};
  for (const p of PLATFORMS) {
    const suffixed = `${project}-${p}`;
    if (all.includes(suffixed)) result[p] = suffixed;
  }
  // Also: base directory counts for yandex by default
  if (all.includes(project) && !result.yandex) result.yandex = project;
  return result;
}

function runGate(platform, workDir) {
  const script = path.join(root, 'platforms', platform, 'scripts', 'pre-submit.mjs');
  if (!fs.existsSync(script)) return { platform, skipped: true, reason: 'no pre-submit script' };
  const absWork = path.join(root, 'WorkProgress', workDir);
  try {
    execSync(`node "${script}" "${absWork}"`, { stdio: 'inherit', cwd: root });
    return { platform, workDir, ok: true };
  } catch (e) {
    return { platform, workDir, ok: false, exit: e.status || 1 };
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list') || args.length === 0) {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log('(no projects in WorkProgress/)');
      return;
    }
    console.log('Detected projects in WorkProgress/:');
    for (const p of projects) {
      const copies = findPlatformCopies(p);
      console.log(`  ${p}`);
      for (const [plat, dir] of Object.entries(copies)) {
        console.log(`    ${plat.padEnd(10)} → WorkProgress/${dir}/`);
      }
    }
    console.log('\nUsage: node scripts/build-all-platforms.mjs <ProjectName>');
    return;
  }

  const projectName = args.find(a => !a.startsWith('-'));
  if (!projectName) {
    console.error('Specify a project name. Use --list to see available.');
    process.exit(2);
  }

  const copies = findPlatformCopies(projectName);
  if (Object.keys(copies).length === 0) {
    console.error(`No WorkProgress copies found for "${projectName}".`);
    console.error('Expected WorkProgress/' + projectName + '/ or WorkProgress/' + projectName + '-<platform>/');
    process.exit(2);
  }

  console.log('\n========================================================');
  console.log('  BUILD-ALL ORCHESTRATOR: ' + projectName);
  console.log('========================================================');
  console.log('Platforms detected:', Object.keys(copies).join(', '));
  console.log('');

  const results = [];
  for (const [platform, workDir] of Object.entries(copies)) {
    console.log('\n--- ' + platform.toUpperCase() + ' (' + workDir + ') ---\n');
    results.push(runGate(platform, workDir));
  }

  console.log('\n========================================================');
  console.log('  SUMMARY');
  console.log('========================================================');
  for (const r of results) {
    if (r.skipped) {
      console.log('  [SKIP] ' + r.platform.padEnd(10) + ' — ' + r.reason);
    } else if (r.ok) {
      console.log('  [OK]   ' + r.platform.padEnd(10) + ' — gate passed, ready for /release ' + r.platform);
    } else {
      console.log('  [FAIL] ' + r.platform.padEnd(10) + ' — exit ' + r.exit + '; fix blockers and re-run');
    }
  }
  console.log('');
  const hasFail = results.some(r => r.ok === false);
  process.exit(hasFail ? 1 : 0);
}

main();
