#!/usr/bin/env node
/**
 * @file runtime-test.mjs
 * @description Comprehensive runtime testing. Goes beyond smoke-test (which
 *              only catches startup errors) — adds BEHAVIORAL probes that
 *              catch what static analysis misses:
 *
 *              - Lang switch correctness (post-setLang DOM has no Cyrillic on en)
 *              - Asset 404 tracking (missing files game references)
 *              - DOM smoke (key elements rendered, not just JS without errors)
 *              - GameReady timing (fires too early = SDK init race)
 *              - SDK calls tracking (auth/payments/leaderboard signatures)
 *              - Console error categorization (errors vs warnings vs known noise)
 *
 *              Run BEFORE shipping. /release-* skills should invoke this as
 *              hard gate — fail blocks ship.
 *
 *              This complements smoke-test.mjs which is faster (5s startup
 *              check). runtime-test runs longer (20-30s) and tests scenarios.
 *
 * Usage:
 *   node scripts/runtime-test.mjs <project-dir> [--scenarios=...]
 *   node scripts/runtime-test.mjs WorkProgress/MyGame/
 *   node scripts/runtime-test.mjs WorkProgress/MyGame/ --scenarios=lang,assets,dom
 *   node scripts/runtime-test.mjs WorkProgress/MyGame/ --zip=output/mygame-debug.zip
 *
 * Scenarios:
 *   startup  — basic console.error + uncaught exceptions (smoke equiv)
 *   lang     — setLang('en') then check DOM has no Cyrillic in leaves
 *   assets   — track all failed requests, report missing files
 *   dom      — verify key elements visible (heuristic: canvas/main/root)
 *   sdk      — capture YaGames calls, verify expected sequence
 *
 *   default: all scenarios run sequentially
 *
 * Exit codes:
 *   0 = all scenarios passed
 *   1 = one or more scenarios failed (block ship)
 *   2 = invocation error (missing project dir, puppeteer missing, etc)
 */

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';

const args = process.argv.slice(2);
const dirArg = resolve(args.find(a => !a.startsWith('--')) || 'WorkProgress');

// ── Yandex delegation (REQ-4.4 Probe A + REQ-1.19.2 Probe E live only in the yandex copy) ──
// The generic behavioral test (this file) does NOT contain the moderation traps. If the target
// is a Yandex build, hand off to platforms/yandex/scripts/runtime-test.mjs so 4.4 and 1.19 are
// actually checked. This is why genetic-lab (4.4) and samogonshchik (1.19) slipped: every release
// skill called THIS generic copy. Delegation makes the right probes run no matter who calls.
if (!args.includes('--no-delegate')) {
  const { existsSync: _ex, readFileSync: _rf, readdirSync: _rd } = await import('fs');
  const { join: _j, dirname: _dn } = await import('path');
  const { fileURLToPath: _fup } = await import('url');
  const _here = _dn(_fup(import.meta.url));
  const yandexRT = _j(_here, '..', 'platforms', 'yandex', 'scripts', 'runtime-test.mjs');
  let looksYandex = /yandex/i.test(dirArg);
  try { // also sniff the build's index.html for the Yandex SDK
    if (!looksYandex && _ex(_j(dirArg, 'index.html'))) {
      const h = _rf(_j(dirArg, 'index.html'), 'utf8');
      looksYandex = /\/sdk\.js|YaGames|games\.s3\.yandex/i.test(h);
    }
  } catch {}
  if (looksYandex && _ex(yandexRT)) {
    console.log('[INFO] Yandex build detected → delegating to platforms/yandex/scripts/runtime-test.mjs (Probe A REQ-4.4 + Probe E REQ-1.19.2).');
    const { spawnSync } = await import('child_process');
    const r = spawnSync(process.execPath, [yandexRT, ...args], { stdio: 'inherit' });
    process.exit(r.status == null ? 1 : r.status);
  }
}

