---
name: vk-sdk-integration
kind: tactical
description: "VK Bridge integration for Mini Apps: init, lifecycle, launch params, ads (VKWebAppShowNativeAds/CheckNativeAds/Banner), VK Storage (4KB limits), VK Pay голоса…"
---

# VK Bridge Integration

## Purpose
Single source of truth for VK Bridge integration. Purpose is mirror of `yandex-sdk-integration` — agent reads THIS first, uses `templates/html5/vk-bridge-wrapper.js` for code.

## ⚠️ This Skill OWNS These Files
- `templates/html5/vk-bridge-wrapper.js` — DO NOT rewrite, only configure
- `templates/html5/vk-init-snippet.html` — copy into game
- `scripts/verify-vk.mjs` — verification script
- `docs/BUILD_KNOWLEDGE.md` секция VK — accumulated pitfalls

---

## Step 1: Add Bridge

**HTML5 (single file, no build):**
```html
<!-- В <head> index.html, ДО любого другого JS -->
<script src="https://unpkg.com/@vkontakte/vk-bridge@3.0.2/dist/browser.min.js"></script>
<!-- Перед </body> -->
<script src="vk-bridge-wrapper.js"></script>
```

**HTML5 с npm (Vite/Webpack):**
```bash
npm install @vkontakte/vk-bridge
```
```javascript
import bridge from '@vkontakte/vk-bridge';
```

**ВАЖНО:** перед каждой сборкой — web-search «@vkontakte/vk-bridge latest version npm» и обновить. НЕ использовать версию из памяти.

## Step 2: Integration Checklist (в ЭТОМ порядке)

### 2.1 Init + Subscribe (ОБЯЗАТЕЛЬНО — иначе реджект на мобильных)

```javascript
// ПРАВИЛЬНЫЙ порядок:
// 1. Подписаться на события ДО send()
bridge.subscribe(event => {
  const { type, data } = event.detail;
  if (type === 'VKWebAppUpdateConfig') onConfigUpdate(data);
  if (type === 'VKWebAppViewHide') sound.mute();
  if (type === 'VKWebAppViewRestore') sound.unmute();
});

// 2. Определить язык ИЗ launch params ДО рендера UI
const params = new URLSearchParams(window.location.search);
const lang = params.get('vk_language') || navigator.language.slice(0,2) || 'ru';
applyLanguage(lang);

// 3. Загрузить ассеты, шрифты, UI
await document.fonts.ready;
await loadAssets();

// 4. ТОЛЬКО ТЕПЕРЬ вызываем Init
await bridge.send('VKWebAppInit');

// 5. ТОЛЬКО ТЕПЕРЬ — любые другие вызовы
```

**Самая частая ошибка:** VKWebAppInit вызван после других методов. Тогда на мобильных — вечный лоадер.

### 2.2 Dev-Mode Fallback (ОБЯЗАТЕЛЬНО)

Игра/приложение ДОЛЖНО работать без iframe ВК — открытие URL напрямую в браузере для разработки и модерации.

```javascript
// В коде игры:
const IS_VK = /vk_app_id/.test(window.location.search);
const IS_WEB_DEV = !IS_VK;

// Wrapper решает сам: если supports()→true — Bridge, иначе — fallback
// vk-bridge-wrapper.js: await VKApp.storageSet(key,val)
//   → VKWebAppStorageSet если в VK
//   → localStorage.setItem если dev
```

### 2.3 Launch Params (для серверной проверки)

При открытии приложения в VK в query-string приходят параметры:

```
?vk_app_id=51234567
&vk_user_id=12345
&vk_platform=mobile_android
&vk_language=ru
&vk_ref=other
&vk_ts=1735000000
&vk_is_app_user=1
&vk_are_notifications_enabled=1
&vk_access_token_settings=
&sign=htQFduJpLxz7ribXRZpDFUH-XEUhC9rBPTJkjUFEkRA
```

**На клиенте:** читаем `vk_language` для локализации, `vk_platform` для адаптации UI.

**На сервере:** проверяем `sign` через HMAC-SHA256 с client secret (защищённым ключом) приложения:

```javascript
// Node.js пример проверки sign:
import crypto from 'crypto';

function verifyLaunchParams(query, clientSecret) {
  const params = new URLSearchParams(query);
  const sign = params.get('sign');
  params.delete('sign');

  // Оставить только vk_* параметры, отсортировать по ключу
  const sorted = Array.from(params.entries())
    .filter(([k]) => k.startsWith('vk_'))
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join('&');

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(sorted)
    .digest('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

  return expected === sign;
}
```

