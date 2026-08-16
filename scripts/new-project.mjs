#!/usr/bin/env node
/**
 * Create a sibling Project Forge project and immediately sync the unified Claude+Codex runtime.
 * Usage: node scripts/new-project.mjs <name> [--type game|app] [--title "Title"]
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const ENGINE = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const valueAfter = flag => { const i=args.indexOf(flag); return i >= 0 ? args[i+1] : null; };
const type = (valueAfter('--type') || 'game').toLowerCase();
const titleArg = valueAfter('--title');
const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !['--type','--title'].includes(args[i-1])));
const name = positional[0];
const title = titleArg || name;

if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name) || !['game','app'].includes(type)) {
  console.error('Usage: node scripts/new-project.mjs <name-latin> [--type game|app] [--title "Title"]');
  process.exit(2);
}
const dir = resolve(ENGINE, '..', name);
if (existsSync(dir)) { console.error('[X] Folder already exists:', dir); process.exit(2); }

for (const d of ['', 'GameIntegration', 'WorkProgress', 'Release', 'wiki', 'wiki/plan', 'wiki/sessions', 'wiki/features', 'wiki/design', 'wiki/phases', 'screens', 'assets', 'assets/style', 'assets/prompts', 'assets/generated/candidates', 'assets/generated/approved', 'wiki/ai', 'wiki/ai/art-reviews', 'wiki/qa'])
  mkdirSync(join(dir, d), { recursive: true });

const nextClaude = type === 'game' ? '/phase-1-analyze .' : '/app';
const nextCodex = type === 'game' ? '$phase-1-analyze .' : '$app';
writeFileSync(join(dir, 'CLAUDE.md'), `# ${title}\n\nProject Forge managed ${type} project. Engine runtime rules are synced into AGENTS.md.\n\n## Project type\n${type}\n\n## What this is\n<one sentence: product/genre, platform, audience>\n\n## Forge state\nMutable progress does NOT live in this file. Use wiki/_current.md and wiki/phases/; /status derives progress from phase markers + artifacts.\n\nClaude Code: \`${nextClaude}\`\nCodex: \`${nextCodex}\`\n\n## Version\n0.1.0\n`);
writeFileSync(join(dir, 'wiki', '_map.md'), `# ${title} — project map\n\n### Done — major milestones\n\n### In progress\n- project created (${type})\n`);
writeFileSync(join(dir, 'wiki', '_current.md'), `# Current state\n\nProject created (${type}). No phase is complete yet.\n\nNext:\n- Claude Code: ${nextClaude}\n- Codex: ${nextCodex}\n`);
try {
  const tpl = join(ENGINE, 'templates', 'wiki', 'brief.md');
  if (existsSync(tpl)) copyFileSync(tpl, join(dir, 'wiki', 'design', 'brief.md'));
} catch {}
try {
  const tpl = join(ENGINE, 'templates', 'ai-studio', 'project-config.json');
  if (existsSync(tpl)) copyFileSync(tpl, join(dir, '.forge-ai.json'));
  writeFileSync(join(dir, 'assets', 'style', 'STYLE-BIBLE.md'), '# STYLE BIBLE\n\nStatus: draft — approve in Phase 4 before mass generation.\n');
} catch {}
writeFileSync(join(dir, '.gitignore'),
  'node_modules/\noutput/\nhandoff/\nscreens/video/\nscreens/review/\nassets/bible/\nassets/refs/\nassets/target/\nbackend/node_modules/\n.*_key\n.*_token\n*.key\n*.secret\n.env\n');

console.log(`Created ${type} project: ${dir}`);
console.log('Syncing universal Forge runtime (Claude/Codex/generic agents)...\n');
execFileSync(process.execPath, [join(ENGINE, 'scripts', 'sync.mjs'), '--game', name], { stdio: 'inherit' });

const must = ['.claude/skills', '.claude/agents', '.agents/skills', '.codex/agents', '.codex/hooks.json', 'AGENTS.md', 'FORGE.md', '.gitverse/pr_rules/forge.md', '.forge-managed.json'];
const missing = must.filter(m => !existsSync(join(dir, m)));
if (missing.length) {
  console.error('[X] Sync incomplete:', missing.join(', '));
  process.exit(1);
}
const nClaude = readdirSync(join(dir, '.claude', 'skills'), { withFileTypes: true }).filter(e => e.isDirectory()).length;
const nCodex = readdirSync(join(dir, '.agents', 'skills'), { withFileTypes: true }).filter(e => e.isDirectory()).length;
try {
  execSync('git init -q', { cwd: dir, stdio: 'ignore' });
  execSync('git add -A', { cwd: dir, stdio: 'ignore' });
  execSync('git -c user.email=forge@local -c user.name=Forge commit -q -m "Project created"', { cwd: dir, stdio: 'ignore' });
} catch {}

console.log(`[OK] Ready: Claude skills=${nClaude}, Codex skills=${nCodex}, universal FORGE.md + GitVerse rules + managed sync manifest present.`);
console.log(`\nNext:\n  1. Put source/prototype in ${join(dir, 'GameIntegration')}\n  2. cd ${dir}\n  3a. Claude subscription: claude / cf(full) -> ${nextClaude}\n  3b. Claude API: node ../project-forge/scripts/forge-agent.mjs launch claude --profile api --full --project .\n  3c. Codex ChatGPT: codex / cx(full) -> ${nextCodex}\n  3d. Codex API: node ../project-forge/scripts/forge-agent.mjs launch codex --profile api --full --project .\n  3e. GigaChat API: node ../project-forge/scripts/forge-agent.mjs launch gigachat --profile api --full --project .\n  3f. GigaCode CLI: optional/dormant until an executable is available.`);
