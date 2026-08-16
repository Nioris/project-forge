#!/usr/bin/env node
/**
 * pack-handoff.mjs — передаточный архив игры для внутреннего трекера:
 * последний билд + все стор-материалы (SETUP_GUIDE, листинги, иконка/обложка,
 * скрины, видео) + манифест содержимого. Сдаёт ФАКТАМИ: список файлов и размеры.
 *
 * Usage: node scripts/pack-handoff.mjs <game-dir>
 * Выход: <game-dir>/handoff/<name>-handoff-<YYYY-MM-DD>.zip
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, basename, relative } from 'node:path';
import { execSync } from 'node:child_process';

const dir = resolve(process.argv[2] || '.');
if (!existsSync(join(dir, 'index.html')) && !existsSync(join(dir, 'CLAUDE.md'))) {
  console.error('[X] Не похоже на папку игры:', dir); process.exit(2);
}
const name = basename(dir);
const today = new Date().toISOString().slice(0, 10);

// рекурсивный поиск файлов по предикату (без node_modules/.git/handoff)
function walk(root, fn, acc = []) {
  if (!existsSync(root)) return acc;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (['node_modules', '.git', 'handoff', '.context-backups'].includes(e.name)) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) walk(p, fn, acc);
    else if (fn(p)) acc.push(p);
  }
  return acc;
}

// 1) Последний билд: самый свежий zip в типовых местах
const zipCandidates = walk(dir, p => p.endsWith('.zip'))
  .concat(walk(join(dir, '..', 'Release', name), p => p.endsWith('.zip')))
  .filter(p => !/handoff/.test(p));
zipCandidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const build = zipCandidates[0] || null;

// 2) Стор-материалы
const isStore = p => {
  const b = basename(p).toLowerCase(), rp = relative(dir, p).replace(/\\/g, '/').toLowerCase();
  return b.startsWith('setup_guide') || b.includes('store-listing') || b.startsWith('listing')
    || /^icon.*\.(png|jpg)$/.test(b) || /^cover.*\.(png|jpg)$/.test(b)
    || rp.startsWith('screens/') || rp.includes('/screens/')
    || rp.startsWith('storedata/') || b === 'metrics.md';
};
const store = walk(dir, isStore);

if (!build && store.length === 0) { console.error('[X] Ни билда, ни стор-материалов не найдено.'); process.exit(2); }

// 3) Сборка staging → zip
const out = join(dir, 'handoff');
const stage = join(out, `${name}-handoff-${today}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'store'), { recursive: true });
const copied = [];
const cp = (src, destRel) => {
  const d = join(stage, destRel);
  mkdirSync(join(d, '..'), { recursive: true });
  execSync(process.platform === 'win32'
    ? `copy /Y "${src}" "${d}" >nul` : `cp "${src}" "${d}"`, { shell: true });
  copied.push([destRel, statSync(src).size]);
};
if (build) cp(build, join('build', basename(build)));
for (const f of store) cp(f, join('store', relative(dir, f)));

const manifest = [`HANDOFF: ${name} — ${today}`, `Билд: ${build ? basename(build) + ' (' + (statSync(build).size/1024/1024).toFixed(1) + ' MB, mtime ' + statSync(build).mtime.toISOString().slice(0,16) + ')' : '⚠️ НЕ НАЙДЕН'}`,
  `Файлов стор-материалов: ${store.length}`, '', ...copied.map(([p, s]) => `${(s/1024).toFixed(0).padStart(7)} KB  ${p}`)].join('\n');
writeFileSync(join(stage, 'MANIFEST.txt'), manifest);

const zipPath = `${stage}.zip`;
rmSync(zipPath, { force: true });
execSync(process.platform === 'win32'
  ? `powershell -Command "Compress-Archive -Path '${stage}\\*' -DestinationPath '${zipPath}'"`
  : `cd "${stage}" && zip -qr "${zipPath}" .`, { shell: true });
rmSync(stage, { recursive: true, force: true });

console.log(manifest);
console.log('\n═══ АРХИВ ГОТОВ ═══');
console.log(zipPath, `(${(statSync(zipPath).size/1024/1024).toFixed(1)} MB)`);
if (!build) console.log('⚠️ Билд не найден — прогони /phase-8-release, потом пересобери handoff.');