Если sign не проверен — сервер получает спуф от злоумышленника.

### 2.4 Платформа (vk_platform)

| Значение | Что это |
|----------|---------|
| `mobile_iphone` | Нативный iOS клиент ВК |
| `mobile_ipad` | iPad app |
| `mobile_android` | Нативный Android клиент ВК |
| `mobile_web` | m.vk.com в мобильном браузере |
| `desktop_web` | vk.com в десктопном браузере |
| `mobile_android_messenger` | VK Messenger for Android |
| `mobile_iphone_messenger` | VK Messenger for iOS |

Адаптируйся: на `desktop_web` можно мышкой, на `mobile_*` — touch. Некоторые методы (например, `VKWebAppShowLeaderBoardBox`) доступны только в нативных клиентах — проверяй `bridge.supports()`.

### 2.5 VK Storage (замена localStorage)

**Лимиты:**
- Ключ: только `[a-zA-Z_\-0-9]`, до 100 символов
- Значение: **4096 байт строки**. Для JSON-строк — реально **2236 байт** (баг, issue #226)
- Количество ключей на пользователя на приложение: не документировано, де-факто сотни работают

```javascript
// ✅ Обёртка vk-bridge-wrapper.js делает правильно:
await VKApp.storageSet('coins', '1200');  // < 4096 — ok
await VKApp.storageSetJSON('meta', { v:3, lang:'ru' });  // тоже ok если < 2000 байт

// Для больших структур (save game) — шардинг:
await VKApp.storageSetSharded('save', bigGameObject);
// → внутри: save__meta = {"count":5}, save__0, save__1, ... save__4

// Чтение:
const data = await VKApp.storageGetSharded('save');
```

**ОСТОРОЖНО — параллельные писки ломают Bridge** (GH issue #192):
```javascript
// ❌ ЗАВИСНЕТ:
await Promise.all(keys.map(k => bridge.send('VKWebAppStorageSet', k)));

// ✅ ПРАВИЛЬНО:
for (const k of keys) {
  await bridge.send('VKWebAppStorageSet', k);
}
```

Wrapper гарантирует последовательность через внутреннюю очередь.

### 2.6 Реклама — Rewarded (видео за награду)

```javascript
// 1. Проверить доступность
async function preloadRewarded() {
  if (!bridge.supports('VKWebAppCheckNativeAds')) return false;
  const r = await bridge.send('VKWebAppCheckNativeAds', { ad_format: 'reward' });
  return r.result === true;
}

// 2. Показать кнопку ТОЛЬКО если check прошёл
if (await preloadRewarded()) showRewardedButton();
else hideRewardedButton();

// 3. Обработка клика
async function onRewardedClick() {
  try {
    sound.mute();
    gameLoop.pause();
    const r = await bridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' });
    if (r.result === true) {
      grantReward();   // ← награда ТОЛЬКО при result:true
    }
    // Важно: на iOS в авиарежиме приходит { no_ad_reason: false } — без награды
  } catch (e) {
    // пользователь закрыл / нет инвентаря — без награды и без наказания
  } finally {
    sound.unmute();
    gameLoop.resume();
    lastTime = performance.now();  // сбросить dt — иначе физика взорвётся
  }
}
```

### 2.7 Реклама — Interstitial (полноэкранная)

```javascript
// ТОЛЬКО в логических паузах:
// ✅ между уровнями, после смерти (по нажатию «Заново»), на возврате в меню
// ❌ автоматически посреди игры, по таймеру

const MIN_COOLDOWN_MS = 60_000;  // 60 секунд между interstitial
let lastInterstitialAt = 0;

async function maybeShowInterstitial() {
  if (Date.now() - lastInterstitialAt < MIN_COOLDOWN_MS) return;
  if (!bridge.supports('VKWebAppShowNativeAds')) return;

  try {
    sound.mute();
    gameLoop.pause();
    await bridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
    lastInterstitialAt = Date.now();
  } catch {}
  finally {
    sound.unmute();
    gameLoop.resume();
    lastTime = performance.now();
  }
}
```

### 2.8 Реклама — Баннер

```javascript
// Закреплённая полоска внизу или вверху
if (bridge.supports('VKWebAppShowBannerAd')) {
  try {
    await bridge.send('VKWebAppShowBannerAd', {
      banner_location: 'bottom',  // 'top' | 'bottom'
      layout_type: 'resize',      // 'resize' — сдвигает контент, 'overlay' — поверх
    });
  } catch {}
}

// Скрыть:
await bridge.send('VKWebAppHideBannerAd');
```

Баннеры дают мало денег, но не раздражают. Подходят для приложений (не игр в полный экран).

### 2.9 Preloader Ads (рекомендация VK)

Показывается на старте, пока игра грузит ассеты:

```javascript
// Параллельно с загрузкой ассетов:
const [assetsDone, adDone] = await Promise.allSettled([
  loadAssets(),
  bridge.send('VKWebAppShowNativeAds', { ad_format: 'preloader' }),
]);
// Показываем игру когда ассеты готовы, даже если реклама ещё крутится
```

Не ломает UX и даёт дополнительный CPM. Реализация в wrapper.

### 2.10 Покупки за голоса (VKWebAppShowOrderBox)

**С июля 2021 года** — виртуальные товары ТОЛЬКО через ShowOrderBox. Любой внешний шлюз = реджект.

**Настройка в кабинете:**
1. dev.vk.com → ваше приложение → Настройки → Платежи → включить
2. Указать Callback URL — на него ВК шлёт POST с `notification_type=get_item` / `order_status_change`
3. Ответ сервера — JSON с `response.item_id`, `response.item_price` (в голосах) или `error`

**На клиенте:**
```javascript
async function purchase(itemId) {
  try {
    const r = await bridge.send('VKWebAppShowOrderBox', {
      type: 'item',
      item: itemId,  // строка, которую VK пошлёт на callback для получения деталей
    });
    // r.status === 'success' → покупка прошла, сервер выдал товар через callback
    if (r.status === 'success') refreshInventory();  // перечитать инвентарь с сервера
  } catch (e) {
    // Пользователь отменил или ошибка
  }
}
```

**Экономика:**
- 1 голос ≈ 7 ₽ розничная цена
- Комиссия ВК: 45% от выручки
- AppsCentrum (перевод голосов в рубли): 1.8–4.1%
- **Итого разработчик получает ~50%** от розничной цены

**Тестирование:** в Настройках приложения → Платежи → Тестеры → добавить VK ID. У тестера должен быть минимум 1 голос, но голоса не списываются.

### 2.11 VK Pay (для не-цифровых товаров)

Для физических товаров / услуг — можно VK Pay:

```javascript
await bridge.send('VKWebAppOpenPayForm', {
  app_id: APP_ID,
  action: 'pay-to-service',
  params: {
    amount: 100,          // рубли
    description: 'Доставка заказа #123',
    merchant_id: 123456,
    version: 2,
    sign: '...',           // подпись с сервера
  },
});
```

Комиссия VK Pay сильно меньше голосов (~3–5%), но для digital-контента нельзя.

### 2.12 Leaderboards

```javascript
// Показать встроенный диалог с лидербордом (только iOS/Android!)
if (bridge.supports('VKWebAppShowLeaderBoardBox')) {
  await bridge.send('VKWebAppShowLeaderBoardBox', { user_result: score });
  // Результат пользователя обновляется автоматически на базе user_result
}
// Для desktop_web / mobile_web — делать свой UI через VK API users.get + собственный сервер
```

### 2.13 Приглашения и расшаривание

```javascript
// Пригласить друга в игру
await bridge.send('VKWebAppShowInviteBox');

// Отправить запрос конкретному юзеру
await bridge.send('VKWebAppShowRequestBox', {
  uid: friendUserId,
  message: 'Попробуй эту игру!',
  requestKey: 'invite1',
});

// Опубликовать историю с результатом
await bridge.send('VKWebAppShowStoryBox', {
  background_type: 'image',
  url: 'https://my-cdn.com/share/result.png',
  attachment: { type: 'url', url: 'https://vk.com/app51234567', text: 'open' },
});
```

**NB:** если приложение НЕ в официальном каталоге — invite/request ограничены только админами приложения.

### 2.14 Скачивание / установка в «мои игры»

```javascript
// Подписка на приложение (аналог shortcut в Яндексе)
await bridge.send('VKWebAppAddToFavorites');
// ВК сам покажет диалог. Повторные вызовы игнорируются если уже добавлено.
```

### 2.15 Локализация

```javascript
// Источник истины — vk_language launch param:
const lang = new URLSearchParams(location.search).get('vk_language') || 'ru';

// Поддерживаемые коды (из VK Bridge docs):
// ru, uk, be, en, es, fi, de, it, kk, uz, az, hy, ka и ещё ~20
// Неизвестный → fallback 'en'

// Для VK достаточно RU + EN + 1-2 на усмотрение (KK/UZ/BY если CIS).
// Не требуется 13 языков как для Яндекс Игр.
```

### 2.16 Пользовательский контекст / тема

```javascript
// Светлая / тёмная тема автоматически
bridge.subscribe(e => {
  if (e.detail.type === 'VKWebAppUpdateConfig') {
    const scheme = e.detail.data.scheme;  // 'bright_light' | 'space_gray' | ...
    document.body.dataset.theme = scheme.includes('dark') || scheme === 'space_gray' ? 'dark' : 'light';
  }
});
```

## Step 3: Verification (BEFORE release)

### Quick Self-Check (5 минут)
```
□ VKWebAppInit — ПЕРВЫМ вызовом Bridge
□ bridge.subscribe() установлен ДО send()
□ bridge.supports() проверяется ДО каждого необязательного метода
□ Игра/приложение запускается без ВК (открыть URL в чистом браузере)
□ vk_language читается и применяется ДО рендера UI
□ Sound mute на VKWebAppViewHide + visibilitychange
□ grep localStorage → только в dev-fallback, не в основном коде
□ VK Storage: один вызов в момент времени (последовательные await)
□ Rewarded: CheckNativeAds → если false, кнопка скрыта
□ Rewarded: награда выдаётся ТОЛЬКО при result === true
□ Interstitial: только в паузах, cooldown 60 сек
□ Interstitial onClose: lastTime сброшен, requestAnimationFrame перезапущен
□ Покупки: только через VKWebAppShowOrderBox
□ Пути относительные, <base href="./">, package.json homepage "./"
□ Запрещённый контент отсутствует (азартные, 18+, политика, клоны)
```

### Auto-verify
```bash
node scripts/verify-vk.mjs path/to/game
# → 0 FAIL обязательно перед деплоем
```

## Rate Limits и лимиты (по документации + практика)

| Метод | Лимит / факт |
|-------|--------------|
| VKWebAppStorageSet | 1 call / момент (параллельные ломаются), 4096 байт value |
| VKWebAppStorageGet | массивом до 10 ключей за раз |
| VKWebAppShowNativeAds (interstitial) | фактический cooldown в SDK: ~30–60 сек |
| VKWebAppShowNativeAds (reward) | по нажатию игрока, фактический fill rate ~50–80% |
| VKWebAppShowOrderBox | без строгого лимита, но 1 активный диалог |
| VKWebAppCallAPIMethod | общие лимиты VK API (3–20 req/sec на метод) |
| VKWebAppGetUserInfo | кешировать на сессию |

## VK Hosting Config

Для деплоя через `npx @vkontakte/vk-miniapps-deploy` нужен `vk-hosting-config.json` в корне:

```json
{
  "static_path": "dist",
  "app_id": "51234567",
  "endpoints": {
    "mobile": "index.html",
    "mvk": "index.html",
    "web": "index.html"
  }
}
```

- `static_path` — папка со сборкой (для Vite: `dist`, для CRA: `build`, для чистого HTML: `.` или `public`)
- `app_id` — из dev.vk.com
- `endpoints` — точки входа по платформам (обычно одна и та же `index.html`)

В `package.json`: `"homepage": "./"` — иначе абсолютные пути в бандле сломают загрузку.

## Non-Negotiable Acceptance Criteria
- [ ] VKWebAppInit вызывается ПЕРВЫМ и ДО рендера UI
- [ ] bridge.subscribe() до send()
- [ ] Dev-mode fallback работает — игра запускается без VK в браузере
- [ ] Нет параллельных VKWebAppStorageSet
- [ ] Все Storage значения ≤ 2000 байт (для JSON) или ≤ 4000 байт (для строк)
- [ ] Ключи Storage: [a-zA-Z_\-0-9]
- [ ] Rewarded: CheckNativeAds → Show → награда при result:true
- [ ] Interstitial: только в паузах, 60s cooldown
- [ ] Sound mute на visibilitychange И VKWebAppViewHide
- [ ] Покупки digital: только VKWebAppShowOrderBox
- [ ] Пути относительные, homepage "./"
- [ ] Context menu + swipe-to-refresh отключены
- [ ] Проверка sign на сервере (если есть серверная часть)
