---
name: start
kind: architectural
description: "Bootstrap a new project from a plain-language description. Use when user says \"start\", \"create project\", \"new project\", \"build me\", \"сделай\", \"создай проект\", or describes an…"
---

> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.

# Start New Project

## Arguments
`[INVOCATION_INPUT]` — what the user wants to build. Any language.

## Instructions

### Step 0 — Workspace setup (MANDATORY, v4.7.7+)

**ALWAYS first action — create the 3-folder structure.**

```bash
# bash
mkdir -p GameIntegration WorkProgress Release
mkdir -p WorkProgress/{ProjectName}

# pwsh
New-Item -ItemType Directory -Force -Path GameIntegration, WorkProgress, Release
New-Item -ItemType Directory -Force -Path "WorkProgress\{ProjectName}"
```

If user has provided source files — they go to `GameIntegration/{ProjectName}/`. Then **immediately copy to `WorkProgress/{ProjectName}/`**:

```bash
cp -r GameIntegration/{ProjectName}/* WorkProgress/{ProjectName}/
```

**ALL subsequent edits in this skill happen in `WorkProgress/{ProjectName}/`.** Never edit `GameIntegration/` (read-only sources) or `Release/` (only release-* skills write there).

This is enforced by `workspace-discipline` hook — it will block edits to `GameIntegration/*` and `Release/*` paths.

### Phase 0a — Research references (MANDATORY, v4.6.3+)

**Before** parsing the user's vision, understand the competitive landscape. Skipping this step makes Step 1-3 produce generic decisions that ignore real-world patterns.

Invoke `$research-references` with the project topic extracted from `[INVOCATION_INPUT]`. Examples:
- "создай шутер с волнами" → `$research-references hypercasual wave shooter mobile`
- "task manager PWA" → `$research-references task management PWA productivity app`
- "telegram bot для рассылок" → `$research-references telegram broadcast bot subscription model`

This produces `wiki/research/{Project}-references.md` with 3-5 real competitors, table-stakes features, differentiation opportunities, UI/UX direction.

**Stop after this phase.** Show user one-screen summary, wait for confirmation of direction before Step 1.

If user says "skip research" / "без research" — log the skip in `wiki/decisions/000-skipped-research.md` and proceed.

### Phase 0b — Skill discovery (v4.6.3+)

For each specialized competency the project will need beyond standard CRUD/canvas — invoke `$find-or-make-skill`:

- Project uses physics? → `$find-or-make-skill 2D physics canvas game`
- Project needs specific monetization model? → `$find-or-make-skill subscription tier IAP design`
- Specific design aesthetic? → `$find-or-make-skill brutalist UI design system`

Discovery chain (already encoded in find-or-make-skill): local skills → local agents → Anthropic official → community marketplaces → fall back to `$write-skill` to create one.

Don't proceed to Step 1 without completing discovery for the obvious specialized needs.

### Step 1 — Understand the Vision

Parse the description **with research context now loaded**. Identify:
- **What:** core product (game? app? bot? site?)
- **Platform:** web HTML5? PWA? Node.js? mobile?
- **Key features:** 3-5 must-have features (informed by research findings — copy table-stakes, plan differentiation)
- **Audience:** who will use this?

If description is vague, ask ONE focused question — not a list of 10.

### Step 2 — Select Tech Stack

| Type | Stack |
|------|-------|
| Browser game | Single HTML5 + Canvas + Web Audio |
| Complex game | Multi-file: HTML + JS modules + Canvas |
| Web app | HTML + CSS + JS (or SvelteKit if PWA) |
| Telegram bot | Node.js + node-telegram-bot-api |
| API/backend | Node.js + Express (or Python + FastAPI) |
| PWA | SvelteKit + Tailwind + Dexie.js + Workbox |
| Static site | HTML + CSS + JS (or Astro) |

Log decision in `wiki/decisions/001-tech-stack.md` with reasoning.

### Step 3 — Create Wiki Skeleton

```
wiki/
├── _current.md            ← copy from _current.md.template and fill
├── _map.md                ← fill vision, status, links
├── plan/
│   ├── _template.md       (already present)
│   ├── README.md          (already present)
│   └── Q1-001-<slug>.md   ← create first task, status: in_progress
├── features/
├── decisions/
│   └── 001-tech-stack.md  ← why this stack
├── bugs/
├── sessions/
└── architecture/
    ├── stack.md
    └── data-flow.md
```

### Step 4 — Fill wiki/_current.md

Copy from `wiki/_current.md.template`, then fill:
- **Session goal:** one line — what we build in this first session
- **Active task:** link to `Q1-001` from `wiki/plan/`
- **Acceptance checkboxes:** copy from Q1-001
- Empty sections — fill as work progresses

### Step 5 — Fill wiki/plan/Q1-001-<slug>.md

Use `wiki/plan/_template.md`. First task should be "scaffold + first working
feature", with acceptance like:
- [ ] project builds
- [ ] first feature works end-to-end
- [ ] basic styling present

Set `status: in_progress` immediately — you're about to work on it.

### Step 6 — Load Skills from Catalog

Read `skills/CATALOG.md`. Match user's description to keyword table.

**For games:** ALWAYS load: `skills/core/visual-quality/`, `skills/core/game-ui/`, `skills/core/mobile-controls/`, `skills/core/html-template/`. Then genre-specific from `skills/games/`.

**For apps:** Load matching category: `skills/apps/{category}/`. If complex: `skills/apps/deepapp-systems/`.

**For PWA:** ALWAYS load: `sveltekit-pwa` + `dexie-offline` + `pocketbase` + `tailwind-mobile` + `auth-vk`. Then feature-specific from `skills/pwa/`.

### Step 6.5 — i18n Foundation (v4.7.6+, MANDATORY for new projects)

