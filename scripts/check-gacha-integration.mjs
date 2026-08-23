#!/usr/bin/env node
/**
 * Focused browser verifier for a Forge gacha feature integrated into an
 * existing merge-grid game. It proves the button/API, state mutation,
 * persistence, and lossless full-grid queue instead of accepting a smoke test
 * that never executes the new module.
 *
 * Usage: node scripts/check-gacha-integration.mjs <game-dir>
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const gameDir = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || '.');
const entrypoint = join(gameDir, 'index.html');
if (!existsSync(entrypoint)) {
  console.error(`[X] index.html not found in ${gameDir}`);
  process.exit(2);
}

const html = readFileSync(entrypoint, 'utf8');
const coreAt = html.indexOf('19-gacha-core.js');
const integrationAt = html.indexOf('18-gacha-integration.js');
if (coreAt < 0 || integrationAt < 0 || coreAt > integrationAt) {
  console.error('[X] index.html must load 19-gacha-core.js before 18-gacha-integration.js');
  process.exit(1);
}

async function loadPuppeteer() {
  try {
    const imported = await import('puppeteer');
    return imported.default || imported;
  } catch {
    try { return createRequire(join(process.cwd(), 'package.json'))('puppeteer'); }
    catch { return null; }
  }
}

const puppeteer = await loadPuppeteer();
if (!puppeteer) {
  console.error('[X] puppeteer is required; run the canonical playtest once to install it');
  process.exit(2);
}

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const server = createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (requestPath === '/sdk.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end('window.YaGames=window.YaGames||undefined;');
    return;
  }
  const path = join(gameDir, requestPath.replace(/^\/+/, '') || 'index.html');
  try {
    const body = readFileSync(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});

const errors = [];
let browser;
let watchdogFired = false;
const watchdog = setTimeout(() => {
  watchdogFired = true;
  try { browser?.process()?.kill('SIGKILL'); } catch {}
  try { if (server.listening) server.close(); } catch {}
}, 100_000);
try {
  browser = await puppeteer.launch({ args: ['--no-sandbox'], timeout: 30_000 });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2', timeout: 30_000 });

  const initial = await page.evaluate(() => {
    const button = document.getElementById('gacha-btn');
    const visible = Boolean(button && button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0);
    return {
      visible,
      api: typeof window.Gacha?.open === 'function',
      integrationApi: typeof window.GachaIntegration?.flushQueue === 'function',
      occupied: state.grid.filter(Boolean).length,
    };
  });
  if (!initial.visible) throw new Error('visible #gacha-btn was not rendered');
  if (!initial.api) throw new Error('window.Gacha.open is unavailable');
  if (!initial.integrationApi) throw new Error('window.GachaIntegration.flushQueue is unavailable');

  await page.click('#gacha-btn');
  await new Promise(resolveWait => setTimeout(resolveWait, 100));
  const normalDrop = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('avtotaz_save_v1') || 'null');
    return {
      occupied: state.grid.filter(Boolean).length,
      queue: Array.isArray(state.gachaQueue) ? state.gachaQueue.length : -1,
      savedOccupied: saved?.grid?.filter(Boolean).length ?? -1,
      savedQueue: Array.isArray(saved?.gachaQueue) ? saved.gachaQueue.length : -1,
    };
  });
  if (normalDrop.occupied <= initial.occupied) throw new Error('gacha click did not add a reward to state.grid');
  if (normalDrop.savedOccupied !== normalDrop.occupied) throw new Error('gacha reward was not persisted through the main saveState/localStorage path');

  await page.evaluate(() => {
    state.grid = new Array(GRID_N).fill(1);
    state.gachaQueue = [];
    renderItems();
    saveState();
  });
  await page.click('#gacha-btn');
  await new Promise(resolveWait => setTimeout(resolveWait, 100));
  const fullGrid = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('avtotaz_save_v1') || 'null');
    return {
      grid: [...state.grid],
      queue: Array.isArray(state.gachaQueue) ? [...state.gachaQueue] : null,
      savedQueue: saved?.gachaQueue,
    };
  });
  if (!fullGrid.grid.every(level => level === 1)) throw new Error('full-grid gacha overwrote an existing reward');
  if (fullGrid.queue?.length !== 1) throw new Error('full-grid gacha did not retain the new reward in state.gachaQueue');
  if (!Array.isArray(fullGrid.savedQueue) || fullGrid.savedQueue.length !== 1) throw new Error('queued reward was not persisted by the main save');

  await page.reload({ waitUntil: 'networkidle2', timeout: 30_000 });
  const restoredQueue = await page.evaluate(() => Array.isArray(state.gachaQueue) ? state.gachaQueue.length : -1);
  if (restoredQueue !== 1) throw new Error('queued reward did not survive page reload');

  const flushed = await page.evaluate(() => {
    state.grid[0] = null;
    const before = state.gachaQueue.length;
    window.GachaIntegration.flushQueue();
    const saved = JSON.parse(localStorage.getItem('avtotaz_save_v1') || 'null');
    return { before, after: state.gachaQueue.length, inserted: state.grid[0], savedQueue: saved?.gachaQueue };
  });
  if (flushed.before !== 1 || flushed.after !== 0 || !flushed.inserted) throw new Error('flushQueue did not deliver the retained reward into the free cell');
  if (!Array.isArray(flushed.savedQueue) || flushed.savedQueue.length !== 0) throw new Error('flushed queue state was not persisted');
  if (errors.length) throw new Error([...new Set(errors)].join(' | '));

  console.log('[OK] gacha integration: visible button and window.Gacha.open');
  console.log('[OK] normal reward mutates state.grid and persists through main saveState');
  console.log('[OK] full-grid reward is queued, survives reload, and flushes without overwriting existing parts');
} catch (error) {
  console.error(`[X] ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  if (browser) {
    let closed = false;
    try {
      await Promise.race([
        browser.close().then(() => { closed = true; }),
        new Promise(resolveWait => setTimeout(resolveWait, 5_000)),
      ]);
    } catch {}
    if (!closed) {
      try { browser.process()?.kill('SIGKILL'); } catch {}
    }
  }
  if (server.listening) await new Promise(resolveClose => server.close(() => resolveClose()));
  if (watchdogFired) {
    console.error('[X] gacha verifier watchdog stopped a hung browser check');
    process.exitCode = 2;
  }
}
