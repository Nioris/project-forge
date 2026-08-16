/**
 * @file rustore-billing.js
 * @description Thin JS wrapper around the RuStoreBilling Capacitor plugin
 *   (see android/.../RuStoreBillingPlugin.java). Provides a safe, uniform API
 *   that:
 *     - no-ops in non-Capacitor environments (dev browser, PWA) so the shop UI
 *       can gracefully hide purchase buttons instead of throwing
 *     - normalises plugin errors into plain {success:false, reason} objects
 *
 * Public API (attached to window.RuStoreBilling):
 *   isAvailable()                — {available:boolean, reason?:string}
 *   getProducts(ids[])           — {products:[{productId, priceLabel, ...}]}
 *   purchase(productId)          — {success, purchaseId, purchaseToken, status}
 *   getPurchases()               — {purchases:[{purchaseId, productId, ...}]}
 *   confirmPurchase(purchaseId)  — {confirmed:boolean}
 *
 * @dependencies Capacitor 8 (optional — falls back when absent)
 * @verified-against RuStore Pay SDK 10.2 / BOM 2026.04.01
 * @verified-date 2026-04-25
 */
(function () {
  'use strict';

  // Native plugin handle — undefined in web/PWA builds.
  const Native = (typeof window !== 'undefined'
    && window.Capacitor
    && window.Capacitor.Plugins
    && window.Capacitor.Plugins.RuStoreBilling) || null;

  /**
   * Return true when we're in a Capacitor native shell AND the plugin is
   * registered (i.e. Android build with RuStoreBillingPlugin on classpath).
   */
  function _hasNative() {
    return Native !== null
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform();
  }

  /**
   * Coerce any plugin rejection into a plain error object the UI can render.
   * Capacitor rejects with Error instances whose .message is the native string.
   */
  function _err(e) {
    const reason = (e && (e.message || e.errorMessage)) || String(e || 'unknown_error');
    return { success: false, reason };
  }

  const RuStoreBilling = {

    /**
     * Check availability. Returns {available:false, reason:'not_capacitor'}
     * in browser/PWA so the caller can hide purchase buttons with one check.
     */
    async isAvailable() {
      if (!_hasNative()) return { available: false, reason: 'not_capacitor' };
      try {
        return await Native.checkPurchasesAvailability();
      } catch (e) {
        return { available: false, reason: (e && e.message) || 'check_failed' };
      }
    },

    /**
     * Fetch product metadata from RuStore for the supplied ids.
     *
     * @param {string[]} productIds
     * @returns {Promise<{products: Array}>} — always resolves, products=[] in web
     */
    async getProducts(productIds) {
      if (!_hasNative()) return { products: [] };
      try {
        return await Native.getProducts({ productIds: productIds || [] });
      } catch (e) {
        console.warn('[rustore] getProducts failed:', e);
        return { products: [] };
      }
    },

    /**
     * Launch purchase flow. Returns the native PaymentResult mapped to JSON.
     * Never throws — rejections are folded into {success:false, reason}.
     *
     * @param {string} productId
     */
    async purchase(productId) {
      if (!_hasNative()) {
        return { success: false, reason: 'not_capacitor' };
      }
      try {
        return await Native.purchase({ productId });
      } catch (e) {
        return _err(e);
      }
    },

    /**
     * List unconfirmed purchases (PAID-but-not-consumed). Used at startup to
     * recover from a crash that happened between purchase and server validation.
     */
    async getPurchases() {
      if (!_hasNative()) return { purchases: [] };
      try {
        return await Native.getPurchases();
      } catch (e) {
        console.warn('[rustore] getPurchases failed:', e);
        return { purchases: [] };
      }
    },

    /**
     * Consume/confirm a consumable purchase AFTER the server has validated its
     * receipt. Calling this before server validation risks double-credit if the
     * server later rejects the receipt.
     *
     * @param {string} purchaseId
     */
    async confirmPurchase(purchaseId) {
      if (!_hasNative()) return { confirmed: false, reason: 'not_capacitor' };
      try {
        return await Native.confirmPurchase({ purchaseId });
      } catch (e) {
        return _err(e);
      }
    }
  };

  // Publish on window for compatibility with the rest of the (non-module) app.
  window.RuStoreBilling = RuStoreBilling;
})();
