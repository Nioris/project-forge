#!/usr/bin/env node
/**
 * backup-data.mjs — снимок пользовательских данных Forge + проверка, что они ВНЕ движка.
 * Запускать перед обновлением движка: node scripts/backup-data.mjs
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_ROOT, DATA_DIR, ensureDataDir, migrateLegacy } from './data-dir.mjs';

const USER_FILES = ['asset-library.json'];
ensureDataDir();

const moved = migrateLegacy(USER_FILES);
if (moved.length) console.log(`Перенесено в forge-data (из корня движка): ${moved.join(', ')}`);

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const snap = join(DATA_DIR, 'backups', `snapshot-${stamp}`);
mkdirSync(snap, { recursive: true });

let n = 0, bytes = 0;
for (const f of USER_FILES) {
  const p = join(DATA_DIR, f);
  if (!existsSync(p)) { console.log(`  — ${f}: нет`); continue; }
  copyFileSync(p, join(snap, f));
  const s = statSync(p).size; n++; bytes += s;
  console.log(`  ✓ ${f}: ${(s / 1024).toFixed(0)} KB`);
}

// предупреждение: пользовательские файлы, оставшиеся ВНУТРИ движка, обновление сотрёт
const risky = USER_FILES.filter(f => existsSync(join(ENGINE_ROOT, f)));
console.log(`\nСнимок: ${snap} (файлов: ${n}, ${(bytes / 1024).toFixed(0)} KB)`);
if (risky.length) {
  console.log(`\n⚠️  ВНИМАНИЕ: внутри папки движка лежат пользовательские файлы: ${risky.join(', ')}`);
  console.log(`   Обновление движка ставит папку ЧИСТОЙ ЗАМЕНОЙ и сотрёт их.`);
  console.log(`   Копии уже сохранены в ${DATA_DIR} — работай оттуда, а эти можно удалить.`);
}
console.log('\nДанные Forge живут в:', DATA_DIR, '— эта папка обновлением НЕ трогается.');
