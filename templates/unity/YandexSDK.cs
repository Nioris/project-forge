using System;
using System.Runtime.InteropServices;
using UnityEngine;

/// <summary>
/// Yandex Games SDK обёртка для Unity WebGL
/// Добавить на пустой GameObject "YandexSDK" на первой сцене (DontDestroyOnLoad)
/// </summary>
public class YandexSDK : MonoBehaviour
{
    public static YandexSDK Instance { get; private set; }

    // ==================== СОБЫТИЯ ====================

    /// <summary>SDK инициализирован и готов к использованию</summary>
    public event Action OnSDKReadyEvent;

    /// <summary>Платформа просит поставить игру на паузу (реклама, сворачивание)</summary>
    public event Action OnGamePauseEvent;

    /// <summary>Платформа разрешает продолжить игру</summary>
    public event Action OnGameResumeEvent;

    // Реклама
    public event Action OnInterstitialOpenEvent;
    public event Action<bool> OnInterstitialCloseEvent;
    public event Action OnRewardedOpenEvent;
    public event Action OnRewardedEvent;
    public event Action OnRewardedCloseEvent;

    // Авторизация
    public event Action OnAuthSuccessEvent;
    public event Action OnAuthFailedEvent;

    // Данные
    public event Action OnDataSavedEvent;
    public event Action<string> OnDataLoadedEvent;
    public event Action OnStatsSavedEvent;
    public event Action<string> OnStatsLoadedEvent;

    // Покупки
    public event Action OnPaymentsReadyEvent;
    public event Action<string> OnPurchaseSuccessEvent;
    public event Action<string> OnPurchaseFailedEvent;
    public event Action<string> OnPurchaseConsumedEvent;
    public event Action<string> OnPurchasesLoadedEvent;
    public event Action<string> OnCatalogLoadedEvent;

    // Лидерборды
    public event Action<string> OnLeaderboardLoadedEvent;
    public event Action<string> OnPlayerEntryLoadedEvent;
    public event Action<string> OnPlayerEntryNotFoundEvent;

    // Ярлык
    public event Action<bool> OnCanShowShortcutEvent;
    public event Action<bool> OnShortcutResultEvent;

    // Отзывы
    public event Action<bool> OnCanReviewEvent;
    public event Action<bool> OnReviewResultEvent;

    // Remote Config
    public event Action<string> OnFlagsLoadedEvent;

    // Аккаунт
    public event Action OnAccountDialogOpenedEvent;
    public event Action OnAccountDialogClosedEvent;

    // ==================== EXTERN МЕТОДЫ ====================

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] private static extern void InitYandexSDK();
    [DllImport("__Internal")] private static extern void GameReady();
    [DllImport("__Internal")] private static extern void GameplayStart();
    [DllImport("__Internal")] private static extern void GameplayStop();
    [DllImport("__Internal")] private static extern void ShowInterstitialAd();
    [DllImport("__Internal")] private static extern void ShowRewardedAd();
    [DllImport("__Internal")] private static extern void ShowStickyBanner();
    [DllImport("__Internal")] private static extern void HideStickyBanner();
    [DllImport("__Internal")] private static extern bool IsPlayerAuthorized();
    [DllImport("__Internal")] private static extern void AuthorizePlayer();
    [DllImport("__Internal")] private static extern string GetPlayerName();
    [DllImport("__Internal")] private static extern string GetPlayerUniqueID();
    [DllImport("__Internal")] private static extern string GetPlayerPhoto(string size);
    [DllImport("__Internal")] private static extern void SavePlayerData(string json);
    [DllImport("__Internal")] private static extern void LoadPlayerData();
    [DllImport("__Internal")] private static extern void SavePlayerStats(string json);
    [DllImport("__Internal")] private static extern void IncrementPlayerStats(string json);
    [DllImport("__Internal")] private static extern void LoadPlayerStats();
    [DllImport("__Internal")] private static extern void InitPayments();
    [DllImport("__Internal")] private static extern void PurchaseItem(string id);
    [DllImport("__Internal")] private static extern void ConsumePurchase(string token);
    [DllImport("__Internal")] private static extern void GetPurchases();
    [DllImport("__Internal")] private static extern void GetCatalog();
    [DllImport("__Internal")] private static extern void SetLeaderboardScore(string name, int score);
    [DllImport("__Internal")] private static extern void GetLeaderboardEntries(string name, int quantityTop, int quantityAround, bool includeUser);
    [DllImport("__Internal")] private static extern void GetPlayerLeaderboardEntry(string name);
    [DllImport("__Internal")] private static extern string GetLanguage();
    [DllImport("__Internal")] private static extern string GetDomain();
    [DllImport("__Internal")] private static extern int GetDeviceType();
    [DllImport("__Internal")] private static extern double GetServerTime();
    [DllImport("__Internal")] private static extern void CanShowShortcutPrompt();
    [DllImport("__Internal")] private static extern void ShowShortcutPrompt();
    [DllImport("__Internal")] private static extern void CanReview();
    [DllImport("__Internal")] private static extern void RequestReview();
    [DllImport("__Internal")] private static extern void RequestFullscreen();
    [DllImport("__Internal")] private static extern void ExitFullscreen();
    [DllImport("__Internal")] private static extern void GetFlags(string defaultFlagsJson);
