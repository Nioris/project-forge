#!/usr/bin/env node
/**
 * git-init-games.mjs — завести локальный git в играх-соседях, где его ещё нет.
 * Зачем: откат неудачных правок и работа хуков (pre-claim-fixed сверяет «я починил»
 * с реальным diff). Только локально, без remote — метрики и ключи наружу не уезжают.
 *
 * Usage: node scripts/git-init-games.mjs [--game <имя>] [--dry]
 */
import { readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';

const ENGINE = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PARENT = resolve(ENGINE, '..');
const args = process.argv.slice(2);
const only = args.includes('--game') ? args[args.indexOf('--game') + 1] : null;
const dry = args.includes('--dry');

const IGNORE = [
  'node_modules/', 'output/', 'handoff/',
  'screens/video/', 'screens/review/',
  'assets/bible/', 'assets/refs/', 'assets/target/',
  'backend/node_modules/',
  'wiki/diagnostics/forge-events*.jsonl',
  '# ключи API — маска *.key НЕ ловит .openai_key/.elevenlabs_key и подобные',
  '.*_key', '*.key', '*.secret', '.env',
].join('\n') + '\n';

const isGame = p => existsSync(join(p, 'index.html')) || existsSync(join(p, 'CLAUDE.md'))
  || existsSync(join(p, 'GameIntegration'));
const games = only ? [join(PARENT, only)]
  : readdirSync(PARENT, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== basename(ENGINE))
      .map(e => join(PARENT, e.name)).filter(isGame);

if (!games.length) { console.log('Игр не найдено рядом с', PARENT); process.exit(0); }
console.log(`Проверяю ${games.length} проект(ов)${dry ? ' [DRY]' : ''}\n`);

let init = 0, had = 0, failed = 0;
for (const g of games) {
  const name = basename(g);
  if (existsSync(join(g, '.git'))) { console.log(`  ${name.padEnd(24)} уже под git ✓`); had++; continue; }
  if (dry) { console.log(`  ${name.padEnd(24)} → будет создан`); init++; continue; }
  try {
    if (!existsSync(join(g, '.gitignore'))) writeFileSync(join(g, '.gitignore'), IGNORE);
    execSync('git init -q', { cwd: g, stdio: 'ignore' });
    execSync('git add -A', { cwd: g, stdio: 'ignore' });
    execSync('git -c user.email=forge@local -c user.name=Forge commit -q -m "Снимок до перехода под git"',
      { cwd: g, stdio: 'ignore' });
    const n = execSync('git ls-files', { cwd: g, encoding: 'utf8' }).split('\n').filter(Boolean).length;
    console.log(`  ${name.padEnd(24)} создан, файлов: ${n}`);
    init++;
  } catch (e) {
    console.log(`  ${name.padEnd(24)} ✗ ${String(e.message).split('\n')[0].slice(0, 60)}`);
    failed++;
  }
}
console.log(`\nИтого: создано ${init}, уже были ${had}${failed ? `, ошибок ${failed}` : ''}`);
console.log('Remote НЕ настраивается: репозитории локальные, данные игр наружу не уезжают.');
