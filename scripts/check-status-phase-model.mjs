#!/usr/bin/env node
/** Regression test for Project Forge phase-aware status + Codex economy model policy. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const statusScript = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'project-status.mjs');
const phaseScript = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
const policyPath = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'model-policy.json');
const launcherScript = path.join(ROOT, 'scripts', 'codex-phase.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-status-'));
const fails = [];
const ok = msg => console.log('  ✓ ' + msg);
const bad = msg => { fails.push(msg); console.log('  ✗ ' + msg); };
const w = (base, rel, content='') => { const p=path.join(base, rel); fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, content); return p; };
const mk = name => { const p=path.join(tmp,name); fs.mkdirSync(p,{recursive:true}); w(p,'CLAUDE.md',`# ${name}\n\n## Project type\ngame\n\n## State\nJust created.\n`); w(p,'.forge-managed.json', JSON.stringify({forgeVersion:'4.67.1'})); return p; };
function snap(p){ const r=spawnSync(process.execPath,[statusScript,p,'--json'],{encoding:'utf8'}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return JSON.parse(r.stdout); }
function phase(p,...a){ const r=spawnSync(process.execPath,[phaseScript,...a],{cwd:p,encoding:'utf8'}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return r.stdout; }
function phaseEnv(p,env,...a){ const r=spawnSync(process.execPath,[phaseScript,...a],{cwd:p,encoding:'utf8',env:{...process.env,...env}}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return r.stdout; }

try {
  console.log('Project Forge phase-aware status audit');
  console.log('──────────────────────────────────────');

  const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
  const phaseIds=Object.keys(policy.phases||{}).sort();
  JSON.stringify(phaseIds)===JSON.stringify(['1','2','3','4','5','6','7','8','9'])
    ? ok('model policy covers exactly the canonical nine phases') : bad(`model policy phases: ${phaseIds.join(',')}`);
  (policy.mode==='economy' && policy.serviceTier==='default' && policy.limits?.maxPhaseSubagents===2)
    ? ok('economy policy pins Standard tier and at most two phase subagents') : bad('economy policy global limits invalid');
  (policy.phases['2'].base.model==='gpt-5.6-sol' && policy.phases['5'].base.model==='gpt-5.6-terra' && policy.phases['5'].base.reasoning==='high')
    ? ok('high-value design and technical routes use the intended models') : bad('Phase 2/5 model policy drift');
  (policy.phases['6'].base.model==='gpt-5.6-terra' && policy.phases['8'].base.model==='gpt-5.6-terra')
    ? ok('listing is not wholly delegated to Luna and release is not permanently on Sol') : bad('Phase 6/8 economy routing drift');

  const p1=mk('new-game');
  w(p1,'wiki/design/brief.md','# Brief\n');
  w(p1,'.forge-ai.json','{}');
  w(p1,'assets/style/STYLE-BIBLE.md','# STYLE BIBLE\n\nStatus: draft\n');
  let s=snap(p1);
  s.currentPhase===1 ? ok('new project stays in Phase 1; template brief/style do not fake completion') : bad(`new project inferred Phase ${s.currentPhase}`);
  s.aiStudio.styleBible==='draft' ? ok('draft Style Bible is reported as draft') : bad('draft Style Bible misclassified');

  const p2=mk('analysis-done');
  w(p2,'WorkProgress/analysis-done/ANALYSIS.md','# analysis');
  w(p2,'wiki/architecture/metrics.md','# approved metrics');
  s=snap(p2);
  s.currentPhase===2 ? ok('analysis+metrics advances legacy inference to Phase 2') : bad(`analysis fixture inferred Phase ${s.currentPhase}`);

  const p3=mk('marker-block');
  w(p3,'WorkProgress/marker-block/ANALYSIS.md','# analysis');
  w(p3,'wiki/architecture/metrics.md','# metrics');
  phase(p3,'complete','1','wiki/architecture/metrics.md');
  phase(p3,'block','2','Awaiting GDD approval');
  s=snap(p3);
  (s.currentPhase===2 && s.currentState==='blocked' && /GDD approval/.test(s.stopPoint||''))
    ? ok('machine phase marker overrides fallback and carries STOP reason')
    : bad('blocked phase marker not authoritative');

  const p4=mk('stale-claude');
  w(p4,'WorkProgress/stale-claude/ANALYSIS.md','# analysis');
  w(p4,'wiki/architecture/metrics.md','# metrics');
  w(p4,'wiki/design/gdd.md','# gdd');
  w(p4,'wiki/plan/02-development-plan.md','# plan');
  s=snap(p4);
  s.currentPhase>=3 ? ok('stale CLAUDE "Just created" does not roll progress back') : bad(`stale CLAUDE rolled project to Phase ${s.currentPhase}`);
  s.sources.claudeState==='ignored-for-progress' ? ok('status snapshot explicitly ignores CLAUDE mutable state') : bad('CLAUDE state source policy missing');

  const p5=mk('gate-hole');
  w(p5,'index.html','<meta name="viewport"><style>*{touch-action:none}</style><script>YaGames.init(); ysdk.environment.i18n.lang; LoadingAPI.ready();</script>');
  s=snap(p5);
  s.currentPhase===1 ? ok('downstream SDK evidence cannot skip missing Phase 1 gate') : bad(`gate hole skipped to Phase ${s.currentPhase}`);
  s.warnings.length>0 ? ok('downstream evidence ahead of gate is surfaced as warning') : bad('downstream evidence warning missing');

  const p6=mk('phase-writer');
  phase(p6,'start','4');
  let marker=JSON.parse(fs.readFileSync(path.join(p6,'wiki/phases/phase-4.json'),'utf8'));
  marker.state==='in_progress' ? ok('phase-state start writes machine marker') : bad('phase-state start failed');
  (marker.schemaVersion===2 && marker.modelRuntime?.recommendedCodex?.model==='gpt-5.6-terra' && marker.modelRuntime?.recommendedCodex?.reasoning==='medium' && marker.modelRuntime?.selection?.model===null && marker.modelRuntime?.selection?.source==='unreported' && marker.modelRuntime?.subagents?.limit===2)
    ? ok('phase marker separates the Codex recommendation from an unreported actual model') : bad('phase marker model runtime missing or wrong');
  phase(p6,'block','4','Awaiting target frame');
  marker=JSON.parse(fs.readFileSync(path.join(p6,'wiki/phases/phase-4.json'),'utf8'));
  marker.state==='blocked' ? ok('phase-state block records STOP state') : bad('phase-state block failed');

  const p7=mk('launcher-route');
  phaseEnv(p7,{
    FORGE_AI_HOST:'codex', FORGE_MODEL:'gpt-5.6-sol', FORGE_REASONING_EFFORT:'high',
    FORGE_SERVICE_TIER:'default', FORGE_MODEL_ROUTE:'payment-security', FORGE_MODEL_ENFORCED:'1',
  },'start','5');
  marker=JSON.parse(fs.readFileSync(path.join(p7,'wiki/phases/phase-5.json'),'utf8'));
  (marker.modelRuntime?.selection?.route==='payment-security' && marker.modelRuntime?.selection?.enforced===true && marker.modelRuntime?.selection?.source==='launcher-env')
    ? ok('launcher-enforced escalation is durable in phase state') : bad('launcher escalation was not recorded');

  const dry=spawnSync(process.execPath,[launcherScript,'8','--route','moderation-rejection','--cwd',p7,'--dry-run'],{cwd:ROOT,encoding:'utf8'});
  (dry.status===0 && /gpt-5\.6-sol/.test(dry.stdout) && /service_tier/.test(dry.stdout) && /\$phase-8-release/.test(dry.stdout))
    ? ok('Codex phase launcher resolves model, Standard tier and phase invocation') : bad(`Codex launcher dry-run failed: ${dry.stderr||dry.stdout}`);

} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}

if (fails.length) {
  console.log(`\nFAILED: ${fails.length} issue(s)`);
  process.exit(1);
}
console.log('\nPASS: /status uses the canonical 9-phase model and machine markers safely');
