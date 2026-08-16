# platforms/telegram/ — Telegram Mini App

**Статус:** skeleton — базовые валидаторы + SDK-wrapper + templates готовы, runtime-tests ещё не написаны.

## Что такое Telegram Mini App

Веб-приложение, которое открывается внутри Telegram-клиента через бота. Доступ к SDK через `window.Telegram.WebApp`. Хостинг — любой HTTPS-URL, зарегистрированный в BotFather через `/setmenubutton` или инлайн-кнопкой `web_app`.

Документация: https://core.telegram.org/bots/webapps

## Отличия от Yandex

| Аспект | Yandex Games | Telegram Mini App |
|---|---|---|
| Хостинг | Загружаешь ZIP → Yandex S3 | Свой HTTPS-сервер или Vercel/Netlify/Cloudflare Pages |
| Каталог | Yandex Games Console | Bot + BotFather + @BotFather `/setmenubutton` |
| Модерация | Строгая (30+ REQ) | Минимальная, но есть Guidelines |
| SDK | `YaGames.init()` + `LoadingAPI.ready()` | `Telegram.WebApp.ready()` + `.expand()` |
| Ads | Yandex Ads (in-SDK) | Нет официальных ads; сторонние (Adsgram, Telega.in) |
| IAP | Yandex in-SDK | Telegram Stars через `payments` или Bot Payments API |
| Auth | Auto (player.setData/getData) | `initData` + HMAC verification на сервере |
| Languages | 13 обязательных | `user.language_code` — 1 язык за раз, сколько хочешь |

## Требования к входу

В `WorkProgress/{Project}/` должно быть:
- `index.html` (entry point)
- `<script src="https://telegram.org/js/telegram-web-app.js"></script>` в `<head>`
- Обёртка `telegram-sdk-wrapper.js` (шаблон в `templates/`)
- HTTPS-совместимые ассеты (без mixed content, без `http://`)
- Respect for theme params (`colorScheme`, `themeParams`)

## Gate (базовый)

```bash
node platforms/telegram/scripts/pre-submit.mjs WorkProgress/{Project}/
```

Проверки:
1. `telegram-sdk-loaded` — есть ли `<script src=".../telegram-web-app.js">`
2. `ready-expand` — вызывается ли `WebApp.ready()` И `WebApp.expand()` после загрузки
3. `init-data-ref` — использует ли игра `WebApp.initData` (если да — напоминает про серверную HMAC-верификацию)
4. `https-only` — нет ли в HTML/CSS/JS ссылок на `http://` (кроме комментариев)
5. `viewport-meta` — есть ли `<meta viewport>` (Telegram-клиент без этого плохо рендерит)
6. `no-service-worker` — SW в Telegram не работает как ожидается, лучше не использовать

## Что на выходе

```
Release/{Project}/telegram/
├── bundle/                    # HTTPS-ready статика (для Vercel/Netlify/CF Pages)
│   ├── index.html
│   ├── ...
├── bot-manifest.md            # описание для @BotFather (name, description, about, picture)
├── DEPLOY.md                  # инструкция по деплою (Vercel/Netlify/Cloudflare Pages)
└── botfather-commands.txt     # готовые команды для @BotFather:
                                #   /newapp {name}
                                #   /setmenubutton
                                #   /setdescription
```

## Bot-side (серверная часть)

Для HMAC-верификации `initData` (обязательно если игра имеет платежи/сохранения на сервере):

```js
// Node.js example — verify Telegram initData signature
import crypto from 'crypto';

function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calcHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return calcHash === hash;
}
```

Шаблон серверной обёртки — `templates/telegram-server-verify.mjs`.

## Telegram Stars (платежи)

Начиная с Bot API 7.4 — можно принимать Telegram Stars прямо из Mini App через `WebApp.showInvoice(invoiceLink)`. Bot-side создаёт invoice через `createInvoiceLink` с `currency: 'XTR'`. Подробности — в шаблоне `templates/telegram-payments.md`.

## TODO (для будущих версий)

- [ ] runtime-test.mjs — Puppeteer stub для `window.Telegram.WebApp` + probe на ready/expand timing
- [ ] theme-sync validator — проверка что игра адаптируется к `colorScheme`
- [ ] BackButton/MainButton lifecycle validator
- [ ] Stars payment flow validator (если игра использует IAP)
- [ ] Adsgram integration template (if user wants ads)
