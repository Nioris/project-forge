#!/usr/bin/env node
/**
 * playtest.mjs — АКТИВНЫЙ плейтест игры в headless-хроме (в отличие от пассивного
 * smoke-test.mjs, который только слушает консоль).
 *
 * Что делает: поднимает локальный сервер, открывает игру, ИГРАЕТ в неё
 * (кликает старт-кнопки, тыкает по canvas сеткой, жмёт клавиши), снимает
 * СКРИНШОТЫ ключевых моментов и собирает ошибки. Скриншоты смотрит
 * оркестратор/человек глазами — "что игра реально сделала".
 *
 * Usage: node scripts/playtest.mjs <game-dir> [--clicks 25] [--keys "wasd "] [--out playtest-out]
 * Exit: 0 = no runtime errors during play; 1 = errors (list printed); 2 = setup failure.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Phase acceptance uses the declared runner below.  Keep the old random-input
// smoke path for diagnosis, but never let its screenshots masquerade as player
// actions or a core-flow proof.
if (process.argv.includes('--contract')) {
  const runner = fileURLToPath(new URL('./web-playtest-runner.mjs', import.meta.url));
  const forwarded = process.argv.slice(2).filter(value => value !== '--contract');
  const child = spawnSync(process.execPath, [runner, ...forwarded], { stdio: 'inherit', windowsHide: true });
  process.exit(child.status == null ? 1 : child.status);
}

const argv = process.argv.slice(2);
const dir = resolve(argv.find(a => !a.startsWith('--')) || '.');
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const N_CLICKS = parseInt(arg('clicks', '25'), 10);
const KEYS = arg('keys', ' ');                       // клавиши для realtime-игр
const OUT = resolve(arg('out', join(dir, 'playtest-out')));

if (!existsSync(join(dir, 'index.html'))) { console.error('[X] index.html not found in ' + dir); process.exit(2); }
mkdirSync(OUT, { recursive: true });

// puppeteer auto-install (same policy as runtime-test: a missing dep must not silently skip tests)
async function loadPup() {
  try { const mod = await import('puppeteer'); return mod.default || mod; }
  catch {
    try { return createRequire(join(process.cwd(), 'package.json'))('puppeteer'); }
    catch { return null; }
  }
}
async function getPup() {
  const existing = await loadPup();
  if (existing) return existing;
  console.error('[playtest] installing puppeteer...');
  const r = spawnSync('npm', ['install', 'puppeteer', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error('[X] puppeteer install failed'); process.exit(2); }
  const installed = await loadPup();
  if (!installed) { console.error('[X] puppeteer installed but cannot be resolved from the project'); process.exit(2); }
  return installed;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (requestPath === '/sdk.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('window.YaGames=window.YaGames||undefined;'); return; }
  const p = join(dir, requestPath.replace(/^\/+/, '') || 'index.html');
  try { const body = readFileSync(p); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});

const errors = [];
const log = [];
const shot = async (page, name) => {
  const f = join(OUT, name + '.png');
  await page.screenshot({ path: f });
  log.push('📸 ' + name + '.png');
};

server.listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const pup = await getPup();
  const browser = await pup.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => errors.push('goto: ' + e.message));
  await new Promise(r => setTimeout(r, 1500));
  await shot(page, '01-loaded');

  // 1) прокликать старт-подобные кнопки (до 3 экранов меню вглубь)
  for (let round = 0; round < 3; round++) {
    const clicked = await page.evaluate(() => {
      const RX = /(старт|начать|играть|start|play|new game|новая|continue|продолжить|battle|бой|level|уровень|ok|далее|next|skip)/i;
      const els = [...document.querySelectorAll('button, [onclick], [role=button], a, .btn, [class*=btn]')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 5 && r.height > 5 &&
          getComputedStyle(e).display !== 'none' && RX.test(e.textContent || e.value || ''); });
      if (!els.length) return null;
      const e = els[0]; const t = (e.textContent || '').trim().slice(0, 30); e.click(); return t;
    });
    if (!clicked) break;
    log.push('🖱 clicked menu: "' + clicked + '"');
    await new Promise(r => setTimeout(r, 900));
  }
  await shot(page, '02-after-menu');

  // 2) поиграть: клики сеткой по canvas (или по body, если canvas нет) + клавиши
  const target = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < N_CLICKS; i++) {
    let x, y;
    if (target) { // сетка 5xN + джиттер — покрывает поле равномернее случайного
      const col = i % 5, row = Math.floor(i / 5) % 5;
      x = target.x + target.w * (0.1 + 0.2 * col) + rnd(-8, 8);
      y = target.y + target.h * (0.1 + 0.2 * row) + rnd(-8, 8);
    } else { x = rnd(100, 1180); y = rnd(100, 620); }
    await page.mouse.click(x, y).catch(() => {});
    if (KEYS.trim() && i % 3 === 0) {
      const k = KEYS[i % KEYS.length];
      await page.keyboard.press(k === ' ' ? 'Space' : k).catch(() => {});
    }
    if (i === Math.floor(N_CLICKS / 2)) await shot(page, '03-midplay');
    await new Promise(r => setTimeout(r, 250));
  }
  await shot(page, '04-endplay');

  // 3) живой ли рендер-цикл (rAF тикает?)
  const rafAlive = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 > 600) res(n > 5); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })).catch(() => false);

  await browser.close(); server.close();

  // ── отчёт ──
  const report = { game: dir, clicks: N_CLICKS, rafAlive, errors, actions: log, screenshots: OUT };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\n════ PLAYTEST ════');
  console.log('Действия:'); log.forEach(l => console.log('  ' + l));
  console.log('Рендер-цикл (rAF): ' + (rafAlive ? '✅ живой' : '⚠️ не тикает (статичная игра? или зависла)'));
  console.log('Скриншоты: ' + OUT + '  ← СМОТРЕТЬ ГЛАЗАМИ (01 загрузка → 02 меню → 03 середина → 04 конец)');
  if (errors.length) {
    console.log('\n❌ ОШИБКИ ВО ВРЕМЯ ИГРЫ (' + errors.length + '):');
    [...new Set(errors)].slice(0, 15).forEach(e => console.log('  ' + e.slice(0, 200)));
    process.exit(1);
  }
  console.log('\n✅ 0 runtime-ошибок за ' + N_CLICKS + ' кликов игры');
  process.exit(0);
});
