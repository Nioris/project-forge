#!/usr/bin/env node
/** Verify Forge 4.68 universal agent runtime + GigaChat dry-run backends without network calls. */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(process.cwd());
const errors = [];
const ok = [];
const need = rel => { if (!existsSync(join(ROOT, rel))) errors.push(`${rel} missing`); else ok.push(`${rel} present`); };
for (const rel of [
  'FORGE.project.md', 'adapters/agents.json', 'scripts/forge-agent.mjs',
  '.gitverse/pr_rules/forge.md', 'scripts/gigachat-image.mjs', 'scripts/gigachat-3d.mjs',
  'scripts/gigachat-agent.mjs', 'scripts/forge-secrets.mjs', 'scripts/forge-secret-helper.mjs',
  'scripts/lib/gigachat-api.mjs', 'scripts/lib/forge-secrets.mjs',
]) need(rel);

try {
  const reg = JSON.parse(readFileSync(join(ROOT, 'adapters/agents.json'), 'utf8'));
  for (const name of ['claude','codex','gigachat','gigacode','gemini','qwen','deepseek','glm','minimax','kimi','openrouter']) if (!reg.agents?.[name]) errors.push(`adapter missing: ${name}`);
  if (!String(reg.agents?.gigacode?.status||'').startsWith('experimental')) errors.push('GigaCode adapter must remain explicitly experimental until CLI contract is verified');
  if (!reg.agents?.gigacode?.executableEnv) errors.push('GigaCode adapter lacks executable override env');
  if (reg.schemaVersion < 3) errors.push('agent registry schema must support whole-project model locks');
  else ok.push('agent registry has stable hosts plus seven experimental whole-project agents');
} catch (e) { errors.push('invalid adapters/agents.json: ' + e.message); }

const spec = readFileSync(join(ROOT, 'scripts/forge-sync-spec.mjs'), 'utf8');
if (!spec.includes("['FORGE.project.md', 'FORGE.md']")) errors.push('FORGE.md not in managed sibling payload');
else ok.push('FORGE.md is managed sibling payload');
for (const rules of ['GEMINI.md', 'QWEN.md']) {
  if (!spec.includes(`['${rules}', '${rules}']`)) errors.push(`${rules} not in managed sibling payload`);
  else ok.push(`${rules} is managed sibling payload`);
}
if (!spec.includes("['.gitverse/pr_rules', '.gitverse/pr_rules']")) errors.push('GitVerse PR rules not in managed sibling payload');
else ok.push('GitVerse PR rules are managed sibling payload');

function run(label, argv, contains) {
  const r = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: 'utf8' });
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (r.status !== 0 || (contains && !text.includes(contains))) errors.push(`${label} failed: ${text.trim().slice(0,500)}`);
  else ok.push(label);
}
run('generic GigaCode skill prompt', ['scripts/forge-agent.mjs','prompt','gigacode','--skill','phase-2-design','--args','.'], 'Read FORGE.md first');
run('Qwen whole-project dry-run', ['scripts/forge-agent.mjs','start','qwen','--project',ROOT,'--dry-run'], 'qwen3-coder-plus');
run('Gemini whole-project dry-run', ['scripts/forge-agent.mjs','start','gemini','--project',ROOT,'--dry-run'], 'gemini-3.7-flash');
run('Kimi whole-project dry-run', ['scripts/forge-agent.mjs','start','kimi','--project',ROOT,'--dry-run'], 'bootstrap-then-interactive');
run('OpenRouter whole-project dry-run', ['scripts/forge-agent.mjs','start','openrouter','--preset','deepseek','--project',ROOT,'--dry-run'], 'openrouter/deepseek/deepseek-v4-flash-0731');
run('OpenRouter model presets', ['scripts/forge-agent.mjs','presets','openrouter'], 'openrouter/moonshotai/kimi-k3');
run('GigaChat image dry-run', ['scripts/gigachat-image.mjs','--prompt','test game icon without text','--output','x.jpg','--dry-run'], 'text2image');
run('GigaChat 3D dry-run', ['scripts/gigachat-3d.mjs','--prompt','simple low poly oil pump game prop','--output','x.fbx','--dry-run'], 'text2model3d');
run('GigaChat terminal dry-run', ['scripts/gigachat-agent.mjs','--project',ROOT,'--full','--dry-run'], 'network=no');
run('API terminal profiles', ['scripts/check-api-terminal-profiles.mjs'], 'PASS: API terminal profiles');

const gigaLib = readFileSync(join(ROOT, 'scripts/lib/gigachat-api.mjs'), 'utf8');
const gigaImage = readFileSync(join(ROOT, 'scripts/gigachat-image.mjs'), 'utf8');
const giga3d = readFileSync(join(ROOT, 'scripts/gigachat-3d.mjs'), 'utf8');
if (/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/.test(gigaLib + gigaImage + giga3d)) errors.push('GigaChat backend must not disable TLS verification');
else ok.push('GigaChat backend preserves TLS verification');
if (!gigaImage.includes("'application/jpg'") || !giga3d.includes("'application/fbx'")) errors.push('GigaChat file Accept media types drifted from documented JPG/FBX flows');
else ok.push('GigaChat download media types match image/3D flows');

const dash = readFileSync(join(ROOT, 'dashboard.html'),'utf8');
if (!dash.includes("copyProjectLaunch('+ri+',\\'gigacode\\')")) errors.push('dashboard lacks GigaCode project launcher button');
else ok.push('dashboard exposes GigaCode launcher');
for (const label of ['Claude API','Codex API','GigaChat API']) { if (!dash.includes(`>${label}</button>`)) errors.push(`dashboard lacks ${label}`); else ok.push(`dashboard exposes ${label}`); }
for (const label of ['Gemini','Qwen','Kimi K3','DeepSeek','GLM','MiniMax M3','OpenRouter']) { if (!dash.includes(`>${label}</button>`)) errors.push(`dashboard lacks ${label}`); else ok.push(`dashboard exposes ${label}`); }
if (!dash.includes("launch gigacode --project")) errors.push('dashboard GigaCode launcher does not route through forge-agent.mjs');
else ok.push('dashboard routes GigaCode through universal launcher');
if (!dash.includes("start '+agent+' --project")) errors.push('dashboard whole-project agents do not route through forge-agent start');
else ok.push('dashboard routes whole-project agents through locked start');

const ai = JSON.parse(readFileSync(join(ROOT, 'templates/ai-studio/project-config.json'),'utf8'));
if (ai.schemaVersion < 2 || !ai.providers?.gigachat || ai.fallback?.openRouter !== false) errors.push('AI Studio v2 provider config invalid');
else ok.push('AI Studio config exposes GigaChat without silent OpenRouter fallback');

console.log('\nForge universal agent runtime audit\n' + '─'.repeat(44));
for (const x of ok) console.log('  ✓ ' + x);
for (const x of errors) console.log('  ✗ ' + x);
console.log(errors.length ? `\nFAILED: ${errors.length} issue(s)` : '\nPASS: universal agent runtime is internally consistent');
process.exit(errors.length ? 1 : 0);
