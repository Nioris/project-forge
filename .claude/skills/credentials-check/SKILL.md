---
name: credentials-check
kind: tactical
description: "Check and request all required credentials, API keys, SDK IDs, signing keys before building for any platform. ALWAYS run before /convert, /build-apk, /release-yandex, /deploy. Triggers on: credentials, ключи, ID, appmetrica, admob, подпись, keystore, signing, api key, конвертация, сборка, релиз."
---

# Credentials Check — Запрос всех необходимых ключей

## Purpose
ПЕРЕД любой сборкой или интеграцией SDK — проверить что ВСЕ необходимые ключи, ID и файлы на месте. Если чего-то нет — СПРОСИТЬ у пользователя и сказать КУДА положить.

## ПРАВИЛО
**НИКОГДА** не подставлять фейковые ключи, placeholder'ы типа `YOUR_KEY_HERE`, или пустые строки. Если ключ нужен и его нет — СТОП, спроси у пользователя.

## ПРАВИЛО ВЕРСИЙ SDK
**НИКОГДА** не использовать версии SDK из памяти — они УСТАРЕВШИЕ!
Перед каждой сборкой — веб-поиск актуальных версий:
- Capacitor, Gradle Plugin, Yandex Ads, AppMetrica, RuStore SDK
- При ошибке сборки — СНАЧАЛА проверить версию SDK через поиск
- НЕ городить костыли вокруг багов старой версии — ОБНОВИТЬ

## Step 1: Определить платформу → Определить что нужно

### Для terminal API-профилей Forge

```
📋 ЧЕКЛИСТ TERMINAL AGENTS
═══════════════════════════════════

  [ ] GigaChat Authorization Key
      → ../forge-data/secrets/gigachat.key
      → node scripts/forge-secrets.mjs set gigachat --stdin

  [ ] Сертификат НУЦ Минцифры установлен в системное хранилище ОС
      → GigaChat launcher включает NODE_USE_SYSTEM_CA=1 до старта Node child process

  [ ] GigaSearch key — ОПЦИОНАЛЬНО, только для production endpoint
      → ../forge-data/secrets/gigasearch.key
      → node scripts/forge-secrets.mjs set gigasearch --stdin
      → без production endpoint Forge launcher использует no-key fallback bing-html

  [ ] Активная search-конфигурация проверена
      → node scripts/forge-search-doctor.mjs --project <PROJECT>
      → или /search-doctor внутри GigaChat terminal
```

### Для RuStore (APK/AAB)

```
📋 ЧЕКЛИСТ RUSTORE
═══════════════════════════════════

ПОДПИСЬ (ОБЯЗАТЕЛЬНО):
  [ ] Keystore файл (.keystore) — ОБЯЗАТЕЛЬНО формат PKCS12 (НЕ JKS!)
      → Если нет: сгенерировать (см. ниже)
      → Положить в: android/{project-name}.keystore
      → НЕ коммитить в git!

  [ ] Keystore пароль
  [ ] Key alias
  [ ] Key пароль
      → Все данные СОХРАНИТЬ в: StoreData/SIGNING_CREDENTIALS.md (НЕ в git!)

  [ ] pepk.jar — утилита RuStore для шифрования ключа
      → Скачать из RuStore Console → Приложение → Подпись
      → Положить в: android/pepk.jar

  [ ] Encryption key из RuStore Console
      → Console → Приложение → Подпись → скопировать ключ шифрования
      → Начинается с 0000...

  [ ] pepk_out.zip — зашифрованный ключ (генерируется из keystore)
      → Загружается в Console → Подпись
  [ ] upload_cert.pem — публичный сертификат (экспортируется из keystore)
      → Загружается в Console → Подпись

РЕКЛАМА (если нужна):
  [ ] Yandex Ads Block ID (баннер)      → AD_BANNER_ID в config.js
  [ ] Yandex Ads Block ID (interstitial) → AD_INTER_ID в config.js
  [ ] Yandex Ads Block ID (rewarded)     → AD_REWARD_ID в config.js
      → Получить: https://partner.yandex.ru → Мои приложения → Блоки

АНАЛИТИКА (если нужна):
  [ ] AppMetrica API Key               → APPMETRICA_KEY в config.js
      → Получить: https://appmetrica.yandex.ru → Добавить приложение
  [ ] MyTracker SDK Key                → MYTRACKER_KEY в config.js
      → Получить: https://tracker.my.com → Приложения

RUSTORE SDK (опционально):
  [ ] RuStore Company ID               → RUSTORE_COMPANY_ID
  [ ] RuStore Console Key ID           → RUSTORE_KEY_ID
  [ ] RuStore Console Key файл (.pem)  → путь к файлу
      → Получить: https://console.rustore.ru → Пуш-уведомления → Ключи

ПУБЛИКАЦИЯ:
  [ ] Иконка приложения 512×512 PNG    → assets/icon-512.png
  [ ] Скриншоты (мин. 2 шт)           → assets/screenshots/
  [ ] Описание (краткое + полное)      → store-listing.md
  [ ] Политика конфиденциальности URL  → privacy-policy.md или URL
```

