mergeInto(LibraryManager.library, {

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================

    InitYandexSDK: function() {
        if (window._ysdk) return;
        YaGames.init().then(function(ysdk) {
            window._ysdk = ysdk;

            // Подписка на события паузы/возобновления
            ysdk.on('game_api_pause', function() {
                myGameInstance.SendMessage('YandexSDK', 'OnGamePause');
            });
            ysdk.on('game_api_resume', function() {
                myGameInstance.SendMessage('YandexSDK', 'OnGameResume');
            });

            // Подписка на выбор аккаунта
            ysdk.on(ysdk.EVENTS.ACCOUNT_SELECTION_DIALOG_OPENED, function() {
                myGameInstance.SendMessage('YandexSDK', 'OnAccountDialogOpened');
            });
            ysdk.on(ysdk.EVENTS.ACCOUNT_SELECTION_DIALOG_CLOSED, function() {
                myGameInstance.SendMessage('YandexSDK', 'OnAccountDialogClosed');
            });

            // Инициализация игрока
            ysdk.getPlayer().then(function(player) {
                window._player = player;
                myGameInstance.SendMessage('YandexSDK', 'OnSDKReady');
            });
        });
    },

    // ==================== LIFECYCLE ====================

    GameReady: function() {
        if (window._ysdk && window._ysdk.features && window._ysdk.features.LoadingAPI) {
            window._ysdk.features.LoadingAPI.ready();
        }
    },

    GameplayStart: function() {
        if (window._ysdk && window._ysdk.features && window._ysdk.features.GameplayAPI) {
            window._ysdk.features.GameplayAPI.start();
        }
    },

    GameplayStop: function() {
        if (window._ysdk && window._ysdk.features && window._ysdk.features.GameplayAPI) {
            window._ysdk.features.GameplayAPI.stop();
        }
    },

    // ==================== РЕКЛАМА ====================

    ShowInterstitialAd: function() {
        if (!window._ysdk) return;
        window._ysdk.adv.showFullscreenAdv({
            callbacks: {
                onOpen: function() {
                    myGameInstance.SendMessage('YandexSDK', 'OnInterstitialOpen');
                },
                onClose: function(wasShown) {
                    myGameInstance.SendMessage('YandexSDK', 'OnInterstitialClose', wasShown ? '1' : '0');
                },
                onError: function(error) {
                    myGameInstance.SendMessage('YandexSDK', 'OnInterstitialError', error.toString());
                }
            }
        });
    },

    ShowRewardedAd: function() {
        if (!window._ysdk) return;
        window._ysdk.adv.showRewardedVideo({
            callbacks: {
                onOpen: function() {
                    myGameInstance.SendMessage('YandexSDK', 'OnRewardedOpen');
                },
                onRewarded: function() {
                    myGameInstance.SendMessage('YandexSDK', 'OnRewarded');
                },
                onClose: function() {
                    myGameInstance.SendMessage('YandexSDK', 'OnRewardedClose');
                },
                onError: function(error) {
                    myGameInstance.SendMessage('YandexSDK', 'OnRewardedError', error.toString());
                }
            }
        });
    },

    ShowStickyBanner: function() {
        if (!window._ysdk) return;
        window._ysdk.adv.showBannerAdv();
    },

    HideStickyBanner: function() {
        if (!window._ysdk) return;
        window._ysdk.adv.hideBannerAdv();
    },

    // ==================== ДАННЫЕ ИГРОКА ====================

    IsPlayerAuthorized: function() {
        return window._player ? window._player.isAuthorized() : false;
    },

    AuthorizePlayer: function() {
        if (!window._ysdk) return;
        window._ysdk.auth.openAuthDialog().then(function() {
            window._ysdk.getPlayer().then(function(player) {
                window._player = player;
                myGameInstance.SendMessage('YandexSDK', 'OnAuthSuccess');
            });
        }).catch(function() {
            myGameInstance.SendMessage('YandexSDK', 'OnAuthFailed');
        });
    },

    GetPlayerName: function() {
        if (!window._player) return '';
        var name = window._player.getName();
        var bufferSize = lengthBytesUTF8(name) + 1;
        var buffer = _malloc(bufferSize);
        stringToUTF8(name, buffer, bufferSize);
        return buffer;
    },

    GetPlayerUniqueID: function() {
        if (!window._player) return '';
        var id = window._player.getUniqueID();
        var bufferSize = lengthBytesUTF8(id) + 1;
        var buffer = _malloc(bufferSize);
        stringToUTF8(id, buffer, bufferSize);
        return buffer;
    },

    GetPlayerPhoto: function(sizePtr) {
        if (!window._player) return '';
        var size = UTF8ToString(sizePtr);
        var url = window._player.getPhoto(size);
        var bufferSize = lengthBytesUTF8(url) + 1;
        var buffer = _malloc(bufferSize);
        stringToUTF8(url, buffer, bufferSize);
        return buffer;
    },

    // ==================== СОХРАНЕНИЯ ====================

    SavePlayerData: function(jsonPtr) {
        if (!window._player) return;
        var json = UTF8ToString(jsonPtr);
        var data = JSON.parse(json);
        window._player.setData(data).then(function() {
            myGameInstance.SendMessage('YandexSDK', 'OnDataSaved');
        }).catch(function(e) {
            myGameInstance.SendMessage('YandexSDK', 'OnDataSaveError', e.toString());
        });
    },

    LoadPlayerData: function() {
        if (!window._player) return;
        window._player.getData().then(function(data) {
            var json = JSON.stringify(data);
            myGameInstance.SendMessage('YandexSDK', 'OnDataLoaded', json);
        }).catch(function(e) {
            myGameInstance.SendMessage('YandexSDK', 'OnDataLoadError', e.toString());
        });
    },

    SavePlayerStats: function(jsonPtr) {
        if (!window._player) return;
        var json = UTF8ToString(jsonPtr);
        var stats = JSON.parse(json);
        window._player.setStats(stats).then(function() {
            myGameInstance.SendMessage('YandexSDK', 'OnStatsSaved');
        });
    },

    IncrementPlayerStats: function(jsonPtr) {
        if (!window._player) return;
        var json = UTF8ToString(jsonPtr);
        var increments = JSON.parse(json);
        window._player.incrementStats(increments).then(function(newStats) {
            myGameInstance.SendMessage('YandexSDK', 'OnStatsIncremented', JSON.stringify(newStats));
        });
    },

    LoadPlayerStats: function() {
        if (!window._player) return;
        window._player.getStats().then(function(stats) {
            myGameInstance.SendMessage('YandexSDK', 'OnStatsLoaded', JSON.stringify(stats));
        });
    },

    // ==================== ПОКУПКИ ====================

    InitPayments: function() {
        if (!window._ysdk) return;
        window._ysdk.getPayments().then(function(payments) {
            window._payments = payments;
            myGameInstance.SendMessage('YandexSDK', 'OnPaymentsReady');
        }).catch(function(e) {
            myGameInstance.SendMessage('YandexSDK', 'OnPaymentsError', e.toString());
        });
    },

    PurchaseItem: function(idPtr) {
        if (!window._payments) return;
        var id = UTF8ToString(idPtr);
        window._payments.purchase({ id: id }).then(function(purchase) {
            myGameInstance.SendMessage('YandexSDK', 'OnPurchaseSuccess', JSON.stringify({
                productID: purchase.productID,
                purchaseToken: purchase.purchaseToken
            }));
        }).catch(function(e) {
            myGameInstance.SendMessage('YandexSDK', 'OnPurchaseFailed', e.toString());
        });
    },

    ConsumePurchase: function(tokenPtr) {
        if (!window._payments) return;
        var token = UTF8ToString(tokenPtr);
        window._payments.consumePurchase(token).then(function() {
            myGameInstance.SendMessage('YandexSDK', 'OnPurchaseConsumed', token);
        });
    },

    GetPurchases: function() {
        if (!window._payments) return;
        window._payments.getPurchases().then(function(purchases) {
            myGameInstance.SendMessage('YandexSDK', 'OnPurchasesLoaded', JSON.stringify(purchases));
        });
    },

    GetCatalog: function() {
        if (!window._payments) return;
        window._payments.getCatalog().then(function(catalog) {
            var items = catalog.map(function(item) {
                return {
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    price: item.price,
                    priceValue: item.priceValue,
                    priceCurrencyCode: item.priceCurrencyCode,
                    imageURI: item.imageURI
                };
            });
            myGameInstance.SendMessage('YandexSDK', 'OnCatalogLoaded', JSON.stringify(items));
        });
    },

    // ==================== ЛИДЕРБОРДЫ ====================

    SetLeaderboardScore: function(namePtr, score) {
        if (!window._ysdk) return;
        var name = UTF8ToString(namePtr);
        window._ysdk.leaderboards.setScore(name, score);
    },

    GetLeaderboardEntries: function(namePtr, quantityTop, quantityAround, includeUser) {
        if (!window._ysdk) return;
        var name = UTF8ToString(namePtr);
        window._ysdk.leaderboards.getEntries(name, {
            quantityTop: quantityTop,
            quantityAround: quantityAround,
            includeUser: includeUser
        }).then(function(result) {
            var entries = result.entries.map(function(e) {
                return {
                    rank: e.rank,
                    score: e.score,
                    formattedScore: e.formattedScore,
                    name: e.player.publicName,
                    uniqueID: e.player.uniqueID,
                    avatarURL: e.player.getAvatarSrc('medium')
                };
            });
            myGameInstance.SendMessage('YandexSDK', 'OnLeaderboardLoaded', JSON.stringify({
                name: name,
                entries: entries,
                userRank: result.userRank
            }));
        });
    },

    GetPlayerLeaderboardEntry: function(namePtr) {
        if (!window._ysdk) return;
        var name = UTF8ToString(namePtr);
        window._ysdk.leaderboards.getPlayerEntry(name).then(function(entry) {
            myGameInstance.SendMessage('YandexSDK', 'OnPlayerEntryLoaded', JSON.stringify({
                name: name,
                rank: entry.rank,
                score: entry.score,
                formattedScore: entry.formattedScore
            }));
        }).catch(function() {
            myGameInstance.SendMessage('YandexSDK', 'OnPlayerEntryNotFound', name);
        });
    },

    // ==================== ОКРУЖЕНИЕ ====================

    GetLanguage: function() {
        var lang = window._ysdk ? window._ysdk.environment.i18n.lang : 'en';
        var bufferSize = lengthBytesUTF8(lang) + 1;
        var buffer = _malloc(bufferSize);
        stringToUTF8(lang, buffer, bufferSize);
        return buffer;
    },

    GetDomain: function() {
        var tld = window._ysdk ? window._ysdk.environment.i18n.tld : 'com';
        var bufferSize = lengthBytesUTF8(tld) + 1;
        var buffer = _malloc(bufferSize);
        stringToUTF8(tld, buffer, bufferSize);
        return buffer;
    },

    GetDeviceType: function() {
        if (!window._ysdk) return 0;
        var info = window._ysdk.deviceInfo();
        if (info.isDesktop()) return 0;
        if (info.isMobile()) return 1;
        if (info.isTablet()) return 2;
        if (info.isTV()) return 3;
        return 0;
    },

    GetServerTime: function() {
        return window._ysdk ? window._ysdk.serverTime() : Date.now();
    },

    // ==================== ЯРЛЫК ====================

    CanShowShortcutPrompt: function() {
        if (!window._ysdk) return;
        window._ysdk.shortcut.canShowPrompt().then(function(result) {
            myGameInstance.SendMessage('YandexSDK', 'OnCanShowShortcut', result.canShow ? '1' : '0');
        });
    },

    ShowShortcutPrompt: function() {
        if (!window._ysdk) return;
        window._ysdk.shortcut.showPrompt().then(function(result) {
            myGameInstance.SendMessage('YandexSDK', 'OnShortcutResult', result.outcome === 'accepted' ? '1' : '0');
        });
    },

    // ==================== ОТЗЫВЫ ====================

    CanReview: function() {
        if (!window._ysdk) return;
        window._ysdk.feedback.canReview().then(function(result) {
            myGameInstance.SendMessage('YandexSDK', 'OnCanReview', result.value ? '1' : '0');
        });
    },

    RequestReview: function() {
        if (!window._ysdk) return;
        window._ysdk.feedback.requestReview().then(function(result) {
            myGameInstance.SendMessage('YandexSDK', 'OnReviewResult', result.feedbackSent ? '1' : '0');
        });
    },

    // ==================== ПОЛНОЭКРАННЫЙ РЕЖИМ ====================

    RequestFullscreen: function() {
        if (window._ysdk && window._ysdk.screen && window._ysdk.screen.fullscreen) {
            window._ysdk.screen.fullscreen.request();
        }
    },

    ExitFullscreen: function() {
        if (window._ysdk && window._ysdk.screen && window._ysdk.screen.fullscreen) {
            window._ysdk.screen.fullscreen.exit();
        }
    },

    // ==================== REMOTE CONFIG ====================

    GetFlags: function(defaultFlagsPtr) {
        if (!window._ysdk) return;
        var defaultFlagsJson = UTF8ToString(defaultFlagsPtr);
        var params = {};
        if (defaultFlagsJson) {
            params.defaultFlags = JSON.parse(defaultFlagsJson);
        }
        window._ysdk.getFlags(params).then(function(flags) {
            myGameInstance.SendMessage('YandexSDK', 'OnFlagsLoaded', JSON.stringify(flags));
        });
    }
});
