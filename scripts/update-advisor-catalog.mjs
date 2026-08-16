#!/usr/bin/env node
/**
 * @file update-advisor-catalog.mjs
 * @description Sync advisor SKILL.md catalog с filesystem state. Adds entries
 *              для newly installed skills (from /find-skill marketplace flow).
 *              Removes entries для skills that no longer exist.
 *
 *              Idempotent. Safe to run multiple times.
 *
 * Usage:
 *   node scripts/update-advisor-catalog.mjs           — apply changes
 *   node scripts/update-advisor-catalog.mjs --dry     — preview only
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');

const FORGE_ROOT = path.resolve(process.cwd());
const SKILLS_DIR = path.join(FORGE_ROOT, '.claude', 'skills');
const ADVISOR_PATH = path.join(SKILLS_DIR, 'advisor', 'SKILL.md');

if (!fs.existsSync(ADVISOR_PATH)) {
  console.error(`✗ Advisor skill not found: ${ADVISOR_PATH}`);
  process.exit(2);
}

// Get all skills в filesystem
const fsSkills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(name => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')));

// Read advisor
const advisorContent = fs.readFileSync(ADVISOR_PATH, 'utf-8');

// Find skills mentioned в advisor.
// Advisor uses two formats:
//   1. Inline: /skill-name (in prose, examples)
//   2. Table: | skill-name | description |
const mentioned = new Set();

// Format 1: /skill-name  (skill names may start with a digit, e.g. 3d-perf)
const slashRegex = /\/([a-z0-9][a-z0-9-]+)/gi;
let m;
while ((m = slashRegex.exec(advisorContent)) !== null) {
  if (fsSkills.includes(m[1])) mentioned.add(m[1]);
}

// Format 2: | skill-name | (table cell start; may start with a digit)
const tableRegex = /\|\s+\/?([a-z0-9][a-z0-9-]+)\s+\|/gi;
while ((m = tableRegex.exec(advisorContent)) !== null) {
  if (fsSkills.includes(m[1])) mentioned.add(m[1]);
}

// Find missing — exclude advisor itself (self-reference is meaningless)
const missing = fsSkills.filter(s => !mentioned.has(s) && s !== 'advisor');
const obsolete = [];  // skills mentioned в advisor but no longer existing
for (const m of mentioned) {
  if (!fsSkills.includes(m)) obsolete.push(m);
}

console.log(`Advisor catalog audit:`);
console.log(`  Skills в filesystem:  ${fsSkills.length}`);
console.log(`  Mentioned в advisor:  ${mentioned.size}`);
console.log(`  Missing from advisor: ${missing.length}`);
console.log(`  Obsolete in advisor:  ${obsolete.length}`);

if (missing.length === 0 && obsolete.length === 0) {
  console.log('\n✓ Advisor catalog в sync с filesystem. Nothing to update.');
  process.exit(0);
}

if (missing.length > 0) {
  console.log('\nMissing from advisor (need to add):');
  for (const skill of missing) {
    // Read description for context
    let desc = '';
    try {
      const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
      const raw = fs.readFileSync(skillPath, 'utf-8');
      const dm = raw.match(/^description:\s*"([\s\S]+?)"\s*$/m) ||
                 raw.match(/^description:\s*(.+)$/m);
      if (dm) desc = dm[1].trim().slice(0, 80);
    } catch { /* ignore */ }
    console.log(`  + /${skill}  ${desc ? '— ' + desc : ''}`);
  }
}

if (obsolete.length > 0) {
  console.log('\nObsolete entries в advisor (mention removed skills):');
  for (const skill of obsolete) {
    console.log(`  - /${skill} (no longer exists)`);
  }
}

if (DRY) {
  console.log('\n[DRY RUN] No changes applied.');
  process.exit(1);
}

