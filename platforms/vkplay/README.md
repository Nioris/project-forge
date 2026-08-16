# VK Play Games (vkplay.ru) Platform Integration

VK Play (vkplay.ru) — платформа от VK для PC и браузерных игр. Не путать с **VK Mini Apps** (vk.com Mini Apps, отдельная платформа в `platforms/vk/`).

## VK Play vs VK Mini Apps — критичное различие

| Что | VK Mini Apps (`platforms/vk/`) | VK Play (`platforms/vkplay/`) |
|---|---|---|
| Где живёт | vk.com внутри VK социалки | vkplay.ru — отдельный игровой портал |
| URL шаблон | `vk.com/app{id}` | `vkplay.ru/app/{GMRID}` |
| SDK | VK Bridge (postMessage с vk.com) | VKPlay JS API (postMessage + secret-key signing) |
| Тип | Браузер + iframe внутри VK | Браузер iframe + опционально клиент Game Center |
| Аудитория | VK социал, ~80M MAU | Геймеры, оверлап с Steam/Yandex |
| Auth | VK access_token | VK Play user_id + signature (HMAC) |
| Payments | VK Pay (rubles) | VK Play Wallet (rubles, более выгодные условия для разработчиков) |
| Документация | dev.vk.com | documentation.vkplay.ru |
| Dev portal | vk.com/dev | developers.vkplay.ru |

Если есть и то и то — **обычно делают версию для каждой**, потому что разные требования и разная аудитория.

## Architecture

VK Play HTML5 game живёт в iframe на `vkplay.ru/app/{GMRID}`. Платформа передаёт user_id и подпись через query params, твой код должен:
1. Получить параметры из `window.location.search` (`uid`, `hash`, `app_id`, etc)
2. **Проверить подпись на сервере** (md5(secret_key + sorted_params))
3. Использовать VK Play JS API для платежей и других действий
4. Отвечать на postMessage от родительской страницы (resize, focus, visibility)

```
vkplay.ru/app/{GMRID}
        ↓ iframe загружает твой URL
your-host.com/index.html
        ↓ парсит uid/hash/app_id из query
        ↓ POST /api/auth → server проверяет hash на secret_key
        ↓ если OK — игра запускается
        ↓ платежи через VKPlaySDK.openPaymentDialog()
        ↓ server callback на твой webhook → выдача товара
```

## Что нужно ДО начала

1. **Developer account** — https://developers.vkplay.ru/welcome (заявка, обычно одобряют 1-3 дня)
2. **Game card** — заполнить на developers.vkplay.ru (название, описание, скриншоты, иконки, категория)
3. **App ID** + **Secret Key** — выдаётся при создании Game в dev panel
4. **Hosting** — VK Play требует свой URL (HTTPS обязателен). Можно self-host или использовать vkplay.ru hosting
5. **Подключение payment system** — manual (написать в integration@vk.team)
6. **Юр. лицо или ИП** — обязательно для приёма выплат

## Что Forge даёт

### Validators (5 шт, в `validators/`)
- `iframe-init.mjs` — проверка что VKPlaySDK инициализирован после загрузки iframe (vkplaysdk.init или similar pattern)
- `signature-check.mjs` — проверка что secret_key НЕ светится в client коде (это server-only)
- `auth-params.mjs` — query params парсинг (uid, hash, app_id) и обращение к server для validation
- `payment-flow.mjs` — payment dialog open/callback shape, обработка success/cancel
- `https-only.mjs` — все ресурсы HTTPS, no http:// в bundle

### Pre-submit script
`scripts/pre-submit.mjs WorkProgress/{Project}/` — прогоняет все 5 validators.

### Templates
- `templates/vkplay-sdk-wrapper.js` — JS wrapper API над postMessage
- `templates/sign-helper.mjs` — server-side signature verification (Node.js)
- `templates/auth-server-example.js` — пример Express endpoint для auth-callback

### Skills
- `.claude/skills/release-vkplay/SKILL.md` — полный pipeline
- `.claude/skills/fill-vkplay/SKILL.md` — заполнение game card

## VK Play JS API features

| Feature | API |
|---|---|
| **User info** | `VKPlaySDK.getUserInfo()` |
| **Payments** | `VKPlaySDK.openPaymentDialog({sku, amount, currency})` |
| **Login redirect** | `VKPlaySDK.requestAuth()` — redirect на vkplay.ru auth |
| **Iframe resize** | `VKPlaySDK.requestResize({width, height})` |
| **Share/invite** | `VKPlaySDK.shareToFriend()` |
| **Achievements** | через server API (HTTP) |
| **Leaderboard** | через server API |

(Часть методов доступна только через JS API в iframe; часть — только через server-side HTTP.)

## Signature verification (КРИТИЧНО)

VK Play передаёт `hash` параметр в URL. **Никогда** не доверяй `uid` без проверки `hash` на сервере:

```javascript
// СЕРВЕРНАЯ часть. НЕ КЛАДИ secret_key в client код!
import crypto from 'crypto';

function verifyVKPlayHash(params, secretKey) {
  // Сортируем параметры по ключу, конкатенируем, добавляем secret
  const { hash, ...rest } = params;
  const sorted = Object.keys(rest).sort()
    .map(k => `${k}=${rest[k]}`).join('');
  const expected = crypto.createHash('md5')
    .update(sorted + secretKey)
    .digest('hex');
  return expected === hash;
}
```

Если `hash !== expected` — **отклони запрос**, это попытка обмана.

## Что НЕ делает Forge

- **Hosting** — твоя ответственность (Timeweb / Selectel / любой HTTPS-host)
- **Юр. лицо setup** — это про contracts с VK, ручной процесс
- **Выпуск promo material** — `art-prompts` skill даёт промпты, но картинки сам не генерит
- **Cloud Gaming** — VK Play Cloud — отдельный продукт для нативных игр, не для HTML5

## References

- Главная docs: https://documentation.vkplay.ru/
- F2P games guide: https://documentation.vkplay.ru/f2p_vkp/
- JS API: https://documentation.vkplay.ru/f2p_vkp/f2pb_js_vkp
- Dev portal: https://developers.vkplay.ru/welcome
- Game card config: https://documentation.vkplay.ru/f2p_vkp/f2p_setups_sbs_vkp
- Sign calculation: https://documentation.vkplay.ru/f2p_vkp/ (раздел Sign Calculation)
- Integration support: integration@vk.team
