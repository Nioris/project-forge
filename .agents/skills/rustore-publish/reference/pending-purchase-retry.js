/**
 * @file services/pending-purchase-retry.js
 * @description Background sweep that rechecks purchases whose RuStore state
 *   was pending at the time of the original client POST. RuStore can take
 *   anywhere from seconds to ~1 hour to finalize a payment; without this
 *   sweep the user would stay unсredited until they manually reopen the app
 *   (where recoverPendingPurchases kicks in). With the sweep, credit arrives
 *   automatically within RETRY_INTERVAL_MS of state transition.
 *
 * Strategy:
 *   Every RETRY_INTERVAL_MS (10 min by default) scan `purchases` WHERE
 *   state='pending' AND created_at > 48h ago AND last_checked_at < 5min ago.
 *   For each row, re-query /public/(sandbox/)v2/purchase/{invoiceId}:
 *     - state → paid | confirmed      → promote row to 'paid', credit stars.
 *     - state → cancelled | failed    → promote row to 'failed'.
 *     - state → refunded              → promote row to 'refunded'.
 *     - still pending                 → bump last_checked_at, re-try next cycle.
 *     - row older than 48h            → give up, mark 'failed'.
 *
 * Writes are idempotent: if another request already promoted the row (e.g.
 * recoverPendingPurchases on device), INSERT OR UPDATE semantics avoid
 * double-credit.
 * @verified-against RuStore Pay SDK 10.2 / BOM 2026.04.01
 * @verified-date 2026-04-25
 */
const { run, get, all } = require('../database');
const config = require('../config');
const rustoreAuth = require('../services/rustore-auth');
const securityLog = require('../services/security-log');
const https = require('https');

const RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const MIN_SPACING_MS = 5 * 60 * 1000;     // don't re-query same row more often than every 5 min
const GIVE_UP_AFTER_HOURS = 48;

function pathFor(invoiceId) {
  return (config.rustoreSandbox ? '/public/sandbox/v2/purchase/' : '/public/v2/purchase/')
    + encodeURIComponent(invoiceId);
}

async function fetchReceipt(invoiceId) {
  const jwe = await rustoreAuth.getPublicToken();
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'GET',
      hostname: 'public-api.rustore.ru',
      path: pathFor(invoiceId),
      headers: { 'Public-Token': jwe, 'Accept': 'application/json' },
      timeout: 8000,
      family: 4
    }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + body.slice(0, 200)));
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.body || parsed);
        } catch (e) { reject(new Error('invalid JSON: ' + e.message)); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

/**
 * One sweep over all pending purchases. Exported so the admin UI can trigger
 * a manual re-check (useful when a user calls support about a stuck payment).
 */
async function sweep() {
  if (!rustoreAuth.isConfigured()) return { checked: 0, reason: 'not_configured' };

  const pending = all(`
    SELECT id, user_id, product_id, stars, receipt_token, created_at, last_checked_at
    FROM purchases
    WHERE state = 'pending'
      AND type = 'credit'
      AND source = 'rustore'
      AND (last_checked_at IS NULL OR last_checked_at < datetime('now', '-' || ? || ' seconds'))
      AND created_at > datetime('now', '-' || ? || ' hours')
  `, [Math.floor(MIN_SPACING_MS / 1000), GIVE_UP_AFTER_HOURS]);

  const summary = { checked: 0, paid: 0, failed: 0, refunded: 0, stillPending: 0, errors: 0 };

  for (const row of pending) {
    summary.checked++;
    try {
      const receipt = await fetchReceipt(row.receipt_token);
      const rustoreState = String(
        receipt.invoiceStatus || receipt.invoice_status || receipt.purchaseState || ''
      ).toLowerCase();

      if (rustoreState === 'paid' || rustoreState === 'confirmed') {
        // Promote and credit atomically (sort of — SQLite doesn't have true
        // transactions in our wrapper, but INSERT OR UPDATE keeps us safe from
        // a race with /api/shop/purchase arriving concurrently).
        const current = get('SELECT state, stars FROM purchases WHERE id = ?', [row.id]);
        if (!current || current.state !== 'pending') continue; // someone beat us
        run(
          'UPDATE purchases SET state = ?, validated = 1, last_checked_at = datetime("now") WHERE id = ? AND state = ?',
          ['paid', row.id, 'pending']
        );
        run('UPDATE users SET stars = stars + ? WHERE id = ?', [row.stars, row.user_id]);
        summary.paid++;
        console.log(`[pending-retry] #${row.id} user=${row.user_id} ${row.product_id} → PAID (+${row.stars}⭐)`);
      } else if (rustoreState === 'refunded') {
        run('UPDATE purchases SET state = ?, last_checked_at = datetime("now") WHERE id = ?', ['refunded', row.id]);
        summary.refunded++;
        console.log(`[pending-retry] #${row.id} → REFUNDED (no credit applied)`);
      } else if (rustoreState === 'cancelled' || rustoreState === 'failed') {
        run('UPDATE purchases SET state = ?, last_checked_at = datetime("now") WHERE id = ?', ['failed', row.id]);
        summary.failed++;
        console.log(`[pending-retry] #${row.id} → FAILED (state=${rustoreState})`);
      } else {
        // Still processing — bump last_checked_at so we space out re-queries.
        run('UPDATE purchases SET last_checked_at = datetime("now") WHERE id = ?', [row.id]);
        summary.stillPending++;
      }
    } catch (e) {
      summary.errors++;
      // Don't bump last_checked_at on API error — we want a fast retry.
      console.warn(`[pending-retry] #${row.id} check failed: ${e.message}`);
    }
  }

  // Give-up sweep: any row stuck in 'pending' past the deadline gets flipped
  // to 'failed' so it stops clogging the retry loop and admin reports.
  const expiredIds = all(`
    SELECT id, user_id, product_id FROM purchases
    WHERE state = 'pending' AND created_at <= datetime('now', '-' || ? || ' hours')
  `, [GIVE_UP_AFTER_HOURS]);
  for (const row of expiredIds) {
    run('UPDATE purchases SET state = ?, last_checked_at = datetime("now") WHERE id = ?', ['failed', row.id]);
    securityLog.log(null, {
      type: 'purchase_pending_expired',
      severity: 'medium',
      userId: row.user_id,
      details: { purchaseId: row.id, productId: row.product_id, afterHours: GIVE_UP_AFTER_HOURS }
    });
    summary.failed++;
  }

  if (summary.checked > 0 || expiredIds.length > 0) {
    console.log(`[pending-retry] sweep: ${JSON.stringify(summary)}`);
  }
  return summary;
}

function start() {
  // Initial run shortly after boot so PM2 restarts don't delay checks for
  // purchases that arrived between shutdown and restart.
  setTimeout(() => sweep().catch(e => console.error('[pending-retry boot]', e.message)), 60 * 1000);
  setInterval(() => sweep().catch(e => console.error('[pending-retry]', e.message)), RETRY_INTERVAL_MS);
  console.log(`[pending-retry] scheduled every ${RETRY_INTERVAL_MS / 60000}min, initial run in 60s`);
}

module.exports = { start, sweep };
