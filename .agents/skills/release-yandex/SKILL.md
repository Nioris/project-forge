---
name: release-yandex
kind: tactical
description: "Release pipeline for Yandex Games. Copies game from GameIntegration to WorkProgress, polishes, integrates SDK + 13 languages, runs pre-submit gate, builds 3 ZIPs to…"
---

> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.

# /release yandex

Полный пайплайн публикации в Yandex Games.

**Источник:** `platforms/yandex/` — 11 валидаторов, 3-слойный gate, 3-ZIP матрица, Chrome extension для 13 языков.

## Arguments
`[INVOCATION_INPUT]`:
- no args — полный pipeline (3 фазы с mandatory stops)
- `phase1` — только polish (game-design, level-design, mobile-adapt, mobile-game-ui, game-polish, monetization-design)
- `phase2` — только SDK + локализация 13 языков
- `phase3` — только gate + build 3 ZIP
- `gate` — только prejum-submit validators
- `resume` — читай `WorkProgress/{Game}/PIPELINE.md` и продолжай

## Before starting

1. Убедись что проект лежит в `GameIntegration/{ProjectName}/`
2. Скопируй: `GameIntegration/{ProjectName}/` → `WorkProgress/{ProjectName}/`
3. Создай `WorkProgress/{ProjectName}/PIPELINE.md` — трекер фаз
4. Зафиксируй задачу: `wiki/plan/QN-NNN-release-yandex-{ProjectName}.md` → `status: in_progress`, `files:` = все файлы проекта

**⚠️ ВСЯ работа в `WorkProgress/{ProjectName}/`. НИКОГДА не редактируй `GameIntegration/` или `Release/`.**

## Критичные правила

1. **ОДНА ФАЗА ЗА РАЗ.** После каждой — отчёт → STOP → ждать "продолжи"
2. **READ SKILL BEFORE APPLY.** Загрузи скил файл, ПОТОМ применяй. Никогда не пропускай
3. **PRE-SUBMIT GATE перед "готово".** `node platforms/yandex/scripts/pre-submit.mjs WorkProgress/{Game}/` → 0 blockers. Без этого не говорить "ready" и не собирать ZIP
4. **NO ZIP С BLOCKER'АМИ.** Никогда не запускать archiver / build-release если pre-submit exit 1. Без исключений
5. **НЕ ПОНИЖАТЬ BLOCKER ДО WARNING.** Если считаешь что blocker false-positive — СПРОСИ пользователя с цитатой из валидатора
6. **PHASES ISOLATED.** Phase 1 не трогает SDK. Phase 2 не ломает Phase 1 геймплей

---

## PHASE 1 — Polish (analyze + improve)

### 1.1 Analyze
Прочитай ВСЕ файлы в `WorkProgress/{Game}/`. Напиши в `PIPELINE.md`:
- Жанр, движок, ориентация
- Что работает, чего не хватает
- Какие 15 причин отказа (из `platforms/yandex/docs/LEGACY-YBUILDER-CLAUDE.md`) потенциально применимы

### 1.2 Apply skills (читай каждый ПЕРЕД применением)

| Order | Skill | Что проверять/чинить |
|---|---|---|
| 1 | `skills/games/<genre>/` или `skills/core/` | Core loop, juice, difficulty |
| 2 | `skills/games/...level-design` | Прогрессия, боссы, data-driven levels |
| 3 | `skills/core/mobile-controls/` | Ориентация по жанру, touch mapping |
| 4 | `skills/core/game-ui/` | Max 5 кнопок, touch target ≥48px |
| 5 | `skills/core/visual-quality/` | Градиенты, частицы, juice |
| 6 | `skills/games/monetization-design/` | Ad placement, RV hooks, IAP каталог |

Для каждого скила: read → apply → записать в PIPELINE.md что сделано.

### ⛔ MANDATORY STOP — Phase 1

Отчёт:
```
═══════════════════════════════════════
  PHASE 1 COMPLETE: {Game}
═══════════════════════════════════════
  Genre: {genre} / Engine: {engine} / Orientation: {orientation}

  Changes:
  - {list}

  Skills applied:
  - {list}

  Files modified: {count}
  Next: Phase 2 (SDK + i18n)
  Say "продолжи" to continue.
═══════════════════════════════════════
```

Обнови `PIPELINE.md`: Phase 1 DONE. **WAIT.**

---

## PHASE 2 — SDK + Localization

### 2.1 SDK integration
**Read skill:** `platforms/yandex/skills/yandex-sdk-integration/SKILL.md` — единственный источник правды.

Следуй чеклисту ПО ПОРЯДКУ:
1. Добавь `/sdk.js` + `platforms/yandex/templates/yandex-sdk-wrapper.js` (копируй, не переписывай)
2. Init + Lifecycle: `ready()` ПОСЛЕ загрузки fonts И UI
3. Dev-mode: игра должна работать без SDK (на `file://`)
4. Sound muting (ads, tab hidden, game_api_pause)
5. ВСЕ `localStorage` → cloud saves через `player.setData/getData`
6. Interstitial: только из click handler (не setInterval/setTimeout)
7. Rewarded: player-initiated, reward показан ДО
8. Purchases: consume после grant, check uncompleted на старте
9. Leaderboards (если применимо)

### 2.2 Localization (13 языков)
RU, EN, ES, TR, PT, AR, ID, FR, JA, IT, DE, HI, ZH

