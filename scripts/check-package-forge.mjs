#!/usr/bin/env node
/** Regression: informational/invalid package CLI calls must never create a release artifact. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-package-cli-'));
const helpArtifact = path.join(temp, 'help-must-not-build.zip');
const invalidArtifact = path.join(temp, 'invalid-must-not-build.zip');
const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) failures.push(message);
};

try {
  const help = spawnSync(process.execPath, [path.join(root, 'scripts', 'package-forge.mjs'), helpArtifact, '--help'], {
    cwd: root,
    encoding: 'utf8',
  });
  check(help.status === 0 && /Usage: node scripts\/package-forge\.mjs/.test(help.stdout),
    '--help exits successfully and prints usage');
  check(!fs.existsSync(helpArtifact), '--help cannot create a ZIP even when an output path is supplied');

  const invalid = spawnSync(process.execPath, [path.join(root, 'scripts', 'package-forge.mjs'), invalidArtifact, '--unknown'], {
    cwd: root,
    encoding: 'utf8',
  });
  check(invalid.status === 2 && /Unknown option/.test(invalid.stderr), 'unknown options fail closed');
  check(!fs.existsSync(invalidArtifact), 'an invalid package command cannot create a ZIP');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n[X] package CLI regression failed (${failures.length})`);
  process.exit(1);
}
console.log('\n[OK] package CLI informational and invalid calls are side-effect free');
