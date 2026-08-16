---
tags: [auth, sync, e2e-encryption, device-token, cloud-backup, reusable]
---

# Anonymous Auth + End-to-End Cloud Sync — Integration Manual

Универсальная инструкция по встраиванию **анонимной авторизации** (без email/пароля) и **E2E-шифрованной облачной синхронизации** с переносом между устройствами через 5-словную фразу. Протестировано на Daily Insight (Capacitor PWA → Android, Node.js + SQLite).

Переносится между проектами без изменений — только имена env/SKU/routes под свой проект.

**Связанные документы:**
- [PAYMENTS.md](PAYMENTS.md) — платежи через RuStore (использует ту же auth/sync модель)
- [PLAYBOOK.md](PLAYBOOK.md) — общий пайплайн публикации

---

## Содержание

1. [Зачем так (vs email/пароль)](#1-зачем)
2. [Архитектура](#2-архитектура)
3. [Threat model](#3-threat-model)
4. [Серверная часть — анонимная авторизация](#4-server-auth)
5. [Серверная часть — Cloud Sync endpoints](#5-server-sync)
6. [Клиентская часть — device_token + JWT](#6-client-auth)
7. [Клиентская часть — E2E шифрование](#7-client-encryption)
8. [Флоу переноса на новое устройство](#8-restore-flow)
9. [База данных](#9-database)
10. [Rate-limits и защита от брутфорса](#10-rate-limits)
11. [152-ФЗ и privacy.html](#11-legal)
12. [Миграция со старой email/password схемы](#12-migration)
13. [Reference files](#13-reference)

---

## 1. Зачем

### Преимущества анонимной модели

- **Нет PII** (ст. 3 152-ФЗ) — сервер хранит только UUID, не email/имя/телефон.
- **Нулевой onboarding friction** — юзер устанавливает → сразу работает, без регистрации.
- **Меньше ответственности** — компрометация БД не раскрывает identity юзеров. Максимум — UUID и зашифрованный блоб.
- **152-ФЗ compliance по-минимуму** — при отсутствии email, ФИО и т.п. регуляторные требования сильно мягче.
- **Нет утечки паролей** — нечего утекать.
- **Соответствует privacy-first позиционированию** — мы реально не знаем кто наш юзер.

### Когда НЕ подходит

- Нужна мульти-деviceная синхронизация «из коробки» без активных действий юзера — тут нужны аккаунты.
- Нужно восстановление без phrase (через email/SMS reset) — здесь фраза **единственный** путь.
- Регуляторные требования KYC (финтех, крипто, казино) — требуется верификация identity.
- Нужен социальный сервис (мульти-юзер активности, дружба, чаты между людьми) — без identity не построишь.

Для приложений вида «личный дневник/трекер/планировщик/финтрекер» — **идеальная модель**.

---

## 2. Архитектура

```
┌─────────────────────┐          ┌──────────────────────┐
│  Client (Android /  │          │  Backend (Node.js)    │
│  PWA + Capacitor)   │          │                       │
├─────────────────────┤          ├──────────────────────┤
│                     │          │                      │
│ 1. On first launch: │          │                      │
│    gen UUID →       │  ─POST─► │ 2. /auth/register    │
│    device_token     │          │    Find or create    │
│                     │  ◄─JWT── │    users row         │
│                     │          │    Issue JWT         │
│                     │          │                      │
│ 3. All API calls    │  ─Bearer─► │ /api/* (requireAuth)│
│    with Bearer JWT  │          │                      │
│                     │          │                      │
│ ═════ OPT: Cloud Sync ══════                          │
│                     │          │                      │
│ 4. Gen 5-word       │          │                      │
│    phrase P         │          │                      │
│ 5. Derive key       │          │                      │
│    K = PBKDF2(P)    │          │                      │
│ 6. Encrypt all data │  ─POST─► │ 7. /sync/upload      │
│    E = AES-GCM(K,D) │          │    Store E +         │
│    phraseHash =     │          │    phraseHash        │
│    SHA256(P)        │          │                      │
│                     │          │                      │
│ ═════ RESTORE on new device ═══                       │
│                     │          │                      │
│ 8. New install →    │          │                      │
│    new device_token │  ─POST─► │ /auth/register (temp)│
│                     │  ◄─JWT── │                      │
│ 9. User enters P    │          │                      │
│ 10. phraseHash =    │  ─POST─► │ 11. /sync/link        │
│     SHA256(P)       │          │     Find by hash     │
│                     │          │     Delete temp user │
│                     │  ◄─JWT── │     Relink to        │
│                     │          │     original user_id │
│                     │          │                      │
│ 12. GET /sync/download ─►       │ 13. Return E         │
│                     │  ◄─blob── │                      │
│ 14. D = AES-GCM(K,E)│          │                      │
└─────────────────────┘          └──────────────────────┘
```

### Ключевые инварианты

- **Сервер никогда не видит содержимое** — всё шифруется на клиенте.
- **Ключ шифрования нигде не передаётся** — выводится из фразы через PBKDF2 **только на клиенте**.
- **`phraseHash`** (SHA-256 фразы) — единственное что сервер хранит в открытом виде, и он не позволяет расшифровать данные (предполагая достаточную длину фразы).
- **`device_token`** — анонимный UUID, сгенерированный клиентом. Никак не связан с личностью.

---

## 3. Threat model

| Атака | Защита |
|---|---|
| Сервер скомпрометирован, БД украдена | Контент зашифрован E2E, сервер не знает ключ. Утекает только UUID + зашифрованный blob. |
| MITM на `/sync/upload` | HTTPS + JWT auth. Даже если перехватят blob — расшифровать без фразы нельзя. |
| Юзер теряет устройство | Cloud Sync восстанавливает на новом устройстве через фразу. |
| Юзер забыл фразу | **Данные потеряны.** Осознанный trade-off: сервер не может восстановить, т.к. не знает ключ. UX — предупредить при setup. |
| Атакующий угадывает фразу | 5 слов из словаря ~2048 → ~11 bit * 5 = 55 bit entropy + PBKDF2 iterations. Комбинация `phraseHash` lookup + rate-limit на `/link` делает брут непрактичным. |
| Украденная фраза (социалка) | Juser должен относиться к фразе как к паролю. Наш UI это подчёркивает — фраза показывается один раз с WARNING. |
| Replay JWT с одного устройства на другое | JWT валиден до expiry, но без фразы данные бесполезны. Также можно revoke через logout / password change (не реализовано — нет пароля). |
| Фарминг анонимных аккаунтов (для retention bonus) | Cross-check по phraseHash + rate-limit на IP. См. PAYMENTS.md § 6a. |

---

## 4. Server auth

### 4.1 `POST /api/auth/register`

**Body:** `{deviceToken: string, displayName?: string}`

**Логика:**
1. Проверить `deviceToken` (≥10 символов UUID-like).
2. SELECT по `device_token` → если найден → вернуть существующего юзера.
3. Если нет — `INSERT INTO users (device_token, display_name, stars)` с явным `stars=100` (не полагаться на DEFAULT — SQLite ALTER не меняет его для существующих БД).
4. Выдать JWT `{userId: user.id}` с expires `30d`.
5. Вернуть `{token, user: {id, deviceToken, displayName}}`.

Полный код — `reference/auth.js`.

### 4.2 `GET /api/auth/me`

Возвращает текущего юзера (из JWT). Middleware `requireAuth` проверяет Bearer-токен.

### 4.3 JWT config

- Secret — в env `JWT_SECRET`, минимум 32 символа.
- Expires: `30d` для сессии, `24h` для admin.
- Алгоритм: HS256 (симметричный — нам не нужна асимметрия, т.к. подписывает и проверяет один и тот же сервер).

### 4.4 Security-events для auth

- Неверный JWT → `401`, без special event (это частая ошибка просрочки).
- Подозрительная активность (массовая регистрация с одного IP) — логируется через security-log в целом.

---

## 5. Server sync

### 5.1 `POST /api/sync/upload`

**Auth:** required.
**Body:** `{encryptedData: string, phraseHash: string, clientUpdatedAt: string, dataVersion?: number, dataSize?: number}`

**Логика:**
1. Валидация: encryptedData ≤ 5 МБ, есть clientUpdatedAt.
2. UPSERT в `user_sync` (одна строка на user_id, phrase_hash хранится рядом).
3. `UPDATE users SET sync_enabled = 1`.
4. Опционально: первый upload с новой `phraseHash` → +retention bonus (см. PAYMENTS.md § 6a).
5. Вернуть `{success, serverUpdatedAt, bonusGranted?}`.

### 5.2 `GET /api/sync/download`

**Auth:** required.
Возвращает `{exists, encryptedData, clientUpdatedAt, serverUpdatedAt, dataVersion}` или `{exists: false}`.

### 5.3 `POST /api/sync/link`

**Auth:** NOT required (это вход на новом устройстве).
**Body:** `{phraseHash: string, deviceToken: string}`

**Критично важные детали:**

1. **Trust-proxy** — если nginx перед Express, настроить `app.set('trust proxy', 1)` чтобы `req.ip` корректно читал `x-forwarded-for`.

2. **3-layer rate-limit** против брутфорса фразы:
   - Artificial delay 150ms на каждом запросе (ограничивает 6 req/s на соединение).
   - Global cap (все IP вместе): 100 req/час.
   - Per-IP cap (один IP): 20 req/час.
   - IP для rate-limit — **хешируется** (HMAC-SHA256) для 152-ФЗ.

3. **Lookup** — `SELECT user_id FROM user_sync WHERE phrase_hash = ?`.

4. **Удаление temp user** — клиент на новом устройстве уже зарегистрировался через `/auth/register` и получил свежий `user_id`. Этого юзера нужно удалить (без данных) и переклеить `device_token` на **оригинальный** user_id:
   ```sql
   DELETE FROM api_requests WHERE user_id = <temp>;
   DELETE FROM purchases WHERE user_id = <temp>;
   DELETE FROM user_sync WHERE user_id = <temp>;
   DELETE FROM users WHERE id = <temp>;
   UPDATE users SET device_token = ? WHERE id = <original>;
   ```

5. **Issue new JWT** — с оригинальным user_id.

Полный код — `reference/sync.js`.

### 5.4 `DELETE /api/sync/data` / `DELETE /api/sync/account`

- `/data` — удалить бэкап (юзер остаётся).
- `/account` — полностью удалить юзера со всеми данными. Требует подтверждения строкой `"УДАЛИТЬ МОИ ДАННЫЕ"` в body (защита от случайного fetch'а).

---

## 6. Client auth

### 6.1 Device token

```js
const TK = 'dsi_device_token';

function getDeviceToken() {
  let token = localStorage.getItem(TK);
  if (!token) {
    // Prefer crypto.randomUUID (all evergreen browsers + Capacitor WebView)
    token = crypto.randomUUID
      ? crypto.randomUUID()
      : _fallbackUuidV4();
    localStorage.setItem(TK, token);
  }
  return token;
}
```

Fallback для старых браузеров без `crypto.randomUUID`:
```js
function _fallbackUuidV4() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;  // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;  // RFC 4122 variant
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
```

### 6.2 Registration + session

```js
const Auth = {
  async register(displayName) {
    const deviceToken = getDeviceToken();
    const res = await fetch(SERVER_URL + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceToken, displayName })
    });
    const data = await res.json();
    localStorage.setItem('dsi_session_token', data.token);
    localStorage.setItem('dsi_user_id', data.user.id);
    return data;
  },

  async ensureAuth() {
    if (localStorage.getItem('dsi_session_token')) return;
    await this.register();
  },

  getSessionToken() {
    return localStorage.getItem('dsi_session_token');
  }
};
```

### 6.3 Lazy auth pattern

**Не регистрировать при старте app.** Регистрация происходит при **первом** запросе к API (в `api.js _post/_get`). Это даёт юзеру pure-offline-опыт если он не трогает AI/cloud, и снижает нагрузку на сервер.

### 6.4 Auto-retry on 401

Если `/api/*` возвращает 401 (expired JWT), `_post/_get` делает один ретрай после `Auth.register()`.

Полный код — `reference/client-auth.js`.

---

## 7. Client encryption

### 7.1 Key derivation

**PBKDF2-SHA256** с `100_000` итерациями:

```js
async deriveKey(phrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

**Почему PBKDF2 а не Argon2id:**
- Web Crypto API не имеет нативного Argon2 → пришлось бы тянуть WASM.
- 5-word phrase из словаря имеет ~55-бит энтропии + PBKDF2 iterations → брут стоимостью кластера.
- Atакующий не знает salt (хранится в blob).

### 7.2 Encryption

**AES-256-GCM** с random 12-byte IV + 16-byte salt:

```js
async encrypt(plaintext, phrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await this.deriveKey(phrase, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Wire format: [salt 16][iv 12][ciphertext...]
  const out = new Uint8Array(salt.length + iv.length + cipherBuf.byteLength);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(new Uint8Array(cipherBuf), salt.length + iv.length);
  return btoa(String.fromCharCode(...out));
}
```

### 7.3 Decryption

```js
async decrypt(encodedB64, phrase) {
  const raw = Uint8Array.from(atob(encodedB64), c => c.charCodeAt(0));
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const ciphertext = raw.slice(28);
  const key = await this.deriveKey(phrase, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuf);
}
```

### 7.4 Phrase hash

Сервер ищет аккаунт по фразе, не зная её. Используем SHA-256:

```js
async hashPhrase(phrase) {
  const data = new TextEncoder().encode(phrase);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 7.5 Phrase generation

Сервер генерит 5 слов из словаря BIP-39 (или свой список), возвращает в ответ `/sync/setup`. Клиент показывает юзеру с большим WARNING «ЭТУ ФРАЗУ НУЖНО ЗАПИСАТЬ. Без неё восстановить данные невозможно.»

Альтернатива — клиент генерит сам (меньше зависимости от сервера). В нашем проекте — сервер.

Полный код — `reference/client-sync.js`.

---

## 8. Restore flow

### 8.1 Клиентский триггер

На welcome-экране onboarding **кнопка «У меня уже есть аккаунт»** → `Sync.showRestore()`. Юзеру показывается диалог с 5 полями для слов.

### 8.2 После ввода

```js
async doRestore() {
  const phrase = /* собираем из 5 инпутов, lowercase, trim */;

  // 1. Hash phrase → find account
  const phraseHash = await this.hashPhrase(phrase);
  const deviceToken = localStorage.getItem('dsi_device_token');

  const linkRes = await fetch(SERVER_URL + '/api/sync/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phraseHash, deviceToken })
  });

  if (!linkRes.ok) throw new Error('Account not found');
  const linkData = await linkRes.json();

  // 2. Save new JWT (linked to original user_id now)
  localStorage.setItem('dsi_session_token', linkData.token);
  localStorage.setItem(SYNC_CK, phrase);   // cache phrase for future syncs
  localStorage.setItem(SYNC_EK, '1');      // mark sync enabled

  // 3. Download + decrypt
  await this.download(phrase);

  // 4. Dismiss onboarding if we're inside it
  localStorage.setItem(OB, 'done');
  document.getElementById('onboardOverlay')?.classList.add('hidden');
  if (typeof renderDashboard === 'function') renderDashboard();
}
```

### 8.3 Edge cases

- **Неверная фраза** → 404 от `/sync/link`. Показать `"Фраза не подошла"`.
- **Фраза верна, но данные не расшифровались** → `crypto.subtle.decrypt` throws. Значит phrase совпала по hash, но сам ключ не тот (коллизия SHA-256 — практически невозможно, но если произошло). Показать то же сообщение.
- **Нет интернета** → catch, toast «Нет связи с сервером».
- **Rate-limit сработал** → 429, показать `"Слишком много попыток"`.

### 8.4 Overlay ordering

Если кнопка «У меня уже есть аккаунт» внутри welcome-онбординга (z-index 500), а `Sync.showRestore()` открывает модалку — **z-index модалки должен быть > z-index онбординга**. Иначе модалка откроется, но не будет видна. См. pitfalls.

---

## 9. Database

```sql
-- Users table — anonymous identity only.
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_token    TEXT UNIQUE NOT NULL,          -- client-generated UUID
  display_name    TEXT DEFAULT '',                -- optional, user-facing
  created_at      TEXT DEFAULT (datetime('now')),
  last_active     TEXT DEFAULT (datetime('now')),
  is_active       INTEGER DEFAULT 1,
  -- App-specific flags:
  stars           INTEGER DEFAULT 100,            -- in-app currency
  sync_enabled    INTEGER DEFAULT 0,              -- true after first upload
  sync_code       TEXT DEFAULT '',                -- unused, legacy
  passphrase_hint TEXT DEFAULT ''                 -- optional hint for phrase
);
CREATE INDEX IF NOT EXISTS idx_users_device_token ON users(device_token);

-- Encrypted cloud sync blob — one row per user.
CREATE TABLE IF NOT EXISTS user_sync (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER UNIQUE NOT NULL REFERENCES users(id),
  encrypted_data    TEXT NOT NULL,                -- base64 of [salt|iv|ciphertext]
  phrase_hash       TEXT,                         -- SHA-256 hex of recovery phrase
  data_version      INTEGER DEFAULT 1,            -- bump when local schema changes
  data_size         INTEGER DEFAULT 0,            -- bytes (for admin stats)
  client_updated_at TEXT,                         -- ISO from client
  server_updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_sync_phrase ON user_sync(phrase_hash);

-- Rate limits for /sync/link anti-bruteforce.
-- Auto-expires via reset_at — persisted across PM2 restarts.
CREATE TABLE IF NOT EXISTS rate_limits (
  scope      TEXT NOT NULL,                       -- 'ip' | 'global'
  key        TEXT NOT NULL,                       -- hashed IP or 'all'
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);
```

Полный SQL — `reference/schema.sql`.

---

## 10. Rate-limits

### 10.1 Layered defence на `/sync/link`

```js
// 1. Artificial 150ms delay — caps single-connection throughput at ~6 req/s
await new Promise(r => setTimeout(r, 150));

// 2. Global cap (anti-botnet): 100 req/hour across ALL IPs
const globalLimit = bumpRateLimit('global', 'all', 100);
if (!globalLimit.allowed) return res.status(429).json({...});

// 3. Per-IP cap (anti-single-attacker): 20 req/hour per IP (hashed)
const ipHash = hashIp(req);  // HMAC-SHA256, see ip-hash.js
const ipLimit = bumpRateLimit('ip', ipHash, 20);
if (!ipLimit.allowed) return res.status(429).json({...});
```

**Рассчёт атакующего:** 20 попыток/час из одной сети, словарь BIP-39 2048^5 ~ 3.5×10^16 комбинаций. Перебор даже 0.01% займёт ~10^10 часов. **Непрактично.**

### 10.2 Не использовать

- **Express-rate-limit с IP как ключом** — хранит raw IP в памяти, нарушает 152-ФЗ. Наш `bumpRateLimit` хранит в БД хешированный IP.

---

## 11. Legal

### 11.1 152-ФЗ

- **Что мы собираем:** анонимный UUID (`device_token`), optional display_name, ip-хеш (не сам IP). **Email/ФИО/телефон — НЕ собираем.**
- **Трансграничная передача:** если есть — через явное согласие юзера в onboarding.
- **Хранение:** на серверах оператора в РФ или дружественной юрисдикции.
- **Права субъекта:** удаление через `DELETE /sync/account` или почтовое обращение.

### 11.2 Privacy policy обязательные блоки

1. «Категория "Контактные данные → email" — **НЕ собирается**, авторизация анонимная по UUID.»
2. «IP-адрес при хранении **необратимо псевдонимизируется** через HMAC-SHA256; оригинал после псевдонимизации не восстановим.»
3. «Cloud Sync: данные шифруются **на клиенте** (AES-256-GCM с ключом, выводимым из 5-словной парольной фразы через PBKDF2-SHA256). Сервер не имеет технической возможности прочитать содержимое.»
4. «При утере фразы данные восстановить невозможно — оператор не имеет доступа к ключу шифрования.»

### 11.3 Store submission (RuStore / Google Play) data categories

- **Личная информация → ID пользователей** = Да (device_token)
- **Личная информация → Email** = **Нет**
- **Пользовательский контент** = Да, но с пояснением про E2E.

---

## 12. Migration — интеграция в существующий проект

### 12.1 Decision tree

Ответь на 4 вопроса — и получишь стратегию:

1. **Есть ли у тебя уже identity (email/phone/OAuth)?**
   - Нет → Стратегия **A: Greenfield** (§ 12.2)
   - Да → к вопросу 2
2. **Identity нужна для business-требований (KYC, legal, социалка)?**
   - Да → Стратегия **C: Additive** (§ 12.4) — оставляешь identity, cloud sync добавляешь поверх
   - Нет → к вопросу 3
3. **Готов мигрировать всех активных юзеров на анонимную модель?**
   - Да, в течение 6 месяцев → Стратегия **B: Parallel с phase-out** (§ 12.3)
   - Нет, хочу поддерживать оба навсегда → Стратегия **C: Additive**
4. **(для B) Какой % юзеров логинятся хотя бы раз в 6 месяцев?**
   - >80% → B безопасна, оставшихся дотягиваем через саппорт
   - <80% → только C, иначе теряешь аккаунты

### 12.2 Стратегия A: Greenfield

Проект без auth (новый/прототип) или с минимальной. Применяешь пакет целиком.

Шаги — стандартный чек-лист из раздела «Перенос в новый проект» выше в этом документе.

### 12.3 Стратегия B: Parallel с phase-out

Есть email/password/OAuth, хочешь перейти на анонимную. **6-фазный план:**

**Фаза 0 — подготовка (1 неделя):**
- [ ] Privacy policy обновлена с упоминанием нового анонимного режима (но старое email/password тоже остаётся до перехода)
- [ ] Backup всей БД

**Фаза 1 — миграция схемы (1 день):**
```sql
-- Не удаляй старые колонки, добавь новые
ALTER TABLE users ADD COLUMN device_token TEXT UNIQUE;
ALTER TABLE users ADD COLUMN anon_migrated INTEGER DEFAULT 0;
-- Старые колонки email, password_hash — оставь NULL-allowed
```

**Фаза 2 — dual-auth endpoint (1 день):**
```js
// POST /api/auth/login (старый) — оставь как есть, но добавь:
// если успешно: if !user.device_token → сгенерь UUID, сохрани, верни
// клиенту вместе с JWT в ответе.
// Клиент сохраняет device_token в localStorage и с этого момента ВСЕ
// запросы через /auth/register с device_token (старый email+password
// больше не нужны).

// POST /api/auth/register (новый из пакета) — работает как обычно
```

**Фаза 3 — клиент (1-2 недели):**
- Client: при старте если в localStorage лежит `email+password` (legacy) →
  один раз вызови `/auth/login` → сервер вернёт `device_token` →
  сохранить → с этого момента использовать только `device_token`.
- Удалить из клиента UI формы «email/password» после этой миграции.

**Фаза 4 — мониторинг (3-6 месяцев):**
- Метрика: `SELECT COUNT(*) FROM users WHERE anon_migrated=1` vs total.
- Когда 90-95% users мигрировали → Фаза 5.

**Фаза 5 — saving grace (2 недели):**
- Уведомление по email (у тебя ещё есть их email) не мигрированным юзерам:
  «Установите обновление до [date] — после этого старый метод логина
  будет отключён».

**Фаза 6 — cleanup (постфактум):**
- Отключить `/auth/login` (legacy endpoint) на сервере — он больше не нужен.
- Прогнать миграцию: `DELETE FROM users WHERE anon_migrated=0 AND last_active < 6_months_ago`.
- `ALTER TABLE users DROP COLUMN email, password_hash, anon_migrated` — или оставь колонки пустыми если DB миграции дорогие.
- Обновить privacy policy: убрать упоминания «мы храним email».

### 12.4 Стратегия C: Additive (cloud sync поверх существующей identity)

Identity остаётся — Cloud Sync добавляется как **опциональная фича** поверх.

Схема:
```
users (existing)
  id, email, password_hash, ...

user_sync (new)
  user_id REFERENCES users(id)
  encrypted_data, phrase_hash, ...
```

**Отличия от greenfield-инструкции:**

1. **`/api/auth/register`** не создаётся — используется твой существующий логин. Cloud Sync endpoints требуют `requireAuth`, который ты уже имеешь.

2. **`/api/sync/link`** работает особенным образом: в существующий аккаунт нельзя «перелогиниться» через phrase. Link имеет смысл только для **новых устройств того же владельца**. Варианты:
   - **Упрощённый:** юзер логинится по email/password на новом устройстве — получает доступ к данным через cloud sync автоматически (phrase прочитает сам).
   - **Анонимный fallback:** если юзер не помнит email/password — может восстановить данные через phrase, но получит **новый** user_id (без истории платежей/подписок, etc.). Риск: утрата связи с биллингом.

3. **Phrase-setup flow:** добавляется в настройки как опциональная фича «Включить зашифрованный бэкап». Не навязывается новым юзерам.

4. **Privacy update:** добавляется параграф про E2E, старое про email остаётся.

### 12.5 Database migration specifics

#### SQLite → готово из пакета
`schema.sql` применяется as-is. Для существующих БД используй `ALTER TABLE ... ADD COLUMN` (все наши миграции в `reference/auth.js` / `sync.js` / `database.js` через try/catch — безопасно применяются повторно).

#### PostgreSQL
```sql
-- SERIAL вместо INTEGER AUTOINCREMENT
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  device_token TEXT UNIQUE NOT NULL,
  ...
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- ALTER TABLE ADD COLUMN IF NOT EXISTS работает нативно в PG 9.6+
```

Замены:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT DEFAULT (datetime('now'))` → `TIMESTAMPTZ DEFAULT NOW()`
- `datetime('now', '-30 days')` → `NOW() - INTERVAL '30 days'`
- JSON-текст хранить как `JSONB` вместо `TEXT`

#### MySQL / MariaDB
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `INT PRIMARY KEY AUTO_INCREMENT`
- `TEXT` остаётся, но для UNIQUE нужно `VARCHAR(64) UNIQUE` (TEXT не индексируется в UNIQUE у MySQL).
- `datetime('now')` → `NOW()` или `CURRENT_TIMESTAMP`

### 12.6 Server language migration

Reference-файлы на Node.js. Если backend на другом языке — портируется легко:

#### Python (Flask/FastAPI)
- `crypto.createSign('RSA-SHA512')` → `cryptography.hazmat.primitives.asymmetric.rsa` + `sign(data, padding.PKCS1v15(), hashes.SHA512())`
- `crypto.createHmac('sha256', pepper).update(ip).digest('hex')` → `hmac.new(pepper.encode(), ip.encode(), hashlib.sha256).hexdigest()`
- JWT — `PyJWT` библиотека, тот же HS256.

#### Go
- `crypto/rsa` + `crypto/sha512` для JWE подписи.
- `crypto/hmac` для IP hash.
- `golang-jwt/jwt` для JWT.

#### PHP
- `openssl_sign(...)` с `OPENSSL_ALGO_SHA512`
- `hash_hmac('sha256', $ip, $pepper)`
- `firebase/php-jwt` для JWT.

Логика остаётся та же — только синтаксис. AUTH-SYNC.md описывает **алгоритмы и контракты**, язык реализации вторичен.

### 12.7 Client migration

Клиентский код из `reference/client-auth.js` и `client-sync.js` — **vanilla JS без фреймворков**. Если у тебя React/Vue/Svelte — оборачиваешь в hooks/composables:

```jsx
// React пример
import { useEffect, useState } from 'react';

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('dsi_session_token'));

  async function register(displayName) {
    const deviceToken = getDeviceToken();  // utility as-is
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceToken, displayName })
    });
    const data = await res.json();
    localStorage.setItem('dsi_session_token', data.token);
    setToken(data.token);
    return data;
  }

  return { token, register };
}
```

Cloud sync криптография (`crypto.subtle.encrypt/decrypt`) — **работает в любом современном браузере**, фреймворк не важен.

### 12.8 Что НЕ нужно менять в существующем проекте

- **Таблицы с бизнес-данными** (entries, orders, subscriptions и т.д.) — остаются на прежнем месте, просто foreign-key'ятся на `users(id)`.
- **Платёжная инфраструктура** (если есть) — не трогается, использует тот же `user_id`.
- **Аналитика/логи** — продолжают работать, но при желании можно тоже перевести IP на hash (см. § 11).

### 12.9 Промпт для Claude в existing-project

```
Прочитай .claude/skills/rustore-publish/AUTH-SYNC.md — целиком, особенно § 12.

Аудит моего проекта перед миграцией:
- какой у меня стек backend (язык, БД, framework)?
- какой тип auth сейчас (email/password? OAuth? device token? нет?)
- сколько активных пользователей (оценка)?
- есть ли у меня бизнес-требования к identity (платежи, подписки, KYC)?

На основе ответов выбери стратегию (A/B/C из § 12) и составь детальный
план миграции для моего конкретного случая. Не начинай изменять код —
сначала покажи план на утверждение.
```

С этим промптом Claude сам прочтёт код, оценит, предложит план. Ты его утверждаешь — потом начинается код.

---

## 13. Reference

Путь: `.claude/skills/rustore-publish/reference/`

| Файл | Назначение |
|---|---|
| `schema.sql` | SQL схема всех таблиц (users + user_sync + rate_limits + опционально security_events) |
| `auth.js` | **SERVER:** `/api/auth/register` + `/me` + JWT |
| `sync.js` | **SERVER:** `/api/sync/{upload,download,link,data,account}` + 3-layer rate-limit |
| `ip-hash.js` | **SERVER:** HMAC-SHA256 псевдонимизация IP для 152-ФЗ |
| `client-auth.js` | **CLIENT JS:** `Auth.register()`, `getDeviceToken()`, lazy-auth + 401-retry pattern |
| `client-sync.js` | **CLIENT JS:** `Sync.doSetup/doRestore/upload/download` + PBKDF2 + AES-GCM |

---

## Перенос в новый проект — чек-лист

- [ ] Скопировать 4 серверных файла из `reference/` в `server/routes/` и `server/services/` соответственно
- [ ] Применить `schema.sql` (или выдернуть только нужные таблицы)
- [ ] Подставить имена env-переменных под свой проект (`JWT_SECRET` обязателен, ≥32 символа)
- [ ] Настроить nginx `trust proxy` если сервер за reverse proxy
- [ ] Скопировать `client-auth.js` и `client-sync.js` в `public/js/`
- [ ] Подставить `SERVER_URL` под свой backend
- [ ] Добавить onboarding-экран с кнопкой «У меня уже есть аккаунт» → `Sync.showRestore()`
- [ ] Убедиться что `.modal-overlay` z-index > `.onboard-overlay` z-index (чтобы модалка восстановления не перекрывалась)
- [ ] Обновить privacy.html блоки про E2E-шифрование и IP-псевдонимизацию
- [ ] Smoke-test: регистрация на устройстве A → setup sync → добавить данные → восстановить на устройстве B тем же phrase → данные совпали

---

## Pitfalls и workarounds

### P1: `const` на top-level script не попадает в `window`

Если onclick в HTML ссылается на `Sync.showRestore()`, `Sync` должен быть доступен через scope chain. `const Sync = {...}` в `<script>` теге работает (без `type="module"`), но `window.Sync` будет undefined. Проверять в DevTools: `Sync` — OK, `window.Sync` — undefined (норма для non-module).

### P2: Modal-overlay под onboarding

Дефолтный z-index `.modal-overlay` часто 100, а `.onboard-overlay` 500. Кнопка «У меня уже есть аккаунт» открывает модалку, но юзер видит пустой онбординг. Bump modal-overlay до ≥700.

### P3: Restore восстанавливает не все поля

При миграции на новую версию клиентского schema (`dataVersion` bump) старые бэкапы могут не содержать новых полей. Client `restoreData()` должен заполнить отсутствующие поля дефолтными значениями, не падать на `undefined`.

### P4: Phrase хранится в localStorage — это риск?

Клиент кэширует phrase в `localStorage['dsi_sync_phrase']` после setup/restore, чтобы auto-upload работал без повторного ввода. Теоретически malicious JS может её украсть, но:
- Capacitor WebView — закрытая среда, нет сторонних скриптов.
- CSP блокирует inline evil JS (должна быть настроена на `'self' 'unsafe-inline'` только для наших скриптов).
- Если юзер открывает DevTools — он сам может достать phrase, и это его выбор.

Trade-off принят: UX-friction vs реальная атака (минимальна на closed WebView).

### P5: Temp user не удаляется при /link

Если rate-limit срабатывает до `DELETE FROM users WHERE id = <temp>` — temp-юзер остаётся в БД «висеть». Не критично (data у него нет, он невидим в любой выборке), но можно добавить cron-cleanup старых users с `created_at < 7d AND no entries in user_sync`.

### P6: Забыли `trust proxy` — все req.ip == 127.0.0.1

Если Express за nginx и не настроен `app.set('trust proxy', 1)`, все rate-limits работают на loopback IP (127.0.0.1 или `::1`). Один юзер перегружает лимит — все блокируются. **Всегда настраивать!**
