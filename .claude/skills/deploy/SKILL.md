---
name: deploy
kind: tactical
description: Deploy project to VPS or web server. Use when user says "deploy", "publish web", "деплой", "на сервер", "запустить на сервере", "хостинг".
---

# Deploy to Server

## Purpose
Deploy web project to VPS via Docker + Nginx + SSL.

## Instructions

### Step 1: Create Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Step 2: Create nginx.conf

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### Step 3: Deploy

```bash
# Build and push
docker build -t app .
docker save app | ssh user@server 'docker load'
ssh user@server 'docker stop app; docker rm app; docker run -d --name app -p 80:80 --restart unless-stopped app'
```

For full deploy setup (SSL, CI/CD, backups), read: `skills/pwa/deploy-timeweb/SKILL.md`

## Non-Negotiable
- [ ] HTTPS configured with valid SSL
- [ ] Docker container auto-restarts
- [ ] Static assets cached properly
- [ ] Health check endpoint exists
