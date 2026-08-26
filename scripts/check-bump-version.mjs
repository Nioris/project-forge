#!/usr/bin/env node
/** Offline regression: informational/invalid version commands must never mutate a Forge tree. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-bump-version-'));
const fixture = path.join(tempRoot, 'project-forge');
const failures = [];
let passed = 0;

function check(condition, message, details = '') {
  if (condition) { passed++; console.log(`  ✓ ${message}`); }
  else failures.push(`${message}${details ? `: ${details}` : ''}`);
}

function copyFixture() {
  fs.cpSync(ROOT, fixture, {
    recursive: true,
    filter: source => !['.git', 'node_modules'].includes(path.basename(source)),
  });
}

function treeHash(root) {
  const hash = crypto.createHash('sha256');
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      hash.update(`${entry.isDirectory() ? 'D' : entry.isFile() ? 'F' : 'X'}:${relative}\0`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) hash.update(fs.readFileSync(absolute));
      else hash.update(fs.readlinkSync(absolute));
    }
  }
  visit(root);
  return hash.digest('hex');
}

function run(argv) {
  return spawnSync(process.execPath, [path.join(fixture, 'scripts', 'bump-version.mjs'), ...argv], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
}

function unchangedRun(argv, expectation, label) {
  const before = treeHash(fixture);
  const result = run(argv);
  const after = treeHash(fixture);
  check(expectation(result) && before === after, label, `${result.stdout}\n${result.stderr}`);
}

try {
  copyFixture();
  const current = JSON.parse(fs.readFileSync(path.join(fixture, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const parts = current.split('.').map(Number);
  const target = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  unchangedRun([target, '--dry-run'], result => result.status === 0 && /DRY RUN/u.test(result.stdout),
    '--dry-run is a side-effect-free alias');
  unchangedRun([target, '--dry'], result => result.status === 0 && /DRY RUN/u.test(result.stdout),
    '--dry remains side-effect-free');
  unchangedRun([target, '--dry-ish'], result => result.status === 2 && /Unknown option/u.test(result.stderr),
    'unknown options fail before mutation');
  unchangedRun([target, '--help'], result => result.status === 0 && /Usage:/u.test(result.stdout),
    '--help is side-effect-free even with a target');
  unchangedRun(['--current', target], result => result.status === 2 && /cannot be combined/u.test(result.stderr),
    'ambiguous current/target mode fails before mutation');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`[X] bump-version regression: ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`[OK] bump-version informational and invalid calls are side-effect free (${passed} checks)`);
