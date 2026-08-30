---
name: phase-8-release
kind: architectural
description: "Фаза 8 — релиз: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points."
contract_version: 1
phases:
  - 8
modes:
  - phase
  - release
requires:
  - skill:forge-metrics
reads:
  - "**"
writes:
  - Release/**
  - forge.godot.export.json
  - qa/**
  - StoreData/**
  - SETUP_GUIDE.md
  - wiki/**
  - assets/**
verifiers: []
stop_points: []
risk_shell: write
risk_external: write
references: []
completion_contract: status/references/phase-contracts/phase-8.json
---
# $phase-8-release — до GREEN и сборка

## 🧭 Phase state marker (v4.67.1+)

На входе в фазу **обязательно** зафиксируй machine state:

```bash
node .claude/skills/status/references/phase-state.mjs start 8
```

Только после всех штатных gate/проверок и обязательных решений пользователя отметь выход фазы:

```bash
node .claude/skills/status/references/phase-state.mjs complete 8 wiki/deploy-log.md SETUP_GUIDE.md
```

Marker не заменяет evidence и не разрешает перескочить STOP-point. `$status` использует его как
machine-readable progression state, а сами артефакты остаются доказательством результата.
`complete` сам ищет в `Release/` непустую production/debug/marketing тройку одной версии и точную
строку `TOTAL: N pass, 0 fail` в deploy/plan evidence. Для Godot дополнительно запускается независимая
проверка ZIP, EXE/PCK, хешей, current source, export preset и Phase 4 receipts.


**Модели:** Claude `sonnet`, отказ модерации — `opus`. Codex base
`gpt-5.6-sol/medium`; routes `gate-failure` и `moderation-rejection` → Sol/high.
Штатная упаковка остаётся на medium, потому что GREEN определяют verifier-скрипты.
Канон: `status/references/model-policy.json`.


## Engine release preflight

`phase-state.mjs start 8` читает корневой `forge.engine.json`. Продолжай только при
`engineRuntime.capabilities.releaseExport=true`. Web/Yandex ZIP нельзя выдать за Godot release,
а Godot EXE/PCK не закрывают Web store route.

**Web/Yandex route (без изменений):**

0a. Гейт Яндекса (техгейт §1.14, автоматический с их стороны): игра ОБЯЗАНА быть запущена
   в режиме черновика до отправки — заливка и прогон чекера на черновике закрывают это;
   в MANUAL-чеклист добавляй строку «черновик запускался: дата».
0. Гейт входа: `node scripts/check-setup-guide.mjs <игра>` — SETUP_GUIDE.md существует и полон
   (верификатор есть в движке, теперь он ОБЯЗАТЕЛЕН перед релизом). Нет → сначала $fill-yandex.
1. `$release-ready yandex` — и ФАЗА СДАЁТСЯ АРТЕФАКТОМ: строка `TOTAL: X pass, Y fail, Z warn`
   из финального прогона копируется в wiki/plan/ (таск релиза) ДОСЛОВНО. Y fail ≠ 0 → фаза не
   пройдена, слова «прошли проверку» без этой строки не принимаются (полевой кейс: билд с 16
   статическими FAIL был залит после «пройденной» фазы 8 — GREEN был заявлением, не фактом). — гонять до GREEN (каждый пункт = вывод команды; «не запустилось» ≠
   «пройдено»); фиксы между прогонами.
2. GREEN → `$release-yandex` — 3 zip + чек-лист Консоли. Каждый build создаёт НОВУЮ
   версию через `node scripts/build-yandex-3zips.mjs {Game} --root .`; повторное имя ZIP
   и перезапись предыдущей версии запрещены. Гейт принимает только новый комплект
   production/debug/marketing одной версии, которой не было на старте Фазы 8.
3. Вывести MANUAL-чеклист «Проверь сам» — он на человеке.

**Godot Windows desktop route (GDScript):**

Перед сборкой прочитай общий native contract:
[../godot-engine/references/godot-test-release.md](../godot-engine/references/godot-test-release.md).

1. Добавь корневой `forge.godot.export.json` ровно для preset `Windows Desktop` и target
   `windows-x86_64`; в `export_presets.cfg` должен существовать preset с тем же именем, явным
   `binary_format/architecture="x86_64"`, отдельным PCK, debug-only console wrapper (default или
   `debug/export_console_wrapper=1`) и без credential values. Matching export
   templates обязательны.
2. Сначала получи `TOTAL: N pass, 0 fail` и запиши его в `wiki/deploy-log.md`. Текущая Фаза 4
   должна по-прежнему проходить trusted capture/proof/review gate.
3. Запусти `node <Forge>/scripts/build-godot-release.mjs <slug> --root . --json`. Экспорт выполняется
   только из изолированной копии через Godot `--headless --export-release/--export-debug`; gameplay
   проверки headless не используют.
4. Каждый успешный запуск автоматически создаёт новую patch-версию в
   `Release/<slug>/godot/windows/<vN.N.N>/`: production ZIP (EXE+PCK), debug ZIP
   (debug EXE+console.exe+PCK), marketing ZIP (только текущее Phase 4 evidence/media) и внешний release manifest. Вся папка версии
   публикуется одним rename; старые версии не перезаписываются.
5. Реальный builder создаёт подписанную engine-owned build receipt вне проекта. Запусти
   `node <Forge>/scripts/godot-release-verify.mjs . --json`: verifier читает ZIP без распаковки на диск,
   сверяет receipt, хеши/состав/current source/preset/export flags/Phase 4 binding и запрещает test exporter.

Godot C# и подпись Windows пока не выдаются за готовые: это последующие environment-specific lanes.
Официальные CLI/export требования:
https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html

Следующая фаза: `$phase-9-live`


## 🎛️ AI STUDIO 4.67 — release provenance gate

Перед упаковкой:
- generated gameplay/store assets имеют prompt pack + provenance/art review либо явно помечены как sourced;
- `.openai_key`, `.elevenlabs_key`, `.pixellab_key`, prompt debug dumps и private refs не попадают в release;
- approved assets реально присутствуют в build, а `candidates/` не тащатся туда случайно;
- `$visual-qa` Ф7 не имеет открытых Critical/Major для release flow.

Агентный security/moderation review может идти параллельно, но GREEN определяется только реальными verifiers.

## 📐 Release telemetry

Phase state автоматически обновляет `.forge/metrics/latest.json`, а успешный Phase 8 создаёт карточку
релиза. Перед финальной сводкой загрузи `$forge-metrics` и покажи coverage: неизвестная стоимость API
или ещё не полученная модерация должны остаться `unknown`, не `$0`/FAIL. Внешний provider/store факт
записывается только bounded-командой `scripts/forge-metrics.mjs event ...`.

## Правила фазы (общие)
- Каждый под-скил сохраняет свои гейты (game-design жёстко стоит без metrics.md и т.д.) — фаза их НЕ обходит.
- Между шагами: короткая сверка «что сделано» фактом (файл/греп), не заявлением.
- В конце фазы: сводка (что создано, что требует твоего решения) + команда СЛЕДУЮЩЕЙ фазы.
- Финал: wiki/_map.md + запись в sessions + node scripts/check-drift.mjs (для движковых правок).

## Перед подачей — проверка секретов
Если в игре есть бэкенд/платежи/ключи — прогони агента `security-auditor`: ключи и секреты
в билде, открытые эндпоинты, валидация покупок на сервере. Находки = блокеры подачи.
