/**
 * @file services/security-log.js
 * @description Canonical way to record suspicious / abuse events.
 *   Writes to the `security_events` table so admins can triage attacks
 *   separately from real transactions, and dumps the same entry to stdout
 *   for PM2 log-following.
 *
 * Usage:
 *   const sec = require('../services/security-log');
 *   sec.log(req, { type: 'purchase_product_mismatch', severity: 'critical',
 *                   details: { productId, receiptProductId, invoiceId } });
 *
 * `req` can be null — pass what you have; everything is optional.
 *
 * Severity levels (admin UI colours):
 *   critical — known attack in progress (SKU swap, forged receipt)
 *   high     — likely attack (replay, cross-app receipt)
 *   medium   — abuse/anomaly (rate-limit hit, repeated failures)
 *   low      — observational (infra failures, client version mismatch)
 * @verified-against Node 20, SQLite (better-sqlite3), 152-ФЗ compliant
 * @verified-date 2026-04-25
 */
const { run } = require('../database');
const { hashIp, ipTag } = require('./ip-hash');

function log(req, { type, severity = 'medium', userId, details }) {
  // Store a one-way HMAC of the IP so the row remains useful for correlation
  // without holding PD under 152-ФЗ. Column keeps the `ip` name for back-compat
  // — it now contains the hash, not the raw address.
  const ipHash = req ? hashIp(req) : '';
  const ua = req && req.headers ? (req.headers['user-agent'] || null) : null;
  const uid = userId != null ? userId : (req && req.user ? req.user.id : null);
  const detailsJson = details ? safeJson(details) : null;

  try {
    run(
      'INSERT INTO security_events (user_id, event_type, severity, ip, user_agent, details) VALUES (?, ?, ?, ?, ?, ?)',
      [uid, type, severity, ipHash || null, ua, detailsJson]
    );
  } catch (e) {
    // Never let security logging itself break a request.
    console.error('[security-log] write failed:', e.message);
  }

  // Stdout log — 8-char hash tag only, so PM2 logs don't carry raw IPs.
  console.warn(
    '[security] ' + severity.toUpperCase() + ' ' + type
      + ' user=' + (uid != null ? '#' + uid : '?')
      + ' ip#=' + (ipTag(req) || '?')
      + (detailsJson ? ' details=' + detailsJson.slice(0, 300) : '')
  );
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return '{"error":"non-serializable"}';
  }
}

module.exports = { log };
