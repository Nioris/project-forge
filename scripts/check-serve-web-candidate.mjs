#!/usr/bin/env node
/** Regression checks for the localhost-only Web/Godot candidate server. */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createLocalStaticServer, closeLocalStaticServer, resolveLocalStaticAsset } from './lib/local-static-server.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-web-server-'));
const root = path.join(temp, 'root');
const outside = path.join(temp, 'outside');
const passed = []; const failed = [];
function check(value, label, detail = '') { (value ? passed : failed).push(value ? label : `${label}${detail ? `: ${detail}` : ''}`); }
function request(url, target) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const call = http.request({ hostname: parsed.hostname, port: parsed.port, method: 'GET', path: target }, response => {
      response.resume(); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers }));
    });
    call.on('error', reject); call.end();
  });
}

let active;
try {
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Forge</title>');
  fs.writeFileSync(path.join(root, 'index.audio.worklet.js'), 'class AudioWorklet {}');
  fs.writeFileSync(path.join(root, 'game.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  fs.writeFileSync(path.join(root, 'game.pck'), Buffer.from([1, 2, 3]));
  fs.writeFileSync(path.join(root, 'nested', 'asset.js'), 'export default true;');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');

  active = await createLocalStaticServer(root);
  check(active.address.address === '127.0.0.1', 'server binds only to IPv4 loopback', active.address.address);
  const index = await fetch(`${active.url}/`);
  check(index.status === 200 && (await index.text()).includes('Forge'), 'root serves index.html');
  const worklet = await fetch(`${active.url}/index.audio.worklet.js`);
  check(worklet.status === 200 && worklet.headers.get('content-type')?.startsWith('text/javascript'), 'audio worklet uses JavaScript MIME', worklet.headers.get('content-type'));
  const wasm = await fetch(`${active.url}/game.wasm`);
  check(wasm.status === 200 && wasm.headers.get('content-type') === 'application/wasm', 'WASM uses application/wasm', wasm.headers.get('content-type'));
  const nested = await fetch(`${active.url}/nested/asset.js`);
  check(nested.status === 200, 'regular nested asset is served');
  check(resolveLocalStaticAsset(root, '/../outside/secret.txt').status === 403, 'plain traversal is rejected before serving');
  check((await request(active.url, '/%2e%2e/outside/secret.txt')).status === 403, 'encoded traversal is rejected by HTTP server');
  check((await request(active.url, '/..%5coutside%5csecret.txt')).status === 403, 'backslash traversal is rejected by HTTP server');
  check((await request(active.url, '/%E0%A4%A')).status === 400, 'malformed URI returns 400 without crashing');

  let junctionTested = false;
  try {
    fs.symlinkSync(outside, path.join(root, 'escape'), 'junction');
    junctionTested = true;
    check((await request(active.url, '/escape/secret.txt')).status === 403, 'junction escape is rejected');
  } catch (error) {
    check(process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code), 'junction escape test unavailable only because Windows denied junction creation', error.message);
  }
  check(junctionTested || process.platform === 'win32', 'link-escape regression was exercised or explicitly platform-blocked');
} finally {
  if (active) await closeLocalStaticServer(active.server);
  for (const item of passed) console.log(`[OK] ${item}`);
  for (const item of failed) console.error(`[FAIL] ${item}`);
  fs.rmSync(temp, { recursive: true, force: true });
}
if (failed.length) { console.error(`Web candidate server regressions: ${failed.length} failed, ${passed.length} passed`); process.exit(1); }
console.log(`Web candidate server regressions: ${passed.length} passed`);
