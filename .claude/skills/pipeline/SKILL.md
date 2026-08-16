---
name: pipeline
kind: architectural
description: "Master orchestrator всего жизненного цикла продукта от анализа до релиза (8 steps включая Step 0 Discovery v4.10). Не делает работу сам — координирует skills (discover → analyze → metrics → design-pipeline → autopilot → test → release-ready → release-{platform}). Stop points между шагами для approve. Step 0 (v4.10) сканит указанную папку, классифицирует docs по содержимому (research/design/roadmap/monetization/marketing), пропускает дублирующие шаги. Triggers on: pipeline, full pipeline, master pipeline, полный цикл, от начала до конца, complete workflow, lifecycle, /pipeline path/to/folder, готовый MVP, существующие документы."
---

# Pipeline — Full Product Lifecycle (8 steps)

**Аргумент:** `$1 = папка игры` — Claude Code подставляет $1 из команды (с июля 2026 плейсхолдеры не съедаются); аргумента нет → спроси пользователя.

## Концепция

Это **master orchestrator**. Не делает работу — связывает skills которые делают работу.

8 шагов от "юзер указал папку" до "продукт в магазинах":

```
0. Discover       → scan указанной папки (NEW v4.10)
                   classify .md/.txt по содержимому, не имени
                   detect MVP source files
                   plan: какие steps skip если docs покрывают их

1. Analyze       → /analyze-game (или /analyze-project)
                   + auto-research через research-references
                   + skill-discovery
                   + create wiki/

2. Metrics       → /product-metrics
                   user approves taргеты
                   (или extract из docs если Step 0 нашёл roadmap)

3. Design        → /design-pipeline
                   spawns 7 specialists через subagents
                   produces wiki/design/* + master plan
                   (SKIP если Step 0 пометил design как done в docs)

4. Build         → /autopilot OR ручная итерация
                   per master plan
                   smoke tests per sprint
                   ready for tests

5. Test          → user testing (manual)
                   feedback loop
                   iterations через /improve, /deepen-game, /polish-app

6. Release ready → /release-ready {platform}
                   /credentials-check
                   user provides keys/IDs

7. Release       → /release-{platform} OR /release-all
                   produces final builds in Release/
                   user uploads to store
```

## Invocation

```
/pipeline                           # green-field, ask user for description
/pipeline GameIntegration/foo/      # existing MVP/docs in folder — Step 0 scans
```

## Pipeline (7 steps)

### Step 0 — Discover existing artifacts (1-3 минуты, NEW v4.10)

**Цель:** найти существующие design/research документы и MVP в указанной папке, классифицировать **по содержимому**, не по имени файла. Если они есть — следующие шаги используют их как ground truth, не дублируют работу.

**Когда применяется:** если юзер вызвал `/pipeline <path>` или указал папку с MVP. Если папки нет (green-field idea) — пропусти Step 0.

#### 0.1 — Scan folder

```bash
# User invoked: /pipeline GameIntegration/smogonclicker-mvp/
# Scan для documentation files (recursive, depth ≤3):
find {path} -maxdepth 3 \( -name '*.md' -o -name '*.txt' -o -name '*.rst' \) -size -200k | head -30

# Also scan для MVP source files:
find {path} -maxdepth 3 \( -name 'index.html' -o -name '*.html' -o -name 'package.json' \
  -o -name 'main.py' -o -name 'app.py' \) | head -20
```

#### 0.2 — Classify documents by CONTENT (NOT filename)

Для каждого `.md`/`.txt` файла прочитай первые ~500 строк (или полностью если <500). Определи **назначение по сигнальным маркерам в тексте**, не по имени файла. Возможные классы:

