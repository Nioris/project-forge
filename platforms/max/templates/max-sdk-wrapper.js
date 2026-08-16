/**
 * @file max-sdk-wrapper.js
 * @description Wrapper for MAX messenger Mini App Bridge (window.WebApp).
 *              Renames global to MaxSDK to avoid collision with Telegram
 *              (both platforms use window.WebApp!). Provides a uniform API
 *              matching telegram-sdk-wrapper.js so game code stays portable.
 *
 *              Source: https://dev.max.ru/docs/webapps/bridge
 *
 * Usage:
 *   <script src="https://st.max.ru/js/max-web-app.js"></script>
 *   <script src="max-sdk-wrapper.js"></script>
 *
 *   await MaxSDK.init();            // no-op on real MAX — data is preloaded
 *   MaxSDK.ready();                  // no-op on MAX (symmetric with Telegram wrapper)
 *
 *   const user = MaxSDK.getUser();
 *   const lang = MaxSDK.getLang();
 *   const startParam = MaxSDK.getStartParam();
 *
 *   await MaxSDK.save('key', value);          // DeviceStorage (not on web client!)
 *   const v = await MaxSDK.load('key');
 *   await MaxSDK.saveSecure('token', jwt);    // SecureStorage
 *
 *   MaxSDK.showBackButton(onBack);
 *   MaxSDK.haptic('light');
 *   MaxSDK.shareMax({ text: 'hey', link: 'https://...' });
 *
 * Fallback: if window.WebApp is undefined (file:// preview, external browser),
 * the wrapper degrades gracefully — storage → localStorage, lang → navigator.language,
 * BackButton → DOM button, haptic → no-op.
 */

