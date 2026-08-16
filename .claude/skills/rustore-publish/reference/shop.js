/**
 * @file routes/shop.js
 * @description Star shop — products, balance, purchase with server-side validation.
 *   Prices and balances are server-authoritative. Client cannot credit stars directly.
 * @dependencies express, server/middleware/auth, server/database
 * @verified-against RuStore Pay SDK 10.2 / BOM 2026.04.01
 * @verified-date 2026-04-25
 */

const express = require('express');
const https = require('https');
const { requireAuth } = require('../middleware/auth');
const { run, get } = require('../database');
const config = require('../config');
const rustoreAuth = require('../services/rustore-auth');
const securityLog = require('../services/security-log');

const router = express.Router();

// ═══ PER-USER PURCHASE RATE LIMIT ═══
// In-memory sliding window keyed by user id. Keeps brute-forcers from scanning
// invoiceId space with one valid token. Not persistent across PM2 restarts —
// acceptable for this purpose (attacker gains nothing from a restart).
const _purchaseAttempts = new Map(); // userId → [timestamps]
const PURCHASE_WINDOW_MS = 60 * 1000;
const PURCHASE_MAX_PER_WINDOW = 10;

function checkPurchaseRateLimit(userId) {
  const now = Date.now();
  const cutoff = now - PURCHASE_WINDOW_MS;
  const history = (_purchaseAttempts.get(userId) || []).filter(t => t > cutoff);
  history.push(now);
  _purchaseAttempts.set(userId, history);
  return history.length <= PURCHASE_MAX_PER_WINDOW;
}

// ═══ RUSTORE RECEIPT VALIDATION ═══

/**
 * Fetch a receipt from the RuStore Public API v2 and return the parsed body.
 *
 * Verified end-to-end against a real sandbox purchase on 2026-04-20:
 *   Endpoint: GET /public/v2/purchase/{invoiceId}
 *   Sandbox:  GET /public/sandbox/v2/purchase/{invoiceId}
 *   Header:   Public-Token: <JWE>     (NOT `Authorization: API-key ...` —
 *             that format docs in pay-sdk-bundle turned out to be wrong;
 *             RuStore answers `401 "Token is empty"` for it.)
 *
 * The v2 endpoint is what the API-key scope method «Получение данных
 * платежа по идентификатору (v2)» grants access to. The deprecated v1
 * endpoint (`/public/purchase/{id}`) returns 403 «does not have rights»
 * for the same key.
 *
 * Response shape:
 *   { code:"OK", body:{ invoiceId, invoiceStatus, appId, ownerCode,
 *                       paymentInfo, order:{ productId, amount, ... } } }
 *
 * `invoiceStatus` is lowercase: `confirmed | paid | cancelled | refunded | ...`.
 * `appId` is numeric — compare to RUSTORE_APPLICATION_ID, not to the
 * Android package name.
 *
 * @param {string} invoiceId — from Pay SDK `result.invoiceId`
 * @returns {Promise<Object|null>} — null when RuStore creds aren't configured
 */
async function validateRuStoreReceipt(invoiceId) {
  if (!rustoreAuth.isConfigured()) {
    console.warn('[shop] RuStore API not configured — skipping receipt validation (dev/test mode)');
    return null;
  }

  let jwe = await rustoreAuth.getPublicToken();
  const pathPrefix = config.rustoreSandbox
    ? '/public/sandbox/v2/purchase/'
    : '/public/v2/purchase/';
  const doRequest = (token) => new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: 'public-api.rustore.ru',
      path: pathPrefix + encodeURIComponent(invoiceId),
      headers: {
        'Public-Token': token,
        'Accept': 'application/json'
      },
      timeout: 8000,
      family: 4
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(new Error('RuStore /purchase timeout')); });
    req.on('error', reject);
    req.end();
  });

  let { statusCode, body } = await doRequest(jwe);

  // 401 = token rejected before its nominal TTL. Drop cache, retry once.
  if (statusCode === 401) {
    rustoreAuth.resetTokenCache();
    jwe = await rustoreAuth.getPublicToken();
    ({ statusCode, body } = await doRequest(jwe));
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('RuStore /purchase ' + statusCode + ': ' + body.slice(0, 300));
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed.code && parsed.code !== 'OK') {
      throw new Error('RuStore /purchase ' + parsed.code + ': ' + (parsed.message || ''));
    }
    // Shape: { code:"OK", body:{ purchaseId, invoiceId, productId, purchaseState, amount, ... } }
    return parsed.body || parsed;
  } catch (e) {
    if (e.message.startsWith('RuStore')) throw e;
    throw new Error('RuStore /purchase invalid JSON: ' + e.message);
  }
}

