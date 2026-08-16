---
name: ui-pipeline
kind: architectural
description: "UX/UI REDESIGN master orchestrator (5 steps). Принимает existing UI / file path / screenshot и автоматически проходит весь workflow: audit → hierarchy → layout-system → IMPLEMENT redesign → re-verify. Замена ручному вызову /info-hierarchy + /layout-system + /ui-review + manual edits. Это REDESIGN tool, не audit — реально меняет HTML/CSS до того как считается done. Stop points между шагами для approve. ⭐ RECOMMENDED entry point когда юзер недоволен UI. Triggers on: ui-pipeline, ux pipeline, redesign UI, переделай UI, переделай интерфейс, переработай UI, почини layout, layout pipeline, передизайн, ui rework, плохо выглядит, говно, хуёвый дизайн, не понимаю куда смотреть, плоский UI, panels overlap, перегружено, unprofessional, ugly, broken UI, всё кричит, не профессионально, сделай нормально, сделай как у людей, /ui-pipeline."
---

# UI Pipeline — UX/UI Master Orchestrator (5 steps)

## Концепция

Это **master orchestrator для UX/UI работы**. Не делает работу — связывает 3 specialist skills + implementation + verification в одну последовательность.

5 шагов от "юзер показал screenshot" до "redesigned UI на disk":

```
1. Audit current      → /ui-review existing
                        → wiki/design/ui-review-{date}-{screen}.md
                        → severity-ranked findings

2. Hierarchy design   → /info-hierarchy для каждого major screen
                        → wiki/design/hierarchy-{screen}.md (per screen)
                        → Tier 1/2/3 mapping + 3-second test

3. Layout system      → /layout-system
                        → wiki/design/layout-system.md
                        → tokens.css (8pt grid + spacing + breakpoints)

4. Implement redesign → apply specs к code
                        → modify HTML/CSS/JS per hierarchy + layout-system
                        → preserve все functional behavior, change only structure/CSS

5. Verify             → /ui-review NEW state
                        → confirm findings from Step 1 are resolved
                        → flag new issues if any
```

## Когда use

- Юзер: "переделай UI", "redesign", "почини layout", "панели не на месте"
- Юзер показывает screenshot и говорит "это говно но не знаю что"
- После /design-pipeline когда implementation готова но layout нужен work
- Existing MVP с visual chaos (Самогонщик, Genetic Lab cases)

## Когда НЕ use

- Простой single fix ("кнопка не на месте") — используй `/fix-ui` напрямую
- Project ещё не существует — используй `/start` или `/full-pipeline`
- Юзер хочет только цвет/шрифт changes — используй `/visual-upgrade`

## Invocation

```
/ui-pipeline                                # current project, all screens
/ui-pipeline samogonshchik.html             # specific file
/ui-pipeline screens/main.html screens/shop.html  # multiple screens
```

## Pattern reference base (v4.10.7)

Pipeline использует genre/category-aware patterns на каждом шаге:

- Step 1 (audit) — read patterns to know what к ожидать в этом жанре/категории
- Step 2 (hierarchy) — pick tier defaults from genre/category
- Step 3 (layout) — pick navigation + grid from screen-size table
- Step 4 (implement) — apply implementations соответственно patterns
- Step 5 (verify) — flag deviations from category dominant pattern

References (single source of truth):
- `../info-hierarchy/patterns/games.md` — 7 game genres, F2P, mobile zones
- `../info-hierarchy/patterns/apps.md` — 10 app categories, navigation, density

Skill **читает** эти patterns как часть Pre-flight, **до** Step 1.

## Pre-flight check

Перед началом — verify контекст + **mandatory categorization**:

1. ✅ `wiki/_map.md` существует (project initialized)
2. ✅ Existing UI to review (HTML file, или running app, или screenshots)
3. ⚠️ If `wiki/design/hierarchy-*.md` уже есть — спросить юзера: redo or update?

### MANDATORY — Auto-categorize project (v4.10.8)

**Это блокирующий step. Без него skill stops.**

Skill **должен сам определить** project type до начала работы. Не спрашивай юзера "это игра или app?" — определи из:

