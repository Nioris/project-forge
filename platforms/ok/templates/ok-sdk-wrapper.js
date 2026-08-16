/**
 * @file ok-sdk-wrapper.js
 * @description Wrapper for Odnoklassniki FAPI SDK. Uniform API with
 *              yandex-sdk-wrapper.js so game code stays platform-agnostic.
 *
 *   Usage:
 *     <script src="//api.ok.ru/js/fapi5.js"></script>
 *     <script src="ok-sdk-wrapper.js"></script>
 *
 *     await OkSDK.init();                         // reads URL params, calls FAPI.init
 *     OkSDK.ready();                              // signals OK "app is loaded"
 *
 *     const user = await OkSDK.getUser();         // { uid, first_name, last_name, locale, ... }
 *     await OkSDK.save('save1', data);            // FAPI.Client.call storage.set
 *     const d = await OkSDK.load('save1');
 *
 *     OkSDK.showInterstitial();                   // FAPI.UI.showLoadedAd
 *     OkSDK.showRewarded(onReward);
 */

(function (global) {
  'use strict';

  const hasFapi = typeof global.FAPI === 'object' && global.FAPI !== null;

  // Read URL query params required by FAPI.
  function urlParams() {
    const out = {};
    try {
      const u = new URL(global.location.href);
      for (const [k, v] of u.searchParams) out[k] = v;
    } catch {}
    return out;
  }

  const OkSDK = {
    isReal: hasFapi,

    async init() {
      if (!hasFapi) return { fallback: true };
      const p = urlParams();
      return new Promise((resolve, reject) => {
        // apiconnection / api_server passed as URL params by OK when the iframe opens.
        if (!p.api_server || !p.apiconnection) {
          console.warn('[OK SDK] missing api_server/apiconnection params — fallback mode');
          resolve({ fallback: true });
          return;
        }
        global.FAPI.init(p.api_server, p.apiconnection,
          () => resolve({ fallback: false }),
          (err) => reject(new Error('FAPI.init failed: ' + err))
        );
      });
    },

    /** Tell OK the app is fully loaded. Must be called as early as possible. */
    ready() {
      if (!hasFapi) return;
      try { global.FAPI.UI.loaded(); } catch (e) { console.warn('[OK] loaded() failed', e); }
    },

    async getUser() {
      if (!hasFapi) return { uid: 'fallback', first_name: 'Local', last_name: 'Dev', locale: 'ru' };
      return new Promise((resolve, reject) => {
        global.FAPI.Client.call(
          { method: 'users.getCurrentUser', fields: 'uid,first_name,last_name,locale,birthday' },
          (status, data, err) => status === 'ok' ? resolve(data) : reject(err)
        );
      });
    },

    getLang() {
      if (!hasFapi) {
        const nav = (global.navigator && global.navigator.language) || 'ru';
        return nav.toLowerCase().split('-')[0];
      }
      const p = urlParams();
      // OK passes `lang` in the iframe URL
      return (p.lang || 'ru').toLowerCase().split('-')[0];
    },

    // ═══ Saves — OK doesn't have CloudStorage, use localStorage + server ═══
    save(key, value) {
      const s = typeof value === 'string' ? value : JSON.stringify(value);
      try { global.localStorage.setItem('__ok_' + key, s); return Promise.resolve(true); }
      catch { return Promise.resolve(false); }
    },

    load(key) {
      try { return Promise.resolve(global.localStorage.getItem('__ok_' + key)); }
      catch { return Promise.resolve(null); }
    },

    // ═══ Ads ═══
    showInterstitial() {
      if (!hasFapi) { console.log('[OK fallback] interstitial'); return; }
      try { global.FAPI.UI.showAd(); } catch (e) { console.warn('[OK] showAd failed', e); }
    },

    showRewarded(onReward) {
      if (!hasFapi) { console.log('[OK fallback] rewarded'); onReward && onReward(true); return; }
      try {
        global.FAPI.UI.showLoadedAd(() => onReward && onReward(true));
      } catch (e) {
        console.warn('[OK] showLoadedAd failed', e);
        onReward && onReward(false);
      }
    },

    // ═══ Payment ═══
    /** Open a purchase dialog. `opts` = { name, description, price (в OK-коинах) }. */
    showInvoice(opts, onStatus) {
      if (!hasFapi) { console.log('[OK fallback] invoice', opts); onStatus && onStatus('cancelled'); return; }
      try {
        global.FAPI.UI.showPayment(opts.name, opts.description, opts.name, opts.price, (result) => {
          onStatus && onStatus(result === 'success' ? 'paid' : 'cancelled');
        });
      } catch (e) {
        console.warn('[OK] showPayment failed', e);
        onStatus && onStatus('failed');
      }
    },
  };

  global.OkSDK = OkSDK;
})(typeof window !== 'undefined' ? window : globalThis);
