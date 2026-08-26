#!/usr/bin/env node
/** Deterministic regressions for native Godot state capture and proof video. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { screenInventorySha256 } from '../.claude/skills/status/references/screen-flow-contract.mjs';
import { configureIsolatedGodotViewport, makeIsolatedGodotCopy } from './godot-visual-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const captureScript = path.join(ROOT, 'scripts', 'godot-screens-shoot.mjs');
const videoScript = path.join(ROOT, 'scripts', 'godot-proof-video.mjs');
const shim = path.join(ROOT, 'scripts', 'fixtures', 'godot-tools', 'fake-godot.mjs');
const adapterTemplate = path.join(ROOT, 'templates', 'godot', 'ForgeVisualQA.gd');
const passed = [];
const errors = [];

function check(condition, message, details = '') {
  if (condition) passed.push(message);
  else errors.push(`${message}${details ? `: ${details}` : ''}`);
}

function write(root, rel, content) {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function writeJson(root, rel, value) {
  return write(root, rel, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8'));
}

function run(script, root, fixtureMode = 'pass') {
  const child = spawnSync(process.execPath, [script, root, '--json'], {
    cwd: ROOT,
    env: {
      ...process.env,
      FORGE_ALLOW_TEST_HARNESS: '1',
      FORGE_GODOT_TEST_SHIM: shim,
      FORGE_GODOT_BIN: '',
      FORGE_GODOT_FIXTURE_MODE: fixtureMode,
      FORGE_GODOT_REQUIRE_ISOLATED_USER_ENV: '1',
      FORGE_GODOT_EXPECT_CLASS_CACHE: 'FixtureVisualClass',
      FORGE_RUN_ATTEMPT_ID: `visual-fixture-${fixtureMode}`,
      FORGE_AGENT_ID: 'fixture-agent',
    },
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  let value = null;
  try { value = JSON.parse(child.stdout); } catch {}
  return { child, value };
}

function createProject(root) {
  const game = 'WorkProgress/game';
  writeJson(root, 'forge.engine.json', { schemaVersion: 1, kind: 'forge.engine-profile', engine: 'godot' });
  writeJson(root, 'forge.godot.json', {
    schemaVersion: 1,
    kind: 'forge.godot-project',
    projectPath: game,
    scripting: 'gdscript',
    entryScene: 'res://main.tscn',
    smoke: { successMarker: 'FORGE_SMOKE_READY', quitAfterFrames: 12 },
    sceneContract: {
      minimumNodeCount: 3,
      requiredNodes: ['Main', 'Main/World', 'Main/UI'],
      requiredNodeTypes: { Main: 'Node', 'Main/World': 'Node2D', 'Main/UI': 'Control' },
      requiredScripts: ['res://main.gd'],
      requiredScriptAttachments: { Main: 'res://main.gd' },
    },
  });
  writeJson(root, 'forge.godot.visual.json', {
    schemaVersion: 1,
    kind: 'forge.godot-visual',
    adapter: {
      protocol: 'forge-godot-visual-v1',
      autoloadName: 'ForgeVisualQA',
      script: 'res://qa/ForgeVisualQA.gd',
      targetNode: '.',
    },
    capture: {
      settleFrames: 4,
      timeoutSeconds: 20,
      viewports: { mobile: { width: 412, height: 720 }, desktop: { width: 1280, height: 720 } },
    },
    proofVideo: { fps: 24, durationSeconds: 15, viewport: 'desktop', states: ['home', 'gameplay', 'result'] },
  });
  write(root, `${game}/project.godot`, `config_version=5

[application]
run/main_scene="res://main.tscn"

[autoload]
ForgeVisualQA="*res://qa/ForgeVisualQA.gd"

[display]
window/size/viewport_width=1280
window/size/viewport_height=720

[rendering]
renderer/rendering_method="gl_compatibility"
`);
  write(root, `${game}/main.tscn`, `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://main.gd" id="1_main"]

[node name="Main" type="Node"]
script = ExtResource("1_main")

[node name="World" type="Node2D" parent="."]

[node name="UI" type="Control" parent="."]
`);
  write(root, `${game}/main.gd`, `extends Node
var visual_state := "home"
func _ready(): print("FORGE_SMOKE_READY")
func forge_visual_states(): return ["home", "gameplay", "result"]
func forge_visual_show_state(state): visual_state = state
func forge_visual_current_state(): return visual_state
func forge_visual_tick_proof(frame, total_frames, fps): $World.position.x = float(frame % fps)
`);
  write(root, `${game}/fixture_visual_class.gd`, 'class_name FixtureVisualClass\nextends RefCounted\n');
  write(root, `${game}/qa/ForgeVisualQA.gd`, fs.readFileSync(adapterTemplate));
  write(root, `${game}/screens/reference.txt`, 'game-owned visual reference asset');
  const flow = {
    schemaVersion: 1,
    kind: 'forge.screen-flow',
    status: 'approved',
    entryState: 'home',
    qaAdapter: { kind: 'godot-runtime', protocol: 'forge-godot-visual-v1' },
    states: [
      { id: 'home', label: 'Home', archetype: 'home', visualDescription: 'Main native home screen with title, primary action and readable navigation hierarchy.', required: true, capture: { adapterState: 'home' }, targetPolicy: 'dedicated', inheritFrom: null },
      { id: 'gameplay', label: 'Gameplay', archetype: 'gameplay', visualDescription: 'Active native gameplay state with moving world, HUD values and clearly visible player feedback.', required: true, capture: { adapterState: 'gameplay' }, targetPolicy: 'dedicated', inheritFrom: null },
      { id: 'result', label: 'Result', archetype: 'result', visualDescription: 'Completed run result screen with score summary, reward feedback and an obvious return action.', required: true, capture: { adapterState: 'result' }, targetPolicy: 'dedicated', inheritFrom: null },
    ],
    transitions: [
      { from: 'home', to: 'gameplay', trigger: 'start run' },
      { from: 'gameplay', to: 'result', trigger: 'finish run' },
      { from: 'result', to: 'home', trigger: 'return home' },
    ],
    approval: { decisionKey: 'phase2-screen-inventory', approvedBy: 'user', approvedAt: '2026-08-25T00:00:00.000Z', inventorySha256: '' },
  };
  flow.approval.inventorySha256 = screenInventorySha256(flow);
  writeJson(root, 'wiki/design/screen-flow.json', flow);
}

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-visual-fixture-'));
try {
  createProject(project);
  const capture = run(captureScript, project);
  check(capture.child.status === 0 && capture.value?.status === 'passed', 'native Godot state capture passes with the explicit fixture protocol', `${capture.child.stdout}\n${capture.child.stderr}`);
  const captureManifest = readJson(project, 'screens/review/capture-manifest.json');
  check(captureManifest.generatedBy === 'godot-screens-shoot.mjs'
    && captureManifest.captureMode === 'forge-godot-runtime-adapter'
    && captureManifest.captures.length === 6,
  'capture manifest records every approved state at mobile and desktop viewports');
  check(captureManifest.captureReceiptId && captureManifest.captures.every(item => item.stateProof?.mechanism === 'forge-godot-runtime-adapter'),
    'native capture is bound to adapter state proof and a trusted receipt');
  check(/^[a-f0-9]{64}$/u.test(captureManifest.stateAdapter?.sha256 || '')
    && /^[a-f0-9]{64}$/u.test(captureManifest.visualContract?.sha256 || '')
    && /^[a-f0-9]{64}$/u.test(captureManifest.implementationSnapshot?.sha256 || ''),
  'capture manifest binds the exact adapter, visual contract and implementation snapshot hashes');
  check(!captureManifest.command.includes('--headless'), 'native visual capture never substitutes Godot headless dummy rendering');

  const video = run(videoScript, project);
  check(video.child.status === 0 && video.value?.status === 'passed', 'deterministic Godot MovieWriter proof video passes', `${video.child.stdout}\n${video.child.stderr}`);
  const videoManifest = readJson(project, 'screens/review/proof-video-manifest.json');
  check(videoManifest.verdict === 'pass' && videoManifest.video.actualFrames === 360
    && videoManifest.video.streamHandler === 'MJPG' && videoManifest.video.compression === 'MJPG'
    && videoManifest.video.uniqueFrames === 360 && videoManifest.video.indexValidated === true
    && videoManifest.video.indexVideoEntries === 360
    && videoManifest.timeline.length === 3 && videoManifest.samples.length === 15
    && videoManifest.thresholds.actualUniqueSamples === 15
    && videoManifest.thresholds.minimumUniqueVideoFrames === 12
    && videoManifest.thresholds.actualUniqueVideoFrames === 360,
  'proof manifest binds indexed MJPEG frames, duration, lossless motion samples and the approved state timeline');
  check(/^[a-f0-9]{64}$/u.test(videoManifest.stateAdapter?.sha256 || '')
    && /^[a-f0-9]{64}$/u.test(videoManifest.visualContract?.sha256 || '')
    && /^[a-f0-9]{64}$/u.test(videoManifest.implementationSnapshot?.sha256 || ''),
  'proof manifest binds the exact adapter, visual contract and implementation snapshot hashes');
  check(/^[a-f0-9]{64}$/u.test(videoManifest.proofId || '')
    && /^[a-f0-9]{64}$/u.test(videoManifest.proofReceiptId || ''),
  'proof run receives an immutable engine-owned proof receipt');
  check(videoManifest.implementationSnapshot.sha256 === captureManifest.implementationSnapshot.sha256,
    'capture and proof are bound to the same Godot implementation snapshot');
  check(!videoManifest.command.includes('--headless'), 'proof video uses a real renderer rather than headless capture');

  const mismatch = run(captureScript, project, 'state-mismatch');
  check(mismatch.child.status === 1 && mismatch.value?.status === 'failed'
    && mismatch.value?.issues?.some(item => item.code === 'GODOT_VISUAL_RUNTIME'),
  'reported state mismatch is a project failure, never a successful screenshot');

  const frozen = run(videoScript, project, 'frozen-video');
  check(frozen.child.status === 1 && frozen.value?.status === 'failed'
    && frozen.value?.issues?.some(item => item.code === 'GODOT_PROOF_FROZEN'),
  'an effectively frozen proof video is rejected mechanically');

  const frozenAvi = run(videoScript, project, 'frozen-avi');
  check(frozenAvi.child.status === 1 && frozenAvi.value?.status === 'failed'
    && frozenAvi.value?.issues?.some(item => item.code === 'GODOT_PROOF_VIDEO_FROZEN')
    && !frozenAvi.value?.issues?.some(item => item.code === 'GODOT_PROOF_FROZEN'),
  'a frozen AVI cannot hide behind changing lossless PNG samples');

  const malformedAvi = run(videoScript, project, 'malformed-avi');
  check(malformedAvi.child.status === 1 && malformedAvi.value?.status === 'failed'
    && malformedAvi.value?.issues?.some(item => item.code === 'GODOT_PROOF_CODEC'),
  'RIFF data without MJPG stream headers and real JPEG frames is rejected');

  const badAviIndex = run(videoScript, project, 'bad-avi-index');
  check(badAviIndex.child.status === 1 && badAviIndex.value?.status === 'failed'
    && badAviIndex.value?.issues?.some(item => item.code === 'GODOT_PROOF_CODEC'),
  'AVI idx1 offsets and sizes must match the actual MJPEG chunks');

  const shortVideo = run(videoScript, project, 'short-video');
  check(shortVideo.child.status === 1 && shortVideo.value?.status === 'failed'
    && shortVideo.value?.issues?.some(item => item.code === 'GODOT_PROOF_FRAMES'),
  'proof video shorter than the contract by two frames is rejected');

  const identicalStates = run(captureScript, project, 'identical-state-pixels');
  check(identicalStates.child.status === 1 && identicalStates.value?.status === 'failed'
    && identicalStates.value?.issues?.some(item => item.code === 'GODOT_VISUAL_IDENTICAL_STATES'),
  'different approved states with identical pixels are rejected');
  const identicalManifest = readJson(project, 'screens/review/capture-manifest.json');
  check(identicalManifest.captureReceiptId === null && identicalManifest.statePixelCollisions.length > 0,
    'identical-state capture cannot receive a trusted PASS receipt');

  const displayFailure = run(captureScript, project, 'display-fail');
  check(displayFailure.child.status === 2 && displayFailure.value?.status === 'environment_failure',
    'missing native display/GPU is an environment blocker, not PASS');

  const parseDisplayFailure = run(captureScript, project, 'parse-display-fail');
  check(parseDisplayFailure.child.status === 1 && parseDisplayFailure.value?.status === 'failed'
    && parseDisplayFailure.value?.issues?.some(item => /Parse Error: fixture parse failure/u.test(item.message)),
  'visual capture does not mask a project parse error as a display environment blocker');

  const visualFile = path.join(project, 'forge.godot.visual.json');
  const validVisual = JSON.parse(fs.readFileSync(visualFile, 'utf8'));
  fs.writeFileSync(visualFile, JSON.stringify({ ...validVisual, surprise: true }));
  const forged = run(captureScript, project);
  check(forged.child.status === 1 && forged.value?.issues?.some(item => item.code === 'GODOT_VISUAL_CONTRACT'),
    'unknown visual contract fields fail closed before native execution');
  fs.writeFileSync(visualFile, `${JSON.stringify(validVisual, null, 2)}\n`);

  const isolated = makeIsolatedGodotCopy(path.join(project, 'WorkProgress', 'game'));
  try {
    const sourceProjectBefore = fs.readFileSync(path.join(project, 'WorkProgress', 'game', 'project.godot'), 'utf8');
    configureIsolatedGodotViewport(isolated.isolatedProject, { width: 412, height: 720 });
    const override = fs.readFileSync(path.join(isolated.isolatedProject, 'override.cfg'), 'utf8');
    check(override.includes('window/size/viewport_width=412') && override.includes('window/size/viewport_height=720')
      && fs.readFileSync(path.join(project, 'WorkProgress', 'game', 'project.godot'), 'utf8') === sourceProjectBefore,
    'viewport override is applied only to the isolated Godot copy');
    check(fs.readFileSync(path.join(isolated.isolatedProject, 'screens', 'reference.txt'), 'utf8') === 'game-owned visual reference asset',
      'isolated capture preserves game-owned screens assets outside screens/review');
  } finally {
    fs.rmSync(isolated.tempRoot, { recursive: true, force: true });
  }

  const projectFile = path.join(project, 'WorkProgress', 'game', 'project.godot');
  const validProject = fs.readFileSync(projectFile, 'utf8');
  fs.writeFileSync(projectFile, validProject.replace('ForgeVisualQA="*res://qa/ForgeVisualQA.gd"', ''));
  const noAutoload = run(captureScript, project);
  check(noAutoload.child.status === 1 && noAutoload.value?.issues?.some(item => item.code === 'GODOT_VISUAL_ADAPTER'),
    'missing project.godot autoload registration blocks capture');

  const linkedProject = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-visual-link-'));
  const externalGame = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-visual-external-'));
  try {
    createProject(linkedProject);
    const localGame = path.join(linkedProject, 'WorkProgress', 'game');
    fs.cpSync(localGame, externalGame, { recursive: true });
    fs.rmSync(localGame, { recursive: true, force: true });
    fs.symlinkSync(externalGame, localGame, process.platform === 'win32' ? 'junction' : 'dir');
    const linked = run(captureScript, linkedProject);
    check(linked.child.status === 1 && linked.value?.issues?.some(item => item.code === 'GODOT_VISUAL_PROJECT_LINK'),
      'implementation root junction cannot escape the managed Godot project');
  } finally {
    fs.rmSync(linkedProject, { recursive: true, force: true });
    fs.rmSync(externalGame, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(project, { recursive: true, force: true });
}

for (const message of passed) console.log(`[OK] ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`[FAIL] ${message}`);
  console.error(`Godot visual capture regressions: ${errors.length} failed, ${passed.length} passed`);
  process.exit(1);
}
console.log(`Godot visual capture regressions: ${passed.length} passed`);