1. **Read `wiki/_map.md`** — обычно содержит genre/category
2. **Read `wiki/design/gdd.md` или wiki/design/ia.md`** если есть
3. **Look at file structure** — `index.html` + canvas-based code = likely game; React component tree = likely app
4. **Read screenshots** — если предоставлены, что виден на UI:
   - HUD elements (HP bar, score, currency) → game
   - Cards / lists / forms / dashboards → app
5. **File names hints** — `genetic_lab.html`, `samogonshchik.html` (game-like), vs `pet-helper.html`, `dashboard.html` (app-like)

После determination — **say it explicitly** в response:

```
Detected project type: GAME
Detected genre: Idle/Clicker
Reading patterns/games.md → Idle/Clicker section
```

Or:

```
Detected project type: APP
Detected category: Health/wellness  
Reading patterns/apps.md → Health/wellness section
```

**Если ambiguous** (gamified habit tracker, productivity game) — **pick primary** dimension based на screen real estate:
- Game canvas dominant → game pattern + app navigation overlay
- App content dominant → app pattern + game progress widgets

**Никогда** не работай без categorization. Если не можешь определить — ask user one focused question:
"Я вижу [observation]. Это [primary purpose A] или [primary purpose B]?"

Не "это game или app" в общем — **специфичный** вопрос about user goal.

## Pattern application — BUILT-IN, не optional

После categorization, **mandatory** load relevant pattern section:

| Detected | Read |
|---|---|
| Game / Action | games.md → "Action / Shooter (FPS/TPS)" |
| Game / Strategy | games.md → "Strategy / RTS / Tower Defense" |
| Game / Idle | games.md → "Idle / Clicker / Tycoon" |
| Game / Match-3 | games.md → "Match-3 / Puzzle" |
| Game / RPG | games.md → "RPG / Open-world" |
| Game / Casual | games.md → "Casual / Hyper-casual" |
| Game / Calibration | games.md → "Calibration / Sim / Parameter games" |
| App / Productivity | apps.md → "Productivity" entry |
| App / Health | apps.md → "Health/wellness" entry + Category-specific section |
| App / Finance | apps.md → "Finance" entry + Category-specific section |
| App / Social | apps.md → "Social" entry + Category-specific section |
| App / Tools | apps.md → "Tools/reference" entry + Category-specific section |
| App / SaaS | apps.md → "SaaS/B2B" entry + Category-specific section |
| App / Other | apps.md → general patterns + matching category |

В output report — **cite** which patterns были applied:
```
Applied patterns:
- Idle/Clicker HUD anatomy (tap target 60% center)
- Mobile thumb zones (CTA bottom 30-40%)
- F2P shop pattern A (currency store, 2-col grid mobile)
```

Это делает решения **traceable** — юзер видит откуда взялось.

## Step 1 — Audit current state (~10 минут)

### Цель
Identify **что сейчас сломано**. Это **baseline** для измерения improvement.

### Process

Invoke `/ui-review {target}` for каждого screen.

Output для каждого:
- `wiki/design/ui-review-{date}-{screen}.md` с findings
- Severity ranking (CATASTROPHIC → NIT)
- Concrete fix recommendations

Также консолидируй в **single summary** в memory:
- Top 5 issues по severity
- Patterns observed (e.g. "all screens have density mismatch")
- Implementation bugs separately (template vars, missing states)

### STOP after Step 1

Print summary:
```
═══════════════════════════════════════════
  UI Audit complete

  Screens reviewed: {N}
  Total findings:   {N} ({M} catastrophic + {K} major + ...)
  
  Top 3 issues:
  1. {Issue} — Severity {N}
  2. ...
  
  Reports saved to:
  - wiki/design/ui-review-*.md
═══════════════════════════════════════════

Continue to Step 2 (hierarchy design)? (Y/n/skip)
```

User approve → Step 2.
User `n` → end pipeline (just audit was wanted).
User `skip` → if hierarchy already designed, jump to Step 3.

## Step 2 — Hierarchy design (~15-25 минут)

### Цель
Определить tier system для каждого screen ДО переписывания layout.

### Process

For каждый major screen в проекте:
1. Identify user intent (что юзер чаще всего делает на screen)
2. Tier mapping (Tier 1 = primary, Tier 2 = secondary, Tier 3 = tertiary)
3. 3-second test simulation
4. Squint test simulation (mentally blur)
5. Output `wiki/design/hierarchy-{screen}.md`

Use `/info-hierarchy` skill instructions.

### Important

**One Tier 1 per screen.** Если existing UI имел два Tier 1 — choose **один** и demote второй к Tier 2. Document the decision в hierarchy spec с justification.

**Если screen имеет sub-screens** (e.g. modal opens) — сделай separate hierarchy spec для sub-screen. Modal обычно Tier 1 = primary action, остальное dimmed.

### STOP after Step 2

```
═══════════════════════════════════════════
  Hierarchy design complete
  
  Screens designed: {N}
  
  Tier 1 (primary) for каждого screen:
  - {Screen 1}: {Tier 1 element}
  - {Screen 2}: {Tier 1 element}
  
  Reports saved to:
  - wiki/design/hierarchy-*.md
