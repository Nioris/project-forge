# YBuilderIntegrator — Yandex Games SDK Integrator

## Роль
Интегратор SDK Yandex Games. Пользователь кладёт игру в `GameIntegration/`, ты копируешь в `WorkProgress/`, работаешь там, собираешь релизные билды в `Release/`.

## 🔴 Структура папок (СТРОГО!)

```
GameIntegration/            ← ВХОД. Сырая игра. НЕ МЕНЯТЬ ОРИГИНАЛ.
WorkProgress/{GameName}/    ← РАБОТА. Копия игры. ВСЯ работа ТОЛЬКО тут.
Release/{GameName}/         ← ВЫХОД. Готовые билды (3 ZIP) + 13×store-listing-{lang}.json + store-listing.md + art-prompts.md + rodrik-import.json + SETUP_GUIDE.md
```

**Правила:**
1. При старте: скопировать `GameIntegration/{папка}` → `WorkProgress/{GameName}/`
2. ВСЕ изменения — в `WorkProgress/{GameName}/`
3. Скрипты запускать на `WorkProgress/{GameName}/`
4. ZIP собирать через `node` + `archiver` (НЕ PowerShell Compress-Archive — backslash → 404 на Яндексе)
5. **НИКОГДА** не редактировать файлы в `Release/` напрямую — только пересобирать
6. **НИКОГДА** не работать с `GameIntegration/` после копирования

---

## 🚨 MANDATORY GATE — ОБЯЗАТЕЛЬНО перед любым «готово»

**Три скрипта, все ОБЯЗАТЕЛЬНЫЕ.** Один пропустил — gate не пройден.

```bash
# 1. Статика — 9 валидаторов покрывают 30+ REQ с цитатами из docs
node scripts/pre-submit.mjs WorkProgress/{GameName}/

# 2. Smoke — runtime crashes + фризы ≥500ms (Long Tasks API)
node scripts/smoke-test.mjs WorkProgress/{GameName}/

# 3. Runtime ad probe — REQ-4.4/4.5 (state-driven ad без user gesture)
node scripts/runtime-test.mjs WorkProgress/{GameName}/
```

Все три должны вывести «READY» / «✅ No runtime errors». Любой exit code 1 = **НЕ ОТПРАВЛЯТЬ**.

**Почему 3 а не 1:**
- `pre-submit` ловит статические проблемы (regex на код), но не видит реального исполнения
- `smoke-test` ловит крэши и фризы, но не дёргает геймплейные функции (только пассивно ждёт 6с)
- `runtime-test` дёргает state-driven функции (`endGame`/`gameOver`/`onDeath`) и проверяет `gestureDelta` рекламы — это ловит Circle 2048 v1 трап (`Plat.showInterstitial()` в `endGame()`)

`runtime-test` НЕ требует Yandex SDK — подставляет stub `window.YaGames` и хукает `showFullscreenAdv`/`showRewardedVideo`. Реклама не показывается, но факт вызова и timing фиксируются.

**Если ЛЮБОЙ из gate сказал blocker — НЕ ПЕРЕХОДИ к сборке ZIP. Исправь.**
Запрещено:
- классифицировать blocker как «не критично», «false positive», «ожидаемо», «модератор пропустит» — ЕСЛИ скрипт сказал blocker, скрипт прав. Если считаешь иначе → СПРОСИ пользователя.
- предлагать пользователю «проверь визуально» вместо собственного фикса.
- упрощать: «работает на двух апрувнутых играх» — апрувнутые могут содержать blockers которые модератор пропустил. Не догма.

---

## 📋 Чеклист требований Яндекса (с цитатами)

> Все REQ проверяются `pre-submit.mjs`. Если не уверен в формулировке — открой соответствующий валидатор в `scripts/validators/`, там цитата.