### Для Яндекс Игр

```
📋 ЧЕКЛИСТ YANDEX GAMES
═══════════════════════════════════

ОБЯЗАТЕЛЬНО:
  [ ] App ID (из кабинета разработчика)  → YANDEX_APP_ID в config.js
      → Получить: https://games.yandex.ru/console → Ваша игра → ID

РЕКЛАМА:
  [ ] Game Distribution рекламный блок   → Создаётся автоматически в SDK
      → НО нужно включить монетизацию в кабинете!

ЛИДЕРБОРДЫ (если используются):
  [ ] Leaderboard Name (создать в кабинете)
      → Кабинет → Лидерборды → Создать
      → Записать имя в: LEADERBOARD_NAME в config.js

ПОКУПКИ (если IAP):
  [ ] Product ID для каждого товара
      → Кабинет → Покупки → Добавить товар
      → Записать ID в: IAP_PRODUCTS[] в config.js

ПУБЛИКАЦИЯ:
  [ ] Иконка 512×512 PNG
  [ ] Обложка 800×470 PNG
  [ ] Скриншоты (мин. 3 шт, 16:9)
  [ ] Описание на русском
```

### Для VK Mini Apps

```
📋 ЧЕКЛИСТ VK MINI APPS
═══════════════════════════════════

ОБЯЗАТЕЛЬНО:
  [ ] App ID (из dev.vk.com)          → VK_APP_ID в config.js
      → Получить: https://dev.vk.com → Мои приложения → Создать приложение
      → Тип: "Мини-приложение" или "Встраиваемое приложение (IFrame)"

  [ ] Защищённый ключ (Client Secret) → .env: VK_CLIENT_SECRET
      → Получить: dev.vk.com → приложение → Настройки → Защищённый ключ
      → ⚠️ НЕ вставлять в клиентский код! Только на сервере для проверки sign.

СЕРВИСНЫЙ КЛЮЧ (если нужны API-вызовы с сервера):
  [ ] Сервисный ключ доступа           → .env: VK_SERVICE_TOKEN
      → Получить: dev.vk.com → приложение → Настройки → Ключи доступа

ПЛАТЕЖИ ЗА ГОЛОСА (если монетизация):
  [ ] Callback URL для платежей       → dev.vk.com → Платежи → Адрес обратного вызова
      → HTTPS эндпойнт, отвечающий на get_item и order_status_change
      → ОБЯЗАТЕЛЬНО до публикации! Иначе покупки не работают.

  [ ] Список товаров (item_id)        → IAP_PRODUCTS[] в config.js
      → Каждый товар зарегистрирован в кабинете с ценой в голосах
      → Тестеры: VK ID в Настройках → Платежи → Тестеры (у тестера нужен ≥ 1 голос)

ДЕПЛОЙ:
  [ ] vk-hosting-config.json в корне  → static_path, app_id, endpoints
      → Для бесплатного хостинга VK через `npx @vkontakte/vk-miniapps-deploy`
      → Либо свой HTTPS-хостинг с валидным SSL

  [ ] В package.json: "homepage": "./"
      → Относительные пути. Без этого — 404 на ассетах.

ПУБЛИКАЦИЯ:
  [ ] Иконка 278×278 PNG               → StoreData/vk/icon-278.png
  [ ] Иконка 278×370 PNG               → StoreData/vk/icon-278x370.png
  [ ] Баннер 1120×800 PNG              → StoreData/vk/banner-1120x800.png
  [ ] Скриншоты мобильные (2+)         → StoreData/vk/screenshots/mobile-*.png
  [ ] Скриншоты desktop (2+)           → StoreData/vk/screenshots/desktop-*.png
  [ ] Описание (короткое + полное)     → StoreData/vk/description.md
  [ ] Политика конфиденциальности URL  → StoreData/vk/privacy-policy.md
  [ ] Категория каталога (1 из списка)
  [ ] 3–5 тегов
  [ ] Возрастной рейтинг (6+/12+/16+/18+)
```

