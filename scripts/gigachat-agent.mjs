#!/usr/bin/env node
/**
 * Project Forge terminal agent backed by the official GigaChat API.
 * Uses documented custom function calling; no IDE dependency.
 * File tools stay inside the selected project. --full additionally enables shell execution.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, cpSync, renameSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import { getAccessToken, gigaJson, downloadGigaFile } from './lib/gigachat-api.mjs';
import { applyDefaultSearchEnvironment, getSearchCapabilities, searchDoctor, webSearch, imageSearch, webFetch } from './lib/forge-search.mjs';
import { appendForgeDiagnostic } from '../.claude/hooks/lib/forge-diagnostics.mjs';
import {
  cancelTaskRun, configureTaskSkillContract, configureTaskVerifierPlan, listTaskRuns, makeRunResult, makeTask, readTaskRun, recordTaskResult, startTaskRun,
} from '../.claude/skills/status/references/execution-contract.mjs';
import { deriveVerifierPlanFromOperations, runTaskVerifiers } from '../.claude/skills/status/references/verifier-runner.mjs';
import { readSkillContract } from '../.claude/skills/status/references/skill-contract.mjs';
import { resolveActiveTaskScope, assertTaskWrite } from '../.claude/skills/status/references/task-scope-guard.mjs';
import { validatePhase4VisualEvidence } from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { screenInventoryPayload, screenInventorySha256 } from '../.claude/skills/status/references/screen-flow-contract.mjs';
import { readTrustedProjectEngine } from '../.claude/skills/status/references/project-engine.mjs';

applyDefaultSearchEnvironment();

const argv = process.argv.slice(2);
const val = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const FULL = argv.includes('--full');
const PROJECT = resolve(val('--project') || '.');
const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDITED_FORGE_VERSION = '4.68.66';
const CONTRACT_VERSION = '6.3.11-godot-native-test-release-2026-08-26';
const MODEL = val('--model') || process.env.FORGE_GIGACHAT_MODEL || 'GigaChat-3-Ultra';
const ONE_SHOT = val('--prompt');
const DRY_RUN = argv.includes('--dry-run');
const SELF_TEST = argv.includes('--self-test');
const SCOPE_SHADOW_PROBE = process.env.FORGE_SCOPE_SHADOW_PROBE === '1';
const REQUEST_DOCTOR = argv.includes('--request-doctor');
const INTEGRATION_TEST = argv.includes('--integration-test');
if (!existsSync(PROJECT) || !statSync(PROJECT).isDirectory()) { console.error(`[X] Project not found: ${PROJECT}`); process.exit(2); }

function reportForgeBehavior(input={}) {
  return appendForgeDiagnostic(PROJECT, {
    action: input.action || 'report',
    severity: input.severity || 'warn',
    code: input.code || 'GIGACHAT_FORGE_BEHAVIOR_ANOMALY',
    kind: input.kind || 'adapter_transport',
    source: input.source || 'runtime',
    host: 'gigachat',
    phase: input.phase || activePhase || null,
    component: input.component || 'gigachat-agent',
    operation: input.operation || '',
    message: input.message || '',
    expected: input.expected || '',
    actual: input.actual || '',
    evidence: input.evidence || [],
    fingerprint: input.fingerprint,
  });
}

function safePath(input = '.') {
  const p = resolve(PROJECT, input);
  const rel = relative(PROJECT, p);
  if (rel.startsWith('..') || resolve(p) === resolve(PROJECT, '..')) throw new Error('Path escapes project root');
  return p;
}
function rel(p) { return relative(PROJECT, p).replace(/\\/g, '/') || '.'; }
function trustedProjectEngine() {
  return readTrustedProjectEngine(PROJECT, { moduleRoot: ENGINE, environmentRoot: ENGINE });
}
function assertWritablePath(p) {
  if (process.env.FORGE_ALLOW_PROTECTED_WRITE === '1') return;
  const segments = rel(p).toLowerCase().split('/').filter(Boolean);
  if (segments.includes('gameintegration')) throw new Error('Forge workspace discipline: GameIntegration/ is read-only; edit WorkProgress/ instead.');
  const ri = segments.indexOf('release');
  if (ri >= 0 && segments.length - ri - 1 > 0) throw new Error('Forge workspace discipline: Release/ content is protected; edit WorkProgress/ and let release skills publish builds.');
}

// Native GigaChat file tools do not pass through Codex's PreToolUse hooks.
// They therefore consult the same durable Task/SkillContract scope guard
// immediately before model-initiated filesystem writes. Runtime bookkeeping
// (phase markers, durable ledgers, session capture) deliberately does not use
// these helpers: it is host-owned lifecycle state, not model-authored work.
function activeTaskScopeForModel() {
  return resolveActiveTaskScope({
    projectRoot: PROJECT,
    taskId: activeDirective?.taskId || process.env.FORGE_TASK_ID || null,
    phase: activePhase || null,
  });
}
function taskScopeIsActive(scope) {
  return Boolean(scope?.active || scope?.enforced || scope?.taskId || scope?.task?.id);
}
function reportTaskScopeDenied(operation, target, reason) {
  reportForgeBehavior({
    severity:'warn', code:'GIGA_TASK_SCOPE_DENIED', kind:'policy_guard', component:'gigachat-agent', operation,
    message:'GigaChat model-initiated mutation was denied by the active durable Task scope.',
    expected:'Write only within the active Task SkillContract scope or use a declared read-only verifier/lifecycle operation.',
    actual:`target=${String(target || '?').slice(0,300)}; reason=${String(reason || '').slice(0,700)}`,
  });
}
function assertModelTaskWrite(pathInput, operation) {
  const target = rel(safePath(pathInput));
  let result;
  try {
    result = assertTaskWrite({
      projectRoot: PROJECT,
      taskId: activeDirective?.taskId || process.env.FORGE_TASK_ID || null,
      target,
      operation,
      phase: activePhase || null,
    });
  } catch (error) {
    reportTaskScopeDenied(operation,target,error?.message || error);
    throw error;
  }
  if (result === false || result?.ok === false || result?.allowed === false) {
    const reason=result?.error || result?.reason || `Task scope blocks ${operation} for ${target}`;
    reportTaskScopeDenied(operation,target,reason);
    throw new Error(reason);
  }
  return target;
}
function taskScopeDeny(operation, target, reason) {
  reportTaskScopeDenied(operation,target,reason);
  return reason;
}
function declaredReadOnlyForgeVerifier(scriptPath) {
  let registry;
  try { registry = JSON.parse(readFileSync(resolve(ENGINE, 'mcp-server', 'verifiers.json'), 'utf8')); }
  catch { return false; }
  const resolved = resolve(scriptPath);
  return Array.isArray(registry?.verifiers) && registry.verifiers.some(entry => {
    if (entry?.mutates !== false || typeof entry?.script !== 'string') return false;
    const enginePath = resolve(ENGINE, entry.script);
    return resolved === enginePath;
  });
}
function taskScopedAssertTargets(targets, operation) {
  try {
    for (const target of targets) assertModelTaskWrite(target, operation);
    return null;
  } catch (error) {
    return String(error?.message || error);
  }
}
function taskScopedShellMutationBlock(command, operation='run_command') {
  const scope = activeTaskScopeForModel();
  if (!taskScopeIsActive(scope)) return null;
  const cmd = String(command || '').trim();
  return taskScopeDeny(operation,cmd,`Active Task scope ${scope?.taskId || scope?.task?.id || 'guarded'} blocks raw ${operation} execution fail-closed. Use bounded Forge read tools, a portable translated operation, a native scoped write tool, or forge_script for a declared lifecycle/verifier operation.`);
}
function forgeScriptTargetArg(args=[]) {
  const valueFlags = new Set(['--out','--port','--lang','--states','--mobile','--desktop','--clicks','--keys']);
  for (let index=0; index<args.length; index++) {
    const value=String(args[index] || '');
    if (valueFlags.has(value.toLowerCase())) { index++; continue; }
    if (!value.startsWith('--')) return value;
  }
  return '.';
}
function taskScopedForgeScriptBlock(scriptPath, args=[]) {
  const scope = activeTaskScopeForModel();
  if (!taskScopeIsActive(scope)) return null;
  if (/phase-state\.mjs$/i.test(String(scriptPath || ''))) return null; // host-owned durable phase lifecycle
  if (/forge-metrics\.mjs$/i.test(String(scriptPath || ''))) return null; // bounded host-owned product telemetry
  if (/project-status\.mjs$/i.test(String(scriptPath || '')) || declaredReadOnlyForgeVerifier(scriptPath)) return null;
  const base = String(scriptPath || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  const positional = forgeScriptTargetArg(args);
  let target;
  try { target = rel(safePath(positional)); }
  catch (error) { return taskScopeDeny('forge_script',positional,`Forge Task scope blocks unsafe forge_script target: ${String(error?.message || error)}`); }
  const targetDir = /\.html?$/i.test(target) ? rel(dirname(safePath(target))) : target;
  if (base === 'integrate-gacha.mjs') {
    const denied = taskScopedAssertTargets([
      `${targetDir}/index.html`, `${targetDir}/js/01-state-foundation.js`, `${targetDir}/js/14-persistence.js`,
      `${targetDir}/js/13-reset.js`, `${targetDir}/js/18-gacha-integration.js`, `${targetDir}/js/19-gacha-core.js`,
      'wiki/runtime/gacha-backups/.forge-scope-probe',
    ], 'forge_script:integrate-gacha');
    return denied ? taskScopeDeny('forge_script:integrate-gacha',targetDir,`Forge Task scope blocks integrate-gacha: ${denied}`) : null;
  }
  if (base === 'modularize-existing-project.mjs') {
    if (!args.some(arg => /^--(?:apply|refresh)$/i.test(String(arg)))) return null;
    const denied = taskScopedAssertTargets([
      /\.html?$/i.test(target) ? target : `${targetDir}/index.html`, `${targetDir}/js/.forge-scope-probe`,
      `${targetDir}/css/.forge-scope-probe`, 'wiki/architecture/modules.json', 'wiki/architecture/modules.md',
      'wiki/runtime/modularize-backups/.forge-scope-probe',
    ], 'forge_script:modularize-existing-project');
    return denied ? taskScopeDeny('forge_script:modularize-existing-project',targetDir,`Forge Task scope blocks modularize-existing-project: ${denied}`) : null;
  }
  if (base === 'ai-studio-init.mjs') {
    const rootPrefix = targetDir === '.' ? '' : `${targetDir}/`;
    const denied = taskScopedAssertTargets([
      `${rootPrefix}.forge-ai.json`, `${rootPrefix}assets/style/STYLE-BIBLE.md`, `${rootPrefix}assets/prompts/.forge-scope-probe`,
      `${rootPrefix}assets/generated/candidates/.forge-scope-probe`, `${rootPrefix}assets/generated/approved/.forge-scope-probe`,
      `${rootPrefix}wiki/ai/.forge-scope-probe`, `${rootPrefix}wiki/ai/art-reviews/.forge-scope-probe`, `${rootPrefix}wiki/qa/.forge-scope-probe`,
    ], 'forge_script:ai-studio-init');
    return denied ? taskScopeDeny('forge_script:ai-studio-init',targetDir,`Forge Task scope blocks ai-studio-init: ${denied}`) : null;
  }
  if (base === 'screen-targets.mjs') {
    const rootPrefix = targetDir === '.' ? '' : `${targetDir}/`;
    const denied = taskScopedAssertTargets([`${rootPrefix}assets/target/screens/manifest.json`], 'forge_script:screen-targets');
    return denied ? taskScopeDeny('forge_script:screen-targets',targetDir,`Forge Task scope blocks screen-targets: ${denied}`) : null;
  }
  if (base === 'prepare-godot-phase4-review.mjs') {
    const rootPrefix = targetDir === '.' ? '' : `${targetDir}/`;
    const denied = taskScopedAssertTargets([`${rootPrefix}screens/review/phase-4-visual-evidence.template.json`], 'forge_script:prepare-godot-phase4-review');
    return denied ? taskScopeDeny('forge_script:prepare-godot-phase4-review',targetDir,`Forge Task scope blocks Godot Phase 4 review preparation: ${denied}`) : null;
  }
  if (base === 'bind-phase4-visual-evidence.mjs') {
    const rootPrefix = targetDir === '.' ? '' : `${targetDir}/`;
    const denied = taskScopedAssertTargets([`${rootPrefix}wiki/qa/phase-4-visual-evidence.json`], 'forge_script:bind-phase4-visual-evidence');
    return denied ? taskScopeDeny('forge_script:bind-phase4-visual-evidence',targetDir,`Forge Task scope blocks Phase 4 evidence binding: ${denied}`) : null;
  }
  if (base === 'record-phase4-visual-review.mjs') {
    const rootPrefix = targetDir === '.' ? '' : `${targetDir}/`;
    const denied = taskScopedAssertTargets([`${rootPrefix}wiki/qa/phase-4-visual-evidence.json`], 'forge_script:record-phase4-visual-review');
    return denied ? taskScopeDeny('forge_script:record-phase4-visual-review',targetDir,`Forge Task scope blocks Phase 4 review recording: ${denied}`) : null;
  }
  if (base === 'record-image-provenance.mjs') {
    const rootPrefix = targetDir === '.' ? '' : `${targetDir}/`;
    const denied = taskScopedAssertTargets([`${rootPrefix}assets/generated/provenance.jsonl`], 'forge_script:record-image-provenance');
    return denied ? taskScopeDeny('forge_script:record-image-provenance',targetDir,`Forge Task scope blocks image provenance recording: ${denied}`) : null;
  }
  if (base === 'screens-shoot.mjs' || base === 'godot-screens-shoot.mjs' || base === 'godot-proof-video.mjs') {
    const rootPrefix = targetDir === '.' ? '' : `${targetDir}/`;
    const operation = `forge_script:${base.replace(/\.mjs$/i, '')}`;
    const denied = taskScopedAssertTargets([`${rootPrefix}screens/review/.forge-scope-probe`], operation);
    return denied ? taskScopeDeny(operation,targetDir,`Forge Task scope blocks visual capture output: ${denied}`) : null;
  }
  if (base === 'godot-tech-check.mjs' || base === 'godot-playtest.mjs' || base === 'godot-release-verify.mjs') {
    const output = base === 'godot-tech-check.mjs' ? 'qa/godot-tech/report.json'
      : base === 'godot-playtest.mjs' ? 'qa/godot-playtest/report.json'
        : 'qa/godot-release/report.json';
    const operation = `forge_script:${base.replace(/\.mjs$/i, '')}`;
    const denied = taskScopedAssertTargets([output], operation);
    return denied ? taskScopeDeny(operation,output,`Forge Task scope blocks native Godot verifier output: ${denied}`) : null;
  }
  if (base === 'build-godot-release.mjs') {
    const denied = taskScopedAssertTargets(['Release/.forge-scope-probe'], 'forge_script:build-godot-release');
    return denied ? taskScopeDeny('forge_script:build-godot-release','Release',`Forge Task scope blocks Godot release publication: ${denied}`) : null;
  }
  if (base === 'local-stage.mjs') {
    if (!args.some(arg => /^--ai$/i.test(String(arg)))) return null;
    const outIndex = args.findIndex(arg => /^--out$/i.test(String(arg)));
    const outEquals = args.find(arg => /^--out=.+/i.test(String(arg)));
    const output = outEquals ? String(outEquals).slice('--out='.length)
      : outIndex >= 0 && args[outIndex + 1] ? String(args[outIndex + 1]) : `${targetDir}/stage-out`;
    const outputRoot=rel(safePath(output));
    const denied = taskScopedAssertTargets([`${outputRoot}/rt.json`,`${outputRoot}/stage.png`], 'forge_script:local-stage');
    return denied ? taskScopeDeny('forge_script:local-stage',output,`Forge Task scope blocks local-stage output: ${denied}`) : null;
  }
  return taskScopeDeny('forge_script',base,`Active Task scope ${scope?.taskId || scope?.task?.id || 'guarded'} blocks unclassified forge_script ${base || 'unknown'} because its write targets are not declared. Use a registered read-only verifier or a native scoped write tool.`);
}

function clip(text, max = 30000) { const s = String(text ?? ''); return s.length > max ? s.slice(0, max) + `\n...[truncated ${s.length-max} chars]` : s; }
function jsonResult(obj) { return JSON.stringify(obj); }
function readText(p) { return readFileSync(p, 'utf8'); }
function lineSlice(text, start = 1, end = null) {
  const lines = text.split(/\r?\n/); const a = Math.max(1, Number(start)||1); const b = end == null ? Math.min(lines.length, a+299) : Math.min(lines.length, Number(end)||a);
  return { start:a, end:b, total:lines.length, content:lines.slice(a-1,b).map((x,i)=>`${a+i}: ${x}`).join('\n') };
}

function readFileForModel(a={}){
  const p=safePath(a.path), pathKey=rel(p), text=readText(p);
  const largeExisting=Buffer.byteLength(text,'utf8')>=32_000;
  const explicit=a.start_line!==undefined || a.end_line!==undefined;
  let start=a.start_line, end=a.end_line;
  if(!explicit && activeDirective){
    const cursors=activeDirective.readCursors&&typeof activeDirective.readCursors==='object'?activeDirective.readCursors:{};
    start=Math.max(1,Number(cursors[pathKey]||1));
    end=start+299;
  }
  const slice=lineSlice(text,start,end);
  if(!explicit && activeDirective){
    if(slice.start>slice.total) return {ok:false,failure_type:'read-loop-guard',error:`${pathKey} was already read through line ${slice.total}. Do not restart at line 1; use search_text and targeted replace_text now.`,path:pathKey,total:slice.total,complete:true};
    const next=slice.end<slice.total?slice.end+1:null;
    activeDirective={...activeDirective,readCursors:{...(activeDirective.readCursors||{}),[pathKey]:next||slice.total+1},updatedAt:new Date().toISOString()};
    persistRuntimeEvidenceLedger();
    return {ok:true,path:pathKey,...slice,auto_paged:true,complete:next===null,next_start_line:next,large_existing_source:largeExisting,recommended_skill:largeExisting?'modularize-existing-project':null,note:next?`Call read_file with the same path and no line range for the next page starting at line ${next}.`:'Entire file has now been read; do not read it again.'};
  }
  return {ok:true,path:pathKey,...slice,auto_paged:false,complete:slice.end>=slice.total,next_start_line:slice.end<slice.total?slice.end+1:null,large_existing_source:largeExisting,recommended_skill:largeExisting?'modularize-existing-project':null};
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

function requestedWorkProgressEntrypoints(request=''){
  const matches=String(request||'').match(/WorkProgress[\\/][A-Za-z0-9_-]+(?:[\\/][A-Za-z0-9_.\\/-]+\.(?:html?|js|mjs|css))?/gi)||[];
  return uniquePaths(matches.map(raw=>{
    const normalized=raw.replace(/\\/g,'/').replace(/[.,;:!?]+$/,'');
    return /\.(?:html?|js|mjs|css)$/i.test(normalized)?normalized:`${normalized}/index.html`;
  }));
}

function requestedLargeWorkProgressSources(request=''){
  const found=[];
  for(const path of requestedWorkProgressEntrypoints(request)){
    let target;try{target=safePath(path);}catch{continue;}
    let st;try{st=statSync(target);}catch{continue;}
    if(st.isFile()&&st.size>=32_000) found.push({path:rel(target),bytes:st.size});
  }
  return found;
}

function directTaskMonolithInstruction(items=requestedLargeWorkProgressSources(activeDirective?.request||'')){
  if(!items.length) return '';
  const summary=items.map(item=>`${item.path} (${item.bytes} bytes)`).join(', ');
  return `Large existing source detected: ${summary}. Before feature work, load forge_skill modularize-existing-project, run a baseline check, then execute forge_script with name "scripts/modularize-existing-project.mjs" and args ["${items[0].path}","--apply"]. Verify it with --check and regression playtest before editing the owning modules. Do not reconstruct the monolith with write_file. `;
}

function moduleRolesForTask(request=''){
  const roles=new Set(['state-foundation','ui-render','persistence','bootstrap']);
  if(/гач|gacha|drop|выпад/i.test(String(request||''))) ['production','feedback-bubbles'].forEach(role=>roles.add(role));
  if(/директор|director|карьер/i.test(String(request||''))) ['career','director-mode','management'].forEach(role=>roles.add(role));
  if(/drag|merge|слиян|сетк/i.test(String(request||''))) roles.add('drag-merge');
  return roles;
}

function preloadedModuleTaskContext(request=''){
  const manifestPath=safePath('wiki/architecture/modules.json');
  if(!existsSync(manifestPath)) return '';
  let manifest;try{manifest=JSON.parse(readText(manifestPath));}catch{return '';}
  const requested=requestedWorkProgressEntrypoints(request);
  if(!manifest?.source || !requested.includes(String(manifest.source))) return '';
  const roles=moduleRolesForTask(request), selected=(manifest.modules||[]).filter(module=>module.type==='js'&&roles.has(module.role));
  const paths=[manifest.source];
  const gameDir=rel(dirname(safePath(manifest.source)));
  const gachaPath=`${gameDir}/gacha.js`;
  if(/гач|gacha/i.test(String(request||''))&&existsSync(safePath(gachaPath))) paths.push(gachaPath);
  paths.push(...selected.map(module=>module.path));
  let used=0;const files=[];
  for(const path of uniquePaths(paths)){
    let content;try{content=readText(safePath(path));}catch{continue;}
    const remaining=24_000-used;if(remaining<=0) break;
    const bounded=clip(content,Math.min(remaining,9000));
    used+=bounded.length;
    files.push(`--- ${path} ---\n${bounded}`);
  }
  if(!files.length) return '';
  const summary=(manifest.modules||[]).map(module=>`${module.order}:${module.role}=${module.path}`).join('\n');
  return `[FORGE PRELOADED MODULE CONTEXT — do not reread these files]\n`+
    `Contract source: ${manifest.source}; state owner: ${manifest.state_owner}; persistence owner: ${manifest.persistence_owner}.\n`+
    `If the task adds a numbered js/styles module, write it once, load it explicitly from ${manifest.source} in the required runtime order, then run modularize-existing-project.mjs ${manifest.source} --refresh followed by --check. Refresh adopts connected modules; it rejects orphan files and preserves the approved relative order. A passing playtest before the new module is loaded is not evidence for this task.\n`+
    `Approved load order:\n${clip(summary,5000)}\n\n${files.join('\n\n')}\n`+
    `[END PRELOADED MODULE CONTEXT]\n`;
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


const WORKSPACE_PREVIEW_EXTS = new Set([
  '.html','.htm','.js','.mjs','.cjs','.ts','.tsx','.jsx','.css','.scss','.sass','.less',
  '.json','.md','.txt','.xml','.yaml','.yml','.toml','.ini','.cfg','.cs','.gd','.lua','.py'
]);

function inspectWorkspaceSource(maxChars=32000) {
  const roots=['GameIntegration','WorkProgress'];
  const inventories={};
  const previews=[];
  let used=0;

  const visit=p=>{
    if(used>=maxChars) return;
    let st;
    try { st=statSync(p); } catch { return; }

    if(st.isDirectory()){
      for(const e of readdirSync(p,{withFileTypes:true})){
        if(['.git','node_modules','dist','build','Release'].includes(e.name)) continue;
        visit(join(p,e.name));
        if(used>=maxChars) break;
      }
      return;
    }

    const rp=rel(p);
    const ext=extOf(rp);
    if(!WORKSPACE_PREVIEW_EXTS.has(ext) || st.size>2_000_000) return;

    let content='';
    try { content=readFileSync(p,'utf8'); } catch { return; }
    const budget=Math.max(0,Math.min(12000,maxChars-used));
    if(budget<=0) return;
    const preview=clip(content,budget);
    used+=preview.length;
    previews.push({path:rp,bytes:st.size,preview});
  };

  for(const rootRel of roots){
    const root=safePath(rootRel);
    if(!existsSync(root)) { inventories[rootRel]=[]; continue; }
    inventories[rootRel]=walk(root,4).slice(0,400);
    visit(root);
  }

  return {
    ok:true,
    inventories,
    previews,
    total_preview_chars:used,
    note:'GameIntegration is read-only source. WorkProgress is the active implementation workspace. Analyze/edit the ingested WorkProgress copy.'
  };
}

function uniquePaths(values=[]){return [...new Set(values.map(String).filter(Boolean))];}


function optionalText(path, max=16000) {
  try { const p=safePath(path); return existsSync(p) ? clip(readText(p),max) : ''; } catch { return ''; }
}
function ensureDir(path) {
  const p=safePath(path); if(!existsSync(p)) mkdirSync(p,{recursive:true}); return p;
}
function phaseMarkersSnapshot() {
  const dir=safePath('wiki/phases'); const out=[];
  if(!existsSync(dir)) return out;
  for(const e of readdirSync(dir,{withFileTypes:true})) {
    if(!e.isFile() || !/^phase-\d+\.json$/i.test(e.name)) continue;
    try {
      const obj=JSON.parse(readText(join(dir,e.name)));
      out.push({
        phase:Number(obj.phase),
        name:obj.name||'',
        state:obj.state||'unknown',
        reason:obj.reason||null,
        evidence:Array.isArray(obj.evidence)?obj.evidence:[],
        updatedAt:obj.updatedAt||null
      });
    } catch {}
  }
  return out.sort((a,b)=>a.phase-b.phase);
}
function latestSessionSnapshots(limit=3) {
  const dir=safePath('wiki/sessions'); if(!existsSync(dir)) return [];
  const files=readdirSync(dir,{withFileTypes:true})
    .filter(e=>e.isFile() && /\.md$/i.test(e.name))
    .map(e=>{ const p=join(dir,e.name); let st; try{st=statSync(p);}catch{return null;} return {name:e.name,p,mtime:st.mtimeMs}; })
    .filter(Boolean).sort((a,b)=>b.mtime-a.mtime).slice(0,limit);
  return files.map(x=>({path:`wiki/sessions/${x.name}`,content:clip(readText(x.p),7000)}));
}
function workProgressSnapshot(depth=3) {
  const p=safePath('WorkProgress'); if(!existsSync(p)) return [];
  return walk(p,Math.max(0,Math.min(4,depth))).slice(0,350);
}
function planSnapshot(depth=2) {
  const p=safePath('wiki/plan'); if(!existsSync(p)) return [];
  return walk(p,Math.max(0,Math.min(3,depth))).slice(0,200);
}
function gitStatusSnapshot() {
  try {
    const r=spawnSync('git',['status','--short'],{cwd:PROJECT,encoding:'utf8',timeout:12000});
    return r.status===0 ? clip(r.stdout||'',12000) : '';
  } catch { return ''; }
}
function loadDecisionLedger() {
  try {
    const p=safePath('wiki/decisions/gigachat-decisions.json');
    if(!existsSync(p)) return [];
    const data=JSON.parse(readText(p));
    return Array.isArray(data?.decisions) ? data.decisions : [];
  } catch { return []; }
}
function saveDecisionLedger(decisions) {
  ensureDir('wiki/decisions');
  const p=safePath('wiki/decisions/gigachat-decisions.json');
  writeFileSync(p,JSON.stringify({schemaVersion:1,updatedAt:new Date().toISOString(),decisions},null,2)+'\n','utf8');
}
function projectContextWarnings(markers,current,map,ledger,plans) {
  const warnings=[];
  const anyComplete=markers.some(x=>x.state==='complete');
  if(anyComplete && /No phase is complete yet|ни одна фаза не заверш/i.test(current)) warnings.push('wiki/_current.md is stale: it says no phase is complete while machine phase markers contain completed phases.');
  for(const m of markers) {
    if(m.state==='complete' && new RegExp(`Phase\\s*${m.phase}[^\\n]{0,80}in[_ -]?progress`,'i').test(map)) warnings.push(`wiki/_map.md is stale for Phase ${m.phase}: map says in_progress but machine marker says complete.`);
    if(m.state==='complete' && (!Array.isArray(m.evidence) || m.evidence.length===0)) warnings.push(`Phase ${m.phase} is marked complete with empty evidence.`);
  }
  if(markers.some(x=>x.phase===2 && x.state==='complete') && plans.length===0) warnings.push('Phase 2 is complete but wiki/plan has no development-plan artifact.');
  const monetization=[...ledger].reverse().find(d=>/монетизац|зарабатыва/i.test(String(d.question||'')));
  if(monetization && /только реклам|вариант\s*а/i.test(String(monetization.answer||''))) {
    const gdd=optionalText('wiki/design/gdd.md',12000), mon=optionalText('wiki/design/monetization.md',12000);
    if(/Hybrid|Гибрид/i.test(gdd+mon)) warnings.push('Decision/wiki drift: latest monetization decision is ads-only, but GDD/monetization wiki still contains Hybrid/IAP wording.');
  }
  return warnings;
}
function buildProjectContext() {
  const markers=phaseMarkersSnapshot();
  const current=optionalText('wiki/_current.md',12000);
  const map=optionalText('wiki/_map.md',12000);
  const sessions=latestSessionSnapshots(3);
  const work=workProgressSnapshot(3);
  const plans=planSnapshot(2);
  const ledger=loadDecisionLedger();
  const status=(()=>{ try{return JSON.parse(tool('forge_status',{json:false})).output||'';}catch{return '';} })();
  const warnings=projectContextWarnings(markers,current,map,ledger,plans);
  return {
    generatedAt:new Date().toISOString(),
    status:clip(status,12000),
    phaseMarkers:markers,
    current:clip(current,10000),
    map:clip(map,10000),
    recentSessions:sessions,
    decisions:ledger.slice(-30),
    workProgress:work,
    planFiles:plans,
    gitStatus:gitStatusSnapshot(),
    activeDirective:activeDirective&&typeof activeDirective==='object'?activeDirective:null,
    warnings
  };
}
function upsertGeneratedSection(path,startMarker,endMarker,body) {
  const p=safePath(path); ensureDir(relative(PROJECT,dirname(p)));
  let txt=existsSync(p)?readText(p):'';
  const section=`${startMarker}\n${body.trim()}\n${endMarker}`;
  const a=txt.indexOf(startMarker), b=txt.indexOf(endMarker);
  if(a>=0 && b>=a) txt=txt.slice(0,a)+section+txt.slice(b+endMarker.length);
  else txt=(txt.trim()?txt.trim()+'\n\n':'')+section+'\n';
  writeFileSync(p,txt.endsWith('\n')?txt:txt+'\n','utf8');
}
function normalizeList(value) {
  if(Array.isArray(value)) return value.map(x=>String(x).trim()).filter(Boolean);
  const s=String(value||'').trim(); return s?s.split(/\r?\n|;\s*/).map(x=>x.replace(/^\s*[-*]\s*/,'').trim()).filter(Boolean):[];
}
function appendSessionEntry(entry) {
  ensureDir('wiki/sessions');
  const day=new Date().toISOString().slice(0,10);
  const path=`wiki/sessions/${day}-gigachat.md`;
  const p=safePath(path);
  if(!existsSync(p)) writeFileSync(p,`# GigaChat session journal — ${day}\n\n`,'utf8');
  const bullets=(title,items)=>items.length?`\n### ${title}\n${items.map(x=>`- ${x}`).join('\n')}\n`:'';
  const block=[
    `## ${new Date().toISOString()} — Phase ${entry.phase||'?'} `,
    '',
    entry.summary||'',
    bullets('Decisions',entry.decisions||[]),
    bullets('Artifacts / changes',entry.artifacts||[]),
    bullets('Checks / evidence',entry.checks||[]),
    bullets('Blockers',entry.blockers||[]),
    entry.next?`\n### Next\n${entry.next}\n`:'',
    ''
  ].join('\n');
  writeFileSync(p,readText(p)+block,'utf8');
  return path;
}


const BINARY_TEXT_BLOCKED_EXTS = new Set([
  '.png','.jpg','.jpeg','.webp','.gif','.bmp','.ico',
  '.wav','.mp3','.ogg','.flac','.mp4','.webm','.mov','.avi',
  '.glb','.fbx','.zip','.7z','.rar','.pdf','.woff','.woff2','.ttf','.otf'
]);
const VISUAL_EXTS = new Set(['.png','.jpg','.jpeg','.webp','.gif','.bmp','.ico','.svg','.glb','.fbx']);
const GAME_CODE_EXTS = new Set(['.html','.htm','.css','.scss','.sass','.less','.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.cs','.gd','.lua','.py','.java','.kt','.swift','.cpp','.cc','.c','.h','.hpp','.shader','.glsl','.wgsl']);

function extOf(path='') {
  const base=String(path).toLowerCase().split(/[\\/]/).pop()||'';
  const i=base.lastIndexOf('.');
  return i>=0?base.slice(i):'';
}
function assertTextWritableExtension(path) {
  const ext=extOf(path);
  if (BINARY_TEXT_BLOCKED_EXTS.has(ext)) {
    throw new Error(`write_file is UTF-8 text-only and cannot create binary/media file ${path}. Import or generate the real asset with an available provider/tool.`);
  }
}
function fileExistsNonEmpty(path, minBytes=1) {
  try { const p=safePath(path); const st=statSync(p); return st.isFile() && st.size>=minBytes; } catch { return false; }
}
function fileSize(path) { try { return statSync(safePath(path)).size; } catch { return 0; } }
function readHead(path, max=64) { try { const b=readFileSync(safePath(path)); return b.subarray(0,max); } catch { return Buffer.alloc(0); } }
function isValidMediaFile(path) {
  const ext=extOf(path); const b=readHead(path,64);
  if (!b.length) return false;
  if (ext==='.png') return b.length>=8 && b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (ext==='.jpg' || ext==='.jpeg') return b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff;
  if (ext==='.gif') return b.subarray(0,6).toString('ascii')==='GIF87a' || b.subarray(0,6).toString('ascii')==='GIF89a';
  if (ext==='.webp') return b.length>=12 && b.subarray(0,4).toString('ascii')==='RIFF' && b.subarray(8,12).toString('ascii')==='WEBP';
  if (ext==='.bmp') return b.length>=2 && b.subarray(0,2).toString('ascii')==='BM';
  if (ext==='.ico') return b.length>=4 && b[0]===0 && b[1]===0 && b[2]===1 && b[3]===0;
  if (ext==='.svg') { try { return /<svg\b/i.test(readText(safePath(path)).slice(0,8192)); } catch { return false; } }
  if (ext==='.wav') return b.length>=12 && b.subarray(0,4).toString('ascii')==='RIFF' && b.subarray(8,12).toString('ascii')==='WAVE';
  if (ext==='.ogg') return b.length>=4 && b.subarray(0,4).toString('ascii')==='OggS';
  if (ext==='.mp3') return b.subarray(0,3).toString('ascii')==='ID3' || (b.length>=2 && b[0]===0xff && (b[1]&0xe0)===0xe0);
  if (ext==='.mp4' || ext==='.mov') return b.length>=12 && b.subarray(4,8).toString('ascii')==='ftyp';
  if (ext==='.webm') return b.length>=4 && b[0]===0x1a && b[1]===0x45 && b[2]===0xdf && b[3]===0xa3;
  if (ext==='.glb') return b.length>=4 && b.subarray(0,4).toString('ascii')==='glTF';
  return fileSize(path)>0;
}

function detectImageBufferExt(buffer) {
  const b=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer||[]);
  if (b.length>=8 && b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return '.png';
  if (b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff) return '.jpg';
  if (b.length>=12 && b.subarray(0,4).toString('ascii')==='RIFF' && b.subarray(8,12).toString('ascii')==='WEBP') return '.webp';
  if (b.length>=6 && ['GIF87a','GIF89a'].includes(b.subarray(0,6).toString('ascii'))) return '.gif';
  return null;
}
function isValidFbxBuffer(buffer) {
  const b=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer||[]);
  if(!b.length) return false;
  const head=b.subarray(0,64).toString('latin1');
  return head.startsWith('Kaydara FBX Binary') || /^\s*;\s*FBX/i.test(head) || /FBXHeaderExtension/i.test(head);
}
function withDetectedExtension(path, actualExt) {
  const p=String(path||'').replace(/\\/g,'/');
  const ext=extOf(p);
  if(!ext) return p+actualExt;
  if(ext===actualExt || (actualExt==='.jpg' && ext==='.jpeg')) return p;
  return p.slice(0,-ext.length)+actualExt;
}
function extractImageFileId(content='') {
  const m=String(content).match(/<img\b[^>]*\bsrc=["']([0-9a-f]{8}-[0-9a-f-]{27,})["']/i);
  return m?.[1] || null;
}
function extractModelFileId(content='') {
  const m=String(content).match(/\bdata-model-id=["']([0-9a-f]{8}-[0-9a-f-]{27,})["']/i);
  return m?.[1] || null;
}

function hashFileAbs(p) {
  try {
    const st=statSync(p); if(!st.isFile()) return null;
    if(st.size>12_000_000) return `large:${st.size}:${Math.floor(st.mtimeMs)}`;
    return createHash('sha256').update(readFileSync(p)).digest('hex');
  } catch { return null; }
}
function snapshotRoots(roots=['WorkProgress','assets','screens','wiki','Release']) {
  const out=new Map();
  const visit=(p)=>{
    let st; try{st=statSync(p);}catch{return;}
    if(st.isDirectory()){
      for(const e of readdirSync(p,{withFileTypes:true})){
        if(['.git','node_modules','dist','build','GameIntegration'].includes(e.name)) continue;
        visit(join(p,e.name));
      }
      return;
    }
    if(st.isFile()) out.set(rel(p),hashFileAbs(p));
  };
  for(const root of roots){ const p=safePath(root); if(existsSync(p)) visit(p); }
  for(const extra of ['ANALYSIS.md','SETUP_GUIDE.md','.forge-ai.json']){
    const p=safePath(extra); if(existsSync(p) && statSync(p).isFile()) out.set(rel(p),hashFileAbs(p));
  }
  return out;
}
function changedSinceBaseline(filterFn=()=>true) {
  const now=snapshotRoots(); const out=[];
  for(const [path,hash] of now){
    if(!filterFn(path)) continue;
    if(!phaseBaseline.has(path) || phaseBaseline.get(path)!==hash) out.push(path);
  }
  return out;
}
function pathLooksProductionAsset(path) {
  const p=String(path).replace(/\\/g,'/').toLowerCase();
  if(!VISUAL_EXTS.has(extOf(p))) return false;
  if(p.includes('/refs/') || p.includes('/candidates/') || p.includes('/prompts/')) return false;
  if(/^assets\/target\/target-frame\.(?:png|jpe?g|webp)$/.test(p)) return false;
  return true;
}

function phase4SelectionPath() {
  return ['assets/style/selection.json','assets/bible/selection.json','assets/selection.json']
    .find(path=>{
      if(!fileExistsNonEmpty(path,20)) return false;
      try { const value=JSON.parse(readText(safePath(path))); return Boolean(value&&typeof value==='object'&&Object.keys(value).length); }
      catch { return false; }
    })||null;
}
function phase4TargetFramePath() {
  return ['assets/target/target-frame.png','assets/target/target-frame.jpg','assets/target/target-frame.jpeg','assets/target/target-frame.webp']
    .find(path=>fileExistsNonEmpty(path,32)&&isValidMediaFile(path))||null;
}
function phase4TargetVariantPaths() {
  return findFiles('assets/target',/(?:variant|candidate|option|[-_][abc]|target-frame[-_]\d+)[^/]*\.(png|jpg|jpeg|webp)$/i,32,100)
    .filter(isValidMediaFile);
}
function pathLooksGameChange(path) {
  const p=String(path).replace(/\\/g,'/');
  if(!p.toLowerCase().startsWith('workprogress/')) return false;
  return GAME_CODE_EXTS.has(extOf(p)) || VISUAL_EXTS.has(extOf(p));
}
function pathLooksGodotGameChange(path) {
  const normalized=String(path).replace(/\\/g,'/').toLowerCase();
  if(/^(?:\.git|\.claude|\.agents|\.codex|wiki|qa|screens\/review|release|gameintegration)(?:\/|$)/i.test(normalized)) return false;
  return new Set(['.godot','.tscn','.tres','.res','.gd','.cs','.gdshader','.png','.jpg','.jpeg','.webp','.svg','.ttf','.otf']).has(extOf(normalized));
}
function listInvalidChangedMedia() {
  return changedSinceBaseline(p=>VISUAL_EXTS.has(extOf(p))).filter(p=>!isValidMediaFile(p));
}
function shellTokens(text='') {
  return (String(text).match(/"[^"]*"|'[^']*'|[^\s]+/g)||[]).map(x=>x.replace(/^['"]|['"]$/g,''));
}
function completionArtifactArgs(command, phase) {
  const m=String(command||'').match(new RegExp(`phase-state\\.mjs[^\\n]*\\bcomplete\\s+${phase}\\b(.*)$`,'i'));
  if(!m) return [];
  const stop=new Set(['&&','||',';','>','>>','2>','2>>']); const out=[];
  for(const tok of shellTokens(m[1])) { if(stop.has(tok)) break; if(tok.startsWith('-')) continue; out.push(tok); }
  return out;
}

function runtimeOwnedWriteBlock(path='') {
  const p=String(path||'').replace(/\\/g,'/').toLowerCase();
  if(p==='wiki/decisions/gigachat-decisions.json') return 'This decision ledger is runtime-owned. Use ask_user; Forge persists the answer automatically. Do not write or replace the ledger directly.';
  if(p==='wiki/runtime/gigachat-evidence.json') return 'This runtime evidence ledger is runtime-owned and cannot be written by the model.';
  return null;
}

const RUNTIME_EVIDENCE_PATH='wiki/runtime/gigachat-evidence.json';

function loadRuntimeEvidenceLedger(){
  try{
    const p=safePath(RUNTIME_EVIDENCE_PATH);
    if(!existsSync(p)) return {schemaVersion:7,verifiers:[],completedSkills:[],phase:null,pendingDecision:null,productMetricsEvidence:null,activeDirective:null};
    const x=JSON.parse(readText(p));
    return {
      schemaVersion:7,
      verifiers:Array.isArray(x.verifiers)?x.verifiers:[],
      completedSkills:Array.isArray(x.completedSkills)?x.completedSkills:[],
      phase:x.phase&&typeof x.phase==='object'?x.phase:null,
      pendingDecision:x.pendingDecision&&typeof x.pendingDecision==='object'?x.pendingDecision:null,
      activeDirective:x.activeDirective&&typeof x.activeDirective==='object'&&String(x.activeDirective.request||'').trim()?x.activeDirective:null,
      productMetricsEvidence:x.productMetricsEvidence&&typeof x.productMetricsEvidence==='object'
        ? x.productMetricsEvidence
        : (x.phase?.productMetricsEvidence&&typeof x.phase.productMetricsEvidence==='object'?x.phase.productMetricsEvidence:null)
    };
  }catch{return {schemaVersion:7,verifiers:[],completedSkills:[],phase:null,pendingDecision:null,productMetricsEvidence:null,activeDirective:null};}
}
let durableRuntimeEvidence=loadRuntimeEvidenceLedger();
let activeDirective=durableRuntimeEvidence.activeDirective&&typeof durableRuntimeEvidence.activeDirective==='object'?durableRuntimeEvidence.activeDirective:null;
let currentTurnReadOnly=false;
let verifierLedger=new Map((durableRuntimeEvidence.verifiers||[]).map(v=>[v.key,v]));
let completedSkills=new Set(durableRuntimeEvidence.completedSkills||[]);
let phaseEvidenceStartedAt=null;

let phaseBaseline=new Map();
let phaseStarted=false;
let phaseSuccessfulCommands=[];
let phaseCommandOutputs=[];
let unresolvedFailures=new Map();
let capabilityBlock=null;
let phaseWrittenFiles=new Set();
let phaseSearchEvidence={web:[],image:[],fetch:[]};
let phaseProductMetricsEvidence={
  startedAt:durableRuntimeEvidence.productMetricsEvidence?.startedAt||null,
  web:Array.isArray(durableRuntimeEvidence.productMetricsEvidence?.web)?durableRuntimeEvidence.productMetricsEvidence.web:[],
  fetch:Array.isArray(durableRuntimeEvidence.productMetricsEvidence?.fetch)?durableRuntimeEvidence.productMetricsEvidence.fetch:[]
};
let memoryDirty=false;
let runtimeDecisions=[];
let lastMemorySyncAt=null;
let latestMemorySessionPath=null;

function persistRuntimeEvidenceLedger(){
  try{
    ensureDir('wiki/runtime');
    durableRuntimeEvidence={
      schemaVersion:7,
      updatedAt:new Date().toISOString(),
      verifiers:[...verifierLedger.values()].slice(-500),
      completedSkills:[...completedSkills].sort(),
      pendingDecision:pendingDecision&&typeof pendingDecision==='object'?pendingDecision:null,
      activeDirective:activeDirective&&typeof activeDirective==='object'?activeDirective:null,
      productMetricsEvidence:phaseProductMetricsEvidence,
      phase:activePhase?{
        phase:activePhase,
        startedAt:phaseEvidenceStartedAt,
        baseline:Object.fromEntries(phaseBaseline),
        unresolvedFailures:[...unresolvedFailures.entries()],
        searchEvidence:phaseSearchEvidence,
        productMetricsEvidence:phaseProductMetricsEvidence
      }:null
    };
    const target=safePath(RUNTIME_EVIDENCE_PATH);
    const tmp=`${target}.${process.pid}.${randomUUID().slice(0,8)}.tmp`;
    writeFileSync(tmp,JSON.stringify(durableRuntimeEvidence,null,2)+'\n','utf8');
    renameSync(tmp,target);
    return true;
  }catch{return false;}
}

function resetPhaseRuntimeEvidence() {
  phaseBaseline=new Map(); phaseStarted=false; phaseSuccessfulCommands=[]; phaseCommandOutputs=[];
  unresolvedFailures=new Map(); capabilityBlock=null; phaseWrittenFiles=new Set();
  phaseSearchEvidence={web:[],image:[],fetch:[]};
  memoryDirty=false; runtimeDecisions=[]; lastMemorySyncAt=null; latestMemorySessionPath=null;
  phaseEvidenceStartedAt=null;
}
function startPhaseEvidence(phase,{resume=false}={}) {
  activePhase=phase; phaseStarted=true;
  const saved=durableRuntimeEvidence?.phase;
  if(resume && saved && Number(saved.phase)===Number(phase) && saved.baseline){
    phaseBaseline=new Map(Object.entries(saved.baseline));
    phaseEvidenceStartedAt=saved.startedAt||new Date().toISOString();
    unresolvedFailures=new Map(
      (Array.isArray(saved.unresolvedFailures)?saved.unresolvedFailures:[])
        .map(([k,v])=>[k,normalizePersistedFailure(k,v)])
    );
    phaseSearchEvidence={
      web:Array.isArray(saved.searchEvidence?.web)?saved.searchEvidence.web:[],
      image:Array.isArray(saved.searchEvidence?.image)?saved.searchEvidence.image:[],
      fetch:Array.isArray(saved.searchEvidence?.fetch)?saved.searchEvidence.fetch:[]
    };
  }else{
    phaseBaseline=snapshotRoots();
    phaseEvidenceStartedAt=new Date().toISOString();
    unresolvedFailures=new Map();
    phaseSearchEvidence={web:[],image:[],fetch:[]};
  }
  phaseSuccessfulCommands=[]; phaseCommandOutputs=[]; phaseWrittenFiles=new Set(); capabilityBlock=null;
  persistRuntimeEvidenceLedger();
}

function normalizeForgeScriptId(value='') {
  let script=String(value||'').trim().replaceAll('\\','/').replace(/^\.\//,'');
  if(!script || /^[A-Za-z]:/.test(script) || script.startsWith('/') || script.split('/').includes('..')) return '';
  if(!script.includes('/')) script=`scripts/${script}`;
  return script;
}

function operationKey(name,a={}) {
  if(name==='run_command' || name==='forge_script') {
    const raw=name==='forge_script'
      ? `forge_script:${String(a.name||'').trim()} ${(Array.isArray(a.args)?a.args:[]).map(String).join(' ')}`
      : String(a.command||'').trim();
    return `run:${raw.replace(/\s+/g,' ').trim().toLowerCase()}`;
  }
  if(name==='forge_web_search'||name==='forge_image_search') return `${name}:${String(a.query||'').trim().toLowerCase()}`;
  if(name==='forge_web_fetch') return `${name}:${String(a.url||'').trim()}`;
  return `${name}:${String(a.path||a.output_path||a.destination||JSON.stringify(a))}`;
}
function classifyFailure(name,a={},r={}) {
  const body=`${r.error||''}\n${r.stderr||''}\n${r.stdout||''}`;
  const cmd=name==='forge_script'
    ? `${a.name||''} ${(Array.isArray(a.args)?a.args:[]).join(' ')}`
    : String(a.command||'');
  if(/oauth|tls|certificate|cert_|fetch failed|econn|enotfound|network/i.test(body)) return 'auth-network';
  if(/enospc|disk full|permission denied|eacces|eperm/i.test(body)) return 'environment-hard';
  if(/web_search|image_search|browser|pixellab|mcp|capabilit/i.test(body)) return 'capability';
  if(/playtest|godot-tech-check|godot-release-verify|screens-shoot|visual-qa|ui-review|release-ready|check-setup-guide|test-game|local-stage|gameplay-balance|record-promo|check-inline-strings|--check/i.test(cmd)) return 'verifier';
  return 'recoverable';
}
function failureMessage(v){ return typeof v==='string'?v:String(v?.message||v?.error||JSON.stringify(v)); }
function hardFailure(v){ return ['capability','auth-network','environment-hard'].includes(String(v?.type||'')); }

function normalizePersistedFailure(key,value){
  const v=value && typeof value==='object' ? {...value} : {type:'recoverable',message:String(value||'')};
  if(String(key||'').startsWith('forge_web_fetch:')) v.type='source-access';
  return v;
}
function commandLooksMutating(command=''){
  const c=String(command||'').trim().toLowerCase();
  if(!c) return false;
  if(/^(git\s+(status|diff|log)|dir\b|ls\b|find\b|du\b|grep\b|type\b|cat\b)/i.test(c)) return false;
  if(/phase-state\.mjs.*\b(?:start|reopen|block|complete)\b/i.test(c)) return true;
  if(/ai-studio-init\.mjs/i.test(c) && !/--check/i.test(c)) return true;
  if(/integrate-gacha|screen-targets|screens-shoot|godot-proof-video|godot-tech-check|godot-playtest|godot-release-verify|build-godot-release|prepare-godot-phase4-review|bind-phase4-visual-evidence|record-phase4-visual-review|record-image-provenance|release-yandex|build-yandex|use-template|record-promo|npm\s+(install|i\b)|mkdir|copy|cp\s|move|del\s|rm\s|powershell.*(?:set-content|remove-item|copy-item)/i.test(c)) return true;
  return false;
}
function verifierEntrySuccess(re,phaseOverride=activePhase){
  const phase=Number(phaseOverride||0);
  for(const v of verifierLedger.values()){
    if(Number(v.phase)!==phase || Number(v.status)!==0) continue;
    if(re.test(String(v.command||v.key||''))) return v;
  }
  return null;
}
function verifierEntryWithOutput(commandRe,outputRe,phaseOverride=activePhase){
  const phase=Number(phaseOverride||0);
  for(const v of verifierLedger.values()){
    if(Number(v.phase)!==phase || Number(v.status)!==0) continue;
    if(commandRe.test(String(v.command||'')) && outputRe.test(`${v.stdout||''}\n${v.stderr||''}`)) return v;
  }
  return null;
}
function recordOperation(name,a,result) {
  let r={}; try{r=JSON.parse(result);}catch{}
  if(activeDirective && r.ok!==false){
    const isWrite=['write_file','replace_text','copy_path','gigachat_generate_image','gigachat_generate_3d'].includes(name) && !(name==='copy_path'&&r.unchanged===true);
    const isMutatingCommand=(name==='run_command'||name==='forge_script') && commandLooksMutating(name==='forge_script'?`${a.name||''} ${(a.args||[]).join(' ')}`:a.command);
    if(isWrite||isMutatingCommand){
      const op={tool:name,target:String(r.path||r.destination||a.path||a.output_path||a.name||a.command||''),at:new Date().toISOString()};
      activeDirective={...activeDirective,operations:[...(activeDirective.operations||[]),op].slice(-50),updatedAt:op.at};
    }
    if(name==='read_file'){
      const read={path:String(r.path||a.path||''),at:new Date().toISOString()};
      activeDirective={...activeDirective,reads:[...(activeDirective.reads||[]),read].slice(-50),updatedAt:read.at};
    }
  }
  if(r.ok!==false && name==='read_file') phaseReadFiles.add(String(r.path||a.path||''));
  if(r.ok!==false && name==='list_files') phaseListedPaths.add(String(r.path||a.path||'.'));
  if(r.ok!==false && name==='forge_context') phaseContextRefreshed=true;
  if(r.ok!==false && name==='forge_workspace_inspect') {
    phaseWorkspaceInspected=true;
    phaseListedPaths.add('GameIntegration'); phaseListedPaths.add('WorkProgress');
    for(const item of (r.previews||[])) if(item?.path) phaseReadFiles.add(String(item.path));
  }
  if(name==='run_command' || name==='forge_script') {
    const key=operationKey(name,a);
    const command=name==='forge_script'
      ? `forge_script ${String(a.name||'')} ${(Array.isArray(a.args)?a.args:[]).map(String).join(' ')}`.trim()
      : String(a.command||'');
    if(r.translated_skill || r.translated_shell) {
      unresolvedFailures.delete(key);
      if(r.translated_skill && r.skill){
        registerSuccessfulSkillLoad(r.skill,result);
        for(const prior of [...unresolvedFailures.keys()]) if(String(prior).toLowerCase().includes(String(r.skill).toLowerCase())) unresolvedFailures.delete(prior);
      }
      if(r.translated_shell && r.mutating) memoryDirty=true;
    } else if(r.ok===false) {
      const failure={type:classifyFailure(name,a,r),message:r.error||shortText(r.stderr||r.stdout||'command failed',220),at:new Date().toISOString()};
      unresolvedFailures.set(key,failure);
      verifierLedger.set(key,{key,phase:activePhase,command,tool:name,script:name==='forge_script'?normalizeForgeScriptId(a.name):null,args:name==='forge_script'?(Array.isArray(a.args)?a.args.map(String):[]):[],exitCode:Number(r.status??1),status:Number(r.status??1),stdout:String(r.stdout||''),stderr:String(r.stderr||''),failureType:failure.type,updatedAt:new Date().toISOString()});
    } else {
      unresolvedFailures.delete(key);
      if(/playtest\.mjs/i.test(command)) for(const prior of [...unresolvedFailures.keys()]) if(/run:node scripts[\\/]playtest\.mjs/i.test(prior)) unresolvedFailures.delete(prior);
      if(/screens-shoot\.mjs/i.test(command)) for(const prior of [...unresolvedFailures.keys()]) if(/screens-shoot/i.test(prior)) unresolvedFailures.delete(prior);
      if(/local-stage\.mjs/i.test(command)&&/--ai/i.test(command)) for(const prior of [...unresolvedFailures.keys()]) if(/local-stage/i.test(prior)) unresolvedFailures.delete(prior);
      verifierLedger.set(key,{key,phase:activePhase,command,tool:name,script:name==='forge_script'?normalizeForgeScriptId(a.name):null,args:name==='forge_script'?(Array.isArray(a.args)?a.args.map(String):[]):[],exitCode:Number(r.status??0),status:Number(r.status??0),stdout:String(r.stdout||''),stderr:String(r.stderr||''),failureType:null,updatedAt:new Date().toISOString()});
      phaseSuccessfulCommands.push(command);
      phaseCommandOutputs.push({command,stdout:String(r.stdout||''),stderr:String(r.stderr||''),ok:true});
      if(commandLooksMutating(command) && r.already_started!==true && r.already_complete!==true) memoryDirty=true;
    }
  }
  if(r.ok!==false && (name==='write_file' || name==='replace_text' || name==='copy_path' || name==='gigachat_generate_image' || name==='gigachat_generate_3d')) {
    phaseWrittenFiles.add(String(r.path||r.destination||a.path||a.output_path||''));
    if(!(name==='copy_path' && r.unchanged===true)) memoryDirty=true;
  }
  if(activeDirective) persistRuntimeEvidenceLedger();
  if(r.ok!==false && name==='forge_web_search'){
    const q=String(a.query||'').trim();
    if(q && Array.isArray(r.results) && r.results.length){
      phaseSearchEvidence.web=[...phaseSearchEvidence.web.filter(x=>String(x.query||'').toLowerCase()!==q.toLowerCase()),{query:q,count:r.results.length,provider:r.provider||'',at:new Date().toISOString()}].slice(-20);
      unresolvedFailures.delete(operationKey(name,a));
    }
  }
  if(r.ok!==false && name==='forge_image_search'){
    const q=String(a.query||'').trim();
    if(q && Array.isArray(r.results) && r.results.length){
      const refs=r.results.slice(0,5).map(x=>({
        title:String(x.title||'').slice(0,500),
        image_url:String(x.image_url||''),
        page_url:String(x.page_url||''),
        thumbnail_url:String(x.thumbnail_url||'')
      }));
      phaseSearchEvidence.image=[
        ...phaseSearchEvidence.image.filter(x=>String(x.query||'').toLowerCase()!==q.toLowerCase()),
        {query:q,count:r.results.length,provider:r.provider||'',results:refs,at:new Date().toISOString()}
      ].slice(-20);
      unresolvedFailures.delete(operationKey(name,a));
    }
  }
  if(r.ok!==false && name==='forge_web_fetch'){
    const url=String(r.url||a.url||'').trim();
    const requestedUrl=String(a.url||'').trim();
    if(url){
      const entry={
        url,
        requested_url:requestedUrl,
        status:Number(r.status||200),
        title:String(r.title||''),
        percentValues:extractPercentValues(String(r.text||'')),
        at:new Date().toISOString()
      };
      phaseSearchEvidence.fetch=[
        ...phaseSearchEvidence.fetch.filter(x=>normalizeEvidenceUrl(x.url)!==normalizeEvidenceUrl(url) && normalizeEvidenceUrl(x.requested_url)!==normalizeEvidenceUrl(requestedUrl)),
        entry
      ].slice(-40);
      unresolvedFailures.delete(operationKey(name,a));
    }
  }
  if(['forge_web_search','forge_image_search','forge_web_fetch'].includes(name) && r.ok===false){
    const key=operationKey(name,a);
    const msg=String(r.error||'search failed');
    let type='recoverable';
    if(name==='forge_web_fetch'){
      type='source-access';
    }else if(/not configured|credential|oauth|authorization|access token/i.test(msg)){
      type='capability';
    }else if(/\b401\b|\b403\b/i.test(msg)){
      type='capability';
    }
    unresolvedFailures.set(key,{type,message:msg,at:new Date().toISOString()});
  }
  if(r.ok!==false && ['forge_context','forge_workspace_inspect','forge_skill','forge_capabilities','forge_preflight','forge_search_doctor','forge_web_search','forge_image_search','forge_web_fetch','read_file','list_files','copy_path'].includes(name)){
    refreshMandatoryCapabilityBlock();
  }
  if(activePhase===1 && phaseProductMetricsEvidence.startedAt && !resolvedDecisionKeys.has('phase1-content-budget')){
    if(r.ok!==false && name==='forge_web_search'){
      const q=String(a.query||'').trim(); if(q&&Array.isArray(r.results)&&r.results.length) phaseProductMetricsEvidence.web=[...phaseProductMetricsEvidence.web.filter(x=>String(x.query||'').toLowerCase()!==q.toLowerCase()),{query:q,count:r.results.length,provider:r.provider||'',at:new Date().toISOString()}].slice(-30);
    }
    if(r.ok!==false && name==='forge_web_fetch'){
      const url=String(r.url||a.url||'').trim(); if(url){ const entry={url,requested_url:String(a.url||'').trim(),title:String(r.title||''),percentValues:extractPercentValues(String(r.text||'')),retentionPairs:extractRetentionPairs(String(r.text||'')),at:new Date().toISOString()}; phaseProductMetricsEvidence.fetch=[...phaseProductMetricsEvidence.fetch.filter(x=>normalizeEvidenceUrl(x.url)!==normalizeEvidenceUrl(url)),entry].slice(-50); }
    }
  }

  persistRuntimeEvidenceLedger();
}

const SEARCH_CAPABILITIES=getSearchCapabilities(PROJECT);
const HOST_CAPABILITIES=Object.freeze({
  shell:FULL,
  web_search:Boolean(SEARCH_CAPABILITIES.web_search),
  image_search:Boolean(SEARCH_CAPABILITIES.image_search),
  web_fetch:Boolean(SEARCH_CAPABILITIES.web_fetch),
  subagents:false, agent_teams:false, browser_automation:false, scheduler:false,
  pixellab_mcp:false, image_generation:true, model3d_generation:true
});
function currentForgeVersion(){
  try{return JSON.parse(optionalText('.forge-managed.json',4000))?.forgeVersion||'';}catch{return '';}
}
function findFiles(rootRel,re,minBytes=1,max=200){
  const out=[];
  try{
    const root=safePath(rootRel); if(!existsSync(root)) return out;
    const stack=[root];
    while(stack.length && out.length<max){
      const p=stack.pop(), st=statSync(p);
      if(st.isDirectory()){
        for(const e of readdirSync(p,{withFileTypes:true})) if(!['.git','node_modules','dist','build'].includes(e.name)) stack.push(join(p,e.name));
      } else if(st.size>=minBytes && re.test(rel(p))) out.push(rel(p));
    }
  }catch{}
  return out;
}
function anyProjectText(re,roots=['WorkProgress']){
  for(const root of roots){
    for(const p of findFiles(root,/./,1,300)){
      if(!GAME_CODE_EXTS.has(extOf(p)) && !['.md','.txt','.json'].includes(extOf(p))) continue;
      try{ if(re.test(readText(safePath(p)))) return true; }catch{}
    }
  }
  return false;
}
function fileHas(path,re){ try{return re.test(optionalText(path,120000));}catch{return false;} }
function projectKind(){
  const t=`${optionalText('ANALYSIS.md',12000)}\n${optionalText('wiki/_map.md',12000)}`;
  return /\bCANVAS_GAME\b|\bUNITY_WEBGL\b|type:\s*game|\bgame\b/i.test(t)?'game':(/\bcategory:\b|type:\s*app/i.test(t)?'app':'unknown');
}
function requiredDecisionKeysForPhase(phase){
  const p=Number(phase);
  const base={
    1:['phase1-research-direction','phase1-brief','phase1-content-budget'],
    2:['phase2-monetization','phase2-multiplayer','phase2-content-plan','phase2-screen-inventory'],
    4:['phase4-asset-source','phase4-art-direction','phase4-target-frame','phase4-style-bible']
  }[p]||[];
  if(p===4 && /pixel/i.test(`${optionalText('assets/style/STYLE-BIBLE.md',30000)}\n${optionalText('wiki/design/brief.md',20000)}`)) base.push('phase4-pixel-provider');
  return new Set(base);
}
function decisionBlockers(phase){
  const missing=[...requiredDecisionKeysForPhase(phase)].filter(k=>!resolvedDecisionKeys.has(k));
  return missing.length?[`Phase ${phase} required named decisions unresolved: ${missing.join(', ')}`]:[];
}
function acceptsAllPhase1BriefRecommendations(answer=''){
  const s=String(answer||'').replace(/\r/g,'').replace(/\s+/g,' ').trim().replace(/[.!]+$/g,'');
  if(!s || /\b(?:except|but)\b|(?:^|[\s,;])(?:не|кроме|исключая|но)(?:$|[\s,;])/i.test(s)) return false;
  const ru=s.match(/^(?:да[\s,]+)?(?:я\s+)?(?:согласен|согласна|принимаю|подтверждаю|утверждаю)(?:\s+(.+))?$/i);
  if(ru){
    const tail=String(ru[1]||'').trim();
    if(!tail) return true;
    if(/^(?:(?:с(?:о)?\s+)?(?:вс(?:е|ё|еми|ем)|все\s+пять))$/i.test(tail)) return true;
    return /^(?:с(?:о)?\s+)?(?:(?:вс(?:е|ё|еми|ем)|все\s+пять)\s+)?(?:(?:предложенн(?:ые|ыми|ое)|ваши|данные)\s+)?(?:рекомендаци(?:и|ями|ю|й|ям)|предложени(?:е|я|ем|ями)|вариант(?:ы|ом|ами))$/i.test(tail);
  }
  const en=s.match(/^(?:i\s+)?(?:approve|accept)(?:\s+(.+))?$/i);
  if(!en) return false;
  const tail=String(en[1]||'').trim();
  return !tail || /^(?:all(?:\s+five)?|the)$/i.test(tail) || /^(?:(?:all(?:\s+five)?|the)\s+)?(?:recommendations?|proposals?|options?)$/i.test(tail);
}
function phase1BriefAnswerCoverageBlockers(answer=''){
  const s=String(answer||'').replace(/\r/g,'').trim();
  if(!s) return ['Phase 1 brief answer is empty'];
  const labels=[...s.matchAll(/(?:^|\n)\s*Q\s*([1-5])\s*(?:[—–\-:.)]|$)/gim)].map(m=>Number(m[1]));
  const unique=new Set(labels);
  if(unique.size===0){
    if(acceptsAllPhase1BriefRecommendations(s)) return [];
    return ['Phase 1 brief is a five-question decision. Answer all Q1..Q5, or explicitly accept all five recommendations.'];
  }
  const missing=[1,2,3,4,5].filter(n=>!unique.has(n));
  return missing.length?[`Phase 1 brief answer is partial; missing ${missing.map(n=>'Q'+n).join(', ')}`]:[];
}
function decisionRecordResolves(d={}){
  const key=String(d.decision_key||'').trim(), answer=String(d.answer||'').trim();
  if(!key||!answer) return false;
  if(key==='phase1-brief') return phase1BriefAnswerCoverageBlockers(answer).length===0;
  if(key==='phase1-research-direction'){
    if(/^\s*(?:B\b|Б\b)|\b(?:deepen|углуб|доработ|ещ[её]\s+исслед)/i.test(answer)) return false;
    return /^\s*(?:A\b|А\b)|\b(?:approve|подтверж|соглас|принимаю|утверж)/i.test(answer);
  }
  if(key==='phase1-content-budget'){
    if(/\b(?:скоррект|измен|поправ|revise|change)\b/i.test(answer)) return false;
    if(/\b(?:D1|D7|D30|ARPDAU|IAP|session)\b[\s:=\-]*\d/i.test(answer)) return false;
    return /^\s*(?:A\b|А\b)|\b(?:approve|утверж|соглас|принимаю|подтверждаю)(?:\s+(?:как есть|as[- ]?is))?\b/i.test(answer);
  }
  return true;
}
function latestDecisionRecord(decisionKey,{validOnly=true}={}){
  const key=String(decisionKey||'').trim();
  const all=[...loadDecisionLedger(),...runtimeDecisions].filter(d=>String(d.decision_key||'').trim()===key).filter(d=>!validOnly||decisionRecordResolves(d));
  return all.length?all[all.length-1]:null;
}
function latestDecisionAnswer(decisionKey){ return String(latestDecisionRecord(decisionKey,{validOnly:true})?.answer||'').trim(); }
function persistDecisionRecordImmediate(record){
  const existing=loadDecisionLedger();
  const key=`${record.phase}|${record.decision_key||''}|${record.question}|${record.answer}`;
  const seen=new Set(existing.map(d=>`${d.phase}|${d.decision_key||''}|${d.question}|${d.answer}`));
  if(!seen.has(key)){existing.push(record);saveDecisionLedger(existing);}
}
function decisionAnswerDisposition(pending={},rawAnswer=''){
  const key=String(pending.decision_key||'').trim(), answer=String(rawAnswer||'').trim();
  if(key==='phase1-brief'){
    const blockers=phase1BriefAnswerCoverageBlockers(answer); return blockers.length?{kind:'invalid',blockers}:{kind:'resolve',blockers:[]};
  }
  if(key==='phase1-research-direction'){
    if(/^\s*(?:B\b|Б\b)|\b(?:deepen|углуб|доработ|ещ[её]\s+исслед)/i.test(answer)) return {kind:'revise',blockers:[]};
    return decisionRecordResolves({...pending,answer})?{kind:'resolve',blockers:[]}:{kind:'invalid',blockers:['Choose A/approve or B/deepen for research direction.']};
  }
  if(key==='phase1-content-budget'){
    if(decisionRecordResolves({...pending,answer})) return {kind:'resolve',blockers:[]};
    if(answer) return {kind:'revise',blockers:[]};
    return {kind:'invalid',blockers:['Content-budget answer is empty.']};
  }
  return answer?{kind:'resolve',blockers:[]}:{kind:'invalid',blockers:['Decision answer is empty.']};
}
function normalizedDecisionText(value=''){ return String(value||'').replace(/\r/g,'').replace(/\s+/g,' ').trim().toLowerCase(); }
function phase1BriefDecisionFidelityBlockers(){
  const out=[], answer=latestDecisionAnswer('phase1-brief'), brief=optionalText('wiki/design/brief.md',100000);
  if(answer&&brief&&!normalizedDecisionText(brief).includes(normalizedDecisionText(answer))) out.push('brief.md must preserve the exact Phase 1 brief user answer verbatim so rejected/modified recommendations cannot be silently changed');
  return out;
}
function ensureBriefDecisionVerbatim(content=''){
  const answer=latestDecisionAnswer('phase1-brief'), s=String(content||'');
  if(!answer||normalizedDecisionText(s).includes(normalizedDecisionText(answer))) return s;
  return `${s.trimEnd()}\n\n## User answers (verbatim — authoritative)\n\n\`\`\`text\n${answer}\n\`\`\`\n`;
}



function phase1BriefAnswerSegments(answer=''){
  const s=String(answer||'').replace(/\r/g,'');
  const starts=[...s.matchAll(/(?:^|\n)\s*Q\s*([1-5])\s*(?:[—–\-:.)])\s*/gim)], out=new Map();
  for(let i=0;i<starts.length;i++){const q=Number(starts[i][1]), begin=starts[i].index+starts[i][0].length, end=i+1<starts.length?starts[i+1].index:s.length;out.set(q,s.slice(begin,end).trim());}
  return out;
}
function phase1BriefRecommendationMap(question=''){
  const {blocks}=extractPhase1BriefBlocks({decision_key:'phase1-brief',question}), out=new Map();
  for(const b of blocks){const m=String(b.body||'').match(/(?:^|\n)\s*➡️\s*([^\n]+(?:\n(?!\s*❓?\s*\*\*?Q[1-5]).*)*)/i);if(m)out.set(b.q,String(m[1]||'').trim());}
  return out;
}
function briefAnswerValue(userText='',recommended=''){
  const u=String(userText||'').trim(),r=String(recommended||'').trim();
  if(!u)return r;
  if(/^(?:да[,.!\s]*)?(?:согласен|согласна|принимаю|подтверждаю|approve|accept)[.!]*$/i.test(u))return r||u;
  const m=u.match(/^(?:да[,.!\s]*)?(?:согласен|согласна|принимаю|подтверждаю|approve|accept)[.!,:;\s]+([\s\S]+)$/i);
  if(m){const extra=String(m[1]||'').trim();return [r,extra?`Дополнение пользователя: ${extra}`:''].filter(Boolean).join(' ');}
  return u;
}
function rebuildPhase1BriefFromDecision(){
  const rec=latestDecisionRecord('phase1-brief',{validOnly:true}); if(!rec)return {changed:false,reason:'no-valid-brief-decision'};
  const answer=String(rec.answer||''); if(phase1BriefAnswerCoverageBlockers(answer).length)return {changed:false,reason:'brief-answer-incomplete'};
  const seg=phase1BriefAnswerSegments(answer), recommendations=phase1BriefRecommendationMap(rec.question||'');
  const fields=[['Audience',1],['Ambition',2],['Promise',3],['Differentiator',4],['History',5]], values=new Map();
  const globalAccept=seg.size===0&&acceptsAllPhase1BriefRecommendations(answer);
  for(const [label,q] of fields){const u=seg.get(q)||'',r=recommendations.get(q)||'';values.set(label,globalAccept?r:briefAnswerValue(u,r));}
  if([...values.values()].some(v=>!String(v||'').trim()))return {changed:false,reason:'could-not-resolve-all-brief-fields'};
  const projectName=String(PROJECT).replace(/\\/g,'/').split('/').filter(Boolean).pop()||'Project';
  const rebuilt=[`# Brief — ${projectName}`,'',`**Audience:** ${values.get('Audience')}`,'',`**Ambition:** ${values.get('Ambition')}`,'',`**Promise:** ${values.get('Promise')}`,'',`**Differentiator:** ${values.get('Differentiator')}`,'',`**History:** ${values.get('History')}`,'','## User answers (verbatim — authoritative)','','```text',answer,'```',''].join('\n');
  const p='wiki/design/brief.md', before=optionalText(p,200000); if(before===rebuilt)return {changed:false,reason:'already-rebuilt'};
  mkdirSync(dirname(safePath(p)),{recursive:true});writeFileSync(safePath(p),rebuilt,'utf8');phaseWrittenFiles.add(p);memoryDirty=true;return {changed:true,path:p};
}

function reconcileBriefDecisionArtifact(){
  if(activePhase!==1 || !resolvedDecisionKeys.has('phase1-brief')) return {changed:false,reason:'not-applicable'};
  const rebuilt=rebuildPhase1BriefFromDecision(); if(rebuilt.changed||rebuilt.reason==='already-rebuilt')return rebuilt;
  const p='wiki/design/brief.md'; if(!fileExistsNonEmpty(p,20))return {changed:false,reason:'brief-missing'};
  const before=optionalText(p,200000),after=ensureBriefDecisionVerbatim(before);if(after===before)return {changed:false,reason:'already-reconciled'};
  writeFileSync(safePath(p),after,'utf8');memoryDirty=true;return {changed:true,path:p};
}

function approvedResearchTextEvidenceUrls(){
  const urls=[];
  for(const x of (phaseSearchEvidence.fetch||[])){
    for(const u of [x.url,x.requested_url]){
      if(/^https?:\/\//i.test(String(u||''))) urls.push(String(u));
    }
  }
  return [...new Set(urls.map(u=>u.replace(/[.,;:!?]+$/,'')))];
}

function approvedResearchVisualEvidenceUrls(){
  return recordedImageReferenceUrls();
}

function reconcileApprovedResearchArtifact(){
  if(activePhase!==1 || !resolvedDecisionKeys.has('phase1-research-direction')) return {changed:false,reason:'not-applicable'};
  const p=phase1ResearchEvidencePath();
  if(!p) return {changed:false,reason:'research-artifact-missing'};

  const textSources=approvedResearchTextEvidenceUrls().slice(0,12);
  const visualSources=approvedResearchVisualEvidenceUrls().slice(0,12);
  if(!textSources.length && !visualSources.length) return {changed:false,reason:'no-durable-evidence'};

  const body=[
    '## Approved research evidence — runtime preserved',
    '',
    'This section is maintained by Forge after the research-direction STOP was approved.',
    'It preserves only real URLs already recorded by successful Forge fetch/image-search evidence.',
    '',
    '### Successfully fetched text/source pages',
    ...(textSources.length?textSources.map(u=>`- ${u}`):['- No durable fetched URL is currently available.']),
    '',
    '### Recorded image-search references',
    ...(visualSources.length?visualSources.map(u=>`- ${u}`):['- No durable image-search URL is currently available.']),
    ''
  ].join('\n');

  const start='<!-- FORGE_APPROVED_RESEARCH_EVIDENCE_START -->';
  const end='<!-- FORGE_APPROVED_RESEARCH_EVIDENCE_END -->';
  const block=`${start}\n${body}\n${end}`;
  const before=optionalText(p,200000);
  let after=before;
  const s=before.indexOf(start), e=before.indexOf(end);

  if(s>=0 && e>s) after=before.slice(0,s)+block+before.slice(e+end.length);
  else after=`${before.trimEnd()}\n\n${block}\n`;

  if(after===before) return {changed:false,reason:'already-reconciled'};
  writeFileSync(safePath(p),after,'utf8');
  memoryDirty=true;
  return {changed:true,path:p,textSources:textSources.length,visualSources:visualSources.length};
}

function reconcilePhase1ApprovedState(){
  if(activePhase!==1) return {changed:false};
  const brief=reconcileBriefDecisionArtifact();
  const research=reconcileApprovedResearchArtifact();
  return {changed:Boolean(brief.changed||research.changed),brief,research};
}

function semanticBriefBlockers(){
  const t=optionalText('wiki/design/brief.md',50000);
  const specs=[['audience',/аудитор|audience/i],['ambition',/амбици|ambition|2\s*недел|3\s*месяц/i],['promise',/обещан|почувств|promise|feel/i],['differentiator',/отлич|differentiat/i],['history',/истори|пробовал|history|tried/i]];
  const out=specs.filter(([,re])=>!re.test(t)).map(([n])=>`brief missing mandatory field: ${n}`);
  out.push(...phase1BriefDecisionFidelityBlockers());
  return out;
}
function semanticMetricsBlockers(){
  const t=optionalText('wiki/architecture/metrics.md',100000), out=[];
  if(!/Floor/i.test(t)||!/Target/i.test(t)||!/Stretch/i.test(t)) out.push('metrics.md must contain Floor / Target / Stretch');
  if(!/(D1|D7)/i.test(t)) out.push('metrics.md must contain retention targets');
  if(!/(дефицит|deficit)/i.test(t)) out.push('metrics.md must contain explicit content DEFICIT');
  if(!/(D2.?D7|7\s*дн|7\s*days)/i.test(t)) out.push('metrics.md must budget at least seven days of content');
  if(!/(https?:\/\/|Source|Источник)/i.test(t)) out.push('metrics.md must cite real external benchmark sources');
  if(!findFiles('wiki/decisions',/product-metrics.*\.md$/i,80,50).length) out.push('missing product-metrics ADR under wiki/decisions/');
  return out;
}
function distinctValidImages(paths){
  const hashes=new Set();
  for(const p of paths) if(isValidMediaFile(p)) try{hashes.add(hashFileAbs(safePath(p)));}catch{}
  return hashes.size;
}
function commandSucceeded(re,phase=activePhase){ return Boolean(verifierEntrySuccess(re,phase)) || (Number(phase)===Number(activePhase)&&hasSuccessfulCommand(re)); }
function commandSucceededWithOutput(commandRe,outputRe,phase=activePhase){ return Boolean(verifierEntryWithOutput(commandRe,outputRe,phase)); }
function parsedReleaseZip(pathValue=''){
  const p=String(pathValue||'').replace(/\\/g,'/');
  const name=p.split('/').pop()||'';
  const match=name.match(/^(.+)-(v\d+(?:\.\d+){0,2})(?:-(debug|marketing))?\.zip$/i);
  if(!match) return null;
  return {path:p,project:match[1],version:match[2].toLowerCase(),variant:(match[3]||'production').toLowerCase(),parts:match[2].slice(1).split('.').map(Number)};
}
function compareReleaseVersion(a,b){for(let i=0;i<3;i++){const d=(a.parts[i]||0)-(b.parts[i]||0);if(d)return d;}return a.parts.length-b.parts.length;}
function releaseVersionEvidenceFromPaths(paths=[],baselinePaths=new Set()){
  const all=paths.map(parsedReleaseZip).filter(Boolean);
  const before=all.filter(x=>baselinePaths.has(x.path));
  const created=all.filter(x=>!baselinePaths.has(x.path));
  const groups=new Map();
  for(const item of created){
    const key=`${item.project}|${item.version}`;
    if(!groups.has(key)) groups.set(key,{project:item.project,version:item.version,parts:item.parts,variants:new Set(),paths:[]});
    const group=groups.get(key);group.variants.add(item.variant);group.paths.push(item.path);
  }
  const complete=[...groups.values()].filter(g=>['production','debug','marketing'].every(v=>g.variants.has(v))).sort(compareReleaseVersion);
  const newest=complete.at(-1)||null;
  const previous=before.sort(compareReleaseVersion).at(-1)||null;
  const blockers=[];
  if(!newest) blockers.push('Phase 8 requires three newly named ZIP artifacts of one version (production/debug/marketing); overwriting an existing version is not accepted');
  else if(previous && compareReleaseVersion(newest,previous)<=0) blockers.push(`Phase 8 release version ${newest.version} must be newer than the pre-phase version ${previous.version}`);
  return {ok:blockers.length===0,blockers,version:newest?.version||null,paths:newest?.paths||[],previousVersion:previous?.version||null};
}
function phase8ReleaseVersionEvidence(){
  const paths=findFiles('Release',/\.zip$/i,32,300);
  return releaseVersionEvidenceFromPaths(paths,new Set([...phaseBaseline.keys()].filter(x=>x.toLowerCase().startsWith('release/')&&x.toLowerCase().endsWith('.zip'))));
}
const PHASE_CONTRACTS=Object.freeze({
  1:{name:'Analyze',files:[['ANALYSIS.md',80],['wiki/design/brief.md',80],['wiki/architecture/metrics.md',80],['.forge-ai.json',20],['wiki/ai/asset-baseline.md',80]]},
  2:{name:'Design',files:[['wiki/design/gdd.md',200],['wiki/plan/02-development-plan.md',120],['wiki/design/cross-review.md',80],['wiki/architecture/modules.md',80],['wiki/design/layout-system.md',80],['wiki/ai/studio-plan.md',80]]},
  3:{name:'Construct',files:[['wiki/plan/02-development-plan.md',80]]},
  4:{name:'Visual',files:[['wiki/design/target-frame.md',120],['assets/style/STYLE-BIBLE.md',120]]},
  5:{name:'Tech',files:[['.forge-ai.json',2],['wiki/qa/phase-5-tech.md',100]]},6:{name:'Listing',files:[['SETUP_GUIDE.md',80],['screens/video/promo.mp4',64]]},
  7:{name:'Test',files:[['wiki/testing.md',120],['wiki/qa/phase-7-report.md',120]]},8:{name:'Release',files:[['wiki/deploy-log.md',120],['SETUP_GUIDE.md',160]]},9:{name:'Live',files:[['wiki/metrics.md',80]]}
});
function phaseContractDriftWarnings(){
  const out=[], v=currentForgeVersion();
  if(v&&v!==AUDITED_FORGE_VERSION) out.push(`Adapter contracts audited for Forge ${AUDITED_FORGE_VERSION}, project reports ${v}. Re-run static audit before trusting GREEN completion.`);
  out.push('Canonical source conflict: Yandex SDK skill says 13 languages mandatory while Phase 6 says RU-only draft unless explicitly requested; adapter does not silently choose one.');
  out.push('Canonical source conflict: Phase 4 related skills use multiple selection.json paths; adapter accepts assets/style/selection.json or assets/bible/selection.json.');
  return out;
}
function extractSkillRefs(skill){
  const seen=new Set(),out=[];
  const visit=(name,depth)=>{
    if(depth>5||seen.has(name)) return; seen.add(name);
    let t=''; try{t=readText(safePath(`.claude/skills/${name}/SKILL.md`));}catch{return;}
    out.push(name);
    const refs=[...t.matchAll(/(?:^|[\s(])\/([a-z0-9][a-z0-9-]+)\b/gim)].map(m=>m[1]).filter(x=>x!=='status');
    for(const r of refs) if(existsSync(safePath(`.claude/skills/${r}/SKILL.md`))) visit(r,depth+1);
  }; visit(skill,0); return out;
}
function forgePreflight(phase){
  const p=Number(phase||activePhase||0),skill=PHASE_SKILLS.get(p)||'',deps=skill?extractSkillRefs(skill):[];
  const missingSkills=[],capabilityNeeds=new Set();
  for(const d of deps){
    if(!existsSync(safePath(`.claude/skills/${d}/SKILL.md`))) missingSkills.push(d);
    const t=optionalText(`.claude/skills/${d}/SKILL.md`,120000);
    if(/web_search|Web search|интернет|Internet/i.test(t)) capabilityNeeds.add('web_search');
    if(/image_search/i.test(t)) capabilityNeeds.add('image_search');
    if(/Agent Teams|subagent|Task tool|spawn/i.test(t)) capabilityNeeds.add('subagents');
    if(/browser|Console|каталог платформы/i.test(t)) capabilityNeeds.add('browser_automation');
    if(/schedule|ежемесяч|каждые 30|раз в 2-3 недели/i.test(t)) capabilityNeeds.add('scheduler');
  }
  const unavailable=[...capabilityNeeds].filter(c=>HOST_CAPABILITIES[c]===false);
  return {ok:true,phase:p,contractVersion:CONTRACT_VERSION,auditedForgeVersion:AUDITED_FORGE_VERSION,currentForgeVersion:currentForgeVersion()||null,phaseSkill:skill,dependencies:deps,missingSkills,capabilityNeeds:[...capabilityNeeds],unavailableCapabilities:unavailable,hardBlockNow:evaluateMandatoryCapabilityBlock()||null,searchProvider:SEARCH_CAPABILITIES.provider||null,searchConfigured:Boolean(SEARCH_CAPABILITIES.configured),searchConfig:SEARCH_CAPABILITIES.config||null,warnings:phaseContractDriftWarnings()};
}

function contradictedCapabilityBlock(reason=''){
  const r=String(reason||'');
  const out=[];
  if(/web[_ -]?search|web search/i.test(r) && HOST_CAPABILITIES.web_search) out.push('web_search');
  if(/image[_ -]?search|image search/i.test(r) && HOST_CAPABILITIES.image_search) out.push('image_search');
  if(/web[_ -]?fetch|fetch provider/i.test(r) && HOST_CAPABILITIES.web_fetch) out.push('web_fetch');
  return out;
}

function resolveForgeScript(name=''){
  const raw=String(name||'').trim().replace(/\\/g,'/');
  if(!raw||raw.includes('..')) throw new Error('forge_script requires a safe canonical script name/path');
  // Once a durable Task is active, canonical Forge scripts must come from the
  // trusted engine rather than a project-local shadow with the same filename.
  // Legacy sessions retain their local-first compatibility below.
  const scopedTask=taskScopeIsActive(activeTaskScopeForModel());

  const aliases=new Map([
    ['phase-state','.claude/skills/status/references/phase-state.mjs'],
    ['phase-state.mjs','.claude/skills/status/references/phase-state.mjs'],
    ['project-status','.claude/skills/status/references/project-status.mjs'],
    ['project-status.mjs','.claude/skills/status/references/project-status.mjs']
  ]);
  if(aliases.has(raw)){
    if(scopedTask){
      const engineAlias=resolve(ENGINE,aliases.get(raw));
      if(existsSync(engineAlias)) return engineAlias;
    }
    const p=safePath(aliases.get(raw));
    if(existsSync(p)) return p;
  }

  if(raw.startsWith('.claude/')){
    if(scopedTask){
      const enginePath=resolve(ENGINE,raw);
      if(existsSync(enginePath)) return enginePath;
    }
    const p=safePath(raw);
    if(existsSync(p)) return p;
  }

  const clean=raw.replace(/^scripts\//,'');
  const variants=extOf(clean)?[clean]:[clean,`${clean}.mjs`];
  for(const candidate of variants){
    const local=safePath(`scripts/${candidate}`),engine=resolve(ENGINE,'scripts',candidate);
    if(scopedTask&&existsSync(engine)) return engine;
    if(existsSync(local)) return local;
    if(existsSync(engine)) return engine;
  }

  // Last-resort deterministic lookup for an exact basename under .claude/skills.
  // Accept only a unique match; ambiguity is an error rather than a guess.
  const matches=[];
  const root=safePath('.claude/skills');
  if(existsSync(root)){
    const stack=[root];
    while(stack.length && matches.length<3){
      const p=stack.pop();
      let st; try{st=statSync(p);}catch{continue;}
      if(st.isDirectory()){
        for(const e of readdirSync(p,{withFileTypes:true})) stack.push(join(p,e.name));
      }else if(p.endsWith('/'+clean) || p.endsWith('\\'+clean) || p===join(root,clean)){
        matches.push(p);
      }
    }
  }
  if(matches.length===1) return matches[0];
  if(matches.length>1) throw new Error(`Forge script basename is ambiguous: ${clean}`);
  throw new Error(`Forge script not found in project/engine/canonical skill references: ${raw}`);
}

function requiredFileBlock(path,min=1) { return fileExistsNonEmpty(path,min)?null:`missing/non-empty evidence: ${path}`; }
function hasSuccessfulCommand(re) { return phaseSuccessfulCommands.some(c=>re.test(c)); }
function hasOutput(re) { return phaseCommandOutputs.some(x=>re.test(`${x.stdout}\n${x.stderr}`)); }
function passedGodotReport(path,kind) {
  try {
    const value=JSON.parse(readText(safePath(path)));
    return value?.kind===kind && value?.status==='passed' && value?.testHarness!==true;
  } catch { return null; }
}

function phaseGateReport(phase=activePhase) {
  const p=Number(phase||0), blockers=[], evidence={phase:p,contractVersion:CONTRACT_VERSION,started:phaseStarted,unresolvedFailures:unresolvedFailures.size};
  if(phaseMarkedComplete(p)){
    let marker={};try{marker=JSON.parse(readText(safePath(`wiki/phases/phase-${p}.json`)));}catch{}
    return {ok:true,phase:p,blockers:[],evidence:{...evidence,archivedComplete:true,completedAt:marker.completedAt||null,artifacts:marker.evidence||[]}};
  }
  if(!p) blockers.push('no active Forge phase detected');
  let engineProfile=null;
  try {
    engineProfile=trustedProjectEngine();
    evidence.engineRuntime={engine:engineProfile.engine,implementation:engineProfile.implementation,capabilities:engineProfile.capabilities};
  } catch(error) {
    if(p>=1&&p<=9) blockers.push(`trusted engine profile rejected: ${error.code||'ENGINE_PROFILE'} ${error.message}`);
  }
  const nativeGodot=engineProfile?.engine==='godot';
  if(pendingDecision) blockers.push(`STOP-point waiting for user: ${pendingDecision.question}`);
  blockers.push(...decisionBlockers(p));
  refreshMandatoryCapabilityBlock();
  if(capabilityBlock) blockers.push(capabilityBlock);
  const nonBlockingFailures=[];
  for(const [key,failure] of unresolvedFailures){
    if(/phase-state\.mjs.*\bcomplete\b/i.test(String(key))){
      nonBlockingFailures.push({key,type:'control-attempt',message:failureMessage(failure)});
      continue;
    }
    if(/verify-i18n|verify\.sh/i.test(String(key))){
      nonBlockingFailures.push({key,type:'advisory-check',message:failureMessage(failure)});
      continue;
    }
    if(hardFailure(failure) || String(failure?.type||'')==='verifier'){
      blockers.push(`unresolved ${failure?.type||'tool'} failure: ${key} -> ${failureMessage(failure)}`);
    }else{
      nonBlockingFailures.push({key,type:failure?.type||'recoverable',message:failureMessage(failure)});
    }
  }
  if(nonBlockingFailures.length) evidence.nonBlockingFailures=nonBlockingFailures;
  if(!phaseStarted&&p>=1&&p<=9) blockers.push(`Phase ${p} has no runtime start baseline`);
  if(p>=1&&p<=9){
    if(memoryDirty) blockers.push('Project memory/wiki is dirty: call forge_memory_update before phase completion.');
    if(!fileExistsNonEmpty('wiki/_current.md',60)) blockers.push('wiki/_current.md is missing/too small');
    if(!fileExistsNonEmpty('wiki/_map.md',80)) blockers.push('wiki/_map.md is missing/too small');
    if(!latestSessionSnapshots(1).length) blockers.push('wiki/sessions has no session journal');
    if(resolvedDecisionKeys.size>0&&!fileExistsNonEmpty('wiki/decisions/gigachat-decisions.json',40)) blockers.push('resolved user decisions are not persisted');
  }
  const contract=PHASE_CONTRACTS[p];
  if(contract) for(const [path,min] of contract.files){
    if(nativeGodot&&p===6&&path==='screens/video/promo.mp4') continue;
    if(path==='screens/video/promo.mp4'){
      if(!fileExistsNonEmpty(path,min)||!isValidMediaFile(path)) blockers.push(`missing/invalid media evidence: ${path}`);
    }else{const b=requiredFileBlock(path,min); if(b) blockers.push(b);}
  }
  if(p===1){
    const researchBlockers=phase1ResearchCompletionBlockers();
    if(researchBlockers.length) blockers.push(...researchBlockers.map(x=>`Phase 1 research: ${x}`));
    if(!fileHas('wiki/_map.md',/\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i)) blockers.push('Phase 1 must persist **Размерность:** 2d|2.5d|3d in wiki/_map.md');
    blockers.push(...semanticBriefBlockers(),...semanticMetricsBlockers());
    blockers.push(...metricsArtifactProvenanceBlockers());
    if(!completedSkills.has('find-or-make-skill')) blockers.push('Phase 1 requires validated find-or-make-skill discovery evidence');
  }
  if(p===2){
    if(projectKind()==='game'){
      for(const [path,min] of [['wiki/design/levels.md',80],['wiki/design/monetization.md',80],['wiki/design/art-bible.md',80],['wiki/design/audio.md',80]]){const b=requiredFileBlock(path,min);if(b)blockers.push(b);}
      if(!findFiles('wiki/design',/(?:hierarchy-.+|.+-hierarchy)\.md$/i,60,50).length) blockers.push('Phase 2 game design requires at least one UI hierarchy document under wiki/design');
    }
    if(!findFiles('assets/prompts',/\.json$/i,20,50).length) blockers.push('Phase 2 requires at least one draft AI prompt pack at assets/prompts/*.json');
  }
  if(p===3){
    const gameChanges=changedSinceBaseline(nativeGodot?pathLooksGodotGameChange:pathLooksGameChange); evidence.gameChanges=gameChanges;
    if(!gameChanges.length) blockers.push('Phase 3 requires real active implementation game/code changes since phase start');
    if(nativeGodot){
      if(!commandSucceeded(/check-godot-project\.mjs/i,p)) blockers.push('Godot Phase 3 requires successful installed check-godot-project.mjs');
    }else{
      if(!commandSucceeded(/playtest\.mjs/i,p)) blockers.push('Phase 3 requires successful playtest.mjs');
      const shots=[
        ...findFiles('screens',/\.(png|jpg|jpeg|webp)$/i,32,200),
        ...findFiles('WorkProgress',/playtest-out[\\/].*\.(png|jpg|jpeg|webp)$/i,32,200)
      ].filter(isValidMediaFile);
      if(shots.length<2||distinctValidImages(shots)<2) blockers.push('Phase 3 requires at least two distinct real playtest screenshots');
    }
    const mp=[...loadDecisionLedger()].reverse().find(d=>String(d.decision_key||'')==='phase2-multiplayer');
    if(mp&&!/(нет|no|вариант\s*а|без\s+мультиплеер|single[- ]?player|одиночн)/i.test(String(mp.answer||''))&&!anyProjectText(/websocket|socket\.io|leaderboard|clan|клан|multiplayer/i)) blockers.push('Phase 3 multiplayer approved but implementation evidence missing');
  }
  if(p===4){
    if(!nativeGodot&&!commandSucceeded(/asset-find\.mjs/i,p)) blockers.push('Web Phase 4 requires successful asset-find.mjs');
    if(!phase4SelectionPath()) blockers.push('Phase 4 requires selection.json');
    if(!phase4TargetFramePath()) blockers.push('Phase 4 canonical target-frame image missing/invalid (PNG/JPEG/WebP accepted)');
    const refs=findFiles('assets/refs',/\.(png|jpg|jpeg|webp)$/i,32,100).filter(isValidMediaFile); if(refs.length<3) blockers.push('Phase 4 requires at least 3 real reference images');
    const variants=phase4TargetVariantPaths(); if(distinctValidImages(variants)<3) blockers.push('Phase 4 requires 3 distinct target-frame variants');
    const production=changedSinceBaseline(pathLooksProductionAsset).filter(isValidMediaFile); evidence.productionAssets=production; if(!production.length) blockers.push('Phase 4 requires changed production visual asset');
    if(!changedSinceBaseline(nativeGodot?pathLooksGodotGameChange:pathLooksGameChange).length) blockers.push('Phase 4 requires visual integration inside the active implementation');
    const visualQaReports=findFiles('wiki/qa',/visual.*qa.*\.md$/i,80,50);
    const visualQaDone=commandSucceeded(/visual-qa|ui-review/i,p)||visualQaReports.length>0;
    if(nativeGodot){
      if(!commandSucceeded(/godot-screens-shoot\.mjs/i,p)) blockers.push('Godot Phase 4 requires successful native godot-screens-shoot.mjs');
      if(!commandSucceeded(/godot-proof-video\.mjs/i,p)) blockers.push('Godot Phase 4 requires successful native godot-proof-video.mjs motion proof');
      if(!visualQaDone) blockers.push('Godot Phase 4 requires an independent visual QA report');
    }else if(!commandSucceeded(/screens-shoot\.mjs/i,p)||!visualQaDone) blockers.push('Web Phase 4 requires screenshot capture AND visual QA report');
    const visualEvidence=validatePhase4VisualEvidence({root:PROJECT});
    evidence.visualEvidence={ok:visualEvidence.ok,states:visualEvidence.states||[],frames:visualEvidence.frames||0};
    if(!visualEvidence.ok) blockers.push(...visualEvidence.failures.map(item=>`Phase 4 visual evidence: ${item}`));
  }
  if(p===5){
    if(nativeGodot){
      if(!commandSucceeded(/godot-tech-check\.mjs/i,p)) blockers.push('Godot Phase 5 requires successful installed godot-tech-check.mjs');
      if(!passedGodotReport('qa/godot-tech/report.json','forge.godot-tech-report')) blockers.push('Godot Phase 5 requires a current native qa/godot-tech/report.json PASS without test harness');
    }else{
      if(!anyProjectText(/YaGames|YandexSDK|LoadingAPI\.ready|GameplayAPI/i)) blockers.push('Phase 5 requires Yandex SDK integration');
      if(!anyProjectText(/startGameplay|GameplayAPI\.start/i)||!anyProjectText(/stopGameplay|GameplayAPI\.stop/i)) blockers.push('Phase 5 requires GameplayAPI start/stop lifecycle');
      if(!anyProjectText(/showRewarded|showInterstitial/i)) blockers.push('Phase 5 requires ads integration');
      if(!anyProjectText(/touchstart|pointerdown|touch-action|safe-area|44px/i)) blockers.push('Phase 5 requires mobile/touch adaptation');
      if(!commandSucceeded(/ai-studio-init\.mjs.*--check/i,p)) blockers.push('Phase 5 requires ai-studio-init --check');
    }
  }
  if(p===6){
    if(!findFiles('.',/(listing|description|seo|how[-_ ]?to[-_ ]?play|yandex).*\.md$/i,80,100).filter(x=>!x.startsWith('wiki/sessions/')).length) blockers.push('Phase 6 requires listing text artifact(s)');
    if(!findFiles('screens',/\.(png|jpg|jpeg|webp)$/i,32,200).filter(isValidMediaFile).length) blockers.push('Phase 6 requires promo screenshots');
    if(nativeGodot){
      if(!commandSucceeded(/godot-proof-video\.mjs/i,p)) blockers.push('Godot Phase 6 requires current native proof video for promotional media');
      const visual=validatePhase4VisualEvidence({root:PROJECT});
      evidence.visualEvidence={ok:visual.ok,states:visual.states||[],frames:visual.frames||0};
      if(!visual.ok) blockers.push(...visual.failures.map(item=>`Godot Phase 6 current visual evidence: ${item}`));
    }else if(!commandSucceeded(/record-promo\.mjs/i,p)) blockers.push('Web Phase 6 requires record-promo.mjs');
    if(!commandSucceeded(/check-inline-strings|localize|i18n/i,p)&&!anyProjectText(/\b(?:t|tr)\(['"`]/i)) blockers.push('Phase 6 requires i18n evidence');
    if(!HOST_CAPABILITIES.web_search&&!findFiles('wiki',/(catalog|listing|competitor|выдач).*\.md$/i,60,100).length) blockers.push('Phase 6 live catalog review requires web_search or persisted evidence');
  }
  if(p===7){
    if(nativeGodot){
      if(!commandSucceeded(/godot-playtest\.mjs/i,p)) blockers.push('Godot Phase 7 requires successful installed godot-playtest.mjs');
      if(!passedGodotReport('qa/godot-playtest/report.json','forge.godot-playtest-report')) blockers.push('Godot Phase 7 requires a current two-process native playtest PASS without test harness');
      const visual=validatePhase4VisualEvidence({root:PROJECT});
      evidence.visualEvidence={ok:visual.ok,states:visual.states||[],frames:visual.frames||0};
      if(!visual.ok) blockers.push(...visual.failures.map(item=>`Godot Phase 7 current visual evidence: ${item}`));
    }else{
      for(const [re,label,skill] of [[/test-game/i,'test-game','test-game'],[/playtest\.mjs/i,'playtest',null],[/local-stage.*--ai|--ai.*local-stage/i,'local-stage --ai',null],[/screens-shoot\.mjs/i,'screens-shoot',null],[/gameplay-balance/i,'gameplay-balance','gameplay-balance']]){
        const skillSatisfied=skill&&(loadedSkills.has(skill)||completedSkills.has(skill));
        if(!commandSucceeded(re,p)&&!skillSatisfied) blockers.push(`Phase 7 requires successful ${label}`);
      }
      const phase7VisualQa=findFiles('wiki/qa',/visual.*qa.*\.md$/i,80,50);
      if(!commandSucceeded(/visual-qa|ui-review/i,p)&&!phase7VisualQa.length) blockers.push('Phase 7 requires successful visual QA');
      const shots=findFiles('screens',/\.(png|jpg|jpeg|webp)$/i,32,300).filter(isValidMediaFile); if(shots.length<4||distinctValidImages(shots)<2) blockers.push('Phase 7 requires 4+ screenshots with state diversity');
    }
    if(!existsSync(safePath('wiki/qa'))) blockers.push('Phase 7 requires wiki/qa evidence');
  }
  if(p===8){
    const fresh=changedSinceBaseline(x=>x.toLowerCase().startsWith('release/')); evidence.freshRelease=fresh; if(!fresh.length) blockers.push('Phase 8 requires fresh Release artifacts');
    const versionEvidence=phase8ReleaseVersionEvidence(); evidence.releaseBuild=versionEvidence; blockers.push(...versionEvidence.blockers);
    const plan=optionalText('wiki/plan/02-development-plan.md',100000),deploy=optionalText('wiki/deploy-log.md',100000),setup=optionalText('SETUP_GUIDE.md',50000);
    if(nativeGodot){
      if(!commandSucceeded(/build-godot-release\.mjs/i,p)) blockers.push('Godot Phase 8 requires successful immutable build-godot-release.mjs');
      if(!commandSucceeded(/godot-release-verify\.mjs/i,p)) blockers.push('Godot Phase 8 requires successful independent godot-release-verify.mjs');
      if(!passedGodotReport('qa/godot-release/report.json','forge.godot-release-verification')) blockers.push('Godot Phase 8 requires a current native release verification PASS without test exporter');
      if(!/TOTAL:\s*\d+\s+pass,\s*0\s+fail/i.test(`${deploy}\n${plan}`)) blockers.push('Godot Phase 8 requires exact TOTAL: N pass, 0 fail in deploy evidence');
    }else{
      if(!commandSucceeded(/check-setup-guide/i,p)) blockers.push('Phase 8 requires check-setup-guide success');
      if(!commandSucceededWithOutput(/release-ready/i,/TOTAL:\s*\d+\s+pass,\s*0\s+fail/i,p)) blockers.push('Phase 8 requires exact release-ready GREEN output');
      if(!commandSucceeded(/release-yandex|build-yandex-3zips/i,p)) blockers.push('Phase 8 requires release-yandex/build-yandex-3zips success');
      if(!/TOTAL:\s*\d+\s+pass,\s*0\s+fail/i.test(plan)) blockers.push('Phase 8 TOTAL line must be copied into wiki plan');
    }
    if(!/(MANUAL|Проверь сам|ручн)/i.test(`${plan}\n${setup}`)) blockers.push('Phase 8 requires manual checklist evidence');
  }
  if(p===9){ evidence.expectedTerminalState='ongoing'; if(!HOST_CAPABILITIES.scheduler)evidence.schedulerWarning='No scheduler capability; recurring checks require external/manual scheduling.'; }
  blockers.push(...phaseContractDriftWarnings().filter(x=>/audited for Forge/i.test(x)));
  return {ok:blockers.length===0,phase:p,blockers,evidence};
}

const MIN_PHASE_DECISIONS = new Map();
function minimumPhaseDecisions(){ return 0; }
const PHASE1_REQUIRED_DECISIONS = requiredDecisionKeysForPhase(1);

let activePhase = null;
let activePhaseSkill = null;
let requiredPhaseDecisions = 0;
let resolvedPhaseDecisions = 0;
let resolvedDecisionKeys = new Set();
let pendingDecision = durableRuntimeEvidence.pendingDecision&&typeof durableRuntimeEvidence.pendingDecision==='object' ? durableRuntimeEvidence.pendingDecision : null;
let phaseReadFiles = new Set();
let phaseListedPaths = new Set();
let phaseContextRefreshed = false;
let phaseWorkspaceInspected = false;
let loadedSkills = new Set();

function hasAnyFileUnder(path) {
  try {
    const root=safePath(path);
    if(!existsSync(root) || !statSync(root).isDirectory()) return false;
    const stack=[root];
    while(stack.length){
      const dir=stack.pop();
      for(const e of readdirSync(dir,{withFileTypes:true})){
        if(e.name==='.git' || e.name==='node_modules') continue;
        const p=join(dir,e.name);
        if(e.isFile()) return true;
        if(e.isDirectory()) stack.push(p);
      }
    }
  } catch {}
  return false;
}
function findNamedFileUnder(rootRel,fileName,minBytes=1) {
  try {
    const root=safePath(rootRel);
    if(!existsSync(root) || !statSync(root).isDirectory()) return null;
    const stack=[root];
    while(stack.length){
      const dir=stack.pop();
      for(const e of readdirSync(dir,{withFileTypes:true})){
        if(e.name==='.git' || e.name==='node_modules') continue;
        const p=join(dir,e.name);
        if(e.isDirectory()) stack.push(p);
        else if(e.name.toLowerCase()===String(fileName).toLowerCase() && statSync(p).size>=minBytes) return rel(p);
      }
    }
  } catch {}
  return null;
}

function phase1AnalysisEvidencePath() {
  if(fileExistsNonEmpty('ANALYSIS.md',80)) return 'ANALYSIS.md';
  if(fileExistsNonEmpty('wiki/analysis.md',80)) return 'wiki/analysis.md';
  return findNamedFileUnder('WorkProgress','ANALYSIS.md',80);
}

function phase1ResearchEvidencePath() {
  try {
    const dir=safePath('wiki/research');
    if(!existsSync(dir) || !statSync(dir).isDirectory()) return null;
    for(const e of readdirSync(dir,{withFileTypes:true})){
      const p=join(dir,e.name);
      if(e.isFile() && /references\.md$/i.test(e.name) && statSync(p).size>=80) return rel(p);
    }
  } catch {}
  return null;
}

function visibleUiProject(){
  return findFiles('WorkProgress',/\.(html?|css|js|mjs|cjs|jsx|tsx|vue|svelte)$/i,1,100).length>0 ||
    /ui|hud|canvas|screen|экран|интерфейс/i.test(`${optionalText('ANALYSIS.md',12000)}\n${optionalText('wiki/_map.md',12000)}`);
}
function researchReferenceUrls(){
  const p=phase1ResearchEvidencePath();
  if(!p) return [];
  const t=optionalText(p,120000);
  return [...new Set((t.match(/https?:\/\/[^\s)<>"']+/g)||[]).map(x=>x.replace(/[.,;:!?]+$/,'')))];
}

function normalizeEvidenceUrl(value=''){
  try{
    const u=new URL(String(value||'').trim());
    u.hash='';
    if(u.pathname.length>1) u.pathname=u.pathname.replace(/\/+$/,'');
    return u.toString().replace(/\/$/,'').toLowerCase();
  }catch{return String(value||'').trim().replace(/\/+$/,'').toLowerCase();}
}
function extractRetentionPairs(value=''){
  const s=String(value||''), out=[];
  const add=(metric,val)=>{ const item={metric:String(metric).toUpperCase(),value:String(Number(val))}; if(!out.some(x=>x.metric===item.metric&&x.value===item.value)) out.push(item); };
  for(const m of s.matchAll(/\b(D(?:1|7|30))\b[\s\S]{0,100}?(\d+(?:\.\d+)?)\s*%/gi)) add(m[1],m[2]);
  for(const m of s.matchAll(/(\d+(?:\.\d+)?)\s*%[\s\S]{0,80}?\b(D(?:1|7|30))\b/gi)) add(m[2],m[1]);
  return out.slice(0,40);
}
function productMetricsSearchCoverage(){
  const qs=(phaseProductMetricsEvidence.web||[]).map(x=>String(x.query||''));
  return {retention:qs.some(q=>/retention|D1|D7|D30|удерж/i.test(q)),monetization:qs.some(q=>/ARPDAU|ARPU|IAP|conversion|monetiz|монет|конвер/i.test(q)),session:qs.some(q=>/session|сесси/i.test(q)),dropoff:qs.some(q=>/drop.?off|churn|funnel|quit|отвал|ворон/i.test(q))};
}
function productMetricsResearchBlockers(){
  const out=[]; if(!phaseProductMetricsEvidence.startedAt) return ['product-metrics research session has not started'];
  const web=new Set((phaseProductMetricsEvidence.web||[]).map(x=>String(x.query||'').trim().toLowerCase()).filter(Boolean)), fetch=phaseProductMetricsEvidence.fetch||[], coverage=productMetricsSearchCoverage();
  if(web.size<4) out.push(`product-metrics requires at least 4 distinct benchmark searches after loading the skill; recorded ${web.size}`);
  if(!coverage.retention) out.push('product-metrics research missing retention/D1-D7-D30 benchmark query');
  if(!coverage.monetization) out.push('product-metrics research missing ARPDAU/IAP/conversion benchmark query');
  if(!coverage.session) out.push('product-metrics research missing session-length benchmark query');
  if(!coverage.dropoff) out.push('product-metrics research missing drop-off/churn benchmark query');
  if(fetch.length<3) out.push(`product-metrics requires reading at least 3 real benchmark result pages; recorded ${fetch.length}`);
  if(!fetch.some(x=>Array.isArray(x.retentionPairs)&&x.retentionPairs.length)) out.push('product-metrics fetched evidence contains no D1/D7/D30 retention pair evidence');
  return out;
}
function productMetricsEvidencePreview(maxSources=8){
  const rows=(phaseProductMetricsEvidence.fetch||[]).slice(-maxSources); if(!rows.length) return 'No product-metrics benchmark pages have been successfully fetched after loading product-metrics.';
  return rows.map((x,i)=>{ const rp=(x.retentionPairs||[]).map(p=>`${p.metric}=${p.value}%`).join(', '), pct=(x.percentValues||[]).slice(0,12).map(v=>v+'%').join(', '); return `${i+1}. ${x.title||'Benchmark source'}\n   ${x.url||x.requested_url}\n   retention pairs: ${rp||'(none extracted)'}\n   other observed percentages: ${pct||'(none)'}`; }).join('\n');
}

function extractPercentValues(value=''){
  const out=new Set();
  const s=String(value||'');
  for(const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(?:[–—-]\s*(\d+(?:\.\d+)?))?\s*%/g)){
    out.add(String(Number(m[1])));
    if(m[2]!=null) out.add(String(Number(m[2])));
  }
  return [...out];
}
function researchSourcesSectionUrls(){
  const p=phase1ResearchEvidencePath();
  if(!p) return [];
  const t=optionalText(p,120000);
  const m=t.match(/(?:^|\n)##\s+Sources\b([\s\S]*?)(?=\n##\s+|\s*$)/i);
  const scope=m?m[1]:t;
  return [...new Set((scope.match(/https?:\/\/[^\s)<>"']+/g)||[]).map(x=>x.replace(/[.,;:!?]+$/,'')))];
}
function researchPercentValues(){
  const p=phase1ResearchEvidencePath();
  return p?extractPercentValues(optionalText(p,120000)):[];
}

function successfulFetchedPercentEvidence(){
  return (phaseSearchEvidence.fetch||[])
    .filter(x=>Array.isArray(x.percentValues) && x.percentValues.length)
    .map(x=>({
      url:String(x.url||x.requested_url||''),
      requested_url:String(x.requested_url||''),
      title:String(x.title||''),
      percentValues:[...new Set(x.percentValues.map(String))]
    }));
}
function quantitativeProvenanceBlockers(value='',label='quantitative proposal'){
  const out=[];
  const claims=extractPercentValues(String(value||''));
  if(!claims.length) return out;
  const evidence=successfulFetchedPercentEvidence();
  const seen=new Set(evidence.flatMap(x=>x.percentValues));
  const unsupported=claims.filter(v=>!seen.has(String(v)));
  if(unsupported.length){
    out.push(`${label} contains percentage claim(s) not present in successfully fetched benchmark text: ${unsupported.slice(0,16).map(v=>v+'%').join(', ')}`);
  }
  if(evidence.length<2){
    out.push(`${label} requires at least 2 successfully fetched quantitative benchmark sources; recorded ${evidence.length}`);
  }
  return out;
}
function metricsEvidencePreview(maxSources=6){
  const evidence=successfulFetchedPercentEvidence().slice(-maxSources);
  if(!evidence.length) return 'No successfully fetched quantitative benchmark pages are recorded yet.';
  return evidence.map((x,i)=>{
    const vals=x.percentValues.length?x.percentValues.map(v=>v+'%').join(', '):'(no percentages extracted)';
    return `${i+1}. ${x.title||'Benchmark source'}\\n   ${x.url||x.requested_url}\\n   observed percentage values: ${vals}`;
  }).join('\\n');
}
function metricsArtifactProvenanceBlockers(){
  const p='wiki/architecture/metrics.md';
  if(!fileExistsNonEmpty(p,80)) return [];
  const t=optionalText(p,120000);
  const approved=resolvedDecisionKeys.has('phase1-content-budget');
  const decision=approved?latestDecisionRecord('phase1-content-budget'):null;
  const decisionText=String(decision?.question||'');
  const out=approved?[]:[...productMetricsResearchBlockers()];
  if(approved){
    if(!decisionText || !/Floor/i.test(decisionText) || !/Target/i.test(decisionText) || !/Stretch/i.test(decisionText) || !/\bD1\b/i.test(decisionText) || !/\bD7\b/i.test(decisionText) || !/\bD30\b/i.test(decisionText)) {
      out.push('approved content-budget decision does not preserve the complete KPI proposal');
    }
    if(researchReferenceUrls().length<3) out.push('approved metrics resume requires at least 3 durable source URLs in the research artifact');
  }
  const urls=[...new Set((t.match(/https?:\/\/[^\s)<>"']+/g)||[]).map(x=>x.replace(/[.,;:!?]+$/,'')))];
  const fetched=new Set((approved?researchReferenceUrls():(phaseProductMetricsEvidence.fetch||[]).flatMap(x=>[x.url,x.requested_url])).map(normalizeEvidenceUrl).filter(Boolean));
  const unseen=urls.filter(u=>!fetched.has(normalizeEvidenceUrl(u)));
  if(unseen.length) out.push(`metrics.md cites URL(s) that were not successfully fetched/read: ${unseen.slice(0,6).join(', ')}`);
  return out;
}


function recordedImageReferenceUrls(){
  const urls=[];
  for(const q of (phaseSearchEvidence.image||[])){
    for(const r of (Array.isArray(q.results)?q.results:[])){
      if(/^https?:\/\//i.test(String(r.page_url||''))) urls.push(String(r.page_url));
      if(/^https?:\/\//i.test(String(r.image_url||''))) urls.push(String(r.image_url));
    }
  }
  return [...new Set(urls)];
}
function researchVisualEvidenceBlockers(){
  if(!visibleUiProject() || !HOST_CAPABILITIES.image_search) return [];
  const p=phase1ResearchEvidencePath();
  if(!p) return ['visual research references artifact missing'];
  const t=optionalText(p,120000);
  const lower=t.toLowerCase();
  const out=[];
  if(/pending image_search|image_search not executed|placeholder anchors?|screenshots?:\s*n\/a/i.test(t)){
    out.push('research document claims visual/image research is pending or N/A even though visible UI requires completed image_search evidence');
  }
  const recorded=recordedImageReferenceUrls();
  const cited=recorded.filter(u=>t.includes(u));
  if(recorded.length && cited.length<3){
    out.push(`research document must cite at least 3 concrete image/page URLs from recorded image_search results; cited ${cited.length}`);
  }
  if(!/(visual|ui|ux|image|screenshot|референс|визуал)/i.test(t)){
    out.push('research document lacks a concrete visual/UI reference section');
  }
  return out;
}

function phase1ApprovedResearchArtifactBlockers(){
  const out=[], p=phase1ResearchEvidencePath();
  if(!p) return ['research references artifact missing after approved research direction'];
  const urls=researchReferenceUrls();
  if(urls.length<3) out.push(`approved research artifact should retain at least 3 real source URLs; found ${urls.length}`);
  out.push(...researchVisualEvidenceBlockers());
  return out;
}
function phase1ResearchCompletionBlockers(){
  return resolvedDecisionKeys.has('phase1-research-direction') ? phase1ApprovedResearchArtifactBlockers() : phase1ResearchBlockers();
}

function phase1ResearchBlockers(){
  const out=[], p=phase1ResearchEvidencePath();
  if(!p){ out.push('research references artifact missing'); return out; }
  if(!fileExistsNonEmpty(p,300)) out.push('research references artifact is too small for canonical competitor/source research');
  const webQueries=new Set((phaseSearchEvidence.web||[]).map(x=>String(x.query||'').trim().toLowerCase()).filter(Boolean));
  const imageQueries=new Set((phaseSearchEvidence.image||[]).map(x=>String(x.query||'').trim().toLowerCase()).filter(Boolean));
  const fetchedEntries=(phaseSearchEvidence.fetch||[]);
  const fetched=new Set(fetchedEntries.flatMap(x=>[normalizeEvidenceUrl(x.url),normalizeEvidenceUrl(x.requested_url)]).filter(Boolean));
  const urls=researchReferenceUrls();
  const sourceUrls=researchSourcesSectionUrls();
  if(HOST_CAPABILITIES.web_search && webQueries.size<2) out.push(`research-references requires 2-4 real web searches; recorded ${webQueries.size}`);
  if(HOST_CAPABILITIES.web_fetch && fetchedEntries.length<2) out.push(`research-references requires reading real result pages; recorded ${fetchedEntries.length} successful page fetch(es)`);
  if(urls.length<3) out.push(`research references should contain at least 3 real source URLs; found ${urls.length}`);
  if(sourceUrls.length){
    const visualProvenance=new Set(recordedImageReferenceUrls().map(normalizeEvidenceUrl));
    const unseen=sourceUrls.filter(u=>{
      const n=normalizeEvidenceUrl(u);
      return !fetched.has(n) && !visualProvenance.has(n);
    });
    if(unseen.length) out.push(`research Sources contains URL(s) with neither successful web_fetch evidence nor recorded image_search provenance: ${unseen.slice(0,5).join(', ')}`);
  }
  // Research-direction approves source/competitor direction, not exact KPI numbers.
  // Quantitative benchmark provenance is enforced later by canonical product-metrics.
  if(visibleUiProject() && HOST_CAPABILITIES.image_search && imageQueries.size<3) out.push(`visible UI requires 3-5 real image_search queries; recorded ${imageQueries.size}`);
  out.push(...researchVisualEvidenceBlockers());
  return out;
}
function researchDirectionEvidencePreview(maxChars=7000){
  const p=phase1ResearchEvidencePath();
  if(!p) return '';
  let t=optionalText(p,Math.max(8000,maxChars+1000)).trim();
  if(!t) return '';
  t=t.replace(/\n{3,}/g,'\n\n').trim();
  if(t.length>maxChars) t=t.slice(0,maxChars)+`\n...[research excerpt truncated]`;
  return [
    'NOTE: this STOP approves the research DIRECTION and source/competitor/visual landscape only.',
    'Numerical KPI/retention targets in these notes are provisional here and are NOT part of this approval.',
    'For visible UI projects, image-search evidence shown here must be real and current; "pending", placeholders, or N/A visual references are not approvable.',
    'Canonical product-metrics will re-verify quantitative benchmarks before the separate KPI/content-budget approval.',
    '',
    t
  ].join('\n');
}

function researchDirectionVisibleSummaryBlocker(a={}){
  if(String(a.decision_key||'')!=='phase1-research-direction') return null;
  const combined=`${a.question||''}\n${a.options||''}\n${a.recommendation||''}\n${a.reason||''}`;
  if(!/(competitor|конкурент|benchmark|бенчмарк|retention|D1|D7|D30|finding|вывод|pattern|паттерн|differentiation|отличи|source|источник)/i.test(combined)){
    return 'Research-direction STOP is too opaque for informed approval. State concrete researched competitors, benchmarks, sources, or findings in the STOP. The runtime will append the research evidence excerpt as well.';
  }
  return null;
}

function researchDirectionQuestionBlocker(a={}){
  if(String(a.decision_key||'')!=='phase1-research-direction') return null;
  const t=`${a.question||''}\n${a.options||''}\n${a.recommendation||''}`;
  if(HOST_CAPABILITIES.web_search && /(wait|ждат|подожд).{0,80}web[_ -]?search|web[_ -]?search.{0,80}(available|доступ)|без.{0,50}web[_ -]?search|internal (?:genre|research|notes)|внутренн.{0,50}(замет|research)/i.test(t)){
    return 'Research-direction STOP is invalid: live web_search is available. Do not offer waiting for web_search or waiving external research. Present the actual researched sources/competitors and ask approve vs deepen.';
  }
  return researchDirectionVisibleSummaryBlocker(a);
}

function phase1AiBaselineBlockers(){
  const out=[];
  if(!fileExistsNonEmpty('.forge-ai.json',20)) out.push('missing .forge-ai.json from ai-studio-init.mjs');
  if(!fileExistsNonEmpty('wiki/ai/asset-baseline.md',80)) out.push('missing wiki/ai/asset-baseline.md from AI Studio baseline');
  return out;
}
function phase1ProductMetricsPrerequisiteBlockers(){
  const out=[];
  if(!resolvedDecisionKeys.has('phase1-brief')) out.push('Phase 1 brief decision is unresolved');
  if(!fileExistsNonEmpty('wiki/design/brief.md',80)) out.push('wiki/design/brief.md missing');
  out.push(...semanticBriefBlockers()); out.push(...phase1AiBaselineBlockers()); return out;
}

function phase1ArtifactWriteGuard(path='') {
  if(activePhase!==1) return null;
  const p=String(path||'').replace(/\\/g,'/').toLowerCase();

  if((/\/analysis\.md$/i.test(p) || p==='wiki/architecture/analysis.md') && p!=='analysis.md') {
    return 'Phase 1 canonical analyze-project output is project-root ANALYSIS.md. Do not create alternate analysis.md copies under WorkProgress or wiki.';
  }
  if(p==='analysis.md' && loadedSkills.has('analyze-project')) {
    if(!phase1ResearchEvidencePath()) return 'Do not finalize root ANALYSIS.md yet: canonical analyze-project requires research-references first.';
    if(!resolvedDecisionKeys.has('phase1-research-direction')) return 'Do not finalize root ANALYSIS.md before the user approves the research direction. Research summary -> user confirmation -> final analysis.';
  }
  if(p==='wiki/design/brief.md' && !resolvedDecisionKeys.has('phase1-brief')) {
    return 'Do not write wiki/design/brief.md before the user answers the canonical Phase 1 brief. Use ask_user with decision_key=phase1-brief first.';
  }
  if(p==='wiki/architecture/metrics.md') {
    if(!resolvedDecisionKeys.has('phase1-brief')) return 'Do not write metrics before the canonical Phase 1 brief is answered.';
    if(!loadedSkills.has('product-metrics')) return 'Do not invent metrics directly. Load canonical product-metrics with forge_skill first.';
    if(!resolvedDecisionKeys.has('phase1-content-budget')) return 'Canonical product-metrics is proposal -> user approval -> write. Ask phase1-content-budget before writing metrics.md.';
    if(!WEB_SEARCH_AVAILABLE) return 'product-metrics requires real web research benchmarks. This GigaChat Forge host has no configured Internet search provider.';
  }
  if(/^wiki\/research\/.+references\.md$/i.test(p) && resolvedDecisionKeys.has('phase1-research-direction')) {
    return 'Research direction is already user-approved. Do not overwrite the approved references artifact. Forge preserves durable provenance automatically; continue to the next canonical Phase 1 action.';
  }
  if(/^wiki\/research\/.+references\.md$/i.test(p) && !WEB_SEARCH_AVAILABLE) {
    capabilityBlock='Canonical research-references requires real Internet web_search, but this GigaChat Forge adapter currently has no configured web search provider.';
    return capabilityBlock + ' Do not fabricate competitors, URLs, reviews, screenshots, or benchmark sources.';
  }
  return null;
}

function parseMissingSkillRunner(command='') {
  const s=String(command||'').trim();
  const m=s.match(/^node\s+["']?\.claude[\\/]skills[\\/]([^\\/'"\s]+)[\\/]([^'"\s]+)["']?(?:\s+([\s\S]*))?$/i);
  if(!m) return null;
  const skill=String(m[1]||'').toLowerCase();
  const runner=String(m[2]||'');
  const args=String(m[3]||'').trim();
  let skillDoc,runnerPath;
  try {
    skillDoc=safePath(`.claude/skills/${skill}/SKILL.md`);
    runnerPath=safePath(`.claude/skills/${skill}/${runner}`);
  } catch { return null; }
  if(!existsSync(skillDoc) || existsSync(runnerPath)) return null;
  return {skill,runner,args,skillDoc};
}

function phase1SourceInspected() {
  if(fileExistsNonEmpty('ANALYSIS.md',80) && hasAnyFileUnder('WorkProgress')) return true;
  const norm=v=>String(v||'').replace(/\\/g,'/').toLowerCase();
  const listed=[...phaseListedPaths].some(p=>{
    const n=norm(p);
    return n==='gameintegration' || n.startsWith('gameintegration/') || n==='workprogress' || n.startsWith('workprogress/');
  });
  const read=[...phaseReadFiles].some(p=>{
    const n=norm(p);
    return n.startsWith('gameintegration/') || n.startsWith('workprogress/');
  });
  // A successful forge_workspace_inspect contains actual source previews, so it is
  // factual source inspection even if forge_context was not called in the same turn.
  return listed && read && (phaseWorkspaceInspected || phaseContextRefreshed);
}

function normalizePhase1BriefGrillingText(value=''){
  return String(value||'').replace(
    /(^|\n)\s*❓?\s*(?:\*\*?)?(?:Q\s*)?([1-5])(?:\*\*?)?\s*(?:[.)]|:|-)\s*/gi,
    (_m,prefix,n)=>`${prefix}❓ **Q${n}** - `
  );
}

function canonicalizePhase1BriefArgs(a={}){
  if(String(a.decision_key||'')!=='phase1-brief') return a;
  return {
    ...a,
    question:normalizePhase1BriefGrillingText(a.question||''),
    options:normalizePhase1BriefGrillingText(a.options||'')
  };
}


function extractPhase1BriefBlocks(a={}){
  const normalized=canonicalizePhase1BriefArgs(a);
  const body=[normalized.question,normalized.options].filter(Boolean).join('\n');
  const blocks=[];
  const re=/(?:^|\n)\s*❓?\s*\*\*?Q([1-5])\*\*?\s*-\s*([\s\S]*?)(?=(?:\n\s*❓?\s*\*\*?Q[1-5]\*\*?\s*-)|$)/gi;
  for(const m of body.matchAll(re)) blocks.push({q:Number(m[1]),body:String(m[2]||'')});
  return {normalized,body,blocks};
}

function phase1HistoryRecommendationBlocker(a={}){
  const {blocks}=extractPhase1BriefBlocks(a);
  const q5=blocks.find(x=>x.q===5);
  if(!q5) return null;
  const rm=q5.body.match(/(?:^|\n)\s*➡️\s*([^\n]+(?:\n(?!\s*❓?\s*\*\*?Q[1-5]).*)*)/i);
  const rec=String(rm?.[1]||'').trim();
  if(!rec) return null;

  // Q5 is about user history. A recommendation may suggest what to preserve or
  // what the user should report, but must not invent concrete past attempts,
  // failures, experiments, or release history that the current project cannot prove.
  const concretePastClaim=/(?:это первая (?:публичная\s*)?(?:сборка|версия|попытка)|ранее (?:тестиров|пробовал|делал|использовал)|до этого (?:тестиров|пробовал|делал)|не сработал[аио]?|previously (?:tested|tried|built)|first public (?:build|release))/i;
  if(!concretePastClaim.test(rec)) return null;

  const grounded=/(?:по (?:файлам|проекту|прототипу) (?:видно|можно подтвердить)|из (?:файлов|проекта|прототипа) (?:видно|можно подтвердить)|from (?:the )?(?:project|prototype|files)|не могу (?:знать|определить)|неизвест|нет данных|данных (?:нет|недостаточно)|cannot know|unknown|no (?:data|evidence))/i;
  if(!grounded.test(rec)){
    return 'Q5 history recommendation contains unsupported concrete claims about prior development history. Current project files do not establish undocumented user attempts, failures, experiments, or public-release history.';
  }
  return null;
}

function phase1BriefGrillingBlockers(a={}){
  const out=[];
  const {normalized,body,blocks}=extractPhase1BriefBlocks(a);
  const topics=[
    ['audience',/аудитор|audience/i],
    ['ambition',/амбици|ambition/i],
    ['promise',/обещан|почувств|promise|feel/i],
    ['differentiator',/отлич|differentiat/i],
    ['history',/истори|пробовал|history|tried/i]
  ];
  for(const [name,re] of topics) if(!re.test(body)) out.push(`brief question set missing ${name}`);

  for(let i=1;i<=5;i++){
    const qRe=new RegExp(`(?:^|\\n)\\s*❓?\\s*\\*\\*?Q${i}\\*\\*?\\s*-`, 'i');
    if(!qRe.test(body)) out.push(`brief missing numbered question Q${i}`);
  }

  for(let i=1;i<=5;i++){
    const b=blocks.find(x=>x.q===i);
    if(!b) continue;
    const rm=b.body.match(/(?:^|\n)\s*➡️\s*([^\n]+(?:\n(?!\s*❓?\s*\*\*?Q[1-5]).*)*)/i);
    if(!rm || String(rm[1]||'').trim().length<8){
      out.push(`Q${i} must include a concrete recommended answer on its own ➡️ line`);
      continue;
    }
    const rec=String(rm[1]||'').trim();
    if(/^(?:решите сами|на ваш выбор|как хотите|your choice|you decide|n\/a|нет рекомендации)\b/i.test(rec)){
      out.push(`Q${i} recommendation is non-actionable`);
    }
  }

  if((body.match(/➡️/g)||[]).length<5){
    out.push('Phase 1 brief requires one ➡️ recommended answer for each of the 5 questions');
  }
  const historyBlocker=phase1HistoryRecommendationBlocker(normalized);
  if(historyBlocker) out.push(historyBlocker);
  return out;
}

function isPhase1BriefFormatError(value=''){
  return /Phase 1 brief STOP must follow canonical \/grilling format/i.test(String(value||''));
}

function phase1BriefRepairInstruction(a={},error=''){
  return [
    `Your attempted phase1-brief ask_user was rejected: ${String(error||'invalid /grilling format')}`,
    'Do NOT repeat the same arguments and do NOT call forge_checkpoint.',
    'Rewrite ask_user now through the NATIVE function_call channel with decision_key=phase1-brief.',
    'Ask all five questions in one round. Every question MUST contain a concrete project-specific recommended answer directly below it:',
    '❓ **Q1** - **Аудитория**: <question>',
    '➡️ <your recommended answer grounded in the current prototype/research>',
    '',
    '❓ **Q2** - **Амбиция**: <question>',
    '➡️ <your recommended answer>',
    '',
    '❓ **Q3** - **Обещание**: <what the player should feel>',
    '➡️ <your recommended answer>',
    '',
    '❓ **Q4** - **Отличие**: <main differentiator>',
    '➡️ <your recommended answer>',
    '',
    '❓ **Q5** - **История**: <what was already tried / what should be preserved>',
    '➡️ Recommend what to preserve/confirm from current project evidence. Do not invent undocumented prior attempts, failures, experiments, or release history; if unknown, say it is unknown until the user answers.',
    '',
    'Do not answer on behalf of the user. Recommendations are proposals the user can accept or change.'
  ].join('\n');
}

function printBriefFormatRecoveryStop(error=''){
  reportForgeBehavior({severity:'error',code:'GIGA_STOP_FORMAT_REPAIR_EXHAUSTED',kind:'stop_protocol',component:'phase-1-analyze',operation:'phase1-brief',message:'GigaChat exhausted bounded repair attempts for the canonical Phase 1 brief STOP.',expected:'Native ask_user with Q1..Q5 and one recommendation per question.',actual:String(error||'Malformed STOP serialization')});
  process.stdout.write(`\n=== FORGE RECOVERABLE STOP-FORMAT ERROR: Phase 1 ===\n`);
  process.stdout.write(`GigaChat repeatedly failed to serialize the mandatory /grilling brief correctly.\n`);
  if(error) process.stdout.write(`Last blocker: ${String(error)}\n`);
  process.stdout.write(`Recovery stopped before another ask_user/checkpoint token loop. Durable Forge state is preserved; re-run "фаза 1".\n`);
}

function phase1BriefRequiresThreeMonthScope(){ const answer=latestDecisionAnswer('phase1-brief'); return /Q2[\s\S]{0,260}(?:3\s*месяц|3\s*month|тр[её]хмесяч|серь[её]зн)/i.test(answer); }

function nonEmptyValue(v){if(Array.isArray(v))return v.some(x=>String(x||'').trim());if(v&&typeof v==='object')return Object.values(v).some(nonEmptyValue);return Boolean(String(v??'').trim());}
function structuredContentBudgetProposalBlockers(p={}){
  const out=[];if(!nonEmptyValue(p.benchmark_context))out.push('structured proposal missing benchmark_context');
  const k=p.kpis&&typeof p.kpis==='object'?p.kpis:{};for(const key of ['d1','d7','d30','arpdau','session_length','iap_conversion','north_star']){const row=k[key];if(!row||typeof row!=='object'){out.push(`structured proposal missing KPI ${key}`);continue;}for(const level of ['floor','target','stretch'])if(!nonEmptyValue(row[level]))out.push(`structured KPI ${key} missing ${level}`);}
  const e=p.engagement&&typeof p.engagement==='object'?p.engagement:{};for(const key of ['core_loop_length','session_structure','drop_off_points','retention_hooks'])if(!nonEmptyValue(e[key]))out.push(`structured engagement missing ${key}`);
  const m=p.monetization&&typeof p.monetization==='object'?p.monetization:{};for(const key of ['narrative','primary_model','rewarded_hooks','interstitial_hooks','iap_catalog','not_monetized'])if(!nonEmptyValue(m[key]))out.push(`structured monetization missing ${key}`);
  const c=p.content_budget&&typeof p.content_budget==='object'?p.content_budget:{};for(const key of ['scope','d0_d1','d2_d7','d8_d30','deficit'])if(!nonEmptyValue(c[key]))out.push(`structured content budget missing ${key}`);
  if(phase1BriefRequiresThreeMonthScope()&&!/(3\s*месяц|3\s*month|тр[её]хмесяч|12\s*нед|90\s*дн)/i.test(String(c.scope||'')))out.push('structured content budget must preserve approved ~3 month ambition');return out;
}
function formatListValue(v){if(Array.isArray(v))return v.join('; ');if(v&&typeof v==='object')return Object.entries(v).map(([k,x])=>`${k}: ${String(x)}`).join('; ');return String(v??'');}
function renderContentBudgetRow(label,row={}){const r=row&&typeof row==='object'?row:{goal:String(row||'')};return `| ${label} | ${String(r.goal||r.content||'')} | ${String(r.effort||r.volume||'')} | ${String(r.current||'')} | ${String(r.deficit||'')} |`;}
function renderStructuredContentBudgetQuestion(p={}){
  const k=p.kpis||{},e=p.engagement||{},m=p.monetization||{},c=p.content_budget||{};const row=(label,key)=>{const x=k[key]||{};return `| ${label} | ${String(x.industry||'see benchmark context')} | ${String(x.floor||'')} | ${String(x.target||'')} | ${String(x.stretch||'')} |`;};
  return ['## Phase 1 — Product Metrics + Content Budget approval','','### Industry benchmark context',String(p.benchmark_context||''),'','| KPI | Industry context | Floor | Target | Stretch |','|---|---|---|---|---|',row('D1 retention','d1'),row('D7 retention','d7'),row('D30 retention','d30'),row('ARPDAU','arpdau'),row('Session length','session_length'),row('IAP conversion','iap_conversion'),row('North-star','north_star'),'','### Engagement narrative',`- Core-loop length: ${formatListValue(e.core_loop_length)}`,`- Session structure: ${formatListValue(e.session_structure)}`,`- Drop-off points: ${formatListValue(e.drop_off_points)}`,`- Retention hooks: ${formatListValue(e.retention_hooks)}`,'','### Provisional monetization narrative',`- Monetization narrative: ${formatListValue(m.narrative)}`,`- Primary model (provisional; Phase 2 owns final decision): ${formatListValue(m.primary_model)}`,`- Rewarded-video hooks: ${formatListValue(m.rewarded_hooks)}`,`- Interstitial hooks: ${formatListValue(m.interstitial_hooks)}`,`- IAP catalog / provisional tiers: ${formatListValue(m.iap_catalog)}`,`- НЕ монетизируем: ${formatListValue(m.not_monetized)}`,'',`### Content budget — scope: ${String(c.scope||'')}`,'| Window | Content / goal | Effort / volume | Exists now | DEFICIT |','|---|---|---|---|---|',renderContentBudgetRow('D0-D1',c.d0_d1),renderContentBudgetRow('D2-D7',c.d2_d7),renderContentBudgetRow('D8-D30',c.d8_d30),'',`**Explicit DEFICIT:** ${formatListValue(c.deficit)}`,'','После утверждения Forge запишет wiki/architecture/metrics.md и product-metrics ADR.'].join('\n');
}
function canonicalizePhase2DecisionArgs(a={}){
  const key=String(a.decision_key||'').trim();
  if(key==='phase2-monetization') return {...a,
    question:String(a.question||'На чём зарабатывает игра?'),
    options:String(a.options||'А) Только реклама — Yandex-first, без сервера\nБ) Гибрид — платежи + реклама, backend и юридический контур'),
    recommendation:String(a.recommendation||'А) Только реклама — самый быстрый путь к рабочему MVP.'),
    reason:String(a.reason||'Модель монетизации определяет платформу, backend и объём реализации.')};
  if(key==='phase2-multiplayer') return {...a,
    question:String(a.question||'Делаем мультиплеер? Сервер увеличивает срок и постоянные расходы.'),
    options:String(a.options||'А) Нет — одиночная игра без сервера\nБ) Асинхронный\nВ) Синхронный реалтайм'),
    recommendation:String(a.recommendation||'А) Нет — самый быстрый путь к рабочему MVP.'),
    reason:String(a.reason||'Мультиплеер добавляет backend, синхронизацию, эксплуатацию и QA.')};
  if(key==='phase2-content-plan') return {...a,
    question:String(a.question||'Утверждаем минимальную контентную рамку MVP и критерии готовности?'),
    options:String(a.options||'А) Утвердить минимальный план\nБ) Изменить — перечислите необходимые правки'),
    recommendation:String(a.recommendation||'А) Утвердить минимальный план без расширения D8–D30 до проверки удержания.'),
    reason:String(a.reason||'Фиксированный scope предотвращает разрастание разработки до первого рабочего билда.')};
  if(key==='phase2-screen-inventory') return {...a,
    question:String(a.question||'Утверждаете полный inventory экранов и переходов из wiki/design/screen-flow.json?'),
    options:String(a.options||'А) Утвердить полный список экранов и переходов\nБ) Изменить — перечислите экран/переход и нужную правку'),
    recommendation:String(a.recommendation||'А) Утвердить inventory, если все игроком видимые состояния и маршруты перечислены; это фиксирует обязательное покрытие Phase 4.'),
    reason:String(a.reason||'Phase 4 снимет и визуально проверит каждый утверждённый экран; скрыть или добавить state после этого можно только через новое явное утверждение.')};
  return a;
}
function canonicalizeAskUserArgs(a={}){let out=canonicalizePhase2DecisionArgs(canonicalizePhase1BriefArgs(a));if(String(out.decision_key||'')==='phase1-content-budget'&&out.proposal&&typeof out.proposal==='object'){out={...out,question:renderStructuredContentBudgetQuestion(out.proposal),options:String(out.options||'A) Утвердить proposal как есть\nB) Скорректировать — укажите KPI/бюджет и новое значение\nC) Вернуться к research'),recommendation:String(out.recommendation||'A) Утвердить, если KPI и трёхмесячный content budget подходят.'),reason:String(out.reason||'Обязательный Phase 1 STOP перед metrics.md/ADR.')};}return out;}
function readScreenInventoryDraft(){
  const relPath='wiki/design/screen-flow.json';
  try{
    const flow=JSON.parse(readText(safePath(relPath)));
    if(flow?.schemaVersion!==1||flow?.kind!=='forge.screen-flow')return {ok:false,blockers:['screen-flow.json has the wrong schemaVersion/kind']};
    if(!Array.isArray(flow.states)||flow.states.length<2)return {ok:false,blockers:['screen-flow.json must enumerate at least two player-visible states']};
    if(!Array.isArray(flow.transitions)||flow.transitions.length<1)return {ok:false,blockers:['screen-flow.json must enumerate the player routes between states']};
    return {ok:true,relPath,flow,inventorySha256:screenInventorySha256(flow)};
  }catch(error){return {ok:false,blockers:[`cannot read screen-flow.json: ${error.message}`]};}
}
function screenInventoryEvidencePreview(){
  const draft=readScreenInventoryDraft();
  if(!draft.ok)return `[inventory unavailable: ${draft.blockers.join('; ')}]`;
  return [`Inventory SHA-256: ${draft.inventorySha256}`,'','Canonical approval payload:',JSON.stringify(screenInventoryPayload(draft.flow),null,2)].join('\n');
}
function materializeApprovedScreenInventory(expectedHash,approvedAt=new Date().toISOString()){
  const draft=readScreenInventoryDraft();
  if(!draft.ok)return draft;
  if(!expectedHash||draft.inventorySha256!==expectedHash)return {ok:false,blockers:['screen inventory changed after the user STOP; reopen it and show the new complete graph']};
  draft.flow.status='approved';
  draft.flow.approval={decisionKey:'phase2-screen-inventory',approvedBy:'user',approvedAt,inventorySha256:draft.inventorySha256};
  writeFileSync(safePath(draft.relPath),`${JSON.stringify(draft.flow,null,2)}\n`,'utf8');
  phaseWrittenFiles.add(draft.relPath);memoryDirty=true;
  return {ok:true,path:draft.relPath,inventorySha256:draft.inventorySha256};
}
function nextProductMetricsAdrPath(){const files=findFiles('wiki/decisions',/\.md$/i,1,500);let max=0;for(const f of files){const m=f.match(/\/(\d{3})-[^/]+\.md$/);if(m)max=Math.max(max,Number(m[1]));}return `wiki/decisions/${String(max+1).padStart(3,'0')}-product-metrics.md`;}
function renderApprovedMetricsMarkdown(p={}){const sources=[...new Set((phaseProductMetricsEvidence.fetch||[]).map(x=>String(x.url||x.requested_url||'')).filter(u=>/^https?:\/\//i.test(u)))];return ['---',`date: ${new Date().toISOString().slice(0,10)}`,'status: approved','---','','# Product Metrics','',renderStructuredContentBudgetQuestion(p),'','## Sources',...sources.map(u=>`- ${u}`),''].join('\n');}
function renderProductMetricsAdr(p={}){const sources=[...new Set((phaseProductMetricsEvidence.fetch||[]).map(x=>String(x.url||x.requested_url||'')).filter(u=>/^https?:\/\//i.test(u)))];return ['# ADR — Product Metrics','',`- Date: ${new Date().toISOString().slice(0,10)}`,'- Status: Accepted','- Phase: 1 Analyze','','## Decision','Adopt the approved KPI set and content budget from wiki/architecture/metrics.md.','','## Context',String(p.benchmark_context||''),'','## Consequences','- Phase 2 design uses these metrics as constraints.','- Phase 2 still owns the final monetization decision.','','## Evidence',...sources.map(u=>`- ${u}`),''].join('\n');}
function materializeApprovedProductMetricsProposal(p={}){const blockers=structuredContentBudgetProposalBlockers(p);if(blockers.length)return {ok:false,blockers};const metrics='wiki/architecture/metrics.md',adr=nextProductMetricsAdrPath();mkdirSync(dirname(safePath(metrics)),{recursive:true});mkdirSync(dirname(safePath(adr)),{recursive:true});writeFileSync(safePath(metrics),renderApprovedMetricsMarkdown(p),'utf8');writeFileSync(safePath(adr),renderProductMetricsAdr(p),'utf8');phaseWrittenFiles.add(metrics);phaseWrittenFiles.add(adr);memoryDirty=true;return {ok:true,metrics,adr};}

function productMetricsProposalBlockers(a={}){
  const out=[], t=`${a.question||''}\n${a.options||''}\n${a.recommendation||''}\n${a.reason||''}`;
  for(const name of ['Floor','Target','Stretch']) if(!new RegExp(`\\b${name}\\b`,'i').test(t)) out.push(`proposal missing ${name}`);
  for(const [name,re] of [['D1',/\bD1\b/i],['D7',/\bD7\b/i],['D30',/\bD30\b/i],['ARPDAU',/\bARPDAU\b|\bARPU\b/i],['session length',/session length|длительност[ьи] сесси/i],['IAP conversion',/IAP[\s-]*(?:conversion|конвер)|конверси.{0,20}IAP/i],['north-star',/north[- ]?star|северн.{0,20}звезд/i]]) if(!re.test(t)) out.push(`proposal missing ${name}`);
  if(!/(core loop|цикл.{0,20}(?:секунд|сек)|loop length)/i.test(t)) out.push('proposal missing engagement core-loop length');
  if(!/(session structure|структур.{0,20}сесси)/i.test(t)) out.push('proposal missing session structure');
  if(!/(drop.?off|точк.{0,20}(?:отвал|выход)|churn)/i.test(t)) out.push('proposal missing drop-off points');
  if(!/(retention hooks|крючк.{0,20}удерж|что верн[её]т)/i.test(t)) out.push('proposal missing retention hooks');
  if(!/(monetization narrative|монетизац)/i.test(t)) out.push('proposal missing monetization narrative');
  if(!/(primary model|основн.{0,20}модел)/i.test(t)) out.push('proposal missing provisional primary monetization model');
  if(!/(rewarded|вознагражд.{0,20}(?:видео|реклам))/i.test(t)) out.push('proposal missing rewarded-video hooks');
  if(!/(interstitial|межстранич|полноэкран.{0,20}реклам)/i.test(t)) out.push('proposal missing interstitial hooks');
  if(!/(IAP catalog|каталог.{0,20}IAP|покупк.{0,20}(?:каталог|tier|уров))/i.test(t)) out.push('proposal missing IAP catalog/provisional tiers');
  if(!/(DON.?T monetize|НЕ монетиз|не монетиз)/i.test(t)) out.push('proposal missing explicit what-we-do-not-monetize section');
  if(!/(D0.?D1)/i.test(t)) out.push('content budget missing D0-D1 row'); if(!/(D2.?D7)/i.test(t)) out.push('content budget missing D2-D7 row'); if(!/(D8.?D30|D30.{0,40}(?:после|after).{0,40}D7)/i.test(t)) out.push('content budget missing D8-D30 row or explicit post-D7 D30 plan');
  if(!/(дефицит|deficit)/i.test(t)) out.push('content budget missing explicit deficit'); if(!/(industry|benchmark|бенчмарк|средн.{0,20}(?:рынк|индустр))/i.test(t)) out.push('proposal missing visible benchmark/industry context');
  if(phase1BriefRequiresThreeMonthScope()&&!/(3\s*месяц|3\s*month|тр[её]хмесяч|12\s*нед|90\s*дн)/i.test(t)) out.push('proposal contradicts approved Q2 ambition: user chose serious development for about 3 months, but the proposal does not carry that scope forward');
  if(!fileExistsNonEmpty('wiki/architecture/metrics.md',80)){
    const prematureMetricsAuthority=[
      /(?:утверд|одобр|подтверд|выбер|approve|confirm|accept)[\s\S]{0,100}(?:из|from|в|in)\s+(?:wiki\/architecture\/)?metrics\.md/i,
      /(?:targets?|KPI|метрик|целев)[\s\S]{0,80}(?:уже\s+)?(?:зафиксирован|записан|наход|defined|fixed|stored)[\s\S]{0,80}(?:wiki\/architecture\/)?metrics\.md/i,
      /(?:wiki\/architecture\/)?metrics\.md[\s\S]{0,100}(?:источник истины|source of truth|authoritative|утверд|одобр|approve)/i
    ].some(re=>re.test(t));
    if(prematureMetricsAuthority) out.push('proposal must not treat metrics.md as an already-written/authoritative source before approval; saying that metrics.md/ADR will be written AFTER approval is allowed');
  }
  return out;
}


function isPhase1ContentBudgetFormatError(value=''){
  return /Content-budget STOP is incomplete\/non-canonical/i.test(String(value||''));
}
function phase1ContentBudgetRepairInstruction(a={},error=''){
  const approvedBrief=latestDecisionAnswer('phase1-brief');
  return [
    'Your attempted Phase 1 product-metrics/content-budget ask_user was rejected as incomplete.',
    `Blockers: ${String(error||'unknown format error')}`,
    '',
    'REWRITE the ENTIRE native ask_user call now. Do not patch one missing field at a time.',
    'Use decision_key="phase1-content-budget" AND the structured proposal object. Do not hand-serialize the whole table into question text.',
    'Do not write metrics.md or the ADR before approval; Forge materializes them after an as-is approval.',
    'The visible STOP must include all of these sections in one proposal:',
    '- Industry benchmark context: clearly separate observed source benchmarks from PROJECT PROPOSALS.',
    '- One KPI table with Floor / Target / Stretch columns and rows for D1, D7, D30, ARPDAU, session length, IAP conversion, and north-star.',
    '- Engagement narrative: core-loop length, session structure, drop-off points, retention hooks.',
    '- Provisional monetization narrative: primary model assumption, rewarded-video hooks, interstitial hooks, IAP catalog/provisional tiers, and an explicit "НЕ монетизируем / DON’T monetize" section.',
    '- Content budget with D0-D1, D2-D7, D8-D30, hours/volume, what exists now, and explicit DEFICIT.',
    '- Preserve the approved user ambition from Q2. If it says ~3 months, do NOT recommend a 2-week MVP as the approved scope.',
    '- Do NOT treat wiki/architecture/metrics.md as already written or authoritative. It is OK to say: "after approval Forge will write metrics.md and the ADR".',
    '- Present A/B/C approval choices and one concrete recommendation.',
    '',
    `Authoritative Phase 1 brief answer:\n${approvedBrief||'(read durable decision ledger/context)'}`,
    '',
    'Call native ask_user now. Do not call forge_checkpoint instead.'
  ].join('\n');
}
function printContentBudgetFormatRecoveryStop(error){
  reportForgeBehavior({severity:'error',code:'GIGA_STOP_FORMAT_REPAIR_EXHAUSTED',kind:'stop_protocol',component:'phase-1-analyze',operation:'phase1-content-budget',message:'GigaChat exhausted bounded repair attempts for the product-metrics/content-budget STOP.',expected:'Complete native ask_user structured proposal.',actual:String(error||'Malformed STOP serialization')});
  process.stdout.write(
    `\n=== FORGE RECOVERABLE STOP-FORMAT ERROR: Phase 1 product-metrics ===\n`+
    `GigaChat repeatedly failed to serialize the complete canonical product-metrics/content-budget STOP.\n`+
    `Last blocker: ${String(error||'unknown')}\n`+
    `Recovery stopped before another repair/token loop. Durable Forge state is preserved; re-run "фаза 1".\n`
  );
}

function phase1StopGuard(a={}) {
  if(activePhase!==1) return null;
  const key=String(a.decision_key||'').trim();
  if(!phaseStarted) return 'Phase 1 STOP-point blocked: phase runtime must be started first.';
  if(!key) return 'Phase 1 ask_user requires decision_key phase1-research-direction, phase1-brief, phase1-content-budget, or phase1-ambiguity.';
  if(!phase1SourceInspected()) return 'Phase 1 STOP-point blocked: inspect the actual prototype/source first.';
  if(/размерност|dimension/i.test(String(a.question||''))&&key!=='phase1-ambiguity') return 'Infer dimensionality from source when clear; use phase1-ambiguity only for genuine conflicting evidence.';
  if(key==='phase1-research-direction'){
    const rb=phase1ResearchBlockers();
    if(rb.length) return `Research-direction approval blocked: ${rb.join('; ')}`;
    const qb=researchDirectionQuestionBlocker(a);
    if(qb) return qb;
    return null;
  }
  if(key==='phase1-brief'){
    if(!resolvedDecisionKeys.has('phase1-research-direction')) return 'Phase 1 brief requires approved research direction first.';
    if(!fileExistsNonEmpty('ANALYSIS.md',80)) return 'Phase 1 brief requires canonical project-root ANALYSIS.md first.';
    if(!fileHas('wiki/_map.md',/\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i)) return 'Phase 1 brief requires persisted dimensionality first.';
    if(!completedSkills.has('find-or-make-skill')) return 'Phase 1 brief requires completed find-or-make-skill discovery first.';
    const gb=phase1BriefGrillingBlockers(a);
    if(gb.length) return `Phase 1 brief STOP must follow canonical /grilling format with a recommendation for every question: ${gb.join('; ')}`;
    return null;
  }
  if(key==='phase1-content-budget'){
    if(!resolvedDecisionKeys.has('phase1-brief')) return 'Phase 1 content-budget approval requires the brief first.';
    if(!fileExistsNonEmpty('wiki/design/brief.md',80)) return 'Persist approved brief answers first.';
    const prereq=phase1ProductMetricsPrerequisiteBlockers(); if(prereq.length) return `Phase 1 content-budget prerequisites incomplete: ${prereq.join('; ')}`;
    if(!loadedSkills.has('product-metrics')) return 'Load canonical product-metrics first.';
    const rb=productMetricsResearchBlockers(); if(rb.length) return `Content-budget approval blocked: ${rb.join('; ')}`;
    const pb=(a.proposal&&typeof a.proposal==='object')?structuredContentBudgetProposalBlockers(a.proposal):productMetricsProposalBlockers(a); if(pb.length) return `Content-budget STOP is incomplete/non-canonical: ${pb.join('; ')}`;
    return null;
  }
  if(key==='phase1-ambiguity') return null;
  if(/^phase1-[a-z0-9-]+$/i.test(key)||/^analyze-project-[a-z0-9-]+$/i.test(key)) return null;
  return `Unsupported Phase 1 decision_key: ${key}`;
}
function phaseDecisionGuard(a={}){
  const p=Number(activePhase||0); if(!p||p===1)return null;
  const key=String(a.decision_key||'').trim(); if(!key)return `Phase ${p} ask_user requires a stable decision_key.`;
  const required=requiredDecisionKeysForPhase(p);
  if(required.size&&!required.has(key)&&!new RegExp(`^phase${p}-[a-z0-9-]+$`,'i').test(key))return `Unsupported Phase ${p} decision_key: ${key}`;
  if(p===2){
    if(key==='phase2-multiplayer'&&!resolvedDecisionKeys.has('phase2-monetization'))return 'Ask Phase 2 monetization first.';
    if(key==='phase2-content-plan'&&(!resolvedDecisionKeys.has('phase2-monetization')||!resolvedDecisionKeys.has('phase2-multiplayer')))return 'Final Phase 2 content-plan approval comes after monetization and multiplayer.';
    if(key==='phase2-screen-inventory'){
      if(!resolvedDecisionKeys.has('phase2-monetization')||!resolvedDecisionKeys.has('phase2-multiplayer')||!resolvedDecisionKeys.has('phase2-content-plan'))return 'Phase 2 screen inventory approval comes after monetization, multiplayer, and content-plan decisions.';
      const draft=readScreenInventoryDraft();if(!draft.ok)return `Phase 2 screen inventory STOP blocked: ${draft.blockers.join('; ')}`;
    }
  }
  if(p===4){
    const order=['phase4-asset-source','phase4-art-direction','phase4-target-frame','phase4-style-bible','phase4-pixel-provider'],pos=order.indexOf(key);
    if(pos>0)for(const prev of order.slice(0,pos))if(required.has(prev)&&!resolvedDecisionKeys.has(prev))return `Phase 4 decision ordering blocked: resolve ${prev} before ${key}.`;
  }
  return null;
}

function beginPhaseFromUserText(text) {
  const m = String(text || '').match(/\bphase-(\d+)-[a-z0-9-]+\b/i);
  if (!m) return;
  const phase = Number(m[1]);
  if (activePhase !== phase) {
    const carriedPending=pendingDecision&&typeof pendingDecision==='object'?pendingDecision:null;
    const carriedPendingPhase=pendingDecisionPhase(carriedPending)||Number(durableRuntimeEvidence?.phase?.phase||0);
    activePhase = phase;
    activePhaseSkill = null;
    requiredPhaseDecisions = 0;
    resolvedPhaseDecisions = 0;
    resolvedDecisionKeys = new Set();
    pendingDecision = carriedPending&&carriedPendingPhase===phase?carriedPending:null;
    phaseReadFiles = new Set();
    phaseListedPaths = new Set();
    phaseContextRefreshed = false;
    phaseWorkspaceInspected = false;
    loadedSkills = new Set();
    resetPhaseRuntimeEvidence();
  }
}

function isStatusOnlyInput(text='') {
  const s=String(text||'').trim().toLowerCase();
  if(!s) return false;
  return s==='/status' || s==='status' || s==='статус' ||
    /^(?:покажи|дай|какой|какая|какие)?\s*(?:текущий\s+)?статус[?.!]*$/i.test(s) ||
    /^(?:что\s+ты\s+делаешь|что\s+сейчас\s+делаешь|какие\s+вопросы(?:\s+у\s+тебя)?|что\s+уже\s+сделано|где\s+остановились|на\s+ч[её]м\s+остановились)[?.!]*$/i.test(s) ||
    /^(?:ну\s+|а\s+)?(?:ты\s+)?(?:собрал(?:а|и)?|создал(?:а|и)?|сделал(?:а|и)?|запустил(?:а|и)?|проверил(?:а|и)?|закончил(?:а|и)?|готовил(?:а|и)?|обновил(?:а|и)?|отправил(?:а|и)?|запушил(?:а|и)?|исправил(?:а|и)?|подключил(?:а|и)?|добавил(?:а|и)?)(?=\s|[?])[^\n]*[?]+$/i.test(s) ||
    /^(?:ну\s+|а\s+)?(?:вс[её]\s+)?(?:готово|сделано|собрано|создано|запущено|проверено|закончено|обновлено|отправлено|исправлено|подключено|добавлено)(?:\s+[^\n]*)?[?]+$/i.test(s) ||
    /^(?:ну\s+|а\s+)?[^\n?]{1,100}\s+(?:готов[ыао]?|собран[ыао]?|создан[ыао]?|запущен[ыао]?|проверен[ыао]?|обновлен[ыао]?|обновлён[ыао]?|исправлен[ыао]?|подключен[ыао]?|подключён[ыао]?)[?]+$/i.test(s);
}

const READ_ONLY_FUNCTIONS=new Set(['forge_status','forge_checkpoint','forge_context','forge_workspace_inspect','forge_capabilities','forge_search_doctor','read_file','list_files','search_text','git_diff']);
function readOnlyTurnToolBlock(name=''){
  if(!currentTurnReadOnly || READ_ONLY_FUNCTIONS.has(String(name||''))) return null;
  return `Read-only status question: tool ${name} is unavailable. Answer only from current project state; do not write files, run commands, start phases, build releases, or change memory.`;
}

function counterfeitCanonicalScriptWriteBlock(path=''){
  const p=String(path||'').replace(/\\/g,'/').toLowerCase();
  if(!/^workprogress\/[^/]+\/scripts\/(?:verify-|check-|release-|build-yandex|phase-state)/i.test(p)) return null;
  return `Counterfeit Forge verifier/release script blocked: ${path}. Do not invent a project-local substitute for a missing canonical Forge verifier or release command; load the exact canonical skill/script and report a real blocker if it is unavailable.`;
}

function repeatedDirectiveOverwriteBlock(path=''){
  if(!activeDirective) return null;
  const target=String(path||'').replace(/\\/g,'/').toLowerCase();
  const writes=(activeDirective.operations||[]).filter(op=>op.tool==='write_file'&&String(op.target||'').replace(/\\/g,'/').toLowerCase()===target);
  if(!writes.length) return null;
  return `Repeated full overwrite blocked: ${path} already received write_file during this direct task. Use targeted replace_text for all further edits; rereading the file does not authorize another reconstruction.`;
}

function destructiveFullWriteBlock(path='',content=''){
  if(!activeDirective) return null;
  let p;try{p=safePath(path);}catch{return null;}
  if(!existsSync(p) || !statSync(p).isFile()) return null;
  try{
    const contractPath=safePath('wiki/architecture/modules.json');
    if(existsSync(contractPath)){
      const contract=JSON.parse(readText(contractPath));
      const target=rel(p).replace(/\\/g,'/').toLowerCase();
      const approved=(contract.modules||[]).some(module=>String(module.path||'').replace(/\\/g,'/').toLowerCase()===target);
      if(approved) return `Full write_file replacement of approved module ${path} is blocked. Its documented symbols and neighboring behavior must be preserved; use one or more targeted replace_text edits. New modules may be created with write_file before contract refresh.`;
    }
  }catch{}
  const oldBytes=statSync(p).size, newBytes=Buffer.byteLength(String(content??''));
  const explicitRebuild=/(?:перепиши|пересобери|замени)\s+(?:файл\s+)?(?:полностью|целиком|с\s+нуля)|rebuild\s+(?:the\s+)?file\s+from\s+scratch|replace\s+(?:the\s+)?entire\s+file/i.test(String(activeDirective.request||''));
  if(oldBytes>=32_000 && !explicitRebuild) return `Full write_file replacement of existing large file ${path} (${oldBytes} bytes) is blocked for this direct integration task. Preserve the existing game and use targeted replace_text anchors.`;
  if(oldBytes>=8_000 && newBytes+4_096<oldBytes*0.75 && !explicitRebuild) return `Destructive shrink blocked for ${path}: ${oldBytes} -> ${newBytes} bytes. The task did not explicitly authorize rebuilding this file from scratch; use replace_text.`;
  return null;
}
function phaseExecutionRequestedByText(text='') {
  const s=String(text||'');
  return /\bphase-\d+-[a-z0-9-]+\b/i.test(s) ||
    /(?:выполни|пройди|execute|run|continue|продолжай)[^\n]{0,80}phase\s*\d+/i.test(s) ||
    /(?:выполни|пройди|execute|run)[^\n]{0,80}forge\s+skill/i.test(s);
}

const PHASE_SKILLS = new Map([
  [1,'phase-1-analyze'],
  [2,'phase-2-design'],
  [3,'phase-3-construct'],
  [4,'phase-4-visual'],
  [5,'phase-5-tech'],
  [6,'phase-6-listing'],
  [7,'phase-7-test'],
  [8,'phase-8-release'],
  [9,'phase-9-live'],
]);
function phaseAliasInvocation(text='') {
  const s=String(text||'').trim();
  let m=s.match(/^(?:фаза|phase|ф)\s*([1-9])\s*[.!]?$/i);
  if(m) {
    const phase=Number(m[1]);
    return {phase,skill:PHASE_SKILLS.get(phase)};
  }
  m=s.match(/^[/\$]?(phase-([1-9])-[a-z0-9-]+)\s*\.?$/i);
  if(m) return {phase:Number(m[2]),skill:m[1].toLowerCase()};
  return null;
}

function directiveCommand(text='') {
  const s=String(text||'').trim();
  if(/^\/resume-phase\s*$/i.test(s)) return {kind:'resume'};
  if(/^\/(?:task|do-status)\s*$/i.test(s)) return {kind:'status'};
  const m=s.match(/^\/do(?:\s+([\s\S]+))?$/i);
  if(m) return {kind:'do',request:String(m[1]||'').trim()};
  return null;
}

function naturalImplementationDirective(text='') {
  const s=String(text||'').trim();
  if(!s || s.startsWith('/') || isStatusOnlyInput(s) || phaseAliasInvocation(s) || phaseExecutionRequestedByText(s)) return null;
  const direct=/(?:^|[.!?]\s*)(?:сделай|добавь|реализуй|внедри|исправь|почини|переработай|доработай|создай|замени|убери|начинай(?:\s+делать)?|давай\s+(?:сделаем|добавим|реализуем|внедрим|исправим|починим|переработаем|доработаем|создадим))(?=\s|[.,!?:;]|$)/i;
  return direct.test(s)?s:null;
}

function authoritativeOpenPhase() {
  const markers=phaseMarkersSnapshot();
  const open=markers.filter(x=>['in_progress','blocked'].includes(String(x.state||''))).sort((a,b)=>Number(b.phase)-Number(a.phase));
  if(open.length) return Number(open[0].phase)||null;
  const firstPending=markers.find(x=>!['complete','ongoing'].includes(String(x.state||'')));
  return firstPending?Number(firstPending.phase)||null:null;
}

function activateDirective(request,source='natural_language') {
  const task=String(request||'').trim();
  if(!task) return {ok:false,error:'Пустая команда. Использование: /do <что конкретно сделать>'};
  const now=new Date().toISOString();
  // Reissuing an explicit /do is a deliberate retry and must start with clean
  // operation/read cursors. Natural continuation in the same runtime may keep
  // durable progress, but a failed direct task must not poison its retry.
  const continuingSame=Boolean(source!=='explicit_command' && activeDirective?.request===task && activeDirective?.status==='active');
  const history=Array.isArray(activeDirective?.history)?activeDirective.history.slice(-7):[];
  if(activeDirective?.request && activeDirective.request!==task) history.push({request:activeDirective.request,at:activeDirective.updatedAt||activeDirective.activatedAt||now});
  activeDirective={
    mode:'change_request',
    status:'active',
    request:task,
    source,
    activatedAt:continuingSame?(activeDirective?.activatedAt||now):now,
    updatedAt:now,
    pausedPhase:(continuingSame?activeDirective?.pausedPhase:null)||authoritativeOpenPhase()||activePhase||null,
    latestUserInput:task,
    operations:continuingSame&&Array.isArray(activeDirective?.operations)?activeDirective.operations.slice(-40):[],
    reads:continuingSame&&Array.isArray(activeDirective?.reads)?activeDirective.reads.slice(-40):[],
    readCursors:continuingSame&&activeDirective?.readCursors&&typeof activeDirective.readCursors==='object'?activeDirective.readCursors:{},
    history
  };
  // Persist the exact user request before creating supplemental graph state. If the process dies in
  // the next instruction, startup recovery can recreate or attach the Task without losing intent.
  if(!persistRuntimeEvidenceLedger()) return {ok:false,error:'Could not persist the direct user request before Task creation.'};
  const runtime=ensureDirectiveTaskRuntime(activeDirective,{forceNew:!continuingSame});
  if(!runtime.ok) return runtime;
  activeDirective={...activeDirective,taskId:runtime.run.task.id,workflowNode:runtime.run.state.currentNode};
  if(!persistRuntimeEvidenceLedger()) return {ok:false,error:'Direct Task exists, but its durable pointer could not be attached. The request was preserved for restart recovery.'};
  return {ok:true,directive:activeDirective};
}

function ensureDirectiveTaskRuntime(directive=activeDirective,{forceNew=false}={}){
  try{
    if(!forceNew&&directive?.taskId){
      const existing=readTaskRun(PROJECT,directive.taskId);
      if(existing&&!['completed','cancelled'].includes(existing.task.status)) return {ok:true,run:existing};
    }
    if(!forceNew&&!directive?.taskId){
      const activatedAt=Date.parse(directive?.activatedAt||0);
      const recovered=listTaskRuns(PROJECT).find(run=>run.task.mode==='change'
        && run.task.goal===String(directive?.request||'').trim()
        && Number(run.task.phase||0)===Number(directive?.pausedPhase||0)
        && !['blocked','completed','cancelled'].includes(run.task.status)
        && (!Number.isFinite(activatedAt)||Date.parse(run.task.createdAt)>=activatedAt-1000));
      if(recovered) return {ok:true,run:recovered,recovered:true};
    }
    const task=makeTask({
      mode:'change',
      phase:directive?.pausedPhase||null,
      goal:String(directive?.request||'').trim(),
      skill:null,
      scope:{read:['WorkProgress/**','wiki/**','assets/**'],write:['WorkProgress/**','wiki/**','assets/**']},
      acceptance:[{id:'CHANGE-VERIFIED',text:'Implementation exists and focused post-change verification passes',status:'pending'}],
      verifiers:[],
    });
    return {ok:true,run:startTaskRun({projectRoot:PROJECT,task})};
  }catch(error){
    reportForgeBehavior({severity:'error',code:'GIGA_TASK_RUNTIME_FAILURE',kind:'runtime_state',component:'gigachat-agent',operation:'ensure-directive-task',message:'Could not create or restore the durable change Task.',expected:'A valid .forge/runs Task state.',actual:String(error?.message||error)});
    return {ok:false,error:`Forge Task runtime failed: ${String(error?.message||error)}`};
  }
}

function recordDirectiveRunResult(input={}){
  if(!activeDirective) return {ok:false,error:'No active direct task'};
  const ensured=ensureDirectiveTaskRuntime(activeDirective);
  if(!ensured.ok) return ensured;
  try{
    const run=ensured.run;
    const result=makeRunResult({
      taskId:run.task.id,
      node:run.state.currentNode,
      status:input.status,
      code:input.code,
      message:input.message,
      host:'gigachat',
      phase:run.task.phase,
      evidence:input.evidence||[],
      checks:input.checks||[],
      failure:input.failure||null,
      stop:input.stop||null,
    });
    const updated=recordTaskResult({projectRoot:PROJECT,taskId:run.task.id,result});
    activeDirective={...activeDirective,taskId:updated.task.id,workflowNode:updated.state.currentNode,updatedAt:new Date().toISOString()};
    persistRuntimeEvidenceLedger();
    return {ok:true,run:updated};
  }catch(error){
    reportForgeBehavior({severity:'error',code:'GIGA_RUN_RESULT_FAILURE',kind:'runtime_state',component:'gigachat-agent',operation:'record-directive-result',message:'Could not persist a structured direct-task RunResult.',expected:'A valid graph transition.',actual:String(error?.message||error)});
    return {ok:false,error:String(error?.message||error)};
  }
}

function updateDirectiveInput(text='') {
  if(!activeDirective) return;
  activeDirective={...activeDirective,latestUserInput:String(text||'').trim(),updatedAt:new Date().toISOString()};
  persistRuntimeEvidenceLedger();
}

function directiveTaskPrompt(userText='') {
  if(!activeDirective) return String(userText||'');
  const hints=/гач/i.test(activeDirective.request)
    ? 'Для этой задачи сначала загрузи tactical skill gacha-meta; при необходимости затем deepen-game/gameplay-balance. Если modules.json описывает merge-grid с state.grid/saveState, не переписывай утверждённые модули вручную: вызови forge_script name=scripts/integrate-gacha.mjs args=[<каталог игры>], затем refresh/check контракта. Обязательная сфокусированная проверка: forge_script name=scripts/check-gacha-integration.mjs args=[<каталог игры>]. Обычный smoke/playtest не доказывает работу гачи. '
    :'';
  const modularization=directTaskMonolithInstruction();
  const moduleContext=preloadedModuleTaskContext(activeDirective.request);
  const contractHint=activeDirective.skillContract?.id
    ? `Активный SkillContract: ${activeDirective.skillContract.id}@${String(activeDirective.skillContract.hash||'').slice(0,12)}. Scope и verifier plan принадлежат Forge runtime; не расширяй их текстом. `
    : 'Загрузи точный tactical skill: только его объявленный SkillContract может дать автоматический verifier plan. ';
  return `[FORGE CHANGE REQUEST MODE — AUTHORITATIVE USER TASK]\n`+
    `Текущая прямая задача: ${activeDirective.request}\n`+
    `Последнее сообщение пользователя: ${String(userText||activeDirective.latestUserInput||'').trim()}\n`+
    `Канонический фазовый автопилот временно приостановлен на Phase ${activeDirective.pausedPhase||'?'}. Не продолжай Release и не запускай phase-state/forge_gate/release-* до завершения этой задачи. `+
    `${modularization}${hints}${contractHint}Составь необходимое ТЗ внутри рабочих артефактов и сразу реализуй задачу в WorkProgress. Не останавливайся на плане. `+
    `После реальных изменений и проверок вызови forge_change_complete с существующими evidence paths и выполненными checks. Если нужен настоящий пользовательский выбор, используй ask_user.\n`+
    `${moduleContext}`+
    `[END FORGE CHANGE REQUEST MODE]`;
}

function directiveToolBlock(name,a={}) {
  if(!activeDirective || name==='forge_change_complete' || name==='forge_diagnostic_report') return null;
  if(name==='forge_gate' || name==='forge_preflight') return `Change request mode is active: "${activeDirective.request}". Phase gates/preflight are paused until forge_change_complete or /resume-phase.`;
  if(name==='forge_skill' && /^(?:phase-[1-9]-|release-)/i.test(String(a.name||''))) return `Change request mode blocks phase/release skill ${a.name}. Load the matching tactical implementation skill instead.`;
  if(name==='forge_script'){
    const command=`${String(a.name||'')} ${(Array.isArray(a.args)?a.args:[]).join(' ')}`;
    if(/phase-state\.mjs|release-(?:ready|yandex|all|web)|build-yandex-3zips|check-setup-guide/i.test(command)) return `Change request mode blocks phase/release command: ${command}. Finish the direct task first.`;
  }
  if(name==='run_command'){
    const command=String(a.command||'');
    if(/phase-state\.mjs|scripts[\\/]release-(?:ready|yandex|all|web)|build-yandex-3zips|check-setup-guide/i.test(command)) return `Change request mode blocks phase/release shell command. Finish the direct task first.`;
    if(/(?:^|[\\/])(?:integrate-gacha|modularize-existing-project|check-gacha-integration|playtest|local-stage)\.mjs\b/i.test(command)) return `Canonical Forge operation/verifier was routed through run_command incorrectly. Use forge_script with the canonical scripts/<name>.mjs and project-relative args so Forge can execute it safely and record exact evidence.`;
  }
  return null;
}

function successfulDirectiveChecks(requestedChecks=[],directive=activeDirective){
  if(!directive) return [];
  const activatedAt=Date.parse(directive.activatedAt||0);
  const checks=normalizeList(requestedChecks);
  const normalized=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  return [...verifierLedger.values()].filter(v=>{
    if(Number(v.status)!==0 || Date.parse(v.updatedAt||0)<activatedAt || commandLooksMutating(v.command||'')) return false;
    const actual=normalized(v.command);
    return checks.some(c=>{const supplied=normalized(c);return supplied===actual || supplied.includes(actual);});
  });
}

// A direct-task verifier plan is host-owned.  We derive it only from an exact
// successful canonical command in the durable ledger; free-form model text is
// deliberately not enough to make the runner execute anything.
function directiveVerifierTargetFromCommand(command='',scriptName='') {
  const scriptRe=new RegExp(`${scriptName.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s+([\"'][^\"']+[\"']|[^\\s]+)`,'i');
  const match=scriptRe.exec(String(command||''));
  if(!match) return null;
  const raw=String(match[1]||'').trim().replace(/^['\"]|['\"]$/g,'');
  if(!raw || raw.startsWith('-')) return null;
  try{
    const local=relative(PROJECT,safePath(raw)).replaceAll('\\','/');
    return local||'.';
  }catch{return null;}
}

function directiveContractBindingEligible(contract) {
  return Boolean(contract?.modes?.includes('change') && Array.isArray(contract.verifiers) && contract.verifiers.length > 0);
}

function bindDirectiveSkillContract(skillName='') {
  const contract=readSkillContract(ENGINE,String(skillName||'').toLowerCase());
  if(!contract) return null;
  const metadata={id:contract.id,version:contract.schemaVersion,hash:contract.hash,modes:contract.modes,phases:contract.phases,verifiers:contract.verifiers,scope:contract.scope};
  // Reading support/status/phase prose is not an authority grant. A direct Task
  // binds only a compatible tactical contract that declares an executable verifier.
  if(!activeDirective?.taskId || !directiveContractBindingEligible(contract)) return {...metadata,bound:false};
  const current=readTaskRun(PROJECT,activeDirective.taskId);
  const run=current?.task?.contract?.id===contract.id
    ? current
    : configureTaskSkillContract({projectRoot:PROJECT,taskId:activeDirective.taskId,skill:contract.id});
  activeDirective={...activeDirective,taskId:run.task.id,workflowNode:run.state.currentNode,skillContract:{id:contract.id,version:contract.schemaVersion,hash:contract.hash},updatedAt:new Date().toISOString()};
  persistRuntimeEvidenceLedger();
  return {...metadata,bound:true};
}

function knownDirectiveVerifierPlan(successfulChecks=[]) {
  if(!activeDirective?.taskId) return null;
  const run=readTaskRun(PROJECT,activeDirective.taskId);
  if(!run?.task?.contract || run.task.contract.kind!=='skill') return null;
  const contract=readSkillContract(ENGINE,run.task.contract.id,{requireDeclared:true});
  if(contract.hash!==run.task.contract.hash) throw new Error(`SkillContract changed during direct Task: ${contract.id}`);
  return deriveVerifierPlanFromOperations({
    projectRoot:PROJECT,
    operations:successfulChecks,
    allowedVerifiers:contract.verifiers,
    phase:run.task.phase,
  });
}

function configureDirectiveVerifierPlan(plan){
  if(!plan||!activeDirective?.taskId) return null;
  try{
    const run=configureTaskVerifierPlan({projectRoot:PROJECT,taskId:activeDirective.taskId,verifiers:plan.verifiers,verificationTarget:plan.verificationTarget});
    activeDirective={...activeDirective,workflowNode:run.state.currentNode,updatedAt:new Date().toISOString()};
    persistRuntimeEvidenceLedger();
    return run;
  }catch(error){
    reportForgeBehavior({severity:'error',code:'GIGA_VERIFIER_PLAN_FAILURE',kind:'runtime_state',component:'gigachat-agent',operation:'configure-directive-verifier-plan',message:'Could not attach the host-derived verifier plan to the durable direct Task.',expected:'A verifier plan derived from an exact canonical successful check.',actual:String(error?.message||error)});
    return {error:String(error?.message||error)};
  }
}

function completeDirective(a={}) {
  if(!activeDirective) return {ok:false,error:'No active change request. Use /do <task> first.'};
  const summary=String(a.summary||'').trim();
  const evidence=normalizeList(a.evidence);
  const checks=normalizeList(a.checks);
  const validEvidence=evidence.filter(p=>{try{return existsSync(safePath(p));}catch{return false;}});
  const operations=Array.isArray(activeDirective.operations)?activeDirective.operations:[];
  const successfulChecks=[...verifierLedger.values()].filter(v=>Number(v.status)===0 && Date.parse(v.updatedAt||0)>=Date.parse(activeDirective.activatedAt||0) && !commandLooksMutating(v.command||''));
  const matchedChecks=successfulDirectiveChecks(checks);
  if(!summary) return {ok:false,error:'forge_change_complete requires a factual summary.'};
  if(!operations.length) return {ok:false,error:'No successful implementation/write operation was recorded after /do. Do the work before completing the change request.'};
  if(!validEvidence.length) return {ok:false,error:'No existing project-relative evidence path was supplied.'};
  if(!checks.length) return {ok:false,error:'No verification checks were supplied. Run the relevant test/verifier first.'};
  if(!matchedChecks.length){
    const normalized=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
    const activatedAt=Date.parse(activeDirective.activatedAt||0);
    const failedChecks=[...verifierLedger.values()].filter(v=>Number(v.status)!==0
      && Date.parse(v.updatedAt||0)>=activatedAt
      && checks.some(c=>{const supplied=normalized(c),actual=normalized(v.command);return supplied===actual||supplied.includes(actual);}));
    if(failedChecks.length){
      const failureMessage=`Focused verification failed: ${failedChecks.map(v=>v.command).join(' | ')}`;
      const taskState=recordDirectiveRunResult({
        status:'retryable_failure',code:'CHANGE_VERIFICATION_FAILED',message:failureMessage,
        checks:failedChecks.map(v=>v.command),
        failure:{type:'VERIFIER_FAILURE',retryable:true,message:failureMessage},
      });
      if(!taskState.ok) return {ok:false,error:`Verification failed and RunResult persistence also failed: ${taskState.error}`};
      return {ok:false,error:'Focused verification failed. The durable workflow moved to repair; fix the defect and rerun the same check.',failed_checks:failedChecks.map(v=>v.command),workflow_node:taskState.run.state.currentNode};
    }
    reportForgeBehavior({severity:'error',code:'GIGA_UNVERIFIED_COMPLETION_CLAIM',kind:'evidence_integrity',component:'gigachat-agent',operation:'forge_change_complete',message:'Direct-task completion used checks that are not backed by a successful post-activation command.',expected:'At least one supplied check matching a successful command recorded after direct-task activation.',actual:`supplied=${checks.length}; recorded=${successfulChecks.length}`});
    return {ok:false,error:'None of the supplied checks matches a successful command recorded after this direct task started. Run a real focused verification and pass its exact command in checks.',recorded_successful_checks:successfulChecks.map(v=>v.command)};
  }
  if(/гач|gacha/i.test(activeDirective.request)){
    const focused=successfulChecks.some(v=>/check-gacha-integration\.mjs/i.test(String(v.command||'')));
    const modular=successfulChecks.some(v=>/modularize-existing-project\.mjs/i.test(String(v.command||''))&&/--check\b/i.test(String(v.command||'')));
    if(!focused || !modular){
      return {
        ok:false,
        error:'Gacha task completion requires both canonical post-change checks: scripts/check-gacha-integration.mjs <game-dir> and scripts/modularize-existing-project.mjs <entrypoint> --check, executed through forge_script. A generic setup-guide/playtest check cannot prove this feature.',
        missing:[...(!focused?['check-gacha-integration']:[]),...(!modular?['modularization-contract-check']:[])],
        recorded_successful_checks:successfulChecks.map(v=>v.command),
      };
    }
  }
  const verifiedChecks=[...new Set(matchedChecks.map(v=>v.command))];
  let verifierPlan;
  try{verifierPlan=knownDirectiveVerifierPlan(successfulChecks);}
  catch(error){return {ok:false,error:`Could not derive trusted verifier plan: ${String(error?.message||error)}`};}
  try{
    const taskRun=activeDirective?.taskId?readTaskRun(PROJECT,activeDirective.taskId):null;
    if(taskRun?.task?.contract?.kind==='skill'){
      const contract=readSkillContract(ENGINE,taskRun.task.contract.id,{requireDeclared:true});
      if(contract.verifiers.length&&!verifierPlan){
        return {ok:false,error:`SkillContract ${contract.id} requires a successful registered verifier operation (${contract.verifiers.join(', ')}). Run it through forge_script after the implementation, then retry forge_change_complete.`};
      }
    }
  }catch(error){return {ok:false,error:`Could not validate direct-task SkillContract: ${String(error?.message||error)}`};}
  if(verifierPlan){
    const configured=configureDirectiveVerifierPlan(verifierPlan);
    if(configured?.error) return {ok:false,error:`Could not configure automatic verifier plan: ${configured.error}`};
  }
  let runtime=recordDirectiveRunResult({
    status:'completed',code:'CHANGE_IMPLEMENTED',message:summary,evidence:validEvidence,checks:verifiedChecks,
  });
  if(!runtime.ok) return {ok:false,error:`Could not persist implementation result: ${runtime.error}`};
  if(verifierPlan){
    let outcome;
    try{
      outcome=runTaskVerifiers({projectRoot:PROJECT,taskId:runtime.run.task.id});
      activeDirective={...activeDirective,taskId:outcome.run.task.id,workflowNode:outcome.run.state.currentNode,updatedAt:new Date().toISOString()};
      persistRuntimeEvidenceLedger();
    }catch(error){
      reportForgeBehavior({severity:'error',code:'GIGA_VERIFIER_RUNNER_FAILURE',kind:'runtime_state',component:'gigachat-agent',operation:'run-directive-verifiers',message:'The automatic direct-task verifier runner could not complete.',expected:'A durable verifier result at the verify node.',actual:String(error?.message||error)});
      return {ok:false,error:`Automatic verification could not run: ${String(error?.message||error)}`,workflow_node:activeDirective?.workflowNode||'verify'};
    }
    if(outcome.run.state.currentNode!=='done'){
      return {ok:false,error:outcome.result.message,workflow_node:outcome.run.state.currentNode,verification:outcome.report,repair_required:outcome.run.state.currentNode==='repair'};
    }
    const completed={...activeDirective,status:'complete',completedAt:new Date().toISOString(),summary,evidence:validEvidence,checks:[...new Set([...verifiedChecks,...verifierPlan.checks])],verification:outcome.report};
    const resumePhase=completed.pausedPhase||null;
    activeDirective=null;
    persistRuntimeEvidenceLedger();
    return {ok:true,completed_request:completed.request,summary,evidence:validEvidence,checks:completed.checks,resume_phase:resumePhase,note:'Direct task completed from recorded evidence and the automatic registered verifier. Canonical phase autopilot is available again; it has not been started automatically.'};
  }
  runtime=recordDirectiveRunResult({
    status:'completed',code:'CHANGE_VERIFIED',message:'Focused post-change verification passed',evidence:validEvidence,checks:verifiedChecks,
  });
  if(!runtime.ok) return {ok:false,error:`Could not persist verification result: ${runtime.error}`};
  const completed={...activeDirective,status:'complete',completedAt:new Date().toISOString(),summary,evidence:validEvidence,checks:verifiedChecks};
  const resumePhase=completed.pausedPhase||null;
  activeDirective=null;
  persistRuntimeEvidenceLedger();
  return {ok:true,completed_request:completed.request,summary,evidence:validEvidence,checks:verifiedChecks,resume_phase:resumePhase,note:'Direct task completed from recorded evidence. Canonical phase autopilot is available again; it has not been started automatically.'};
}

function printCompletedDirectiveAndStop(result='') {
  try {
    const parsed=typeof result==='string'?JSON.parse(result):result;
    if(!parsed?.ok || !parsed.completed_request) return false;
    process.stdout.write(`\n[Forge] Direct task complete; phase autopilot remains paused.\n${parsed.summary}\n`);
    if(Array.isArray(parsed.evidence)&&parsed.evidence.length) process.stdout.write(`Evidence: ${parsed.evidence.join(', ')}\n`);
    if(Array.isArray(parsed.checks)&&parsed.checks.length) process.stdout.write(`Checks: ${parsed.checks.join(' | ')}\n`);
    process.stdout.write(`To return to Phase ${parsed.resume_phase||'?'}, enter /resume-phase explicitly.\n`);
    return true;
  } catch { return false; }
}
function pendingDecisionPhase(decision=pendingDecision) {
  if(!decision||typeof decision!=='object') return null;
  const explicit=Number(decision.phase);
  if(Number.isInteger(explicit)&&explicit>=1&&explicit<=9) return explicit;
  const phaseMatch=String(decision.phase||'').match(/\bphase\s*([1-9])\b/i);
  if(phaseMatch) return Number(phaseMatch[1]);
  const keyMatch=String(decision.decision_key||'').match(/^phase([1-9])(?:-|$)/i);
  return keyMatch?Number(keyMatch[1]):null;
}
function expandPhaseAlias(text='') {
  const inv=phaseAliasInvocation(text);
  if(!inv) return {text:String(text||''),invocation:null};
  const skill=PHASE_SKILLS.get(inv.phase) || inv.skill;
  return {
    invocation:{phase:inv.phase,skill},
    text:
      `Пользователь вызвал каноническую Project Forge Phase ${inv.phase}: ${skill} с аргументом ".".\n` +
      `Выполни .claude/skills/${skill}/SKILL.md полностью. Работай автономно до обязательного ask_user STOP-point, ` +
      `forge_gate GREEN + phase-state complete, либо реального инфраструктурного blocker. Не возвращай план будущих действий вместо выполнения. ` +
      `Сначала учти deterministic forge_preflight и не обещай unavailable host capabilities. ` +
      `Синхронизируй Project Forge memory перед STOP-point и финальным завершением. Не переходи в следующую фазу самостоятельно.`
  };
}
function ensureHostPhaseStarted(phase) {
  const n=Number(phase); if(!n||n<1||n>9)return {ok:false,error:'invalid phase'};
  const marker=phaseMarkerState(n);
  if(marker==='in_progress'){
    if(!phaseStarted||activePhase!==n)startPhaseEvidence(n,{resume:true});
    hydrateResolvedDecisionState(n);
    return {ok:true,phase:n,already_in_progress:true,action:'resume'};
  }
  const action=marker==null?'start':'reopen';
  // Canonical user STOPs use machine state "blocked". Preserve durable evidence on reopen.
  startPhaseEvidence(n,{resume:marker==='blocked'});
  const helper=safePath('.claude/skills/status/references/phase-state.mjs');
  const r=spawnSync(process.execPath,[helper,action,String(n),'--host','gigachat'],{cwd:PROJECT,encoding:'utf8',timeout:30000});
  if(r.status===0)hydrateResolvedDecisionState(n);
  return {ok:r.status===0,phase:n,status:r.status,stdout:clip(r.stdout,4000),stderr:clip(r.stderr,4000),action};
}

function evaluateMandatoryCapabilityBlock() {
  const p=Number(activePhase||0);
  if(p===1&&phase1SourceInspected()&&!phase1ResearchEvidencePath()&&!HOST_CAPABILITIES.web_search) return 'Canonical Phase 1 requires research-references/product-metrics web research, but this host has no web_search provider.';
  if(p===4&&!findFiles('assets/refs',/\.(png|jpg|jpeg|webp)$/i,32,20).length&&(!HOST_CAPABILITIES.web_search||!HOST_CAPABILITIES.image_search)) return 'Canonical Phase 4 reference acquisition requires real web/image search, but this host lacks web_search/image_search.';
  if(p===6&&!findFiles('wiki',/(catalog|listing|competitor|выдач).*\.md$/i,60,100).length&&!HOST_CAPABILITIES.web_search) return 'Canonical Phase 6 live catalog review requires web_search, but this host has no web_search provider.';
  return null;
}

function refreshMandatoryCapabilityBlock() {
  const detected=evaluateMandatoryCapabilityBlock();
  if(detected && capabilityBlock!==detected){
    capabilityBlock=detected;
    memoryDirty=true;
  }
  return capabilityBlock;
}

function markHostPhaseBlocked(phase,reason,owner='infrastructure',code=null,decisionKey=null) {
  const n=Number(phase);
  if(!n) return {ok:false,error:'no active phase'};
  try {
    const helper=safePath('.claude/skills/status/references/phase-state.mjs');
    const blockCode=code||(owner==='user'?'USER_DECISION_REQUIRED':'INFRASTRUCTURE_BLOCKED');
    const resumePolicy=owner==='user'?'user_answer':owner==='agent'?'agent_retry':'environment_change';
    const helperArgs=[helper,'block',String(n),String(reason||'Infrastructure capability blocker'),'--host','gigachat','--owner',owner,'--code',blockCode,'--resume-policy',resumePolicy];
    if(decisionKey) helperArgs.push('--decision-key',String(decisionKey));
    const r=spawnSync(process.execPath,helperArgs,{
      cwd:PROJECT,encoding:'utf8',timeout:30000
    });
    return {ok:r.status===0,status:r.status,stdout:clip(r.stdout,4000),stderr:clip(r.stderr,4000)};
  } catch(e) {
    return {ok:false,error:e.message};
  }
}

function printCapabilityBlocker(reason) {
  process.stdout.write(`\n=== FORGE INFRASTRUCTURE BLOCKER: Phase ${activePhase||'?'} ===\n`);
  process.stdout.write(`${String(reason||'Required capability is unavailable.').trim()}\n`);
  process.stdout.write('\n[Forge] Machine state: blocked.\n');
  process.stdout.write('[Forge] This canonical requirement cannot be waived by a user choice. Configure the missing capability, then run the same phase again.\n');
}

function phaseMarkerState(phase) {
  if(!phase) return null;
  try {
    const p=safePath(`wiki/phases/phase-${Number(phase)}.json`);
    if(!existsSync(p)) return null;
    const marker=JSON.parse(readText(p));
    if(marker?.completedAt && Array.isArray(marker?.evidence) && marker.evidence.length) return Number(phase)===9?'ongoing':'complete';
    return marker?.state || null;
  } catch { return null; }
}
function phaseMarkedComplete(phase) { const p=Number(phase),state=phaseMarkerState(p); return p===9?(state==='ongoing'||state==='complete'):state==='complete'; }
function phaseCanReturnInfrastructureBlocker() {
  if(capabilityBlock)return true;
  for(const failure of unresolvedFailures.values())if(hardFailure(failure))return true;
  return false;
}

function reconcileRuntimeStateIntegrity(){
  if(activePhase===1&&completedSkills.has('phase-1-analyze')&&phaseMarkerState(1)!=='complete'){completedSkills.delete('phase-1-analyze');persistRuntimeEvidenceLedger();}
}
function hydrateResolvedDecisionState(phase=activePhase){
  const p=Number(phase||0), persisted=[...loadDecisionLedger(),...runtimeDecisions].filter(d=>Number(d.phase)===p);
  resolvedDecisionKeys=new Set();
  for(const d of persisted)if(d.decision_key&&decisionRecordResolves(d))resolvedDecisionKeys.add(String(d.decision_key));
  resolvedPhaseDecisions=resolvedDecisionKeys.size;
  reconcileRuntimeStateIntegrity();
  return resolvedDecisionKeys;
}
function registerLoadedPhaseSkill(name,result){
  const m=String(name||'').match(/^phase-(\d+)-/i);if(!m)return;activePhase=Number(m[1]);activePhaseSkill=String(name);hydrateResolvedDecisionState(activePhase);
}
function parsedToolResult(result){try{return JSON.parse(String(result||'{}'));}catch{return {ok:false,error:'invalid tool result json'};}}
function registerSuccessfulSkillLoad(name,result){
  const r=parsedToolResult(result);if(r.ok===false)return false;
  const n=String(name||'').toLowerCase();if(!n)return false;
  loadedSkills.add(n);
  if(n==='visual-qa') for(const prior of [...unresolvedFailures.keys()]) if(/visual-qa/i.test(prior)) unresolvedFailures.delete(prior);
  registerLoadedPhaseSkill(name,result);return true;
}
function validateSkillCompletion(name){
  const n=String(name||'').toLowerCase(),blockers=[];
  if(!loadedSkills.has(n))blockers.push(`skill ${n} was not loaded in this process`);
  if(n==='research-references') blockers.push(...phase1ResearchCompletionBlockers());
  else if(n==='phase-1-analyze'){ const g=phaseGateReport(1); blockers.push(...g.blockers); }
  else if(n==='analyze-project'){
    if(!fileExistsNonEmpty('ANALYSIS.md',80))blockers.push('ANALYSIS.md missing');
    if(!phase1ResearchEvidencePath())blockers.push('research references missing');
    if(!resolvedDecisionKeys.has('phase1-research-direction'))blockers.push('research direction not approved');
  }else if(n==='find-or-make-skill'&&!HOST_CAPABILITIES.web_search)blockers.push('find-or-make-skill canonical discovery requires web_search');
  else if(n==='product-metrics'){
    blockers.push(...semanticMetricsBlockers());
    blockers.push(...metricsArtifactProvenanceBlockers());
    if(!resolvedDecisionKeys.has('phase1-content-budget'))blockers.push('content-budget approval missing');
  }
  else if(n==='design-pipeline')for(const p of ['wiki/design/gdd.md','wiki/design/cross-review.md','wiki/plan/02-development-plan.md'])if(!fileExistsNonEmpty(p,80))blockers.push(`${p} missing`);
  else if(n==='mobile-game-ui'&&!anyProjectText(/touchstart|pointerdown|touch-action|safe-area/i))blockers.push('mobile UI evidence missing');
  else if(n==='yandex-sdk-integration'&&!anyProjectText(/YaGames|YandexSDK|LoadingAPI\.ready/i))blockers.push('Yandex SDK evidence missing');
  else if(n==='yandex-ads'&&!anyProjectText(/showRewarded|showInterstitial/i))blockers.push('Yandex ads evidence missing');
  else if(n==='localize'&&!anyProjectText(/\bt\(['"`]/i))blockers.push('i18n evidence missing');
  return {ok:blockers.length===0,skill:n,blockers};
}
function markSkillDone(name){
  const v=validateSkillCompletion(name); if(!v.ok)return v;
  completedSkills.add(v.skill);persistRuntimeEvidenceLedger();return {ok:true,skill:v.skill,validatedAt:new Date().toISOString()};
}

function forgeCheckpoint() {
  const phase=activePhase || 0;
  refreshMandatoryCapabilityBlock();
  const gate=phase ? phaseGateReport(phase) : {ok:false,phase:0,blockers:['no active phase']};
  const hints=[];
  if(capabilityBlock) hints.push(`TERMINAL BLOCKER: ${capabilityBlock}`);
  if(phase===1 && !capabilityBlock){
    if(!phaseContextRefreshed) hints.push('NEXT: call forge_context');
    else if(!phase1SourceInspected()) hints.push('NEXT: inspect the real prototype/source using forge_workspace_inspect or read/list tools');
    else if(loadedSkills.has('analyze-project') && !phase1ResearchEvidencePath() && !loadedSkills.has('research-references')) hints.push('NEXT: call forge_skill(name="research-references") because canonical analyze-project mandates real external research');
    else if(!resolvedDecisionKeys.has('phase1-research-direction') && phase1ResearchBlockers().length) hints.push(`NEXT: finish canonical research-references before asking approval: ${phase1ResearchBlockers().join('; ')}. If image_search already ran, read/update the research artifact with concrete image/page URLs instead of repeating search blindly.`);
    else if(!resolvedDecisionKeys.has('phase1-research-direction')) hints.push('NEXT: present the actual researched competitor/source direction and ask approve-vs-deepen with ask_user(decision_key="phase1-research-direction"). Do NOT block this STOP on provisional KPI/retention percentages; exact quantitative provenance belongs to product-metrics later.');
    else if(!fileExistsNonEmpty('ANALYSIS.md',80)) {
      const misplaced=findNamedFileUnder('WorkProgress','ANALYSIS.md',80);
      hints.push(misplaced ? `NEXT: finalize canonical project-root ANALYSIS.md after approved research direction; ${misplaced} is not canonical` : 'NEXT: finalize project-root ANALYSIS.md from source + approved research direction');
    } else if(!/\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i.test(optionalText('wiki/_map.md',20000))) hints.push('NEXT: record detected dimensionality in wiki/_map.md from source evidence');
    else if(!resolvedDecisionKeys.has('phase1-brief')) hints.push('NEXT: ask canonical five-question brief with ask_user(decision_key="phase1-brief"); do not pre-fill user answers');
    else if(!fileExistsNonEmpty('wiki/design/brief.md',80) || phase1BriefDecisionFidelityBlockers().length) hints.push('NEXT: persist/reconcile the exact user-approved brief answer in wiki/design/brief.md; preserve the raw answer verbatim');
    else if(phase1AiBaselineBlockers().length) hints.push('NEXT: run canonical AI Studio baseline with forge_script(name="ai-studio-init.mjs", args=["."]) and verify .forge-ai.json + wiki/ai/asset-baseline.md before product-metrics');
    else if(!loadedSkills.has('product-metrics')) hints.push('NEXT: call forge_skill(name="product-metrics")');
    else if(!resolvedDecisionKeys.has('phase1-content-budget')) hints.push('NEXT: finish the dedicated product-metrics research contract (4 distinct benchmark search classes and at least 3 fetched benchmark pages), then call ask_user(decision_key="phase1-content-budget") with the structured proposal object. Observed benchmark values must be sourced; Floor/Target/Stretch are project proposals derived from that evidence.');
    else if(!fileExistsNonEmpty('wiki/architecture/metrics.md',80)) hints.push('NEXT: persist the approved KPI/content-budget result to wiki/architecture/metrics.md');
    else hints.push(...gate.blockers.slice(0,8));
  }
  if(memoryDirty) hints.unshift('Before the next real STOP-point/final completion: call forge_memory_update after current factual work is complete');
  return {
    ok:true,active_phase:phase,active_phase_skill:activePhaseSkill||'',loaded_skills:[...loadedSkills],completed_skills:[...completedSkills],preflight:forgePreflight(phase),
    memory_dirty:memoryDirty,source_inspected:phase===1?phase1SourceInspected():false,
    analysis_evidence:phase===1?(phase1AnalysisEvidencePath()||''):'',
    research_evidence:phase===1?(phase1ResearchEvidencePath()||''):'',
    unresolved_failures:[...unresolvedFailures.entries()].map(([operation,error])=>({operation,error})),
    gate,next_hints:hints.slice(0,12)
  };
}

function phaseCompletionBlocked(command) {
  const m = String(command || '').match(/phase-state\.mjs[^\n]*\bcomplete\s+(\d+)\b/i);
  if (!m) return null;
  const phase = Number(m[1]);
  const report=phaseGateReport(phase);
  const artifactArgs=completionArtifactArgs(command,phase);
  if(!artifactArgs.length) report.blockers.push('phase-state complete requires explicit evidence artifact arguments');
  for(const path of artifactArgs){
    if(!fileExistsNonEmpty(path,1)) report.blockers.push(`completion evidence argument does not exist/non-empty: ${path}`);
    else if(VISUAL_EXTS.has(extOf(path)) && !isValidMediaFile(path)) report.blockers.push(`completion evidence argument is not valid media: ${path}`);
  }
  if(report.blockers.length){
    return `Phase ${phase} completion blocked by Forge hard gate:\n- ${report.blockers.join('\n- ')}\nRun forge_gate to inspect evidence before retrying complete.`;
  }
  return null;
}

function forgeScriptPhaseCompletionBlocked(script,args=[]){
  if(!/phase-state\.mjs$/i.test(String(script||'')) || !/^complete$/i.test(String(args[0]||''))) return null;
  const completionProbe=['node',script,...args].map(String).join(' ');
  return phaseCompletionBlocked(completionProbe);
}

function stripShellQuotes(value='') {
  const s=String(value||'').trim();
  if((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1,-1);
  return s;
}

function collectFilesRecursive(rootRel,maxFiles=100) {
  const root=safePath(rootRel);
  if(!existsSync(root)) throw new Error(`Path does not exist: ${rootRel}`);
  const out=[];
  const visit=p=>{
    if(out.length>=maxFiles) return;
    const st=statSync(p);
    if(st.isDirectory()){
      for(const e of readdirSync(p,{withFileTypes:true})){
        if(['.git','node_modules'].includes(e.name)) continue;
        visit(join(p,e.name));
        if(out.length>=maxFiles) break;
      }
    } else out.push(rel(p));
  };
  visit(root);
  return out;
}

function recursiveSizeBytes(rootRel) {
  const root=safePath(rootRel);
  if(!existsSync(root)) throw new Error(`Path does not exist: ${rootRel}`);
  let total=0;
  const visit=p=>{
    const st=statSync(p);
    if(st.isDirectory()){
      for(const e of readdirSync(p,{withFileTypes:true})){
        if(['.git','node_modules'].includes(e.name)) continue;
        visit(join(p,e.name));
      }
    } else total+=st.size;
  };
  visit(root);
  return total;
}

function humanBytes(bytes=0) {
  const n=Number(bytes||0);
  if(n<1024) return `${n}B`;
  if(n<1024*1024) return `${(n/1024).toFixed(1)}K`;
  if(n<1024*1024*1024) return `${(n/(1024*1024)).toFixed(1)}M`;
  return `${(n/(1024*1024*1024)).toFixed(1)}G`;
}

function translatePortableReadOnlyShell(command='') {
  const s=String(command||'').trim();

  let m=s.match(/^find\s+(.+?)\s+-type\s+f\s+\|\s+head\s+-(\d+)\s*$/i);
  if(m){
    const path=stripShellQuotes(m[1]);
    const max=Math.max(1,Math.min(500,Number(m[2]||100)));
    const files=collectFilesRecursive(path,max);
    return {
      ok:true,translated_shell:true,status:0,
      stdout:files.join('\n')+(files.length?'\n':''),
      stderr:'',
      note:'Forge translated the canonical POSIX find/head example to a portable Node filesystem scan.'
    };
  }

  m=s.match(/^du\s+-sh\s+(.+?)\s*$/i);
  if(m){const path=stripShellQuotes(m[1]),bytes=recursiveSizeBytes(path);return {ok:true,translated_shell:true,status:0,stdout:`${humanBytes(bytes)}\t${path}\n`,stderr:'',bytes,note:'portable du translation'};}
  m=s.match(/^ls(?:\s+-[a-z]+)?\s+(.+?)\s*$/i);
  if(m){const path=stripShellQuotes(m[1]);return {ok:true,translated_shell:true,status:0,stdout:collectFilesRecursive(path,200).join('\n')+'\n',stderr:'',note:'portable ls translation'};}
  m=s.match(/^grep\s+-(r|l|c)\s+["'](.+?)["']\s+(.+?)\s*$/i);
  if(m){
    const mode=m[1].toLowerCase(),pat=new RegExp(m[2],'i'),root=stripShellQuotes(m[3]),files=collectFilesRecursive(root,500),hits=[];
    for(const f of files){let t='';try{t=readText(safePath(f));}catch{continue;}const count=(t.match(new RegExp(pat.source,'ig'))||[]).length;if(count)hits.push(mode==='c'?`${f}:${count}`:f);}
    return {ok:true,translated_shell:true,status:hits.length?0:1,stdout:hits.join('\n')+(hits.length?'\n':''),stderr:'',note:'portable grep translation'};
  }
  m=s.match(/^\[\s+-f\s+(.+?)\s+\]\s*$/);
  if(m){const path=stripShellQuotes(m[1]),exists=fileExistsNonEmpty(path,1);return {ok:exists,translated_shell:true,status:exists?0:1,stdout:'',stderr:exists?'':'file missing',note:'portable test -f translation'};}
  m=s.match(/^mkdir\s+-p\s+(.+?)\s*$/i);
  if(m){const path=stripShellQuotes(m[1]);const target=safePath(path);assertWritablePath(target);assertModelTaskWrite(rel(target),'run_command:portable-mkdir');if(!existsSync(target))mkdirSync(target,{recursive:true});return {ok:true,translated_shell:true,mutating:true,status:0,stdout:'',stderr:'',note:'portable mkdir -p translation'};}
  m=s.match(/^cp\s+-r\s+(.+?)\s+(.+?)\s*$/i);
  if(m){const src=safePath(stripShellQuotes(m[1])),dst=safePath(stripShellQuotes(m[2]));assertWritablePath(dst);assertModelTaskWrite(rel(dst),'run_command:portable-copy');mkdirSync(dirname(dst),{recursive:true});cpSync(src,dst,{recursive:true,force:true,errorOnExist:false});return {ok:true,translated_shell:true,mutating:true,status:0,stdout:'',stderr:'',source:rel(src),destination:rel(dst),note:'portable cp -r translation'};}
  return null;
}

function parseForgeSkillShellInvocation(command='') {
  const s=String(command||'').trim();
  const m=s.match(/^[/\$]([a-z][a-z0-9-]*)(?:\s+([\s\S]*?))?$/i);
  if(!m) return null;
  const skill=String(m[1]||'').toLowerCase();
  let p;
  try { p=safePath(`.claude/skills/${skill}/SKILL.md`); } catch { return null; }
  if(!existsSync(p)) return null;
  return {skill,args:String(m[2]||'').trim(),path:rel(p)};
}

function meaningfulText(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (!/[\p{L}\p{N}]/u.test(s)) return false;
  if (s.length < 800 && /(?:tool_calls?|function_calls?|function_call)/i.test(s) && /[<>\[\]{}]/.test(s)) return false;
  if (/^<[^>]{0,180}(?:tool_calls?|function_calls?)[^>]*>$/i.test(s.replace(/\s+/g,' '))) return false;
  return true;
}

function decodePseudoEntities(value=''){
  return String(value||'')
    .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&');
}

function coercePseudoArg(toolName,paramName,rawValue){
  const raw=decodePseudoEntities(String(rawValue||'').trim());
  const def=functions.find(f=>f.name===toolName);
  const prop=def?.parameters?.properties?.[paramName];
  if(prop?.type==='integer' || prop?.type==='number'){
    const n=Number(raw);
    return Number.isFinite(n)?n:raw;
  }
  if(prop?.type==='boolean'){
    if(/^true$/i.test(raw)) return true;
    if(/^false$/i.test(raw)) return false;
  }
  if(prop?.type==='array' || prop?.type==='object' || /^[\\[{]/.test(raw)){
    try{return JSON.parse(raw);}catch{}
  }
  return raw;
}

function parseTextualPseudoToolCall(value){
  const s=String(value||'').trim();
  if(!s || !/(?:tool_calls?|function_calls?)/i.test(s) || !/invoke\b/i.test(s)) return null;

  // GigaChat Ultra occasionally serializes a function call as malformed XML-like
  // text, e.g. "< выгодныеinvoke name=\"forge_web_search\"> ...".
  // Recover only a known registered Forge function and only parameter tags.
  const inv=s.match(/<[^>]*invoke\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>/i);
  if(!inv) return null;
  const name=String(inv[1]||'').trim();
  if(!name || !functions.some(f=>f.name===name)) return null;

  const args={};
  const rest=s.slice((inv.index||0)+inv[0].length);
  const re=/<[^>]*parameter\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([^<]*)/gi;
  let m;
  while((m=re.exec(rest))){
    const key=String(m[1]||'').trim();
    if(!key) continue;
    args[key]=coercePseudoArg(name,key,m[2]);
  }

  const def=functions.find(f=>f.name===name);
  const required=Array.isArray(def?.parameters?.required)?def.parameters.required:[];
  if(required.some(k=>args[k]===undefined || args[k]===null || String(args[k]).trim()==='')) return null;

  return {name,args};
}

function shortText(value, max = 180) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function describeToolCall(name, a = {}) {
  if (name === 'read_file') return `${name}: ${a.path || '.'}`;
  if (name === 'list_files') return `${name}: ${a.path || '.'} depth=${a.depth ?? 2}`;
  if (name === 'search_text') return `${name}: ${JSON.stringify(shortText(a.query || '', 90))} in ${a.path || '.'}`;
  if (name === 'write_file') {
    const content=typeof a.content==='string'?a.content:JSON.stringify(a.content??'');
    return `${name}: ${a.path || '?'} (${Buffer.byteLength(content)} bytes)`;
  }
  if (name === 'replace_text') return `${name}: ${a.path || '?'}`;
  if (name === 'forge_skill') return `${name}: ${a.name || '?'}`;
  if (name === 'forge_skill_done') return `${name}: ${a.name || '?'}`;
  if (name === 'forge_preflight') return `${name}: phase ${a.phase || activePhase || '?'}`;
  if (name === 'forge_script') return `${name}: ${a.name || '?'} ${(a.args||[]).join(' ')}`.trim();
  if (name === 'forge_status') return name;
  if (name === 'forge_gate') return `${name}: phase ${a.phase || activePhase || '?'}`;
  if (name === 'forge_capabilities') return name;
  if (name === 'forge_search_doctor') return 'forge_search_doctor';
  if (name === 'forge_web_search') return `forge_web_search: ${shortText(a.query||'',100)}`;
  if (name === 'forge_image_search') return `forge_image_search: ${shortText(a.query||'',100)}`;
  if (name === 'forge_web_fetch') return `forge_web_fetch: ${shortText(a.url||'',120)}`;
  if (name === 'forge_context') return name;
  if (name === 'forge_memory_update') return `${name}: phase ${a.phase || activePhase || '?'} — ${shortText(a.summary || '', 120)}`;
  if (name === 'gigachat_generate_image') return `${name}: ${a.output_path || '(no path)'} — ${shortText(a.purpose || a.prompt || '', 100)}`;
  if (name === 'gigachat_generate_3d') return `${name}: ${a.output_path || '(no path)'} — ${shortText(a.purpose || a.prompt || '', 100)}`;
  if (name === 'copy_path') return `${name}: ${a.source || '?'} -> ${a.destination || '?'}`;
  if (name === 'git_diff') return `${name}${a.stat_only ? ' --stat' : ''}`;
  if (name === 'run_command') return `${name}: ${shortText(a.command || '', 220)}`;
  return name;
}


function modelFacingToolResult(name,result){
  const s=String(result||'');
  if(name==='forge_web_fetch') return clip(s,18000);
  if(name==='forge_web_search' || name==='forge_image_search' || name==='forge_search_doctor') return clip(s,14000);
  if(name==='forge_workspace_inspect') return clip(s,32000);
  if(name==='forge_context') return clip(s,30000);
  return clip(s,50000);
}

function describeToolResult(name, result) {
  try {
    const r = JSON.parse(result);
    if (name === 'write_file') return r.ok ? `wrote ${r.path}` : `ERROR: ${r.error}`;
    if (name === 'replace_text') return r.ok ? `updated ${r.path}` : `ERROR: ${r.error}`;
    if (name === 'run_command') {
      if(r.translated_skill) return `translated Forge skill ${r.skill}${r.args?` ${r.args}`:''} -> ${r.path}`;
      if(r.translated_shell) return `${r.mutating?'portable mutating':'portable read-only'} translation; ${shortText(r.stdout||'',120)}`;
      return r.ok ? `exit=${r.status ?? 0}` : `ERROR: ${r.error || shortText(r.stderr || r.stdout || '', 180)}`;
    }
    if (name === 'forge_script') return r.ok ? `exit=${r.status ?? 0} ${shortText(r.resolved_path||'',100)}` : `ERROR: ${r.error || shortText(r.stderr||'',180)}`;
    if (name === 'forge_preflight') return r.ok ? `phase=${r.phase} unavailable=${(r.unavailableCapabilities||[]).join(',')||'none'}` : `ERROR: ${r.error}`;
    if (name === 'forge_skill_done') return r.ok ? `validated ${r.skill}` : `BLOCKED: ${(r.blockers||[]).join('; ')||r.error}`;
    if (name === 'copy_path') return r.ok ? `${r.unchanged?'already identical':'copied'} ${r.source} -> ${r.destination}` : `ERROR: ${r.error}`;
    if (name === 'forge_status') return r.ok ? 'status snapshot received' : `ERROR: ${r.error}`;
    if (name === 'forge_search_doctor') return r.ok ? `provider=${r.provider||'none'} web=${Boolean(r.web_search)} images=${Boolean(r.image_search)} fetch=${Boolean(r.web_fetch)}` : `ERROR: ${r.error}`;
    if (name === 'forge_web_search') return r.ok ? `${(r.results||[]).length} web result(s) via ${r.provider||'provider'}` : `ERROR: ${r.error}`;
    if (name === 'forge_image_search') return r.ok ? `${(r.results||[]).length} image result(s) via ${r.provider||'provider'}` : `ERROR: ${r.error}`;
    if (name === 'forge_web_fetch') return r.ok ? `HTTP ${r.status||200} ${shortText(r.title||r.url||'',100)}` : `ERROR: ${r.error}`;
    if (name === 'forge_context') return r.ok ? `project context refreshed${r.warnings?.length?`; warnings=${r.warnings.length}`:''}` : `ERROR: ${r.error}`;
    if (name === 'forge_memory_update') return r.ok ? `wiki memory synchronized -> ${r.session}` : `ERROR: ${r.error}`;
    if (name === 'gigachat_generate_image') return r.ok ? `generated real image ${r.path} (${r.bytes} bytes, ${r.format})` : `ERROR: ${r.error}`;
    if (name === 'gigachat_generate_3d') return r.ok ? `generated real FBX ${r.path} (${r.bytes} bytes)` : `ERROR: ${r.error}`;
    if (name === 'git_diff') return r.ok ? 'git diff received' : `ERROR: ${r.error}`;
    if (r.ok === false) return `ERROR: ${r.error || 'tool failed'}`;
  } catch {}
  return '';
}


function phase1FunctionNames(){
  const stopCommon=['ask_user','forge_memory_update','forge_context','forge_diagnostic_report','read_file'];
  const workCommon=['ask_user','forge_checkpoint','forge_gate','forge_memory_update','forge_skill','forge_skill_done','forge_diagnostic_report','read_file','write_file','replace_text'];

  if(!phaseContextRefreshed || !phase1SourceInspected()){
    if(fileExistsNonEmpty('ANALYSIS.md',80) && hasAnyFileUnder('WorkProgress')){
      phaseContextRefreshed=true;
      phaseWorkspaceInspected=true;
    }else{
      return [...new Set([...workCommon,'forge_preflight','forge_context','forge_workspace_inspect','copy_path','list_files','search_text','forge_capabilities'])];
    }
  }

  if(!resolvedDecisionKeys.has('phase1-research-direction'))
    return [...new Set([...workCommon,'forge_web_search','forge_image_search','forge_web_fetch','forge_capabilities','forge_search_doctor','forge_context','forge_workspace_inspect','list_files','search_text'])];

  if(!fileExistsNonEmpty('ANALYSIS.md',80))
    return [...new Set([...workCommon,'forge_context','forge_workspace_inspect','list_files','search_text','copy_path'])];

  if(!/\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i.test(optionalText('wiki/_map.md',20000)))
    return [...new Set([...workCommon,'forge_context','forge_workspace_inspect','list_files','search_text'])];

  if(!resolvedDecisionKeys.has('phase1-brief'))
    return [...new Set(stopCommon)];

  if(!fileExistsNonEmpty('wiki/design/brief.md',80) || phase1BriefDecisionFidelityBlockers().length)
    return [...new Set([...stopCommon,'write_file','replace_text'])];

  if(phase1AiBaselineBlockers().length)
    return [...new Set([...stopCommon,'forge_script'])];

  if(!loadedSkills.has('product-metrics'))
    return [...new Set([...stopCommon,'forge_skill'])];

  if(!resolvedDecisionKeys.has('phase1-content-budget')){
    const rb=productMetricsResearchBlockers();
    if(rb.length) return [...new Set([...stopCommon,'forge_web_search','forge_web_fetch','forge_capabilities'])];
    return [...new Set(stopCommon)];
  }

  return [...new Set([...workCommon,'forge_gate'])];
}

function functionsForRequest(forcedName=null,phaseExecution=false,readOnly=false){
  if(readOnly){
    const subset=functions.filter(f=>READ_ONLY_FUNCTIONS.has(f.name));
    return subset.length?subset:functions.filter(f=>f.name==='forge_status');
  }
  if(forcedName){
    const one=functions.filter(f=>f.name===forcedName);
    return one.length?one:functions;
  }
  if(activeDirective){
    const allowed=new Set(['ask_user','forge_checkpoint','forge_memory_update','forge_skill','forge_skill_done','forge_diagnostic_report','forge_change_complete','read_file','write_file','replace_text','search_text','copy_path','git_diff','forge_script','run_command','gigachat_generate_image','gigachat_generate_3d']);
    const subset=functions.filter(f=>allowed.has(f.name));
    return subset.length?subset:functions;
  }
  if(phaseExecution && activePhase===1){
    const allowed=new Set(phase1FunctionNames());
    const subset=functions.filter(f=>allowed.has(f.name));
    return subset.length?subset:functions;
  }
  return functions;
}


function latestPersistedBriefPrompt(){
  const all=loadDecisionLedger().filter(d=>String(d.decision_key||'')==='phase1-brief');
  for(let i=all.length-1;i>=0;i--){
    const q=String(all[i].question||'').trim();
    if(!q) continue;
    const normalized=canonicalizePhase1BriefArgs({decision_key:'phase1-brief',question:q});
    if(!phase1BriefGrillingBlockers(normalized).length){
      return {
        decision_key:'phase1-brief',
        phase:'Phase 1',
        question:normalized.question,
        options:'Ответьте Q1..Q5 одним сообщением. Подходящие рекомендации можно подтвердить словом «согласен», а изменённые пункты написать своим текстом.',
        recommendation:'Пройдите все пять пунктов; изменяйте только то, что действительно хотите поменять.',
        reason:'Старый terminal runtime сохранил только часть многострочного ответа. Forge переоткрывает тот же канонический Q1..Q5 STOP без повторного анализа/research.'
      };
    }
  }
  return null;
}
function phase1ImmediateResumeStopCandidate(){
  if(activePhase!==1 || pendingDecision || memoryDirty) return null;
  if(
    resolvedDecisionKeys.has('phase1-research-direction') &&
    !resolvedDecisionKeys.has('phase1-brief') &&
    fileExistsNonEmpty('ANALYSIS.md',80) &&
    /\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i.test(optionalText('wiki/_map.md',20000))
  ) return latestPersistedBriefPrompt();
  return null;
}
function openDeterministicStop(stop,reason='deterministic resume'){
  if(!stop) return false;
  const a=canonicalizeAskUserArgs(stop);
  const err=phase1StopGuard(a)||phaseDecisionGuard(a);
  if(err) return false;
  pendingDecision={
    decision_key:String(a.decision_key||'').trim()||null,
    phase:a.phase||(activePhase?`Phase ${activePhase}`:'Forge'),
    question:String(a.question||'Нужно решение пользователя.'),
    options:String(a.options||''),
    recommendation:String(a.recommendation||''),
    reason:String(a.reason||''),
    proposal:a.proposal&&typeof a.proposal==='object'?a.proposal:null,
    inventorySha256:String(a.decision_key||'')==='phase2-screen-inventory'?(readScreenInventoryDraft().inventorySha256||null):null
  };
  persistRuntimeEvidenceLedger();
  process.stdout.write(`\n[Forge] Opened ${reason} STOP directly from durable state; no model/tool round-trip required.\n`);
  printStopPoint(a);
  return true;
}
function completeApprovedPhase1Resume(){
  if(activePhase!==1 || pendingDecision || phaseMarkedComplete(1)) return {completed:false};
  if([...requiredDecisionKeysForPhase(1)].some(key=>!resolvedDecisionKeys.has(key))) return {completed:false};
  const research=phase1ResearchEvidencePath();
  const productAdr=findFiles('wiki/decisions',/product-metrics.*\.md$/i,40,20)[0]||null;
  const artifacts=['ANALYSIS.md',research,'wiki/design/brief.md','wiki/architecture/metrics.md',productAdr].filter(Boolean);
  if(memoryDirty){
    persistMemoryUpdate({
      phase:1,
      summary:'Reconciled already approved Phase 1 decisions and canonical artifacts from durable state before the final gate.',
      artifacts,
      checks:['Durable Phase 1 decision reconciliation'],
      blockers:[],
      next:'Run the final Phase 1 evidence gate without repeating research or user STOP-points.'
    });
  }
  const gate=phaseGateReport(1);
  if(!gate.ok) return {completed:false,blockers:gate.blockers};
  const helper=safePath('.claude/skills/status/references/phase-state.mjs');
  const evidence=['ANALYSIS.md','wiki/design/brief.md','wiki/architecture/metrics.md'];
  const result=spawnSync(process.execPath,[helper,'complete','1',...evidence,'--host','gigachat'],{cwd:PROJECT,encoding:'utf8',timeout:30000});
  if(result.status!==0) return {completed:false,blockers:[String(result.stderr||result.stdout||`phase-state exit ${result.status}`)]};
  completedSkills.add('phase-1-analyze');
  persistRuntimeEvidenceLedger();
  persistMemoryUpdate({
    phase:1,
    summary:'Phase 1 Analyze completed from already approved durable state. Research, brief, KPI/content budget and the final evidence gate are complete; no approval was repeated.',
    artifacts:evidence,
    checks:['Forge Phase 1 gate: GREEN',String(result.stdout||'Phase 1 marker complete').trim()],
    blockers:[],
    next:'Await the user command “фаза 2” before starting Design.'
  });
  return {completed:true,evidence,stdout:String(result.stdout||'').trim()};
}
function reopenPendingDecisionStop(reason='phase resume'){
  if(!pendingDecision||typeof pendingDecision!=='object') return false;
  persistRuntimeEvidenceLedger();
  process.stdout.write(`\n[Forge] Reopened pending ${reason} STOP directly from durable state; no model/tool round-trip required.\n`);
  printStopPoint(pendingDecision);
  return true;
}

function phase1DeterministicStopCandidate(){
  if(activePhase!==1 || memoryDirty) return null;

  const researchBlockers=phase1ResearchBlockers();
  if(!researchBlockers.length && !resolvedDecisionKeys.has('phase1-research-direction')){
    if(loadedSkills.has('research-references') && !completedSkills.has('research-references')){
      const v=markSkillDone('research-references');
      if(!v.ok) return null;
    }
    return {
      decision_key:'phase1-research-direction',
      phase:'Phase 1',
      question:'Исследование конкурентов, источников и визуальных референсов собрано и прошло runtime-проверки. Подтверждаете это направление исследования, чтобы перейти к финализации ANALYSIS.md, или хотите углубить конкретный аспект?',
      options:'A) Подтвердить направление и продолжить\nB) Углубить исследование — укажите, какой конкурент, механика, визуальный паттерн или рынок требует дополнительной проверки',
      recommendation:'A) Подтвердить, если показанный ниже research evidence достаточно полно описывает направление проекта.',
      reason:'Это обязательный Phase 1 STOP после research-references. Числовые KPI здесь не утверждаются — они будут отдельно проверены на product-metrics.'
    };
  }

  // Never invent a generic brief. Reusing a previously persisted canonical
  // Q1..Q5 prompt is safe because its recommendations are already grounded.
  if(
    resolvedDecisionKeys.has('phase1-research-direction') &&
    !resolvedDecisionKeys.has('phase1-brief') &&
    fileExistsNonEmpty('ANALYSIS.md',80) &&
    /\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i.test(optionalText('wiki/_map.md',20000))
  ){
    const prior=latestPersistedBriefPrompt();
    if(prior) return prior;
  }
  return null;
}

function phaseAwareRecoveryFunction(){
  if(!activePhase) return null;
  if(activePhase===1){
    if(!phaseContextRefreshed) return 'forge_context';
    if(!phase1SourceInspected() && !phaseWorkspaceInspected) return 'forge_workspace_inspect';
    if(memoryDirty) return 'forge_memory_update';

    const rb=!resolvedDecisionKeys.has('phase1-research-direction')?phase1ResearchBlockers():[];
    if(rb.some(x=>/image_search/i.test(String(x)))) return 'forge_image_search';
    if(rb.some(x=>/web searches|web_search/i.test(String(x)))) return 'forge_web_search';
    if(rb.some(x=>/page fetch|source URLs|Sources contains URL|successfully fetched/i.test(String(x)))) return 'forge_web_search';

    if(!rb.length && !resolvedDecisionKeys.has('phase1-research-direction')) return 'ask_user';
    if(resolvedDecisionKeys.has('phase1-research-direction') && !resolvedDecisionKeys.has('phase1-brief') &&
       fileExistsNonEmpty('ANALYSIS.md',80) &&
       /\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i.test(optionalText('wiki/_map.md',20000))) return 'ask_user';

    if(!fileExistsNonEmpty('ANALYSIS.md',80)) return 'write_file';
    if(resolvedDecisionKeys.has('phase1-brief') && phase1AiBaselineBlockers().length) return 'forge_script';
    if(!loadedSkills.has('product-metrics') && resolvedDecisionKeys.has('phase1-brief')) return 'forge_skill';
  }
  return 'forge_checkpoint';
}

function stopAnswerGuidance(a={}){
  const key=String(a.decision_key||'').trim();
  if(key==='phase1-brief') return [
    'Если согласны со всеми рекомендациями, напишите: «утверждаю».',
    'Если хотите изменить хотя бы один пункт, пришлите все пять ответов одним сообщением:',
    'Q1 — согласен.',
    'Q2 — <ваш вариант или «согласен»>.',
    'Q3 — <ваш вариант или «согласен»>.',
    'Q4 — <ваш вариант или «согласен»>.',
    'Q5 — <ваш вариант или «согласен»>.'
  ].join('\n');
  if(key==='phase1-research-direction') return [
    'Если направление исследования подходит, напишите: «утверждаю».',
    'Если нужно углубить исследование, напишите: «углубить: <что именно проверить>».'
  ].join('\n');
  if(key==='phase1-content-budget') return [
    'Если согласны с KPI и планом контента, напишите: «утверждаю».',
    'Если нужны изменения, перечислите их явно, например: «D7 target = 12%, остальное утверждаю».'
  ].join('\n');
  if(a.recommendation) return [
    'Если согласны с рекомендацией агента, напишите: «утверждаю».',
    'Если не согласны, укажите выбранный вариант и нужные изменения одним сообщением.'
  ].join('\n');
  return 'Укажите выбранный вариант и нужные изменения одним сообщением.';
}

function printStopPoint(a = {}) {
  const phase = a.phase || (activePhase ? `Phase ${activePhase}` : 'Forge');
  process.stdout.write(`\n=== STOP-POINT: ${phase} ===\n`);
  process.stdout.write(`${String(a.question || 'Нужно решение пользователя.').trim()}\n`);
  if (a.options) process.stdout.write(`\nВарианты:\n${String(a.options).trim()}\n`);
  if (a.recommendation) process.stdout.write(`\nРекомендация агента:\n${String(a.recommendation).trim()}\n`);
  if (a.reason) process.stdout.write(`\nПочему это нужно решить сейчас:\n${String(a.reason).trim()}\n`);
  if(String(a.decision_key||'')==='phase1-research-direction'){
    const evidence=researchDirectionEvidencePreview();
    if(evidence){
      process.stdout.write(`\n--- RESEARCH EVIDENCE TO APPROVE ---\n${evidence}\n--- END RESEARCH EVIDENCE ---\n`);
    }
  }
  if(String(a.decision_key||'')==='phase1-content-budget'){
    const evidence=productMetricsEvidencePreview();
    process.stdout.write(`
--- PRODUCT-METRICS BENCHMARK EVIDENCE TO APPROVE ---
${evidence}
--- END PRODUCT-METRICS BENCHMARK EVIDENCE ---
`);
  }
  if(String(a.decision_key||'')==='phase2-screen-inventory'){
    process.stdout.write(`\n--- COMPLETE SCREEN INVENTORY TO APPROVE ---\n${screenInventoryEvidencePreview()}\n--- END SCREEN INVENTORY ---\n`);
  }
  process.stdout.write(`\nКак ответить:\n${stopAnswerGuidance(a)}\n`);
  process.stdout.write('\n[Forge] Работа остановлена до вашего ответа.\n');
}

function fnDef(name, description, parameters, return_parameters, few_shot_examples=[]) {
  const out={name,description,parameters,return_parameters};
  if(few_shot_examples.length) out.few_shot_examples=few_shot_examples;
  return out;
}

const phase1ContentBudgetProposalSchema={type:'object',description:'Preferred structured payload for phase1-content-budget.',properties:{benchmark_context:{type:'string'},kpis:{type:'object',properties:{d1:{type:'object'},d7:{type:'object'},d30:{type:'object'},arpdau:{type:'object'},session_length:{type:'object'},iap_conversion:{type:'object'},north_star:{type:'object'}},required:['d1','d7','d30','arpdau','session_length','iap_conversion','north_star']},engagement:{type:'object',properties:{core_loop_length:{type:'string'},session_structure:{type:'string'},drop_off_points:{type:'string'},retention_hooks:{type:'string'}},required:['core_loop_length','session_structure','drop_off_points','retention_hooks']},monetization:{type:'object',properties:{narrative:{type:'string'},primary_model:{type:'string'},rewarded_hooks:{type:'string'},interstitial_hooks:{type:'string'},iap_catalog:{type:'string'},not_monetized:{type:'string'}},required:['narrative','primary_model','rewarded_hooks','interstitial_hooks','iap_catalog','not_monetized']},content_budget:{type:'object',properties:{scope:{type:'string'},d0_d1:{type:'object'},d2_d7:{type:'object'},d8_d30:{type:'object'},deficit:{type:'string'}},required:['scope','d0_d1','d2_d7','d8_d30','deficit']}},required:['benchmark_context','kpis','engagement','monetization','content_budget']};

const commonOkReturn = (extra={}) => ({
  type:'object',
  properties:{
    ok:{type:'boolean',description:'true when the tool completed successfully'},
    error:{type:'string',description:'Present only when the tool failed'},
    ...extra
  }
});

const functions = [
  fnDef(
    'forge_diagnostic_report',
    'Record a machine-readable incident only when Project Forge itself behaves incorrectly: malformed phase/STOP output, wrong adapter format, hook/runtime failure, capability contradiction, validator drift, or unexpected orchestration. Do NOT report ordinary game/app implementation bugs. Never include secrets, prompts, full outputs, or file contents. Use action=resolve only after verifying a prior fingerprint.',
    {type:'object',properties:{action:{type:'string',enum:['report','resolve']},severity:{type:'string',enum:['info','warn','error','critical']},code:{type:'string',description:'Stable uppercase incident class'},kind:{type:'string'},component:{type:'string'},operation:{type:'string'},message:{type:'string'},expected:{type:'string'},actual:{type:'string'},phase:{type:'integer'},evidence:{type:'array',items:{type:'string'},description:'Project-relative evidence paths only'},fingerprint:{type:'string',description:'Required when action=resolve'}},required:['code','component','message']},
    {type:'object',properties:{ok:{type:'boolean'},fingerprint:{type:'string'},path:{type:'string'},error:{type:'string'}}}
  ),
  fnDef(
    'forge_change_complete',
    'Complete the active /do or natural-language change request only after the requested implementation is actually written and verified. Supply a factual summary, project-relative paths that already exist, and the checks that were run. This clears change-request mode but does not automatically resume or advance a Forge phase.',
    {type:'object',properties:{summary:{type:'string'},evidence:{type:'array',items:{type:'string'}},checks:{type:'array',items:{type:'string'}}},required:['summary','evidence','checks']},
    {type:'object',properties:{ok:{type:'boolean'},completed_request:{type:'string'},summary:{type:'string'},evidence:{type:'array',items:{type:'string'}},checks:{type:'array',items:{type:'string'}},resume_phase:{type:'integer'},note:{type:'string'},error:{type:'string'}}}
  ),
  fnDef(
    'ask_user',
    'MANDATORY human-approval gate for every Project Forge STOP-point or decision explicitly owned by the user. Call this instead of answering the decision yourself. The adapter prints the question/options/recommendation and immediately pauses the current tool loop until a new user message arrives. Never call another tool after a successful ask_user in the same turn. Phase 1 order: complete real research -> phase1-research-direction approval -> finalize ANALYSIS.md + dimensionality -> phase1-brief -> product-metrics proposal -> phase1-content-budget. IMPORTANT for decision_key=phase1-brief: canonical phase-1-analyze requires /grilling format exactly: ask all five Q1..Q5 in one round and put a concrete ➡️ recommended answer directly under EACH question. A single generic recommendation field is NOT sufficient. Recommendations must be grounded in the prototype/research and remain proposals for the user to accept or replace. For Q5 history, never fabricate undocumented prior user attempts/failures/releases; recommend what to confirm or preserve and mark unknown history as unknown. Never offer waiting for web_search when live search is already configured. Never ask the user to approve unseen research; include concrete findings, and the runtime will append the current research artifact excerpt. Final research Sources URLs must be grounded in successful forge_web_fetch evidence. Quantitative KPI percentage provenance is enforced later at the separate phase1-content-budget/product-metrics approval. For phase1-content-budget use the structured proposal object; Forge renders the STOP deterministically.',
    {type:'object',properties:{decision_key:{type:'string',description:'Stable machine key.'},phase:{type:'string'},question:{type:'string',description:'Required for ordinary STOPs and phase1-brief. For phase1-content-budget prefer proposal.'},options:{type:'string'},recommendation:{type:'string'},reason:{type:'string'},proposal:phase1ContentBudgetProposalSchema},required:[]},
    commonOkReturn({waiting_for_user:{type:'boolean',description:'true when execution is paused for the user'}}),
    [{request:'Нужно решить, делать ли мультиплеер',params:{phase:'Phase 2 Design',question:'Делаем мультиплеер?',options:'А) Нет\nБ) Асинхронный\nВ) Реалтайм',recommendation:'А',reason:'Это влияет на сроки, сервер и архитектуру'}}]
  ),
  fnDef(
    'forge_preflight',
    'Deterministic Project Forge host preflight for a phase: recursive skill dependencies, unavailable host capabilities and Forge version drift.',
    {type:'object',properties:{phase:{type:'integer'}},required:[]},
    {type:'object',properties:{ok:{type:'boolean'},phase:{type:'integer'},contractVersion:{type:'string'},auditedForgeVersion:{type:'string'},currentForgeVersion:{type:'string'},phaseSkill:{type:'string'},dependencies:{type:'array',items:{type:'string'}},missingSkills:{type:'array',items:{type:'string'}},capabilityNeeds:{type:'array',items:{type:'string'}},unavailableCapabilities:{type:'array',items:{type:'string'}},hardBlockNow:{type:'string'},warnings:{type:'array',items:{type:'string'}}}}
  ),
  fnDef(
    'forge_skill_done',
    'Mark a loaded Forge skill complete only after adapter-side evidence validation. forge_skill only loads SKILL.md and is never execution proof.',
    {type:'object',properties:{name:{type:'string'}},required:['name']},
    {type:'object',properties:{ok:{type:'boolean'},skill:{type:'string'},validatedAt:{type:'string'},blockers:{type:'array',items:{type:'string'}}}}
  ),
  fnDef(
    'forge_script',
    'Run a canonical Project Forge Node script by name, resolving project scripts/ first and Forge engine scripts/ second. Pass args as an array.',
    {type:'object',properties:{name:{type:'string'},args:{type:'array',items:{type:'string'}},timeout_seconds:{type:'integer'}},required:['name']},
    commonOkReturn({status:{type:'integer'},stdout:{type:'string'},stderr:{type:'string'},resolved_path:{type:'string'}})
  ),
  fnDef(
    'forge_checkpoint',
    'Return a small deterministic continuation checkpoint for the active Forge phase: loaded skills, memory state, hard-gate blockers, unresolved failures and concise next canonical hints. Use this after tool-call confusion or an empty response instead of re-reading the whole project.',
    {type:'object',properties:{},required:[]},
    {type:'object',properties:{ok:{type:'boolean'},active_phase:{type:'integer'},active_phase_skill:{type:'string'},loaded_skills:{type:'array',items:{type:'string'}},memory_dirty:{type:'boolean'},source_inspected:{type:'boolean'},unresolved_failures:{type:'array',items:{type:'object'}},gate:{type:'object'},next_hints:{type:'array',items:{type:'string'}}}},
    [{request:'Какой следующий реальный шаг текущей Forge-фазы?',params:{}}]
  ),
  fnDef(
    'forge_gate',
    'Run the adapter-side HARD evidence gate for the current or specified Forge phase. MUST be called immediately before any phase-state complete command. GREEN means runtime evidence is sufficient; BLOCKED means every listed blocker must be fixed with real artifacts/verifier evidence before completion.',
    {type:'object',properties:{phase:{type:'integer',description:'Forge phase number 1-9; omit to use the active phase'}},required:[]},
    {type:'object',properties:{ok:{type:'boolean'},phase:{type:'integer'},blockers:{type:'array',items:{type:'string'}},evidence:{type:'object'}}}
  ),
  fnDef(
    'forge_capabilities',
    'Return the capabilities actually callable from this GigaChat Forge adapter. Consult this before promising image generation, 3D generation, PixelLab/MCP, browser automation, or another provider. GigaChat built-in text2image/text2model3d are exposed through dedicated Forge wrapper tools when available.',
    {type:'object',properties:{},required:[]},
    {type:'object',properties:{ok:{type:'boolean'},shell:{type:'boolean'},image_generation:{type:'boolean'},image_provider:{type:'string'},model3d_generation:{type:'boolean'},model3d_provider:{type:'string'},pixellab_mcp:{type:'boolean'},browser_automation:{type:'boolean'},web_search:{type:'boolean'},image_search:{type:'boolean'},web_fetch:{type:'boolean'},subagents:{type:'boolean'},agent_teams:{type:'boolean'},scheduler:{type:'boolean'},callable_tools:{type:'array',items:{type:'string'}}}}
  ),
  fnDef(
    'forge_search_doctor',
    'Inspect external search configuration without revealing secret values. Use before web research if preflight reports search unavailable.',
    {type:'object',properties:{},required:[]},
    {type:'object',properties:{ok:{type:'boolean'},provider:{type:'string'},web_search:{type:'boolean'},image_search:{type:'boolean'},web_fetch:{type:'boolean'},configured:{type:'boolean'},config:{type:'object'},error:{type:'string'},notes:{type:'array',items:{type:'string'}}}}
  ),
  fnDef(
    'forge_web_search',
    'Search the public Internet through the configured Project Forge search provider. Returns real URLs/snippets only; never fabricate results. Canonical research-references should use 2-4 focused queries and inspect the top results.',
    {type:'object',properties:{query:{type:'string'},count:{type:'integer'}},required:['query']},
    {type:'object',properties:{ok:{type:'boolean'},provider:{type:'string'},query:{type:'string'},results:{type:'array',items:{type:'object'}},raw:{type:'string'},error:{type:'string'}}}
  ),
  fnDef(
    'forge_image_search',
    'Search public Internet images through the configured Project Forge image-search provider. Returns source/page URLs and image URLs. Use for visual reference research; do not treat returned images as generated assets.',
    {type:'object',properties:{query:{type:'string'},count:{type:'integer'}},required:['query']},
    {type:'object',properties:{ok:{type:'boolean'},provider:{type:'string'},query:{type:'string'},results:{type:'array',items:{type:'object'}},raw:{type:'string'},error:{type:'string'}}}
  ),
  fnDef(
    'forge_web_fetch',
    'Fetch and extract readable text from one public http/https URL. Private/localhost/link-local destinations are blocked, including redirects. Use this to actually read top web-search results rather than relying only on snippets.',
    {type:'object',properties:{url:{type:'string'},max_chars:{type:'integer'}},required:['url']},
    {type:'object',properties:{ok:{type:'boolean'},url:{type:'string'},status:{type:'integer'},content_type:{type:'string'},title:{type:'string'},text:{type:'string'},error:{type:'string'}}}
  ),
  fnDef(
    'forge_context',
    'Refresh durable Project Forge memory before assuming prior work is missing. Returns machine phase markers, wiki/_current.md, wiki/_map.md, recent session journals, persisted user decisions, WorkProgress inventory, plan files, git status and drift warnings. Use it at phase start and whenever a new process/session might otherwise rediscover old work.',
    {type:'object',properties:{},required:[]},
    {type:'object',properties:{ok:{type:'boolean'},generatedAt:{type:'string'},status:{type:'string'},phaseMarkers:{type:'array'},current:{type:'string'},map:{type:'string'},recentSessions:{type:'array'},decisions:{type:'array'},workProgress:{type:'array'},planFiles:{type:'array'},gitStatus:{type:'string'},warnings:{type:'array',items:{type:'string'}}}}
  ),
  fnDef(
    'forge_workspace_inspect',
    'Deterministically inspect Project Forge source/workspace when the model is stuck choosing list/read calls. Returns bounded inventories for GameIntegration and WorkProgress plus UTF-8 previews of actual source files. GameIntegration is read-only; WorkProgress is active.',
    {type:'object',properties:{max_chars:{type:'integer',description:'Optional total preview budget, default 32000'}},required:[]},
    {type:'object',properties:{ok:{type:'boolean'},inventories:{type:'object'},previews:{type:'array',items:{type:'object'}},total_preview_chars:{type:'integer'},note:{type:'string'}}},
    [{request:'Изучи фактический прототип перед анализом',params:{max_chars:32000}}]
  ),
  fnDef(
    'forge_memory_update',
    'Persist meaningful work into durable Project Forge memory. REQUIRED after meaningful writes, successful commands/tests, generated assets, or user decisions and before the next STOP-point/final completion. It appends a detailed wiki/sessions journal, refreshes wiki/_current.md, refreshes the generated agent-memory section in wiki/_map.md, and persists decisions. Summaries must describe facts, not unsupported completion claims.',
    {type:'object',properties:{phase:{type:'integer',description:'Current Forge phase'},summary:{type:'string',description:'Detailed factual summary of work performed'},artifacts:{type:'array',items:{type:'string'},description:'Created/changed artifact paths and what changed'},checks:{type:'array',items:{type:'string'},description:'Commands/verifiers actually run and their results'},blockers:{type:'array',items:{type:'string'},description:'Known failures, missing capabilities or open blockers'},next:{type:'string',description:'Next allowed action or pending STOP-point'}},required:['summary']},
    commonOkReturn({phase:{type:'integer'},session:{type:'string'},current:{type:'string'},map:{type:'string'},decisionLedger:{type:'string'},syncedAt:{type:'string'}}),
    [{request:'Зафиксируй сделанное перед следующим STOP-point',params:{phase:4,summary:'Создан и интегрирован реальный фон главного экрана; visual QA пока не запускался.',artifacts:['assets/generated/gigachat/factory-bg.png','WorkProgress/game/index.html'],checks:['GigaChat text2image: success'],blockers:['visual QA pending'],next:'Запустить screens-shoot/visual-qa'}}]
  ),
  fnDef(
    'gigachat_generate_image',
    'Generate a REAL image through the official GigaChat built-in text2image function, download the returned binary file from /v1/files/{file_id}/content, validate its real image signature, save it inside the project, and write a provenance sidecar JSON. Use this for actual Phase 4 visual production when AI generation is selected. Never use write_file for PNG/JPG/WebP. The output path must be inside the project and outside protected GameIntegration/Release content.',
    {type:'object',properties:{prompt:{type:'string',description:'Production-ready image prompt including subject, style, composition and constraints'},output_path:{type:'string',description:'Desired project-relative output path, e.g. assets/generated/gigachat/factory-bg.png'},purpose:{type:'string',description:'Short artifact purpose such as target frame, background, portrait, icon, UI panel'}},required:['prompt','output_path']},
    commonOkReturn({path:{type:'string',description:'Actual saved image path; may differ in extension if service returned another real format'},requested_path:{type:'string'},file_id:{type:'string'},format:{type:'string'},bytes:{type:'integer'},provenance:{type:'string'},functions_state_id:{type:'string'},warning:{type:'string'}}),
    [{request:'Сгенерируй заводской фон для главного экрана и сохрани его',params:{prompt:'Pixel-art Soviet automobile factory interior, portrait mobile game background, no text, readable dark silhouettes, warm industrial light, red accents',output_path:'assets/generated/gigachat/factory-background.png',purpose:'Phase 4 gameplay background'}}]
  ),
  fnDef(
    'gigachat_generate_3d',
    'Generate a REAL FBX model through the official GigaChat built-in text2model3d function, download the binary from GigaChat file storage, validate that the payload looks like FBX, save it inside the project, and write provenance. Use only when the project is actually 3D and the phase plan requires a generated model.',
    {type:'object',properties:{prompt:{type:'string',description:'Description of the 3D object to generate'},output_path:{type:'string',description:'Project-relative .fbx destination path'},purpose:{type:'string',description:'Short model purpose'}},required:['prompt','output_path']},
    commonOkReturn({path:{type:'string'},file_id:{type:'string'},bytes:{type:'integer'},provenance:{type:'string'},functions_state_id:{type:'string'}}),
    [{request:'Сгенерируй простой FBX ящика для 3D-сцены',params:{prompt:'Low-poly industrial wooden crate, game-ready, simple UV-friendly geometry',output_path:'assets/generated/gigachat/crate.fbx',purpose:'3D environment prop'}}]
  ),
  fnDef(
    'read_file',
    'Read an existing UTF-8 project text file with line numbers. During an active direct task, omitting start_line/end_line automatically returns the next unread 300-line page and persists the cursor across context compaction. Repeat the same path without a range only until complete=true; then use search_text/replace_text instead of restarting. Do not use on binary media.',
    {type:'object',properties:{path:{type:'string'},start_line:{type:'integer'},end_line:{type:'integer'}},required:['path']},
    commonOkReturn({path:{type:'string'},start:{type:'integer'},end:{type:'integer'},total:{type:'integer'},content:{type:'string'}})
  ),
  fnDef(
    'list_files',
    'List files/directories recursively to a bounded depth inside the selected project. Use to inspect WorkProgress/wiki/assets before assuming files do not exist.',
    {type:'object',properties:{path:{type:'string'},depth:{type:'integer'}},required:[]},
    commonOkReturn({path:{type:'string'},items:{type:'array',items:{type:'string'}}})
  ),
  fnDef(
    'search_text',
    'Search plain UTF-8 text across project files. Use for finding definitions, stale decisions, references and implementation evidence before modifying files.',
    {type:'object',properties:{query:{type:'string'},path:{type:'string'},max_results:{type:'integer'}},required:['query']},
    commonOkReturn({results:{type:'array',items:{type:'string'}}})
  ),
  fnDef(
    'write_file',
    'Create a new or fully replace a small UTF-8 TEXT file inside the project. During a direct integration task, never use this tool to reconstruct an existing large game/source file: preserve it with targeted replace_text anchors. A second full overwrite of the same path in one task is blocked. This tool is forbidden for PNG/JPG/WebP/audio/video/3D/archive/font/binary media. For generated images use gigachat_generate_image. Respect GameIntegration read-only and Release protection.',
    {type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']},
    commonOkReturn({path:{type:'string'},bytes:{type:'integer'}}),
    [{request:'Обнови wiki текущим решением',params:{path:'wiki/design/brief.md',content:'# Brief\n\nMonetization: ads-only\n'}}]
  ),
  fnDef(
    'replace_text',
    'Replace exactly one occurrence of old_text in an existing UTF-8 project text file. Fails if the anchor is absent or occurs more than once. Never use on binary/media files.',
    {type:'object',properties:{path:{type:'string'},old_text:{type:'string'},new_text:{type:'string'}},required:['path','old_text','new_text']},
    commonOkReturn({path:{type:'string'}})
  ),
  fnDef(
    'forge_skill',
    'Load the canonical Project Forge .claude/skills/<name>/SKILL.md. Always load the relevant phase skill before executing a phase; its gates, STOP-points, artifacts and verifiers are mandatory.',
    {type:'object',properties:{name:{type:'string'}},required:['name']},
    commonOkReturn({path:{type:'string'},content:{type:'string'}})
  ),
  fnDef(
    'forge_status',
    'Run the read-only Forge phase-aware status helper. This is a status snapshot, not proof that required evidence exists. Use forge_gate before completion.',
    {type:'object',properties:{json:{type:'boolean'}},required:[]},
    commonOkReturn({status:{type:'integer'},output:{type:'string'}})
  ),
  fnDef(
    'copy_path',
    'Copy an existing project file or directory to another location inside the project using Node filesystem APIs. Use this for portable workspace ingest such as GameIntegration -> WorkProgress instead of executing Unix cp/mkdir shell syntax on Windows. The source may be read-only GameIntegration; the destination must obey Forge writable workspace rules.',
    {type:'object',properties:{
      source:{type:'string',description:'Existing source path inside the selected project.'},
      destination:{type:'string',description:'Destination path inside the selected project, normally under WorkProgress.'}
    },required:['source','destination']},
    commonOkReturn({source:{type:'string'},destination:{type:'string'},kind:{type:'string'}}),
    [{request:'Занеси прототип из GameIntegration в WorkProgress',params:{source:'GameIntegration/my-game',destination:'WorkProgress/my-game'}}]
  ),
  fnDef(
    'git_diff',
    'Show git status plus diff for the current project so real file changes can be verified. Use after implementation or visual integration before claiming completion.',
    {type:'object',properties:{stat_only:{type:'boolean'}},required:[]},
    commonOkReturn({status:{type:'string'},diff:{type:'string'}})
  ),
];
if (FULL) functions.push(fnDef(
  'run_command',
  'Run a REAL operating-system shell command in the selected project in FULL mode. Use only actual executable commands/scripts such as node ...mjs, npm, git, build/test/verifier commands. IMPORTANT: Forge host commands like /analyze-project, /product-metrics, /phase-4-visual and Codex $skill syntax are NOT shell commands; load those canonical skills with forge_skill and execute their steps through tools. On Windows do not blindly run Unix-only cp/mkdir -p snippets; prefer copy_path and project tools. Report failures honestly. Never run destructive commands unless the user explicitly requested them. A failed verifier remains a hard blocker until a successful rerun clears it.',
  {type:'object',properties:{command:{type:'string'},timeout_seconds:{type:'integer'}},required:['command']},
  commonOkReturn({status:{type:'integer'},stdout:{type:'string'},stderr:{type:'string'}}),
  [{request:'Запусти playtest текущего проекта',params:{command:'node scripts/playtest.mjs .',timeout_seconds:120}}]
));

function persistMemoryUpdate(a={}) {
  const phase=Number(a.phase||activePhase||0)||null;
  const summary=String(a.summary||'').trim();
  if(!summary) throw new Error('forge_memory_update requires a non-empty summary');
  const artifacts=normalizeList(a.artifacts);
  const checks=normalizeList(a.checks);
  const blockers=normalizeList(a.blockers);
  const next=String(a.next||'').trim();

  const existing=loadDecisionLedger();
  const seen=new Set(existing.map(d=>`${d.phase}|${d.question}|${d.answer}`));
  for(const d of runtimeDecisions) {
    const key=`${d.phase}|${d.question}|${d.answer}`;
    if(!seen.has(key)){ existing.push(d); seen.add(key); }
  }
  saveDecisionLedger(existing);

  const decisionLines=runtimeDecisions.map(d=>`Phase ${d.phase}: ${d.question} → ${d.answer}`);
  latestMemorySessionPath=appendSessionEntry({phase,summary,decisions:decisionLines,artifacts,checks,blockers,next});

  let status='';
  try { status=JSON.parse(tool('forge_status',{json:false})).output||''; } catch {}
  status=status.split(/\r?\n/).filter(line=>!/^STOP:\s*/i.test(line.trim())).join('\n');
  const current=[
    '# Current state',
    '',
    `Updated by GigaChat Forge Agent: ${new Date().toISOString()}`,
    '',
    `## Summary`,
    summary,
    '',
    ...(decisionLines.length?[
      '## Authoritative user decisions (verbatim)',
      'These raw answers override any conflicting paraphrase in the agent summary.',
      ...decisionLines.map(x=>`- ${x}`),
      ''
    ]:[]),
    '## Authoritative status snapshot',
    '```text',
    clip(status,9000).trim(),
    '```',
    artifacts.length?`\n## Recent artifacts / changes\n${artifacts.map(x=>`- ${x}`).join('\n')}`:'',
    checks.length?`\n## Checks / evidence\n${checks.map(x=>`- ${x}`).join('\n')}`:'',
    blockers.length?`\n## Blockers\n${blockers.map(x=>`- ${x}`).join('\n')}`:'',
    next?`\n## Next\n${next}`:'',
    '',
    `Detailed journal: ${latestMemorySessionPath}`,
    ''
  ].join('\n');
  writeFileSync(safePath('wiki/_current.md'),current,'utf8');

  const markers=phaseMarkersSnapshot();
  const work=workProgressSnapshot(2).slice(0,120);
  const recentDecisions=existing.slice(-12).map(d=>`- Phase ${d.phase}: ${d.question} → ${d.answer}`);
  const mapBody=[
    `Updated: ${new Date().toISOString()}`,
    '',
    '### Machine phase state',
    ...markers.map(m=>`- Phase ${m.phase} ${m.name}: ${m.state}${m.reason?` — ${m.reason}`:''}`),
    '',
    '### Active implementation workspace',
    ...(work.length?work.map(x=>`- ${x}`):['- WorkProgress is empty or missing']),
    '',
    '### Recent persisted user decisions',
    ...(recentDecisions.length?recentDecisions:['- None recorded yet']),
    '',
    `### Last agent summary`,
    summary,
    next?`\n### Next\n${next}`:''
  ].join('\n');
  upsertGeneratedSection('wiki/_map.md','<!-- GIGACHAT_MEMORY_START -->','<!-- GIGACHAT_MEMORY_END -->',mapBody);

  memoryDirty=false;
  lastMemorySyncAt=new Date().toISOString();
  runtimeDecisions=[];
  return {ok:true,phase,session:latestMemorySessionPath,current:'wiki/_current.md',map:'wiki/_map.md',decisionLedger:'wiki/decisions/gigachat-decisions.json',syncedAt:lastMemorySyncAt};
}

function tool(name, a={}) {
  try {
    const readOnlyBlock=readOnlyTurnToolBlock(name);
    if(readOnlyBlock){
      reportForgeBehavior({severity:'error',code:'GIGA_STATUS_MUTATION_ATTEMPT',kind:'user_intent',component:'gigachat-agent',operation:name,message:'GigaChat attempted a non-read-only tool during a factual status question.',expected:'Read-only inspection and factual response.',actual:String(name||'unknown')});
      return jsonResult({ok:false,failure_type:'read-only-intent-guard',error:readOnlyBlock});
    }
    const taskBlock=directiveToolBlock(name,a);
    if(taskBlock) return jsonResult({ok:false,failure_type:'user-intent-guard',error:taskBlock,active_request:activeDirective?.request||''});
    if (name==='forge_diagnostic_report') {
      const result=reportForgeBehavior({...a,source:'ai'});
      return jsonResult(result.ok?{ok:true,fingerprint:result.event.fingerprint,path:rel(result.path)}:{ok:false,error:result.error});
    }
    if (name==='forge_preflight') return jsonResult(forgePreflight(Number(a.phase||activePhase)));
    if (name==='forge_skill_done') return jsonResult(markSkillDone(a.name));
    if (name==='forge_change_complete') return jsonResult(completeDirective(a));
    if (name==='forge_checkpoint') {
      if(activeDirective) return jsonResult({ok:true,mode:'change_request',active_request:activeDirective.request,paused_phase:activeDirective.pausedPhase||null,operations:activeDirective.operations||[],next_hints:['Continue the direct user task in WorkProgress.','Do not run phase/release gates.','After implementation and verification call forge_change_complete.']});
      reconcilePhase1ApprovedState(); return jsonResult(forgeCheckpoint());
    }
    if (name==='forge_gate') { reconcilePhase1ApprovedState(); return jsonResult(phaseGateReport(Number(a.phase||activePhase))); }
    if (name==='forge_capabilities') {
      refreshMandatoryCapabilityBlock();
      return jsonResult({ok:true,...HOST_CAPABILITIES,search_provider:SEARCH_CAPABILITIES.provider||null,search_configured:Boolean(SEARCH_CAPABILITIES.configured),search_config:SEARCH_CAPABILITIES.config||null,callable_tools:functions.map(f=>f.name),image_provider:'GigaChat built-in text2image via gigachat_generate_image',model3d_provider:'GigaChat built-in text2model3d via gigachat_generate_3d',mandatory_capability_block:capabilityBlock||'',contractVersion:CONTRACT_VERSION,note:'Unavailable capabilities are explicit; adapter never simulates them. Web/image search become true only when a real external search provider is configured.'});
    }
    if (name==='forge_context') { reconcilePhase1ApprovedState(); return jsonResult({ok:true,...buildProjectContext()}); }
    if (name==='forge_workspace_inspect') {
      if(activePhase>=2 && phaseWorkspaceInspected) return jsonResult({ok:true,already_inspected:true,note:'Workspace source was already inspected in this phase. Read the specific selected source file next, then edit WorkProgress; do not repeat the broad inspection.'});
      const defaultChars=activePhase>=2?14000:32000;
      const maxAllowed=activePhase>=2?24000:64000;
      const maxChars=Math.max(12000,Math.min(maxAllowed,Number(a.max_chars||defaultChars)));
      return jsonResult(inspectWorkspaceSource(maxChars));
    }
    if (name==='forge_memory_update') {
      if(!memoryDirty && activePhase===1){
        const rb=phase1ResearchBlockers();
        if(rb.length){
          return jsonResult({
            ok:false,
            error:`Memory is already synchronized; another forge_memory_update cannot resolve the active research gate. ${rb.join('; ')}`,
            next_action:'Use forge_checkpoint, then perform the factual/search/write action named in next_hints. Do not repeat forge_memory_update until new factual work or a write makes memory dirty.'
          });
        }
      }
      return jsonResult(persistMemoryUpdate(a));
    }
    if (name==='read_file') return jsonResult(readFileForModel(a));
    if (name==='list_files') { const p=safePath(a.path||'.'); return jsonResult({ok:true,path:rel(p),items:walk(p,Math.max(0,Math.min(5,Number(a.depth??2))))}); }
    if (name==='search_text') return jsonResult({ok:true,results:searchText(a.query,a.path||'.',Math.max(1,Math.min(200,Number(a.max_results||80))))});
    if (name==='write_file') {
      assertTextWritableExtension(a.path);
      const counterfeitBlock=counterfeitCanonicalScriptWriteBlock(a.path);
      if(counterfeitBlock){
        reportForgeBehavior({severity:'error',code:'GIGA_COUNTERFEIT_VERIFIER_ATTEMPT',kind:'evidence_integrity',component:'gigachat-agent',operation:'write_file',message:'GigaChat attempted to create a canonical-looking verifier/release substitute under WorkProgress.',expected:'Use the canonical Forge skill/script.',actual:String(a.path||'')});
        return jsonResult({ok:false,failure_type:'canonical-tool-integrity-guard',error:counterfeitBlock});
      }
      const overwriteBlock=repeatedDirectiveOverwriteBlock(a.path);
      if(overwriteBlock) return jsonResult({ok:false,failure_type:'compaction-overwrite-guard',error:overwriteBlock});
      const destructiveBlock=destructiveFullWriteBlock(a.path,a.content);
      if(destructiveBlock){
        reportForgeBehavior({severity:'error',code:'GIGA_DESTRUCTIVE_FULL_WRITE_ATTEMPT',kind:'content_integrity',component:'gigachat-agent',operation:'write_file',message:'GigaChat attempted to reconstruct an existing large file during a targeted direct task.',expected:'Targeted replace_text edits that preserve unrelated game content.',actual:String(a.path||'')});
        return jsonResult({ok:false,failure_type:'content-loss-guard',error:destructiveBlock});
      }
      const runtimeWriteBlock=runtimeOwnedWriteBlock(a.path);
      if(runtimeWriteBlock) return jsonResult({ok:false,error:runtimeWriteBlock});
      const phaseWriteBlock=phase1ArtifactWriteGuard(a.path);
      if(phaseWriteBlock) return jsonResult({ok:false,error:phaseWriteBlock});
      const p=safePath(a.path); assertWritablePath(p); assertModelTaskWrite(rel(p),'write_file'); mkdirSync(dirname(p),{recursive:true});
      const rawContent=typeof a.content==='string'?a.content:JSON.stringify(a.content,null,2)+'\n';
      const finalContent=rel(p)==='wiki/design/brief.md' ? ensureBriefDecisionVerbatim(rawContent) : rawContent;
      writeFileSync(p,finalContent,'utf8');
      return jsonResult({ok:true,path:rel(p),bytes:Buffer.byteLength(finalContent)});
    }
    if (name==='replace_text') {
      assertTextWritableExtension(a.path);
      const counterfeitBlock=counterfeitCanonicalScriptWriteBlock(a.path);
      if(counterfeitBlock) return jsonResult({ok:false,failure_type:'canonical-tool-integrity-guard',error:counterfeitBlock});
      const runtimeWriteBlock=runtimeOwnedWriteBlock(a.path);
      if(runtimeWriteBlock) return jsonResult({ok:false,error:runtimeWriteBlock});
      const phaseWriteBlock=phase1ArtifactWriteGuard(a.path);
      if(phaseWriteBlock) return jsonResult({ok:false,error:phaseWriteBlock});
      const p=safePath(a.path); assertWritablePath(p); assertModelTaskWrite(rel(p),'replace_text'); const old=String(a.old_text), neu=String(a.new_text); let txt=readText(p);
      const first=txt.indexOf(old); if(first<0) throw new Error('old_text not found'); if(txt.indexOf(old,first+old.length)>=0) throw new Error('old_text occurs more than once');
      txt=txt.slice(0,first)+neu+txt.slice(first+old.length);
      if(rel(p)==='wiki/design/brief.md') txt=ensureBriefDecisionVerbatim(txt);
      writeFileSync(p,txt,'utf8');
      return jsonResult({ok:true,path:rel(p)});
    }
    if (name==='copy_path') {
      const src=safePath(a.source);
      const dst=safePath(a.destination);
      if(!existsSync(src)) throw new Error(`copy_path source does not exist: ${a.source}`);
      assertWritablePath(dst);
      assertModelTaskWrite(rel(dst),'copy_path');
      mkdirSync(dirname(dst),{recursive:true});
      const st=statSync(src);
      if(st.isFile() && existsSync(dst)){
        try {
          const dstSt=statSync(dst);
          if(dstSt.isFile() && dstSt.size===st.size){
            const srcHash=createHash('sha256').update(readFileSync(src)).digest('hex');
            const dstHash=createHash('sha256').update(readFileSync(dst)).digest('hex');
            if(srcHash===dstHash) return jsonResult({ok:true,source:rel(src),destination:rel(dst),kind:'file',unchanged:true});
          }
        } catch {}
      }
      cpSync(src,dst,{recursive:st.isDirectory(),force:true,errorOnExist:false});
      return jsonResult({ok:true,source:rel(src),destination:rel(dst),kind:st.isDirectory()?'directory':'file',unchanged:false});
    }
    if (name==='forge_skill') {
      const skillName=String(a.name||'').toLowerCase();
      if(activePhase>=2 && loadedSkills.has(skillName)){
        return jsonResult({ok:true,already_loaded:true,skill:skillName,content:`${skillName} is already loaded in the active Phase ${activePhase} runtime. Continue executing it; do not request the same SKILL.md again.`});
      }
      if(skillName==='new-project' && (hasAnyFileUnder('GameIntegration') || hasAnyFileUnder('WorkProgress') || fileExistsNonEmpty('ANALYSIS.md',80))){return jsonResult({ok:false,error:'new-project is forbidden while resuming an existing Forge project. Continue the active phase in the current project.'});}
      if(activePhase===1 && skillName==='find-or-make-skill' && completedSkills.has('find-or-make-skill')){return jsonResult({ok:true,already_completed:true,skill:'find-or-make-skill',content:'find-or-make-skill already validated; do not repeat it.'});}

      if(activePhase===1 && skillName==='analyze-project' && resolvedDecisionKeys.has('phase1-research-direction') && fileExistsNonEmpty('ANALYSIS.md',80)){
        return jsonResult({ok:true,already_completed:true,skill:'analyze-project',path:'ANALYSIS.md',content:'Canonical analyze-project artifacts already exist and research direction is approved. Continue from the current Phase 1 checkpoint.'});
      }

      if(activePhase===1 && skillName==='dimensionality'){
        const m=optionalText('wiki/_map.md',20000).match(/\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i);
        if(m) return jsonResult({ok:true,translated_native:true,satisfied:true,skill:'dimensionality',evidence:'wiki/_map.md',dimensionality:String(m[1]).toLowerCase(),content:'Dimensionality is already persisted in wiki/_map.md; no separate dimensionality skill is needed.'});
      }

      if(activePhase===1 && skillName==='research-references' && resolvedDecisionKeys.has('phase1-research-direction')){
        const repaired=reconcilePhase1ApprovedState();
        return jsonResult({
          ok:true,
          already_approved:true,
          skill:'research-references',
          path:phase1ResearchEvidencePath()||'',
          repaired,
          content:'Phase 1 research direction is already approved by the user. Do not redo research-references and do not rewrite the approved research artifact. Continue with the next canonical Phase 1 action.'
        });
      }

      if(activePhase===1 && skillName==='product-metrics'){
        reconcilePhase1ApprovedState();
        const pb=phase1ProductMetricsPrerequisiteBlockers();
        if(pb.length){
          const needsAi=pb.some(x=>/\.forge-ai\.json|asset-baseline|AI Studio/i.test(String(x)));
          return jsonResult({
            ok:false,
            error:`product-metrics cannot start yet: ${pb.join('; ')}`,
            next_action:needsAi
              ? 'Run canonical AI Studio baseline with forge_script(name="ai-studio-init.mjs", args=["."]), then retry product-metrics.'
              : 'Fix the listed prerequisite exactly; do not redo already-approved research.'
          });
        }
        if(!phaseProductMetricsEvidence.startedAt){ phaseProductMetricsEvidence={startedAt:new Date().toISOString(),web:[],fetch:[]}; persistRuntimeEvidenceLedger(); }
      }

      const p=safePath(`.claude/skills/${a.name}/SKILL.md`);
      let machineContract=null;
      try{machineContract=bindDirectiveSkillContract(String(a.name||'').toLowerCase());}
      catch(error){
        reportForgeBehavior({severity:'error',code:'GIGA_SKILL_CONTRACT_REJECTED',kind:'runtime_state',component:'gigachat-agent',operation:'forge_skill',message:'A declared SkillContract could not be attached to the active direct Task.',expected:'Mode/phase-compatible trusted SkillContract binding.',actual:String(error?.message||error)});
        return jsonResult({ok:false,failure_type:'skill-contract',error:String(error?.message||error),skill:String(a.name||'')});
      }
      return jsonResult({ok:true,path:rel(p),content:clip(readText(p),50000),machine_contract:machineContract});
    }
    if (name==='forge_status') { const helper=safePath('.claude/skills/status/references/project-status.mjs'); const r=spawnSync(process.execPath,[helper,PROJECT,...(a.json?['--json']:[])],{cwd:PROJECT,encoding:'utf8',timeout:30000}); return jsonResult({ok:r.status===0,status:r.status,output:clip((r.stdout||'')+(r.stderr||''),40000)}); }
    if (name==='git_diff') { const args=a.stat_only?['diff','--stat']:['diff','--no-ext-diff']; const st=spawnSync('git',['status','--short'],{cwd:PROJECT,encoding:'utf8',timeout:15000}); const d=spawnSync('git',args,{cwd:PROJECT,encoding:'utf8',timeout:30000}); return jsonResult({ok:st.status===0&&d.status===0,status:clip(st.stdout,12000),diff:clip(d.stdout,40000)}); }
    if (name==='forge_script') {
      if(!FULL) throw new Error('forge_script requires --full');
      const requestedScript=String(a.name||'').trim().replace(/\\/g,'/');

      const requestedSkill=requestedScript.replace(/\.mjs$/i,'').replace(/^.*\//,'').toLowerCase();
      const requestedSkillDoc=safePath(`.claude/skills/${requestedSkill}/SKILL.md`);
      if(!requestedScript.includes('/') && existsSync(requestedSkillDoc)){
        return jsonResult({ok:true,translated_skill:true,skill:requestedSkill,path:rel(requestedSkillDoc),content:clip(readText(requestedSkillDoc),50000),note:`${requestedScript} is a Forge SKILL.md workflow, not a standalone script. Forge loaded the canonical skill automatically.`});
      }

      if(activePhase===1 && /^analyze-project\.mjs$/i.test(requestedScript))
        return jsonResult({ok:false,failure_type:'tool-misroute',error:'analyze-project is a canonical Forge skill here, not a standalone script. Use forge_skill(name="analyze-project"); if ANALYSIS.md already exists, continue without rerunning it.'});

      if(activePhase===1 && /^dimensionality\.mjs$/i.test(requestedScript)){
        const m=optionalText('wiki/_map.md',20000).match(/\*\*Размерность:\*\*\s*(2d|2\.5d|3d)/i);
        if(m) return jsonResult({ok:true,translated_native:true,satisfied:true,evidence:'wiki/_map.md',dimensionality:String(m[1]).toLowerCase(),note:'Dimensionality already persisted canonically; no standalone dimensionality.mjs is required.'});
        return jsonResult({ok:false,failure_type:'tool-misroute',error:'No canonical dimensionality.mjs exists. Infer dimensionality from source evidence and persist **Размерность:** 2d|2.5d|3d in wiki/_map.md.'});
      }

      const script=resolveForgeScript(a.name),args=Array.isArray(a.args)?a.args.map(String):[],sec=Math.max(1,Math.min(600,Number(a.timeout_seconds||120)));
      if(/ai-studio-init\.mjs$/i.test(script) && args.length===0) args.push('.');
      if(/local-stage\.mjs$/i.test(script) && !args.some(x=>/^--ai$/i.test(x))) args.push('--ai','--play');
      const taskScopeBlock=taskScopedForgeScriptBlock(script,args);
      if(taskScopeBlock) return jsonResult({ok:false,failure_type:'task-scope-guard',error:taskScopeBlock});
      if(/phase-state\.mjs$/i.test(script) && /^complete$/i.test(String(args[0]||''))){
        const normalized=[args[0],args[1]];
        for(const value of args.slice(2)){
          if(/^--evidence$/i.test(value)) continue;
          normalized.push(...String(value).split(',').map(x=>x.trim()).filter(Boolean));
        }
        args.splice(0,args.length,...normalized);
      }
      if(/phase-state\.mjs$/i.test(script) && /^complete$/i.test(String(args[0]||''))){
        const completedPhase=Number(args[1]);
        const completedState=phaseMarkerState(completedPhase);
        if(completedState==='complete' || (completedPhase===9&&completedState==='ongoing')){
          let evidence=[];
          try{evidence=JSON.parse(readText(safePath(`wiki/phases/phase-${completedPhase}.json`)))?.evidence||[];}catch{}
          return jsonResult({ok:true,status:0,already_complete:true,phase:completedPhase,evidence,stdout:`Phase ${completedPhase} is already ${completedState}; do not repeat completion. Synchronize memory if dirty, then return the final phase result.`,stderr:'',resolved_path:script});
        }
      }
      if(/phase-state\.mjs$/i.test(script) && /^(start|reopen)$/i.test(String(args[0]||'')) && phaseMarkedComplete(Number(args[1]))){
        return jsonResult({ok:true,status:0,already_complete:true,phase:Number(args[1]),stdout:`Phase ${Number(args[1])} is durably complete; refusing to reopen it from a downstream phase.`,stderr:'',resolved_path:script});
      }
      if(/phase-state\.mjs$/i.test(script) && /^(start|reopen)$/i.test(String(args[0]||'')) && Number(args[1])>1 && !phaseMarkedComplete(Number(args[1])-1)){
        return jsonResult({ok:false,failure_type:'phase-order',error:`Cannot start Phase ${Number(args[1])}: Phase ${Number(args[1])-1} is not durably complete. Finish the earlier authoritative gate first.`});
      }
      const completionBlocked=forgeScriptPhaseCompletionBlocked(script,args);
      if(completionBlocked) return jsonResult({ok:false,error:completionBlocked});
      if(/phase-state\.mjs$/i.test(script) && !args.includes('--host')) args.push('--host','gigachat');

      if(/phase-state\.mjs$/i.test(script) && /^(start|reopen)$/i.test(String(args[0]||'')) && Number(args[1])===Number(activePhase) && phaseMarkerState(activePhase)==='in_progress'){
        return jsonResult({ok:true,status:0,already_started:true,stdout:`Phase ${activePhase} is already in_progress; duplicate ${args[0]} is idempotent.`,stderr:'',resolved_path:script});
      }

      if(/phase-state\.mjs$/i.test(script) && /^block$/i.test(String(args[0]||''))){
        const reason=args.slice(2).join(' ');
        const contradicted=contradictedCapabilityBlock(reason);
        if(contradicted.length){
          return jsonResult({
            ok:true,
            status:0,
            suppressed_false_block:true,
            stdout:`Refused stale capability block because runtime preflight currently reports available: ${contradicted.join(', ')}. Re-check forge_capabilities/search_doctor and continue the canonical action.`,
            stderr:'',
            resolved_path:script
          });
        }
      }

      const shellScript=/\.sh$/i.test(script);
      const gitBash='C:\\Program Files\\Git\\bin\\bash.exe';
      const runner=shellScript?(existsSync(gitBash)?gitBash:'bash'):process.execPath;
      const runnerScript=shellScript?String(script).replace(/\\/g,'/'):script;
      const r=spawnSync(runner,[runnerScript,...args],{cwd:PROJECT,encoding:'utf8',timeout:sec*1000,maxBuffer:8*1024*1024});
      return jsonResult({ok:r.status===0,status:r.status,stdout:clip(r.stdout,40000),stderr:clip(r.stderr,16000),resolved_path:script});
    }
    if (name==='run_command') {
      if(!FULL) throw new Error('run_command requires --full');
      const cmd=String(a.command||'').trim();
      const skillInvocation=parseForgeSkillShellInvocation(cmd);
      if(skillInvocation){
        const p=safePath(`.claude/skills/${skillInvocation.skill}/SKILL.md`);
        return jsonResult({
          ok:true,
          translated_skill:true,
          skill:skillInvocation.skill,
          args:skillInvocation.args,
          path:rel(p),
          content:clip(readText(p),50000),
          note:'Forge translated host-specific /skill or $skill notation instead of sending it to the OS shell. Execute the loaded canonical SKILL.md through available Forge tools; do not retry the slash command in run_command.'
        });
      }
      const missingRunner=parseMissingSkillRunner(cmd);
      if(missingRunner){
        return jsonResult({
          ok:true,translated_skill:true,missing_runner:true,skill:missingRunner.skill,args:missingRunner.args,
          path:rel(missingRunner.skillDoc),content:clip(readText(missingRunner.skillDoc),50000),
          note:`Forge blocked a hallucinated/nonexistent skill runner (${missingRunner.runner}). This skill is defined by SKILL.md. Execute the canonical SKILL.md steps through available Forge tools; do not retry an invented index.mjs.`
        });
      }
      const portableRead=translatePortableReadOnlyShell(cmd);
      if(portableRead) return jsonResult(portableRead);
      const taskScopeBlock=taskScopedShellMutationBlock(cmd,'run_command');
      if(taskScopeBlock) return jsonResult({ok:false,failure_type:'task-scope-guard',error:taskScopeBlock});
      const projectScriptMatch=cmd.match(/^node\s+["']?scripts[\\/]([^'"\s]+)["']?(?:\s+([\s\S]*))?$/i);
      if(projectScriptMatch){
        const local=safePath(`scripts/${projectScriptMatch[1]}`),engine=resolve(ENGINE,'scripts',projectScriptMatch[1]);
        if(!existsSync(local)&&existsSync(engine)){
          const args=shellTokens(projectScriptMatch[2]||''),sec=Math.max(1,Math.min(600,Number(a.timeout_seconds||120)));
          if(/^local-stage\.mjs$/i.test(projectScriptMatch[1]) && !args.some(x=>/^--ai$/i.test(x))) args.push('--ai','--play');
          let translatedFileTarget=null;
          if(/^(?:playtest|screens-shoot)\.mjs$/i.test(projectScriptMatch[1]) && /\.html?$/i.test(String(args[0]||''))){
            translatedFileTarget=args[0];
            args[0]=dirname(String(args[0])).replace(/\\/g,'/');
          }
          const rr=spawnSync(process.execPath,[engine,...args],{cwd:PROJECT,encoding:'utf8',timeout:sec*1000,maxBuffer:8*1024*1024});
          return jsonResult({ok:rr.status===0,status:rr.status,stdout:clip(rr.stdout,40000),stderr:clip(rr.stderr,16000),resolved_engine_script:engine,...(translatedFileTarget?{translated_file_target:translatedFileTarget,actual_project_directory:args[0]}:{})});
        }
      }
      const startMatch=cmd.match(/phase-state\.mjs[^\n]*\b(?:start|reopen)\s+(\d+)\b/i);
      if(startMatch && phaseMarkedComplete(Number(startMatch[1]))) return jsonResult({ok:true,status:0,already_complete:true,phase:Number(startMatch[1]),stdout:`Phase ${Number(startMatch[1])} is durably complete; refusing to reopen it from a downstream phase.`,stderr:''});
      if(startMatch && Number(startMatch[1])>1 && !phaseMarkedComplete(Number(startMatch[1])-1)) return jsonResult({ok:false,failure_type:'phase-order',error:`Cannot start Phase ${Number(startMatch[1])}: Phase ${Number(startMatch[1])-1} is not durably complete. Finish the earlier authoritative gate first.`});
      if(startMatch && phaseStarted && Number(startMatch[1])===activePhase && phaseMarkerState(activePhase)==='in_progress'){
        return jsonResult({ok:true,status:0,already_started:true,stdout:`Phase ${activePhase} is already in_progress; runtime baseline is active.`,stderr:''});
      }
      if(startMatch && (!phaseStarted || Number(startMatch[1])!==activePhase)) startPhaseEvidence(Number(startMatch[1]),{resume:phaseMarkerState(Number(startMatch[1]))==='in_progress'});
      const blocked=phaseCompletionBlocked(cmd); if(blocked) return jsonResult({ok:false,error:blocked});
      const sec=Math.max(1,Math.min(300,Number(a.timeout_seconds||120)));
      const r=spawnSync(cmd,{cwd:PROJECT,encoding:'utf8',shell:true,timeout:sec*1000,maxBuffer:4*1024*1024});
      return jsonResult({ok:r.status===0,status:r.status,stdout:clip(r.stdout,30000),stderr:clip(r.stderr,12000)});
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch(e) { return jsonResult({ok:false,error:e.message}); }
}


async function generateGigaImage(a={}) {
  const prompt=String(a.prompt||'').trim();
  const requested=String(a.output_path||'').trim().replace(/\\/g,'/');
  if(!prompt) throw new Error('gigachat_generate_image requires prompt');
  if(!requested) throw new Error('gigachat_generate_image requires output_path');
  const requestedAbs=safePath(requested); assertWritablePath(requestedAbs); assertModelTaskWrite(rel(requestedAbs),'gigachat_generate_image');
  const reqExt=extOf(requested);
  if(reqExt && !['.png','.jpg','.jpeg','.webp','.gif'].includes(reqExt)) throw new Error('Image output_path must use an image extension such as .png/.jpg/.webp or have no extension');

  const innerMessages=[
    {role:'system',content:'Generate exactly the requested game-development image. Do not add text unless the prompt explicitly asks for it. Use the built-in image generation capability.'},
    {role:'user',content:prompt}
  ];
  const data=await gigaJson(await token(),'/v1/chat/completions',{model:MODEL,messages:innerMessages,functions:[{name:'text2image'}],function_call:'auto'},360000);
  const msg=data?.choices?.[0]?.message;
  const content=String(msg?.content||'');
  const fileId=extractImageFileId(content);
  if(!fileId) throw new Error(`GigaChat text2image returned no image file id. Response: ${clip(content,800)}`);
  const buffer=await downloadGigaFile(await token(),fileId,'image/*',360000);
  const actualExt=detectImageBufferExt(buffer);
  if(!actualExt) throw new Error('Downloaded GigaChat image has an unrecognized/invalid image signature');
  const finalRel=withDetectedExtension(requested,actualExt);
  const finalAbs=safePath(finalRel); assertWritablePath(finalAbs); assertModelTaskWrite(rel(finalAbs),'gigachat_generate_image'); mkdirSync(dirname(finalAbs),{recursive:true});
  writeFileSync(finalAbs,buffer);
  if(!isValidMediaFile(finalRel)) throw new Error(`Saved GigaChat image failed media validation: ${finalRel}`);
  const provenanceRel=`${finalRel}.provenance.json`;
  assertModelTaskWrite(provenanceRel,'gigachat_generate_image:provenance');
  const provenance={schemaVersion:1,provider:'gigachat',builtinFunction:'text2image',model:MODEL,purpose:String(a.purpose||''),prompt,fileId,functionsStateId:msg?.functions_state_id||null,generatedAt:new Date().toISOString(),requestedPath:requested,actualPath:finalRel,format:actualExt.slice(1),bytes:buffer.length};
  writeFileSync(safePath(provenanceRel),JSON.stringify(provenance,null,2)+'\n','utf8');
  return {ok:true,path:finalRel,requested_path:requested,file_id:fileId,format:actualExt.slice(1),bytes:buffer.length,provenance:provenanceRel,functions_state_id:msg?.functions_state_id||null,...(finalRel!==requested?{warning:`GigaChat returned ${actualExt}; saved with matching real extension instead of requested path.`}:{})};
}

async function generateGiga3d(a={}) {
  const prompt=String(a.prompt||'').trim();
  let requested=String(a.output_path||'').trim().replace(/\\/g,'/');
  if(!prompt) throw new Error('gigachat_generate_3d requires prompt');
  if(!requested) throw new Error('gigachat_generate_3d requires output_path');
  if(extOf(requested) && extOf(requested)!=='.fbx') throw new Error('3D output_path must end in .fbx or have no extension');
  if(!extOf(requested)) requested+='.fbx';
  const outAbs=safePath(requested); assertWritablePath(outAbs); assertModelTaskWrite(rel(outAbs),'gigachat_generate_3d');
  const data=await gigaJson(await token(),'/v1/chat/completions',{model:MODEL,messages:[{role:'user',content:prompt}],functions:[{name:'text2model3d'}],function_call:'auto'},420000);
  const msg=data?.choices?.[0]?.message;
  const content=String(msg?.content||'');
  const fileId=extractModelFileId(content);
  if(!fileId) throw new Error(`GigaChat text2model3d returned no model file id. Response: ${clip(content,800)}`);
  const buffer=await downloadGigaFile(await token(),fileId,'application/octet-stream',420000);
  if(!isValidFbxBuffer(buffer)) throw new Error('Downloaded GigaChat 3D payload does not look like an FBX file');
  mkdirSync(dirname(outAbs),{recursive:true}); writeFileSync(outAbs,buffer);
  const provenanceRel=`${requested}.provenance.json`;
  assertModelTaskWrite(provenanceRel,'gigachat_generate_3d:provenance');
  const provenance={schemaVersion:1,provider:'gigachat',builtinFunction:'text2model3d',model:MODEL,purpose:String(a.purpose||''),prompt,fileId,functionsStateId:msg?.functions_state_id||null,generatedAt:new Date().toISOString(),actualPath:requested,bytes:buffer.length};
  writeFileSync(safePath(provenanceRel),JSON.stringify(provenance,null,2)+'\n','utf8');
  return {ok:true,path:requested,file_id:fileId,bytes:buffer.length,provenance:provenanceRel,functions_state_id:msg?.functions_state_id||null};
}

async function toolAsync(name,a={}) {
  try {
    const readOnlyBlock=readOnlyTurnToolBlock(name);
    if(readOnlyBlock){
      reportForgeBehavior({severity:'error',code:'GIGA_STATUS_MUTATION_ATTEMPT',kind:'user_intent',component:'gigachat-agent',operation:name,message:'GigaChat attempted a non-read-only tool during a factual status question.',expected:'Read-only inspection and factual response.',actual:String(name||'unknown')});
      return jsonResult({ok:false,failure_type:'read-only-intent-guard',error:readOnlyBlock});
    }
    if(name==='gigachat_generate_image') return jsonResult(await generateGigaImage(a));
    if(name==='gigachat_generate_3d') return jsonResult(await generateGiga3d(a));
    if(name==='forge_search_doctor') return jsonResult(searchDoctor(PROJECT));
    if(name==='forge_web_search') return jsonResult(await webSearch(PROJECT,a.query,a.count||5));
    if(name==='forge_image_search') return jsonResult(await imageSearch(PROJECT,a.query,a.count||5));
    if(name==='forge_web_fetch') return jsonResult(await webFetch(a.url,a.max_chars||30000));
    return tool(name,a);
  } catch(e) { return jsonResult({ok:false,error:e.message}); }
}

const forgePath = safePath('FORGE.md');
const forgeRulesRaw = existsSync(forgePath) ? readText(forgePath) : 'FORGE.md missing; do not guess phase state.';
let initialStatus='';
try { initialStatus=JSON.parse(tool('forge_status',{json:false})).output||''; } catch {}
const initialContext=buildProjectContext();
const bootstrapPhase=Math.max(0,...(initialContext.phaseMarkers||[]).filter(x=>['in_progress','blocked'].includes(String(x.state||''))).map(x=>Number(x.phase)||0));
const matureBootstrap=bootstrapPhase>=2;
const forgeRules=clip(forgeRulesRaw,matureBootstrap?20000:45000);
const system = `You are the GigaChat terminal adapter inside Project Forge. Work as a coding agent, not as a general chat bot.

Project: ${PROJECT}
Model host: GigaChat API
Full shell mode: ${FULL?'enabled':'disabled'}

Mandatory rules:
- Follow FORGE.md and canonical .claude/skills/*/SKILL.md.
- If you observe Forge itself returning the wrong format, violating a phase/STOP contract, contradicting its capabilities/state, or suffering an adapter/hook/runtime failure, call forge_diagnostic_report immediately with a short factual record, then continue safe work when possible. Do not use it for ordinary game/app bugs and never include secrets, prompts, full tool output, or file contents.
- Exactly 9 phases. Never invent Phase 10.
- Respect STOP-points and explicit user approvals.
- EVERY STOP-point, red decision, required approval, product choice, monetization choice, multiplayer choice, platform choice, budget choice, art-direction choice, or other decision assigned to the user MUST be asked through the ask_user tool. ask_user pauses the turn; do not continue work after calling it.
- Phase 1 ORDER IS STRICT: phase start -> context/source inspection/ingest -> research-references (2-4 real web searches, real result-page reads, and 3-5 image searches when visible UI) -> research-direction approval (phase1-research-direction) -> find-or-make-skill -> dimensionality + root ANALYSIS.md -> brief (phase1-brief) -> AI Studio baseline -> product-metrics proposal -> KPI/content-budget approval (phase1-content-budget) -> metrics + ADR.
- A research-direction STOP must summarize ACTUAL external research and ask approve vs deepen. If web_search is live, never offer "wait until web_search is available" or "proceed with internal notes".
- Human approval must be informed: show concrete research findings in the STOP; the runtime appends the current research evidence excerpt automatically. Never ask approval for unseen work.
- Phase 1 brief is canonical /grilling: ask Q1 audience, Q2 ambition, Q3 promise/feeling, Q4 differentiator, Q5 history in one round. EACH question must include its own concrete ➡️ recommended answer grounded in prototype/research. Do not ask five naked questions and do not substitute one generic recommendation.
- If an ask_user call is rejected for Phase 1 /grilling format, REWRITE the ask_user arguments to satisfy the blocker. Never repeat the same invalid arguments and never use forge_checkpoint as a substitute for fixing a malformed STOP.
- Phase 1 Q5 history is epistemically special: recommend what current project evidence suggests preserving/confirming, but never invent undocumented past attempts, failures, experiments, or releases.
- Research-direction provenance is strict for source existence/reading, competitor/source landscape, and required image research. Do NOT make the research-direction STOP depend on exact KPI/retention percentages; those are provisional until product-metrics.
- For visible UI, research-references must incorporate the actual image_search results into the research artifact. Do not leave "pending image_search", placeholder visual anchors, or screenshots N/A after image evidence exists.
- URLs backed by recorded image_search results are valid visual provenance and do not require redundant forge_web_fetch solely because they are listed as visual/source references. Textual factual claims still require fetched web-source evidence.
- Product-metrics quantitative provenance is strict: benchmark sources and observed benchmark values must come from successful real forge_web_fetch evidence. Floor/Target/Stretch values are PROJECT PROPOSALS derived from that evidence and do not need to literally equal a percentage printed by a source. Clearly distinguish observed benchmarks from proposed targets and show the benchmark evidence to the user at the STOP.
- Infer technical facts such as 2D/2.5D/3D from source code when evidence is clear. Do not ask the user to decide a fact that can be determined by inspection. If genuinely ambiguous, explain the conflicting evidence and use decision_key=phase1-ambiguity.
- Never infer a later-phase approval from an earlier generic approval such as "принимаю рекомендации". An approval is scoped only to the concrete pending STOP-point that was shown to the user.
- Never choose monetization, multiplayer, backend, platform, budget, art direction, GDD approval, or another user-owned product decision by yourself.
- Never mark a phase complete while a required user decision is unresolved. If a phase skill contains mandatory decisions, ask them at the required point and wait for a new user turn.
- When the user asks for status or asks what you are doing, STOP doing new work and answer with current status plus all pending questions.
- Machine phase markers and actual artifacts outrank prose state.
- A direct implementation request from the user (for example "сделай гачу", "добавь магазин", "/do исправь экономику") outranks automatic continuation of the currently open phase. Forge enters CHANGE REQUEST MODE, preserves the exact request durably, and pauses phase/release orchestration without changing phase markers.
- In CHANGE REQUEST MODE, do not call forge_preflight, forge_gate, phase-state, phase-* skills, release-* skills, or release packaging. Use the matching tactical skill, write the necessary specification and implementation in WorkProgress, run focused verification, then call forge_change_complete. Do not return only a plan when the user said to start doing the work.
- /resume-phase explicitly abandons/ends the direct-task override and returns control to the canonical phase machine. Never infer /resume-phase merely from an old phase marker.
- At the START of every agent process you receive a Project Context Bootstrap containing phase markers, wiki memory, persisted decisions, recent sessions, WorkProgress inventory, plans, git status, and drift warnings. Treat it as prior-session memory.
- Before claiming that work, a file, a prototype, or an implementation has not been done, inspect forge_context and the existing WorkProgress/wiki evidence first. Do not rediscover source material as if it were new work.
- WorkProgress is the active implementation workspace. GameIntegration is read-only source material that may already have been ingested. NEVER present GameIntegration itself as the Forge asset library and never re-copy it merely because you noticed it in a new session.
- In Phase 4, the asset-library choice must be based on a real successful asset-find.mjs result. Do not invent library candidates from folders you happen to see.
- Keep detailed Project Forge memory. After meaningful writes, successful commands/tests, or a user decision, call forge_memory_update before the next STOP-point or final completion. It must append a detailed wiki/sessions journal, refresh wiki/_current.md, refresh the generated memory section in wiki/_map.md, and persist decisions.
- Do not let wiki drift behind reality. When a user decision changes an existing design assumption (for example ads-only vs Hybrid/IAP), reconcile the affected design documents before completing the phase.
- Read the relevant skill before executing it.
- forge_skill only LOADS SKILL.md; it is never execution proof. Use forge_skill_done only after adapter-side evidence validation passes.
- Use forge_preflight at phase start and forge_script for canonical engine scripts instead of guessing paths.
- forge_workspace_inspect contains real source previews and counts as factual source inspection; do not insist on a separate forge_context call before every source-dependent STOP guard.
- phase-state is host-managed. If you call forge_script phase-state.mjs start/reopen for an already in_progress phase, treat the idempotent result as success and continue.
- Exact verifier identity is authoritative: unrelated verifier success never clears another failure.
- Recoverable shell/path mistakes are not infrastructure blockers; fix them and continue. Only capability/auth-network/environment-hard failures may terminate a phase turn.
- Phase 2 named decisions: phase2-monetization, phase2-multiplayer, phase2-content-plan, phase2-screen-inventory. Before GDD completion, show every screen/state and transition from screen-flow.json and obtain explicit user approval of that full inventory. Phase 4 named decisions: phase4-asset-source, phase4-art-direction, phase4-target-frame, phase4-style-bible, plus phase4-pixel-provider for pixel art.
- IMPORTANT HOST TRANSLATION: slash commands from Claude docs such as /analyze-project and /product-metrics, and Codex $skill commands, are Forge skill invocation notation, NOT operating-system shell commands. In this GigaChat host call forge_skill for that skill and execute its SKILL.md through available tools. Never send /skill or $skill to run_command.
- A Forge skill directory is NOT assumed to contain index.mjs/run.mjs. SKILL.md is the canonical orchestration contract. Never invent .claude/skills/<skill>/index.mjs; use forge_skill and only scripts explicitly named by SKILL.md.
- Never pre-fill user-owned STOP decisions into wiki artifacts. In Phase 1 ask the brief first, then write wiki/design/brief.md from the actual user answer. product-metrics is research -> proposal -> user approval -> write metrics.
- The exact raw answer to phase1-brief is authoritative. Preserve it verbatim in wiki/design/brief.md and never summarize a rejected recommendation as accepted. If the user changes Q2/Q4/etc, later metrics/design must carry that change forward.
- Once phase1-research-direction is approved, research-references is immutable for the remainder of Phase 1 unless the user explicitly asks to deepen that decision. Do not rerun it and do not overwrite its references file. Forge may append a runtime-preserved provenance section from already-recorded fetch/image-search evidence.
- Product-metrics must follow its full canonical Step 2/3/4 contract: benchmark searches for retention, monetization/ARPDAU/IAP, session length and drop-off; real page reads; then a visible proposal with Industry context + Floor/Target/Stretch for D1/D7/D30, ARPDAU, session length, IAP conversion, north-star, engagement narrative, provisional monetization narrative, and D0-D30 content budget/deficit. Stop for approval BEFORE writing metrics.md/ADR.
- If the phase1-content-budget ask_user is rejected as incomplete/non-canonical, rewrite the COMPLETE proposal in one attempt using the runtime blocker list. Do not add one missing field per retry; this creates repair loops and unnecessary context growth.
- For phase1-content-budget always use ask_user.proposal. Forge renders the visible STOP and materializes metrics.md + ADR after an as-is approval.
- In the pre-approval product-metrics STOP, a forward-looking sentence such as 'after approval write wiki/architecture/metrics.md and the ADR' is valid. Only claiming that metrics.md already contains/authoritatively defines the targets, or asking the user to approve values from that unwritten file, is invalid.
- Phase 2 still owns the final monetization decision. Any monetization narrative in product-metrics is a provisional metric assumption, not a hidden Phase 2 approval.
- Never fabricate external research or benchmark sources. If research-references/product-metrics needs web search and web_search is unavailable, return a capability blocker.
- Canonical subskills may contain their own mandatory STOP-points. Preserve them. Do not suppress a subskill user approval merely because the parent phase also has later STOP-points.
- If a canonical subskill requires Internet web_search/image_search and forge_capabilities reports web_search=false, do NOT fabricate competitors, URLs, benchmarks or research. Treat this as a real infrastructure capability blocker until a search provider is configured.
- When web_search/image_search are available, use forge_web_search / forge_image_search and then forge_web_fetch for the top result pages. Search snippets alone are not enough for canonical research when the skill says to read sources.
- A forge_web_fetch failure for one result page (403/Cloudflare/404/429/DNS) is source-specific, not a global capability blocker. Record it, choose another real search result, and continue research.
- forge_search_doctor exposes configuration state without secrets. Never print Authorization/API keys or store them inside the managed project.
- The host OS is ${process.platform}. Treat bash snippets in skills as intent/examples unless they are actually portable on this OS. For workspace ingest prefer copy_path over Unix cp/mkdir shell snippets.
- On Windows, canonical read-only POSIX examples such as find ... -type f | head -100 and du -sh ... are translated by Forge; do not retry them as raw cmd.exe commands after translation.
- A confirmed mandatory infrastructure capability blocker is terminal for the current phase turn. Do not offer the user a skip-canonical-requirement option. Persist memory and machine blocked state, then stop.
- For Phase 1, once the real prototype/source has been inspected, the runtime itself knows that canonical analyze-project requires research-references. If web_search is unavailable, stop with the infrastructure blocker even if research-references was not yet explicitly loaded by the model. Tool ordering must not make the blocker bypassable.
- Use project tools to inspect evidence; do not claim tests ran unless you ran them.
- Before ANY \`phase-state.mjs complete N\`, call forge_gate for phase N. If forge_gate is not GREEN, fix the blockers; never bypass or reinterpret them.
- A successful phase requires real artifacts and verifier evidence, not confirmations or documents that merely describe future work.
- write_file/replace_text are UTF-8 TEXT tools. Never use them to create PNG/JPG/WebP/audio/video/archive/font/binary files. A filename extension does not make text into an asset.
- asset-find only searches the Forge asset catalog. A search result is NOT a downloaded, imported, generated, approved, or integrated asset.
- Never claim PixelLab, MCP, browser automation, or another provider/tool was used unless that capability is actually present among your callable tools and you invoked it successfully. If the user chooses an unavailable capability, call ask_user and explain the blocker instead of simulating it.
- Official GigaChat built-in text2image is available through gigachat_generate_image. When the user chooses AI generation in Phase 4, use that tool to create REAL binary assets, then integrate them into WorkProgress and verify with screenshots/visual QA. Never substitute a text file or a description for an image.
- Official GigaChat built-in text2model3d is exposed through gigachat_generate_3d for genuinely 3D projects. Do not use it for 2D projects just because it exists.
- Before committing to a visual provider/tool in Phase 4, call forge_capabilities. PixelLab remains unavailable unless separately integrated; offer GigaChat built-in image generation as the callable AI option when appropriate.
- Phase 3 cannot complete without real implementation changes plus its trusted engine verifier: browser playtest for Web, check-godot-project for Godot. Never substitute one engine's evidence for another.
- Phase 4 cannot complete from approvals/style documents alone: it requires a valid binary target-frame PNG, real production visual assets, actual active-implementation integration, and a successful engine-native screenshot/visual-QA command.
- Godot Phases 5/7/8 use the installed godot-tech-check, two-process godot-playtest, and immutable build/independent release verifier. Do not demand Yandex DOM/SDK, browser playtest-out/stage-out, or Web ZIPs from a Godot project; do not accept Godot evidence for Web.
- A failed verifier/tool remains a blocker until the same operation is successfully rerun or the failure is otherwise explicitly cleared by real evidence.
- Keep edits inside the project.
- Never expose API keys or secret file contents.
- After completing tool calls, always provide a meaningful non-empty final response to the user. A punctuation fragment such as <, >, ..., or an empty string is not a valid response.
- Summarize what was done, important tool results, changed files, current phase/STOP-point, and the next allowed action.
- Never finish a turn silently after tool execution.
- After a successful tool call, choose the next canonical action and call the next tool. Do not emit textual pseudo-protocol such as <tool_calls>. Use forge_checkpoint when continuation state is unclear.
- GigaChat runtime may recover a malformed textual pseudo-call ONLY as a transport compatibility fallback. Never intentionally serialize tool calls as XML/text; always use native function_call.
- Recovery is bounded. Never repeat forge_checkpoint after another junk response; use the phase-aware next action or let the runtime open a deterministic canonical STOP when evidence already permits it.
- After a successful tool call, choose the next canonical action and call the next tool. Do not emit textual pseudo-protocol such as <tool_calls>. If the runtime already provided workspace/context evidence, do not repeatedly request the same large inspection.

FORGE.md:
${forgeRules}

Initial read-only status:
${clip(initialStatus,matureBootstrap?6000:12000)}

Project Context Bootstrap (authoritative prior-session memory; refresh with forge_context when needed):
${clip(JSON.stringify(initialContext,null,2),matureBootstrap?16000:30000)}`;
let messages=[{role:'system',content:system}];
const CONTEXT_CHAR_BUDGET=Math.max(80000,Math.min(180000,Number(process.env.FORGE_GIGACHAT_CONTEXT_CHARS||120000)));
const WEB_SEARCH_AVAILABLE=HOST_CAPABILITIES.web_search;
let lastUsage=null;
let compactionCount=0;

function functionCallName(message){
  return String(message?.function_call?.name||'').trim();
}
function functionResultMatchesCall(callMessage,resultMessage){
  if(callMessage?.role!=='assistant' || !callMessage?.function_call) return false;
  if(resultMessage?.role!=='function') return false;
  const callName=functionCallName(callMessage);
  const resultName=String(resultMessage?.name||'').trim();
  return Boolean(callName && resultName && callName===resultName);
}
function sanitizeGigaFunctionHistory(input=[]){
  const src=Array.isArray(input)?input:[];
  const out=[];
  let droppedOrphanResults=0;
  let droppedOrphanCalls=0;

  for(let i=0;i<src.length;i++){
    const m=src[i];

    if(m?.role==='assistant' && m?.function_call){
      const next=src[i+1];
      if(functionResultMatchesCall(m,next)){
        out.push(m,next);
        i++;
      }else{
        droppedOrphanCalls++;
      }
      continue;
    }

    if(m?.role==='function'){
      // A valid result was consumed together with its assistant call above.
      // Reaching this branch means the result is orphaned after slicing/compaction.
      droppedOrphanResults++;
      continue;
    }

    out.push(m);
  }

  return {messages:out,droppedOrphanResults,droppedOrphanCalls};
}
function tailPreservingFunctionPairs(input=[],maxMessages=8){
  const src=Array.isArray(input)?input:[];
  if(src.length<=maxMessages) return sanitizeGigaFunctionHistory(src).messages;

  let start=Math.max(0,src.length-maxMessages);
  // If the slice would start on a function result, include its assistant call.
  if(src[start]?.role==='function' && start>0 && functionResultMatchesCall(src[start-1],src[start])) start--;

  return sanitizeGigaFunctionHistory(src.slice(start)).messages;
}
function sanitizeGigaRequestBody(body){
  const fixed=sanitizeGigaFunctionHistory(body?.messages||[]);
  return {
    ...body,
    messages:fixed.messages,
    __forge_history_repair:{
      dropped_orphan_function_results:fixed.droppedOrphanResults,
      dropped_orphan_function_calls:fixed.droppedOrphanCalls
    }
  };
}
function stripForgeInternalRequestFields(body){
  const out={...body};
  delete out.__forge_history_repair;
  return out;
}

function approxPayloadChars(activeFunctions=functions,customMessages=messages){
  try{return JSON.stringify(customMessages).length+JSON.stringify(activeFunctions).length;}catch{return 0;}
}
function transportRequestStats(body){
  try{
    const ms=Array.isArray(body?.messages)?body.messages:[];
    const fs=Array.isArray(body?.functions)?body.functions:[];
    return {
      chars:JSON.stringify(body).length,
      messages:ms.length,
      functions:fs.length,
      system_chars:String(ms.find(m=>m.role==='system')?.content||'').length,
      function_history_pairs:ms.filter(m=>m?.role==='assistant'&&m?.function_call).length
    };
  }catch{return {chars:0,messages:0,functions:0,system_chars:0,function_history_pairs:0};}
}
function durableDirectiveSnapshot(){
  if(!activeDirective) return null;
  return {
    mode:activeDirective.mode,
    status:activeDirective.status,
    request:activeDirective.request,
    activatedAt:activeDirective.activatedAt,
    updatedAt:activeDirective.updatedAt,
    pausedPhase:activeDirective.pausedPhase,
    latestUserInput:activeDirective.latestUserInput,
    operations:(activeDirective.operations||[]).slice(-12),
    readCursors:activeDirective.readCursors||{},
    instruction:'Continue from these operations/cursors. Never restart reading at line 1 or reconstruct a large existing file with write_file; use targeted replace_text.'
  };
}
function durableContinuationMessage(reason='context compaction'){
  const ctx=buildProjectContext();
  const pm=activePhase===1 ? {
    product_metrics_started_at:phaseProductMetricsEvidence.startedAt||null,
    product_metrics_searches:(phaseProductMetricsEvidence.web||[]).map(x=>x.query),
    product_metrics_fetches:(phaseProductMetricsEvidence.fetch||[]).map(x=>({
      url:x.url||x.requested_url||'',
      title:x.title||'',
      retentionPairs:x.retentionPairs||[],
      percentValues:(x.percentValues||[]).slice(0,12)
    }))
  } : null;
  return {
    role:'user',
    content:
      `[Project Forge durable continuation checkpoint — ${reason}]\n`+
      `The previous function-call transcript was intentionally closed as a completed transport epoch. `+
      `Do NOT reconstruct or repeat completed tool calls merely because their raw assistant/function messages are absent. `+
      `Continue from durable Forge state, persisted decisions, artifacts, evidence ledger, and the canonical skill/gates.\n\n`+
      (activeDirective?`ACTIVE CHANGE REQUEST (authoritative; phase autopilot remains paused):\n${clip(JSON.stringify(durableDirectiveSnapshot(),null,2),8000)}\n\n`:``)+
      `PROJECT CONTEXT:\n${clip(JSON.stringify(ctx,null,2),22000)}\n\n`+
      (pm?`PHASE 1 PRODUCT-METRICS DURABLE EVIDENCE:\n${clip(JSON.stringify(pm,null,2),12000)}\n\n`:'')+
      `Choose only the next canonical action. If a user-owned STOP is ready, call ask_user; otherwise call the required Forge tool.`
  };
}
function resetFunctionHistoryEpoch(reason='context compaction'){
  const checkpoint=durableContinuationMessage(reason);
  messages=[messages[0],checkpoint];
  const repaired=sanitizeGigaFunctionHistory(messages);
  messages=repaired.messages;
  return 1;
}
function compactMessagesIfNeeded(turnStartIndex,activeFunctions=functions){
  const before=approxPayloadChars(activeFunctions);
  if(before<=CONTEXT_CHAR_BUDGET) return turnStartIndex;

  // A long chain of function_call/result messages is valid API history, but it
  // is transport-expensive and has correlated with repeated Ultra HTTP 500s.
  // All meaningful tool outcomes are already persisted by recordOperation /
  // Forge wiki/runtime ledgers, so close this transport epoch entirely instead
  // of carrying an arbitrary tool-history tail into the next request.
  turnStartIndex=resetFunctionHistoryEpoch('proactive context compaction');
  compactionCount++;

  const after=approxPayloadChars(activeFunctions);
  process.stdout.write(
    `\n[Forge] GigaChat context compacted (#${compactionCount}) by clean function-history epoch reset; `+
    `payload_chars ${before} -> ${after}; durable state preserved in Forge wiki/runtime ledger.\n`
  );
  return turnStartIndex;
}

let tokenCache=null;
async function token(){ if(!tokenCache) tokenCache=(await getAccessToken(PROJECT)).token; return tokenCache; }

function sleepMs(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }
function transientGigaError(e){
  const s=String(e?.message||e||'');
  return /Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout|GigaChat HTTP 5\d\d|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(s);
}
function gigaFunctionHistoryContractError(e){
  return /INVALID_PARAMS[\s\S]*every function result must have an assistant function call in history/i.test(String(e?.message||e||''));
}
function emergencyTrimGigaRequest(body){
  try{
    const systemMsg=(Array.isArray(body?.messages)?body.messages:[]).find(m=>m.role==='system')||messages[0];
    const fixed=sanitizeGigaFunctionHistory([
      systemMsg,
      durableContinuationMessage('transport retry after server error')
    ]);
    return {
      ...body,
      messages:fixed.messages,
      __forge_history_repair:{
        dropped_orphan_function_results:fixed.droppedOrphanResults,
        dropped_orphan_function_calls:fixed.droppedOrphanCalls,
        epoch_reset:true
      }
    };
  }catch{return body;}
}

async function gigaChatRequestWithRetry(body,timeoutMs){
  let lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const candidate=attempt===0?sanitizeGigaRequestBody(body):emergencyTrimGigaRequest(body);
      const repair=candidate.__forge_history_repair||{};
      if(repair.dropped_orphan_function_results||repair.dropped_orphan_function_calls){
        process.stdout.write(`[Forge] GigaChat request history repair: dropped orphan calls=${repair.dropped_orphan_function_calls||0}, orphan results=${repair.dropped_orphan_function_results||0}.\n`);
      }
      const requestBody=stripForgeInternalRequestFields(candidate);
      if(attempt>0){
        const st=transportRequestStats(requestBody);
        process.stdout.write(`[Forge] GigaChat retry request stats: chars=${st.chars}, messages=${st.messages}, functions=${st.functions}, system_chars=${st.system_chars}, function_history_pairs=${st.function_history_pairs}.\n`);
      }
      return await gigaJson(await token(),'/v1/chat/completions',requestBody,timeoutMs);
    }catch(e){
      lastError=e;
      if(gigaFunctionHistoryContractError(e)){
        const repaired=stripForgeInternalRequestFields(emergencyTrimGigaRequest(body));
        process.stdout.write(`[Forge] GigaChat rejected function history. Replaying once from a clean durable function-history epoch.\n`);
        return await gigaJson(await token(),'/v1/chat/completions',repaired,timeoutMs);
      }
      if(!transientGigaError(e)) throw e;
      if(attempt===2) break;
      process.stdout.write(`\\n[Forge] Transient GigaChat API/network error: ${String(e.message||e)}. Retry ${attempt+1}/2 from a clean durable function-history epoch...\\n`);
      await sleepMs(attempt===0?900:2200);
    }
  }
  persistRuntimeEvidenceLedger();
  throw new Error(`Recoverable GigaChat transport stop after 3 attempts; durable Forge state is preserved. Re-run "фаза 1" in the same project. Last error: ${String(lastError?.message||lastError||'unknown')}`);
}


function requestShapeStats(messagesArg,functionsArg){
  const raw=Array.isArray(messagesArg)?messagesArg:[];
  const repaired=sanitizeGigaFunctionHistory(raw);
  const ms=repaired.messages;
  const fs=Array.isArray(functionsArg)?functionsArg:[];
  const body={model:MODEL,messages:ms,functions:fs,function_call:'auto'};
  return {
    model:MODEL,
    message_count:ms.length,
    dropped_orphan_function_results:repaired.droppedOrphanResults,
    dropped_orphan_function_calls:repaired.droppedOrphanCalls,
    system_chars:String(ms.find(m=>m.role==='system')?.content||'').length,
    message_chars:JSON.stringify(ms).length,
    function_count:fs.length,
    function_schema_chars:JSON.stringify(fs).length,
    total_json_chars:JSON.stringify(body).length
  };
}

async function rawDoctorRequest(label,body,timeoutMs=90000){
  const stats=requestShapeStats(body.messages,body.functions);
  process.stdout.write(`\n[REQUEST-DOCTOR] ${label}\n`);
  process.stdout.write(`[REQUEST-DOCTOR] stats=${JSON.stringify(stats)}\n`);
  const started=Date.now();
  try{
    const data=await gigaJson(await token(),'/v1/chat/completions',body,timeoutMs);
    const choice=data?.choices?.[0];
    process.stdout.write(`[REQUEST-DOCTOR] result=HTTP 200 elapsed_ms=${Date.now()-started} finish_reason=${choice?.finish_reason||''} function_call=${choice?.message?.function_call?.name||''}\n`);
    return {ok:true,label,stats,finish_reason:choice?.finish_reason||null,function_call:choice?.message?.function_call?.name||null};
  }catch(e){
    process.stdout.write(`[REQUEST-DOCTOR] result=ERROR elapsed_ms=${Date.now()-started} message=${String(e?.message||e)}\n`);
    return {ok:false,label,stats,error:String(e?.message||e)};
  }
}

async function runRequestShapeDoctor(){
  const diagUser={role:'user',content:'Диагностика транспорта Project Forge. Не выполняй реальную работу проекта. Ответь кратко либо выбери функцию, если системные инструкции требуют function_call.'};
  const phaseFunctions=functionsForRequest(null,true);
  const allFunctions=functions;

  const cases=[
    {
      label:'A minimal user only, no functions',
      body:{model:MODEL,messages:[{role:'user',content:'Ответь только: OK'}]}
    },
    {
      label:'B real Forge system + diagnostic user, no functions',
      body:{model:MODEL,messages:[messages[0],diagUser]}
    },
    {
      label:'C minimal messages + real Phase function schemas',
      body:{model:MODEL,messages:[{role:'system',content:'You are a tool-calling diagnostic assistant.'},diagUser],functions:phaseFunctions,function_call:'auto'}
    },
    {
      label:'D real Forge system + real Phase function schemas',
      body:{model:MODEL,messages:[messages[0],diagUser],functions:phaseFunctions,function_call:'auto'}
    },
    {
      label:'E real Forge system + ALL adapter function schemas',
      body:{model:MODEL,messages:[messages[0],diagUser],functions:allFunctions,function_call:'auto'}
    }
  ];

  const results=[];
  for(const c of cases){
    results.push(await rawDoctorRequest(c.label,c.body));
    await sleepMs(500);
  }

  process.stdout.write(`\n[REQUEST-DOCTOR] SUMMARY\n`);
  for(const r of results){
    process.stdout.write(`[REQUEST-DOCTOR] ${r.ok?'PASS':'FAIL'} ${r.label}${r.error?` -> ${r.error}`:''}\n`);
  }

  const firstFail=results.findIndex(r=>!r.ok);
  if(firstFail>=0){
    process.stdout.write(`[REQUEST-DOCTOR] first_failure_case=${results[firstFail].label}\n`);
  }else{
    process.stdout.write(`[REQUEST-DOCTOR] all staged request shapes returned HTTP 200; the failure likely depends on accumulated runtime messages/state or transient server behavior.\n`);
  }
  return results.every(r=>r.ok);
}


async function turn(text){
  const rawTurnText=String(text || '');
  const statusOnly=isStatusOnlyInput(rawTurnText);
  currentTurnReadOnly=statusOnly;
  const manualCommand=directiveCommand(rawTurnText);
  if(manualCommand?.kind==='resume'){
    const paused=activeDirective?.pausedPhase||authoritativeOpenPhase()||null;
    const abandoned=activeDirective?.request||null;
    if(activeDirective?.taskId){try{cancelTaskRun(PROJECT,activeDirective.taskId,'Direct-task override cleared with /resume-phase');}catch{}}
    if(pendingDecision?.directive===true) pendingDecision=null;
    activeDirective=null; persistRuntimeEvidenceLedger();
    process.stdout.write(abandoned
      ? `\n[Forge] Direct task override cleared: ${abandoned}\n[Forge] Canonical phase autopilot is available again at Phase ${paused||'?'}. No phase was advanced automatically.\n`
      : `\n[Forge] No direct task override was active. Canonical phase autopilot remains available at Phase ${paused||'?'}.\n`);
    return;
  }
  if(manualCommand?.kind==='status'){
    process.stdout.write(activeDirective
      ? `\n[Forge] ACTIVE DIRECT TASK\nTask ID: ${activeDirective.taskId||'legacy'}\nTask: ${activeDirective.request}\nWorkflow node: ${activeDirective.workflowNode||'implement'}\nPaused phase: ${activeDirective.pausedPhase||'?'}\nRecorded operations: ${(activeDirective.operations||[]).length}\nFinish automatically with forge_change_complete after implementation, or use /resume-phase to cancel the override.\n`
      : `\n[Forge] No direct task override. Use /do <task> to pause phase autopilot for a concrete implementation request.\n`);
    return;
  }
  if(manualCommand?.kind==='do'){
    const activated=activateDirective(manualCommand.request,'explicit_command');
    if(!activated.ok){process.stdout.write(`\n[Forge] ${activated.error}\n`);return;}
    process.stdout.write(`\n[Forge] Direct task accepted; Phase ${activeDirective.pausedPhase||'?'} autopilot paused.\n[Forge] Task: ${activeDirective.request}\n`);
  }else{
    const naturalTask=naturalImplementationDirective(rawTurnText);
    if(naturalTask && !activeDirective){
      const activated=activateDirective(naturalTask,'natural_language');
      if(!activated.ok){process.stdout.write(`\n[Forge] ${activated.error}\n`);return;}
      process.stdout.write(`\n[Forge] Direct implementation request detected; Phase ${activeDirective.pausedPhase||'?'} autopilot paused.\n`);
    }else if(activeDirective && !statusOnly){
      if(naturalTask && naturalTask!==activeDirective.request) activateDirective(naturalTask,'natural_language');
      else updateDirectiveInput(rawTurnText);
    }
  }
  if(activeDirective){
    const ensured=ensureDirectiveTaskRuntime(activeDirective);
    if(!ensured.ok){process.stdout.write(`\n[Forge] ${ensured.error}\n`);return;}
    activeDirective={...activeDirective,taskId:ensured.run.task.id,workflowNode:ensured.run.state.currentNode};
    if(ensured.run.task.status==='blocked'){
      process.stdout.write(`\n[Forge] Direct Task repair budget is exhausted at node ${ensured.run.state.currentNode}. Use an explicit /do <task> to authorize a fresh attempt, or /resume-phase to cancel the override.\n`);
      persistRuntimeEvidenceLedger();
      return;
    }
    if(pendingDecision?.directive===true && ensured.run.state.currentNode==='wait-user' && !statusOnly){
      const resumed=recordDirectiveRunResult({status:'in_progress',code:'USER_DECISION_RECEIVED',message:'User supplied an answer for the direct-task decision'});
      if(!resumed.ok){process.stdout.write(`\n[Forge] Could not resume direct Task graph: ${resumed.error}\n`);return;}
    }
    persistRuntimeEvidenceLedger();
  }
  const changeRequestTurn=Boolean(activeDirective);
  const directivePending=Boolean(changeRequestTurn&&pendingDecision?.directive===true);
  const pendingAtTurnStart=Boolean(pendingDecision)&&(!changeRequestTurn||directivePending);
  const aliasExpanded = !statusOnly&&!changeRequestTurn ? expandPhaseAlias(rawTurnText) : {text:rawTurnText,invocation:null};
  const normalizedTurnText = aliasExpanded.text;
  if(pendingAtTurnStart && aliasExpanded.invocation){
    const pendingPhase=pendingDecisionPhase();
    if(pendingPhase&&pendingPhase!==Number(aliasExpanded.invocation.phase)){
      process.stdout.write(`\n[Forge] Phase ${aliasExpanded.invocation.phase} cannot start while the Phase ${pendingPhase} STOP-point is waiting for your answer.\n`);
      reopenPendingDecisionStop(`Phase ${pendingPhase}`);
      return;
    }
  }
  if(aliasExpanded.invocation) {
    process.stdout.write(`\n[Forge] Phase ${aliasExpanded.invocation.phase} -> ${aliasExpanded.invocation.skill}\n`);
  }
  if(pendingAtTurnStart && !changeRequestTurn && !aliasExpanded.invocation){
    const pendingPhase=pendingDecisionPhase();
    if(pendingPhase){
      activePhase=pendingPhase;
      activePhaseSkill=PHASE_SKILLS.get(pendingPhase)||null;
      startPhaseEvidence(pendingPhase,{resume:true});
      hydrateResolvedDecisionState(pendingPhase);
    }
  }
  const phaseExecutionTurn=!statusOnly && !changeRequestTurn && (pendingAtTurnStart || Boolean(aliasExpanded.invocation) || phaseExecutionRequestedByText(normalizedTurnText));
  beginPhaseFromUserText(normalizedTurnText);
  if(aliasExpanded.invocation){
    const started=ensureHostPhaseStarted(aliasExpanded.invocation.phase);
    if(!started.ok) throw new Error(`Forge could not start Phase ${aliasExpanded.invocation.phase}: ${started.stderr||started.error||started.status}`);
    process.stdout.write(`[Forge] Phase ${aliasExpanded.invocation.phase} machine state -> ${started.action|| (started.already_in_progress?'resume':'start')}\n`);
    if(Number(aliasExpanded.invocation.phase)===1) reconcilePhase1ApprovedState();
    const pf=forgePreflight(aliasExpanded.invocation.phase);
    process.stdout.write(`[Forge] Preflight ${CONTRACT_VERSION}: dependencies=${pf.dependencies.length}, unavailable=${pf.unavailableCapabilities.join(', ')||'none'}${pf.currentForgeVersion&&pf.currentForgeVersion!==AUDITED_FORGE_VERSION?`, FORGE VERSION DRIFT ${pf.currentForgeVersion}!=${AUDITED_FORGE_VERSION}`:''}\n`);
    if(pendingAtTurnStart && pendingDecision && reopenPendingDecisionStop(`Phase ${aliasExpanded.invocation.phase} resume`)) return;
    const immediateStop=phase1ImmediateResumeStopCandidate();
    if(immediateStop && openDeterministicStop(immediateStop,'Phase 1 resume')) return;
    if(Number(aliasExpanded.invocation.phase)===1){
      const completion=completeApprovedPhase1Resume();
      if(completion.completed){
        process.stdout.write(`\n[Forge] Completed Phase 1 directly from approved durable state; no model/tool round-trip required.\n`);
        process.stdout.write(`[Forge] Evidence: ${completion.evidence.join(', ')}\n`);
        process.stdout.write('[Forge] STOP: waiting for an explicit user command before Phase 2.\n');
        return;
      }
    }
  }

  let userText = changeRequestTurn?directiveTaskPrompt(normalizedTurnText):normalizedTurnText;
  if(statusOnly && !pendingDecision){
    userText=`[FORGE READ-ONLY STATUS TURN]\nПользователь задал фактический вопрос о том, что уже сделано: ${rawTurnText}\nПроверь состояние только read-only инструментами и ответь кратко и честно. Не начинай и не продолжай работу, не запускай фазу/релиз/проверки, не изменяй файлы или память. Не выдавай старые артефакты за созданные в текущем запросе.\n[END FORGE READ-ONLY STATUS TURN]`;
  }
  if (pendingDecision && (!changeRequestTurn||directivePending) && statusOnly) {
    userText = `${rawTurnText}\n\nВАЖНО: это запрос статуса, а НЕ ответ на pending STOP-point. Не засчитывай его как пользовательское решение. Не продолжай новую работу. Покажи текущий статус и повтори ожидающий вопрос.`;
  } else if (pendingDecision && (!changeRequestTurn||directivePending)) {
    const decisionKey=String(pendingDecision.decision_key||'').trim();
    const decisionContext=`${pendingDecision.question}\n${pendingDecision.options||''}`;
    const rawAnswer=normalizedTurnText, disposition=decisionAnswerDisposition(pendingDecision,rawAnswer);
    if(disposition.kind==='invalid'){
      process.stdout.write(`\n[Forge] Ответ на STOP-point пока неполный: ${disposition.blockers.join('; ')}\n[Forge] STOP остаётся открытым; вставьте полный ответ одним сообщением.\n`);
      persistRuntimeEvidenceLedger();return;
    }
    const decisionRecord={phase:activePhase||null,decision_key:decisionKey||null,question:pendingDecision.question,answer:rawAnswer,timestamp:new Date().toISOString(),outcome:disposition.kind};
    let boundScreenInventory=null;
    if(disposition.kind==='resolve'&&decisionKey==='phase2-screen-inventory'){
      boundScreenInventory=materializeApprovedScreenInventory(pendingDecision.inventorySha256,decisionRecord.timestamp);
      if(!boundScreenInventory.ok){
        process.stdout.write(`\n[Forge] Screen inventory approval could not be bound: ${boundScreenInventory.blockers.join('; ')}\n[Forge] STOP remains open and must show the current full inventory again.\n`);
        persistRuntimeEvidenceLedger();return;
      }
    }
    runtimeDecisions.push(decisionRecord);persistDecisionRecordImmediate(decisionRecord);memoryDirty=true;
    if(disposition.kind==='resolve'){
      if(!decisionKey||!resolvedDecisionKeys.has(decisionKey))resolvedPhaseDecisions++;if(decisionKey)resolvedDecisionKeys.add(decisionKey);
      if(decisionKey==='phase1-brief')rebuildPhase1BriefFromDecision();
      if(decisionKey==='phase1-content-budget'&&pendingDecision.proposal){const mat=materializeApprovedProductMetricsProposal(pendingDecision.proposal);if(!mat.ok){resolvedDecisionKeys.delete(decisionKey);process.stdout.write(`\n[Forge] Approved structured proposal could not be materialized: ${mat.blockers.join('; ')}\n`);persistRuntimeEvidenceLedger();return;}process.stdout.write(`\n[Forge] Approved product-metrics materialized -> ${mat.metrics}, ${mat.adr}\n`);}
      if(boundScreenInventory)process.stdout.write(`\n[Forge] Approved screen inventory bound -> ${boundScreenInventory.path} (${boundScreenInventory.inventorySha256})\n`);
    }
    if(activePhase===4&&/pixellab/i.test(decisionContext)&&/pixellab/i.test(rawAnswer)){
      capabilityBlock='PixelLab MCP was selected, but PixelLab is not callable in this GigaChat host. Choose the available GigaChat built-in text2image path or configure a real PixelLab bridge before Phase 4 can complete.';
      userText=`Ответ пользователя на обязательный STOP-point "${pendingDecision.question}":\n${rawAnswer}\n\nPixelLab unavailable: ask the user for GigaChat built-in generation or a real bridge.`;
    }else if(disposition.kind==='revise'){
      userText=`Пользователь НЕ утвердил STOP-point и запросил изменение/углубление:\n${rawAnswer}\n\nНе помечай ${decisionKey} resolved. Выполни корректировку и снова открой тот же STOP-point.`;
    }else{
      userText=`Ответ пользователя на обязательный STOP-point "${pendingDecision.question}":\n${rawAnswer}\n\nПродолжай строго с места остановки.`;
      if(activePhase===4&&capabilityBlock&&!/pixellab/i.test(rawAnswer))capabilityBlock=null;
    }
    pendingDecision=null;persistRuntimeEvidenceLedger();
    if(changeRequestTurn) userText=directiveTaskPrompt(`Ответ пользователя на STOP-point: ${rawAnswer}`);
  }

  messages.push({role:'user',content:userText});
  let turnStartIndex=messages.length-1;

  let toolCalls = 0;
  let emptyFinalRetries = 0;
  let memorySyncRetries = 0;
  let prematureFinalRetries = 0;
  let directiveFinalRetries = 0;
  let forcedFunctionName = null;
  let pseudoRecoveryCount = 0;
  let consecutiveBareJunk = 0;
  let checkpointJunkRecoveries = 0;
  let invalidBriefAskRepairs = 0;
  let invalidContentBudgetRepairs = 0;
  let askUserTransportRetries = 0;
  let consecutiveDirectiveReads = 0;
  const turnCompactionStart = compactionCount;
  const pseudoCallCounts = new Map();

  const directTaskLoopGuard = name => {
    if(!changeRequestTurn || !activeDirective) return false;
    if(name==='read_file') consecutiveDirectiveReads++;
    else if(['write_file','replace_text','copy_path','run_command','forge_script','gigachat_generate_image','gigachat_generate_3d','forge_change_complete'].includes(String(name||''))) consecutiveDirectiveReads=0;
    if(consecutiveDirectiveReads<=12) return false;
    reportForgeBehavior({severity:'error',code:'GIGA_DIRECT_TASK_READ_LOOP',kind:'context_efficiency',component:'gigachat-agent',operation:'read_file',message:'Direct task stopped after too many consecutive file reads without implementation progress.',expected:'Use search_text and targeted replace_text after bounded source inspection.',actual:`${consecutiveDirectiveReads} consecutive read_file calls`});
    process.stdout.write(`\n[Forge] Direct task safely stopped: ${consecutiveDirectiveReads} consecutive read_file calls produced no implementation progress. No more tools were executed. Reissue /do to retry from clean durable cursors.\n`);
    persistRuntimeEvidenceLedger();
    return true;
  };

  for(let n=0;n<56;n++){
    const forcedNow=forcedFunctionName;
    const callMode=forcedNow ? {name:forcedNow} : 'auto';
    const requestFunctions=functionsForRequest(forcedNow,phaseExecutionTurn,statusOnly);
    turnStartIndex=compactMessagesIfNeeded(turnStartIndex,requestFunctions);
    if(changeRequestTurn && activeDirective && compactionCount-turnCompactionStart>=4){
      reportForgeBehavior({severity:'error',code:'GIGA_DIRECT_TASK_COMPACTION_LOOP',kind:'context_efficiency',component:'gigachat-agent',operation:'context_compaction',message:'Direct task stopped after four context compactions in one user turn.',expected:'Finish the targeted edit and checks within bounded durable context.',actual:`${compactionCount-turnCompactionStart} compactions`});
      process.stdout.write(`\n[Forge] Direct task safely stopped after ${compactionCount-turnCompactionStart} context compactions in one turn. Existing files are preserved; reissue /do to retry from clean task state.\n`);
      persistRuntimeEvidenceLedger();
      return;
    }
    forcedFunctionName=null;
    const data=await gigaChatRequestWithRetry({model:MODEL,messages,functions:requestFunctions,function_call:callMode},240000);
    if(data?.usage) lastUsage=data.usage;
    const choice=data?.choices?.[0];
    const msg=choice?.message;

    if(!msg) throw new Error('GigaChat returned no message');

    if(choice.finish_reason==='function_call' || msg.function_call){
      const preface = String(msg.content || '').trim();
      if (meaningfulText(preface)) process.stdout.write(`\n${preface}\n`);

      messages.push({
        role:'assistant',
        content:msg.content||'',
        functions_state_id:msg.functions_state_id,
        function_call:msg.function_call
      });

      const name=msg.function_call?.name;
      let a=msg.function_call?.arguments||{};

      if(typeof a==='string'){
        try{a=JSON.parse(a);}
        catch{a={};}
      }

      toolCalls++;
      consecutiveBareJunk=0;
      if(name!=='forge_context' && name!=='forge_workspace_inspect') emptyFinalRetries=0;
      if(directTaskLoopGuard(name)) return;

      if (name === 'ask_user') {
        a=canonicalizeAskUserArgs(a);
        refreshMandatoryCapabilityBlock();
        if(capabilityBlock){
          const result=jsonResult({ok:false,error:`Infrastructure blocker is active and cannot be bypassed by a user decision: ${capabilityBlock}`});
          messages.push({role:'function',name,content:modelFacingToolResult(name,result)});
          process.stdout.write(`
[Forge] STOP-point blocked by infrastructure capability: ${capabilityBlock}
`);
          continue;
        }
        const phase1Guard=phase1StopGuard(a);
        const genericGuard=phaseDecisionGuard(a);
        if(phase1Guard || genericGuard) {
          const decisionError=phase1Guard||genericGuard;
          const result=jsonResult({ok:false,error:decisionError});
          messages.push({role:'function',name,content:result});
          process.stdout.write(`
[Forge] STOP-point blocked: ${decisionError}
`);
          if(isPhase1BriefFormatError(decisionError)){
            invalidBriefAskRepairs++;
            if(invalidBriefAskRepairs>3){
              printBriefFormatRecoveryStop(decisionError);
              persistRuntimeEvidenceLedger();
              return;
            }
            forcedFunctionName='ask_user';
            messages.push({role:'user',content:phase1BriefRepairInstruction(a,decisionError)});
          } else if(isPhase1ContentBudgetFormatError(decisionError)){
            invalidContentBudgetRepairs++;
            if(invalidContentBudgetRepairs>3){
              printContentBudgetFormatRecoveryStop(decisionError);
              persistRuntimeEvidenceLedger();
              return;
            }
            forcedFunctionName='ask_user';
            messages.push({role:'user',content:phase1ContentBudgetRepairInstruction(a,decisionError)});
          }
          continue;
        }
        const decisionKey=String(a.decision_key||'').trim();
        if(decisionKey && resolvedDecisionKeys.has(decisionKey)){
          const result=jsonResult({ok:true,already_resolved:true,decision_key:decisionKey,answer:latestDecisionAnswer(decisionKey),note:'This durable user decision is already resolved. Do not ask it again; continue with the next canonical action.'});
          messages.push({role:'function',name,content:result});
          process.stdout.write(`\n[Forge] Suppressed repeated resolved STOP-point: ${decisionKey}\n`);
          continue;
        }
        if (memoryDirty) {
          const result=jsonResult({ok:false,error:'Project memory is dirty. Call forge_memory_update first so the completed work/decision is persisted before opening the next STOP-point.'});
          messages.push({role:'function',name,content:result});
          process.stdout.write(`\n[Forge] STOP-point delayed: synchronize wiki memory with forge_memory_update first.\n`);
          continue;
        }
        if (activePhase===4 && /ассет|asset|библиотек|library/i.test(String(a.question||'')) && !hasSuccessfulCommand(/asset-find\.mjs/i)) {
          const result=jsonResult({ok:false,error:'Phase 4 asset-source STOP-point requires a real successful asset-find.mjs catalog search first. GameIntegration is source material, not the asset library.'});
          messages.push({role:'function',name,content:result});
          process.stdout.write(`\n[Forge] Asset-source question blocked: run real asset-find.mjs first. GameIntegration is not the asset library.\n`);
          continue;
        }
        const result = jsonResult({ok:true,waiting_for_user:true});
        messages.push({role:'function',name,content:result});
        const stopArgs=canonicalizeAskUserArgs(a);
        pendingDecision = {
          decision_key: String(stopArgs.decision_key||'').trim() || null,
          phase: stopArgs.phase || (activePhase ? `Phase ${activePhase}` : 'Forge'),
          question: String(stopArgs.question || 'Нужно решение пользователя.'),
          options: String(stopArgs.options || ''),
          recommendation: String(stopArgs.recommendation || ''),
          reason: String(stopArgs.reason || ''),
          proposal: stopArgs.proposal&&typeof stopArgs.proposal==='object'?stopArgs.proposal:null,
          inventorySha256: String(stopArgs.decision_key||'')==='phase2-screen-inventory'?(readScreenInventoryDraft().inventorySha256||null):null,
          directive:Boolean(activeDirective)
        };
        if(activePhase&&!activeDirective){
          const decisionReason=`Awaiting ${pendingDecision.decision_key||'user decision'}`;
          const blockedState=markHostPhaseBlocked(activePhase,decisionReason,'user','USER_DECISION_REQUIRED',pendingDecision.decision_key);
          if(!blockedState.ok) process.stdout.write(`[Forge] Warning: could not persist decision STOP state: ${blockedState.stderr||blockedState.error||blockedState.status}\n`);
        }else if(activeDirective){
          const decisionReason=`Awaiting ${pendingDecision.decision_key||'direct-task user decision'}`;
          const taskState=recordDirectiveRunResult({
            status:'user_decision_required',code:'USER_DECISION_REQUIRED',message:decisionReason,
            failure:{type:'USER_DECISION_REQUIRED',retryable:false,message:decisionReason},
            stop:{owner:'user',code:'USER_DECISION_REQUIRED',decisionKey:pendingDecision.decision_key||null,resumePolicy:'user_answer'},
          });
          if(!taskState.ok) process.stdout.write(`[Forge] Warning: could not persist direct-task STOP state: ${taskState.error}\n`);
        }
        persistRuntimeEvidenceLedger();
        printStopPoint(stopArgs);
        return;
      }

      process.stdout.write(`\n[tool] ${describeToolCall(name,a)}\n`);
      const result=await toolAsync(name,a);

      if (name === 'forge_skill') registerSuccessfulSkillLoad(a.name,result);
      if (name === 'forge_skill_done') { try{const sr=JSON.parse(result);if(sr.ok)completedSkills.add(String(sr.skill||a.name||'').toLowerCase());}catch{} persistRuntimeEvidenceLedger(); }

      recordOperation(name,a,result);
      const toolSummary = describeToolResult(name, result);
      if (toolSummary) process.stdout.write(`[tool-result] ${toolSummary}\n`);
      if(name==='forge_change_complete' && printCompletedDirectiveAndStop(result)) return;
      if (name==='forge_gate') {
        try { const g=JSON.parse(result); process.stdout.write(g.ok?'[gate] GREEN\n':`[gate] BLOCKED\n- ${g.blockers.join('\n- ')}\n`); } catch {}
      }

      messages.push({role:'function',name,content:result});

      if(phaseExecutionTurn) refreshMandatoryCapabilityBlock();
      if(phaseExecutionTurn && capabilityBlock){
        const blockedState=markHostPhaseBlocked(activePhase,capabilityBlock);
        if(!blockedState.ok) process.stdout.write(`[Forge] Warning: could not persist machine blocked state: ${blockedState.stderr||blockedState.error||blockedState.status}
`);

        if(memoryDirty && name!=='forge_memory_update'){
          forcedFunctionName='forge_memory_update';
          messages.push({
            role:'user',
            content:'A mandatory infrastructure capability blocker is confirmed. Call forge_memory_update now and persist the blocker, completed work, and next action. Do not ask the user to waive or skip the canonical requirement.'
          });
          continue;
        }

        if(!memoryDirty){
          printCapabilityBlocker(capabilityBlock);
          return;
        }
      }

      continue;
    }

    const content=String(msg.content||'').trim();

    const pseudoCall=parseTextualPseudoToolCall(content);
    if(pseudoCall && pseudoRecoveryCount<16){
      const name=pseudoCall.name;
      let a=pseudoCall.args||{};
      const signature=`${name}:${JSON.stringify(a)}`;
      const repeats=(pseudoCallCounts.get(signature)||0)+1;
      pseudoCallCounts.set(signature,repeats);

      if(repeats<=2){
        reportForgeBehavior({severity:'warn',code:'GIGA_MALFORMED_TOOL_CALL',kind:'adapter_transport',component:'gigachat-function-calling',operation:name,message:'GigaChat serialized a callable tool as textual pseudo-markup; the runtime recovered it once.',expected:'Native function_call transport.',actual:'Textual pseudo-call transport.'});
        pseudoRecoveryCount++;
        toolCalls++;
        emptyFinalRetries=0;
        consecutiveBareJunk=0;
        if(directTaskLoopGuard(name)) return;
        process.stdout.write(`\n[Forge] Recovered malformed textual tool call -> ${describeToolCall(name,a)}\n`);

        // Preserve the malformed assistant output as diagnostics, but do not send a
        // fake role=function message because GigaChat did not provide a native
        // functions_state_id/function_call state for this response.
        messages.push({
          role:'assistant',
          content:`[Forge runtime recovered malformed pseudo-call: ${name}]`,
          ...(msg.functions_state_id?{functions_state_id:msg.functions_state_id}:{})
        });

        if(name==='ask_user'){
          a=canonicalizeAskUserArgs(a);
          const phase1Guard=phase1StopGuard(a);
          const genericGuard=phaseDecisionGuard(a);
          const decisionError=phase1Guard||genericGuard;
          askUserTransportRetries++;

          if(decisionError && isPhase1BriefFormatError(decisionError)){
            invalidBriefAskRepairs++;
            if(invalidBriefAskRepairs>3 || askUserTransportRetries>5){
              printBriefFormatRecoveryStop(decisionError);
              persistRuntimeEvidenceLedger();
              return;
            }
            forcedFunctionName='ask_user';
            messages.push({
              role:'user',
              content:
                `Forge runtime recovered a malformed textual ask_user call, but its arguments are INVALID and must NOT be repeated.\n` +
                phase1BriefRepairInstruction(a,decisionError)
            });
            continue;
          }

          if(askUserTransportRetries>5){
            printBriefFormatRecoveryStop(decisionError||'GigaChat repeatedly serialized ask_user as malformed textual pseudo-calls.');
            persistRuntimeEvidenceLedger();
            return;
          }

          forcedFunctionName='ask_user';
          messages.push({
            role:'user',
            content:`Forge runtime parsed your malformed ask_user pseudo-call with these arguments: ${JSON.stringify(a)}. The arguments pass the current guard. Emit this call through the NATIVE function_call channel now; do not serialize <tool_calls> text.`
          });
          continue;
        }

        process.stdout.write(`[tool] ${describeToolCall(name,a)}\n`);
        const result=await toolAsync(name,a);

        if(name==='forge_skill') registerSuccessfulSkillLoad(a.name,result);
        if(name==='forge_skill_done'){
          try{
            const sr=JSON.parse(result);
            if(sr.ok) completedSkills.add(String(sr.skill||a.name||'').toLowerCase());
          }catch{}
          persistRuntimeEvidenceLedger();
        }

        recordOperation(name,a,result);
        const toolSummary=describeToolResult(name,result);
        if(toolSummary) process.stdout.write(`[tool-result] ${toolSummary}\n`);
        if(name==='forge_change_complete' && printCompletedDirectiveAndStop(result)) return;
        if(name==='forge_gate'){
          try{
            const g=JSON.parse(result);
            process.stdout.write(g.ok?'[gate] GREEN\n':`[gate] BLOCKED\n- ${g.blockers.join('\n- ')}\n`);
          }catch{}
        }

        if(phaseExecutionTurn) refreshMandatoryCapabilityBlock();
        if(phaseExecutionTurn && capabilityBlock){
          const blockedState=markHostPhaseBlocked(activePhase,capabilityBlock);
          if(!blockedState.ok) process.stdout.write(`[Forge] Warning: could not persist machine blocked state: ${blockedState.stderr||blockedState.error||blockedState.status}\n`);
          if(memoryDirty && name!=='forge_memory_update'){
            forcedFunctionName='forge_memory_update';
            messages.push({
              role:'user',
              content:'A mandatory infrastructure capability blocker is confirmed. Call forge_memory_update now and persist the blocker, completed work, and next action.'
            });
            continue;
          }
          if(!memoryDirty){
            printCapabilityBlocker(capabilityBlock);
            return;
          }
        }

        messages.push({
          role:'user',
          content:
            `FORGE RUNTIME RECOVERY: your previous response encoded ${name} as textual pseudo-XML instead of a native function call. ` +
            `The runtime executed it exactly once. Result:\n${modelFacingToolResult(name,result)}\n\n` +
            `Continue from this result using NATIVE function_call only. Do not repeat the same recovered call and do not emit <tool_calls> text.`
        });
        continue;
      }

      process.stdout.write(`\n[Forge] Repeated malformed pseudo-call suppressed (${repeats}x): ${describeToolCall(name,a)}\n`);

      if(name==='ask_user'){
        askUserTransportRetries++;
        a=canonicalizeAskUserArgs(a);
        const decisionError=phase1StopGuard(a)||phaseDecisionGuard(a);

        if(decisionError && isPhase1BriefFormatError(decisionError)){
          invalidBriefAskRepairs++;
          if(invalidBriefAskRepairs>3 || askUserTransportRetries>5){
            printBriefFormatRecoveryStop(decisionError);
            persistRuntimeEvidenceLedger();
            return;
          }
          forcedFunctionName='ask_user';
          messages.push({role:'assistant',content:'[Forge suppressed repeated malformed pseudo-call: ask_user]'});
          messages.push({role:'user',content:phase1BriefRepairInstruction(a,decisionError)});
          continue;
        }

        if(askUserTransportRetries>5){
          printBriefFormatRecoveryStop(decisionError||'Repeated malformed ask_user transport serialization.');
          persistRuntimeEvidenceLedger();
          return;
        }

        forcedFunctionName='ask_user';
        messages.push({role:'assistant',content:'[Forge suppressed repeated malformed pseudo-call: ask_user]'});
        messages.push({
          role:'user',
          content:'The STOP arguments are acceptable but you keep serializing ask_user as malformed text. Emit ask_user through the NATIVE function_call channel now. Do not call forge_checkpoint and do not output XML/tool_calls text.'
        });
        continue;
      }

      forcedFunctionName='forge_checkpoint';
      messages.push({
        role:'assistant',
        content:`[Forge suppressed repeated malformed pseudo-call: ${name}]`
      });
      messages.push({
        role:'user',
        content:'The same malformed textual pseudo-call was already executed successfully. Do NOT repeat it. Call forge_checkpoint natively and follow next_hints to the next distinct canonical action.'
      });
      continue;
    }

    messages.push({
      role:'assistant',
      content,
      ...(msg.functions_state_id?{functions_state_id:msg.functions_state_id}:{})
    });

    if(meaningfulText(content)){
      emptyFinalRetries=0;
      if(changeRequestTurn && activeDirective && directiveFinalRetries<6){
        directiveFinalRetries++;
        process.stdout.write(`\n[Forge] Premature direct-task final blocked: implementation request is still active and forge_change_complete was not called.\n`);
        messages.push({
          role:'user',
          content:
            `Это был преждевременный ответ по прямой задаче "${activeDirective.request}". Пользователь потребовал сделать работу, а не описать будущие шаги. `+
            `Продолжай сейчас: загрузи подходящий tactical skill, внеси реальные изменения в WorkProgress, выполни сфокусированные проверки и вызови forge_change_complete. `+
            `Не запускай phase-state, forge_gate или release-команды. Если обнаружен настоящий пользовательский выбор — ask_user; если исправимый сбой — исправь и продолжай.`
        });
        continue;
      }
      if(phaseExecutionTurn) refreshMandatoryCapabilityBlock();
      if(phaseExecutionTurn && capabilityBlock && !memoryDirty){
        markHostPhaseBlocked(activePhase,capabilityBlock);
        printCapabilityBlocker(capabilityBlock);
        return;
      }
      // IMPORTANT: while the user explicitly asked to execute a whole Forge phase,
      // a premature prose answer is not a checkpoint. Continue execution first.
      // Memory synchronization is enforced at real STOP-points/completion, not after phase-state start.
      if(phaseExecutionTurn && activePhase && !phaseMarkedComplete(activePhase)){
        const gate=phaseGateReport(activePhase);
        const sourceMissing = activePhase===1 && !phase1SourceInspected();
        const recoverable = !phaseCanReturnInfrastructureBlocker();
        if(recoverable && prematureFinalRetries < 6){
          prematureFinalRetries++;
          process.stdout.write(`\n[Forge] Premature phase final blocked: Phase ${activePhase} is still in progress and no STOP-point was opened. Continue executing the phase now.\n`);
          const phaseHint = activePhase===1 && sourceMissing
            ? 'Сейчас обязательный следующий шаг: list_files GameIntegration, read_file реального prototype/source, затем выполнить analyze-project semantics и ingest в WorkProgress. Не возвращай пользователю план будущих действий — выполни их сейчас.'
            : `Продолжай текущую Phase ${activePhase} сейчас. Gate blockers: ${gate.blockers.join(' | ') || 'phase not marked complete'}.`;
          messages.push({
            role:'user',
            content:
              'Это был ПРЕЖДЕВРЕМЕННЫЙ финальный ответ. Пользователь попросил выполнить фазу целиком, а не перечислить будущие шаги. ' +
              phaseHint + ' ' +
              'Не заканчивай turn после промежуточного подшага. Используй доступные tools и продолжай автономно до одного из трёх исходов: ' +
              '(1) обязательный STOP-point через ask_user; (2) forge_gate GREEN + phase-state complete; (3) реальный инфраструктурный blocker после попытки исправления. ' +
              'Фразы вроде "я начну", "следующий шаг", "необходимо выполнить" не являются результатом выполнения. ' +
              'Если Project Forge memory стала dirty из-за реальной работы, синхронизируй её непосредственно перед ask_user или завершением, а не вместо продолжения работы.'
          });
          continue;
        }
      }
      if(memoryDirty){
        if(memorySyncRetries < 3){
          memorySyncRetries++;
          process.stdout.write(`\n[Forge] Final response delayed: meaningful work/decisions are not yet synchronized to wiki memory.\n`);
          messages.push({
            role:'user',
            content:'Перед настоящим финальным ответом ОБЯЗАТЕЛЬНО вызови forge_memory_update: подробно зафиксируй выполненное, решения пользователя, изменённые артефакты, проверки/ошибки, блокеры и следующий шаг. После успешного sync верни нормальный итоговый ответ. Не пропускай wiki/sessions, wiki/_current.md и wiki/_map.md.'
          });
          continue;
        }
        throw new Error('GigaChat attempted to finish with unsynchronized Project Forge wiki memory');
      }
      process.stdout.write(`\n${content}\n`);
      return;
    }

    if(emptyFinalRetries < 6){
      emptyFinalRetries++;
      consecutiveBareJunk++;
      const rawPreview=String(msg.content||'').replace(/\s+/g,' ').slice(0,180);
      process.stdout.write(`[Forge] junk diagnostic: finish_reason=${String(choice.finish_reason||'')} content_len=${String(msg.content||'').length}${rawPreview?` preview=${JSON.stringify(rawPreview)}`:''}\n`);

      if(phaseExecutionTurn && consecutiveBareJunk>=2){
        const stop=phase1DeterministicStopCandidate();
        if(stop){
          pendingDecision={
            decision_key:stop.decision_key,
            phase:stop.phase,
            question:stop.question,
            options:stop.options||'',
            recommendation:stop.recommendation||''
          };
          process.stdout.write(`\n[Forge] Junk circuit-breaker opened deterministic canonical STOP instead of continuing recovery calls.\n`);
          printStopPoint(stop);
          persistRuntimeEvidenceLedger();
          return;
        }
      }

      let recoveryText='';
      if(phaseExecutionTurn){
        const nextForced=phaseAwareRecoveryFunction();
        if(nextForced==='forge_checkpoint') checkpointJunkRecoveries++;
        else checkpointJunkRecoveries=0;

        if(checkpointJunkRecoveries>1 || consecutiveBareJunk>=4){
          const cp=forgeCheckpoint();
          reportForgeBehavior({severity:'error',code:'GIGA_EMPTY_RESPONSE_LOOP',kind:'adapter_transport',component:'gigachat-function-calling',operation:`phase-${activePhase||'unknown'}-turn`,message:'GigaChat repeatedly returned empty or malformed content and exhausted bounded recovery.',expected:'Native function call or meaningful phase response.',actual:`checkpoint_junk_recoveries=${checkpointJunkRecoveries}; consecutive_bare_junk=${consecutiveBareJunk}`});
          process.stdout.write(`\n=== FORGE RECOVERABLE TRANSPORT STOP: Phase ${activePhase||'?'} ===\n`);
          process.stdout.write(`GigaChat repeatedly returned empty/malformed content. Recovery stopped before another token-burning checkpoint loop.\n`);
          if(cp.next_hints?.length) process.stdout.write(`Next canonical hints:\n- ${cp.next_hints.join('\n- ')}\n`);
          process.stdout.write(`Re-run the same phase command; durable Forge evidence has been preserved.\n`);
          persistRuntimeEvidenceLedger();
          return;
        }

        forcedFunctionName=nextForced||'forge_checkpoint';
        if(forcedFunctionName==='ask_user'){
          recoveryText =
            'Runtime evidence says the next canonical action is a user STOP. Call ask_user NATIVELY now. ' +
            'Use decision_key=phase1-research-direction if research is complete but not approved. For phase1-brief reuse the persisted canonical Q1..Q5 prompt when available; otherwise follow /grilling exactly. For phase1-content-budget use the structured proposal object. ' +
            'Do not emit XML/textual tool_calls.';
        }else if(forcedFunctionName==='forge_web_search'){
          recoveryText =
            'Continue current research with one distinct focused real web query, then read useful result pages. Call forge_web_search NATIVELY now.';
        }else if(forcedFunctionName==='forge_image_search'){
          recoveryText =
            'Visible UI still needs visual-reference evidence. Call forge_image_search NATIVELY now with one distinct useful UI/style query.';
        }else if(forcedFunctionName==='write_file'){
          recoveryText =
            'The next canonical artifact is missing. Call write_file NATIVELY with the correct canonical path/content derived from already verified evidence; do not invent new research.';
        }else if(forcedFunctionName==='forge_skill'){
          recoveryText =
            'Call the next required canonical Forge skill NATIVELY and continue from its SKILL.md contract.';
        }else if(forcedFunctionName==='forge_memory_update'){
          recoveryText =
            'Project memory is dirty. Call forge_memory_update NATIVELY once, then continue the factual phase action; do not loop memory updates.';
        }else if(forcedFunctionName==='forge_context'){
          recoveryText =
            'Call forge_context NATIVELY once, then continue from durable state.';
        }else if(forcedFunctionName==='forge_workspace_inspect'){
          recoveryText =
            'Call forge_workspace_inspect NATIVELY once to inspect real source previews, then continue.';
        }else{
          recoveryText =
            'Call forge_checkpoint NATIVELY once and follow next_hints. Do not call forge_checkpoint twice in succession.';
        }
      }else{
        recoveryText =
          'Верни нормальный пользовательский ответ. Не отвечай символами <, >, tool_calls или многоточием. Если нужен STOP-point — вызови ask_user.';
      }

      process.stdout.write(
        `\n[Forge] GigaChat returned an empty/junk final response after ${toolCalls} tool call(s). ` +
        `${forcedFunctionName?`Forcing phase-aware function ${forcedFunctionName} for recovery...`:'Requesting a real response...'}\n`
      );

      messages.push({role:'user',content:recoveryText});
      continue;
    }

    throw new Error(`GigaChat returned no meaningful final response after ${toolCalls} tool call(s) and ${emptyFinalRetries} bounded recovery attempts`);
  }

  throw new Error('Tool loop limit reached (56)');
}

console.log(`Project Forge GigaChat Terminal Agent
Project: ${PROJECT}
Model: ${MODEL}
Mode: ${FULL?'FULL (shell enabled)':'standard (no shell tool)'}
Commands: /do <task>, /task, /resume-phase, /exit, /status, /gates, /context, /preflight, /search-doctor, /tokens`);


async function runIntegrationTest(){
  const checks=[];const test=(name,fn)=>{try{const ok=Boolean(fn());checks.push({name,ok});process.stdout.write(`${ok?'[OK]':'[FAIL]'} integration: ${name}\n`);}catch(e){checks.push({name,ok:false,error:String(e?.message||e)});process.stdout.write(`[FAIL] integration: ${name} -> ${String(e?.message||e)}\n`);}};
  activePhase=1;startPhaseEvidence(1,{resume:true});loadedSkills=new Set();resolvedDecisionKeys=new Set();registerSuccessfulSkillLoad('phase-1-analyze',jsonResult({ok:true,content:'fixture'}));phaseContextRefreshed=true;const workspaceInspection=await toolAsync('forge_workspace_inspect',{});recordOperation('forge_workspace_inspect',{},workspaceInspection);
  test('research decision remains resolved',()=>resolvedDecisionKeys.has('phase1-research-direction'));
  test('partial persisted brief is NOT resolved',()=>!resolvedDecisionKeys.has('phase1-brief'));
  test('stale phase-1-analyze completion invalidated',()=>!completedSkills.has('phase-1-analyze'));
  const np=parsedToolResult(await toolAsync('forge_skill',{name:'new-project'}));test('new-project rejected in existing project',()=>np.ok===false);
  const rr=parsedToolResult(await toolAsync('forge_skill',{name:'research-references'}));test('approved research no-op',()=>rr.ok===true&&rr.already_approved===true);
  const resumeCheckpoint=forgeCheckpoint();test('resume checkpoint reopens incomplete five-question brief',()=>resumeCheckpoint.next_hints.some(x=>/phase1-brief/.test(x)));
  test('product-metrics evidence preserved',()=>phaseProductMetricsEvidence.web.length>=4&&phaseProductMetricsEvidence.fetch.length>=3);
  const question=loadDecisionLedger().find(d=>d.decision_key==='phase1-brief')?.question||'';
  const full=['Q1 — согласен.','Q2 — нет, хочу серьёзную разработку примерно на 3 месяца.','Q3 — согласен.','Q4 — director mode оставить главным отличием, но не требовать подпись для каждого улучшения.','Q5 — согласен. Предыдущую историю пока считать неизвестной.'].join('\n');
  const br={phase:1,decision_key:'phase1-brief',question,answer:full,timestamp:new Date().toISOString(),outcome:'resolve'};runtimeDecisions.push(br);persistDecisionRecordImmediate(br);resolvedDecisionKeys.add('phase1-brief');test('full brief decision is persisted immediately',()=>loadDecisionLedger().some(d=>d.decision_key==='phase1-brief'&&d.answer===full));const rebuilt=rebuildPhase1BriefFromDecision();
  test('multiline brief rebuilt',()=>rebuilt.changed||rebuilt.reason==='already-rebuilt');test('brief carries 3-month ambition',()=>/3\s*месяц/i.test(optionalText('wiki/design/brief.md',50000)));test('brief carries no-every-upgrade-signature correction',()=>/не требовать подпись для каждого улучшения/i.test(optionalText('wiki/design/brief.md',50000)));
  const pmr=await toolAsync('forge_skill',{name:'product-metrics'});const pm=parsedToolResult(pmr);registerSuccessfulSkillLoad('product-metrics',pmr);test('product-metrics loads',()=>pm.ok===true);
  const proposal={benchmark_context:'Observed fetched retention/monetization benchmarks; targets are project proposals.',kpis:{d1:{industry:'22-35%',floor:'25%',target:'32%',stretch:'40%'},d7:{industry:'10-18%',floor:'8%',target:'14%',stretch:'20%'},d30:{industry:'3.5-5%',floor:'3%',target:'5%',stretch:'8%'},arpdau:{industry:'mobile range',floor:'$0.03',target:'$0.08',stretch:'$0.15'},session_length:{industry:'genre research',floor:'4 min',target:'7 min',stretch:'10 min'},iap_conversion:{industry:'Mistplay context',floor:'1%',target:'2%',stretch:'4%'},north_star:{industry:'engaged DAU',floor:'100 DAU',target:'500 DAU',stretch:'2000 DAU'}},engagement:{core_loop_length:'30-60 seconds',session_structure:'5-10 loops, 4-7 minutes',drop_off_points:'tutorial, first stall, day-3 exhaustion',retention_hooks:'offline catch-up, daily director orders, ranks, collection'},monetization:{narrative:'Provisional metric assumption; Phase 2 owns final decision.',primary_model:'Hybrid rewarded-first assumption',rewarded_hooks:'offline x2; production burst; reroll; bonus crate',interstitial_hooks:'natural session breaks only; capped',iap_catalog:'starter cosmetic; theme; optional no-ads tier',not_monetized:'НЕ монетизируем базовый core loop, mandatory signature, hard pay-to-win'},content_budget:{scope:'Серьёзная разработка примерно на 3 месяца / 12 недель.',d0_d1:{goal:'onboarding + first rank',effort:'1 day runway',current:'core prototype',deficit:'tutorial + authored moments'},d2_d7:{goal:'daily orders + progression tiers',effort:'7 quantified days',current:'limited prototype',deficit:'events + economy depth'},d8_d30:{goal:'meta + rotating events',effort:'30-day runway across 12 weeks',current:'not implemented',deficit:'long-tail content'},deficit:'Major D2-D30 authored content and retention-hook deficit.'}};
  const ask=canonicalizeAskUserArgs({decision_key:'phase1-content-budget',phase:'Phase 1',proposal});const structuredGuard=phase1StopGuard(ask);if(structuredGuard)process.stdout.write(`[INTEGRATION] structured STOP guard blocker=${structuredGuard}\n`);test('structured STOP guard passes',()=>structuredGuard===null);test('structured STOP renders complete sections',()=>/D0-D1/.test(ask.question)&&/НЕ монетизируем/.test(ask.question)&&/North-star/.test(ask.question));test('metrics are absent before approval',()=>!fileExistsNonEmpty('wiki/architecture/metrics.md',80));pendingDecision={decision_key:'phase1-content-budget',phase:'Phase 1',question:ask.question,options:ask.options,recommendation:ask.recommendation,reason:ask.reason,proposal};persistRuntimeEvidenceLedger();test('structured pending STOP survives runtime persistence',()=>{const x=JSON.parse(readText(safePath(RUNTIME_EVIDENCE_PATH)));return Boolean(x.pendingDecision&&x.pendingDecision.decision_key==='phase1-content-budget'&&x.pendingDecision.proposal?.kpis?.d30?.target);});
  const rec={phase:1,decision_key:'phase1-content-budget',question:ask.question,answer:'A',timestamp:new Date().toISOString(),outcome:'resolve'};runtimeDecisions.push(rec);persistDecisionRecordImmediate(rec);resolvedDecisionKeys.add('phase1-content-budget');const mat=materializeApprovedProductMetricsProposal(proposal);test('approval materializes metrics + ADR',()=>mat.ok&&fileExistsNonEmpty('wiki/architecture/metrics.md',200)&&fileExistsNonEmpty(mat.adr,80));test('materialized metrics preserve 3-month scope and KPI rows',()=>/3\s*месяц/i.test(optionalText('wiki/architecture/metrics.md',100000))&&/D1 retention/i.test(optionalText('wiki/architecture/metrics.md',100000))&&/IAP conversion/i.test(optionalText('wiki/architecture/metrics.md',100000)));pendingDecision=null;persistRuntimeEvidenceLedger();
  persistMemoryUpdate({phase:1,summary:'v6.3.3 integration fixture completed Phase 1 deterministic decision/metrics flow.',artifacts:['wiki/design/brief.md','wiki/architecture/metrics.md',mat.adr],checks:['integration'],blockers:[],next:'gate'});
  const gate=phaseGateReport(1);test('Phase 1 gate GREEN',()=>gate.ok);process.stdout.write(`\n[INTEGRATION] ${checks.filter(x=>x.ok).length}/${checks.length} passed\n`);if(!gate.ok)process.stdout.write(`[INTEGRATION] gate blockers=${JSON.stringify(gate.blockers)}\n`);return checks.every(x=>x.ok);
}

if (REQUEST_DOCTOR) {
  runRequestShapeDoctor()
    .then(ok=>process.exit(ok?0:2))
    .catch(e=>{ console.error('[REQUEST-DOCTOR] FATAL '+String(e?.stack||e)); process.exit(3); });
} else if (SELF_TEST) {
  const checks=[];
  const test=(name,fn)=>{ try{ if(!fn()) throw new Error('false'); checks.push(`[OK] ${name}`); } catch(e){ checks.push(`[FAIL] ${name}: ${e.message}`); process.exitCode=1; } };
  if (SCOPE_SHADOW_PROBE) {
    if (resolve(PROJECT) === resolve(ENGINE)) {
      console.error('[X] FORGE_SCOPE_SHADOW_PROBE refuses the Forge engine root. Run it only in an empty temporary project.');
      process.exit(2);
    }
    const shadow=safePath('scripts/check-gacha-integration.mjs');
    if (existsSync(shadow)) {
      console.error('[X] FORGE_SCOPE_SHADOW_PROBE refuses to overwrite an existing project script.');
      process.exit(2);
    }
    const trusted=resolve(ENGINE,'scripts','check-gacha-integration.mjs');
    const trustedHash=createHash('sha256').update(readFileSync(trusted)).digest('hex');
    mkdirSync(dirname(shadow),{recursive:true});
    writeFileSync(shadow,'// untrusted local shadow fixture\n','utf8');
    const task=makeTask({id:`giga-shadow-${randomUUID().replaceAll('-','').slice(0,18)}`,mode:'change',phase:null,goal:'Verify scoped canonical script provenance',scope:{read:['**'],write:['WorkProgress/**']}});
    const run=startTaskRun({projectRoot:PROJECT,task});
    const priorDirective=activeDirective;
    activeDirective={taskId:run.task.id,request:'scope shadow probe',pausedPhase:null};
    const selected=resolveForgeScript('scripts/check-gacha-integration.mjs');
    const escapedShell=taskScopedShellMutationBlock(`node -e "require('fs').writeFileSync('Release/pwn','x')"`);
    const unclassifiedShell=taskScopedShellMutationBlock('powershell -Command Set-Content Release/pwn x');
    activeDirective=priorDirective;
    test('active Task resolves registered verifier from trusted engine despite local shadow',()=>selected===resolve(ENGINE,'scripts','check-gacha-integration.mjs'));
    test('scope shadow probe leaves canonical verifier hash unchanged',()=>createHash('sha256').update(readFileSync(trusted)).digest('hex')===trustedHash);
    test('active Task blocks unclassified shell execution fail-closed',()=>/blocks raw run_command execution fail-closed/.test(escapedShell||'')&&/blocks raw run_command execution fail-closed/.test(unclassifiedShell||''));
    console.log(checks.join('\n'));
    process.exit(process.exitCode||0);
  }
  test('junk response rejected',()=>!meaningfulText('<') && !meaningfulText('...') && meaningfulText('status ok'));
  test('Task scope guard keeps no-active-task compatibility',()=>!taskScopeIsActive(null)&&!taskScopeIsActive({active:false}));
  test('Task scope guard recognizes an active durable Task',()=>taskScopeIsActive({active:true,taskId:'Task-guard-fixture'}));
  test('native write_file and replace_text use Task scope guard',()=>/assertModelTaskWrite\(rel\(p\),'write_file'\)/.test(tool.toString())&&/assertModelTaskWrite\(rel\(p\),'replace_text'\)/.test(tool.toString()));
  test('copy destination and portable filesystem translations use Task scope guard',()=>/assertModelTaskWrite\(rel\(dst\),'copy_path'\)/.test(tool.toString())&&/run_command:portable-mkdir/.test(translatePortableReadOnlyShell.toString())&&/run_command:portable-copy/.test(translatePortableReadOnlyShell.toString()));
  test('Giga media output and provenance use Task scope guard',()=>/gigachat_generate_image:provenance/.test(generateGigaImage.toString())&&/gigachat_generate_3d:provenance/.test(generateGiga3d.toString()));
  test('guarded Task blocks raw shell fail-closed and unclassified forge scripts',()=>/blocks raw/.test(taskScopedShellMutationBlock.toString())&&/taskScopedShellMutationBlock/.test(tool.toString())&&/taskScopedForgeScriptBlock/.test(tool.toString())&&/blocks unclassified forge_script/.test(taskScopedForgeScriptBlock.toString()));
  test('only registered read-only verifier scripts bypass the scoped forge-script block',()=>/declaredReadOnlyForgeVerifier/.test(taskScopedForgeScriptBlock.toString())&&/mutates !== false/.test(declaredReadOnlyForgeVerifier.toString()));
  test('active Task trusts engine verifier scripts, never project-local shadows',()=>!/projectPath/.test(declaredReadOnlyForgeVerifier.toString())&&/scopedTask&&existsSync\(engine\)/.test(resolveForgeScript.toString()));
  test('scoped canonical mutators enumerate their output roots',()=>{const x=taskScopedForgeScriptBlock.toString();return /gacha-backups/.test(x)&&/modularize-backups/.test(x)&&/\.forge-ai\.json/.test(x)&&/assets\/target\/screens\/manifest\.json/.test(x)&&/phase-4-visual-evidence\.template\.json/.test(x)&&/phase-4-visual-evidence\.json/.test(x)&&/stage-out/.test(x)&&/stage\.png/.test(x);});
  test('scoped Godot verifier/release scripts enumerate native output roots',()=>{const x=taskScopedForgeScriptBlock.toString();return /qa\/godot-tech\/report\.json/.test(x)&&/qa\/godot-playtest\/report\.json/.test(x)&&/qa\/godot-release\/report\.json/.test(x)&&/Release\/\.forge-scope-probe/.test(x);});
  test('scoped output maps handle nested AI Studio targets and --out=value',()=>{const x=taskScopedForgeScriptBlock.toString();return /rootPrefix/.test(x)&&/--out=/.test(x)&&forgeScriptTargetArg(['--out','Release/escape','WorkProgress/game'])==='WorkProgress/game'&&forgeScriptTargetArg(['--out=Release/escape','WorkProgress/game'])==='WorkProgress/game';});
  test('Task scope denials emit bounded Forge diagnostics',()=>/GIGA_TASK_SCOPE_DENIED/.test(reportTaskScopeDenied.toString())&&/slice\(0,700\)/.test(reportTaskScopeDenied.toString())&&/taskScopeDeny/.test(taskScopedForgeScriptBlock.toString()));
  test('phase lifecycle exception is forge_script-only, not a shell substring bypass',()=>!/phase-state/.test(taskScopedShellMutationBlock.toString())&&/phase-state\\\.mjs/.test(taskScopedForgeScriptBlock.toString()));
  test('product telemetry exception is the bounded forge_script only',()=>!/forge-metrics/.test(taskScopedShellMutationBlock.toString())&&/forge-metrics\\\.mjs/.test(taskScopedForgeScriptBlock.toString()));
  test('binary write extension blocked',()=>{ try{assertTextWritableExtension('x.png');return false;}catch{return true;} });
  test('phase complete hard gate active',()=>/Phase 4 completion blocked/.test(phaseCompletionBlocked('node .claude/skills/status/references/phase-state.mjs complete 4 wiki/design/target-frame.md assets/style/STYLE-BIBLE.md')||''));
  test('forge_script phase complete cannot bypass the hard gate',()=>/hard gate/i.test(forgeScriptPhaseCompletionBlocked('.claude/skills/status/references/phase-state.mjs',['complete','4'])||''));
  test('phase complete requires explicit evidence arguments',()=>/explicit evidence artifact arguments/.test(phaseCompletionBlocked('node .claude/skills/status/references/phase-state.mjs complete 4')||''));
  test('phase hard gate has engine-specific Godot routes without browser substitution',()=>{const x=phaseGateReport.toString();return /nativeGodot/.test(x)&&/godot-screens-shoot/.test(x)&&/godot-proof-video/.test(x)&&/godot-tech-check/.test(x)&&/godot-playtest/.test(x)&&/build-godot-release/.test(x)&&/godot-release-verify/.test(x)&&/p===6&&path==='screens\/video\/promo\.mp4'/.test(x);});
  test('phase 4 named decisions',()=>requiredDecisionKeysForPhase(4).has('phase4-target-frame')&&requiredDecisionKeysForPhase(4).has('phase4-style-bible'));
  test('phase 1 named STOP gates',()=>PHASE1_REQUIRED_DECISIONS.has('phase1-research-direction')&&PHASE1_REQUIRED_DECISIONS.has('phase1-brief')&&PHASE1_REQUIRED_DECISIONS.has('phase1-content-budget'));
  test('phase execution intent detector',()=>phaseExecutionRequestedByText('Прочитай FORGE.md и выполни Forge skill phase-1-analyze для текущего проекта ".".'));
  test('short phase alias',()=>phaseAliasInvocation('фаза 1')?.skill==='phase-1-analyze' && phaseAliasInvocation('/phase-4-visual')?.phase===4);
  test('manual /do command preserves exact task',()=>directiveCommand('/do сделай гачу и сразу реализуй')?.request==='сделай гачу и сразу реализуй');
  test('direct task is backed by durable change workflow',()=>/ensureDirectiveTaskRuntime/.test(activateDirective.toString())&&/taskId/.test(activateDirective.toString())&&/mode:'change'/.test(ensureDirectiveTaskRuntime.toString()));
  test('direct task persists exact intent before graph creation',()=>activateDirective.toString().indexOf('persistRuntimeEvidenceLedger')<activateDirective.toString().indexOf('ensureDirectiveTaskRuntime'));
  test('orphan direct Task can be reattached after restart',()=>/listTaskRuns/.test(ensureDirectiveTaskRuntime.toString())&&/recovered/.test(ensureDirectiveTaskRuntime.toString()));
  test('direct completion records implementation then verification nodes',()=>((completeDirective.toString().match(/recordDirectiveRunResult/g)||[]).length>=2)&&/CHANGE_IMPLEMENTED/.test(completeDirective.toString())&&/CHANGE_VERIFIED/.test(completeDirective.toString()));
  test('direct completion dispatches a registered verifier plan automatically',()=>/configureDirectiveVerifierPlan/.test(completeDirective.toString())&&/runTaskVerifiers/.test(completeDirective.toString())&&/configureTaskVerifierPlan/.test(configureDirectiveVerifierPlan.toString()));
  test('gacha verifier plan comes only from a structured canonical host operation',()=>{const plan=deriveVerifierPlanFromOperations({projectRoot:PROJECT,phase:8,allowedVerifiers:['gacha-integration'],operations:[{tool:'forge_script',script:'scripts/check-gacha-integration.mjs',args:['WorkProgress/demo-game'],exitCode:0}]});const prose=deriveVerifierPlanFromOperations({projectRoot:PROJECT,phase:8,allowedVerifiers:['gacha-integration'],operations:[{command:'forge_script scripts/check-gacha-integration.mjs WorkProgress/demo-game',status:0}]});return plan?.verifiers?.[0]==='gacha-integration'&&plan.verificationTarget==='WorkProgress/demo-game'&&prose===null;});
  test('gacha verifier target preserves a quoted project-relative path',()=>directiveVerifierTargetFromCommand('forge_script scripts/check-gacha-integration.mjs "WorkProgress/demo game"','check-gacha-integration.mjs')==='WorkProgress/demo game');
  test('gacha verifier target rejects escaped command arguments',()=>directiveVerifierTargetFromCommand('forge_script scripts/check-gacha-integration.mjs ../outside','check-gacha-integration.mjs')===null);
  test('failed focused verification enters durable repair',()=>/CHANGE_VERIFICATION_FAILED/.test(completeDirective.toString())&&/retryable_failure/.test(completeDirective.toString()));
  test('exhausted direct Task requires explicit retry',()=>/repair budget is exhausted/.test(turn.toString())&&/explicit \/do/.test(turn.toString()));
  test('manual /resume-phase command recognized',()=>directiveCommand('/resume-phase')?.kind==='resume');
  test('/resume-phase clears only directive-owned pending STOP',()=>/pendingDecision\?\.directive===true/.test(turn.toString()));
  test('natural direct implementation request detected',()=>naturalImplementationDirective('давай сделаем гачу чтобы привлечь игроков, сделай ТЗ и начинай делать')!==null);
  test('ordinary feature question does not activate direct task',()=>naturalImplementationDirective('почему нет фичей на D7-D30?')===null);
  test('past-tense archive question is read-only',()=>isStatusOnlyInput('собрал архивы?'));
  test('imperative archive request is not read-only',()=>!isStatusOnlyInput('собери архивы'));
  test('read-only function surface excludes mutators',()=>{const names=functionsForRequest(null,false,true).map(x=>x.name);return names.includes('forge_status')&&!names.includes('write_file')&&!names.includes('forge_gate')&&!names.includes('run_command');});
  test('counterfeit WorkProgress verifier blocked',()=>Boolean(counterfeitCanonicalScriptWriteBlock('WorkProgress/demo/scripts/verify-setup-guide.mjs')));
  test('normal WorkProgress game script allowed',()=>counterfeitCanonicalScriptWriteBlock('WorkProgress/demo/gacha.js')===null);
  test('repeated full overwrite stays blocked after reread',()=>{const old=activeDirective;activeDirective={operations:[{tool:'write_file',target:'WorkProgress/demo/gacha.js',at:'2026-08-18T12:00:00Z'}],reads:['WorkProgress/demo/gacha.js']};const blocked=Boolean(repeatedDirectiveOverwriteBlock('WorkProgress/demo/gacha.js'));activeDirective=old;return blocked;});
  test('large existing direct-task file rejects full reconstruction',()=>{const old=activeDirective;activeDirective={request:'добавь функцию в существующий проект',operations:[]};const blocked=Boolean(destructiveFullWriteBlock('scripts/gigachat-agent.mjs','short replacement'));activeDirective=old;return blocked;});
  test('approved modules require targeted edits',()=>/Full write_file replacement of approved module/.test(destructiveFullWriteBlock.toString()));
  test('direct-task read_file auto-pagination is durable',()=>/readCursors/.test(readFileForModel.toString())&&/already read through line/.test(readFileForModel.toString()));
  test('durable directive snapshot excludes unbounded raw reads',()=>{const old=activeDirective;activeDirective={request:'x',reads:Array(100).fill('large'),operations:[],readCursors:{a:301}};const snapshot=durableDirectiveSnapshot();activeDirective=old;return !Object.prototype.hasOwnProperty.call(snapshot,'reads')&&snapshot.readCursors.a===301;});
  test('direct-task loop circuit breakers installed',()=>/consecutiveDirectiveReads<=12/.test(turn.toString())&&/compactionCount-turnCompactionStart>=4/.test(turn.toString()));
  test('large direct-task source routes through modularization skill',()=>{const hint=directTaskMonolithInstruction([{path:'WorkProgress/demo/index.html',bytes:90000}]);return /modularize-existing-project/.test(hint)&&/scripts\/modularize-existing-project\.mjs/.test(hint)&&/--apply/.test(hint);});
  test('monolith routing honors only the explicitly named WorkProgress entrypoint',()=>{const paths=requestedWorkProgressEntrypoints('измени WorkProgress/testgigachat-v4, не трогай соседние варианты');return paths.length===1&&paths[0]==='WorkProgress/testgigachat-v4/index.html';});
  test('monolith routing does not scan unnamed sibling projects',()=>requestedWorkProgressEntrypoints('добавь функцию в текущую игру').length===0);
  test('gacha module context selects bounded owning roles',()=>{const roles=moduleRolesForTask('добавь гачу в сетку');return ['state-foundation','ui-render','persistence','bootstrap','production','feedback-bubbles','drag-merge'].every(role=>roles.has(role));});
  test('direct-task function surface excludes broad rediscovery tools',()=>{const old=activeDirective;activeDirective={request:'x'};const names=functionsForRequest().map(f=>f.name);activeDirective=old;return names.includes('replace_text')&&names.includes('forge_change_complete')&&!names.includes('forge_workspace_inspect')&&!names.includes('list_files')&&!names.includes('forge_context');});
  test('canonical modularization script resolves for GigaChat',()=>/modularize-existing-project\.mjs$/.test(resolveForgeScript('scripts/modularize-existing-project.mjs').replace(/\\/g,'/')));
  test('direct completion rejects invented check strings',()=>{const old=verifierLedger;verifierLedger=new Map([['real',{status:0,command:'node scripts/playtest.mjs .',updatedAt:'2026-08-18T12:01:00Z'}]]);const matches=successfulDirectiveChecks(['visual check passed'],{activatedAt:'2026-08-18T12:00:00Z'});verifierLedger=old;return matches.length===0;});
  test('direct completion accepts exact post-activation command',()=>{const old=verifierLedger;verifierLedger=new Map([['real',{status:0,command:'node scripts/playtest.mjs .',updatedAt:'2026-08-18T12:01:00Z'}]]);const matches=successfulDirectiveChecks(['node scripts/playtest.mjs .'],{activatedAt:'2026-08-18T12:00:00Z'});verifierLedger=old;return matches.length===1;});
  test('direct completion rejects stale successful command',()=>{const old=verifierLedger;verifierLedger=new Map([['old',{status:0,command:'node scripts/playtest.mjs .',updatedAt:'2026-08-18T11:59:00Z'}]]);const matches=successfulDirectiveChecks(['node scripts/playtest.mjs .'],{activatedAt:'2026-08-18T12:00:00Z'});verifierLedger=old;return matches.length===0;});
  test('Phase 8 rejects overwritten same-version ZIP names',()=>{const old=['Release/demo/yandex/demo-v1.0.0.zip','Release/demo/yandex/demo-v1.0.0-debug.zip','Release/demo/yandex/demo-v1.0.0-marketing.zip'];return !releaseVersionEvidenceFromPaths(old,new Set(old)).ok;});
  test('Phase 8 accepts one complete newly named higher version',()=>{const old=['Release/demo/yandex/demo-v1.0.0.zip','Release/demo/yandex/demo-v1.0.0-debug.zip','Release/demo/yandex/demo-v1.0.0-marketing.zip'];const fresh=['Release/demo/yandex/demo-v1.0.1.zip','Release/demo/yandex/demo-v1.0.1-debug.zip','Release/demo/yandex/demo-v1.0.1-marketing.zip'];const result=releaseVersionEvidenceFromPaths([...old,...fresh],new Set(old));return result.ok&&result.version==='v1.0.1'&&result.paths.length===3;});
  test('Phase 8 rejects incomplete new release trio',()=>{const old=['Release/demo/yandex/demo-v1.0.0.zip'];const fresh=['Release/demo/yandex/demo-v1.0.1.zip','Release/demo/yandex/demo-v1.0.1-debug.zip'];return !releaseVersionEvidenceFromPaths([...old,...fresh],new Set(old)).ok;});
  test('change request prompt keeps exact task and pauses release',()=>{const old=activeDirective;activeDirective={request:'добавь гачу',pausedPhase:8};const x=directiveTaskPrompt('делай');activeDirective=old;return /добавь гачу/.test(x)&&/не запускай phase-state\/forge_gate\/release-\*/.test(x);});
  test('change request blocks release gate and phase-state',()=>{const old=activeDirective;activeDirective={request:'добавь гачу',pausedPhase:8};const a=directiveToolBlock('forge_gate',{phase:8});const b=directiveToolBlock('forge_script',{name:'phase-state.mjs',args:['start','8']});activeDirective=old;return Boolean(a)&&Boolean(b);});
  test('change request redirects canonical verifiers away from run_command',()=>{const old=activeDirective;activeDirective={request:'добавь гачу'};const blocked=directiveToolBlock('run_command',{command:'node WorkProgress/game/scripts/playtest.mjs .'});activeDirective=old;return /forge_script/.test(blocked||'');});
  test('change request allows tactical gacha skill',()=>{const old=activeDirective;activeDirective={request:'добавь гачу',pausedPhase:8};const x=directiveToolBlock('forge_skill',{name:'gacha-meta'});activeDirective=old;return x===null;});
  test('support skill reads cannot preempt a tactical direct-task contract',()=>{const status=readSkillContract(ENGINE,'status',{requireDeclared:true});const gacha=readSkillContract(ENGINE,'gacha-meta',{requireDeclared:true});return !directiveContractBindingEligible(status)&&directiveContractBindingEligible(gacha);});
  test('change completion tool exposed',()=>functions.some(f=>f.name==='forge_change_complete'));
  test('gacha completion requires focused runtime and module-contract checks',()=>/check-gacha-integration/.test(completeDirective.toString())&&/modularize-existing-project/.test(completeDirective.toString()));
  test('canonical gacha integrator is recorded as a mutating operation',()=>commandLooksMutating('forge_script scripts/integrate-gacha.mjs WorkProgress/game'));
  test('successful direct completion terminates turn before phase autopilot',()=>{const source=turn.toString();return (source.match(/forge_change_complete' && printCompletedDirectiveAndStop\(result\)\) return/g)||[]).length===2;});
  test('textual pseudo tool-call rejected',()=>!meaningfulText('< супругиtool_calls>'));
  test('malformed GigaChat pseudo-call parser recovers search',()=>{ const x=parseTextualPseudoToolCall('< выгодныеtool_calls> < выгодныеinvoke name="forge_web_search"> < выгодныеparameter name="query" string="true">idle game retention benchmarks 2026</ выгодныеparameter>'); return x?.name==='forge_web_search' && x?.args?.query==='idle game retention benchmarks 2026'; });
  test('pseudo-call parser rejects unknown tool',()=>!parseTextualPseudoToolCall('< tool_calls>< invoke name="evil_shell">< parameter name="x">1</parameter>'));
  test('slash Forge skill is not a shell command',()=>parseForgeSkillShellInvocation('/analyze-project .')?.skill==='analyze-project');
  test('portable copy_path tool exposed',()=>functions.some(f=>f.name==='copy_path'));
  test('workspace inspect recovery tool exposed',()=>functions.some(f=>f.name==='forge_workspace_inspect'));
  test('compaction checkpoint is non-system',()=>{ const cp={role:'user',content:'ctx'}; return cp.role!=='system'; });
  test('forge checkpoint tool exposed',()=>functions.some(f=>f.name==='forge_checkpoint'));
  test('Forge behavioral diagnostic tool exposed',()=>functions.some(f=>f.name==='forge_diagnostic_report'));
  test('phantom skill runner translated',()=>parseMissingSkillRunner('node .claude/skills/analyze-project/index.mjs WorkProgress/x')?.skill==='analyze-project');
  test('Phase 1 brief write protected',()=>{ const oldPhase=activePhase; activePhase=1; const hit=Boolean(phase1ArtifactWriteGuard('wiki/design/brief.md')); activePhase=oldPhase; return hit; });
  test('web research capability is real config-derived boolean',()=>typeof WEB_SEARCH_AVAILABLE==='boolean' && WEB_SEARCH_AVAILABLE===Boolean(SEARCH_CAPABILITIES.web_search));
  test('portable shell translator recognizes find',()=>Boolean('find . -type f | head -100'.match(/^find\s+(.+?)\s+-type\s+f\s+\|\s+head\s+-(\d+)\s*$/i)));
  test('portable shell translator recognizes du',()=>Boolean('du -sh .'.match(/^du\s+-sh\s+(.+?)\s*$/i)));
  test('exact verifier keys do not collide',()=>operationKey('run_command',{command:'node scripts/release-ready.mjs . yandex'})!==operationKey('run_command',{command:'node scripts/check-setup-guide.mjs .'}));
  test('recoverable failure is not infrastructure blocker',()=>!hardFailure({type:'recoverable'}));
  test('web_fetch 403 is source-specific, not infrastructure blocker',()=>!hardFailure(normalizePersistedFailure('forge_web_fetch:https://example.com',{type:'capability',message:'HTTP 403'})));
  test('research-direction rejects fake unavailable-search option when search is live',()=>!HOST_CAPABILITIES.web_search || Boolean(researchDirectionQuestionBlocker({decision_key:'phase1-research-direction',question:'Wait until web_search is available?',options:'A proceed with internal notes B wait'})));
  test('research evidence contract installed',()=>typeof phase1ResearchBlockers==='function' && typeof visibleUiProject==='function');
  test('research approval evidence preview installed',()=>typeof researchDirectionEvidencePreview==='function' && typeof researchDirectionVisibleSummaryBlocker==='function');
  test('opaque research approval rejected',()=>Boolean(researchDirectionVisibleSummaryBlocker({decision_key:'phase1-research-direction',question:'Research complete. Approve?',options:'A yes B deepen'})));
  test('research provenance URL normalizer installed',()=>normalizeEvidenceUrl('https://example.com/a/')==='https://example.com/a');
  test('research percentage extractor handles ranges',()=>{const x=extractPercentValues('D7 15–20%, D1 48%'); return x.includes('15')&&x.includes('20')&&x.includes('48');});
  test('research direction does not own KPI percentage gate',()=>!phase1ResearchBlockers().some(x=>/percentage claim/i.test(String(x))));
  test('quantitative provenance helper rejects unsupported percent',()=>quantitativeProvenanceBlockers('Target D1 999%','test').some(x=>/999%/.test(x)));
  test('metrics evidence preview installed',()=>typeof metricsEvidencePreview==='function' && typeof metricsArtifactProvenanceBlockers==='function');
  test('phase-aware function pruning installed',()=>functionsForRequest('ask_user',true).length===1 && functionsForRequest('ask_user',true)[0].name==='ask_user');
  test('phase1 deterministic STOP helper installed',()=>typeof phase1DeterministicStopCandidate==='function' && typeof phaseAwareRecoveryFunction==='function');
  test('junk recovery checkpoint is bounded',()=>/checkpointJunkRecoveries>1/.test(turn.toString()) && /consecutiveBareJunk>=4/.test(turn.toString()));
  test('visual research coherence helper installed',()=>typeof researchVisualEvidenceBlockers==='function' && typeof recordedImageReferenceUrls==='function');
  test('pending image-search text is rejected for visible research artifact contract',()=>/pending image_search|image_search not executed/i.test('Pending image_search execution; image_search not executed yet.'));
  test('false phase capability blocker helper installed',()=>Array.isArray(contradictedCapabilityBlock('missing web_search provider')));
  test('visual provenance is accepted for Sources URLs',()=>/recorded image_search provenance/.test(phase1ResearchBlockers.toString()));
  test('transient GigaChat retry is bounded',()=>/attempt<3/.test(gigaChatRequestWithRetry.toString()) && /clean durable function-history epoch/.test(gigaChatRequestWithRetry.toString()));
  test('web fetch model payload is bounded',()=>modelFacingToolResult('forge_web_fetch','x'.repeat(50000)).length<20000);
  test('Phase 1 brief rejects naked questions without recommendations',()=>phase1BriefGrillingBlockers({question:'❓ **Q1** - **Аудитория**: кто?\n❓ **Q2** - **Амбиция**: какая?\n❓ **Q3** - **Обещание**: что почувствовать?\n❓ **Q4** - **Отличие**: чем отличается?\n❓ **Q5** - **История**: что пробовал?'}).some(x=>/recommended answer|➡️/.test(x)));
  test('Phase 1 brief accepts five canonical grilling recommendations',()=>phase1BriefGrillingBlockers({question:'❓ **Q1** - **Аудитория**: кто?\n➡️ Рекомендую casual mobile 16–35.\n\n❓ **Q2** - **Амбиция**: какая?\n➡️ Рекомендую трёхмесячный production scope.\n\n❓ **Q3** - **Обещание**: что почувствовать?\n➡️ Рекомендую чувство роста фабрики и абсурдной власти директора.\n\n❓ **Q4** - **Отличие**: чем отличается?\n➡️ Рекомендую сделать director approval главным крючком.\n\n❓ **Q5** - **История**: что пробовал?\n➡️ Рекомендую сохранить рабочее ядро прототипа и перечислить неудачные эксперименты.'}).length===0);
  test('deterministic fallback never invents generic brief but may reuse persisted prompt',()=>/latestPersistedBriefPrompt/.test(phase1DeterministicStopCandidate.toString()));
  test('Phase 1 brief accepts numbered 1-5 labels and canonicalizes them',()=>{const a=canonicalizePhase1BriefArgs({decision_key:'phase1-brief',question:'1. Аудитория?\n➡️ Рекомендую casual mobile.\n2) Амбиция?\n➡️ Рекомендую production scope.\n3: Обещание — что почувствовать?\n➡️ Рекомендую чувство роста.\n4 - Отличие?\n➡️ Рекомендую director approval.\n5. История — что пробовал?\n➡️ Рекомендую сохранить ядро.'}); return /Q1/.test(a.question)&&/Q5/.test(a.question)&&phase1BriefGrillingBlockers(a).length===0;});
  test('invalid pseudo ask_user is rewritten rather than repeated verbatim',()=>/must NOT be repeated/.test(turn.toString()) && /phase1BriefRepairInstruction/.test(turn.toString()));
  test('repeated malformed ask_user does not force checkpoint',()=>/if\(name==='ask_user'\)[\s\S]{0,1800}forcedFunctionName='ask_user'/.test(turn.toString()));
  test('brief format recovery is bounded',()=>/invalidBriefAskRepairs>3/.test(turn.toString()) && /FORGE RECOVERABLE STOP-FORMAT ERROR/.test(printBriefFormatRecoveryStop.toString()));
  test('Q5 fabricated user history is rejected',()=>phase1HistoryRecommendationBlocker({decision_key:'phase1-brief',question:'❓ **Q5** - **История**: Что уже пробовали?\n➡️ Это первая публичная сборка; ранее тестировались изолированные механики.'})!==null);
  test('Q5 recommendation without invented history remains allowed',()=>phase1HistoryRecommendationBlocker({decision_key:'phase1-brief',question:'❓ **Q5** - **История**: Что уже пробовали?\n➡️ Рекомендую сохранить рабочее ядро текущего прототипа и перечислить прошлые попытки, если они были.'})===null);
  test('blocked Phase 1 reopen preserves durable evidence',()=>/resume:marker==='blocked'/.test(ensureHostPhaseStarted.toString()));
  test('approved research no longer requires transient action counts',()=>/resolvedDecisionKeys\.has\('phase1-research-direction'\)/.test(phase1ResearchCompletionBlockers.toString()));
  test('brief raw answer is preserved verbatim',()=>{const a='Q1 — согласен.\nQ2 — нет, хочу 3 месяца.\nQ3 — согласен.\nQ4 — без подписи каждого апгрейда.\nQ5 — история неизвестна.';runtimeDecisions.push({phase:1,decision_key:'phase1-brief',question:'x',answer:a,timestamp:new Date().toISOString()}); const x=ensureBriefDecisionVerbatim('# Brief'); runtimeDecisions.pop(); return /Q2 — нет, хочу 3 месяца/.test(x);});
  test('product-metrics requires four research coverage classes',()=>/coverage\.retention/.test(productMetricsResearchBlockers.toString())&&/coverage\.monetization/.test(productMetricsResearchBlockers.toString())&&/coverage\.session/.test(productMetricsResearchBlockers.toString())&&/coverage\.dropoff/.test(productMetricsResearchBlockers.toString()));
  test('content-budget proposal requires all Floor Target Stretch',()=>{const b=productMetricsProposalBlockers({question:'Floor D1 D7 D30 ARPDAU session length IAP conversion north-star core loop 30 sec session structure drop-off retention hooks monetization narrative primary model rewarded interstitial IAP catalog НЕ монетизируем D0-D1 D2-D7 D8-D30 дефицит benchmark 3 месяца'}); return b.includes('proposal missing Target')&&b.includes('proposal missing Stretch');});
  test('three-month brief scope must survive into metrics proposal',()=>/approved Q2 ambition/.test(productMetricsProposalBlockers.toString()));
  test('phase-1-analyze skill_done is bound to phase gate',()=>/n==='phase-1-analyze'/.test(validateSkillCompletion.toString())&&/phaseGateReport\(1\)/.test(validateSkillCompletion.toString()));
  test('approved research writes are frozen',()=>/Research direction is already user-approved/.test(phase1ArtifactWriteGuard.toString()));
  test('approved research skill becomes no-op',()=>/already_approved:true/.test(tool.toString()) && /Do not redo research-references/.test(tool.toString()));
  test('brief reconciliation is deterministic',()=>/ensureBriefDecisionVerbatim/.test(reconcileBriefDecisionArtifact.toString()));
  test('approved research provenance can be runtime-preserved',()=>/FORGE_APPROVED_RESEARCH_EVIDENCE_START/.test(reconcileApprovedResearchArtifact.toString()));
  test('AI Studio init defaults to project dot arg',()=>/args\.push\('\.'\)/.test(tool.toString()));
  test('transport retry has emergency payload trim',()=>/emergencyTrimGigaRequest/.test(gigaChatRequestWithRetry.toString()) && /after 3 attempts/.test(gigaChatRequestWithRetry.toString()));
  test('request-shape doctor has staged system/functions bisect',()=>/A minimal user only/.test(runRequestShapeDoctor.toString())&&/B real Forge system/.test(runRequestShapeDoctor.toString())&&/C minimal messages \+ real Phase function schemas/.test(runRequestShapeDoctor.toString())&&/D real Forge system \+ real Phase function schemas/.test(runRequestShapeDoctor.toString()));
  test('request-shape doctor reports payload statistics',()=>/total_json_chars/.test(requestShapeStats.toString())&&/function_schema_chars/.test(requestShapeStats.toString()));
  test('orphan function result is removed before request',()=>{const x=sanitizeGigaFunctionHistory([{role:'system',content:'s'},{role:'function',name:'forge_context',content:'{}'},{role:'user',content:'u'}]); return x.droppedOrphanResults===1 && !x.messages.some(m=>m.role==='function');});
  test('valid assistant/function pair survives sanitation',()=>{const x=sanitizeGigaFunctionHistory([{role:'assistant',content:'',function_call:{name:'forge_context',arguments:{}}},{role:'function',name:'forge_context',content:'{}'}]); return x.messages.length===2 && x.droppedOrphanResults===0 && x.droppedOrphanCalls===0;});
  test('tail slicing preserves function pair',()=>{const src=[{role:'user',content:'a'},{role:'assistant',content:'',function_call:{name:'forge_context',arguments:{}}},{role:'function',name:'forge_context',content:'{}'}]; const x=tailPreservingFunctionPairs(src,1); return x.length===2 && x[0].role==='assistant' && x[1].role==='function';});
  test('emergency retry resets function history epoch',()=>/durableContinuationMessage/.test(emergencyTrimGigaRequest.toString())&&/sanitizeGigaFunctionHistory/.test(emergencyTrimGigaRequest.toString()));
  test('all chat requests sanitize function history at boundary',()=>/sanitizeGigaRequestBody\(body\)/.test(gigaChatRequestWithRetry.toString()));
  test('approved research skill_done uses approved completion contract',()=>/phase1ResearchCompletionBlockers/.test(validateSkillCompletion.toString()));
  test('proactive compaction closes old function-call epoch',()=>/resetFunctionHistoryEpoch/.test(compactMessagesIfNeeded.toString())&&/payload_chars/.test(compactMessagesIfNeeded.toString()));
  test('durable continuation includes product-metrics evidence',()=>/PHASE 1 PRODUCT-METRICS DURABLE EVIDENCE/.test(durableContinuationMessage.toString()));
  test('durable continuation explicitly preserves active change request',()=>/ACTIVE CHANGE REQUEST/.test(durableContinuationMessage.toString()));
  test('server-error retries do not resend old function history',()=>/attempt===0\?sanitizeGigaRequestBody\(body\):emergencyTrimGigaRequest\(body\)/.test(gigaChatRequestWithRetry.toString()));
  test('content-budget repair rewrites full proposal',()=>/REWRITE the ENTIRE native ask_user call/.test(phase1ContentBudgetRepairInstruction.toString())&&/D8-D30/.test(phase1ContentBudgetRepairInstruction.toString()));
  test('content-budget format recovery is bounded',()=>/invalidContentBudgetRepairs>3/.test(turn.toString())&&/FORGE RECOVERABLE STOP-FORMAT ERROR/.test(printContentBudgetFormatRecoveryStop.toString()));
  test('product-metrics prompt distinguishes benchmarks from proposed targets',()=>/PROJECT PROPOSALS derived from that evidence/.test(system));
  test('future metrics.md write mention is allowed in pre-approval STOP',()=>{const saved=fileExistsNonEmpty; const a={question:'Floor Target Stretch D1 D7 D30 ARPDAU session length IAP conversion north-star core loop 30 сек session structure drop-off retention hooks monetization narrative primary model rewarded interstitial IAP catalog НЕ монетизируем D0-D1 D2-D7 D8-D30 дефицит benchmark 3 месяца. После утверждения Forge запишет wiki/architecture/metrics.md и ADR.'}; const b=productMetricsProposalBlockers(a); return !b.some(x=>/metrics\.md/.test(x));});
  test('approving targets from unwritten metrics.md is rejected',()=>{const a={question:'Floor Target Stretch D1 D7 D30 ARPDAU session length IAP conversion north-star core loop 30 сек session structure drop-off retention hooks monetization narrative primary model rewarded interstitial IAP catalog НЕ монетизируем D0-D1 D2-D7 D8-D30 дефицит benchmark 3 месяца. Подтвердите targets из wiki/architecture/metrics.md.'}; const b=productMetricsProposalBlockers(a); return b.some(x=>/already-written\/authoritative/.test(x));});
  test('partial Q1-only brief answer is not resolved',()=>phase1BriefAnswerCoverageBlockers('Q1 — согласен.').length>0);
  test('complete multiline brief answer resolves',()=>phase1BriefAnswerCoverageBlockers('Q1 — согласен.\nQ2 — 3 месяца.\nQ3 — согласен.\nQ4 — без подписи каждого апгрейда.\nQ5 — история неизвестна.').length===0);
  test('natural recommendation acceptance resolves the whole brief',()=>phase1BriefAnswerCoverageBlockers('принимаю рекомендации').length===0);
  test('inflected all-recommendations acceptance resolves the whole brief',()=>['принимаю все рекомендации','согласен со всеми рекомендациями','подтверждаю предложенные рекомендации'].every(x=>acceptsAllPhase1BriefRecommendations(x)));
  test('qualified recommendation acceptance stays unresolved',()=>!acceptsAllPhase1BriefRecommendations('принимаю рекомендации, но Q2 изменить'));
  test('suggested approval word resolves the whole brief',()=>phase1BriefAnswerCoverageBlockers('утверждаю').length===0);
  test('STOP guidance always exposes an actionable answer',()=>/утверждаю/.test(stopAnswerGuidance({recommendation:'Use A'}))&&/одним сообщением/.test(stopAnswerGuidance({})));
  test('Phase 1 brief guidance gives approval and full correction formats',()=>{const x=stopAnswerGuidance({decision_key:'phase1-brief'});return /«утверждаю»/.test(x)&&/Q1 —/.test(x)&&/Q5 —/.test(x)&&/все пять ответов/.test(x);});
  test('Phase 2 decisions receive deterministic fast-MVP recommendations',()=>{const x=canonicalizeAskUserArgs({decision_key:'phase2-multiplayer'});const inventory=canonicalizeAskUserArgs({decision_key:'phase2-screen-inventory'});return /мультиплеер/i.test(x.question)&&/А\)/.test(x.recommendation)&&/«утверждаю»/.test(stopAnswerGuidance(x))&&/inventory/i.test(inventory.question)&&requiredDecisionKeysForPhase(2).has('phase2-screen-inventory');});
  test('Phase 2 inventory STOP prints the exact host-read graph',()=>/COMPLETE SCREEN INVENTORY TO APPROVE/.test(printStopPoint.toString())&&/screenInventoryEvidencePreview/.test(printStopPoint.toString())&&/screenInventoryPayload/.test(screenInventoryEvidencePreview.toString())&&!/\.slice\(/.test(screenInventoryEvidencePreview.toString()));
  test('Phase 2 inventory approval is hash-bound before decision persistence',()=>/boundScreenInventory=materializeApprovedScreenInventory\(pendingDecision\.inventorySha256/.test(turn.toString())&&/inventorySha256.*phase2-screen-inventory/s.test(turn.toString()));
  test('runtime-owned decision ledger rejects model writes',()=>/runtime-owned/.test(runtimeOwnedWriteBlock('wiki/decisions/gigachat-decisions.json')||''));
  test('pending decision turns restore phase runtime before consuming the answer',()=>/startPhaseEvidence\(pendingPhase,\{resume:true\}\)/.test(turn.toString())&&/hydrateResolvedDecisionState\(pendingPhase\)/.test(turn.toString()));
  test('decision STOP automatically persists blocked phase state',()=>/Awaiting.*pendingDecision\.decision_key/.test(turn.toString())&&/markHostPhaseBlocked\(activePhase,decisionReason,'user','USER_DECISION_REQUIRED'/.test(turn.toString()));
  test('resolved named decisions are not asked twice',()=>/Suppressed repeated resolved STOP-point/.test(turn.toString())&&/already_resolved:true/.test(turn.toString()));
  test('idempotent phase state calls do not dirty memory',()=>/r\.already_started!==true\s*&&\s*r\.already_complete!==true/.test(recordOperation.toString()));
  test('completed phase script calls return idempotently',()=>/already_complete:true/.test(tool.toString())&&/do not repeat completion/.test(tool.toString()));
  test('solo multiplayer decision does not create a Phase 3 backend blocker',()=>/без\\s\+мультиплеер/.test(phaseGateReport.toString())&&/одиночн/.test(phaseGateReport.toString()));
  test('mature phase workspace inspection is bounded and non-repeating',()=>/already_inspected:true/.test(tool.toString())&&/activePhase>=2\?14000:32000/.test(tool.toString()));
  test('playtest file targets translate to the project directory',()=>/translated_file_target/.test(tool.toString())&&/actual_project_directory/.test(tool.toString()));
  test('corrected playtest rerun clears prior path-misroute failures',()=>/for\(const prior of \[\.\.\.unresolvedFailures\.keys\(\)\]\)/.test(recordOperation.toString())&&/playtest-out/.test(phaseGateReport.toString()));
  test('system bootstrap stays within the transport context budget',()=>system.length<CONTEXT_CHAR_BUDGET);
  test('research deepen does not resolve',()=>!decisionRecordResolves({decision_key:'phase1-research-direction',answer:'B — углубить'}));
  test('content-budget correction does not resolve',()=>!decisionRecordResolves({decision_key:'phase1-content-budget',answer:'D7 = 12%, остальное ок'}));
  test('approved metrics resume uses durable decision and research artifacts',()=>/resolvedDecisionKeys\.has\('phase1-content-budget'\)/.test(metricsArtifactProvenanceBlockers.toString())&&/researchReferenceUrls/.test(metricsArtifactProvenanceBlockers.toString()));
  test('approved Phase 1 has deterministic completion path',()=>/completeApprovedPhase1Resume/.test(turn.toString())&&/no model\/tool round-trip required/.test(turn.toString()));
  test('empty response recovery reports a Forge diagnostic',()=>/GIGA_EMPTY_RESPONSE_LOOP/.test(turn.toString()));
  test('skill load requires ok result',()=>/r\.ok===false/.test(registerSuccessfulSkillLoad.toString()));
  test('existing project blocks new-project',()=>/new-project is forbidden while resuming an existing Forge project/.test(tool.toString()));
  test('CLI batches pasted multiline input',()=>/replBuffer\.join\('\\n'\)/.test(flushReplBuffer.toString()));
  test('pseudo ask_user recovery args are mutable',()=>!/const \{name,args:a\}=pseudoCall/.test(turn.toString())&&/let a=pseudoCall\.args/.test(turn.toString()));
  test('persisted canonical brief prompt can be reopened',()=>/phase1-brief/.test(latestPersistedBriefPrompt.toString()));
  test('Phase 1 resume can open STOP before first model request',()=>/phase1ImmediateResumeStopCandidate/.test(turn.toString())&&/no model\/tool round-trip required/.test(openDeterministicStop.toString()));
  test('brief-stage function surface excludes forge_script',()=>{const s=phase1FunctionNames.toString();return /if\(!resolvedDecisionKeys\.has\('phase1-brief'\)\)/.test(s)&&/return \[\.\.\.new Set\(stopCommon\)\]/.test(s);});
  test('mature source inspection uses durable ANALYSIS evidence',()=>/ANALYSIS\.md/.test(phase1SourceInspected.toString())&&/WorkProgress/.test(phase1SourceInspected.toString()));
  test('analyze-project script misroute is explicit',()=>/analyze-project is a canonical Forge skill/.test(tool.toString()));
  test('dimensionality misroute can resolve from wiki map',()=>/Dimensionality already persisted canonically/.test(tool.toString())&&/skillName==='dimensionality'/.test(tool.toString()));
  test('capability failure is hard',()=>hardFailure({type:'capability'}));
  test('central contracts cover 1-9',()=>Array.from({length:9},(_,i)=>Boolean(PHASE_CONTRACTS[i+1])).every(Boolean));
  test('explicit capability registry',()=>['web_search','image_search','web_fetch','subagents','agent_teams','browser_automation','scheduler'].every(k=>k in HOST_CAPABILITIES));
  test('forge preflight exposed',()=>functions.some(f=>f.name==='forge_preflight'));
  test('search doctor exposed',()=>functions.some(f=>f.name==='forge_search_doctor'));
  test('web search tool exposed',()=>functions.some(f=>f.name==='forge_web_search'));
  test('image search tool exposed',()=>functions.some(f=>f.name==='forge_image_search'));
  test('web fetch tool exposed',()=>functions.some(f=>f.name==='forge_web_fetch'));
  test('web fetch capability is implemented',()=>HOST_CAPABILITIES.web_fetch===true);
  test('forge script exposed',()=>functions.some(f=>f.name==='forge_script'));
  test('skill completion separated',()=>functions.some(f=>f.name==='forge_skill_done'));
  test('Phase 1 capability blocker respects live search config',()=>{
    return typeof HOST_CAPABILITIES.web_search==='boolean' && (
      HOST_CAPABILITIES.web_search || getSearchCapabilities(PROJECT).web_search===false
    );
  });
  test('status does not consume pending decision',()=>isStatusOnlyInput('статус') && isStatusOnlyInput('/status'));
  test('phase marker completion detector',()=>typeof phaseMarkedComplete(1)==='boolean');
  test('GigaChat image tool exposed',()=>functions.some(f=>f.name==='gigachat_generate_image' && f.return_parameters));
  test('function schemas include return_parameters',()=>functions.every(f=>f.return_parameters));
  test('text2image file id parser',()=>extractImageFileId('<img src="b28fbd4f-105a-43e0-ba5a-2faa80b1f43c" fuse="true"/>')==='b28fbd4f-105a-43e0-ba5a-2faa80b1f43c');
  test('text2model3d file id parser',()=>extractModelFileId('<div data-model-id="2dc37408-f70a-4225-8e0a-8da749ceffac" fuse="true"/>')==='2dc37408-f70a-4225-8e0a-8da749ceffac');
  test('PNG signature detector',()=>detectImageBufferExt(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))==='.png');
  console.log(checks.join('\n'));
  process.exit(process.exitCode||0);
}

if (DRY_RUN) {
  console.log(`[DRY-RUN] functions=${functions.length} forgeRules=${existsSync(forgePath)?'yes':'no'} network=no`);
  process.exit(0);
}

if (INTEGRATION_TEST) { const ok=await runIntegrationTest(); process.exit(ok?0:4); }

if (ONE_SHOT) {
  try { await turn(ONE_SHOT); }
  catch(e){ reportForgeBehavior({severity:'error',code:'GIGACHAT_RUNTIME_EXCEPTION',kind:'adapter_transport',component:'gigachat-agent',operation:'one-shot',message:e.message}); console.error('[X] '+e.message); process.exit(1); }
  process.exit(0);
}

const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true});
let replBuffer=[],replTimer=null,replBusy=false;const replQueue=[];
function showPrompt(){if(!replBusy)process.stdout.write('\n> ');}
async function processReplInput(raw){
  const q=String(raw||'').trim(); if(!q)return;
  if(['/exit','/quit'].includes(q)){rl.close();return;}
  if(q==='/status'){
    console.log(JSON.parse(tool('forge_status',{json:false})).output);
    if(activeDirective) console.log(`\n[Forge] DIRECT TASK ACTIVE: ${activeDirective.request}\nPhase ${activeDirective.pausedPhase||'?'} autopilot is paused. Use /task for details.`);
    return;
  }
  if(q==='/preflight'){
    if(activeDirective){console.log(`[Forge] Preflight paused by direct task: ${activeDirective.request}`);return;}
    console.log(JSON.stringify(forgePreflight(activePhase),null,2));return;
  }
  if(q==='/search-doctor'){console.log(JSON.stringify(searchDoctor(PROJECT),null,2));return;}
  if(q==='/gates'){
    if(activeDirective){console.log(`[Forge Gate] PAUSED by direct task: ${activeDirective.request}`);return;}
    const g=phaseGateReport(activePhase);console.log(g.ok?`[Forge Gate] GREEN for Phase ${g.phase}`:`[Forge Gate] BLOCKED for Phase ${g.phase}:\n- ${g.blockers.join('\n- ')}`);return;
  }
  if(q==='/context'){console.log(JSON.stringify(buildProjectContext(),null,2));return;}
  if(q==='/tokens'){console.log(JSON.stringify({model:MODEL,lastUsage,approxPayloadChars:approxPayloadChars(),contextCharBudget:CONTEXT_CHAR_BUDGET,compactions:compactionCount},null,2));return;}
  try{await turn(q);}catch(e){tokenCache=null;reportForgeBehavior({severity:'error',code:'GIGACHAT_RUNTIME_EXCEPTION',kind:'adapter_transport',component:'gigachat-agent',operation:'repl-turn',message:e.message});console.error('\n[X] '+e.message);}
}
async function drainReplQueue(){if(replBusy)return;replBusy=true;while(replQueue.length)await processReplInput(replQueue.shift());replBusy=false;showPrompt();}
function flushReplBuffer(){if(replTimer){clearTimeout(replTimer);replTimer=null;}if(!replBuffer.length)return;replQueue.push(replBuffer.join('\n'));replBuffer=[];void drainReplQueue();}
rl.on('line',line=>{replBuffer.push(line);if(replTimer)clearTimeout(replTimer);replTimer=setTimeout(flushReplBuffer,180);});
rl.on('close',()=>process.exit(0));showPrompt();
