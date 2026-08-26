#!/usr/bin/env node
/**
 * Adversarial, deterministic regression for the native Godot Phase 4 evidence chain.
 * It deliberately host-attests synthetic fixture media only to exercise the policy validator's
 * positive path, then proves every receipt/hash/snapshot boundary fails closed. This is not and
 * must never be reported as a real-engine forward-test: unrestricted trusted-host shell access is
 * outside the local receipt security boundary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  captureReceiptPayload, computeGodotProofId, proofReceiptPayload, sha256File,
  validatePhase4VisualEvidence,
} from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { validatePhaseCompletion } from '../.claude/skills/status/references/phase-completion-gate.mjs';
import { appendImageProvenance } from '../.claude/skills/status/references/image-provenance.mjs';
import { pngCrc32 } from '../.claude/skills/status/references/png-integrity.mjs';
import { recordVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';
import { screenInventorySha256 } from '../.claude/skills/status/references/screen-flow-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = Object.fromEntries(['godot-screens-shoot.mjs', 'godot-proof-video.mjs', 'prepare-godot-phase4-review.mjs', 'bind-phase4-visual-evidence.mjs', 'record-phase4-visual-review.mjs'].map(name => [name, path.join(ROOT, 'scripts', name)]));
const SHIM = path.join(ROOT, 'scripts', 'fixtures', 'godot-tools', 'fake-godot.mjs');
const ADAPTER = path.join(ROOT, 'templates', 'godot', 'ForgeVisualQA.gd');
const failures = []; let passed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`[OK] ${label}`); } else { failures.push(`${label}${detail ? `: ${detail}` : ''}`); console.error(`[FAIL] ${label}${detail ? `: ${detail}` : ''}`); } };
const file = (root, rel) => path.join(root, ...rel.split('/'));
const write = (root, rel, value) => { const target = file(root, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
const json = (root, rel, value) => write(root, rel, `${JSON.stringify(value, null, 2)}\n`);
const read = (root, rel) => JSON.parse(fs.readFileSync(file(root, rel), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));

function pngChunk(type, payload) { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(payload.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(pngCrc32(Buffer.concat([name, payload]))); return Buffer.concat([length, name, payload, crc]); }
function png(width, height, seed = 1) {
  const row = Buffer.alloc(1 + width * 4); for (let x = 0; x < width; x++) { row[1 + x * 4] = (seed + x) % 251; row[2 + x * 4] = (seed * 7 + x) % 251; row[3 + x * 4] = (seed * 13) % 251; row[4 + x * 4] = 255; }
  const raw = Buffer.alloc(row.length * height); for (let y = 0; y < height; y++) row.copy(raw, y * row.length);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr), pngChunk('tEXt', Buffer.concat([Buffer.from('Comment\0'), Buffer.alloc(1200, 65 + seed % 20)])), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
function env(identity = 'builder-run') { return { ...process.env, FORGE_ALLOW_TEST_HARNESS: '1', FORGE_GODOT_TEST_SHIM: SHIM, FORGE_GODOT_BIN: '', FORGE_GODOT_FIXTURE_MODE: 'pass', FORGE_GODOT_REQUIRE_ISOLATED_USER_ENV: '1', FORGE_RUN_ATTEMPT_ID: identity, FORGE_AGENT_ID: identity.startsWith('review') ? 'independent-reviewer' : 'fixture-builder' }; }
function run(script, root, identity = 'builder-run', args = []) { const child = spawnSync(process.execPath, [script, root, ...args], { cwd: ROOT, env: env(identity), encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }); return child; }
function hostAttestSyntheticPolicyFixture(root) {
  const capRel = 'screens/review/capture-manifest.json', proofRel = 'screens/review/proof-video-manifest.json';
  const capture = read(root, capRel); capture.engine.testHarness = false; capture.captureReceiptId = null;
  const capReceipt = recordVisualReceipt({ projectRoot: root, kind: 'capture', payload: captureReceiptPayload({ manifestPath: capRel, manifest: capture }) }); capture.captureReceiptId = capReceipt.receipt.receiptId; json(root, capRel, capture);
  const proof = read(root, proofRel); proof.engine.testHarness = false; proof.proofId = null; proof.proofReceiptId = null; proof.proofId = computeGodotProofId({ manifest: proof });
  const proofReceipt = recordVisualReceipt({ projectRoot: root, kind: 'proof', payload: proofReceiptPayload({ manifestPath: proofRel, manifest: proof }) }); proof.proofReceiptId = proofReceipt.receipt.receiptId; json(root, proofRel, proof);
}
function create(root) {
  const game = 'WorkProgress/game';
  json(root, 'forge.engine.json', { schemaVersion: 1, kind: 'forge.engine-profile', engine: 'godot' });
  json(root, 'forge.godot.json', { schemaVersion: 1, kind: 'forge.godot-project', projectPath: game, scripting: 'gdscript', entryScene: 'res://main.tscn', smoke: { successMarker: 'FORGE_SMOKE_READY', quitAfterFrames: 12 }, sceneContract: { minimumNodeCount: 3, requiredNodes: ['Main','Main/World','Main/UI'], requiredNodeTypes: { Main:'Node', 'Main/World':'Node2D', 'Main/UI':'Control' }, requiredScripts:['res://main.gd'], requiredScriptAttachments:{Main:'res://main.gd'} } });
  json(root, 'forge.godot.visual.json', { schemaVersion:1, kind:'forge.godot-visual', adapter:{ protocol:'forge-godot-visual-v1', autoloadName:'ForgeVisualQA', script:'res://qa/ForgeVisualQA.gd', targetNode:'.' }, capture:{settleFrames:4,timeoutSeconds:20,viewports:{mobile:{width:412,height:720},desktop:{width:1280,height:720}}}, proofVideo:{fps:24,durationSeconds:15,viewport:'desktop',states:['home','gameplay','result']} });
  write(root, `${game}/project.godot`, 'config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n[autoload]\nForgeVisualQA="*res://qa/ForgeVisualQA.gd"\n[display]\nwindow/size/viewport_width=1280\nwindow/size/viewport_height=720\n');
  write(root, `${game}/main.tscn`, '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node"]\nscript = ExtResource("1")\n[node name="World" type="Node2D" parent="."]\n[node name="UI" type="Control" parent="."]\n');
  write(root, `${game}/main.gd`, 'extends Node\nvar visual_state := "home"\nfunc forge_visual_states(): return ["home", "gameplay", "result"]\nfunc forge_visual_show_state(s): visual_state=s\nfunc forge_visual_current_state(): return visual_state\nfunc forge_visual_tick_proof(frame,total,fps): $World.position.x=float(frame%fps)\n');
  write(root, `${game}/qa/ForgeVisualQA.gd`, fs.readFileSync(ADAPTER)); write(root, `${game}/art/production.png`, png(800,800,77));
  write(root, `${game}/main.gd`, `${fs.readFileSync(file(root, `${game}/main.gd`), 'utf8')}\n# production art res://art/production.png\n`);
  const states = [['home','Home','home'],['gameplay','Gameplay','gameplay'],['result','Result','result']];
  const flow = {schemaVersion:1,kind:'forge.screen-flow',status:'approved',entryState:'home',qaAdapter:{kind:'godot-runtime',protocol:'forge-godot-visual-v1'},states:states.map(([id,label,archetype])=>({id,label,archetype,required:true,targetPolicy:'dedicated',inheritFrom:null,visualDescription:`${label} is a fully described native visual state with a primary goal, hierarchy, feedback and responsive player controls.`,capture:{adapterState:id}})),transitions:[{from:'home',to:'gameplay',trigger:'start'},{from:'gameplay',to:'result',trigger:'finish'},{from:'result',to:'home',trigger:'return'}]}; flow.approval={decisionKey:'phase2-screen-inventory',approvedBy:'user',approvedAt:'2026-08-25T00:00:00.000Z',inventorySha256:screenInventorySha256(flow)}; json(root,'wiki/design/screen-flow.json',flow);
  write(root,'wiki/design/target-frame.md', '# Target frame\n\n'+ 'Approved target composition, readable hierarchy, lighting, colour, pacing and native mobile and desktop UI guidance. '.repeat(5));
  write(root,'assets/style/STYLE-BIBLE.md','# Style bible\n\n'+ 'Approved Godot palette, typography, interaction feedback, spacing, panel materials and responsive visual rules. '.repeat(5));
  write(root,'wiki/qa/phase-4-visual-review.md','# Independent visual review\n\n'+ 'The independent reviewer inspected every captured native state and proof sample against its approved screen target; hierarchy, readability, responsive layout, live feedback and visual contrast are acceptable. '.repeat(4));
  write(root,'assets/target/target-frame.png',png(1920,1080,9)); const refs=[]; const entries=[];
  for (const [index,[state,,archetype]] of states.entries()) { const references={}; for (const [viewport,w,h] of [['mobile',800,1400],['desktop',1600,900]]) { const rel=`assets/target/screens/${state}-${viewport}.png`, pack=`assets/prompts/${state}-${viewport}.json`; write(root,rel,png(w,h,20+index*5+(viewport==='mobile'?1:2))); json(root,pack,{schemaVersion:1,id:`${state}-${viewport}`,phase:4,status:'approved',purpose:'screen-blueprint',provider:'codex-native',model:'gpt-image-2',state,viewport,size:`${w}x${h}`,quality:'high',background:'opaque',prompt:`Approved ${state} screen`,negativeConstraints:['no watermark'],references:['assets/target/target-frame.png'],output:rel,acceptance:['approved target']}); const provenance=appendImageProvenance({projectRoot:root,provider:'codex-native',model:'gpt-image-2',output:file(root,rel),promptPack:file(root,pack),operation:{trust:'host-attestation',mode:'native-image-input',endpoint:'codex.imagegen',usedMasterTarget:true}}); references[viewport]={path:rel,sha256:sha256File(file(root,rel)),provenance:{path:provenance.provenancePath,line:provenance.line,recordSha256:provenance.recordSha256}}; } entries.push({state,archetype,mode:'dedicated',inheritedFrom:null,description:`Approved ${state} target includes the primary interaction, hierarchy, player feedback, visual focus and responsive composition.`,references}); }
  json(root,'assets/target/screens/manifest.json',{schemaVersion:1,kind:'forge.phase-4-screen-targets',masterTarget:{path:'assets/target/target-frame.png',sha256:sha256File(file(root,'assets/target/target-frame.png'))},screenFlow:{path:'wiki/design/screen-flow.json',sha256:sha256File(file(root,'wiki/design/screen-flow.json'))},states:entries});
}
function evidence(root) { return validatePhase4VisualEvidence({root}); }
function phase(root) { return validatePhaseCompletion({root,phase:4,evidence:['wiki/design/target-frame.md','wiki/design/screen-flow.json','assets/target/target-frame.png','assets/target/screens/manifest.json','assets/style/STYLE-BIBLE.md','wiki/qa/phase-4-visual-review.md','wiki/qa/phase-4-visual-evidence.json']}); }
function projectFiles(root, current=root, out=[]) {
  for (const entry of fs.readdirSync(current,{withFileTypes:true})) {
    const absolute=path.join(current,entry.name);
    if (entry.isDirectory()) projectFiles(root,absolute,out);
    else if (entry.isFile()) out.push({absolute,relative:path.relative(root,absolute)});
  }
  return out;
}
function projectSnapshot(root) {
  return new Map(projectFiles(root).map(item=>{const stat=fs.statSync(item.absolute);return [item.relative,{content:fs.readFileSync(item.absolute),mode:stat.mode,atime:stat.atime,mtime:stat.mtime}];}));
}
function restoreProject(root,snapshot) {
  for (const item of projectFiles(root)) if (!snapshot.has(item.relative)) fs.unlinkSync(item.absolute);
  for (const [relative,item] of snapshot) {
    const absolute=path.join(root,relative); fs.mkdirSync(path.dirname(absolute),{recursive:true});
    fs.writeFileSync(absolute,item.content); fs.chmodSync(absolute,item.mode); fs.utimesSync(absolute,item.atime,item.mtime);
  }
}
function mutate(root, action, assertion, expectedFailure=null) {
  const baseline=projectSnapshot(root);
  try {
    action();
    const out=evidence(root);
    const policyMatched = !expectedFailure || out.failures.some(failure=>expectedFailure.test(failure));
    check(!out.ok && policyMatched, assertion, out.failures.join('; '));
  } finally {
    restoreProject(root,baseline);
  }
  const restored=evidence(root);
  if (!restored.ok) throw new Error(`Mutation fixture did not restore its valid baseline: ${restored.failures.join('; ')}`);
}

const project=fs.mkdtempSync(path.join(os.tmpdir(),'forge-godot-phase4-adversarial-'));
try {
  create(project);
  const capture=run(SCRIPTS['godot-screens-shoot.mjs'],project); const proof=run(SCRIPTS['godot-proof-video.mjs'],project);
  check(capture.status===0 && proof.status===0,'fixture native producers create capture and proof evidence');
  hostAttestSyntheticPolicyFixture(project);
  const prepared=run(SCRIPTS['prepare-godot-phase4-review.mjs'],project); check(prepared.status===0,'reject-by-default Godot review template is prepared');
  const template=read(project,'screens/review/phase-4-visual-evidence.template.json'); template.verdict='pass'; template.summary='Independent reviewer inspected all six native screenshots against approved state-specific targets and the complete proof sequence; hierarchy, readability, responsive composition, feedback and contrast meet the required acceptance floor.';
  for (const review of template.reviews) { review.verdict='pass'; review.scores={composition:7,hierarchy:7,readability:8,styleMatch:7,responsiveness:7}; review.targetComparison.distanceScore=7; review.targetComparison.matches=['Primary interactive region aligns with the intended focal hierarchy.','Navigation and feedback grouping match the approved visual rhythm.']; review.targetComparison.differences=['Live capture has slightly flatter decorative material than the target reference.','Secondary accent contrast is lower than the target lighting treatment.','The current panel spacing is more compact than the approved target composition.']; review.critique=`This ${review.state} ${review.viewport} frame was independently examined at native scale and has readable controls, clear hierarchy, responsive composition and coherent visual feedback.`; review.defects=[]; }
  template.proofReview={verdict:'pass',videoWatched:true,statesObserved:['home','gameplay','result'],samplesReviewed:template.nativeProof.samples.map(x=>x.sha256),motionScore:8,critique:'The reviewer watched the full native proof sequence and inspected every lossless sample; state transitions, movement feedback, visual updates and camera readability are clearly demonstrated throughout.',defects:[]}; json(project,'wiki/qa/phase-4-visual-evidence.json',template);
  const bound=run(SCRIPTS['bind-phase4-visual-evidence.mjs'],project); check(bound.status===0,'evidence bindings refreshed after independent review');
  // The producer manifest stores the exact Godot invocation; Phase 4 evidence also records
  // the Forge entry points which orchestrated those invocations.
  { const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.verification={capture:{command:'node scripts/godot-screens-shoot.mjs .',exitCode:0},proof:{command:'node scripts/godot-proof-video.mjs .',exitCode:0}}; json(project,'wiki/qa/phase-4-visual-evidence.json',e); }
  const recorded=run(SCRIPTS['record-phase4-visual-review.mjs'],project,'review-session-2'); check(recorded.status===0,'independent reviewer receipt recorded from another host identity',recorded.stderr);
  check(evidence(project).ok,'host-attested synthetic Godot policy fixture passes'); check(phase(project).ok,'Phase 4 completion accepts the complete synthetic policy fixture');

  // Receipt-bound engine and manifest substitutions.
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.captureManifest='screens/review/browser/capture-manifest.json'; json(project,'screens/review/browser/capture-manifest.json',{schemaVersion:1,kind:'forge.visual-capture',generatedBy:'screens-shoot.mjs'}); json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'browser capture manifest substitution is rejected');
  mutate(project,()=>{const m=read(project,'screens/review/capture-manifest.json'); m.engine.testHarness=true; json(project,'screens/review/capture-manifest.json',m);},'test-harness capture evidence is rejected',/test harness capture/iu);
  mutate(project,()=>{const m=read(project,'screens/review/proof-video-manifest.json'); m.engine.testHarness=true; json(project,'screens/review/proof-video-manifest.json',m);},'test-harness proof evidence is rejected',/real native engine/iu);
  const gd=file(project,'WorkProgress/game/main.gd'), originalGd=fs.readFileSync(gd); mutate(project,()=>{fs.writeFileSync(gd,`${originalGd}\n# stale snapshot change`);},'adapter/content snapshot becomes stale after source modification');
  mutate(project,()=>{const m=read(project,'screens/review/proof-video-manifest.json'); m.implementationSnapshot.sha256='0'.repeat(64); json(project,'screens/review/proof-video-manifest.json',m);},'capture/proof implementation snapshot mismatch is rejected');
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.nativeProof.proofReceiptId='0'.repeat(64); json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'missing or invalid proof receipt binding is rejected');
  const video=file(project,read(project,'screens/review/proof-video-manifest.json').video.file); mutate(project,()=>fs.writeFileSync(video,Buffer.from('not an avi')),'replaced or malformed proof video is rejected');
  const sample=file(project,read(project,'screens/review/proof-video-manifest.json').samples[0].file); mutate(project,()=>fs.writeFileSync(sample,png(1280,720,201)),'replaced lossless proof sample is rejected');
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.proofReview.samplesReviewed=e.proofReview.samplesReviewed.slice(1); json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'omitted proof-sample review is rejected');
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.proofReview.samplesReviewed[1]=e.proofReview.samplesReviewed[0]; json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'duplicated proof-sample hash cannot replace a timeline point',/timeline order/iu);
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.proofReview.statesObserved=['home','home','result']; json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'duplicated observed state cannot replace a configured proof state',/exactly once/iu);
  mutate(project,()=>{const m=read(project,'screens/review/capture-manifest.json'); m.requestedStates.push(m.requestedStates[0]); json(project,'screens/review/capture-manifest.json',m);},'duplicate Godot capture requestedState is rejected',/without duplicates/iu);
  mutate(project,()=>{const m=read(project,'screens/review/proof-video-manifest.json'); m.requestedStates.push(m.requestedStates[0]); json(project,'screens/review/proof-video-manifest.json',m);},'duplicate Godot proof requestedState is rejected',/without duplicates/iu);
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.coverage.expectedStates.push(e.coverage.expectedStates[0]); json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'duplicate review coverage state is rejected',/coverage does not exactly match/iu);
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.proofReview.motionScore=5; json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'low proof motion score is rejected');
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.reviews[0].defects=[{severity:'major',description:'Blocking visual defect'}]; json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'major visual defect blocks acceptance');
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.reviewer={...e.builder,mode:'independent'}; json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'builder cannot approve own Phase 4 evidence');
  mutate(project,()=>{const e=read(project,'wiki/qa/phase-4-visual-evidence.json'); e.reviews.pop(); json(project,'wiki/qa/phase-4-visual-evidence.json',e);},'missing state/viewport review is rejected');
  const engineFile=file(project,'forge.engine.json'), engineOriginal=fs.readFileSync(engineFile); fs.writeFileSync(engineFile,JSON.stringify({schemaVersion:1,kind:'forge.engine-profile',engine:'web'})); check(!evidence(project).ok,'web engine rejects Godot-native evidence'); fs.writeFileSync(engineFile,engineOriginal);
} finally { fs.rmSync(project,{recursive:true,force:true}); }
if (failures.length) { console.error(`Godot Phase 4 adversarial regressions: ${failures.length} failed, ${passed} passed`); process.exit(1); }
console.log(`Godot Phase 4 adversarial regressions: ${passed} passed`);