**.env для VK (не коммитить!):**
```bash
VK_APP_ID=51234567
VK_CLIENT_SECRET=wvl68m4dR1UpLrVRli   # Защищённый ключ
VK_SERVICE_TOKEN=                     # Опциональный, только если нужны server-side API
```

**config.js для VK (можно коммитить):**
```javascript
const VK_CONFIG = {
  VK_APP_ID: 51234567,
  CALLBACK_URL: 'https://my-api.com/vk/callback',
  IAP_PRODUCTS: [
    { id: 'remove_ads', price_votes: 3 },
    { id: 'coins_pack_100', price_votes: 1 },
    { id: 'coins_pack_1000', price_votes: 7 },
  ],
};
```

### Для Web-сервера (Deploy)

```
📋 ЧЕКЛИСТ WEB DEPLOY
═══════════════════════════════════

ОБЯЗАТЕЛЬНО:
  [ ] Домен                             → DOMAIN в .env
  [ ] IP сервера                        → SERVER_IP в .env
  [ ] SSH доступ (логин/ключ)           → ssh user@ip

SSL:
  [ ] Email для Let's Encrypt           → SSL_EMAIL в .env

БАЗА ДАННЫХ (если есть):
  [ ] PocketBase URL                    → POCKETBASE_URL в .env
  [ ] PocketBase admin email/пароль     → (создать при первом запуске)

PUSH-УВЕДОМЛЕНИЯ (если есть):
  [ ] VAPID Public Key                  → VAPID_PUBLIC в .env
  [ ] VAPID Private Key                 → VAPID_PRIVATE в .env
      → Сгенерировать: npx web-push generate-vapid-keys

AI (если есть):
  [ ] Claude API Key                    → CLAUDE_API_KEY в .env
  [ ] YandexGPT API Key                → YANDEX_GPT_KEY в .env
```

### Для Telegram Mini App

```
📋 ЧЕКЛИСТ TELEGRAM MINI APP
═══════════════════════════════════

БОТ (ОБЯЗАТЕЛЬНО):
  [ ] Bot Token                         → TG_BOT_TOKEN в .env
      → Создать: BotFather → /newbot → имя → username
      → НЕ публиковать в git!

  [ ] Bot Username                      → TG_BOT_USERNAME в .env (без @)

  [ ] Web App URL (HTTPS обязательно)   → WEB_APP_URL в .env
      → Развернуть на: GitHub Pages / Vercel / свой VPS с SSL
      → Установить через BotFather: /setmenubutton

ИНТЕГРАЦИЯ (если есть):
  [ ] HMAC validation secret (= Bot Token)  → серверная проверка initData

PAYMENTS (если используете Stars / TON):
  [ ] Provider Token (Stars)            → BotFather → /mybots → Payments
  [ ] TON Wallet Address                → если принимаешь TON
  [ ] TON Connect Manifest URL          → размещён на HTTPS

ANALYTICS (опционально):
  [ ] @CtrlAltDeskBot connection        → для in-app analytics

DOMAIN (если custom):
  [ ] Домен с SSL                       → DOMAIN в .env
  [ ] HTTPS обязателен — Telegram отвергнет HTTP
```

### Для MAX мессенджера

