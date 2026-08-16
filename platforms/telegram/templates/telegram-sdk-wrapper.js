/**
 * @file telegram-sdk-wrapper.js
 * @description Wrapper for Telegram Mini App SDK (window.Telegram.WebApp).
 *              Provides a uniform API similar to yandex-sdk-wrapper.js so game
 *              code can stay mostly platform-agnostic.
 *
 * Usage:
 *   <script src="https://telegram.org/js/telegram-web-app.js"></script>
 *   <script src="telegram-sdk-wrapper.js"></script>
 *
 *   await TelegramSDK.init();
 *   TelegramSDK.ready();             // signals Telegram the app is loaded
 *   TelegramSDK.expand();            // request fullscreen
 *
 *   const lang = TelegramSDK.getLang();       // 'ru' / 'en' / ...
 *   await TelegramSDK.save('save1', data);    // CloudStorage (Bot API 6.9+)
 *   const data = await TelegramSDK.load('save1');
 *
 *   TelegramSDK.onThemeChanged(applyTheme);
 *   TelegramSDK.showMainButton('Play', onPlay);
 *   TelegramSDK.hideMainButton();
 *
 * Fallback: if window.Telegram is undefined (file:// preview, external browser),
 * the wrapper degrades gracefully — saves go to localStorage, lang from
 * navigator.language, MainButton becomes a DOM button.
 */

(function (global) {
  'use strict';

  const TG = global.Telegram && global.Telegram.WebApp;
  const isReal = !!TG && typeof TG.ready === 'function';
  const LS_PREFIX = '__tg_fallback_';

  /** @type {Function[]} */
  const themeListeners = [];

  const TelegramSDK = {
    /** Whether running inside real Telegram (not a browser tab). */
    isReal,

    /** Initialize. Returns a Promise for API symmetry with Yandex SDK. */
    async init() {
      if (!isReal) return { fallback: true };
      // Bind theme change listener so game can react.
      TG.onEvent('themeChanged', () => {
        for (const cb of themeListeners) {
          try { cb(TG.themeParams, TG.colorScheme); } catch {}
        }
      });
      return { fallback: false };
    },

    /** Tell Telegram the app finished initial render. REQUIRED before user interaction. */
    ready() {
      if (!isReal) return;
      TG.ready();
    },

    /** Ask Telegram to expand the viewport to max height. */
    expand() {
      if (!isReal) return;
      TG.expand();
    },

    /** User's language, 2-letter ISO. Defaults to 'en' if unknown. */
    getLang() {
      if (isReal && TG.initDataUnsafe && TG.initDataUnsafe.user) {
        const lc = TG.initDataUnsafe.user.language_code;
        if (lc) return lc.toLowerCase().split('-')[0];
      }
      const nav = (global.navigator && global.navigator.language) || 'en';
      return nav.toLowerCase().split('-')[0];
    },

    /** Raw initData string — for server-side HMAC verification. */
    getInitData() {
      return isReal ? (TG.initData || '') : '';
    },

    /** User object (id, first_name, etc) — only valid after server-side verification. */
    getUser() {
      if (!isReal) return null;
      return (TG.initDataUnsafe && TG.initDataUnsafe.user) || null;
    },

    /** Theme params: { bg_color, text_color, hint_color, ... }. Safe to call anytime. */
    getTheme() {
      if (!isReal) return { colorScheme: 'light', themeParams: {} };
      return { colorScheme: TG.colorScheme, themeParams: TG.themeParams || {} };
    },

    /** Subscribe to theme changes. Callback: (themeParams, colorScheme) => void. */
    onThemeChanged(cb) {
      if (typeof cb === 'function') themeListeners.push(cb);
    },

    // ═══ Saves (CloudStorage, Bot API 6.9+) ═══

    /** Save a JSON-serialisable value. Returns Promise<boolean>. */
    save(key, value) {
      const s = typeof value === 'string' ? value : JSON.stringify(value);
      if (!isReal || !TG.CloudStorage) {
        try { global.localStorage.setItem(LS_PREFIX + key, s); return Promise.resolve(true); }
        catch { return Promise.resolve(false); }
      }
      return new Promise((resolve) => {
        TG.CloudStorage.setItem(key, s, (err, ok) => resolve(!err && !!ok));
      });
    },

    /** Load a value. Returns Promise<string|null>. Parse manually. */
    load(key) {
      if (!isReal || !TG.CloudStorage) {
        try { return Promise.resolve(global.localStorage.getItem(LS_PREFIX + key)); }
        catch { return Promise.resolve(null); }
      }
      return new Promise((resolve) => {
        TG.CloudStorage.getItem(key, (err, value) => resolve(err ? null : (value || null)));
      });
    },

    // ═══ MainButton / BackButton ═══

    /** Show the persistent bottom button. */
    showMainButton(text, onClick) {
      if (!isReal) { console.log('[TG fallback] MainButton:', text); return; }
      TG.MainButton.setText(text);
      TG.MainButton.onClick(onClick);
      TG.MainButton.show();
    },

    hideMainButton() {
      if (!isReal) return;
      TG.MainButton.hide();
      TG.MainButton.offClick();
    },

    /** Show the back-arrow in top-left. Auto-hides when user navigates out. */
    showBackButton(onClick) {
      if (!isReal) return;
      TG.BackButton.onClick(onClick);
      TG.BackButton.show();
    },

    hideBackButton() {
      if (!isReal) return;
      TG.BackButton.hide();
      TG.BackButton.offClick();
    },

    // ═══ Haptic feedback ═══

    haptic(type) {
      if (!isReal || !TG.HapticFeedback) return;
      // type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'success' | 'warning' | 'error'
      if (['success', 'warning', 'error'].includes(type)) {
        TG.HapticFeedback.notificationOccurred(type);
      } else {
        TG.HapticFeedback.impactOccurred(type);
      }
    },

    // ═══ Stars payments (Bot API 7.4+) ═══

    /**
     * Open an invoice. `invoiceLink` is created server-side via createInvoiceLink
     * with currency:'XTR'. Callback gets status: 'paid' | 'cancelled' | 'failed' | 'pending'.
     */
    showInvoice(invoiceLink, onStatus) {
      if (!isReal || !TG.showInvoice) {
        console.log('[TG fallback] showInvoice:', invoiceLink);
        onStatus && onStatus('cancelled');
        return;
      }
      TG.showInvoice(invoiceLink, onStatus || (() => {}));
    },

    // ═══ Utility ═══

    /** Close the Mini App. */
    close() {
      if (!isReal) return;
      TG.close();
    },

    /** Show a native alert. Returns Promise. */
    alert(msg) {
      if (!isReal) { return Promise.resolve(global.alert(msg)); }
      return new Promise((resolve) => TG.showAlert(msg, resolve));
    },

    /** Show a native confirm. Returns Promise<boolean>. */
    confirm(msg) {
      if (!isReal) { return Promise.resolve(global.confirm(msg)); }
      return new Promise((resolve) => TG.showConfirm(msg, resolve));
    },
  };

  global.TelegramSDK = TelegramSDK;
})(typeof window !== 'undefined' ? window : globalThis);
