---
name: analyze-project
kind: architectural
description: "Analyze HTML5 project: detect type, dependencies, server needs, assets, orientation, AND research similar projects / required skills. ALWAYS run first."
---
# Analyze HTML5 Project

## Steps

### Phase 0 — Workspace setup (MANDATORY, v4.7.7+)

**Перед сканированием — копировка sources в WorkProgress/.**

```bash
# Auto-detect from GameIntegration/ folder name (or input/{project} for legacy)
mkdir -p WorkProgress/{ProjectName}
cp -r GameIntegration/{ProjectName}/* WorkProgress/{ProjectName}/
```

ВСЁ дальнейшее scanning + edits в `WorkProgress/{ProjectName}/`. `GameIntegration/` остаётся read-only.

`workspace-discipline` hook блокирует Edit/Write в `GameIntegration/*`.

### 1. Scan files
```bash
find WorkProgress/{ProjectName}/ -type f | head -100
du -sh WorkProgress/{ProjectName}/
```

### 2. Detect type
Check indicators:
- manifest.json / site.webmanifest → PWA
- package.json with express/fastify/ws/socket.io → SERVER
- canvas + requestAnimationFrame + gameLoop → CANVAS_GAME
- Build/ + .wasm + .data → UNITY_WEBGL
- .env / .env.example → SERVER (API keys)
- fetch(http...) / axios(http...) → external API deps
- None of above → SIMPLE_HTML5

### 2.5. Classify app category (v4.7.9+, MANDATORY for non-game projects)

**If type is NOT a game (CANVAS_GAME / UNITY_WEBGL)**, classify into one of 8 app categories. Categories drive:
- `$product-metrics` — different KPI benchmarks (D7=50% normal for productivity, terrible for games)
- `$design-pipeline` — different specialists (info architect vs game designer)
- Architectural skills auto-invoked (e.g. health → privacy, finance → PCI)

| Category | Indicators in code/structure | Examples |
|---|---|---|
| **productivity** | localStorage with notes/tasks/calendar items, list-based UI, CRUD operations | задачники, заметки, календарь, todo, kanban |
| **tools / reference** | calculation logic, lookup tables, search/filter UI, mostly read-only data | нумерология, конвертеры, словари, садовник, гайды, справочники |
| **business / B2B** | multi-user concept (roles, permissions), CRUD with relations, reports/dashboards | CRM, инвентаризация, отчёты, ERP, project management |
| **saas** | subscription model, multi-tenant, admin panel, billing integration | analytics dashboards, dev tools, marketing platforms |
| **health / wellness** | trackers (weight/sleep/mood), reminders, streaks/habits, sensitive personal data | фитнес, медитация, симптом-трекеры, period tracker |
| **finance** | money-related calculations, transaction history, payment integration, sensitive financial data | бюджеты, инвестиции, кредитный калькулятор, learning trading |
| **education** | lesson structure, progress tracking, quiz/test logic, content depth | курсы, словари с прогрессом, упражнения, exam prep |
| **social / community** | user profiles, feed/timeline, comments/likes, real-time messaging | чаты, форумы, mini social networks |

#### How to classify

1. **Look at file names first** — `tasks.js`, `notes.js`, `calculator.js` → strong signal
2. **Look at data model** — what's stored in localStorage / IndexedDB? Items? Records? Posts?
3. **Look at UI patterns** — list with checkboxes (productivity), search bar with results (tools), dashboard with metrics (business/saas), feed (social), trackers (health)
4. **Look at business model hints** — pricing pages, "Pro" tiers (saas), in-app purchases (consumer apps)
5. **Ask user if unclear** — "I see you have X, Y, Z. Is this primarily a productivity tool, reference app, or business tool?"

#### Output classification

In ANALYSIS.md and `wiki/_map.md` add:
```
type: app
category: productivity | tools | business | saas | health | finance | education | social
sub-category: {free-text describing more specific niche, e.g. "kanban-style task manager" or "personal finance tracker"}
```

This category is then read by `$product-metrics`, `$design-pipeline`, and architectural foundation skills (planned for v4.7.10).

### 3. Choose strategy
- SERVER_DEPENDENT → STOP. Report hosting requirements.
- PWA hosted → TWA
- PWA local → pwa-convert + Capacitor
- CANVAS_GAME → Capacitor + orientation lock + fullscreen
- UNITY_WEBGL → Capacitor + large asset handling (check <150MB)
- SIMPLE_HTML5 → Capacitor

### 3.5. Research references (MANDATORY, v4.4+)

