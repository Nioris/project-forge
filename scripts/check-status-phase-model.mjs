#!/usr/bin/env node
/** Regression test for Project Forge v4.67.1 phase-aware /status model. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const statusScript = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'project-status.mjs');
const phaseScript = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-status-'));
const fails = [];
const ok = msg => console.log('  ✓ ' + msg);
const bad = msg => { fails.push(msg); console.log('  ✗ ' + msg); };
const w = (base, rel, content='') => { const p=path.join(base, rel); fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, content); return p; };
const mk = name => { const p=path.join(tmp,name); fs.mkdirSync(p,{recursive:true}); w(p,'CLAUDE.md',`# ${name}\n\n## Project type\ngame\n\n## State\nJust created.\n`); w(p,'.forge-managed.json', JSON.stringify({forgeVersion:'4.67.1'})); return p; };
function snap(p){ const r=spawnSync(process.execPath,[statusScript,p,'--json'],{encoding:'utf8'}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return JSON.parse(r.stdout); }
function phase(p,...a){ const r=spawnSync(process.execPath,[phaseScript,...a],{cwd:p,encoding:'utf8'}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return r.stdout; }

try {
  console.log('Project Forge phase-aware status audit');
  console.log('──────────────────────────────────────');

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
  phase(p6,'block','4','Awaiting target frame');
  marker=JSON.parse(fs.readFileSync(path.join(p6,'wiki/phases/phase-4.json'),'utf8'));
  marker.state==='blocked' ? ok('phase-state block records STOP state') : bad('phase-state block failed');

} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}

if (fails.length) {
  console.log(`\nFAILED: ${fails.length} issue(s)`);
  process.exit(1);
}
console.log('\nPASS: /status uses the canonical 9-phase model and machine markers safely');
