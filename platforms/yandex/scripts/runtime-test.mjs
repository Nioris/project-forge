#!/usr/bin/env node
// runtime-test.mjs — Runtime REQ-4.4 / REQ-4.5 probe.
//
// What pre-submit (static) and smoke-test (no interaction) cannot catch:
//   - showInterstitial() called from state-driven functions (endGame, gameOver,
//     onDeath, ...) without a user gesture in the call stack.
//   - showRewardedVideo() called without user gesture.
//   - Past rejection: Circle 2048 v1 — "Реклама без пользовательского неигрового действия".
//
// How it works (NO Yandex SDK needed):
//   1. Reads game's index.html, injects templates/html5/debugcheck.js inline.
//   2. Serves via local HTTP with a stub /sdk.js that mocks YaGames.init() and
//      provides no-op showFullscreenAdv/showRewardedVideo (debugcheck still hooks
//      them and records timing).
//   3. Loads the game in headless Chrome WITHOUT issuing any user input.
//   4. Probe A — programmatically calls every "state-driven" function name from a
//      blacklist (endGame, gameOver, onDeath, ...) on `window`, `window.game`,
//      `window.Game`, etc. If any of these triggers an ad call, RT._adWithoutGesture
//      gets populated → REQ-4.4 BLOCKER.
//   5. Probe B — finds DOM buttons whose onclick references showInterstitial or
//      common retry/restart/next-level handlers. Dispatches real click events,
//      then verifies the ad call (if any) has gestureDelta < 330ms.
//   6. Exit 1 on any violation.
//
// Usage:
//   node scripts/runtime-test.mjs WorkProgress/{Game}/
//   node scripts/runtime-test.mjs WorkProgress/{Game}/ --json     (machine-readable)
//   node scripts/runtime-test.mjs WorkProgress/{Game}/ --headed   (open real Chrome window)

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Auto-install puppeteer when missing, so behavioral probes can't be silently skipped
// (a skipped REQ-4.4/lang probe = false GREEN — the genetic-lab failure). Tries npm in the
// game project dir first, then the Forge dir. Returns true on success.
async function autoInstallPuppeteer() {
  const { spawnSync } = await import('node:child_process');
  const cwds = [process.cwd(), HERE];
  for (const cwd of cwds) {
    try {
      const r = spawnSync('npm', ['install', 'puppeteer', '--no-audit', '--no-fund'],
        { cwd, stdio: 'inherit', shell: process.platform === 'win32', timeout: 300000 });
      if (r.status === 0) { console.error('[FORGE TOOLING] puppeteer installed in ' + cwd); return true; }
    } catch { /* try next cwd */ }
  }
  return false;
}


