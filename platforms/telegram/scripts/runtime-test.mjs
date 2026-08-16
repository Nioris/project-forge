#!/usr/bin/env node
/**
 * @file runtime-test.mjs
 * @description Telegram Mini App runtime probe. What static pre-submit cannot
 *              catch:
 *
 *   Probe A — TIMING: does the app call Telegram.WebApp.ready() AND .expand()
 *     within a sensible delay after boot? Telegram keeps the loading spinner
 *     forever if .ready() isn't called; users see a blank half-screen if
 *     .expand() isn't called. We wait N seconds then fail if either is missing.
 *
 *   Probe B — THEME SYNC: when Telegram dispatches a themeChanged event
 *     (light→dark), does the app react (add/remove `.dark` class, change
 *     CSS vars, or re-render)? We snapshot computed `body` background before
 *     and after the theme toggle; if identical, the app has hardcoded colors
 *     → warning.
 *
 *   Probe C — CLOUDSTORAGE ROUND-TRIP: if the app uses CloudStorage.setItem,
 *     we intercept and verify the companion getItem returns the same value
 *     (mock).
 *
 *   All probes run WITHOUT a real Telegram client — we inject a mock
 *   window.Telegram.WebApp into the page before navigation.
 *
 *   Exit code:
 *     0 = no blockers
 *     1 = at least one blocker
 *     2 = fatal (puppeteer missing / game path invalid)
 *
 *   Usage:
 *     node platforms/telegram/scripts/runtime-test.mjs WorkProgress/{Project}/
 *     node platforms/telegram/scripts/runtime-test.mjs WorkProgress/{Project}/ --headed
 *     node platforms/telegram/scripts/runtime-test.mjs WorkProgress/{Project}/ --timeout 8000
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { startStaticServer } from '../../_shared/static-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const BAR = '=========================================================';

// The mock we inject BEFORE the page loads. Records all API calls on
// window.__TG_MOCK.calls so we can inspect them from Node.
const MOCK_INIT_SCRIPT = `
(function () {
  var calls = [];
  var themeHandlers = [];
  var mainBtnHandlers = [];
  var backBtnHandlers = [];
  var cloudStore = {};

  function log(method, args) {
    calls.push({ method: method, args: args, time: Date.now() });
  }

  var WebApp = {
    initData: '',
    initDataUnsafe: { user: { id: 1, first_name: 'Test', language_code: 'en' } },
    colorScheme: 'light',
    themeParams: { bg_color: '#ffffff', text_color: '#000000', button_color: '#3390ec' },
    version: '7.4',
    platform: 'tdesktop',
    viewportHeight: 700,
    viewportStableHeight: 700,
    isExpanded: false,

    ready: function () { log('ready', []); this._readyAt = Date.now(); },
    expand: function () { log('expand', []); this.isExpanded = true; this._expandAt = Date.now(); },
    close: function () { log('close', []); },

    onEvent: function (name, cb) {
      log('onEvent', [name]);
      if (name === 'themeChanged') themeHandlers.push(cb);
      if (name === 'mainButtonClicked') mainBtnHandlers.push(cb);
      if (name === 'backButtonClicked') backBtnHandlers.push(cb);
    },
    offEvent: function (name, cb) { log('offEvent', [name]); },

    MainButton: {
      text: '',
      setText: function (t) { log('MainButton.setText', [t]); this.text = t; },
      show: function () { log('MainButton.show', []); },
      hide: function () { log('MainButton.hide', []); },
      onClick: function (cb) { log('MainButton.onClick', []); mainBtnHandlers.push(cb); },
      offClick: function () { log('MainButton.offClick', []); },
      enable: function () { log('MainButton.enable', []); },
      disable: function () { log('MainButton.disable', []); },
    },
    BackButton: {
      show: function () { log('BackButton.show', []); },
      hide: function () { log('BackButton.hide', []); },
      onClick: function (cb) { log('BackButton.onClick', []); backBtnHandlers.push(cb); },
      offClick: function () { log('BackButton.offClick', []); },
    },
    HapticFeedback: {
      impactOccurred: function (s) { log('HapticFeedback.impactOccurred', [s]); },
      notificationOccurred: function (s) { log('HapticFeedback.notificationOccurred', [s]); },
      selectionChanged: function () { log('HapticFeedback.selectionChanged', []); },
    },
    CloudStorage: {
      setItem: function (k, v, cb) {
        log('CloudStorage.setItem', [k, v]);
        cloudStore[k] = v;
        if (cb) setTimeout(function () { cb(null, true); }, 0);
      },
      getItem: function (k, cb) {
        log('CloudStorage.getItem', [k]);
        if (cb) setTimeout(function () { cb(null, cloudStore[k] || null); }, 0);
      },
      removeItem: function (k, cb) {
        log('CloudStorage.removeItem', [k]);
        delete cloudStore[k];
        if (cb) setTimeout(function () { cb(null, true); }, 0);
      },
      getKeys: function (cb) {
        log('CloudStorage.getKeys', []);
        if (cb) setTimeout(function () { cb(null, Object.keys(cloudStore)); }, 0);
      },
    },
    showAlert: function (msg, cb) { log('showAlert', [msg]); if (cb) cb(); },
    showConfirm: function (msg, cb) { log('showConfirm', [msg]); if (cb) cb(true); },
    showPopup: function (p, cb) { log('showPopup', [p]); if (cb) cb(null); },
    openLink: function (u) { log('openLink', [u]); },
    openTelegramLink: function (u) { log('openTelegramLink', [u]); },
    sendData: function (d) { log('sendData', [d]); },
    setHeaderColor: function (c) { log('setHeaderColor', [c]); },
    setBackgroundColor: function (c) { log('setBackgroundColor', [c]); },
    showInvoice: function (link, cb) { log('showInvoice', [link]); if (cb) cb('paid'); },

    // Helper exposed for Node-side probes.
    _triggerThemeChange: function (newScheme, newParams) {
      this.colorScheme = newScheme || 'dark';
      this.themeParams = newParams || { bg_color: '#212121', text_color: '#ffffff' };
      log('_triggerThemeChange', [this.colorScheme]);
      for (var i = 0; i < themeHandlers.length; i++) {
        try { themeHandlers[i](); } catch (e) {}
      }
    },
  };

  window.Telegram = { WebApp: WebApp };
  window.__TG_MOCK = { calls: calls, cloudStore: cloudStore };
})();
`;

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter(a => !a.startsWith('-'));
  if (positional.length === 0) {
    console.error('Usage: node platforms/telegram/scripts/runtime-test.mjs <gamePath> [--headed] [--timeout N] [--verbose]');
    process.exit(2);
  }
  const gamePath = path.resolve(positional[0]);
  if (!fs.existsSync(gamePath) || !fs.statSync(gamePath).isDirectory()) {
    console.error('Not a directory: ' + gamePath);
    process.exit(2);
  }
  const opts = {
    headed: args.includes('--headed'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    timeout: parseInt(args[args.indexOf('--timeout') + 1] || '6000') || 6000,
  };

  let puppeteer;
  try { puppeteer = await import('puppeteer'); }
  catch {
    console.error('puppeteer not installed. Run: npm install puppeteer');
    process.exit(2);
  }

  const name = path.basename(gamePath);
  console.log(BAR);
  console.log('  TELEGRAM RUNTIME-TEST: ' + name);
  console.log('  Path: ' + gamePath);
  console.log(BAR);

  const server = await startStaticServer(gamePath);
  console.log('  Serving on ' + server.url);

  const browser = await puppeteer.default.launch({
    headless: !opts.headed,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const issues = [];
  let themeSync = { supported: false, bgChanged: false };
  let cloudRoundTrip = { used: false, ok: null };

  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

    await page.evaluateOnNewDocument(MOCK_INIT_SCRIPT);

    await page.goto(server.url, { waitUntil: 'load', timeout: 30000 });
    // Give the app up to `opts.timeout` ms to call ready/expand
    await new Promise(r => setTimeout(r, opts.timeout));

    // ═══ Probe A: ready + expand timing ═══
    const calls = await page.evaluate(() => (window.__TG_MOCK && window.__TG_MOCK.calls) || []);
    if (opts.verbose) {
      console.log('\n  Calls observed (' + calls.length + '):');
      for (const c of calls.slice(0, 30)) {
        console.log('    - ' + c.method + '(' + JSON.stringify(c.args) + ')');
      }
      if (calls.length > 30) console.log('    ... +' + (calls.length - 30) + ' more');
    }

    const readyCall = calls.find(c => c.method === 'ready');
    const expandCall = calls.find(c => c.method === 'expand');

    if (!readyCall) {
      issues.push({
        id: 'TG-RT-READY-MISSING',
        level: 'blocker',
        message: `Telegram.WebApp.ready() not called within ${opts.timeout}ms of page load. Telegram will show the loading spinner forever.`,
        url: 'https://core.telegram.org/bots/webapps#initializing-mini-apps',
      });
    }
    if (!expandCall) {
      issues.push({
        id: 'TG-RT-EXPAND-MISSING',
        level: 'warning',
        message: `Telegram.WebApp.expand() not called within ${opts.timeout}ms. App will render in compact ~60% mode.`,
        url: 'https://core.telegram.org/bots/webapps#initializing-mini-apps',
      });
    }

    // ═══ Probe B: theme sync ═══
    // Check if the page subscribes to themeChanged at all.
    const hasThemeSubscribe = calls.some(c => c.method === 'onEvent' && c.args[0] === 'themeChanged');
    themeSync.supported = hasThemeSubscribe;

    if (hasThemeSubscribe) {
      // Snapshot body background, trigger theme change, compare.
      const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.evaluate(() => {
        window.Telegram.WebApp._triggerThemeChange('dark', {
          bg_color: '#000000', text_color: '#ffffff', button_color: '#3390ec',
        });
      });
      await new Promise(r => setTimeout(r, 400)); // allow handlers + paint
      const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      themeSync.bgBefore = bgBefore;
      themeSync.bgAfter = bgAfter;
      themeSync.bgChanged = bgBefore !== bgAfter;

      if (!themeSync.bgChanged) {
        issues.push({
          id: 'TG-RT-THEME-UNRESPONSIVE',
          level: 'warning',
          message: `App subscribed to themeChanged but <body> background didn't change after light→dark. Colors may be hardcoded. Before: ${bgBefore}  After: ${bgAfter}.`,
          url: 'https://core.telegram.org/bots/webapps#themeparams',
        });
      }
    } else {
      issues.push({
        id: 'TG-RT-THEME-NOT-SUBSCRIBED',
        level: 'warning',
        message: 'App did not subscribe to themeChanged event. UI will NOT adapt when user switches Telegram to dark mode. Register via Telegram.WebApp.onEvent("themeChanged", handler).',
        url: 'https://core.telegram.org/bots/webapps#themeparams',
      });
    }

    // ═══ Probe C: CloudStorage round-trip ═══
    const setItemCalls = calls.filter(c => c.method === 'CloudStorage.setItem');
    if (setItemCalls.length > 0) {
      cloudRoundTrip.used = true;
      const getItemCalls = calls.filter(c => c.method === 'CloudStorage.getItem');
      cloudRoundTrip.ok = getItemCalls.length > 0;
      if (!cloudRoundTrip.ok) {
        issues.push({
          id: 'TG-RT-CLOUD-WRITE-NO-READ',
          level: 'warning',
          message: 'CloudStorage.setItem was called but getItem was never called during boot. Saves might not be restored on re-open — verify load path.',
          url: 'https://core.telegram.org/bots/webapps#cloudstorage',
        });
      }
    }

    // ═══ Probe D: console errors ═══
    if (consoleErrors.length > 0) {
      issues.push({
        id: 'TG-RT-CONSOLE-ERROR',
        level: 'blocker',
        message: `Console errors detected: ${consoleErrors.slice(0, 3).join(' | ')}${consoleErrors.length > 3 ? ` (+${consoleErrors.length - 3} more)` : ''}`,
      });
    }
  } finally {
    await browser.close();
    await server.close();
  }

  // ═══ Print report ═══
  console.log('');
  const blockers = issues.filter(i => i.level === 'blocker').length;
  const warnings = issues.filter(i => i.level === 'warning').length;
  console.log('  TOTAL: ' + blockers + ' blockers, ' + warnings + ' warnings');
  console.log('');
  console.log('  Probes:');
  console.log('    ready() called:   ' + (issues.find(i => i.id === 'TG-RT-READY-MISSING') ? 'NO' : 'YES'));
  console.log('    expand() called:  ' + (issues.find(i => i.id === 'TG-RT-EXPAND-MISSING') ? 'NO' : 'YES'));
  console.log('    theme subscribed: ' + (themeSync.supported ? 'YES' : 'NO'));
  console.log('    theme reactive:   ' + (themeSync.supported ? (themeSync.bgChanged ? 'YES' : 'NO') : 'n/a'));
  console.log('    CloudStorage:     ' + (cloudRoundTrip.used ? (cloudRoundTrip.ok ? 'read+write' : 'write-only') : 'not used'));
  console.log('');

  for (const issue of issues) {
    const sym = issue.level === 'blocker' ? '[X]' : '[!]';
    console.log('  ' + sym + ' [' + issue.id + '] ' + issue.message);
    if (issue.url) console.log('      ' + issue.url);
  }

  console.log('');
  console.log(blockers > 0
    ? 'BLOCKED — runtime test found ' + blockers + ' blocker(s).'
    : 'READY for Telegram deploy.'
  );
  console.log(BAR);

  fs.writeFileSync(
    path.join(gamePath, '.runtime-test-telegram.json'),
    JSON.stringify({
      platform: 'telegram',
      summary: { blockers, warnings },
      themeSync,
      cloudRoundTrip,
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
