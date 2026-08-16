# platforms/max/ — MAX Mini App (мессенджер MAX от VK)

**Статус:** production-ready skeleton — SDK wrapper с полной Bridge API + 5 валидаторов + pre-submit.

## Что такое MAX Mini App

Веб-приложение, работающее **только внутри** мессенджера MAX (web.max.ru, iOS, Android, Desktop). Публикация через [business.max.ru/self](https://business.max.ru/self) — **только юрлица РФ и ИП**.

Документация: https://dev.max.ru/docs/webapps/introduction

## Отличия от Telegram

| Аспект | Telegram | MAX |
|---|---|---|
| init() | нужен `WebApp.ready()` + `WebApp.expand()` | **не нужен** — MAX предзагружает данные |
| Persistent кнопка | `MainButton` + `BackButton` | только `BackButton` |
| Storage | `CloudStorage` | `DeviceStorage` + `SecureStorage` (10 ключей/пользователь) |
| Native API | Haptic, Clipboard | + Biometric + NFC + ScreenBrightness + ScreenCapture + QR scanner |
| Global | `window.Telegram.WebApp` | `window.WebApp` (коротко — **конфликт с другими платформами!**) |
| SDK URL | `telegram.org/js/telegram-web-app.js` | `st.max.ru/js/max-web-app.js` |
| Хостинг | любой HTTPS + BotFather | HTTPS + регистрация на business.max.ru (юрлица РФ) |
| Аудитория | глобальная | +7 / +375 / +374 / +994 / +7 Kaz / +996 / +373 / +998 |
| Ads | нет официальных | нет (Max не предоставляет ads API) |
| Payments | Stars (Bot API 7.4+) | через бота и API-платежи |
| Модерация | минимальная | обязательная (все приложения проходят ревью) |

**⚠️ Конфликт `window.WebApp`:** если проект собирается под MAX И Telegram одновременно, нужно использовать разные WorkProgress-копии. MAX wrapper переименует глобал в `MaxSDK` для изоляции.

## Требования к входу

В `WorkProgress/{Project}-max/`:
- `index.html` + ассеты
- `<script src="https://st.max.ru/js/max-web-app.js"></script>` в `<head>`
- `max-sdk-wrapper.js` (шаблон в `templates/`)
- HTTPS-совместимые ассеты (mixed content блокируется)
- URL на хостинге: **≤ 1024 символов**, только **латиница + цифры + точка + дефис**

## Gate

```bash
node platforms/max/scripts/pre-submit.mjs WorkProgress/{Project}-max/
```

5 валидаторов:
1. `sdk-loaded` — `<script src=".../max-web-app.js">` подключён в `<head>`
2. `url-constraints` — файлы в проекте не ссылаются на URL с запрещёнными символами (кириллица, пробелы)
3. `https-only` — нет mixed content
4. `no-telegram-conflict` — если в коде есть и `Telegram.WebApp` и `window.WebApp` — warning
5. `initdata-server` — если используется `initData` — напоминание про серверную HMAC-валидацию

## Что на выходе

```
Release/{Project}/max/
├── bundle/                      # HTTPS-ready статика для Vercel/Netlify/GitHub Pages
├── max-business-setup.md        # заявка на business.max.ru/self:
│                                  #   - URL приложения
│                                  #   - Bot token
│                                  #   - Вид кнопки (Открыть/Старт/Играть)
│                                  #   - Категория
├── server/                      # опционально: HMAC-валидация initData
│   └── verify-webappdata.mjs
└── DEPLOY.md                    # Vercel/Netlify/CF Pages + business.max.ru шаги
```

## Специфика MAX Bridge

### Нет явной инициализации
```js
// Telegram: обязательно
Telegram.WebApp.ready();
Telegram.WebApp.expand();

// MAX: НИЧЕГО не нужно — данные уже есть
const user = window.WebApp.initDataUnsafe.user;
```

### Start параметр через URL
```
https://max.ru/<botName>?startapp=promo_summer2025
                                  ↓
window.WebApp.initDataUnsafe.start_param === 'promo_summer2025'
```

Payload ≤ 512 символов, только `A-Z a-z 0-9 _ -`.

### Шеринг через бота
```js
// 1. Бот отправляет медиа пользователю через POST /messages → получает `mid`
// 2. Мини-приложение открывает нативный шеринг с этим `mid`:
window.WebApp.shareMaxContent({ mid, chatType: 'DIALOG' });
```

### Валидация initData (серверная — ОБЯЗАТЕЛЬНА для auth/платежей)
```
secret_key = HMAC-SHA256("WebAppData", BOT_TOKEN)
hash = hex(HMAC-SHA256(secret_key, sorted_params))
```

Шаблон: `templates/verify-webappdata.mjs`.

## Уникальные возможности MAX

- **BiometricManager** — `fingerprint`, `faceid` для iOS и Android (`unknown` на Android всегда)
- **NfcManager** — эмуляция NFC-метки, **только Android**
- **ScreenCapture** — включить/выключить возможность скриншотов
- **requestScreenMaxBrightness** — максимальная яркость на 30 секунд
- **openCodeReader** — QR-сканер камерой
- **requestContact** — получить номер телефона в нативном диалоге
- **enableClosingConfirmation** — предупреждение при закрытии (для форм)

## Юридическая часть

Перед подачей на модерацию подготовь:
- [Типовое пользовательское соглашение](https://dev.max.ru/docs/legal/agreement) (шаблон)
- [Типовая политика конфиденциальности](https://dev.max.ru/docs/legal/privacy) (шаблон)
- [Правила размещения](https://dev.max.ru/docs/legal/rules) — прочитай перед сабмитом
- [Требования к функциональности](https://dev.max.ru/docs/legal/requirements)

## TODO (следующие итерации)

- [ ] Полноценный runtime-test.mjs с Puppeteer mock `window.WebApp`
- [ ] Валидатор UI-темы (светлая/тёмная адаптация)
- [ ] Заготовка MAX UI (React-компоненты из https://dev.max.ru/ui)
- [ ] Шаблон платежей через бот (POST /messages + открытка-чек)
