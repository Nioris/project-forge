/**
 * @file vk-bridge-wrapper.js
 * @description Обёртка над VK Bridge с dev-mode fallback, sharded storage,
 *              сериализованной очередью записи, и корректной обработкой
 *              платформенных различий (iOS/Android/Web).
 *
 *              Идея — полный аналог yandex-sdk-wrapper.js, но для VK Mini Apps.
 *              Игра работает ОДИНАКОВО и в клиенте ВК, и при открытии URL
 *              напрямую в браузере (для разработки и модерации).
 *
 * @dependencies @vkontakte/vk-bridge (browser.min.js через <script> или import)
 *
 * Key functions:
 *   VKApp.init()                 — инициализация, ДОЛЖНА быть до любых других вызовов
 *   VKApp.storageSet/Get         — ≤4KB обёртка с очередью
 *   VKApp.storageSetSharded/Get  — шардинг для > 2KB данных
 *   VKApp.showRewarded(cb)       — check + show + reward только при result:true
 *   VKApp.showInterstitial()     — с 60s cooldown
 *   VKApp.purchase(itemId)       — ShowOrderBox для голосов
 *   VKApp.onPause / onResume     — колбэки для mute/pause игры
 *   VKApp.isVKEnv                — true если внутри клиента ВК
 *   VKApp.lang                   — язык из vk_language или navigator
 *   VKApp.platform               — vk_platform или 'web_dev'
 */

