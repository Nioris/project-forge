/**
 * @file vkplay-sdk-wrapper.js
 * @description Project Forge — VK Play JS SDK wrapper.
 *
 *              Provides a Promise-based API over the official VKPlaySDK that
 *              handles dev-mode fallback (so you can run the game outside
 *              vkplay.ru iframe during development).
 *
 *              Usage in your game:
 *                <script src="https://vkplay.ru/embed/v1/sdk.js"></script>
 *                <script src="vkplay-sdk-wrapper.js"></script>
 *                <script>
 *                  VKPlay.init({ appId: 'YOUR_APP_ID' }).then(sdk => {
 *                    console.log('VK Play ready', sdk.user);
 *                    // game start
 *                  });
 *                </script>
 *
 * @verified-against VK Play SDK v1, 2026
 */

(function (root) {
  'use strict';

  const isInIframe = (() => {
    try { return window.self !== window.top; }
    catch { return true; }
  })();

  // Auth params from URL
  function getAuthParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      uid: params.get('uid') || params.get('user_id') || null,
      hash: params.get('hash') || null,
      app_id: params.get('app_id') || null,
      time: params.get('time') || null,
      locale: params.get('locale') || 'ru',
    };
  }

  // Wait for the official SDK to be loaded and ready.
  // VK Play uses window.onVKPlaySDKReady callback pattern.
  function waitForSDK(timeout = 5000) {
    return new Promise((resolve, reject) => {
      // If already there, done
      if (window.VKPlaySDK && typeof window.VKPlaySDK.init === 'function') {
        return resolve(window.VKPlaySDK);
      }
      // Otherwise install callback
      const oldCb = window.onVKPlaySDKReady;
      const timer = setTimeout(() => {
        window.onVKPlaySDKReady = oldCb || null;
        reject(new Error('VKPlaySDK did not become ready within ' + timeout + 'ms'));
      }, timeout);
      window.onVKPlaySDKReady = function (sdk) {
        clearTimeout(timer);
        window.VKPlaySDK = sdk; // normalize
        if (typeof oldCb === 'function') try { oldCb(sdk); } catch {}
        resolve(sdk);
      };
    });
  }

  const VKPlay = {
    // Returns a promise that resolves to a wrapper object once SDK is initialized
    init({ appId, devMode = null } = {}) {
      // Auto-detect dev mode: not in iframe AND no auth params -> dev
      const auth = getAuthParams();
      const inferredDev = devMode === null
        ? (!isInIframe || !auth.uid)
        : !!devMode;

      if (inferredDev) {
        console.warn('[VKPlay] dev mode — running outside iframe or no auth params. Stub SDK.');
        return Promise.resolve({
          isDevMode: true,
          user: { id: 'dev_user_' + Math.floor(Math.random() * 9999), name: 'DevUser' },
          authParams: auth,
          requestAuth: () => Promise.resolve({ id: 'dev', name: 'DevUser' }),
          openPaymentDialog: ({ sku, amount, currency = 'RUB' }) => {
            console.log('[VKPlay dev] mock payment', { sku, amount, currency });
            return Promise.resolve({ status: 'success', orderId: 'dev_' + Date.now() });
          },
          requestResize: ({ width, height }) => {
            console.log('[VKPlay dev] mock resize', { width, height });
          },
          shareToFriend: () => Promise.resolve({ ok: true }),
          getUserInfo: () => Promise.resolve({ id: 'dev_user', name: 'DevUser' }),
        });
      }

      return waitForSDK().then(sdk => {
        if (typeof sdk.init === 'function') {
          try { sdk.init({ appId }); } catch (e) {
            console.warn('[VKPlay] sdk.init threw:', e);
          }
        }
        return {
          isDevMode: false,
          user: null, // will be filled by getUserInfo
          authParams: auth,
          requestAuth: () => sdk.requestAuth ? sdk.requestAuth() : Promise.reject('not implemented'),
          openPaymentDialog: (opts) => {
            return new Promise((resolve, reject) => {
              if (!sdk.openPaymentDialog) {
                return reject(new Error('openPaymentDialog not supported by current SDK version'));
              }
              sdk.openPaymentDialog(opts, (err, result) => {
                if (err) return reject(err);
                resolve(result);
              });
            });
          },
          requestResize: ({ width, height }) => {
            if (sdk.requestResize) sdk.requestResize({ width, height });
          },
          shareToFriend: () => sdk.shareToFriend ? sdk.shareToFriend() : Promise.reject('not implemented'),
          getUserInfo: () => sdk.getUserInfo
            ? sdk.getUserInfo()
            : Promise.resolve({ id: auth.uid, name: 'unknown' }),
        };
      });
    },

    // Static: read VK Play auth params (uid, hash, app_id, time, locale)
    // Use to send to YOUR server for hash validation against secret_key.
    getAuthParams: getAuthParams,

    // Convenience: send auth params to your server for validation.
    // Expects your server to respond { ok: true, sessionToken } or { ok: false, error }.
    validateOnServer(endpoint = '/api/auth/vkplay') {
      const auth = getAuthParams();
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auth),
      }).then(r => r.json());
    },
  };

  root.VKPlay = VKPlay;
})(typeof window !== 'undefined' ? window : globalThis);
