#!/usr/bin/env node
/**
 * asset-merge.mjs — слить результаты агентов в библиотеку пользователя.
 * Читает asset-shards/*.done.json, дедупит по пути, СОХРАНЯЕТ пользовательские
 * rating/verdict существующих записей, пишет через data-dir (с автобэкапом).
 *
 * Usage: node scripts/asset-merge.mjs [--dir asset-shards] [--dry]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataFile, writeData } from './data-dir.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const dir = resolve(arg('dir', 'asset-shards'));
const dry = args.includes('--dry');
const FIELDS = ['name','path','desc','tags','kind','use','lic','licdate','notes','rating','verdict'];
const norm = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function slim(it) {
  const o = {};
  for (const k of FIELDS) if (it[k] !== undefined && it[k] !== '') o[k] = it[k];
  o.name = String(o.name || 'без имени'); o.path = String(o.path || '');
  o.kind = o.kind || '2d'; o.use = o.use || 'any'; o.lic = o.lic || 'no';
  o.rating = parseInt(o.rating, 10) || 0;
  if (o.notes && o.notes.length > 4000) o.notes = o.notes.slice(0, 4000) + '…';
  if (o.desc && o.desc.length > 1500) o.desc = o.desc.slice(0, 1500) + '…';
  return o;
}
const filled = o => FIELDS.filter(k => o[k] !== undefined && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)).length;

// 1. существующая библиотека
const libPath = dataFile('asset-library.json');
let lib = { format: 'forge-asset-library', version: 1, sources: [] };
if (existsSync(libPath)) { try { lib = JSON.parse(readFileSync(libPath, 'utf8')); } catch {} }
const byPath = new Map((lib.sources || []).map(s => [norm(s.path), slim(s)]));
const before = byPath.size;

// 2. шарды
if (!existsSync(dir)) { console.error('[X] Нет папки шардов:', dir); process.exit(2); }
const done = readdirSync(dir).filter(f => f.endsWith('.done.json')).sort();
const pending = readdirSync(dir).filter(f => /^shard-\d+\.json$/.test(f))
  .filter(f => !done.includes(f.replace('.json', '.done.json')));
if (!done.length) { console.error('[X] Нет ни одного *.done.json — агенты ещё не отработали'); process.exit(2); }

let added = 0, updated = 0, kept = 0, badLic = [];
for (const f of done) {
  let sh; try { sh = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { console.log(`  ⚠ ${f}: не читается, пропуск`); continue; }
  for (const raw of (sh.items || sh.sources || [])) {
    const it = slim(raw), key = norm(it.path);
    if (!key) continue;
    const prev = byPath.get(key);
    if (!prev) { byPath.set(key, it); added++; }
    else {
      // пользовательский опыт не затираем НИКОГДА
      const merged = filled(it) >= filled(prev) ? { ...prev, ...it } : { ...it, ...prev };
      merged.rating = prev.rating || it.rating || 0;
      merged.verdict = prev.verdict || it.verdict || '';
      const changed = JSON.stringify(merged) !== JSON.stringify(prev);
      byPath.set(key, merged); changed ? updated++ : kept++;
    }
    if (it.lic === 'no') badLic.push(it.name);
  }
}

const sources = [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
const out = { ...lib, format: 'forge-asset-library', version: 1,
  updated: new Date().toISOString().slice(0, 10), sources };

console.log(`Шардов обработано: ${done.length}${pending.length ? `, НЕ готовы: ${pending.length} (${pending.join(', ')})` : ''}`);
console.log(`Было: ${before} → стало: ${sources.length}  (новых ${added}, обновлено ${updated}, без изменений ${kept})`);
if (badLic.length) {
  console.log(`\n⚠️  Лицензия не подтверждена (помечены "no", в игры НЕ брать до проверки): ${badLic.length}`);
  console.log('   ' + badLic.slice(0, 12).join(', ') + (badLic.length > 12 ? ' …' : ''));
}
if (dry) { console.log('\n[DRY] Ничего не записано.'); process.exit(0); }
const written = writeData('asset-library.json', JSON.stringify(out, null, 2));
console.log(`\n[OK] ${written}  (предыдущая версия — в forge-data/backups/)`);
console.log('Открой asset-library.html → «⬆ Загрузить asset-library.json», чтобы увидеть результат.');
