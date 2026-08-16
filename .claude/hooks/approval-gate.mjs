#!/usr/bin/env node
/**
 * @file approval-gate.mjs
 * @description PreToolUse:Bash — БЛОКИРУЕТ массовую AI/API-генерацию ассетов без утверждённой
 *   библии стиля. Полевой кейс 01.08.2026: исполнитель собрал референсы и библию,
 *   НЕ дождался выбора пользователя, нагенерил своё, сам отменял, сжёг деньги.
 *   Текстовая инструкция «останови работу» под инерцией пропускается — нужен замок.
 * @output exit 0 = разрешить, exit 2 = заблокировать
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let input = '';
try { input = readFileSync(0, 'utf-8'); } catch {}
let cmd = '';
try { cmd = (JSON.parse(input).tool_input || {}).command || ''; } catch { cmd = input; }
if (!cmd) process.exit(0);

// Признаки МАССОВОЙ генерации изображений (одиночные пробы и сборка библии — не блокируем)
const MASS_GEN = [
  /gen-?assets?\.(bat|sh|ps1|mjs)/i,
  /generate-?(all|assets|pack|batch)/i,
  /(openai-image|image-studio|gpt-image|images\/generations)[^|]*(for|loop|batch|--all)/i,
  /(for|foreach)[^|]{0,100}(openai|gpt-image|image-gen|image-studio|generate)/i,
  /openrouter[^|]*image[^|]*(for|loop|batch|--all)/i, // legacy guard: catches old project scripts too
];
if (!MASS_GEN.some(r => r.test(cmd))) process.exit(0);

// Библия собрана? Тогда без selection.json — стоп.
const cwd = process.cwd();
const bible = join(cwd, 'assets', 'bible');
if (!existsSync(bible)) process.exit(0);            // библии нет вообще — не наш случай

const sel = join(bible, 'selection.json');
if (!existsSync(sel)) {
  console.error(`
🔴 ЗАБЛОКИРОВАНО: массовая генерация без утверждённой библии стиля.

   Библия собрана (assets/bible/), но пользователь ЕЩЁ НЕ ВЫБРАЛ эталоны:
   файла assets/bible/selection.json нет.

   Правило (asset-generation Step 4.2): нет selection.json — нет массовой генерации.
   Генерация без утверждения = переделка всего и сожжённые деньги.

   Что сделать:
     1. node <движок>/scripts/asset-bible.mjs .
     2. дать пользователю путь к assets/bible/index.html и ОСТАНОВИТЬСЯ;
     3. дождаться, пока он положит selection.json рядом.

   Пользователь явно сказал «генерируй без библии»? Тогда положи в assets/bible/
   файл selection.json с {"selected":{},"override":"пользователь разрешил без выбора"}.
`);
  process.exit(2);
}

// selection.json есть, но устарел относительно вариантов — тоже стоп
try {
  const selTime = statSync(sel).mtimeMs;
  let newest = 0, newestName = '';
  for (const cat of readdirSync(bible, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    for (const f of readdirSync(join(bible, cat.name))) {
      const t = statSync(join(bible, cat.name, f)).mtimeMs;
      if (t > newest) { newest = t; newestName = `${cat.name}/${f}`; }
    }
  }
  if (newest > selTime + 2000) {
    console.error(`
🔴 ЗАБЛОКИРОВАНО: в библию добавлены варианты ПОСЛЕ утверждения.

   Новее выбора: ${newestName}
   Пользователь утверждал другой набор — покажи обновлённую библию и получи новый выбор.
`);
    process.exit(2);
  }
} catch {}

process.exit(0);
