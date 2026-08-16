---
name: Android Capacitor build knowledge base
description: Accumulated knowledge from MultiTool project — SDK versions, build gotchas, Capacitor pitfalls, audit findings
type: reference
---

# Android + Capacitor Build Knowledge Base
Собрано на проекте MultiTool (2026-03-30). Актуально для Capacitor 8.3 + Android SDK 36.

---

## Сборка

### Java
- Android Studio JBR (JDK 21) — путь: `C:/Program Files/Android/Android Studio/jbr`
- Gradle 8.13+ требует JDK 11 минимум. Системная Java 8 НЕ подходит
- Команда: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease bundleRelease`

### Capacitor 8.3
- `npx cap copy android` — копирует web assets из `webDir` в `android/app/src/main/assets/public/`
- `npx cap sync android` — copy + обновляет нативные плагины
- После КАЖДОГО изменения HTML/JS/CSS — обязательно `cap copy` перед gradle build
- WebView кеширует старые файлы — при тестировании УДАЛЯТЬ старый APK перед установкой нового

### Подпись
- Keystore PKCS12: `keytool -genkey -v -keystore name.keystore -storetype PKCS12 -alias name -keyalg RSA -keysize 2048 -validity 10000`
- `android/keystore.properties` — НЕ коммитить в git
- `build.gradle` читает keystore.properties через `Properties().load()`
- Для RuStore нужен pepk: `java -jar pepk.jar --keystore=name.keystore --alias=name --output=pepk_out.zip`

---

## SDK версии (рабочие на март 2026)

| SDK | Версия | Gradle dependency |
|-----|--------|-------------------|
| Capacitor | 8.3.0 | `@capacitor/android`, `@capacitor/core`, `@capacitor/cli` |
| Yandex Mobile Ads | 7.18.2 | `com.yandex.android:mobileads:7.18.2` |
| AppMetrica | 7.13.0+ | `io.appmetrica.analytics:analytics:7.13.0` |
| RuStore Review | 10.2.0 | `ru.rustore.sdk:review:10.2.0` |
| core-splashscreen | 1.2.0 | `androidx.core:core-splashscreen:1.2.0` |
| compileSdk | 36 | |
| minSdk | 24 | Android 7.0 Nougat |
| targetSdk | 36 | |

### Maven репозиторий для Yandex/RuStore SDK
```gradle
maven { url "https://artifactory-external.vkpartner.ru/artifactory/maven" }
```

---

## Capacitor Pitfalls

### onPostCreate — НЕ добавлять null-check на getBridge()
```java
// ❌ НЕЛЬЗЯ — убивает ВСЕ JS мосты:
if (getBridge() == null || getBridge().getWebView() == null) return;