(function (global) {
  'use strict';

  // ═══ ДЕТЕКЦИЯ СРЕДЫ ═══

  const LAUNCH_PARAMS = new URLSearchParams(global.location.search);
  const IS_VK_ENV = LAUNCH_PARAMS.has('vk_app_id');

  // vk-bridge есть как window.vkBridge (browser build) или import
  // В dev-mode (без vk_app_id в URL) bridge может быть, но всё равно не сработает
  const nativeBridge = global.vkBridge || (global.bridge && global.bridge.send ? global.bridge : null);

  // Fallback реализация для dev: эмулирует Bridge через localStorage / моки
  const devBridge = createDevBridge();

  /**
   * Выбор реализации моста. В VK-среде — нативный, иначе — dev.
   * Не решаем по наличию nativeBridge — скрипт vk-bridge может загрузиться
   * и в обычном браузере, но VKWebAppInit всё равно не ответит без iframe.
   */
  const bridge = IS_VK_ENV && nativeBridge ? nativeBridge : devBridge;

  // ═══ СОСТОЯНИЕ ═══

  const state = {
    initialised: false,
    userInfo: null,
    lang: 'ru',
    scheme: 'bright_light',
    platform: 'web_dev',
    lastInterstitialAt: 0,
    rewardedAvailable: null,   // null = ещё не проверяли
  };

  const callbacks = {
    onPause: () => {},    // игра должна: mute + pause loop + cancel RAF
    onResume: () => {},   // игра должна: unmute + resume loop + reset lastTime
    onThemeChange: () => {},
    onConfigUpdate: () => {},
  };

  // ═══ ОЧЕРЕДЬ ЗАПИСИ (issue #192) ═══
  //
  // Параллельные VKWebAppStorageSet ломают Bridge. Ставим все write-операции
  // в последовательную очередь.

  let writeQueue = Promise.resolve();

  /**
   * Поставить операцию в конец очереди записи. Возвращает промис с результатом.
   * Ошибка в одной операции не останавливает очередь.
   */
  function enqueueWrite(fn) {
    const result = writeQueue.then(fn, fn);
    writeQueue = result.catch(() => {});
    return result;
  }

  // ═══ ИНИЦИАЛИЗАЦИЯ ═══

  /**
   * Инициализировать VK Bridge. ОБЯЗАТЕЛЬНО вызвать первым, ДО рендера UI
   * и ДО любых других Bridge-методов. На мобильных клиентах ВК без этого
   * вызова приложение не стартует.
   *
   * @returns {Promise<{lang:string, platform:string, scheme:string}>}
   */
  async function init() {
    if (state.initialised) return getEnvInfo();

    // Подписка на события — обязательно ДО send('VKWebAppInit')
    bridge.subscribe(onBridgeEvent);

    // Определить язык и платформу из launch params (ДО рендера UI)
    state.lang = (LAUNCH_PARAMS.get('vk_language') || detectBrowserLang() || 'ru').slice(0, 2);
    state.platform = LAUNCH_PARAMS.get('vk_platform') || 'web_dev';

    try {
      await bridge.send('VKWebAppInit');
      state.initialised = true;
    } catch (e) {
      // В dev-mode VKWebAppInit может упасть — это ок, продолжаем на fallback
      state.initialised = true;
    }

    return getEnvInfo();
  }

  /**
   * Обработчик всех событий VK Bridge.
   * Важные события: ViewHide/ViewRestore (для pause/resume), UpdateConfig (тема).
   */
  function onBridgeEvent(event) {
    if (!event || !event.detail) return;
    const { type, data } = event.detail;

    switch (type) {
      case 'VKWebAppViewHide':
        // Вкладка ВК свёрнута, приложение развёрнуто в фоне
        callbacks.onPause();
        break;
      case 'VKWebAppViewRestore':
        callbacks.onResume();
        break;
      case 'VKWebAppUpdateConfig':
        if (data) {
          state.scheme = data.scheme || state.scheme;
          const isDark = /dark|space_gray/.test(state.scheme);
          callbacks.onThemeChange(isDark ? 'dark' : 'light', state.scheme);
          callbacks.onConfigUpdate(data);
        }
        break;
    }
  }

  function getEnvInfo() {
    return {
      isVK: IS_VK_ENV,
      lang: state.lang,
      platform: state.platform,
      scheme: state.scheme,
      appId: LAUNCH_PARAMS.get('vk_app_id'),
      userId: LAUNCH_PARAMS.get('vk_user_id'),
    };
  }

  // ═══ STORAGE ═══

  /**
   * Сохранить значение в VK Storage (или localStorage в dev).
   * Ключ должен соответствовать [a-zA-Z_\-0-9]. Значение до 4096 байт.
   *
   * Параллельные вызовы автоматически сериализуются через writeQueue.
   *
   * @param {string} key — имя ключа
   * @param {string} value — строка, будет сохранена как есть
   * @returns {Promise<boolean>} — true если ок
   */
  function storageSet(key, value) {
    validateKey(key);
    const str = String(value);
    return enqueueWrite(async () => {
      try {
        await bridge.send('VKWebAppStorageSet', { key, value: str });
        return true;
      } catch (e) {
        console.warn('[VK] storageSet failed', key, e);
        return false;
      }
    });
  }

  /**
   * Сохранить JSON-объект. Использует JSON.stringify.
   * ВНИМАНИЕ: для JSON реальный лимит ~2236 байт (баг VK, issue #226).
   * Если ожидаете больше — используйте storageSetSharded.
   */
  function storageSetJSON(key, obj) {
    return storageSet(key, JSON.stringify(obj));
  }

  /**
   * Прочитать значение. Если ключа нет — возвращает ''.
   */
  async function storageGet(key) {
    validateKey(key);
    try {
      const r = await bridge.send('VKWebAppStorageGet', { keys: [key] });
      const found = r && r.keys && r.keys.find(k => k.key === key);
      return found ? found.value : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Прочитать JSON. Возвращает null если ключа нет или парсинг сломан.
   */
  async function storageGetJSON(key, fallback = null) {
    const raw = await storageGet(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  /**
   * Прочитать список ключей массивом (до 10 за один Bridge-вызов).
   */
  async function storageGetMany(keys) {
    keys.forEach(validateKey);
    if (keys.length === 0) return {};
    // Режем на батчи по 10 — лимит VK API
    const result = {};
    for (let i = 0; i < keys.length; i += 10) {
      const batch = keys.slice(i, i + 10);
      try {
        const r = await bridge.send('VKWebAppStorageGet', { keys: batch });
        (r.keys || []).forEach(({ key, value }) => { result[key] = value; });
      } catch {}
    }
    return result;
  }

  // ─── Шардирование для > 2KB данных ───
  //
  // Большие структуры сохраняем кусками:
  //   key__meta  → {"v":1,"count":3,"total":5000}
  //   key__0     → первые ~2000 байт
  //   key__1     → следующие ~2000 байт
  //   key__2     → остаток

  const SHARD_SIZE = 1800;  // с запасом ниже 2236-байтового лимита JSON

  function storageSetSharded(key, obj) {
    validateKey(key);
    return enqueueWrite(async () => {
      const full = JSON.stringify(obj);
      const count = Math.ceil(full.length / SHARD_SIZE);
      const shards = [];
      for (let i = 0; i < count; i++) {
        shards.push(full.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE));
      }
      // Meta первой — если падение после, читатель поймёт что часть потеряна
      await bridge.send('VKWebAppStorageSet', {
        key: `${key}__meta`,
        value: JSON.stringify({ v: 1, count, total: full.length }),
      });
      for (let i = 0; i < count; i++) {
        await bridge.send('VKWebAppStorageSet', {
          key: `${key}__${i}`,
          value: shards[i],
        });
      }
      return true;
    });
  }

  async function storageGetSharded(key, fallback = null) {
    validateKey(key);
    try {
      const metaRaw = await storageGet(`${key}__meta`);
      if (!metaRaw) return fallback;
      const meta = JSON.parse(metaRaw);
      const keys = [];
      for (let i = 0; i < meta.count; i++) keys.push(`${key}__${i}`);
      const parts = await storageGetMany(keys);
      let combined = '';
      for (let i = 0; i < meta.count; i++) {
        const p = parts[`${key}__${i}`];
        if (p === undefined) return fallback;  // потеряли шард → не реконструируем
        combined += p;
      }
      return JSON.parse(combined);
    } catch {
      return fallback;
    }
  }

  function validateKey(key) {
    if (typeof key !== 'string' || !/^[a-zA-Z_\-0-9]{1,100}$/.test(key)) {
      throw new Error(`[VK] Invalid storage key "${key}". Allowed: [a-zA-Z_\\-0-9], max 100 chars.`);
    }
  }

  // ═══ РЕКЛАМА ═══

  const INTERSTITIAL_COOLDOWN_MS = 60_000;

  /**
   * Проверить доступность rewarded-рекламы. Результат кешируется в state.
   * Игра ДОЛЖНА скрывать кнопку rewarded если возвращает false.
   */
  async function checkRewarded() {
    try {
      if (!bridge.supports || !bridge.supports('VKWebAppCheckNativeAds')) {
        state.rewardedAvailable = false;
        return false;
      }
      const r = await bridge.send('VKWebAppCheckNativeAds', { ad_format: 'reward' });
      state.rewardedAvailable = !!(r && r.result);
      return state.rewardedAvailable;
    } catch {
      state.rewardedAvailable = false;
      return false;
    }
  }

  /**
   * Показать rewarded-рекламу. Колбэк onReward вызывается ТОЛЬКО при result:true
   * от Bridge — это единственный корректный способ выдать награду.
   *
   * @param {Function} onReward — вызывается при успешном просмотре
   * @param {Function} [onNoAd] — вызывается если рекламы нет (без наказания)
   */
  async function showRewarded(onReward, onNoAd) {
    callbacks.onPause();
    try {
      if (!bridge.supports || !bridge.supports('VKWebAppShowNativeAds')) {
        if (onNoAd) onNoAd();
        return;
      }
      const r = await bridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' });

      // Защита от iOS-бага (issue #214): в авиарежиме приходит { no_ad_reason: false }
      // без реального просмотра. Награду выдаём ТОЛЬКО при явном result === true.
      if (r && r.result === true) {
        onReward();
      } else {
        if (onNoAd) onNoAd();
      }
    } catch (e) {
      if (onNoAd) onNoAd();
    } finally {
      callbacks.onResume();
    }
  }

  /**
   * Показать interstitial. Уважает 60-секундный cooldown.
   * Вызывать ТОЛЬКО в логических паузах (между уровнями, после смерти, в меню).
   */
  async function showInterstitial() {
    const now = Date.now();
    if (now - state.lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) return false;

    callbacks.onPause();
    try {
      if (!bridge.supports || !bridge.supports('VKWebAppShowNativeAds')) return false;
      await bridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
      state.lastInterstitialAt = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      callbacks.onResume();
    }
  }

  /**
   * Показать preloader-рекламу параллельно с загрузкой игры.
   */
  async function showPreloader() {
    try {
      if (!bridge.supports || !bridge.supports('VKWebAppShowNativeAds')) return;
      await bridge.send('VKWebAppShowNativeAds', { ad_format: 'preloader' });
    } catch {}
  }

  /**
   * Показать баннерную рекламу.
   */
  async function showBanner(location = 'bottom', layout = 'resize') {
    try {
      if (!bridge.supports || !bridge.supports('VKWebAppShowBannerAd')) return false;
      await bridge.send('VKWebAppShowBannerAd', {
        banner_location: location,
        layout_type: layout,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function hideBanner() {
    try {
      if (bridge.supports && bridge.supports('VKWebAppHideBannerAd')) {
        await bridge.send('VKWebAppHideBannerAd');
      }
    } catch {}
  }

  // ═══ ПОКУПКИ ═══

  /**
   * Открыть диалог покупки за голоса. Виртуальный товар ОБЯЗАН быть зарегистрирован
   * в кабинете (dev.vk.com → Настройки → Платежи), и сервер обязан уметь отвечать
   * на callback-запросы get_item и order_status_change.
   *
   * @param {string} itemId — строковый ID товара, прокидывается в callback как `item`
   * @returns {Promise<{status:string, order_id?:number}>}
   */
  async function purchase(itemId) {
    try {
      const r = await bridge.send('VKWebAppShowOrderBox', {
        type: 'item',
        item: String(itemId),
      });
      return r;   // { status: 'success'|'cancel'|'fail', ... }
    } catch (e) {
      return { status: 'fail', error: String(e) };
    }
  }

  // ═══ СОЦИАЛЬНЫЕ ═══

  async function inviteFriends() {
    try {
      if (!bridge.supports('VKWebAppShowInviteBox')) return false;
      const r = await bridge.send('VKWebAppShowInviteBox');
      return !!(r && r.success);
    } catch { return false; }
  }

  async function shareStory(imageUrl, appLink) {
    try {
      if (!bridge.supports('VKWebAppShowStoryBox')) return false;
      await bridge.send('VKWebAppShowStoryBox', {
        background_type: 'image',
        url: imageUrl,
        attachment: appLink
          ? { type: 'url', url: appLink, text: 'open' }
          : undefined,
      });
      return true;
    } catch { return false; }
  }

  async function showLeaderboard(score) {
    try {
      if (!bridge.supports('VKWebAppShowLeaderBoardBox')) return false;
      await bridge.send('VKWebAppShowLeaderBoardBox', { user_result: score });
      return true;
    } catch { return false; }
  }

  async function addToFavorites() {
    try {
      if (!bridge.supports('VKWebAppAddToFavorites')) return false;
      await bridge.send('VKWebAppAddToFavorites');
      return true;
    } catch { return false; }
  }

  // ═══ ПОЛЬЗОВАТЕЛЬ ═══

  async function getUserInfo() {
    if (state.userInfo) return state.userInfo;
    try {
      state.userInfo = await bridge.send('VKWebAppGetUserInfo');
      return state.userInfo;
    } catch {
      return null;
    }
  }

  // ═══ КОЛБЭКИ (игра регистрирует свои обработчики) ═══

  function setOnPause(fn)        { callbacks.onPause = fn || (() => {}); }
  function setOnResume(fn)       { callbacks.onResume = fn || (() => {}); }
  function setOnThemeChange(fn)  { callbacks.onThemeChange = fn || (() => {}); }
  function setOnConfigUpdate(fn) { callbacks.onConfigUpdate = fn || (() => {}); }

  // Автоматически реагируем на visibilitychange — важно для desktop_web,
  // где VKWebAppViewHide не приходит
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) callbacks.onPause();
    else callbacks.onResume();
  });

  // ═══ DEV FALLBACK ═══

  /**
   * Эмуляция VK Bridge через localStorage для разработки вне клиента ВК.
   * Позволяет гонять игру в обычном браузере без ВК-окружения.
   */
  function createDevBridge() {
    const subscribers = [];
    const PREFIX = 'vk_storage_dev_';

    async function send(method, params = {}) {
      console.log('[VK dev]', method, params);

      switch (method) {
        case 'VKWebAppInit':
          return { result: true };

        case 'VKWebAppStorageSet': {
          localStorage.setItem(PREFIX + params.key, params.value);
          return { result: true };
        }

        case 'VKWebAppStorageGet': {
          const keys = (params.keys || []).map(k => ({
            key: k,
            value: localStorage.getItem(PREFIX + k) || '',
          }));
          return { keys };
        }

        case 'VKWebAppCheckNativeAds':
          return { result: true };   // в dev делаем вид что реклама есть

        case 'VKWebAppShowNativeAds':
          alert(`[dev] ${params.ad_format} ad (имитация).`);
          return { result: true };

        case 'VKWebAppShowOrderBox':
          return confirm(`[dev] Купить "${params.item}"?`)
            ? { status: 'success', order_id: Date.now() }
            : { status: 'cancel' };

        case 'VKWebAppGetUserInfo':
          return {
            id: 1, first_name: 'Dev', last_name: 'User',
            photo_100: '', photo_200: '',
          };

        case 'VKWebAppAddToFavorites':
        case 'VKWebAppShowInviteBox':
        case 'VKWebAppShowStoryBox':
        case 'VKWebAppShowLeaderBoardBox':
        case 'VKWebAppShowBannerAd':
        case 'VKWebAppHideBannerAd':
          return { result: true };

        default:
          console.warn('[VK dev] method not mocked:', method);
          throw new Error(`Method ${method} not supported in dev mode`);
      }
    }

    function supports(method) {
      // В dev говорим что поддерживаются все методы, которые мы замокали выше
      const mocked = [
        'VKWebAppInit','VKWebAppStorageSet','VKWebAppStorageGet',
        'VKWebAppCheckNativeAds','VKWebAppShowNativeAds',
        'VKWebAppShowOrderBox','VKWebAppGetUserInfo',
        'VKWebAppAddToFavorites','VKWebAppShowInviteBox',
        'VKWebAppShowStoryBox','VKWebAppShowLeaderBoardBox',
        'VKWebAppShowBannerAd','VKWebAppHideBannerAd',
      ];
      return mocked.includes(method);
    }

    function subscribe(fn) {
      subscribers.push(fn);
    }

    return { send, subscribe, supports };
  }

  function detectBrowserLang() {
    const nav = (global.navigator.language || '').toLowerCase();
    if (nav.startsWith('ru')) return 'ru';
    if (nav.startsWith('uk')) return 'uk';
    if (nav.startsWith('be')) return 'be';
    if (nav.startsWith('kk')) return 'kk';
    if (nav.startsWith('uz')) return 'uz';
    return 'en';
  }

  // ═══ ЭКСПОРТ ═══

  const VKApp = {
    // окружение
    isVKEnv: IS_VK_ENV,
    get lang()     { return state.lang; },
    get platform() { return state.platform; },
    get scheme()   { return state.scheme; },

    // инициализация
    init,

    // storage
    storageSet, storageGet,
    storageSetJSON, storageGetJSON,
    storageGetMany,
    storageSetSharded, storageGetSharded,

    // реклама
    checkRewarded,
    showRewarded,
    showInterstitial,
    showPreloader,
    showBanner,
    hideBanner,

    // покупки
    purchase,

    // соц
    inviteFriends,
    shareStory,
    showLeaderboard,
    addToFavorites,

    // пользователь
    getUserInfo,

    // колбэки
    setOnPause,
    setOnResume,
    setOnThemeChange,
    setOnConfigUpdate,

    // низкоуровневый доступ (осторожно)
    _bridge: bridge,
    _state: state,
  };

  // Для <script src> — в global (window)
  global.VKApp = VKApp;

  // Для ES-модулей
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VKApp;
  }
})(typeof window !== 'undefined' ? window : globalThis);
