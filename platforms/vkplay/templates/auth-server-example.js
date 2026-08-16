/**
 * @file auth-server-example.js
 * @description Project Forge — example Express server with VK Play auth endpoint
 *              and payment webhook handler.
 *
 *              Reference for HOW VK Play integration works server-side. Copy
 *              into your server/, adapt to your DB / session strategy.
 *
 *              IMPORTANT: VKPLAY_SECRET_KEY must come from environment, NOT
 *              hardcoded. NEVER commit it to git.
 *
 * @verified-against Express 4, Node 20+
 */

import express from 'express';
import { verifyVKPlayHash, vkplayAuthMiddleware } from './sign-helper.mjs';

const app = express();
app.use(express.json());

const SECRET = process.env.VKPLAY_SECRET_KEY;
if (!SECRET) {
  console.error('FATAL: VKPLAY_SECRET_KEY env not set');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────
// 1. AUTH ENDPOINT — client posts auth params, server verifies and
//    issues a session JWT/cookie for subsequent API calls.
// ────────────────────────────────────────────────────────────────
app.post('/api/auth/vkplay', vkplayAuthMiddleware(SECRET), async (req, res) => {
  const { uid, appId } = req.vkplayAuth;

  // Look up or create user in your DB
  // const user = await db.users.upsert({ vkplay_id: uid, app_id: appId });

  // Issue a session token (JWT, cookie, etc.) — your call
  const sessionToken = 'EXAMPLE_TOKEN_' + uid + '_' + Date.now();

  res.json({
    ok: true,
    sessionToken,
    user: { id: uid /* , ...other DB fields */ },
  });
});

// ────────────────────────────────────────────────────────────────
// 2. PAYMENT WEBHOOK — VK Play calls this URL after each successful
//    payment. URL is configured in dev portal payment settings.
//    The body contains hash signed with secret_key — verify it.
// ────────────────────────────────────────────────────────────────
app.post('/api/webhook/vkplay-payment', async (req, res) => {
  const params = req.body;

  if (!verifyVKPlayHash(params, SECRET)) {
    console.warn('VK Play payment webhook with invalid signature', params);
    return res.status(403).json({ status: 'error', errcode: 'invalid_sign' });
  }

  // params will include: uid, app_id, sku_id (or item_id), order_id, amount, currency, hash
  const { uid, sku_id, order_id, amount, currency } = params;

  try {
    // Idempotency: check if order_id was already processed
    // const existing = await db.orders.findByExternalId(order_id);
    // if (existing) return res.json({ status: 'success' }); // already granted

    // Grant the item to the user
    // await db.inventory.grantItem({ userId: uid, itemSku: sku_id, source: 'vkplay' });

    // Log the order for accounting
    // await db.orders.create({ external_id: order_id, user_id: uid,
    //   amount, currency, sku: sku_id, source: 'vkplay' });

    res.json({ status: 'success', order_id });
  } catch (e) {
    console.error('VK Play payment processing error', e);
    res.status(500).json({ status: 'error', errcode: 'internal' });
  }
});

// ────────────────────────────────────────────────────────────────
// 3. Test endpoint to check auth flow without real VK Play iframe
//    Only available in dev/staging; remove in production
// ────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get('/dev/vkplay-test-auth', (req, res) => {
    res.json({
      hint: 'POST {uid, hash, app_id, time, locale} to /api/auth/vkplay',
      example: {
        uid: '12345',
        app_id: 'YOUR_APP_ID',
        time: String(Math.floor(Date.now() / 1000)),
        locale: 'ru',
        hash: '<computed_via_computeVKPlayHash_with_secret>',
      },
    });
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`VK Play auth server on :${port}`));
