#!/usr/bin/env node
/** Resolve the trusted installed Project Forge engine from a portable project runtime. */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

function existingDirectory(value) {
  if (!value) return null;
  const resolved = path.resolve(String(value));
  try {
    return existsSync(resolved) && statSync(resolved).isDirectory() ? realpathSync(resolved) : null;
  } catch {
    return null;
  }
}

function samePath(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Structural validation is necessary, but location supplies the trust boundary. */
export function isCanonicalForgeEngineRoot(value) {
  const root = existingDirectory(value);
  if (!root) return false;
  const pluginFile = path.join(root, '.claude-plugin', 'plugin.json');
  const registryFile = path.join(root, 'mcp-server', 'verifiers.json');
  const syncSpec = path.join(root, 'scripts', 'forge-sync-spec.mjs');
  if (!existsSync(pluginFile) || !existsSync(registryFile) || !existsSync(syncSpec)) return false;
  try {
    const plugin = JSON.parse(readFileSync(pluginFile, 'utf8'));
    const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
    return plugin?.name === 'project-forge'
      && registry?.schemaVersion === 1
      && Array.isArray(registry?.verifiers);
  } catch {
    return false;
  }
}

/**
 * Resolve authority without ever preferring a registry copied into the project.
 * FORGE_ENGINE_ROOT is explicit host authority; otherwise the managed sibling
 * layout is preferred. A module root is accepted only when it is external to
 * the project; the engine checkout itself is found through its reserved sibling
 * location (or an explicit external host override).
 */
export function resolveTrustedForgeEngineRoot({
  projectRoot = process.cwd(),
  moduleRoot = null,
  environmentRoot = process.env.FORGE_ENGINE_ROOT || null,
} = {}) {
  const project = existingDirectory(projectRoot) || path.resolve(projectRoot || process.cwd());
  const managedProject = existsSync(path.join(project, '.forge-managed.json'));
  const candidates = [];
  const addExternalAuthority = (source, value) => {
    const root = existingDirectory(value);
    // A managed project cannot turn itself into engine authority through an
    // environment override or by being named `project-forge`.
    if (root && managedProject && inside(project, root)) return;
    candidates.push({ source, value });
  };
  if (environmentRoot) addExternalAuthority('FORGE_ENGINE_ROOT', environmentRoot);
  addExternalAuthority('managed sibling', path.join(path.dirname(project), 'project-forge'));

  const module = existingDirectory(moduleRoot);
  if (module && !inside(project, module)) candidates.push({ source: 'runtime module', value: module });

  const seen = new Set();
  for (const candidate of candidates) {
    const root = existingDirectory(candidate.value);
    if (!root) continue;
    const key = process.platform === 'win32' ? root.toLowerCase() : root;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isCanonicalForgeEngineRoot(root)) return root;
  }

  const error = new Error('Forge engine is unavailable. Set FORGE_ENGINE_ROOT or install the sibling project-forge engine.');
  error.code = 'FORGE_ENGINE_ROOT_UNAVAILABLE';
  throw error;
}

export function trustedForgeRegistryPath(options = {}) {
  return path.join(resolveTrustedForgeEngineRoot(options), 'mcp-server', 'verifiers.json');
}

export function sameResolvedPath(left, right) {
  const resolveFile = value => {
    try { return existsSync(value) ? realpathSync(value) : path.resolve(value); }
    catch { return path.resolve(value); }
  };
  const resolvedLeft = resolveFile(left);
  const resolvedRight = resolveFile(right);
  return samePath(resolvedLeft, resolvedRight);
}
