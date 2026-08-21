/** Central secret discovery for Project Forge API profiles. Never prints secret values. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FORGE_ROOT = resolve(HERE, '..', '..');
export const WORKSPACE_ROOT = resolve(FORGE_ROOT, '..');
export const FORGE_DATA = process.env.FORGE_DATA_DIR ? resolve(process.env.FORGE_DATA_DIR) : join(WORKSPACE_ROOT, 'forge-data');
export const SECRETS_DIR = join(FORGE_DATA, 'secrets');
export const RUNTIME_DIR = join(FORGE_DATA, 'runtime');

export const PROVIDERS = {
  anthropic: { file: 'anthropic.key', env: 'ANTHROPIC_API_KEY', legacy: ['.anthropic_key'] },
  openai: { file: 'openai.key', env: 'OPENAI_API_KEY', legacy: ['.openai_key'] },
  gigachat: { file: 'gigachat.key', env: 'GIGACHAT_AUTH_KEY', legacy: ['.gigachat_key'] },
  gigasearch: { file: 'gigasearch.key', env: 'GIGASEARCH_API_KEY', legacy: ['.gigasearch_key'] },
  deepseek: { file: 'deepseek.key', env: 'DEEPSEEK_API_KEY', legacy: ['.deepseek_key'] },
  zai: { file: 'zai.key', env: 'ZAI_API_KEY', legacy: ['.zai_key'] },
  minimax: { file: 'minimax.key', env: 'MINIMAX_API_KEY', legacy: ['.minimax_key'] },
  openrouter: { file: 'openrouter.key', env: 'OPENROUTER_API_KEY', legacy: ['.openrouter_key'] },
};

export function ensureDataDirs() {
  mkdirSync(SECRETS_DIR, { recursive: true });
  mkdirSync(RUNTIME_DIR, { recursive: true });
}

function walkLegacy(start, names) {
  if (!start) return null;
  let cur = resolve(start);
  for (let i = 0; i < 8; i++) {
    for (const name of names || []) {
      const p = join(cur, name);
      if (existsSync(p)) {
        const value = readFileSync(p, 'utf8').trim();
        if (value) return { value, source: p };
      }
    }
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}

export function getProviderSecret(provider, project = FORGE_ROOT) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`Unknown secret provider: ${provider}`);
  const envValue = process.env[spec.env]?.trim();
  if (envValue) return { value: envValue, source: `env:${spec.env}` };
  const central = join(SECRETS_DIR, spec.file);
  if (existsSync(central)) {
    const value = readFileSync(central, 'utf8').trim();
    if (value) return { value, source: central };
  }
  return walkLegacy(project, spec.legacy);
}

export function secretPath(provider) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`Unknown secret provider: ${provider}`);
  return join(SECRETS_DIR, spec.file);
}

export function writeProviderSecret(provider, value) {
  const v = String(value || '').trim();
  if (!v) throw new Error('Refusing to write an empty secret');
  ensureDataDirs();
  const p = secretPath(provider);
  writeFileSync(p, v + '\n', { encoding: 'utf8', mode: 0o600 });
  return p;
}
