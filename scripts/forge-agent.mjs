#!/usr/bin/env node
/**
 * Universal Project Forge terminal launcher/router.
 * Claude: subscription or Anthropic API profile.
 * Codex: ChatGPT or isolated OpenAI API profile.
 * GigaChat: Forge-owned terminal agent over official GigaChat API function calling.
 * GigaCode: dormant experimental bridge until an official CLI executable is available.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { getProviderSecret, RUNTIME_DIR, ensureDataDirs } from './lib/forge-secrets.mjs';
import { applyDefaultSearchEnvironment } from './lib/forge-search.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REGISTRY_PATH = join(ROOT, 'adapters', 'agents.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const val = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const has = flag => args.includes(flag);

function fail(msg, code = 2) { console.error('[X] ' + msg); process.exit(code); }
function getAgent(name) { const agent = registry.agents?.[name]; if (!agent) fail(`Unknown agent: ${name}. Use: list`); return agent; }
function locateCommand(name) {
  if (!name) return null;
  if (existsSync(name)) return resolve(name);
  const tool = process.platform === 'win32' ? 'where.exe' : 'which';
  const r = spawnSync(tool, [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.status !== 0) return null;
  return String(r.stdout || '').split(/\r?\n/).map(x => x.trim()).find(Boolean) || name;
}
function detectExecutable(name, agent) {
  if (agent.builtinLauncher) return { executable: process.execPath, source: 'Forge builtin', found: existsSync(join(ROOT, agent.builtinLauncher)) };
  const override = agent.executableEnv && process.env[agent.executableEnv]?.trim();
  if (override) { const located = locateCommand(override); return { executable: located || override, source: agent.executableEnv, found: Boolean(located) }; }
  for (const candidate of agent.executableCandidates || []) { const located = locateCommand(candidate); if (located) return { executable: located, source: 'PATH', found: true }; }
  return { executable: (agent.executableCandidates || [])[0] || null, source: 'not-found', found: false };
}
function genericPrompt(skill, invocationArgs = '') {
  const tail = invocationArgs ? ` with arguments ${JSON.stringify(invocationArgs)}` : '';
  return `Read FORGE.md first. Execute Project Forge skill ${skill}${tail}. Read .claude/skills/${skill}/SKILL.md fully and preserve its phase gate, STOP-points, workspace discipline and verifiers. Translate only host-specific command/orchestration syntax to capabilities actually available in this agent; do not invent unavailable tools.`;
}
function skillCommand(agentName, skill, invocationArgs = '') { const tail = invocationArgs ? ` ${invocationArgs}` : ''; if (agentName === 'claude') return `/${skill}${tail}`; if (agentName === 'codex') return `$${skill}${tail}`; return genericPrompt(skill, invocationArgs); }
function needsShell(exe) { return process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe || ''); }
function spawnAgent(exe, launchArgs, opts={}) { return spawnSync(exe, launchArgs, { cwd: opts.cwd, stdio:'inherit', shell:needsShell(exe), env:opts.env || process.env }); }
function hash(v) { return createHash('sha256').update(v).digest('hex'); }

function claudeApiSettings(project) {
  const found = getProviderSecret('anthropic', project); if (!found?.value) fail('Anthropic API key missing. Put it in forge-data/secrets/anthropic.key or set ANTHROPIC_API_KEY.', 5);
  ensureDataDirs(); const dir=join(RUNTIME_DIR,'claude-api'); mkdirSync(dir,{recursive:true});
  const helper = join(ROOT,'scripts','forge-secret-helper.mjs');
  const command = `node "${helper.replaceAll('"','\\"')}" anthropic`;
  const settings=join(dir,'settings.json'); writeFileSync(settings, JSON.stringify({apiKeyHelper:command},null,2)+'\n','utf8');
  return {settings, source:found.source};
}
function ensureCodexApiAuth(exe, project) {
  const found=getProviderSecret('openai',project); if(!found?.value) fail('OpenAI API key missing. Put it in forge-data/secrets/openai.key or set OPENAI_API_KEY.',5);
  ensureDataDirs(); const home=join(RUNTIME_DIR,'codex-api'); mkdirSync(home,{recursive:true});
  const cfg=join(home,'config.toml'); if(!existsSync(cfg)) writeFileSync(cfg,'cli_auth_credentials_store = "file"\n','utf8');
  const marker=join(home,'.forge-key.sha256'); const digest=hash(found.value); const auth=join(home,'auth.json');
  const old=existsSync(marker)?readFileSync(marker,'utf8').trim():'';
  if(!existsSync(auth)||old!==digest){
    console.log('[Forge] Initializing isolated Codex API credential profile...');
    const env={...process.env,CODEX_HOME:home}; delete env.OPENAI_API_KEY; delete env.CODEX_ACCESS_TOKEN;
    const r=spawnSync(exe,['login','--with-api-key'],{input:found.value+'\n',encoding:'utf8',stdio:['pipe','inherit','inherit'],shell:needsShell(exe),env,cwd:project});
    if(r.status!==0) fail(`Codex API login failed (exit ${r.status}).`,6);
    writeFileSync(marker,digest+'\n','utf8');
  }
  return {home,source:found.source};
}

if (cmd === 'list') {
  for (const [name,a] of Object.entries(registry.agents||{})) { const d=detectExecutable(name,a); const secret=a.apiProvider?getProviderSecret(a.apiProvider,ROOT):null; console.log(`${name.padEnd(10)} ${String(a.status).padEnd(20)} ${d.found?'runtime ready':'runtime missing'}${a.apiProvider?`  api:${secret?'configured':'missing'}`:''}`); }
  process.exit(0);
}
if (cmd === 'doctor') {
  const names=args[1]?[args[1]]:Object.keys(registry.agents||{}); let bad=0;
  for(const name of names){ const a=getAgent(name),d=detectExecutable(name,a),secret=a.apiProvider?getProviderSecret(a.apiProvider,ROOT):null; console.log(`\n${a.displayName} (${name})`); console.log(`  adapter: ${a.status}`); console.log(`  runtime: ${d.executable||'(none)'} [${d.source}]`); console.log(`  detected: ${d.found?'yes':'no'}`); if(a.profiles) console.log(`  profiles: ${a.profiles.join(', ')}`); if(a.apiProvider) console.log(`  ${a.apiProvider} API: ${secret?'configured':'missing'}`); console.log(`  rules: ${(a.rules||[]).join(', ')||'(none)'}`);
    if(name==='gigacode'&&!d.found) console.log('  note: dormant until an official GigaCode CLI executable is available; Forge does not require it.');
    if(name!=='gigacode'&&!d.found) bad++;
  }
  process.exit(bad?1:0);
}
if (cmd === 'prompt' || cmd === 'command') { const name=args[1]||fail(`Usage: ${cmd} <agent> --skill <name> [--args "..."]`); getAgent(name); const skill=val('--skill')||fail('--skill required'); console.log(skillCommand(name,skill,val('--args')||'')); process.exit(0); }
if (cmd === 'launch') {
  const name=args[1]||fail('Usage: launch <agent> --project <path> [--profile subscription|chatgpt|api] [--full]'); const a=getAgent(name); const project=resolve(val('--project')||'.'); if(!existsSync(project)) fail(`Project path not found: ${project}`);
  const profile=val('--profile') || (name==='gigachat'?'api':name==='claude'?'subscription':name==='codex'?'chatgpt':'default');
  if(a.profiles && !a.profiles.includes(profile)) fail(`Profile ${profile} is not valid for ${name}. Available: ${a.profiles.join(', ')}`);
  const d=detectExecutable(name,a); if(!d.found){ console.error(`[X] ${a.displayName} runtime was not detected.`); if(name==='gigacode') console.error('    GigaCode CLI is optional/dormant; use Claude, Codex or GigaChat API instead.'); process.exit(3); }
  let launchArgs=has('--full')?[...(a.fullArgs||[])]:[]; let env={...process.env}; let exe=d.executable;
  if(name==='gigachat'){
    exe=process.execPath;
    // GigaChat requires the trusted MinDigital root. A child Node process must
    // see this at startup; setting it inside gigachat-agent.mjs would be too late.
    if(!env.NODE_USE_SYSTEM_CA) env.NODE_USE_SYSTEM_CA='1';

    // Keep explicit GigaSearch configuration authoritative. When no provider or
    // endpoint was configured, make the documented no-key live fallback usable
    // from Dashboard/forge-agent without requiring two manual environment lines.
    const searchDefault=applyDefaultSearchEnvironment(env);
    if(searchDefault.applied){
      console.log('[Forge] Search provider -> bing-html fallback (override with FORGE_SEARCH_PROVIDER or GIGASEARCH_* settings).');
    }
    launchArgs=[join(ROOT,a.builtinLauncher),'--project',project,'--model',val('--model')||process.env.FORGE_GIGACHAT_MODEL||'GigaChat-3-Ultra',...(has('--full')?['--full']:[])];
  }
  if(name==='claude'&&profile==='api'){ const cfg=claudeApiSettings(project); launchArgs.push('--settings',cfg.settings); delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL; delete env.CLAUDE_CODE_USE_BEDROCK; delete env.CLAUDE_CODE_USE_VERTEX; console.log(`[Forge] Claude API profile -> ${cfg.source}`); }
  if(name==='codex'&&profile==='api'){ const cfg=ensureCodexApiAuth(exe,project); env.CODEX_HOME=cfg.home; delete env.OPENAI_API_KEY; delete env.CODEX_ACCESS_TOKEN; console.log(`[Forge] Codex API profile -> isolated CODEX_HOME (${cfg.source})`); }
  console.log(`[Forge] ${a.displayName} [${profile}] -> ${project}`); if(name==='gigacode') console.log('[Forge] GigaCode bridge is dormant/experimental; no undocumented flags are injected.');
  const r=spawnAgent(exe,launchArgs,{cwd:project,env}); if(r.error) fail(`${a.displayName} launch failed: ${r.error.message}`,4); process.exit(r.status??0);
}
console.log(`Project Forge universal terminal runtime\n\nCommands:\n  list\n  doctor [agent]\n  launch <agent> --project <path> [--profile ...] [--full]\n  prompt <agent> --skill <name> [--args "..."]\n\nAPI secrets:\n  node scripts/forge-secrets.mjs status`);
