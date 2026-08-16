/**
 * @file auth.js
 * @description Client-side authentication — device token + JWT session.
 * @dependencies None (no other project files required)
 *
 * Key methods:
 *   Auth.getDeviceToken()  — persistent per-device UUID
 *   Auth.ensureAuth()      — register if no session token exists
 *   Auth.isAuthenticated() — quick boolean check
 * @verified-against Browser fetch, crypto.randomUUID (with UUID v4 fallback)
 * @verified-date 2026-04-25
 */

const Auth = {
  /** localStorage key for the JWT session token */
  TOKEN_KEY: 'dsi_session_token',

  /** localStorage key for the persistent device identifier */
  DEVICE_KEY: 'dsi_device_token',

  /**
   * Return (or create) a stable device token stored in localStorage.
   * Uses crypto.randomUUID when available, falls back to a manual v4 UUID.
   *
   * @returns {string} UUID string
   */
  getDeviceToken() {
    let token = localStorage.getItem(this.DEVICE_KEY);
    if (!token) {
      token = crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem(this.DEVICE_KEY, token);
    }
    return token;
  },

  /**
   * Read the current JWT session token (may be null).
   *
   * @returns {string|null}
   */
  getSessionToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /**
   * Store a new JWT session token.
   *
   * @param {string} token — JWT from the server
   */
  setSessionToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  /**
   * Register the device with the server and store the returned JWT.
   *
   * @param {string} [displayName=''] — optional user display name
   * @returns {Promise<Object|null>} server response ({ token, ... }) or null on failure
   */
  async register(displayName) {
    const deviceToken = this.getDeviceToken();
    try {
      // 5s timeout — app must not hang if server is unreachable
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch((typeof SERVER_URL !== 'undefined' ? SERVER_URL : '') + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceToken,
          displayName: displayName || ''
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await res.json();
          this.setSessionToken(data.token);
          return data;
        }
      }
    } catch (e) {
      console.warn('[auth] Registration failed:', e.message);
    }
    return null;
  },

  /**
   * Ensure the user has a valid session token.
   * If none exists, silently registers a new device account.
   */
  async ensureAuth() {
    // Skip auth if no server URL configured (Capacitor offline mode)
    const serverUrl = typeof SERVER_URL !== 'undefined' ? SERVER_URL : '';
    if (!serverUrl && typeof Capacitor !== 'undefined') {
      console.warn('[auth] No SERVER_URL set — running in offline mode');
      return;
    }
    if (!this.getSessionToken()) {
      await this.register();
    }
  },

  /**
   * Quick check whether a session token is present.
   *
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.getSessionToken();
  }
};
