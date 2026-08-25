#!/usr/bin/env node
/** Test-only fake Godot exporter. Never used unless FORGE_ALLOW_TEST_HARNESS=1. */
import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const target = args.at(-1); const mode = process.env.FORGE_GODOT_EXPORT_MODE || 'pass';
if (args.includes('--version')) { console.log('4.7.test.export.fixture'); process.exit(0); }
if (mode === 'missing-templates') { console.error('Export templates are missing'); process.exit(1); }
if (mode === 'export-fail') { console.error('Export failed'); process.exit(1); }
if (!target) process.exit(2);
const barrier = String(process.env.FORGE_GODOT_EXPORT_BARRIER || '').trim();
if (barrier && args.includes('--export-release')) {
  fs.mkdirSync(barrier, { recursive: true });
  fs.writeFileSync(path.join(barrier, `ready-${process.pid}`), '', { flag: 'wx' });
  const deadline = Date.now() + 10_000;
  while (fs.readdirSync(barrier).filter(name => name.startsWith('ready-')).length < 2 && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  if (fs.readdirSync(barrier).filter(name => name.startsWith('ready-')).length < 2) {
    console.error('Test export barrier timed out'); process.exit(3);
  }
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, mode === 'bad-artifact' ? '' : `fake exe ${args.includes('--export-debug') ? 'debug' : 'release'}`);
if (mode !== 'missing-pck') fs.writeFileSync(path.join(path.dirname(target), `${path.basename(target, path.extname(target))}.pck`), mode === 'bad-artifact' ? '' : 'fake pck');
console.log('Export completed');