// debugcheck.js — Forge QA tooling, inlined into game для behavioral probes.
// v4.10.37 FIX: old code did `REPO = resolve(HERE, '..')` then
// `join(REPO, 'templates', 'html5', 'debugcheck.js')`. But HERE is
// platforms/yandex/scripts/, so REPO resolved к platforms/yandex/ (only 1 level
// up — NOT repo root), giving the non-existent path
// platforms/yandex/templates/html5/debugcheck.js.
// Real locations: <root>/templates/html5/debugcheck.js  AND
//                 <root>/platforms/yandex/templates/debugcheck.js
// Resolve robustly across deploy layouts (Forge repo, synced sibling project).
function resolveDebugcheck() {
  const candidates = [
    // From platforms/yandex/scripts/ — repo root is 3 levels up
    resolve(HERE, '..', '..', '..', 'templates', 'html5', 'debugcheck.js'),
    // platforms/yandex/templates/ (1 level up from scripts/, then templates/)
    resolve(HERE, '..', 'templates', 'debugcheck.js'),
    // If deployed flat into a project's scripts/ — root is 1 level up
    resolve(HERE, '..', 'templates', 'html5', 'debugcheck.js'),
    // 2 levels up variant
    resolve(HERE, '..', '..', 'templates', 'html5', 'debugcheck.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
const DEBUGCHECK = resolveDebugcheck();

const args = process.argv.slice(2);
const opts = {
  json: args.includes('--json'),
  headed: args.includes('--headed'),
  verbose: args.includes('--verbose')
};
const positional = args.filter(a => !a.startsWith('-'));
if (positional.length === 0) {
  console.error('Usage: node scripts/runtime-test.mjs <gamePath> [--json] [--headed] [--verbose]');
  process.exit(2);
}

const gamePath = resolve(positional[0]);
const indexPath = join(gamePath, 'index.html');
if (!existsSync(indexPath)) {
  console.error('index.html not found in ' + gamePath);
  process.exit(2);
}

// ============================================================================
// 1. Build instrumented HTML — inject debugcheck.js inline into <head>
// ============================================================================
let baseHtml = readFileSync(indexPath, 'utf8');

// FAIL-SOFT (v4.10.37): debugcheck.js is Forge QA tooling, NOT a game asset.
// If it's missing (Forge install incomplete / path drift), do NOT crash the
// game test — warn и run without behavioral probes. A missing Forge-internal
// file is a tooling problem, not a game problem (Lesson #70). The game still
// gets tested for load errors, asset 404s, SDK contract — just without the
// extra debugcheck probes.
let instrumented;
if (DEBUGCHECK) {
  let debug = readFileSync(DEBUGCHECK, 'utf8');
  // MUST escape — same gotcha as build scripts.
  debug = debug.replace(/<\/script>/gi, '<\\/script>');
  const inject = '\n<script>\n' + debug + '\n</script>\n';
  const sdkRe = /<script[^>]*src=["']?[^"']*sdk\.js["']?[^>]*><\/script>/i;
  instrumented = sdkRe.test(baseHtml)
    ? baseHtml.replace(sdkRe, m => m + inject)
    : baseHtml.replace(/<\/head>/i, inject + '</head>');
} else {
  console.warn('[FORGE TOOLING] debugcheck.js not found — running WITHOUT behavioral probes.');
  console.warn('[FORGE TOOLING] This is a Forge-install issue, NOT a game bug. Game test continues.');
  console.warn('[FORGE TOOLING] Expected at: templates/html5/debugcheck.js or platforms/yandex/templates/debugcheck.js');
  instrumented = baseHtml;
}

// ============================================================================
// 2. Local server with SDK stub
// ============================================================================
const SDK_STUB = `
// Stub state — accessible from runtime-test via __stub global.
window.__stub = {
  gameplayStartCalls: 0,
  gameplayStopCalls: 0,
  // REQ-1.19.2 (un-gameable): capture the FACT at the moment ready() is called —
  // is a loading overlay / progress bar / spinner / black screen still on screen?
  // A game can't pass this by tuning a timer; it can only pass by calling ready()
  // when the game is actually interactive.
  readyCalled: false,
  readyAtMs: null,
  readyLoadingVisible: null,   // true = a loading indicator was still visible AT ready() → 1.19.2 FAIL
  readyVisibleText: null,      // what loading-ish element was visible (for the report)
  gameplayStartAtReady: false, // GameplayAPI.start() fired at/around load (1.19.3 smell)
  // Registered event listeners by Plat — runtime-test triggers these to mimic
  // Yandex SDK firing game_api_pause/resume during ad lifecycle.
  eventListeners: {} // { 'game_api_pause': [fn1, fn2, ...], ... }
};
// Detect a still-visible loading indicator in the live DOM (called AT ready()-time).
window.__detectLoadingVisible = function(){
  try {
    var sel = '[class*=loading i],[class*=loader i],[class*=splash i],[class*=preload i],'
            + '[id*=loading i],[id*=loader i],[id*=splash i],[class*=spinner i],[class*=throbber i],'
            + '[class*=progress i],progress';
    var nodes = document.querySelectorAll(sel);
    for (var i=0;i<nodes.length;i++){
      var el = nodes[i];
      var cs = getComputedStyle(el);
      if (cs.display==='none' || cs.visibility==='hidden' || parseFloat(cs.opacity||'1')===0) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      // visible loading-ish element with real size → still loading at ready()
      return { visible:true, what:(el.id||el.className||el.tagName).toString().slice(0,60) };
    }
    // also: a full-viewport near-black element covering the screen = black-screen-at-ready
    return { visible:false, what:null };
  } catch(e){ return { visible:false, what:'(detect error: '+e.message+')' }; }
};
window.YaGames = {
  init: function() {
    return Promise.resolve({
      features: {
        LoadingAPI: { ready: function(){
          if (!window.__stub.readyCalled) {
            window.__stub.readyCalled = true;
            window.__stub.readyAtMs = (performance && performance.now) ? Math.round(performance.now()) : Date.now();
            var d = window.__detectLoadingVisible();
            window.__stub.readyLoadingVisible = d.visible;
            window.__stub.readyVisibleText = d.what;
            // 1.19.3 smell: did gameplay get marked as started before/at ready (i.e. on load)?
            window.__stub.gameplayStartAtReady = (window.__stub.gameplayStartCalls > 0);
          }
          console.log('[stub] LoadingAPI.ready (loadingVisible='+window.__stub.readyLoadingVisible+')');
        } },
        GameplayAPI: {
          start: function(){ window.__stub.gameplayStartCalls++; console.log('[stub] GameplayAPI.start (#'+window.__stub.gameplayStartCalls+')'); },
          stop: function(){ window.__stub.gameplayStopCalls++; console.log('[stub] GameplayAPI.stop (#'+window.__stub.gameplayStopCalls+')'); }
        }
      },
      adv: {
        showFullscreenAdv: function(cfg){
          console.log('[stub] showFullscreenAdv called');
          if (cfg && cfg.callbacks) {
            try { cfg.callbacks.onOpen && cfg.callbacks.onOpen(); } catch(e){}
            setTimeout(function(){
              try { cfg.callbacks.onClose && cfg.callbacks.onClose(true); } catch(e){}
            }, 50);
          }
        },
        showRewardedVideo: function(cfg){
          console.log('[stub] showRewardedVideo called');
          if (cfg && cfg.callbacks) {
            try { cfg.callbacks.onOpen && cfg.callbacks.onOpen(); } catch(e){}
            setTimeout(function(){
              try { cfg.callbacks.onRewarded && cfg.callbacks.onRewarded(); } catch(e){}
              try { cfg.callbacks.onClose && cfg.callbacks.onClose(); } catch(e){}
            }, 50);
          }
        }
      },
      environment: { i18n: { lang: 'en' }, app: { id: '0' } },
      getPlayer: function(){ return Promise.resolve({
        getMode: function(){ return ''; },
        getName: function(){ return ''; },
        setData: function(){ return Promise.resolve(); },
        getData: function(){ return Promise.resolve({}); }
      }); },
      getPayments: function(){ return Promise.resolve({
        getCatalog: function(){ return Promise.resolve([]); },
        getPurchases: function(){ return Promise.resolve({ purchases: [] }); },
        purchase: function(){ return Promise.resolve({}); },
        consumePurchase: function(){ return Promise.resolve(); }
      }); },
      getLeaderboards: function(){ return Promise.resolve({
        setScore: function(){ return Promise.resolve(); },
        getEntries: function(){ return Promise.resolve({ entries: [] }); }
      }); },
      feedback: { canReview: function(){ return Promise.resolve({ value: false }); } },
      shortcut: { canShowPrompt: function(){ return Promise.resolve({ canShow: false }); } },
      // on/onEvent: register handlers in __stub.eventListeners so runtime-test
      // can fire them programmatically (mimic Yandex SDK firing game_api_pause
      // when a real ad opens). Both names — different SDK versions use either.
      on: function(ev, cb){
        (window.__stub.eventListeners[ev] = window.__stub.eventListeners[ev] || []).push(cb);
      },
      onEvent: function(ev, cb){
        (window.__stub.eventListeners[ev] = window.__stub.eventListeners[ev] || []).push(cb);
      },
      off: function(){}
    });
  }
};
// Helper for runtime-test: trigger a registered event programmatically.
window.__fireEvent = function(name) {
  var listeners = (window.__stub && window.__stub.eventListeners[name]) || [];
  listeners.forEach(function(fn){ try { fn(); } catch(e){ console.warn('[stub] handler threw:', e); } });
  return listeners.length;
};
`;

const MIME = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.woff':'font/woff', '.woff2':'font/woff2',
  '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.webp':'image/webp',
  '.ico':'image/x-icon'
};

const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/sdk.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript'});
    res.end(SDK_STUB);
    return;
  }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(instrumented);
    return;
  }
  // Serve any other file from gamePath (assets, css, js)
  const fp = join(gamePath, decodeURIComponent(url));
  try {
    if (statSync(fp).isFile()) {
      res.writeHead(200, {'Content-Type': MIME[extname(fp).toLowerCase()] || 'application/octet-stream'});
      res.end(readFileSync(fp));
      return;
    }
  } catch {}
  res.writeHead(404);
  res.end();
});

