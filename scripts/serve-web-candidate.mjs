#!/usr/bin/env node
/** Serve an extracted Web release on loopback with browser-correct Godot MIME types. */
import fs from 'node:fs';
import path from 'node:path';
import { createLocalStaticServer, closeLocalStaticServer } from './lib/local-static-server.mjs';

function usage() {
  return 'Usage: node scripts/serve-web-candidate.mjs <extracted-web-directory> [--port <0..65535>] [--json]';
}

function parseArgs(argv) {
  let root = null; let port = 4173; let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') { json = true; continue; }
    if (arg === '--port') {
      if (!argv[index + 1]) throw new TypeError('--port requires a value');
      port = Number(argv[++index]);
      continue;
    }
    if (arg.startsWith('-')) throw new TypeError(`Unknown option: ${arg}`);
    if (root) throw new TypeError('Only one Web directory may be supplied');
    root = arg;
  }
  if (!root) throw new TypeError(usage());
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('--port must be an integer from 0 to 65535');
  const absolute = path.resolve(root);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) throw new TypeError(`Web directory is missing: ${absolute}`);
  if (!fs.existsSync(path.join(absolute, 'index.html'))) throw new TypeError(`Web directory has no root index.html: ${absolute}`);
  return { root: absolute, port, json };
}

let active = null;
try {
  const args = parseArgs(process.argv.slice(2));
  active = await createLocalStaticServer(args.root, { port: args.port });
  const result = { ok: true, url: active.url, root: active.root, bind: active.address.address, port: active.address.port };
  console.log(args.json ? JSON.stringify(result) : `[Forge] Web candidate: ${result.url}\n[Forge] Root: ${result.root}\n[Forge] Press Ctrl+C to stop.`);
  const stop = async () => { await closeLocalStaticServer(active.server); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: 'WEB_CANDIDATE_SERVER', message: error.message }));
  process.exitCode = 1;
}
