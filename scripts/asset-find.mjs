#!/usr/bin/env node
/**
 * asset-find.mjs — поиск по библиотеке ассетов БЕЗ загрузки её в контекст.
 * Библиотека — больше мегабайта; агент должен получать только подходящие записи.
 *
 * Usage (из папки игры ИЛИ из движка):
 *   node <путь>/scripts/asset-find.mjs "фэнтези оружие" [--use 2d] [--kind 3d]
 *                                       [--lic free,attr,paid] [--limit 20] [--json]
 * Порядок поиска файла: ./forge-data → ../forge-data → <движок>/../forge-data → <движок>/ (наследие)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const ENGINE = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const CANDIDATES = [
  resolve(process.cwd(), 'forge-data', 'asset-library.json'),
  resolve(process.cwd(), '..', 'forge-data', 'asset-library.json'),
  resolve(ENGINE, '..', 'forge-data', 'asset-library.json'),
  join(ENGINE, 'asset-library.json'),
];
const LIB = CANDIDATES.find(existsSync);
if (!LIB) {
  console.error('[X] Библиотека не найдена. Искал:\n  ' + CANDIDATES.join('\n  '));
  console.error('    Заведи её: node scripts/asset-scan.mjs <папка с ассетами>');
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const query = args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true)
  .join(' ').toLowerCase().trim();
const useF = flag('use', ''), kindF = flag('kind', '');
const licF = (flag('lic', 'free,attr,paid')).split(',').map(s => s.trim());
const limit = parseInt(flag('limit', '20'), 10);
const asJson = args.includes('--json');

const lib = JSON.parse(readFileSync(LIB, 'utf8'));
const words = query.split(/\s+/).filter(Boolean);

function score(it) {
  const hay = [it.name, it.desc, (it.tags || []).join(' ')].join(' ').toLowerCase();
  const tags = (it.tags || []).map(t => String(t).toLowerCase());
  let s = 0;
  for (const w of words) {
    if (tags.some(t => t === w)) s += 6;            // точное совпадение тега — сильнее всего
    else if (tags.some(t => t.includes(w))) s += 3;
    else if (String(it.name).toLowerCase().includes(w)) s += 4;
    else if (hay.includes(w)) s += 1;
  }
  return s + (it.rating || 0);                       // оценка пользователя двигает вверх
}

let list = (lib.sources || []).filter(it => {
  if (kindF && it.kind !== kindF) return false;
  if (useF && (it.use || 'any') !== useF && (it.use || 'any') !== 'any') return false;
  if (!licF.includes(it.lic || 'no')) return false;
  return !words.length || score(it) > 0;
});
list.sort((a, b) => score(b) - score(a) || (b.rating || 0) - (a.rating || 0));
const total = list.length;
list = list.slice(0, limit);

if (asJson) { console.log(JSON.stringify({ library: LIB, total, shown: list.length,
  note: 'kind:unity — обычные ассеты внутри архива, годны для web после конвертации',
  items: list }, null, 2)); process.exit(0); }

console.log(`Библиотека: ${LIB}`);
console.log(`Запрос: "${query || '(все)'}"${kindF ? ` kind=${kindF}` : ''}${useF ? ` use=${useF}` : ''} → найдено ${total}, показано ${list.length}\n`);
for (const it of list) {
  const stars = it.rating ? '★'.repeat(it.rating) : '—';
  console.log(`• ${it.name}  [${it.kind}/${it.use || 'any'}] ${it.lic} ${stars}`);
  console.log(`  ${String(it.desc || '').slice(0, 120)}`);
  console.log(`  теги: ${(it.tags || []).slice(0, 8).join(', ')}`);
  console.log(`  путь: ${it.path}`);
  if (it.kind === 'unity') console.log('  ℹ️  Unity-пак = обычные FBX/PNG/WAV внутри; для web извлекаются через Blender → glb (см. notes)');
  if (it.lic === 'no') console.log('  ⚠️  лицензия НЕ подтверждена — в игру не брать до проверки');
  console.log('');
}
if (total > list.length) console.log(`… ещё ${total - list.length}. Уточни запрос или подними --limit.`);
