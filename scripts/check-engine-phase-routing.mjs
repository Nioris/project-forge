#!/usr/bin/env node
/** Offline regressions for trusted engine-aware phase routing. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { enginePhaseSupport, readTrustedProjectEngine } from '../.claude/skills/status/references/project-engine.mjs';
import { validatePhaseCompletion } from '../.claude/skills/status/references/phase-completion-gate.mjs';
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
  check(enginePhaseSupport(godotProfile, 4).supported === false, 'Godot Phase 4 fails closed before native capture exists');
  check(enginePhaseSupport(godotProfile, 5).supported === false, 'Godot Phase 5 fails closed before its tech verifier exists');
  check(/window\.__FORGE_VISUAL_QA__/.test(enginePhaseSupport(godotProfile, 4).message), 'Godot Phase 4 rejection names the invalid browser adapter substitution');

  const legacyPhase3 = validatePhaseCompletion({ root: legacy, phase: 3, evidence: [] });
  const webPhase3 = validatePhaseCompletion({ root: web, phase: 3, evidence: [] });
  check(!hasAdapterFailure(legacyPhase3, 3) && !hasAdapterFailure(webPhase3, 3), 'Web Phase 3 keeps its existing completion path');
  check(JSON.stringify(legacyPhase3.failures) === JSON.stringify(webPhase3.failures), 'legacy and explicit Web completion failures remain identical');

  const godotPhase1 = validatePhaseCompletion({ root: godot, phase: 1, evidence: [] });
  const godotPhase3 = validatePhaseCompletion({ root: godot, phase: 3, evidence: [] });
  const godotPhase4 = validatePhaseCompletion({ root: godot, phase: 4, evidence: [] });
  const godotPhase5 = validatePhaseCompletion({ root: godot, phase: 5, evidence: [] });
  check(!hasAdapterFailure(godotPhase1, 1) && godotPhase1.engine?.supported === true, 'Phase 1 remains engine-neutral in the mechanical gate');
  check(!hasAdapterFailure(godotPhase3, 3) && godotPhase3.engine?.capability === 'constructVerifier' && godotPhase3.engine?.supported === true,
    'Phase 3 gate binds Godot to the available constructVerifier capability');
  check(!godotPhase3.failures.some(item => /playtest-out\/report\.json/u.test(item)), 'Godot Phase 3 never falls back to the browser playtest report');
  check(hasAdapterFailure(godotPhase4, 4) && godotPhase4.engine?.capability === 'visualCapture', 'Phase 4 gate binds Godot to native visualCapture capability');
  check(hasAdapterFailure(godotPhase5, 5) && godotPhase5.engine?.capability === 'techVerifier', 'Phase 5 gate binds Godot to techVerifier capability');
  const directGodotVisual = validatePhase4VisualEvidence({ root: godot });
  const directWebVisual = validatePhase4VisualEvidence({ root: web });
  check(hasAdapterFailure(directGodotVisual, 4), 'direct Phase 4 visual validation also rejects browser evidence for Godot');
  check(directWebVisual.failures.some(item => item.includes('visual evidence is missing')), 'direct Phase 4 Web validation keeps its existing evidence path');

  mkdirSync(join(godot, 'adapters'), { recursive: true });
  writeJson(join(godot, 'adapters', 'engine-profiles.json'), {
    schemaVersion: 1,
    kind: 'forge.engine-profile-registry',
    defaultEngine: 'godot',
    profiles: { godot: { capabilities: { constructVerifier: true, visualCapture: true, techVerifier: true } } },
  });
  const stillBlocked = validatePhaseCompletion({ root: godot, phase: 4, evidence: [] });
  check(hasAdapterFailure(stillBlocked, 4), 'project-local registry cannot grant Godot verifier authority');

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
  check(start.status === 0 && marker?.engineRuntime?.engine === 'godot' && marker?.engineRuntime?.capabilities?.visualCapture === false,
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

  const blockedStart = spawnSync(process.execPath, [phaseState, 'start', '4', '--host', 'test'], {
    cwd: godot,
    env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
    encoding: 'utf8',
    timeout: 20_000,
  });
  const blockedMarker = JSON.parse(readFileSync(join(godot, 'wiki', 'phases', 'phase-4.json'), 'utf8'));
  check(blockedStart.status === 1 && blockedMarker.state === 'blocked'
    && blockedMarker.block?.owner === 'infrastructure'
    && blockedMarker.block?.code === 'ENGINE_CAPABILITY_UNAVAILABLE'
    && blockedMarker.block?.resumePolicy === 'environment_change',
  'unsupported Godot visual phase persists an infrastructure-owned block', `${blockedStart.stdout}\n${blockedStart.stderr}`);

  const invalidStart = spawnSync(process.execPath, [phaseState, 'start', '1', '--host', 'test'], {
    cwd: invalid,
    env: { ...process.env, FORGE_ENGINE_ROOT: ROOT },
    encoding: 'utf8',
    timeout: 20_000,
  });
  check(invalidStart.status === 2 && invalidStart.stderr.includes('ENGINE_PROFILE_INVALID_JSON'), 'phase start rejects a malformed engine profile before work begins', invalidStart.stderr);

  for (const skill of ['phase-1-analyze', 'phase-3-construct', 'phase-4-visual', 'phase-5-tech']) {
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
