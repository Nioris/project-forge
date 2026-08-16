---
name: release-web
kind: tactical
description: Release pipeline for web hosting (VPS / Docker / PaaS). Generates Dockerfile + nginx.conf + deploy guide in Release/{project}/web/. Use when user says "release web", "собери под web", "deploy vps", "docker build".
---

# /release web

Pipeline для своего HTTPS-хостинга.

**Источник:** `platforms/web/` + `skills/stack/deploy-vps/` + `skills/pwa/deploy-timeweb/`.

## Варианты деплоя

Спроси пользователя:
1. Свой VPS (Timeweb, Selectel, Hetzner) — Docker + nginx + certbot
2. PaaS (Vercel / Netlify / Cloudflare Pages) — push to git
3. S3 static site (Yandex S3 / Cloudflare R2 / AWS S3)

## Процесс

### Phase 1 — Build bundle

Минифицируй, оптимизируй ассеты. Если игра использует модули — bundle через esbuild/vite.
Результат в `Release/{Project}/web/bundle/`.

### Phase 2 — Infrastructure

Read skill: `skills/pwa/deploy-timeweb/SKILL.md` (для VPS) или `skills/stack/deploy-vps/`.

Сгенерируй:

**Dockerfile** (multi-stage):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**nginx.conf:**
- gzip для `.js/.css/.html`
- cache-control для статики
- SPA fallback: `try_files $uri /index.html`
- HTTPS редирект (если SSL через certbot на хосте)

**docker-compose.yml** (для VPS):
```yaml
services:
  web:
    build: .
    ports: ["80:80"]
    restart: unless-stopped
```

### Phase 3 — CI/CD (опционально)

Если пользователь хочет — `.github/workflows/deploy.yml` или `.gitlab-ci.yml` для auto-deploy на push в main.

### Phase 4 — SSL

Для VPS — certbot через Let's Encrypt:
```bash
certbot --nginx -d {domain}
```

Для PaaS — SSL автоматический.

## Выход

```
Release/{Project}/web/
├── bundle/              # статика (для любого хостинга)
├── Dockerfile           # для VPS/Docker
├── nginx.conf
├── docker-compose.yml
├── vercel.json          # если Vercel выбран
├── netlify.toml         # если Netlify
└── DEPLOY.md            # пошаговая инструкция для выбранного варианта
```

## Non-Negotiable

- [ ] Bundle не содержит development-артефактов (console.log, debug-панелей)
- [ ] nginx.conf имеет gzip и правильные cache-control headers
- [ ] SSL настроен (не plain HTTP)
- [ ] `DEPLOY.md` пошагово для конкретного выбранного хостинга

## Frontend-design discipline

When creating store-listing HTML, landing pages, promo screens, or any UI surface that users will see, invoke the `frontend-design` skill before writing code. This skill (official Anthropic, 277k+ installs) explicitly fights the "AI slop" aesthetic — generic Inter/Roboto + purple gradients + card layouts that mark output as AI-generated.

The skill enforces:
- **Aesthetic commitment:** pick one direction (brutalist, editorial, maximalist, retro-futuristic) and execute it with purpose
- **Typography discipline:** ban on overused fonts (Inter, Roboto, Arial, Space Grotesk); pair fonts intentionally
- **Color system:** skip the purple gradient default; build a palette that fits the game's genre
- **Motion + spatial composition:** animations that feel intentional, not decorative

Invoke with: `Use the frontend-design skill to build the store listing page for this game.` Skip this step only when the game already has a design system in place that you're preserving.

