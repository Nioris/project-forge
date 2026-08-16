# Асинхронный мультиплеер Forge — развёртывание

Один VPS, три контейнера: Caddy (TLS сам), API (Node/Fastify), PostgreSQL.

## 1. Подготовка
- домен направлен A-записью на IP сервера (Caddy без домена сертификат не получит);
- в Консоли Яндекс Игр: раздел игры → секретный ключ для проверки подписи → в `.env`;
- порты 80 и 443 открыты.

## 2. Запуск
```
cp .env.example .env      # заполнить DOMAIN, DB_PASSWORD, YANDEX_SECRET, ALLOWED_ORIGINS
docker compose up -d
curl https://<домен>/api/health     # {"ok":true,...}
```

## 3. Подключение игры
```html
<script src="mp-client.js"></script>
```
```js
const MP = createMP({ base: 'https://<домен>/api', ysdk });
await MP.ready();                 // берёт подпись игрока у SDK
const me = await MP.me();
```

## 4. Правила, которые нельзя нарушать
- **ID игрока — только из подписи.** Клиентский getUniqueID() не доверять никогда.
- **Клиент шлёт намерение, сервер считает результат** (`applyAction` в server.mjs — туда логика игры).
- Игра обязана работать БЕЗ сервера: сеть упала → одиночный режим, прогресс в облаке платформы.
- Бэкап базы: `docker compose exec db pg_dump -U forge forge > backup-$(date +%F).sql` по расписанию.

## 5. Что дальше
Realtime-профиль (Colyseus) — `templates/backend/sync/`, ставится рядом тем же compose.
