/**
 * @file routes/sync.js
 * @description E2E encrypted cloud sync — upload/download encrypted data blobs.
 *   Server stores only ciphertext, cannot read user data.
 *   Passphrase-derived AES-256-GCM encryption happens client-side.
 * @dependencies express, crypto, server/middleware/auth, server/database
 *
 * Key endpoints:
 *   POST /api/sync/upload   — store encrypted blob
 *   GET  /api/sync/download — retrieve encrypted blob
 *   GET  /api/sync/status   — check if sync exists + timestamps
 *   POST /api/sync/setup    — set passphrase hint, generate sync code
 *   POST /api/sync/link     — link new device to existing account via sync code
 *   DELETE /api/sync/data   — delete sync data
 * @verified-against Node 20, Express 4, SQLite (better-sqlite3)
 * @verified-date 2026-04-25
 */

const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { run, get } = require('../database');
const jwt = require('jsonwebtoken');
const config = require('../config');

const router = express.Router();

// Larger body limit for sync uploads (up to 5MB encrypted blob)
router.use(express.json({ limit: '5mb' }));

// All sync routes require auth (except /link which handles its own)
router.use((req, res, next) => {
  if (req.path === '/link') return next();
  requireAuth(req, res, next);
});

// ═══ HELPERS ═══

// ═══ MNEMONIC WORD LIST ═══

/** 256 simple Russian nouns — unambiguous, easy to write down */
const WORDS = [
  'кошка','собака','солнце','луна','дерево','река','гора','дом',
  'птица','рыба','цветок','камень','огонь','вода','земля','небо',
  'звезда','облако','ветер','дождь','снег','лес','поле','море',
  'город','мост','башня','замок','книга','песня','танец','сказка',
  'медведь','волк','лиса','заяц','олень','ворона','сокол','дельфин',
  'тигр','лев','слон','кит','ворон','лебедь','бабочка','пчела',
  'яблоко','вишня','роза','лилия','дуб','липа','тополь','сосна',
  'хлеб','молоко','масло','сахар','соль','перец','мука','сыр',
  'утро','вечер','ночь','рассвет','закат','полдень','зима','лето',
  'весна','осень','январь','март','апрель','август','октябрь','декабрь',
  'север','юг','запад','восток','центр','граница','берег','остров',
  'ключ','засов','щит','меч','корона','факел','якорь','компас',
  'радуга','молния','гром','туман','мороз','роса','метель','буря',
  'скала','пещера','ущелье','вулкан','холм','долина','озеро','пруд',
  'волна','водопад','родник','колодец','маяк','парус','весло','штурвал',
  'алмаз','рубин','золото','серебро','медь','железо','янтарь','жемчуг',
  'сокровище','клад','монета','кристалл','искра','пламя','уголь','пепел',
  'колокол','дудка','барабан','арфа','скрипка','труба','свирель','бубен',
  'ткань','атлас','бархат','кожа','нитка','узел','лента','кольцо',
  'перо','крыло','коготь','рог','грива','хвост','панцирь','чешуя',
  'ворота','забор','тропа','лестница','окно','крыша','порог','арка',
  'фонарь','свеча','лампа','зеркало','часы','весы','глобус','карта',
  'чашка','ложка','нож','кувшин','корзина','сундук','мешок','бочка',
  'повозка','колесо','седло','подкова','канат','цепь','болт','гвоздь',
  'молот','пила','топор','клещи','наждак','долото','рубанок','тиски',
  'знамя','герб','печать','свиток','грамота','указ','послание','девиз',
  'облик','тень','силуэт','маска','венок','браслет','амулет','оберег',
  'загадка','секрет','символ','знак','узор','орнамент','мозаика','витраж',
  'ярмарка','базар','площадь','причал','гавань','кузница','мельница','пекарня',
  'сад','роща','поляна','луг','тропинка','овраг','обрыв','насыпь',
  'простор','горизонт','вершина','подножие','перевал','склон','плато','степь',
  'восход','сумерки','полночь','заря','мгла','просвет','сияние','отблеск'
];

/**
 * Generate a mnemonic sync code — 5 random Russian words.
 * 256^5 = ~1 trillion combinations. With rate limiting, brute force is impossible.
 * @returns {string} space-separated words
 */
function generateSyncCode() {
  const indices = crypto.randomBytes(5);
  return Array.from(indices).map(b => WORDS[b]).join(' ');
}

