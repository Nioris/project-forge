---
name: design-pipeline
kind: architectural
description: "Step 3 главного pipeline. Запускает параллельно специалистов (game-design, level-design, monetization-design, art-prompts, sound-design, architecture review) которые читают…"
---

# Design Pipeline — координация специалистов под targets

## Когда вызывать

После `$product-metrics` — когда есть утверждённые таргеты и понятно ЧТО строить (фичи, retention hooks, монетизация). Skill превращает их в **детальные дизайн-документы**.

Pre-requisites:
- ✅ `wiki/_map.md` существует
- ✅ `wiki/research/{Project}-references.md` существует
- ✅ `wiki/architecture/metrics.md` существует (approved targets)

Если хоть одно отсутствует — abort, попроси юзера сначала запустить нужный шаг.

## Концепция: parallel specialists через subagents

Без agents этот skill превратился бы в линейное "сначала game-design, потом level-design, потом monetization, потом..." — последовательно, медленно. С Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) — параллельно.

**Specialists зависят от типа проекта.** Read `wiki/_map.md` → `type` (game/app) и `category` (productivity/tools/saas/etc).

### For GAMES — 8 specialists

| Specialist | Что производит | Skill используемый | Output файл |
|---|---|---|---|
| **Game designer** | Core loop spec, retention hooks, difficulty curve | `$game-design` (read), `$level-design` | `wiki/design/gdd.md` |
| **Level designer** | Level structure, progression, content roadmap | `$level-design` | `wiki/design/levels.md` |
| **Monetization designer** | Конкретные ad/IAP placements, экономика | `$monetization-design` | `wiki/design/monetization.md` |
| **Art director** | Visual style guide, asset list, art prompts | `$art-prompts`, `$visual-upgrade` (read) | `wiki/design/art-bible.md` |
| **Sound designer** | SFX list, music направления, audio budget | `$sound-design` | `wiki/design/audio.md` |
| **UI Systems designer** ⭐ NEW v4.10.5 | Information hierarchy + layout grid + spacing tokens + breakpoints. Без этого art-direction живёт на random spacing → flat hierarchy → "панели не на месте". | `$info-hierarchy`, `$layout-system` (mandatory) | `wiki/design/hierarchy-{screens}.md`, `wiki/design/layout-system.md` |
| **Architect** | Module breakdown, tech decisions, data flow | reads `wiki/architecture/stack.md`, may invoke `$find-or-make-skill` | `wiki/architecture/modules.md` |
| **Product manager** | Sprint breakdown, milestones, dependencies | reads everything else | `wiki/plan/02-development-plan.md` |

### For APPS — different specialists per category

App pipelines differ from games. Vместо "game designer" / "level designer" / "sound designer" нужны другие роли.

#### Universal app specialists (all categories)

| Specialist | Что производит | Skill используемый | Output файл |
|---|---|---|---|
| **Information architect** | Navigation structure, screen hierarchy, content organization | `$app-data-flow` (read), `$app-settings` | `wiki/design/ia.md` |
| **UX flow designer** | User flows, error states, edge cases, onboarding | `$app-ux-polish`, `$app-onboarding-flow` | `wiki/design/flows.md` |
| **Data architect** | Data model, sync model, persistence strategy, schema migrations | `$app-data-model` | `wiki/design/data-model.md` |
| **Visual designer** | Design system, components, themes, accessibility | `$app-ux-polish`, `$visual-upgrade` (read) | `wiki/design/design-system.md` |
| **UI Systems designer** ⭐ NEW v4.10.5 | Information hierarchy + layout grid + spacing tokens + breakpoints + density modes. Foundation для visual designer'а — без этого design system живёт на random spacing. | `$info-hierarchy`, `$layout-system` (mandatory) | `wiki/design/hierarchy-{screens}.md`, `wiki/design/layout-system.md` |
| **Architect (technical)** | Module breakdown, tech decisions, integrations | reads `wiki/architecture/stack.md` | `wiki/architecture/modules.md` |
| **Product manager** | Sprint breakdown, milestones, dependencies | reads everything else | `wiki/plan/02-development-plan.md` |

#### Category-specific additions

Plus 1-2 specialists in addition to universals, depending on category:

| Category | Additional specialists |
|---|---|
| **productivity** | + **Monetization designer** (`$subscription-design`) — freemium tiers, paywall placement |
| **tools / reference** | + **Content designer** — for tools content IS the product. `$research-references` for content quality benchmarks |
| **business / B2B** | + **Permissions architect** (`$app-permissions`) — RBAC, multi-tenant, audit log + **Compliance auditor** (basic) |
| **saas** | + **Subscription/billing designer** (`$subscription-design`) — tiers, pricing, billing model + **Admin panel designer** |
| **health / wellness** | + **Privacy/compliance auditor** — GDPR, sensitive data handling + **Behavior designer** — habit formation, streaks |
| **finance** | + **Compliance auditor** — PCI/financial data regulations + **Trust/security designer** — UX for sensitive ops |
| **education** | + **Learning designer** — pedagogy, progression curve, gamification + **Content designer** |
| **social / community** | + **Moderation designer** — content policy, abuse prevention + **Community designer** |

