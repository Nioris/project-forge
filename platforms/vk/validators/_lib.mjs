/**
 * @file _lib.mjs
 * @description Shared helpers for VK validators.
 */

import fs from 'node:fs';
import path from 'node:path';

export const LEVELS = { BLOCKER: 'blocker', WARNING: 'warning', INFO: 'info' };

export function readTextSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

export function walkFiles(dir, exts = ['.html', '.js', '.mjs', '.ts', '.tsx', '.jsx']) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(e.name)) continue;
        stack.push(p);
      } else if (exts.some(x => e.name.endsWith(x))) {
        out.push(p);
      }
    }
  }
  return out;
}

export function findLineNo(text, needle) {
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  return text.slice(0, idx).split('\n').length;
}
