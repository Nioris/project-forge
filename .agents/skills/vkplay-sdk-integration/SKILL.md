---
name: vkplay-sdk-integration
kind: tactical
description: "Deep integration VK Play JS API: payments (openPaymentDialog + webhook), auth (uid+hash signing), share, leaderboards через HTTP API, achievements через HTTP, iframe resize…"
---

# $vkplay-sdk-integration — Deep VK Play API integration

Используется когда `$release-vkplay` базовый flow (auth + iframe init) уже работает и нужно добавить отдельные features.

## Платежи (in-game purchases)

### Setup

1. **Payment system enable** — email integration@vk.team (см. `$release-vkplay` Phase 5)
2. В dev portal → твой проект → "Платежи" → создай **products** (SKUs):
   - SKU ID (e.g. `gem_pack_100`)
   - Название (русское + английское)
   - Цена в рублях
   - Тип: consumable / non-consumable / subscription
3. **Webhook URL** в payment settings — твой `/api/webhook/vkplay-payment`

### Client side

```javascript
async function buyItem(skuId, amount, description) {
  try {
    const result = await window.VKPlay.openPaymentDialog({
      sku: skuId,
      amount: amount,
      currency: 'RUB',
      description: description,
    });

    if (result.status === 'success') {
      // Webhook УЖЕ ДОЛЖЕН был сработать на server'е и granted item.
      // На клиенте — refresh inventory от сервера.
      await refreshInventoryFromServer();
      showToast('Purchase complete!');
    } else if (result.status === 'cancel') {
      // User cancelled — нормально, не показывай error
    } else {
      console.error('Payment failed', result);
      showToast('Payment failed, try again');
    }
  } catch (e) {
    console.error(e);
    showToast('Payment error');
  }
}
```

### Server side (webhook handling)

`platforms/vkplay/templates/auth-server-example.js` имеет webhook endpoint. Critical:

1. **Verify hash** через `verifyVKPlayHash(req.body, SECRET)` — иначе attacker может grant'нуть items без оплаты
2. **Idempotency** — сохрани `order_id` в DB, если уже processed → respond `success` без grant'а (VK Play может retry)
3. **Atomic grant + log** — в одной transaction записать payment record + grant item
4. **Respond fast** (<5 sec) — иначе VK Play считает webhook failed и retry'ит

### Test mode

В dev portal payment settings есть "Test mode". Включи для dev:
- Test purchases не charge реальные деньги
- Test cards bank-issued (информация в dev portal)
- Webhook прилетает на твой test endpoint (можно отдельный URL)
- НЕ забудь выключить test mode перед production

## Auth deep-dive

### Получение user info после verify

После `/api/auth/vkplay` server'а вернул `{sessionToken, user}`, используй sessionToken во всех subsequent API calls.

```javascript
class VKPlayAPI {
  constructor(sessionToken) {
    this.token = sessionToken;
  }

  async fetch(endpoint, opts = {}) {
    return fetch(endpoint, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...(opts.headers || {}),
      },
    });
  }

  async getProfile() {
    const r = await this.fetch('/api/me');
    return r.ok ? await r.json() : null;
  }
}
```

### Re-auth flow

Если sessionToken expired (server returns 401), re-run auth:
```javascript
const auth = await window.VKPlay.validateOnServer('/api/auth/vkplay');
window.SESSION_TOKEN = auth.sessionToken;
```

VK Play `hash` параметр действует **на сессию iframe**, а не is permanent. При reload iframe — новый hash. Поэтому твой server должен на каждом /auth выдавать НОВЫЙ session token.

## Leaderboards (через server-side HTTP API)

VK Play **не имеет** in-iframe JS SDK для leaderboards (на отличие от Steam/Yandex). Используй свой backend.

### Schema

```sql
CREATE TABLE leaderboards (
  id BIGSERIAL PRIMARY KEY,
  user_vkplay_id VARCHAR(20) NOT NULL,
  leaderboard_name VARCHAR(64) NOT NULL,
  score BIGINT NOT NULL,
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON leaderboards(leaderboard_name, score DESC);
CREATE UNIQUE INDEX ON leaderboards(user_vkplay_id, leaderboard_name);
```

### API endpoints