#### Mode selection at runtime

```
1. Read wiki/_map.md
2. type = "game" or "app"
3. If app: also read category
4. Spawn appropriate specialists from tables above
5. If category requires compliance specialist (health/finance) — that one is MANDATORY, not opt-out
6. Auto-invoke per-category foundation skill (v4.7.10+):
   - health → $health-app-foundation
   - finance → $finance-app-foundation
   - business → $business-app-foundation
   - saas → $saas-foundation
   - education → $education-foundation (v4.8.0+)
   - social → $social-foundation (v4.8.0+)
   These run BEFORE design specialists, lay the architectural foundation that
   specialists then design on top of.
```



7 specialists. Можно последовательно (1.5-2 часа) или параллельно через Agent Teams (~30 минут).

## Pipeline (5 шагов)

### Шаг 1 — Validate prerequisites

```bash
# Bash
[ -f wiki/_map.md ] || { echo "Run $start or $analyze-game first"; exit 1; }
[ -f wiki/architecture/metrics.md ] || { echo "Run $product-metrics first"; exit 1; }
[ -f wiki/research/*-references.md ] 2>/dev/null || \
  { echo "Run $research-references first"; exit 1; }
```

Если что-то отсутствует — STOP, скажи юзеру что запустить first.

### Шаг 2 — Mode selection

Спроси юзера: **parallel или sequential?**

- **Parallel (через Agent Teams)** — рекомендуется если AGENT_TEAMS=1 (default в Forge):
  - 30-40 минут общего времени
  - Каждый specialist работает в своём контексте
  - Если один fail'ит — остальные продолжают
  - Stop point после ВСЕХ — единый review
- **Sequential** — backup mode:
  - 1.5-2.5 часа
  - Один specialist за раз
  - Stop point после каждого
  - Проще debug'ить если что-то идёт не так

Default: parallel. Юзер может скастомизировать ("только game-design + monetization, остальные пропусти").

### Шаг 3 — Spawn specialists

#### Parallel mode (Agent Teams)

```
Спавн через subagent invocation. Каждый specialist получает context:
- wiki/_map.md (vision)
- wiki/architecture/metrics.md (targets)
- wiki/research/*-references.md (competitors)
- свой skill (game-design, level-design, etc)

И instruction: "Produce the design document. Save to wiki/design/{name}.md.
Stop and report back when done."
```

Используй subagents:
- **builder** или **doc-writer** — для game-design, level-design, monetization-design (текстовые документы)
- **{platform}-builder** — для platform-specific architecture decisions
- **sdk-researcher** — если нужен deeper dive в SDK для конкретной платформы

#### Sequential mode

Просто invoke skills по очереди:
1. `$game-design` → читает metrics, пишет `wiki/design/gdd.md`, stop
2. User approve → `$level-design` → `wiki/design/levels.md`, stop
3. User approve → `$monetization-design` → `wiki/design/monetization.md`, stop
4. ...и т.д.

### Шаг 3.5 — UI Systems FIRST, art/visual SECOND ⭐ v4.10.5

**CRITICAL ordering:** `$info-hierarchy` + `$layout-system` ДОЛЖНЫ запускаться **до** Art Director (для games) или Visual Designer (для apps).

Reason: art/visual specialists make tons of decisions about colors, fonts, components — но **без grid + spacing + tier system** их выбор приземляется в random spacing → flat hierarchy → "панели не на месте". Это observable failure pattern в Самогонщик / Genetic Lab MVPs.

Right order:
1. UI Systems designer запускает `$info-hierarchy` для каждого major screen → `wiki/design/hierarchy-*.md`
2. UI Systems designer запускает `$layout-system` → `wiki/design/layout-system.md`
3. **THEN** Art Director / Visual Designer pickup эти specs и делают visual choices в их рамках
4. UI Systems designer **finally** running `$ui-review` after implementation для validation

Без этого ordering — Forge генерирует красивые цвета на сломанной структуре.

### Шаг 4 — Cross-review

После того как все specialists сдали свои документы — **cross-review phase**:

Spawn **code-reviewer** или **doc-writer** subagent с задачей:
- Прочитать все 7 design документов
- Найти противоречия (e.g. game-design предполагает 30-сек core loop, но monetization-design предполагает 5-min между rewarded — несовместимо)
- Найти gaps (e.g. level-design референсит mechanic "X" которого нет в gdd)
- Вернуть report в `wiki/design/cross-review.md`