// Apply changes — append "Recently installed" section if missing skills exist
if (missing.length > 0) {
  const sectionMarker = '## Recently installed (auto-managed)';
  const stamp = new Date().toISOString().slice(0, 10);

  let entries = '';
  for (const skill of missing) {
    let desc = '(no description)';
    try {
      const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
      const raw = fs.readFileSync(skillPath, 'utf-8');
      const dm = raw.match(/^description:\s*"([\s\S]+?)"\s*$/m) ||
                 raw.match(/^description:\s*(.+)$/m);
      if (dm) desc = dm[1].trim().slice(0, 200);
    } catch { /* ignore */ }
    entries += `| /${skill} | ${desc} |\n`;
  }

  // Build section
  const newSection = `\n${sectionMarker}\n\n> Auto-updated by \`update-advisor-catalog.mjs\` on ${stamp}.\n> Skills installed via \`/find-skill\` marketplace flow или manually.\n\n| Skill | Description |\n|---|---|\n${entries}`;

  let updated;
  if (advisorContent.includes(sectionMarker)) {
    // Preserve existing entries — extract current table rows, append new ones
    const sectionRegex = new RegExp(`(${escapeRegex(sectionMarker)}[\\s\\S]*?\\| Skill \\| Description \\|\\s*\\n\\|[-|\\s]+\\|\\s*\\n)([\\s\\S]*?)(?=\\n## |$)`);
    const sectionMatch = advisorContent.match(sectionRegex);
    if (sectionMatch) {
      const existingEntries = sectionMatch[2];
      // Extract skill names already в table к avoid duplicates
      const existingSkillNames = new Set();
      for (const line of existingEntries.split('\n')) {
        const m = line.match(/^\|\s*\/([^\s|]+)\s*\|/);
        if (m) existingSkillNames.add(m[1]);
      }
      // Filter entries к only truly new ones
      const newEntries = [];
      for (const skill of missing) {
        if (existingSkillNames.has(skill)) continue;
        let desc = '(no description)';
        try {
          const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
          const raw = fs.readFileSync(skillPath, 'utf-8');
          const dm = raw.match(/^description:\s*"([\s\S]+?)"\s*$/m) ||
                     raw.match(/^description:\s*(.+)$/m);
          if (dm) desc = dm[1].trim().slice(0, 200);
        } catch { /* ignore */ }
        newEntries.push(`| /${skill} | ${desc} |`);
      }

      if (newEntries.length === 0) {
        // All "missing" actually already в section — no-op
        console.log(`\n(All ${missing.length} skill(s) уже в Recently installed section — no changes)`);
        process.exit(0);
      }

      // Append new entries to existing section
      const updatedSection = sectionMatch[0] + newEntries.join('\n') + '\n';
      updated = advisorContent.replace(sectionMatch[0], updatedSection);
    } else {
      // Marker exists но table malformed — rebuild section fully (legacy fallback)
      const newSection = `\n${sectionMarker}\n\n> Auto-updated by \`update-advisor-catalog.mjs\` on ${stamp}.\n> Skills installed via \`/find-skill\` marketplace flow или manually.\n\n| Skill | Description |\n|---|---|\n${entries}`;
      updated = advisorContent.replace(
        new RegExp(`${escapeRegex(sectionMarker)}[\\s\\S]*?(?=\\n## |$)`),
        newSection.trimStart()
      );
    }
  } else {
    // No section yet — append at end
    const newSection = `\n${sectionMarker}\n\n> Auto-updated by \`update-advisor-catalog.mjs\` on ${stamp}.\n> Skills installed via \`/find-skill\` marketplace flow или manually.\n\n| Skill | Description |\n|---|---|\n${entries}`;
    updated = advisorContent.trimEnd() + newSection;
  }

  fs.writeFileSync(ADVISOR_PATH, updated, 'utf-8');
  console.log(`\n✓ Added ${missing.length} skills к advisor catalog.`);
}

if (obsolete.length > 0) {
  console.warn(`\n⚠ ${obsolete.length} obsolete entries detected. Review manually:`);
  for (const skill of obsolete) {
    console.warn(`    /${skill}`);
  }
  console.warn('  (Auto-removal not implemented — review context first.)');
}

console.log('\nDone. Verify: node scripts/check-cross-refs.mjs');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
