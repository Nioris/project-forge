#!/usr/bin/env node
/** Offline regression check for Claude API, Codex API and GigaChat terminal surfaces. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=resolve(process.cwd()); const errors=[]; const ok=[];
const need=rel=>existsSync(join(ROOT,rel))?ok.push(rel):errors.push(`${rel} missing`);
for(const f of ['scripts/forge-agent.mjs','scripts/forge-secrets.mjs','scripts/forge-secret-helper.mjs','scripts/gigachat-agent.mjs','scripts/lib/forge-secrets.mjs']) need(f);

function run(label, argv, env={}, expect=''){
  const r=spawnSync(process.execPath,argv,{cwd:ROOT,encoding:'utf8',env:{...process.env,...env}}); const text=(r.stdout||'')+(r.stderr||'');
  if(r.status!==0 || (expect&&!text.includes(expect))) errors.push(`${label}: ${text.slice(0,500)}`); else ok.push(label); return {r,text};
}
run('secret status command',['scripts/forge-secrets.mjs','status'],{},'Forge secrets:');
run('central helper via env',['scripts/forge-secret-helper.mjs','anthropic'],{ANTHROPIC_API_KEY:'test-anthropic'},'test-anthropic');
run('GigaChat terminal dry-run',['scripts/gigachat-agent.mjs','--project',ROOT,'--dry-run'],{},'network=no');
run('GigaChat terminal full dry-run',['scripts/gigachat-agent.mjs','--project',ROOT,'--full','--dry-run'],{},'functions=9');

const reg=JSON.parse(readFileSync(join(ROOT,'adapters/agents.json'),'utf8'));
if(!reg.agents?.claude?.profiles?.includes('api')) errors.push('Claude API profile missing'); else ok.push('Claude API profile declared');
if(!reg.agents?.codex?.profiles?.includes('api')) errors.push('Codex API profile missing'); else ok.push('Codex API profile declared');
if(!reg.agents?.gigachat?.builtinLauncher) errors.push('GigaChat builtin terminal launcher missing'); else ok.push('GigaChat terminal adapter declared');

const forge=readFileSync(join(ROOT,'scripts/forge-agent.mjs'),'utf8');
if(!forge.includes("login','--with-api-key")) errors.push('Codex API profile does not use stdin --with-api-key login'); else ok.push('Codex API login uses stdin');
if(!forge.includes("delete env.OPENAI_API_KEY")) errors.push('Codex API launch leaks OPENAI_API_KEY into tool environment'); else ok.push('Codex API key removed from launched tool environment');
if(!forge.includes('apiKeyHelper')) errors.push('Claude API profile does not use apiKeyHelper'); else ok.push('Claude API uses apiKeyHelper instead of key command args');
if(!forge.includes('delete env.ANTHROPIC_API_KEY')) errors.push('Claude API launch leaves ANTHROPIC_API_KEY in child environment'); else ok.push('Claude API key removed from launched tool environment');
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