═══════════════════════════════════════════

Continue to Step 3 (layout system)? (Y/n)
```

## Step 3 — Layout system (~10-15 минут)

### Цель
Установить grid + spacing tokens + breakpoints + density modes.

### Process

Invoke `/layout-system` skill.

Output:
- `wiki/design/layout-system.md` — spec
- `tokens.css` (или append к existing CSS) — design tokens

### Important

**Audit existing CSS first.** If проект уже использует какие-то tokens (Tailwind theme, CSS vars) — preserve consistency. Migrate gradually, не throw away existing systems.

If project has **no tokens** — establish 8pt scale from scratch. Document decision в `wiki/decisions/{NNN}-layout-system.md`.

### STOP after Step 3

```
═══════════════════════════════════════════
  Layout system established
  
  Base unit: 8pt
  Spacing scale: 9 tokens (--space-0 to --space-9)
  Grid: 12-col desktop / 8-col tablet / 4-col mobile
  Breakpoints: 640 / 768 / 1024 / 1440
  Density modes: sparse / default / dense
  
  Spec: wiki/design/layout-system.md
  Tokens: tokens.css
═══════════════════════════════════════════

Continue to Step 4 (apply redesign)? (Y/n/dry-run)
```

`dry-run` — preview changes без applying. Useful for big redesigns.

## Step 4 — Implement redesign (часы → день)

### Цель
Apply specs из Step 2 + 3 к existing code. **Modify CSS/HTML structure**, preserve все functional behavior (event handlers, state, business logic).

### Critical rules

1. **Functional behavior preserved.** Не меняй JS logic. Не меняй data flow. Только CSS + HTML structure (where Tier requires reordering).

2. **Apply tokens, не magic numbers.** Все spacing — `var(--space-N)`. Все font sizes — predefined scale. Все colors — palette tokens.

3. **One Tier 1 per screen rule enforced.** Если existing UI имел competing prominence — demote всё кроме одного.

4. **Mobile-first.** Implement 4-col mobile rules first, then expand к 12-col desktop. Не reverse.

5. **Test после каждого major change.** If user has running dev server — open в browser, screenshot, compare.

### Process

For каждый screen:

1. Read hierarchy spec (`wiki/design/hierarchy-{screen}.md`)
2. Read layout-system spec (`wiki/design/layout-system.md`)
3. Read existing HTML/CSS for screen
4. Apply changes:
   - **Reorder DOM** if needed (Tier 1 element should come early in document for accessibility, не absolutely-positioned)
   - **Replace spacing** — все `padding: 14px` → `padding: var(--space-3)` etc.
   - **Apply density mode** per region — sparse / default / dense consistently
   - **Replace ad-hoc CSS Grid / Flexbox** с standard grid system
   - **Add explicit breakpoint behavior** для каждого major component
   - **Fix overlap / collision** (use flex gap, не absolute positioning over content)
5. Save modified files

### Don't do these

- ❌ Don't rewrite components from scratch — refactor existing
- ❌ Don't introduce new dependencies (no new framework)
- ❌ Don't change copy/text content (только structure)
- ❌ Don't remove functionality even if "could be cleaner without it"
- ❌ Don't apply visual changes (palette, fonts, animations) — это `/visual-upgrade` job

### STOP after Step 4

```
═══════════════════════════════════════════
  Redesign applied
  
  Files modified:
  - {file1.html} ({N} lines changed)
  - {file2.css} ({N} lines changed)
  
  Changes summary:
  - {N} ad-hoc spacing values → tokens
  - {N} components reordered per hierarchy
  - {N} density mismatches fixed
  - {N} breakpoint rules added
  - {N} overlap/collision fixes
  
  Backup: original files copied to .ui-pipeline-backup/
═══════════════════════════════════════════

