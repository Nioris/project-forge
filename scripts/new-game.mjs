#!/usr/bin/env node
/** Backward-compatible wrapper. Canonical creator is new-project.mjs. */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a, i, all) => a !== '--type' && all[i-1] !== '--type');
const r = spawnSync(process.execPath, [join(dir, 'new-project.mjs'), ...args, '--type', 'game'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
