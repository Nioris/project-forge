/**
 * @file sign-helper.mjs
 * @description Project Forge — VK Play signature verification for server-side.
 *
 *              VK Play passes a `hash` parameter when loading your iframe game.
 *              Before trusting any other params (uid, app_id, etc.) you MUST
 *              verify hash against your secret_key on your SERVER.
 *
 *              This module is server-only — DO NOT import it into client bundle.
 *              Put your secret_key in env (e.g. process.env.VKPLAY_SECRET_KEY)
 *              not in source code.
 *
 * @verified-against VK Play F2P signature spec, 2026
 */

import crypto from 'node:crypto';

/**
 * Verify the hash query param sent by VK Play matches the expected signature.
 *
 * Algorithm (per VK Play docs Sign Calculation):
 *   1. Take all query params EXCEPT 'hash'
 *   2. Sort keys alphabetically
 *   3. Concatenate as key1=value1&key2=value2&... (no leading separator)
 *   4. md5(concatenated + secret_key) → hex
 *   5. Compare to the received `hash`
 *
 * @param {object} params — all query params (object form, e.g. from URLSearchParams or Express req.query)
 * @param {string} secretKey — your project's secret_key from developers.vkplay.ru
 * @returns {boolean} true if signature is valid
 */
export function verifyVKPlayHash(params, secretKey) {
  if (!secretKey || typeof secretKey !== 'string') {
    throw new Error('verifyVKPlayHash: secretKey is required and must be a string');
  }
  if (!params || typeof params !== 'object') return false;

  const { hash, ...rest } = params;
  if (!hash || typeof hash !== 'string') return false;

  // Sorted key=value pairs, joined by &
  const sorted = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');

  const expected = crypto
    .createHash('md5')
    .update(sorted + secretKey)
    .digest('hex');

  // Constant-time comparison to avoid timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/**
 * Compute hash for OUTGOING VK Play API requests (callbacks, item grants).
 * Same algorithm but you produce the hash to put in your request.
 */
export function computeVKPlayHash(params, secretKey) {
  if (!secretKey) throw new Error('computeVKPlayHash: secretKey required');
  const { hash, ...rest } = params;
  const sorted = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');
  return crypto
    .createHash('md5')
    .update(sorted + secretKey)
    .digest('hex');
}

/**
 * Express-friendly middleware. Rejects unverified requests with 403.
 *
 *   import { vkplayAuthMiddleware } from './sign-helper.mjs';
 *   app.post('/api/auth/vkplay',
 *     vkplayAuthMiddleware(process.env.VKPLAY_SECRET_KEY),
 *     (req, res) => { ... });
 */
export function vkplayAuthMiddleware(secretKey) {
  return (req, res, next) => {
    const params = req.body && Object.keys(req.body).length ? req.body : req.query;
    if (!verifyVKPlayHash(params, secretKey)) {
      return res.status(403).json({ error: 'invalid VK Play signature' });
    }
    req.vkplayAuth = { uid: String(params.uid), appId: String(params.app_id) };
    next();
  };
}
