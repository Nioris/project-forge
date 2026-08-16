/**
 * @file _lib.mjs
 * @description Shared helpers for Telegram validators. Mirrors the Yandex
 *              _lib.mjs shape so scripts can be ported easily.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEVELS = { BLOCKER: 'blocker', WARNING: 'warning', INFO: 'info' };

export function isMain(metaUrl) {
  try { return fileURLToPath(metaUrl) === path.resolve(process.argv[1] || ''); }
  catch { return false; }
}

export function readTextSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

export function walkFiles(dir, extensions = ['.html', '.js', '.mjs', '.css']) {
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
        if (['node_modules', '.git', '__pycache__'].includes(e.name)) continue;
        stack.push(p);
      } else if (extensions.some(ext => e.name.endsWith(ext))) {
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
