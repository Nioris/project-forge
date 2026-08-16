#!/usr/bin/env node
/**
 * sync.mjs — canonical Forge sibling sync.
 *
 * One engine, multiple agent adapters: Claude + Codex + host-neutral runtime for additional terminal agents. Engine-controlled files are tracked
 * in .forge-managed.json inside each sibling project. On future syncs, files removed
 * from Forge are removed from projects ONLY if a previous Forge sync managed them;
 * user-created files are left alone.
 *
 * Usage: node scripts/sync.mjs [--game <name>] [--dry]
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, rmdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MANAGED_MANIFEST, snapshotPayload } from './forge-sync-spec.mjs';

const SCRIPT_ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ROOT = existsSync(join(SCRIPT_ROOT, '.claude-plugin', 'plugin.json')) ? SCRIPT_ROOT : resolve(process.cwd());
const PARENT = resolve(ROOT, '..');
const args = process.argv.slice(2);
const only = args.includes('--game') ? args[args.indexOf('--game') + 1] : null;
const dry = args.includes('--dry') || args.includes('/dry') || args.includes('-DryRun');
const ignoredStrict = args.includes('--strict') || args.includes('/strict') || args.includes('-Strict');

function nameOf(p) { return p.split(/[\\/]/).filter(Boolean).pop(); }

// Always rebuild generated command/docs/Codex surfaces before propagation.
if (!dry) {
  const generators = [
    'scripts/generate-agents-md.mjs',
    'scripts/sync-codex-adapter.mjs',
    'scripts/sync-dashboard-meta.mjs',
  ];
  for (const script of generators) {
    const r = spawnSync(process.execPath, [join(ROOT, script)], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`[X] Pre-sync generator failed: ${script}`);
      process.exit(r.status || 1);
    }
  }
}

const SKIP = new Set([nameOf(ROOT), 'node_modules', '.git', 'Release', 'output', 'AssetLibrary', 'forge-data']);
function isProject(p) {
  return existsSync(join(p, 'index.html')) || existsSync(join(p, 'CLAUDE.md'))
    || existsSync(join(p, 'GameIntegration')) || existsSync(join(p, '.claude')) || existsSync(join(p, '.agents'));
}
function listProjects() {
  return readdirSync(PARENT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
    .map(e => join(PARENT, e.name))
    .filter(p => nameOf(p) !== nameOf(ROOT) && isProject(p));
}

function sameFile(expected, dest) {
  return existsSync(dest) && expected.equals(readFileSync(dest));
}


function loadManaged(gameDir) {
  const p = join(gameDir, MANAGED_MANIFEST);
  if (!existsSync(p)) return { files: [], legacy: true };
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return { files: Array.isArray(data.files) ? data.files : [], legacy: false };
  } catch {
    return { files: [], legacy: true };
  }
}

function removeEmptyParents(filePath, stopDir) {
  let dir = dirname(filePath);
  while (dir.startsWith(stopDir) && dir !== stopDir) {
    try {
      if (readdirSync(dir).length) return;
      rmdirSync(dir);
      dir = dirname(dir);
    } catch { return; }
  }
}

function pruneManaged(gameDir, previousFiles, currentSet) {
  let removed = 0;
  for (const rel of previousFiles) {
    if (currentSet.has(rel)) continue;
    const p = join(gameDir, rel);
    if (!existsSync(p)) continue;
    try {
      if (statSync(p).isFile()) {
        if (!dry) {
          unlinkSync(p);
          removeEmptyParents(p, gameDir);
        }
        removed++;
      }
    } catch {}
  }
  return removed;
}

// Legacy one-time cleanup from pre-manifest Forge: only stale command wrapper files are safe
// to identify as engine-owned without a prior .forge-managed.json. Never delete custom skills.
function pruneLegacyCommands(gameDir) {
  const src = join(ROOT, '.claude', 'commands');
  const dst = join(gameDir, '.claude', 'commands');
  if (!existsSync(src) || !existsSync(dst)) return 0;
  const allowed = new Set(readdirSync(src));
  let removed = 0;
  for (const f of readdirSync(dst)) {
    if (allowed.has(f)) continue;
    const p = join(dst, f);
    try {
      if (!statSync(p).isFile()) continue;
      if (!dry) unlinkSync(p);
      removed++;
    } catch {}
  }
  return removed;
}

const projects = only ? [join(PARENT, only)] : listProjects();
if (only && !existsSync(projects[0])) { console.error('[X] Project folder not found:', projects[0]); process.exit(2); }
if (!projects.length) { console.log('No sibling Forge projects found next to', PARENT); process.exit(0); }

const version = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
let expanded;
try {
  expanded = snapshotPayload(ROOT);
} catch (err) {
  console.error('[X] Forge managed source disappeared while preparing the sync snapshot.');
  console.error('    This can happen when an external scanner/antivirus quarantines a generated adapter file.');
  console.error('    Rebuild the Codex adapter, review the security event, then retry.');
  console.error('    Source error:', err?.message || err);
  process.exit(3);
}
const managedFiles = expanded.map(x => x.destRel);
const currentSet = new Set(managedFiles);

console.log(`Forge v${version} -> sync ${projects.length} project(s)${dry ? ' [DRY RUN]' : ''}`);
if (ignoredStrict) console.log('  note: --strict is deprecated; managed-manifest sync is exact for Forge-owned files and preserves user files.');
console.log(`  managed payload: ${managedFiles.length} files\n`);

for (const gameDir of projects) {
  const previous = loadManaged(gameDir);
  let updated = 0;
  for (const item of expanded) {
    const dest = join(gameDir, item.destRel);
    if (!sameFile(item.content, dest)) {
      if (!dry) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, item.content);
      }
      updated++;
    }
  }

  const removed = previous.legacy
    ? pruneLegacyCommands(gameDir)
    : pruneManaged(gameDir, previous.files, currentSet);

  if (!dry) {
    const manifest = {
      schema: 1,
      forgeVersion: version,
      generatedBy: 'scripts/sync.mjs',
      files: managedFiles,
    };
    writeFileSync(join(gameDir, MANAGED_MANIFEST), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  const parts = [];
  if (updated) parts.push(`updated ${updated}`);
  if (removed) parts.push(`removed stale managed ${removed}`);
  if (previous.legacy) parts.push('managed manifest initialized');
  console.log(`  ${nameOf(gameDir).padEnd(24)} ${parts.length ? parts.join(', ') : 'up to date OK'}`);
}

console.log('\nDone. Restart active Claude Code/Codex/GigaCode sessions in updated projects so Forge rules/adapters are reloaded.');
