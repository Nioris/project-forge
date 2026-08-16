/**
 * @file services/rustore-auth.js
 * @description RuStore Public API auth — generates short-lived JWE tokens for
 *   receipt validation endpoints. Uses an RSA-2048 private key generated in
 *   console.rustore.ru → Компания → API RuStore → Создать ключ.
 *
 *   Docs:
 *     https://www.rustore.ru/help/work-with-rustore-api/api-authorization-token
 *     https://www.rustore.ru/help/work-with-rustore-api/api-authorization-process
 *
 * Exports:
 *   isConfigured()        — true iff all creds are present and PEM loaded
 *   getPublicToken()      — returns cached JWE or mints a new one
 *   resetTokenCache()     — for tests / forced rotation
 * @verified-against RuStore Auth Flow / OAuth sign-in, client-side
 * @verified-date 2026-04-25
 */

const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const config = require('../config');

let _privateKey = null;      // cached KeyObject
let _cachedToken = null;     // { jwe: string, expiresAt: number }

const AUTH_HOSTNAME = 'public-api.rustore.ru';
const AUTH_PATH = '/public/auth/';
// RuStore's docs quote "900 s" lifetime. We refresh 10 s early to avoid
// using a token during its last-moment expiry window.
const TOKEN_TTL_MS = 890 * 1000;

/**
 * Load the PEM from disk once and cache the KeyObject.
 * Returns null if the env is not set or the file is missing/invalid.
 */
function loadPrivateKey() {
  if (_privateKey) return _privateKey;
  const path = config.rustoreApiPrivateKeyPath;
  if (!path) return null;
  try {
    const pem = fs.readFileSync(path, 'utf8');
    _privateKey = crypto.createPrivateKey(pem);
    return _privateKey;
  } catch (e) {
    console.warn('[rustore-auth] Failed to load private key from ' + path + ': ' + e.message);
    return null;
  }
}

/**
 * Whether server is ready to call RuStore Public API.
 */
function isConfigured() {
  return Boolean(
    config.rustoreKeyId
    && loadPrivateKey()
  );
}

/**
 * Sign the timestamp with SHA512withRSA (PKCS#1 v1.5) per RuStore spec:
 *   signature = Base64( SHA512withRSA( keyId + timestamp ) )
 *
 * Concatenation is plain string, no delimiter. RuStore used to accept
 * `companyId` in place of `keyId`, but companyId is deprecated
 * (2024-07-30) — keyId is the only accepted field now.
 */
function signAuthPayload(keyId, timestamp) {
  const signer = crypto.createSign('RSA-SHA512');
  signer.update(keyId + timestamp);
  signer.end();
  return signer.sign(loadPrivateKey(), 'base64');
}

/**
 * ISO-8601 with milliseconds + **explicit timezone offset** (not "Z").
 * RuStore rejects "2026-04-20T00:25:51.466Z" — the validator wants
 * "2026-04-20T00:25:51.466+00:00". The signature stays valid for ~60 s.
 *
 *   Example from docs: "2023-08-11T13:31:17.580+03:00"
 */
function nowIsoWithOffset() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
    '.' + pad(d.getMilliseconds(), 3) +
    sign + offH + ':' + offM;
}

/**
 * POST /public/auth/ with {keyId, timestamp, signature} → JWE.
 * Both keyId and companyId (legacy) must be sent as **strings**, not numbers.
 */
function requestNewToken() {
  return new Promise((resolve, reject) => {
    const keyId = String(config.rustoreKeyId);
    const timestamp = nowIsoWithOffset();
    const signature = signAuthPayload(keyId, timestamp);

    const body = JSON.stringify({
      keyId,
      timestamp,
      signature
    });

    const options = {
      method: 'POST',
      hostname: AUTH_HOSTNAME,
      path: AUTH_PATH,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json'
      },
      timeout: 8000,
      family: 4 // VPS IPv6 is broken (see pitfalls 2026-04-07)
    };
    // Response contract (verified against pay-sdk-bundle/pay-sdk-kit/docs/03):
    //   200 OK → { code: "OK", body: { jwe: "<token>", ttl: 900 } }
    //   auth errors → non-2xx with { code: "ERROR", message: "..." }

    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', chunk => { buf += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('RuStore /auth ' + res.statusCode + ': ' + buf.slice(0, 300)));
        }
        try {
          const parsed = JSON.parse(buf);
          // Expected: { code:"OK", body:{ jwe:"...", ttl:900 } }
          // Defensive: accept common aliases.
          const payload = parsed.body || parsed;
          const jwe = payload.jwe || payload.token || payload.jweToken || payload.accessToken;
          if (!jwe) {
            return reject(new Error('RuStore /auth ok but no JWE in response: ' + buf.slice(0, 300)));
          }
          resolve(jwe);
        } catch (e) {
          reject(new Error('RuStore /auth invalid JSON: ' + e.message));
        }
      });
    });

    req.on('timeout', () => { req.destroy(new Error('RuStore /auth timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Get a valid Public-Token. Re-uses the cached JWE if it hasn't expired;
 * otherwise requests a new one and caches it.
 */
async function getPublicToken() {
  if (!isConfigured()) {
    throw new Error('RuStore API not configured (missing companyId or private key)');
  }
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now) {
    return _cachedToken.jwe;
  }
  const jwe = await requestNewToken();
  _cachedToken = { jwe, expiresAt: now + TOKEN_TTL_MS };
  return jwe;
}

/**
 * Drop the cached token. Used on 401 responses from downstream calls —
 * if RuStore rejects our token before its nominal expiry, force a refresh.
 */
function resetTokenCache() {
  _cachedToken = null;
}

module.exports = {
  isConfigured,
  getPublicToken,
  resetTokenCache
};
