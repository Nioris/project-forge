---
name: yandex-sdk-integration
kind: tactical
description: "Yandex Games SDK integration: init, lifecycle, ads, purchases, saves, leaderboards, localization, dev-mode. Complete checklist-driven integration for HTML5 and Unity. Triggers on: SDK, Yandex, integrate, ads, purchases, leaderboard, save, localize, lifecycle, ready, interstitial, rewarded."
---

# Yandex Games SDK Integration

## Purpose
Single source of truth for SDK integration. Replaces reading 764-line INTEGRATION_GUIDE + 192-line CHECKLIST + 531-line wrapper + 153-line reference. Agent reads THIS first, uses references/ for code.

## ⚠️ This Skill OWNS These Files
- `templates/html5/yandex-sdk-wrapper.js` — DO NOT rewrite, only configure
- `templates/html5/sdk-init-snippet.html` — copy into game
- `docs/INTEGRATION_GUIDE.md` — full reference (read if need details)
- `docs/CHECKLIST.md` — verification checklist
- `docs/VERIFICATION_PROTOCOL.md` — double-check protocol

---

## Step 1: Detect Game Type and Add SDK

**HTML5** (has `index.html` + JS/CSS):
```html
<!-- Add to <head> of index.html -->
<script src="/sdk.js"></script>
<!-- Add before </body> -->
<script src="yandex-sdk-wrapper.js"></script>
```
Copy `templates/html5/yandex-sdk-wrapper.js` into game folder. DO NOT modify the wrapper — configure through its API.

**Unity** (has `Build/` + `.data`/`.wasm`):
- Approach A: Copy `templates/unity/YandexSDKBridge.jslib` + `YandexSDK.cs`
- Approach B: Install PluginYG-2 from max-games.ru/plugin-yg

## Step 2: Integration Checklist (do in THIS order)

### 2.1 Init + Lifecycle (MANDATORY — moderation REJECTS without this)
```javascript
// Game startup sequence:
// 1. Load assets, fonts, UI
// 2. When everything ready:
await YandexSDK.init();
YandexSDK.ready();                    // LoadingAPI.ready() — game is playable
// 3. When player starts actual gameplay:
YandexSDK.startGameplay();            // GameplayAPI.start()
// 4. When gameplay pauses (menu, death, level end):
YandexSDK.stopGameplay();             // GameplayAPI.stop()
```
**Common rejection:** calling ready() before UI is rendered. Fonts MUST be loaded first.

### 2.2 Dev-Mode (MANDATORY — game MUST work without SDK)
```javascript
// In game code, NEVER assume SDK exists:
if (typeof YaGames === 'undefined') {
  console.log('[SDK] Local dev mode');
  // Fallback: localStorage for saves, skip ads, navigator.language for lang
}
// YandexSDK wrapper handles this automatically — but game code must also check
```

### 2.3 Sound Muting (MANDATORY — moderation REJECTS without this)
```javascript
// Mute on: ad showing, tab hidden, game_api_pause
// Unmute on: ad closed, tab visible, game_api_resume
YandexSDK.onPause = () => { sfx.mute(); music.pause(); };
YandexSDK.onResume = () => { sfx.unmute(); music.resume(); };
// Also handle: document.addEventListener('visibilitychange', ...)
```
**CRITICAL:** Use `sfx.mute()/unmute()` methods. NEVER access `sfx._master` or `sfx._ctx` directly.

### 2.4 Saves (replace ALL localStorage)
```javascript
// Find EVERY localStorage call in game code and replace:
// OLD: localStorage.setItem('save', JSON.stringify(data))
// NEW: YandexSDK.saveData(data)

// OLD: JSON.parse(localStorage.getItem('save'))
// NEW: const data = await YandexSDK.loadData()

// Limits: 200 KB for setData, 10 KB for setStats
// iOS: use ysdk.getStorage() not localStorage (Safari purges it)
```
**Grep check:** `grep -r "localStorage" *.js` — ZERO results after integration.

