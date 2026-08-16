---
tags: [changelog]
---

# Changelog

> Newest first. Never delete old entries.
> High-level milestone diary for Forge as a meta-project.
> Detail per version: docs/CHANGELOG.md

## 2026-04-28 — v4.9.1 (hotfix: dashboard prompt paths)

Real-world bug from first user session post-v4.9.0 ship: dashboard "Создание проекта" prompt had mixed forward/backslashes + broken `cd <path>; powershell` chain.

Fix: consistent Windows backslashes everywhere в modal output, multi-line commands вместо inline `;`, path placement hint, confirmation dialog для common mistake (project folder INSIDE forge folder vs SIBLING).

Lesson #32 — eat your own dog food. Create один проект через dashboard at least once per release.

## 2026-04-28 — v4.9.0 (8-iteration release: complete the architectural infrastructure)

User feedback: "давай делать всё но так же итерациями".

8 backlog items, по итерациям:

1. **Lesson rotation policy** — 3-tier classification (principle/pattern/incident), [[decisions/012]]. +Invariant #13 (user pushback as signal).
2. **Skill categorization** — `kind: architectural | tactical` в 96 skills. +`scripts/check-skill-kind.mjs`.
3. **/start auto-invocation chain** — Step 6.6 lays full architectural foundation per type/category.
4. **`scripts/check-pipeline-state.mjs`** — reads wiki/_current.md + filesystem, reports current step + next-step requirements.
5. **localStorage migrations** в dashboard.html — `SCHEMA_VERSION = 4`, idempotent self-healing for legacy data shapes.
6. **`scripts/check-dashboard-structure.mjs`** — visual regression via structural diff (no puppeteer dependency).
7. **`platforms/_shared/_lib/imports.mjs`** — `detectImportedNames()` helper applied к Steam + VK validators.
8. **Forge MCP Server** — `mcp-server/index.mjs`, raw JSON-RPC over stdio, exposes 96 skills + 12 ADRs + 13 invariants + 10 verifiers + 3 prompts. No SDK dependency.

### Verifier suite — теперь 10
Plus check-skill-kind, check-pipeline-state, check-dashboard-structure.

### Skills — теперь 97
Added /mcp-server.

→ See [[decisions/012-lesson-rotation-policy]]

## 2026-04-28 — v4.8.0 (drift prevention + permanent invariants + App Track complete)

Major release combining 6 backlog items. Theme: automate manual audits, lock in principles, finish App Track.

**Drift prevention (3 new automation):**
- `scripts/check-cross-refs.mjs` — automated advisor catalog audit (caught bug that recurred 6+ times)
- `scripts/check-bat-encoding.mjs` — cmd.exe parser safety (prevents v4.7.1 regression)
- wiki-audit hook ±2s mtime tolerance (fixes Spiral Vigil session false positive)

**Permanent invariants:**
- New `🧭 ARCHITECTURAL INVARIANTS` section в CLAUDE.md
- 12 distilled rules from lessons #20-29
- Cross-references to ADRs for deep-dive

**App Track complete (2 new foundations):**
- `/education-foundation` (515 lines) — Bloom's taxonomy, spaced repetition (SM-2/FSRS), COPPA, multi-role
- `/social-foundation` (660 lines) — moderation pipeline, T&S 3 pillars, real-time, age gating

All 8 app categories теперь имеют complete foundation pipeline.

→ See [[decisions/011-wiki-audit-mtime-tolerance]]

## 2026-04-27 — v4.7.10 (App Track Iteration 2 — per-category foundations)

4 architectural foundation skills для специфичных категорий:
- `/health-app-foundation` (488 lines) — GDPR Article 9 + encryption + behavior design + crisis intervention + medical disclaimer
- `/finance-app-foundation` (393 lines) — bigint money (NEVER float) + atomic transactions + financial audit (7-year retention) + tax export
- `/business-app-foundation` (575 lines) — multi-tenant isolation + hierarchical RBAC + workflow state machines + audit с legal hold + integrations + white-label
- `/saas-foundation` (566 lines) — trial→paid flow + admin panel (impersonation audited) + Stripe webhooks + dunning + customer health score + growth loops

Plus new verifier `scripts/check-no-float-money.mjs` (finance gate). Plus advisor catalog 93/93. Plus design-pipeline auto-invokes foundations.

→ See [[decisions/010-architectural-vs-tactical-skills]] (extended to per-category)

## 2026-04-27 — v4.7.9 (App Track Iteration 1 — universal app foundations)

User feedback: "у нас с тобой упор хороший на игры, НО мы делаем и различного рода программы".

5 new universal app skills:
- `/app-data-model` (277 lines) — schema, repositories, migrations, sync strategies
- `/app-onboarding-flow` (230 lines) — Level 1/2/3, empty states, permission asks
- `/app-search` (270 lines) — Fuse.js / Lunr / linear, history, autocomplete
- `/app-permissions` (306 lines) — 4-role RBAC, audit log, multi-tenant
- `/subscription-design` (376 lines) — 5 models, trial flows, paywall, churn prevention

