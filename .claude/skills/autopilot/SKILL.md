---
name: autopilot
kind: architectural
description: "Step 4 главного pipeline. AUTONOMOUS mode — Claude идёт по wiki/plan/02-development-plan.md до конца, не отвлекая пользователя. Останавливается ТОЛЬКО на blockers / repeated failures / critical questions. Periodic progress reports в wiki/_current.md. Acceptance: smoke test scenario passed для каждого sprint'а. Triggers on: autopilot, автопилот, иди до конца, не отвлекай, hands off, без остановок, autonomous, до тестов, beta ready."
---

# Autopilot — autonomous development to ready-for-test

## Концепция

Обычные skills имеют **mandatory stop points** — Claude после каждой фазы спрашивает "продолжить?". Это правильно для **исследования** (где направление может меняться) — но неправильно для **исполнения утверждённого плана**.

Когда есть:
- Approved metrics.md
- Approved design documents
- Approved master plan в plan/02-development-plan.md

— Claude должен идти по плану **сам**, не дёргая юзера каждые 15 минут.

`/autopilot` overrides default stop behavior. Claude становится **executor**, не **explorer**.

## Когда вызывать

Только после:
- ✅ `/start` или `/analyze-game` — есть wiki/
- ✅ `/product-metrics` — есть targets
- ✅ `/research-references` — есть competitive context
- ✅ `/design-pipeline` — есть design documents
- ✅ `wiki/plan/02-development-plan.md` approved by user

Если хоть одно отсутствует — STOP, скажи юзеру что запустить first.

## Pipeline

### Шаг 1 — Pre-flight check

```bash
[ -f wiki/architecture/metrics.md ] || abort "no metrics"
[ -f wiki/plan/02-development-plan.md ] || abort "no master plan"
[ -d wiki/design/ ] || abort "no design docs"
```

Read all design documents into context. Read master plan.

### Шаг 2 — Stop policy override

В этом режиме **default stop points НЕ применяются**. Skills которые обычно говорят "Stop after each phase" — **продолжают**.

Что **РАЗРЕШЕНО** в autopilot mode:
- ✅ Реализация фич из master plan по порядку
- ✅ Запуск тестов (auto-tests + smoke scenarios)
- ✅ Принятие **обратимых** decisions (pick library version, naming, file structure)
- ✅ Refactoring если он не меняет poveden'iye
- ✅ Bug fixes найденные во время разработки
- ✅ Update wiki/ progress в реальном времени

Что **ЗАПРЕЩЕНО** без stop:
- ❌ Pivot в master plan — если plan говорит "feature X", не делать "feature Y" даже если кажется лучше
- ❌ Irreversible decisions — добавление сторонних зависимостей с lock-in (PostgreSQL когда план говорил SQLite)
- ❌ Skip blocks — если план B1 → B2 → B3, нельзя сделать B1 → B3 потому что B2 trickier
- ❌ Architectural changes — если упёрся в архитектурную проблему, **STOP** и спроси юзера
- ❌ Security-sensitive code (auth, encryption, payment processing) — всегда требует review
- ❌ Сторонние API ключи / credentials — никогда не делай без явного явного предоставления юзером

### Шаг 3 — Execution loop

Цикл по master plan'у:

```
for sprint in master_plan.sprints:
    log: "🚀 Starting Sprint {N}: {goal}"

    for deliverable in sprint.deliverables:
        log: "  → {deliverable.name}"
        implement(deliverable)
        run_auto_tests()

        if test_failures:
            attempts = 0
            while attempts < 3 and test_failures:
                fix_attempt(test_failures)
                attempts += 1
                run_auto_tests()
            if test_failures:
                STOP_AND_REPORT("Repeated test failures after 3 attempts")

    # Acceptance test for sprint
    smoke_test_result = run_smoke_scenario(sprint.acceptance_criteria)

    if smoke_test_result.passed:
        update_wiki_current({
            "completed": sprint.name,
            "next": next_sprint.name
        })
        commit({
            "message": "Sprint {N} complete: {goal}",
            "skills_invoked": ...,
            "files_changed": ...
        })
        log: "✅ Sprint {N} complete. Continuing to Sprint {N+1}."
    else:
        STOP_AND_REPORT(
            "Smoke test failed for Sprint {N}",
            failure_details=smoke_test_result.what_failed,
            suggested_fixes=...
        )

# After all sprints
final_smoke_test = run_full_product_smoke()
if final_smoke_test.passed:
    log: "🎉 All sprints complete. Ready for test."
    output_final_report()
else:
    STOP_AND_REPORT("Final smoke test issues", ...)
```

### Шаг 4 — Progress reporting

Не дёргая юзера, autopilot **постоянно обновляет** `wiki/_current.md`:

```markdown
## Active task
**Autopilot mode** — sprint 2 of 4

### Sprint progress
- [x] Sprint 1 — Core foundation (completed 2026-04-27 14:30)
- [ ] Sprint 2 — Content + retention ← здесь сейчас
  - [x] Daily reward system
  - [x] Save persistence
  - [ ] 5 levels content ← в работе сейчас
  - [ ] Tutorial flow

### Last commit
- 2026-04-27 14:35: "Sprint 1 complete: Core foundation"

### Tests status
- Auto-tests: 47 pass / 0 fail
- Smoke test Sprint 1: ✅ pass

### Notes for user (when checking in)
- Found ambiguity in level-design Section 2 (regarding daily reward escalation).
  Used reasonable default (1.2x daily multiplier). See decisions/{NNN}-default-reward-curve.md
- Skipped optional feature "premium leaderboard cosmetics" because it requires server (out of scope per Sprint 2 spec).
```