// ═══ AI REQUEST PRICING (server-authoritative) ═══

/**
 * Star costs for AI requests. Loaded from DB on startup, fallback to defaults.
 * Admin can change via PATCH /api/admin/shop/pricing.
 */
const PRICING = {
  daily: 1,
  deep: 100,
  chat: 1
};

/**
 * Load pricing from DB (called on startup).
 */
function loadPricing() {
  try {
    const row = get('SELECT value FROM app_config WHERE key = ?', ['ai_pricing']);
    if (row) {
      const saved = JSON.parse(row.value);
      Object.assign(PRICING, saved);
    }
  } catch (e) { /* table may not exist yet */ }
}

/**
 * Save pricing to DB.
 */
function savePricing() {
  run(
    'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)',
    ['ai_pricing', JSON.stringify(PRICING)]
  );
}

/** Get current pricing (used by admin route). */
function getPricing() { return { ...PRICING }; }

/** Update pricing (used by admin route). */
function setPricing(newPricing) {
  if (newPricing.daily !== undefined) PRICING.daily = Number(newPricing.daily);
  if (newPricing.deep !== undefined) PRICING.deep = Number(newPricing.deep);
  if (newPricing.chat !== undefined) PRICING.chat = Number(newPricing.chat);
  savePricing();
}

// All shop routes require authentication
router.use(requireAuth);

/**
 * GET /api/shop/pricing
 * Return current AI request costs (public, for client UI).
 */
router.get('/pricing', (req, res) => {
  res.json({ pricing: PRICING });
});

/**
 * Product catalog — single source of truth for prices.
 * Client fetches this instead of hardcoding.
 */
const PRODUCTS = [
  { id: 'stars_100',  stars: 100,  price: '529 ₽',  rubles: 529,  icon: '✨', label: '100 звёзд' },
  { id: 'stars_500',  stars: 500,  price: '2 190 ₽',  rubles: 2190,  icon: '🌟', label: '500 звёзд', badge: 'Популярный' },
  { id: 'stars_2000', stars: 2000, price: '6 990 ₽', rubles: 6990, icon: '💎', label: '2000 звёзд', badge: 'Выгодный' }
];

/**
 * GET /api/shop/products
 * Return the product catalog.
 */
router.get('/products', (req, res) => {
  res.json({ products: PRODUCTS });
});

/**
 * GET /api/shop/balance
 * Return the user's current star balance.
 */
router.get('/balance', (req, res) => {
  const user = get('SELECT stars FROM users WHERE id = ?', [req.user.id]);
  res.json({ stars: user ? user.stars : 0 });
});

/**
 * POST /api/shop/purchase
 * Validate a purchase and credit stars.
 * Body: { productId: string, invoiceId: string }
 *   (legacy clients may send { receiptToken } — accepted as alias for invoiceId
 *    so pre-v8.26 installs continue to work against the new backend)
 *
 * Flow:
 * 1. Verify productId exists in catalog
 * 2. Validate invoiceId with RuStore Public API v2 (when configured)
 * 3. Log purchase in purchases table (invoiceId stored in receipt_token column)
 * 4. Credit stars to user
 * 5. Return new balance
 *
 * If RuStore creds aren't configured, the purchase is still logged with
 * validated=0 so audit can flag it.
 */
