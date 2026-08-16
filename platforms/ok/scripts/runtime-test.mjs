#!/usr/bin/env node
/**
 * @file runtime-test.mjs
 * @description OK Mini App runtime probes that static validators cannot catch:
 *
 *   Probe A — URL-SIG: OK passes `sig`, `auth_sig` and other signed params via
 *     iframe URL. Server must verify `sig = MD5(sorted_params + secret_key)`.
 *     We check that the app HANDLES the sig param (passes it to server or
 *     stores it) vs blindly trusting URL query — critical for virtual-currency
 *     payments and auth flows.
 *
 *   Probe B — FAPI.UI.loaded() TIMING: OK keeps a loading spinner until
 *     FAPI.UI.loaded() is called. We wait N seconds; if not called, block.
 *
 *   Probe C — window.API_callback CONTRACT: FAPI.UI.* methods (showPayment,
 *     showAd, loadAd, showLoadedAd) deliver their results not through a local
 *     callback, but via a GLOBAL `window.API_callback(method, result, data)`
 *     function the host app must implement. We verify this function exists
 *     after boot — missing it means purchases/ad rewards are silently dropped.
 *
 *   Probe C2 — REWARDED PRELOAD: rewarded ads require FAPI.UI.loadAd() before
 *     FAPI.UI.showLoadedAd(). Without preload the first show fails.
 *
 *   All probes run with a stubbed `window.FAPI` — no real OK client required.
 *
 *   Usage:
 *     node platforms/ok/scripts/runtime-test.mjs WorkProgress/{Project}/
 *     node platforms/ok/scripts/runtime-test.mjs WorkProgress/{Project}/ --timeout 8000
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../../_shared/static-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BAR = '=========================================================';

// Mock FAPI — installed before the page loads. Sources verified:
//   - https://apiok.ru/en/dev/sdk/js/ (overview)
//   - https://apiok.ru/en/dev/sdk/js/init (FAPI.init signature)
//   - https://apiok.ru/en/dev/sdk/js/client.call (Client.call callback shape)
//   - https://apiok.ru/en/dev/sdk/js/ui.showPayment (showPayment 9-arg signature)
//   - https://apiok.ru/en/dev/sdk/js/ui.loadAd (loadAd + showLoadedAd sequence)
//
// Critical correction vs v4.1: FAPI.UI.* methods do NOT take a callback
// parameter. They invoke a global `API_callback(method, result, data)`
// function that the host app is expected to implement.
const MOCK_INIT_SCRIPT = `
(function () {
  var calls = [];

  function log(method, args) {
    calls.push({ method: method, args: args, time: Date.now() });
  }

  var FAPI = {
    // FAPI.init(apiServer, apiConnection, onSuccess, onError)
    init: function (server, conn, onSuccess, onError) {
      log('init', [server, conn]);
      setTimeout(function () {
        if (typeof onSuccess === 'function') {
          onSuccess();
        } else {
          log('init.onSuccess.missing', []);
        }
      }, 10);
    },
    Util: {
      // Returns URL query params as object — host apps use this to feed FAPI.init
      getRequestParameters: function () {
        log('Util.getRequestParameters', []);
        var out = {};
        try {
          var u = new URL(window.location.href);
          u.searchParams.forEach(function (v, k) { out[k] = v; });
        } catch (e) {}
        return out;
      },
    },
    Client: {
      // FAPI.Client.call({method, ...}, callback(status, data, error))
      call: function (params, callback) {
        log('Client.call', [params]);
        var cb = typeof callback === 'function' ? callback : function () {};
        setTimeout(function () {
          if (params && params.method === 'users.getCurrentUser') {
            cb('ok', { uid: '123', first_name: 'Test', last_name: 'User', locale: 'ru' }, null);
          } else {
            cb('ok', {}, null);
          }
        }, 20);
      },
    },
    UI: {
      // FAPI.UI.loaded() — no args, no callback
      loaded: function () { log('UI.loaded', []); },
      setWindowSize: function (w, h) { log('UI.setWindowSize', [w, h]); },
      // FAPI.UI.showPayment(name, description, code, price, options,
      //                     attributes, currency, callback, uiConf)
      // NOTE: callback here is the string "true"/"false" per docs, NOT a function
      // (docs example: FAPI.UI.showPayment("Apple", "...", 777, 1, null, null, "ok", "true")).
      // The actual result is delivered to window.API_callback(method, result, data).
      showPayment: function (name, description, code, price, options,
                             attributes, currency, callback, uiConf) {
        log('UI.showPayment', [name, description, code, price, options, attributes, currency]);
        // Simulate async result via API_callback
        setTimeout(function () {
          if (typeof window.API_callback === 'function') {
            window.API_callback('showPayment', 'ok', 'transaction_123');
          }
        }, 30);
      },
      // FAPI.UI.showAd() — interstitial, no callback
      showAd: function () {
        log('UI.showAd', []);
        setTimeout(function () {
          if (typeof window.API_callback === 'function') {
            window.API_callback('showAd', 'ok', null);
          }
        }, 30);
      },
      // FAPI.UI.loadAd() — preload rewarded video
      loadAd: function () {
        log('UI.loadAd', []);
        setTimeout(function () {
          if (typeof window.API_callback === 'function') {
            window.API_callback('loadAd', 'ok', null);
          }
        }, 30);
      },
      // FAPI.UI.showLoadedAd() — show previously-loaded rewarded
      showLoadedAd: function () {
        log('UI.showLoadedAd', []);
        setTimeout(function () {
          if (typeof window.API_callback === 'function') {
            window.API_callback('showLoadedAd', 'ok', { reward: 1 });
          }
        }, 30);
      },
    },
    invokeUIMethod: function () {
      var args = Array.prototype.slice.call(arguments);
      log('invokeUIMethod', args);
    },
  };

  window.FAPI = FAPI;
  window.__OK_MOCK = {
    calls: calls,
    _initialUrl: window.location.href,
  };
})();
`;

async function main() {
  const args = process.argv.slice(2);
  const pos = args.filter(a => !a.startsWith('-'));
  if (pos.length === 0) {
    console.error('Usage: node platforms/ok/scripts/runtime-test.mjs <gamePath> [--headed] [--timeout N] [--verbose]');
    process.exit(2);
  }
  const gamePath = path.resolve(pos[0]);
  if (!fs.existsSync(gamePath) || !fs.statSync(gamePath).isDirectory()) {
    console.error('Not a directory: ' + gamePath); process.exit(2);
  }
  const opts = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    headed: args.includes('--headed'),
    timeout: parseInt(args[args.indexOf('--timeout') + 1] || '6000') || 6000,
  };

  let puppeteer;
  try { puppeteer = await import('puppeteer'); }
  catch {
    console.error('puppeteer not installed. Run: npm install puppeteer');
    process.exit(2);
  }

  console.log(BAR);
  console.log('  OK RUNTIME-TEST: ' + path.basename(gamePath));
  console.log(BAR);

  const server = await startStaticServer(gamePath);
  console.log('  Serving on ' + server.url);

  const browser = await puppeteer.default.launch({
    headless: !opts.headed,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const issues = [];
  let sigProbe = { present: false, handled: false };
  let lifecycleProbe = { apiCallbackDefined: false };

  try {
    const page = await browser.newPage();
    const consoleMsgs = [];
    page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', e => consoleMsgs.push({ type: 'error', text: 'pageerror: ' + e.message }));

    await page.evaluateOnNewDocument(MOCK_INIT_SCRIPT);

    // Navigate WITH the OK URL parameters — simulates the iframe contract.
    const mockParams = new URLSearchParams({
      api_server: 'https://api.ok.ru/',
      apiconnection: 'mock_conn_123',
      authKey: 'mock_auth_key',
      session_key: 'mock_session',
      session_secret_key: 'mock_secret',
      sig: 'mock_signature_abc123',
      lang: 'ru',
      logged_user_id: '42',
    });
    const urlWithParams = server.url + '/?' + mockParams.toString();
    await page.goto(urlWithParams, { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, opts.timeout));

    // ═══ Probe A: URL sig handling ═══
    // Scan source files for sig-param handling.
    const pagedFiles = await page.evaluate(() => {
      const scripts = Array.from(document.scripts)
        .map(s => s.textContent || '')
        .join('\n');
      return scripts;
    });
    sigProbe.present = true; // we always pass it
    // "Handled" = the source references `sig`/`authKey`/`session_secret_key` query
    // params, indicating the app is at least aware of them.
    sigProbe.handled = /\bsig\b|authKey|session_secret_key|session_key/.test(pagedFiles) ||
      /URLSearchParams|searchParams/.test(pagedFiles);

    if (!sigProbe.handled) {
      issues.push({
        id: 'OK-RT-SIG-IGNORED',
        level: 'warning',
        message: 'App does not appear to read OK URL params (sig/authKey/session_secret_key). If you perform any auth or payments, the server MUST verify `sig = MD5(sorted_params + secret_key)` — ignoring it lets attackers forge requests.',
        url: 'https://apiok.ru/dev/app/site',
      });
    }

    // ═══ Probe B: FAPI.UI.loaded timing ═══
    const calls = await page.evaluate(() => (window.__OK_MOCK && window.__OK_MOCK.calls) || []);
    if (opts.verbose) {
      console.log('\n  Calls (' + calls.length + '):');
      for (const c of calls.slice(0, 30)) {
        console.log('    - ' + c.method + '(' + JSON.stringify(c.args).slice(0, 80) + ')');
      }
    }

    const initCall = calls.find(c => c.method === 'init');
    const loadedCall = calls.find(c => c.method === 'UI.loaded');

    if (!initCall) {
      issues.push({
        id: 'OK-RT-INIT-MISSING',
        level: 'blocker',
        message: `FAPI.init() not called within ${opts.timeout}ms. Without it, no FAPI method works.`,
        url: 'https://apiok.ru/dev/app/site',
      });
    }
    if (!loadedCall) {
      issues.push({
        id: 'OK-RT-LOADED-MISSING',
        level: 'blocker',
        message: `FAPI.UI.loaded() not called within ${opts.timeout}ms. OK keeps the loading spinner spinning.`,
        url: 'https://apiok.ru/dev/methods/common/FAPI.UI.loaded',
      });
    } else if (initCall && loadedCall.time < initCall.time) {
      issues.push({
        id: 'OK-RT-LOADED-BEFORE-INIT',
        level: 'blocker',
        message: 'FAPI.UI.loaded() called BEFORE FAPI.init(). Reorder so init runs first.',
      });
    }

    // ═══ Probe C: window.API_callback contract ═══
    // FAPI.UI.* methods deliver results via global API_callback(method, result, data).
    // A production OK app MUST implement window.API_callback — otherwise purchase
    // results, ad rewards, etc. are dropped on the floor.
    // NOTE: Read directly from `page.evaluate` AFTER the timeout, not from a
    // pre-scheduled mock snapshot (the mock runs before app scripts, so any
    // early snapshot would always be false).
    const apiCbDefined = await page.evaluate(
      () => typeof window.API_callback === 'function'
    );
    lifecycleProbe = { apiCallbackDefined: apiCbDefined };
    if (!apiCbDefined) {
      issues.push({
        id: 'OK-RT-API-CALLBACK-MISSING',
        level: 'blocker',
        message: 'window.API_callback(method, result, data) is not defined. FAPI.UI.* methods (showPayment, showAd, loadAd, showLoadedAd) deliver their results via this global — without it, payments and ad rewards fail silently.',
        citation: 'Methods from the FAPI.UI group don\'t require the callback function to be passed. After the method is executed, a global function will be called, and the developer must realize it.',
        url: 'https://apiok.ru/en/dev/sdk/js/',
      });
    }

    // ═══ Probe C2: rewarded-ad preload lifecycle ═══
    // Rewarded ads in OK: FAPI.UI.loadAd() → (wait for API_callback 'loadAd:ok') → FAPI.UI.showLoadedAd().
    const loadAdCall = calls.find(c => c.method === 'UI.loadAd');
    const showLoadedAdCall = calls.find(c => c.method === 'UI.showLoadedAd');
    if (showLoadedAdCall && !loadAdCall) {
      issues.push({
        id: 'OK-RT-REWARDED-NO-PRELOAD',
        level: 'warning',
        message: 'FAPI.UI.showLoadedAd() called without prior FAPI.UI.loadAd(). Rewarded ads must be preloaded — the first show will fail.',
        url: 'https://apiok.ru/en/dev/sdk/js/ui.loadAd',
      });
    }

    // ═══ Probe D: console errors ═══
    const errs = consoleMsgs.filter(m => m.type === 'error');
    if (errs.length > 0) {
      issues.push({
        id: 'OK-RT-CONSOLE-ERROR',
        level: 'blocker',
        message: `Console errors detected: ${errs.slice(0, 2).map(e => e.text).join(' | ')}${errs.length > 2 ? ` (+${errs.length - 2} more)` : ''}`,
      });
    }
  } finally {
    await browser.close();
    await server.close();
  }

  console.log('');
  const blockers = issues.filter(i => i.level === 'blocker').length;
  const warnings = issues.filter(i => i.level === 'warning').length;
  console.log('  TOTAL: ' + blockers + ' blockers, ' + warnings + ' warnings');
  console.log('');
  console.log('  Probes:');
  console.log('    FAPI.init called:        ' + (issues.find(i => i.id === 'OK-RT-INIT-MISSING') ? 'NO' : 'YES'));
  console.log('    FAPI.UI.loaded called:   ' + (issues.find(i => i.id === 'OK-RT-LOADED-MISSING') ? 'NO' : 'YES'));
  console.log('    URL sig acknowledged:    ' + (sigProbe.handled ? 'YES' : 'NO'));
  console.log('    API_callback defined:    ' + (lifecycleProbe.apiCallbackDefined ? 'YES' : 'NO'));
  console.log('');

  for (const issue of issues) {
    const sym = issue.level === 'blocker' ? '[X]' : '[!]';
    console.log('  ' + sym + ' [' + issue.id + '] ' + issue.message);
    if (issue.url) console.log('      ' + issue.url);
  }
  console.log('');
  console.log(blockers > 0 ? 'BLOCKED — runtime test found ' + blockers + ' blocker(s).' : 'READY for OK deploy.');
  console.log(BAR);

  fs.writeFileSync(
    path.join(gamePath, '.runtime-test-ok.json'),
    JSON.stringify({
      platform: 'ok',
      summary: { blockers, warnings },
      sigProbe, lifecycleProbe,
      issues,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  process.exit(blockers > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(2);
});
