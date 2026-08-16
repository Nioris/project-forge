---
name: deploy-timeweb
description: >
  Timeweb Cloud VPS deployment for SvelteKit + PocketBase. PM2 cluster mode, Nginx with critical proxy
  buffer settings, SSL, ORIGIN env var, subdomain architecture, CI/CD, and automated backups. Use this
  skill for Timeweb, Russian hosting, VPS deployment, PM2 SvelteKit, or Docker deployment Russia.
---

# Deploy Timeweb Skill

Deploy SvelteKit + PocketBase to Timeweb Cloud VPS.

## Architecture

```
Internet → yourdomain.com (:443) → Nginx → SvelteKit (:3000, PM2 cluster)
         → api.yourdomain.com (:443) → Nginx → PocketBase (:8090, systemd)
UFW: Only 22, 80, 443 open. Ports 3000, 8090 bound to 127.0.0.1.
```

## CRITICAL Settings

1. **ORIGIN env var MANDATORY**: `ORIGIN=https://yourdomain.com` — without it SvelteKit form actions fail with CSRF errors.
2. **Nginx proxy_buffer_size**: `proxy_buffer_size 256k; proxy_buffers 4 512k;` — SvelteKit Link preload headers cause 502 without this.
3. **PocketBase on SUBDOMAIN**: `api.yourdomain.com` — PB doesn't support subpath routing.
4. **Build in CI, not on VPS**: 1–2 GB RAM VPS crashes Vite during build. Build in GitHub Actions, rsync artifacts.
5. **PM2 cluster mode**: `pm2 reload` (not restart) for zero-downtime deploys.

## PM2 Config

```js
module.exports = { apps: [{
  name: 'sveltekit', script: 'build/index.js',
  instances: 'max', exec_mode: 'cluster',
  env: {
    NODE_ENV: 'production', PORT: 3000, HOST: '127.0.0.1',
    ORIGIN: 'https://yourdomain.com',
    PROTOCOL_HEADER: 'x-forwarded-proto', HOST_HEADER: 'x-forwarded-host'
  }
}]};
```

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — SSL via Let's Encrypt with auto-renewal.** HSTS header. No mixed content.
2. **E — ORIGIN env var set.** CSRF protection works. Form actions don't 403.
3. **R — Rolling zero-downtime deploys.** `pm2 reload` in cluster mode.
4. **U — Uptime monitoring active.** `/api/health` returns 200. External monitor pings it.
5. **D — Database backup daily to Yandex S3.** `pb_data/` backed up via cron.
6. **D — Docker or PM2 with auto-restart.** Process manager recovers from crashes.
7. **A — Auto-deploy on push to main.** Build in CI → rsync → `pm2 reload`.

## References

- `references/timeweb-deploy.md` — Full PM2 config, Nginx, GitHub Actions, backup script, PocketBase systemd.