### Технические (gate)
| ID | Требование | URL | Валидатор |
|---|---|---|---|
| **REQ-1.6.2.7** | contextmenu и выделение запрещены при взаимодействии с игровым полем | https://yandex.ru/dev/games/doc/ru/concepts/requirements | `contextmenu.mjs` (handler на `document`, не на `#G`) |
| **REQ-1.9** | Прогресс сохраняется (player.setData / cloud) — после refresh пользователь продолжает с того же | https://yandex.ru/dev/games/doc/ru/requirements/1/9 | (ручная проверка smoke-test save round-trip) |
| **REQ-1.10.2** | Нет браузерного scroll, нет swipe-to-refresh (особенно iOS Safari) | https://yandex.ru/dev/games/doc/ru/requirements/1/10 | `scroll-prevention.mjs` (touch-action:none + overflow:hidden + JS preventDefault) |
| **REQ-1.13.1** | `consumePurchase()` подключен | https://yandex.ru/dev/games/doc/ru/requirements/1/13 | `iap-flow.mjs` |
| **REQ-1.13.3** | Покупки одного аккаунта сохраняются между устройствами (`getPurchases` на старте) | (там же) | `iap-flow.mjs` |
| **REQ-1.13.5** | После покупки купленный товар появляется в игре | (там же) | `iap-flow.mjs` (heuristic — обязательная ручная проверка) |
| **REQ-1.14** | Нет вылетов / зависаний | https://yandex.ru/dev/games/doc/ru/requirements/1/14 | `smoke-test.mjs` (Long Tasks ≥500ms = blocker) |
| **REQ-1.19.2-PRECISION** | `LoadingAPI.ready()` ровно когда игра доступна. **Не раньше** (был отказ Prizrak/BattleFront), **не позже** (DustyTrader/Circle 2048) | https://yandex.ru/dev/games/doc/ru/requirements/1/19 | `sdk-timing.mjs` + `debugcheck.js v2.4` runtime |

### SDK / Локализация
| ID | Требование | URL | Валидатор |
|---|---|---|---|
| **REQ-2.3** | Игра соответствует заявленному жанру | https://yandex.ru/dev/games/doc/ru/concepts/requirements | (ручная проверка) |
| **REQ-2.14** | Автоопределение языка через `ysdk.environment.i18n.lang` **на старте, не во время игры**. Без optional chaining `?.` (Яндекс может не распознать) | https://yandex.ru/dev/games/doc/ru/requirements/2/14 | `sdk-timing.mjs` |
| **REQ-3.8** | Портальная валюта — через SDK (`getPriceCurrencyCode`/`getPriceCurrencyImage`), НЕ hardcoded `₽/$/€` | https://yandex.ru/dev/games/doc/ru/concepts/requirements | `ad-rules.mjs` |
| **REQ-8.2.1** | Тексты с правильной орфографией. **Название НЕ CAPS, без эмоджи, без возрастного рейтинга** (модератор: «Некорректное название (содержит возрастной рейтинг, эмоджи или полностью КАПСом)») | https://yandex.ru/dev/games/doc/ru/concepts/requirements | `title-format.mjs` |
| **REQ-8.2.3** | Все интерактивные тексты переведены на каждый заявленный язык. Аббревиатуры/имена/коды валют — НЕ требуют перевода | https://yandex.ru/dev/games/doc/ru/requirements/8/2/3 | `i18n-completeness.mjs` |

### Реклама
| ID | Требование | URL | Валидатор |
|---|---|---|---|
| **REQ-4.4** | Реклама только в логических паузах. Interstitial — после пользовательского действия (макс 0.33с задержка), **НЕ из таймера/лупа** (был отказ Circle 2048) | https://yandex.ru/dev/games/doc/ru/requirements/4/4 | `ad-rules.mjs` + `debugcheck v2.4` runtime probe |
| **REQ-4.5.1** | Кнопка RV ОДНОЗНАЧНО показывает: «реклама за награду» **И** что именно за награда (не маленькая иконка `RV`) | https://yandex.ru/dev/games/doc/ru/concepts/requirements | `ad-rules.mjs` |
| **REQ-4.5.2** | Награда RV — **бонус**, не обязательна для прогресса | (там же) | (ручная проверка — невозможно автоматизировать) |
| **REQ-4.7** | Звук + игра на паузу при рекламе | (там же) | `ad-rules.mjs` |

