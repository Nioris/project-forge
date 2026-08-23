---
name: status
kind: tactical
description: "Показать современный Project Forge status по 9 каноническим фазам: текущая фаза, STOP-point, phase markers, фактические артефакты, Project Health и AI Studio. Не путать отсутствие будущей фичи с дефектом. Triggers on: status, статус, на каком этапе, что сделано, что дальше, вернулся к проекту, где мы остановились, resume project, progress, как дела, что готово, чек-лист проекта."
---

# /status <папка> — 9 фаз по фактам, STOP-point, Project Health, AI Studio

`/status` — лёгкий обзор состояния проекта. Он **не запускает** browser/runtime/release тесты и не пытается
перепройти фазу. Его задача — быстро и честно ответить: где мы, что доказано, что блокирует текущую
фазу, что будет дальше.

## Источники истины — строгий порядок

1. `wiki/phases/phase-N.json` — machine-readable phase marker, если он уже существует.
2. Фактические артефакты и код проекта.
3. `.forge/runs/*.json` — локальное supplemental execution state активной Task; никогда не progression фаз.
4. `wiki/_current.md` — дополнительный контекст/STOP-point, но не доказательство выполнения.
5. Project `CLAUDE.md` — **правила и описание проекта, НЕ mutable progress state**. Фразы вроде
   `Just created` / «проект только что создан» не имеют права откатывать фактическую фазу.

Факт > заметка. Если downstream артефакты есть, но ранний обязательный gate отсутствует — ранняя дыра
остаётся текущей фазой, а downstream работа показывается как `⚠ evidence ahead of gate`.

## Шаг 1 — получить read-only snapshot

Из корня проекта выполни:

```bash
node .claude/skills/status/references/project-status.mjs . --json
```

Это dependency-free Node helper. Он только читает файлы/mtime/лёгкие сигнатуры. Не запускает игру,
браузер, SDK, релиз или сеть.

Если helper отсутствует (старый несинхронизированный проект), не выдумывай результат: сначала сообщи,
что Forge runtime устарел, и предложи sync/update. Лишь затем можно сделать ручной fallback.

## Канонический pipeline — всегда 9 фаз

| # | Phase | Смысл |
|---:|---|---|
| 1 | Analyze | инвентаризация, research, KPI/metrics, content budget, brief, AI/visual baseline |
| 2 | Design | GDD/IA, retention/economy, screen flow, development plan, AI briefs/studio plan |
| 3 | Construct | реальная стройка кода по плану; playtest evidence; AI agents только в безопасных scopes |
| 4 | Visual | art direction, UI composition, Style Bible, Prompt Compiler, Image Studio, Art Director, Visual QA |
| 5 | Tech | mobile, SDK, ads, ready timing, performance, AI config/secrets/perf gate |
| 6 | Listing | localization + store listing + promo creatives + SETUP_GUIDE |
| 7 | Test | functional/browser/playtest + multi-agent QA + Visual QA |
| 8 | Release | GREEN release gate, provenance/secrets hygiene, builds |
| 9 | Live | production metrics, rating, requirements drift, creative A/B; это ongoing loop |

Никогда не возвращай старый псевдо-pipeline `0 Занесено / 1 Геймдизайн / 2 Арт / 3 Мобайл / 4 SDK / ...`.
Мобайл, SDK, локализация и AI Studio — **lanes внутри фаз**, а не самостоятельные фазы.

## Шаг 2 — при необходимости уточнить ТОЛЬКО текущую фазу

Snapshot уже даёт фазу и факты. Дополнительные grep/ls допустимы только если нужно объяснить
конкретный `partial/blocked` текущей фазы или проверить противоречие. Не сканируй весь проект повторно.

Статусы фаз:

- `complete` → ✅ доказано marker'ом или достаточным legacy evidence;
- `in_progress` / `partial` → ⏳ текущая работа;
- `blocked` → 🔴 STOP-point, требуется решение/обязательный факт;
- `not_reached` → ○ до этой фазы ещё не дошли; **это не FAIL**;
- `ongoing` → ♻ Фаза 9/live loop.

## Обязательный формат ответа