- ВСЕ UI-строки через `I18N.t(key)`
- Данные через `I18N.td(key, lang)`
- Arabic RTL
- CJK font fallback
- `detectLang()` через `ysdk.environment.i18n.lang` **на старте, до UI-рендера**

### 2.3 Quick verification

```bash
# Не должно быть localStorage (кроме debugcheck/cheats/fallback):
grep -rn "localStorage" WorkProgress/{Game}/ --include="*.js" | grep -v "debugcheck\|cheats\|fallback\|dev.mode"

# Должны быть SDK-вызовы:
grep -rn "LoadingAPI\|GameplayAPI\|showFullscreenAdv\|showRewardedVideo" WorkProgress/{Game}/ --include="*.js" | head

# Должен быть detectLang:
grep -rn "i18n.lang\|getLang\|detectLang" WorkProgress/{Game}/ --include="*.js" | head
```

### ⛔ MANDATORY STOP — Phase 2

Отчёт + WAIT.

---

## PHASE 3 — Gate + Build

### 3.1 Pre-submit (MANDATORY GATE)

```bash
# 3 слоя проверки — ВСЕ должны пройти:
node platforms/yandex/scripts/pre-submit.mjs WorkProgress/{Game}/ --verbose
node platforms/yandex/scripts/smoke-test.mjs  WorkProgress/{Game}/
node platforms/yandex/scripts/runtime-test.mjs WorkProgress/{Game}/
```

Fix ВСЕ blockers. Re-run. Exit 1 хоть раз → **СТОП, не собирать ZIP.**

### 3.2 Store-listings (13 языков)

Read skill: `platforms/yandex/skills/store-listings-builder/SKILL.md`

Создай в `Release/{Game}/yandex/`:
- `store-listing-{lang}.json` × 13
- `store-listing.md` — обзор
- `{game}-art-prompts.md` — промпты для арта
- `rodrik-import.json` — импорт в Rodrik Studio

Re-run pre-submit после создания listings — он проверяет REQ-5.1.3 и REQ-FIELD-*.

### 3.3 3-ZIP build

ТОЛЬКО после 0 blockers во всех трёх слоях:

```
Release/{Game}/yandex/
├── {Game}-v{N}.zip            # production — чистая игра
├── {Game}-v{N}-debug.zip      # + debugcheck.js v2.6
└── {Game}-v{N}-marketing.zip  # + debugcheck.js + cheats-base.js + screenshots.js
```

Используй `platforms/yandex/scripts/build-release.sh` или пиши `scripts/build-{game}.mjs` (шаблоны — в legacy YBuilder: `scripts/build-circle2048.mjs` и прочие).

**Inlining gotcha:** `content.replace(/<\/script>/gi, '<\\/script>')` ОБЯЗАТЕЛЬНО — иначе debug/cheats ломаются без console-ошибки.

### 3.4 Sanity check

```bash
# production должен содержать ТОЛЬКО index.html + assets
unzip -l Release/{Game}/yandex/{Game}-v{N}.zip

# debug содержит debugcheck signature:
unzip -p Release/{Game}/yandex/{Game}-v{N}-debug.zip index.html | grep -c "Ctrl+Shift+2"

# marketing содержит И debugcheck И cheats:
unzip -p Release/{Game}/yandex/{Game}-v{N}-marketing.zip index.html | grep -cE "debugcheck|gameButtons"
```

### 3.5 SETUP_GUIDE + финал

Создай `Release/{Game}/yandex/SETUP_GUIDE.md`:
- Какой ZIP заливать (production)
- Какой использовать для скриншотов 13 языков (marketing + YG Screenshot extension)
- Какой — для внутреннего QA (debug)
- Инструкция по заливке в Yandex Games Console

Закрой задачу: `wiki/plan/QN-NNN-release-yandex-{Game}.md` → `status: done`.
Обнови `wiki/changelog.md`, `wiki/deploy-log.md`, `wiki/_current.md`.

## Non-Negotiable

- [ ] `GameIntegration/{Game}/` не тронут
- [ ] Работа только в `WorkProgress/{Game}/`
- [ ] `PIPELINE.md` обновлён после каждой фазы
- [ ] 0 blockers в pre-submit + smoke + runtime перед любым ZIP
- [ ] 13 `store-listing-{lang}.json` файлов созданы
- [ ] 3 ZIP'а с правильным содержимым
- [ ] `SETUP_GUIDE.md` описывает какой ZIP куда
- [ ] wiki обновлена, задача закрыта

## Frontend-design discipline

When creating store-listing HTML, landing pages, promo screens, or any UI surface that users will see, invoke the `frontend-design` skill before writing code. This skill (official Anthropic, 277k+ installs) explicitly fights the "AI slop" aesthetic — generic Inter/Roboto + purple gradients + card layouts that mark output as AI-generated.

The skill enforces:
- **Aesthetic commitment:** pick one direction (brutalist, editorial, maximalist, retro-futuristic) and execute it with purpose
- **Typography discipline:** ban on overused fonts (Inter, Roboto, Arial, Space Grotesk); pair fonts intentionally
- **Color system:** skip the purple gradient default; build a palette that fits the game's genre
- **Motion + spatial composition:** animations that feel intentional, not decorative

Invoke with: `Use the frontend-design skill to build the store listing page for this game.` Skip this step only when the game already has a design system in place that you're preserving.
