#!/usr/bin/env node
/** Initialize or inspect Project Forge AI Studio state in a sibling project. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(here, '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const targetArg = args.find(a => !a.startsWith('--')) || '.';
const project = resolve(targetArg);
const configPath = join(project, '.forge-ai.json');
const template = join(ENGINE, 'templates', 'ai-studio', 'project-config.json');

if (!existsSync(project)) {
  console.error('[X] Project path not found:', project);
  process.exit(2);
}

const dirs = [
  'assets/style', 'assets/prompts', 'assets/generated/candidates', 'assets/generated/approved',
  'wiki/ai', 'wiki/ai/art-reviews', 'wiki/qa',
];

if (!CHECK) {
  for (const rel of dirs) mkdirSync(join(project, rel), { recursive: true });
  if (!existsSync(configPath)) copyFileSync(template, configPath);
  else {
    try {
      const current = JSON.parse(readFileSync(configPath, 'utf8'));
      if (current.schemaVersion === 1) {
        const defaults = JSON.parse(readFileSync(template, 'utf8'));
        current.schemaVersion = 2;
        current.providers ||= defaults.providers;
        current.fallback ||= {};
        if (current.fallback.openaiApi === undefined) current.fallback.openaiApi = true;
        if (current.fallback.gigachatApi === undefined) current.fallback.gigachatApi = true;
        if (current.fallback.openRouter === undefined) current.fallback.openRouter = false;
        writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
        console.log('[OK] AI Studio config migrated: schema 1 -> 2 (no secrets written)');
      }
    } catch {}
  }
  const style = join(project, 'assets', 'style', 'STYLE-BIBLE.md');
  if (!existsSync(style)) writeFileSync(style, '# STYLE BIBLE\n\nStatus: draft — Phase 4 `/art-direction` must approve visual DNA before mass generation.\n', 'utf8');
}

const problems = [];
if (!existsSync(configPath)) problems.push('.forge-ai.json missing');
else {
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    if (![1,2].includes(cfg.schemaVersion)) problems.push('schemaVersion must be 1 or 2');
    if (!['codex-native','openai-api','gigachat-api'].includes(cfg.provider)) problems.push('provider must be codex-native, openai-api or gigachat-api');
    if (cfg?.fallback?.openRouter !== false) problems.push('fallback.openRouter must remain false unless explicitly re-enabled by the project');
    if (cfg.schemaVersion >= 2 && !cfg?.providers?.gigachat) problems.push('schemaVersion 2 requires providers.gigachat');
    if (!cfg?.paths?.promptDir || !cfg?.paths?.generatedDir) problems.push('paths.promptDir/generatedDir missing');
  } catch (e) { problems.push('invalid .forge-ai.json: ' + e.message); }
}
for (const rel of dirs) if (!existsSync(join(project, rel))) problems.push(`${rel} missing`);

if (problems.length) {
  console.error('[X] AI Studio state incomplete:');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}
console.log(`[OK] AI Studio ready: ${project}`);
console.log('  providers: native host (default), OpenAI API and GigaChat API optional direct backends');
console.log('  prompts: assets/prompts | generated: assets/generated | QA: wiki/qa');