### 2.5 Ads — Interstitial
```javascript
// ONLY at natural pauses:
// ✅ After death / game over
// ✅ Between levels
// ✅ Returning to main menu
// ❌ NEVER during gameplay
// ❌ NEVER in first 30 seconds
// ❌ NEVER more often than every 60 seconds

YandexSDK.showInterstitial({
  onOpen: () => { sfx.mute(); gamePaused = true; },
  onClose: (wasShown) => { sfx.unmute(); gamePaused = false; },
});
```

### 2.6 Ads — Rewarded Video
```javascript
// ONLY on player button press, show reward BEFORE asking:
// Button text: "▶ Удвоить монеты: +120 → +240" (not just "Watch ad")

YandexSDK.showRewarded({
  onRewarded: () => { player.coins *= 2; },
  onClose: () => { sfx.unmute(); },
  onError: () => { /* no reward, no punishment */ },
});
```

### 2.7 Purchases (if applicable)
```javascript
// Yandex Games only — no external payment systems
await YandexSDK.initPayments();
// Purchase:
const purchase = await YandexSDK.purchase('remove_ads');
// MANDATORY: consume after granting:
await YandexSDK.consumePurchase(purchase.purchaseToken);
// MANDATORY: check uncompleted on every startup:
const uncompleted = await YandexSDK.getUncompletedPurchases();
uncompleted.forEach(p => { grantItem(p.productID); YandexSDK.consumePurchase(p.purchaseToken); });
```
**Order:** Grant item FIRST → consume SECOND (consume deletes forever).

### 2.8 Leaderboards
```javascript
// Technical names: ONLY [a-zA-Z0-9] — NO underscores, dashes, spaces!
// ✅ 'killsbest'  ❌ 'kills_best'  ❌ 'kills-best'

// Modern API (use this):
await ysdk.leaderboards.setScore('killsbest', score);
const entries = await ysdk.leaderboards.getEntries('killsbest', { quantityTop: 10 });
// DEPRECATED (never use): ysdk.getLeaderboards(), lb.setLeaderboardScore()
```

### 2.9 Localization (13 languages MANDATORY)
```javascript
// Languages: RU, EN, ES, TR, PT, AR, ID, FR, JA, IT, DE, HI, ZH
// Detect: ysdk.environment.i18n.lang (SDK) → navigator.language (dev fallback)
// Unknown language → fallback to 'en'

// UI strings: t('play') → I18N[lang].play
// Game data: td('Меч') → DATA_EN['Меч'] (if not RU)

// Special handling:
// AR (Arabic): dir="rtl" on text containers
// JA, ZH: system font fallback for CJK
// Check: ?lang=xx for each language — ALL strings translated
```

### 2.10 Additional (do after core)
- Sticky banner: `YandexSDK.showBanner()` — bottom or top edge
- Desktop shortcut: `ysdk.shortcut.showPrompt()` — with reward incentive
- Review prompt: `ysdk.feedback.canReview()` → `ysdk.feedback.requestReview()` — after 3+ sessions
- Fullscreen: `ysdk.screen.fullscreen.request()` — on first tap for mobile
- Auth: `ysdk.auth.openAuthDialog()` — offer for save sync, not force

## Step 3: Verification (BEFORE building release)

### Quick Self-Check (5 minutes)
```
□ LoadingAPI.ready() called AFTER fonts + UI loaded
□ GameplayAPI.start()/stop() called on play/pause
□ grep localStorage → 0 results
□ Sound mutes on ad + tab hidden + game_api_pause
□ Interstitial: only natural pauses, 60s cooldown
□ Rewarded: player-initiated, reward shown before prompt
□ Purchases: consume() after grant + uncompleted on startup
□ Leaderboard names: [a-zA-Z0-9] only
□ All 13 languages: ?lang=xx shows translated UI
□ Game works without SDK (dev mode, no crash)
```

### Full Verification → read `docs/VERIFICATION_PROTOCOL.md`
3 passes: Technical (code) → Behavioral (flow) → Checklist (docs/CHECKLIST.md)

## Rate Limits (memorize)
| Method | Limit |
|--------|-------|
| getPlayer() | 20 / 5 min |
| setData() | 100 / 5 min |
| setStats() | 60 / min |
| setScore() | 1 / sec |
| getEntries() | 20 / 5 min |
| openAuthDialog() | 20 / 5 min |

