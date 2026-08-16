---
name: layout-system
kind: architectural
description: "Layout system designer — устанавливает 8pt grid + spacing tokens + 12-col responsive grid + breakpoints + reading patterns ДО написания CSS. Без этого spacing рандомный (10px…"
---

# Layout System — Grid + Spacing + Breakpoints Designer

## Purpose

Spacing рандомный — UI выглядит как недоделанный wireframe. Элементы разной высоты — UI выглядит как у разных авторов. Нет breakpoints — UI ломается на mobile. Это **системные проблемы** которые не лечатся локальным CSS-fix'ом.

Skill создаёт **дизайн-систему layout** ДО того как frontend пишет код:

1. **Base unit** (8pt стандарт)
2. **Spacing scale** (4, 8, 12, 16, 24, 32, 48, 64, 96)
3. **Grid** (12-col desktop, 4-col mobile, container queries)
4. **Breakpoints** (с конкретными widths и rules)
5. **Reading patterns** (Z-pattern landing, F-pattern content, focal hierarchy)

## When to invoke

- Юзер: "панели разной высоты", "ломается на mobile", "отступы рандомные", "не выравнивается"
- Перед `$visual-upgrade` или `/frontend-design` — основа должна быть готова
- $design-pipeline Step 3 — после `$info-hierarchy`, перед художником
- Существующий UI имеет visual chaos несмотря на хорошие компоненты

## Base unit choice

**Default — 8pt** (Material, Atlassian, Carbon, Spectrum). Reasons:
- Большинство screen widths делятся на 8 (320, 768, 1024, 1440)
- Retina @2x / @3x идеально scale'ится
- 15 distinct values до 120pt — не too few (5pt), не too many (4pt)
- Half-step **4pt** для иконок и tight typography

Alternatives:
- **4pt** — допустимо для мелкого UI (icons, badges) внутри 8pt base
- **5pt** — нечётный, на @1.5x экранах blur, **не использовать**
- **10pt** — допустимо если бренд уже на нём

## Spacing scale (default 8pt)

```
--space-0:   0px      (no space)
--space-1:   4px      (half-step, tight)
--space-2:   8px      (base — internal padding)
--space-3:   12px     (snug — between related elements)
--space-4:   16px     (default — between unrelated elements)
--space-5:   24px     (comfortable — section padding)
--space-6:   32px     (loose — between sections)
--space-7:   48px     (generous — page-level breathing room)
--space-8:   64px     (large — hero sections)
--space-9:   96px     (extra large — landing pages only)
```

**Rule:** **никогда** не используй значения вне этой шкалы (нет `13px`, `21px`, `27px`). Если нужно "что-то between" — выбери ближайшее, не создавай новый token.

## Grid system

### Desktop — 12-column

- Container max-width: **1440px** (или 1280px для tighter feel)
- Columns: 12
- Gutter: **24px** (`--space-5`)
- Outer margin: **32px** (`--space-6`) — для дыхания edge

### Tablet — 8-column

- Breakpoint: 768px–1023px
- Columns: 8
- Gutter: **16px** (`--space-4`)
- Outer margin: **24px**

### Mobile — 4-column

- Breakpoint: <768px
- Columns: 4
- Gutter: **16px**
- Outer margin: **16px**

## Breakpoints

```css
/* Mobile first */
:root {
  /* Default (mobile) */
}

@media (min-width: 640px) {  /* sm — large phones / small tablets */
  /* 8-col grid optional, или stay on 4-col */
}

@media (min-width: 768px) {  /* md — tablets */
  /* 8-col grid */
}

@media (min-width: 1024px) {  /* lg — desktop */
  /* 12-col grid */
}

@media (min-width: 1440px) {  /* xl — large desktop */
  /* container max-width applies, content centered */
}
```

**Per-breakpoint behavior** должен быть **explicit** в spec, не "hopefully it works":

```yaml
component: shop-panel
desktop (lg+): right side, 320px width, scrollable
tablet (md): right side, 280px width
mobile (sm-): bottom drawer, 100% width, swipe-up to reveal
```

## Reading patterns

### Z-pattern (landing pages, hero sections)
Eye traverses: top-left → top-right → diagonal down → bottom-left → bottom-right.
**CTA goes bottom-right** — eye rests there.

### F-pattern (content-heavy pages, articles)
Eye scans: top horizontal, second horizontal, then vertical down left edge.
**Important info** в top region и **left edge** of paragraphs.

### Focal hierarchy (dashboards, complex UIs)
**Single dominant element** (Tier 1) draws eye first. Eye then radiates outward.
**Layout placed по концентрическим кругам importance**.

### Mobile (different patterns)
**Vertical scan по centerline** — top to bottom. **Tier 1 в первый screen** (above fold).
**Bottom thumb-zone** для primary actions — большие пальцы достают bottom-right.

## Density tokens

Не один density для всего UI. **Three modes**:

```yaml
sparse:    /* для key actions, hero sections, primary CTA */
  inset: var(--space-5) var(--space-6)   /* 24/32px */
  stack: var(--space-5)                   /* 24px between siblings */
  
default:   /* для основного контента */
  inset: var(--space-4)                   /* 16px */
  stack: var(--space-4)                   /* 16px */
  
dense:     /* для data tables, lists, dashboards */
  inset: var(--space-2) var(--space-3)   /* 8/12px */
  stack: var(--space-2)                   /* 8px */
```

**Rule:** одна и та же density через всю секцию. Не смешивай dense list с sparse cards в одном region.

