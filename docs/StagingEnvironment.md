# Staging Environment — общая площадка для всех проектов forge

Прочитай перед тем как поднимать staging для нового проекта. Это описание **существующей** локальной инфраструктуры и правил, как к ней подключаться, а не приглашение катить свой отдельный стек.

Первый проект, который поднял staging: **DroidClean Pro** (`F:/Project/android-optimizer`). Конкретика там — эталон, на который стоит смотреть при повторении. Соответствующий Decision Record: `android-optimizer/wiki/decisions/033-staging-server.md`.

---

## Что такое staging и зачем

- **Prod** — `api.rodrik.dev` → Timeweb (Москва, 72.56.236.84). Real users, HTTPS, все релизы туда.
- **Staging** — `stage.rodrik.dev` → домашняя машина разработчика (77.37.184.252, статический IP). Для dev-цикла: правка → rebuild → тест на телефоне за ~30 секунд вместо 15 минут SSH-деплоя.

Принципы:

- Staging и prod **никогда не делят данные**. Отдельные volumes, отдельные секреты (`TOKEN_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASS`), отдельные БД. Утечка тестового ключа в prod = инцидент.
- Staging **не обязан быть up 24/7**. Домашний интернет падает — падает staging, prod работает.
- На staging можно вайпать volume, ломать схему, катить несовместимые миграции. Осторожность — для prod.
- Client (APK / frontend) должен уметь переключаться между prod и stage флагом сборки, а не ручным редактированием исходников.

---

## Инфраструктура (уже поднята — не трогать дважды)

| Компонент | Значение |
|---|---|
| Домен | `stage.rodrik.dev` и wildcard-потенциал `*.stage.rodrik.dev` у регистратора `rodrik.dev` |
| Внешний IP | `77.37.184.252` (статический, домашний провайдер) |
| Порты | Роутер пробрасывает TCP **80** и **443** на LAN-IP этой машины |
| Хост | Windows + Docker Desktop |
| TLS | Let's Encrypt через HTTP-01 webroot, certbot в docker-compose, renew раз в 12 ч |
| Базовый `nginx` | `nginx:alpine`, слушает :80 (ACME + 301) и :443 (TLS termination, reverse proxy) |

### DNS

Каждому новому проекту нужна A-запись:

- Либо **subdomain**: `myproj.stage.rodrik.dev A 77.37.184.252` — предпочтительно, изолирует cookies / CORS / cert.
- Либо **path prefix** на `stage.rodrik.dev/myproj/` — если лень заводить subdomain. Тогда требования как в `FirstDeployServer.md`: приложение должно само знать свой base-path, иначе ссылки сломаются.

Предпочитай subdomain. Cert выпустим отдельный, никаких path-префиксов в коде.

### Порты 80/443 — один на всю машину

На одной машине физически **один** nginx-контейнер может слушать :80 и :443. Варианты для новых проектов:

1. **Общий nginx (рекомендуется).** Один nginx-контейнер, в его конфиге — server-блоки по `server_name` для каждого subdomain, каждый проксирует на свой upstream container. Compose у каждого проекта поднимает только свой `api`-сервис и подцепляется к общей docker-сети `stagenet`. См. раздел «Как подключить новый проект».
2. **Отдельный nginx на непубличных портах** (например 8080/8443) + внешний reverse proxy — оверкилл, не делаем.

---

## Файлы-эталоны (смотри в android-optimizer)

```
src/server/
├── Dockerfile                   — приложение
├── docker-compose.staging.yml   — api + nginx + certbot
├── init-stage.bat               — first-time bootstrap (self-signed → LE)
├── .env.staging                 — секреты, НЕ в git, .gitignore
└── nginx/
    └── stage.conf               — server-блоки, upstream, SSL
```

Скопируй и адаптируй под свой проект. Не копируй `.env.staging` — сгенерируй свои секреты (`openssl rand -hex 32`).

---

## Compose-шаблон (минимум для нового проекта)

Если подключаешься к общему nginx — свой compose должен содержать только `api`-сервис и attach-иться к внешней сети `stagenet`:

```yaml
services:
  api:
    build: .
    container_name: <myproj>-api-staging
    restart: unless-stopped
    env_file:
      - .env.staging
    environment:
      - DB_PATH=/data/app.db
    volumes:
      - myproj-staging-data:/data
    expose:
      - "NNNN"                 # внутренний порт приложения
    networks:
      - stagenet
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:NNNN/health"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  myproj-staging-data:

networks:
  stagenet:
    external: true            # сеть создал первый проект
```

Если ты **первый** проект на этой машине — бери полный compose из `android-optimizer/src/server/docker-compose.staging.yml`, он поднимает и nginx, и certbot.

---

## nginx — как добавить server-блок для своего subdomain

В общем nginx-конфиге (`src/server/nginx/stage.conf` первого проекта) добавляется ещё один пары server-блоков:

```nginx
upstream myproj_api {
    server myproj-api-staging:NNNN;
    keepalive 16;
}

server {
    listen 80;
    server_name myproj.stage.rodrik.dev;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name myproj.stage.rodrik.dev;

    ssl_certificate     /etc/letsencrypt/live/myproj.stage.rodrik.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myproj.stage.rodrik.dev/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;

    client_max_body_size 1m;

    location / { proxy_pass http://myproj_api; }
}
```

После правки — `docker compose -f docker-compose.staging.yml exec nginx nginx -t && nginx -s reload`.

---

## Выпуск TLS-сертификата для нового subdomain

DNS A-запись должна быть уже пропагирована и возвращать `77.37.184.252` (`nslookup myproj.stage.rodrik.dev 8.8.8.8`).

Изнутри `certbot`-контейнера:

