---
name: phase-5-tech
kind: architectural
description: "Фаза 5 — мобайл и SDK: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points."
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
`complete` читает контракт Ф5 и сам проверяет SDK init/ready, GameplayAPI
start/stop, рекламу, mobile/touch и безопасный `.forge-ai.json`. Перед командой
запиши фактические результаты техгейта в `wiki/qa/phase-5-tech.md`.


**Модели:** Claude `sonnet`. Codex base `gpt-5.6-sol/high`; routes `repeated-failure` и
`payment-security` → `gpt-5.6-sol/xhigh` только после двух одинаковых FAIL либо для
платежей/secrets/auth/non-standard SDK conflicts.
Канон: `status/references/model-policy.json`.


1. `$mobile-game-ui` — тач-управление, цели ≥44px, безопасные зоны.
2. `$yandex-sdk-integration` — порядок: init → detectLang → applyLang → ready ДО инпута;
   **GameplayAPI.start/stop обязателен** (кейс tyl).
3. `$yandex-ads` + `$bundle-libs` — реклама с паузой/сейвом, либы локально.

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
