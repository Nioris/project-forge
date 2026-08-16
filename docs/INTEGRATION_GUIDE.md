# Yandex Games SDK — Полный гайд по интеграции

## Содержание
- [Часть 1: HTML5 игры](#часть-1-html5-игры)
- [Часть 2: Unity игры](#часть-2-unity-игры)
- [Часть 3: Требования к релизу](#часть-3-требования-к-релизу)

---

# Часть 1: HTML5 игры

## 1.1 Подключение SDK

В `<head>` файла `index.html` добавить:

```html
<script src="/sdk.js"></script>
```

> Для тестирования на своём домене: `<script src="https://sdk.games.s3.yandex.net/sdk.js"></script>`

Асинхронная загрузка:
```html
<script>
(function(d) {
    var s = d.createElement('script');
    s.src = '/sdk.js';
    s.async = true;
    s.onload = function() { initGame(); };
    d.body.append(s);
})(document);
</script>
```

## 1.2 Инициализация

```javascript
let ysdk;
async function initSDK() {
    ysdk = await YaGames.init();
    // SDK готов к использованию
}
```

## 1.3 Lifecycle API (ОБЯЗАТЕЛЬНО)

### LoadingAPI.ready()
Вызвать когда игра полностью загружена и готова к взаимодействию:
```javascript
ysdk.features.LoadingAPI?.ready();
```

### GameplayAPI.start() / stop()
```javascript
// Когда игрок начинает играть (старт уровня, закрытие меню, возврат из паузы)
ysdk.features.GameplayAPI?.start();

// Когда игрок прекращает играть (конец уровня, меню, пауза, реклама)
ysdk.features.GameplayAPI?.stop();
```

**КРИТИЧНО:** После `start()` геймплей должен НЕМЕДЛЕННО начаться. После `stop()` — НЕМЕДЛЕННО остановиться.

## 1.4 Реклама

### Fullscreen (Interstitial)
Показывать в естественных паузах: конец уровня, смерть, переход в меню.

```javascript
ysdk.adv.showFullscreenAdv({
    callbacks: {
        onOpen: function() {
            // Поставить на паузу, заглушить звук
            pauseGame();
            muteAudio();
        },
        onClose: function(wasShown) {
            // Возобновить игру
            resumeGame();
            unmuteAudio();
        },
        onError: function(error) {
            console.log('Ad error:', error);
        }
    }
});
```

**Правила:**
- НЕ показывать во время активного геймплея
- Частота контролируется платформой
- Рекомендуемые моменты: перед стартом, между уровнями, после проигрыша

### Rewarded Video
Только по нажатию кнопки игроком. Награда — бонус, не обязательный для прогресса.

```javascript
ysdk.adv.showRewardedVideo({
    callbacks: {
        onOpen: () => {
            pauseGame();
            muteAudio();
        },
        onRewarded: () => {
            // Начислить награду ЗДЕСЬ
            addCoins(100);
        },
        onClose: () => {
            resumeGame();
            unmuteAudio();
        },
        onError: (e) => {
            console.log('Rewarded error:', e);
        }
    }
});
```

### Sticky Banner
```javascript
// Показать
ysdk.adv.showBannerAdv();

// Скрыть
ysdk.adv.hideBannerAdv();

// Проверить статус
ysdk.adv.getBannerAdvStatus().then(({ stickyAdvIsShowing, reason }) => {
    if (!stickyAdvIsShowing && !reason) {
        ysdk.adv.showBannerAdv();
    }
});
```

Позиционирование настраивается в Yandex Games Console.

## 1.5 Покупки (In-App Purchases)

### Инициализация
```javascript
const payments = await ysdk.getPayments();
```

### Каталог товаров
```javascript
const catalog = await payments.getCatalog();
// catalog[i]: { id, title, description, imageURI, price, priceValue, priceCurrencyCode }
// catalog[i].getPriceCurrencyImage('medium') — иконка валюты
```

### Покупка
```javascript
payments.purchase({ id: 'gold500' })
    .then(purchase => {
        // 1. СНАЧАЛА начислить
        addGold(500);
        // 2. ПОТОМ consume (удаляет покупку навсегда!)
        payments.consumePurchase(purchase.purchaseToken);
    })
    .catch(err => {
        // Пользователь отменил / недостаточно средств / ошибка
    });
```

### Обработка незавершённых покупок (ОБЯЗАТЕЛЬНО при каждом запуске)
```javascript
async function processUnconsumedPurchases() {
    const purchases = await payments.getPurchases();
    for (const purchase of purchases) {
        switch (purchase.productID) {
            case 'gold500':
                addGold(500);
                break;
            case 'no_ads':
                disableAds();
                break;
        }
        await payments.consumePurchase(purchase.purchaseToken);
    }
}
```

## 1.6 Сохранение данных игрока

### Авторизация
```javascript
const player = await ysdk.getPlayer();

if (!player.isAuthorized()) {
    // Показать кнопку "Войти" — НЕ вызывать автоматически
}

// По нажатию кнопки:
async function loginPlayer() {
    try {
        await ysdk.auth.openAuthDialog();
        // Обновить объект player после авторизации
        player = await ysdk.getPlayer();
    } catch (e) {
        // Пользователь отказался
    }
}
```

### Сохранение/загрузка данных (макс 200 КБ)
```javascript
// Сохранить
await player.setData({
    level: 5,
    score: 1200,
    inventory: ['sword', 'shield'],
    settings: { sound: true, music: true }
});

// Загрузить
const data = await player.getData();
// или определённые ключи:
const data = await player.getData(['level', 'score']);
```

### Числовые статистики (макс 10 КБ)
```javascript
// Сохранить
await player.setStats({ highScore: 5000, totalGames: 42, coins: 1500 });

// Инкрементировать (атомарно)
await player.incrementStats({ coins: 100, totalGames: 1 });

// Загрузить
const stats = await player.getStats(['highScore', 'coins']);
```

### iOS Safe Storage
```javascript
// Вместо localStorage на iOS:
const safeStorage = await ysdk.getStorage();
safeStorage.setItem('key', 'value');
const val = safeStorage.getItem('key');
```

## 1.7 Лидерборды

Требуется создать лидерборд в Yandex Games Console с "Техническим именем".

```javascript
// Записать счёт (требует авторизации)
if (ysdk.isAvailableMethod('leaderboards.setScore')) {
    ysdk.leaderboards.setScore('main_leaderboard', score);
}

// Получить топ
const result = await ysdk.leaderboards.getEntries('main_leaderboard', {
    quantityTop: 10,
    quantityAround: 5,
    includeUser: true
});
// result.entries[i]: { rank, score, formattedScore, player: { publicName, getAvatarSrc() } }

// Получить запись игрока
try {
    const entry = await ysdk.leaderboards.getPlayerEntry('main_leaderboard');
    // entry: { rank, score, formattedScore }
} catch (e) {
    // LEADERBOARD_PLAYER_NOT_PRESENT — игрок ещё не в таблице
}
```

**Rate limits:** setScore = 1/сек, getPlayerEntry = 60/5мин, getEntries = 20/5мин.

## 1.8 Локализация

```javascript
const lang = ysdk.environment.i18n.lang; // 'ru', 'en', 'tr', 'zh', 'ko', etc.

const translations = {
    ru: { play: 'Играть', settings: 'Настройки', score: 'Очки' },
    en: { play: 'Play', settings: 'Settings', score: 'Score' },
    tr: { play: 'Oyna', settings: 'Ayarlar', score: 'Puan' }
};

function t(key) {
    const dict = translations[lang] || translations['en'];
    return dict[key] || translations['en'][key] || key;
}
```

**Поддерживаемые языки:** ru, en, tr, zh, ko, hi, vi, ar, az, be, bg, ca, cs, de, es, fa, fr, he, hu, hy, id, it, ja, ka, kk, nl, pl, pt, ro, sk, sr, th, tk, uk, uz и др.

**Минимум:** русский + английский. Рекомендуется также: турецкий, китайский, корейский, хинди, вьетнамский.

## 1.9 События

### Пауза/возобновление (ОБЯЗАТЕЛЬНО обрабатывать)
```javascript
ysdk.on('game_api_pause', () => {
    pauseGame();
    muteAudio();
});

ysdk.on('game_api_resume', () => {
    resumeGame();
    unmuteAudio();
});
```

Эти события срабатывают при:
- Показе/закрытии fullscreen/rewarded рекламы
- Открытии/закрытии окна покупки
- Переключении вкладки браузера
- Сворачивании/развёртывании окна

### TV платформа
```javascript
ysdk.on(ysdk.EVENTS.HISTORY_BACK, () => {
    showExitDialog();
});

// Для подтверждения выхода:
ysdk.dispatchEvent(ysdk.EVENTS.EXIT);
```

### Выбор аккаунта
```javascript
ysdk.on(ysdk.EVENTS.ACCOUNT_SELECTION_DIALOG_OPENED, () => {
    // Приостановить синхронизацию данных
});

ysdk.on(ysdk.EVENTS.ACCOUNT_SELECTION_DIALOG_CLOSED, async () => {
    const player = await ysdk.getPlayer();
    const data = await player.getData();
    // Перезагрузить данные / вернуться в меню
});
```

## 1.10 Remote Config (Флаги)

```javascript
const flags = await ysdk.getFlags({
    defaultFlags: { difficulty: 'normal', showTutorial: 'true' }
});

if (flags.difficulty === 'hard') {
    // ...
}
```

С клиентскими параметрами:
```javascript
const flags = await ysdk.getFlags({
    clientFeatures: [
        { name: 'payingStatus', value: player.getPayingStatus() },
        { name: 'level', value: String(currentLevel) }
    ]
});
```

Настраивается в Yandex Games Console. До 100 флагов.

## 1.11 Ярлык на рабочий стол

```javascript
const { canShow } = await ysdk.shortcut.canShowPrompt();
if (canShow) {
    // Показать кнопку "Добавить на рабочий стол"
    const { outcome } = await ysdk.shortcut.showPrompt();
    if (outcome === 'accepted') {
        // Наградить игрока
        addCoins(50);
    }
}
```

## 1.12 Отзывы

```javascript
const { value, reason } = await ysdk.feedback.canReview();
if (value) {
    const { feedbackSent } = await ysdk.feedback.requestReview();
}
// reason: 'NO_AUTH' | 'GAME_RATED' | 'REVIEW_ALREADY_REQUESTED' | 'UNKNOWN'
```

## 1.13 Дополнительные API

### Device Info
```javascript
const deviceInfo = ysdk.deviceInfo();
deviceInfo.type       // 'desktop' | 'mobile' | 'tablet' | 'tv'
deviceInfo.isMobile() // boolean
deviceInfo.isDesktop()
deviceInfo.isTablet()
deviceInfo.isTV()
```

### Fullscreen
```javascript
ysdk.screen.fullscreen.status   // 'on' | 'off'
await ysdk.screen.fullscreen.request();
await ysdk.screen.fullscreen.exit();
```

### Clipboard
```javascript
ysdk.clipboard.writeText('some text');
```

### Server Time (защита от читов)
```javascript
const serverTime = ysdk.serverTime(); // миллисекунды, серверное время
```

### Environment
```javascript
ysdk.environment.app.id       // ID игры
ysdk.environment.i18n.lang    // язык (ISO 639-1)
ysdk.environment.i18n.tld     // домен (com, ru, tr...)
ysdk.environment.payload      // параметр из URL (?payload=xxx)
```

### Проверка доступности метода
```javascript
if (ysdk.isAvailableMethod('leaderboards.setScore')) {
    // Метод доступен (пользователь авторизован и т.д.)
}
```

## 1.14 Полный пример инициализации

```javascript
let ysdk, player, payments;

async function initGame() {
    // 1. Инициализация SDK
    ysdk = await YaGames.init();

    // 2. Получить игрока
    player = await ysdk.getPlayer();

    // 3. Загрузить данные
    const savedData = await player.getData();
    if (savedData.level) {
        restoreProgress(savedData);
    }

    // 4. Инициализировать платежи
    payments = await ysdk.getPayments();
    await processUnconsumedPurchases();

    // 5. Установить язык
    const lang = ysdk.environment.i18n.lang;
    setLanguage(lang);

    // 6. Подписаться на события
    ysdk.on('game_api_pause', () => { pauseGame(); muteAudio(); });
    ysdk.on('game_api_resume', () => { resumeGame(); unmuteAudio(); });

    // 7. Показать sticky banner
    ysdk.adv.showBannerAdv();

    // 8. Сигнал готовности
    ysdk.features.LoadingAPI?.ready();

    // 9. Показать главное меню
    showMainMenu();
}
```

---

# Часть 2: Unity игры

## Подход A: jslib bridge (без плагинов)

### Шаг 1: Создать WebGL шаблон
Добавить в index.html (WebGL template):
```html
<script src="/sdk.js"></script>
```

### Шаг 2: Добавить YandexSDKBridge.jslib
Скопировать файл `templates/unity/YandexSDKBridge.jslib` в `Assets/Plugins/WebGL/`.

Этот файл содержит JavaScript-функции, которые вызываются из C# через `[DllImport("__Internal")]`.

### Шаг 3: Добавить YandexSDK.cs
Скопировать файл `templates/unity/YandexSDK.cs` в `Assets/Scripts/`.

Синглтон `YandexSDK.Instance` предоставляет C# API для всех SDK-методов:
- `YandexSDK.Instance.InitSDK()`
- `YandexSDK.Instance.ShowInterstitial()`
- `YandexSDK.Instance.ShowRewarded(Action onRewarded)`
- `YandexSDK.Instance.SaveData(string json)`
- `YandexSDK.Instance.LoadData(Action<string> callback)`
- `YandexSDK.Instance.SetLeaderboardScore(string board, int score)`
- `YandexSDK.Instance.GameReady()`
- `YandexSDK.Instance.GameplayStart()`
- `YandexSDK.Instance.GameplayStop()`

### Шаг 4: Использование в игре
```csharp
using UnityEngine;

public class GameManager : MonoBehaviour
{
    void Start()
    {
        YandexSDK.Instance.InitSDK();
    }

    void OnSDKReady()
    {
        YandexSDK.Instance.GameReady();
        ShowMainMenu();
    }

    void OnLevelComplete()
    {
        YandexSDK.Instance.GameplayStop();
        YandexSDK.Instance.ShowInterstitial();
        // Сохранить прогресс
        YandexSDK.Instance.SaveData(JsonUtility.ToJson(saveData));
    }

    void OnWatchAdForReward()
    {
        YandexSDK.Instance.ShowRewarded(() => {
            // Начислить награду
            coins += 100;
        });
    }
}
```

### Шаг 5: Настройки сборки
- Platform: WebGL
- Compression Format: Gzip или Brotli
- Decompression Fallback: включить если Gzip
- Memory Size: оптимизировать для 256-512 МБ
- Отключить Exception Handling для размера

## Подход B: PluginYG-2

### Установка
1. Скачать PluginYG-2 с https://max-games.ru/plugin-yg
2. Импортировать .unitypackage в проект
3. Открыть настройки: YandexGame > Settings

### Настройка
В окне настроек PluginYG-2:
- Указать ID игры
- Включить нужные модули (реклама, покупки, лидерборды, сохранения)
- Настроить события

### Использование API
```csharp
using YG;

public class GameManager : MonoBehaviour
{
    void Start()
    {
        // Инициализация автоматическая
        YandexGame.GameReadyAPI();
    }

    void ShowAd()
    {
        // Interstitial
        YandexGame.FullscreenShow();

        // Rewarded
        YandexGame.RewVideoShow(0); // id reward
    }

    void OnRewardedCallback(int id)
    {
        if (id == 0) {
            coins += 100;
        }
    }

    void SaveProgress()
    {
        YandexGame.savesData.level = currentLevel;
        YandexGame.savesData.coins = coins;
        YandexGame.SaveProgress();
    }

    void LoadProgress()
    {
        currentLevel = YandexGame.savesData.level;
        coins = YandexGame.savesData.coins;
    }
}
```

### Подписка на события
```csharp
void OnEnable()
{
    YandexGame.GetDataEvent += LoadProgress;
    YandexGame.RewardVideoEvent += OnRewardedCallback;
    YandexGame.OpenFullAdEvent += OnFullAdOpen;
    YandexGame.CloseFullAdEvent += OnFullAdClose;
}

void OnDisable()
{
    YandexGame.GetDataEvent -= LoadProgress;
    YandexGame.RewardVideoEvent -= OnRewardedCallback;
    YandexGame.OpenFullAdEvent -= OnFullAdOpen;
    YandexGame.CloseFullAdEvent -= OnFullAdClose;
}
```

### Локализация в PluginYG-2
```csharp
string lang = YandexGame.lang; // "ru", "en", "tr", etc.
```

---

# Часть 3: Требования к релизу

## Архив
- **Формат:** ZIP
- **Корень:** `index.html` должен быть в корне архива (не в подпапке!)
- **Размер:** максимум 100 МБ (несжатый)
- **Имена файлов:** без пробелов, без кириллицы
- **URL:** без абсолютных ссылок на Yandex S3

## Хостинг (если используется)
- Только HTTPS и WSS (нет HTTP и WS)
- Нельзя указывать пути в адресе хоста
- Нельзя использовать IP-адреса и порты
- Почти все данные не должны грузиться с внешнего хоста

## Технические требования
- SDK подключён и инициализирован
- `LoadingAPI.ready()` вызывается
- `GameplayAPI.start()/stop()` реализованы
- Звук отключается при сворачивании вкладки/окна
- Звук отключается при fullscreen/rewarded рекламе
- Нет технических ошибок, крэшей, зависаний при длительной игре
- Нет сообщений об ошибках WebGL

## Реклама
- Только через SDK (никаких сторонних рекламных сетей)
- Interstitial — в естественных паузах
- Rewarded Video — только по инициативе игрока, кнопка с понятным текстом
- Награда за RV — бонус, не блокирует прогресс
- Состояние игры сохраняется после возврата из рекламы
- Ориентация рекламы совпадает с ориентацией игры
- Запрещены custom RTB баннеры

## Покупки
- Только через Yandex Games SDK
- Цены отображаются числами + валюта портала
- `consumePurchase()` вызывается после начисления
- Незавершённые покупки обрабатываются при каждом запуске
- Прогресс синхронизируется между устройствами

## Авторизация
- Нет сторонней регистрации
- Yandex ID — только по кнопке (не автоматически)
- Игра должна работать без авторизации (гостевой режим)

## Мобильные
- Полноэкранный режим во время геймплея
- Тач-управление (акселерометр опционально)
- Авто-показ клавиатуры на полях ввода
- Нет искажений при повороте экрана
- Long-press не вызывает контекстное меню / выделение
- Нет предупреждений WebGL

## Десктоп
- Активная область — до краёв экрана (кроме sticky баннеров)
- Соотношение сторон максимум 1:2
- Нет искажений при ресайзе окна
- Клавиатура + мышь по умолчанию
- Контекстное меню отключено

## ТВ
- Полноэкранный режим
- Навигация стрелками (достаточно для полного прохождения)
- Кнопки Back и OK
- Нет покупок
- Нет ссылок на сайт разработчика

## Контент
- Нет интерактивного ИИ (прегенерированный — можно)
- Все материалы лицензированы
- Нет копий других игр из каталога
- Нет вывода реальных денег / физических призов
- Нет внешних покупок (только SDK)
- Нет YouTube плеера
- Видео не должны вести на внешние ресурсы

## Геймплей
- Основной геймплей > 10 минут
- Викторины: > 100 уникальных вопросов
- Локализация минимум на 1 заявленный язык
- Авто-определение языка через SDK
- Полная инструкция управления в игре или описании

## Дополнительно (рекомендуется)
- Email разработчика
- Переключатель звука
- Функция паузы
- Отсутствие ошибок в консоли
- Туториал для сложных механик
- Ручной выбор языка через иконки

## Драфт (обязательные поля)
- Архив (ZIP)
- Платформы
- Ориентация
- Языки
- Возрастной рейтинг
- Категории (макс 2)
- Название (макс 50 символов, с заглавной)
- Описание (100-1000 символов)
- Как играть (100-1000 символов)
- Иконка (512x512 PNG)
- Обложка (800x470 PNG)
- Скриншоты (по устройствам)
- Версия (по умолчанию 0.0.0.1)
- Теги (до 20)
- Ключевые слова (макс 100 символов)

## Промо-материалы (опционально)
- Маскируемая иконка (круговая safe zone)
- Вертикальное видео геймплея (9:16, MP4, макс 28 сек, макс 100 МБ)
- Горизонтальное видео геймплея (16:9, MP4, макс 28 сек, макс 100 МБ)
- Рекламные видео (до 20 шт; 1080x1920 или 1920x1080)

## Тестирование
- Dev-среда: файлы локально, без взаимодействия с платформой (моки)
- Prod-среда: файлы локально, полное взаимодействие с платформой
- Draft-среда: файлы на сервере Yandex, полное взаимодействие

### Локальное тестирование
```bash
npm install -g @yandex-games/sdk-dev-proxy
npx @yandex-games/sdk-dev-proxy -p ./game-folder --dev-mode=true
```

Параметры:
- `--host, -h` — адрес локального сервера
- `--path, -p` — папка с ресурсами игры
- `--port` — порт (по умолчанию 8080)
- `--app-id, -i` — ID драфта игры
- `--csp, -c` — добавляет CSP мета-тег
- `--dev-mode` — режим разработки

### Тестовые покупки
- Добавить логин в "Список логинов для тестовых покупок" в Console
- Все платежи считаются тестовыми, деньги не списываются

### Debug Panel
- Через Console: "Открыть с панелью отладки"
- Через URL: `?debug-mode=16`
- Индикаторы: W (ожидание), IT (SDK загружен), IF (устаревший лоадер)
- Game Ready: синий моргает = ожидание, зелёный = ready вызван, красный = таймаут (90 сек)
