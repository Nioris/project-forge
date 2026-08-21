#!/usr/bin/env node
/**
 * Universal Project Forge terminal launcher/router.
 * Claude: subscription or Anthropic API profile.
 * Codex: ChatGPT or isolated OpenAI API profile.
 * GigaChat: Forge-owned terminal agent over official GigaChat API function calling.
 * GigaCode: dormant experimental bridge until an official CLI executable is available.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { getProviderSecret, RUNTIME_DIR, ensureDataDirs } from './lib/forge-secrets.mjs';
import { applyDefaultSearchEnvironment } from './lib/forge-search.mjs';
import { inspectRuntimeVersion, runtimeMeetsMinimum } from './lib/runtime-version.mjs';

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
  const found = String(r.stdout || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (process.platform === 'win32') {
    // npm places an extensionless POSIX shim before the runnable .cmd shim in PATH.
    // spawnSync cannot execute that extensionless shell script directly on Windows.
    return found.find(x => /\.(?:exe|cmd|bat)$/i.test(x)) || found[0] || name;
  }
  return found[0] || name;
}
function detectExecutable(name, agent) {
  if (agent.builtinLauncher) return { executable: process.execPath, source: 'Forge builtin', found: existsSync(join(ROOT, agent.builtinLauncher)) };
  const override = agent.executableEnv && process.env[agent.executableEnv]?.trim();
  if (override) { const located = locateCommand(override); return { executable: located || override, source: agent.executableEnv, found: Boolean(located) }; }
  for (const candidate of agent.executableCandidates || []) { const located = locateCommand(candidate); if (located) return { executable: located, source: 'PATH', found: true }; }
  if (process.platform === 'win32' && process.env.USERPROFILE) {
    for (const candidate of agent.executableCandidates || []) {
      const userInstall = join(process.env.USERPROFILE, `.${candidate}-code`, 'bin', `${candidate}.exe`);
      if (existsSync(userInstall)) return { executable: userInstall, source: 'user install', found: true };
    }
  }
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
function projectProfilePath(project) { return join(project, '.forge', 'agent.json'); }
function readProjectProfile(project) {
  const path = projectProfilePath(project);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { fail(`Invalid project agent profile ${path}: ${e.message}`); }
}
function writeProjectProfile(project, value) {
  const path = projectProfilePath(project);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
  return path;
}
function defaultModelFor(agent, profile) {
  return agent.profileModels?.[profile] || agent.defaultModel || 'provider-default';
}
function autonomousPrompt(name, model) {
  return `You are the only terminal AI agent assigned to this Project Forge project for the whole development run. Agent lock: ${name}; model lock: ${model}. Read FORGE.md, the applicable host rules, wiki/phases/phase-*.json, wiki/_current.md and wiki/_map.md before acting. Continue the current canonical Forge phase and then the remaining phases in order. Use canonical .claude/skills/<name>/SKILL.md workflows, real files, verifiers and Git checkpoints. Work autonomously until a canonical user-owned STOP-point, verified completion, or genuine blocker; do not stop merely to announce a next implementation step. External facts and numeric KPI claims require a real source URL; when no source is available, write TBD or label the value as a hypothesis. Never mark an acceptance checkbox complete unless the referenced implementation exists and the stated verification actually ran. Treat a non-zero phase-state completion command as a hard block: fix its reported evidence failures and never overwrite or reinterpret the marker. After a completed phase, offer the exact short reply that continues to the next phase and continue in this same terminal when the user accepts. Never switch agent, provider or model inside this project. Never claim completion without verifier evidence.`;
}
function writeAutonomousPrompt(project, prompt) {
  const path=join(project,'.forge','agent-start.md');
  mkdirSync(dirname(path),{recursive:true});
  const tmp=path+'.tmp';
  writeFileSync(tmp,`# Project Forge whole-project startup\n\n${prompt}\n`,'utf8');
  renameSync(tmp,path);
  return path;
}
function writeResumePrompt(project, instruction) {
  const path=join(project,'.forge','agent-resume.md');
  mkdirSync(dirname(path),{recursive:true});
  const tmp=path+'.tmp';
  writeFileSync(tmp,`# Project Forge STOP answer / continuation\n\n${instruction.trim()}\n`,'utf8');
  renameSync(tmp,path);
  return path;
}
function autonomousLaunchArgs(agent, prompt, model, full) {
  if (agent.runtime === 'opencode') {
    return ['run', '--interactive', ...(full ? ['--auto'] : []), '--model', model, prompt];
  }
  if (agent.runtime === 'kimi') {
    return [...(full ? (agent.fullArgs || []) : []), ...(model && agent.modelArg ? [agent.modelArg, model] : []), '--prompt', prompt];
  }
  const out = full ? [...(agent.fullArgs || [])] : [];
  if (model && agent.modelArg) out.push(agent.modelArg, model);
  if (agent.interactivePromptArg) out.push(agent.interactivePromptArg, prompt);
  else out.push(prompt);
  return out;
}

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
function openCodeProviderConfig(provider, model = null, profile = null) {
  if (provider === 'zai') return {
    provider: { zai: { npm: '@ai-sdk/openai-compatible', name: 'Z.ai', options: { baseURL: 'https://api.z.ai/api/paas/v4' }, models: { 'glm-5.3': { name: 'GLM 5.3' } } } },
  };
  if (provider === 'minimax') return {
    provider: { minimax: { npm: '@ai-sdk/anthropic', name: 'MiniMax', options: { baseURL: 'https://api.minimax.io/anthropic' }, models: { 'MiniMax-M3': { name: 'MiniMax M3' } } } },
  };
  if (provider === 'openrouter') {
    const slug=String(model||'').replace(/^openrouter\//,'');
    if(!slug) return null;
    const routing=profile==='zdr'
      ? {data_collection:'deny',zdr:true}
      : {data_collection:'deny'};
    return {provider:{openrouter:{models:{[slug]:{options:{provider:routing}}}}}};
  }
  return null;
}
function openCodeEnvironment(agent, project, { model = null, profile = null } = {}) {
  const env={...process.env};
  const provider=agent.apiProvider;
  const config=openCodeProviderConfig(provider,model,profile);
  if(config) env.OPENCODE_CONFIG_CONTENT=JSON.stringify(config);
  const found=provider?getProviderSecret(provider,project):null;
  if(found?.value){
    ensureDataDirs();
    const dataRoot=join(RUNTIME_DIR,`opencode-${provider}`);
    const authDir=join(dataRoot,'opencode');
    mkdirSync(authDir,{recursive:true});
    writeFileSync(join(authDir,'auth.json'),JSON.stringify({[provider]:{type:'api',key:found.value}},null,2)+'\n',{encoding:'utf8',mode:0o600});
    env.XDG_DATA_HOME=dataRoot;
    console.log(`[Forge] OpenCode ${provider} profile -> isolated credential store (${found.source})`);
  } else {
    console.log(`[Forge] OpenCode ${provider} profile -> existing OpenCode login/config (central key not configured)`);
  }
  for(const spec of Object.values(registry.agents||{})){
    if(!spec.apiProvider) continue;
    const providerSpecEnv={deepseek:'DEEPSEEK_API_KEY',zai:'ZAI_API_KEY',minimax:'MINIMAX_API_KEY',openrouter:'OPENROUTER_API_KEY'}[spec.apiProvider];
    if(providerSpecEnv) delete env[providerSpecEnv];
  }
  if(provider==='openrouter') console.log(`[Forge] OpenRouter privacy -> ${profile==='zdr'?'ZDR required + provider data collection denied':'provider data collection denied; retention compatibility allowed'}`);
  return env;
}
function presetModel(agent, preset) {
  if(!preset) return null;
  const model=agent.modelPresets?.[preset];
  if(!model) fail(`Unknown model preset ${preset}. Available: ${Object.keys(agent.modelPresets||{}).join(', ')||'(none)'}`);
  return model;
}
function assertProviderModel(agent, model) {
  if(agent.apiProvider==='openrouter'&&!/^openrouter\/(?:~?[a-z0-9][a-z0-9._-]*\/)?[a-z0-9~][a-z0-9._~:-]*$/i.test(String(model||''))) {
    fail(`OpenRouter model must use the exact OpenCode id openrouter/<author>/<model>; got: ${model}`);
  }
}
function assertMinimumRuntime(agent, detected) {
  const minimum = agent.minimumRuntimeVersion;
  if (!minimum) return null;
  const inspected = inspectRuntimeVersion(detected.executable, { shell: needsShell(detected.executable) });
  if (!inspected.ok) fail(`${agent.displayName} version could not be determined. Expected ${minimum}+ from: ${detected.executable}`, 3);
  if (!runtimeMeetsMinimum(inspected.version, minimum)) {
    fail(`${agent.displayName} ${inspected.version} is too old; Project Forge requires ${minimum}+ for reliable built-in tools. Update the runtime and retry.`, 3);
  }
  console.log(`[Forge] Runtime preflight: ${agent.displayName} ${inspected.version} (minimum ${minimum})`);
  return inspected.version;
}
function loopbackEndpoint(urlValue) {
  try {
    const url = new URL(urlValue);
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return null;
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    return Number.isInteger(port) && port > 0 && port <= 65535
      ? { host: url.hostname.replace(/^\[|\]$/g, ''), port }
      : null;
  } catch { return null; }
}
function canConnectSync({ host, port }, timeoutMs = 350) {
  const probe = [
    "const net=require('node:net');",
    "const socket=net.createConnection({host:process.argv[1],port:Number(process.argv[2])});",
    "let done=false; const finish=code=>{if(done)return;done=true;socket.destroy();process.exit(code)};",
    `socket.setTimeout(${timeoutMs},()=>finish(1));`,
    "socket.once('connect',()=>finish(0)); socket.once('error',()=>finish(1));",
  ].join('');
  const result = spawnSync(process.execPath, ['-e', probe, host, String(port)], {
    stdio: 'ignore', windowsHide: true, timeout: timeoutMs + 1000,
  });
  return result.status === 0;
}
function readJsonObject(path) {
  if (!path || !existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function qwenEnvironment(project) {
  const env = { ...process.env };
  const userHome = env.USERPROFILE || env.HOME;
  const userSettings = userHome ? readJsonObject(join(userHome, '.qwen', 'settings.json')) : {};
  const unavailable = [];
  for (const [name, server] of Object.entries(userSettings.mcpServers || {})) {
    const endpoint = loopbackEndpoint(server?.httpUrl || server?.url);
    if (endpoint && !canConnectSync(endpoint)) unavailable.push(String(name));
  }
  if (!unavailable.length) return env;

  ensureDataDirs();
  const runtimeDir = join(RUNTIME_DIR, 'qwen');
  mkdirSync(runtimeDir, { recursive: true });
  const defaultSystemPath = process.platform === 'win32' && env.ProgramData
    ? join(env.ProgramData, 'qwen-code', 'settings.json')
    : process.platform === 'darwin'
      ? '/Library/Application Support/QwenCode/settings.json'
      : '/etc/qwen-code/settings.json';
  const baseSystemPath = env.QWEN_CODE_SYSTEM_SETTINGS_PATH || defaultSystemPath;
  const base = readJsonObject(baseSystemPath);
  const priorExcluded = Array.isArray(base.mcp?.excluded) ? base.mcp.excluded.map(String) : [];
  const settings = {
    ...base,
    mcp: { ...(base.mcp || {}), excluded: [...new Set([...priorExcluded, ...unavailable])] },
  };
  const settingsPath = join(runtimeDir, `settings-${hash(resolve(project)).slice(0, 16)}.json`);
  const tmp = settingsPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  renameSync(tmp, settingsPath);
  env.QWEN_CODE_SYSTEM_SETTINGS_PATH = settingsPath;
  console.log(`[Forge] Qwen preflight: unavailable local MCP excluded for this run: ${unavailable.join(', ')}`);
  return env;
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
if (cmd === 'profile') {
  const project=resolve(val('--project')||'.'); if(!existsSync(project)) fail(`Project path not found: ${project}`);
  const current=readProjectProfile(project);
  if(!current){ console.log(`[Forge] No locked agent profile in ${project}`); process.exit(1); }
  console.log(`[Forge] Locked agent: ${current.agent}`);
  console.log(`[Forge] Locked model: ${current.model}`);
  console.log(`[Forge] Profile: ${current.profile}`);
  console.log(`[Forge] Config: ${projectProfilePath(project)}`);
  process.exit(0);
}
if (cmd === 'prepare') {
  const name=args[1]||fail('Usage: prepare <deepseek|glm|minimax|openrouter> --project <path>');
  const a=getAgent(name); if(a.runtime!=='opencode') fail(`${name} does not use an OpenCode API profile.`);
  const project=resolve(val('--project')||'.'); if(!existsSync(project)) fail(`Project path not found: ${project}`);
  const profile=val('--profile')||a.profiles?.[0]||'default';
  const model=val('--model')||presetModel(a,val('--preset'))||defaultModelFor(a,profile);
  assertProviderModel(a,model);
  const env=openCodeEnvironment(a,project,{model,profile});
  console.log(`[Forge] ${name} provider config: ${env.OPENCODE_CONFIG_CONTENT?'configured':'built-in'}`);
  console.log(`[Forge] Credential isolation: ${env.XDG_DATA_HOME?'central isolated store':'existing OpenCode login'}`);
  process.exit(0);
}
if (cmd === 'presets') {
  const name=args[1]||fail('Usage: presets <agent>');
  const a=getAgent(name); const entries=Object.entries(a.modelPresets||{});
  if(!entries.length) fail(`${name} has no named model presets.`);
  console.log(`[Forge] ${a.displayName} model presets:`);
  for(const [preset,model] of entries) console.log(`  ${preset.padEnd(10)} ${model}`);
  process.exit(0);
}
if (cmd === 'select') {
  const name=args[1]||fail('Usage: select <agent> --project <path> [--model <id>|--preset <name>] [--profile <name>]');
  const a=getAgent(name); if(!a.wholeProject) fail(`${name} does not use the new whole-project lock. Use its existing launch command.`); const project=resolve(val('--project')||'.'); if(!existsSync(project)) fail(`Project path not found: ${project}`);
  const profile=val('--profile') || a.profiles?.[0] || 'default';
  if(a.profiles && !a.profiles.includes(profile)) fail(`Profile ${profile} is not valid for ${name}. Available: ${a.profiles.join(', ')}`);
  const model=val('--model') || presetModel(a,val('--preset')) || defaultModelFor(a, profile);
  assertProviderModel(a,model);
  const path=writeProjectProfile(project,{schemaVersion:1,agent:name,model,profile,locked:true,selectedAt:new Date().toISOString()});
  console.log(`[Forge] Locked ${name} / ${model} for the whole project.`);
  console.log(`[Forge] ${path}`);
  process.exit(0);
}
if (cmd === 'start') {
  const project=resolve(val('--project')||'.'); if(!existsSync(project)) fail(`Project path not found: ${project}`);
  const requested=args[1] && !args[1].startsWith('--') ? args[1] : null;
  let current=readProjectProfile(project);
  if(requested){
    const requestedAgent=getAgent(requested);
    if(!requestedAgent.wholeProject) fail(`${requested} does not use the new whole-project lock. Use its existing launch command.`);
    if(current?.locked && current.agent!==requested && !has('--reselect')) fail(`Project is locked to ${current.agent}. Use select ${requested} first, or pass --reselect explicitly.`);
    const profile=val('--profile') || (current?.agent===requested?current.profile:null) || requestedAgent.profiles?.[0] || 'default';
    const requestedPreset=presetModel(requestedAgent,val('--preset'));
    const model=val('--model') || requestedPreset || (current?.agent===requested?current.model:null) || defaultModelFor(requestedAgent, profile);
    assertProviderModel(requestedAgent,model);
    if(requestedPreset&&current?.agent===requested&&current.model!==model&&!has('--reselect')) fail(`Project model is locked to ${current.model}. Use select ${requested} --preset ${val('--preset')} first, or pass --reselect.`);
    current={schemaVersion:1,agent:requested,model,profile,locked:true,selectedAt:new Date().toISOString()};
    if(!has('--dry-run')) writeProjectProfile(project,current);
  }
  if(!current) fail('No project agent selected. Use: select <agent> --project <path>');
  const a=getAgent(current.agent); if(!a.wholeProject) fail(`Stored agent ${current.agent} does not support whole-project start. Re-run select.`); const profile=current.profile || a.profiles?.[0] || 'default';
  if(a.profiles && !a.profiles.includes(profile)) fail(`Stored profile ${profile} is not valid for ${current.agent}. Re-run select.`);
  const d=detectExecutable(current.agent,a); if(!d.found) fail(`${a.displayName} runtime was not detected. Run: doctor ${current.agent}`,3);
  assertMinimumRuntime(a,d);
  const model=val('--model') || current.model || defaultModelFor(a, profile);
  assertProviderModel(a,model);
  if(val('--model') && model!==current.model && !has('--reselect')) fail(`Project model is locked to ${current.model}. Use select ${current.agent} --model ${model} first, or pass --reselect.`);
  const full=!has('--safe'); const prompt=autonomousPrompt(current.agent,model);
  const startupInstruction='Read .forge/agent-start.md and execute every instruction in it now.';
  const launchArgs=autonomousLaunchArgs(a,startupInstruction,model,full);
  if(has('--dry-run')){
    const resumeArgs=a.runtime==='kimi'?[...(full?(a.fullArgs||[]):[]),'--continue',...(model&&a.modelArg?[a.modelArg,model]:[])]:null;
    console.log(JSON.stringify({agent:current.agent,model,profile,project,executable:d.executable,args:launchArgs,resumeArgs,promptMode:a.runtime==='kimi'?'bootstrap-then-interactive':'interactive',locked:true},null,2));
    process.exit(0);
  }
  writeAutonomousPrompt(project,prompt);
  console.log(`[Forge] Whole-project lock: ${a.displayName} / ${model}`);
  console.log(`[Forge] Autonomous interactive run -> ${project}`);
  const startEnv=a.runtime==='opencode'?openCodeEnvironment(a,project,{model,profile}):current.agent==='qwen'?qwenEnvironment(project):{...process.env};
  const r=spawnAgent(d.executable,launchArgs,{cwd:project,env:startEnv}); if(r.error) fail(`${a.displayName} launch failed: ${r.error.message}`,4);
  if(a.runtime==='kimi' && r.status===0){
    console.log('[Forge] Kimi bootstrap turn complete; reopening the same project session interactively.');
    const resumeArgs=[...(full?(a.fullArgs||[]):[]),'--continue',...(model&&a.modelArg?[a.modelArg,model]:[])];
    const resumed=spawnAgent(d.executable,resumeArgs,{cwd:project,env:startEnv}); if(resumed.error) fail(`${a.displayName} interactive resume failed: ${resumed.error.message}`,4); process.exit(resumed.status??0);
  }
  process.exit(r.status??0);
}
if (cmd === 'resume') {
  const project=resolve(val('--project')||'.'); if(!existsSync(project)) fail(`Project path not found: ${project}`);
  const current=readProjectProfile(project); if(!current) fail('No project agent selected. Use: select <agent> --project <path>');
  const a=getAgent(current.agent); if(a.runtime!=='opencode') fail(`resume currently supports OpenCode whole-project hosts; ${current.agent} uses ${a.runtime||'a native runtime'}.`);
  const answer=val('--answer')||val('--instruction'); if(!answer?.trim()) fail('Usage: resume --project <path> --answer "<STOP answer or continuation>"');
  const d=detectExecutable(current.agent,a); if(!d.found) fail(`${a.displayName} runtime was not detected. Run: doctor ${current.agent}`,3);
  assertMinimumRuntime(a,d);
  const model=current.model||defaultModelFor(a,current.profile);
  assertProviderModel(a,model);
  const resumeInstruction='Read .forge/agent-resume.md and execute the user continuation in it. Preserve the current Forge phase and do not start a later phase unless that file explicitly authorizes it.';
  const launchArgs=['run','--continue','--interactive','--auto','--model',model,resumeInstruction];
  if(has('--dry-run')){
    console.log(JSON.stringify({agent:current.agent,model,profile:current.profile,project,executable:d.executable,args:launchArgs,promptMode:'continue-last-session',locked:true},null,2));
    process.exit(0);
  }
  const promptPath=writeResumePrompt(project,answer);
  console.log(`[Forge] Resume ${a.displayName} / ${model} from ${promptPath}`);
  const env=openCodeEnvironment(a,project,{model,profile:current.profile});
  const r=spawnAgent(d.executable,launchArgs,{cwd:project,env}); if(r.error) fail(`${a.displayName} resume failed: ${r.error.message}`,4);
  process.exit(r.status??0);
}
if (cmd === 'prompt' || cmd === 'command') { const name=args[1]||fail(`Usage: ${cmd} <agent> --skill <name> [--args "..."]`); getAgent(name); const skill=val('--skill')||fail('--skill required'); console.log(skillCommand(name,skill,val('--args')||'')); process.exit(0); }
if (cmd === 'launch') {
  const name=args[1]||fail('Usage: launch <agent> --project <path> [--profile subscription|chatgpt|api] [--full]'); const a=getAgent(name); const project=resolve(val('--project')||'.'); if(!existsSync(project)) fail(`Project path not found: ${project}`);
  const profile=val('--profile') || a.profiles?.[0] || 'default';
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
console.log(`Project Forge universal terminal runtime\n\nCommands:\n  list\n  doctor [agent]\n  presets <agent>\n  select <agent> --project <path> [--model <id>|--preset <name>] [--profile <name>]\n  profile --project <path>\n  prepare <deepseek|glm|minimax|openrouter> --project <path> [--preset <name>]\n  start [agent] --project <path> [--safe] [--reselect] [--dry-run]\n  resume --project <path> --answer "<STOP answer or continuation>" [--dry-run]\n  launch <agent> --project <path> [--profile ...] [--full]\n  prompt <agent> --skill <name> [--args "..."]\n\nAPI secrets:\n  node scripts/forge-secrets.mjs status`);