#endif

    // ==================== UNITY LIFECYCLE ====================

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    // ==================== PUBLIC API ====================

    /// <summary>Инициализировать SDK (вызвать при старте)</summary>
    public void Init()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        InitYandexSDK();
#else
        Debug.Log("[YandexSDK] Init (Editor mock)");
        OnSDKReady();
#endif
    }

    /// <summary>Сигнал готовности игры (ОБЯЗАТЕЛЬНО)</summary>
    public void SignalReady()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GameReady();
#else
        Debug.Log("[YandexSDK] GameReady");
#endif
    }

    /// <summary>Начало геймплея</summary>
    public void StartGameplay()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GameplayStart();
#else
        Debug.Log("[YandexSDK] GameplayStart");
#endif
    }

    /// <summary>Остановка геймплея</summary>
    public void StopGameplay()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GameplayStop();
#else
        Debug.Log("[YandexSDK] GameplayStop");
#endif
    }

    /// <summary>Показать Interstitial рекламу</summary>
    public void ShowInterstitial()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ShowInterstitialAd();
#else
        Debug.Log("[YandexSDK] ShowInterstitial (Editor mock)");
        OnInterstitialOpen();
        OnInterstitialClose("1");
#endif
    }

    /// <summary>Показать Rewarded Video</summary>
    public void ShowRewarded()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ShowRewardedAd();
#else
        Debug.Log("[YandexSDK] ShowRewarded (Editor mock)");
        OnRewardedOpen();
        OnRewarded();
        OnRewardedClose();
#endif
    }

    /// <summary>Показать sticky banner</summary>
    public void ShowBanner()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ShowStickyBanner();
#endif
    }

    /// <summary>Скрыть sticky banner</summary>
    public void HideBanner()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        HideStickyBanner();
#endif
    }

    /// <summary>Проверить авторизацию</summary>
    public bool IsAuthorized()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return IsPlayerAuthorized();
#else
        return false;
#endif
    }

    /// <summary>Открыть диалог авторизации</summary>
    public void Authorize()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        AuthorizePlayer();
#else
        Debug.Log("[YandexSDK] Authorize (Editor mock)");
        OnAuthSuccess();
#endif
    }

    /// <summary>Получить имя игрока</summary>
    public string GetName()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return GetPlayerName();
#else
        return "TestPlayer";
#endif
    }

    /// <summary>Получить уникальный ID игрока</summary>
    public string GetUniqueID()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return GetPlayerUniqueID();
#else
        return "test-unique-id";
#endif
    }

    /// <summary>Получить URL фото игрока</summary>
    public string GetPhoto(string size = "medium")
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return GetPlayerPhoto(size);
#else
        return "";
#endif
    }

    /// <summary>Сохранить данные (макс 200 КБ)</summary>
    public void SaveData(string json)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        SavePlayerData(json);
#else
        Debug.Log("[YandexSDK] SaveData: " + json);
        PlayerPrefs.SetString("YandexSaveData", json);
        OnDataSaved();