| Класс | Сигнальные маркеры (любой 2+ из списка) | → mapping в wiki/ |
|---|---|---|
| **research / market** | "конкуренты", "рынок", "TAM", "DAU benchmarks", "competitor", "market analysis", "целевая аудитория", таблицы похожих продуктов | `wiki/research/{name}.md` |
| **project overview / vision** | "что это", "концепция", "vision", "MVP", "what we are building", "что уже есть", упоминания базовой механики | секции в `wiki/_map.md` (Vision + Features) |
| **tech stack / architecture** | "stack", "Frontend", "Backend", "технологии", "Node", "React", "PostgreSQL", таблицы технологий, "Что НЕ делать" | `wiki/architecture/stack.md` |
| **roadmap / plan / phases** | "Phase 1", "roadmap", "Q1/Q2", "soft launch", "milestones", "spring 2025", цифры пользователей по фазам | `wiki/design/roadmap.md` |
| **monetization / IAP / pricing** | "ARPDAU", "IAP", "Telegram Stars", "TON", "ad revenue", "subscription", ценовые лестницы, "pricing tiers" | `wiki/design/monetization.md` |
| **marketing / GTM** | "TikTok", "VK", "channel", "influencers", "CAC", "user acquisition", "promotion", "контент-стратегия" | `wiki/design/marketing.md` |
| **game design / GDD** | "core loop", "механика", "балансировка", "level design", "progression", "prestige", "game economy" | `wiki/design/game-design.md` |
| **art / visual** | "art style", "color palette", "mockups", "UI screens", "иллюстрации", "иконки" | `wiki/design/art.md` |
| **sound** | "звук", "SFX", "music", "audio cues", "Howler" | `wiki/design/sound.md` |
| **changelog / history** | "v0.1", "version", "changelog", "release notes" | `wiki/changelog.md` (append) |

**Если файл не классифицируется ни в один класс** (или классов >1 — например, и game design, и monetization в одном) — `wiki/design/{slugified-original-name}.md` без потери информации.

**Algorithm:**

```
for each .md/.txt file:
  read first 500 lines (or all if smaller)
  count signal markers per class
  best_class = max by marker count, tie-break by content density
  if best_class.score < 2: classify as 'unstructured'
  else: assign to mapping
```

#### 0.3 — Detect MVP code

Если есть `index.html` / `main.py` / `app.py` / similar — это MVP. Note location, treat as **read-only source** (read-only enforced through workspace-discipline hook).

#### 0.4 — Output discovery report

После сканирования покажи юзеру:

```
=== Step 0: Discovery report ===

Found documents (classified by content):
  GameIntegration/smogonclicker-mvp/01-research.md
    → research (12 markers: "конкуренты"×3, "рынок"×4, "TAM"×1, ...)
    → wiki/research/samogonshchik-references.md

  GameIntegration/smogonclicker-mvp/02-project-overview.md
    → project-overview (8 markers: "MVP"×5, "концепция"×2, ...)
    → sections in wiki/_map.md (Vision + Features)

  ... (все файлы)

Found MVP source:
  GameIntegration/smogonclicker-mvp/samogonshchik.html (1247 lines, vanilla JS)

Plan для оставшихся steps:
  Step 1 (Analyze): копировать MVP в WorkProgress, заполнить wiki/ из docs (above) + код
  Step 2 (Metrics): извлечь KPI из roadmap.md + monetization.md, не делать web research
  Step 3 (Design pipeline): SKIP — design уже сделан в docs
  Step 4-7: стандартно

Approve plan? (Y/n/edit)
```

**Если юзер `n` или `edit`** — корректирует mapping и/или пометки skip. Default `Y` — продолжаем.

**Если ничего не найдено** (зелёное поле) — Step 0 завершён за секунды, идём по стандартному pipeline без пропусков.

#### 0.5 — Persist discovery decisions

Записываем classification в `wiki/_pipeline-state.md`:

```yaml
discovered_at: 2026-04-29T15:30:00Z
source_path: GameIntegration/smogonclicker-mvp/
documents:
  - file: 01-research.md
    class: research
    target: wiki/research/samogonshchik-references.md
    score: 12
  - file: 02-project-overview.md
    class: project-overview
    target: wiki/_map.md (vision + features)
    score: 8
  ...
mvp_source:
  - GameIntegration/smogonclicker-mvp/samogonshchik.html
skip_steps: [3]  # design pipeline already covered by docs
metrics_source: extracted_from_docs  # not web research
```

Это позволяет последующим шагам (Step 2, 3) знать что делать.

### Step 1 — Analyze (5-15 минут)

Цель: понять что за проект, заложить wiki/, найти конкурентов, выбрать skills.

```
/analyze-game     # для игры
/analyze-project  # для приложения
```

(Или `/start` если проект ещё не существует — bootstrap from idea.)

Phase 0a auto-research-references встроен. Phase 0b auto skill-discovery. Создаёт wiki/_map.md, wiki/_current.md, wiki/research/.

