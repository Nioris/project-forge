#!/usr/bin/env node
/**
 * gap-audit.mjs — что в ЭТОЙ игре отстало от текущего движка.
 * Механические проверки по коду и файлам игры; выдаёт разрывы с приоритетом и трудоёмкостью.
 *
 * Usage: node <движок>/scripts/gap-audit.mjs [папка-игры]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const dir = resolve(process.argv[2] || '.');
const read = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const walk = (d, acc = []) => {
  if (!existsSync(d)) return acc;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', 'assets', 'screens', 'handoff', 'backend'].includes(e.name)) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(js|html|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
};
const files = walk(dir);
const code = files.map(read).join('\n');
const has = re => re.test(code);
const wiki = read(join(dir, 'wiki', '_map.md'));

const G = [];
const gap = (prio, area, what, fix, cost) => G.push({ prio, area, what, fix, cost });

// ── БЛОКЕРЫ ПОДАЧИ (чинить всегда) ──
if (has(/addEventListener\s*\(\s*['"]keydown/) && !has(/\.code\s*===?\s*['"]Key[WASD]/))
  gap('🔴', 'Ввод', 'Клавиатура на e.key — мертва в русской раскладке', 'e.code (KeyW/KeyA/…) + стрелки', '15 мин');
if (has(/LoadingAPI[\s\S]{0,40}ready/) && !has(/inputEnabled|inputLocked|canPlay|readyFired/))
  gap('🔴', 'SDK', 'Нет гейта ввода до ready() — отказ по 1.19', 'inputEnabled=false до резолва ready()', '30 мин');
if (has(/>\s*(сид|seed)\s*<|замер механики|Подсказка:\s*(вкл|выкл)/i))
  gap('🔴', 'Релиз', 'Инструменты разработчика в билде (1.15 «выглядит незавершённой»)', 'спрятать под ?debug=1', '20 мин');

// ── ДЕНЬГИ И УДЕРЖАНИЕ ──
const rv = (code.match(/showRewardedVideo/g) || []).length;
if (rv === 0) gap('🟠', 'Деньги', 'RV-хуков нет вообще', 'ретрофит по monetization-design: ≥5 разных наград', '2-4 ч');
else if (rv < 4) gap('🟠', 'Деньги', `RV-хуков мало (${rv}) — доход ниже возможного`, 'добить до 5-6 РАЗНЫХ наград и моментов', '1-2 ч');
if (!has(/pity|гарант|до редк/i) && has(/gacha|гача|крутк|рулетк/i))
  gap('🟠', 'Мета', 'Гача без видимого pity — бесит игроков', 'счётчик до редкой вещи в сейве и на экране', '1 ч');
if (!has(/tutorial|туториал|обучени/i))
  gap('🟠', 'Удержание', 'Туториала нет — D1 теряется на входе', '/game-tutorial: подсветка-маска, одно действие за раз', '4-8 ч');
else if (!existsSync(join(dir, 'tutorial.json')) && !has(/tutorialSteps|TUTORIAL\s*=/))
  gap('🟡', 'Удержание', 'Туториал в коде, не данными — не правится без переписывания', 'вынести шаги в tutorial.json', '1-2 ч');
if (!has(/clip-path|destination-out|маск|highlight|подсвет/i) && has(/tutorial|туториал/i))
  gap('🟠', 'Удержание', 'Туториал ничего не подсвечивает — «для галочки»', 'маска с вырезом + пульс + клик только по вырезу', '3-4 ч');

// ── ВИЗУАЛ ──
if (!existsSync(join(dir, 'assets', 'refs')))
  gap('🟡', 'Визуал', 'Стиль без референсов — риск «браузерки 90-х»', '/art-direction Шаг 0: доска референсов', '2 ч');
if (!existsSync(join(dir, 'assets', 'bible', 'selection.json')))
  gap('🟡', 'Визуал', 'Эталоны стиля не утверждались', 'библия стиля → твой выбор → генерация', '2-3 ч');
if (has(/font-family:\s*(Arial|sans-serif|system-ui)[^;]*;/i) && !has(/@font-face/))
  gap('🟡', 'Визуал', 'Системный шрифт в игровом UI', 'игровой шрифт под сеттинг', '30 мин');

// ── ДАННЫЕ И ЦЕЛИ ──
if (!existsSync(join(dir, 'wiki', 'metrics.md')))
  gap('🟠', 'Метрики', 'Нет metrics.md — цели и дефицит не посчитаны', '/phase-1-analyze (только метрики)', '1 ч');
else if (!/план|факт/i.test(read(join(dir, 'wiki', 'metrics.md'))) && /Опубликован|published/i.test(wiki))
  gap('🟡', 'Метрики', 'Игра опубликована, но нет таблицы план vs факт', 'Ф9: снять D1/D7 и сравнить с планом', '30 мин');
if (!/Размерность/i.test(wiki))
  gap('🟢', 'Проект', 'Размерность (2D/3D) не зафиксирована в wiki', 'дописать строку в wiki/_map.md', '5 мин');

// ── ВЫВОД ──
const order = { '🔴': 0, '🟠': 1, '🟡': 2, '🟢': 3 };
G.sort((a, b) => order[a.prio] - order[b.prio]);
console.log(`\n═══ РАЗРЫВЫ: ${basename(dir)} ═══`);
console.log(`Файлов кода просмотрено: ${files.length}\n`);
if (!G.length) { console.log('✓ Механических разрывов не найдено. Визуал и геймдизайн — только глазами.\n'); process.exit(0); }
for (const g of G) console.log(`${g.prio} [${g.area}] ${g.what}\n     → ${g.fix}  (~${g.cost})\n`);
const n = p => G.filter(g => g.prio === p).length;
console.log(`Итого: 🔴 блокеры ${n('🔴')} · 🟠 важное ${n('🟠')} · 🟡 качество ${n('🟡')} · 🟢 мелочь ${n('🟢')}`);
console.log('\nПорядок: сперва 🔴 (без них не подать), затем 🟠 (деньги и удержание),');
console.log('🟡 берём только если игра живая и растёт, 🟢 — попутно.\n');