// ✅ ПРАВИЛЬНО — Capacitor гарантирует bridge в onPostCreate:
WebView webView = getBridge().getWebView();
```

### BridgeWebChromeClient — НИКОГДА не заменять
Capacitor использует свой WebChromeClient для обработки permissions, geolocation, file chooser. Замена ломает getUserMedia, geolocation и другие Web API.

### onDestroy — чистить ad listeners
```java
@Override
public void onDestroy() {
    if (loadedInterstitial != null) { loadedInterstitial.setAdEventListener(null); loadedInterstitial = null; }
    if (loadedRewarded != null) { loadedRewarded.setAdEventListener(null); loadedRewarded = null; }
    if (bannerAd != null) { bannerAd.destroy(); bannerAd = null; }
    super.onDestroy();
}
```
Visibility: `public void onDestroy()` (не protected — BridgeActivity использует public).

### JS Bridge (@JavascriptInterface)
- Методы выполняются в binder thread, НЕ в UI thread
- Для UI операций — `runOnUiThread(() -> ...)`
- `boolean` возвращается синхронно в JS
- `evaluateJavascript()` — НИКОГДА не интерполировать user input в строку
- Для callback из Java в JS: `wv.post(() -> wv.evaluateJavascript("if(typeof fn==='function')fn()", null))`

---

## Yandex Mobile Ads

### Инициализация
```java
MobileAds.initialize(this, () -> {
    Log.d(TAG, "Yandex Ads initialized");
    loadInterstitial();
    loadRewarded();
});
```

### Interstitial — best practices
- Preload при старте, reload после закрытия (onAdDismissed)
- Persistent counter в localStorage (не сбрасывается при рестарте)
- Cooldown 60 сек между показами
- Промо rewarded показывать из `onAdDismissed` callback (НЕ setTimeout — WebView paused во время рекламы)

### Rewarded
- Callback `onRewarded(Reward)` — момент начисления награды
- Уведомлять JS через `evaluateJavascript`
- Preload следующий в `onAdDismissed`
- Кнопка в UI должна обновляться при загрузке — уведомлять из `onAdLoaded`

### Баннер
- `BannerAdView` добавляется в CoordinatorLayout (parent WebView)
- bottomMargin на WebView нужно менять при show/hide
- Если баннер убран — НЕ вызывать setupBanner(), удалить bottom padding

---

## Permissions в Capacitor WebView

### Нативный мост лучше Web API
```java
public class PermBridge {
    @JavascriptInterface
    public boolean check(String webName) {
        String perm = mapPerm(webName);
        if (perm == null) return false; // fail-closed!
        return ActivityCompat.checkSelfPermission(ctx, perm) == PERMISSION_GRANTED;
    }
}
```
- `navigator.permissions.query()` НЕНАДЁЖЕН в WebView
- localStorage кеш может быть stale (пользователь отозвал в настройках)
- Нативный check — единственный source of truth

### Flow разрешений
1. JS: `MTPerm.check('camera')` → true → пропуск диалога
2. JS: `MTPerm.check('camera')` → false → показать кастомный диалог → getUserMedia → нативный Android диалог
3. После успеха: `markPermGranted()` в localStorage (кеш для PWA mode)

### Маппинг web → Android
```
camera → Manifest.permission.CAMERA
microphone → Manifest.permission.RECORD_AUDIO
geolocation → Manifest.permission.ACCESS_FINE_LOCATION
```

---

## Иконка приложения

### Adaptive Icon XML перебивает PNG!
На Android 8+ (API 26) файлы `mipmap-anydpi-v26/ic_launcher.xml` и `ic_launcher_round.xml` имеют ПРИОРИТЕТ над PNG из mipmap-*dpi/. Capacitor создаёт эти XML-файлы со стандартным зелёным foreground. Если не удалить — кастомная PNG-иконка НИКОГДА не покажется.

**ОБЯЗАТЕЛЬНО удалить при замене иконки:**
```
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml
android/app/src/main/res/drawable/ic_launcher_background.xml
android/app/src/main/res/values/ic_launcher_background.xml
```

### npx sharp-cli НЕ работает для resize на Windows
Команда `npx sharp-cli resize` на Windows вызывает Delphi Form Conversion Utility вместо sharp. Файлы не перезаписываются, но exit code 0 — ошибка молча проглатывается.

**Правильный способ — через node require('sharp'):**
```bash
npm install sharp --save-dev
```
```javascript
const sharp = require('sharp');
const sizes = {mdpi:48, hdpi:72, xhdpi:96, xxhdpi:144, xxxhdpi:192};
Object.entries(sizes).forEach(([dir, size]) => {
  const base = `android/app/src/main/res/mipmap-${dir}`;
  sharp('icon.png').resize(size, size)
    .toFile(`${base}/ic_launcher_new.png`)
    .then(() => {
      fs.renameSync(`${base}/ic_launcher_new.png`, `${base}/ic_launcher.png`);
      fs.copyFileSync(`${base}/ic_launcher.png`, `${base}/ic_launcher_round.png`);
      fs.copyFileSync(`${base}/ic_launcher.png`, `${base}/ic_launcher_foreground.png`);
    });
});
```

### Кеширование иконки на устройстве
Android кеширует иконку в лаунчере. После замены иконки:
1. `gradlew clean` — сбросить кеш сборки
2. `adb uninstall` — полное удаление (НЕ просто install поверх)
3. Пересобрать и установить заново

### Чеклист замены иконки
- [ ] Исходник 512x512 PNG
- [ ] Удалены XML в mipmap-anydpi-v26/ и drawable/
- [ ] Сгенерированы 5 размеров через sharp (48, 72, 96, 144, 192)
- [ ] ic_launcher.png + ic_launcher_round.png + ic_launcher_foreground.png в каждой папке
- [ ] `gradlew clean` + `adb uninstall` перед установкой
- [ ] Визуально проверить: `Read mipmap-xxxhdpi/ic_launcher.png`

---

## SplashScreen

### Android 12+ SplashScreen API (core-splashscreen)
- Показывает ТОЛЬКО центрированную иконку (max 240dp), НЕ полноэкранное изображение
- Требует `installSplashScreen()` ДО `super.onCreate()`
- Для брендированного splash (текст, лого) — НЕ подходит

### HTML splash — надёжнее
```html
<div id="splash" class="splash">RODRIK</div>
```
```javascript
setTimeout(() => {
    const sp = document.getElementById('splash');
    if (sp) { sp.classList.add('hide'); setTimeout(() => sp.remove(), 600) }
}, 700); // 700ms для утилиты (не дольше!)
```
- z-index:9999, position:fixed, inset:0
- Для утилит: 500-800мс (люди открывают быстро что-то измерить)
- Для игр: 1.5-2с допустимо

---

## PWA (Service Worker)

### Cache version — БАМПИТЬ при каждом деплое
```javascript
const CACHE_NAME = 'app-v1.1-20260330'; // дата или хеш
```
Без бампа пользователь НИКОГДА не получит обновление (cache-first).

### Precache — ВСЕ шрифты
```javascript
const PRECACHE_URLS = [
    '/', '/index.html', '/js/config.js', '/manifest.json',
    '/fonts/fonts.css',
    '/fonts/jetbrains-mono-latin.woff2',
    '/fonts/jetbrains-mono-cyrillic.woff2',     // ← ОБЯЗАТЕЛЬНО для русского!
    '/fonts/jetbrains-mono-cyrillic-ext.woff2',  // ← тоже нужен
    // ... все остальные woff2
];
```
Без кириллического шрифта в precache — офлайн показывает квадратики.

### Offline fallback
```javascript
.catch(() => {
    if (event.request.mode === 'navigate') return caches.match('/index.html');
    return new Response('', { status: 503, statusText: 'Offline' });
})
```

### manifest.json
- Icon purpose: РАЗДЕЛЬНЫЕ записи `"any"` и `"maskable"` (НЕ `"any maskable"`)
- Добавлять `"lang": "ru"`, `"id": "/index.html"`

---

## CSS для мобильных

### Шрифты — clamp() вместо фиксированных px
```css
/* ❌ */ font-size: 42px;
/* ✅ */ font-size: clamp(28px, 10vw, 42px);
```

### viewport-fit для вырезов/жестов
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
```
```css
.hdr { padding-top: max(12px, env(safe-area-inset-top)); }
```