#endif
    }

    /// <summary>Загрузить данные</summary>
    public void LoadData()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        LoadPlayerData();
#else
        string data = PlayerPrefs.GetString("YandexSaveData", "{}");
        OnDataLoaded(data);
#endif
    }

    /// <summary>Сохранить статистики (макс 10 КБ)</summary>
    public void SaveStats(string json)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        SavePlayerStats(json);
#else
        Debug.Log("[YandexSDK] SaveStats: " + json);
        OnStatsSaved();
#endif
    }

    /// <summary>Инкрементировать статистики</summary>
    public void IncrementStats(string json)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        IncrementPlayerStats(json);
#endif
    }

    /// <summary>Загрузить статистики</summary>
    public void LoadStats()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        LoadPlayerStats();
#else
        OnStatsLoaded("{}");
#endif
    }

    /// <summary>Инициализировать платежи</summary>
    public void InitializePayments()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        InitPayments();
#else
        Debug.Log("[YandexSDK] InitPayments (Editor mock)");
        OnPaymentsReady();
#endif
    }

    /// <summary>Купить товар</summary>
    public void Purchase(string productId)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        PurchaseItem(productId);
#else
        Debug.Log("[YandexSDK] Purchase: " + productId);
        OnPurchaseSuccess("{\"productID\":\"" + productId + "\",\"purchaseToken\":\"test-token\"}");
#endif
    }

    /// <summary>Подтвердить потребление покупки (ПОСЛЕ начисления!)</summary>
    public void Consume(string purchaseToken)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ConsumePurchase(purchaseToken);
#else
        Debug.Log("[YandexSDK] Consume: " + purchaseToken);
        OnPurchaseConsumed(purchaseToken);
#endif
    }

    /// <summary>Получить незавершённые покупки</summary>
    public void LoadPurchases()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GetPurchases();
#else
        OnPurchasesLoaded("[]");
#endif
    }

    /// <summary>Получить каталог товаров</summary>
    public void LoadCatalog()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GetCatalog();
#else
        OnCatalogLoaded("[]");
#endif
    }

    /// <summary>Записать счёт в лидерборд</summary>
    public void SetScore(string leaderboardName, int score)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        SetLeaderboardScore(leaderboardName, score);
#else
        Debug.Log("[YandexSDK] SetScore: " + leaderboardName + " = " + score);
#endif
    }

    /// <summary>Получить записи лидерборда</summary>
    public void LoadLeaderboard(string leaderboardName, int quantityTop = 10, int quantityAround = 5, bool includeUser = true)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GetLeaderboardEntries(leaderboardName, quantityTop, quantityAround, includeUser);
#else
        OnLeaderboardLoaded("{\"name\":\"" + leaderboardName + "\",\"entries\":[],\"userRank\":0}");
#endif
    }

    /// <summary>Получить запись игрока в лидерборде</summary>
    public void LoadPlayerEntry(string leaderboardName)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GetPlayerLeaderboardEntry(leaderboardName);
#else
        OnPlayerEntryNotFound(leaderboardName);
#endif
    }

    /// <summary>Получить текущий язык (ISO 639-1)</summary>
    public string GetLang()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return GetLanguage();
#else
        return "ru";
#endif
    }

    /// <summary>Получить тип устройства: 0=desktop, 1=mobile, 2=tablet, 3=tv</summary>
    public int GetDevice()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return GetDeviceType();
#else
        return 0;
#endif
    }

    /// <summary>Серверное время (мс)</summary>
    public double GetTime()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return GetServerTime();
#else
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
#endif
    }

    /// <summary>Проверить возможность добавления ярлыка</summary>
    public void CheckShortcut()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        CanShowShortcutPrompt();
#else
        OnCanShowShortcut("1");
#endif
    }

    /// <summary>Предложить добавить ярлык</summary>
    public void AddShortcut()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ShowShortcutPrompt();
#else
        OnShortcutResult("1");
#endif
    }

    /// <summary>Проверить возможность запроса отзыва</summary>
    public void CheckReview()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        CanReview();
#else
        OnCanReview("1");
#endif
    }

    /// <summary>Запросить отзыв</summary>
    public void AskReview()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        RequestReview();
