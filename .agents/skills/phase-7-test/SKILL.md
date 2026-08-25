---
name: phase-7-test
kind: architectural
description: "Фаза 7 — тест: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points."
contract_version: 1
phases:
  - 7
modes:
  - phase
requires: []
reads:
  - "**"
writes:
  - WorkProgress/**
  - wiki/**
  - screenshots/**
  - test-results/**
  - qa/**
verifiers: []
stop_points: []
risk_shell: write
risk_external: none
references: []
completion_contract: status/references/phase-contracts/phase-7.json
---
# $phase-7-test — игра реально играется

## 🧭 Phase state marker (v4.67.1+)

На входе в фазу **обязательно** зафиксируй machine state:

```bash
node .claude/skills/status/references/phase-state.mjs start 7
```

Только после всех штатных gate/проверок и обязательных решений пользователя отметь выход фазы:

```bash
node .claude/skills/status/references/phase-state.mjs complete 7 wiki/testing.md wiki/qa/phase-7-report.md
```

Marker не заменяет evidence и не разрешает перескочить STOP-point. `$status` использует его как
machine-readable progression state, а сами артефакты остаются доказательством результата.
`complete` не принимает папку как evidence: нужны два конкретных wiki-отчёта. Затем trusted engine
profile выбирает runtime evidence: Web требует чистые `playtest-out/report.json` и `stage-out/rt.json`,
Godot сам запускает двухпроцессный native playtest и проверяет `qa/godot-playtest/report.json`.


**Модели:** Claude `sonnet`, непонятное падение — `opus`. Codex base
`gpt-5.6-sol/high`; route `unexplained-failure` → `gpt-5.6-sol/xhigh` только после
обычной воспроизводимой диагностики.
Канон: `status/references/model-policy.json`.


## Engine playtest preflight

`phase-state.mjs start 7` сохраняет `engineRuntime` из корневого `forge.engine.json`. Продолжай
только при `engineRuntime.capabilities.playtest=true`; проектная копия registry не может включить
capability. Browser reports не подтверждают Godot, а native Godot report не подменяет Web route.

**Web route (без изменений):**

1. `$test-game` целиком: ЭТАП 1 (verify+smoke) → ЭТАП 1.5 (playtest: скрипт ИГРАЕТ, 4 скриншота —
   **смотреть глазами**, 01≈04 = мёртвый инпут) → ЭТАП 1.6 (local-stage --ai: rt.json,
   факты _i18nRead/readyCalled).
1z. **Кадры и самооценка**: `node <движок>/scripts/screens-shoot.mjs .` — сними все экраны
   на мобильном 412 и десктопе, оцени каждый баллом (ui-review §самооценка), приложи вердикт.
   Скрипт сам пометит экраны, не влезающие в мобильный.
1a00. **Баланс** (`$gameplay-balance`): прогони тупую и умную политики, дай
   exploratory_ratio с вердиктом. mono_dominant или tied → дефект ДИЗАЙНА, возврат в Ф2,
   не чинить числами. Стенда нет — построй (он же нужен для поздних стадий).
1a0. **Лестница открытий** (🪜 из Ф2): пройди сессии 1-3 подряд, между ними закрывая игру.
   По каждой ответь: что НОВОГО увидел и зачем возвращаться завтра. Не можешь ответить —
   ступень не работает, это дефект удержания, а не мелочь.
1a. **Туториал** (проверка из `$game-tutorial`): пройди как новичок и опиши, что подсвечено
   на каждом шаге; клик МИМО подсветки не должен срабатывать; пропуск не ломает игру;
   перезапуск в середине продолжает с того же шага; ответь, что игрок понял на 5/20/60 секунде.
1b. Монетизация и мета: каждый RV-хук кликается → награда выдаётся → отказ не ломает;
   гача: крутка работает, pity-счётчик тикает и переживает F5, шансы открываются.
   Клавиатура: переключись на РУССКУЮ раскладку — WASD обязан работать (e.code).
2. Найденное чинить по одному и перегонять — не копить.

**Godot desktop route (GDScript):**

Сначала прочитай общий native contract:
[../godot-engine/references/godot-test-release.md](../godot-engine/references/godot-test-release.md).

1. Убедись, что Ф5 уже приняла строгий `forge.godot.playtest.json` и точную установленную копию
   `ForgePlaytestQA.gd`; не ослабляй ожидания ради PASS.
2. Запусти `node <Forge>/scripts/godot-playtest.mjs . --json` без `--headless`.
3. PASS требует два новых реальных процесса с одним изолированным user data root: первый вызывает
   реальные `Input.action_press/release`, сверяет состояние после каждого шага и сохраняет; второй
   загружает save и обязан вернуть точное сохранённое состояние. Source до/после идентичен,
   runtime errors отсутствуют, test harness запрещён.
4. Перенеси факты и найденные дефекты из `qa/godot-playtest/report.json` в
   `wiki/qa/phase-7-report.md`; любое несовпадение состояния/прогресса/save — FAIL, а не «почти готово».

Godot C# остаётся environment block до отдельного доверенного .NET adapter. О расположении `user://`:
https://docs.godotengine.org/en/stable/tutorials/io/data_paths.html

Следующая фаза: `$phase-8-release`


## 🎛️ AI STUDIO 4.67 — multi-agent QA

После обычных functional checks запусти `$visual-qa`. Для крупных игр `$studio` может параллельно
дать read-heavy lanes `qa-tester`, `visual-qa`, `moderation-auditor`; они возвращают evidence и не
чинят один UI-файл параллельно. Если Codex Computer Use доступен — пройди реальные flows; если нет,
используй штатные screenshots/playtest/browser scripts. Critical visual defect или необъяснённый Major
на основном flow блокирует Ф7.

## Правила фазы (общие)
- Каждый под-скил сохраняет свои гейты (game-design жёстко стоит без metrics.md и т.д.) — фаза их НЕ обходит.
- Между шагами: короткая сверка «что сделано» фактом (файл/греп), не заявлением.
- В конце фазы: сводка (что создано, что требует твоего решения) + команда СЛЕДУЮЩЕЙ фазы.
- Финал: wiki/_map.md + запись в sessions + node scripts/check-drift.mjs (для движковых правок).
