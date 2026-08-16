# Reference Code — RuStore Payments

Готовые файлы для копи-пасты в новый проект. См. `../PAYMENTS.md` для полной инструкции.

## Структура

```
reference/
├── README.md                        ← ты здесь
├── schema.sql                       ← SQL: purchases + security_events + cloud_starter_grants
│
├── ip-hash.js                       ← SERVER: HMAC-SHA256 псевдонимизация IP (152-ФЗ)
├── security-log.js                  ← SERVER: helper для security_events (использует ip-hash)
├── rustore-auth.js                  ← SERVER: JWE-генерация через /public/auth/
├── shop.js                          ← SERVER: purchase endpoint + валидация + rate-limit
├── pending-purchase-retry.js        ← SERVER: cron-ретрай pending-покупок (10 мин)
├── auth.js                          ← SERVER: /register с explicit stars=100 на INSERT
├── sync.js                          ← SERVER: /upload с +400 starter bonus + 2 anti-farm gates
│
├── RuStoreBillingPlugin.java        ← ANDROID: Pay SDK plugin (BOM 2026.03.01)
├── RuStoreReviewPlugin.java         ← ANDROID: Review SDK plugin (rate-in-app dialog)
│
└── client-rustore-billing.js        ← CLIENT JS: обёртка над Capacitor.Plugins.RuStoreBilling
```

## Подстановки под свой проект

| Где | Что заменить |
|---|---|
| `schema.sql` | Ничего, идёт как есть (users таблица должна быть в проекте). |
| `rustore-auth.js` | Имена env-переменных если твой проект их называет иначе (по умолчанию `RUSTORE_COMPANY_ID`, `RUSTORE_KEY_ID`, `RUSTORE_API_PRIVATE_KEY_PATH`, `RUSTORE_SANDBOX`). |
| `shop.js` | Массив `PRODUCTS` (твои SKU/цены), `config.rustoreApplicationId` источник (твой config.js). |
| `pending-purchase-retry.js` | Без изменений — ссылается на rustore-auth. |
| `security-log.js` | Без изменений. |
| `RuStoreBillingPlugin.java` | `package <твой>;` вверху + имя плагина (`@CapacitorPlugin(name="RuStoreBilling")` если хочешь переименовать). |
| `client-rustore-billing.js` | Без изменений — работает с любым проектом где есть Capacitor. |

## Порядок интеграции

1. **БД:** `sqlite3 db.sqlite < schema.sql` (или эквивалент для Postgres/MySQL). Или скопировать логику в свой migration-файл.

2. **Server:**
   - Скопировать 4 JS-файла в `server/services/` и `server/routes/`
   - В `server/config.js` добавить env-поля (шаблон в `rustore-auth.js` начале)
   - В `server.js` (entry point) добавить `require('./server/services/pending-purchase-retry').start()` **после** `app.listen()`
   - Подключить роут `app.use('/api/shop', require('./server/routes/shop'))`
   - Положить PEM: `/opt/<app>/rustore-api.pem`, `chmod 600`
   - Добавить в `.env`: `RUSTORE_COMPANY_ID`, `RUSTORE_KEY_ID`, `RUSTORE_APPLICATION_ID`, `RUSTORE_API_PRIVATE_KEY_PATH`, `RUSTORE_SANDBOX=0`
   - `pm2 restart --update-env`

3. **Android:**
   - Скопировать `RuStoreBillingPlugin.java` в `android/app/src/main/java/<pkg>/`, поправить `package`
   - В `MainActivity.java`: `registerPlugin(RuStoreBillingPlugin.class);` до `super.onCreate`
   - `android/app/build.gradle`: добавить BOM + pay зависимости (см. PAYMENTS.md § 4.1)
   - `AndroidManifest.xml`: meta-data + intent-filter (см. PAYMENTS.md § 4.2)
   - `manifestPlaceholders`: APPLICATION_ID и PAY_SCHEME

4. **Client JS:**
   - Скопировать `client-rustore-billing.js` в `public/js/rustore-billing.js`
   - Подключить в HTML: `<script defer src="js/rustore-billing.js">`
   - В `API.purchaseStars(productId, invoiceId)` → POST `/api/shop/purchase`
   - Покупка-flow (покупка + pending handling + recovery sweep) — см. PAYMENTS.md § 5.2 и 5.3

5. **Console:**
   - Создать приложение в RuStore → получить APPLICATION_ID
   - Создать IAP-продукты (те же SKU что в `PRODUCTS`)
   - **Компания → API RuStore → Создать ключ** → скачать PEM → записать companyId + keyId
   - Добавить тестировщика (свой RuStore-email)

6. **Smoke-test:**
   ```bash
   cd /opt/<app> && set -a && . ./.env && set +a && \
   node -e 'require("./server/services/rustore-auth").getPublicToken().then(j=>console.log("JWE:",j.length,j.split(".").length+"segs"))'
   ```
   Ожидается: `JWE: 589 5segs`.

7. **End-to-end test:** установить release-APK на устройство, логин аккаунтом-тестировщиком, купить → проверить `validated=1` в БД.

## Таблица версий (на момент выпуска этого reference-пакета)

- RuStore Pay SDK: **10.2.0** (через BOM `ru.rustore.sdk:bom:2026.03.01`)
- RuStore Public API: **v2** (`/public/v2/purchase/{invoiceId}`)
- Capacitor: **5.x+**
- Node.js: **18+** (нужен нативный fetch + crypto.createPrivateKey)
- Android compileSdk: **34+**
- Keystore: **RSA 2048 / SHA256withRSA**, PKCS8 PEM

Если в документации RuStore появятся новые BOM-версии с breaking changes — см. `PAYMENTS.md § 9` (миграция) прежде чем bump'ать BOM.
