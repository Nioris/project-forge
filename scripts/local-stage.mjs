#!/usr/bin/env node
/**
 * local-stage.mjs — локальная «сцена Яндекса»: игра запускается у тебя с ЗАМОКАННЫМ SDK
 * и живой debugcheck-панелью (?debug-mode=16), как на черновике Яндекса — но без загрузки
 * в Консоль. Два режима:
 *
 *   ЧЕЛОВЕК (по умолчанию):  node scripts/local-stage.mjs <game-dir> [--lang ru] [--port 8123]
 *     → печатает URL, открой в браузере: панель в углу, играешь и смотришь чеки вживую.
 *
 *   ИИ / тестер:             node scripts/local-stage.mjs <game-dir> --ai [--play]
 *     → headless-хром, (опц. --play: клики как в playtest), в конце дамп window.RT
 *       (все рантайм-флаги панели) в stage-out/rt.json + скриншот. Машиночитаемо.
 *
 * Мок покрывает то, что нужно панели: environment.i18n.lang (читается через геттер — 
 * инструментация v2.17 работает), LoadingAPI.ready, GameplayAPI, adv (фейк-оверлей 1.2с
 * с onOpen/onClose), player get/setData (в память), stubs для payments/leaderboards.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const dir = resolve(argv.find(a => !a.startsWith('--')) || '.');
const has = n => argv.includes('--' + n);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const LANG = arg('lang', 'ru');
const PORT = parseInt(arg('port', '8123'), 10);
if (!existsSync(join(dir, 'index.html'))) { console.error('[X] index.html not found in ' + dir); process.exit(2); }

const MOCK = `// __mock_sdk.js — локальный мок Yandex SDK для local-stage (не для продакшена!)
(function(){
  if (window.YaGames) return; // на реальной платформе не вмешиваемся
  var LS = {}; try { LS = JSON.parse(localStorage.getItem('__stage_saves')||'{}'); } catch(e){}
  function overlay(kind, ms, cb){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;inset:0;background:#111;color:#fff;z-index:99999;display:flex;align-items:center;justify-content:center;font:20px sans-serif;flex-direction:column';
    d.innerHTML='<div>[MOCK '+kind+' AD]</div><div style="font-size:12px;opacity:.6;margin-top:8px">закроется автоматически</div>';
    document.body.appendChild(d);
    setTimeout(function(){ d.remove(); cb&&cb(); }, ms);
  }
  var i18nLang = '${LANG}';
  var env = { app:{id:'stage'}, browser:{lang:i18nLang}, payload:'' };
  Object.defineProperty(env, 'i18n', { get: function(){ return { get lang(){ return i18nLang; }, tld:'ru' }; }, configurable:true });
  window.YaGames = {
    init: function(){
      console.log('[STAGE] YaGames.init (mock)');
      return Promise.resolve({
        environment: env,
        deviceInfo: { type:'desktop', isDesktop:function(){return true;}, isMobile:function(){return false;}, isTablet:function(){return false;} },
        features: { LoadingAPI: { ready: function(){ console.log('[STAGE] LoadingAPI.ready()'); } },
                    GameplayAPI: { start: function(){ console.log('[STAGE] Gameplay.start'); },
                                   stop: function(){ console.log('[STAGE] Gameplay.stop'); } } },
        adv: {
          showFullscreenAdv: function(o){ var cb=(o&&o.callbacks)||{}; cb.onOpen&&cb.onOpen();
            overlay('INTERSTITIAL',1200,function(){ cb.onClose&&cb.onClose(true); }); },
          showRewardedVideo: function(o){ var cb=(o&&o.callbacks)||{}; cb.onOpen&&cb.onOpen();
            overlay('REWARDED',1200,function(){ cb.onRewarded&&cb.onRewarded(); cb.onClose&&cb.onClose(); }); },
          getBannerAdvStatus: function(){ return Promise.resolve({stickyAdvIsShowing:false}); }
        },
        getPlayer: function(){ return Promise.resolve({
          getData: function(){ return Promise.resolve(LS); },
          setData: function(d){ LS=d; try{localStorage.setItem('__stage_saves',JSON.stringify(d));}catch(e){} return Promise.resolve(); },
          getStats: function(){ return Promise.resolve({}); }, setStats: function(){ return Promise.resolve(); },
          getName: function(){ return 'Stage Player'; }, getUniqueID: function(){ return 'stage-1'; }, getMode: function(){ return 'lite'; }
        }); },
        getPayments: function(){ return Promise.reject(new Error('[STAGE] payments not available locally')); },
        getLeaderboards: function(){ return Promise.resolve({
          setLeaderboardScore: function(){ return Promise.resolve(); },
          getLeaderboardEntries: function(){ return Promise.resolve({entries:[]}); } }); },
        feedback: { canReview: function(){ return Promise.resolve({value:false}); } },
        shortcut: { canShowPrompt: function(){ return Promise.resolve({canShow:false}); } },
        clipboard: { writeText: function(){ return Promise.resolve(); } },
        screen: { fullscreen: { status:'off', request: function(){ return Promise.resolve(); } } }
      });
    }
  };
})();`;

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
  '.jpg':'image/jpeg', '.mp3':'audio/mpeg', '.json':'application/json', '.svg':'image/svg+xml',
  '.webp':'image/webp', '.woff2':'font/woff2', '.ico':'image/x-icon' };

const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  if (u === 'favicon.ico') { res.writeHead(204); res.end(); return; }
  if (u === '__mock_sdk.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); res.end(MOCK); return; }
  const p = join(dir, u);
  try {
    let body = readFileSync(p);
    if (u === 'index.html') { // мок ДО кода игры, чтобы YaGames существовал к моменту init
      body = body.toString().replace(/<head([^>]*)>/i, '<head$1><script src="/__mock_sdk.js"></script>');
    }
    res.writeHead(200, {'Content-Type': MIME[extname(p)] || 'application/octet-stream'}); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

server.listen(PORT, async () => {
  const url = `http://127.0.0.1:${PORT}/index.html?debug-mode=16&draft=true&lang=${LANG}`;
  if (!has('ai')) {
    console.log('════ LOCAL STAGE ════');
    console.log('Игра с мок-SDK и живой debug-панелью:');
    console.log('  ' + url);
    console.log('Открой в браузере. Панель — как на черновике Яндекса. Ctrl+C — остановить.');
    return; // сервер живёт, человек играет
  }
  // ── AI-режим: headless + дамп RT ──
  const OUT = resolve(arg('out', join(dir, 'stage-out'))); mkdirSync(OUT, { recursive: true });
  let pup; try { const mod=await import('puppeteer'); pup=mod.default||mod; }
  catch { try { pup=createRequire(join(process.cwd(),'package.json'))('puppeteer'); } catch { console.error('[X] npm install puppeteer'); process.exit(2); } }
  const errors = [];
  const browser = await pup.launch({ args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('dialog', async dialog => { try { await dialog.dismiss(); } catch {} });
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => errors.push('goto: '+e.message));
  await new Promise(r => setTimeout(r, 2500));
  if (has('play')) { // лёгкая игра: меню + сетка кликов (как playtest, короче)
    await page.evaluate(() => { const RX=/(старт|начать|играть|start|play|new|далее|next|ok)/i;
      const b=[...document.querySelectorAll('button,[onclick],[role=button],.btn')].find(e=>RX.test(e.textContent||''));
      b&&b.click(); });
    await new Promise(r => setTimeout(r, 800));
    const t = await page.evaluate(() => { const c=document.querySelector('canvas'); if(!c)return null;
      const r=c.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
    for (let i = 0; i < 12; i++) {
      const x = t ? t.x + t.w*(0.15+0.18*(i%5)) : 200+ i*80, y = t ? t.y + t.h*(0.2+0.2*(Math.floor(i/5)%4)) : 300;
      await page.mouse.click(x, y).catch(()=>{}); await new Promise(r => setTimeout(r, 250));
    }
  }
  await new Promise(r => setTimeout(r, 1500));
  const rt = await page.evaluate(() => {
    const o = {}; const RT = window.RT || {};
    for (const k of Object.keys(RT)) { const v = RT[k];
      o[k] = (typeof v === 'function') ? undefined : (v instanceof Set ? [...v] : v); }
    return o;
  }).catch(e => ({ __error: e.message }));
  await page.screenshot({ path: join(OUT, 'stage.png') });
  await browser.close(); server.close();
  writeFileSync(join(OUT, 'rt.json'), JSON.stringify({ url, lang: LANG, errors, rt }, null, 2));
  console.log('════ LOCAL STAGE (AI) ════');
  console.log('RT-флаги панели → ' + join(OUT, 'rt.json'));
  console.log('Скриншот         → ' + join(OUT, 'stage.png'));
  console.log('Ошибок консоли: ' + errors.length + (errors.length ? '\n  ' + [...new Set(errors)].slice(0,8).join('\n  ') : ''));
  console.log('Ключевые факты: i18nRead=' + rt._i18nRead + '  readyCalled=' + (rt._readyCalled ?? rt.readyCalled ?? 'n/a'));
  process.exit(errors.length ? 1 : 0);
});
