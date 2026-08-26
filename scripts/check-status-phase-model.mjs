#!/usr/bin/env node
/** Regression test for Project Forge phase-aware status + Codex quality-first Sol policy. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTask, startTaskRun } from '../.claude/skills/status/references/execution-contract.mjs';
import { screenInventorySha256 } from '../.claude/skills/status/references/screen-flow-contract.mjs';

const ROOT = process.cwd();
const statusScript = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'project-status.mjs');
const phaseScript = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
const policyPath = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'model-policy.json');
const launcherScript = path.join(ROOT, 'scripts', 'codex-phase.mjs');
const legacyPipelineScript = path.join(ROOT, 'scripts', 'check-pipeline-state.mjs');
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
  (policy.mode==='quality-sol' && policy.serviceTier==='default' && policy.limits?.maxPhaseSubagents===2 && policy.limits?.freshTaskPerPhase===true)
    ? ok('quality policy pins Standard tier, fresh phase tasks and at most two subagents') : bad('quality policy global limits invalid');
  Object.values(policy.phases).every(p => p.base.model==='gpt-5.6-sol' && Object.values(p.routes||{}).every(r => r.model==='gpt-5.6-sol'))
    ? ok('all primary phases and named routes stay on GPT-5.6 Sol') : bad('non-Sol phase route found');
  (policy.phases['6'].base.reasoning==='medium' && policy.phases['8'].base.reasoning==='medium' && policy.phases['7'].routes['unexplained-failure'].reasoning==='xhigh')
    ? ok('reasoning effort is reduced for deterministic work and escalated only for hard failures') : bad('reasoning-effort routing drift');

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
  w(p3,'wiki/architecture/metrics.md','# Metrics\n\nD1/D7: TBD; verified external sources not obtained.\n\n## Контент-бюджет\n\n| Есть | Дефицит |\n|---|---|\n| Analysis | Implementation |\n');
  w(p3,'wiki/design/brief.md','# Brief\n\n## Аудитория\nPlayers 12+\n\n## Амбиция\nMVP\n\n## Обещание игры\nFast mastery.\n\n## Отличие\nCompact sessions.\n\n## История\nNo prior prototype.\n');
  phase(p3,'complete','1','wiki/architecture/metrics.md','wiki/design/brief.md');
  phase(p3,'block','2','Awaiting GDD approval');
  s=snap(p3);
  (s.currentPhase===2 && s.currentState==='blocked' && /GDD approval/.test(s.stopPoint||''))
    ? ok('machine phase marker overrides fallback and carries STOP reason')
    : bad('blocked phase marker not authoritative');
  const legacy = spawnSync(process.execPath, [legacyPipelineScript, p3, '--json'], { cwd: ROOT, encoding: 'utf8' });
  let legacyReport = null;
  try { legacyReport = JSON.parse(legacy.stdout); } catch {}
  (legacy.status === 0 && legacyReport?.stateModel === 'canonical-nine-phases'
    && legacyReport.currentPhase === 2 && legacyReport.phases?.length === 9
    && !('steps' in legacyReport) && !('current_step' in legacyReport))
    ? ok('legacy pipeline command is a compatibility view over the same canonical nine phases')
    : bad(`legacy pipeline exposed a competing state model: ${legacy.stderr || legacy.stdout}`);
  const supplementalTask = makeTask({
    id: 'task-status-fixture', mode: 'change', phase: 2, goal: 'Supplemental direct task',
    scope: { read: ['WorkProgress/**'], write: ['WorkProgress/**'] },
  });
  startTaskRun({ projectRoot: p3, task: supplementalTask });
  const taskStatus = snap(p3);
  (taskStatus.currentPhase === 2 && taskStatus.execution?.activeTask?.id === supplementalTask.id
    && /never phase progression/.test(taskStatus.execution?.source || ''))
    ? ok('active Task is visible but cannot become a competing phase state')
    : bad('Task runtime changed or disappeared from canonical phase status');

  const pCheckpoint=mk('release-checkpoint-block');
  for (let n=1; n<=8; n++) {
    w(pCheckpoint,`wiki/phases/phase-${n}.json`,JSON.stringify({schemaVersion:3,phase:n,state:'complete',reason:null,evidence:[]}));
  }
  const checkpointFile='.forge/git-checkpoints.json';
  const checkpointLedger = status => ({
    schemaVersion:1,updatedAt:'2026-08-26T00:00:00.000Z',phases:{
      '8':{
        phase:8,status,stage:'complete',requiredRemote:true,commit:null,
        pushed:status==='complete',remote:status==='complete'?'Nioris/release-fixture':null,
        remoteDeferred:false,skipped:false,message:status==='failed'?'push rejected':null,
        updatedAt:'2026-08-26T00:00:00.000Z',
      },
    },
  });
  w(pCheckpoint,checkpointFile,JSON.stringify(checkpointLedger('failed')));
  s=snap(pCheckpoint);
  const failedReleaseRow=s.phases.find(row=>row.phase===8);
  (s.currentPhase===8 && s.currentState==='blocked' && /push rejected/.test(s.stopPoint||'')
    && failedReleaseRow?.source==='marker-git-checkpoint' && failedReleaseRow?.gitCheckpoint?.status==='failed')
    ? ok('failed required Phase 8 Git publication holds status at Release after restart')
    : bad(`failed release checkpoint advanced incorrectly: phase=${s.currentPhase}, state=${s.currentState}`);
  w(pCheckpoint,checkpointFile,JSON.stringify(checkpointLedger('pending')));
  s=snap(pCheckpoint);
  (s.currentPhase===8 && s.currentState==='blocked')
    ? ok('pending required Phase 8 Git publication cannot advance to Live')
    : bad(`pending release checkpoint advanced to Phase ${s.currentPhase}`);
  w(pCheckpoint,checkpointFile,JSON.stringify(checkpointLedger('complete')));
  s=snap(pCheckpoint);
  s.currentPhase===9 ? ok('completed Phase 8 Git publication releases the Live gate') : bad(`completed release checkpoint stayed at Phase ${s.currentPhase}`);
  const dishonestComplete=checkpointLedger('complete');
  dishonestComplete.phases['8'].pushed=false;
  dishonestComplete.phases['8'].remote=null;
  w(pCheckpoint,checkpointFile,JSON.stringify(dishonestComplete));
  s=snap(pCheckpoint);
  (s.currentPhase===8 && s.currentState==='blocked' && s.sources.gitCheckpointLedger==='invalid')
    ? ok('a required remote checkpoint cannot claim complete without confirmed private push')
    : bad(`unconfirmed complete release checkpoint advanced to Phase ${s.currentPhase}`);
  const forgedLocalComplete=checkpointLedger('complete');
  forgedLocalComplete.phases['8'].requiredRemote=false;
  forgedLocalComplete.phases['8'].pushed=false;
  forgedLocalComplete.phases['8'].remote=null;
  w(pCheckpoint,checkpointFile,JSON.stringify(forgedLocalComplete));
  s=snap(pCheckpoint);
  (s.currentPhase===8 && s.currentState==='blocked' && s.sources.gitCheckpointLedger==='invalid')
    ? ok('Phase 8 cannot forge a local-only complete checkpoint by clearing requiredRemote')
    : bad(`forged local-only release checkpoint advanced to Phase ${s.currentPhase}`);
  fs.rmSync(path.join(pCheckpoint,checkpointFile),{force:true});
  s=snap(pCheckpoint);
  const missingLedgerDirectStart=spawnSync(process.execPath,[phaseScript,'start','9'],{cwd:pCheckpoint,encoding:'utf8'});
  (s.currentPhase===8 && s.currentState==='blocked' && missingLedgerDirectStart.status===2
    && /checkpoint reconciliation/.test(missingLedgerDirectStart.stderr||''))
    ? ok('a missing legacy Phase 8 ledger requires reconciliation before status or direct Phase 9 start can advance')
    : bad(`missing release ledger was bypassed: phase=${s.currentPhase}, startExit=${missingLedgerDirectStart.status}`);
  w(pCheckpoint,checkpointFile,'{not-json\n');
  s=snap(pCheckpoint);
  (s.currentPhase===8 && s.currentState==='blocked' && s.sources.gitCheckpointLedger==='invalid')
    ? ok('a corrupt checkpoint ledger fails closed at the completed Release gate')
    : bad(`corrupt checkpoint ledger did not hold Phase 8: phase=${s.currentPhase}, state=${s.currentState}`);

  const pLocalCheckpoint=mk('local-checkpoint-block');
  w(pLocalCheckpoint,'wiki/phases/phase-1.json',JSON.stringify({schemaVersion:3,phase:1,state:'complete',reason:null,evidence:[]}));
  w(pLocalCheckpoint,checkpointFile,JSON.stringify({
    schemaVersion:1,updatedAt:'2026-08-26T00:00:00.000Z',phases:{
      '1':{
        phase:1,status:'failed',stage:'complete',requiredRemote:false,commit:null,pushed:false,remote:null,
        remoteDeferred:false,skipped:false,message:'local index lock failed',updatedAt:'2026-08-26T00:00:00.000Z',
      },
    },
  }));
  s=snap(pLocalCheckpoint);
  const blockedDirectStart=spawnSync(process.execPath,[phaseScript,'start','2'],{cwd:pLocalCheckpoint,encoding:'utf8'});
  (s.currentPhase===1 && s.currentState==='blocked' && blockedDirectStart.status===2
    && /checkpoint reconciliation/.test(blockedDirectStart.stderr||''))
    ? ok('an explicit failed local checkpoint blocks status and direct next-phase start until reconciliation')
    : bad(`failed local checkpoint was bypassed: statusPhase=${s.currentPhase}, startExit=${blockedDirectStart.status}`);

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

  // A project can have valid completed markers up to Phase 3 while files for later
  // phases already exist (for example, from an imported prototype).  In that mixed
  // state the first missing marker is the authoritative gate: fallback must only
  // describe the evidence, never silently advance past it.
  const pMixed=mk('marker-gap-with-downstream-artifacts');
  w(pMixed,'wiki/features/game-analysis.md','# Analysis\n');
  w(pMixed,'wiki/architecture/metrics.md','# Metrics\n\n## Контент-бюджет\nНабор карт, интерфейс боя и короткая обучающая сессия входят в MVP.\n\n## Дефицит\nОтсутствуют только финальные иллюстрации, поэтому используем временные читаемые элементы.\n\nВсе целевые значения являются гипотезами для последующего теста.\n');
  w(pMixed,'wiki/design/brief.md','# Brief\n\n## Аудитория\nИгроки, которым нравятся короткие тактические карточные сессии.\n\n## Амбиция\nРабочий MVP с одним боем и понятной обратной связью.\n\n## Обещание игры\nКаждый ход даёт ясный выбор между атакой и защитой.\n\n## Отличие\nКарты меняют темп боя без сложной меты.\n\n## История\nЭто самостоятельный тестовый проект.\n');
  w(pMixed,'wiki/design/gdd.md','# GDD\n\nИгрок начинает матч с картами в руке, разыгрывает одну карту и завершает ход. Соперник отвечает простой стратегией. Победа достигается снижением здоровья противника до нуля. Интерфейс показывает здоровье, ману, руку, журнал действий и понятную кнопку окончания хода. Карты имеют стоимость и текст эффекта. MVP использует одну колоду и один короткий матч; баланс и контент расширяются после плейтеста.\n');
  w(pMixed,'wiki/plan/02-development-plan.md','# Development plan\n\n1. Реализовать состояние матча и проверку правил.\n2. Показать руку, здоровье и доступные действия.\n3. Добавить ход ИИ и экран результата.\n4. Проверить сценарий победы, поражения и перезапуска.\n\nПлан относится к MVP и не содержит незавершённых шаблонных разделов.\n');
  const mixedScreenFlow={
    schemaVersion:1,kind:'forge.screen-flow',status:'approved',entryState:'start',
    qaAdapter:{global:'__FORGE_VISUAL_QA__',query:'forgeVisualQa=1'},
    states:[
      {id:'start',label:'Start',archetype:'start',required:true,targetPolicy:'dedicated',inheritFrom:null,visualDescription:'Opening screen presents the player goal, the primary action, and a clear route into the playable card battle.',capture:{adapterState:'start'}},
      {id:'battle',label:'Battle',archetype:'gameplay',required:true,targetPolicy:'dedicated',inheritFrom:null,visualDescription:'Card battle presents the hand, health, turn controls, readable feedback, and a route back to the opening state.',capture:{adapterState:'battle'}},
    ],
    transitions:[{from:'start',to:'battle',trigger:'start match'},{from:'battle',to:'start',trigger:'restart'}],
  };
  mixedScreenFlow.approval={decisionKey:'phase2-screen-inventory',approvedBy:'user',approvedAt:'2026-08-25T00:00:00.000Z',inventorySha256:screenInventorySha256(mixedScreenFlow)};
  w(pMixed,'wiki/design/screen-flow.json',JSON.stringify(mixedScreenFlow,null,2));
  w(pMixed,'wiki/testing.md','# Testing\n\nАвтоматический сценарий запускает матч, разыгрывает карту, передаёт ход и проверяет отсутствие ошибок. Отчёт фиксирует живой requestAnimationFrame и пустой список консольных ошибок. Ручная проверка подтверждает читаемость руки, кнопки окончания хода и экрана результата на портретном экране.\n');
  w(pMixed,'GameIntegration/runtime.js',`<meta name="viewport"><style>*{touch-action:none}</style>\nYaGames.init();\nLoadingAPI.ready();\nconst language = ysdk.environment.i18n.lang;\nconst I18N = {};\n`);
  w(pMixed,'WorkProgress/runtime.js','export const startMatch = () => ({ turn: 1, playerHealth: 20, enemyHealth: 20 });\n');
  w(pMixed,'playtest-out/report.json',JSON.stringify({rafAlive:true,errors:[],actions:['start','play-card','end-turn']}));
  phase(pMixed,'complete','1','wiki/features/game-analysis.md','wiki/architecture/metrics.md','wiki/design/brief.md');
  phase(pMixed,'complete','2','wiki/design/gdd.md','wiki/plan/02-development-plan.md','wiki/design/screen-flow.json');
  phase(pMixed,'complete','3','wiki/plan/02-development-plan.md','wiki/testing.md');
  for (const n of [1,2,3]) {
    const mixedMarker=JSON.parse(fs.readFileSync(path.join(pMixed,'wiki/phases',`phase-${n}.json`),'utf8'));
    (mixedMarker.schemaVersion===3 && mixedMarker.state==='complete')
      ? ok(`mixed-mode fixture has a valid schema v3 completion marker for Phase ${n}`)
      : bad(`mixed-mode fixture Phase ${n} marker is not schema v3 complete`);
  }
  // Legacy inference sees a completed visual pass: direction + target frame +
  // an approved asset. This must be deterministic and must not depend on mtime ordering.
  w(pMixed,'wiki/design/art-direction-card-chaos.md','# Art direction\n');
  w(pMixed,'wiki/design/target-frame.md','# Target frame\n');
  w(pMixed,'assets/generated/approved/phase4-card.png','approved-fixture');
  // The existing runtime strings deliberately satisfy every Phase 5 legacy health signal.
  // This is Phase 6 evidence, intentionally incomplete because no listing exists.
  w(pMixed,'Release/SETUP_GUIDE.md','# Setup guide\n');
  s=snap(pMixed);
  const mixed4=s.phases.find(row=>row.phase===4);
  const mixed5=s.phases.find(row=>row.phase===5);
  const mixed6=s.phases.find(row=>row.phase===6);
  (s.currentPhase===4 && s.currentState==='pending' && mixed4?.source==='marker-absent')
    ? ok('a missing Phase 4 marker remains the authoritative pending gate despite complete legacy evidence')
    : bad(`marker gap skipped the Phase 4 gate: phase=${s.currentPhase}, state=${s.currentState}, source=${mixed4?.source}`);
  (mixed5?.state==='not_reached' && mixed5?.aheadOfGate===true && mixed6?.aheadOfGate===true && s.warnings.length>=2)
    ? ok('Phase 5 completion and Phase 6 partial evidence are warned as ahead of the missing marker gate')
    : bad(`downstream marker-gap evidence was not safely fenced: p5=${mixed5?.state}/${mixed5?.aheadOfGate}, p6=${mixed6?.state}/${mixed6?.aheadOfGate}`);

  const p6=mk('phase-writer');
  phase(p6,'start','4');
  let marker=JSON.parse(fs.readFileSync(path.join(p6,'wiki/phases/phase-4.json'),'utf8'));
  marker.state==='in_progress' ? ok('phase-state start writes machine marker') : bad('phase-state start failed');
  (marker.schemaVersion===3 && marker.execution?.workflow==='phase' && marker.execution?.resultStatus==='in_progress' && marker.modelRuntime?.recommendedCodex?.model==='gpt-5.6-sol' && marker.modelRuntime?.recommendedCodex?.reasoning==='high' && marker.modelRuntime?.selection?.model===null && marker.modelRuntime?.selection?.source==='unreported' && marker.modelRuntime?.subagents?.limit===2)
    ? ok('phase marker separates the Codex recommendation from an unreported actual model') : bad('phase marker model runtime missing or wrong');
  phase(p6,'block','4','Awaiting target frame');
  marker=JSON.parse(fs.readFileSync(path.join(p6,'wiki/phases/phase-4.json'),'utf8'));
  (marker.state==='blocked' && marker.block?.owner==='user' && marker.execution?.currentNode==='wait-user') ? ok('phase-state block records a structured user STOP') : bad('phase-state block failed');

  const pHost=mk('host-only-selection');
  phaseEnv(pHost,{FORGE_AI_HOST:'gigachat'},'start','1');
  marker=JSON.parse(fs.readFileSync(path.join(pHost,'wiki/phases/phase-1.json'),'utf8'));
  (marker.modelRuntime?.selection?.host==='gigachat' && marker.modelRuntime?.selection?.model===null && marker.modelRuntime?.selection?.source==='host-declared')
    ? ok('host-only phase state records GigaChat without inventing a Codex model') : bad('host-only phase state invented or lost model metadata');

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
