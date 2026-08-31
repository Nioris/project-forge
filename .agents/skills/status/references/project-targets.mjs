#!/usr/bin/env node
/** Trusted bridge from a managed project runtime to installed storefront target authority. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTrustedForgeEngineRoot } from './forge-engine-root.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = path.resolve(HERE, '../../../..');

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

export function readTrustedProjectTargets(projectRoot = process.cwd(), options = {}) {
  const root = path.resolve(projectRoot);
  const engineRoot = resolveTrustedForgeEngineRoot({
    projectRoot: root,
    moduleRoot: options.moduleRoot ?? MODULE_ROOT,
    environmentRoot: options.environmentRoot ?? process.env.FORGE_ENGINE_ROOT ?? null,
  });
  const reader = path.join(engineRoot, 'scripts', 'platform-profile.mjs');
  if (!existsSync(reader)) {
    throw bridgeError('PLATFORM_PROFILE_READER_MISSING', `Installed platform-profile reader is missing: ${reader}`);
  }
  const child = spawnSync(process.execPath, [reader, 'read', root], {
    cwd: engineRoot,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (child.error) throw bridgeError('PLATFORM_PROFILE_READER_FAILED', `Platform-profile reader could not start: ${child.error.message}`);
  if (child.status !== 0) {
    const failure = parsedFailure(child.stderr);
    throw bridgeError(
      failure?.code || 'PLATFORM_PROFILE_READER_REJECTED',
      failure?.message || String(child.stderr || child.stdout || 'Platform-profile reader rejected the project').trim(),
      failure?.details || {},
    );
  }
  let targets;
  try { targets = JSON.parse(child.stdout); }
  catch (error) { throw bridgeError('PLATFORM_PROFILE_READER_OUTPUT', `Platform-profile reader returned invalid JSON: ${error.message}`); }
  if (!targets || targets.ok !== true || targets.kind !== 'forge.target-selection'
    || typeof targets.configured !== 'boolean' || !Array.isArray(targets.targets) || !Array.isArray(targets.profiles)) {
    throw bridgeError('PLATFORM_PROFILE_READER_OUTPUT', 'Platform-profile reader returned an invalid contract');
  }
  return { ...targets, engineRoot };
}

function publicTargets(value) {
  const { engineRoot, ...targets } = value;
  return targets;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try { console.log(JSON.stringify(publicTargets(readTrustedProjectTargets(process.argv[2] || process.cwd())), null, 2)); }
  catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'PLATFORM_PROFILE_BRIDGE', message: error.message }, null, 2));
    process.exitCode = 2;
  }
}