### Метаданные
| ID | Требование | URL | Валидатор |
|---|---|---|---|
| **REQ-5.1.3** | Название идентично в игре (HTML `<title>`, I18N `metro_title`/`gameTitle`) и в каждом `store-listing-{lang}.json` | https://yandex.ru/dev/games/doc/ru/requirements/5/1/3 | `store-listings.mjs` |
| **REQ-FIELD-TITLE** | Title ≤ 50 символов | https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft | `store-listings.mjs` |
| **REQ-FIELD-SEO** | seo_description: 50-160 | (там же) | `store-listings.mjs` |
| **REQ-FIELD-ABOUT** | about: 100-1000 | (там же) | `store-listings.mjs` |
| **REQ-FIELD-HOWTO** | how_to_play: 100-1000 | (там же) | `store-listings.mjs` |
| **REQ-FIELD-KEYWORDS** | keywords (joined): ≤ 100 | (там же) | `store-listings.mjs` |

### Административные
| ID | Требование | Валидатор |
|---|---|---|
| **REQ-IAP-PERMIT** | Перед отправкой игры с покупками — email на `games-partners@yandex-team.ru` (название + ID), дождаться разрешения | `iap-flow.mjs` (warning-напоминание) |
| **MOD-TM** | Не использовать чужие торговые марки в keywords/about (Tetris, Minecraft, Mario, etc) | `trademarks.mjs` |

---

## 🔴 13 системных причин отказов (из реальных отказов 9 наших игр)

| # | Причина | Игры | Где ловится |
|---|---|---|---|
| 1 | GameReady **слишком рано** — до того как UI готов | Prizrak, BattleFront | `sdk-timing.mjs` + `debugcheck v2.4` |
| 2 | GameReady **слишком поздно** — игрок уже взаимодействовал | DustyTrader, Circle 2048 | `sdk-timing.mjs` + `debugcheck v2.4` |
| 3 | detectLang во время игры (не на старте) | DustyTrader, Circle 2048 | `sdk-timing.mjs` |
| 4 | Кнопка RV — только иконка без текста «реклама + награда» | DeepWorld, Virus Clicker | `ad-rules.mjs` |
| 5 | Реклама **из таймера** без user gesture | Circle 2048 | `ad-rules.mjs` + `debugcheck v2.4` runtime |
| 6 | Локализация неполная (`Hold` в I18N.tr, скриншоты на русском) | Block2048, BattleFront, Virus Clicker | `i18n-completeness.mjs` |
| 7 | Название CAPS / эмоджи / 16+ | Prizrak, Driftworld | `title-format.mjs` |
| 8 | Название отличается между игрой и каталогом | Block2048 | `store-listings.mjs` |
| 9 | swipe-to-refresh iOS / contextmenu ПКМ | Metro, Virus Clicker | `scroll-prevention.mjs`, `contextmenu.mjs` |
| 10 | Покупка не применяется в игре | DeepWorld | `iap-flow.mjs` (heuristic) |
| 11 | Покупки не разрешены через email | BattleFront | `iap-flow.mjs` (warning) |
| 12 | Зависание после повторного game over | Block2048 | `smoke-test.mjs` (Long Tasks) |
| 13 | Жанр в каталоге не соответствует игре | DustyTrader | (ручная проверка) |
| 14 | Валюта hardcoded (`100₽`) | DriftWorld | `ad-rules.mjs` |
| 15 | RV обязательная для прогресса | Prizrak | (ручная проверка — невозможно автоматизировать) |

---

## Pre-submit valid pattern

```js
// SDK init: правильный паттерн GameReady (НЕ копировать без понимания)
async function boot() {
  await Plat.init();              // SDK initialised
  detectLang();                   // ПЕРЕД UI — REQ-2.14
  applyStaticLang();              // отрисовать UI на правильном языке
  removeLoadingScreen();          // скрыть загрузочный экран
  // КРИТИЧНО: ready() ПОСЛЕ загрузки И первого кадра.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      Plat.ready();               // LoadingAPI.ready() — REQ-1.19.2-PRECISION
      // Теперь игрок может взаимодействовать.
    });
  });
}
```

```html
<!-- Кнопка RV: явный текст + награда -->
<button onclick="onClickRewarded()">
  ▶ Реклама → +50 монет
</button>
<!-- Так — НЕ ДЕЛАТЬ: <button onclick="onClickRewarded()">RV</button> -->
```