### z-index — декоративные элементы НИЖЕ контента
`.noise` (текстура) должен быть z-index:1, НЕ 100. Иначе перекрывает glow/эффекты.

### Диалоги — responsive max-width
```css
/* ❌ */ max-width: 340px;
/* ✅ */ max-width: calc(100vw - 40px);
```

### Touch targets — минимум 44px
Кнопки разрешений, калькулятора, табов — min-height:44px для мобильного UX.

---

## Аудит — частые баги

### Scoping: const/let в if/else
```javascript
// ❌ КРАШИТСЯ — nH не видна за пределами else:
if (polar) { ... }
else { const nH = now.getHours(); ... }
drawSky(rL, sL, nH); // ReferenceError!

// ✅ Вынести перед if/else:
const nH = now.getHours();
if (polar) { ... }
else { ... }
drawSky(rL, sL, nH); // OK
```

### Function() как eval — trig степени
```javascript
// ❌ Ломает sin(45)+cos(30):
e = e.replace(/sin\(/g, 'Math.sin(RAD*(');
// добавить ) в конец — скобки сломаются

// ✅ Helper-функции в scope:
const r = Function(
    '"use strict";' +
    'const _d=Math.PI/180,' +
    '_sin=x=>Math.sin(x*_d),' +
    '_cos=x=>Math.cos(x*_d),' +
    '_tan=x=>Math.tan(x*_d);' +
    'return(' + e + ')'
)();
```

### Division by zero
Всегда guard перед делением: `if(v[1]===0) return {v:'—', u:'ошибка'}`
Особенно: закон Ома, уклон, сечение кабеля, дальномер.

### localStorage corruption
```javascript
// ❌
DB = JSON.parse(localStorage.getItem('key'));

// ✅
try {
    DB = JSON.parse(localStorage.getItem('key') || '{}');
    if (!Array.isArray(DB.notes)) DB.notes = [];
} catch(e) { DB = {notes:[]}; }
```

### Compass на Android
- `deviceorientationabsolute` — alpha УЖЕ clockwise от севера (НЕ инвертировать 360-alpha)
- `deviceorientation` (fallback) — alpha может быть counterclockwise (нужен 360-alpha)
- `webkitCompassHeading` (iOS) — уже heading, без инверсии
- Smoothing: exponential moving average (factor 0.15) убирает дрожание
- Shortest-path rotation: track cumulative rotation, delta через `((d+180)%360+360)%360-180`

---

## RuStore публикация

### Обязательно
- Privacy Policy на хостинге (без неё отклонят)
- Декларация чувствительных разрешений (CAMERA, RECORD_AUDIO, LOCATION) с обоснованиями до 1500 символов
- Категории и типы данных (что собирается, что передаётся)
- Возрастной рейтинг

