#!/usr/bin/env node
/** Offline regressions for trusted engine-aware phase routing. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { enginePhaseSupport, readTrustedProjectEngine } from '../.claude/skills/status/references/project-engine.mjs';
import {
  summarizeGodotInstalledVerifier,
  validatePhaseCompletion,
} from '../.claude/skills/status/references/phase-completion-gate.mjs';
import { validatePhase4VisualEvidence } from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';

const ROOT = resolve(process.cwd());
const errors = [];
const passed = [];

function check(condition, message, details = '') {
  if (condition) passed.push(message);
  else errors.push(`${message}${details ? `: ${details}` : ''}`);
}

function writeJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function profile(engine) {
  return { schemaVersion: 1, kind: 'forge.engine-profile', engine };
}

function hasAdapterFailure(result, phase) {
  return result.failures.some(item => item.includes(`cannot complete Phase ${phase}`) && item.includes('adapter is unavailable'));
}

const successfulNativeSummary = summarizeGodotInstalledVerifier({
  scriptName: 'godot-tech-check.mjs',
  report: {
    status: 'passed',
    renderer: 'real-window',
    proof: { renderer: { displayServer: 'Windows' } },
    issues: [],
  },
});
check(/godot-tech-check\.mjs passed/u.test(successfulNativeSummary)
  && /Windows/u.test(successfulNativeSummary)
  && !/invalid output/u.test(successfulNativeSummary),
'successful installed Godot verifier records an affirmative parsed-report summary');

const failedNativeSummary = summarizeGodotInstalledVerifier({
  scriptName: 'godot-tech-check.mjs',
  report: { status: 'failed', issues: [{ message: 'renderer unavailable' }] },
});
check(failedNativeSummary === 'renderer unavailable',
  'failed installed Godot verifier preserves its bounded issue summary');

const fixture = mkdtempSync(join(tmpdir(), 'forge-engine-phase-routing-'));
try {
  const legacy = join(fixture, 'legacy');
  const web = join(fixture, 'web');
  const godot = join(fixture, 'godot');
  const invalid = join(fixture, 'invalid');
  const unknown = join(fixture, 'unknown');
  const extra = join(fixture, 'extra');
  const isolated = join(fixture, 'isolated');
  for (const dir of [legacy, web, godot, invalid, unknown, extra, isolated]) mkdirSync(dir, { recursive: true });
  writeJson(join(web, 'forge.engine.json'), profile('web'));
  writeJson(join(godot, 'forge.engine.json'), profile('godot'));
  writeFileSync(join(invalid, 'forge.engine.json'), '{ nope', 'utf8');
  writeJson(join(unknown, 'forge.engine.json'), profile('unity'));
  writeJson(join(extra, 'forge.engine.json'), { ...profile('godot'), capabilities: { visualCapture: true } });

  const legacyProfile = readTrustedProjectEngine(legacy);
  const webProfile = readTrustedProjectEngine(web);
  const godotProfile = readTrustedProjectEngine(godot);
  check(legacyProfile.engine === 'web' && legacyProfile.source === 'default', 'legacy projects route through the installed stable Web default');
  check(webProfile.engine === 'web' && webProfile.source === 'file', 'explicit Web projects use the shared trusted reader');
  check(godotProfile.engine === 'godot' && godotProfile.status === 'experimental', 'explicit Godot projects use the shared trusted reader');

  check(enginePhaseSupport(godotProfile, 1).supported === true, 'Godot can complete engine-neutral Phase 1 analysis');
  check(enginePhaseSupport(godotProfile, 3).supported === true, 'Godot Phase 3 exposes the installed native construct verifier');
  check(enginePhaseSupport(godotProfile, 4).supported === true
    && godotProfile.capabilities.visualCapture === true && godotProfile.capabilities.proofVideo === true,
  'Godot Phase 4 exposes both native capture and proof-video capabilities');
  check(enginePhaseSupport(godotProfile, 5).supported === true, 'Godot Phase 5 exposes the installed native tech verifier');
  check(enginePhaseSupport(godotProfile, 7).supported === true, 'Godot Phase 7 exposes the installed native playtest');
  check(enginePhaseSupport(godotProfile, 8).supported === true, 'Godot Phase 8 exposes the installed release exporter');

  const legacyPhase3 = validatePhaseCompletion({ root: legacy, phase: 3, evidence: [] });
  const webPhase3 = validatePhaseCompletion({ root: web, phase: 3, evidence: [] });
  check(!hasAdapterFailure(legacyPhase3, 3) && !hasAdapterFailure(webPhase3, 3), 'Web Phase 3 keeps its existing completion path');
  check(JSON.stringify(legacyPhase3.failures) === JSON.stringify(webPhase3.failures), 'legacy and explicit Web completion failures remain identical');

  const godotPhase1 = validatePhaseCompletion({ root: godot, phase: 1, evidence: [] });
  const godotPhase3 = validatePhaseCompletion({ root: godot, phase: 3, evidence: [] });
  const godotPhase4 = validatePhaseCompletion({ root: godot, phase: 4, evidence: [] });
  const godotPhase5 = validatePhaseCompletion({ root: godot, phase: 5, evidence: [] });
  const godotPhase7 = validatePhaseCompletion({ root: godot, phase: 7, evidence: [] });
  const godotPhase8 = validatePhaseCompletion({ root: godot, phase: 8, evidence: [] });
  check(!hasAdapterFailure(godotPhase1, 1) && godotPhase1.engine?.supported === true, 'Phase 1 remains engine-neutral in the mechanical gate');
  check(!hasAdapterFailure(godotPhase3, 3) && godotPhase3.engine?.capability === 'constructVerifier' && godotPhase3.engine?.supported === true,
    'Phase 3 gate binds Godot to the available constructVerifier capability');
  check(!godotPhase3.failures.some(item => /playtest-out\/report\.json/u.test(item)), 'Godot Phase 3 never falls back to the browser playtest report');
  check(!hasAdapterFailure(godotPhase4, 4) && godotPhase4.engine?.capability === 'visualCapture' && godotPhase4.engine?.supported === true,
    'Phase 4 gate binds Godot to the installed native capture/proof capabilities');
  check(!hasAdapterFailure(godotPhase5, 5) && godotPhase5.engine?.capability === 'techVerifier' && godotPhase5.engine?.supported === true, 'Phase 5 gate binds Godot to the installed techVerifier capability');
  check(!hasAdapterFailure(godotPhase7, 7) && godotPhase7.engine?.capability === 'playtest' && godotPhase7.engine?.supported === true, 'Phase 7 gate binds Godot to the installed playtest capability');
  check(!godotPhase7.failures.some(item => /playtest-out\/report\.json|stage-out\/rt\.json/u.test(item)), 'Godot Phase 7 never accepts or requires browser playtest/stage evidence');
  check(!hasAdapterFailure(godotPhase8, 8) && godotPhase8.engine?.capability === 'releaseExport' && godotPhase8.engine?.supported === true, 'Phase 8 gate binds Godot to the installed release exporter');
  const directGodotVisual = validatePhase4VisualEvidence({ root: godot });
  const directWebVisual = validatePhase4VisualEvidence({ root: web });
  check(directGodotVisual.failures.some(item => item.includes('visual evidence is missing')),
    'direct Godot Phase 4 validation now routes to native evidence instead of a browser fallback');
  check(directWebVisual.failures.some(item => item.includes('visual evidence is missing')), 'direct Phase 4 Web validation keeps its existing evidence path');

  mkdirSync(join(godot, 'adapters'), { recursive: true });
  writeJson(join(godot, 'adapters', 'engine-profiles.json'), {
    schemaVersion: 1,
    kind: 'forge.engine-profile-registry',
    defaultEngine: 'godot',
    profiles: { godot: { capabilities: { constructVerifier: false, visualCapture: false, techVerifier: false, playtest: false, releaseExport: false } } },
  });
  const stillTrusted = validatePhaseCompletion({ root: godot, phase: 5, evidence: [] });
  check(!hasAdapterFailure(stillTrusted, 5) && stillTrusted.engine?.supported === true, 'project-local registry cannot disable or rewrite installed Godot verifier authority');

  writeJson(join(godot, 'forge.godot.json'), {
    schemaVersion: 1, kind: 'forge.godot-project', projectPath: '.', scripting: 'gdscript',
    entryScene: 'res://Main.tscn', smoke: {}, sceneContract: {},
  });
  writeJson(join(godot, 'forge.godot.playtest.json'), {
    schemaVersion: 1, kind: 'forge.godot-playtest', timeoutSeconds: 5,
    adapter: { autoloadName: 'ForgePlaytestQA', protocol: 'forge-godot-playtest-v1', script: 'res://ForgePlaytestQA.gd', targetNode: '.' },
    scenario: {
      initialExpect: { hp: 1 },
      steps: [{ action: 'move_left', expect: { hp: 2 } }, { action: 'move_right', expect: { hp: 3 } }],
      progress: { hp: 3 }, saveReload: { hp: 3 },
    },
  });
  writeFileSync(join(godot, 'ForgePlaytestQA.gd'), readFileSync(join(ROOT, 'templates', 'godot', 'ForgePlaytestQA.gd')));
  writeFileSync(join(godot, 'project.godot'), '[autoload]\nForgePlaytestQA="*res://ForgePlaytestQA.gd"\n\n[input]\nmove_left = {\n}\nmove_right = {\n}\n', 'utf8');
  writeJson(join(godot, '.forge-ai.json'), {});
  mkdirSync(join(godot, 'wiki', 'qa'), { recursive: true });
  writeFileSync(join(godot, 'wiki', 'qa', 'phase-5-tech.md'), `# Native tech\n${'verified native facts '.repeat(8)}\n`, 'utf8');
  writeFileSync(join(godot, 'wiki', 'testing.md'), `# Native testing\n${'scenario and persistence facts '.repeat(8)}\n`, 'utf8');
  writeFileSync(join(godot, 'wiki', 'qa', 'phase-7-report.md'), `# Native playtest\n${'two process observations '.repeat(8)}\n`, 'utf8');
  const previousHarness = process.env.FORGE_ALLOW_TEST_HARNESS;
  const previousShim = process.env.FORGE_GODOT_TEST_SHIM;
  const previousMode = process.env.FORGE_GODOT_PLAYTEST_FIXTURE_MODE;
  process.env.FORGE_ALLOW_TEST_HARNESS = '1';
  process.env.FORGE_GODOT_TEST_SHIM = join(ROOT, 'scripts', 'fixtures', 'godot-playtest', 'fake-godot-playtest.mjs');
  process.env.FORGE_GODOT_PLAYTEST_FIXTURE_MODE = 'pass';
  const nativeTechGate = validatePhaseCompletion({ root: godot, phase: 5, evidence: ['.forge-ai.json', 'wiki/qa/phase-5-tech.md'] });
  const nativePlaytestGate = validatePhaseCompletion({ root: godot, phase: 7, evidence: ['wiki/testing.md', 'wiki/qa/phase-7-report.md'] });
  if (previousHarness === undefined) delete process.env.FORGE_ALLOW_TEST_HARNESS; else process.env.FORGE_ALLOW_TEST_HARNESS = previousHarness;
  if (previousShim === undefined) delete process.env.FORGE_GODOT_TEST_SHIM; else process.env.FORGE_GODOT_TEST_SHIM = previousShim;
  if (previousMode === undefined) delete process.env.FORGE_GODOT_PLAYTEST_FIXTURE_MODE; else process.env.FORGE_GODOT_PLAYTEST_FIXTURE_MODE = previousMode;
  check(nativeTechGate.engineVerification?.id === 'native-tech'
    && nativeTechGate.failures.some(item => /test harness cannot PASS native tech check/u.test(item))
    && !nativeTechGate.failures.some(item => /Yandex SDK|GameplayAPI|mobile\/touch/u.test(item)),
  'Phase 5 executes native Godot tech evidence and never falls back to browser regex checks');
  check(nativePlaytestGate.engineVerification?.id === 'native-playtest'
    && nativePlaytestGate.failures.some(item => /test harness cannot PASS native playtest/u.test(item))
    && !nativePlaytestGate.failures.some(item => /playtest-out\/report\.json|stage-out\/rt\.json/u.test(item)),
  'Phase 7 executes the native two-process verifier and rejects a fixture without browser fallback');

  writeJson(join(godot, 'forge.godot.export.json'), { schemaVersion: 1, kind: 'forge.godot-export', preset: 'Windows Desktop', target: 'windows-x86_64' });
  writeFileSync(join(godot, 'export_presets.cfg'), '[preset.0]\nname="Windows Desktop"\nplatform="Windows Desktop"\nrunnable=true\nbinary_format/architecture="x86_64"\n', 'utf8');
  writeFileSync(join(godot, 'wiki', 'deploy-log.md'), `# Deploy\nTOTAL: 1 pass, 0 fail\n${'native release evidence '.repeat(8)}\n`, 'utf8');
  writeFileSync(join(godot, 'SETUP_GUIDE.md'), `# Setup\n${'Windows desktop setup and manual verification. '.repeat(8)}\n`, 'utf8');
  const releaseDir = join(godot, 'Release', 'demo', 'godot', 'windows');
  mkdirSync(releaseDir, { recursive: true });
  const fakeZip = Buffer.alloc(160); fakeZip[0] = 0x50; fakeZip[1] = 0x4b; fakeZip[2] = 0x03; fakeZip[3] = 0x04;
  for (const suffix of ['', '-debug', '-marketing']) writeFileSync(join(releaseDir, `demo-v1.0.0${suffix}.zip`), fakeZip);
  const nativeReleaseGate = validatePhaseCompletion({ root: godot, phase: 8, evidence: ['wiki/deploy-log.md', 'SETUP_GUIDE.md'] });
  check(nativeReleaseGate.engineVerification?.id === 'native-release'
    && nativeReleaseGate.failures.some(item => /no (?:strictly located )?Godot release manifest exists/u.test(item)),
  'Phase 8 rejects a browser-shaped ZIP trio unless the installed Godot release verifier accepts it');

  let invalidCode = null;
  try { readTrustedProjectEngine(invalid); }
  catch (error) { invalidCode = error.code; }
  check(invalidCode === 'ENGINE_PROFILE_INVALID_JSON', 'malformed engine selection fails closed through the shared reader', invalidCode || 'no error');
  const invalidGate = validatePhaseCompletion({ root: invalid, phase: 3, evidence: [] });
  check(invalidGate.failures.some(item => item.includes('ENGINE_PROFILE_INVALID_JSON')), 'phase completion reports malformed engine selection as a contract failure');
  let unknownCode = null;
  let extraCode = null;
  let unavailableCode = null;
  try { readTrustedProjectEngine(unknown); } catch (error) { unknownCode = error.code; }
  try { readTrustedProjectEngine(extra); } catch (error) { extraCode = error.code; }
  try { readTrustedProjectEngine(isolated, { moduleRoot: isolated, environmentRoot: '' }); } catch (error) { unavailableCode = error.code; }
  check(unknownCode === 'ENGINE_PROFILE_UNKNOWN_ENGINE', 'unknown project engine fails closed through installed authority', unknownCode || 'no error');
  check(extraCode === 'ENGINE_PROFILE_INVALID_KEYS', 'extra project engine fields cannot grant capabilities', extraCode || 'no error');
  check(unavailableCode === 'FORGE_ENGINE_ROOT_UNAVAILABLE', 'missing trusted installed engine never falls back to project-local authority', unavailableCode || 'no error');

  const phaseState = join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
  const start = spawnSync(process.execPath, [phaseState, 'start', '1', '--host', 'test'], {
    cwd: godot,
    env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
    encoding: 'utf8',
    timeout: 20_000,
  });
  const marker = start.status === 0
    ? JSON.parse(readFileSync(join(godot, 'wiki', 'phases', 'phase-1.json'), 'utf8'))
    : null;
  check(start.status === 0 && marker?.engineRuntime?.engine === 'godot' && marker?.engineRuntime?.capabilities?.visualCapture === true
    && marker?.engineRuntime?.capabilities?.proofVideo === true,
    'phase-state records the trusted engine runtime at phase start', `${start.stdout}\n${start.stderr}`);
  check(start.stdout.includes('[Forge] Engine -> godot'), 'phase start exposes the selected engine to the active agent', start.stdout);

  const nativeStart = spawnSync(process.execPath, [phaseState, 'start', '3', '--host', 'test'], {
    cwd: godot,
    env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
    encoding: 'utf8',
    timeout: 20_000,
  });
  const nativeMarker = JSON.parse(readFileSync(join(godot, 'wiki', 'phases', 'phase-3.json'), 'utf8'));
  check(nativeStart.status === 0 && nativeMarker.state === 'in_progress' && nativeMarker.engineRuntime?.capabilities?.constructVerifier === true,
    'Godot Phase 3 starts only after the native construct capability is installed', `${nativeStart.stdout}\n${nativeStart.stderr}`);

  const visualStart = spawnSync(process.execPath, [phaseState, 'start', '4', '--host', 'test'], {
    cwd: godot,
    env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
    encoding: 'utf8',
    timeout: 20_000,
  });
  const visualMarker = JSON.parse(readFileSync(join(godot, 'wiki', 'phases', 'phase-4.json'), 'utf8'));
  check(visualStart.status === 0 && visualMarker.state === 'in_progress'
    && visualMarker.engineRuntime?.capabilities?.visualCapture === true
    && visualMarker.engineRuntime?.capabilities?.proofVideo === true,
  'supported Godot visual phase starts with both native capabilities recorded', `${visualStart.stdout}\n${visualStart.stderr}`);

  const techStart = spawnSync(process.execPath, [phaseState, 'start', '5', '--host', 'test'], {
    cwd: godot,
    env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
    encoding: 'utf8',
    timeout: 20_000,
  });
  const techMarker = JSON.parse(readFileSync(join(godot, 'wiki', 'phases', 'phase-5.json'), 'utf8'));
  check(techStart.status === 0 && techMarker.state === 'in_progress' && techMarker.engineRuntime?.capabilities?.techVerifier === true,
  'Godot Phase 5 starts with the native tech capability recorded', `${techStart.stdout}\n${techStart.stderr}`);

  for (const [phase, capability] of [[7, 'playtest'], [8, 'releaseExport']]) {
    const nativeStart = spawnSync(process.execPath, [phaseState, 'start', String(phase), '--host', 'test'], {
      cwd: godot,
      env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
      encoding: 'utf8',
      timeout: 20_000,
    });
    const nativePhaseMarker = JSON.parse(readFileSync(join(godot, 'wiki', 'phases', `phase-${phase}.json`), 'utf8'));
    check(nativeStart.status === 0 && nativePhaseMarker.state === 'in_progress'
      && nativePhaseMarker.engineRuntime?.capabilities?.[capability] === true,
    `Godot Phase ${phase} starts with ${capability} recorded`, `${nativeStart.stdout}\n${nativeStart.stderr}`);
  }

  const invalidStart = spawnSync(process.execPath, [phaseState, 'start', '1', '--host', 'test'], {
    cwd: invalid,
    env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
    encoding: 'utf8',
    timeout: 20_000,
  });
  check(invalidStart.status === 2 && invalidStart.stderr.includes('ENGINE_PROFILE_INVALID_JSON'), 'phase start rejects a malformed engine profile before work begins', invalidStart.stderr);

  for (const skill of ['phase-1-analyze', 'phase-3-construct', 'phase-4-visual', 'phase-5-tech', 'phase-7-test', 'phase-8-release']) {
    const text = readFileSync(join(ROOT, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    check(text.includes('engineRuntime') && text.includes('forge.engine.json'), `${skill} declares the shared engine-aware preflight`);
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

for (const message of passed) console.log(`[OK] ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`[FAIL] ${message}`);
  console.error(`Engine phase routing regressions: ${errors.length} failed, ${passed.length} passed`);
  process.exit(1);
}
console.log(`Engine phase routing regressions: ${passed.length} passed`);
