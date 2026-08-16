/**
 * @file verify-webappdata.mjs
 * @description Server-side HMAC-SHA256 verification of MAX `initData`.
 *              Copy into your bot/game server; call on every request that
 *              trusts user identity (auth, payments, save slots, leaderboards).
 *
 *              REF: https://dev.max.ru/docs/webapps/validation
 *              Derivation (verified against official dev.max.ru docs):
 *                secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)
 *                hash       = hex(HMAC_SHA256(secret_key, launch_params_joined_by_\n))
 *              NOTE: derivation differs from Telegram's — MAX uses
 *              "WebAppData" as the HMAC KEY (not message). Mixing the two
 *              schemes silently fails with mismatched hashes.
 *
 *   Usage:
 *     import { verifyMaxInitData } from './verify-webappdata.mjs';
 *
 *     app.post('/api/auth', async (req, res) => {
 *       const { initData } = req.body;       // from MaxSDK.getInitData() on client
 *       const result = verifyMaxInitData(initData, process.env.MAX_BOT_TOKEN, {
 *         maxAgeSeconds: 3600,              // reject launches older than 1 hour
 *       });
 *       if (!result.ok) return res.status(401).json({ error: result.reason });
 *       // Trust result.user, result.chat, result.query_id from here on
 *       req.maxUser = result.user;
 *       next();
 *     });
 */

import crypto from 'node:crypto';

/**
 * Verify MAX initData. Pass the raw `initData` string (not initDataUnsafe).
 *
 * @param {string} initData — raw URL-encoded string from MaxSDK.getInitData()
 * @param {string} botToken — bot token from business.max.ru/self
 * @param {Object} [opts]
 * @param {number} [opts.maxAgeSeconds=3600] — reject if auth_date is older than this
 * @returns {Object} { ok, reason?, user?, chat?, query_id?, start_param?, auth_date? }
 */
export function verifyMaxInitData(initData, botToken, opts = {}) {
  const maxAgeSeconds = typeof opts.maxAgeSeconds === 'number' ? opts.maxAgeSeconds : 3600;

  if (!initData || typeof initData !== 'string') {
    return { ok: false, reason: 'initData missing or not a string' };
  }
  if (!botToken || typeof botToken !== 'string') {
    return { ok: false, reason: 'botToken missing' };
  }

  // 1. Parse key=value pairs. Use URLSearchParams — it handles URL-encoded values.
  const params = new URLSearchParams(initData);
  const entries = [...params.entries()];

  // 2. Extract hash (must appear exactly once)
  const hashEntries = entries.filter(([k]) => k === 'hash');
  if (hashEntries.length !== 1) {
    return { ok: false, reason: `hash field appears ${hashEntries.length} times, expected 1` };
  }
  const providedHash = hashEntries[0][1];

  // 3. auth_date freshness check
  const authDateEntry = entries.find(([k]) => k === 'auth_date');
  if (!authDateEntry) {
    return { ok: false, reason: 'auth_date missing' };
  }
  const authDate = parseInt(authDateEntry[1], 10);
  if (!Number.isFinite(authDate)) {
    return { ok: false, reason: 'auth_date not a number' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > maxAgeSeconds) {
    return { ok: false, reason: `initData expired (age ${nowSec - authDate}s > ${maxAgeSeconds}s)` };
  }

  // 4. Build launch_params string. Sort by key alphabetically, skip hash,
  //    join with \n (0x0A). URLSearchParams already URL-decodes values for us.
  const launchParams = entries
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // 5. Derive secret_key: HMAC_SHA256("WebAppData", BOT_TOKEN)
  //    In Node's crypto API, createHmac(algo, key).update(message):
  //    key = "WebAppData", message = botToken.
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

  // 6. Compute hash: hex(HMAC_SHA256(secret_key, launch_params))
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(launchParams)
    .digest('hex');

  // 7. Constant-time comparison
  let matches;
  try {
    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(providedHash, 'hex');
    matches = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    matches = false;
  }

  if (!matches) {
    return { ok: false, reason: 'hash mismatch — initData forged or wrong bot token' };
  }

  // 8. Parse payload fields into typed result
  const userRaw = params.get('user');
  const chatRaw = params.get('chat');
  let user = null, chat = null;
  try { if (userRaw) user = JSON.parse(userRaw); } catch {}
  try { if (chatRaw) chat = JSON.parse(chatRaw); } catch {}

  return {
    ok: true,
    user,
    chat,
    query_id: params.get('query_id') || null,
    start_param: params.get('start_param') || null,
    auth_date: authDate,
  };
}
