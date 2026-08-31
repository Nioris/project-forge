import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.pck', 'application/octet-stream'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.ogg', 'audio/ogg'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
]);

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function contentTypeForLocalAsset(file) {
  return MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
}

/** Resolve a request target without following a path or link outside the selected root. */
export function resolveLocalStaticAsset(root, requestTarget = '/') {
  let realRoot;
  try {
    realRoot = fs.realpathSync(path.resolve(root));
    if (!fs.statSync(realRoot).isDirectory()) return { status: 500, reason: 'root-not-directory' };
  } catch {
    return { status: 500, reason: 'root-unavailable' };
  }

  const raw = String(requestTarget || '/').split(/[?#]/u, 1)[0] || '/';
  let decoded;
  try { decoded = decodeURIComponent(raw); }
  catch { return { status: 400, reason: 'malformed-uri' }; }
  if (decoded.includes('\0') || /[\u0000-\u001f\u007f]/u.test(decoded)) return { status: 400, reason: 'invalid-path' };
  if (decoded.includes('\\')) return { status: 403, reason: 'backslash-traversal' };

  const segments = decoded.replace(/^\/+|\/+$/gu, '').split('/').filter(Boolean);
  if (segments.some(segment => segment === '..' || segment.includes(':'))) return { status: 403, reason: 'path-traversal' };
  const safeSegments = segments.filter(segment => segment !== '.');
  let lexical = path.resolve(realRoot, ...safeSegments);
  if (!inside(realRoot, lexical)) return { status: 403, reason: 'path-escape' };

  let stat;
  try { stat = fs.statSync(lexical); }
  catch { return { status: 404, reason: 'missing' }; }
  if (stat.isDirectory()) lexical = path.join(lexical, 'index.html');

  let realFile;
  try { realFile = fs.realpathSync(lexical); }
  catch { return { status: 404, reason: 'missing' }; }
  if (!inside(realRoot, realFile)) return { status: 403, reason: 'link-escape' };
  try { stat = fs.statSync(realFile); }
  catch { return { status: 404, reason: 'missing' }; }
  if (!stat.isFile()) return { status: 404, reason: 'not-a-file' };
  return { status: 200, file: realFile, bytes: stat.size, contentType: contentTypeForLocalAsset(realFile) };
}

function respondText(response, status, message, headOnly = false) {
  const body = Buffer.from(`${message}\n`, 'utf8');
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(headOnly ? undefined : body);
}

export async function createLocalStaticServer(root, { port = 0, host = '127.0.0.1' } = {}) {
  if (host !== '127.0.0.1' && host !== '::1') throw new TypeError('Local static server may bind only to a loopback address');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('port must be an integer from 0 to 65535');
  const realRoot = fs.realpathSync(path.resolve(root));
  if (!fs.statSync(realRoot).isDirectory()) throw new TypeError(`Web root is not a directory: ${realRoot}`);

  const server = http.createServer((request, response) => {
    const headOnly = request.method === 'HEAD';
    if (request.method !== 'GET' && !headOnly) {
      response.setHeader('Allow', 'GET, HEAD');
      respondText(response, 405, 'Method Not Allowed', headOnly);
      return;
    }
    const resolved = resolveLocalStaticAsset(realRoot, request.url || '/');
    if (resolved.status !== 200) {
      const label = resolved.status === 400 ? 'Bad Request' : resolved.status === 403 ? 'Forbidden' : resolved.status === 404 ? 'Not Found' : 'Server Error';
      respondText(response, resolved.status, label, headOnly);
      return;
    }
    response.writeHead(200, {
      'Content-Type': resolved.contentType,
      'Content-Length': resolved.bytes,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (headOnly) response.end();
    else fs.createReadStream(resolved.file).on('error', () => response.destroy()).pipe(response);
  });

  await new Promise((resolve, reject) => {
    const onError = error => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host, port, exclusive: true });
  });
  const address = server.address();
  const urlHost = address.address.includes(':') ? `[${address.address}]` : address.address;
  return { server, root: realRoot, url: `http://${urlHost}:${address.port}`, address };
}

export async function closeLocalStaticServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
