---
tags: [rustore, payments, iap, pay-sdk, server, client, security, reusable]
---

# RuStore Payments — End-to-End Integration Manual

Универсальная инструкция по встраиванию RuStore IAP: приём, передача, серверная валидация, тестирование, безопасность, мониторинг. Реально оттестирована на Daily Insight (Capacitor PWA → Android, Pay SDK 10.2.0, BOM 2026.03.01).

Переносится между проектами без изменений — кроме SKU, имён env-переменных и app ID.

**Связанные документы:**
- [PLAYBOOK.md](PLAYBOOK.md) — общий пайплайн публикации в RuStore (§ 8–9 покрывают этот же материал на уровне шагов)
- [SKILL.md](SKILL.md) — каталог артефактов и non-negotiable чек-лист

---

## Содержание

1. [Обзор архитектуры](#1-обзор-архитектуры)
2. [Prerequisites — что должно быть готово](#2-prerequisites)
3. [Серверная часть](#3-серверная-часть)
4. [Клиентская часть — Android Capacitor](#4-клиентская-часть-android-capacitor)
5. [Клиентская часть — JS / PWA слой](#5-клиентская-часть-js--pwa-слой)
6. [Тестирование](#6-тестирование)
7. [Безопасность](#7-безопасность)
8. [Админ-панель](#8-админ-панель)
9. [Миграция со старых версий](#9-миграция-со-старых-версий)
10. [Pitfalls и workarounds](#10-pitfalls-и-workarounds)
11. [Reference — готовые файлы для копипаста](#11-reference)

---

## 1. Обзор архитектуры

```
┌─────────────────────┐       ┌────────────────────┐       ┌─────────────────────────┐
│  Android Client     │       │  Your Backend      │       │  RuStore Public API     │
│  (Capacitor + JS)   │       │  (Node.js)         │       │  public-api.rustore.ru  │
├─────────────────────┤       ├────────────────────┤       ├─────────────────────────┤
│                     │       │                    │       │                         │
│ 1. Pay SDK          │  ──►  │ 2. POST /shop/     │       │                         │
│    .purchase()      │       │    purchase        │       │                         │
│    returns          │       │    {productId,     │       │                         │
│    {invoiceId}      │       │     invoiceId}     │       │                         │
│                     │       │                    │       │                         │
│                     │       │ 3. Generate JWE    │  ──►  │ 4. /public/auth/        │
│                     │       │    sign keyId+     │       │    returns JWE token    │
│                     │       │    timestamp       │  ◄──  │    (TTL 900s)           │
│                     │       │                    │       │                         │
│                     │       │ 5. GET /public/v2/ │  ──►  │ 6. Return receipt:      │
│                     │       │    purchase/       │       │    {invoiceStatus,      │
│                     │       │    {invoiceId}     │  ◄──  │     productId, appId,   │
│                     │       │    Public-Token:   │       │     amount, ...}        │
│                     │       │    <JWE>           │       │                         │
│                     │       │                    │       │                         │
│ 7. 200 OK           │  ◄──  │ 8. Validate:       │       │                         │
│    +N stars         │       │    status=paid?   │       │                         │
│                     │       │    productId match?│       │                         │
│ 9. confirm consumable       │    appId match?    │       │                         │
│    in Pay SDK       │       │    → credit user   │       │                         │
│                     │       │                    │       │                         │
└─────────────────────┘       └────────────────────┘       └─────────────────────────┘
          ↑
          │
  On launch: recoverPendingPurchases()
  Scan Pay SDK for PAID-not-confirmed purchases,
  re-submit to server, retry until credited.
          ↑
          │
  Server cron every 10 min:
  Scan purchases WHERE state='pending',
  re-query RuStore, promote to paid/failed.
```

**Ключевые инварианты:**
- Клиент **никогда не может кредитовать звёзды сам** — баланс хранится на сервере, все суммы прошиваются в `shop.js` catalog.
- Сервер **доверяет только RuStore Public API**, не receipt-у от клиента.
- **Идемпотентность** по `invoiceId` — реплей возвращает 409, никаких двойных зачислений.
- **Pending-обработка** — если RuStore не успел закрыть инвойс, запись в БД со статусом `pending`, звёзды докомитит cron.

---

## 2. Prerequisites

### 2.1 RuStore Console

- [ ] Приложение создано как черновик, получен `APPLICATION_ID` (числовой, 10 цифр)
- [ ] IAP-продукты созданы: `productId`, `название`, `описание`, `цена в рублях`
- [ ] API-ключ создан в **Компания → API RuStore → Создать ключ** (требует роль `Администратор` или `Владелец`)
  - **Методы приложений:** `Подтверждение покупки`, `Получение списка покупок по идентификатору`
  - **Общие методы:** `Получение данных платежа по идентификатору (v2)`
  - Скачан приватный RSA-ключ (PEM, показывается один раз)
  - Записан `Key ID` (числовой UUID из списка ключей)
  - Записан `Company ID` (числовой, из URL `/companies/NNN/` или профиля компании)
- [ ] В приложении добавлены **тестировщики** (email RuStore-аккаунта) для sandbox-платежей

### 2.2 Android-проект

- [ ] Capacitor v5+ (для Pay SDK 10.x требуется compileSdk ≥ 34)
- [ ] Android Studio JBR (JDK 17+) для Gradle builds
- [ ] Release keystore создан и забекаплен — подпись не меняется между версиями

### 2.3 Серверная инфраструктура

- [ ] Node.js 18+ (нужен нативный `fetch`, `crypto.createPrivateKey`)
- [ ] HTTPS (RuStore может отклонить HTTP)
- [ ] IPv4 (RuStore API может не резолвить через IPv6)
- [ ] БД с поддержкой индексов по `purchases.state` и `purchases.user_id`

---

## 3. Серверная часть

### 3.1 Env-переменные

```bash
# Required
RUSTORE_COMPANY_ID=2351511388
RUSTORE_KEY_ID=2351028008
RUSTORE_APPLICATION_ID=2063706204
RUSTORE_API_PRIVATE_KEY_PATH=/opt/<app>/rustore-api.pem

# Optional
RUSTORE_SANDBOX=0    # 1 for QA servers hitting sandbox endpoint; prod must be 0
```

PEM хранится **вне git** (`chmod 600`, `.gitignore`-запись на `*.pem`). Формат — PKCS8:
```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADAN...
-----END PRIVATE KEY-----
```

Если RuStore отдаёт только raw base64 без PEM-header — обернуть:
```bash
(echo '-----BEGIN PRIVATE KEY-----'; fold -w 64 raw.txt; echo '-----END PRIVATE KEY-----') > key.pem
```

### 3.2 JWE-генерация (`server/services/rustore-auth.js`)

Контракт `/public/auth/` (критичные детали):
- **Поле `keyId`** (не `companyId` — deprecated после 2024-07-30), **строка** в JSON
- **`timestamp`** — ISO-8601 с миллисекундами и **явным offset** (`+00:00`, не `Z`)
- **Подпись** — `Base64(RSA-SHA512(keyId + timestamp))`, PKCS#1 v1.5, **конкатенация без разделителя**
- **TTL JWE** — 900 сек, **кэшировать на ~890 сек**, не генерить на каждый запрос

Полный рабочий код модуля — в [Reference § 11.1](#111-rustore-authjs).

### 3.3 Валидация receipts (`/api/shop/purchase`)

**Правильный контракт для Pay SDK 10.2 / BOM 2026.03.01:**
- Endpoint: `GET /public/v2/purchase/{invoiceId}` (sandbox: `/public/sandbox/v2/...`)
- Header: **`Public-Token: <JWE>`** (НЕ `Authorization: API-key ...` — RuStore отвечает 401 "Token is empty")
- Response: `{code:"OK", body:{invoiceId, invoiceStatus, appId, ownerCode, paymentInfo, order:{productId, amount, ...}}}`
- `invoiceStatus` — **lowercase** (`paid`, `confirmed`, `cancelled`, `refunded`, `invoice_created`, `processing`, ...)
- `appId` — **числовой** (не Android package name!)

**Классификация состояний → purchase.state:**

| RuStore `invoiceStatus` | state в БД | HTTP | credit? |
|---|---|---|---|
| `paid`, `confirmed` | `paid` | 200 | ✅ |
| `invoice_created`, `processing`, `pending` | `pending` | **202** | ❌ (cron) |
| `cancelled`, `failed` | `failed` | 402 | ❌ |
| `refunded` | `refunded` | 410 | ❌ |
| HTTP 5xx / 404 / timeout | `pending` | **202** | ❌ (cron) |
| `productId` mismatch (forged) | `failed` | 403 | ❌ |
| `appId` mismatch | `failed` | 403 | ❌ |

Полный код — в [Reference § 11.2](#112-shopjs-purchase-handler).

### 3.4 Pending-retry cron (`server/services/pending-purchase-retry.js`)

Зачем: RuStore иногда держит инвойс в `processing` от секунд до часа. Без cron юзер остаётся без звёзд до следующего запуска приложения.

**Алгоритм:**
- Каждые 10 мин (`RETRY_INTERVAL_MS`) сканировать `WHERE state='pending' AND created_at > 48h ago AND last_checked_at < now()-5min`
- Re-query RuStore:
  - `paid`/`confirmed` → UPDATE state=`paid`, validated=1, credit stars (atomic via `WHERE state='pending'`)
  - `refunded` → UPDATE state=`refunded` (no credit)
  - `cancelled`/`failed` → UPDATE state=`failed`
  - Still pending → UPDATE last_checked_at (разреживает повторные запросы)
- После 48 часов → UPDATE state=`failed` + лог `purchase_pending_expired` в security_events

**Запускается из `server.js`:**
```js
require('./server/services/pending-purchase-retry').start();
```

Полный код — в [Reference § 11.3](#113-pending-retry-cron).

### 3.5 Схема БД

```sql
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'credit',     -- credit | debit
  source TEXT DEFAULT 'rustore',           -- rustore | admin | system
  receipt_token TEXT,                      -- invoiceId (keep column name for back-compat)
  validated INTEGER DEFAULT 0,             -- 1 if RuStore confirmed
  state TEXT DEFAULT 'paid',               -- pending | paid | failed | refunded
  last_checked_at TEXT,                    -- used by pending-retry cron
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_purchases_state ON purchases(state);
CREATE INDEX idx_purchases_user  ON purchases(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium', -- critical | high | medium | low
  ip TEXT,
  user_agent TEXT,
  details TEXT,                            -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_security_events_created  ON security_events(created_at DESC);
CREATE INDEX idx_security_events_severity ON security_events(severity);
```

### 3.6 Admin endpoints

```
GET  /api/admin/shop/transactions
     ?limit=200&state=all|paid|pending|failed|refunded
     &source=all|rustore|admin|system
     &type=all|credit|debit
     &user_id=<id>
     &search=<invoice-substring>

GET  /api/admin/shop/stats
     → { totalStarsInCirculation, usersWithStars, totalPurchases, purchasesLast7d }

POST /api/admin/shop/recheck-pending
     → Runs pending-retry sweep now, returns { checked, paid, failed, stillPending }

GET  /api/admin/security
     ?limit=300&severity=all|critical|high|medium|low&since=<iso>
     → { events, counts: {critical,high,medium,low}, since }
```

---

## 4. Клиентская часть — Android Capacitor

### 4.1 Gradle dependencies

`android/build.gradle` (project-level):
```gradle
allprojects {
    repositories {
        google()
        mavenCentral()
        // RuStore официальный публичный артефакторий. Эмпти browse-листинг в
        // браузере — это норма для virtual repos (Gradle ходит по прямым
        // путям POM-файлов, не по HTML-индексу).
        //   Docs: https://www.rustore.ru/help/sdk/pay/kotlin-java
        maven { url 'https://artifactory-external.vkpartner.ru/artifactory/maven-rustore-exposed/' }
        // Offline fallback если артефакторий недоступен (геоблок, сбой CDN,
        // корп-VPN режет трафик). См. § 10.1 и pitfall про Happ bypass.
        // maven { url uri("$rootDir/../rustore-offline-repo") }
    }
}
```

**Smoke-test что онлайн работает** с твоей сети:
```bash
curl -I https://artifactory-external.vkpartner.ru/artifactory/maven-rustore-exposed/ru/rustore/sdk/bom/2026.04.01/bom-2026.04.01.pom
# Должно вернуть HTTP/2 200 + Content-Type
```

Если TCP timeout / 404 на конкретных POM-путях — артефакторий либо временно сбоит, либо геоблокирован для твоей сети (Happ TUN или РФ-VPN часто помогает). В этом случае — fallback на `rustore-offline-repo/` из `pay-sdk-bundle.zip`.

**Как получить bundle для offline-режима:**
1. На машине где онлайн работает — выполнить Gradle sync, затем упаковать `~/.gradle/caches/modules-2/files-2.1/ru.rustore.sdk/` в Maven-layout структуру
2. Или скопировать из проекта где уже есть (например, `daily-insight/StoreData/pay-sdk-bundle.zip`)

`android/app/build.gradle`:
```gradle
defaultConfig {
    manifestPlaceholders = [
        RUSTORE_CONSOLE_APPLICATION_ID: "<numeric APP_ID>",  // from Console
        RUSTORE_PAY_SCHEME: "<app>pay"                        // any unique scheme tied to applicationId
    ]
}
dependencies {
    implementation platform('ru.rustore.sdk:bom:2026.03.01')
    implementation 'ru.rustore.sdk:pay'
    // implementation 'ru.rustore.sdk:review'  // optional
}
```

### 4.2 AndroidManifest meta-data + intent-filter

Внутри `<application>`:
```xml
<meta-data android:name="console_app_id_value"  android:value="${RUSTORE_CONSOLE_APPLICATION_ID}" />
<meta-data android:name="sdk_pay_scheme_value"  android:value="${RUSTORE_PAY_SCHEME}" />
```

Внутри `<activity android:name=".MainActivity">` (для возврата из банковского приложения):
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="${RUSTORE_PAY_SCHEME}" />
</intent-filter>
```

### 4.3 Capacitor Plugin (JavaScript Bridge)

Класс `RuStoreBillingPlugin` — наследник `com.getcapacitor.Plugin`. Экспонирует 5 методов:
- `checkPurchasesAvailability()` → `{available, reason?}`
- `getProducts({productIds})` → `{products:[{productId, title, description, priceLabel, price, currency}]}`
- `purchase({productId})` → `{success, invoiceId, purchaseId}` или `{success:false, status:"CANCELLED"}`
- `getPurchases()` → `{purchases:[{purchaseId, invoiceId, productId, status}]}`
- `confirmPurchase({purchaseId})` → `{confirmed:true}` (для TWO_STEP покупок)

**Критичные нюансы BOM 2026.03.01:**
- Импорты из **flat `ru.rustore.sdk.pay.model.*`** (не `.product.*` или `.purchase.*`)
- `SdkTheme` из `.pay.model`, не `.core.config`
- `RuStorePayClient.Companion.getInstance()` (Kotlin companion, Java-доступ через `.Companion`)
- `ProductPurchaseParams` — **6-арг** конструктор
- `.purchase(params, PreferredPurchaseType, SdkTheme, PurchaseEventListener)` — **4 аргумента** (последний null)
- `.getPurchases(ProductType, PurchaseStatus)` — **2 аргумента** (null, null для всех)
- Все Product-поля (`title`, `price`, `currency`, `amountLabel`) — **wrapper-типы**, `.getValue()`
- `RuStorePaymentException.ProductPurchaseCancelled` — nested sealed type

Полный код — в [Reference § 11.4](#114-rustorebillingpluginjava).

### 4.4 Регистрация в MainActivity

```java
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RuStoreBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

`proceedIntent` для возврата из банковского app выполняется в `Plugin.handleOnNewIntent` — не нужно трогать `MainActivity.onNewIntent` отдельно.

---

## 5. Клиентская часть — JS / PWA слой

### 5.1 Wrapper над Capacitor plugin (`public/js/rustore-billing.js`)

```js
const Native = window.Capacitor?.Plugins?.RuStoreBilling;

window.RuStoreBilling = {
  async isAvailable() {
    if (!Native) return { available: false, reason: 'not_capacitor' };
    return Native.checkPurchasesAvailability();
  },
  async getProducts(productIds) {
    if (!Native) return { products: [] };
    return Native.getProducts({ productIds });
  },
  async purchase(productId) {
    if (!Native) return { success: false, reason: 'not_available' };
    return Native.purchase({ productId });
  },
  async getPurchases() {
    if (!Native) return { purchases: [] };
    return Native.getPurchases();
  },
  async confirmPurchase(purchaseId) {
    if (!Native) return { confirmed: false };
    return Native.confirmPurchase({ purchaseId });
  }
};
```

### 5.2 Purchase flow (`public/js/utils.js → purchaseStars()`)

```js
async function purchaseStars(productId) {
  const product = _shopProducts.find(p => p.id === productId);
  if (!product) return;

  const avail = await window.RuStoreBilling.isAvailable();
  if (!avail.available) {
    toast('Магазин', avail.reason === 'not_capacitor'
      ? 'Покупки доступны только в Android-версии из RuStore'
      : 'RuStore недоступен: ' + avail.reason, 'error');
    return;
  }

  const result = await window.RuStoreBilling.purchase(productId);
  if (!result.success) {
    if (result.status !== 'CANCELLED') {
      toast('', 'Покупка не удалась: ' + (result.reason || 'unknown'), 'error');
    }
    return;
  }

  try {
    const serverRes = await API.purchaseStars(productId, result.invoiceId);

    // Pending: RuStore hasn't finalised yet. Server logged it, retry cron
    // will credit stars. Keep SDK state (no confirm) so next launch also retries.
    if (serverRes && serverRes.pending) {
      closeModal();
      toast('Платёж обрабатывается',
            serverRes.message || 'Звёзды появятся автоматически в течение часа.',
            'info');
      return;
    }

    points = serverRes.balance;
    _updatePointsUI();
    if (result.purchaseId) await window.RuStoreBilling.confirmPurchase(result.purchaseId);
    closeModal();
    celebrate('✦', '+' + product.stars + ' звёзд!', product.label);
  } catch (e) {
    toast('', 'Сервер отклонил чек: ' + e.message + '. Средства будут возвращены.', 'error');
  }
}
```

### 5.3 Recovery on startup

В app init — вызов после рендера UI:
```js
if (typeof recoverPendingPurchases === 'function') {
  recoverPendingPurchases();
}
```

Логика:
```js
async function recoverPendingPurchases() {
  if (!window.RuStoreBilling) return;
  const { purchases } = await window.RuStoreBilling.getPurchases();
  if (!purchases?.length) return;

  for (const p of purchases) {
    if (p.status !== 'PAID' && p.status !== 'PAID_CONFIRM_REQUIRED') continue;
    try {
      const serverRes = await API.purchaseStars(p.productId, p.invoiceId);
      // Pending: keep SDK state, try again next launch + server cron.
      if (serverRes?.pending) continue;
      await window.RuStoreBilling.confirmPurchase(p.purchaseId);
    } catch (e) {
      console.warn('[rustore] recovery failed for', p.purchaseId, e.message);
    }
  }
  syncBalance();
}
```

---

## 6. Тестирование

### 6.1 Sandbox endpoint vs prod endpoint

Единый API-ключ работает для обоих окружений. Различие только в URL:
- Prod: `/public/v2/purchase/{invoiceId}`
- Sandbox: `/public/sandbox/v2/purchase/{invoiceId}`

**Политика:** на проде `RUSTORE_SANDBOX=0`. Тестировщики, добавленные в Консоли → карточка → «Тестировщики» — автоматически получают sandbox-флаг в RuStore, но **prod endpoint их purchase'ы тоже валидирует** (RuStore сам разруливает). Поэтому обычно переключать endpoint не нужно — только для QA-stand'а с изолированным бэкендом.

### 6.2 Как добавить тестировщика

Консоль → Карточка приложения → **Тестировщики** → добавить **email RuStore-аккаунта**. Этот email при покупке через Pay SDK увидит «тестовую карту» с кнопками «Успех/Отказ» — никаких реальных списаний.

### 6.3 Smoke-тест сервера

```bash
cd /opt/<app>
set -a && . ./.env && set +a
node -e 'require("./server/services/rustore-auth").getPublicToken()
  .then(j => console.log("JWE:", j.length, "chars,", j.split(".").length, "segs"))
  .catch(e => console.error("FAIL:", e.message))'
```

Ожидается: `JWE: 589 chars, 5 segs`. Header декодируется в `{"enc":"A256GCM","alg":"RSA-OAEP-256"}`.

### 6.4 End-to-end тест покупки

1. Установить release AAB на устройство (через RuStore тест-канал или `adb install` из signed APK)
2. Логин тестировочным RuStore-аккаунтом
3. Купить `stars_100` — должно списать 0 ₽ / тестовые рубли
4. Проверить:
   - Pay SDK вернул `invoiceId` + `status="PAID"`
   - Сервер ответил 200, `validated=1`
   - В БД `purchases.state='paid'`
   - Звёзды добавлены в `users.stars`
5. Проверить идемпотентность: второй POST с тем же `invoiceId` → 409
6. Проверить recovery: убить app между оплатой и confirm → перезапустить → звёзды автодокредитятся

### 6.5 Симуляция атак (через curl с VPS)

Минт JWT для user#1:
```bash
cd /opt/<app>
node -e "console.log(require('jsonwebtoken').sign({userId:1}, require('./server/config').jwtSecret, {expiresIn:'10m'}))"
```

Тесты (подставить токен):
```bash
TOK=<jwt>
# 1. Unknown product (low)
curl -X POST http://127.0.0.1:<port>/api/shop/purchase \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"productId":"fake_sku","invoiceId":"test_1"}'

# 2. Rate limit (medium) — 15 rapid requests
for i in {1..15}; do
  curl -X POST http://127.0.0.1:<port>/api/shop/purchase \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
    -d "{\"productId\":\"stars_100\",\"invoiceId\":\"brute_$i\"}" -w '%{http_code} '
done
```

Ожидается: `429` после 10-й попытки, события в security_events с severity=medium.

---

## 6a. Cloud-sync starter bonus (retention hook, если применим)

Если в экономике проекта есть «внутренние звёзды / XP / валюта», можно прицепить **+N единиц при первой настройке cloud sync**. Подобный паттерн — retention-nudge + защита от reinstall-фарминга.

**Схема:**
- Стартовый баланс нового юзера — **небольшой** (например 100)
- Первый успешный upload с новой `phraseHash` → **+400** (идемпотентно: вторая установка с той же фразой бонус не получит)

**Таблица `cloud_starter_grants(phrase_hash PRIMARY KEY, user_id, ip, granted_at)`** — идемпотентный ledger.

**2 гейта от фарма:**
1. **Phrase idempotency** — ту же фразу нельзя переиспользовать для бонуса
2. **IP cooldown 30 дней** — с одного IP (хеш) бонус не чаще раза в месяц

Третий гейт (минимальный размер data) пробовал — **бесполезен**: фармер делает export → wipe → import, datasize будет проходить. Убрал.

**Реализация** — см. `reference/sync.js` (внутри `/upload` handler).

**Критично для шифрованных бэкапов:** client-side encryption никак не мешает — сервер проверяет `phrase_hash` (открытый) и `dataSize` (открытый). Содержимое расшифровки ему не нужно.

**Explicit stars на INSERT в `auth.js`:**
```js
// SQLite `ALTER TABLE ADD COLUMN DEFAULT` применяется ТОЛЬКО при создании
// колонки; миграция на существующей БД не меняет DEFAULT. Надёжнее прописать
// стартовый баланс явно в INSERT.
run('INSERT INTO users (device_token, display_name, stars) VALUES (?, ?, ?)',
    [deviceToken, displayName || '', 100]);
```

См. `reference/auth.js` целиком.

---

## 6b. 152-ФЗ: псевдонимизация IP

IP-адрес в РФ — **персональные данные** (ст. 3 152-ФЗ), если комбинируется с другими идентификаторами (user_id, phrase_hash, etc.). Хранить raw IP в `security_events` или `cloud_starter_grants` — прямое нарушение.

**Решение:** HMAC-SHA256 с pepper из `JWT_SECRET`, truncate до 16 hex-символов. Результат:
- Необратим (атакующий с дампом БД не восстановит IP)
- Стабилен (same IP → same hash, работает для rate-limit/cooldown)
- Короткий (умещается в TEXT колонке без bloat)

**Модуль** — `reference/ip-hash.js`:
```js
const { hashIp, ipTag, extractIp } = require('./services/ip-hash');
// В БД:
run('INSERT INTO table (ip) VALUES (?)', [hashIp(req)]);
// В логах:
console.log('[sec] user=#' + userId + ' ip#=' + ipTag(req));
```

**Привacy policy должна отразить это:**
```
IP-адрес (при хранении — необратимо псевдонимизируется через
HMAC-SHA256; оригинальный адрес после псевдонимизации не восстановим)
```

**rate_limits таблица** (scope='ip') — хранит хеш ИЛИ авто-истекает за час (персонал-данные не хранятся дольше необходимого по ст. 5.4).

---

## 7. Безопасность

### 7.1 Threat model

| Атака | Наша защита |
|---|---|
| Клиент кредитует звёзды напрямую | Клиент НЕ имеет эндпоинта на изменение баланса — только `POST /purchase` с receipt |
| Подделка receipt (fake invoiceId) | GET `/public/v2/purchase/` вернёт 404, мы пишем failed + low |
| Реплей receipt (same user) | Идемпотентность по receipt_token, 409. Low severity |
| Реплей receipt (cross user) | Тот же 409, но с high severity в security_events |
| Подмена productId (pay 529, claim 6990) | Сверка `receipt.order.productId === client.productId`, 403 + critical |
| Подмена appId (receipt от другого приложения) | Сверка `receipt.appId === RUSTORE_APPLICATION_ID`, 403 + critical |
| Брутфорс invoiceId | Rate-limit 10 req/min per user, 429 + medium |
| Компрометация приватного ключа | Приватный ключ вне git, chmod 600, не логировать |
| MITM на /purchase | HTTPS-only (nginx), TLS 1.2+ |
| MITM между нашим бэкендом и RuStore | HTTPS-only, сертификат RuStore pinned в Node TLS |

### 7.2 Security events

7 типов, которые логирует `server/routes/shop.js`:

| event_type | severity | Когда |
|---|---|---|
| `purchase_product_mismatch` | **critical** | Client productId ≠ RuStore receipt productId |
| `purchase_app_mismatch` | **critical** | Receipt от другого приложения |
| `purchase_replay_cross_user` | **high** | User #A использует invoiceId от #B |
| `purchase_pending_expired` | medium | 48 часов в pending, помечаем failed |
| `purchase_rate_limit` | medium | >10 попыток в минуту с одного user |
| `purchase_not_paid` | medium | Статус cancelled/failed/refunded |
| `purchase_unknown_product` | low | productId не в каталоге |
| `purchase_replay_same_user` | low | Тот же юзер, тот же invoice (сетевой ретрай) |
| `purchase_rustore_api_error` | low | RuStore 5xx/timeout (инфра) |

Логирование через helper (`server/services/security-log.js`):
```js
securityLog.log(req, {
  type: 'purchase_product_mismatch',
  severity: 'critical',
  details: { clientProductId, receiptProductId, invoiceId }
});
```

### 7.3 Rate-limit per user

В shop.js:
```js
const _purchaseAttempts = new Map();
const PURCHASE_WINDOW_MS = 60 * 1000;
const PURCHASE_MAX_PER_WINDOW = 10;

function checkPurchaseRateLimit(userId) {
  const now = Date.now();
  const cutoff = now - PURCHASE_WINDOW_MS;
  const history = (_purchaseAttempts.get(userId) || []).filter(t => t > cutoff);
  history.push(now);
  _purchaseAttempts.set(userId, history);
  return history.length <= PURCHASE_MAX_PER_WINDOW;
}
```

In-memory хранилище — не переживает PM2-рестарт, и это **ок** (атакующий не получает преимущества от рестарта).

---

## 8. Админ-панель

### 8.1 Вкладка «💰 Магазин»

- 4 stat-card'а вверху: **Звёзд в обороте / Покупок всего / Покупок 7 дн / Юзеров с балансом**
- Second row: **Paid / Pending / Failed / Refunded** с цветными рамками
- Фильтр-кнопки: Все / Paid / Pending / Failed / Refunded
- Поиск по invoice substring (для саппорта)
- Кнопка **«🔄 Перепроверить pending»** → триггерит sweep вручную, alert с summary
- Таблица: ID, юзер, товар, звёзды, источник, state-бейдж, invoice, дата

### 8.2 Вкладка «🛡️ Безопасность»

- Красный бейдж на заголовке вкладки = число critical+high за 7 дней (auto-refresh 30s)
- 4 счётчика по severity
- Фильтр-кнопки: Все / Critical / High / Medium / Low
- Таблица: время, severity-бейдж, тип события, юзер, IP, JSON-детали

### 8.3 UI-pattern

Все fetch'ы в admin.js используют **`ADMIN_BASE` prefix** (`window.location.pathname.replace(/\/[^/]*$/, '')`) — без этого endpoint 404'ит под под-путями типа `/daily-insight/`.

Токен в localStorage под ключом `ADMIN_TOKEN_KEY` (в коде объявлен в начале `admin.js`) — не читать строкой `'admin_token'` в другом месте.

---

## 9. Миграция со старых версий

### 9.1 С deprecated `ru.rustore.sdk:billingclient`

- **BillingClient < 3.0** — удалён. Не использовать.
- **BillingClient 3.x** — работает, но deprecated. Мигрировать на Pay SDK 10.x.
- Pay SDK API совершенно другой (Interactor-pattern vs callback), полный rewrite плагина.

### 9.2 С BOM 2025.11.01 → 2026.03.01

Структура пакетов плоская. Миграция импортов:
```
ru.rustore.sdk.pay.model.product.*   → ru.rustore.sdk.pay.model.*
ru.rustore.sdk.pay.model.purchase.*  → ru.rustore.sdk.pay.model.*
ru.rustore.sdk.core.config.SdkTheme  → ru.rustore.sdk.pay.model.SdkTheme
ru.rustore.sdk.pay.exception.*       → ru.rustore.sdk.pay.model.RuStorePaymentException.*
```

Изменения сигнатур: см. § 4.3 выше.

### 9.3 С Public-Token как статичного ключа

**Было** (неработающее):
```js
// env: RUSTORE_PUBLIC_KEY=<long string from console>
headers: { 'Public-Token': config.rustorePublicKey }
```

**Стало** (правильное):
```js
// env: RUSTORE_COMPANY_ID + RUSTORE_KEY_ID + RUSTORE_API_PRIVATE_KEY_PATH
const jwe = await rustoreAuth.getPublicToken();  // signs+fetches new JWE
headers: { 'Public-Token': jwe }  // header name unchanged; value is JWE now
```

Причина: `Public-Token` — это короткоживущий JWE (900 сек), а не долгоживущий ключ. В документации RuStore это раньше было плохо объяснено.

### 9.4 С endpoint v1 на v2

- v1 (`/public/purchase/{id}`) — **deprecated**, API-ключи с правом «v2» дают 403 на v1
- v2 (`/public/v2/purchase/{invoiceId}`) — текущий

Тело ответа v1 и v2 разное — нельзя просто поменять URL, нужно обновить парсинг полей:
- v1: `purchaseState`, `productId` (на верхнем уровне)
- v2: `invoiceStatus` (lowercase), `appId`, `order.productId`

---

## 10. Pitfalls и workarounds

### 10.1 RuStore Artifactory лежит

`artifactory-external.vkpartner.ru` периодически недоступен — blocker для сборки. **Workaround:** локальный Maven-mirror. Скачать один раз через мобильный интернет / VPS где доступен → положить рядом с `android/` → добавить в `build.gradle`:
```gradle
maven { url uri("$rootDir/../rustore-offline-repo") }
```
Скрипт упаковки bundle'а — см. PLAYBOOK § 10.

### 10.2 pepk.jar требует Java 11+

JDK 8 даёт `UnsupportedClassVersionError`. Использовать JBR из Android Studio.

pepk **не** принимает пароли через stdin (`System.console()` null при pipe). Передавать через `--keystore-pass` / `--key-pass`.

### 10.3 Android icon адаптивная маска

Капацитор создаёт `res/values/ic_launcher_background.xml` с `#FFFFFF` → при круговой маске лаунчера видны **белые края** вокруг иконки. **Фикс:** поставить в брендовый цвет (`#1a0533` для тёмной темы), foreground с safe=0.85 (не 0.60 — слишком жёстко).

### 10.4 Тестовая покупка возвращает `RuStore /purchase 401 "Token is empty"`

Неверный заголовок: используется `Authorization: API-key` вместо `Public-Token`. Документация в разных местах противоречит себе — **истина:** `Public-Token: <JWE>` для v2, `Authorization` не работает.

### 10.5 v1 endpoint возвращает 403 `"does not have rights"`

Ключ создан только с правом «Получение данных платежа по идентификатору **(v2)**». Использовать `/public/v2/purchase/`, не `/public/purchase/`.

### 10.6 Роль «Администратор приложений» не даёт создать API-ключ

Нужна роль **«Администратор»** или **«Владелец»** на уровне компании (не на уровне приложения). Путь добавления — PLAYBOOK § 8.

### 10.7 Capacitor admin.js запросы 404'ят под под-путём

`fetch('/api/admin/...')` без `ADMIN_BASE` ломается при хостинге под `/daily-insight/`. Всегда `ADMIN_BASE + '/api/admin/...'`.

### 10.8 `const Sync = {...}` в верхнем скрипте не попадает в onclick scope

Если onclick-handler в HTML ссылается на `Sync.showRestore()` — оно работает через global scope lookup, но **только если** `<script src="sync.js">` загружен ДО элемента. Проверять порядок `<script>` тегов.

### 10.9 Onboarding overlay перекрывает модальные окна

`.onboard-overlay` z-index 500, `.modal-overlay` z-index 100 по дефолту. Модал открывается, но не виден. **Фикс:** `.modal-overlay` z-index 700+.

---

## 11. Reference

Все файлы ниже — готовые к копи-пасту. Подставить **имена env-переменных, package name, SKU** под свой проект.

### 11.1 `rustore-auth.js`

Путь: `server/services/rustore-auth.js`

Полный код см. файл в этой директории — `./reference/rustore-auth.js`.

Ключевые моменты:
- `loadPrivateKey()` — cache'ит `crypto.KeyObject` между вызовами
- `nowIsoWithOffset()` — ISO-8601 с milliseconds и явным offset (не Z!)
- `signAuthPayload(keyId, timestamp)` — SHA512withRSA над `keyId + timestamp`, Base64
- `requestNewToken()` — POST `/public/auth/` body `{keyId, timestamp, signature}`
- `getPublicToken()` — возвращает cached JWE или минтит новый
- `resetTokenCache()` — для 401-retry

### 11.2 `shop.js` purchase handler

Путь: `server/routes/shop.js`

Полный код см. `./reference/shop.js`.

Структура:
- `validateRuStoreReceipt(invoiceId)` — GET v2/purchase с Public-Token + 401-retry
- `checkPurchaseRateLimit(userId)` — in-memory sliding window
- Classification logic: `paid`/`pending`/`failed`/`refunded` → HTTP 200/202/402/410
- Fraud checks: `productId`/`appId` mismatch перед state check (не держать forged в pending)

### 11.3 Pending-retry cron

Путь: `server/services/pending-purchase-retry.js`

Полный код см. `./reference/pending-purchase-retry.js`.

Параметры по умолчанию:
- `RETRY_INTERVAL_MS = 10 * 60 * 1000` (10 мин)
- `MIN_SPACING_MS = 5 * 60 * 1000` (не чаще 5 мин на одну запись)
- `GIVE_UP_AFTER_HOURS = 48` (после — state='failed', лог)

### 11.4 `RuStoreBillingPlugin.java`

Путь: `android/app/src/main/java/<pkg>/RuStoreBillingPlugin.java`

Полный код см. `./reference/RuStoreBillingPlugin.java`.

Для миграции на свой проект:
- Заменить `package com.rodrik.dailyinsight;` на свой
- SDK импорты не трогать (правильны для BOM 2026.03.01)
- Plugin name `"RuStoreBilling"` — оставить или переименовать синхронно с JS wrapper'ом

### 11.5 `security-log.js`

Путь: `server/services/security-log.js`

Полный код см. `./reference/security-log.js`.

Helper для логирования — одно выражение `securityLog.log(req, {type, severity, details})`, всё остальное (IP, user-agent, userId) достаётся из `req`.

### 11.6 Admin endpoints

Путь: `server/routes/admin.js` — два endpoint'а:

```js
router.get('/shop/transactions', (req, res) => { /* с фильтрами */ });
router.post('/shop/recheck-pending', async (req, res) => { /* manual sweep */ });
router.get('/security', (req, res) => { /* security events */ });
```

Полный код см. `./reference/admin-endpoints.js`.

### 11.7 Admin UI

Путь: `public/admin.html` + `public/js/admin.js` — вкладки Shop и Security.

Полный код см. `./reference/admin-ui.html` + `./reference/admin-ui.js`.

---

## Перенос на новый проект — минимальный чек-лист

- [ ] Скопировать `reference/` в свой проект, подставить package name и env имена
- [ ] Создать таблицы `purchases` + `security_events` из § 3.5
- [ ] Добавить `rustore-offline-repo/` и обновить `build.gradle`
- [ ] Положить PEM в `/opt/<app>/rustore-api.pem`, `chmod 600`
- [ ] Заполнить .env: `RUSTORE_COMPANY_ID`, `RUSTORE_KEY_ID`, `RUSTORE_APPLICATION_ID`, `RUSTORE_API_PRIVATE_KEY_PATH`
- [ ] В `server.js` добавить `require('./server/services/pending-purchase-retry').start()`
- [ ] Зарегистрировать plugin в `MainActivity`: `registerPlugin(RuStoreBillingPlugin.class)`
- [ ] Подставить свои SKU в клиентский `purchaseStars(productId)` и в серверный `PRODUCTS` массив
- [ ] Smoke-test JWE: `node -e 'require("./server/services/rustore-auth").getPublicToken().then(j=>console.log(j.length))'`
- [ ] Добавить тестировщика в Консоль, провести end-to-end покупку

Удачи.