**v4.10: если Step 0 нашёл docs** — `analyze-game/-project` читает `wiki/_pipeline-state.md` и:
- Переносит classified docs в их target locations **as-is** с минимальной структуризацией (не пересоздаёт research своими словами)
- Запускает Phase 0a research только если в discovery нет `class: research`
- Skill discovery работает как обычно

**STOP after Step 1.** User reviews:
- Понимание проекта правильное? (что это за игра/приложение, тип, состояние)
- Research references адекватные?
- Skills для нужных competencies discovered/created?
- Docs из Step 0 корректно перенесены в wiki/?

### Step 2 — Metrics (15-25 минут)

```
/product-metrics
```

Reads context (research, _map.md), web research benchmarks, generates:
- `wiki/architecture/metrics.md` — D1/D7/D30, ARPDAU, session length, north-star
- `wiki/decisions/{NNN}-product-metrics.md` — ADR

Three levels: Floor / Target / Stretch.

**v4.10: если Step 0 пометил `metrics_source: extracted_from_docs`** — `/product-metrics` извлекает KPI из `wiki/design/roadmap.md` + `wiki/design/monetization.md` (не делает web research). Чтобы не дублировать work если у юзера уже есть target metrics в roadmap.

**STOP after Step 2.** User approves metrics:
- Реалистичные? (D7=15% — можно? слишком высоко?)
- North-star metric правильный?
- Acceptance criteria clear?

### Step 3 — Design (30-60 минут с Agent Teams, 1.5-2.5h sequential)

**v4.10: если Step 0 пометил `skip_steps: [3]`** — Step 3 ПРОПУСКАЕТСЯ полностью. Design уже сделан в перенесённых docs. PM (только) запускается чтобы сгенерировать master plan для Step 4 на основе **существующих** design docs из wiki/design/, без spawn'а 6 других specialists. Это экономит ~6 часов на проектах где design уже готов.

Если skip — переходи на Step 4 с master plan (`wiki/plan/02-development-plan.md` или используй `wiki/design/roadmap.md` если он есть).

```
/design-pipeline
```

Spawns specialists через subagents (game designer, level designer, monetization, art director, sound designer, architect, PM). Каждый читает metrics + research, produces design document.

Cross-review phase finds gaps and contradictions.

PM produces master plan: `wiki/plan/02-development-plan.md` со sprints, deliverables, acceptance criteria.

**STOP after Step 3** (если не skip). User reviews:
- 7 design documents OK?
- Cross-review поймал ли что-то критичное?
- Master plan со sprints/deliverables ясный?

### Step 4 — Build (часы → дни)

Two modes:

**Mode A: Autopilot (recommended если plan утверждён)**
```
/autopilot
```
Идёт по master plan'у, не отвлекая. Smoke test per sprint. Stops only on blockers.
User checks `wiki/_current.md` чтобы видеть progress без вмешательства.

**Mode B: Manual iteration**
```
/continue   # после каждого деливерабла
```
User участвует в каждом stop point. Дольше но больше контроля.

**Output Step 4:** Working product, smoke tests passed.

### Step 5 — Test (часы → дни, итеративно)

User testing (manual или с testers). Не автоматизируется через Forge — это human work.

Если найдены issues — итеративно:
```
/improve {что улучшить}
/polish-app
/deepen-game
/fix-ui
```

Each issue → fix → smoke test → next issue.

**Acceptance:** Floor metrics achievable in playthrough. No critical bugs.

### Step 6 — Release ready (15-30 минут на платформу)

Per platform — pre-flight checklist:

```
/release-ready yandex
/release-ready vk
/release-ready telegram
/release-ready rustore
# или все сразу:
/release-ready yandex vk telegram rustore
```

Проверки:
- Code SDK integration complete
- Validators pass (через /gate)
- Локализация на нужные языки (для Yandex — 13 langs)
- Acceptance criteria из metrics.md achievable

```
/credentials-check
```

Запрашивает у юзера:
- Keystore + passwords (для Android: RuStore, Telegram bot)
- API keys (Yandex Mobile Ads, AppMetrica, AdMob)
- Store IDs (RuStore app ID, Yandex App ID, etc)
- Signing certificates (для Steam: Steamworks credentials)
- Bot tokens (для Telegram)
- VK App ID (для VK Mini Apps)
- Steam App ID + depot config (для Steam)
- VK Play GMRID + signature secret (для VK Play)

Per-platform checklist в credentials-check skill.

