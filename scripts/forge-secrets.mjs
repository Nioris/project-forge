#!/usr/bin/env node
/** Manage Project Forge centralized API secret files without echoing values. */
import { readFileSync } from 'node:fs';
import { getProviderSecret, PROVIDERS, SECRETS_DIR, secretPath, writeProviderSecret, ensureDataDirs } from './lib/forge-secrets.mjs';

const args = process.argv.slice(2);
const cmd = args[0] || 'status';
const provider = args[1];
ensureDataDirs();

if (cmd === 'path') {
  console.log(provider ? secretPath(provider) : SECRETS_DIR);
  process.exit(0);
}
if (cmd === 'status') {
  console.log(`Forge secrets: ${SECRETS_DIR}`);
  for (const name of Object.keys(PROVIDERS)) {
    const x = getProviderSecret(name, process.cwd());
    console.log(`  ${name.padEnd(10)} ${x ? 'configured' : 'missing'}${x ? `  [${x.source}]` : ''}`);
  }
  process.exit(0);
}
if (cmd === 'set') {
  if (!provider || !PROVIDERS[provider]) { console.error(`Usage: forge-secrets.mjs set <${Object.keys(PROVIDERS).join('|')}> --stdin|--from-file <path>`); process.exit(2); }
  let value = '';
  if (args.includes('--stdin')) value = readFileSync(0, 'utf8');
  else {
    const i = args.indexOf('--from-file');
    if (i >= 0 && args[i + 1]) value = readFileSync(args[i + 1], 'utf8');
    else { console.error('Provide --stdin or --from-file <path>. Secret values are never accepted as command-line arguments.'); process.exit(2); }
  }
  const p = writeProviderSecret(provider, value);
  console.log(`[OK] ${provider} secret stored in ${p}`);
  process.exit(0);
}
console.error('Commands: status | path [provider] | set <provider> --stdin|--from-file <path>');
process.exit(2);
