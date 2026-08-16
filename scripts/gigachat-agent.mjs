#!/usr/bin/env node
/**
 * Project Forge terminal agent backed by the official GigaChat API.
 * Uses documented custom function calling; no IDE dependency.
 * File tools stay inside the selected project. --full additionally enables shell execution.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { getAccessToken, gigaJson } from './lib/gigachat-api.mjs';

const argv = process.argv.slice(2);
const val = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const FULL = argv.includes('--full');
const PROJECT = resolve(val('--project') || '.');
const MODEL = val('--model') || process.env.FORGE_GIGACHAT_MODEL || 'GigaChat-3-Ultra';
const ONE_SHOT = val('--prompt');
const DRY_RUN = argv.includes('--dry-run');
if (!existsSync(PROJECT) || !statSync(PROJECT).isDirectory()) { console.error(`[X] Project not found: ${PROJECT}`); process.exit(2); }

function safePath(input = '.') {
  const p = resolve(PROJECT, input);
  const rel = relative(PROJECT, p);
  if (rel.startsWith('..') || resolve(p) === resolve(PROJECT, '..')) throw new Error('Path escapes project root');
  return p;
}
function rel(p) { return relative(PROJECT, p).replace(/\\/g, '/') || '.'; }
function assertWritablePath(p) {
  if (process.env.FORGE_ALLOW_PROTECTED_WRITE === '1') return;
  const segments = rel(p).toLowerCase().split('/').filter(Boolean);
  if (segments.includes('gameintegration')) throw new Error('Forge workspace discipline: GameIntegration/ is read-only; edit WorkProgress/ instead.');
  const ri = segments.indexOf('release');
  if (ri >= 0 && segments.length - ri - 1 > 0) throw new Error('Forge workspace discipline: Release/ content is protected; edit WorkProgress/ and let release skills publish builds.');
}

function clip(text, max = 30000) { const s = String(text ?? ''); return s.length > max ? s.slice(0, max) + `\n...[truncated ${s.length-max} chars]` : s; }
function jsonResult(obj) { return JSON.stringify(obj); }
function readText(p) { return readFileSync(p, 'utf8'); }
function lineSlice(text, start = 1, end = null) {
  const lines = text.split(/\r?\n/); const a = Math.max(1, Number(start)||1); const b = end == null ? Math.min(lines.length, a+299) : Math.min(lines.length, Number(end)||a);
  return { start:a, end:b, total:lines.length, content:lines.slice(a-1,b).map((x,i)=>`${a+i}: ${x}`).join('\n') };
}
function walk(dir, depth, base = dir, out = []) {
  if (depth < 0 || out.length >= 1000) return out;
  for (const e of readdirSync(dir, { withFileTypes:true })) {
    if (['.git','node_modules','dist','build'].includes(e.name)) continue;
    const p = join(dir,e.name); out.push((e.isDirectory()?'[D] ':'[F] ')+rel(p));
    if (e.isDirectory()) walk(p, depth-1, base, out);
    if (out.length >= 1000) break;
  }
  return out;
}
function searchText(query, root='.', maxResults=80) {
  const start = safePath(root); const found=[];
  const visit = p => {
    if (found.length >= maxResults) return;
    const st=statSync(p);
    if (st.isDirectory()) { for (const e of readdirSync(p,{withFileTypes:true})) { if (['.git','node_modules','dist','build'].includes(e.name)) continue; visit(join(p,e.name)); if(found.length>=maxResults) break; } return; }
    if (st.size > 2_000_000) return;
    let txt; try { txt=readFileSync(p,'utf8'); } catch { return; }
    txt.split(/\r?\n/).forEach((line,i)=>{ if(found.length<maxResults && line.toLowerCase().includes(String(query).toLowerCase())) found.push(`${rel(p)}:${i+1}: ${line}`); });
  };
  visit(start); return found;
}

const functions = [
  { name:'read_file', description:'Read a UTF-8 project file with line numbers.', parameters:{type:'object',properties:{path:{type:'string'},start_line:{type:'integer'},end_line:{type:'integer'}},required:['path']} },
  { name:'list_files', description:'List project files/directories recursively to a small depth.', parameters:{type:'object',properties:{path:{type:'string'},depth:{type:'integer'}},required:[]} },
  { name:'search_text', description:'Search plain text in project files.', parameters:{type:'object',properties:{query:{type:'string'},path:{type:'string'},max_results:{type:'integer'}},required:['query']} },
  { name:'write_file', description:'Create or fully replace a UTF-8 file inside the project. Use only when the Forge phase/plan permits editing.', parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']} },
  { name:'replace_text', description:'Replace exactly one occurrence of old_text in a UTF-8 project file.', parameters:{type:'object',properties:{path:{type:'string'},old_text:{type:'string'},new_text:{type:'string'}},required:['path','old_text','new_text']} },
  { name:'forge_skill', description:'Load the canonical Project Forge SKILL.md for a named skill.', parameters:{type:'object',properties:{name:{type:'string'}},required:['name']} },
  { name:'forge_status', description:'Run the read-only Forge phase-aware status snapshot helper.', parameters:{type:'object',properties:{json:{type:'boolean'}},required:[]} },
  { name:'git_diff', description:'Show git status and diff for the current project.', parameters:{type:'object',properties:{stat_only:{type:'boolean'}},required:[]} },
];
if (FULL) functions.push({ name:'run_command', description:'Run a shell command in the project. Full mode only. Prefer existing Forge verifiers and avoid destructive commands unless the user explicitly requested them.', parameters:{type:'object',properties:{command:{type:'string'},timeout_seconds:{type:'integer'}},required:['command']} });

function tool(name, a={}) {
  try {
    if (name==='read_file') { const p=safePath(a.path); return jsonResult({ok:true,path:rel(p),...lineSlice(readText(p),a.start_line,a.end_line)}); }
    if (name==='list_files') { const p=safePath(a.path||'.'); return jsonResult({ok:true,path:rel(p),items:walk(p,Math.max(0,Math.min(5,Number(a.depth??2))))}); }
    if (name==='search_text') return jsonResult({ok:true,results:searchText(a.query,a.path||'.',Math.max(1,Math.min(200,Number(a.max_results||80))))});
    if (name==='write_file') { const p=safePath(a.path); assertWritablePath(p); const parent=dirname(p); if(!existsSync(parent)) throw new Error('Parent directory does not exist'); writeFileSync(p,String(a.content),'utf8'); return jsonResult({ok:true,path:rel(p),bytes:Buffer.byteLength(String(a.content))}); }
    if (name==='replace_text') { const p=safePath(a.path); assertWritablePath(p); const old=String(a.old_text), neu=String(a.new_text); let s=readText(p); const first=s.indexOf(old); if(first<0) throw new Error('old_text not found'); if(s.indexOf(old,first+old.length)>=0) throw new Error('old_text occurs more than once'); s=s.slice(0,first)+neu+s.slice(first+old.length); writeFileSync(p,s,'utf8'); return jsonResult({ok:true,path:rel(p)}); }
    if (name==='forge_skill') { const p=safePath(`.claude/skills/${a.name}/SKILL.md`); return jsonResult({ok:true,path:rel(p),content:clip(readText(p),50000)}); }
    if (name==='forge_status') { const helper=safePath('.claude/skills/status/references/project-status.mjs'); const r=spawnSync(process.execPath,[helper,PROJECT,...(a.json?['--json']:[])],{cwd:PROJECT,encoding:'utf8',timeout:30000}); return jsonResult({ok:r.status===0,status:r.status,output:clip((r.stdout||'')+(r.stderr||''),40000)}); }
    if (name==='git_diff') { const args=a.stat_only?['diff','--stat']:['diff','--no-ext-diff']; const s=spawnSync('git',['status','--short'],{cwd:PROJECT,encoding:'utf8',timeout:15000}); const d=spawnSync('git',args,{cwd:PROJECT,encoding:'utf8',timeout:30000}); return jsonResult({ok:s.status===0&&d.status===0,status:clip(s.stdout,12000),diff:clip(d.stdout,40000)}); }
    if (name==='run_command') { if(!FULL) throw new Error('run_command requires --full'); const sec=Math.max(1,Math.min(300,Number(a.timeout_seconds||120))); const r=spawnSync(String(a.command),{cwd:PROJECT,encoding:'utf8',shell:true,timeout:sec*1000,maxBuffer:4*1024*1024}); return jsonResult({ok:r.status===0,status:r.status,stdout:clip(r.stdout,30000),stderr:clip(r.stderr,12000)}); }
    throw new Error(`Unknown tool: ${name}`);
  } catch(e) { return jsonResult({ok:false,error:e.message}); }
}

const forgePath = safePath('FORGE.md');
const forgeRules = existsSync(forgePath) ? clip(readText(forgePath),45000) : 'FORGE.md missing; do not guess phase state.';
let initialStatus='';
try { initialStatus=JSON.parse(tool('forge_status',{json:false})).output||''; } catch {}
const system = `You are the GigaChat terminal adapter inside Project Forge. Work as a coding agent, not as a general chat bot.\n\nProject: ${PROJECT}\nModel host: GigaChat API\nFull shell mode: ${FULL?'enabled':'disabled'}\n\nMandatory rules:\n- Follow FORGE.md and canonical .claude/skills/*/SKILL.md.\n- Exactly 9 phases. Never invent Phase 10.\n- Respect STOP-points and explicit user approvals.\n- Machine phase markers and actual artifacts outrank prose state.\n- Read the relevant skill before executing it.\n- Use project tools to inspect evidence; do not claim tests ran unless you ran them.\n- Keep edits inside the project.\n- Never expose API keys or secret file contents.\n\nFORGE.md:\n${forgeRules}\n\nInitial read-only status:\n${clip(initialStatus,12000)}`;
const messages=[{role:'system',content:system}];
let tokenCache=null;
async function token(){ if(!tokenCache) tokenCache=(await getAccessToken(PROJECT)).token; return tokenCache; }
async function turn(text){
  messages.push({role:'user',content:text});
  for(let n=0;n<24;n++){
    const data=await gigaJson(await token(),'/v1/chat/completions',{model:MODEL,messages,functions,function_call:'auto'},240000);
    const choice=data?.choices?.[0]; const msg=choice?.message;
    if(!msg) throw new Error('GigaChat returned no message');
    if(choice.finish_reason==='function_call' || msg.function_call){
      messages.push({role:'assistant',content:msg.content||'',functions_state_id:msg.functions_state_id,function_call:msg.function_call});
      const name=msg.function_call?.name; let a=msg.function_call?.arguments||{}; if(typeof a==='string'){ try{a=JSON.parse(a);}catch{a={};} }
      process.stdout.write(`\n[tool] ${name}\n`);
      const result=tool(name,a);
      messages.push({role:'function',name,content:result});
      continue;
    }
    const content=msg.content||''; messages.push({role:'assistant',content, ...(msg.functions_state_id?{functions_state_id:msg.functions_state_id}:{})});
    process.stdout.write(`\n${content}\n`); return;
  }
  throw new Error('Tool loop limit reached (24)');
}

console.log(`Project Forge GigaChat Terminal Agent\nProject: ${PROJECT}\nModel: ${MODEL}\nMode: ${FULL?'FULL (shell enabled)':'standard (no shell tool)'}\nCommands: /exit, /status`);
if (DRY_RUN) { console.log(`[DRY-RUN] functions=${functions.length} forgeRules=${existsSync(forgePath)?'yes':'no'} network=no`); process.exit(0); }
if (ONE_SHOT) { try { await turn(ONE_SHOT); } catch(e){ console.error('[X] '+e.message); process.exit(1); } process.exit(0); }
const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true});
const ask=()=>rl.question('\n> ', async input=>{
  const q=input.trim(); if(!q) return ask(); if(['/exit','/quit'].includes(q)){rl.close();return;}
  if(q==='/status'){ console.log(JSON.parse(tool('forge_status',{json:false})).output); return ask(); }
  try { await turn(q); } catch(e){ tokenCache=null; console.error('\n[X] '+e.message); }
  ask();
});
rl.on('close',()=>process.exit(0)); ask();