```text
═══ PROJECT FORGE STATUS: <project> ═══
Forge: <version> | type: <game/app>
Последняя активность: <date> | wiki: 🟢 fresh / 🟡 stale

PHASES
[✅] 1 Analyze
[⏳/🔴] 2 Design        ← CURRENT
[○]  3 Construct
[○]  4 Visual
[○]  5 Tech
[○]  6 Listing
[○]  7 Test
[○]  8 Release
[○]  9 Live

CURRENT PHASE — <N NAME>
✓ <доказанный факт текущей фазы>
✓ <доказанный факт>
○ <ещё не выполнено / not verified>

STOP-POINT
<показывай секцию только если blocked/есть stopPoint>
Нужно: <точное решение или артефакт>

EXECUTION
<показывай только при active Task: id, mode, current node, latest structured result>

AI STUDIO
<если currentPhase=1: "baseline only; production not active yet">
<Ф2-3: briefs/agents state>
<Ф4+: config / Style Bible / prompt packs / candidates / approved / provenance / art reviews / Visual QA>

PROJECT HEALTH
Mobile       <not reached / partial / evidence>
Yandex SDK   <not reached / partial / evidence>
Localization <not reached / partial / evidence>
Debug checker <version/unknown>
Builds       <count>
QA           <count/evidence>

NEXT
→ /phase-N-... — <одна главная следующая команда>
<если blocked — сначала решение пользователя, НЕ команда следующей фазы>

SOURCES
phase markers: <N> | artifacts: authoritative | wiki/_current: supplemental | CLAUDE progress: ignored
```

Не печатай пустые декоративные секции. Если AI Studio ещё не активен, одной строки достаточно.

## Phase-aware правила вывода

### Ф1
Покажи analysis/metrics/brief + STOP по KPI Floor/Target/Stretch и content budget. Наличие SDK или
арт-ассетов впереди не означает завершение Ф1.

### Ф2
Покажи GDD/IA + development plan + design contradictions + `wiki/ai/studio-plan.md`/draft prompt packs.
Не называй Ф2 завершённой только потому, что уже есть красивый UI.

### Ф3
Главный факт — игра **изменилась в коде по утверждённому плану** и есть playtest evidence. Документы без
стройки → Ф3 остаётся текущей.

### Ф4
Покажи art direction/target frame/Style Bible, prompt packs, approved generated/sourced assets,
Art Director/Visual QA evidence. `assets/style/STYLE-BIBLE.md` со `Status: draft` не считается утверждённой.

### Ф5
Покажи mobile + Yandex SDK/runtime i18n/LoadingAPI.ready/performance как health lane текущей фазы.
До Ф5 отсутствие SDK = `not reached`, а не красный дефект.

### Ф6
Покажи localization architecture, store-listing files, promo creatives, `SETUP_GUIDE.md`.

### Ф7
Покажи playtest/browser/QA reports и Visual QA. `/status` сам тесты не запускает.

### Ф8
Покажи release-ready evidence, `TOTAL`, builds, setup guide, provenance/secrets gate. Если нет GREEN,
следующая команда остаётся внутри Ф8 (`/release-ready`), а не Ф9.

### Ф9
Покажи live metrics/rating/A-B evidence как ongoing; это цикл, а не «всё закончено».

## Machine phase markers (v4.67.1+)

Новые проходы фаз обязаны писать `wiki/phases/phase-N.json` через shipped helper:

```bash
node .claude/skills/status/references/phase-state.mjs start 4
node .claude/skills/status/references/phase-state.mjs block 4 "Awaiting target-frame approval" --owner user --code TARGET_FRAME_APPROVAL --decision-key phase4-target-frame
node .claude/skills/status/references/phase-state.mjs answer 4
node .claude/skills/status/references/phase-state.mjs complete 4 wiki/design/target-frame.md assets/style/STYLE-BIBLE.md
```

Marker **не заменяет evidence**: ставь `complete` только после штатных gate/STOP-point и фактического
выхода фазы. Для legacy проектов без markers `/status` использует консервативный artifact fallback.
`block --owner agent` означает автоматический repair, `--owner infrastructure` — явный внешний blocker.
Codex связывает marker/RunResult с текущим запуском через `attemptId`; вопросительный текст — только
legacy fallback. `.forge/runs/` принадлежит runtime и никогда не редактируется агентом вручную.

## Дополнительные правила

- Future absence ≠ defect. До Ф5 `YaGames.init()` может отсутствовать совершенно нормально.
- `NOT VERIFIED` ≠ FAIL. Формулируй честно.
- Не обновляй `CLAUDE.md` ради текущего статуса. Mutable state → `wiki/_current.md` + `wiki/phases/`.
- Если wiki и код расходятся — явно покажи расхождение.
- Если helper предупреждает `evidence ahead of gate`, не перепрыгивай ранний STOP-point.
- Прототип без phase facts → Ф1, следующая команда `/phase-1-analyze .`.
- Для app-проекта helper показывает type, но не притворяйся, что game-specific Yandex gates обязательны,
  если app workflow их не использует; Project Health описывай по фактам.

## Related
- /advisor — что делать вообще;
- /release-ready — глубокий pre-release gate;
- /pipeline — последовательный phase orchestration;
- /studio — phase-aware multi-agent delegation.
