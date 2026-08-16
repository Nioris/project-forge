# Timeweb Deployment — Full Reference

## VPS Recommendation

Timeweb Cloud → Cloud Server (VDS), Ubuntu 24.04
Min: 2 vCPU, 2 GB RAM, 40 GB SSD. Region: ru-1 (Moscow).

## Initial Setup

```bash
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
useradd -m -s /bin/bash deploy
```

## PM2 Ecosystem Config

```js
// ecosystem.config.cjs
module.exports = { apps: [{
  name: 'sveltekit',
  script: 'build/index.js',
  instances: 'max',
  exec_mode: 'cluster',
  env: {
    NODE_ENV: 'production',
    PORT: 3000,
    HOST: '127.0.0.1',
    ORIGIN: 'https://yourdomain.com',           // CRITICAL: CSRF fails without this!
    PROTOCOL_HEADER: 'x-forwarded-proto',
    HOST_HEADER: 'x-forwarded-host',
  }
}]};
```

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

## PocketBase systemd Service

```ini
# /etc/systemd/system/pocketbase.service
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=deploy
ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090
Restart=always

[Install]
WantedBy=multi-user.target
```

## Nginx — SvelteKit (CRITICAL: proxy_buffer_size)

```nginx
# /etc/nginx/sites-available/yourdomain.com
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # CRITICAL: Without this, SvelteKit Link preload headers cause 502
    proxy_buffer_size 256k;
    proxy_buffers 4 512k;
    proxy_busy_buffers_size 512k;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Nginx — PocketBase (SUBDOMAIN, not subpath)

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Required for SSE realtime
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    proxy_read_timeout 360s;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Restrict admin panel
    location /_/ {
        # allow YOUR_IP;
        # deny all;
        proxy_pass http://127.0.0.1:8090;
    }
}
```

## GitHub Actions CI/CD (build in CI, not on VPS)

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build

      - name: Deploy to server
        uses: easingthemes/ssh-deploy@v5
        with:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_KEY }}
          REMOTE_HOST: ${{ secrets.HOST }}
          REMOTE_USER: deploy
          SOURCE: "build/ package.json ecosystem.config.cjs"
          TARGET: "/home/deploy/app"

      - name: Restart PM2
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HOST }}
          username: deploy
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd ~/app
            npm ci --omit=dev
            pm2 reload ecosystem.config.cjs
```

## Backup Script

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar czf "/tmp/pb_backup_$DATE.tar.gz" /opt/pocketbase/pb_data
aws s3 cp "/tmp/pb_backup_$DATE.tar.gz" \
  s3://your-bucket/backups/ \
  --endpoint-url https://storage.yandexcloud.net
rm "/tmp/pb_backup_$DATE.tar.gz"
```

Cron: `0 3 * * * /home/deploy/backup.sh >> /var/log/backup.log 2>&1`

## Health Check

```ts
// src/routes/api/health/+server.ts
import { json } from '@sveltejs/kit';
export const GET = () => json({ status: 'ok', ts: Date.now() });
```
