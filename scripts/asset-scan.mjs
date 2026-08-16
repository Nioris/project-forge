#!/usr/bin/env node
/**
 * asset-scan.mjs — инвентаризация папки с пакетами ассетов ФАКТАМИ (без интернета).
 * Для каждого пакета: имя, размер, гистограмма расширений, предварительный тип.
 * Архивы НЕ распаковываются — только листинг. Результат → черновик JSON,
 * который скил /asset-scan обогащает поиском в интернете и вливает в asset-library.json.
 *
 * Usage: node scripts/asset-scan.mjs <папка> [--out asset-scan-draft.json] [--max-depth 2]
 */
import { readdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { execSync } from 'node:child_process';

const dir = resolve(process.argv[2] || '.');
if (!existsSync(dir)) { console.error('[X] Папка не найдена:', dir); process.exit(2); }
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'asset-scan-draft.json'));
const MAXD = parseInt(arg('max-depth', '2'), 10);

const KIND_HINTS = [
  ['3d',    ['.fbx', '.obj', '.glb', '.gltf', '.blend', '.dae', '.usdz']],
  ['audio', ['.wav', '.mp3', '.ogg', '.flac', '.aiff']],
  ['font',  ['.ttf', '.otf', '.woff', '.woff2']],
  ['2d',    ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.aseprite', '.ase']],
];
const ARCHIVE = new Set(['.zip', '.unitypackage', '.rar', '.7z', '.tar', '.gz']);

function histFromNames(names) {
  const h = {};
  for (const n of names) {
    const e = extname(n).toLowerCase();
    if (e) h[e] = (h[e] || 0) + 1;
  }
  return h;
}
function walkNames(root, depth, acc) {
  if (depth > MAXD || acc.length > 4000) return acc;
  let entries = [];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) walkNames(p, depth + 1, acc);
    else acc.push(e.name);
  }
  return acc;
}
function listArchive(p) {
  const ext = extname(p).toLowerCase();
  const win = process.platform === 'win32';
  const run = (cmd, opts) => execSync(cmd, Object.assign({ encoding: 'utf8', maxBuffer: 64e6, stdio: ['ignore','pipe','ignore'] }, opts || {}));
  try {
    if (ext === '.zip') {
      if (win) {
        // PowerShell: список записей архива без распаковки
        const ps = `powershell -NoProfile -Command "Add-Type -A System.IO.Compression.FileSystem; ` +
          `[IO.Compression.ZipFile]::OpenRead('${p.replace(/'/g, "''")}').Entries | ForEach-Object { $_.FullName }"`;
        return run(ps).split(/\r?\n/);
      }
      return run(`unzip -Z1 "${p}"`).split('\n');
    }
    if (ext === '.unitypackage' || ext === '.gz' || ext === '.tar') {
      // tar есть и в Windows 10+ (bsdtar). Сначала пути ассетов из */pathname, иначе общий листинг.
      if (!win) {
        const names = run(`tar -xzOf "${p}" --wildcards '*/pathname' 2>/dev/null | head -c 400000`,
          { shell: '/bin/bash' }).split('\n');
        if (names.filter(Boolean).length) return names;
      }
      return run(`tar -tzf "${p}"`).split(/\r?\n/).slice(0, 3000);
    }
  } catch {}
  return [];
}

