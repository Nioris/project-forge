#!/usr/bin/env node
/**
 * screens-shoot.mjs — снять КАЖДЫЙ экран игры и собрать контактный лист для самооценки.
 * Работает поверх local-stage/puppeteer: обходит состояния игры, снимает мобильный 412
 * и десктоп 1920, кладёт рядом лист index.html со всеми кадрами в один взгляд.
 *
 * Usage: node <движок>/scripts/screens-shoot.mjs <игра> [--states "штаб,карта,бой,итог"]
 *        [--mobile 412x915] [--desktop 1920x1080]
 * Скрипт НЕ оценивает — оценивает исполнитель по правилам ui-review §самооценка.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const dir = resolve(process.argv[2] || '.');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const states = arg('states', '').split(',').map(s => s.trim()).filter(Boolean);
const [mw, mh] = arg('mobile', '412x915').split('x').map(Number);
const [dw, dh] = arg('desktop', '1920x1080').split('x').map(Number);
if (!existsSync(join(dir, 'index.html'))) { console.error('[X] Нет index.html в', dir); process.exit(2); }
const OUT = join(dir, 'screens', 'review'); mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png',
  '.jpg':'image/jpeg','.mp3':'audio/mpeg','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml' };
const server = createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (requestPath === '/sdk.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('window.YaGames=window.YaGames||undefined;'); return; }
  const u = requestPath.replace(/^\/+/, '') || 'index.html';
  try { const b = readFileSync(join(dir, u));
    res.writeHead(200, { 'Content-Type': MIME[extname(u)] || 'application/octet-stream' }); res.end(b);
  } catch { res.writeHead(404); res.end(); }
});

server.listen(0, async () => {
  const port = server.address().port;
  const loadPup = async () => {
    try { const mod=await import('puppeteer'); return mod.default||mod; }
    catch { try { return createRequire(join(process.cwd(),'package.json'))('puppeteer'); } catch { return null; } }
  };
  let pup=await loadPup();
  if(!pup){
    console.error('[screens-shoot] installing puppeteer...');
    const r=spawnSync('npm',['install','puppeteer','--no-audit','--no-fund'],{stdio:'inherit',shell:true});
    if(r.status!==0){ console.error('[X] puppeteer install failed'); process.exit(2); }
    pup=await loadPup();
  }
  if(!pup){ console.error('[X] puppeteer installed but cannot be resolved from the project'); process.exit(2); }
  const browser = await pup.launch({ args: ['--no-sandbox'] });
  const shots = [];

  for (const [label, w, h] of [['mobile', mw, mh], ['desktop', dw, dh]]) {
    const page = await browser.newPage();
    page.on('dialog', async dialog => { try { await dialog.dismiss(); } catch {} });
    await page.setViewport({ width: w, height: h, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(()=>{});
    await new Promise(r => setTimeout(r, 1800));

    // стартовый экран
    let i = 1;
    const shoot = async name => {
      const f = join(OUT, `${label}-${String(i).padStart(2,'0')}-${name}.png`);
      await page.screenshot({ path: f, fullPage: false });
      // высота контента vs экран — ловит «не влезает в мобильный»
      const over = await page.evaluate(() => Math.round(document.documentElement.scrollHeight / window.innerHeight * 100) / 100);
      shots.push({ file: basename(f), label, name, over });
      i++;
    };
    await shoot('start');

    // проход по состояниям: кликаем по кнопке с текстом состояния
    for (const st of states) {
      const ok = await page.evaluate(t => {
        const el = [...document.querySelectorAll('button,[onclick],[role=button],a,.btn,[class*=btn],[class*=tab]')]
          .find(e => (e.textContent||'').toLowerCase().includes(t.toLowerCase()));
        if (!el) return false; el.click(); return true;
      }, st);
      if (!ok) { console.log(`  · ${label}: состояние "${st}" не найдено по тексту кнопки`); continue; }
      await new Promise(r => setTimeout(r, 1200));
      await shoot(st.replace(/\s+/g,'-'));
    }
    await page.close();
  }
  await browser.close(); server.close();

  const rows = shots.map(s => `<figure><img src="${s.file}"><figcaption>
    <b>${s.name}</b> · ${s.label}${s.over > 1.05 ? ` · <span class="warn">не влезает: ${s.over} экрана</span>` : ''}
    </figcaption></figure>`).join('');
  writeFileSync(join(OUT, 'index.html'), `<!DOCTYPE html><meta charset="utf-8">
<title>Контактный лист — ${basename(dir)}</title><style>
body{margin:0;background:#0f1117;color:#e8eaf0;font:14px system-ui;padding:20px}
h1{font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
figure{margin:0;background:#171a23;border:1px solid #282d3d;border-radius:10px;overflow:hidden}
img{width:100%;display:block;background:#000}
figcaption{padding:8px 11px;font-size:12px}.warn{color:#e05252;font-weight:600}
</style><h1>Контактный лист — ${basename(dir)} <span style="opacity:.5;font-size:13px">${shots.length} кадров</span></h1>
<p style="opacity:.6">Оценивай КАЖДЫЙ по ui-review §самооценка: балл 1-10 + причина + что мешает.</p>
<div class="grid">${rows}</div>`);

  console.log(`\n[OK] Снято кадров: ${shots.length}`);
  console.log(`     Контактный лист: ${join(OUT,'index.html')}`);
  const bad = shots.filter(s => s.over > 1.05);
  if (bad.length) console.log(`  ⚠️  Не влезают в экран: ${bad.map(s=>`${s.name}/${s.label} (${s.over})`).join(', ')}`);
  console.log('     Дальше: оцени каждый кадр по ui-review §самооценка ДО показа пользователю.');
});
