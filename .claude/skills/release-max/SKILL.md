---
name: release-max
kind: tactical
description: Release pipeline for MAX messenger Mini App (национальный российский мессенджер от VK). Copies to WorkProgress-max, integrates MAX Bridge + wrapper, runs pre-submit, builds HTTPS-ready bundle + business.max.ru partner manifest in Release/{project}/max/. Use when user says "release max", "собери под max", "макс мессенджер", "max mini app", "max-release".
---

# /release max

Pipeline для MAX Mini App — национального мессенджера РФ от VK.

**Источник:** `platforms/max/` — SDK wrapper с полной Bridge API + 5 валидаторов + pre-submit.

## Prerequisites

MAX требует специфических вещей, которые проще собрать заранее:

- [ ] **Юрлицо РФ или ИП** — обязательно для регистрации на [business.max.ru](https://business.max.ru/self)
- [ ] **Bot token** — создать бота через @MasterBot (бот-создатель MAX)
- [ ] **Название приложения + категория**
- [ ] **Политика конфиденциальности** (шаблон на [dev.max.ru](https://dev.max.ru/docs/legal/privacy))
- [ ] **Пользовательское соглашение** (шаблон на [dev.max.ru](https://dev.max.ru/docs/legal/agreement))
- [ ] **Иконка 512×512+ png**

Если чего-то нет — `/credentials-check` сначала. Claude остановит пайплайн пока не появится.

## Arguments
- no args — полный pipeline
- `bot-setup` — только инструкция для @MasterBot + business.max.ru
- `verify` — только проверка

## Процесс

### Phase 0 — Создать `WorkProgress/{Project}-max/`
```bash
cp -r GameIntegration/{Project}/ WorkProgress/{Project}-max/
```
Суффикс `-max` нужен чтобы не сталкиваться с другими платформами (особенно Telegram — у обоих `window.WebApp`).

### Phase 1 — Polish
Те же 6 скилов из `skills/` что в `/release yandex`. **Но учти:**

- UI должен адаптироваться под light/dark темы (MAX автоматически переключается)
- Рекламы нет — не пиши код для ads API
- Stars-платежей нет — через бота и POST /messages
- MainButton нет — только BackButton в header
- DeviceStorage + SecureStorage (не работают на веб-клиенте!)
- Biometric + NFC доступны (iOS/Android)
- Платформа детектится через `WebApp.platform` → 'ios'|'android'|'desktop'|'web'

### Phase 2 — SDK integration

```html
<!-- В <head> ДО других скриптов -->
<script src="https://st.max.ru/js/max-web-app.js"></script>
<script src="max-sdk-wrapper.js"></script>
```

Копируй `platforms/max/templates/max-sdk-wrapper.js` в `WorkProgress/{Project}-max/`.

Минимальный bootstrap:
```js
await MaxSDK.init();   // no-op на реальном MAX — данные уже предзагружены
// НЕ вызывай ready() / expand() — в MAX их нет!

const user = MaxSDK.getUser();
const lang = MaxSDK.getLang();
const startParam = MaxSDK.getStartParam();

// Forms с возможностью потери данных:
MaxSDK.enableClosingConfirmation();

// Если есть навигация:
MaxSDK.showBackButton(() => history.back());
```

**Для платежей** (через бота):
1. Бот создаёт invoice через POST /messages (открытка с payment-кнопкой)
2. Mini-app получает `mid` сообщения
3. Mini-app: `await MaxSDK.shareMax({ mid, chatType: 'DIALOG' })`
4. Сервер ловит платёж через webhook и активирует товар

**Для auth** (критично):
- Клиент: `const initData = MaxSDK.getInitData()` — передать на сервер
- Сервер: HMAC-SHA256 верификация (шаблон в `platforms/max/templates/verify-webappdata.mjs`)
- **НИКОГДА** не доверять `initDataUnsafe` для чувствительных операций

### Phase 3 — Gate

```bash
node platforms/max/scripts/pre-submit.mjs WorkProgress/{Project}-max/ --verbose
```

5 валидаторов:
1. `sdk-loaded` — `<script src=".../max-web-app.js">` в `<head>`
2. `url-constraints` — нет кириллицы/пробелов в URL (только latin+digits+dot+dash, ≤1024 символа)
3. `https-only` — нет mixed content
4. `initdata-and-conflict` — нет Telegram/MAX SDK коллизии + напоминание про серверную HMAC
5. `gesture-required` — `openLink/downloadFile/shareMaxContent` не в setInterval/setTimeout

Fix blockers → re-run.

### Phase 4 — Deploy

Хостинг — любой HTTPS (Vercel / Netlify / GitHub Pages / Cloudflare Pages / свой VPS).
URL должен быть: ≤1024 символов, только латиница + цифры + точка + дефис.

```
Release/{Project}/max/
├── bundle/                      # HTTPS-ready статика
│   ├── index.html
│   ├── max-sdk-wrapper.js
│   └── ...
├── max-business-setup.md        # пошагово:
│                                  #   1. business.max.ru/self → профиль организации
│                                  #   2. Чат-боты → выбрать бот → Настроить
│                                  #   3. Вставить URL + выбрать кнопку (Открыть/Старт/Играть)
│                                  #   4. Сохранить → модерация → публикация
├── server/                      # опционально: HMAC верификация
│   └── verify-webappdata.mjs    # (из platforms/max/templates/)
├── botfather-alternative.md     # @MasterBot для создания бота
└── DEPLOY.md                    # Vercel/Netlify/CF Pages шаги
```

**DEPLOY.md должен содержать:**
1. Выбор хостинга
2. Шаги деплоя
3. Регистрация на [business.max.ru/self](https://business.max.ru/self)
4. Создание / привязка бота через @MasterBot
5. Подача на модерацию
6. Проверка: открыть бота в MAX → нажать menu-button → Mini App должен запуститься

## Non-Negotiable

- [ ] `max-web-app.js` с `st.max.ru`, не со стороннего CDN
- [ ] `MaxSDK` wrapper используется (НЕ `window.WebApp` напрямую — конфликт с Telegram)
- [ ] Dev-mode fallback работает на `file://`
- [ ] Нет вызовов `ready()` / `expand()` на `window.WebApp` (это Telegram API, MAX их не имеет)
- [ ] Serverная HMAC-верификация initData для любых auth/платежей
- [ ] URL хостинга: latin + digits + dot + dash, ≤1024 символов
- [ ] UI адаптируется к `WebApp.platform` (ios/android/desktop/web)
- [ ] 5 валидаторов возвращают 0 blockers
- [ ] Юрлицо РФ / ИП подготовлено для business.max.ru

## Специфика, которую нельзя забыть

- **MAX предзагружает данные** — `ready()` не нужен; вызывать его на `window.WebApp` = баг (no-op).
- **Нет MainButton** — только BackButton. Основное CTA — кнопка в теле UI.
- **DeviceStorage на веб-клиенте не работает** — используй fallback на localStorage через MaxSDK.
- **Biometric на Android всегда `type: 'unknown'`** — не делай UI-логику зависимой от этого.
- **NFC только на Android** — проверяй `MaxSDK.platform === 'android'`.
- **Shareing через бота:** сначала POST /messages от имени бота → получить `mid` → `shareMaxContent({ mid, chatType })`.
- **Модерация обязательна** — читай `dev.max.ru/docs/legal/rules` до подачи.

## Frontend-design discipline

When creating store-listing HTML, landing pages, promo screens, or any UI surface that users will see, invoke the `frontend-design` skill before writing code. This skill (official Anthropic, 277k+ installs) explicitly fights the "AI slop" aesthetic — generic Inter/Roboto + purple gradients + card layouts that mark output as AI-generated.

The skill enforces:
- **Aesthetic commitment:** pick one direction (brutalist, editorial, maximalist, retro-futuristic) and execute it with purpose
- **Typography discipline:** ban on overused fonts (Inter, Roboto, Arial, Space Grotesk); pair fonts intentionally
- **Color system:** skip the purple gradient default; build a palette that fits the game's genre
- **Motion + spatial composition:** animations that feel intentional, not decorative

Invoke with: `Use the frontend-design skill to build the store listing page for this game.` Skip this step only when the game already has a design system in place that you're preserving.

