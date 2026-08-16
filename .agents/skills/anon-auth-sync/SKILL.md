---
name: anon-auth-sync
kind: tactical
description: "Универсальный паттерн анонимной авторизации (без email/пароля) + E2E-шифрованной cloud sync с 5-словной фразой для восстановления на другом устройстве. 152-ФЗ compliant (нет PII…"
---

# Anonymous Auth + E2E Cloud Sync

Универсальный паттерн авторизации и облачной синхронизации без email/пароля. Изначально extracted из работы над Daily Insight (Capacitor PWA → Android, Node.js + SQLite) — переиспользуется без изменений, только имена env/routes под конкретный проект.

---

## Когда использовать этот skill

**Да:**
- Приложение хранит пользовательские данные (заметки, прогресс, настройки, дневник)
- Нужен cross-device sync без friction регистрации
- Стоит задача 152-ФЗ compliance (Россия) — хочется избежать PII на сервере
- Пользовательская база — B2C, не корпоративная (корпоратам email/пароль обычно обязателен)
- Надо быстро стартовать без интеграции OAuth/magic-link/SMS

**Нет:**
- Нужны shared/multi-user features (совместное редактирование, соцсеть) — тут без identity не обойтись
- Серверу нужно отправлять уведомления по email — нет email'а
- Обязателен email-based account recovery (корпоративные policies)

---

## Архитектура в двух фразах

**Auth:** на клиенте генерируется случайный `device_token` (UUID v4) при первом запуске. Он и есть идентификатор пользователя. Сервер `/register` принимает device_token → возвращает JWT. Нет пароля, нет email, нет PII.

**Sync:** данные шифруются на клиенте ключом, выведенным из **5-словной фразы** (BIP39-style, пользователь её запоминает или записывает). Сервер видит только шифротекст + `phrase_hash` (для идемпотентности). При смене устройства юзер вводит фразу → клиент получает ключ → дешифрует облачный бэкап.

---

## Reference files

Все файлы живут в соседнем skill'е `rustore-publish/reference/` (чтобы не дублировать). Ссылки относительные:

### Документация
- [AUTH-SYNC.md](../rustore-publish/AUTH-SYNC.md) — полная 13-разделов инструкция (архитектура, threat model, endpoints, client code, DB schema, rate limits, 152-ФЗ, миграция с email/password)

### Server (Node.js + SQLite reference implementation)
- [reference/auth.js](../rustore-publish/reference/auth.js) — `/register` endpoint, выдача JWT, starter grant
- [reference/sync.js](../rustore-publish/reference/sync.js) — `/upload` и `/download` endpoints, anti-farm gates
- [reference/ip-hash.js](../rustore-publish/reference/ip-hash.js) — HMAC-SHA256 псевдонимизация IP для 152-ФЗ
- [reference/security-log.js](../rustore-publish/reference/security-log.js) — security_events table helper
- [reference/schema.sql](../rustore-publish/reference/schema.sql) — SQL для users + sync_blobs + security_events + cloud_starter_grants

### Client (JS, Capacitor/PWA)
- [reference/client-auth.js](../rustore-publish/reference/client-auth.js) — device_token генерация, JWT refresh
- [reference/client-sync.js](../rustore-publish/reference/client-sync.js) — 5-word phrase generation, E2E encryption (AES-GCM), upload/download

---

## Как интегрировать в новый проект

### 1. Прочитать AUTH-SYNC.md

Это основной документ. Там порядок шагов, threat model, API contract, DB schema.

### 2. Скопировать 7 reference файлов из `rustore-publish/reference/`

Скопируй в свой проект в `server/` и `src/`:
- `auth.js`, `sync.js`, `ip-hash.js`, `security-log.js`, `schema.sql` → `server/`
- `client-auth.js`, `client-sync.js` → `src/`

### 3. Подставить свои значения

- JWT_SECRET, HMAC_SECRET (для ip-hash) — в `.env`
- Имена routes (если нужно разбить `/register` на `/v1/auth/register` и т.д.)
- SQLite путь или адаптировать под другую БД

### 4. Запустить schema.sql

```bash
sqlite3 app.db < server/schema.sql
```

### 5. Smoke-test

- POST `/register` с device_token → получи JWT
- POST `/upload` с JWT + ciphertext → сохранил
- GET `/download?phraseHash=X` → забрал ciphertext

---

## Что это НЕ решает

- **Потеря фразы = потеря данных.** Никакого server-side recovery (это by design — сервер не держит ключ). Пользователь должен записать фразу.
- **Multi-device active sync.** Паттерн предназначен для backup + migration, не для real-time co-editing. Если нужен CRDT-like sync — другое решение.
- **Шейринг данных между пользователями.** Только для private user data.

---

## Анти-паттерны

- **Не храни device_token в plaintext DB.** HMAC его или хэшируй перед записью (рефхак в auth.js — см. `tokenHash` поле).
- **Не логируй raw IP.** Используй `ip-hash.js` → HMAC, и в логах выводи только 8-char тег.
- **Не добавляй PII поля в users table** под соблазном "удобства" — нарушит весь смысл 152-ФЗ compliance.
- **Не делай фразу короче 5 слов.** Энтропия падает ниже 55 бит, брутфорс становится реальным.
- **Не используй одну фразу для шифрования И auth-challenge.** Это разные обязанности, не смешивай.

---

## Связанные skills

- [`rustore-publish`](../rustore-publish/SKILL.md) — RuStore-специфичная публикация. Использует этот же auth/sync паттерн + добавляет платежи.
- [`pwa-convert`](../pwa-convert/SKILL.md) — обёртка HTML5 в Capacitor.
- [`deploy-timeweb`](../deploy-timeweb/SKILL.md) — серверный hosting для sync endpoint'ов.

---

## Откуда паттерн

Протестирован на Daily Insight (Capacitor PWA → Android, Node.js + SQLite). Переносится между проектами без изменений — только имена env/routes/SKU под свой проект. Все файлы в `rustore-publish/reference/` — production-tested, не примеры.
