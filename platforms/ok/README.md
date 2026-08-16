# platforms/ok/ — Одноклассники Mini App

**Статус:** skeleton — базовые валидаторы + SDK-wrapper + деплой-шаблон готовы, gate минимальный.

## Что такое OK Mini App

HTML5-приложение, работающее внутри Одноклассников через OK API. SDK подключается через `<script src="//api.ok.ru/js/fapi5.js">` и инициализируется вызовом `FAPI.init(...)`. Хостинг — свой HTTPS. Публикация — через ok.ru/devaccess, Media > Приложения.

Документация: https://apiok.ru/

## Отличия

| Аспект | Yandex Games | OK Mini App |
|---|---|---|
| SDK | YaGames | FAPI (OpenGraph + invokeUIMethod) |
| Auth | Внутри SDK (player.getData) | `FAPI.Client.call('users.getCurrentUser', ...)` + signed params |
| Каталог | Yandex Games Console | ok.ru developer console |
| Модерация | Жёсткая (30+ REQ) | Средняя, много мелких guidelines |
| Ads | Yandex Ads | OK Ads API (interstitial, rewarded) |
| Payments | Yandex IAP | OK invoices (`showOrderBox`) |
| Hosting | Yandex S3 | Свой HTTPS (`application_url` в конфиге приложения) |

## Требования к входу

В `WorkProgress/{Project}/` должно быть:
- `index.html`
- SDK-обёртка `ok-sdk-wrapper.js` (шаблон в `templates/`)
- HTTPS-совместимые ассеты
- Параметры приложения принимаются через URL query (`api_server`, `apiconnection`, `authKey`, `session_key`, `session_secret_key`)

## Gate

```bash
node platforms/ok/scripts/pre-submit.mjs WorkProgress/{Project}/
```

Проверки:
1. `fapi-loaded` — есть ли `<script src="//api.ok.ru/js/fapi5.js">`
2. `fapi-init` — вызывается ли `FAPI.init(apiServer, apiConnection, onSuccess, onError)`
3. `https-only` — нет mixed content (переиспользует код из `telegram/`)
4. `frameorigin-x` — есть ли `X-Frame-Options` совместимость (OK использует iframe)

## Что на выходе

```
Release/{Project}/ok/
├── bundle/              # HTTPS-ready статика
├── app-manifest.md      # параметры для ok.ru/devaccess
└── DEPLOY.md            # инструкция по заливке
```

## TODO

- [ ] Полноценные валидаторы Ads API и invokeUIMethod
- [ ] Validator на URL signature verification (`sig` параметр)
- [ ] Puppeteer smoke test
- [ ] Шаблон серверной части для подписей
