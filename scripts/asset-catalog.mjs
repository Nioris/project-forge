#!/usr/bin/env node
/**
 * asset-catalog.mjs — визуальный каталог ассетов игры (одна HTML-страница).
 * Зачем: на сложном проекте видеть ВЕСЬ арт разом — общий стиль, палитру, размеры,
 * дубли и выбивающиеся из стиля куски. Открывается локально, без сборки.
 *
 * Usage: node scripts/asset-catalog.mjs <game-dir> [--out asset-catalog.html]
 */
import { readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, extname, basename } from 'node:path';

const dir = resolve(process.argv[2] || '.');
const outArg = process.argv.indexOf('--out');
const out = join(dir, outArg > 0 ? process.argv[outArg + 1] : 'asset-catalog.html');
const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const SKIP = new Set(['node_modules', '.git', 'handoff', '.context-backups', 'Release']);

function walk(root, acc = []) {
  if (!existsSync(root)) return acc;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (IMG.has(extname(e.name).toLowerCase())) acc.push(p);
  }
  return acc;
}
const files = walk(dir);
if (!files.length) { console.error('[X] Картинок не найдено в', dir); process.exit(2); }

const groups = {};
for (const f of files) {
  const rel = relative(dir, f).replace(/\\/g, '/');
  const g = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '(корень)';
  (groups[g] ||= []).push({ rel, name: basename(f), size: statSync(f).size });
}
const total = files.length;
const totalKB = Math.round(files.reduce((s, f) => s + statSync(f).size, 0) / 1024);

const cards = Object.entries(groups).sort().map(([g, items]) => `
<section class="grp" data-grp="${g}">
  <h2>${g} <span class="n">${items.length} файл(ов)</span></h2>
  <div class="grid">${items.map(i => `
    <figure class="card">
      <div class="thumb"><img src="${i.rel}" loading="lazy" alt="${i.name}"
        onload="this.dataset.dim=this.naturalWidth+'×'+this.naturalHeight;pal(this);"
        onerror="this.closest('.card').classList.add('err')"></div>
      <figcaption><b>${i.name}</b><span class="meta"></span><span class="kb">${Math.round(i.size/1024)} KB</span></figcaption>
      <div class="pal"></div>
    </figure>`).join('')}</div>
</section>`).join('');

writeFileSync(out, `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>Каталог ассетов — ${basename(dir)}</title><style>
:root{--bg:#12121a;--bg2:#1b1b26;--fg:#e8e8f0;--fg2:#9a9ab0;--acc:#7c5cff;--brd:#2c2c3c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--brd);position:sticky;top:0;background:var(--bg);z-index:9}
h1{margin:0 0 6px;font-size:19px}.sub{color:var(--fg2);font-size:13px}
input{margin-top:10px;background:var(--bg2);border:1px solid var(--brd);color:var(--fg);padding:7px 11px;border-radius:8px;width:280px}
.grp{padding:18px 24px}h2{font-size:14px;letter-spacing:.06em;color:var(--fg2);text-transform:uppercase;margin:0 0 12px}
h2 .n{color:var(--acc);text-transform:none;letter-spacing:0;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.card{margin:0;background:var(--bg2);border:1px solid var(--brd);border-radius:12px;overflow:hidden}
.thumb{height:150px;display:flex;align-items:center;justify-content:center;background:
 repeating-conic-gradient(#22222e 0 25%,#1a1a24 0 50%) 50%/16px 16px;padding:6px}
.thumb img{max-width:100%;max-height:100%;image-rendering:pixelated}
figcaption{padding:8px 10px;font-size:11px;display:flex;flex-direction:column;gap:2px}
figcaption b{font-weight:600;word-break:break-all}.meta,.kb{color:var(--fg2)}
.pal{display:flex;height:12px}.pal i{flex:1}
.card.err{opacity:.4}
</style></head><body>
<header><h1>Каталог ассетов — ${basename(dir)}</h1>
<div class="sub">${total} изображений · ${totalKB} KB · сгенерировано ${new Date().toISOString().slice(0,16).replace('T',' ')}</div>
<input id="q" placeholder="фильтр по имени или папке…" oninput="flt()"></header>
${cards}
<script>
function pal(img){ // палитра: 5 доминирующих цветов клиентской стороной
 try{const c=document.createElement('canvas'),n=24;c.width=n;c.height=n;const x=c.getContext('2d');
 x.drawImage(img,0,0,n,n);const d=x.getImageData(0,0,n,n).data,m={};
 for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;
  const k=[d[i],d[i+1],d[i+2]].map(v=>Math.round(v/32)*32).join(',');m[k]=(m[k]||0)+1;}
 const top=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5);
 const box=img.closest('.card');
 box.querySelector('.pal').innerHTML=top.map(([k])=>'<i style="background:rgb('+k+')"></i>').join('');
 box.querySelector('.meta').textContent=img.dataset.dim||'';}catch(e){}}
function flt(){const v=document.getElementById('q').value.toLowerCase();
 document.querySelectorAll('.grp').forEach(g=>{let vis=0;
  g.querySelectorAll('.card').forEach(c=>{const t=c.textContent.toLowerCase()+' '+g.dataset.grp.toLowerCase();
   const ok=t.includes(v);c.style.display=ok?'':'none';if(ok)vis++;});
  g.style.display=vis?'':'none';});}
</script></body></html>`);
console.log(`[OK] ${out}`);
console.log(`     ${total} изображений, ${totalKB} KB, групп: ${Object.keys(groups).length}`);
console.log('     Открой в браузере: общий стиль, палитры, размеры, дубли — одним взглядом.');
