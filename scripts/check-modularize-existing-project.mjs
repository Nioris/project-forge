#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'modularize-existing-project.mjs');
const root = mkdtempSync(join(tmpdir(), 'forge-modularize-'));
const game = join(root, 'WorkProgress', 'fixture');
mkdirSync(join(game, 'assets'), { recursive: true });

const padding = '/* deterministic fixture padding */\n'.repeat(1100);
const html = `<!doctype html>
<html><head><style>
body { background-image: url('assets/bg.png'); }
${padding}</style></head><body><main id="game"></main>
<script>
const state = { score: 0 };
// ======== RENDER ========
function render() { document.getElementById('game').textContent = String(state.score); }
// ======== INIT ========
render();
</script>
<script src="/sdk.js"></script>
<script>window.render_game_to_text = () => JSON.stringify(state);</script>
</body></html>\n`;
writeFileSync(join(game, 'index.html'), html, 'utf8');

function run(args) {
  return spawnSync(process.execPath, [script, 'WorkProgress/fixture/index.html', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
}
function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  const analysis = run(['--json']);
  assert(analysis.status === 0, analysis.stderr || 'analysis failed');
  assert(JSON.parse(analysis.stdout).monolith === true, 'fixture was not detected as a monolith');

  const apply = run(['--apply']);
  assert(apply.status === 0, `${apply.stdout}\n${apply.stderr}`);
  const check = run(['--check']);
  assert(check.status === 0, `${check.stdout}\n${check.stderr}`);

  const output = readFileSync(join(game, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'wiki', 'architecture', 'modules.json'), 'utf8'));
  assert(!/<style\b/i.test(output), 'inline style remained');
  assert(!/<script(?![^>]*\bsrc=)/i.test(output), 'inline script remained');
  assert(output.includes('styles/game.css'), 'external stylesheet missing');
  assert(output.indexOf('state-foundation.js') < output.indexOf('ui-render.js'), 'module order changed');
  assert(output.indexOf('ui-render.js') < output.indexOf('bootstrap.js'), 'bootstrap order changed');
  assert(manifest.state_owner?.endsWith('state-foundation.js'), 'state owner not documented');
  assert(manifest.modules.every(module => existsSync(resolve(root, module.path))), 'manifest references missing files');
  const css = readFileSync(join(game, 'styles', 'game.css'), 'utf8');
  assert(css.includes("url('../assets/bg.png')"), 'relative CSS URL was not rebased');
  assert(existsSync(resolve(root, manifest.backup)), 'source backup missing');

  const statePath = resolve(root, manifest.state_owner);
  writeFileSync(statePath, readFileSync(statePath, 'utf8') + '\nfunction fixtureFeature() { return state.score; }\n', 'utf8');
  const stale = run(['--check']);
  assert(stale.status !== 0 && /stale hash/.test(stale.stderr), 'stale module edit was not rejected');
  const refresh = run(['--refresh']);
  assert(refresh.status === 0, `${refresh.stdout}\n${refresh.stderr}`);
  const refreshedManifest = JSON.parse(readFileSync(join(root, 'wiki', 'architecture', 'modules.json'), 'utf8'));
  assert(refreshedManifest.modules.find(module => module.path === manifest.state_owner)?.symbols.includes('fixtureFeature'), 'refresh did not update symbols');

  const featurePath = join(game, 'js', '99-fixture-feature.js');
  writeFileSync(featurePath, 'function fixtureModule() { return state.score + 1; }\n', 'utf8');
  const orphan = run(['--check']);
  assert(orphan.status !== 0 && /orphan numbered module/.test(orphan.stderr), 'orphan feature module was not rejected');
  const connected = readFileSync(join(game, 'index.html'), 'utf8').replace('</body>', '<script src="js/99-fixture-feature.js"></script>\n</body>');
  writeFileSync(join(game, 'index.html'), connected, 'utf8');
  const unapproved = run(['--check']);
  assert(unapproved.status !== 0 && /absent from modules\.json/.test(unapproved.stderr), 'unapproved referenced module was not rejected');
  const adopt = run(['--refresh']);
  assert(adopt.status === 0, `${adopt.stdout}\n${adopt.stderr}`);
  const adoptedManifest = JSON.parse(readFileSync(join(root, 'wiki', 'architecture', 'modules.json'), 'utf8'));
  assert(adoptedManifest.modules.some(module => module.path.endsWith('99-fixture-feature.js') && module.role === 'fixture-feature'), 'refresh did not adopt the connected feature module');

  const other = join(root, 'WorkProgress', 'other');
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, 'index.html'), html, 'utf8');
  const foreignApply = spawnSync(process.execPath, [script, 'WorkProgress/other/index.html', '--apply'], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  assert(foreignApply.status !== 0 && /contract already belongs/.test(foreignApply.stderr), 'apply replaced another entrypoint contract');
  assert(JSON.parse(readFileSync(join(root, 'wiki', 'architecture', 'modules.json'), 'utf8')).source === 'WorkProgress/fixture/index.html', 'foreign apply changed active contract');
  console.log('[OK] modularize-existing-project: analyze/apply/check fixture passed');
  console.log(`[OK] ${manifest.modules.length} ordered modules, targeted routing, foreign-contract guard and safe feature-module adoption verified`);
} catch (error) {
  console.error(`[X] ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}
