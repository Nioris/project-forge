#!/usr/bin/env node
/**
 * asset-normalize.mjs — привести библиотеку к словарю значений.
 * Агенты склонны выдумывать свои типы (3d-models, vfx-sky, editor-tool…), из-за чего
 * записи выпадают из фильтров. Скрипт схлопывает их в разрешённый набор,
 * сохраняя исходное значение тегом (чтобы поиск по нему всё равно работал).
 *
 * Usage: node scripts/asset-normalize.mjs [--dry]
 */
import { readFileSync, existsSync } from 'node:fs';
import { dataFile, writeData } from './data-dir.mjs';

const dry = process.argv.includes('--dry');
const KINDS = new Set(['2d', '3d', 'audio', 'unity', 'font', 'ui']);
const USES = new Set(['2d', '3d', 'any']);
const LICS = new Set(['free', 'attr', 'paid', 'no']);

function normKind(k, it) {
  const v = String(k || '').toLowerCase();
  if (KINDS.has(v)) return v;
  if (/unity|unitypackage/.test(v)) return 'unity';
  if (/unreal|godot/.test(v)) return 'unity';           // движковый пакет
  if (/font|typeface/.test(v)) return 'font';
  if (/audio|sfx|sound|music/.test(v)) return 'audio';
  if (/ui|icon|hud|interface/.test(v)) return 'ui';
  if (/^3d|model|character|environment|weapon|skybox|prop/.test(v)) return '3d';
  if (/^2d|sprite|texture|tile|background/.test(v)) return '2d';
  if (/vfx|particle|shader|animation/.test(v)) return (it && /3d/.test(JSON.stringify(it.tags || []))) ? '3d' : '2d';
  if (/tool|editor|plugin|code|template|script/.test(v)) return 'ui';  // инструментарий — не арт
  if (/empty|unknown|other|mixed|data/.test(v)) return '2d';
  return '2d';
}

const p = dataFile('asset-library.json');
if (!existsSync(p)) { console.error('[X] Нет библиотеки:', p); process.exit(2); }
const lib = JSON.parse(readFileSync(p, 'utf8'));
const src = lib.sources || [];

let kindFixed = 0, useFixed = 0, licFixed = 0, tagged = 0;
for (const it of src) {
  const orig = String(it.kind || '');
  const k = normKind(orig, it);
  if (k !== orig) {
    kindFixed++;
    if (orig && !KINDS.has(orig.toLowerCase())) {        // исходный тип не теряем — уводим в теги
      it.tags = Array.isArray(it.tags) ? it.tags : [];
      if (!it.tags.includes(orig)) { it.tags.push(orig); tagged++; }
    }
    it.kind = k;
  }
  if (!USES.has(String(it.use || ''))) { it.use = 'any'; useFixed++; }
  if (!LICS.has(String(it.lic || ''))) { it.lic = 'no'; licFixed++; }
  it.rating = parseInt(it.rating, 10) || 0;
}

const dist = src.reduce((a, x) => { a[x.kind] = (a[x.kind] || 0) + 1; return a; }, {});
console.log(`Записей: ${src.length}`);
console.log(`Исправлено: типов ${kindFixed} (из них ${tagged} исходных значений сохранено в тегах), применимость ${useFixed}, лицензий ${licFixed}`);
console.log('Типы после нормализации:', JSON.stringify(dist));
if (dry) { console.log('\n[DRY] Ничего не записано.'); process.exit(0); }
const w = writeData('asset-library.json', JSON.stringify({ ...lib, sources: src }, null, 2));
console.log(`\n[OK] ${w}  (предыдущая версия — в forge-data/backups/)`);