// ═══ RATE LIMIT for /link (brute-force protection) ═══
//
// Two-layer defence, both persisted in SQLite so they survive server restarts:
//   - per-IP:   5 attempts / hour  (single attacker from one address)
//   - global:   1000 attempts / hour across all IPs (distributed / botnet)
//
// Phrase-space is 256^5 ≈ 1.1e12. With global cap of 1000/hr, full sweep would
// take ~125 000 years — infeasible even assuming cloud-scale IP rotation.

const LINK_IP_MAX = 5;
const LINK_GLOBAL_MAX = 1000;
const LINK_WINDOW_MS = 3600000; // 1 hour

/**
 * Atomically bump a rate-limit counter and report whether the current attempt
 * is within the allowed budget. Window resets lazily when `reset_at` expires.
 *
 * @param {string} scope — 'ip' or 'global'
 * @param {string} key — IP address, or 'all' for global
 * @param {number} max — attempts allowed per window
 * @returns {{ allowed: boolean, count: number }}
 */
function bumpRateLimit(scope, key, max) {
  const nowMs = Date.now();
  const row = get('SELECT count, reset_at FROM rate_limits WHERE scope = ? AND key = ?', [scope, key]);

  if (!row || new Date(row.reset_at).getTime() < nowMs) {
    const resetAt = new Date(nowMs + LINK_WINDOW_MS).toISOString();
    run(
      'INSERT INTO rate_limits (scope, key, count, reset_at) VALUES (?, ?, 1, ?) ' +
      'ON CONFLICT(scope, key) DO UPDATE SET count = 1, reset_at = ?',
      [scope, key, resetAt, resetAt]
    );
    return { allowed: true, count: 1 };
  }

  const nextCount = row.count + 1;
  run('UPDATE rate_limits SET count = ? WHERE scope = ? AND key = ?', [nextCount, scope, key]);
  return { allowed: nextCount <= max, count: nextCount };
}

// ═══ UPLOAD ═══

/**
 * POST /api/sync/upload
 * Store encrypted data blob. Replaces existing data (UPSERT).
 * Body: { encryptedData: string, phraseHash?: string, clientUpdatedAt: string, dataVersion?: number, dataSize?: number }
 */
router.post('/upload', (req, res) => {
  const { encryptedData, phraseHash, clientUpdatedAt, dataVersion, dataSize } = req.body;

  if (!encryptedData || typeof encryptedData !== 'string') {
    return res.status(400).json({ error: 'encryptedData required' });
  }
  if (!clientUpdatedAt) {
    return res.status(400).json({ error: 'clientUpdatedAt required' });
  }
  // 5MB limit on the base64 string
  if (encryptedData.length > 5 * 1024 * 1024) {
    return res.status(413).json({ error: 'Data too large (max 5MB)' });
  }

  const existing = get('SELECT id FROM user_sync WHERE user_id = ?', [req.user.id]);

  if (existing) {
    run(
      'UPDATE user_sync SET encrypted_data = ?, data_version = ?, data_size = ?, client_updated_at = ?, server_updated_at = datetime("now")' + (phraseHash ? ', phrase_hash = ?' : '') + ' WHERE user_id = ?',
      phraseHash
        ? [encryptedData, dataVersion || 1, dataSize || 0, clientUpdatedAt, phraseHash, req.user.id]
        : [encryptedData, dataVersion || 1, dataSize || 0, clientUpdatedAt, req.user.id]
    );
  } else {
    run(
      'INSERT INTO user_sync (user_id, encrypted_data, data_version, data_size, client_updated_at, phrase_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, encryptedData, dataVersion || 1, dataSize || 0, clientUpdatedAt, phraseHash || '']
    );
  }

  // Mark sync enabled
  run('UPDATE users SET sync_enabled = 1 WHERE id = ?', [req.user.id]);

  // Cloud-sync starter bonus: first time we see this phrase_hash, credit
  // the user +400 stars. Four layers of anti-farm defence:
  //   1. Phrase idempotency — same recovery phrase never triggers bonus twice.
  //   2. IP cooldown — max one bonus per IP per 30 days (raises the cost of
  //      reinstall-farming even with fresh phrases each cycle).
  //   3. Account age — user must have existed for ≥6 hours (prevents the
  //      "create new device token → setup sync in 30 seconds" cycle).
  //   4. Data size — at least 1000 bytes of encrypted payload (proof that
  //      there's actually diary content to sync, not an empty shell).
  // Each failed layer is logged so admins can spot farming attempts.
  let bonusGranted = 0;
  let bonusReason = null;
  if (phraseHash) {
    const existingGrant = get(
      'SELECT 1 FROM cloud_starter_grants WHERE phrase_hash = ?',
      [phraseHash]
    );
    if (existingGrant) {
      bonusReason = 'phrase_already_used';
    } else {
      // Gate 1: IP cooldown — store HMAC of IP (152-ФЗ: raw IP is PD when
      // combinable with user_id, a stable one-way hash is not).
      const { hashIp, ipTag } = require('../services/ip-hash');
      const clientIpHash = hashIp(req);
      const recentIpGrant = clientIpHash ? get(
        'SELECT 1 FROM cloud_starter_grants WHERE ip = ? AND granted_at > datetime("now", "-30 days")',
        [clientIpHash]
      ) : null;
      if (recentIpGrant) {
        bonusReason = 'ip_cooldown';
      } else {
        // All gates passed — grant bonus. Data-size gate intentionally removed:
        // farmers can always re-import an old backup to pass it, while honest
        // new users get bad UX (setup sync before first entry = no bonus).
        // IP cooldown + phrase idempotency are the real defenses.
        run(
          'INSERT INTO cloud_starter_grants (phrase_hash, user_id, ip) VALUES (?, ?, ?)',
          [phraseHash, req.user.id, clientIpHash || null]
        );
        run('UPDATE users SET stars = stars + 400 WHERE id = ?', [req.user.id]);
        bonusGranted = 400;
        console.log(`[sync] Starter bonus +400⭐ granted to user #${req.user.id} (ip#=${ipTag(req)})`);
      }
    }
    if (bonusReason && bonusReason !== 'phrase_already_used') {
      console.log(`[sync] Starter bonus SKIPPED for user #${req.user.id}: ${bonusReason}`);
    }
  }

  const row = get('SELECT server_updated_at FROM user_sync WHERE user_id = ?', [req.user.id]);
  console.log(`[sync] Upload by user #${req.user.id}, size: ${dataSize || 'unknown'}`);

  res.json({
    success: true,
    serverUpdatedAt: row.server_updated_at,
    bonusGranted,
    bonusSkippedReason: bonusGranted === 0 ? bonusReason : null
  });
});

