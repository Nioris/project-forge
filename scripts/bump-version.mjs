#!/usr/bin/env node
/**
 * @file bump-version.mjs
 * @description Safe version bump tool. Replaces only version-display strings,
 *              NEVER touches changelog headers (which contain historical versions
 *              that must remain unchanged).
 *
 *              v4.10.23: created after Lesson #56 — `sed -i 's/v4.10.X/v4.10.Y/g'`
 *              на CLAUDE.md catastrophically renamed all historic changelog
 *              headers (v4.10.5 → v4.10.22, etc) causing data loss.
 *
 *              This tool is opinionated: it knows WHICH places к update and WHICH
 *              к leave alone.
 *
 *              Files updated (version display, не history):
 *              - setup.sh, setup.ps1            — PROJECT FORGE v{N} banner
 *              - README.md                       — title `# Project Forge v{N}`
 *                                                 and `v{N}` в Quick Start section
 *                                                 (но NOT в changelog references)
 *              - GUIDE.md                        — banner note
 *              - dashboard.html                  — version display
 *              - .claude-plugin/plugin.json      — "version" field
 *              - .claude-plugin/marketplace.json — "version" field
 *              - CLAUDE.md                       — top display heading only
 *
 *              NEVER touched:
 *              - CLAUDE.md changelog/history headings
 *              - wiki/_map.md (changelog log)
 *              - docs/CHANGELOG.md (rotated history)
 *              - Any code comment с version number (historical commit context)
 *              - Any test fixture или sample output
 *
 * Usage:
 *   node scripts/bump-version.mjs 4.10.24
 *   node scripts/bump-version.mjs 4.10.24 --dry
 *   node scripts/bump-version.mjs --current        # show current version
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const SHOW = args.includes('--current');
const targetVersion = args.find(a => /^\d+\.\d+\.\d+$/.test(a));

// Корень определяем от РАСПОЛОЖЕНИЯ скрипта (scripts/ → родитель), cwd — запасной вариант:
// позволяет `node F:\...\project-forge\scripts\bump-version.mjs --current` из любой папки.
const SCRIPT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FORGE_ROOT = fs.existsSync(path.join(SCRIPT_ROOT, '.claude-plugin', 'plugin.json'))
  ? SCRIPT_ROOT : path.resolve(process.cwd());
process.chdir(FORGE_ROOT);
const PLUGIN_JSON = path.join(FORGE_ROOT, '.claude-plugin', 'plugin.json');

if (!fs.existsSync(PLUGIN_JSON)) {
  console.error('[X] Run from Forge root (.claude-plugin/plugin.json not found)');
  process.exit(2);
}

// Detect current version
const plugin = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf-8'));
const currentVersion = plugin.version;

if (SHOW) {
  console.log(`Current Forge version: ${currentVersion}`);
  process.exit(0);
}

if (!targetVersion) {
  console.error('Usage: node scripts/bump-version.mjs <X.Y.Z>');
  console.error(`Current: ${currentVersion}`);
  process.exit(2);
}

const sameVersion = targetVersion === currentVersion;
console.log(`${sameVersion ? 'Normalizing' : `Bumping ${currentVersion} →`} ${targetVersion}${DRY ? ' (DRY RUN)' : ''}\n`);

// Targeted replacements only. Each rule: { file, find pattern, replace template, description }
const RULES = [
  // Plugin manifests — JSON "version" field
  {
    file: '.claude-plugin/plugin.json',
    find: new RegExp(`"version":\\s*"${escapeReg(currentVersion)}"`),
    replace: `"version": "${targetVersion}"`,
    desc: 'plugin.json version field',
  },
  {
    file: '.claude-plugin/marketplace.json',
    find: new RegExp(`"version":\\s*"${escapeReg(currentVersion)}"`),
    replace: `"version": "${targetVersion}"`,
    desc: 'marketplace.json version field',
  },
  {
    file: 'scripts/gigachat-agent.mjs',
    find: /const AUDITED_FORGE_VERSION = '\d+\.\d+\.\d+';/,
    replace: `const AUDITED_FORGE_VERSION = '${targetVersion}';`,
    desc: 'GigaChat audited Forge contract version',
  },
  // CLAUDE.md top display heading only — historical changelog headers remain untouched
  {
    file: 'CLAUDE.md',
    find: /^# Project Forge v\d+\.\d+\.\d+ — Multi-Platform Project Bootstrapper/m,
    replace: `# Project Forge v${targetVersion} — Multi-Platform Project Bootstrapper`,
    desc: 'CLAUDE.md top version heading',
  },
  // setup.sh banner
  {
    file: 'setup.sh',
    find: /PROJECT FORGE v\d+\.\d+\.\d+/,
    replace: `PROJECT FORGE v${targetVersion}`,
    desc: 'setup.sh banner',
  },
  // setup.ps1 banner
  {
    file: 'setup.ps1',
    find: /PROJECT FORGE v\d+\.\d+\.\d+/,
    replace: `PROJECT FORGE v${targetVersion}`,
    desc: 'setup.ps1 banner',
  },
  // README.md title — only top heading, not changelog references
  {
    file: 'README.md',
    find: /^# Project Forge v\d+\.\d+\.\d+/m,
    replace: `# Project Forge v${targetVersion}`,
    desc: 'README.md title heading',
  },
  // README.md Quick start section heading
  {
    file: 'README.md',
    find: /## 🚀 Quick start \(v\d+\.\d+\.\d+\)/,
    replace: `## 🚀 Quick start (v${targetVersion})`,
    desc: 'README.md Quick start heading',
  },
  // README.md Standard workflow heading
  {
    file: 'README.md',
    find: /## Стандартные workflow \(v\d+\.\d+\.\d+\)/,
    replace: `## Стандартные workflow (v${targetVersion})`,
    desc: 'README.md Workflow heading',
  },
  // README zip filename example в Quick start
  {
    file: 'README.md',
    find: /project-forge-v\d+\.\d+\.\d+\.zip/g,
    replace: `project-forge-v${targetVersion}.zip`,
    desc: 'README.md zip filename examples',
    allowMultiple: true,
  },
  // Public repository README format (English + Russian)
  {
    file: 'README.md',
    find: /^\*\*Current public version:\*\* `v\d+\.\d+\.\d+`$/m,
    replace: `**Current public version:** \`v${targetVersion}\``,
    desc: 'README.md public version marker',
  },
  {
    file: 'README.md',
    find: /^`v\d+\.\d+\.\d+` keeps separate normal-account and API profiles\.$/m,
    replace: `\`v${targetVersion}\` keeps separate normal-account and API profiles.`,
    desc: 'README.md terminal launcher version',
  },
  {
    file: 'README_RU.md',
    find: /^\*\*Текущая публичная версия:\*\* `v\d+\.\d+\.\d+`$/m,
    replace: `**Текущая публичная версия:** \`v${targetVersion}\``,
    desc: 'README_RU.md public version marker',
  },
  {
    file: 'README_RU.md',
    find: /^В `v\d+\.\d+\.\d+` обычная авторизация и API-профили остаются разделены\.$/m,
    replace: `В \`v${targetVersion}\` обычная авторизация и API-профили остаются разделены.`,
    desc: 'README_RU.md terminal launcher version',
  },
  // СПРАВОЧНИК-КОМАНД.md title version
  {
    file: 'СПРАВОЧНИК-КОМАНД.md',
    find: /^# Project Forge v\d+\.\d+\.\d+ — справочник команд/m,
    replace: `# Project Forge v${targetVersion} — справочник команд`,
    desc: 'СПРАВОЧНИК-КОМАНД.md title version',
  },
  // GUIDE.md banner only (top, не examples)
  {
    file: 'GUIDE.md',
    find: /^# Project Forge v\d+\.\d+\.\d+/m,
    replace: `# Project Forge v${targetVersion}`,
    desc: 'GUIDE.md title heading',
  },
  // dashboard.html version display
  {
    file: 'dashboard.html',
    find: /Dashboard · v\d+\.\d+\.\d+/g,
    replace: `Dashboard · v${targetVersion}`,
    desc: 'dashboard.html header version display',
  },
  {
    file: 'dashboard.html',
    find: /Quick start \(v\d+\.\d+\.\d+\)/g,
    replace: `Quick start (v${targetVersion})`,
    desc: 'dashboard.html quick-start version',
    allowMultiple: true,
  },
  // wiki/_map.md "latest released" pointer (single line)
  {
    file: 'wiki/_map.md',
    find: /### Version: v\d+\.\d+\.\d+ \(latest released\)/,
    replace: `### Version: v${targetVersion} (latest released)`,
    desc: 'wiki/_map.md latest release pointer',
  },
];

let applied = 0;
let missing = 0;

for (const rule of RULES) {
  const filePath = path.join(FORGE_ROOT, rule.file);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠ skip ${rule.file} (not found)`);
    missing++;
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const matches = content.match(rule.find);

  if (!matches) {
    console.log(`  ⚠ ${rule.file}: pattern not found — ${rule.desc}`);
    missing++;
    continue;
  }

  // Replace
  const updated = content.replace(rule.find, rule.replace);
  const replacedCount = (content.match(new RegExp(rule.find.source, rule.find.flags + (rule.find.flags.includes('g') ? '' : 'g'))) || []).length;

  if (!DRY) {
    fs.writeFileSync(filePath, updated, 'utf-8');
  }

  console.log(`  ✓ ${rule.file}: ${rule.desc} (${replacedCount} replacement${replacedCount === 1 ? '' : 's'})`);
  applied++;
}

console.log(`\n${DRY ? '[DRY RUN] Would apply' : 'Applied'} ${applied} change(s). ${missing} pattern(s) not found.`);
if (missing > 0) {
  console.log(`\nNote: missing patterns могут be ОК if those files don't have version display.`);
  console.log(`If you expected ALL rules к apply — check that current version (${currentVersion}) is correct.`);
}

if (!DRY) {
  // Proactive guard: warn if CLAUDE.md is over the soft limit so the "keep latest 3" rule
  // gets enforced instead of silently drifting (the v4.11.x audit found it at 91 KB).
  try {
    const cmPath = path.join(FORGE_ROOT, "CLAUDE.md");
    if (fs.existsSync(cmPath)) {
      const kb = fs.statSync(cmPath).size / 1024;
      if (kb > 30) {
        console.log(`\n⚠ CLAUDE.md is ${kb.toFixed(1)} KB (over 30 KB soft limit).`);
        console.log(`  → After adding the v${targetVersion} changelog, run:  node scripts/rotate-changelog.mjs`);
        console.log(`    (rotates old sections to docs/CHANGELOG.md, keeps latest 3 — byte-verified)`);
      }
    }
  } catch { /* fail-soft — size guard never blocks a bump */ }

  // Generated surfaces are versioned output: refresh them as part of the bump.
  console.log(`\nRefreshing generated Claude/Codex/dashboard surfaces...`);
  for (const argv of [
    ['scripts/generate-agents-md.mjs'],
    ['scripts/sync-codex-adapter.mjs'],
    ['scripts/sync-dashboard-meta.mjs'],
  ]) {
    const r = spawnSync(process.execPath, argv, { cwd: FORGE_ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`[X] Generated-surface refresh failed: node ${argv.join(' ')}`);
      process.exit(r.status || 1);
    }
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Add new changelog section к CLAUDE.md (manually, или via your bump workflow)`);
  console.log(`  2. Add wiki/_map.md entry: "- ${new Date().toISOString().slice(0, 10)}: **v${targetVersion}** — ..."`);
  console.log(`  3. node scripts/rotate-changelog.mjs   # if CLAUDE.md over limit (keeps latest 3)`);
  console.log(`  4. node scripts/generate-manifest.mjs  # regenerate manifest`);
  console.log(`  5. node scripts/check-drift.mjs        # self-audit before ship`);
  console.log(`  6. Run verifiers + ship`);
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