```bash
docker compose -f docker-compose.staging.yml run --rm --no-deps --entrypoint sh certbot -c \
  "certbot certonly --webroot -w /var/www/certbot \
   --non-interactive --agree-tos --email a.a.krasnokutskiy@gmail.com \
   -d myproj.stage.rodrik.dev"

docker compose -f docker-compose.staging.yml exec nginx nginx -s reload
```

Renew — автоматом, общий certbot в loop каждые 12 ч подхватит все домены из `/etc/letsencrypt/renewal/*.conf`.

---

## Client-side: флаг сборки, не правка кода

Как сделано в DroidClean: `build.js --staging` инжектит prelude `var API_BASE = "https://stage.rodrik.dev"`; без флага — prod URL. `build-app.bat --staging` пробрасывает флаг и именует артефакт `...-staging.apk` / `...-staging.zip`. В исходниках **нет хардкода URL** — всё через `API_BASE`.

Правила:

- Никаких `if (DEV) { url = 'stage' }` в runtime-коде. Только build-time подстановка.
- Имя артефакта содержит `staging` — чтобы случайно не опубликовать в RuStore.
- `.env.staging` — в `.gitignore`. Реальные ключи не коммитим.

---

## Bootstrap (первый проект на машине)

Один раз для всей staging-площадки, потом не трогать:

1. DNS `stage.rodrik.dev A 77.37.184.252` (и/или wildcard) → ждём propagation.
2. Роутер: TCP 80 + 443 → LAN-IP машины.
3. Docker Desktop: запущен, порты 80/443 свободны.
4. `.env.staging` со всеми секретами проекта-инициатора.
5. `init-stage.bat` — генерирует bootstrap self-signed cert (nginx должен с чем-то стартовать), поднимает стек, запрашивает реальный LE, reload nginx.
6. Проверка: `curl -I https://stage.rodrik.dev/api/health`.

Для каждого следующего проекта — см. «Как подключить новый проект» выше. Запускать `init-stage.bat` повторно не нужно.

---

## Обычный dev-цикл

```bash
# пересборка только приложения, nginx/certbot не трогаются
docker compose -f docker-compose.staging.yml up -d --build api

# логи
docker compose -f docker-compose.staging.yml logs -f api

# остановить staging (на время отсутствия)
docker compose -f docker-compose.staging.yml down

# поднять обратно
docker compose -f docker-compose.staging.yml up -d
```

---

## Ограничения и риски

- **Домашний интернет / свет падает → staging мёртв.** Не страшно (prod отдельно), но планируй: если нужен удалённый тест с телефона, проверь что машина онлайн.
- **Провайдер может заблокировать :80.** Тогда переезжаем на ACME **DNS-01** challenge (нужен API-токен регистратора `rodrik.dev`). Первый признак — `certbot renew` начал падать с `Connection refused`.
- **Kaspersky / AV MITM-ит TLS локально.** На реальных клиентах не мешает, но если курлишь со своей же машины и видишь странный cert — это AV.
- **Prod-данные НЕ копируются на staging.** Сознательно. Тестовые аккаунты заводи вручную.
- **Один nginx :80/:443 на всю машину.** Второй проект не может поднять свой конкурирующий nginx — только подцепиться к общему.
- **Rate-limit Let's Encrypt:** 50 cert/week на домен верхнего уровня. При активной возне лучше использовать их staging-CA (`--staging` у certbot) до стабилизации.

---

## Диагностика

```bash
# что слушает :80/:443
netstat -ano | findstr ":80 "
netstat -ano | findstr ":443 "

# статус контейнеров
docker ps --filter name=staging

# nginx — валиден ли конфиг
docker compose -f docker-compose.staging.yml exec nginx nginx -t

# срок текущего cert
docker compose -f docker-compose.staging.yml run --rm --entrypoint sh certbot -c \
  "certbot certificates"

# внешняя доступность
curl -sSI https://stage.rodrik.dev/api/health
curl -sSI https://myproj.stage.rodrik.dev/health
```

Если `curl` изнутри LAN возвращает твой LAN-IP cert вместо LE — проверь hairpin NAT на роутере (или проверяй с мобильного интернета).

---

## Чеклист для нового проекта forge, который хочет staging

- [ ] Завёл A-запись `myproj.stage.rodrik.dev` → `77.37.184.252`, пропагация прошла.
- [ ] Написал `Dockerfile` приложения (тот же что для prod — staging отличается только env и URL).
- [ ] Создал `docker-compose.staging.yml` с `api`-сервисом на внешней сети `stagenet` и healthcheck'ом.
- [ ] Сгенерировал `.env.staging` с уникальными секретами, добавил в `.gitignore`.
- [ ] Добавил два server-блока в общий `stage.conf` (HTTP → redirect, HTTPS → upstream).
- [ ] Запросил LE cert через `certbot certonly --webroot`, перезагрузил nginx.
- [ ] Build клиента поддерживает `--staging` флаг, инжектит staging API_BASE, именует артефакт с суффиксом `-staging`.
- [ ] Проверил `https://myproj.stage.rodrik.dev/health` снаружи.
- [ ] Задокументировал в своём `wiki/decisions/NNN-staging-*.md` (см. 033 в android-optimizer как образец).

---

## Related

- `FirstDeployServer.md` — правила prod-сервера `api.rodrik.dev`.
- `android-optimizer/wiki/decisions/033-staging-server.md` — исходное решение, детальный контекст.
- `android-optimizer/src/server/docker-compose.staging.yml` — рабочий эталон compose.
- `android-optimizer/src/server/init-stage.bat` — рабочий эталон bootstrap-скрипта.
- `android-optimizer/src/server/nginx/stage.conf` — рабочий эталон nginx-конфига.
