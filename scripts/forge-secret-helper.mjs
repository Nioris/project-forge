#!/usr/bin/env node
/** Print one provider secret to stdout for native CLI credential helpers. Do not use interactively. */
import { getProviderSecret } from './lib/forge-secrets.mjs';
const provider = process.argv[2];
if (!provider) { console.error('Usage: forge-secret-helper.mjs <anthropic|openai|gigachat>'); process.exit(2); }
const found = getProviderSecret(provider, process.cwd());
if (!found?.value) { console.error(`[X] ${provider} secret not found`); process.exit(3); }
process.stdout.write(found.value);
