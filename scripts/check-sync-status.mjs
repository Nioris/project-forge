#!/usr/bin/env node
/** Independent sibling-sync verifier for the canonical managed payload. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGED_MANIFEST, expandPayload } from './forge-sync-spec.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const PARENT = path.dirname(ROOT);
const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const FIX = args.includes('--fix');

function same(a, b) { return fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b)); }
function isProject(p) { return fs.existsSync(path.join(p, '.claude')) || fs.existsSync(path.join(p, '.agents')) || fs.existsSync(path.join(p, 'GameIntegration')); }
const siblings = fs.readdirSync(PARENT, { withFileTypes: true })
  .filter(e => e.isDirectory() && path.resolve(PARENT, e.name) !== ROOT)
  .map(e => ({ name: e.name, path: path.join(PARENT, e.name) }))
  .filter(x => isProject(x.path));

if (!siblings.length) {
  if (JSON_MODE) console.log(JSON.stringify({ ok: true, projects: [] }, null, 2));
  else console.log('No sibling Forge projects found.');
  process.exit(0);
}

const payload = expandPayload(ROOT);
const expected = new Set(payload.map(x => x.destRel));
const version = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const reports = [];

for (const sib of siblings) {
  const missing = [], outdated = [], staleManaged = [];
  for (const item of payload) {
    const dest = path.join(sib.path, item.destRel);
    if (!fs.existsSync(dest)) missing.push(item.destRel);
    else if (!same(item.sourceAbs, dest)) outdated.push(item.destRel);
  }
  const mp = path.join(sib.path, MANAGED_MANIFEST);
  let manifest = null;
  if (fs.existsSync(mp)) {
    try { manifest = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch {}
  }
  if (manifest && Array.isArray(manifest.files)) {
    for (const rel of manifest.files) if (!expected.has(rel) && fs.existsSync(path.join(sib.path, rel))) staleManaged.push(rel);
  }
  const ok = !missing.length && !outdated.length && !staleManaged.length && manifest?.forgeVersion === version;
  reports.push({ name: sib.name, ok, manifestVersion: manifest?.forgeVersion || null, missing, outdated, staleManaged });
}

if (FIX && reports.some(r => !r.ok)) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'sync.mjs')], { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status || 0);
}

if (JSON_MODE) console.log(JSON.stringify({ ok: reports.every(r => r.ok), forgeVersion: version, projects: reports }, null, 2));
else {
  console.log(`Forge v${version} sibling sync audit\n`);
  for (const r of reports) {
    console.log(`${r.ok ? '[OK]' : '[X] '} ${r.name}  manifest=${r.manifestVersion || 'missing'}  missing=${r.missing.length} outdated=${r.outdated.length} stale=${r.staleManaged.length}`);
    for (const x of r.missing.slice(0, 5)) console.log(`     missing: ${x}`);
    for (const x of r.outdated.slice(0, 5)) console.log(`     outdated: ${x}`);
    for (const x of r.staleManaged.slice(0, 5)) console.log(`     stale managed: ${x}`);
  }
}
process.exit(reports.every(r => r.ok) ? 0 : 1);
