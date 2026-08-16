---
name: info-hierarchy
kind: architectural
description: "Information hierarchy designer — определяет primary/secondary/tertiary tier для каждого экрана ДО вёрстки. Без этого все элементы кричат одновременно (как Самогонщик: статы…"
---

# Info Hierarchy — Tier System Designer

## Purpose

Каждый экран должен пройти **3-second test** — пользователь смотрит 3 секунды и понимает: **где он**, **что главное**, **что делать**. Если все элементы выглядят одинаково prominent — пользователь cognitive overload.

Задача skill — **до** того как frontend-design начинает писать CSS, определить **tier** для каждого блока на экране:

- **Primary** (Tier 1) — главное сообщение / главное действие. **Один на экран**. Самый крупный шрифт, самый яркий цвет, самое большое пространство.
- **Secondary** (Tier 2) — поддерживающая информация / альтернативные действия. Средний размер, средняя контрастность.
- **Tertiary** (Tier 3) — метаданные, справочная информация, fallback. Мелкий шрифт, низкий контраст, серый цвет.

Правило **3-5 emphasis levels** — больше нельзя (становится визуальный шум), меньше — нет hierarchy.

## When to invoke

- Есть готовый MVP но "панели расположение полная жопа" — все элементы кричат
- $design-pipeline Step 3 — определяет hierarchy перед художником
- Юзер жалуется "не понимаю куда смотреть", "всё мельтешит", "перегружено"
- Перед добавлением новой фичи — куда её tier?
- Дашборд / multi-panel UI / mobile screens с >5 elements

## Inputs

- Screenshot existing UI (если есть)
- Список фич / actions на экране (что должно быть видно)
- Пользовательский intent — **что юзер делает чаще всего** на этом экране?
- Контекст — game / app / dashboard / form / landing

## Pattern reference base (v4.10.7)

Skill включает comprehensive references built from real data:

- **`patterns/games.md`** — HUD anatomies для **7 жанров** (Action, Strategy, Idle, Match-3, RPG, Casual, Calibration), shop/IAP patterns, mobile thumb zones, safe areas, F2P-specific patterns. Source: Game UI Database (1300+ games), GDC talks, Fagerholt & Lorentzon taxonomy.
- **`patterns/apps.md`** — Layouts для **10 категорий** (productivity, health, finance, social, tools, SaaS, education, communication, media, e-commerce). Navigation per screen size (bottom nav <600dp, rail 600-840dp, drawer 840+dp). Dashboard types, form patterns, data display, empty/loading/error states. Source: Material Design 3, Apple HIG, Mobbin (10000+ apps), SaaSFrame.

**MANDATORY:** Read `patterns/games.md` для game projects, `patterns/apps.md` для apps. Эти базы определяют **жанро-специфические** decisions:
- Idle game с правой панелью 50% — **anti-pattern** (per games.md)
- Dashboard без F-pattern — **violation** (per apps.md)
- Mobile bottom nav с 7 items — **violation** (per apps.md)

Skill **не догадывается** patterns; читает из baseline.

## Process

### Step 1 — Identify project type + genre/category (MANDATORY)

**Это блокирующий шаг. Не пропускай.** Без categorization все subsequent decisions degenerate в generic UX.

**How to determine** (in this priority order):

1. **Read `wiki/_map.md`** — check "## Project type" / "## Category" sections
2. **Read `wiki/design/gdd.md` или `wiki/design/ia.md`** — explicit type usually stated
3. **Inspect file structure**:
   - `index.html` + canvas/game loop code → game
   - React/Vue components, routes, forms → app
4. **Inspect screenshots** (if provided):
   - HUD elements (HP, score, currency, timer) → game
   - Cards, lists, forms, dashboards, settings → app
5. **Filename hints**: `*.game.html`, `genetic_lab` → game; `*-app`, `dashboard`, `helper` → app

**Then narrow к specific genre/category:**

**Game:** action / strategy / idle / match-3 / RPG / casual / calibration
**App:** productivity / health / finance / social / tools / SaaS / education / communication / media / e-commerce

**Read** the relevant section в patterns/games.md или patterns/apps.md **fully** before continuing. Не "общая идея" — read the section.

**Output explicitly в response** before any tier work:

```
Project: {name}
Type: {GAME|APP}
{Genre|Category}: {specific}
Pattern source: patterns/{games|apps}.md → {section name}
Reading...
```

**If ambiguous** (gamified app, productivity game) — pick **primary dimension** based на screen real estate:
- Game canvas dominant (>60% screen) → game pattern + app navigation overlay
- App content dominant (lists, forms, cards) → app pattern + game progress widgets

**If still ambiguous** — ask **one specific** question about user goal, не "is this game or app":
- "I see [observation]. Is the primary user goal [A] или [B]?"

Don't proceed без clear categorization. If user пытается skip — explain что без category tier system будет generic.

### Step 2 — User intent first

Какая **одна вещь** юзер должен делать на экране? Это **Tier 1**. Не "что красивое выглядит" — **что важнее всего для user goal**.

Idle clicker: tap по аппарату → деньги. Аппарат это Tier 1. Stats — Tier 2 (поддерживают понимание прогресса). Helper list — Tier 2. Эпоха в шапке — Tier 3 (контекст, не нужен каждые 3 секунды).

Calibration game (Genetic Lab): слайдеры ДНК → запуск симуляции → результат. **Запуск — Tier 1**. Слайдеры — Tier 2 (вход для запуска). Биом-карты — Tier 2 (выбор где запускать). Превью существа — Tier 2. ДНК-сок счётчик — Tier 3 (метрика, не действие).