## Archive Rules
- ZIP format, `index.html` in ROOT (not subfolder)
- Max 100 MB
- No spaces or Cyrillic in filenames
- No absolute Yandex S3 URLs in code
- No mentions of "Яндекс Игры" / "Yandex Games" in game text

## Non-Negotiable Acceptance Criteria
- [ ] SDK init + lifecycle (ready + start + stop) present and in correct order
- [ ] Dev-mode: game runs without /sdk.js
- [ ] Sound mutes on ads, tab hidden, game_api_pause — uses mute()/unmute() methods
- [ ] ZERO localStorage calls remaining (all → YandexSDK.saveData/loadData)
- [ ] Interstitial: natural pauses only, 60s cooldown, never during gameplay
- [ ] Rewarded: player-initiated, reward visible before prompt
- [ ] Purchases: consume after grant, uncompleted checked on startup
- [ ] Leaderboard names: [a-zA-Z0-9] only, modern API
- [ ] 13 languages with t()/td(), RTL for Arabic, CJK font fallback
- [ ] Quick self-check passes before build
- [ ] Game works on desktop (keyboard+mouse) AND mobile (touch) AND without SDK

---

## ЧАСТЫЕ ПРИЧИНЫ РЕДЖЕКТА (из реальных замечаний модерации)

Отсортированы по частоте. Агент ОБЯЗАН проверить ВСЕ пункты перед сборкой.

### 🔴 #1: GameReady API вызывается НЕ ВОВРЕМЯ (п. 1.19.2)
**Самый частый реджект.** Точный критерий Яндекса: индикатор Game Ready (debug-mode=16) должен
стать зелёным **РОВНО в момент, когда игра доступна для взаимодействия** — это либо «доступно меню»,
либо «можно играть» (включая стартовую анимацию). Два провала:
- 🚫 **слишком рано** — зелёный пока ещё виден прогресс-бар / троббер / чёрный экран;
- 🚫 **слишком поздно** — зелёный через несколько секунд ПОСЛЕ того как игра уже интерактивна.
Красный спустя 90с = «Game Ready не встроен».

**Правильный порядок:**
```javascript
// 1. Загрузить ВСЕ ассеты
await loadAllAssets();
// 2. Загрузить шрифты
await document.fonts.ready;
// 3. Отрисовать первый кадр — меню/титульный экран ВИДИМ и КЛИКАБЕЛЕН
renderTitleScreen();
// 4. ТОЛЬКО ТЕПЕРЬ, ровно когда игрок реально может взаимодействовать:
ysdk.features.LoadingAPI?.ready();
console.log('[SDK] LoadingAPI.ready() — game is interactive');
```

**ОШИБКИ:**
- ❌ `ready()` в `init()` / `DOMContentLoaded` (UI ещё грузится → «слишком рано», частый реджект)
- ❌ `ready()` до загрузки шрифтов / пока виден прогресс-бар или чёрный экран
- ❌ `ready()` через секунды ПОСЛЕ того как игра стала интерактивна (или после нажатия Play)
- ✅ `ready()` в момент, когда меню/титул видим и кликабелен (вкл. стартовую анимацию)

### 🔴 #1b: Старый лоадер SDK (п. 1.19.1)
Debug-панель показывает `IF` (init false) = старый лоадер → можно завернуть. Нужно `IT` (init true).
Подключай актуально и ДО `YaGames.init()`:
```html
<!-- в <head>, ДО игровых скриптов -->
<script async src="/sdk.js" onload="initSDK()"></script>
```
Относительный `/sdk.js` — для загрузки архивом в Консоль (рекомендуется). Свой домен →
`https://sdk.games.s3.yandex.net/sdk.js`. Проверь индикатор: должен быть `IT`, не `IF`.

### 🔴 #2: Нет автоопределения языка (п. 2.14)
**С 17 марта 2025 — обязательно для ВСЕХ новых игр.** С 2 мая 2025 — и для обновлений.

