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
requires: []
reads:
  - "**"
writes:
  - Release/**
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
`complete` сам ищет в `Release/` непустую production/debug/marketing тройку
одной версии и точную строку `TOTAL: N pass, 0 fail` в deploy/plan evidence.


**Модели:** Claude `sonnet`, отказ модерации — `opus`. Codex base
`gpt-5.6-sol/medium`; routes `gate-failure` и `moderation-rejection` → Sol/high.
Штатная упаковка остаётся на medium, потому что GREEN определяют verifier-скрипты.
Канон: `status/references/model-policy.json`.


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

Следующая фаза: `$phase-9-live`


## 🎛️ AI STUDIO 4.67 — release provenance gate

Перед упаковкой:
- generated gameplay/store assets имеют prompt pack + provenance/art review либо явно помечены как sourced;
- `.openai_key`, `.elevenlabs_key`, `.pixellab_key`, prompt debug dumps и private refs не попадают в release;
- approved assets реально присутствуют в build, а `candidates/` не тащатся туда случайно;
- `$visual-qa` Ф7 не имеет открытых Critical/Major для release flow.

Агентный security/moderation review может идти параллельно, но GREEN определяется только реальными verifiers.

## Правила фазы (общие)
- Каждый под-скил сохраняет свои гейты (game-design жёстко стоит без metrics.md и т.д.) — фаза их НЕ обходит.
- Между шагами: короткая сверка «что сделано» фактом (файл/греп), не заявлением.
- В конце фазы: сводка (что создано, что требует твоего решения) + команда СЛЕДУЮЩЕЙ фазы.
- Финал: wiki/_map.md + запись в sessions + node scripts/check-drift.mjs (для движковых правок).

## Перед подачей — проверка секретов
Если в игре есть бэкенд/платежи/ключи — прогони агента `security-auditor`: ключи и секреты
в билде, открытые эндпоинты, валидация покупок на сервере. Находки = блокеры подачи.