### Порядок заполнения в консоли
1. Название (до 30 символов)
2. Тип (приложение/игра)
3. Требования к устройству
4. Категория + теги (из официального списка!)
5. Возрастное ограничение
6. Поисковые теги (до 5)
7. Краткое описание (до 80 символов, обязательно "бесплатно")
8. Полное описание (до 4000 символов, ключевики в первых 2 строках)
9. FAQ (до 10, отображаются на сайте)
10. Безопасность данных

### Контакты в конце описания
```
Связаться с нами:
Games.3.9@yandex.ru
info@rodrik.dev
Наш сайт: https://rodrik.dev/
```

---

## VK Mini Apps

### VK Bridge (актуальные версии на апрель 2026)

| Компонент | Версия | Источник |
|-----------|--------|----------|
| @vkontakte/vk-bridge | 2.15+ | npm `@vkontakte/vk-bridge` |
| @vkontakte/vk-miniapps-deploy | 2+ | npm `@vkontakte/vk-miniapps-deploy` |
| @vkontakte/create-vk-mini-app | 3+ | npm `@vkontakte/create-vk-mini-app` (только для полного стека VKUI) |

**Правило:** перед сборкой — `npm view @vkontakte/vk-bridge version` и сравнить.

### Pitfalls (из реальных проектов)

#### 1. VKWebAppInit — ПЕРВЫМ вызовом
**Симптом:** на web работает, на Android/iOS клиенте ВК — вечный лоадер или «Не удалось загрузить».
**Причина:** VKWebAppInit вызван после других send(), или не вызван вообще.
**Фикс:** bridge.subscribe() → читать launch params → await bridge.send('VKWebAppInit') → ТОЛЬКО потом остальное.

#### 2. Параллельные VKWebAppStorageSet ломают мост
**Симптом:** Promise.all с несколькими storageSet — часть промисов висят вечно.
**Источник:** [GH vk-bridge #192](https://github.com/VKCOM/vk-bridge/issues/192).
**Фикс:** последовательный await в цикле. Наш wrapper содержит writeQueue.

#### 3. VKWebAppStorageSet для JSON обрезает на 2236 байт
**Симптом:** Сохранили 3 KB объекта, читается только начало, потом `SyntaxError: Unexpected end of JSON`.
**Источник:** [GH vk-bridge #226](https://github.com/VKCOM/vk-bridge/issues/226).
**Фикс:** либо держать JSON < 2 KB, либо шардинг (wrapper.storageSetSharded).

#### 4. iOS rewarded в авиарежиме резолвится с `{no_ad_reason: false}`
**Симптом:** игрок без интернета жмёт «смотреть рекламу» — награда выдаётся без показа.
**Источник:** [GH vk-bridge #214](https://github.com/VKCOM/vk-bridge/issues/214).
**Фикс:** выдавать награду ТОЛЬКО при `result === true`. Wrapper делает это автоматически.

#### 5. Абсолютные пути и proxy VK
**Симптом:** на хостинге ВК ассеты не грузятся (404 или CORS).
**Причины:** `src="http://localhost"`, `src="/assets/"`, кириллица в именах файлов.
**Фикс:** `<base href="./">`, `"homepage": "./"` в package.json, ASCII-имена файлов.

#### 6. Покупки вне VKWebAppShowOrderBox
**Правило с 7 июля 2021:** digital-товары (внутренняя валюта, доступы, косметика) — ТОЛЬКО через ShowOrderBox (голоса).
**Фикс для физических товаров / услуг:** VKWebAppOpenPayForm (VK Pay, не голоса).
**Реджект-риск:** любой Stripe/PayPal/YooKassa для digital = бан приложения.

#### 7. Экономика голосов (2026)
- Розница: 1 голос ≈ 7 ₽
- Комиссия VK: 45% с каждой продажи
- AppsCentrum (перевод в фиат): 1.8–4.1%
- **Разработчик получает ~50% розницы**
- Пример: пользователь потратил 100 ₽ (≈14 голосов) → разработчик в кармане ~50 ₽

### VK Hosting Config (vk-hosting-config.json)

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

`static_path` должна указывать на собранную папку (например `dist` для Vite, `build` для CRA, `.` для single-file HTML).

Деплой: `npx @vkontakte/vk-miniapps-deploy`.

### Тестирование на всех платформах

Обязательно проверить ПЕРЕД модерацией:
1. `https://m.vk.com/app{APP_ID}` — мобильный веб
2. VK Android приложение → Приложения → ввести ID
3. `https://vk.com/app{APP_ID}` — десктопный веб
4. VK iOS приложение (если доступен Mac)

vk_platform для каждой должен быть разный: `mobile_web`, `mobile_android`, `desktop_web`, `mobile_iphone`.