```javascript
// ОБЯЗАТЕЛЬНО через SDK, НЕ navigator.language:
const lang = ysdk.environment.i18n.lang; // 'ru', 'en', 'tr', etc.
applyLanguage(lang);
// Автоопределение ДОЛЖНО сработать ДО LoadingAPI.ready()
// Модерация проверяет: при открытии на турецком — UI сразу на турецком
```

**ОШИБКИ:**
- ❌ Определение языка ПОСЛЕ ready() (модерация видит русский текст на секунду)
- ❌ Только navigator.language без SDK
- ❌ Язык определяется, но часть строк не переведена

### 🔴 #3: Непереведённые тексты (п. 8.2.3)
**Модерация открывает с ?lang=tr и находит русские строки.**

```javascript
// ЧЕКЛИСТ: grep на непереведённое
// 1. ВСЕ UI-строки через t()
// 2. ВСЕ игровые данные через td()
// 3. Проверить КАЖДЫЙ язык: ?lang=ru, ?lang=en, ?lang=es, ?lang=tr, ?lang=pt,
//    ?lang=ar, ?lang=id, ?lang=fr, ?lang=ja, ?lang=it, ?lang=de, ?lang=hi, ?lang=zh
// 4. Особое внимание: toast-сообщения, ошибки, подсказки, названия кнопок,
//    popup-тексты, числовые форматы, placeholder в input
```

**Что пропускают чаще всего:**
- Toast/notification тексты
- Сообщения об ошибках
- Placeholder в полях ввода
- Тексты внутри Canvas (drawText с хардкодом)
- Названия предметов/ресурсов в игровых данных

### 🔴 #4: Реклама не в логических паузах (п. 4.4)
**Interstitial вызывается автоматически или не после пользовательского действия.**

```javascript
// ПРАВИЛО: Interstitial ТОЛЬКО после НЕИГРОВОГО ДЕЙСТВИЯ пользователя:
// ✅ Игрок нажал "Заново" → показать рекламу → перезапустить
// ✅ Игрок нажал "Меню" → показать рекламу → перейти в меню
// ✅ Игрок нажал "Следующий уровень" → показать рекламу → загрузить уровень
// ❌ Автоматически после смерти БЕЗ нажатия кнопки
// ❌ По таймеру каждые N секунд
// ❌ При загрузке уровня без действия игрока

// ЕСЛИ сессия > 5 минут и нет кнопки: показать 2-секундное предупреждение
function showAdWithWarning() {
  showWarningOverlay('Сейчас будет реклама...', 2000, () => {
    YandexSDK.showInterstitial({ /* ... */ });
  });
}
```

### 🔴 #5: Элементы обрезаются / выходят за экран (п. 1.10.1)
**Модерация проверяет на iPhone SE (375x667) и десктопе 1280x800.**

```javascript
// ОБЯЗАТЕЛЬНО: ВСЕ элементы внутри viewport
// 1. Canvas/game div: 100vw × 100dvh (dvh, не vh — для мобильных!)
// 2. Панели: maxWidth = Math.min(400, canvas.width - 32)
// 3. HUD: отступ от краёв минимум 8px (safe area)
// 4. Текст: overflow hidden + ellipsis для длинных строк
// 5. Тач-кнопки: не менее 8px от края экрана

// Проверить на:
// - iPhone SE 375x667 (самый маленький)
// - Android 360x780
// - Desktop 1280x800
// - Desktop 1920x1080
```

### 🔴 #6: Кнопка RV без ясного маркера (п. 4.5.1)
**Модерация требует чтобы игрок ТОЧНО понимал: "это реклама" и "это награда".**

```javascript
// ❌ Просто иконка "▶" — недостаточно очевидно
// ❌ Текст "Бонус" без упоминания рекламы
// ✅ "📺 Смотреть рекламу → +50 монет"
// ✅ "▶ Реклама: удвоить награду (120 → 240)"
// ✅ Иконка видео + текст "Посмотри рекламу и получи 3 жизни"

// Обязательно на кнопке:
// 1. Маркер что это РЕКЛАМА (иконка видео 📺▶ или слово "реклама/ad")
// 2. Конкретная награда (не "бонус", а "+50 монет" или "x2 награда")
```