**STOP after Step 6.** User provides все credentials. Если чего-то нет — credentials-check скажет где взять.

### Step 7 — Release (5-15 минут на платформу)

```
/release-yandex
/release-vk
/release-telegram
/release-rustore
/release-steam
/release-vkplay
# или параллельно:
/release-all
```

Каждый release skill:
- Validates code one final time
- Builds artifacts (ZIP / AAB / EXE / etc)
- Saves в `Release/{Project}/{platform}/`
- Generates store listing если нужен (через /fill-{platform})

После — user uploads в store manually:
- Yandex Games dashboard
- VK Mini Apps моно
- Telegram BotFather
- RuStore developer portal
- Steamworks (Steam) — через steamcmd upload
- VK Play developer console

**STOP after Step 7.** Project shipped to platform.

Post-release:
- Monitor metrics в analytics dashboard
- D1/D7/D30 retention checks vs targets
- Iterate через `/reprocess` если нужны изменения

## Pipeline modes

### Full pipeline (default)

```
/pipeline
```

Gues через все 7 steps with stops. Длительность: дни → недели в зависимости от scope.

### Resume

```
/pipeline resume
```

Reads `wiki/_current.md` чтобы понять на каком step остановились. Continues с того места.

### Specific step

```
/pipeline step=3   # только design phase
/pipeline step=4   # только build (autopilot)
/pipeline step=6,7 # release flow
```

### Skip patterns

```
/pipeline --skip=metrics    # уже есть metrics.md
/pipeline --skip=design     # дизайн руками сделан
```

Don't recommend `--skip=metrics` без явной необходимости — фундамент.

## Status tracking

`wiki/_current.md` после каждого step:

```markdown
## Pipeline status

- [x] Step 0 — Discover (2026-04-27 12:55 → 12:58, found 6 docs + 1 MVP html, skip Step 3)
- [x] Step 1 — Analyze (2026-04-27 13:00 → 13:15)
- [x] Step 2 — Metrics (2026-04-27 13:30 → 13:50, extracted from roadmap.md)
- [-] Step 3 — Design (skipped — design done in docs)
- [ ] Step 4 — Build ← здесь сейчас (autopilot mode, sprint 2/4)
- [ ] Step 5 — Test
- [ ] Step 6 — Release ready
- [ ] Step 7 — Release
```

### Automated state check (v4.9.0+)

Don't rely на memory или manual status block alone. Run:

```bash
node scripts/check-pipeline-state.mjs
```

Output:
- Visual map of completed/current/pending steps
- Detected via explicit status block OR filesystem reality
- Next step name + invoke command
- Prerequisites for next step (what counts as "done")

Use after any pause or context switch — это 5-second sanity check vs minutes of manual file inspection.

`/continue` skill auto-runs it (Step 1.5). Manual usage helpful when starting fresh session или после long break.

## Common pitfalls

1. **Пропуск step 2 (metrics)** — design делается без targets, фичи ad-hoc, monetization не считалась. Step 6/7 отвал из-за нерелевантной экономики.

2. **Skip step 3 (design)** — autopilot не имеет плана, делает что попало. Master plan = MUST.

3. **Step 4 без smoke tests** — "готовый продукт" имеет critical bugs которые поймались бы за 5 минут smoke testing.

4. **Step 6 не перед Step 7** — release-* без release-ready = шанс отказа модерации. release-ready защищает.

5. **Игнорирование Step 5 feedback** — продукт зарелизен, метрики D7 = 5% (target 15%). Feedback loop через /improve должен был быть до релиза.

6. **Single platform mindset** — pipeline support multi-platform с одного codebase. Если код TG-only — refactor нужен в Step 3 (architect должен предусмотреть platform-adapter).

## Non-Negotiable

- [ ] Каждый step имеет stop point с user approve (за исключением autopilot mode в Step 4)
- [ ] Pre-flight checks для каждого step (предыдущий step done?)
- [ ] **Update `wiki/_current.md` + `wiki/_map.md` BEFORE asking user any question** (Architectural Invariant #14). Order: do step work → update wiki → print summary/questions → end turn. Otherwise Stop hook fires after questions → forces tool calls → user questions scroll out of view.
- [ ] Resume mode читает _current.md
- [ ] No skip metrics без explicit user override
- [ ] No release-* без release-ready
- [ ] Multi-platform support: Step 6/7 могут быть параллельными для разных платформ
