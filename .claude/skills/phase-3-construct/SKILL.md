---
name: phase-3-construct
kind: architectural
description: "Фаза 3 — СТРОЙКА: реализовать в КОДЕ игры фичи из GDD/дефицита контента, спринт за спринтом. Это та фаза, где меняется сама игра, а не пишутся документы. Triggers on: build, construct, стройка, билд фичей, построй игру, реализуй фичи, разработка по спринтам, начинай спринт, сделай по гдд, воплоти план, código, implement the plan, фаза 3, phase 3, конструкт."
contract_version: 1
phases:
  - 3
modes:
  - phase
requires: []
reads:
  - "**"
writes:
  - forge.godot.json
  - forge.godot.visual.json
  - WorkProgress/**
  - wiki/**
  - assets/**
verifiers:
  - godot-project
stop_points: []
risk_shell: write
risk_external: none
references: []
completion_contract: status/references/phase-contracts/phase-3.json
---

# /phase-3-construct (Фаза 3) — постройка игры по чертежам (между дизайном и визуалом)

## 🧭 Phase state marker (v4.67.1+)

На входе в фазу **обязательно** зафиксируй machine state:

```bash
node .claude/skills/status/references/phase-state.mjs start 3
```

Только после всех штатных gate/проверок и обязательных решений пользователя отметь выход фазы:

```bash
node .claude/skills/status/references/phase-state.mjs complete 3 wiki/plan/02-development-plan.md wiki/testing.md
```

Marker не заменяет evidence и не разрешает перескочить STOP-point. `/status` использует его как
machine-readable progression state, а сами артефакты остаются доказательством результата.
`complete` дополнительно проверяет реальный implementation source и чистый
`playtest-out/report.json`; одного плана или текстового заявления о PASS недостаточно.


**Модели:** Claude `opus` для сложной логики, `sonnet` для рутины. Codex base
`gpt-5.6-sol/high`; route `complex-logic` → `gpt-5.6-sol/xhigh` для экономики,
мультиплеера, backend architecture или повторного провала.
Канон: `status/references/model-policy.json`.

## 🧩 Engine route before sprint 1

`phase-state.mjs start 3` читает `forge.engine.json` через единый доверенный reader и пишет
выбранный профиль в `wiki/phases/phase-3.json → engineRuntime`. Не начинай спринт, если marker
получил infrastructure block `ENGINE_CAPABILITY_UNAVAILABLE`: это означает, что у выбранного
движка ещё нет проверенного `constructVerifier`, и браузерный playtest не является заменой.

- `engineRuntime.engine=web` — штатный `scripts/playtest.mjs` и browser QA остаются без изменений;
- `engineRuntime.engine=godot` — вызови `/godot-engine`, затем установленный
  `check-godot-project.mjs`; локальная подмена registry или ручной `PASS` запрещены.


Фазы 1-2 производят ЧЕРТЕЖИ (метрики, GDD, план). Фазы 4+ полируют ПОСТРОЕННОЕ. /phase-3-construct («стройка») — то,
что между: **писать код игры**, превращая дефицит контента в работающие фичи. Если после
конвейера код игры не изменился — конвейер НЕ завершён, сделана только бумага.

## Вход
- GDD с «Математикой удержания» (фичи по дням игрока) — из /phase-2-design.
- План разработки (спринты/таски) если есть — иначе построй его из GDD за 5 минут, НЕ как
  отдельный документ-церемонию, а как рабочий список.

## Процедура (спринт за спринтом)
1. Возьми спринт 1 (самый ценный по retention-математике: обычно D1-контент → D2-D7).
2. **Пиши код в файлы игры.** Дисциплина /do: диагноз → правка → проверка фактом.
3. После КАЖДОГО спринта запускай verifier/playtest выбранного engine profile. Для `web` сначала
   обнови корневой `forge.web.playtest.json`, затем запусти
   `node <Forge>/scripts/playtest.mjs . --contract`. Контракт проходит реальные click/key
   действия через обычный player launch (без QA query) и сверяет read-only `__FORGE_PLAYTEST__`
   production observer, требует
   минимум две смены экрана и один негативный no-change шаг. Скриншоты — только evidence UI;
   они не являются player action. Если игра заявляет persistence, ставь `persistence.mode: required`
   и проверь reload в том же прогоне. Обычный `playtest.mjs <игра>` остаётся диагностическим smoke,
   но не закрывает фазу.
   Для native engine используй только его adapter; capability отсутствует → infrastructure block.
   Сломал — чини до перехода к следующему.
4. Отметь таск в wiki/plan/ как done, короткая запись в sessions.
5. Следующий спринт. Между спринтами НЕ спрашивай разрешения продолжать — план уже утверждён
   пользователем на STOP-point'е фазы 2; останавливайся только на реальных развилках
   (нерешённый дизайн-вопрос, конфликт с инвариантом).

## Жёсткие правила
- **Авто-replace в коде — только по УНИКАЛЬНОМУ якорю**: перед заменой проверь, что вхождение
  ровно одно (grep -c == 1); больше одного → расширь якорь до уникальности. Полевой кейс
  hostling: replace по строке, идентичной в drawParasite и drawRival, попал не в ту функцию →
  "p is not defined" → заморозка игры в проде на ночи 4+ (жила в v1.4-v1.8 незамеченной).
- **Не производи новых документов вместо кода.** Один рабочий план-список — всё. Порыв «сначала
  напишу ещё дизайн-док» = сигнал, что ты избегаешь стройки.
- SDK/Yandex-слой НЕ трогать (это фаза 4). Визуальную полировку НЕ делать (фаза 3) — строй
  функциональность, пусть страшненькую.
- Масштаб честно: если план на недели — скажи пользователю смету по спринтам и строй по одному
  за сессию, а не обещай всё сразу.

## Обязательные системные спринты (не только фичи контента)
- **визуальный QA adapter** по утверждённому `wiki/design/screen-flow.json`: для `web` только при
  query `?forgeVisualQa=1` выставить `window.__FORGE_VISUAL_QA__` с `listStates()`, асинхронным
  `showState(id)` и `currentState()`. Для Godot скопируй штатный `templates/godot/ForgeVisualQA.gd`
  или `.cs`, зарегистрируй его autoload, создай `forge.godot.visual.json` и реализуй на целевом
  узле `forge_visual_states`, `forge_visual_show_state`, `forge_visual_current_state`,
  `forge_visual_tick_proof`. Создавать фальшивый browser bridge нельзя. Список обязан точно совпасть
  с Phase 2 inventory — иначе Ф4 не сможет доказать полноту экранов и фактический переход;
- **production playtest observer** для `web`: в обычном запуске, без query, выставить read-only
  `window.__FORGE_PLAYTEST__` только с `listStates()` и `currentState()`. В нём не должно быть
  `showState`/setter: Phase 3/5/7 проверяют реальные действия игрока, а не QA force-state;
- RV-хуки по утверждённой карте монетизации (каждый = своя награда и момент);
- гача-мета модуль (механики из GDD: pity видим, шансы показаны, дубли конвертятся);
- **бэкенд мультиплеера**, если он утверждён на Ф2: взять шаблон командой
  `node ../project-forge/scripts/use-template.mjs backend/async ./backend` (шаблоны живут в
  движке, по играм не раскатываются), затем развернуть профиль (`/multiplayer`,
  делегируй агенту `backend-builder`), вписать клиентский слой, ЛОГИКУ ХОДА писать в
  applyAction на сервере — не в клиенте; игра обязана остаться играбельной при выключенном
  сервере (проверить руками);
- **туториал по `/game-tutorial`**: ведущий, с подсветкой-маской и одним действием за раз,
  скрипт данными в `tutorial.json`, прогресс в сейве. Пара окон с текстом = дефект;
- клавиатура ТОЛЬКО через e.code (KeyW..., раскладко-независимо) + дубль стрелками.


## 🎛️ AI STUDIO 4.67 — агентная стройка

Для спринта с несколькими независимыми workstreams разрешён `/studio <цель>`:
- `studio-director` раздаёт непересекающиеся code scopes;
- `builder` реализует;
- `code-reviewer`/`qa-tester` идут после merge как evidence lane;
- parallel writers не трогают один файл/одну систему состояния одновременно.

AI Studio здесь ускоряет **код**, но не делает финальный арт: placeholders допустимы до Ф4.
После каждой агентной партии всё равно обязателен профильный playtest/verifier (`playtest.mjs` для
`web`); отчёт агента не заменяет запуск.

## Выход
Игра, в которой фичи GDD работают (проверено playtest'ом), план-таски закрыты.
Следующая фаза: `/phase-4-visual`