Continue to Step 5 (verify)? (Y/n)
```

## Step 5 — Verify (~5-10 минут)

### Цель
Confirm Step 1 findings resolved + no new issues introduced.

### Process

1. Invoke `/ui-review {target}` снова на the modified files
2. Compare new findings vs Step 1 baseline
3. Generate diff report

Output: `wiki/design/ui-pipeline-{date}-summary.md`

```markdown
# UI Pipeline run — {Project} {Date}

## Baseline (Step 1)
- {N} CATASTROPHIC + {N} MAJOR + ...

## After redesign (Step 5)
- {N} CATASTROPHIC + {N} MAJOR + ...

## Resolved
- ✓ {Issue 1}
- ✓ {Issue 2}

## New findings (regressions)
- ⚠ {Issue X} — was not present before, introduced by redesign

## Outstanding
- {Issue Y} — remained because {reason}

## Recommendation
{Continue / iterate / approve}
```

### STOP after Step 5

```
═══════════════════════════════════════════
  UI Pipeline complete
  
  Improvement:
  - Catastrophic: {Before} → {After}
  - Major: {Before} → {After}
  - Total findings: {Before} → {After}
  
  Score: {0-10 estimate}
  
  Summary: wiki/design/ui-pipeline-{date}-summary.md
═══════════════════════════════════════════

Next steps:
- Show project в browser? Compare visually?
- Run /visual-upgrade for color/typography polish?
- Continue to other screens?
```

## Modes

### Full mode (default)
All 5 steps with stops.

### Dry run mode
```
/ui-pipeline --dry-run
```
Steps 1-3 produce specs but Step 4 doesn't apply changes. Step 5 skipped. Useful for cost preview.

### Audit only
```
/ui-pipeline --audit-only
```
Только Step 1 + summary. No redesign. Useful for "show me what's wrong".

### Resume mode
```
/ui-pipeline --resume
```
Read `wiki/design/` — figure out which steps already done — continue from next pending step.

## Status tracking

After each step, update `wiki/_current.md`:

```markdown
## Active task

**UI Pipeline (in progress)**

- [x] Step 1 — Audit (2026-05-03 14:30)
- [x] Step 2 — Hierarchy (2026-05-03 14:55)
- [x] Step 3 — Layout system (2026-05-03 15:10)
- [ ] Step 4 — Implement ← здесь сейчас
- [ ] Step 5 — Verify
```

Per Architectural Invariant #14, update wiki BEFORE asking user any approval question.

## Common pitfalls

1. **Skip Step 1 (audit) thinking "we know what's broken"** — without baseline, can't measure improvement.
2. **Implement Step 4 без Step 2-3 specs** — falls back to ad-hoc fixes (что и произошло в реальности).
3. **Apply visual changes during Step 4** — keep scope: structure only. Visual = separate skill.
4. **Skip Step 5 because "looks good"** — regressions sneak in. Always verify.
5. **Don't preserve functional behavior** — UI redesign that breaks save/load = user trust破壊.

## CRITICAL — wiki cleanup before showing user questions

Per Architectural Invariant #14: каждый step должен update `wiki/_current.md` + `wiki/_map.md` ДО printing summary + asking user approval.

Order: do step work → update wiki → print summary/questions → end turn.

Otherwise Stop hook fires after questions → user attention fragmentation.

## Anti-patterns — do NOT

- ❌ Не делай single big tool call для всех 5 steps без user approval — слишком long-running
- ❌ Не пропускай stop points — user approve между шагами критично (могут быть corrections)
- ❌ Не пиши код в Step 1-3 — это spec phase
- ❌ Не делай visual changes (color, fonts) — это другой skill
- ❌ Не trust "looks good" — always run Step 5 verify

## Integration

В `/full-pipeline` (master Forge orchestrator):
- Step 4 (Build) может invoke `/ui-pipeline` если existing UI имеет visual chaos
- Step 5 (Test) может flag "UI needs work" → triggers /ui-pipeline

Standalone:
- `/ui-pipeline samogonshchik.html` — без full pipeline, точечный redesign existing project

## Non-Negotiable

- [ ] User approve между каждым step (5 stop points)
- [ ] Files backed up до Step 4 changes
- [ ] Step 5 verify always run (catches regressions)
- [ ] Functional behavior preserved through redesign
- [ ] All output saved в wiki/design/ для traceability