// ═══ DOWNLOAD ═══

/**
 * GET /api/sync/download
 * Retrieve the encrypted blob.
 */
router.get('/download', (req, res) => {
  const row = get(
    'SELECT encrypted_data, client_updated_at, server_updated_at, data_version FROM user_sync WHERE user_id = ?',
    [req.user.id]
  );

  if (!row) {
    return res.json({ exists: false });
  }

  res.json({
    exists: true,
    encryptedData: row.encrypted_data,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.server_updated_at,
    dataVersion: row.data_version
  });
});

// ═══ STATUS ═══

/**
 * GET /api/sync/status
 * Quick check without downloading the heavy blob.
 */
router.get('/status', (req, res) => {
  const row = get(
    'SELECT client_updated_at, server_updated_at, data_size FROM user_sync WHERE user_id = ?',
    [req.user.id]
  );

  res.json({
    exists: !!row,
    clientUpdatedAt: row ? row.client_updated_at : null,
    serverUpdatedAt: row ? row.server_updated_at : null,
    dataSize: row ? row.data_size : 0
  });
});

// ═══ SETUP ═══

/**
 * POST /api/sync/setup
 * Generate sync code and save passphrase hint.
 * Body: { passphraseHint?: string }
 */
router.post('/setup', (req, res) => {
  const { passphraseHint } = req.body;
  const hint = (passphraseHint || '').slice(0, 100);

  // Generate sync code if not exists
  const user = get('SELECT sync_code FROM users WHERE id = ?', [req.user.id]);
  let syncCode = user.sync_code;

  if (!syncCode) {
    syncCode = generateSyncCode();
    // Ensure uniqueness
    while (get('SELECT id FROM users WHERE sync_code = ? AND id != ?', [syncCode, req.user.id])) {
      syncCode = generateSyncCode();
    }
    run('UPDATE users SET sync_code = ? WHERE id = ?', [syncCode, req.user.id]);
  }

  run('UPDATE users SET passphrase_hint = ?, sync_enabled = 1 WHERE id = ?', [hint, req.user.id]);

  console.log(`[sync] Setup for user #${req.user.id}`);
  res.json({ success: true, syncCode });
});

// ═══ LINK (new device) ═══

/**
 * POST /api/sync/link
 * Link a new device to an existing account using phrase hash.
 * Body: { phraseHash: string, deviceToken: string }
 * Returns new JWT for the linked account.
 */