```javascript
// POST /api/leaderboard/submit
// body: { name: 'level1_score', score: 12345 }
// auth: Bearer sessionToken
app.post('/api/leaderboard/submit', authMiddleware, async (req, res) => {
  const { name, score } = req.body;
  const userId = req.user.vkplayId;

  // Upsert keep-best
  await db.query(`
    INSERT INTO leaderboards (user_vkplay_id, leaderboard_name, score)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_vkplay_id, leaderboard_name)
    DO UPDATE SET score = GREATEST(leaderboards.score, $3),
                  updated_at = NOW()
  `, [userId, name, score]);

  res.json({ ok: true });
});

// GET /api/leaderboard/:name?limit=10&around=user_id
app.get('/api/leaderboard/:name', authMiddleware, async (req, res) => {
  const { name } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);

  const top = await db.query(`
    SELECT user_vkplay_id, score,
           ROW_NUMBER() OVER (ORDER BY score DESC) as rank
    FROM leaderboards
    WHERE leaderboard_name = $1
    ORDER BY score DESC
    LIMIT $2
  `, [name, limit]);

  res.json({ top: top.rows });
});
```

### Display

Так как VK Play не передаёт user names через JS API (только uid), для display "MyUserName" — fetch user info через VK Play OAuth API на сервере:
- https://api.vk.com/method/users.get?user_ids={uid}&access_token={service_key}

## Achievements (через HTTP)

Аналогично leaderboards — нет in-iframe SDK, делаешь через свой server.

### Schema
```sql
CREATE TABLE user_achievements (
  user_vkplay_id VARCHAR(20),
  achievement_id VARCHAR(64),
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_vkplay_id, achievement_id)
);
```

### Flow
1. Game logic detects condition (e.g. "killed 100 enemies")
2. Client → `POST /api/achievement/unlock {id: 'achievement_100_kills'}`
3. Server: insert if not exists → respond
4. Client: show toast / show in achievement UI

VK Play platform не показывает achievement notification automatically — твоё in-game UI показывает.

## Iframe resize

```javascript
const sdk = await window.VKPlay.init({appId: 'YOUR_APP_ID'});

// Когда нужно изменить размер (e.g. landscape → portrait pivot)
sdk.requestResize({ width: 1280, height: 720 });

// Reactive resize при window resize
window.addEventListener('resize', () => {
  sdk.requestResize({
    width: Math.min(window.innerWidth, 1920),
    height: Math.min(window.innerHeight, 1080)
  });
});
```

VK Play platform может ограничить maximum size (depending on user device). Тестируй на mobile + desktop.

## Share / invite

```javascript
async function inviteFriend() {
  try {
    const result = await sdk.shareToFriend({
      title: 'Играй со мной!',
      description: 'Шикарная игра, я завис уже на 5 час',
      url: window.location.href, // или с ref-param
    });
    console.log('Shared:', result);
  } catch (e) {
    console.error(e);
  }
}
```

## Locale detection

```javascript
const params = window.VKPlay.getAuthParams();
const locale = params.locale || 'ru';

// Apply translations
loadLocale(locale);
```

VK Play поддерживает `ru`, `en`. Другие тренируется как fallback на `en`.

## Что НЕ покрывает этот skill

- **VK Play Cloud Gaming** — это streaming native games (не HTML5), отдельный продукт
- **Multiplayer real-time** — VK Play не имеет networking primitives, делай свой WebSocket server
- **Anti-cheat** — нет integrated solution, только обычные web client mitigations (server validation всех game actions)

## Related

- `$release-vkplay` — base pipeline
- `$fill-vkplay` — Game card filling
- `platforms/vkplay/README.md` — architecture
- `platforms/vkplay/templates/sign-helper.mjs` — server-side hash verification
- Docs: https://documentation.vkplay.ru/f2p_vkp/

## Non-Negotiable

- [ ] secret_key ВСЕГДА в env, NEVER в client code или git
- [ ] Webhook signature verified ДО grant'а в DB
- [ ] Webhook idempotent по order_id
- [ ] Test mode выключен ПЕРЕД production
- [ ] Leaderboard / achievement через ТВОЙ backend, не in-iframe SDK
- [ ] sessionToken не сохраняется в localStorage (используй memory)
- [ ] HTTPS обязателен везде (mixed-content blocks игру)