Юзер может в любой момент **посмотреть `wiki/_current.md`** — будет точно видно где Claude сейчас. Не нужно спрашивать "ну как там, готово?".

### Шаг 5 — Smoke test scenarios (acceptance test per sprint)

Per Step 4 of user pipeline: "Итог продукт готовый к тесту".

**Smoke test = simulated playthrough**. Claude:
1. Читает sprint acceptance criteria из master plan
2. Запускает игру headlessly (или симулирует actions)
3. Проверяет что criteria met (e.g. "user can complete one full loop without crashes")
4. Записывает результат в `wiki/testing.md`

Технически:
- Если есть unit/integration tests — `npm test` / `vitest run` / etc.
- Если есть e2e tests — Playwright/Puppeteer scripts
- Если нет — Claude **пишет smoke test** для этого sprint'а как часть deliverables

Smoke scenario format:

```markdown
## Smoke Test — Sprint {N}: {Goal}

### Setup
- Fresh user (no save)
- Default settings

### Steps
1. Launch game → main menu loads in <2s
2. Tap "Play" → loading screen → game starts
3. Complete first loop → score appears
4. Die → death screen
5. Tap "Retry" → game restarts
6. Quit and reopen → save loaded, score remembered

### Pass criteria
- All steps complete without errors
- Frame rate stays >30 fps
- No console errors
- Save persists across reload
```

### Шаг 6 — Final report

После того как все sprints done + final smoke test passed:

```
🎉 Autopilot complete

Project: {Name}
Time elapsed: {duration}
Sprints completed: 4/4
Auto-tests: 127 pass / 0 fail
Final smoke: ✅

Files changed: {N}
Commits: {N}

Decisions made without user (logged in wiki/decisions/):
- {NNN}: Default reward curve (1.2x multiplier per day)
- {NNN}: Library choice — chose A over B because Y
- ...

Open questions для следующей сессии:
- {question 1}
- {question 2}

Ready for: alpha test / closed beta
Next step: /release-ready {platform}
```

## Stop conditions (когда таки прерывать)

Auto-pilot ОСТАНАВЛИВАЕТСЯ и **просит юзера** в следующих случаях:

1. **3 повторных test failure** на одном и том же deliverable — что-то фундаментально не так
2. **Architectural blocker** — проблема не решается в рамках текущего architecture
3. **Security question** — auth, encryption, payments, sensitive data
4. **Credential/API key needed** — autopilot не может предоставить
5. **Contradictory requirements** в design documents (cross-review должен был это поймать но если нет)
6. **Smoke test fails** для sprint'а после 2 fix attempts
7. **Out of scope work needed** — sprint требует features не в spec'е, нужен апдейт plan

При остановке — детальный report в чат:

```
🛑 AUTOPILOT STOPPED — needs human decision

Reason: {one of above}
Sprint: {N} ({goal})
Deliverable: {name}
What I tried:
  1. {attempt 1}
  2. {attempt 2}
  3. {attempt 3}
What went wrong: {detailed analysis}
Suggested options:
  A. {option 1}
  B. {option 2}
  C. {option 3}

Waiting for direction. Reply with A/B/C or alternative.
```

## Mode: pause / resume

Юзер может в любой момент написать "/pause" — autopilot сохраняет state в `wiki/_current.md` и останавливается.

Resume: "/continue" или "/autopilot resume" — продолжает с следующего deliverable.

## Output

Во время работы:
- `wiki/_current.md` обновляется continuously (каждые 5-10 минут или после каждого deliverable)
- Git commits после каждого sprint'а

После завершения:
- `wiki/testing.md` — все smoke tests + their results
- `wiki/_current.md` — "Autopilot complete, ready for test"
- `wiki/_map.md` — статус "Done" обновлён с completion дате
- Final report в чат

## Common pitfalls

1. **Запуск без approved plan** — autopilot интерпретирует ambiguous spec по-своему, юзер потом не согласен. Pre-flight check должен быть строгим.

2. **No smoke test scenarios** — без них "ready for test" = guess work. Заставить design-pipeline создавать smoke tests как часть deliverables.

3. **Long-running без commits** — если autopilot fails на 4-м часу без commits, всё потеряно. Commit per sprint минимум, идеально per deliverable.

4. **Игнорирование metrics.md** — autopilot реализует фичи **по плану**, а план должен быть alignedед с metrics. Cross-review в design-pipeline это catch'ит, но autopilot должен **повторно проверять** что implementation hits floor metrics.

5. **Decisions без логирования** — если autopilot принял 30 default решений и не задокументировал, юзер вернётся и не поймёт что произошло. Каждое не-trivial решение → `wiki/decisions/{NNN}-{name}.md`.

## Non-Negotiable

- [ ] Pre-flight checks (metrics, plan, design docs)
- [ ] Override stop points для skills которые обычно остановятся
- [ ] Запрещены: pivot, irreversible deps, architectural changes, security-sensitive code without review
- [ ] Real-time progress в `wiki/_current.md`
- [ ] Commit per sprint минимум
- [ ] Smoke test (manual scenario) per sprint
- [ ] Final smoke test перед "ready for test" claim
- [ ] Stop on: 3x failures, architectural blocker, security, credentials, ambiguity
- [ ] All non-trivial decisions → wiki/decisions/
- [ ] Final report includes: sprints, time, tests, decisions, open questions, next step
