#!/usr/bin/env node
// smoke-test.mjs — Запуск игры и проверка на runtime ошибки
// Использование: node scripts/smoke-test.mjs WorkProgress/Prizrak/
//
// Что делает:
// 1. Поднимает HTTP-сервер на случайном порту
// 2. Открывает index.html в headless Chrome (через Puppeteer)
// 3. Ждёт 5 секунд
// 4. Собирает ВСЕ console.error и необработанные ошибки
// 5. Выводит результат: ✅ или ❌ + список ошибок
//
// Требования: npm install puppeteer (один раз)

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

const dir = resolve(process.argv[2] || 'WorkProgress');
const WAIT_MS = parseInt(process.argv[3]) || 6000;

if (!existsSync(join(dir, 'index.html'))) {
  console.log(`❌ index.html not found in ${dir}`);
  process.exit(1);
}

// Simple static file server
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webm': 'video/webm',
};

const server = createServer((req, res) => {
  // sdk.js stub — return empty SDK mock so game doesn't crash on missing SDK
  if (req.url === '/sdk.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(`
      window.YaGames = {
        init: function() {
          return Promise.resolve({
            features: {
              LoadingAPI: { ready: function(){} },
              GameplayAPI: { start: function(){}, stop: function(){} }
            },
            adv: { showFullscreenAdv: function(){}, showRewardedVideo: function(){} },
            auth: { openAuthDialog: function(){ return Promise.resolve(); } },
            environment: { i18n: { lang: 'en' }, app: { id: '0' } },
            getPlayer: function(){ return Promise.resolve({ getMode: function(){ return '' }, getName: function(){ return '' }, setData: function(){ return Promise.resolve(); }, getData: function(){ return Promise.resolve({}); } }); },
            getPayments: function(){ return Promise.resolve({ getCatalog: function(){ return Promise.resolve([]); }, getPurchases: function(){ return Promise.resolve({ purchases: [] }); }, purchase: function(){ return Promise.resolve({}); }, consumePurchase: function(){ return Promise.resolve(); } }); },
            getLeaderboards: function(){ return Promise.resolve({ setScore: function(){ return Promise.resolve(); }, getEntries: function(){ return Promise.resolve({ entries: [] }); } }); },
            feedback: { canReview: function(){ return Promise.resolve({ value: false }); } },
            shortcut: { canShowPrompt: function(){ return Promise.resolve({ canShow: false }); } },
            on: function(){},
            off: function(){},
            isAvailableMethod: function(){ return Promise.resolve(false); },
          });
        }
      };
    `);
    return;
  }

  let filePath = join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (filePath.endsWith('/')) filePath += 'index.html';

  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(readFileSync(filePath));
  } catch (e) {
    res.writeHead(500);
    res.end('Error');
  }
});

// Find random port
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;

  console.log('══════════════════════════════════════════');
  console.log('  SMOKE TEST: ' + dir.split(/[/\\]/).pop());
  console.log('══════════════════════════════════════════');
  console.log(`  Server: ${url}`);
  console.log(`  Wait: ${WAIT_MS / 1000}s\n`);

  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch (e) {
    console.log('⚠️ Puppeteer not installed. Run: npm install puppeteer');
    console.log('   Skipping smoke test.');
    server.close();
    process.exit(0);
  }

  const browser = await puppeteer.default.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();

  const errors = [];
  const warnings = [];

  // Catch console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Skip known non-issues
      if (/favicon|sdk\.js|ERR_FILE_NOT_FOUND|404/.test(text)) return;
      errors.push(text);
    }
  });

  // Catch uncaught exceptions
  page.on('pageerror', err => {
    errors.push(`UNCAUGHT: ${err.message}`);
  });

  // Catch failed requests (missing files)
  page.on('requestfailed', req => {
    const url = req.url();
    if (/favicon|sdk\.js/.test(url)) return;
    warnings.push(`Failed to load: ${url.split('/').pop()}`);
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait for game to initialize
    await new Promise(r => setTimeout(r, WAIT_MS));
  } catch (e) {
    errors.push(`Page load failed: ${e.message}`);
  }

  await browser.close();
  server.close();

  // Report
  if (warnings.length > 0) {
    console.log(`⚠️ ${warnings.length} resource warnings:`);
    warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }

  if (errors.length === 0) {
    console.log('✅ No runtime errors in first ' + (WAIT_MS / 1000) + ' seconds');
    console.log('   Game launches OK');
    process.exit(0);
  } else {
    console.log(`❌ FAIL: ${errors.length} runtime errors:`);
    errors.forEach((e, i) => {
      console.log(`   ${i + 1}. ${e.substring(0, 200)}`);
    });
    console.log('');
    console.log('🛑 GAME CRASHES ON LAUNCH! Fix these before saying "ready".');
    process.exit(1);
  }
});