```
📋 ЧЕКЛИСТ MAX MINI APP
═══════════════════════════════════

ПРИЛОЖЕНИЕ (ОБЯЗАТЕЛЬНО):
  [ ] App ID                            → MAX_APP_ID в .env
      → Получить: dev.max.ru → создать MaxApp
  [ ] App Secret                        → MAX_APP_SECRET в .env (server-side only!)

  [ ] Mini App URL (HTTPS)              → MAX_APP_URL в .env

ИНТЕГРАЦИЯ:
  [ ] MaxSDK init signature secret      → server-side validation initData
  [ ] Manifest URL (если custom)        → HTTPS

ANALYTICS:
  [ ] AppMetrica API Key (опционально)  → APPMETRICA_API_KEY в .env
```

### Для Steam (Electron + steamworks.js)

```
📋 ЧЕКЛИСТ STEAM
═══════════════════════════════════

STEAMWORKS (ОБЯЗАТЕЛЬНО):
  [ ] Steam App ID                      → STEAM_APPID в steam_appid.txt
      → Получить: partner.steamgames.com → создать app
      → НЕ "0" — это test value
  [ ] Steam Partner Account             → нужно для submit
  [ ] Build branch (default/beta/etc)   → STEAM_BRANCH в release config

DEPOTS:
  [ ] Depot ID(s)                       → depot_build.vdf
      → Один за каждую платформу (Win/Mac/Linux)
  [ ] Content directory                 → contentRoot в app_build.vdf

УПЛОАД:
  [ ] steamcmd installed                → https://partner.steamgames.com/doc/sdk/uploading
  [ ] Steamworks login + 2FA            → для steamcmd login
  [ ] Steam Guard backup codes          → если 2FA на новой машине

CODE SIGNING (рекомендуется):
  [ ] Code signing certificate (.pfx)   → CODESIGN_CERT в .env
  [ ] Cert password                     → CODESIGN_PASS в .env
  [ ] EV cert (для лучшего SmartScreen) → опционально, дороже

ICONS:
  [ ] App icon 512x512 .ico             → src/assets/icon.ico
  [ ] Steam Library Capsule (600x900)   → store assets
  [ ] Steam Header Capsule (920x430)    → store assets

ACHIEVEMENTS / STATS (если есть):
  [ ] Achievement IDs                   → определены в Steamworks Partner
  [ ] Stat IDs                          → определены в Steamworks Partner
```

### Для VK Play (vkplay.ru, НЕ путать с VK Mini Apps!)

```
📋 ЧЕКЛИСТ VK PLAY
═══════════════════════════════════

ПРИЛОЖЕНИЕ (ОБЯЗАТЕЛЬНО):
  [ ] GMRID (Game ID)                   → VKPLAY_GMRID в .env
      → Получить: dev.vkplay.ru → создать игру
  [ ] Application Secret                → VKPLAY_SECRET в .env (server-side only!)
      → Используется для signing initData (HMAC-MD5)
  [ ] Game URL (HTTPS обязательно)      → VKPLAY_URL в .env

ИНТЕГРАЦИЯ:
  [ ] iframe-friendly URL               → должен работать в iframe (CSP relaxed)
  [ ] Auth signature server endpoint    → backend для validation /api/auth/vkplay
  [ ] Payment webhook URL               → backend для IAP /api/payments/vkplay

PAYMENTS (если используете):
  [ ] Merchant ID                       → VKPLAY_MERCHANT в .env
  [ ] Payment endpoint                  → backend
  [ ] Test mode flag                    → VKPLAY_TEST=1 для dev

ASSETS:
  [ ] Иконка 256x256                    → store
  [ ] Скриншоты (мин 3)                 → store
  [ ] Описание игры на русском          → store
```

## Step 2: Создать config.js и .env

Когда пользователь предоставит ключи, создать файлы:

```javascript
// config.js — НЕ секретные ключи (можно в git)
const CONFIG = {
  APP_NAME: '',           // заполнить
  APP_VERSION: '1.0.0',

  // Yandex Games
  YANDEX_APP_ID: '',      // спросить

  // Реклама
  AD_BANNER_ID: '',       // спросить
  AD_INTER_ID: '',        // спросить
  AD_REWARD_ID: '',       // спросить

  // Аналитика
  APPMETRICA_KEY: '',     // спросить

  // Лидерборды
  LEADERBOARD_NAME: '',   // спросить
};
```