router.post('/purchase', async (req, res) => {
  const { productId } = req.body;
  // Prefer invoiceId (new Pay SDK v10 field); fall back to legacy receiptToken
  // so old client builds still round-trip.
  const invoiceId = req.body.invoiceId || req.body.receiptToken;

  // 0. Rate-limit per user — 10 purchases / minute max. Brute-forcing
  //    invoiceId space would burn through this fast and trip logging.
  if (!checkPurchaseRateLimit(req.user.id)) {
    securityLog.log(req, {
      type: 'purchase_rate_limit',
      severity: 'medium',
      details: { productId, invoiceId }
    });
    return res.status(429).json({ error: 'Too many purchase attempts, slow down' });
  }

  // 1. Verify product exists
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) {
    securityLog.log(req, {
      type: 'purchase_unknown_product',
      severity: 'low',
      details: { productId, invoiceId }
    });
    return res.status(400).json({ error: 'Unknown product' });
  }

  if (!invoiceId) {
    return res.status(400).json({ error: 'invoiceId required' });
  }

  // 2. Idempotency — reject duplicate invoiceIds. Prevents replay attacks
  //    and double-credit if the client retries after a network blip.
  const existing = get(
    'SELECT id, user_id FROM purchases WHERE receipt_token = ? AND type = ?',
    [invoiceId, 'credit']
  );
  if (existing) {
    // A replay attempt by the SAME user is usually a network retry — low severity.
    // A replay by a DIFFERENT user means someone captured a valid invoiceId
    // (logs, screenshot, shared device) and is trying to claim it — high severity.
    const sameUser = existing.user_id === req.user.id;
    securityLog.log(req, {
      type: sameUser ? 'purchase_replay_same_user' : 'purchase_replay_cross_user',
      severity: sameUser ? 'low' : 'high',
      details: {
        productId,
        invoiceId,
        originalUserId: existing.user_id,
        originalPurchaseId: existing.id
      }
    });
    return res.status(409).json({ error: 'Receipt already redeemed' });
  }

  // 3. Validate receipt with RuStore Public API v2 (or fall back in dev)
  //    Possible outcomes → purchase row state:
  //     - PAID / CONFIRMED                        → 'paid'       (credit now, 200)
  //     - INVOICE_CREATED / PROCESSING / PENDING  → 'pending'    (no credit, 202, retry cron)
  //     - CANCELLED / FAILED                      → 'failed'     (no credit, 402)
  //     - product/app mismatch (forgery)          → 'failed'     (no credit, 403)
  //     - RuStore API 5xx / timeout               → 'pending'    (no credit, 202, retry)
  //     - receipt === null (api not configured)   → 'paid'       (dev mode, credit)
  let receipt;
  try {
    receipt = await validateRuStoreReceipt(invoiceId);
  } catch (e) {
    // RuStore API 5xx / 404 / timeout — RuStore itself had a hiccup.
    // Record as 'pending' so the cron retries; user is not penalised by
    // RuStore's infrastructure issue. Returns 202 Accepted so client can
    // tell user "processing" rather than "failed".
    securityLog.log(req, {
      type: 'purchase_rustore_api_error',
      severity: 'low',
      details: { productId, invoiceId, error: e.message }
    });
    run(
      'INSERT INTO purchases (user_id, product_id, stars, type, source, receipt_token, validated, state, last_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))',
      [req.user.id, productId, product.stars, 'credit', 'rustore', invoiceId, 0, 'pending']
    );
    console.log(`[shop] User #${req.user.id} purchase PENDING (RuStore API error): ${productId} inv=${invoiceId}`);
    return res.status(202).json({
      success: false,
      pending: true,
      message: 'Платёж обрабатывается. Звёзды появятся автоматически в течение часа.'
    });
  }

  // Branch A: receipt === null (RuStore creds not configured — dev/test mode)
  if (!receipt) {
    run(
      'INSERT INTO purchases (user_id, product_id, stars, type, source, receipt_token, validated, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, productId, product.stars, 'credit', 'rustore', invoiceId, 0, 'paid']
    );
    run('UPDATE users SET stars = stars + ? WHERE id = ?', [product.stars, req.user.id]);
    const user = get('SELECT stars FROM users WHERE id = ?', [req.user.id]);
    console.log(`[shop] User #${req.user.id} purchased ${product.label} (+${product.stars}, dev-mode unvalidated), balance: ${user ? user.stars : 0}`);
    return res.json({ success: true, credited: product.stars, balance: user ? user.stars : 0, validated: false });
  }

  // Branch B: receipt available — classify state
  const rustoreState = String(
    receipt.invoiceStatus
    || receipt.invoice_status
    || receipt.purchaseState
    || receipt.purchase_state
    || ''
  ).toLowerCase();
  const receiptProductId =
    receipt.productId
    || (receipt.order && receipt.order.productId)
    || receipt.product_id;
  const receiptAppId = String(receipt.appId || receipt.applicationId || receipt.application_id || '');
  const expectedAppId = String(config.rustoreApplicationId || '');

  // Fraud checks run before status checks — forged receipts shouldn't sit in
  // 'pending' state where the retry cron keeps polling RuStore about them.
  if (receiptProductId && receiptProductId !== productId) {
    securityLog.log(req, {
      type: 'purchase_product_mismatch',
      severity: 'critical',
      details: { clientProductId: productId, receiptProductId, invoiceId }
    });
    run(
      'INSERT INTO purchases (user_id, product_id, stars, type, source, receipt_token, validated, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, productId, 0, 'credit', 'rustore', invoiceId, 0, 'failed']
    );
    return res.status(403).json({ error: 'Receipt product mismatch' });
  }
  if (expectedAppId && receiptAppId && receiptAppId !== expectedAppId) {
    securityLog.log(req, {
      type: 'purchase_app_mismatch',
      severity: 'critical',
      details: { expectedAppId, receiptAppId, productId, invoiceId }
    });
    run(
      'INSERT INTO purchases (user_id, product_id, stars, type, source, receipt_token, validated, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, productId, 0, 'credit', 'rustore', invoiceId, 0, 'failed']
    );
    return res.status(403).json({ error: 'Receipt application mismatch' });
  }

  // Status classification
  if (rustoreState === 'paid' || rustoreState === 'confirmed') {
    run(
      'INSERT INTO purchases (user_id, product_id, stars, type, source, receipt_token, validated, state, last_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))',
      [req.user.id, productId, product.stars, 'credit', 'rustore', invoiceId, 1, 'paid']
    );
    run('UPDATE users SET stars = stars + ? WHERE id = ?', [product.stars, req.user.id]);
    const user = get('SELECT stars FROM users WHERE id = ?', [req.user.id]);
    console.log(`[shop] User #${req.user.id} purchased ${product.label} (+${product.stars}, validated=1), balance: ${user ? user.stars : 0}`);
    return res.json({ success: true, credited: product.stars, balance: user ? user.stars : 0, validated: true });
  }

  // Pending states — RuStore confirmed the invoice exists but hasn't closed
  // the payment yet. Stars will be credited by the pending-retry cron.
  const pendingStates = new Set(['invoice_created', 'invoicecreated', 'processing', 'pending', 'created']);
  if (pendingStates.has(rustoreState)) {
    run(
      'INSERT INTO purchases (user_id, product_id, stars, type, source, receipt_token, validated, state, last_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))',
      [req.user.id, productId, product.stars, 'credit', 'rustore', invoiceId, 0, 'pending']
    );
    console.log(`[shop] User #${req.user.id} purchase PENDING (state=${rustoreState}): ${productId} inv=${invoiceId}`);
    return res.status(202).json({
      success: false,
      pending: true,
      message: 'Платёж обрабатывается. Звёзды появятся автоматически в течение часа.'
    });
  }

  // Cancelled / refunded / unknown — no credit, row kept for audit.
  securityLog.log(req, {
    type: 'purchase_not_paid',
    severity: 'medium',
    details: { productId, invoiceId, state: rustoreState }
  });
  run(
    'INSERT INTO purchases (user_id, product_id, stars, type, source, receipt_token, validated, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, productId, 0, 'credit', 'rustore', invoiceId, 0, 'failed']
  );
  return res.status(402).json({ error: 'Receipt not in paid state: ' + rustoreState });
});

/**
 * POST /api/shop/deduct
 * Deduct stars for AI usage. Called by AI routes internally,
 * or by client before AI calls.
 * Body: { amount: number, reason: string }
 */
router.post('/deduct', (req, res) => {
  const { amount, reason } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  // Check balance
  const user = get('SELECT stars FROM users WHERE id = ?', [req.user.id]);
  if (!user || user.stars < amount) {
    return res.status(402).json({ error: 'Insufficient stars', balance: user ? user.stars : 0 });
  }

  // Deduct
  run('UPDATE users SET stars = stars - ? WHERE id = ?', [amount, req.user.id]);

  // Log
  run(
    'INSERT INTO purchases (user_id, product_id, stars, type, source) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, reason || 'ai_usage', -amount, 'debit', 'system']
  );

  const updated = get('SELECT stars FROM users WHERE id = ?', [req.user.id]);
  res.json({ balance: updated ? updated.stars : 0 });
});

module.exports = router;
module.exports.getPricing = getPricing;
module.exports.setPricing = setPricing;
module.exports.loadPricing = loadPricing;
module.exports.getShopProducts = () => PRODUCTS.slice();
