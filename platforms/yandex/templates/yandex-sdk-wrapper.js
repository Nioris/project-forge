/**
 * Yandex Games SDK Wrapper
 * Универсальная обёртка для HTML5 игр
 */
const YandexSDK = {
    _ysdk: null,
    _player: null,
    _payments: null,
    _initialized: false,
    _onPause: null,
    _onResume: null,

    /**
     * Инициализация SDK
     * Вызвать при старте игры
     */
    async init() {
        try {
            this._ysdk = await YaGames.init();
            this._initialized = true;

            // Подписка на события паузы/возобновления.
            // КРИТИЧНО: всегда дёргать GameplayAPI.stop()/start() — иначе
            // в Yandex Games панели снизу индикатор "Gameplay is stopped"
            // зависает после первой же рекламы. Аудио-обработчики игры
            // вызываются ДОПОЛНИТЕЛЬНО.
            this._ysdk.on('game_api_pause', () => {
                this.stopGameplay();
                if (this._onPause) this._onPause();
            });
            this._ysdk.on('game_api_resume', () => {
                this.startGameplay();
                if (this._onResume) this._onResume();
            });

            // Получить игрока
            this._player = await this._ysdk.getPlayer();

            console.log('[YandexSDK] Initialized successfully');
            return this._ysdk;
        } catch (e) {
            console.error('[YandexSDK] Init failed:', e);
            return null;
        }
    },

    // ==================== LIFECYCLE ====================

    /** Сигнал готовности игры (ОБЯЗАТЕЛЬНО) */
    ready() {
        this._ysdk?.features?.LoadingAPI?.ready();
    },

    /** Начало геймплея */
    startGameplay() {
        this._ysdk?.features?.GameplayAPI?.start();
    },

    /** Остановка геймплея */
    stopGameplay() {
        this._ysdk?.features?.GameplayAPI?.stop();
    },

    /**
     * Установить колбэки паузы/возобновления
     * @param {Function} onPause — вызывается при паузе (реклама, сворачивание вкладки)
     * @param {Function} onResume — вызывается при возобновлении
     */
    setGameCallbacks(onPause, onResume) {
        this._onPause = onPause;
        this._onResume = onResume;
    },

    // ==================== РЕКЛАМА ====================

    /**
     * Показать полноэкранную рекламу (Interstitial)
     * Вызывать ТОЛЬКО в естественных паузах
     * @returns {Promise<boolean>} wasShown
     */
    showInterstitial() {
        return new Promise((resolve) => {
            if (!this._ysdk) { resolve(false); return; }
            this._ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onOpen: () => {
                        if (this._onPause) this._onPause();
                    },
                    onClose: (wasShown) => {
                        if (this._onResume) this._onResume();
                        resolve(wasShown);
                    },
                    onError: (error) => {
                        console.warn('[YandexSDK] Interstitial error:', error);
                        resolve(false);
                    }
                }
            });
        });
    },

    /**
     * Показать рекламу за вознаграждение (Rewarded Video)
     * @param {Function} onRewarded — колбэк начисления награды
     * @returns {Promise<boolean>} rewarded
     *
     * Race-safe: Yandex SDK НЕ гарантирует что onRewarded вызовется ДО onClose.
     * На некоторых браузерах/типах рекламы порядок обратный → если резолвить
     * сразу на onClose, late onRewarded не успеет установить флаг → юзер
     * посмотрел рекламу но награды не получил. Известный баг — Circle 2048 v1.0.
     * Фикс: defer resolve на 200мс после onClose, чтобы поздний onRewarded успел.
     */
    showRewarded(onRewarded) {
        return new Promise((resolve) => {
            if (!this._ysdk) { resolve(false); return; }
            let rewarded = false;
            let closed = false;
            let resolved = false;
            const finish = () => {
                if (resolved) return;
                resolved = true;
                if (this._onResume) this._onResume();
                resolve(rewarded);
            };
            this._ysdk.adv.showRewardedVideo({
                callbacks: {
                    onOpen: () => {
                        if (this._onPause) this._onPause();
                    },
                    onRewarded: () => {
                        rewarded = true;
                        if (onRewarded) onRewarded();
                        if (closed) finish(); // late onRewarded — finish now
                    },
                    onClose: () => {
                        closed = true;
                        setTimeout(finish, 200); // wait for late onRewarded
                    },
                    onError: (error) => {
                        console.warn('[YandexSDK] Rewarded error:', error);
                        finish();
                    }
                }
            });
        });
    },

    /** Показать sticky banner */
    async showBanner() {
        if (!this._ysdk) return;
        return this._ysdk.adv.showBannerAdv();
    },

    /** Скрыть sticky banner */
    async hideBanner() {
        if (!this._ysdk) return;
        return this._ysdk.adv.hideBannerAdv();
    },

    /** Проверить статус sticky banner */
    async getBannerStatus() {
        if (!this._ysdk) return { stickyAdvIsShowing: false };
        return this._ysdk.adv.getBannerAdvStatus();
    },

    // ==================== ДАННЫЕ ИГРОКА ====================

    /** Авторизован ли игрок */
    isAuthorized() {
        return this._player?.isAuthorized() || false;
    },

    /** Открыть диалог авторизации */
    async authorize() {
        if (!this._ysdk) return false;
        try {
            await this._ysdk.auth.openAuthDialog();
            this._player = await this._ysdk.getPlayer();
            return true;
        } catch (e) {
            return false;
        }
    },

    /** Получить информацию об игроке */
    getPlayerInfo() {
        if (!this._player) return null;
        return {
            uniqueID: this._player.getUniqueID(),
            name: this._player.getName(),
            photo: this._player.getPhoto('medium'),
            isAuthorized: this._player.isAuthorized(),
            payingStatus: this._player.getPayingStatus()
        };
    },

    /**
     * Сохранить данные игрока (макс 200 КБ)
     * @param {Object} data — объект с данными
     * @param {boolean} flush — немедленная отправка
     *
     * Dedup: Yandex SDK throws "The data does not differ from the previous ones."
     * if setData is called with identical payload. Skip duplicates.
     */
    async saveData(data, flush = false) {
        if (!this._player) return false;
        let json;
        try { json = JSON.stringify(data); } catch(e) { return false; }
        if (json === this._lastSavedJson) return true; // skip identical
        this._lastSavedJson = json;
        try {
            await this._player.setData(data, flush);
            return true;
        } catch (e) {
            // Suppress noisy "data does not differ" — already de-duped above so rare
            const msg = String(e && e.message || e);
            if (!/data does not differ/i.test(msg)) console.error('[YandexSDK] saveData error:', msg);
            return false;
        }
    },

    /**
     * Загрузить данные игрока
     * @param {string[]} keys — массив ключей (опционально, все если не указано)
     * @returns {Object|null}
     */
    async loadData(keys) {
        if (!this._player) return null;
        try {
            return await this._player.getData(keys);
        } catch (e) {
            console.error('[YandexSDK] loadData error:', e);
            return null;
        }
    },

    /**
     * Сохранить числовые статистики (макс 10 КБ)
     * @param {Object} stats — { key: number }
     */
    async saveStats(stats) {
        if (!this._player) return false;
        try {
            await this._player.setStats(stats);
            return true;
        } catch (e) {
            console.error('[YandexSDK] saveStats error:', e);
            return false;
        }
    },

    /**
     * Инкрементировать статистики (атомарно)
     * @param {Object} increments — { key: delta }
     */
    async incrementStats(increments) {
        if (!this._player) return false;
        try {
            await this._player.incrementStats(increments);
            return true;
        } catch (e) {
            console.error('[YandexSDK] incrementStats error:', e);
            return false;
        }
    },

    /**
     * Загрузить числовые статистики
     * @param {string[]} keys — массив ключей (опционально)
     * @returns {Object|null}
     */
    async loadStats(keys) {
        if (!this._player) return null;
        try {
            return await this._player.getStats(keys);
        } catch (e) {
            console.error('[YandexSDK] loadStats error:', e);
            return null;
        }
    },

    /**
     * iOS Safe Storage (замена localStorage)
     * @returns {Storage-like object}
     */
    async getSafeStorage() {
        if (!this._ysdk) return null;
        return this._ysdk.getStorage();
    },

    // ==================== ПОКУПКИ ====================

    /** Инициализировать платежи (вызвать 1 раз) */
    async initPayments() {
        if (!this._ysdk) return false;
        try {
            this._payments = await this._ysdk.getPayments();
            return true;
        } catch (e) {
            console.error('[YandexSDK] initPayments error:', e);
            return false;
        }
    },

    /** Получить каталог товаров */
    _catalog: {},
    async getCatalog() {
        if (!this._payments) return [];
        try {
            const items = await this._payments.getCatalog();
            for (const it of items) this._catalog[it.id] = it;
            return items;
        } catch (e) {
            console.error('[YandexSDK] getCatalog error:', e);
            return [];
        }
    },

    /**
     * REQ-3.8: Render localized price for an IAP item.
     * Returns HTML string: "29 <img src='...' style='height:14px;...' />".
     *
     * Yandex docs are explicit: currency MUST come from SDK (priceValue +
     * getPriceCurrencyImage). It depends on user's account country, NOT UI
     * language — a Belarus user sees RU lang but pays in BYN, Kazakhstan in
     * KZT etc. Mapping `lang → currency` is structurally broken.
     *
     * IMPORTANT: getPriceCurrencyImage(size) returns a URL string, NOT an <img>
     * tag — must wrap manually. Past mistake: rendering raw URL as text shows
     * "29 //yastatic.net/.../currency-icon-s.png" instead of the icon.
     *
     * NEVER hardcode currency anywhere — not "YAN", not "₽", not "$".
     * Past rejections: Driftworld v1.9 for "29 YAN", risk-of-rejection for
     * lang-based fake symbols.
     *
     * Returns null if catalog not ready. UI MUST handle this with a loader,
     * not show fake currency.
     *
     * @param {string} id — product id
     * @returns {string|null} HTML string or null if catalog not loaded
     */
    getPrice(id) {
        const it = this._catalog[id];
        if (!it || typeof it.priceValue === 'undefined') return null;
        // Yandex REQUIRES icon, NOT text code (per docs Apr 2026):
        //   п. 3.8:    "Портальная валюта определяется автоматически, для ее
        //              обозначения используются методы SDK"
        //   п. 1.13.2: "Название и иконка портальной валюты взяты из SDK"
        // Moderation REJECTS text codes "RUB"/"USD"/"YAN" — must render
        // getPriceCurrencyImage() as <img>. it.price ("29 RUB" text) is
        // ALSO rejected — past rejection Driftworld v1.9.
        try {
            if (typeof it.getPriceCurrencyImage === 'function') {
                const iconUrl = it.getPriceCurrencyImage('svg') || it.getPriceCurrencyImage('medium') || it.getPriceCurrencyImage('small');
                if (iconUrl) {
                    // IMPORTANT: do NOT apply CSS filter to the <img>. Yandex
                    // п.1.13.2 requires currency icon to be displayed AS-IS
                    // from SDK. Recoloring (brightness/invert) = modification
                    // → moderation fail.
                    // Yandex icons (incl. mock TST ¥) are dark glyphs on
                    // transparent. On dark UI they are invisible, so wrap in
                    // a light chip background — the icon itself stays
                    // unmodified, like any logo placed on a contrasting card.
                    // For light UI: remove `background` from the <span>.
                    return it.priceValue + ' <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:rgba(255,255,255,0.92);border-radius:50%;vertical-align:middle;margin-left:2px;"><img src="' + iconUrl + '" alt="" style="width:14px;height:14px;display:block;" onerror="this.style.display=\'none\'"></span>';
                }
            }
            // No icon URL → show number only. Better than text codes (REQ-3.8 prohibits).
            return String(it.priceValue);
        } catch (e) {}
        return null;
    },

    /** True when IAP catalog has been loaded — UI should show loader / disable
     * purchase buttons until this is true. */
    isCatalogReady() {
        return this._catalog && Object.keys(this._catalog).length > 0;
    },

    /**
     * Купить товар
     * @param {string} id — ID товара
     * @returns {Object|null} purchase { productID, purchaseToken }
     */
    async purchase(id) {
        if (!this._payments) return null;
        try {
            return await this._payments.purchase({ id });
        } catch (e) {
            console.warn('[YandexSDK] purchase cancelled/failed:', e);
            return null;
        }
    },

    /**
     * Подтвердить потребление покупки
     * ВЫЗЫВАТЬ ТОЛЬКО ПОСЛЕ начисления товара игроку!
     * @param {string} token — purchaseToken
     */
    async consumePurchase(token) {
        if (!this._payments) return false;
        try {
            await this._payments.consumePurchase(token);
            return true;
        } catch (e) {
            console.error('[YandexSDK] consumePurchase error:', e);
            return false;
        }
    },

    /**
     * Получить незавершённые покупки
     * ОБЯЗАТЕЛЬНО обрабатывать при каждом запуске!
     * @returns {Array} purchases
     */
    async getPurchases() {
        if (!this._payments) return [];
        try {
            return await this._payments.getPurchases();
        } catch (e) {
            console.error('[YandexSDK] getPurchases error:', e);
            return [];
        }
    },

    // ==================== ЛИДЕРБОРДЫ ====================

    /**
     * Записать счёт в лидерборд
     * @param {string} leaderboardName — техническое имя
     * @param {number} score — счёт (целое число)
     * @param {string} extraData — дополнительные данные (опционально)
     */
    async setScore(leaderboardName, score, extraData) {
        if (!this._ysdk) return false;
        try {
            await this._ysdk.leaderboards.setScore(leaderboardName, score, extraData);
            return true;
        } catch (e) {
            console.error('[YandexSDK] setScore error:', e);
            return false;
        }
    },

    /**
     * Получить записи лидерборда
     * @param {string} leaderboardName
     * @param {Object} opts — { includeUser, quantityAround, quantityTop }
     */
    async getLeaderboard(leaderboardName, opts = {}) {
        if (!this._ysdk) return null;
        try {
            return await this._ysdk.leaderboards.getEntries(leaderboardName, {
                includeUser: opts.includeUser || false,
                quantityAround: opts.quantityAround || 5,
                quantityTop: opts.quantityTop || 10
            });
        } catch (e) {
            console.error('[YandexSDK] getLeaderboard error:', e);
            return null;
        }
    },

    /**
     * Получить запись текущего игрока
     * @param {string} leaderboardName
     */
    async getPlayerEntry(leaderboardName) {
        if (!this._ysdk) return null;
        try {
            return await this._ysdk.leaderboards.getPlayerEntry(leaderboardName);
        } catch (e) {
            // LEADERBOARD_PLAYER_NOT_PRESENT — нормальная ситуация
            return null;
        }
    },

    // ==================== ЛОКАЛИЗАЦИЯ ====================

    /** Получить текущий язык (ISO 639-1) */
    getLang() {
        return this._ysdk?.environment?.i18n?.lang || 'en';
    },

    /** Получить текущий домен */
    getTLD() {
        return this._ysdk?.environment?.i18n?.tld || 'com';
    },

    // ==================== REMOTE CONFIG ====================

    /**
     * Получить флаги (remote config)
     * @param {Object} defaultFlags — значения по умолчанию
     * @param {Array} clientFeatures — клиентские параметры [{ name, value }]
     */
    async getFlags(defaultFlags = {}, clientFeatures = []) {
        if (!this._ysdk) return defaultFlags;
        try {
            return await this._ysdk.getFlags({
                defaultFlags,
                clientFeatures
            });
        } catch (e) {
            return defaultFlags;
        }
    },

    // ==================== ЯРЛЫК ====================

    /** Проверить возможность добавления ярлыка */
    async canShowShortcut() {
        if (!this._ysdk) return false;
        try {
            const { canShow } = await this._ysdk.shortcut.canShowPrompt();
            return canShow;
        } catch (e) {
            return false;
        }
    },

    /** Предложить добавить ярлык */
    async showShortcutPrompt() {
        if (!this._ysdk) return false;
        try {
            const { outcome } = await this._ysdk.shortcut.showPrompt();
            return outcome === 'accepted';
        } catch (e) {
            return false;
        }
    },

    // ==================== ОТЗЫВЫ ====================

    /** Проверить возможность запроса отзыва */
    async canReview() {
        if (!this._ysdk) return { value: false, reason: 'SDK_NOT_INITIALIZED' };
        try {
            return await this._ysdk.feedback.canReview();
        } catch (e) {
            return { value: false, reason: 'ERROR' };
        }
    },

    /** Запросить отзыв */
    async requestReview() {
        if (!this._ysdk) return false;
        try {
            const { feedbackSent } = await this._ysdk.feedback.requestReview();
            return feedbackSent;
        } catch (e) {
            return false;
        }
    },

    // ==================== УТИЛИТЫ ====================

    /** Информация об устройстве */
    getDeviceInfo() {
        if (!this._ysdk) return null;
        const info = this._ysdk.deviceInfo();
        return {
            type: info.type,
            isMobile: info.isMobile(),
            isDesktop: info.isDesktop(),
            isTablet: info.isTablet(),
            isTV: info.isTV()
        };
    },

    /** Серверное время (миллисекунды) */
    getServerTime() {
        return this._ysdk?.serverTime() || Date.now();
    },

    /** ID игры */
    getAppID() {
        return this._ysdk?.environment?.app?.id || '';
    },

    /** Payload из URL */
    getPayload() {
        return this._ysdk?.environment?.payload || '';
    },

    /** Полноэкранный режим */
    async requestFullscreen() {
        return this._ysdk?.screen?.fullscreen?.request();
    },

    async exitFullscreen() {
        return this._ysdk?.screen?.fullscreen?.exit();
    },

    /** Скопировать текст в буфер обмена */
    copyToClipboard(text) {
        this._ysdk?.clipboard?.writeText(text);
    },

    /** Проверить доступность метода */
    isAvailable(methodPath) {
        return this._ysdk?.isAvailableMethod(methodPath) || false;
    },

    /** Подписаться на событие */
    on(event, callback) {
        return this._ysdk?.on(event, callback);
    },

    /** Отписаться от события */
    off(event, callback) {
        this._ysdk?.off(event, callback);
    },

    /** Dispatching события */
    dispatchEvent(event, detail) {
        return this._ysdk?.dispatchEvent(event, detail);
    },

    /** Получить raw SDK объект */
    getRawSDK() {
        return this._ysdk;
    }
};
