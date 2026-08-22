#!/usr/bin/env node
/** Build one immutable Project Forge ZIP from the canonical MANIFEST. */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const output = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || join(root, '..', `project-forge-v${version}.zip`));
const replaceIncomplete = process.argv.includes('--replace-incomplete');

const manifest = readFileSync(join(root, 'MANIFEST.txt'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const files = ['MANIFEST.txt', ...manifest];
const missing = files.filter(path => !existsSync(join(root, path)));
if (missing.length) {
  console.error(`[X] MANIFEST references missing files: ${missing.slice(0, 12).join(', ')}`);
  process.exit(2);
}

function archiveContainsAll(path) {
  const verifyRoot = mkdtempSync(join(tmpdir(), 'forge-package-verify-'));
  try {
    const extracted = spawnSync(
      process.platform === 'win32' ? 'tar.exe' : 'unzip',
      process.platform === 'win32' ? ['-xf', path, '-C', verifyRoot] : ['-q', path, '-d', verifyRoot],
      { encoding: 'utf8' },
    );
    return extracted.status === 0 && files.every(file => existsSync(join(verifyRoot, file)));
  } finally {
    rmSync(verifyRoot, { recursive: true, force: true });
  }
}

if (existsSync(output)) {
  if (!replaceIncomplete) {
    console.error(`[X] Refusing to overwrite immutable release artifact: ${output}`);
    process.exit(2);
  }
  const incomplete = !archiveContainsAll(output);
  if (!incomplete) {
    console.error(`[X] Existing artifact is complete and immutable; replacement refused: ${output}`);
    process.exit(2);
  }
  rmSync(output, { force: true });
  console.log(`[i] Removed incomplete artifact from the failed packaging attempt: ${output}`);
}

const temp = mkdtempSync(join(tmpdir(), 'forge-package-'));
const stage = join(temp, 'stage');
try {
  // Stage only manifest-owned files. This avoids Windows bsdtar's broken UTF-8
  // -T parsing for the Cyrillic command reference and makes archive scope exact.
  mkdirSync(stage, { recursive: true });
  for (const path of files) {
    const destination = join(stage, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, path), destination);
  }
  const command = process.platform === 'win32' ? 'tar.exe' : 'zip';
  const args = process.platform === 'win32'
    ? ['-a', '-cf', output, '.']
    : ['-qr', output, '.'];
  const built = spawnSync(command, args, {
    cwd: stage,
    encoding: 'utf8',
  });
  if (built.status !== 0) {
    if (existsSync(output)) rmSync(output, { force: true });
    console.error(`[X] ZIP creation failed: ${(built.stderr || built.stdout || `exit ${built.status}`).trim()}`);
    process.exit(1);
  }

  if (!archiveContainsAll(output)) throw new Error('ZIP extraction verification failed or one or more manifest files are missing');

  console.log(`[OK] packaged Project Forge v${version}: ${output}`);
  console.log(`[OK] ${files.length} manifest-bound files, ${statSync(output).size} bytes, archive root verified`);
} catch (error) {
  if (existsSync(output)) rmSync(output, { force: true });
  console.error(`[X] ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
