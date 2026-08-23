#!/usr/bin/env node
/**
 * Host-neutral Task write-scope authority for adapters that expose native file tools.
 * This is a guardrail over declared Forge Task paths, not an operating-system sandbox.
 */
import path from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { readTaskRun } from './execution-contract.mjs';

function enabled(value) { return /^(?:1|true|yes)$/i.test(String(value || '')); }

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function nearestExistingParent(target) {
  let cursor = target;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
  return cursor;
}

/** Return a safe project-relative path, rejecting lexical and junction/symlink escapes. */
export function projectRelativePath(filePath, projectRoot) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null;
  const root = path.resolve(projectRoot || process.cwd());
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!inside(root, absolute)) return null;
  try {
    const realRoot = realpathSync(root);
    const realParent = realpathSync(nearestExistingParent(absolute));
    if (!inside(realRoot, realParent) && realParent !== realRoot) return null;
  } catch { return null; }
  return relative;
}

function globRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index++;
        if (pattern[index + 1] === '/') { index++; source += '(?:.*\/)?'; }
        else source += '.*';
      } else source += '[^/]*';
    } else if (char === '?') source += '[^/]';
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

/** Match a normalized project path against a declared Task scope glob. */
export function taskScopeMatches(pattern, projectPath) {
  const normalizedPattern = String(pattern || '').replaceAll('\\', '/').replace(/^\.\//, '');
  const normalizedPath = String(projectPath || '').replaceAll('\\', '/').replace(/^\.\//, '');
  return Boolean(normalizedPattern && normalizedPath && globRegExp(normalizedPattern).test(normalizedPath));
}

function phaseMarkerTaskId(projectRoot, phase) {
  if (phase == null || !Number.isInteger(Number(phase)) || Number(phase) < 1 || Number(phase) > 9) return null;
  const file = path.join(path.resolve(projectRoot || process.cwd()), 'wiki', 'phases', `phase-${Number(phase)}.json`);
  try {
    const marker = JSON.parse(readFileSync(file, 'utf8'));
    if (Number(marker?.phase) !== Number(phase)) return null;
    const taskId = String(marker?.execution?.taskId || '').trim();
    return taskId || null;
  } catch { return null; }
}

/** Resolve the exact durable Task authority inherited by a host process. */
export function resolveActiveTaskScope({ projectRoot, taskId, phase = null, contractHash = null } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const id = String(taskId || phaseMarkerTaskId(root, phase) || '').trim();
  if (!id) return { active: false, task: null, run: null };
  const run = readTaskRun(root, id);
  if (!run) throw new Error(`Forge Task scope: durable Task not found: ${id}`);
  if (['blocked', 'completed', 'cancelled'].includes(run.task.status)) throw new Error(`Forge Task scope: Task is terminal: ${id}`);
  if (phase != null && Number(run.task.phase) !== Number(phase)) throw new Error(`Forge Task scope: Task ${id} is not Phase ${phase}`);
  const expectedHash = String(contractHash || '').trim();
  const actualHash = String(run.task.contract?.hash || '').trim();
  if (expectedHash && expectedHash !== actualHash) throw new Error(`Forge Task scope: contract hash changed for ${id}`);
  return { active: true, task: run.task, run };
}

export function resolveTaskScopeAuthority({ projectRoot, env = process.env } = {}) {
  if (!enabled(env.FORGE_TASK_SCOPE_ENFORCE)) return { enforced: false, task: null };
  const taskId = String(env.FORGE_TASK_ID || '').trim();
  if (!taskId) throw new Error('FORGE_TASK_SCOPE_ENFORCE requires FORGE_TASK_ID');
  const resolved = resolveActiveTaskScope({
    projectRoot, taskId, contractHash: env.FORGE_TASK_CONTRACT_HASH,
  });
  return { ...resolved, enforced: true };
}

/** Throw when an explicit Task attempts a native write outside its declared scope. */
export function assertTaskWrite({ projectRoot, taskId, target, operation = 'write', phase = null } = {}) {
  const authority = resolveActiveTaskScope({ projectRoot, taskId, phase });
  if (!authority.active) return authority;
  const normalized = projectRelativePath(target, projectRoot);
  if (!normalized) throw new Error(`Forge Task scope: ${operation} target is missing or outside the project root`);
  if (!authority.task.scope.write.some(pattern => taskScopeMatches(pattern, normalized))) {
    throw new Error(`Forge Task scope: ${normalized} is outside Task ${authority.task.id} write scope (${authority.task.scope.write.join(', ') || 'none'})`);
  }
  return { ...authority, target: normalized };
}

/** Check native file-tool writes against the active Task's declared write scope. */
export function authorizeTaskWrite({ projectRoot, paths, env = process.env } = {}) {
  const authority = resolveTaskScopeAuthority({ projectRoot, env });
  if (!authority.enforced) return { allowed: true, enforced: false, paths: [] };
  const requested = Array.isArray(paths) ? paths : [];
  const resolved = requested.map(item => projectRelativePath(item, projectRoot));
  const normalized = resolved.filter(Boolean);
  if (!requested.length || normalized.length !== requested.length) {
    return { allowed: false, enforced: true, reason: 'Forge Task scope: one or more native write targets are missing or outside the project root', paths: normalized, task: authority.task };
  }
  const denied = normalized.filter(file => !authority.task.scope.write.some(pattern => taskScopeMatches(pattern, file)));
  if (denied.length) {
    return {
      allowed: false, enforced: true,
      reason: `Forge Task scope: ${denied.join(', ')} is outside Task ${authority.task.id} write scope (${authority.task.scope.write.join(', ') || 'none'})`,
      paths: normalized, task: authority.task,
    };
  }
  return { allowed: true, enforced: true, paths: normalized, task: authority.task };
}
