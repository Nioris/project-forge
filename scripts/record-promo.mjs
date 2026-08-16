#!/usr/bin/env node
/**
 * record-promo.mjs — канонический рекордер промо-видео по правилам promo-screens 🎬.
 * Снимает геймплей (puppeteer page.screencast), играет сам (меню → сетка кликов → клавиши),
 * монтирует ТОЛЬКО через GPU (h264_nvenc; нет NVENC → стоп), печатает факты (ffprobe).
 *
 * Usage: node scripts/record-promo.mjs <game-dir>
 *   [--orientation landscape|portrait]  (мобильный профиль; default landscape)
 *   [--seconds 45] [--trim-start 6] [--keys "wasd "] [--only desktop|mobile]
 * Выход: <game>/screens/video/promo-desktop.mp4 (+ promo-mobile.mp4) ≤28с.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dir = resolve(argv.find(a => !a.startsWith('--')) || '.');
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const SECONDS = parseInt(arg('seconds', '45'), 10);
const TRIM = arg('trim-start', '6');
const KEYS = arg('keys', ' ');
const ORIENT = arg('orientation', 'landscape');
const ONLY = arg('only', '');
if (!existsSync(join(dir, 'index.html'))) { console.error('[X] index.html not found'); process.exit(2); }
const OUT = join(dir, 'screens', 'video'); mkdirSync(OUT, { recursive: true });

// GPU обязателен (правило v4.31.2)
const enc = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8', shell: true });
if (!/h264_nvenc/.test(enc.stdout || '')) {
  console.error('[X] h264_nvenc не найден в ffmpeg — GPU-кодирование обязательно (CPU запрещён). Поставь win-сборку ffmpeg с NVENC.');
  process.exit(2);
}

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png',
  '.jpg':'image/jpeg','.mp3':'audio/mpeg','.json':'application/json','.svg':'image/svg+xml',
  '.webp':'image/webp','.woff2':'font/woff2' };
const MOCK = `(function(){
  // SELF-HEALING rAF (полевой кейс hostling v2): в автоматизированном браузере rAF может быть
  // МЁРТВ даже с CDP focus-эмуляцией и анти-троттл флагами. Шим ставится ДО кода игры:
  // нативный rAF жив — прозрачен (vsync-гладкость); мёртв >250мс — watchdog гонит колбэки
  // таймером с performance.now() (таймеры живут с флагами). Игра и боты не замечают подмены.
  (function(){
    var native = window.requestAnimationFrame.bind(window);
    var q = []; var lastTick = performance.now();
    window.requestAnimationFrame = function(cb){ q.push(cb); return q.length; };
    function flush(ts){ var cbs = q; q = []; lastTick = ts; for (var i=0;i<cbs.length;i++){ try{ cbs[i](ts); }catch(e){} } }
    (function nativeLoop(){ native(function(ts){ flush(ts); nativeLoop(); }); })();
    setInterval(function(){ var now = performance.now();
      if (now - lastTick > 250 && q.length) flush(now); }, 50);
  })();
  if(window.YaGames)return;window.YaGames={init:function(){return Promise.resolve({
 environment:{get i18n(){return{get lang(){return 'ru';},tld:'ru'};},app:{id:'rec'},browser:{lang:'ru'}},
 deviceInfo:{type:'desktop',isDesktop:()=>true,isMobile:()=>false,isTablet:()=>false},
 features:{LoadingAPI:{ready:()=>{}},GameplayAPI:{start:()=>{},stop:()=>{}}},
 adv:{showFullscreenAdv:o=>{var c=(o&&o.callbacks)||{};c.onOpen&&c.onOpen();setTimeout(()=>c.onClose&&c.onClose(true),300);},
      showRewardedVideo:o=>{var c=(o&&o.callbacks)||{};c.onOpen&&c.onOpen();setTimeout(()=>{c.onRewarded&&c.onRewarded();c.onClose&&c.onClose();},300);},
      getBannerAdvStatus:()=>Promise.resolve({stickyAdvIsShowing:false})},
 getPlayer:()=>Promise.resolve({getData:()=>Promise.resolve({}),setData:()=>Promise.resolve(),getStats:()=>Promise.resolve({}),setStats:()=>Promise.resolve(),getName:()=>'P',getUniqueID:()=>'1',getMode:()=>'lite'}),
 getPayments:()=>Promise.reject(new Error('n/a')),
 getLeaderboards:()=>Promise.resolve({setLeaderboardScore:()=>Promise.resolve(),getLeaderboardEntries:()=>Promise.resolve({entries:[]})}),
 feedback:{canReview:()=>Promise.resolve({value:false})},shortcut:{canShowPrompt:()=>Promise.resolve({canShow:false})},
 clipboard:{writeText:()=>Promise.resolve()},screen:{fullscreen:{status:'off',request:()=>Promise.resolve()}}});}};})();`;

const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  if (u === '__mock.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); res.end(MOCK); return; }
  const p = join(dir, u);
  try {
    let body = readFileSync(p);
    if (u === 'index.html') body = body.toString().replace(/<head([^>]*)>/i, '<head$1><script src="/__mock.js"></script>');
    res.writeHead(200, {'Content-Type': MIME[extname(p)] || 'application/octet-stream'}); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

async function play(page, w, h, seconds, touch) {
  // меню (до 3 экранов) → игра: сетка 5×5 + клавиши
  for (let r = 0; r < 3; r++) {
    const c = await page.evaluate(() => { const RX=/(старт|начать|играть|start|play|new|далее|next|ok|бой|battle)/i;
      const b=[...document.querySelectorAll('button,[onclick],[role=button],a,.btn,[class*=btn]')]
        .find(e=>{const x=e.getBoundingClientRect();return x.width>5&&RX.test(e.textContent||e.value||'');});
      if(!b)return false; b.click(); return true; });
    if (!c) break; await new Promise(r2 => setTimeout(r2, 800));
  }
  const t = await page.evaluate(() => { const c=document.querySelector('canvas'); if(!c)return null;
    const r=c.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
  const t0 = Date.now(); let i = 0;
  while ((Date.now() - t0) / 1000 < seconds) {
    let x, y;
    if (t) { const col=i%5,row=Math.floor(i/5)%5; x=t.x+t.w*(0.1+0.2*col)+(Math.random()*16-8); y=t.y+t.h*(0.1+0.2*row)+(Math.random()*16-8); }
    else { x=100+Math.random()*(w-200); y=100+Math.random()*(h-200); }
    if (touch) await page.touchscreen.tap(x, y).catch(()=>{}); else await page.mouse.click(x, y).catch(()=>{});
    if (KEYS.trim() && i % 3 === 0) { const k=KEYS[i%KEYS.length]; await page.keyboard.press(k===' '?'Space':k).catch(()=>{}); }
    i++; await new Promise(r2 => setTimeout(r2, 300));
  }
}

async function record(browser, name, w, h, touch, port) {
  const page = await browser.newPage();
  // FROZEN-rAF FIX (полевой кейс hostling): в автоматизированном браузере окно «не в фокусе» →
  // rAF замирает → screencast/скриншоты отдают первый кадр при живом JS-стейте. Канонический
  // фикс — CDP focus-эмуляция (флаги/visibilityState-подмена НЕ достаточны, проверено в поле).
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(()=>{});
  await page.setViewport({ width: w, height: h, hasTouch: !!touch, isMobile: !!touch });
  await page.goto(`http://127.0.0.1:${port}/index.html?debug-mode=0`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(()=>{});
  await new Promise(r => setTimeout(r, 1500));
  const raw = join(OUT, `raw-${name}.webm`);
  const rec = await page.screencast({ path: raw });
  await play(page, w, h, SECONDS, touch);
  await rec.stop(); await page.close();
  // GPU-монтаж: обрезка до 28с с trim-start (хук)
  const out = join(OUT, `promo-${name}.mp4`);
  const ff = spawnSync('ffmpeg', ['-y','-hwaccel','cuda','-ss',TRIM,'-i',raw,'-t','28',
    '-vf',`scale=${w}:${h}`,'-c:v','h264_nvenc','-preset','p5','-cq','23','-b:v','0','-an',out],
    { encoding:'utf8', shell:true });
  if (ff.status !== 0) { console.error(`[X] ffmpeg ${name}:`, (ff.stderr||'').slice(-400)); return null; }
  const probe = spawnSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries',
    'stream=width,height:format=duration','-of','csv=p=0', out], { encoding:'utf8', shell:true });
  console.log(`\n═══ ${name.toUpperCase()} ═══`);
  console.log('Файл:', out);
  console.log('ffprobe (w,h / duration):', (probe.stdout||'').trim());
  console.log('Проверь глазами: первые 3с = ДЕЙСТВИЕ (не меню), HUD виден, debug-панели нет.');
  return out;
}

server.listen(0, async () => {
  const port = server.address().port;
  let pup; try { pup = await import('puppeteer'); } catch { console.error('[X] npm i puppeteer'); process.exit(2); }
  const browser = await pup.default.launch({ args:['--no-sandbox','--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'] });
  if (ONLY !== 'mobile')  await record(browser, 'desktop', 1920, 1080, false, port);
  if (ONLY !== 'desktop') {
    if (ORIENT === 'portrait') await record(browser, 'mobile', 1080, 1920, true, port);
    else await record(browser, 'mobile', 1920, 1080, true, port);
  }
  await browser.close(); server.close();
  console.log('\nГотово. Сырьё raw-*.webm оставлено для перемонтажа (другой --trim-start).');
});
