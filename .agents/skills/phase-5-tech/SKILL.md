---
name: phase-5-tech
kind: architectural
description: "Фаза 5 — мобайл и SDK: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points."
contract_version: 1
phases:
  - 5
modes:
  - phase
requires: []
reads:
  - "**"
writes:
  - .forge-ai.json
  - forge.godot.playtest.json
  - WorkProgress/**
  - qa/**
  - wiki/**
  - assets/**
verifiers: []
stop_points: []
risk_shell: write
risk_external: read
references: []
completion_contract: status/references/phase-contracts/phase-5.json
---
# $phase-5-tech — тач, SDK, реклама

## 🧭 Phase state marker (v4.67.1+)

На входе в фазу **обязательно** зафиксируй machine state:

```bash
node .claude/skills/status/references/phase-state.mjs start 5
```

Только после всех штатных gate/проверок и обязательных решений пользователя отметь выход фазы:

```bash
node .claude/skills/status/references/phase-state.mjs complete 5 .forge-ai.json wiki/qa/phase-5-tech.md
```

Marker не заменяет evidence и не разрешает перескочить STOP-point. `$status` использует его как
machine-readable progression state, а сами артефакты остаются доказательством результата.
`complete` читает контракт Ф5 и выбирает проверку по trusted engine profile. Для Web он
проверяет SDK init/ready, GameplayAPI start/stop, рекламу и mobile/touch; для Godot запускает
нативный техгейт ниже. В обоих маршрутах `.forge-ai.json` остаётся безопасной конфигурацией без
секретов. Перед командой запиши фактические результаты в `wiki/qa/phase-5-tech.md`.


**Модели:** Claude `sonnet`. Codex base `gpt-5.6-sol/high`; routes `repeated-failure` и
`payment-security` → `gpt-5.6-sol/xhigh` только после двух одинаковых FAIL либо для
платежей/secrets/auth/non-standard SDK conflicts.
Канон: `status/references/model-policy.json`.

## 🧩 Engine tech preflight

`phase-state.mjs start 5` читает `forge.engine.json` единым доверенным reader и сохраняет
`wiki/phases/phase-5.json → engineRuntime`. Продолжай только при
`engineRuntime.capabilities.techVerifier=true`. Если marker сообщает
`ENGINE_CAPABILITY_UNAVAILABLE`, это infrastructure block: DOM/touch/Yandex regex-проверки не
могут подтвердить native Godot runtime, а проектная копия registry не может включить capability.

- `engineRuntime.implementation=browser` — выполняй Web/Yandex route ниже без изменений;
- `engineRuntime.implementation=godot` — выполняй Godot desktop route. DOM, touch и Yandex SDK
  не относятся к Windows desktop и не являются заменой нативной проверки.

**Godot desktop route (GDScript):**

Перед настройкой прочитай общий native contract:
[../godot-engine/references/godot-test-release.md](../godot-engine/references/godot-test-release.md).

1. Создай строгий корневой `forge.godot.playtest.json`; объяви минимум два существующих InputMap
   action и конкретные ожидаемые состояния до/после каждого действия, прогресс и save/reload.
2. Скопируй установленный `templates/godot/ForgePlaytestQA.gd` без изменений в Godot-проект и
   зарегистрируй его autoload под именем из контракта. Адаптер инертен без Forge CLI flags.
3. Production scene реализует `forge_playtest_state/reset/save/load`; QA-шима вместо этих методов
   запрещена.
4. Запусти `node <Forge>/scripts/godot-tech-check.mjs . --json`. PASS требует обычное окно/renderer,
   реальный Godot, InputMap, production methods, изолированную запись `user://`, неизменившийся source
   и `qa/godot-tech/report.json` без test harness.

Godot C# пока возвращает честный environment block: нужен отдельный доверенный .NET QA adapter.
CLI export допускает `--headless`, но техпроверка gameplay — нет: dummy DisplayServer не доказывает
рендер и ввод. Справка: https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html


**Web/Yandex route:**

1. `$mobile-game-ui` — тач-управление, цели ≥44px, безопасные зоны.
2. `$yandex-sdk-integration` — порядок: init → detectLang → applyLang → ready ДО инпута;
   **GameplayAPI.start/stop обязателен** (кейс tyl).
3. `$yandex-ads` + `$bundle-libs` — реклама с паузой/сейвом, либы локально.
4. Обнови `forge.web.playtest.json` полем `tech.required` и прогони
   `node <Forge>/scripts/playtest.mjs . --contract`. Для заявленных фактов runner вызывает
   настоящие действия игрока, наблюдает SDK вызовы в локальном runtime и пишет
   engine-owned proof. Комментарии, строки и мёртвые ветки с именами SDK не являются техприёмкой.

Следующая фаза: `$phase-6-listing`

## ⚙️ Бюджет производительности по размерности
3D (из `wiki/_map.md`) → обязательная проверка на слабом Android: FPS, вес бандла, время
загрузки; WebGL2 доступен не везде, нужен честный фолбэк или предупреждение. 2D/2.5D → следи
за весом атласов и числом draw-call'ов. Размерность не указана → вернись к Ф1.


## 🎛️ AI STUDIO 4.67 — технический gate

Перед сдачей Ф5:

```bash
node ../project-forge/scripts/ai-studio-init.mjs . --check
```

Проверь, что `.forge-ai.json` не содержит secrets, generated textures/atlases не нарушили вес/FPS,
а `.openai_key`/`.elevenlabs_key` остаются gitignored и не попадают в build. Agent lanes для SDK и
security разрешены через `$studio`, но один интеграционный файл имеет одного writer.

## Правила фазы (общие)
- Каждый под-скил сохраняет свои гейты (game-design жёстко стоит без metrics.md и т.д.) — фаза их НЕ обходит.
- Между шагами: короткая сверка «что сделано» фактом (файл/греп), не заявлением.
- В конце фазы: сводка (что создано, что требует твоего решения) + команда СЛЕДУЮЩЕЙ фазы.
- Финал: wiki/_map.md + запись в sessions + node scripts/check-drift.mjs (для движковых правок).