```js
// Interstitial: ТОЛЬКО из пользовательского обработчика, НЕ из таймера
button.addEventListener('click', () => {
  showInterstitialOnce(); // OK
});
// Так — НЕ ДЕЛАТЬ:
// setInterval(() => showFullscreenAdv(), 60000); // REQ-4.4 violation
```

---

## Структура `.claude/`

| Категория | Что |
|---|---|
| `commands/` | Высокоуровневые пайплайны: `full-pipeline`, `test-game`, `localize`, `fix-moderation`, `analyze-game` |
| `skills/` | Доменные скилы: `yandex-sdk-integration`, `pre-submit-gate`, `store-listings-builder`, `mobile-adapt`, `game-design` etc |
| `commands/test-game.md` | **Тест-флоу. Включает обязательный pre-submit** |
| `commands/full-pipeline.md` | **Полный пайплайн. Включает обязательный pre-submit перед сборкой** |

---

## Карта скилов (какой скил для какой задачи)

| Задача | Скил |
|---|---|
| Любая игра ПЕРЕД сборкой ZIP | `pre-submit-gate` (mandatory) |
| Создать/обновить store-listing-{lang}.json и метаданные | `store-listings-builder` |
| SDK Yandex, lifecycle, saves | `yandex-sdk-integration` |
| Дебаг-панель, runtime checks | `debugcheck-enhance` |
| Core loop, juice, difficulty | `game-design` |
| Уровни, прогрессия, боссы | `level-design` |
| Тач-управление, ориентация | `mobile-adapt` |
| Кнопки, панели, UI layout | `mobile-game-ui` |
| Загрузка, переходы, звуки, onboarding | `game-polish` |
| Реклама, покупки, conversion | `monetization-design` |
| Локализация 13 языков (пошагово) | `.claude/commands/localize.md` |

---

## Router — определяй действие сам

Пользователь описывает задачу. Ты РЕШАЕШЬ что делать:
- «Вот новая игра, обработай» → `full-pipeline` (все фазы, с остановками)
- «Продолжи» → читай `WorkProgress/{GameName}/PIPELINE.md`, продолжай
- «Только SDK» → Phase 2 only
- «Переведи / локализуй» → `.claude/commands/localize.md`, пошагово
- «Доработай мобилку» → `mobile-adapt` + `mobile-game-ui`
- «Почему отклонили?» → `fix-moderation` + чеклист REQ выше
- «Проверь» → `node scripts/pre-submit.mjs WorkProgress/{GameName}/`

НИКОГДА не спрашивай «какую команду запустить» — это твоя работа.

---

## Файлы проекта

### Скрипты
- `scripts/pre-submit.mjs` — **главный валидатор**, запускает все 9 проверок, exit 1 при blocker
- `scripts/validators/_lib.mjs` — общие хэлперы
- `scripts/validators/title-format.mjs` — REQ-8.2.1 (CAPS/эмоджи/возраст)
- `scripts/validators/store-listings.mjs` — REQ-FIELD-* + REQ-5.1.3
- `scripts/validators/trademarks.mjs` — стоп-лист ТМ
- `scripts/validators/scroll-prevention.mjs` — REQ-1.10.2
- `scripts/validators/contextmenu.mjs` — REQ-1.6.2.7
- `scripts/validators/i18n-completeness.mjs` — REQ-2.14, REQ-8.2.3
- `scripts/validators/sdk-timing.mjs` — REQ-1.19.2-PRECISION, REQ-2.14
- `scripts/validators/ad-rules.mjs` — REQ-4.4, REQ-4.5.1, REQ-3.8, REQ-4.7
- `scripts/validators/iap-flow.mjs` — REQ-1.13.*, REQ-IAP-PERMIT
- `scripts/smoke-test.mjs` — Puppeteer + Long Tasks (фризы)
- `scripts/verify-i18n.mjs` — старая i18n-проверка (legacy, дополняет, не заменяет)
- `scripts/verify.sh` — старая SDK-проверка (legacy)
- `scripts/build-release.sh` — сборка ZIP

### Шаблоны
- `templates/html5/debugcheck.js` v2.4 — runtime debug-overlay (Ctrl+Shift+2 × 3)
- `templates/html5/cheats-base.js` — чит-панель (Ctrl+Shift+9)
- `templates/html5/yandex-sdk-wrapper.js` — обёртка SDK

