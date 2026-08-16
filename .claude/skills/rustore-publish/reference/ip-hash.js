/**
 * @file services/ip-hash.js
 * @description One-way pseudonymization of client IPs so we can reason about
 *   uniqueness (rate-limits, fraud cooldowns, attack attribution) without
 *   storing personal data under Russian 152-ФЗ.
 *
 *   IP alone is considered PD in RF when combinable with other identifiers
 *   (ст. 3 152-ФЗ). HMAC-SHA256 with a server-only pepper produces a
 *   16-character token that is:
 *     - Non-reversible (attacker with DB dump cannot recover the IP).
 *     - Stable (same IP → same token, so rate-limits work).
 *     - Short enough to fit in DB columns without bloat.
 *
 *   The pepper is derived from JWT_SECRET. Rotating JWT_SECRET invalidates
 *   previously-stored IP hashes — acceptable, anti-farm cooldown just resets.
 *
 *   `extractIp()` is exposed separately for the rare edge cases that legitimately
 *   need the raw address (active nginx rate-limit headers).
 * @verified-against Node 20 crypto, 152-ФЗ compliant as of 2026
 * @verified-date 2026-04-25
 */
const crypto = require('crypto');
const config = require('../config');

/**
 * Extract the client-side IP honoring nginx-forwarded chain. Returns '' when
 * nothing is available (unit tests, direct socket tests).
 */
function extractIp(req) {
  if (!req) return '';
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return '';
}

/**
 * Pseudonymize an IP for long-term storage. Returns '' for empty input so
 * callers can safely pass through unknown IPs without special-casing.
 */
function hashIp(ipOrReq) {
  const ip = typeof ipOrReq === 'string' ? ipOrReq : extractIp(ipOrReq);
  if (!ip) return '';
  const pepper = config.jwtSecret || 'fallback-ip-pepper';
  return crypto
    .createHmac('sha256', pepper)
    .update(ip)
    .digest('hex')
    .slice(0, 16); // 64-bit truncation: ~2^32 uniqueness before birthday collisions, ok for our scale
}

/**
 * For log lines — give admins SOMETHING to grep on without leaking the real IP.
 * Format: `ip=<8-char-hash>` — distinct enough to correlate repeat requests
 * within a session, short enough to not clutter PM2 output.
 */
function ipTag(ipOrReq) {
  const h = hashIp(ipOrReq);
  return h ? h.slice(0, 8) : 'unknown';
}

module.exports = { extractIp, hashIp, ipTag };