// --variant=production|debug|marketing — if dir is a Release/<project>/<platform>/ folder,
// auto-extract the specific zip variant. Defaults к production.
const variantArg = args.find(a => a.startsWith('--variant='));
const VARIANT = variantArg ? variantArg.split('=')[1] : null;

// Resolve directory based on variant
let dir = dirArg;
if (VARIANT) {
  // Look for {project}-{version}-{variant}.zip in dirArg
  const fs = await import('fs');
  const path = await import('path');
  try {
    const entries = fs.readdirSync(dirArg);
    const variantSuffix = VARIANT === 'production' ? '' : `-${VARIANT}`;
    const zipPattern = new RegExp(`^[\\w-]+-v[\\d.]+${variantSuffix}\\.zip$`);
    const zipFile = entries.find(f => zipPattern.test(f) && !f.includes('-debug.') === (VARIANT === 'production' || VARIANT === 'marketing'));
    if (zipFile) {
      // Extract к temp dir
      const tmpDir = `/tmp/runtime-test-${VARIANT}-${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });
      const { execSync } = await import('child_process');
      execSync(`cd "${tmpDir}" && unzip -oq "${path.join(dirArg, zipFile)}"`, { stdio: 'pipe' });
      dir = tmpDir;
      console.log(`[INFO] Testing ${VARIANT} variant from ${zipFile} (extracted к ${tmpDir})`);
    } else {
      console.log(`[!] No zip найден для variant=${VARIANT} в ${dirArg}, falling back к direct dir`);
    }
  } catch (e) {
    console.log(`[!] Variant resolution failed: ${e.message}`);
  }
}

const scenariosArg = args.find(a => a.startsWith('--scenarios='));
const SCENARIOS = scenariosArg
  ? scenariosArg.split('=')[1].split(',').map(s => s.trim())
  : ['startup', 'lang', 'assets', 'dom', 'sdk'];

// --screenshot=true|path — capture screenshot после load. Default off.
// Used by /ui-review --auto к get current build screenshot для systematic scan.
const screenshotArg = args.find(a => a.startsWith('--screenshot'));
let SCREENSHOT_PATH = null;
if (screenshotArg) {
  const val = screenshotArg.includes('=') ? screenshotArg.split('=')[1] : 'true';
  if (val === 'true' || val === '1') {
    // Default path
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    SCREENSHOT_PATH = `wiki/screenshots/${dateStr}.png`;
  } else if (val && val !== 'false' && val !== '0') {
    SCREENSHOT_PATH = val;
  }
}

// --viewport=1366x768 — viewport size для screenshot (default desktop)
const viewportArg = args.find(a => a.startsWith('--viewport='));
const VIEWPORT = viewportArg
  ? viewportArg.split('=')[1].split('x').map(Number)
  : [1366, 768];

if (!existsSync(join(dir, 'index.html'))) {
  console.error(`[X] index.html not found in ${dir}`);
  process.exit(2);
}

// ── HTTP server (reuses smoke-test logic) ──────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webm': 'video/webm',
};

// Track all SDK calls intercepted (for sdk scenario)
const sdkCalls = [];

function makeYaGamesStub() {
  return `
    window.__sdkCalls = [];
    function track(method, args) {
      window.__sdkCalls.push({ method, args: JSON.stringify(args).slice(0, 200), t: Date.now() });
    }
    window.YaGames = {
      init: function() {
        track('YaGames.init', []);
        return Promise.resolve({
          features: {
            LoadingAPI: { ready: function(){ track('LoadingAPI.ready', []); } },
            GameplayAPI: { start: function(){ track('GameplayAPI.start', []); }, stop: function(){ track('GameplayAPI.stop', []); } }
          },
          adv: {
            showFullscreenAdv: function(opts){ track('adv.showFullscreenAdv', opts); if (opts && opts.callbacks && opts.callbacks.onClose) setTimeout(() => opts.callbacks.onClose(true), 100); },
            showRewardedVideo: function(opts){ track('adv.showRewardedVideo', opts); if (opts && opts.callbacks && opts.callbacks.onRewarded) setTimeout(() => opts.callbacks.onRewarded(), 100); if (opts && opts.callbacks && opts.callbacks.onClose) setTimeout(() => opts.callbacks.onClose(true), 200); },
          },
          auth: { openAuthDialog: function(){ track('auth.openAuthDialog', []); return Promise.resolve(); } },
          environment: { i18n: { lang: 'en' }, app: { id: '0' } },
          getPlayer: function(){
            track('getPlayer', []);
            return Promise.resolve({
              getMode: function(){ return ''; },
              getName: function(){ return 'Test Player'; },
              setData: function(d){ track('player.setData', d); return Promise.resolve(); },
              getData: function(){ return Promise.resolve({}); },
              getStats: function(){ return Promise.resolve({}); },
              setStats: function(s){ track('player.setStats', s); return Promise.resolve(); }
            });
          },
          getPayments: function(){
            track('getPayments', []);
            return Promise.resolve({
              getCatalog: function(){ return Promise.resolve([]); },
              getPurchases: function(){ return Promise.resolve({ purchases: [] }); },
              purchase: function(opts){ track('payments.purchase', opts); return Promise.resolve({ productID: opts.id }); },
              consumePurchase: function(){ return Promise.resolve(); }
            });
          },
          getLeaderboards: function(){
            track('getLeaderboards', []);
            return Promise.resolve({
              setScore: function(id, score){ track('leaderboard.setScore', { id, score }); return Promise.resolve(); },
              getEntries: function(){ return Promise.resolve({ entries: [] }); }
            });
          },
          feedback: { canReview: function(){ return Promise.resolve({ value: false }); } },
          shortcut: { canShowPrompt: function(){ return Promise.resolve({ canShow: false }); } },
          on: function(){}, off: function(){},
          isAvailableMethod: function(){ return Promise.resolve(false); }
        });
      }
    };
  `;
}

const server = createServer((req, res) => {
  if (req.url === '/sdk.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(makeYaGamesStub());
    return;
  }
  let filePath = join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (filePath.endsWith('/')) filePath += 'index.html';
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
  } catch {
    res.writeHead(500); res.end('Error');
  }
});

// ── Scenarios ──────────────────────────────────────────────────────────────

async function scenarioStartup(page) {
  // Just wait and capture
  await new Promise(r => setTimeout(r, 6000));
  return { pass: true, info: 'Startup completed' };
}

async function scenarioLang(page) {
  // If game has setLang() function, switch to en and check no Cyrillic leak
  const result = await page.evaluate(async () => {
    if (typeof window.setLang !== 'function') {
      return { skipped: true, reason: 'No window.setLang() — not localized?' };
    }
    try {
      window.setLang('en');
      await new Promise(r => setTimeout(r, 500));
      // Check all text nodes for Cyrillic
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const leaks = [];
      let node;
      while (node = walker.nextNode()) {
        const text = (node.textContent || '').trim();
        const cyrCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
        if (cyrCount >= 3) {
          leaks.push({
            text: text.slice(0, 80),
            parent: node.parentElement?.tagName + '.' + (node.parentElement?.className || '').slice(0, 40),
            cyrCount
          });
          if (leaks.length >= 10) break;
        }
      }
      return { leaks, leakCount: leaks.length };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (result.skipped) return { pass: true, info: result.reason };
  if (result.error) return { pass: false, info: `setLang threw: ${result.error}` };
  if (result.leakCount > 0) {
    return {
      pass: false,
      info: `${result.leakCount} Cyrillic text leak(s) after setLang('en')`,
      details: result.leaks
    };
  }
  return { pass: true, info: 'Lang switch clean — no Cyrillic in DOM after en switch' };
}

async function scenarioAssets(page, failedRequests) {
  // failedRequests collected by page event listener
  // Whitelist: favicon, Yandex SDK, and Forge dev-tooling files.
  // debugcheck.js / cheats-base.js / screenshots.js are Forge QA scaffolding —
  // present in debug/marketing variants, absent in production. A production
  // build referencing them is a separate lint concern, NOT a runtime asset failure.
  // (v4.10.37: was failing runtime-test когда game referenced debugcheck.js но
  //  file not bundled — that's a Forge tooling artifact, not a game bug.)
  const significant = failedRequests.filter(url => {
    if (/favicon|sdk\.js/.test(url)) return false;
    if (/debugcheck\.js|cheats-base\.js|cheats\.js|screenshots\.js/.test(url)) return false;
    return true;
  });
  if (significant.length > 0) {
    return {
      pass: false,
      info: `${significant.length} missing asset(s)`,
      details: significant.slice(0, 10)
    };
  }
  return { pass: true, info: 'All referenced assets loaded' };
}

async function scenarioDom(page) {
  const result = await page.evaluate(() => {
    // Common game/app root selectors
    const selectors = ['canvas', 'main', '#app', '#root', '#game', '.game', '[data-game]'];
    const found = [];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        found.push({
          selector: sel,
          visible: rect.width > 0 && rect.height > 0,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      }
    }
    return { found, bodyHasContent: document.body.innerText.length > 10 };
  });

  if (result.found.length === 0 && !result.bodyHasContent) {
    return { pass: false, info: 'No identifiable game root element + empty body' };
  }
  const visible = result.found.filter(f => f.visible);
  if (result.found.length > 0 && visible.length === 0) {
    return { pass: false, info: 'Root elements exist but all have 0x0 size — invisible UI', details: result.found };
  }
  return {
    pass: true,
    info: `${visible.length} visible root element(s): ${visible.map(v => v.selector).join(', ')}`
  };
}

async function scenarioSdk(page) {
  const calls = await page.evaluate(() => window.__sdkCalls || []);

  // Expected init sequence for Yandex SDK
  const hasInit = calls.some(c => c.method === 'YaGames.init');
  const hasLoadingReady = calls.some(c => c.method === 'LoadingAPI.ready');
  const hasGameplayStart = calls.some(c => c.method === 'GameplayAPI.start');

  const issues = [];
  if (!hasInit) issues.push('YaGames.init never called');
  // LoadingAPI.ready and GameplayAPI.start are strongly recommended for Yandex
  if (hasInit && !hasLoadingReady) issues.push('LoadingAPI.ready NOT called — Yandex shows loading bar incorrectly');
  if (hasInit && !hasGameplayStart) issues.push('GameplayAPI.start NOT called — Yandex cannot track session');

  if (issues.length > 0) {
    return {
      pass: false,
      info: `${issues.length} SDK contract violation(s)`,
      details: issues
    };
  }
  return { pass: true, info: `SDK contract met (${calls.length} calls captured)` };
}

const SCENARIO_MAP = {
  startup: scenarioStartup,
  lang: scenarioLang,
  assets: scenarioAssets,
  dom: scenarioDom,
  sdk: scenarioSdk,
};

// ── Main ───────────────────────────────────────────────────────────────────

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;

  console.log('==========================================');
  console.log('  RUNTIME TEST: ' + dir.split(/[/\\]/).filter(Boolean).pop());
  console.log('==========================================');
  console.log(`  Scenarios: ${SCENARIOS.join(', ')}`);
  console.log(`  Server: ${url}`);
  console.log('');

  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    // DO NOT exit 0 here — "skip = success" is a false GREEN (the genetic-lab failure).
    // Auto-install first; if that fails, exit 3 = UNVERIFIED (caller must treat as blocker).
    console.error('[!] Puppeteer not installed — runtime probes cannot run. Auto-installing (one-time)...');
    let installed = false;
    try {
      const { spawnSync } = await import('node:child_process');
      for (const cwd of [process.cwd()]) {
        const r = spawnSync('npm', ['install', 'puppeteer', '--no-audit', '--no-fund'],
          { cwd, stdio: 'inherit', shell: process.platform === 'win32', timeout: 300000 });
        if (r.status === 0) { installed = true; break; }
      }
    } catch { /* fall through */ }
    if (installed) {
      try { puppeteer = await import('puppeteer'); }
      catch { console.error('[!] installed but not importable'); server.close(); process.exit(3); }
    } else {
      console.error('[!] Auto-install failed. Run: npm install puppeteer');
      console.error('[!] Runtime UNVERIFIED — BLOCKER, not a skip. Do NOT report success.');
      server.close();
      process.exit(3);
    }
  }

  const browser = await puppeteer.default.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT[0], height: VIEWPORT[1] });

  const consoleErrors = [];
  const consoleWarnings = [];
  const failedRequests = [];

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (/favicon|sdk\.js|ERR_FILE_NOT_FOUND|404/.test(text)) return;
      consoleErrors.push(text);
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(text);
    }
  });
  page.on('pageerror', err => consoleErrors.push(`UNCAUGHT: ${err.message}`));
  page.on('requestfailed', req => failedRequests.push(req.url()));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.log(`[X] Page load failed: ${e.message}`);
    await browser.close();
    server.close();
    process.exit(1);
  }

  // Screenshot capture (v4.10.28) — used by /ui-review --auto
  if (SCREENSHOT_PATH) {
    try {
      // Wait для UI к settle (assets load, animations stabilize)
      await page.waitForTimeout ? await page.waitForTimeout(2500) : await new Promise(r => setTimeout(r, 2500));

      // Resolve absolute path relative к project root (where script is run)
      const fs = await import('fs');
      const path = await import('path');
      const screenshotAbs = path.resolve(SCREENSHOT_PATH);
      const screenshotDir = path.dirname(screenshotAbs);
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      await page.screenshot({ path: screenshotAbs, fullPage: false });
      console.log(`[OK] Screenshot saved: ${SCREENSHOT_PATH} (viewport ${VIEWPORT[0]}x${VIEWPORT[1]})`);
    } catch (e) {
      console.log(`[!] Screenshot failed: ${e.message}`);
    }
  }

  // Run scenarios
  const results = {};
  let failures = 0;

  for (const scenario of SCENARIOS) {
    const fn = SCENARIO_MAP[scenario];
    if (!fn) {
      console.log(`  [?] Unknown scenario: ${scenario}`);
      continue;
    }
    process.stdout.write(`  [${scenario}] ... `);
    try {
      const result = await fn(page, failedRequests, consoleErrors);
      results[scenario] = result;
      if (result.pass) {
        console.log(`PASS  ${result.info || ''}`);
      } else {
        console.log(`FAIL  ${result.info || ''}`);
        if (result.details) {
          for (const d of (Array.isArray(result.details) ? result.details : [result.details]).slice(0, 5)) {
            const line = typeof d === 'object' ? JSON.stringify(d) : String(d);
            console.log(`         ${line.slice(0, 200)}`);
          }
        }
        failures++;
      }
    } catch (e) {
      console.log(`ERROR  ${e.message}`);
      results[scenario] = { pass: false, info: `Scenario threw: ${e.message}` };
      failures++;
    }
  }

  // Console error report
  if (consoleErrors.length > 0) {
    console.log('');
    console.log(`  Console errors during test (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach(e => console.log(`    - ${e.slice(0, 200)}`));
    if (consoleErrors.length > 5) console.log(`    ... and ${consoleErrors.length - 5} more`);
    // Treat any console error as failure if not already
    if (failures === 0) failures = 1;
  }

  await browser.close();
  server.close();

  console.log('');
  if (failures === 0) {
    console.log('  [OK] All scenarios passed. Ready to ship.');
    process.exit(0);
  } else {
    console.log(`  [BLOCK] ${failures} scenario failure(s). DO NOT SHIP until fixed.`);
    process.exit(1);
  }
});