## Pattern reference base (v4.10.7)

Перед выбором grid + breakpoints — read pattern reference:

- **`../info-hierarchy/patterns/games.md`** — game-specific layouts (HUD zones, mobile thumb zones, safe areas, portrait vs landscape)
- **`../info-hierarchy/patterns/apps.md`** — app navigation per screen size (bottom nav <600dp, rail 600-840dp, drawer 840+dp), dashboard layouts (sidebar 240-280px), form patterns (single-column, inline validation)

Эти базы предоставляют **data-backed thresholds** — не угадывай. 240px sidebar — не выбор по вкусу, а **threshold ниже которого labels truncate** ("Notifications", "Integrations").

## Process

### Step 1 — Read project type + applicable patterns

**Game project:**
- Read `../info-hierarchy/patterns/games.md` mobile section
- Note safe areas, thumb zones, orientation choice for genre

**App project:**
- Read `../info-hierarchy/patterns/apps.md` navigation section
- Pick navigation per primary screen size (bottom-nav / rail / drawer)
- Apply category density (sparse / default / dense per apps.md table)

### Step 2 — Read existing context

- `wiki/design/hierarchy-*.md` — какие tiers есть на каждом экране
- Existing CSS / Tailwind config — какие spacing values уже используются
- Screenshots — где видны density mismatches

### Step 3 — Choose base + scale

Для нового проекта — **default 8pt** unless override (см. above).
Для existing — audit existing values. Если уже на 8pt grid — confirm. Если нет — propose migration.

### Step 4 — Define breakpoints + grid

Mobile-first. Пиши **per-breakpoint behavior table** для каждого major component.

### Step 5 — Density per region

Идентифицируй **regions** (header, main, sidebar, footer). Каждый region — один density mode.

### Step 6 — Token spec output

Создай `wiki/design/layout-system.md`:

```markdown
# Layout System

## Base unit
8pt (with 4pt half-step for icons/typography)

## Spacing tokens
{table from above}

## Grid
- Desktop (1024+): 12-col, 24px gutter, 32px margin, max 1440px
- Tablet (768-1023): 8-col, 16px gutter, 24px margin
- Mobile (<768): 4-col, 16px gutter, 16px margin

## Breakpoints
{table}

## Reading pattern
{Z / F / Focal — chosen для main screens}

## Density per region
- header: dense
- main: default
- sidebar: default
- footer: dense

## Component rules
{per-component breakpoint behavior}
```

Также обнови `wiki/architecture/stack.md` reference на этот spec — frontend implementation должен импортировать tokens.

### Step 7 — CSS tokens file

Сгенерируй `tokens.css` или `tokens.json`:

```css
:root {
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  /* ... */
  
  --grid-cols: 4;
  --grid-gutter: 16px;
  --grid-margin: 16px;
}

@media (min-width: 768px) {
  :root {
    --grid-cols: 8;
    --grid-gutter: 16px;
    --grid-margin: 24px;
  }
}

@media (min-width: 1024px) {
  :root {
    --grid-cols: 12;
    --grid-gutter: 24px;
    --grid-margin: 32px;
  }
}
```

## Common layout failures + fixes

### Failure 1 — Random spacing
**Symptom:** 10px between A and B, 14px between B and C, 22px between C and D.
**Fix:** Все spacing → token. `--space-3` (12) или `--space-4` (16).

### Failure 2 — Cards разной высоты
**Symptom:** В списке cards с разной плотностью content одни выше других — alignment broken.
**Fix:** `min-height` на card + density mode унифицирован. Или **explicit empty state** для коротких cards.

### Failure 3 — Element overlap
**Symptom:** "за 40 ✓" badge поверх text `${STARTING_POP_MAX}`.
**Fix:** Badge — separate flex item с `gap: var(--space-2)`, не absolute positioned over text. Если absolute — `padding-right` на parent для зарезервированного space.

### Failure 4 — Mobile breakage
**Symptom:** Desktop layout сжимается до неюзабельного на phone.
**Fix:** Mobile-first — write 4-col layout первым, expand на desktop. Каждый component имеет mobile rule explicitly.

### Failure 5 — Information density war
**Symptom:** Dense data table рядом с sparse marketing card в одном view.
**Fix:** Pick один density per region. Если нужны both — separate them с large gap (`--space-7`).

## CRITICAL — wiki cleanup before showing user questions

Per Architectural Invariant #14: после генерации layout system spec, **до того как** ask user any question:

1. Update `wiki/_current.md` — mark layout system as Done in active task list
2. Update `wiki/_map.md` — append to "Done": `- {date}: layout system tokens defined ({base-unit}pt grid)`
3. Update `wiki/architecture/stack.md` — link к layout-system.md

Then print summary + questions.

## Anti-patterns — do NOT

- ❌ Не используй pixel values вне scale (`13px`, `27px`) — всегда token
- ❌ Не делай custom breakpoint для каждого component — 3-4 standard breakpoints на проект
- ❌ Не миксуй density modes в одном region
- ❌ Не используй % padding (rounding errors на разных widths) — fixed tokens
- ❌ Не позволяй `gap` быть unscaled value
- ❌ Не пиши mobile стили как override desktop — mobile-first

## Integration

В `$design-pipeline` Step 3:
1. `$info-hierarchy` определяет tiers
2. **$layout-system** устанавливает grid/spacing/breakpoints
3. `$ui-review` валидирует implementation
4. `frontend-design` (Anthropic skill) пишет код используя tokens
