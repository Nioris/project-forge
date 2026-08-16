/**
 * @file lib.mjs
 * @description Shared helpers for Project Forge Codex-native hooks.
 * @dependencies Node.js built-ins only.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Read one Codex hook event from stdin. */
export function readHookInput() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { return {}; }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/** Extract file paths touched by an apply_patch command. */
export function extractPatchPaths(command = '') {
  const paths = new Set();
  const patterns = [
    /^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm,
    /^\*\*\* Move to:\s*(.+)$/gm,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(String(command))) !== null) paths.add(match[1].trim());
  }
  return [...paths];
}

/** Extract one or more paths from Codex/Claude-style edit tool inputs. */
export function touchedPaths(data) {
  const input = data?.tool_input || {};
  const direct = input.file_path || input.path || input.filePath;
  if (direct) return [String(direct)];
  if (String(data?.tool_name || '') === 'apply_patch') return extractPatchPaths(input.command || '');
  return [];
}

/** Normalize a path for policy matching and logging. */
export function normalizePath(filePath, cwd = process.cwd()) {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  return relative(cwd, absolute).replace(/\\/g, '/');
}

/** Return whether a path is under a protected Forge tree. */
export function protectedArea(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  if (segments.includes('gameintegration')) return 'GameIntegration/';
  if (segments.includes('release')) return 'Release/';
  return null;
}