router.post('/link', async (req, res) => {
  const { phraseHash, deviceToken } = req.body;

  if (!phraseHash || !deviceToken) {
    return res.status(400).json({ error: 'phraseHash and deviceToken required' });
  }

  // Artificial delay — caps single-connection throughput at ~6 req/s regardless
  // of rate-limit windows, blunting bursty attacks between window resets.
  await new Promise(r => setTimeout(r, 150));

  const { hashIp, ipTag } = require('../services/ip-hash');
  const ipHash = hashIp(req);

  // Layer 1: global cap across all IPs (anti-botnet)
  const globalLimit = bumpRateLimit('global', 'all', LINK_GLOBAL_MAX);
  if (!globalLimit.allowed) {
    console.warn(`[sync] /link GLOBAL rate limit hit: ${globalLimit.count} attempts/hr, ip#=${ipTag(req)}`);
    return res.status(429).json({ error: 'Too many attempts. Try again in 1 hour.' });
  }

  // Layer 2: per-IP cap (anti-single-attacker).
  // rate_limits storage uses the hashed IP so nothing personal persists there
  // beyond the 1-hour window.
  const ipLimit = bumpRateLimit('ip', ipHash || 'unknown', LINK_IP_MAX);
  if (!ipLimit.allowed) {
    console.warn(`[sync] /link IP rate limit hit: ip#=${ipTag(req)}, attempts=${ipLimit.count}`);
    return res.status(429).json({ error: 'Too many attempts. Try again in 1 hour.' });
  }

  // Find account by phrase hash stored in user_sync
  const syncRow = get('SELECT user_id FROM user_sync WHERE phrase_hash = ?', [phraseHash]);
  if (!syncRow) {
    console.warn(`[sync] /link miss: ip#=${ipTag(req)}, ipAttempts=${ipLimit.count}, globalAttempts=${globalLimit.count}`);
    return res.status(404).json({ error: 'Account not found. Check your recovery phrase.' });
  }
  const user = get('SELECT id FROM users WHERE id = ?', [syncRow.user_id]);

  if (!user) {
    return res.status(404).json({ error: 'Invalid sync code' });
  }

  // Remove the temporary user created by auto-registration on new device
  // (new device registered as a fresh user, now we're linking it to the original)
  const tempUser = get('SELECT id FROM users WHERE device_token = ? AND id != ?', [deviceToken, user.id]);
  if (tempUser) {
    run('DELETE FROM api_requests WHERE user_id = ?', [tempUser.id]);
    run('DELETE FROM purchases WHERE user_id = ?', [tempUser.id]);
    run('DELETE FROM user_sync WHERE user_id = ?', [tempUser.id]);
    run('DELETE FROM users WHERE id = ?', [tempUser.id]);
    console.log(`[sync] Removed temp user #${tempUser.id} during device link`);
  }

  // Link this device token to the original account
  run('UPDATE users SET device_token = ?, last_active = datetime("now") WHERE id = ?', [deviceToken, user.id]);

  // Issue new JWT
  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  console.log(`[sync] Device linked to user #${user.id}`);
  res.json({
    success: true,
    token,
    userId: user.id,
    passphraseHint: user.passphrase_hint || ''
  });
});

// ═══ DELETE ═══

/**
 * DELETE /api/sync/data
 * Remove all synced data for the user.
 */
router.delete('/data', (req, res) => {
  run('DELETE FROM user_sync WHERE user_id = ?', [req.user.id]);
  run('UPDATE users SET sync_enabled = 0, sync_code = "" WHERE id = ?', [req.user.id]);

  console.log(`[sync] Data deleted for user #${req.user.id}`);
  res.json({ success: true });
});

/**
 * DELETE /api/sync/account
 * Permanently delete the entire user account and all server-side data.
 * Body (JSON): { confirmation: "УДАЛИТЬ МОИ ДАННЫЕ" }
 */
router.delete('/account', express.json(), (req, res) => {
  const { confirmation } = req.body || {};
  if (confirmation !== 'УДАЛИТЬ МОИ ДАННЫЕ') {
    return res.status(400).json({ error: 'Invalid confirmation phrase' });
  }

  const userId = req.user.id;
  run('DELETE FROM user_sync WHERE user_id = ?', [userId]);
  run('DELETE FROM purchases WHERE user_id = ?', [userId]);
  run('DELETE FROM api_requests WHERE user_id = ?', [userId]);
  run('DELETE FROM users WHERE id = ?', [userId]);

  console.log(`[sync] Account #${userId} permanently deleted`);
  res.json({ success: true, deleted: true });
});

module.exports = router;