**Before writing any user-facing code, lay i18n architecture.**

Even if user says "проект только на русском, не нужна локализация" — explain:
- i18n foundation = ~30 минут setup, ~0 ongoing cost
- Retrofit later = days of work, hunting `grep` results across all files
- Yandex Games / VK / Telegram release требует 13 / 4 / 2 языков → если когда-нибудь пойдёшь туда, foundation уже есть

Default: `ru + en` (placeholder). User can opt-out only with explicit "skip i18n, я знаю что делаю".

Run `$i18n-foundation` skill which creates:
- `src/i18n/{index.ts, ru.ts, en.ts, data.ru.ts, data.en.ts, types.ts, detect.ts}`
- `scripts/check-inline-strings.mjs` (validation gate)
- Bootstrap integration in `main.ts` (`setLang(detectLang())` + `onLangChange` callback)

After foundation:
- All UI strings use `t('key')` from day 1
- All game-data names use `td('key')` from day 1
- `npm run build` (or equivalent) runs `check-inline-strings.mjs` — fails if cyrillic literals leak in

### Step 6.6 — Architectural Foundation Chain (v4.9.0+, type/category-driven)

After i18n is laid, invoke remaining architectural foundations based on `type` and `category` from `wiki/_map.md`. Each one is `kind: architectural` (see `kind:` frontmatter, Invariant #2). They set up patterns that retrofit cost days.

**Invocation order matters** — later skills depend on earlier ones:

```
1. i18n-foundation             [done в Step 6.5]
2. app-data-model              (if type=app — entities, repositories, schema versioning)
3. app-permissions             (if multi-user — RBAC pattern)
4. app-onboarding-flow         (always — empty states, permission asks, sample data)
5. subscription-design         (if monetized — tiers, paywall, churn prevention)
6. Per-category foundation     (if applicable):
     - category=health   → $health-app-foundation
     - category=finance  → $finance-app-foundation
     - category=business → $business-app-foundation
     - category=saas     → $saas-foundation
     - category=education → $education-foundation
     - category=social   → $social-foundation
7. app-search                  (if category=tools/reference — search-as-primary-interaction)
```

For **games** (type=canvas_game / type=unity_webgl):
- Skip app-* skills
- After i18n, jump directly to genre-specific KB skills (Step 6 already loaded them)
- Game design specialists run via `$design-pipeline` later (Step 3 of master pipeline)

#### How to invoke (Stop-and-confirm pattern)

For each architectural skill in chain:

```
Я заложу {skill name} foundation — это {one-sentence value prop}.

[Invoke /skill-name]

После него у тебя:
- {what was created}
- {how to use it}

Идём дальше? Следующий: {next skill in chain}.
```

User can:
- **"да"** / silence after 10 sec → next skill
- **"пропусти"** → skip this one (warn что retrofit cost), proceed
- **"стоп"** / **"всё, дальше сам"** → exit chain, normal flow

This is opinionated — defaults to laying full foundation. User must explicitly opt-out if they want bare project. The point of `$start` is to set up RIGHT, not minimal.

#### What gets created (typical app project, e.g. tools/reference for productivity)

```
src/
├── i18n/                 ← Step 6.5
│   ├── index.ts, ru.ts, en.ts, data.ru.ts, data.en.ts, types.ts, detect.ts
├── data/                 ← app-data-model
│   ├── schema.ts (SCHEMA_VERSION = 1, MIGRATIONS = {})
│   ├── storage/{index, types, indexeddb, memory}.ts
│   ├── entities/{your entities here}.ts
│   └── repositories/{your repos here}.ts
├── onboarding/           ← app-onboarding-flow
│   ├── index.ts, state.ts, analytics.ts, types.ts
│   └── steps/{welcome, permissions, sample-data, first-action}.ts
└── search/               ← app-search (if tools/reference)
    ├── index.ts, engine.ts, history.ts, highlights.ts, types.ts

scripts/
├── check-inline-strings.mjs  ← from i18n-foundation

wiki/
├── design/
│   ├── data-model.md
│   ├── onboarding.md
│   └── search.md (if applicable)
└── architecture/
    └── stack.md (updated with chosen libraries: dexie, fuse.js, etc)
```

This is **Day 1 state** — before first feature. ~1-2 hours total for chain. Cost of doing same retrofit later: **days to weeks**.

### Step 7 — Build First Feature

Don't stop at scaffolding. Build the first working feature immediately.
Follow all code comment rules from CLAUDE.md.

After building:
- Create `wiki/features/<feature-name>.md`
- Check off corresponding acceptance boxes in `wiki/plan/Q1-001-<slug>.md`
- Update `wiki/_current.md` progress

### Step 8 — Report

```
════════════════════════════════
  PROJECT: {name}
════════════════════════════════

Stack: {tech}
Files created: {N}
First feature: {what's working}

Wiki:
  wiki/_current.md         ✓
  wiki/_map.md             ✓
  wiki/plan/Q1-001-...md   ✓ (in_progress, 1/3 acceptance)
  wiki/decisions/001-...md ✓
  wiki/features/<n>.md     ✓

Next session: $continue
```

## Non-Negotiable Acceptance Criteria
- [ ] `wiki/_current.md` created from template with all sections filled
- [ ] `wiki/_map.md` created with Vision, Status, Links
- [ ] `wiki/plan/Q1-001-<slug>.md` created with `status: in_progress`
- [ ] `wiki/architecture/stack.md` created
- [ ] `wiki/decisions/001-tech-stack.md` created
- [ ] At least one working feature (not just scaffolding)
- [ ] `wiki/features/<n>.md` for first feature
- [ ] Every code file has header comment
- [ ] Every function has JSDoc comment
- [ ] `README.md` with "how to run" instructions
