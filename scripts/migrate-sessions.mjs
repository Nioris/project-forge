/**
 * @file migrate-sessions.mjs
 * @description One-time migration — moves flat wiki/sessions/YYYY-MM-DD.md
 *              files into nested wiki/sessions/YYYY/MM/DD.md structure.
 *
 *              Safe to run multiple times. If target exists, the source is
 *              left alone and a warning is printed. No files are deleted
 *              unless the move succeeded.
 *
 *              Usage:
 *                node scripts/migrate-sessions.mjs
 *                node scripts/migrate-sessions.mjs --dry-run
 */

import { readdirSync, existsSync, mkdirSync, renameSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sessDir = join(root, 'wiki', 'sessions');

const dryRun = process.argv.includes('--dry-run');

function migrate() {
  if (!existsSync(sessDir)) {
    console.log('(no wiki/sessions/ directory — nothing to migrate)');
    return;
  }

  let entries;
  try { entries = readdirSync(sessDir); }
  catch (e) {
    console.error('Cannot read wiki/sessions/:', e.message);
    process.exit(1);
  }

  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (const name of entries) {
    const m = name.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
    if (!m) continue;
    const [, yyyy, mm, dd] = m;
    const src = join(sessDir, name);
    if (!statSync(src).isFile()) continue;

    const targetDir = join(sessDir, yyyy, mm);
    const targetFile = join(targetDir, `${dd}.md`);

    if (existsSync(targetFile)) {
      console.log(`⚠ skip ${name} — target already exists: ${yyyy}/${mm}/${dd}.md`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`would move ${name} → ${yyyy}/${mm}/${dd}.md`);
      moved++;
      continue;
    }

    try {
      mkdirSync(targetDir, { recursive: true });
      renameSync(src, targetFile);
      console.log(`✓ ${name} → ${yyyy}/${mm}/${dd}.md`);
      moved++;
    } catch (e) {
      console.error(`✗ ${name}: ${e.message}`);
      errors++;
    }
  }

  console.log('');
  console.log(`Moved:   ${moved}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
  if (dryRun) console.log('(dry run — no files changed)');

  if (errors > 0) process.exit(1);
}

migrate();
