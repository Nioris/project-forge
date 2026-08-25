#!/usr/bin/env node
/** Trusted bridge from a managed project runtime to the installed engine-profile reader. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTrustedForgeEngineRoot } from './forge-engine-root.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = path.resolve(HERE, '../../../..');

export const ENGINE_PHASE_CAPABILITIES = Object.freeze({
  3: 'constructVerifier',
  4: 'visualCapture',
  5: 'techVerifier',
  7: 'playtest',
  8: 'releaseExport',
});

function bridgeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function parsedFailure(stderr) {
  try {
    const value = JSON.parse(String(stderr || '').trim());
    if (value && typeof value === 'object') return value;
  } catch {}
  return null;
}

export function readTrustedProjectEngine(projectRoot = process.cwd(), options = {}) {
  const root = path.resolve(projectRoot);
  const engineRoot = resolveTrustedForgeEngineRoot({
    projectRoot: root,
    moduleRoot: options.moduleRoot ?? MODULE_ROOT,
    environmentRoot: options.environmentRoot ?? process.env.FORGE_ENGINE_ROOT ?? null,
  });
  const reader = path.join(engineRoot, 'scripts', 'engine-profile.mjs');
  if (!existsSync(reader)) {
    throw bridgeError('ENGINE_PROFILE_READER_MISSING', `Installed engine-profile reader is missing: ${reader}`);
  }

  const child = spawnSync(process.execPath, [reader, 'read', root], {
    cwd: engineRoot,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (child.error) {
    throw bridgeError('ENGINE_PROFILE_READER_FAILED', `Engine-profile reader could not start: ${child.error.message}`);
  }
  if (child.status !== 0) {
    const failure = parsedFailure(child.stderr);
    throw bridgeError(
      failure?.code || 'ENGINE_PROFILE_READER_REJECTED',
      failure?.message || String(child.stderr || child.stdout || 'Engine-profile reader rejected the project').trim(),
      failure?.details || {},
    );
  }

  let profile;
  try { profile = JSON.parse(child.stdout); }
  catch (error) {
    throw bridgeError('ENGINE_PROFILE_READER_OUTPUT', `Engine-profile reader returned invalid JSON: ${error.message}`);
  }
  if (!profile || profile.ok !== true || profile.kind !== 'forge.engine-profile'
    || typeof profile.engine !== 'string' || !profile.capabilities || typeof profile.capabilities !== 'object') {
    throw bridgeError('ENGINE_PROFILE_READER_OUTPUT', 'Engine-profile reader returned an invalid contract');
  }
  return { ...profile, engineRoot };
}

export function enginePhaseSupport(profile, phase) {
  const numericPhase = Number(phase);
  const capability = ENGINE_PHASE_CAPABILITIES[numericPhase] || null;
  if (!capability) return { supported: true, phase: numericPhase, capability: null, message: null };
  if (profile?.capabilities?.[capability] === true) {
    if (numericPhase === 4 && profile?.engine === 'godot' && profile?.capabilities?.proofVideo !== true) {
      return {
        supported: false,
        phase: numericPhase,
        capability: 'proofVideo',
        message: 'Engine godot cannot complete Phase 4: proofVideo adapter is unavailable. Static screenshots cannot substitute for native motion proof.',
      };
    }
    return { supported: true, phase: numericPhase, capability, message: null };
  }

  const suffix = numericPhase === 4
    ? 'Browser screenshots and window.__FORGE_VISUAL_QA__ are not valid evidence for this engine.'
    : numericPhase === 3
      ? 'A browser playtest cannot substitute for this engine construct verifier.'
      : numericPhase === 5
        ? 'Browser DOM, touch and Yandex SDK checks cannot substitute for this engine tech verifier.'
        : numericPhase === 7
          ? 'Browser playtest-out and stage-out reports cannot substitute for a native engine playtest.'
          : 'Web/Yandex ZIPs cannot substitute for this engine release exporter.';
  return {
    supported: false,
    phase: numericPhase,
    capability,
    message: `Engine ${profile?.engine || 'unknown'} cannot complete Phase ${numericPhase}: ${capability} adapter is unavailable. ${suffix}`,
  };
}

function publicProfile(profile) {
  const { engineRoot, ...value } = profile;
  return value;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    console.log(JSON.stringify(publicProfile(readTrustedProjectEngine(process.argv[2] || process.cwd())), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'ENGINE_PROFILE_BRIDGE', message: error.message }, null, 2));
    process.exitCode = 2;
  }
}
