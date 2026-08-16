/**
 * data-dir.mjs — где живут ПОЛЬЗОВАТЕЛЬСКИЕ данные Forge.
 * Правило: НЕ внутри project-forge. Обновление движка ставит папку чистой заменой,
 * поэтому всё, чего нет в архиве, стирается. Данные лежат рядом: ../forge-data/
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const SCRIPT_ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
export const ENGINE_ROOT = SCRIPT_ROOT;
export const DATA_DIR = resolve(SCRIPT_ROOT, '..', 'forge-data');

export function ensureDataDir() { mkdirSync(DATA_DIR, { recursive: true }); return DATA_DIR; }

/** Путь к пользовательскому файлу: сперва forge-data, затем (наследие) корень движка. */
export function dataFile(name) {
  const outside = join(DATA_DIR, name);
  if (existsSync(outside)) return outside;
  const legacy = join(SCRIPT_ROOT, name);
  if (existsSync(legacy)) return legacy;
  return outside; // ещё не создан — создадим снаружи
}

/** Запись с автобэкапом: хранит 10 последних версий в forge-data/backups/. */
export function writeData(name, text) {
  ensureDataDir();
  const target = join(DATA_DIR, name);
  if (existsSync(target)) {
    const bdir = join(DATA_DIR, 'backups'); mkdirSync(bdir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    copyFileSync(target, join(bdir, `${name}.${stamp}.bak`));
    const mine = readdirSync(bdir).filter(f => f.startsWith(name + '.')).sort();
    while (mine.length > 10) { try { unlinkSync(join(bdir, mine.shift())); } catch {} }
  }
  writeFileSync(target, text);
  return target;
}

export function readData(name) {
  const p = dataFile(name);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/** Переезд старых файлов из корня движка в forge-data (одноразово, без потерь). */
export function migrateLegacy(names) {
  ensureDataDir();
  const moved = [];
  for (const n of names) {
    const legacy = join(SCRIPT_ROOT, n), outside = join(DATA_DIR, n);
    if (existsSync(legacy) && !existsSync(outside)) { copyFileSync(legacy, outside); moved.push(n); }
  }
  return moved;
}