User approve cross-review → можно идти дальше.

### Шаг 5 — Master plan generation

Финальный specialist (PM role) читает ВСЕ дизайн-документы + cross-review + metrics + research, и produces:

```
wiki/plan/02-development-plan.md
```

Структура:

```markdown
# Development Plan — {Project}

## Overview

Targets (from metrics.md):
- D7 retention: 15%
- ARPDAU: $0.12
- ...

## Sprints

### Sprint 1 — Core foundation (week 1-2)
Goal: Core loop end-to-end playable, no content yet.

Deliverables:
- {feature 1} (3 days, depends on: nothing)
- {feature 2} (4 days, depends on: feature 1)
- ...

Acceptance: User can complete one full loop without crashes.

### Sprint 2 — Content + retention (week 3-4)
Goal: Enough content for D7 testing.

Deliverables:
- ... (with refs to gdd / levels / art-bible sections)

Acceptance: 5+ levels available, daily reward works, save persistence.

### Sprint 3 — Monetization (week 5)
Goal: Ads + IAP integrated, balance tuned.

Deliverables: ... (refs to monetization.md sections)

Acceptance: ARPDAU measurement system in place, ads don't break gameplay.

### Sprint 4 — Polish + soft launch (week 6)
Goal: Ready for closed alpha test.

Deliverables: ... (refs to art-bible polish section)

Acceptance: Floor metrics achievable in playthrough, no critical bugs.

## Risks
- {risk 1} — {mitigation}
- ...

## Open questions for user
- {question 1}
- ...
```

## Output

После `$design-pipeline`:

```
wiki/
├── architecture/
│   ├── metrics.md (existed)
│   ├── modules.md (NEW — architect)
│   └── stack.md (existed, may be updated)
├── design/                    (NEW directory)
│   ├── gdd.md                 (game design document)
│   ├── levels.md              (level design)
│   ├── monetization.md        (monetization design)
│   ├── art-bible.md           (art direction)
│   ├── audio.md               (sound design)
│   └── cross-review.md        (gaps + contradictions report)
└── plan/
    └── 02-development-plan.md (NEW — master plan для разработки)
```

User теперь имеет:
- 7 design документов + cross-review
- Master plan на 4-6 спринтов с acceptance criteria
- Ясные deliverables по каждому sprint'у

Это **input для Step 4** (`$autopilot` или ручная итерация).

## Subagent invocation patterns

### Когда какой агент

- **builder** — generic implementer. Используй когда specialist'у нужно прочитать context + написать документ.
- **doc-writer** — для документов которые потом будут читаться людьми (gdd, art-bible). Лучше structured output.
- **code-reviewer** — для cross-review phase. Хорош в "find contradictions".
- **sdk-researcher** — если architect упирается в "какой SDK выбрать?". Spawn'ит web research.
- **{platform}-builder** — для platform-specific design (e.g. yandex-builder для Yandex Games-specific UI rules).

### Coordination

После спавна specialists — wait until **all done** (или timeout 30 минут). Если кто-то не вернулся — fall back на sequential для этого specialist'а.

### Через `$team` orchestrator

Если есть `$team` skill в Forge — используй его, он стандартизирует Agent Teams invocation.

## Mode: explicit specialist selection

User может skip specialists которые не релевантны:

```
$design-pipeline --skip art,sound   # текстовый продукт без графики/звука
$design-pipeline only=monetization   # уже есть остальное, нужна только монетизация
```

## Common pitfalls

1. **Запуск без metrics.md** — specialists не знают targets, делают generic решения. Skill должен abort early.

2. **Parallel без Agent Teams** — без `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` "parallel" будет sequential. Проверь env, fall back на sequential если flag не set.

3. **Skip cross-review** — без него противоречия между документами всплывут позже в коде. Cross-review дешёвый, не пропускай.

4. **Master plan без acceptance criteria** — sprints без чётких "что считается готовым" → разработка тянется. Каждый sprint должен иметь bool acceptance.

5. **Игнорирование research** — specialist'ы должны читать `wiki/research/*-references.md`. Без этого решения generic.

## Non-Negotiable

- [ ] Pre-requisites checked (metrics.md, _map.md, research/)
- [ ] Spawn 7 specialists (или subset по запросу пользователя)
- [ ] Каждый specialist читает metrics + research
- [ ] Cross-review phase ДО master plan
- [ ] Master plan имеет sprints с acceptance criteria
- [ ] Output в правильные папки (`wiki/design/`, `wiki/plan/`)
- [ ] Agent Teams используются если AGENT_TEAMS=1
- [ ] Stop point после cross-review (user approve gaps решены)
- [ ] Stop point после master plan (user approve sprints)
