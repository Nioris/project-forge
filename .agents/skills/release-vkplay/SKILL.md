---
name: release-vkplay
kind: tactical
description: "Полный пайплайн публикации HTML5 игры на VK Play (vkplay.ru). Phase 0 research + dev account + iframe wrap + JS API + signature verification + payment webhook + публикация."
---

# $release-vkplay — Полный пайплайн релиза на VK Play (vkplay.ru)

## Что эта команда делает (high-level)

HTML5 игра → загружена на твой HTTPS-host → URL вписан в Game card на developers.vkplay.ru → проверена подпись + payment webhook → опубликована.

**ВАЖНО: VK Play (vkplay.ru) ≠ VK Mini Apps (vk.com).** Это **разные** платформы Forge:
- VK Mini Apps → `$release-vk` (skill для vk.com social platform)
- VK Play → этот skill (vkplay.ru gaming portal)

Если есть и то и то — делают **отдельные версии** для каждой.

## Phase 0: Research (MANDATORY)

```
$research-references {жанр} VK Play vkplay browser games монетизация
```

Что Claude должен найти:
- Топ-3-5 игр в жанре на vkplay.ru
- Средняя цена на покупки в катологе
- Какие платёжные хуки используют (rewarded ads / IAP)
- Чем VK Play отличается от Yandex Games для этого жанра

Output → `wiki/research/{Project}-vkplay-references.md`. Stop, ждёт user approval.

## Phase 1: Pre-flight check

### 1.1 Developer account

- ✅ Заявка одобрена на developers.vkplay.ru/welcome (1-3 дня)
- ✅ Game создана в dev panel
- ✅ App ID + Secret Key выданы
- ✅ Юр. лицо или ИП оформлены (для receiving payments)

Если нет — **stop**, объясни на developers.vkplay.ru.

### 1.2 Hosting

VK Play требует HTTPS URL для iframe. Варианты:
- **Self-hosted VPS** (Timeweb/Selectel/etc) — рекомендовано, ты контролируешь сертификаты
- **Vercel/Netlify** — быстро, но возможны issue с CORS если бэкенд на другом домене
- **VK Play hosting** — упоминается в их docs, но обычно медленнее своего

Проверь:
```bash
curl -I https://your-game-url.example/
# Должен быть 200, Content-Type text/html, и валидный SSL
```

## Phase 2: Iframe integration

### 2.1 Скопировать templates

Из `platforms/vkplay/templates/`:
- `vkplay-sdk-wrapper.js` → в твой game src
- `sign-helper.mjs` → server-side (НЕ в client bundle!)
- `auth-server-example.js` → в server/, адаптировать под твою БД

### 2.2 index.html — install code

В `<head>` или начало `<body>`, ДО твоего game-кода:

```html
<!-- VK Play SDK script — точный URL в твоём dev portal Install Code -->
<script src="https://vkplay.ru/embed/v1/sdk.js"></script>

<!-- Wrapper from Forge templates -->
<script src="vkplay-sdk-wrapper.js"></script>

<script>
window.onVKPlaySDKReady = async function(sdk) {
  // sdk теперь доступен. Init wrapper:
  const vkplay = await window.VKPlay.init({ appId: 'YOUR_APP_ID' });

  // Auth params from URL — отправь на твой server для verify
  const auth = await vkplay.validateOnServer('/api/auth/vkplay');
  if (!auth.ok) {
    document.body.innerHTML = '<h1>Auth failed</h1>';
    return;
  }

  // Сохрани sessionToken где удобно (in-memory, не localStorage!)
  window.SESSION_TOKEN = auth.sessionToken;
  window.GAME.start(auth.user);
};
</script>
```

### 2.3 Server endpoint /api/auth/vkplay

Файл `auth-server-example.js` — готовый Express endpoint. Подключи `sign-helper.mjs`, передай в middleware свой `process.env.VKPLAY_SECRET_KEY`. **Никогда** не клади secret в client.

### 2.4 Payments

Когда юзер хочет купить item:

```javascript
async function buyPremium() {
  try {
    const result = await vkplay.openPaymentDialog({
      sku: 'premium_pack',
      amount: 199,            // в рублях
      currency: 'RUB',
      description: 'Premium Pack',
    });
    if (result.status === 'success') {
      // VK Play S2S webhook ужаснула на твой server endpoint
      // server должен grant'нуть item и ответить { status: 'success' }
      // На клиенте — refresh inventory
      await refreshInventory();
    }
  } catch (e) {
    console.error('Payment failed', e);
  }
}
```