```bash
# .env — СЕКРЕТНЫЕ ключи (НЕ в git!)
# Добавить .env в .gitignore!

KEYSTORE_PASSWORD=
KEY_ALIAS=
KEY_PASSWORD=
RUSTORE_COMPANY_ID=
RUSTORE_KEY_ID=
CLAUDE_API_KEY=
VAPID_PRIVATE=
```

## Step 3: Формат запроса у пользователя

Когда ключ отсутствует, спрашивать ТАК:

```
═══════════════════════════════════
  ⚠️ НУЖНЫ КЛЮЧИ ДЛЯ СБОРКИ
═══════════════════════════════════

Для сборки APK под RuStore мне нужны:

1. 🔑 Keystore для подписи APK
   Если уже есть → скажи путь к файлу .jks
   Если нет → я сгенерирую командой:
   keytool -genkeypair -v -keystore release.keystore \
     -alias myapp -keyalg RSA -keysize 2048 -validity 10000

2. 📊 Yandex Ads Block ID (для рекламы)
   Получить: https://partner.yandex.ru
   Приложения → Создать → Скопировать Block ID
   Мне нужны ID для: баннер, interstitial, rewarded

3. 📈 AppMetrica API Key (для аналитики)
   Получить: https://appmetrica.yandex.ru
   Добавить приложение → Скопировать API Key

Пока подготавливаешь — я продолжу работать над кодом.
Когда будут готовы — скинь сюда, я вставлю в нужные файлы.

Что есть прямо сейчас? (можно частями)
═══════════════════════════════════
```

## Step 4: Куда класть полученные ключи

Когда пользователь даёт ключи, ПОКАЗАТЬ куда положить:

```
✅ Получил ключи. Раскладываю:

📁 android/{project}.keystore
   ← Keystore файл (НЕ в git!)

📄 src/config.js → AD_BANNER_ID = "R-M-XXXXXX-Y"
📄 src/config.js → AD_INTER_ID = "R-M-XXXXXX-Z"
📄 src/config.js → APPMETRICA_KEY = "xxxxxxxx-xxxx-xxxx"

📄 .gitignore ← добавил: .env, *.keystore, SIGNING_CREDENTIALS.md
```

## Step 5: Генерация keystore (если нет)

Если у пользователя нет keystore — предложить сгенерировать:

```
Нужно создать ключ подписи. Назови:
1. Название приложения латиницей (для alias): например "multitool"
2. Название компании/студии: например "39Games"
3. Придумай пароль (минимум 6 символов): например "MyStr0ngP@ss"

Или я сгенерирую со стандартными данными и ты поменяешь потом.
```

После получения данных — выполнить:

```bash
# 1. Остановить Gradle если запущен
cd android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew --stop

# 2. Очистить старые сборки
rm -rf .gradle build app/build

# 3. Создать keystore (ОБЯЗАТЕЛЬНО PKCS12!)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore {project}.keystore -alias {project} \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass {PASSWORD} -keypass {PASSWORD} \
  -dname "CN={CompanyName}, OU=Dev, O={CompanyName}, L=Moscow, S=Moscow, C=RU"
```

## Step 6: Подготовка для RuStore Console (pepk + cert)

После создания keystore:

```bash
# 4. Экспортировать PEM-сертификат
keytool -exportcert \
  -keystore {project}.keystore \
  -alias {project} \
  -storepass {PASSWORD} \
  -rfc \
  -file upload_cert.pem

# 5. Сгенерировать pepk_out.zip (НУЖЕН pepk.jar от RuStore)
java -jar pepk.jar \
  --keystore {project}.keystore \
  --alias {project} \
  --output pepk_out.zip \
  --encryptionkey={KEY_FROM_RUSTORE_CONSOLE} \
  --include-cert \
  --keystore-pass {PASSWORD} \
  --key-pass {PASSWORD}
```

Спросить у пользователя:
```
Для генерации pepk_out.zip мне нужны:
1. pepk.jar — скачай из RuStore Console → твоё приложение → Подпись
   Положи в android/pepk.jar
2. Encryption key — скопируй там же (длинная hex-строка начинается с 0000...)
```

