/**
 * @file static-server.mjs
 * @description Tiny zero-dep HTTP server for serving a WorkProgress/{Game}/
 *              directory during puppeteer smoke/runtime tests. Binds to a
 *              random port (so parallel test runs don't collide), serves
 *              standard MIME types, supports an optional SDK stub hook
 *              that rewrites `/sdk.js` / `/telegram-web-app.js` / etc with
 *              per-platform mocks.
 *
 *              Extracted from platforms/yandex/scripts/runtime-test.mjs
 *              on emergence of a second consumer (Telegram runtime-test).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
};

/**
 * Start a static file server.
 *
 * @param {string} rootDir — directory to serve
 * @param {Object} [opts]
 * @param {Object.<string, string>} [opts.rewrites] — map URL path → JS content to serve verbatim
 *        (e.g. { '/sdk.js': 'window.YaGames = { init: () => Promise.resolve(...) }' })
 * @param {Function} [opts.onRequest] — called with (req, url) for every request (for test assertions)
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>}>}
 */
export function startStaticServer(rootDir, opts = {}) {
  const absRoot = path.resolve(rootDir);
  const rewrites = opts.rewrites || {};

  const server = http.createServer((req, res) => {
    try {
      const url = req.url.split('?')[0];
      if (typeof opts.onRequest === 'function') {
        try { opts.onRequest(req, url); } catch {}
      }

      // URL rewrites (SDK stubs)
      if (Object.prototype.hasOwnProperty.call(rewrites, url)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(rewrites[url]);
        return;
      }

      let filePath = url === '/' ? '/index.html' : url;
      let abs = path.join(absRoot, filePath);

      // Prevent path traversal — the resolved file must start with rootDir.
      if (!abs.startsWith(absRoot)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }

      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404); res.end('Not found: ' + url); return;
      }

      const ext = path.extname(abs).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(abs).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end('Server error: ' + e.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}
