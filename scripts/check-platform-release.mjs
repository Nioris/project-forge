#!/usr/bin/env node
/**
 * @description Verify the selected storefront release matrix at local or submit level.
 */
import path from 'node:path';
import { verifyPlatformReleases } from './platform-release-verify.mjs';

function parseArgs(argv) {
  const options = { projectRoot: '.', level: 'local', json: false };
  let rootSeen = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--level') options.level = argv[++index];
    else if (arg.startsWith('--level=')) options.level = arg.slice('--level='.length);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!rootSeen) { options.projectRoot = arg; rootSeen = true; }
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!['local', 'submit'].includes(options.level)) throw new Error(`Unsupported verification level: ${options.level}`);
  options.projectRoot = path.resolve(options.projectRoot);
  return options;
}

function print(result) {
  console.log(`Storefront release matrix: ${result.ok ? 'PASS' : 'BLOCKED'} (${result.level})`);
  if (result.version) console.log(`Version: ${result.version}`);
  console.log(`Targets: ${result.targets.map(item => item?.target || String(item)).join(', ') || '(none)'}`);
  for (const failure of result.failures) console.log(`  [${failure.code}] ${failure.target ? `${failure.target}: ` : ''}${failure.message}`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = verifyPlatformReleases(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else print(result);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  const value = { ok: false, code: error.code || 'PLATFORM_RELEASE_USAGE', message: error.message };
  if (process.argv.includes('--json')) console.log(JSON.stringify(value, null, 2));
  else console.error(`[${value.code}] ${value.message}`);
  process.exitCode = 2;
}
