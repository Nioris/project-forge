---
tags: [playbook, rustore, publishing, release, reusable]
---

# RuStore Publishing Playbook (Universal)

Пошаговый пайплайн публикации любого Android-приложения в RuStore. Не привязан к конкретному проекту. При работе над приложением — используй как чек-лист и подставляй свои значения.

Для проекта-специфичных публичных параметров (package ID, SKU, ID из Консоли, SHA-256 сертификата) можно создать документ в репозитории проекта. Приватный ключ, keystore и пароли создаёт Forge и хранит только во внешнем vault `<forge-data>/security/`, вне проекта и Git.

---

## 0. Предпосылки

- [ ] **Юрлицо / ИП / физлицо** зарегистрировано и верифицировано в RuStore Console (через VK ID).
- [ ] **Статус оператора персональных данных** в Роскомнадзоре оформлен — обязателен для любого приложения, собирающего данные пользователей.
- [ ] Если планируется **трансграничная передача ПД** (AI-провайдеры, Firebase, AppMetrica, аналитика за пределами РФ) — уведомление в РКН подано заранее.
- [ ] Если параллельно публикуемся в Google Play — Google Play Developer account оплачен и верифицирован.
- [ ] Решён вопрос **роли в компании:** API-ключи и управление монетизацией доступны только ролям **Владелец компании** и **Администратор**. Если есть только доступ на уровне отдельных приложений — заранее просить владельца добавить в company-admin (см. [официальная страница про роли](https://www.rustore.ru/help/developers/developer-account/user-roles)).

---

## 1. Подготовка репозитория проекта

- [ ] Создать `StoreData/` (или аналог) только для несекретных материалов магазина. Проверить, что `.gitignore` содержит:
  ```
  StoreData/signing/
  *.jks
  *.keystore
  *.pem
  SIGNING_CREDENTIALS.md
  StoreData/signing/
  security/
  ```
- [ ] `.env.example` шаблон без реальных значений; `.env` — в gitignore.
- [ ] `public/privacy.html` (или аналог) написан и задеплоен на **publicly accessible URL без VPN-блокировок** — проверить через [check-host.net](https://check-host.net).
- [ ] Возрастной рейтинг в privacy соответствует тому, что будет указан в карточке RuStore.
- [ ] Для health/finance/medical-приложений — явный дисклеймер «не медицинское / не финансовая консультация» в privacy и онбординге.

---

## 2. Карточка приложения — листинг-документ

Готовится **до** создания черновика в Консоли. Все тексты и артефакты потом копируются в форму.

### Обязательные секции

| Секция | Что внутри |
|---|---|
| **Основная информация** | Название (до 50 симв.), короткое описание (до 80 симв.), категория, доп. категория (опц.), возрастной рейтинг, язык, сайт, email поддержки |
| **Полное описание** | ASO-оптимизированное, до 4000 симв., с FAQ и контактным блоком в конце |
| **Changelog** | До 500 симв., конкретные фичи/фиксы |
| **Теги** | Только ID из [официального справочника](https://www.rustore.ru/help/work-with-rustore-api/api-upload-publication-app/app-tag-list) |
| **Ключевые слова** | Свободное поле, отдельно от тегов |
| **Чувствительные разрешения** | Пояснение модератору для каждого permission из манифеста |
| **Запрашиваемые данные** | Да/Нет для **каждого** пункта [официального справочника](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/new-version-app/declare-app-permissions/data-categories) |
| **Контакты** | Единый контактный блок в конце описания |

### ASO-правила (короткое описание)

- **Первые 40 символов** — высокочастотные ключи (видны в выдаче поиска).
- Формат: `[Основной ключ]: [2-3 вторичных ключа через запятую]`.
- **Запрещено:** «лучший», «самый», «номер 1», обещания результата («похудеешь», «избавит от стресса»).

### ASO-правила (полное описание)

- Первый абзац — плотное перечисление продуктовых ключей, повторяемых 3–5 раз естественно.
- Секции с эмодзи-заголовками для вкрапления ключей (`🧠 AI-анализ`, `📊 Трекер ...`).
- Блок «Для кого это приложение» с intent-фразами.
- FAQ 8–12 вопросов — повышает и UX и ASO-вес ключей.
- Контактный блок в самом конце.

### Обязательные вопросы FAQ (почти любое приложение)

1. Нужен ли интернет?
2. Есть ли реклама?
3. Где хранятся мои данные?
4. Можно ли экспортировать / удалить данные?
5. Что платно / что бесплатно?
6. Поддержка языков?
7. Почему просит `<sensitive permission>`?

Для health/legal/finance — обязательно вопрос про замену врача/юриста/психолога.

### Теги — правила

- Таксономия RuStore грубая — **нет тегов** для AI, mood, эмоций, биоритмов, RPG.
- Подбор: 5–7 ближайших семантических попаданий из MAIN-списка (ID 111–186).
- **Не брать:**
  - `133 Медицина` — без лицензии триггерит дополнительную модерацию.
  - `179 Трекеры физической активности` — если приложение не фитнес.
  - `112 Гороскопы` — привлекает астрологическую аудиторию.
- В API передавать **числовыми ID**, не русскими названиями.

### Категории приложений (20 шт.) — RuStore

Бизнес-сервисы · Государственные · Еда и напитки · Здоровье · Книги · Новости и события · Образ жизни · Образование · Общение · Объявления и услуги · Питомцы · Покупки · Полезные инструменты · Путешествия · Развлечения · Родителям · Спорт · Ставки и лотереи · Транспорт и навигация · Финансы.

**Нет категорий** «Здоровье и фитнес» (это Google Play), «Lifestyle», «Productivity». Не придумывать.

Выбирается одна основная + опционально одна дополнительная.

---

## 3. Визуальные артефакты

- [ ] **Иконка 512×512 PNG** — без прозрачности, без текста, сплошной фон (RuStore отклоняет прозрачные и text-on-icon).
- [ ] **4–8 скриншотов** 1080×1920 минимум, вертикальные. Первые 3 — самые сильные (превью в карточке).
- [ ] **Feature Graphic 1024×500** (опционально, но повышает CTR в промо-блоках).
- [ ] Промпты для генерации через AI-арт-инструменты можно хранить в `StoreData/ICON_PROMPTS.md` и `StoreData/PROMO_SCREENS.md`.

---

## 4. Release identity и Google Play App Signing

Forge создаёт release identity один раз и затем переиспользует её для всех обновлений приложения:

```powershell
node <forge-engine>/scripts/forge-security.mjs init --project .
node <forge-engine>/scripts/forge-security.mjs validate --project .
```

Команда генерирует стабильный reverse-DNS package ID, RSA-3072 PKCS12 key, alias и криптографически стойкий пароль. Приватные данные сохраняются в защищённом внешнем vault `<forge-data>/security/`; в `forge.identity.json` остаются только публичные идентификаторы и SHA-256 сертификата.

Нельзя вручную создавать project-local keystore, передавать пароли через аргументы командной строки, записывать их в Gradle properties, `.env`, Markdown, логи или CI-конфигурацию. Release builder Forge кратковременно материализует ключ в изолированной папке, передаёт секреты только дочернему процессу и после сборки удаляет рабочий материал.

До первой публикации обязательно сделать поддерживаемый Forge зашифрованный backup vault на отдельный носитель. Утеря release key означает невозможность выпустить обновление с той же подписью. PEPK для Google Play создаётся отдельной безопасной командой Forge после получения encryption key в Play Console; `pepk_out.zip` также является чувствительным экспортным артефактом и не попадает в Git.

---

## 5. Первая сборка AAB (без Pay SDK — для получения APPLICATION_ID)

RuStore присваивает `APPLICATION_ID` **после** загрузки первого AAB. Без этого ID нельзя активировать Pay SDK (он использует ID как manifest placeholder). Поэтому делаем **сборку-болванку**:

- [ ] Плагины RuStore Pay/Review **временно отключены** (лежат в `android/_disabled/`, зависимости в `build.gradle` закомментированы)
- [ ] `npx cap sync android` (если Capacitor)
- [ ] `JAVA_HOME=<path-to-jbr> ./gradlew clean bundleRelease`
- [ ] AAB в `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Копия с timestamp в `StoreData/<App>_v<X.Y>_<YYYYMMDD_HHMMSS>.aab`
- [ ] Верификация подписи: `jarsigner -verify -verbose <aab>` → должно показать expire date keystore

---

## 6. Создание черновика приложения в Консоли

**URL:** [console.rustore.ru](https://console.rustore.ru)

1. «Мои приложения» → «Создать приложение» → «Приложение» (или «Игра»)
2. Заполнить карточку копипастом из листинг-документа
3. Загрузить AAB из § 5
4. После сохранения — в URL появится `/apps/<NUMERIC_ID>/...`. Это публичный **`APPLICATION_ID`**; записать его в проектный playbook или store listing без каких-либо секретов.

---

## 7. IAP-продукты (если есть внутренние покупки)

Карточка приложения → **Монетизация → Цифровые товары** → «Создать товар».

- [ ] Каждый SKU: ID должен совпадать с SKU в клиенте и сервере.
- [ ] SKU **неизменяемые** после активации — привязаны к receipts.
- [ ] Задокументировать все IAP в `StoreData/IAP_PRODUCTS.md`.

---

## 8. API-ключ для серверной валидации receipts

Требуется роль **Владелец компании** или **Администратор** на уровне компании (не на уровне приложения).

**Путь:** Консоль → **Компания** (или **Разработчик** для физлица) → **API RuStore** → «Создать ключ».

### Поля формы

- **Название:** `<AppName> Backend` (любое до 255 симв., внутреннее)
- **Приложения:** скоуп только на нужное (принцип наименьших прав)
- **Методы приложений (минимум для IAP):**
  - ✅ `Подтверждение покупки`
  - ✅ `Получение списка покупок по идентификатору`
- **Общие методы (минимум для IAP):**
  - ✅ `Получение данных платежа по идентификатору (v2)`

**Не включать:**
- Подписки (если нет подписок в продукте)
- Публикация приложений (CI/CD можно не настраивать)
- Отзывы, доступы пользователей
- Всё с пометкой `[DEPRECATED]`

Если понадобится поддержка возвратов позже — перегенерировать ключ с `Полный возврат средств` + `Отмена покупки`.

### Вывод

В всплывающем окне «Приватный ключ» появится RSA-2048 PEM (PKCS#8). **Показывается один раз** — потом восстановить нельзя, только перегенерировать:

- [ ] Скопировать PEM → `StoreData/signing/rustore-api.pem` (chmod 600, gitignored)
- [ ] Записать `companyId` (из URL `/companies/<NUM>/` или из профиля компании)
- [ ] Записать `keyId` (числовой ID ключа в списке «API RuStore» после закрытия модалки)

**Примечание:** `companyId` — legacy, для самого вызова `/public/auth/` **не используется**. Публичные ID можно хранить в project playbook; приватный PEM и любые токены — только через централизованное хранилище секретов Forge. Для подписи нужен `keyId`.

---

## 9. Серверная интеграция — JWE-флоу для валидации receipts

### Почему не статичный ключ

RuStore `Public-Token` — это **JWE-токен на ~900 секунд**, который сервер сам генерирует по запросу, подписывая `{keyId, timestamp}` приватным RSA-ключом из § 8. Долгоживущего «API key» на выдачу из Консоли не существует.

### Минимальный модуль `rustore-auth.js`

```js
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

let _privateKey = null;
let _cachedToken = null;
const TOKEN_TTL_MS = 890 * 1000;

function loadPrivateKey() {
  if (_privateKey) return _privateKey;
  const pem = fs.readFileSync(process.env.RUSTORE_API_PRIVATE_KEY_PATH, 'utf8');
  _privateKey = crypto.createPrivateKey(pem);
  return _privateKey;
}

// ISO-8601 c миллисекундами и ЯВНЫМ offset (+00:00 или +03:00), НЕ "Z"
function nowIsoWithOffset() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(),3)}` +
    `${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`;
}

async function getPublicToken() {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now) return _cachedToken.jwe;

  const keyId = String(process.env.RUSTORE_KEY_ID);
  const timestamp = nowIsoWithOffset();
  const signer = crypto.createSign('RSA-SHA512');
  signer.update(keyId + timestamp);   // конкатенация без разделителя
  const signature = signer.sign(loadPrivateKey(), 'base64');

  const body = JSON.stringify({ keyId, timestamp, signature });  // все три — строки
  const jwe = await postJson('public-api.rustore.ru', '/public/auth/', body);
  _cachedToken = { jwe, expiresAt: now + TOKEN_TTL_MS };
  return jwe;
}
```

### Валидация receipt

```js
async function validateReceipt(invoiceId) {
  const jwe = await getPublicToken();
  const pathPrefix = process.env.RUSTORE_SANDBOX === '1'
    ? '/public/sandbox/v2/purchase/'
    : '/public/v2/purchase/';

  const res = await httpsGet('public-api.rustore.ru', pathPrefix + invoiceId, {
    'Public-Token': jwe,
    'Accept': 'application/json'
  });
  // если 401 — сбросить кеш и повторить один раз

  const parsed = JSON.parse(res.body);
  const receipt = parsed.body || parsed;

  // проверить: invoice_status === 'PAID',
  //           product_id совпадает с ожидаемым SKU,
  //           application_id совпадает с RUSTORE_APPLICATION_ID
  return receipt;
}
```

### Env на сервере

```
RUSTORE_KEY_ID=<numeric>
RUSTORE_APPLICATION_ID=<numeric>
RUSTORE_API_PRIVATE_KEY_PATH=/opt/<app>/rustore-api.pem
RUSTORE_SANDBOX=0
# companyId не нужен для /auth, но полезно иметь для аудита
RUSTORE_COMPANY_ID=<numeric>
```

### Клиент

- Pay SDK v10+ возвращает `result.invoiceId` (не `purchaseToken` — он устарел).
- Клиент шлёт `invoiceId` на свой backend для валидации.

### Критичные детали формата запроса `/public/auth/`

Частые причины 400 `"Invalid request format. Unexpected value"`:

1. **Поле должно называться `keyId`**, не `companyId` (последний deprecated с 2024-07-30).
2. **Все значения — строки** в JSON (`"keyId":"1234"`, не `"keyId":1234`).
3. **Timestamp с явным offset**, не `Z`. Пример: `"2026-04-20T00:25:51.466+00:00"`.
4. **Подпись = SHA512withRSA (PKCS#1 v1.5)** над конкатенацией `keyId + timestamp` без разделителя.
5. **Base64** (не Base64URL).
6. Signature валиден **60 секунд** от timestamp — не переиспользовать подпись.

### Smoke-test после деплоя

```bash
ssh <vps> "cd /opt/<app> && set -a && . ./.env && set +a && \
  node -e 'require(\"./server/services/rustore-auth\").getPublicToken().then(jwe => \
    console.log(\"OK\", jwe.length, jwe.split(\".\").length))'"
```

Ожидается: `OK <~589> 5` (JWE длиной ~589 символов, 5 сегментов, header декодируется в `{"enc":"A256GCM","alg":"RSA-OAEP-256"}`).

---

## 10. Финальная release-сборка (с активным Pay SDK)

Требует доступности **`artifactory-external.vkpartner.ru`** — зеркала RuStore для Maven-зависимостей. Периодически лежит (проверять через VPS, не локально — локальные VPN могут ложно показывать доступность).

### Если есть Pay SDK + Review SDK

- [ ] Переместить плагины из `android/_disabled/` в `android/app/src/main/java/<pkg>/`
- [ ] Раскомментировать в `build.gradle`:
  ```gradle
  implementation platform('ru.rustore.sdk:bom:<DATE>')
  implementation 'ru.rustore.sdk:pay'
  implementation 'ru.rustore.sdk:review'
  ```
  BOM даты смотреть в [changelog Pay SDK](https://www.rustore.ru/help/sdk/pay/kotlin-java/history).
- [ ] Раскомментировать `registerPlugin(...)` в `MainActivity.java`
- [ ] `manifestPlaceholders.RUSTORE_CONSOLE_APPLICATION_ID` = числовой из § 6
- [ ] JWS public key из Консоли → Монетизация → Pay SDK → прописать в клиент (для on-device валидации receipts до отправки на сервер)

### Сборка

```bash
npx cap sync android
cd android && JAVA_HOME="<path-to-jbr>" ./gradlew clean bundleRelease
cp app/build/outputs/bundle/release/app-release.aab \
   ../StoreData/<App>_v<X.Y>_<TS>.aab
```

---

## 11. Тестирование IAP end-to-end

- [ ] Консоль → карточка приложения → **«Тестировщики»** → добавить RuStore-email свой и тестеров.
- [ ] Установить release AAB на устройство (через `bundletool` или загрузить в RuStore в тест-канал).
- [ ] Залогиниться RuStore-аккаунтом из списка тестировщиков.
- [ ] Выполнить покупку — должно быть 0 ₽ / тестовые рубли.
- [ ] Проверить:
  - Pay SDK вернул `invoiceId` + `status=PAID`
  - Сервер успешно валидировал: в БД `validated=1`
  - Внутренняя валюта / контент начислены
  - Повторная попытка с тем же `invoiceId` → `409 Receipt already redeemed`
- [ ] Тест recovery: убить приложение между оплатой и подтверждением → при перезапуске `recoverPendingPurchases()` должен докомитить.

Sandbox-endpoint `/public/sandbox/v2/purchase/` нужен только для QA-серверов; тестировщики через prod-endpoint работают прозрачно (RuStore сам маркирует их покупки как sandbox).

---

## 12. Отправка на модерацию

- [ ] Все поля карточки зелёные (Консоль показывает подсказки справа)
- [ ] Полный чек-лист § 2–11 пройден
- [ ] Нажать «Отправить на модерацию»

Модерация обычно 1–4 часа. Результат: одобрено либо список замечаний.

### Частые причины отказа

- Политика конфиденциальности недоступна / не соответствует 152-ФЗ
- Обещания результата или упоминание рекламы, которых нет в приложении
- Health / finance / medical приложение без дисклеймера «не медицинское / не консультация»
- IAP-продукты в Консоли не совпадают с SKU в коде
- Тег `Медицина` без лицензии
- Скриншоты с чужим брендингом / устаревшим интерфейсом
- Иконка с прозрачным фоном
- VPN-only доступ к privacy URL

Разбор замечаний → правки → повторная отправка. Обычно 1–2 итерации.

---

## 13. После релиза

- [ ] AppMetrica (или аналог) настроена на crash-reports
- [ ] Отзывы в Консоли мониторятся ежедневно первые 2 недели
- [ ] Патч-релизы: `versionCode++`, новая `versionName`, AAB с **тем же keystore**, загрузить как новую версию того же приложения
- [ ] Опционально: RuStore Updates SDK (in-app обновления), RuStore Push SDK (push-уведомления с сервера)

---

## Официальные источники RuStore

### Публикация приложения
- [Категории приложений](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/new-version-app/category)
- [Чувствительные разрешения](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/new-version-app/declare-app-permissions)
- [Категории данных](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/new-version-app/declare-app-permissions/data-categories)
- [Скриншоты](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/new-version-app/app-screenshots)
- [Отправка на модерацию](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/new-version-app/submit-application-for-moderation)

### Управление и доступы
- [Роли пользователей](https://www.rustore.ru/help/developers/developer-account/user-roles)
- [API тегов](https://www.rustore.ru/help/work-with-rustore-api/api-upload-publication-app/app-tag-list)

### Public API (валидация receipts)
- [Принципы авторизации в Public API](https://www.rustore.ru/help/work-with-rustore-api/api-authorization-process)
- [Генерация JWE-токена](https://www.rustore.ru/help/work-with-rustore-api/api-authorization-token)
- [v2 получение данных платежа](https://www.rustore.ru/help/work-with-rustore-api/api-subscription-payment/v2-purchase-invoiceid)
- [Индекс всех методов API](https://www.rustore.ru/help/work-with-rustore-api)

### SDK
- [Pay SDK Kotlin/Java](https://www.rustore.ru/help/sdk/pay/kotlin-java)
- [Review SDK Kotlin/Java](https://www.rustore.ru/help/sdk/reviews-ratings/kotlin-java)
- [Push SDK](https://www.rustore.ru/help/sdk/push-notifications/kotlin-java)
- [Updates SDK](https://www.rustore.ru/help/sdk/updates/kotlin-java)

---

## Шаблон публичной signing identity

При необходимости хранить в репозитории только несекретную справку, например `StoreData/SIGNING_PUBLIC.md`:

```markdown
# <App> — Public release identity

## Android signing
- Package ID: <reverse-dns-id>
- Key alias: <...>
- SHA-256: <...>
- Vault ID: <non-secret-id>

## RuStore
- Application ID: <numeric>
- Company ID: <numeric>
- API Key ID: <numeric>
```

Keystore, пароли, приватные PEM, токены и экспорт PEPK в таком документе запрещены. Их наличие в проекте является блокером release gate.
