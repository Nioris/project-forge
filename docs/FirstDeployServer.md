# CLAUDE.md — Правила работы на сервере

Прочитай полностью перед любым действием. Это жёсткие требования, не рекомендации.

---

## Сервер

- **IP:** 72.56.236.84
- **ОС:** Ubuntu 24.04
- **Ресурсы:** 2 CPU, 4 GB RAM, 50 GB NVMe, swap нет
- **Домен:** `api.rodrik.dev` → 72.56.236.84
- **HTTPS:** certbot (Let's Encrypt), сертификат уже выпущен на `api.rodrik.dev`
- Ресурсов мало. Не ставь тяжёлое без согласования (Elasticsearch, Redis Cluster, Kafka и т.д.).

---

## Первое действие — аудит

Перед тем как что-либо делать, выполни и покажи мне результат:

```bash
ss -tlnp                                          # занятые порты
docker ps                                         # контейнеры
pm2 list 2>/dev/null                              # Node.js процессы
systemctl list-units --type=service --state=running --no-pager
cat /etc/nginx/sites-enabled/*                    # nginx конфиги
ls /opt/                                          # приложения
free -h && df -h                                  # ресурсы
```

Ничего не делай, пока не покажешь мне что сейчас работает. Не ломай чужое.

---

## Архитектура — ГЛАВНОЕ ПРАВИЛО

Все приложения живут на **одном домене** `api.rodrik.dev`, каждое — под **своим префиксом**:

```
https://api.rodrik.dev/<имя-приложения>/          — само приложение
https://api.rodrik.dev/<имя-приложения>/admin/     — его админка
https://api.rodrik.dev/<имя-приложения>/api/       — его API
https://api.rodrik.dev/<имя-приложения>/static/    — его статика
```

### Запрещено

- Вешать приложение на корень `/`
- Создавать `/admin`, `/api`, `/static` первым уровнем без имени приложения
- Использовать голый IP (`http://72.56.236.84/...`) — только `https://api.rodrik.dev/...`
- Менять существующие location-блоки других приложений

### Base path в приложении — ОБЯЗАТЕЛЬНО

Nginx-проксирование **недостаточно**. Приложение **само** должно знать свой префикс, иначе ссылки, статика и JS будут ссылаться на `/` и ломаться:

| Фреймворк | Настройка |
|---|---|
| **Astro** | `base: '/<имя>'` в `astro.config.mjs` |
| **Next.js** | `basePath: '/<имя>'` в `next.config.js` |
| **Nuxt** | `app: { baseURL: '/<имя>/' }` в `nuxt.config.ts` |
| **Django** | `FORCE_SCRIPT_NAME = '/<имя>'`, `STATIC_URL = '/<имя>/static/'` |
| **FastAPI** | `app = FastAPI(root_path='/<имя>')` |
| **Express** | `app.use('/<имя>', router)` |
| **Flask** | `APPLICATION_ROOT = '/<имя>'` или Blueprint с `url_prefix` |

Если используешь другой фреймворк — найди его аналог base path. Не пропускай этот шаг.

---

## Nginx

### Один server-блок, много location-блоков

На сервере **один** server-блок для `api.rodrik.dev` с SSL (управляется certbot). Все приложения — это location-блоки **внутри него**.

- **Конфиг:** `/etc/nginx/sites-available/api-rodrik-dev` — единственный source of truth
- **Симлинк:** `/etc/nginx/sites-enabled/api-rodrik-dev` → `sites-available/api-rodrik-dev` (исправлено 2026-04-09)
- **Один файл — все приложения.** Дубли (отдельные файлы на приложение) удалены. Все location-блоки живут в одном server-блоке.
- **Редактируй `sites-available`** — симлинк подхватит автоматически
- **Не создавай** второй server-блок на `api.rodrik.dev` — будет конфликт
- **Не создавай** отдельные файлы в `sites-enabled` для каждого приложения — все в одном файле
- **Не трогай** SSL-блоки — ими управляет certbot
- **Не перезаписывай** `/etc/nginx/nginx.conf`
- **Не используй `sed -i`** для вставки многострочных блоков — ломает форматирование. Используй метод head/cat/tail через temp файл
- **Бэкапы** хранить в `/root/nginx-backup-YYYYMMDD/`, **НЕ** в `sites-enabled` (nginx подхватывает все файлы оттуда)

### Шаблон location для нового приложения

Дописывай **в существующий server-блок**:

```nginx
# <имя-приложения>
location /<имя-приложения>/ {
    proxy_pass http://127.0.0.1:<порт>/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /<имя-приложения> {
    return 301 /<имя-приложения>/;
}
```

### Перед любым изменением nginx

1. Бэкап: `cp /etc/nginx/sites-enabled/api-rodrik-dev /etc/nginx/sites-enabled/api-rodrik-dev.bak.$(date +%s)`
2. Правка — **только в `sites-enabled`**, только добавление нового location-блока
3. **Вставка блока** — через temp файл:
   ```bash
   # Найти строку для вставки (перед listen 443 или перед другим блоком)
   LINE=$(grep -n 'listen 443 ssl' /etc/nginx/sites-enabled/api-rodrik-dev | head -1 | cut -d: -f1)
   # Записать новый блок в temp
   cat > /tmp/new_block.conf << 'EOF'
       # новый-блок
       location /app/ { ... }
   EOF
   # Собрать файл
   head -n $((LINE-1)) /etc/nginx/sites-enabled/api-rodrik-dev > /tmp/merged.conf
   cat /tmp/new_block.conf >> /tmp/merged.conf
   tail -n +$LINE /etc/nginx/sites-enabled/api-rodrik-dev >> /tmp/merged.conf
   cp /tmp/merged.conf /etc/nginx/sites-enabled/api-rodrik-dev
   ```
4. `nginx -t` — **ОБЯЗАТЕЛЬНО**
5. Если упал — откати из бэкапа, покажи ошибку
6. Если ОК — `systemctl reload nginx`
7. **Проверить ВСЕ приложения** после reload:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' https://api.rodrik.dev/daily-insight/
   curl -s -o /dev/null -w '%{http_code}' https://api.rodrik.dev/astroscope/
   curl -s -o /dev/null -w '%{http_code}' https://api.rodrik.dev/droidclean/
   curl -s -o /dev/null -w '%{http_code}' https://api.rodrik.dev/plantbuddy/health
   # Все должны вернуть 200. Если нет — откатить из бэкапа!
   ```

### Защита админки (обязательно)

Используй хотя бы одно:
- `auth_basic` + `.htpasswd`
- `limit_req` для rate limiting
- IP whitelist (`allow`/`deny`)

---

## Деплой нового приложения — порядок

1. Приложение в `/opt/<имя>/`, настроен base path
2. Запущено на порту из диапазона **8100–8999**, забинжено на `127.0.0.1`
3. Бэкап nginx-конфига
4. Добавить location-блок в существующий server-блок `api-rodrik-dev`
5. `nginx -t` → `systemctl reload nginx`
6. Проверить: `curl -I https://api.rodrik.dev/<имя>/`
7. Проверить что остальные приложения не сломались

---

## Порты

- Перед использованием: `ss -tlnp | grep :<порт>`
- Новые приложения — диапазон **8100–8999**
- Биндь **только на 127.0.0.1** — наружу ходит nginx с HTTPS

---

## Файловая структура

```
/opt/<имя-приложения>/    — код приложения
```

Не клади проекты в `/root/`, `/home/`, `/var/www/`, `/tmp/`.

---

## Процесс-менеджер

| Стек | Как запускать |
|---|---|
| **Node.js** | PM2: `pm2 start ... --name <имя>`, потом `pm2 save` |
| **Python** | systemd: `/etc/systemd/system/<имя>.service` |
| **Docker** | `docker-compose.yml` в `/opt/<имя>/`, порты на `127.0.0.1` |

---

## База данных

- Перед установкой СУБД — предупреди меня (RAM мало).
- Для каждого приложения — **отдельная база и отдельный юзер**.
- Для лёгких проектов предпочитай SQLite.

---

## Бэкапы и безопасность

- **Перед любым изменением** конфига: `cp файл файл.bak.$(date +%s)`
- Не отключай `fail2ban`, `zabbix-agent`, `sshd`
- Не удаляй `.htpasswd` файлы
- Не делай `rm -rf` в `/opt/`, `/etc/nginx/`
- Не открывай порты наружу напрямую — всё через nginx + HTTPS

---

## При ошибке

1. Откати из бэкапа
2. Проверь: `nginx -t`, `docker ps`, `pm2 list`, `systemctl status nginx`
3. Покажи мне ошибку
4. **Не чини** без моего подтверждения

---

## Чеклист перед деплоем

- [ ] Аудит сервера выполнен, результат показан мне
- [ ] Приложение настроено с base path `/<имя>/`
- [ ] Порт свободен и забинден на 127.0.0.1
- [ ] Бэкап **`sites-enabled/api-rodrik-dev`** сделан (НЕ sites-available!)
- [ ] Новый location-блок добавлен **напрямую в `sites-enabled`** (через head/cat/tail, НЕ sed)
- [ ] `nginx -t` проходит
- [ ] Работает по `https://api.rodrik.dev/<имя>/`
- [ ] Админка защищена (auth_basic / rate limit / IP whitelist)
- [ ] **ВСЕ существующие приложения проверены** (daily-insight, astroscope, droidclean, plantbuddy — все 200)
- [ ] `free -h` — RAM не кончилась
- [ ] Diff изменений показан мне до применения

## Известные грабли

- **`sed -i` для многострочных блоков** — ломает переносы строк в nginx конфиге. Использовать метод через temp файл (head/cat/tail).
- **После nginx reload** — обязательно проверить ВСЕ приложения, не только новое. Если хоть одно упало — откатить из бэкапа.
- **Бэкапы в sites-enabled** — nginx подхватывает ВСЕ файлы в этой папке. `.bak` файлы создают duplicate server_name warnings. Хранить бэкапы в `/root/nginx-backup-YYYYMMDD/`.
- **Дубли конфигов** — 2026-04-09 обнаружен отдельный файл `sites-enabled/droidclean` с дублирующими location-блоками. Удалён. Все приложения должны быть в одном файле `api-rodrik-dev`.
- **`limit_req_zone`** — определён на уровне http (вне server block) в `api-rodrik-dev`. Если удалить файл — rate limiting сломается у всех.