Plus:
- `/analyze-project` Step 2.5 — classify в 8 categories (productivity, tools, business, saas, health, finance, education, social)
- `/product-metrics` — app-specific benchmarks per category
- `/design-pipeline` — mode-aware (game vs app), spawns different specialists per category. Health/finance compliance auditor MANDATORY.

## 2026-04-27 — v4.7.8 (full pipeline orchestration)

User вопрос: "хочется автономный mode + KPI ahead of design + почему агенты не работают".

4 new orchestrator skills:
- `/product-metrics` — KPI proposal с benchmarks (D1/D7/D30, ARPU) с 3 levels (Floor/Target/Stretch)
- `/design-pipeline` — спавнит 7 specialists через subagents (game/level/monetization/art/sound/architect/PM)
- `/autopilot` — autonomous mode, stops only on blockers/3x failures. Smoke test per sprint.
- `/pipeline` — master orchestrator 7 steps (analyze→metrics→design→build→test→release-ready→release)

Plus `/credentials-check` expanded from 4 platforms (Yandex/VK/RuStore/Web) to all 9 (added Telegram/MAX/Steam/VKPlay).

## 2026-04-27 — v4.7.7 (workspace discipline enforcement)

3-layer enforcement of GameIntegration / WorkProgress / Release rule:
- `.claude/hooks/workspace-discipline.mjs` blocks edits to GameIntegration/* and Release/{X}/*
- CLAUDE.md prominent table at top
- `/start`, `/analyze-game`, `/analyze-project` Phase 0 mandatory copy step
- `scripts/check-workspace-discipline.mjs` audit verifier

8 hooks total now (was 7), 81 skills, PERFECT 9/9 platform completeness.

→ See [[decisions/009-workspace-discipline-three-layers]]

## 2026-04-27 — v4.7.6 (i18n foundation as default)

`/i18n-foundation` skill — runtime ru+en architecture from day 1.
`scripts/check-inline-strings.mjs` gate. `/start` Step 6.5 mandatory.

→ See [[decisions/007-i18n-runtime-default]]

## 2026-04-27 — v4.7.5 (advisor становится context-aware)

`/advisor` reads wiki/ before formulating. 4 classifications: Continuation / Pivot / New task / Question. Coverage 80/80.

→ See [[decisions/008-context-aware-advisor]]

## 2026-04-25 — v4.7.4 (edit button restored)

z-index conflict fix. Card-cover hiding edit button. Solution: z-index: 5, dark pill bg, ✏️ icon.

## 2026-04-25 — v4.7.3 (dashboard preview + sort)

Dashboard: cover images, 4 sort modes with localStorage persistence, image field в modal. Caught a 0-is-falsy JS bug в status sort comparator (lesson #22).

## 2026-04-25 — v4.7.2 (dashboard path sanitization)

3 layers in dashboard.html — auto-sanitize at copy time, per-card "Исправить путь" button, header "🔧 Fix paths" button. Projects must be SIBLINGS of template.

## 2026-04-24 — v4.7.1 (sync.bat ASCII fix)

cmd.exe parser breaks on multi-byte chars **inside `()` blocks**, even with `chcp 65001`. Fixed by rewriting `scripts/sync.bat` and `scripts/open-all.bat` with pure ASCII.

→ See [[decisions/004-encoding-rules]]

## 2026-04-24 — v4.7.0 (Steam + VK Play platforms)

Major: 3 → 9 platforms. Steam (Electron + steamworks.js) и VK Play (vkplay.ru iframe + signed auth). Plus `scripts/check-platform-completeness.mjs` automated audit (18 checks × 9 platforms).

→ See [[decisions/006-platform-completeness-check]]

## 2026-04-23 — v4.6.4 (advisor catalog updated to v4.6)

Caught up advisor's skill catalog with reality. 5th occurrence of catalog drift bug — motivated v4.8 plan for `scripts/check-cross-refs.mjs` automation.

## 2026-04-22 — v4.6.3 (dashboard accuracy + /start research integration)

- `/start` Phase 0a auto-research-references mandatory
- `/start` Phase 0b auto skill-discovery via /find-or-make-skill
- Dashboard skills count corrected

→ See [[decisions/005-auto-research-phase0]]

## 2026-04-22 — v4.6.2 (UTF-8 BOM fix for PowerShell 5.1)

setup.ps1 + sync.ps1 + scripts/*.ps1 — added UTF-8 BOM. PS 5.1 needs it for Cyrillic content.

→ See [[decisions/004-encoding-rules]]

## 2026-04-22 — v4.6.1 (path-flexibility fix)

Replaced folder-name-based template detection with absolute-path equality.

→ See [[decisions/003-template-by-path-equality]]

## 2026-04-21 — v4.6.0 (auto-research as Phase 0)

Major: research-references became mandatory first phase of /start, /analyze-game, /analyze-project.

→ See [[decisions/005-auto-research-phase0]]

---

## Earlier — v4.5.x and prior

See `docs/CHANGELOG.md` for v4.5.x and earlier (sync mode safe merge, knowledge base / skills separation, research-references skill creation, find-or-make-skill, etc.).