### 🟡 #7: Контекстное меню / выделение текста (п. 1.6.1.8, 1.6.2.7)
**Long-press или правый клик открывает системное меню.**

```javascript
// В CSS (обязательно):
* {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
canvas {
  touch-action: none;
}

// В JS (на canvas и game container):
document.addEventListener('contextmenu', e => e.preventDefault());
// Для ВСЕХ интерактивных элементов внутри игры:
element.addEventListener('selectstart', e => e.preventDefault());
```

### 🟡 #8: Браузерная прокрутка / swipe-to-refresh (п. 1.10.2)
**На iOS тянешь вниз — страница обновляется.**

```css
/* В CSS: */
html, body {
  overflow: hidden;
  overscroll-behavior: none;
  position: fixed;      /* фиксирует на iOS */
  width: 100%;
  height: 100%;
  height: 100dvh;       /* dynamic viewport для мобильных */
}
```

```javascript
// В JS: блокировать на всём document
document.addEventListener('touchmove', e => {
  if (e.target.closest('#game') || e.target.tagName === 'CANVAS') {
    e.preventDefault();
  }
}, { passive: false });
```

### 🟡 #9: Промо-материалы не соответствуют (п. 5.1.1)
**Скриншоты содержат менее 70% геймплея или внешние элементы.**

```
ПРАВИЛА ДЛЯ СКРИНШОТОВ:
1. >= 70% площади = РЕАЛЬНЫЙ ГЕЙМПЛЕЙ (не арт, не обложка)
2. Десктоп скриншоты: 1920x1080, реальный вид игры в браузере
3. Мобильные скриншоты: 1080x1920, реальный вид на телефоне
4. НЕ использовать: стоковые фото, AI-арт без элементов игры
5. НЕ использовать: скриншоты других игр
6. НЕ использовать: один и тот же скриншот для разных игр
7. Обложка и иконка: НЕ скриншот (п. 5.6), но элементы из игры
8. Никаких системных UI (статус-бар, батарея, бейджи Яндекса)
9. Использовать MARKETING билд с читами для быстрого прогресса
```

### 🟡 #10: Неверный жанр в черновике (п. 2.3)
**Модерация меняет жанр если он не совпадает с геймплеем.**

```
ПРАВИЛО: Жанр определяется по ОСНОВНОЙ МЕХАНИКЕ, не по сеттингу.
- Кликер с элементами RPG → Казуальные (НЕ Приключения)
- Пазл с сюжетом → Головоломки (НЕ Приключения)
- Выживание + крафт → может быть: Приключения или Стратегии
- Гонки без сложной физики → Аркады (НЕ Гонки)
- Если сомневаешься → ставь "Казуальные" (самый безопасный)
```

### 🟡 #11: Название не уникально (п. 5.12)
```
ПЕРЕД ОТПРАВКОЙ: поискать название на https://yandex.ru/games/
Если есть похожее (отличие в 1-2 буквы) — СМЕНИТЬ.
Название не должно содержать: эмоджи, возрастной рейтинг, полностью КАПС.
```

### 🟡 #12: Политический контент (п. 3.4.4)
```
ЗАПРЕЩЕНО: карты с границами государств, флаги, военная тематика,
политические деятели, отсылки к конфликтам.
Если игра использует карту мира — убрать границы или использовать
абстрактную стилизованную карту.
```

### 🟡 #13: Зависания после рекламы (п. 1.14)
```javascript
// Игра ОБЯЗАНА корректно возобновляться после рекламы:
YandexSDK.showInterstitial({
  onOpen: () => {
    gamePaused = true;
    sfx.mute();
    // ОСТАНОВИТЬ все таймеры, анимации, requestAnimationFrame
    cancelAnimationFrame(animFrameId);
  },
  onClose: (wasShown) => {
    sfx.unmute();
    gamePaused = false;
    // ПЕРЕЗАПУСТИТЬ game loop
    lastTime = performance.now(); // сбросить deltaTime (иначе огромный dt)
    animFrameId = requestAnimationFrame(gameLoop);
  },
});
// КРИТИЧНО: сбросить lastTime при возобновлении — иначе dt = 30 секунд
// и вся физика взрывается за один кадр
```