Если pepk.jar ещё нет, создать файл-памятку `pepk.txt`:
```
java -jar pepk.jar --keystore {project}.keystore --alias {project} --output pepk_out.zip --encryptionkey={ВСТАВИТЬ_КЛЮЧ_ИЗ_КОНСОЛИ} --include-cert --keystore-pass {PASSWORD} --key-pass {PASSWORD}
```

## Step 7: Сохранение ВСЕХ данных подписи

**ОБЯЗАТЕЛЬНО** создать файл `StoreData/SIGNING_CREDENTIALS.md`:

```markdown
# Данные подписи: {App Name}
# ⚠️ СЕКРЕТНЫЙ ФАЙЛ — НЕ коммитить в git, НЕ публиковать!

## Keystore
Файл: android/{project}.keystore
Формат: PKCS12
Alias: {project}
Пароль keystore: {PASSWORD}
Пароль ключа: {PASSWORD}
Срок действия: ~27 лет (10000 дней)

## Данные сертификата
CN: {CompanyName}
O: {CompanyName}
L: Moscow
C: RU

## RuStore Console
Encryption key: {hex-строка из консоли}
pepk.jar: android/pepk.jar

## Сгенерированные файлы
pepk_out.zip: ✅ / ❌ (ещё не создан)
upload_cert.pem: ✅ / ❌ (ещё не создан)

## Команда для пересоздания pepk
```
java -jar pepk.jar --keystore {project}.keystore --alias {project} --output pepk_out.zip --encryptionkey={KEY} --include-cert --keystore-pass {PASSWORD} --key-pass {PASSWORD}
```

## SDK ключи
AppMetrica: {key или "не получен"}
Yandex Ads Banner: {id или "не получен"}
Yandex Ads Interstitial: {id или "не получен"}
Yandex Ads Rewarded: {id или "не получен"}
MyTracker: {key или "не получен"}
```

Также создать `StoreData/SIGNING_GUIDE.md` с полной пошаговой инструкцией подписи (шаги 1-8 как выше).

**Добавить в .gitignore:**
```
*.keystore
pepk_out.zip
upload_cert.pem
pepk.jar
StoreData/SIGNING_CREDENTIALS.md
```

## Step 8: Настройка Gradle

В `android/app/build.gradle`:

```groovy
android {
    signingConfigs {
        release {
            storeFile file("../{project}.keystore")
            storePassword "{PASSWORD}"
            keyAlias "{project}"
            keyPassword "{PASSWORD}"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

## Step 9: Сборка

```bash
# Собрать debug + release APK + AAB
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" \
  ./gradlew clean assembleDebug assembleRelease bundleRelease

# Результат:
# app/build/outputs/apk/debug/app-debug.apk      ← тестирование
# app/build/outputs/apk/release/app-release.apk   ← тестирование
# app/build/outputs/bundle/release/app-release.aab ← загрузка в RuStore
```

## Итого: что загружать в RuStore Console

```
┌─────────────────────┬─────────────────────────────┐
│ Файл                │ Куда загружать              │
├─────────────────────┼─────────────────────────────┤
│ pepk_out.zip        │ Console → Подпись           │
│ upload_cert.pem     │ Console → Подпись           │
│ app-release.aab     │ Console → Релизы            │
├─────────────────────┼─────────────────────────────┤
│ Иконка 512x512      │ Console → Графика           │
│ Feature Graphic     │ Console → Графика           │
│ Скриншоты           │ Console → Графика           │
└─────────────────────┴─────────────────────────────┘
```

## Non-Negotiable Acceptance Criteria
- [ ] НИКОГДА не вставлять фейковые ключи или placeholder'ы
- [ ] ВСЕГДА спрашивать у пользователя если ключ отсутствует
- [ ] ВСЕГДА показывать ГДЕ получить ключ (ссылка + шаги)
- [ ] ВСЕГДА показывать КУДА положить ключ (путь к файлу + название поля)
- [ ] Секретные ключи → .env (НЕ в git)
- [ ] .env добавлен в .gitignore
- [ ] Keystore файлы добавлены в .gitignore
- [ ] Если ключ опциональный — сказать что можно пропустить
- [ ] Пока пользователь готовит ключи — продолжать работу над кодом