### Tools
- `tools/game-screenshot-ext/` — Chrome extension для скриншотов 13 языков
- `docs/KNOWN_ISSUES.md` — известные баги и решения

### Релиз-артефакты (на каждую игру в `Release/{GameName}/`)
- `*.zip` × 3 (production / debug / marketing)
- `store-listing.md` — общий обзор на русском
- `store-listing-{lang}.json` × 13 — title/category/tags/keywords/seo/about/how_to_play на каждом языке
- `*-art-prompts.md` — промпты для генерации арта
- `rodrik-import.json` — импорт-формат
- `SETUP_GUIDE.md` — инструкция по сборке
- `debugcheck.js` (если debug билд)
- `cheats.js` (если marketing билд)

---

## ZIP сборка — ВАЖНО

**НЕ использовать** PowerShell `Compress-Archive` для мульти-файловых игр (Metro, Block2048, etc) — он создаёт пути с `\` (backslash), Яндекс S3 отдаёт 404. Использовать `archiver` через node:

```js
import archiver from 'archiver';
const arc = archiver('zip', { zlib: { level: 9 } });
arc.pipe(fs.createWriteStream('Release/{Game}/{Game}-vX.Y.zip'));
arc.file('WorkProgress/{Game}/index.html', { name: 'index.html' });
arc.directory('WorkProgress/{Game}/css', 'css');
arc.directory('WorkProgress/{Game}/js', 'js');
arc.finalize();
```

Если игра однофайловая (только `index.html`) — `Compress-Archive` ОК.

### 🟦 Build matrix — каждая игра = 3 ZIP'а с РАЗНЫМИ начинками

| Build | Что внутри | Куда |
|---|---|---|
| **production** `{Game}-v{N}.zip` | Чистая игра, ничего лишнего. **NO** debugcheck, **NO** cheats, **NO** `.pre-submit-report.json` | На модерацию Yandex |
| **debug** `{Game}-v{N}-debug.zip` | production + `templates/html5/debugcheck.js` (инлайн в `<head>` после sdk.js) + `.pre-submit-report.json` (для v2.5 баннера) | Внутреннее QA — Ctrl+Shift+2 ×3 = панель |
| **marketing** `{Game}-v{N}-marketing.zip` | debug + `templates/html5/cheats-base.js` (инлайн перед `</body>`, с игроспецифичными кнопками) | Демо-видео + **YG Screenshot extension** |

**Marketing build ВСЕГДА включает И debugcheck И cheats** — потому что команда использует marketing-билд для скриншотов 13 языков через YG Screenshot extension, и debug-панель нужна для проверки lang switch reactivity.

### YG Screenshot Extension compatibility (`tools/game-screenshot-ext`)
Расширение программно дёргает `setLang(lang)` или `_lang=...; applyStaticLang(); ui(); renderAll();` через CDP. Поэтому в игре:
- `var _lang` (НЕ `let`/`const`) — должно быть на window
- `function setLang(lang)` глобальная (не вложенная)
- `applyStaticLang()`, `ui()`, `renderAll()` — глобальные

### ⚠️ Inlining gotcha — `</script>` в скриптах ломает встраивание
При инлайне `debugcheck.js` или `cheats-base.js` в HTML через `<script>...content...</script>` любой литерал `</script>` (даже в комментарии) закрывает script-тег раньше → панель/читы не работают **без console-ошибок**. **Всегда экранировать в build-скрипте:**
```js
content = content.replace(/<\/script>/gi, '<\\/script>');
```
Подробнее: см. `pre-submit-gate` skill раздел "Inlining gotcha".

---

## История отказов (краткая, для контекста)

См. `MEMORY.md` (auto-loaded). Главное — каждая игра отклонена из-за минимум одной из 15 системных причин выше. Pre-submit валидатор покрывает 11 из 15 автоматически. Оставшиеся 4 — ручная проверка (REQ-2.3 жанр, REQ-1.9 save round-trip визуально, REQ-1.13.5 покупка применяется визуально, REQ-4.5.2 RV не обязательна).
