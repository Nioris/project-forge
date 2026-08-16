---
name: release-ok
kind: tactical
description: Release pipeline for Odnoklassniki (OK) Mini App. Integrates FAPI SDK + wrapper, runs pre-submit, builds HTTPS bundle in Release/{project}/ok/. Use when user says "release ok", "собери под одноклассники", "ok-release", "ok mini app".
---

# /release ok

Pipeline для Одноклассники Mini App.

**Источник:** `platforms/ok/` — FAPI wrapper, валидаторы `fapi-sdk`, шаблоны.

## Процесс

### Phase 0 — Creds
- App ID на https://ok.ru/devaccess
- Application URL (свой HTTPS)
- Secret key (только серверная часть)

### Phase 1 — Polish
Те же 6 скилов из `skills/`.

### Phase 2 — FAPI integration
Read: `platforms/ok/README.md` → SDK parameters

```html
<script src="//api.ok.ru/js/fapi5.js"></script>
<script src="ok-sdk-wrapper.js"></script>
```

Copy `platforms/ok/templates/ok-sdk-wrapper.js` into WorkProgress.

```js
await OkSDK.init();           // FAPI.init с URL-параметрами api_server/apiconnection
OkSDK.ready();                 // FAPI.UI.loaded
const user = await OkSDK.getUser();
const lang = OkSDK.getLang();
```

OK передаёт параметры через URL iframe'а: `api_server`, `apiconnection`, `authKey`, `session_key`, `session_secret_key`. Сервер обязан валидировать `sig` (MD5) для критичных операций.

### Phase 3 — Verify + Build

```bash
node platforms/ok/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
```

### Phase 4 — Deploy

```
Release/{Project}/ok/
├── bundle/              # HTTPS-ready
├── app-manifest.md      # для ok.ru/devaccess
└── DEPLOY.md
```

## Non-Negotiable

- [ ] `fapi5.js` подключён
- [ ] `FAPI.init` вызывается с URL-параметрами
- [ ] `FAPI.UI.loaded` вызывается
- [ ] Dev-mode fallback
- [ ] При критичных операциях — серверная валидация `sig`