Pet-helper: **что у питомца сейчас** (next vaccination / weight trend) — Tier 1. Reminders / journal — Tier 2. Settings, profile, achievements — Tier 3.

### Step 3 — Squint test

Возьми существующий UI или wireframe. **Сожми глаза до полузакрытого состояния** (или blur 5px в DevTools). Что видно?

- Если виден **один доминирующий элемент** — hierarchy работает
- Если видишь **несколько одинаково ярких блоков** — флэт hierarchy, надо tier separately
- Если **ничего не выделяется** — все элементы Tier 2/3, нет focal point

### Step 4 — Tier mapping

Для каждого блока на экране — assign tier с justification:

```yaml
screen: main-game-screen
user_intent: tap aппарат для money

tiers:
  - element: распределяющий аппарат (центр)
    tier: 1
    why: core action юзера
    weight: 60% screen real estate, brightest color, animation
    
  - element: stats panel (касса/sec/tap)
    tier: 2a
    why: feedback на core action — поддерживают понимание
    weight: 15% real estate, top region (high attention zone), читаемый шрифт
    
  - element: shop panel (helpers list)
    tier: 2b
    why: secondary action — апгрейды
    weight: 20% real estate, side panel, можно scroll
    
  - element: эпоха title
    tier: 3
    why: context, обновляется редко
    weight: small text, top, не доминирует
    
  - element: settings gear
    tier: 3
    why: utility, редко используется
    weight: icon-only, corner
```

### Step 5 — Validate

После mapping — пройди **5 questions**:

1. **3-second test:** покажи UI новому человеку на 3 секунды, спроси "что главное?". Должны указать на Tier 1.
2. **Один Tier 1 на экран?** Если два — hierarchy сломана, выбрать **один**.
3. **Tier 3 действительно тихий?** Размер шрифта меньше Tier 1 хотя бы в 1.5x, контраст меньше хотя бы на 30%?
4. **Mobile hierarchy?** На 375px экране — Tier 3 ещё видно? Если нет — это OK (collapse под "More"). На mobile часто только 2 tier, не 3.
5. **Нет визуального competition?** Tier 1 анимируется + Tier 2 анимируется + Tier 3 имеет badge — это war for attention. **Один анимируется** (обычно Tier 1).

### Step 6 — Output spec

Создай `wiki/design/hierarchy-{screen-name}.md`:

```markdown
# Hierarchy spec — {screen-name}

## User intent
{одно предложение: что юзер делает чаще всего}

## Tier 1 (primary)
- Element: {what}
- Position: {where}
- Visual weight: {size, color, motion}
- Justification: {why}

## Tier 2 (secondary)
- 2a: {...}
- 2b: {...}

## Tier 3 (tertiary)
- {metadata, settings, etc.}

## Anti-patterns avoided
- ❌ {old issue}: {why it broke hierarchy}
- ✅ {new approach}: {why it works}

## 3-second test result
{passed / failed / iteration needed}
```

## Common hierarchy mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Multiple Tier 1 | "Не понимаю куда смотреть" | Force-rank — один Primary |
| Tier 3 too loud | Все элементы кричат | Reduce font size 1.5x, contrast -30%, drop shadows |
| Tier 1 too quiet | Главное действие не видно | Increase size 1.5-2x, brighter color, animate |
| Visual war | Все элементы анимируются | Только Tier 1 двигается, остальное static |
| Hierarchy by colour only | Pleasant but flat | Add size + spacing tier (контраст по 3 dimensions) |

## Reference patterns from research

### Dashboard summary card (3 tiers)
- Tier 1: Big number ($123,456) — main metric
- Tier 2: Trend (▲ 12% from last month) — supporting
- Tier 3: Date range (Jan-Mar 2025) — metadata

### E-commerce product page (6 tiers, but only 3 prominent)
- Tier 1: Product name + price — primary
- Tier 2: Buy CTA + image gallery — supporting actions
- Tier 3: Reviews count, shipping info — metadata

### Idle game main screen (3 tiers, our use case)
- Tier 1: Tap target (money producer)
- Tier 2: Currency display + shop
- Tier 3: Era label, settings, achievements badges

## CRITICAL — wiki cleanup before showing user questions

Per Architectural Invariant #14: после генерации hierarchy spec, **до того как** ask user any question:

1. Update `wiki/_current.md` — mark hierarchy design as Done in active task list
2. Update `wiki/_map.md` — append to "Done": `- {date}: hierarchy spec for {screen}`

Then print summary + questions. Otherwise Stop hook blocks → tool calls → user questions scroll out of view.

## Anti-patterns — do NOT

- ❌ Не делай hierarchy на основе **что красиво выглядит** — основа: **user intent**
- ❌ Не считай "более яркий цвет" единственным сигналом hierarchy — это size + space + motion + contrast комбинация
- ❌ Не оставляй >5 emphasis levels — мозг не обрабатывает
- ❌ Не делай Tier 1 у каждого panel — на screen **один** Tier 1 (один на main panel ОК если sub-screen)

## Integration

В `$design-pipeline` Step 3, между PM specialist и UI-systems-designer (см. $layout-system):
1. **$info-hierarchy** определяет tiers для каждого screen
2. **$layout-system** размещает tiers по grid + spacing
3. **$ui-review** проверяет результат после implementation
