#!/usr/bin/env node
/**
 * asset-bible.mjs — страница выбора ЭТАЛОНОВ стиля перед массовой генерацией.
 * Собирает всё, что лежит в <игра>/assets/bible/: варианты генерации (2-3 на категорию)
 * и кандидатов из библиотеки. Пользователь кликом выбирает эталон в каждой категории,
 * жмёт «Сохранить выбор» → selection.json, по которому дальше идёт массовая генерация.
 *
 * Ожидаемая раскладка (создаёт исполнитель):
 *   assets/bible/<категория>/gen-01.png, gen-02.png …   — варианты генерации
 *   assets/bible/<категория>/lib-<имя>.png              — кандидат из библиотеки
 *   assets/bible/<категория>/_prompts.json  (опц.)      — {"gen-01.png": "промпт…"}
 *
 * Usage: node <движок>/scripts/asset-bible.mjs [папка-игры]
 */
import { readdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative, extname, basename } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const game = resolve(argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--dir' && argv[argv.indexOf(a) - 1] !== '--title') || '.');
const SUB = opt('dir', 'assets/bible');
const TITLE = opt('title', 'Библия стиля');
const root = join(game, ...SUB.split('/'));
if (!existsSync(root)) {
  console.error(`[X] Нет папки ${root}`);
  console.error('    Сложи туда файлы по категориям, например:');
  console.error(`    ${SUB}/icons/gen-01.png, ${SUB}/ui/gen-01.png, …`);
  process.exit(2);
}
const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const cats = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
if (!cats.length) { console.error('[X] В assets/bible нет подпапок-категорий'); process.exit(2); }

const prev = (() => { try { return JSON.parse(readFileSync(join(root, 'selection.json'), 'utf8')).selected || {}; } catch { return {}; } })();

let total = 0;
const blocks = cats.map(cat => {
  const dir = join(root, cat);
  let prompts = {};
  try { prompts = JSON.parse(readFileSync(join(dir, '_prompts.json'), 'utf8')); } catch {}
  const files = readdirSync(dir).filter(f => IMG.has(extname(f).toLowerCase())).sort();
  total += files.length;
  const cards = files.map(f => {
    const src = relative(game, join(dir, f)).replace(/\\/g, '/');
    const isLib = f.startsWith('lib-');
    const isRef = f.startsWith('ref-');
    const kb = Math.round(statSync(join(dir, f)).size / 1024);
    return `<label class="card ${prev[cat] === f ? 'sel' : ''}" data-cat="${cat}" data-file="${f}">
      <input type="radio" name="c_${cat}" value="${f}" ${prev[cat] === f ? 'checked' : ''} onchange="pick('${cat}','${f}',this)">
      <div class="thumb"><img src="${src}" loading="lazy"></div>
      <div class="meta"><b>${f}</b><span class="tag ${isRef ? 'ref' : isLib ? 'lib' : 'gen'}">${isRef ? 'референс' : isLib ? 'из библиотеки' : 'генерация'}</span>
        <span class="kb">${kb} KB</span></div>
      ${prompts[f] ? `<div class="prompt">${prompts[f].replace(/</g, '&lt;')}</div>` : ''}
    </label>`;
  }).join('');
  return `<section><h2>${cat} <span class="n">${files.length} вариант(ов)</span></h2>
    <div class="grid">${cards || '<div class="empty">пусто</div>'}</div></section>`;
}).join('');

const out = join(root, 'index.html');
writeFileSync(out, `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>${TITLE} — ${basename(game)}</title><style>
:root{--bg:#0f1117;--bg2:#171a23;--fg:#e8eaf0;--fg2:#8b93a7;--acc:#7c5cff;--ok:#44b85c;--brd:#282d3d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
header{padding:20px 26px;border-bottom:1px solid var(--brd);position:sticky;top:0;background:var(--bg);z-index:9}
h1{margin:0 0 4px;font-size:20px}.sub{color:var(--fg2);font-size:13px}
button{background:#2a2350;border:1px solid var(--acc);color:#c9bcff;border-radius:8px;padding:8px 15px;cursor:pointer;font-size:13px;font-weight:600;margin-top:10px}
section{padding:18px 26px}h2{font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg2);margin:0 0 12px}
h2 .n{color:var(--acc);text-transform:none;font-weight:400;letter-spacing:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.card{display:block;background:var(--bg2);border:2px solid var(--brd);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .15s}
.card:hover{border-color:#4a5270}.card.sel{border-color:var(--ok);box-shadow:0 0 0 3px #44b85c22}
.card input{display:none}
.thumb{height:200px;display:flex;align-items:center;justify-content:center;padding:8px;
 background:repeating-conic-gradient(#22222e 0 25%,#1a1a24 0 50%) 50%/16px 16px}
.thumb img{max-width:100%;max-height:100%;image-rendering:pixelated}
.meta{padding:8px 11px;font-size:11px;display:flex;flex-direction:column;gap:3px}
.meta b{word-break:break-all}.kb{color:var(--fg2)}
.tag{align-self:flex-start;padding:1px 7px;border-radius:20px;font-size:10px}
.tag.gen{background:#2a2350;color:#c9bcff}.tag.lib{background:#123221;color:#8fd6ac}.tag.ref{background:#3a2a12;color:#e3b268}
.prompt{padding:7px 11px;font-size:10px;color:var(--fg2);border-top:1px solid var(--brd);
 font-family:ui-monospace,Consolas,monospace;max-height:80px;overflow:auto}
.empty{color:var(--fg2);padding:20px}
#bar{position:fixed;bottom:0;left:0;right:0;background:var(--bg2);border-top:1px solid var(--brd);
 padding:12px 26px;display:flex;gap:14px;align-items:center;justify-content:space-between}
</style></head><body>
<header><h1>📖 ${TITLE} — ${basename(game)}</h1>
<div class="sub">Выбери ЭТАЛОН в каждой категории.
Зелёная рамка = выбрано. Категорий: ${cats.length}, вариантов: ${total}.</div></header>
${blocks}
<div style="height:80px"></div>
<div id="bar"><span id="status">Выбрано: 0 из ${cats.length}</span>
<button onclick="save()">⬇ Сохранить выбор (selection.json)</button></div>
<script>
var sel = ${JSON.stringify(prev)};
var CATS = ${JSON.stringify(cats)};
function pick(cat,file,el){
  sel[cat]=file;
  document.querySelectorAll('.card[data-cat="'+cat+'"]').forEach(function(c){
    c.classList.toggle('sel', c.dataset.file===file); });
  upd();
}
function upd(){ document.getElementById('status').textContent =
  'Выбрано: '+Object.keys(sel).length+' из '+CATS.length +
  (Object.keys(sel).length<CATS.length ? ' — осталось: '+CATS.filter(function(c){return !sel[c]}).join(', ') : ' ✓'); }
function save(){
  var data={format:'forge-asset-bible',game:${JSON.stringify(basename(game))},
    approved_at:new Date().toISOString().slice(0,16).replace('T',' '),selected:sel};
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download='selection.json'; a.click();
  alert('Положи selection.json рядом с этой страницей.\\nПо нему исполнитель запустит массовую генерацию.');
}
upd();
</script></body></html>`);

console.log(`[OK] ${out}`);
console.log(`     Категорий: ${cats.length} (${cats.join(', ')}), вариантов: ${total}`);
console.log(`     Открой в браузере, выбери эталоны, сохрани selection.json в ${SUB}/`);
