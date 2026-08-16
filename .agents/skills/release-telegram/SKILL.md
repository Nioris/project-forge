---
name: release-telegram
kind: tactical
description: "Release pipeline for Telegram Mini App. Integrates telegram-web-app.js + wrapper, runs pre-submit, builds HTTPS-ready bundle + BotFather manifest in Release/{project}/telegram/.…"
---

# /release telegram

Pipeline для Telegram Mini App.

**Источник:** `platforms/telegram/` — SDK-wrapper, 4 валидатора, шаблоны.

## Arguments
- no args — полный pipeline
- `bot-setup` — только инструкция для @BotFather
- `verify` — только проверка

## Процесс

### Phase 0 — Bot setup
Клиенту нужно:
1. Бот через @BotFather: `/newbot`
2. Bot token — сохраняется, НЕ коммитится
3. Mini App: `/newapp` → указать bot
4. HTTPS-хостинг для webapp URL

Если чего-то нет — спросить.

### Phase 1 — Polish
Те же 6 скилов из `skills/` что в `/release yandex`. **Но учти:**
- UI должен адаптироваться к `themeParams` (background/text colors)
- Ads API у Telegram нет официального; если нужен — Adsgram или Telega.in
- `MainButton` / `BackButton` вместо кастомных нижних кнопок
- Haptic feedback на ключевые действия
- Stars payments через `WebApp.showInvoice(invoiceLink)` (Bot API 7.4+)

### Phase 2 — SDK + i18n

```html
<!-- In <head> (before anything else) -->
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="telegram-sdk-wrapper.js"></script>
```

Копируй `platforms/telegram/templates/telegram-sdk-wrapper.js` в `WorkProgress/{Project}/`.

Минимальный bootstrap:
```js
await TelegramSDK.init();
TelegramSDK.ready();       // REQUIRED — без этого спиннер навсегда
TelegramSDK.expand();      // полноэкранный режим
const lang = TelegramSDK.getLang();
TelegramSDK.onThemeChanged(applyTheme);
```

Для платежей (Stars):
- Серверная часть создаёт invoice через `createInvoiceLink` с `currency: 'XTR'`
- Клиент: `TelegramSDK.showInvoice(link, onStatus)`
- Бекенд валидирует `pre_checkout_query` и `successful_payment`
- Шаблон верификации initData — `platforms/telegram/templates/telegram-server-verify.mjs`

### Phase 3 — Verify + Build

```bash
node platforms/telegram/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
```

4 проверки:
1. `sdk-loaded` — telegram-web-app.js подключён в `<head>`
2. `ready-expand` — `.ready()` И `.expand()` вызываются
3. `https-only` — нет mixed content
4. `viewport-initdata` — meta viewport + напоминание про серверную HMAC

Fix blockers. Re-run.

### Phase 4 — Deploy

**Bundle для HTTPS:**
```
Release/{Project}/telegram/
├── bundle/                     # статика → Vercel/Netlify/Cloudflare Pages
│   ├── index.html
│   └── ...
├── bot-manifest.md             # name, description, about, picture (для BotFather)
├── botfather-commands.txt      # готовые команды:
│                                 #   /newapp
│                                 #   /setmenubutton
│                                 #   /setdescription
├── server/                     # опционально: HMAC-верификация initData
│   └── verify-init-data.mjs
└── DEPLOY.md                   # Vercel/Netlify/CF Pages + BotFather steps
```

**DEPLOY.md должен содержать:**
1. Выбор хостинга (Vercel/Netlify/Cloudflare Pages/свой VPS)
2. Шаги деплоя
3. URL → `@BotFather` → `/setmenubutton` → вставить URL
4. Проверка: открыть бота в Telegram → нажать menu-button → Mini App должен запуститься

## Non-Negotiable

- [ ] `telegram-web-app.js` в `<head>`, до других скриптов
- [ ] `WebApp.ready()` вызывается ДО взаимодействия пользователя
- [ ] Нет mixed content (`http://...`)
- [ ] Если используется `initData` — в `DEPLOY.md` напоминание про серверную HMAC
- [ ] Dev-mode: wrapper fallback работает вне Telegram
- [ ] `bot-manifest.md` содержит всё для BotFather

## Frontend-design discipline

When creating store-listing HTML, landing pages, promo screens, or any UI surface that users will see, invoke the `frontend-design` skill before writing code. This skill (official Anthropic, 277k+ installs) explicitly fights the "AI slop" aesthetic — generic Inter/Roboto + purple gradients + card layouts that mark output as AI-generated.

The skill enforces:
- **Aesthetic commitment:** pick one direction (brutalist, editorial, maximalist, retro-futuristic) and execute it with purpose
- **Typography discipline:** ban on overused fonts (Inter, Roboto, Arial, Space Grotesk); pair fonts intentionally
- **Color system:** skip the purple gradient default; build a palette that fits the game's genre
- **Motion + spatial composition:** animations that feel intentional, not decorative

Invoke with: `Use the frontend-design skill to build the store listing page for this game.` Skip this step only when the game already has a design system in place that you're preserving.

