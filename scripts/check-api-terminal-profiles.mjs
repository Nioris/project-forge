#!/usr/bin/env node
/** Offline regression check for Claude API, Codex API and GigaChat terminal surfaces. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareVersions, runtimeMeetsMinimum } from './lib/runtime-version.mjs';

const ROOT=resolve(process.cwd()); const errors=[]; const ok=[];
const need=rel=>existsSync(join(ROOT,rel))?ok.push(rel):errors.push(`${rel} missing`);
for(const f of [
  'scripts/forge-agent.mjs',
  'scripts/forge-secrets.mjs',
  'scripts/forge-secret-helper.mjs',
  'scripts/forge-search-doctor.mjs',
  'scripts/forge-search-selftest.mjs',
  'scripts/gigachat-agent.mjs',
  'scripts/lib/forge-search.mjs',
  'scripts/lib/forge-secrets.mjs',
  'scripts/lib/gigachat-api.mjs',
]) need(f);

function run(label, argv, env={}, expect=''){
  const r=spawnSync(process.execPath,argv,{cwd:ROOT,encoding:'utf8',env:{...process.env,...env}}); const text=(r.stdout||'')+(r.stderr||'');
  if(r.status!==0 || (expect&&!text.includes(expect))) errors.push(`${label}: ${text.slice(0,500)}`); else ok.push(label); return {r,text};
}
run('secret status command',['scripts/forge-secrets.mjs','status'],{},'Forge secrets:');
run('central helper via env',['scripts/forge-secret-helper.mjs','anthropic'],{ANTHROPIC_API_KEY:'test-anthropic'},'test-anthropic');
const standardDry=run('GigaChat terminal dry-run',['scripts/gigachat-agent.mjs','--project',ROOT,'--dry-run'],{},'network=no');
const fullDry=run('GigaChat terminal full dry-run',['scripts/gigachat-agent.mjs','--project',ROOT,'--full','--dry-run'],{},'network=no');
const functionCount=x=>Number(x.text.match(/functions=(\d+)/)?.[1]);
const standardFunctions=functionCount(standardDry), fullFunctions=functionCount(fullDry);
if(!Number.isInteger(standardFunctions)||!Number.isInteger(fullFunctions)) errors.push('GigaChat dry-run did not report function counts');
else if(fullFunctions!==standardFunctions+1) errors.push(`GigaChat full mode must add exactly one shell function (${standardFunctions} -> ${fullFunctions})`);
else ok.push(`GigaChat full mode adds one shell function (${standardFunctions} -> ${fullFunctions})`);
run('GigaChat terminal self-test',['scripts/gigachat-agent.mjs','--project',ROOT,'--self-test'],{FORGE_SEARCH_PROVIDER:'bing-html'},'[OK] Phase 1 resume can open STOP before first model request');
run('Forge search self-test',['scripts/forge-search-selftest.mjs'],{},'[OK] web_fetch blocks localhost/private targets');
run('Forge search default doctor',['scripts/forge-search-doctor.mjs','--project',ROOT],{FORGE_SEARCH_PROVIDER:'',GIGASEARCH_PROVIDER:'',FORGE_SEARCH_WEB_URL:'',GIGASEARCH_WEB_URL:'',FORGE_SEARCH_IMAGES_URL:'',GIGASEARCH_IMAGES_URL:''},'"provider": "bing-html"');

function runPhaseResumeEntrypointRegression(){
  const fixture=mkdtempSync(join(tmpdir(),'forge-gigachat-resume-'));
  const dataDir=join(fixture,'empty-forge-data');
  const forgeVersion=JSON.parse(readFileSync(join(ROOT,'.claude-plugin/plugin.json'),'utf8')).version;
  const writeJson=(rel,value)=>writeFileSync(join(fixture,rel),JSON.stringify(value,null,2)+'\n','utf8');
  const briefQuestion=[
    '❓ **Q1** - **Аудитория**: Кто будет играть?',
    '➡️ Взрослые игроки коротких веб-сессий.',
    '❓ **Q2** - **Амбиция**: Какой срок разработки?',
    '➡️ MVP за две недели.',
    '❓ **Q3** - **Обещание**: Что игрок должен почувствовать?',
    '➡️ Быстрый рост и контроль.',
    '❓ **Q4** - **Отличие**: Чем проект отличается?',
    '➡️ Решения директора меняют прогрессию.',
    '❓ **Q5** - **История**: Что уже реализовано?',
    '➡️ Сохранить текущий прототип; прежняя история неизвестна.'
  ].join('\n');
  try{
    for(const rel of ['wiki/phases','wiki/decisions','wiki/runtime','WorkProgress/fixture']) mkdirSync(join(fixture,rel),{recursive:true});
    mkdirSync(dataDir,{recursive:true});
    writeFileSync(join(fixture,'ANALYSIS.md'),'# Analysis\n\nExisting source and gameplay systems were inspected. This durable fixture is intentionally longer than eighty characters.\n','utf8');
    writeFileSync(join(fixture,'WorkProgress/fixture/index.html'),'<!doctype html><title>Existing prototype fixture</title>\n','utf8');
    writeFileSync(join(fixture,'wiki/_map.md'),'# Project map\n\n**Размерность:** 2D\n','utf8');
    writeJson('wiki/phases/phase-1.json',{schemaVersion:1,phase:1,name:'Analyze',state:'in_progress',startedAt:'2026-08-18T00:00:00.000Z',updatedAt:'2026-08-18T00:00:00.000Z',completedAt:null,reason:null,evidence:[],forgeVersion});
    writeJson('wiki/decisions/gigachat-decisions.json',{schemaVersion:1,decisions:[
      {phase:1,decision_key:'phase1-research-direction',question:'Approve research?',answer:'A',timestamp:'2026-08-18T00:00:00.000Z'},
      {phase:1,decision_key:'phase1-brief',question:briefQuestion,answer:'Q1 — согласен.',timestamp:'2026-08-18T00:01:00.000Z'}
    ]});
    writeJson('wiki/runtime/gigachat-evidence.json',{schemaVersion:5,verifiers:[],completedSkills:['find-or-make-skill'],pendingDecision:null,phase:{phase:1,startedAt:'2026-08-18T00:00:00.000Z',baseline:{},unresolvedFailures:[],searchEvidence:{web:[],image:[],fetch:[]},productMetricsEvidence:{startedAt:null,web:[],fetch:[]}}});
    const cleanEnv={FORGE_DATA_DIR:dataDir,GIGACHAT_CREDENTIALS:'',GIGACHAT_ACCESS_TOKEN:'',GIGACHAT_AUTH_KEY:''};
    const first=run('GigaChat real entrypoint reopens partial Phase 1 brief',['scripts/gigachat-agent.mjs','--project',fixture,'--prompt','фаза 1'],cleanEnv,'Opened Phase 1 resume STOP directly from durable state');
    if(first.r.status===0){
      if(!first.text.includes('Q1')||!first.text.includes('Q5')) errors.push('GigaChat real entrypoint resume did not render the full Q1..Q5 STOP');
      else if(/credentials missing/i.test(first.text)) errors.push('GigaChat real entrypoint checked credentials before restoring the durable STOP');
      else if(!first.text.includes('Как ответить:')||!first.text.includes('«утверждаю»')||!first.text.includes('Q5 — <ваш вариант или «согласен»>')) errors.push('GigaChat real entrypoint STOP did not render actionable approval/correction guidance');
      else ok.push('GigaChat real entrypoint restores Q1..Q5 before credentials');
    }
    const second=run('GigaChat persisted pending STOP survives restart',['scripts/gigachat-agent.mjs','--project',fixture,'--prompt','фаза 1'],cleanEnv,'Reopened pending Phase 1 resume STOP directly from durable state');
    const blocked=run('GigaChat pending STOP blocks a later phase',['scripts/gigachat-agent.mjs','--project',fixture,'--prompt','фаза 2'],cleanEnv,'Phase 2 cannot start while the Phase 1 STOP-point is waiting');
    if(blocked.r.status===0){
      const runtime=JSON.parse(readFileSync(join(fixture,'wiki/runtime/gigachat-evidence.json'),'utf8'));
      if(runtime.pendingDecision?.decision_key!=='phase1-brief') errors.push('GigaChat phase switch erased the durable Phase 1 pending decision');
      else ok.push('GigaChat phase switch preserves the durable pending decision');
    }
    const accepted=spawnSync(process.execPath,['scripts/gigachat-agent.mjs','--project',fixture,'--prompt','принимаю рекомендации'],{cwd:ROOT,encoding:'utf8',env:{...process.env,...cleanEnv}});
    const acceptedText=(accepted.stdout||'')+(accepted.stderr||'');
    const decisions=JSON.parse(readFileSync(join(fixture,'wiki/decisions/gigachat-decisions.json'),'utf8')).decisions||[];
    const runtimeAfterAccept=JSON.parse(readFileSync(join(fixture,'wiki/runtime/gigachat-evidence.json'),'utf8'));
    const rebuiltBrief=existsSync(join(fixture,'wiki/design/brief.md'))?readFileSync(join(fixture,'wiki/design/brief.md'),'utf8'):'';
    const naturalAcceptancePersisted=decisions.some(d=>d.decision_key==='phase1-brief'&&d.answer==='принимаю рекомендации');
    if(/Ответ на STOP-point пока неполный/.test(acceptedText)) errors.push('GigaChat rejected the natural whole-brief answer "принимаю рекомендации"');
    else if(!naturalAcceptancePersisted||runtimeAfterAccept.pendingDecision!==null||!['Audience','Ambition','Promise','Differentiator','History'].every(x=>rebuiltBrief.includes(`**${x}:**`))) errors.push('GigaChat did not persist/materialize the natural whole-brief acceptance');
    else ok.push('GigaChat accepts and materializes "принимаю рекомендации" through the real entrypoint');
    return first.r.status===0&&second.r.status===0&&blocked.r.status===0&&naturalAcceptancePersisted;
  }finally{
    rmSync(fixture,{recursive:true,force:true});
  }
}
runPhaseResumeEntrypointRegression();

function runOpenCodeCredentialIsolationRegression(){
  const fixture=mkdtempSync(join(tmpdir(),'forge-opencode-auth-'));
  const dataDir=join(fixture,'forge-data');
  const fake='test-deepseek-secret-never-print';
  try{
    mkdirSync(dataDir,{recursive:true});
    const prepared=run('DeepSeek isolated OpenCode auth preparation',['scripts/forge-agent.mjs','prepare','deepseek','--project',fixture],{FORGE_DATA_DIR:dataDir,DEEPSEEK_API_KEY:fake},'central isolated store');
    const authPath=join(dataDir,'runtime','opencode-deepseek','opencode','auth.json');
    if(prepared.text.includes(fake)) errors.push('OpenCode auth preparation printed the API key');
    else if(!existsSync(authPath)) errors.push('OpenCode isolated auth.json was not created');
    else {
      const auth=JSON.parse(readFileSync(authPath,'utf8'));
      if(auth.deepseek?.type!=='api'||auth.deepseek?.key!==fake) errors.push('OpenCode isolated auth.json has the wrong contract');
      else ok.push('OpenCode API key is stored outside the project and not printed');
    }
  }finally{
    rmSync(fixture,{recursive:true,force:true});
  }
}
runOpenCodeCredentialIsolationRegression();

function runOpenRouterCredentialIsolationRegression(){
  const fixture=mkdtempSync(join(tmpdir(),'forge-openrouter-auth-'));
  const dataDir=join(fixture,'forge-data');
  const fake='sk-or-test-secret-never-print';
  try{
    mkdirSync(dataDir,{recursive:true});
    const prepared=run('OpenRouter isolated OpenCode auth preparation',['scripts/forge-agent.mjs','prepare','openrouter','--preset','qwen','--project',fixture],{FORGE_DATA_DIR:dataDir,OPENROUTER_API_KEY:fake},'ZDR required + provider data collection denied');
    const authPath=join(dataDir,'runtime','opencode-openrouter','opencode','auth.json');
    if(prepared.text.includes(fake)) errors.push('OpenRouter auth preparation printed the API key');
    else if(!existsSync(authPath)) errors.push('OpenRouter isolated auth.json was not created');
    else {
      const auth=JSON.parse(readFileSync(authPath,'utf8'));
      if(auth.openrouter?.type!=='api'||auth.openrouter?.key!==fake) errors.push('OpenRouter isolated auth.json has the wrong contract');
      else if(!prepared.text.includes('provider config: configured')) errors.push('OpenRouter ZDR routing config was not generated');
      else ok.push('OpenRouter key is isolated and the default launch requires ZDR');
    }
    run('OpenRouter same-session STOP resume dry-run',['scripts/forge-agent.mjs','select','openrouter','--preset','qwen','--profile','zdr','--project',fixture],{FORGE_DATA_DIR:dataDir,OPENROUTER_API_KEY:fake},'Locked openrouter');
    const resumed=run('OpenRouter same-session STOP resume contract',['scripts/forge-agent.mjs','resume','--project',fixture,'--answer','утверждаю','--dry-run'],{FORGE_DATA_DIR:dataDir,OPENROUTER_API_KEY:fake},'continue-last-session');
    if(!resumed.text.includes('--continue')||resumed.text.includes('утверждаю')) errors.push('OpenRouter resume does not use a file-backed same-session continuation');
    else ok.push('OpenRouter STOP answer stays out of shell args and resumes the last session');
  }finally{
    rmSync(fixture,{recursive:true,force:true});
  }
}
runOpenRouterCredentialIsolationRegression();

function runWholeProjectLockRegression(){
  const fixture=mkdtempSync(join(tmpdir(),'forge-agent-lock-'));
  try{
    run('whole-project lock selects Qwen',['scripts/forge-agent.mjs','select','qwen','--project',fixture],{},'Locked qwen');
    run('whole-project lock status',['scripts/forge-agent.mjs','profile','--project',fixture],{},'Locked model: qwen3-coder-plus');
    const refused=spawnSync(process.execPath,['scripts/forge-agent.mjs','start','gemini','--project',fixture,'--dry-run'],{cwd:ROOT,encoding:'utf8'});
    if(refused.status===0||!`${refused.stdout||''}${refused.stderr||''}`.includes('Project is locked to qwen')) errors.push('whole-project lock allowed an implicit provider switch');
    else ok.push('whole-project lock refuses an implicit provider switch');
    run('whole-project lock explicit reselection',['scripts/forge-agent.mjs','select','gemini','--project',fixture],{},'Locked gemini');
    const saved=JSON.parse(readFileSync(join(fixture,'.forge','agent.json'),'utf8'));
    if(saved.agent!=='gemini'||saved.model!=='gemini-3.7-flash'||saved.locked!==true) errors.push('whole-project reselection did not persist the expected contract');
    else ok.push('whole-project explicit reselection is persisted');
  }finally{
    rmSync(fixture,{recursive:true,force:true});
  }
}
runWholeProjectLockRegression();

function runWindowsCmdPromptRegression(){
  if(process.platform!=='win32') return;
  const fixture=mkdtempSync(join(tmpdir(),'forge-cmd-prompt-'));
  const shim=join(fixture,'fake-qwen.cmd');
  const fakeHome=join(fixture,'home');
  const dataDir=join(fixture,'forge-data');
  try{
    mkdirSync(join(fakeHome,'.qwen'),{recursive:true});
    writeFileSync(join(fakeHome,'.qwen','settings.json'),JSON.stringify({mcpServers:{unityMCP:{url:'http://127.0.0.1:65534/mcp',type:'http'}}},null,2),'utf8');
    writeFileSync(shim,'@echo off\r\necho FAKE_QWEN_LITERAL_PROMPT_OK\r\nif not defined QWEN_CODE_SYSTEM_SETTINGS_PATH exit /b 7\r\ntype "%QWEN_CODE_SYSTEM_SETTINGS_PATH%"\r\n','utf8');
    const launched=run('Windows npm cmd receives file-backed startup instruction',['scripts/forge-agent.mjs','start','qwen','--project',fixture],{FORGE_QWEN_CLI:shim,USERPROFILE:fakeHome,FORGE_DATA_DIR:dataDir},'FAKE_QWEN_LITERAL_PROMPT_OK');
    const startup=join(fixture,'.forge','agent-start.md');
    if(launched.r.status===0&&existsSync(startup)&&readFileSync(startup,'utf8').includes('only terminal AI agent')) ok.push('whole-project prompt is durable and shell-metacharacter safe');
    else errors.push('whole-project startup prompt was not written before cmd launch');
    if(launched.r.status===0&&launched.text.includes('Qwen preflight: unavailable local MCP excluded')&&launched.text.includes('"unityMCP"')) ok.push('Qwen launch excludes unavailable loopback MCP without changing user settings');
    else errors.push('Qwen launch did not isolate an unavailable loopback MCP');
  }finally{
    rmSync(fixture,{recursive:true,force:true});
  }
}
runWindowsCmdPromptRegression();

const reg=JSON.parse(readFileSync(join(ROOT,'adapters/agents.json'),'utf8'));
if(!reg.agents?.claude?.profiles?.includes('api')) errors.push('Claude API profile missing'); else ok.push('Claude API profile declared');
if(!reg.agents?.codex?.profiles?.includes('api')) errors.push('Codex API profile missing'); else ok.push('Codex API profile declared');
if(!reg.agents?.gigachat?.builtinLauncher) errors.push('GigaChat builtin terminal launcher missing'); else ok.push('GigaChat terminal adapter declared');
for(const name of ['gemini','qwen','deepseek','glm','minimax','kimi','openrouter']){
  if(!reg.agents?.[name]?.defaultModel) errors.push(`${name} whole-project default model missing`);
  else ok.push(`${name} whole-project model declared`);
}
if(reg.agents?.openrouter?.profiles?.[0]!=='zdr'||reg.agents?.openrouter?.modelPresets?.qwen!=='openrouter/qwen/qwen3-coder-next') errors.push('OpenRouter ZDR profile or verified Qwen Coder Next preset missing');
else ok.push('OpenRouter defaults to ZDR and exposes the verified Qwen Coder Next preset');
if(reg.agents?.openrouter?.minimumRuntimeVersion!=='1.18.20'||!runtimeMeetsMinimum('1.18.20','1.18.20')||compareVersions('1.18.19','1.18.20')!==-1) errors.push('OpenCode minimum-version preflight is missing or invalid');
else ok.push('OpenCode whole-project launch requires the tool-compatible 1.18.20+ runtime');
if(reg.agents?.qwen?.profiles?.includes('oauth')||reg.agents?.qwen?.profileModels?.['coding-plan']!=='qwen3-coder-plus') errors.push('Qwen profiles still expose discontinued OAuth or lack the Coding Plan model');
else ok.push('Qwen exposes current Coding Plan/API profiles without discontinued OAuth');

const secretProviders=['deepseek','zai','minimax','openrouter'];
const secretLib=readFileSync(join(ROOT,'scripts/lib/forge-secrets.mjs'),'utf8');
for(const provider of secretProviders){
  if(!secretLib.includes(`${provider}: {`)) errors.push(`${provider} centralized secret declaration missing`);
  else ok.push(`${provider} centralized secret declaration`);
}

const forge=readFileSync(join(ROOT,'scripts/forge-agent.mjs'),'utf8');
if(!forge.includes("login','--with-api-key")) errors.push('Codex API profile does not use stdin --with-api-key login'); else ok.push('Codex API login uses stdin');
if(!forge.includes("delete env.OPENAI_API_KEY")) errors.push('Codex API launch leaks OPENAI_API_KEY into tool environment'); else ok.push('Codex API key removed from launched tool environment');
if(!forge.includes('apiKeyHelper')) errors.push('Claude API profile does not use apiKeyHelper'); else ok.push('Claude API uses apiKeyHelper instead of key command args');
if(!forge.includes('delete env.ANTHROPIC_API_KEY')) errors.push('Claude API launch leaves ANTHROPIC_API_KEY in child environment'); else ok.push('Claude API key removed from launched tool environment');
if(!forge.includes("env.NODE_USE_SYSTEM_CA='1'")) errors.push('GigaChat launcher does not enable the Node system CA store before child startup'); else ok.push('GigaChat launcher enables the Node system CA store');
if(!forge.includes('applyDefaultSearchEnvironment(env)')) errors.push('GigaChat launcher does not apply the shared no-key search fallback'); else ok.push('GigaChat launcher uses the shared no-key search fallback');
if(!forge.includes('env.FORGE_AI_HOST=agentName')||!forge.includes('env.FORGE_MODEL=model')) errors.push('whole-project runtime identity is not forwarded to phase markers'); else ok.push('whole-project phase markers receive the actual host and model identity');
const listToolPath=join(ROOT,'adapters/opencode/tools/list.ts');
if(!existsSync(listToolPath)) errors.push('OpenCode list compatibility tool missing'); else {
  const listTool=readFileSync(listToolPath,'utf8');
  if(!listTool.includes('lastSuccessfulTargetBySession')||!listTool.includes('Repeated list call blocked')) errors.push('OpenCode list tool does not suppress identical successful repeats');
  else ok.push('OpenCode exposes a bounded project-local list tool with repeat suppression');
}
if(!forge.includes("const agent = { build: { steps: 64 } }")) errors.push('OpenCode whole-project agent has no per-turn step budget');
else ok.push('OpenCode whole-project turns are capped at 64 agentic steps');
const giga=readFileSync(join(ROOT,'scripts/gigachat-agent.mjs'),'utf8');
if(!giga.includes('assertWritablePath(p)')) errors.push('GigaChat direct edits do not enforce protected Forge paths'); else ok.push('GigaChat direct edits enforce protected Forge paths');
const openaiImage=readFileSync(join(ROOT,'scripts/openai-image.mjs'),'utf8');
if(!openaiImage.includes("getProviderSecret('openai'")) errors.push('OpenAI image helper does not use centralized Forge secret lookup'); else ok.push('OpenAI image helper uses centralized secret lookup');

const dash=readFileSync(join(ROOT,'dashboard.html'),'utf8');
for(const label of ['Claude API','Codex API','GigaChat API']) if(!dash.includes(`>${label}</button>`)) errors.push(`dashboard missing ${label}`); else ok.push(`dashboard ${label}`);
if(!dash.includes("launch claude --profile api --full")||!dash.includes("launch codex --profile api --full")||!dash.includes("launch gigachat --profile api --full")) errors.push('dashboard API launch routing incomplete'); else ok.push('dashboard API buttons route through forge-agent');

console.log('\nForge API terminal profile audit\n'+'─'.repeat(42));
for(const x of ok) console.log('  ✓ '+x); for(const x of errors) console.log('  ✗ '+x);
console.log(errors.length?`\nFAILED: ${errors.length} issue(s)`:'\nPASS: API terminal profiles are internally consistent');
process.exit(errors.length?1:0);
