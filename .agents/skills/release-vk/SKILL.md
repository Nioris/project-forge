---
name: release-vk
kind: tactical
description: "Release pipeline for VK Mini Apps. Copies to WorkProgress, integrates VK Bridge, runs verify-vk, builds deployable bundle to Release/{project}/vk/. Use when user says \"release…"
---

# /release vk

Pipeline для VK Mini Apps (включая OK и Mail.ru каталоги).

**Источник:** `platforms/vk/` + `skills/pwa/auth-vk/` + `scripts/verify-vk.mjs`.

## Arguments
- no args — полный pipeline
- `bridge` — только VK Bridge integration
- `verify` — только проверка

## Процесс

### Phase 0 — Credentials
- App ID → https://vk.com/editapp
- Bridge version: последний — https://dev.vk.com/ru/mini-apps/packages/vk-bridge
- Если IAP: VK Pay продукты в кабинете

### Phase 1 — Polish
Как в `/release yandex` phase 1 — те же 6 скилов из `skills/`.

### Phase 2 — VK Bridge integration
Read skill: `skills/pwa/auth-vk/SKILL.md`

```bash
npm install @vkontakte/vk-bridge
```

```js
import bridge from '@vkontakte/vk-bridge';
bridge.send('VKWebAppInit');  // FIRST, before UI
```

Обязательно:
- `VKWebAppInit` до любого UI
- Локализация (VK Bridge даёт `VKWebAppGetUserInfo` с `.lang_id`)
- Dev-mode: fallback если `bridge.isEmbedded() === false`
- Purchases: `VKWebAppShowOrderBox`
- Ads: `VKWebAppShowNativeAds` + `VKWebAppCheckNativeAds`

### Phase 3 — Verify + Build

```bash
node platforms/vk/scripts/pre-submit.mjs WorkProgress/{Project}/
node scripts/verify-vk.mjs WorkProgress/{Project}/
```

Fix blockers. Re-run.

```bash
# Deploy через VK hosting:
cd WorkProgress/{Project}
npx @vkontakte/vk-miniapps-deploy

# Или свой HTTPS — положи bundle в Release/{Project}/vk/bundle/
```

## Выход

```
Release/{Project}/vk/
├── bundle/              # статика для VK hosting или свой HTTPS
├── vk-config.json       # app_id, scopes, endpoints
├── manifest.json
└── DEPLOY.md            # инструкция по заливке в каталог
```

## Non-Negotiable

- [ ] `VKWebAppInit` вызывается ПЕРВЫМ, до рендера
- [ ] Dev-mode fallback работает на `file://`
- [ ] `verify-vk.mjs` возвращает 0 blockers
- [ ] `@vkontakte/vk-bridge` актуальной версии (web_search перед установкой)

## Frontend-design discipline

When creating store-listing HTML, landing pages, promo screens, or any UI surface that users will see, invoke the `frontend-design` skill before writing code. This skill (official Anthropic, 277k+ installs) explicitly fights the "AI slop" aesthetic — generic Inter/Roboto + purple gradients + card layouts that mark output as AI-generated.

The skill enforces:
- **Aesthetic commitment:** pick one direction (brutalist, editorial, maximalist, retro-futuristic) and execute it with purpose
- **Typography discipline:** ban on overused fonts (Inter, Roboto, Arial, Space Grotesk); pair fonts intentionally
- **Color system:** skip the purple gradient default; build a palette that fits the game's genre
- **Motion + spatial composition:** animations that feel intentional, not decorative

Invoke with: `Use the frontend-design skill to build the store listing page for this game.` Skip this step only when the game already has a design system in place that you're preserving.

