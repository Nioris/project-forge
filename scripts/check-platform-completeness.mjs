#!/usr/bin/env node
/**
 * @file check-platform-completeness.mjs
 * @description Audit which "completeness checks" each Forge platform passes.
 *
 *              Adding a platform means touching ~18 files: validators, scripts,
 *              templates, skills (release-, fill-, sdk-integration), agent, and
 *              cross-references in release-all/ready/gate/advisor + dashboard +
 *              setup.sh/.ps1 + README + GUIDE + workflow.
 *
 *              Without this check, drift is guaranteed. Lesson 17 from v4.7.0
 *              changelog: "Это 15 точек обновления для одной платформы."
 *
 *   Usage:
 *     node scripts/check-platform-completeness.mjs           # all platforms
 *     node scripts/check-platform-completeness.mjs steam     # one
 *     node scripts/check-platform-completeness.mjs --json    # machine-readable
 *
 *   Exit:
 *     0 — all platforms pass all checks
 *     1 — drift found (warnings only — pre-existing gaps in rustore/web are not blockers)
 *     2 — invocation error
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ALL_PLATFORMS = ['yandex', 'vk', 'telegram', 'ok', 'max', 'rustore', 'web', 'steam', 'vkplay'];

// Pre-existing gaps that we know about and accept (rustore/web don't have validators
// because their release flow is structurally different). Listing here means
// audit doesn't flag them as red.
const KNOWN_EXEMPTIONS = {
  rustore: [
    'platforms/{p}/scripts/pre-submit.mjs',
    'platforms/{p}/validators/',
    'platforms/{p}/templates/',
    '.claude/skills/{p}-sdk-integration/',
    '.claude/agents/{p}-builder.md',
  ],
  web: [
    'platforms/{p}/scripts/pre-submit.mjs',
    'platforms/{p}/validators/',
    'platforms/{p}/templates/',
    '.claude/skills/fill-{p}/',
    '.claude/skills/{p}-sdk-integration/',
    '.claude/agents/{p}-builder.md',
  ],
  // Some new platforms genuinely don't need fill-/sdk- skills until later
  telegram: [
    '.claude/skills/fill-{p}/',
    '.claude/skills/{p}-sdk-integration/',
  ],
  ok: [
    '.claude/skills/fill-{p}/',
    '.claude/skills/{p}-sdk-integration/',
  ],
  max: [
    '.claude/skills/fill-{p}/',
    '.claude/skills/{p}-sdk-integration/',
  ],
  vk: [
    'platforms/{p}/templates/',  // VK has empty templates dir, validators only
  ],
};

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function dirHasFiles(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return false;
  try {
    return fs.readdirSync(full).filter(n => !n.startsWith('.')).length > 0;
  } catch { return false; }
}

function fileContains(rel, needle) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return false;
  try {
    return fs.readFileSync(full, 'utf8').includes(needle);
  } catch { return false; }
}

const CHECKS = [
  { id: 'platforms/{p}/README.md',                 fn: p => exists(`platforms/${p}/README.md`) },
  { id: 'platforms/{p}/scripts/pre-submit.mjs',    fn: p => exists(`platforms/${p}/scripts/pre-submit.mjs`) },
  { id: 'platforms/{p}/validators/',               fn: p => dirHasFiles(`platforms/${p}/validators`) },
  { id: 'platforms/{p}/templates/',                fn: p => dirHasFiles(`platforms/${p}/templates`) },
  { id: '.claude/skills/release-{p}/',             fn: p => exists(`.claude/skills/release-${p}/SKILL.md`) },
  { id: '.claude/skills/fill-{p}/',                fn: p => exists(`.claude/skills/fill-${p}/SKILL.md`) },
  { id: '.claude/skills/{p}-sdk-integration/',     fn: p => exists(`.claude/skills/${p}-sdk-integration/SKILL.md`) },
  { id: '.claude/agents/{p}-builder.md',           fn: p => exists(`.claude/agents/${p}-builder.md`) },
  { id: 'release-all skill mentions {p}',          fn: p => fileContains('.claude/skills/release-all/SKILL.md', p) },
  { id: 'release-ready skill mentions {p}',        fn: p => fileContains('.claude/skills/release-ready/SKILL.md', p) },
  { id: 'gate skill mentions {p}',                 fn: p => fileContains('.claude/skills/gate/SKILL.md', p) },
  { id: 'advisor skill mentions {p}',              fn: p => fileContains('.claude/skills/advisor/SKILL.md', p) },
  { id: "dashboard.html PLATFORMS list",            fn: p => fileContains('dashboard.html', `id:'${p}'`) },
  { id: 'dashboard.html getBuildPrompt branch',    fn: p => fileContains('dashboard.html', `indexOf('${p}')>=0`) },
  { id: 'setup.sh platform matrix',                fn: p => fileContains('setup.sh', `${p}    `) || fileContains('setup.sh', `${p}     `) || fileContains('setup.sh', `${p}   `) || fileContains('setup.sh', `${p}     `) || fileContains('setup.sh', `${p}  `) },
  { id: 'setup.sh validation loop',                fn: p => fileContains('setup.sh', `'${p}'`) || fileContains('setup.sh', `${p} ${p === 'web' ? 'steam' : ''}`) || new RegExp(`for plat in [^;]*\\b${p}\\b`).test(fs.readFileSync(path.join(ROOT, 'setup.sh'), 'utf8')) },
  { id: 'README.md mentions {p}',                  fn: p => fileContains('README.md', p) },
  { id: 'GUIDE.md mentions {p}',                   fn: p => fileContains('GUIDE.md', p) },
  // release.yml existed in an earlier era (GitHub Actions). The repo no longer ships CI workflows
  // by design — releases run locally via skills. If .github/workflows/ is absent entirely, this
  // row is N/A (pass), NOT a failure: a check against a file that no longer exists by design is
  // perpetual noise (Lesson #95). It still verifies the matrix if the workflow file returns.
  { id: 'release.yml workflow matrix',             fn: p => !fs.existsSync(path.join(ROOT, '.github', 'workflows', 'release.yml'))
      || fileContains('.github/workflows/release.yml', `*-${p})`) || fileContains('.github/workflows/release.yml', `plat=${p}`) },
];

function isExempt(platform, checkId) {
  const platExemptions = KNOWN_EXEMPTIONS[platform] || [];
  return platExemptions.includes(checkId);
}

function audit(platforms = ALL_PLATFORMS) {
  const results = {};
  for (const p of platforms) {
    results[p] = {};
    for (const check of CHECKS) {
      const passed = check.fn(p);
      const exempt = isExempt(p, check.id);
      results[p][check.id] = { passed, exempt };
    }
  }
  return results;
}

function printMatrix(results, platforms) {
  const PASS = '✓', FAIL = '✗', EXEMPT = '~';

  // header
  process.stdout.write('Check'.padEnd(50) + ' | ');
  process.stdout.write(platforms.map(p => p.padEnd(8).slice(0, 8)).join('| '));
  process.stdout.write('\n');
  process.stdout.write('-'.repeat(50) + '-+-' + platforms.map(() => '-'.repeat(8)).join('+-') + '\n');

  for (const check of CHECKS) {
    process.stdout.write(check.id.padEnd(50) + ' | ');
    for (const p of platforms) {
      const r = results[p][check.id];
      const symbol = r.passed ? PASS : (r.exempt ? EXEMPT : FAIL);
      process.stdout.write((`  ${symbol}`).padEnd(8).slice(0, 8) + '| ');
    }
    process.stdout.write('\n');
  }

  // Summary
  console.log('\nLegend:  ✓ pass   ✗ fail   ~ exempt (known/accepted gap)');
  console.log('');

  let totalFails = 0;
  for (const p of platforms) {
    const fails = Object.entries(results[p])
      .filter(([_, r]) => !r.passed && !r.exempt);
    if (fails.length === 0) {
      console.log(`  ${p.toUpperCase()}: ✓ all checks pass`);
    } else {
      console.log(`  ${p.toUpperCase()}: ✗ ${fails.length} drift`);
      for (const [id] of fails) {
        console.log(`    ✗ ${id}`);
      }
      totalFails += fails.length;
    }
  }
  console.log('');
  if (totalFails === 0) {
    console.log('PERFECT: all platforms pass all non-exempt checks.');
  } else {
    console.log(`DRIFT: ${totalFails} non-exempt failures across platforms.`);
  }
  return totalFails;
}

// CLI
const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const platforms = args.filter(a => !a.startsWith('-'));

const targets = platforms.length > 0 ? platforms : ALL_PLATFORMS;
for (const p of targets) {
  if (!ALL_PLATFORMS.includes(p)) {
    console.error(`Unknown platform: ${p}. Valid: ${ALL_PLATFORMS.join(', ')}`);
    process.exit(2);
  }
}

const results = audit(targets);

if (wantJson) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const drift = printMatrix(results, targets);
process.exit(drift > 0 ? 1 : 0);
