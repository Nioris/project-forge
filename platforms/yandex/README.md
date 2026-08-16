# platforms/yandex/ — Yandex Games

**Статус:** production — 11 валидаторов, 3-слойный gate, 3-ZIP build matrix, Chrome-extension для 13 языков.

## Что делает

Берёт полированную HTML5-игру из `WorkProgress/{Game}/`, проверяет соответствие 30+ требованиям Яндекса с прямыми цитатами из доков, и собирает 3 релиз-ZIP'а для `Release/{Game}/yandex/`.

## Требования к входу

В `WorkProgress/{Game}/` должно быть:
- `index.html`
- SDK-обёртка `yandex-sdk-wrapper.js` (шаблон в `templates/`)
- Все UI-строки через `I18N.t(key)`, данные через `I18N.td(key, lang)`
- 13 языков в I18N: ru, en, es, tr, pt, ar, id, fr, ja, it, de, hi, zh
- `store-listing-{lang}.json` × 13 в `Release/{Game}/yandex/` (создаёт `store-listings-builder`)

## Gate (обязательные проверки)

```bash
node platforms/yandex/scripts/pre-submit.mjs WorkProgress/{Game}/
node platforms/yandex/scripts/smoke-test.mjs  WorkProgress/{Game}/
node platforms/yandex/scripts/runtime-test.mjs WorkProgress/{Game}/
```

Exit 0 у всех трёх — можно собирать. Любой exit 1 — фикс, re-run.

## Что на выходе

```
Release/{Game}/yandex/
├── {Game}-v{N}.zip            # production — чистая игра
├── {Game}-v{N}-debug.zip      # + debugcheck.js v2.6 (Ctrl+Shift+2 ×3)
├── {Game}-v{N}-marketing.zip  # + cheats-base.js (для 13-lang скриншотов)
├── store-listing-ru.json
├── store-listing-en.json
├── ... (13 языков)
├── store-listing.md           # обзор для команды
├── {game}-art-prompts.md      # промпты для генерации арта
├── rodrik-import.json         # импорт в Rodrik Studio
└── SETUP_GUIDE.md             # инструкция по заливке
```

## Валидаторы (11 штук)

| ID | REQ | Покрытие |
|---|---|---|
| `title-format` | REQ-8.2.1 | Нет CAPS/эмоджи/возраста в названии |
| `store-listings` | REQ-FIELD-*, REQ-5.1.3 | Длины полей + title identity |
| `trademarks` | MOD-TM | Не использовать Tetris/Minecraft/Mario в keywords |
| `scroll-prevention` | REQ-1.10.2 | touch-action:none + overflow:hidden + preventDefault |
| `contextmenu` | REQ-1.6.2.7 | contextmenu handler на document (не на `#G`) |
| `i18n-completeness` | REQ-2.14, REQ-8.2.3 | 13 языков без пропусков, без англ. слов в ru-блоках |
| `sdk-timing` | REQ-1.19.2, REQ-2.14 | LoadingAPI.ready() после UI, detectLang() на старте |
| `ad-rules` | REQ-4.4, REQ-4.5.1, REQ-3.8, REQ-4.7 | Реклама из click, RV-кнопка с текстом, валюта через SDK |
| `iap-flow` | REQ-1.13.* | consumePurchase, getPurchases на старте |
| `emoji-compat` | UX | Эмоджи не ломают CJK-шрифты |
| `screenshot-langs` (optional) | MOD-SCREENSHOT | 13 скриншотов через YG Extension |

## Runtime-tests (Puppeteer)

- `smoke-test.mjs` — загружает игру в headless Chrome на 6 секунд, ловит crashes + Long Tasks ≥500ms (фризы).
- `runtime-test.mjs` — активные пробы: **Probe A** программно дёргает `endGame/gameOver/onDeath/etc` без user gesture → если `showFullscreenAdv` сработал — REQ-4.4 BLOCKER (Circle 2048 trap). **Probe B** — диспетчит клики, проверяет `gestureDelta < 500ms`. **Probe C** — `setLang('en')` + DOM scan на кириллицу (REQ-8.2.3 trap).

## Полный пайплайн

Запускается через `/release yandex` — см. `.claude/skills/release-yandex/SKILL.md`.

3 фазы с mandatory stops между ними:
1. **Phase 1 — polish**: game-design, level-design, mobile-adapt, mobile-game-ui, game-polish, monetization-design (скилы из Forge `skills/games/`)
2. **Phase 2 — SDK + i18n**: yandex-sdk-integration (из `platforms/yandex/skills/`), 13 языков
3. **Phase 3 — gate + build**: pre-submit-gate + runtime-test + 3 ZIP

## Отсылки

- Legacy CLAUDE.md YBuilder'а: `docs/LEGACY-YBUILDER-CLAUDE.md` (295 строк, полные цитаты)
- Оригинальные команды YBuilder: `commands/{full-pipeline,test-game,fix-moderation,localize,analyze-game,reprocess,help}.md`
- Требования Yandex: https://yandex.ru/dev/games/doc/ru/concepts/requirements