Server-side `/api/webhook/vkplay-payment` (см. `auth-server-example.js`):
- Verify hash с secret_key
- Idempotency: проверка order_id (пользователь может ретраить)
- Grant item в DB
- Respond `{ status: 'success', order_id }`

## Phase 3: Pre-submit validation

```bash
node platforms/vkplay/scripts/pre-submit.mjs WorkProgress/{Project}/
```

5 validator'ов:
1. **iframe-init** — VKPlaySDK script + init() call
2. **signature-check** — secret_key НЕ в client bundle (security CRITICAL)
3. **auth-params** — клиент читает uid/hash и отсылает на server для validation
4. **payment-flow** — корректный API (openPaymentDialog), не VKWebAppShowOrderBox (то — VK Mini Apps!)
5. **https-only** — нет http:// в bundle

**Должно показать READY перед публикацией.** Особенно важно — **0 signature-check blockers**, иначе secret leaked.

## Phase 4: Game card на developers.vkplay.ru

Параллельно с phase 2-3, заполни Game card. Запусти `$fill-vkplay` skill — он подскажет:
- Название (рус + англ)
- Описание (≥150 chars, ≤4000)
- Tech description (en, для модерации)
- Скриншоты (минимум 3, формат 16:9 или 4:3)
- Иконка (1024×1024 PNG)
- Loading image (1000×1000) — опционально
- Категория из списка
- Возрастной рейтинг
- Поддерживаемые языки
- Контакты support'а
- Privacy policy URL

## Phase 5: Payment system enable

По умолчанию payment system DISABLED для нового проекта. Чтобы включить:

```
Email: integration@vk.team
Subject: Включение payment system для проекта {App ID}
Body: ИП/ЮЛ подключено, всё проверено, прошу включить payment в production режиме.
```

Или через chat.vkplay.ru.

Без этого `openPaymentDialog` вернёт `{status: error, errcode: 2004}` (No merchant specified).

## Phase 6: Submit на модерацию

В Game card → "Publishing" → Submit for review.

Модерация Vk Play: 3-7 рабочих дней. Проверяют:
- Game реально работает в iframe (часто запускают на их боксе)
- Auth + payment flow корректные
- Нет запрещённого контента (азартные игры под другие правила; политика; крипта)
- Возрастной рейтинг соответствует контенту
- Privacy policy на месте

Если отклонили — **$fix-moderation** + указать "VK Play модерация" с текстом замечаний.

## Phase 7: Post-release

После approve:
- Game появляется на vkplay.ru/app/{GMRID}
- Включается indexing на vkplay.ru search
- Можно настроить promo banners, акции через dev portal

Для аналитики — VK Play Analytics (встроена в dev panel) + опционально подключить Yandex Metrica / Google Analytics через game card.

## Skip conditions

- "skip research" — пропустить Phase 0
- "test only" — phases 1-3 без submit
- "card only" — фокус на Phase 4 (game card filling)

## Что НЕ делает этот skill

- **Не оформляет ИП/ЮЛ** — ручная процедура с VK
- **Не настраивает payment manually** — это email на integration@vk.team
- **Не управляет hosting** — у тебя свой VPS
- **Не делает CDN setup** — VK Play автоматически кеширует ассеты, если у тебя cache headers корректные

## Related

- `$fill-vkplay` — заполнение Game card
- `$vkplay-sdk-integration` — детали JS API (payments, auth, share, leaderboards)
- `$release-ready vkplay` — pre-release check
- `$release-vk` — VK Mini Apps (это **другая** платформа!)
- `platforms/vkplay/README.md` — техническая документация
- Docs: https://documentation.vkplay.ru/
- F2P guide: https://documentation.vkplay.ru/f2p_vkp/

## Non-Negotiable

- [ ] Phase 0 research должен пройти (или explicit skip)
- [ ] secret_key MUST быть в env, НЕ в коде, НЕ в git
- [ ] Auth flow: client → POST {uid, hash, ...} → server verify → session token
- [ ] Hash verification использует timingSafeEqual (см. sign-helper.mjs) — против timing attacks
- [ ] Payment webhook idempotent (по order_id) — VK Play может retry'ить
- [ ] HTTPS обязателен везде — нет http:// в bundle
- [ ] Pre-submit показывает 0 blockers перед публикацией
- [ ] НЕ путать с VK Mini Apps (vk.com) — это разные SDK и разные API
