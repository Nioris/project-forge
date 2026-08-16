#!/usr/bin/env node
/**
 * use-template.mjs — взять шаблон ИЗ ДВИЖКА в папку игры.
 * Шаблоны не раскатываются по играм (это движковая папка) — игра берёт нужное по требованию.
 *
 * Usage (из папки игры):
 *   node ../project-forge/scripts/use-template.mjs backend/async ./backend
 *   node ../project-forge/scripts/use-template.mjs html5/mp-client.js ./mp-client.js
 *   node ../project-forge/scripts/use-template.mjs --list
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';

const ENGINE = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const TPL = join(ENGINE, 'templates');
const args = process.argv.slice(2);

function tree(dir, base = dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tree(p, base, acc); else acc.push(relative(base, p));
  }
  return acc;
}
if (args.includes('--list') || !args.length) {
  console.log(`Шаблоны движка (${TPL}):\n`);
  for (const d of readdirSync(TPL, { withFileTypes: true })) {
    if (d.isDirectory()) {
      const files = tree(join(TPL, d.name));
      console.log(`  ${d.name}/  — ${files.length} файл(ов)`);
      for (const f of files.slice(0, 6)) console.log(`      ${f}`);
      if (files.length > 6) console.log(`      … ещё ${files.length - 6}`);
    } else console.log(`  ${d.name}`);
  }
  console.log('\nВзять: node <движок>/scripts/use-template.mjs <шаблон> <куда>');
  process.exit(0);
}

const [name, destArg] = args;
const src = join(TPL, name);
if (!existsSync(src)) { console.error(`[X] Нет шаблона: ${name}\n    Список: --list`); process.exit(2); }
const dest = resolve(destArg || ('./' + name.split('/').pop()));

let n = 0;
if (statSync(src).isDirectory()) {
  for (const rel of tree(src)) {
    const d = join(dest, rel);
    mkdirSync(dirname(d), { recursive: true });
    if (existsSync(d)) { console.log(`  = ${rel} (уже есть, не трогаю)`); continue; }
    copyFileSync(join(src, rel), d); console.log(`  + ${rel}`); n++;
  }
} else {
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) { console.log(`  = ${dest} уже существует — не перезаписываю`); }
  else { copyFileSync(src, dest); console.log(`  + ${dest}`); n++; }
}
console.log(`\n[OK] Скопировано файлов: ${n} → ${dest}`);
console.log('Дальше правь копию под игру: обновления движка её НЕ трогают.');