---

## ПРЕДРЕЛИЗНЫЙ ЧЕКЛИСТ (проверить ВСЕ перед сборкой)

```
🔴 КРИТИЧНЫЕ (реджект гарантирован):
□ LoadingAPI.ready() вызывается когда title screen УЖЕ ВИДИМ
□ Автоопределение языка ЧЕРЕЗ SDK, ДО ready()
□ Все 13 языков: ?lang=xx — ВСЕ строки переведены
□ Interstitial ТОЛЬКО после нажатия кнопки игроком
□ RV кнопка имеет маркер "реклама" + конкретную награду
□ Нет контекстного меню при правом клике и long-press
□ Нет swipe-to-refresh на iOS
□ Элементы не обрезаются на 375x667

🟡 ЧАСТЫЕ (50% шанс реджекта):
□ Скриншоты: >= 70% реальный геймплей
□ Жанр совпадает с основной механикой
□ Название уникально в каталоге (проверить поиском)
□ Нет карт с границами / политического контента
□ Игра не зависает после закрытия рекламы
□ Название без эмоджи, рейтинга, полного КАПСа
□ Звук останавливается при сворачивании вкладки
```

## 🚫 ПОРЯДОК ЗАГРУЗКИ — жёсткий (полевой отказ 1.19, app-553975)

Отказ модерации: «GRA подключается после того, как игра доступна для играния». Факты из лога:
клик принят на 1143ms, ready() на 2535ms, язык прочитан на 2837ms — игрок играл 1.4 секунды
до ready(), а язык узнали уже после. Канонический порядок, отклонения = дефект:

```
1. init SDK                    → ysdk
2. detectLang (SDK-first)      → язык ИЗВЕСТЕН до любого текста на экране
3. отрисовать первый экран     → меню/титул уже на нужном языке
4. LoadingAPI.ready()          → лоадер платформы уходит
5. inputEnabled = true         → и ТОЛЬКО ТЕПЕРЬ игра принимает ввод
```

Реализация гейта (обязательна):
```js
let inputEnabled = false;
function onAnyInput(e){ if(!inputEnabled) return; /* ... */ }
// после ready():
ysdk.features.LoadingAPI.ready(); inputEnabled = true;
```
- «Нажмите чтобы начать» ДО ready() — запрещено (это и есть «доступна для играния»);
- тяжёлые ассеты: либо до ready() (лоадер честно висит, игра мертва), либо лениво после;
  промежуточного состояния «картинка живая, ready() нет» быть не должно;
- проверка фактом: в консоли черновика debugcheck v2.20 печатает «🚫 ОТКАЗ 1.19: ВВОД ПРИНЯТ
  ДО ready()» с миллисекундами — строка обязана отсутствовать.

## ™️ БРЕНД ПЛАТФОРМЫ В ТЕКСТАХ ИГРЫ — ЗАПРЕЩЁН (п.3.5, полевой отказ)

Лицензионное соглашение разработчика: соглашение **не даёт права использовать товарные знаки,
фирменные наименования, знаки обслуживания, логотипы и иные отличительные знаки Яндекса**.
SDK интегрируешь — слово в интерфейс не пишешь.

| Нельзя | Надо |
|---|---|
| «Войти через Яндекс» | «Войти», «Авторизоваться» |
| «Лидерборд Яндекс» | «Таблица лидеров», «Рейтинг» |
| «Оплата через Яндекс» | «Купить», «Оплатить» |
| логотип платформы в игре | ничего (диалоги платформа рисует сама) |

Диалог авторизации и окно оплаты **показывает сама платформа** — там её бренд уместен, это её
интерфейс. В твоём — нейтральные формулировки. То же касается RuStore, VK и любой платформы:
интеграция ≠ право на марку. Проверка: debugcheck v2.23 ловит упоминания статически.

⚠️ Если модерация ссылается на 3.5 с вложением — открой вложение: пункт чаще про АССЕТЫ
(чужая графика, шрифт, звук), чем про слова. Тогда вопрос в источнике материала и лицензии
(см. /asset-library: провенанс на каждый файл).
