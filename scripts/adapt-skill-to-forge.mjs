#!/usr/bin/env node
/**
 * @file adapt-skill-to-forge.mjs
 * @description Adapts marketplace-installed skill (from npx skills add) to Forge
 *              conventions. Public skills don't know about wiki/, Architectural
 *              Invariants, hooks integration. This wrapper:
 *                1. Reads installed SKILL.md
 *                2. Checks if it has Forge integration markers
 *                3. If missing — appends "Forge Integration" section
 *                4. Logs adaptation в wiki/_current.md
 *
 *              Idempotent — running twice не duplicates section.
 *
 * Usage:
 *   node scripts/adapt-skill-to-forge.mjs <skill-name>
 *   node scripts/adapt-skill-to-forge.mjs stripe-checkout
 *   node scripts/adapt-skill-to-forge.mjs --dry stripe-checkout
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const skillName = args.find(a => !a.startsWith('--'));

if (!skillName) {
  console.error('Usage: node scripts/adapt-skill-to-forge.mjs <skill-name>');
  process.exit(2);
}

const FORGE_ROOT = path.resolve(process.cwd());
const SKILL_PATH = path.join(FORGE_ROOT, '.claude', 'skills', skillName, 'SKILL.md');

if (!fs.existsSync(SKILL_PATH)) {
  console.error(`✗ Skill not found: ${SKILL_PATH}`);
  console.error('  Did you install it? npx skills add <owner/repo> -g -y');
  process.exit(2);
}

const FORGE_MARKER = '<!-- forge-adapted -->';
const FORGE_SECTION = `

${FORGE_MARKER}

## Forge Integration

> Auto-added by \`adapt-skill-to-forge.mjs\` on ${new Date().toISOString().slice(0, 10)}.
> This section adapts the skill to Project Forge conventions.

### Wiki cleanup (Architectural Invariant #14)

Per Architectural Invariant #14, **before** showing user any question:

1. Update \`wiki/_current.md\` — log что skill сделал (1-2 lines)
2. Update \`wiki/_map.md\` Done section если задача completed
3. Then print summary + question

Without this, Stop hook blocks → tool calls → user sees clutter scrolling.

### Project context

If skill operates on project files:
- Read \`wiki/_map.md\` first для understanding project structure
- Respect \`wiki/architecture/stack.md\` для tech choices
- Check \`wiki/_current.md\` для active task — don't conflict

### Hooks awareness

Forge has these active hooks:
- \`session-start.mjs\` — injects context на session begin
- \`stop-flush.mjs\` — wiki audit before turn end
- \`post-tool-capture.mjs\` — logs tool usage к session

Don't break these. If skill writes к \`wiki/sessions/*.md\` — append, не overwrite.

### Triggers reminder

This skill activates on description match. Forge users may invoke via:
- Direct \`/${skillName}\` command (Claude Code v2.1.101+)
- Description matching ("trigger words" в frontmatter)
- Through \`/game\` или \`/app\` smart routers

### If conflicts arise

If skill behavior conflicts с Forge conventions:
1. Forge conventions WIN (wiki/, hooks, _map.md updates)
2. Skill capability stays — but wraps in Forge structure
3. Document conflict в \`wiki/decisions/skill-${skillName}-adaptation.md\`
`;

// Read existing
const original = fs.readFileSync(SKILL_PATH, 'utf-8');

// Check if already adapted
if (original.includes(FORGE_MARKER)) {
  console.log(`✓ ${skillName} already adapted to Forge.`);
  console.log(`  Marker found: ${FORGE_MARKER}`);
  process.exit(0);
}

// Append section
const adapted = original.trimEnd() + FORGE_SECTION;

if (DRY) {
  console.log(`[DRY RUN] Would append Forge integration to ${SKILL_PATH}`);
  console.log(`  Adds ${FORGE_SECTION.split('\n').length} lines.`);
  process.exit(0);
}

fs.writeFileSync(SKILL_PATH, adapted, 'utf-8');
console.log(`✓ ${skillName} adapted to Forge.`);
console.log(`  Updated: ${SKILL_PATH}`);
console.log(`  Added section: ## Forge Integration`);

// Log в wiki/_current.md
const currentPath = path.join(FORGE_ROOT, 'wiki', '_current.md');
if (fs.existsSync(currentPath)) {
  try {
    const currentContent = fs.readFileSync(currentPath, 'utf-8');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const logEntry = `\n- ${stamp}: Adapted skill \`/${skillName}\` к Forge (added wiki integration section)`;

    // Find "## Done" section or append
    if (currentContent.includes('## Done')) {
      const updated = currentContent.replace(
        /## Done\s*\n/,
        `## Done\n${logEntry}\n`
      );
      fs.writeFileSync(currentPath, updated, 'utf-8');
    } else {
      fs.appendFileSync(currentPath, `\n## Done\n${logEntry}\n`, 'utf-8');
    }
    console.log(`  Logged to: wiki/_current.md`);
  } catch (e) {
    console.warn(`  ⚠ Could not log к wiki/_current.md: ${e.message}`);
  }
}

console.log('\nNext steps:');
console.log(`  1. Review the appended section в ${SKILL_PATH}`);
console.log(`  2. Test skill invocation: /${skillName} <your task>`);
console.log(`  3. Update advisor catalog: node scripts/update-advisor-catalog.mjs`);
