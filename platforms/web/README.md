# platforms/web/ — свой HTTPS-хостинг (VPS / Docker / PaaS)

**Статус:** beta — делегирует в `skills/stack/deploy-vps/` и `skills/pwa/deploy-timeweb/`.

## Что делает

Генерирует Dockerfile + nginx.conf + инструкцию деплоя для своего VPS (Timeweb, Selectel, Aruba, Hetzner) или PaaS (Vercel, Netlify, Cloudflare Pages).

## Процесс

```bash
/release web
# или точечно:
Прочитай skills/pwa/deploy-timeweb/ и подготовь Docker+nginx+SSL для WorkProgress/{Project}/
```

## Вывод

```
Release/{Project}/web/
├── Dockerfile
├── nginx.conf
├── .dockerignore
├── bundle/              # статика готовая к COPY в контейнер
└── DEPLOY.md            # 1) build image 2) run on VPS 3) certbot SSL
```

## Варианты деплоя

| Провайдер | Подход |
|---|---|
| Timeweb VPS | Docker + systemd + certbot |
| Selectel/Hetzner | Docker compose + nginx + certbot |
| Vercel | `vercel.json` + push to git |
| Netlify | `netlify.toml` + push |
| Cloudflare Pages | `_headers` + push |
| Yandex S3 static site | `s3 sync` + domain alias |

Претендент выбирается по вопросу Claude при запуске `/release web`.
