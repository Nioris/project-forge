/** Shared GigaChat API helpers for Project Forge. Node built-ins only. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getProviderSecret } from './forge-secrets.mjs';

export const GIGA_API_BASE = 'https://api.giga.chat';
export const GIGA_OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';

export function findSecret(project, envName, fileName) {
  if (process.env[envName]?.trim()) return process.env[envName].trim();
  let cur = project;
  for (let i = 0; i < 8; i++) {
    const p = join(cur, fileName);
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}

export async function getAccessToken(project) {
  const direct = findSecret(project, 'GIGACHAT_ACCESS_TOKEN', '.gigachat_token');
  if (direct) return { token: direct, source: 'access-token' };
  const authFound = getProviderSecret('gigachat', project);
  const authKey = authFound?.value || findSecret(project, 'GIGACHAT_AUTH_KEY', '.gigachat_key');
  if (!authKey) throw new Error('GigaChat credentials missing. Put the Authorization Key in forge-data/secrets/gigachat.key, set GIGACHAT_AUTH_KEY, or use legacy .gigachat_key; alternatively set short-lived GIGACHAT_ACCESS_TOKEN.');
  const scope = process.env.GIGACHAT_SCOPE?.trim() || 'GIGACHAT_API_PERS';
  const allowed = new Set(['GIGACHAT_API_PERS', 'GIGACHAT_API_B2B', 'GIGACHAT_API_CORP']);
  if (!allowed.has(scope)) throw new Error(`Unsupported GIGACHAT_SCOPE: ${scope}`);
  const body = new URLSearchParams({ scope });
  let res;
  try {
    res = await fetch(GIGA_OAUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'RqUID': randomUUID(),
        'Authorization': `Basic ${authKey}`,
      },
      body,
    });
  } catch (e) {
    throw new Error(`GigaChat OAuth network/TLS error: ${e.message}. Forge does not disable TLS validation; install the official trusted certificate chain if your environment requires it.`);
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || !data?.access_token) throw new Error(data?.message || data?.error_description || `GigaChat OAuth HTTP ${res.status}`);
  return { token: data.access_token, source: 'oauth', expiresAt: data.expires_at || null };
}

export async function gigaJson(token, path, body, timeoutMs = 180000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GIGA_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data?.message || data?.error?.message || `GigaChat HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`GigaChat request timed out after ${timeoutMs} ms`);
    throw e;
  } finally { clearTimeout(timer); }
}

export async function downloadGigaFile(token, fileId, accept = '*/*', timeoutMs = 180000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GIGA_API_BASE}/v1/files/${encodeURIComponent(fileId)}/content`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': accept }, signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GigaChat file download HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`GigaChat file download timed out after ${timeoutMs} ms`);
    throw e;
  } finally { clearTimeout(timer); }
}
