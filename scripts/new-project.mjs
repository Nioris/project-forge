#!/usr/bin/env node
/**
 * Create a sibling Project Forge project and immediately sync the unified Claude+Codex runtime.
 * Usage: node scripts/new-project.mjs <name> [--type game|app] [--engine web|godot]
 *        [--platform yandex[,steam]] [--platform telegram] [--title "Title"]
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkpointProjectGit } from '../.claude/skills/status/references/project-git.mjs';
import { createEngineProfileDocument, loadEngineRegistry } from './engine-profile.mjs';
import { createForgeTargetsDocument, loadPlatformRegistry } from './platform-profile.mjs';

const ENGINE = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const valueAfter = flag => { const i=args.indexOf(flag); return i >= 0 ? args[i+1] : null; };
const valuesAfter = flag => args.flatMap((value, index) => value === flag && args[index + 1] ? [args[index + 1]] : []);
const type = (valueAfter('--type') || 'game').toLowerCase();
const engine = (valueAfter('--engine') || 'web').toLowerCase();
const titleArg = valueAfter('--title');
const valueFlags = new Set(['--type', '--engine', '--title', '--platform']);
const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !valueFlags.has(args[i-1])));
const name = positional[0];
const title = titleArg || name;
const engineRegistry = loadEngineRegistry();
const engineDefinition = engineRegistry.profiles[engine];
const platformRegistry = loadPlatformRegistry();
const targets = valuesAfter('--platform')
  .flatMap(value => String(value).split(','))
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
let targetDocument = null;
try {
  if (targets.length) targetDocument = createForgeTargetsDocument(targets, platformRegistry);
} catch (error) {
  console.error(`[X] Invalid --platform selection: ${error.message}`);
  process.exit(2);
}

if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name) || !['game','app'].includes(type) || !engineDefinition) {
  console.error('Usage: node scripts/new-project.mjs <name-latin> [--type game|app] [--engine web|godot] [--platform yandex[,steam]] [--title "Title"]');
  process.exit(2);
}
if (!engineDefinition.projectTypes.includes(type)) {
  console.error(`[X] Engine ${engine} does not support project type ${type}. Allowed: ${engineDefinition.projectTypes.join(', ')}`);
  process.exit(2);
}
if (args.includes('--validate-only')) {
  console.log(JSON.stringify({
    ok: true,
    name,
    title,
    type,
    engine,
    status: engineDefinition.status,
    profile: createEngineProfileDocument(engine, engineRegistry),
    targets: targetDocument,
  }, null, 2));
  process.exit(0);
}
const dir = resolve(ENGINE, '..', name);
if (existsSync(dir)) { console.error('[X] Folder already exists:', dir); process.exit(2); }

for (const d of ['', 'GameIntegration', 'WorkProgress', 'Release', 'wiki', 'wiki/plan', 'wiki/sessions', 'wiki/features', 'wiki/design', 'wiki/phases', 'screens', 'assets', 'assets/style', 'assets/prompts', 'assets/generated/candidates', 'assets/generated/approved', 'wiki/ai', 'wiki/ai/art-reviews', 'wiki/qa'])
  mkdirSync(join(dir, d), { recursive: true });

const nextClaude = type === 'game' ? '/phase-1-analyze .' : '/app';
const nextCodex = type === 'game' ? '$phase-1-analyze .' : '$app';
const engineDocument = createEngineProfileDocument(engine, engineRegistry);
writeFileSync(join(dir, 'forge.engine.json'), JSON.stringify(engineDocument, null, 2) + '\n', 'utf8');
if (targetDocument) writeFileSync(join(dir, 'forge.targets.json'), JSON.stringify(targetDocument, null, 2) + '\n', 'utf8');
writeFileSync(join(dir, 'CLAUDE.md'), `# ${title}\n\nProject Forge managed ${type} project. Engine runtime rules are synced into AGENTS.md.\n\n## Project type\n${type}\n\n## Game engine\n${engine} (${engineDefinition.status})\n\n## What this is\n<one sentence: product/genre, platform, audience>\n\n## Forge state\nMutable progress does NOT live in this file. Use wiki/_current.md and wiki/phases/; /status derives progress from phase markers + artifacts.\n\nClaude Code: \`${nextClaude}\`\nCodex: \`${nextCodex}\`\n\n## Version\n0.1.0\n`);
writeFileSync(join(dir, 'wiki', '_map.md'), `# ${title} — project map\n\n### Done — major milestones\n\n### In progress\n- project created (${type}, engine: ${engine})\n`);
writeFileSync(join(dir, 'wiki', '_current.md'), `# Current state\n\nProject created (${type}, engine: ${engine}, status: ${engineDefinition.status}). No phase is complete yet.\n\nNext:\n- Claude Code: ${nextClaude}\n- Codex: ${nextCodex}\n`);
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
  'node_modules/\noutput/\nhandoff/\nscreens/video/\nscreens/review/\nassets/bible/\nassets/refs/\nassets/target/\nbackend/node_modules/\n.forge/runs/\n.forge/metrics/\n.forge/*.tmp\nwiki/diagnostics/forge-events*.jsonl\n.*_key\n.*_token\n*.key\n*.secret\n.env\n');

console.log(`Created ${type} project (${engine}, ${engineDefinition.status}): ${dir}`);
console.log('Syncing universal Forge runtime (Claude/Codex/generic agents)...\n');
execFileSync(process.execPath, [join(ENGINE, 'scripts', 'sync.mjs'), '--game', name], { stdio: 'inherit' });

const must = ['.claude/skills', '.claude/agents', '.agents/skills', '.codex/agents', '.codex/hooks.json', 'AGENTS.md', 'FORGE.md', 'forge.engine.json', ...(targetDocument ? ['forge.targets.json'] : []), '.gitverse/pr_rules/forge.md', '.forge-managed.json'];
const missing = must.filter(m => !existsSync(join(dir, m)));
if (missing.length) {
  console.error('[X] Sync incomplete:', missing.join(', '));
  process.exit(1);
}
const nClaude = readdirSync(join(dir, '.claude', 'skills'), { withFileTypes: true }).filter(e => e.isDirectory()).length;
const nCodex = readdirSync(join(dir, '.agents', 'skills'), { withFileTypes: true }).filter(e => e.isDirectory()).length;
const git = checkpointProjectGit({ projectRoot: dir, message: 'forge: create project', allowRemoteFailure: true });
if (git.warning) console.warn(`[Forge Git] ${git.warning}`);

console.log(`[OK] Ready: Claude skills=${nClaude}, Codex skills=${nCodex}, universal FORGE.md + GitVerse rules + managed sync manifest present.`);
console.log(`[OK] Storefront targets: ${targetDocument ? targetDocument.targets.join(', ') : 'not configured (Phase 8 will stop until forge.targets.json exists)'}.`);
console.log(`[OK] Git: ${git.commit ? `local commit ${git.commit}` : 'clean'}${git.pushed ? `; pushed to private ${git.remote.fullName}` : ''}.`);
console.log(`\nNext:\n  1. Put source/prototype in ${join(dir, 'GameIntegration')}\n  2. cd ${dir}\n  3a. Claude subscription: claude / cf(full) -> ${nextClaude}\n  3b. Claude API: node ../project-forge/scripts/forge-agent.mjs launch claude --profile api --full --project .\n  3c. Codex one-window phases: node ../project-forge/scripts/codex-pipeline.mjs --cwd .\n  3d. Codex manual session: codex / cx(full) -> ${nextCodex}\n  3e. Codex API: node ../project-forge/scripts/forge-agent.mjs launch codex --profile api --full --project .\n  3f. GigaChat API: node ../project-forge/scripts/forge-agent.mjs launch gigachat --profile api --full --project .\n  3g. Whole-project agent lock: node ../project-forge/scripts/forge-agent.mjs start <gemini|qwen|kimi|deepseek|glm|minimax|openrouter> --project .\n  3h. OpenRouter model list: node ../project-forge/scripts/forge-agent.mjs presets openrouter\n  3i. GigaCode CLI: optional/dormant until an executable is available.`);