After type is known, **before** planning rework — research the competitive landscape.

Invoke `$research-references` with extracted topic. For existing projects, the topic combines:
- The project type (e.g. "canvas game + roguelike mechanics")
- Key features detected in files (from manifest.json, titles, obvious game loop)
- Target platforms if already specified

The research doc produced (`wiki/research/{Project}-references.md`) will inform:
- Whether this project is competitive vs state-of-the-art
- Which features to keep, which to rework, which to add
- UI/UX direction before any visual changes

Wait for research summary → user confirms direction → move to Step 4.

### 3.6. Skill discovery for competencies needed (v4.4+)

For each specialized competency needed to bring the project to ship-quality — invoke `$find-or-make-skill`.

Common triggers:
- Project uses a specific physics/animation/audio library → find skill for that library's best practices
- Project targets a platform without existing platform skill → create one
- Project needs monetization/ads not already covered by `yandex-ads` skill → find or create

Don't proceed to Step 4 (Detect orientation) without completing the discovery chain for the obvious gaps.

### 4. Detect orientation
- Canvas wider than tall → landscape
- Canvas taller than wide → portrait
- CSS media portrait → portrait
- meta viewport → check
- No clue → portrait (safe default for mobile)

### 5. Write ANALYSIS.md
```markdown
# Analysis: {name}
## Type: {type}
## Category: {category — from Step 2.5, only for non-games}
## Sub-category: {free-text niche}
## Strategy: {Capacitor/TWA/Manual}
## Entry: index.html
## Size: {size}
## Orientation: {landscape/portrait/any}
## Dependencies: {list}
## i18n status:
  - foundation: ✓ есть (src/i18n/) / ✗ нет
  - inline cyrillic: {N} литералов (run scripts/check-inline-strings.mjs)
  - recommend: $i18n-foundation если ≥30 violations и нет foundation
## Warnings: {list}
## References: wiki/research/{Project}-references.md
## Skills needed: {list from find-or-make-skill runs}
## Steps: {numbered list}
```

### 7. Suggest architectural foundation chain (v4.9.0+)

After analysis, check what architectural foundations EXIST в project и propose what's missing.

For **apps** (type=PWA / SIMPLE_HTML5 / etc, not games), check filesystem:

| Foundation | Detect via | If missing → suggest |
|---|---|---|
| i18n | `src/i18n/` exists | `$i18n-foundation` (если ≥30 inline strings or going multi-lang) |
| data-model | `src/data/repositories/` exists | `$app-data-model` (если >100 records anticipated or sync planned) |
| permissions | `src/permissions/` or RBAC code | `$app-permissions` (если multi-user) |
| onboarding | `src/onboarding/` or first-run logic | `$app-onboarding-flow` (если D1 retention <30%) |
| subscription | Stripe/payment integration | `$subscription-design` (если monetized но нет structure) |
| Per-category foundation | category-specific patterns | health/finance/business/saas/education/social respective foundations |
| search | `src/search/` или search UI | `$app-search` (если tools/reference category) |

#### Output format

```
🏗️ Architectural foundation status:

✓ i18n-foundation         — заложена (src/i18n/ exists)
✗ app-data-model          — НЕТ (направления данных fragmented across files)
✗ app-onboarding-flow     — НЕТ (нет first-run experience, D1 risk)
✗ subscription-design     — НЕТ (но IAP feature requested)

Recommendations (по убывающей impact):
1. $app-data-model — централизовать data layer ДО next feature (предотвращает retrofit)
2. $subscription-design — заложить tiers/paywall structure (подписки в плане)
3. $app-onboarding-flow — добавить empty states + welcome (низкая D1)

Запустить chain прямо сейчас? (да/нет/выберу что нужно)
```

User can:
- **"да"** → run all suggestions in order
- **"только X" / "X и Y"** → run subset
- **"нет, потом"** → defer (logged in `wiki/_current.md` open questions)

For **games**, check different foundations (game-design.md, level-design.md в wiki/design/) — they're typically created in `$design-pipeline`, not retrofit.

## Non-Negotiable
- [ ] Run BEFORE any conversion
- [ ] Never assume type — detect from files
- [ ] Server found → STOP, report only
- [ ] Size check (APK <150MB, AAB <500MB)
- [ ] **v4.4: research-references ran** (wiki/research/{Project}-references.md exists)
- [ ] **v4.4: find-or-make-skill ran** for each specialized need identified in Step 3.6
- [ ] **v4.4: user confirmed direction** from research summary before Step 4