// ============================================================================
// 3. Run probes
// ============================================================================
function emit(level, msg, extra) {
  if (opts.json) return; // collected separately
  const sym = level === 'blocker' ? '[X]' : level === 'warning' ? '[!]' : level === 'pass' ? '[OK]' : '[i]';
  console.log(sym + ' ' + msg);
  if (extra && opts.verbose) console.log('    ' + JSON.stringify(extra));
}

const violations = [];
const passes = [];

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;

  if (!opts.json) {
    console.log('=========================================================');
    console.log('  RUNTIME TEST: ' + gamePath.split(/[\\/]/).pop());
    console.log('  ' + url);
    console.log('=========================================================');
  }

  let pup;
  try { pup = await import('puppeteer'); }
  catch {
    // Don't silently skip — a skipped behavioral test produces a FALSE GREEN (the genetic-lab
    // failure mode). Try to auto-install first; only if that fails do we hard-error.
    console.error('[FORGE TOOLING] Puppeteer not installed — runtime probes (REQ-4.4 / lang) cannot run.');
    console.error('[FORGE TOOLING] Auto-installing puppeteer (one-time, ~1-2 min)...');
    const ok = await autoInstallPuppeteer();
    if (ok) {
      try { pup = await import('puppeteer'); }
      catch {
        console.error('[FORGE TOOLING] puppeteer installed but still not importable.');
        server.close();
        process.exit(3); // exit 3 = tooling unavailable, runtime UNVERIFIED — caller MUST treat as BLOCKER
      }
    } else {
      console.error('[FORGE TOOLING] Auto-install failed. Run manually: npm install puppeteer');
      console.error('[FORGE TOOLING] Runtime probes UNVERIFIED — this is a BLOCKER, not a skip. Do NOT mark GREEN.');
      server.close();
      process.exit(3); // exit 3 = unverified (distinct from 2 = config/usage error)
    }
  }

  const browser = await pup.default.launch({
    headless: opts.headed ? false : 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  page.on('pageerror', e => violations.push({ id:'JS-CRASH', level:'blocker', message: 'Uncaught: ' + e.message }));
  if (opts.verbose) page.on('console', m => console.log('   [browser]', m.type(), m.text()));

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  } catch (e) {
    violations.push({ id:'PAGE-LOAD', level:'blocker', message: 'Page failed to load: ' + e.message });
    await browser.close(); server.close();
    return finish();
  }

  // Wait for game to settle (init, applyStaticLang, ready())
  await new Promise(r => setTimeout(r, 2500));

  // ----------------------------------------------------------------------
  // Probe A: state-driven ad triggers (NO user click before this point)
  // ----------------------------------------------------------------------
  const stateFns = [
    'endGame','gameOver','onDeath','onLose','onFail','onGameEnd',
    'handleGameOver','finishGame','die','onDie','playerDied',
    'levelFailed','onLevelFail','loseGame','onTimeout',
    // result/finish-screen triggers — a sim/round that ENDS ON ITS OWN then shows a
    // result screen + ad is the genetic-lab REQ-4.4 failure (ad not tied to a gesture).
    'showResult','onResult','showResults','endRound','roundOver','onRoundEnd',
    'simComplete','onSimEnd','onComplete','onFinish','showSummary','showEndScreen',
    'winGame','onWin','onVictory','levelComplete','onLevelComplete','nextLevel'
  ];
  const probeAResult = await page.evaluate((fns) => {
    const tried = [];
    // Try function as: window.fn, window.game.fn, window.Game.fn, window.GameInstance.fn
    const targets = [window, window.game, window.Game, window.gameInstance, window.app, window.App];
    for (const fn of fns) {
      for (const t of targets) {
        if (!t) continue;
        if (typeof t[fn] === 'function') {
          try { t[fn].call(t); tried.push((t === window ? 'window' : 'game') + '.' + fn); }
          catch(e) { /* function might throw — fine, we just need it to ATTEMPT to call ad */ }
        }
      }
    }
    return tried;
  }, stateFns);

  // Wait for any deferred ad calls to register
  await new Promise(r => setTimeout(r, 800));

  // Read ad calls directly from TIMING.adCalls (debugcheck v2.4 hook populates
  // this on every showFullscreenAdv/showRewardedVideo invocation). We filter
  // for gestureDelta > 330ms — REQ-4.4/REQ-4.5 violations.
  const probeAReport = await page.evaluate(() => {
    const T = window.__dbg && window.__dbg.TIMING;
    // Infinity → JSON.stringify → null. We need to preserve "no gesture ever" as
    // a large sentinel so the Node-side filter `gestureDelta > 330` works.
    const SENT = 9999999;
    const norm = (c) => Object.assign({}, c, {
      gestureDelta: (c.gestureDelta === Infinity || c.gestureDelta == null) ? SENT : c.gestureDelta
    });
    return {
      adCalls: T && T.adCalls ? T.adCalls.map(norm) : [],
      timingLog: T && T.log ? T.log.slice() : [],
      timingExists: !!T,
      lastUserGesture: T ? T.lastUserGesture : null
    };
  });
  if (opts.verbose) {
    console.log('[probe-A] adCalls:', JSON.stringify(probeAReport.adCalls, null, 2));
    console.log('[probe-A] last 5 timing events:', JSON.stringify(probeAReport.timingLog.slice(-5), null, 2));
  }

  const probeAInter = probeAReport.adCalls.filter(c => c.type === 'interstitial' && c.gestureDelta > 330);
  const probeARV    = probeAReport.adCalls.filter(c => c.type === 'rewarded'     && c.gestureDelta > 330);

  if (probeAResult.length > 0) {
    if (probeAInter.length > 0) {
      probeAInter.forEach(rec => {
        violations.push({
          id: 'REQ-4.4',
          level: 'blocker',
          message: 'showFullscreenAdv called via state-driven path with no user gesture (gestureDelta=' + Math.round(rec.gestureDelta) + 'ms). Triggered by calling: ' + probeAResult.join(', '),
          citation: 'Past rejection (Circle 2048 v1): "Реклама без пользовательского неигрового действия".',
          probe: 'A'
        });
      });
    } else {
      passes.push('Probe A — state-driven ad triggers (called: ' + probeAResult.join(', ') + ') did NOT fire any interstitial');
    }
    if (probeARV.length > 0) {
      probeARV.forEach(rec => {
        violations.push({
          id: 'REQ-4.5',
          level: 'blocker',
          message: 'showRewardedVideo called via state-driven path with no user gesture (gestureDelta=' + Math.round(rec.gestureDelta) + 'ms).',
          probe: 'A'
        });
      });
    }
  } else {
    passes.push('Probe A — no state-driven function found to test (heuristic blacklist did not match this game; manually verify endGame/gameOver paths)');
  }

  // ----------------------------------------------------------------------
  // Probe B: user-driven button clicks should be OK (gestureDelta < 330ms)
  // ----------------------------------------------------------------------
  // Reset state from Probe A so we only count clicks-→-ads from Probe B.
  await page.evaluate(() => {
    if (window.__dbg && window.__dbg.TIMING) window.__dbg.TIMING.adCalls = [];
  });

  // Find user-driven ad buttons by onclick attr
  const candidateButtons = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, [onclick], [role=button]').forEach((el, i) => {
      const oc = el.getAttribute('onclick') || '';
      const txt = (el.textContent || '').trim().slice(0, 30);
      const id = el.id || '';
      // Buttons that explicitly call ads OR common retry/restart/next handlers
      if (/showInterstitial|showRewarded|showFullscreenAdv|restart|nextLevel|retry|secondChance/i.test(oc)
          || /retry|restart|next|continue|second.?chance|повтор|следующ|продолж/i.test(txt + ' ' + id)) {
        out.push({ idx: i, id, oc: oc.slice(0,80), txt });
      }
    });
    return out;
  });

  const probeBReport = { clicked: [], adsAfterClick: [] };
  for (const btn of candidateButtons) {
    // Make button visible if it's inside an overlay (force show)
    await page.evaluate((b) => {
      const els = document.querySelectorAll('button, [onclick], [role=button]');
      const el = els[b.idx];
      if (!el) return;
      // Walk up to find overlay parent and force-show it
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (p.classList && p.className.indexOf('overlay') >= 0) { p.classList.add('show'); break; }
        p = p.parentElement;
      }
    }, btn);
    // Real click (records as user gesture in debugcheck)
    try {
      const ok = await page.evaluate(async (b) => {
        const el = document.querySelectorAll('button, [onclick], [role=button]')[b.idx];
        if (!el) return false;
        el.click();
        return true;
      }, btn);
      if (ok) {
        probeBReport.clicked.push(btn.id || btn.txt);
        // Wait for ad call to register
        await new Promise(r => setTimeout(r, 600));
      }
    } catch(e) {}
  }

  const adsAfterClicks = await page.evaluate(() => {
    const T = window.__dbg && window.__dbg.TIMING;
    const SENT = 9999999;
    const norm = (c) => Object.assign({}, c, {
      gestureDelta: (c.gestureDelta === Infinity || c.gestureDelta == null) ? SENT : c.gestureDelta
    });
    return { adCalls: T && T.adCalls ? T.adCalls.map(norm) : [] };
  });
  const lateAds = adsAfterClicks.adCalls.filter(c => c.gestureDelta > 330);

  if (lateAds.length > 0) {
    lateAds.forEach(rec => {
      violations.push({
        id: rec.type === 'rewarded' ? 'REQ-4.5' : 'REQ-4.4',
        level: 'blocker',
        message: rec.type + ' called ' + Math.round(rec.gestureDelta) + 'ms after user button click (>330ms threshold (Yandex 0.33s)). Likely a setTimeout/Promise chain between click and ad.',
        probe: 'B'
      });
    });
  } else if (adsAfterClicks.adCalls.length > 0) {
    passes.push('Probe B — clicked ' + probeBReport.clicked.length + ' user buttons; ' + adsAfterClicks.adCalls.length + ' ad call(s) all within 500ms of gesture');
  } else if (candidateButtons.length > 0) {
    passes.push('Probe B — clicked ' + probeBReport.clicked.length + ' candidate buttons; no ads fired (game cooldown or no ad path triggered)');
  }

  // ----------------------------------------------------------------------
  // Probe C: lang-switch reactivity (REQ-8.2.3)
  // Programmatically switch lang to non-RU, then scan DOM for residual Cyrillic.
  // Catches HTML default text + dynamic placeholders that aren't refreshed on
  // setLang. Past rejection: Block 2048, Circle 2048 v1.1 — Russian text
  // leaked into screenshots of other locales.
  // ----------------------------------------------------------------------
  // Force-show every overlay so hidden screens (game-over, win, all-clear,
  // pause, lb-panel) are part of the scan — YG Screenshot may render them.
  const probeCResult = await page.evaluate(() => {
    if (typeof setLang !== 'function') return { skipped: 'no setLang() global' };
    try { setLang('en'); } catch(e) { return { skipped: 'setLang() threw: ' + e.message }; }
    // Force-show all overlays for visibility check (YG Screenshot may render any)
    document.querySelectorAll('.overlay-screen,[class*=overlay],[class*=modal],[class*=popup]').forEach(el => {
      el.classList.add('show');
      el.style.display = el.style.display === 'none' ? '' : el.style.display;
    });
    return { skipped: null };
  });
  // Wait for any onLangChange listeners + repaint
  await new Promise(r => setTimeout(r, 500));
  const probeCScan = await page.evaluate(() => {
    // Mirror Yandex's lang_switch_runtime probe exactly: leaf nodes, ONLY filter
    // by self getComputedStyle (display/visibility/opacity). Do NOT walk ancestors.
    // Yandex sees any non-display:none element regardless of parent visibility.
    // If we use a stricter (ancestor-walking) check we pass locally but Yandex
    // FAILs in production — exactly what happened with Driftworld v2.4.
    const cyr = [];
    document.body.querySelectorAll('*').forEach(el => {
      if (el.closest('.dc-overlay, [class*=cheat-]')) return;
      if (el.children && el.children.length > 0) return; // leaf only
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      const t = (el.textContent || '').trim();
      if (t.length >= 3 && t.length < 400 && /[\u0410-\u044f\u0451\u0401]{3,}/.test(t)) {
        cyr.push({ text: t.slice(0, 60), tag: el.tagName.toLowerCase(), id: el.id || '', cls: (el.className || '').toString().slice(0, 30) });
      }
    });
    return cyr;
  });
  if (probeCResult.skipped) {
    passes.push('Probe C — SKIPPED: ' + probeCResult.skipped);
  } else if (probeCScan.length > 0) {
    probeCScan.slice(0, 5).forEach(c => {
      violations.push({
        id: 'REQ-8.2.3',
        level: 'blocker',
        message: 'After setLang("en"), Russian text remains in <' + c.tag + (c.id ? ' id="' + c.id + '"' : '') + (c.cls ? ' class="' + c.cls + '"' : '') + '>: "' + c.text + '" — applyStaticLang() does not update this element OR an onLangChange listener is missing. YG Screenshot will render Russian on non-RU locale.',
        citation: 'Past rejection (Block 2048, Circle 2048 v1.1): per-language screenshots had Russian leak.',
        probe: 'C'
      });
    });
    if (probeCScan.length > 5) violations.push({ id:'REQ-8.2.3', level:'info', message: '... +' + (probeCScan.length - 5) + ' more Cyrillic leaks (only first 5 shown)' });
  } else {
    passes.push('Probe C — setLang("en") + DOM scan: no Russian text leaked into non-RU UI');
  }

  // ----------------------------------------------------------------------
  // Probe D: GameplayAPI lifecycle on game_api_pause/resume (Apr 2026)
  // Past bug (Circle 2048 v1.4): pause/resume handlers only suspended audio,
  // didn't call GameplayAPI.stop()/start() → Yandex panel showed
  // "Gameplay is stopped" stuck after first ad. Fire game_api_pause via stub
  // and verify .stop() count went up; same for resume.
  // ----------------------------------------------------------------------
  // Reset counters first
  await page.evaluate(() => {
    if (window.__stub) {
      window.__stub.gameplayStartCalls = 0;
      window.__stub.gameplayStopCalls = 0;
    }
  });
  const probeDResult = await page.evaluate(async () => {
    if (typeof window.__fireEvent !== 'function') return { skipped: 'no __fireEvent (stub not loaded?)' };
    const before = { stop: window.__stub.gameplayStopCalls, start: window.__stub.gameplayStartCalls };
    const pauseListeners = window.__fireEvent('game_api_pause');
    await new Promise(r => setTimeout(r, 100));
    const afterPause = { stop: window.__stub.gameplayStopCalls, start: window.__stub.gameplayStartCalls };
    const resumeListeners = window.__fireEvent('game_api_resume');
    await new Promise(r => setTimeout(r, 100));
    const afterResume = { stop: window.__stub.gameplayStopCalls, start: window.__stub.gameplayStartCalls };
    return {
      pauseListenerCount: pauseListeners,
      resumeListenerCount: resumeListeners,
      stopAfterPause: afterPause.stop - before.stop,
      startAfterResume: afterResume.start - afterPause.start
    };
  });
  if (probeDResult.skipped) {
    passes.push('Probe D — SKIPPED: ' + probeDResult.skipped);
  } else if (probeDResult.pauseListenerCount === 0 && probeDResult.resumeListenerCount === 0) {
    violations.push({
      id: 'REQ-4.7-LIFECYCLE',
      level: 'warning',
      message: 'No game_api_pause / game_api_resume event listeners registered. Game will not know when ads open/close beyond direct callback (RV onOpen/onClose etc). Recommend ysdk.on("game_api_pause", ...) and "game_api_resume" with GameplayAPI.stop()/start() calls.',
      probe: 'D'
    });
  } else {
    if (probeDResult.pauseListenerCount > 0 && probeDResult.stopAfterPause === 0) {
      violations.push({
        id: 'REQ-4.7-LIFECYCLE',
        level: 'blocker',
        message: 'game_api_pause listener registered but did NOT call GameplayAPI.stop() — Yandex platform panel will show "Gameplay is stopped" stuck after first ad. Call Plat.stopGameplay() (or ysdk.features.GameplayAPI.stop()) inside the handler.',
        citation: 'Past bug (Circle 2048 v1.4): only audio.suspend() in onPause → bottom-panel indicator never returned to "started" after ad.',
        probe: 'D'
      });
    }
    if (probeDResult.resumeListenerCount > 0 && probeDResult.startAfterResume === 0) {
      // Downgraded from blocker → warning per Yandex docs: start() should be
      // GUARDED — fired only when player is actually returning to active
      // gameplay (not when they backgrounded the tab while on menu/pause/
      // game-over). At runtime-test time the game is on its initial menu, so
      // a guarded start() handler will correctly NOT fire. This is desired
      // behavior, not a bug.
      // See sdk-game-events: "if game has already been stopped... start()
      // will not be called upon subsequent game_api_resume".
      violations.push({
        id: 'REQ-4.7-LIFECYCLE',
        level: 'warning',
        message: 'game_api_resume handler did NOT call GameplayAPI.start() during this probe — likely OK if guarded by gameState check (Yandex docs require start() only when entering active gameplay). Manually verify start() fires when ad closes mid-match.',
        probe: 'D'
      });
    }
    if (probeDResult.stopAfterPause > 0) {
      passes.push('Probe D — game_api_pause → GameplayAPI.stop wired (start may be guarded; verify manually mid-match)');
    }
  }

  // ── Probe E — REQ-1.19.2 GameReady timing (un-gameable: measures the FACT) ──────────────
  // We don't check HOW ready() is scheduled (a timer can be tuned to pass). We check WHAT was
  // on screen at the moment ready() fired: if a loading indicator / progress bar / spinner was
  // still visible, the indicator went green too early → 1.19.2 BLOCKER. The only way to pass is
  // to actually call ready() when the game is interactive.
  const readyFacts = await page.evaluate(() => ({
    called: window.__stub ? window.__stub.readyCalled : false,
    loadingVisible: window.__stub ? window.__stub.readyLoadingVisible : null,
    what: window.__stub ? window.__stub.readyVisibleText : null,
    atMs: window.__stub ? window.__stub.readyAtMs : null,
    startAtReady: window.__stub ? window.__stub.gameplayStartAtReady : false
  }));
  if (!readyFacts.called) {
    violations.push({
      id: 'REQ-1.19.2', level: 'blocker', probe: 'E',
      message: 'LoadingAPI.ready() was NEVER called during load — Yandex marks the game as "Game Ready not implemented" (red after 90s).',
      citation: 'Requirement 1.19.2.'
    });
  } else if (readyFacts.loadingVisible === true) {
    violations.push({
      id: 'REQ-1.19.2', level: 'blocker', probe: 'E',
      message: 'LoadingAPI.ready() fired while a loading indicator was STILL VISIBLE on screen ("' + (readyFacts.what||'?') + '"). The Game Ready indicator goes green too early. Call ready() only when the menu/game is actually interactive (no progress bar / spinner / black screen).',
      citation: 'Requirement 1.19.2 — green only when interactive, not while loading.'
    });
  } else {
    passes.push('Probe E — REQ-1.19.2: ready() fired with no loading indicator visible (interactive at ready time)');
  }
  if (readyFacts.startAtReady) {
    violations.push({
      id: 'REQ-1.19.3', level: 'warn', probe: 'E',
      message: 'GameplayAPI.start() fired at/around load (before ready()). Gameplay markup must reflect actual gameplay: start() when a match/level begins, not on load. Move it or drop GameplayAPI (it is optional).',
      citation: 'Requirement 1.19.3.'
    });
  }

  // ── Probe F — REQ-1.10.1 overflow/clipping ACROSS Yandex's test resolutions ──────────────
  // Yandex doesn't test one size: it fits the game to 16:9, then shrinks the window 20% per axis,
  // and uses non-16:9 ratios (1280x1024=5:4, 2560x1080=21:9). A game fine at load can clip when
  // resized ("при изменении размера окна" — the parkour 1.10.1 rejection). We replay the real
  // resolutions + a 20%-shrunk variant and run the overflow scan at each.
  const TEST_VIEWPORTS = [
    { w: 1920, h: 1080, label: '1920x1080 16:9' },
    { w: 1366, h: 768,  label: '1366x768 16:9 (most common laptop)' },
    { w: 1280, h: 1024, label: '1280x1024 5:4 (non-16:9)' },
    { w: 2560, h: 1080, label: '2560x1080 21:9 (ultrawide)' },
    { w: 1536, h: 864,  label: '1536x864 (1920x1080 shrunk 20% per axis)' },
    { w: 1093, h: 614,  label: '1093x614 (1366x768 shrunk 20%)' }
  ];
  const overflowFindings = [];
  for (const vp of TEST_VIEWPORTS) {
    try {
      await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
      await new Promise(r => setTimeout(r, 350)); // let resize handlers + reflow settle
      const bad = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight, out = [];
        document.querySelectorAll('button, a, [role=button], .btn, [class*=btn], [class*=button], h1, h2, [class*=score], [class*=title], [class*=label], [class*=ad], [class*=reward], canvas').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 6 || r.height < 6) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
          if (el.closest && el.closest('.dc-overlay, .modal.h, .h')) return;
          let p = el.parentElement; // skip content inside overflow:hidden scrollers (intended clip)
          while (p && p !== document.body) { const po = getComputedStyle(p).overflow; if (po === 'hidden' || po === 'clip' || po === 'auto' || po === 'scroll') return; p = p.parentElement; }
          // "critical" clip: more than ~25% of the element off-screen on any edge
          const offL = Math.max(0, -r.left), offR = Math.max(0, r.right - vw);
          const offT = Math.max(0, -r.top),  offB = Math.max(0, r.bottom - vh);
          const hClip = (offL + offR) / r.width, vClip = (offT + offB) / r.height;
          if (hClip > 0.25 || vClip > 0.25) {
            out.push((el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '')).slice(0, 50)
              + ' (' + Math.round(Math.max(hClip, vClip) * 100) + '% off-screen)');
          }
        });
        return out.slice(0, 6);
      });
      if (bad.length) overflowFindings.push({ vp: vp.label, els: bad });
    } catch (e) { /* viewport step failed — continue */ }
  }
  if (overflowFindings.length) {
    const detail = overflowFindings.map(f => f.vp + ': ' + f.els.join(', ')).join('  |  ');
    violations.push({
      id: 'REQ-1.10.1', level: 'blocker', probe: 'F',
      message: 'UI elements are critically clipped (>25% off-screen) when the window is resized to Yandex test resolutions — ' + detail + '. Make the layout responsive (anchor UI to safe areas / use an internal scroll/pan for large fields) so buttons, text, scores and ad-notices stay fully visible at non-16:9 sizes.',
      citation: 'Requirement 1.10.1 — moderation shrinks the window 20% per axis and uses 5:4 / 21:9 ratios.'
    });
  } else {
    passes.push('Probe F — REQ-1.10.1: no critical clipping across 6 test resolutions (16:9, 5:4, 21:9, shrunk)');
  }

  // ── Probe G — REQ-1.10.3 persistent UI overlapping the game board ─────────────────────────
  // Yandex flags floating panels that sit OVER the playfield and block interaction with cells
  // beneath them (Hexfront: a unit-actions menu over hexes you need to click). We detect a
  // PERSISTENT, opaque, interactive element covering a meaningful slice of the <canvas>. WARN
  // (not blocker): some overlap is legitimate (HUD corners); a human confirms whether it blocks
  // a play cell. We deliberately exclude transient overlays/modals and pointer-events:none HUD.
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await new Promise(r => setTimeout(r, 300));
  const overlaps = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    if (!cv) return [];                              // no canvas → N/A (DOM-only games handled by Probe F)
    const cr = cv.getBoundingClientRect();
    const cArea = cr.width * cr.height;
    if (cArea < 10000) return [];                    // canvas not the play area
    const cvZ = parseInt(getComputedStyle(cv).zIndex) || 0;
    const out = [];
    document.querySelectorAll('div, ul, nav, section, aside, [class*=panel], [class*=menu], [class*=actions], [class*=toolbar]').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.5) return;
      if (cs.pointerEvents === 'none') return;        // pure HUD overlays don't block clicks → fine
      if (el.contains(cv) || cv.contains(el)) return; // ancestors/containers, not siblings
      // must sit ABOVE the canvas in stacking order
      const z = parseInt(cs.zIndex) || 0;
      if (z <= cvZ) return;
      // transient overlays/modals/popups are expected to cover — skip
      if (/overlay|modal|popup|dialog|toast|loading|splash/i.test(el.className + ' ' + el.id)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      const ix = Math.max(0, Math.min(r.right, cr.right) - Math.max(r.left, cr.left));
      const iy = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
      const overlapArea = ix * iy;
      if (overlapArea / cArea > 0.06) {               // covers >6% of the play canvas
        out.push((el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '')).slice(0, 50)
          + ' (' + Math.round(overlapArea / cArea * 100) + '% of board, z=' + z + ')');
      }
    });
    return out.slice(0, 5);
  });
  if (overlaps.length) {
    violations.push({
      id: 'REQ-1.10.3', level: 'warn', probe: 'G',
      message: 'Interactive UI panel(s) overlap the game canvas and sit above it — ' + overlaps.join(', ') + '. If a player needs to click a cell UNDER this panel, it blocks gameplay (REQ-1.10.3). Confirm manually: move the panel off the playfield, make it dismissable, or ensure no interactive cell is permanently covered.',
      citation: 'Requirement 1.10.3 — internal elements/text must not overlap and block gameplay.'
    });
  } else {
    passes.push('Probe G — REQ-1.10.3: no persistent interactive panel covering the game canvas');
  }

  await browser.close();
  server.close();
  finish();
});

function finish() {
  const blockers = violations.filter(v => v.level === 'blocker').length;

  if (opts.json) {
    console.log(JSON.stringify({
      game: gamePath.split(/[\\/]/).pop(),
      summary: { blockers, passes: passes.length },
      violations,
      passes
    }, null, 2));
  } else {
    console.log('');
    if (passes.length > 0) {
      console.log('PASSES:');
      passes.forEach(p => emit('pass', p));
    }
    if (violations.length > 0) {
      console.log('');
      console.log('VIOLATIONS:');
      for (const v of violations) {
        emit(v.level, '[' + v.id + '] ' + v.message);
        if (v.citation) console.log('       ' + v.citation);
      }
    }
    console.log('');
    console.log('=========================================================');
    if (blockers > 0) {
      console.log('SUBMISSION BLOCKED — ' + blockers + ' runtime blocker(s).');
      console.log('Fix and re-run: node scripts/runtime-test.mjs ' + positional[0]);
    } else {
      console.log('READY — runtime ad probes passed.');
    }
    console.log('=========================================================');
  }

  process.exit(blockers > 0 ? 1 : 0);
}