#else
        OnReviewResult("1");
#endif
    }

    /// <summary>Получить remote config флаги</summary>
    public void LoadFlags(string defaultFlagsJson = "{}")
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        GetFlags(defaultFlagsJson);
#else
        OnFlagsLoaded(defaultFlagsJson);
#endif
    }

    /// <summary>Запросить полноэкранный режим</summary>
    public void GoFullscreen()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        RequestFullscreen();
#endif
    }

    /// <summary>Выйти из полноэкранного режима</summary>
    public void LeaveFullscreen()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ExitFullscreen();
#endif
    }

    // ==================== КОЛБЭКИ ИЗ JS (SendMessage) ====================

    private void OnSDKReady() => OnSDKReadyEvent?.Invoke();
    private void OnGamePause() => OnGamePauseEvent?.Invoke();
    private void OnGameResume() => OnGameResumeEvent?.Invoke();
    private void OnInterstitialOpen() => OnInterstitialOpenEvent?.Invoke();
    private void OnInterstitialClose(string wasShown) => OnInterstitialCloseEvent?.Invoke(wasShown == "1");
    private void OnInterstitialError(string error) => Debug.LogWarning("[YandexSDK] Interstitial error: " + error);
    private void OnRewardedOpen() => OnRewardedOpenEvent?.Invoke();
    private void OnRewarded() => OnRewardedEvent?.Invoke();
    private void OnRewardedClose() => OnRewardedCloseEvent?.Invoke();
    private void OnRewardedError(string error) => Debug.LogWarning("[YandexSDK] Rewarded error: " + error);
    private void OnAuthSuccess() => OnAuthSuccessEvent?.Invoke();
    private void OnAuthFailed() => OnAuthFailedEvent?.Invoke();
    private void OnDataSaved() => OnDataSavedEvent?.Invoke();
    private void OnDataLoaded(string json) => OnDataLoadedEvent?.Invoke(json);
    private void OnDataSaveError(string error) => Debug.LogError("[YandexSDK] Save error: " + error);
    private void OnDataLoadError(string error) => Debug.LogError("[YandexSDK] Load error: " + error);
    private void OnStatsSaved() => OnStatsSavedEvent?.Invoke();
    private void OnStatsLoaded(string json) => OnStatsLoadedEvent?.Invoke(json);
    private void OnStatsIncremented(string json) => OnStatsLoadedEvent?.Invoke(json);
    private void OnPaymentsReady() => OnPaymentsReadyEvent?.Invoke();
    private void OnPurchaseSuccess(string json) => OnPurchaseSuccessEvent?.Invoke(json);
    private void OnPurchaseFailed(string error) => OnPurchaseFailedEvent?.Invoke(error);
    private void OnPurchaseConsumed(string token) => OnPurchaseConsumedEvent?.Invoke(token);
    private void OnPurchasesLoaded(string json) => OnPurchasesLoadedEvent?.Invoke(json);
    private void OnCatalogLoaded(string json) => OnCatalogLoadedEvent?.Invoke(json);
    private void OnLeaderboardLoaded(string json) => OnLeaderboardLoadedEvent?.Invoke(json);
    private void OnPlayerEntryLoaded(string json) => OnPlayerEntryLoadedEvent?.Invoke(json);
    private void OnPlayerEntryNotFound(string name) => OnPlayerEntryNotFoundEvent?.Invoke(name);
    private void OnCanShowShortcut(string canShow) => OnCanShowShortcutEvent?.Invoke(canShow == "1");
    private void OnShortcutResult(string accepted) => OnShortcutResultEvent?.Invoke(accepted == "1");
    private void OnCanReview(string canReview) => OnCanReviewEvent?.Invoke(canReview == "1");
    private void OnReviewResult(string sent) => OnReviewResultEvent?.Invoke(sent == "1");
    private void OnFlagsLoaded(string json) => OnFlagsLoadedEvent?.Invoke(json);
    private void OnAccountDialogOpened() => OnAccountDialogOpenedEvent?.Invoke();
    private void OnAccountDialogClosed() => OnAccountDialogClosedEvent?.Invoke();
}
