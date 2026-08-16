/**
 * @file routes/auth.js
 * @description Authentication routes — device token registration, user info.
 * @dependencies express, jsonwebtoken, server/config, server/database
 * @verified-against Node 20, Express 4, jsonwebtoken 9, SQLite (better-sqlite3)
 * @verified-date 2026-04-25
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { run, get } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register or login with device token. Returns JWT session token.
 * Body: { deviceToken: string, displayName?: string }
 */
router.post('/register', (req, res) => {
  const { deviceToken, displayName } = req.body;

  if (!deviceToken || typeof deviceToken !== 'string' || deviceToken.length < 10) {
    return res.status(400).json({ error: 'Valid deviceToken required' });
  }

  // Find existing user or create new
  let user = get('SELECT id, device_token, display_name FROM users WHERE device_token = ?', [deviceToken]);

  if (!user) {
    // Explicit stars=100 — SQLite `ALTER TABLE ADD COLUMN DEFAULT` only applies
    // at column creation, not retroactively. The column was created with
    // DEFAULT 500 historically; bumping the default in the migration is a
    // no-op on existing deployments. Spell it out here so the 100-star starter
    // actually lands. Bonus +400 is granted separately in /api/sync/upload
    // when the user sets up Cloud Sync.
    const result = run(
      'INSERT INTO users (device_token, display_name, stars) VALUES (?, ?, ?)',
      [deviceToken, displayName || '', 100]
    );
    user = { id: result.lastId, device_token: deviceToken, display_name: displayName || '' };
    console.log(`[auth] New user registered: #${user.id} (100⭐ starter)`);
  } else {
    // Update last_active
    run('UPDATE users SET last_active = datetime("now") WHERE id = ?', [user.id]);
    // Update display name if provided
    if (displayName && displayName !== user.display_name) {
      run('UPDATE users SET display_name = ? WHERE id = ?', [displayName, user.id]);
    }
  }

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  res.json({
    token,
    user: {
      id: user.id,
      deviceToken: user.device_token,
      displayName: user.display_name
    }
  });
});

/**
 * GET /api/auth/me
 * Get current user info from JWT.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