function sizeOf(p) {
  const st = statSync(p);
  if (st.isFile()) return st.size;
  let s = 0, n = 0;
  const walk = (r, d) => {
    if (d > MAXD + 1 || n > 20000) return;
    let es = []; try { es = readdirSync(r, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const p2 = join(r, e.name); n++;
      if (e.isDirectory()) walk(p2, d + 1); else { try { s += statSync(p2).size; } catch {} } }
  };
  walk(p, 0); return s;
}
function guessKind(name, hist) {
  if (extname(name).toLowerCase() === '.unitypackage') return 'unity';
  const total = Object.values(hist).reduce((a, b) => a + b, 0) || 1;
  for (const [kind, exts] of KIND_HINTS) {
    const c = exts.reduce((a, e) => a + (hist[e] || 0), 0);
    if (c / total > 0.25 || (kind === '3d' && c > 0)) return kind;
  }
  return 'unknown';
}

// ── библиотека пользователя: чтобы помечать уже заведённое и пересечения ──
const LIBP = (function(){ try { const m = require('node:module').createRequire(import.meta.url); } catch {} 
  return resolve(process.argv[1], '..', '..', '..', 'forge-data', 'asset-library.json'); })();
const LIBP_LEGACY = resolve(process.argv[1], '..', '..', 'asset-library.json');
let libPaths = [], libNames = new Map();
try {
  const lib = JSON.parse(readFileSync(existsSync(LIBP) ? LIBP : LIBP_LEGACY, 'utf8'));
  for (const src of (lib.sources || [])) {
    libPaths.push(src.path);
    libNames.set(String(src.name || '').toLowerCase().replace(/[^a-zа-я0-9]/gi, ''), src.path);
  }
} catch {}
const norm = p => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const inside = (a, b) => norm(a) === norm(b) || norm(a).startsWith(norm(b) + '/');

// ── контейнер vs пакет ──
// Папка = КОНТЕЙНЕР (не пакет), если внутри ≥2 кандидатов в паки и почти нет своих ассетов.
function classify(p) {
  let entries = []; try { entries = readdirSync(p, { withFileTypes: true }); } catch { return 'pack'; }
  const kids = entries.filter(e => !e.name.startsWith('.'));
  const packish = kids.filter(e => e.isDirectory() || ARCHIVE.has(extname(e.name).toLowerCase())).length;
  const ownAssets = kids.filter(e => !e.isDirectory() && !ARCHIVE.has(extname(e.name).toLowerCase())
    && /\.(png|jpg|jpeg|webp|svg|fbx|obj|glb|gltf|wav|mp3|ogg|ttf|otf)$/i.test(e.name)).length;
  // Контейнер — только очевидный: ≥3 кандидата, своих ассетов нет вообще,
  // и внутри НЕ видно признаков одного пака (папки вида Textures/Models/Sprites).
  const structural = kids.some(e => e.isDirectory() &&
    /^(textures?|materials?|models?|sprites?|sounds?|audio|fonts?|prefabs?|scenes?|scripts?|docs?|examples?|demo)$/i.test(e.name));
  return (packish >= 3 && ownAssets === 0 && !structural) ? 'container' : 'pack';
}

const items = [];
const seen = new Set();
const MAXPACKS = parseInt(arg('max-packs', '400'), 10);
function scanDir(root, level) {
  if (level > 2 || items.length >= MAXPACKS) return;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(root, e.name);
    const isArch = !e.isDirectory() && ARCHIVE.has(extname(e.name).toLowerCase());
    if (!e.isDirectory() && !isArch) continue;
    if (e.isDirectory() && classify(p) === 'container') { scanDir(p, level + 1); continue; }
    if (seen.has(norm(p))) continue;
    seen.add(norm(p));
    addPack(p, e.name, isArch);
  }
}
function addPack(p, fname, isArch) {
  const names = isArch ? listArchive(p) : walkNames(p, 0, []);
  const hist = histFromNames(names.filter(Boolean));
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const nm = basename(fname, extname(fname));
  const nkey = nm.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
  const already = libPaths.find(lp => inside(p, lp) || inside(lp, p));
  const sameName = libNames.get(nkey);
  items.push({
    name: nm,
    path: p,
    file: fname,
    already_in_library: already ? (norm(already) === norm(p) ? 'exact' : 'overlap:' + already) : false,
    same_name_elsewhere: (sameName && norm(sameName) !== norm(p)) ? sameName : false,
    is_archive: isArch,
    size_mb: +(sizeOf(p) / 1048576).toFixed(1),
    files_seen: names.filter(Boolean).length,
    top_ext: Object.fromEntries(top),
    kind_guess: guessKind(fname, hist),
    sample: names.filter(Boolean).slice(0, 12),
    // ↓ заполняет Claude на шаге обогащения
    desc: '', tags: [], use: '', lic: '', licdate: '', notes: '', rating: 0, verdict: '',
    needs_review: true,
  });
}
scanDir(dir, 0);

// дубли по имени ВНУТРИ этого скана
const byName = {};
for (const i of items) {
  const k = i.name.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
  (byName[k] ||= []).push(i);
}
for (const k in byName) if (byName[k].length > 1)
  byName[k].forEach(i => { i.dup_in_scan = byName[k].filter(x => x !== i).map(x => x.path); });

items.sort((a, b) => b.size_mb - a.size_mb);
writeFileSync(OUT, JSON.stringify({ format: 'forge-asset-scan', scanned: dir,
  scanned_at: new Date().toISOString().slice(0, 16).replace('T', ' '), count: items.length, items }, null, 2));

console.log(`Просканировано: ${dir}`);
console.log(`Найдено пакетов: ${items.length}\n`);
for (const i of items.slice(0, 40))
  console.log(`  ${String(i.size_mb).padStart(7)} MB  ${i.kind_guess.padEnd(7)} ${i.name}  (${Object.keys(i.top_ext).slice(0,3).join(' ')||'—'})`);
if (items.length > 40) console.log(`  … и ещё ${items.length - 40}`);
const dupN = items.filter(i => i.dup_in_scan).length;
const inLib = items.filter(i => i.already_in_library).length;
const sameN = items.filter(i => i.same_name_elsewhere).length;
if (dupN || inLib || sameN) {
  console.log('\n⚠️  Требует внимания:');
  if (inLib) console.log(`   уже в библиотеке (тот же путь или вложенность): ${inLib}`);
  if (dupN)  console.log(`   одинаковые имена внутри этого скана: ${dupN}`);
  if (sameN) console.log(`   такое же имя в библиотеке по другому пути: ${sameN}`);
}
if (items.length >= MAXPACKS)
  console.log(`\n⚠️  Достигнут предел ${MAXPACKS} пакетов — часть папки не просканирована.\n` +
              `   Сканируй по подпапкам или подними --max-packs, но помни: библиотека на тысячи\n` +
              `   записей неудобна человеку. Лучше держать уровень «пак = то, что реально берут целиком».`);
console.log(`\nЧерновик: ${OUT}`);
console.log('Дальше: скил /asset-scan — уточнить в интернете, проставить теги/лицензии, влить в asset-library.json');
