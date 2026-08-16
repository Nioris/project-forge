# platforms/vk/ — VK Mini Apps

**Статус:** beta — использует `scripts/verify-vk.mjs` из корня и skills из `skills/pwa/auth-vk/`.

## Что делает

HTML5-приложение, работающее внутри VK (vk.com/apps) через VK Bridge. Поддерживает также OK и Mail.ru каталоги. Деплой — через `@vkontakte/vk-miniapps-deploy` или свой HTTPS.

Документация: https://dev.vk.com/ru/mini-apps/

## Gate

```bash
# Existing verifier from Forge root:
node scripts/verify-vk.mjs WorkProgress/{Project}/

# Plus platform-specific pre-submit:
node platforms/vk/scripts/pre-submit.mjs WorkProgress/{Project}/
```

## Требования

- `@vkontakte/vk-bridge` установлен и импортирован (не оставлять `vk-connect`)
- `bridge.send('VKWebAppInit')` вызывается первым
- Для авторизации — `VKWebAppGetAuthToken` с scope
- `manifest.json` + `vk-config.json` с ID приложения

## Вывод

```
Release/{Project}/vk/
├── bundle/              # готовая статика для @vkontakte/vk-miniapps-deploy
├── vk-config.json
├── manifest.json
└── DEPLOY.md
```

## TODO (следующие итерации)

- [ ] Полноценные validator'ы Bridge-timing (VKWebAppInit до UI-рендера)
- [ ] VK Ads validator
- [ ] VK Pay validator
- [ ] Puppeteer smoke test с mock VK Bridge
