#!/usr/bin/env node
/** Test-only exporter for the Web/Android builder. */
import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); if (args.includes('--version')) { console.log('4.7.fixture.web-android'); process.exit(0); }
const target = args.at(-1); const mode = process.env.FORGE_GODOT_MULTI_TEST_MODE || 'pass';
if (mode === 'fail') { console.error('Export failed'); process.exit(1); }
if (mode === 'timeout') for (;;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
if (args.includes('--install-android-build-template')) {
  fs.mkdirSync(path.join(process.cwd(), 'android', 'build'), { recursive: true });
  console.log('Android build template installed');
  if (!args.includes('--export-debug') && !args.includes('--export-release')) process.exit(0);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
if (target.endsWith('.html')) { fs.writeFileSync(target, '<!doctype html>'); fs.writeFileSync(path.join(path.dirname(target), 'index.js'), 'runtime'); fs.writeFileSync(path.join(path.dirname(target), 'index.wasm'), 'wasm'); }
else { fs.writeFileSync(target, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])); }
