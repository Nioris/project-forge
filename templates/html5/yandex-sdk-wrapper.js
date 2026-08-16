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

            // Подписка на события паузы/возобновления
            this._ysdk.on('game_api_pause', () => {
                if (this._onPause) this._onPause();
            });
            this._ysdk.on('game_api_resume', () => {
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
     */
    showRewarded(onRewarded) {
        return new Promise((resolve) => {
            if (!this._ysdk) { resolve(false); return; }
            let rewarded = false;
            this._ysdk.adv.showRewardedVideo({
                callbacks: {
                    onOpen: () => {
                        if (this._onPause) this._onPause();
                    },
                    onRewarded: () => {
                        rewarded = true;
                        if (onRewarded) onRewarded();
                    },
                    onClose: () => {
                        if (this._onResume) this._onResume();
                        resolve(rewarded);
                    },
                    onError: (error) => {
                        console.warn('[YandexSDK] Rewarded error:', error);
                        if (this._onResume) this._onResume();
                        resolve(false);
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
     */
    async saveData(data, flush = false) {
        if (!this._player) return false;
        try {
            await this._player.setData(data, flush);
            return true;
        } catch (e) {
            console.error('[YandexSDK] saveData error:', e);
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
    async getCatalog() {
        if (!this._payments) return [];
        try {
            return await this._payments.getCatalog();
        } catch (e) {
            console.error('[YandexSDK] getCatalog error:', e);
            return [];
        }
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