(function (global) {
  'use strict';

  const WA = global.WebApp && typeof global.WebApp.initData !== 'undefined' ? global.WebApp : null;
  const isReal = !!WA;
  const LS_PREFIX = '__max_fallback_';

  function fallbackStorage(key, value, op) {
    try {
      if (op === 'set') { global.localStorage.setItem(LS_PREFIX + key, value); return { status: 'updated' }; }
      if (op === 'get') { const v = global.localStorage.getItem(LS_PREFIX + key); return { key, value: v }; }
      if (op === 'del') { global.localStorage.removeItem(LS_PREFIX + key); return { status: 'removed' }; }
    } catch { return { error: { code: 'localStorage_unavailable' } }; }
  }

  const MaxSDK = {
    /** Whether running inside real MAX (not a browser tab). */
    isReal,

    /** Platform: 'ios' | 'android' | 'desktop' | 'web' | 'fallback'. */
    get platform() { return isReal ? WA.platform : 'fallback'; },

    /** MAX client version (e.g. '25.9.16'). */
    get version() { return isReal ? WA.version : null; },

    // ═══ Init (no-op on real MAX — data preloaded) ═══

    /** Symmetric with Telegram. No actual work needed on MAX. */
    async init() {
      return { fallback: !isReal };
    },

    /** No-op on MAX, kept for API symmetry with Telegram/Yandex wrappers. */
    ready() { /* noop */ },

    /** No-op on MAX, kept for API symmetry. */
    expand() { /* noop */ },

    // ═══ User + context ═══

    /** Raw initData string — use for server-side HMAC verification. */
    getInitData() {
      return isReal ? (WA.initData || '') : '';
    },

    /** User object — DO NOT trust for auth without server-side HMAC verification. */
    getUser() {
      if (!isReal) return { id: 0, first_name: 'Local', last_name: 'Dev', language_code: 'ru' };
      return (WA.initDataUnsafe && WA.initDataUnsafe.user) || null;
    },

    /** Chat context: { id, type: 'DIALOG'|'CHAT'|'CHANNEL' }. */
    getChat() {
      if (!isReal) return null;
      return (WA.initDataUnsafe && WA.initDataUnsafe.chat) || null;
    },

    /** Language code, 2-letter lowercase. Defaults to 'ru' in MAX context. */
    getLang() {
      if (isReal && WA.initDataUnsafe && WA.initDataUnsafe.user) {
        const lc = WA.initDataUnsafe.user.language_code;
        if (lc) return lc.toLowerCase().split('-')[0];
      }
      const nav = (global.navigator && global.navigator.language) || 'ru';
      return nav.toLowerCase().split('-')[0];
    },

    /** Start parameter from deeplink (`https://max.ru/<bot>?startapp=<payload>`). */
    getStartParam() {
      if (!isReal) {
        // Allow ?startapp= in URL for dev testing outside MAX
        try {
          const u = new URL(global.location.href);
          return u.searchParams.get('startapp') || null;
        } catch { return null; }
      }
      return (WA.initDataUnsafe && WA.initDataUnsafe.start_param) || null;
    },

    // ═══ DeviceStorage (not supported on web client) ═══

    /** Save a value. Returns Promise<boolean>. */
    save(key, value) {
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      if (!isReal || !WA.DeviceStorage) {
        const r = fallbackStorage(key, v, 'set');
        return Promise.resolve(r && r.status === 'updated');
      }
      return WA.DeviceStorage.setItem(key, v).then(r => r.status === 'updated').catch(() => false);
    },

    /** Load a value. Returns Promise<string|null>. Parse JSON manually. */
    load(key) {
      if (!isReal || !WA.DeviceStorage) {
        const r = fallbackStorage(key, null, 'get');
        return Promise.resolve((r && r.value) || null);
      }
      return WA.DeviceStorage.getItem(key).then(r => (r && r.value) || null).catch(() => null);
    },

    /** Remove a value. */
    remove(key) {
      if (!isReal || !WA.DeviceStorage) {
        fallbackStorage(key, null, 'del');
        return Promise.resolve(true);
      }
      return WA.DeviceStorage.removeItem(key).then(r => r.status === 'removed').catch(() => false);
    },

    /** Clear all DeviceStorage keys for this bot. */
    clearStorage() {
      if (!isReal || !WA.DeviceStorage) return Promise.resolve();
      return WA.DeviceStorage.clear();
    },

    // ═══ SecureStorage — encrypted, up to 10 keys per bot/user ═══

    saveSecure(key, value) {
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      if (!isReal || !WA.SecureStorage) return this.save('__sec_' + key, v);
      return WA.SecureStorage.setItem(key, v).then(r => r.status === 'updated').catch(() => false);
    },

    loadSecure(key) {
      if (!isReal || !WA.SecureStorage) return this.load('__sec_' + key);
      return WA.SecureStorage.getItem(key).then(r => (r && r.value) || null).catch(() => null);
    },

    removeSecure(key) {
      if (!isReal || !WA.SecureStorage) return this.remove('__sec_' + key);
      return WA.SecureStorage.removeItem(key).then(r => r.status === 'removed').catch(() => false);
    },

    // ═══ BackButton (persistent header button) ═══

    showBackButton(onClick) {
      if (!isReal || !WA.BackButton) {
        console.log('[MaxSDK fallback] BackButton.show');
        return;
      }
      if (typeof onClick === 'function') WA.BackButton.onClick(onClick);
      WA.BackButton.show();
    },

    hideBackButton() {
      if (!isReal || !WA.BackButton) return;
      WA.BackButton.hide();
    },

    offBackButton(onClick) {
      if (!isReal || !WA.BackButton) return;
      WA.BackButton.offClick(onClick);
    },

    // ═══ Haptic feedback (iOS/Android only) ═══

    /** @param {'light'|'medium'|'heavy'|'rigid'|'soft'|'success'|'warning'|'error'} type */
    haptic(type) {
      if (!isReal || !WA.HapticFeedback) return;
      const impacts = ['light', 'medium', 'heavy', 'rigid', 'soft'];
      const notifications = ['success', 'warning', 'error'];
      if (impacts.includes(type)) {
        WA.HapticFeedback.impactOccurred(type).catch(() => {});
      } else if (notifications.includes(type)) {
        WA.HapticFeedback.notificationOccurred(type).catch(() => {});
      } else if (type === 'selection') {
        WA.HapticFeedback.selectionChanged().catch(() => {});
      }
    },

    // ═══ Sharing ═══

    /** Native OS share sheet (iOS/Android, NOT web). */
    share(params) {
      if (!isReal || !WA.shareContent) {
        console.log('[MaxSDK fallback] share:', params);
        return Promise.resolve({ status: 'cancelled' });
      }
      return WA.shareContent(params);
    },

    /** Share inside MAX (pick chat/channel). Requires user gesture. */
    shareMax(params) {
      if (!isReal || !WA.shareMaxContent) {
        console.log('[MaxSDK fallback] shareMax:', params);
        return Promise.resolve({ status: 'cancelled' });
      }
      return WA.shareMaxContent(params);
    },

    // ═══ Links ═══

    /** Open external URL in system browser. Requires user gesture. */
    openLink(url) {
      if (!isReal) { try { global.open(url, '_blank'); } catch {} return; }
      WA.openLink(url);
    },

    /** Open max.ru/<...> deeplink inside MAX (chat, contact, another mini-app). */
    openMaxLink(url) {
      if (!isReal) { try { global.open(url, '_blank'); } catch {} return; }
      WA.openMaxLink(url);
    },

    // ═══ File download ═══

    /** Download a file by HTTPS URL. Requires user gesture. */
    downloadFile(url, fileName) {
      if (!isReal || !WA.downloadFile) {
        console.log('[MaxSDK fallback] downloadFile:', url, fileName);
        return Promise.resolve({ status: 'cancelled' });
      }
      return WA.downloadFile(url, fileName);
    },

    // ═══ QR scanner ═══

    /** Scan QR code. `fileSelect=true` allows picking from gallery. */
    scanQR(fileSelect = true) {
      if (!isReal || !WA.openCodeReader) {
        console.log('[MaxSDK fallback] scanQR');
        return Promise.resolve({ value: null });
      }
      return WA.openCodeReader(fileSelect);
    },

    // ═══ Phone ═══

    /** Request user phone number. Returns Promise<{phone}>. */
    requestPhone() {
      if (!isReal || !WA.requestContact) return Promise.resolve({ phone: null });
      return WA.requestContact();
    },

    // ═══ Screen brightness + capture ═══

    maxBrightness() {
      if (!isReal || !WA.requestScreenMaxBrightness) return Promise.resolve({ maxBrightness: false });
      return WA.requestScreenMaxBrightness();
    },

    restoreBrightness() {
      if (!isReal || !WA.restoreScreenBrightness) return Promise.resolve({ maxBrightness: false });
      return WA.restoreScreenBrightness();
    },

    enableScreenCapture() {
      if (!isReal || !WA.ScreenCapture) return Promise.resolve({ isScreenCaptureEnabled: false });
      return WA.ScreenCapture.enableScreenCapture();
    },

    disableScreenCapture() {
      if (!isReal || !WA.ScreenCapture) return Promise.resolve({ isScreenCaptureEnabled: false });
      return WA.ScreenCapture.disableScreenCapture();
    },

    // ═══ Closing confirmation (for forms with unsaved data) ═══

    enableClosingConfirmation() {
      if (!isReal || !WA.enableClosingConfirmation) return;
      WA.enableClosingConfirmation();
    },

    disableClosingConfirmation() {
      if (!isReal || !WA.disableClosingConfirmation) return;
      WA.disableClosingConfirmation();
    },

    // ═══ Biometric (iOS/Android only) ═══

    biometric: {
      async init() {
        if (!isReal || !WA.BiometricManager) return { available: false, type: ['unknown'] };
        return WA.BiometricManager.init();
      },
      async authenticate(reason) {
        if (!isReal || !WA.BiometricManager) return { status: null, token: null };
        return WA.BiometricManager.authenticate(reason);
      },
      async requestAccess(reason) {
        if (!isReal || !WA.BiometricManager) return { accessGranted: false };
        return WA.BiometricManager.requestAccess(reason);
      },
      async updateToken(token, reason) {
        if (!isReal || !WA.BiometricManager) return { status: 'removed' };
        return WA.BiometricManager.updateBiometricToken(token, reason);
      },
      get isAvailable() {
        return isReal && WA.BiometricManager ? WA.BiometricManager.isBiometricAvailable : false;
      },
    },

    // ═══ NFC (Android only) ═══

    nfc: {
      async init() {
        if (!isReal || !WA.NfcManager) return { available: false, enabled: false };
        return WA.NfcManager.init();
      },
      async emulate(tag) {
        if (!isReal || !WA.NfcManager) return { status: 'stopped' };
        return WA.NfcManager.emulateNfcTag(tag);
      },
      openSettings() {
        if (!isReal || !WA.NfcManager) return Promise.resolve({ status: 'opened' });
        return WA.NfcManager.openSystemSettings();
      },
    },
  };

  global.MaxSDK = MaxSDK;
})(typeof window !== 'undefined' ? window : globalThis);
