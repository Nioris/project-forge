---
name: phase-4-visual
kind: architectural
description: "Фаза 4 — визуал и ассеты: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points."
contract_version: 1
phases:
  - 4
modes:
  - phase
requires: []
reads:
  - "**"
writes:
  - WorkProgress/**
  - wiki/**
  - assets/**
verifiers:
  - phase4-visual-evidence
stop_points:
  - phase4-art-direction
risk_shell: write
risk_external: write
references: []
completion_contract: status/references/phase-contracts/phase-4.json
---
# $phase-4-visual — единый стиль, графика, реальные ассеты

## 🧭 Phase state marker (v4.67.1+)

На входе в фазу **обязательно** зафиксируй machine state:

```bash
node .claude/skills/status/references/phase-state.mjs start 4
```

Если дошёл до STOP-point и ждёшь решение пользователя — запиши причину перед ответом:

```bash
node .claude/skills/status/references/phase-state.mjs block 4 "target frame / style bible / art direction approval" --owner user --code PHASE4_ART_APPROVAL --decision-key phase4-art-direction
```

Только после всех штатных gate/проверок и обязательных решений пользователя отметь выход фазы:

```bash
node .claude/skills/status/references/phase-state.mjs complete 4 wiki/design/target-frame.md wiki/design/screen-flow.json assets/target/target-frame.png assets/target/screens/manifest.json assets/style/STYLE-BIBLE.md wiki/qa/phase-4-visual-review.md wiki/qa/phase-4-visual-evidence.json
```

Marker не заменяет evidence и не разрешает перескочить STOP-point. `$status` использует его как
machine-readable progression state, а сами артефакты остаются доказательством результата.


**Модели:** Claude `sonnet`, `$art-direction` — `opus`. Codex base
`gpt-5.6-sol/high`; route `art-direction` → `gpt-5.6-sol/xhigh` только после провала обычной
проверки style bible, target frame или визуального направления.
Канон: `status/references/model-policy.json`.


## Шаг 0 — ВОПРОС ПОЛЬЗОВАТЕЛЮ: библиотека или генерация?

Перед любой генерацией найди готовое КОМАНДОЙ (библиотеку в контекст не читать — она >1 МБ):
`node ../project-forge/scripts/asset-find.mjs "<жанр сеттинг объекты>" --use <2d|3d>`
(размерность бери из `wiki/_map.md` → «Размерность», её установила Ф1; 2.5D ищи как `2d`)
⚠️ Не отсеивай `kind: unity` — это склад обычных FBX/PNG/WAV, годных для web после конвертации
(см. 📦 в asset-library). Для 3D-игры такие паки часто лучший источник.
— собери список подходящих источников
(фильтр по `use` = тип игры, `kind`, тегам; сортировка по `rating`) и задай ОДИН вопрос:

```
Что берём под ассеты?
Нашёл в библиотеке: 1) <источник> ★4 — <что там> | 2) <источник> ★5 — <что там>
  А) Взять из библиотеки (перечисли, что именно)
  Б) Генерировать всё заново
  В) Смешанно: типовое из библиотеки, герой и стор-арт — генерация  ← обычно оптимально
```

**«Ничего не подошло» — НЕ финал фазы, а развилка.** Если библиотека не дала подходящего,
ты ОБЯЗАН предложить генерацию списком, а не молча оставить игру на системном UI:
```
В библиотеке подходящего нет (искал: <запросы>). Предлагаю сгенерировать:
  • иконки юнитов/ресурсов — N шт., стиль <из art-direction>
  • рамки и панели UI — 9-slice, N состояний
  • фон боевой сцены / карты — N шт.
  • портреты/аватары — N шт.
Итого ~N ассетов, время ~N минут. Генерируем?
```
Запрещённый исход фазы 4: **игра осталась на дефолтном CSS, системных шрифтах, эмодзи вместо
иконок и таблицах вместо сцены.** Это «браузерка 90-х», а не законченный продукт (и риск
отказа по 1.15 «игра выглядит незавершённой»). После использования источника — предложи оценку по правилам $asset-library.

1. `$art-direction` — спека стиля (обязательно ПЕРВОЙ), начиная с 🖼️ ДОСКИ РЕФЕРЕНСОВ:
   собрать 3-4 референса на категорию из Game UI Database / Interface In Game / топа жанра,
   скачать в `assets/refs/`, собрать доску `asset-bible.mjs . --dir assets/refs`,
   получить выбор пользователя (🔴) и писать спеку ПО НИМ, а не из головы.
1b. **🎯 ЦЕЛЕВОЙ КАДР** (art-direction): 3 варианта главного экрана целиком в целевом
   разрешении → доска → твой выбор → `assets/target/target-frame.png`. Дальше ВСЁ
   производство равняется на него, а самооценка меряет расстояние до него.
1c. **🗺️ ЦЕЛЕВЫЕ ЭКРАНЫ**: после утверждения общего target frame возьми каждый state из
   `wiki/design/screen-flow.json`. Через `$prompt-compiler` + `$image-studio` передай GPT Image
   **сам файл** `assets/target/target-frame.png` как image input/reference (для native Codex —
   `referenced_image_paths`, для batch — `/v1/images/edits`), а не только его путь или текстовое
   описание, и добавь описание конкретного экрана; затем создай его
   desktop и mobile visual blueprint в `assets/target/screens/`. Prompt pack обязан иметь
   `purpose: screen-blueprint`, точные `state`/`viewport` и ссылку на master target. После native
   GPT Image вызова зафиксируй результат `record-image-provenance.mjs`; это hash-bound attestation
   доверенного native host, а не квитанция провайдера. Batch OpenAI helper сильнее: он механически
   отправляет reference через `/v1/images/edits` и фиксирует `x-request-id`. GigaChat `text2image`
   экранным blueprint не считается,
   потому что не принимает утверждённый master PNG как reference input. Ключевые архетипы (gameplay,
   HQ/home, map/list, result/detail) получают `mode: dedicated`; второстепенный state может
   получить `mode: inherited` и ссылаться на утверждённую пару того же архетипа.
   Зафиксируй полную карту state → mobile/desktop PNG + SHA-256 в
   `assets/target/screens/manifest.json`. Нет mapping хотя бы для одного state — верстать и
   принимать Phase 4 нельзя. Blueprint — визуальная спецификация, не готовый UI: текст,
   controls и поведение реализуются доступным HTML/CSS/JS и проверяются отдельно.
   Не вычисляй хеши вручную: каждый mapping добавляй канонической командой:
   `node <движок>/scripts/screen-targets.mjs . --state "..." --description "..." --mobile assets/target/screens/...-mobile.png --desktop assets/target/screens/...-desktop.png`.
   Для наследования используй `--inherit-from "<утверждённый state>"`.
2. **`$ui-pipeline`** — КОМПОЗИЦИЯ КАЖДОГО ЭКРАНА из схемы `$screen-flow` (Ф2). Сначала
   проверь, что схема есть: нет схемы — не композиция сломана, а архитектура. КОМПОЗИЦИЯ ЭКРАНА (аудит → иерархия → система раскладки → редизайн →
   перепроверка). Обязателен, если интерфейс сложнее одного HUD: определяет, что на экране
   ГЛАВНОЕ (сцена), что вспомогательное (панели), что прячется. Пропуск этого шага и даёт
   «игра + админка»: таблицы во весь экран и сцена в углу.
   Приёмка — `$ui-review` по скриншоту 1920×1080.
3. `$visual-upgrade` — включая Step 0.7 (ширина десктопа + атмосферный фон, не чернота).
   Для 3D-игры (по размерности из Ф1) вместо этого: `$three-setup`.
4. **📖 БИБЛИЯ СТИЛЯ** (asset-generation Step 4.2): по 2-3 варианта на категорию + кандидаты
   из библиотеки → `node <движок>/scripts/asset-bible.mjs .` → пользователь выбирает эталоны
   (🔴 решение) → `selection.json`. Без него массовой генерации НЕТ.
4b. **Пиксельный стиль?** → `$pixel-art-pipeline`: 🔴 спросить пользователя, чем делаем —
   PixelLab (MCP, умеет анимации и 8 направлений) или своя генерация. Ответ фиксируется
   в брифе, в следующих сессиях не переспрашивается.
5. `$asset-generation` — только утверждённый scope: visuals через `$image-studio`; voice/SFX требуют `.elevenlabs_key`; music — prompt sheets/manual import.

Следующая фаза: `$phase-5-tech`


## 🎛️ AI STUDIO 4.67 — Prompt Compiler → Image Studio → Art Director

Это главная production-фаза для AI visuals:

1. `$prompt-compiler` переводит утверждённую style bible/target frame в `assets/prompts/*.json`.
2. `$image-studio` генерирует реальные candidates: **Codex-native ImageGen — default**;
   unattended batch — optional OpenAI API/GPT Image 2 через central `forge-data/secrets/openai.key`/`OPENAI_API_KEY` (legacy `.openai_key`).
3. `art-director` даёт APPROVE/REVISE/REJECT; массово продолжать по REJECT нельзя.
4. Approved asset встраивается в игру, затем `$visual-qa` смотрит gameplay screenshot.
5. OpenRouter fallback за спиной пользователя запрещён.

`$asset-generation` остаётся umbrella для visuals + voice/SFX/music, но visual lane теперь всегда
идёт через `$prompt-compiler` и `$image-studio`.

## Правила фазы (общие)
- Каждый под-скил сохраняет свои гейты (game-design жёстко стоит без metrics.md и т.д.) — фаза их НЕ обходит.
- Между шагами: короткая сверка «что сделано» фактом (файл/греп), не заявлением.
- В конце фазы: сводка (что создано, что требует твоего решения) + команда СЛЕДУЮЩЕЙ фазы.
- Финал: wiki/_map.md + запись в sessions + node scripts/check-drift.mjs (для движковых правок).

## Креативы стора — по $store-creatives
Иконка и обложка делаются как РЕКЛАМА (за секунду понятен жанр, есть эмоция, читаются в 100px,
не дублируют друг друга), каждый вариант — под записанную ГИПОТЕЗУ. Второй-третий варианты из
библии стиля НЕ выбрасывать: они кандидаты на A/B-тест в Консоли после релиза.

Стиль и подача опираются на **аудиторию из `wiki/design/brief.md`** (Ф1): для детей — крупнее,
контрастнее, проще; для взрослых — плотнее и строже. Не знаешь аудиторию — сперва бриф.

## 🔎 ШАГ 0.0 — ГОТОВЫЕ СКИЛЫ ПОД ЗАДАЧУ (один раз на проект)

Прежде чем проектировать графику и интерфейс — проверь, нет ли готового скила под конкретную
задачу этой игры: `$find-skills` (или напрямую `npx skills find <задача>`).

Что искать по типу игры (примеры запросов): `pixel art`, `game ui`, `icon design`,
`sprite animation`, `ui kit`, `accessibility`, `web interface guidelines`, `color palette`.

Обязательный минимум — эти уже проверены и годятся почти всегда:
```
npx skills add anthropics/skills --skill frontend-design -g -y
npx skills add vercel-labs/agent-skills --skill web-interface-guidelines -g -y
```
- **frontend-design** — методика дизайна (калибровка против дефолтов, два прохода, signature);
- **web-interface-guidelines** — 100+ правил интерфейса: доступность, производительность, UX.

Правила: отбор по гигиене `$find-skills` (1000+ установок, официальный источник); ставить
ТОЧЕЧНО под названную задачу, не пачками; проверка делается **один раз на проект** — нашёл и
поставил, дальше не возвращаешься. Ничего не нашлось — одна строка и работаешь нашими скилами.

## 📸 Перед сдачей — самооценка по кадрам
`node <движок>/scripts/screens-shoot.mjs .` → через локальный QA adapter оцени КАЖДЫЙ экран баллом
по ui-review §самооценка (мобильный 412 + десктоп). Ниже 6/10 — в работу, не показывать.

## 🔒 Исполняемый визуальный gate (обязателен для `complete`)

Самооценка builder-а — внутренний цикл исправлений, но **не приёмка**. После последнего изменения:

1. Реализация обязана включать локальный QA adapter `window.__FORGE_VISUAL_QA__` только при
   `?forgeVisualQa=1`, с методами `listStates()`, `showState(id)`, `currentState()`. Запусти
   `screens-shoot.mjs` без ручного `--states`: он сам берёт **все состояния из screen-flow**,
   переключает их через adapter и создаёт
   `screens/review/capture-manifest.json` с реальными размерами, SHA-256, coverage и browser errors.
2. Передай `assets/target/screens/manifest.json`, style bible и **каждый** mobile/desktop кадр другому
   reviewer-сеансу или отдельному visual-qa агенту. Builder session не может принять сам себя.
3. Reviewer открывает live screenshot рядом с его state-specific mobile/desktop target, а не только
   общий target и не JSON, и пишет `wiki/qa/phase-4-visual-review.md`: по каждому
   кадру — композиция, иерархия, читаемость, совпадение со стилем/target frame, адаптивность,
   конкретная критика и дефекты. Для target frame назови минимум 2 совпадения и 3 расхождения
   (композиция, плотность, палитра/материал, иерархия) и поставь отдельный `distanceScore`.
4. На основе `screens/review/phase-4-visual-evidence.template.json` сформируй
   `wiki/qa/phase-4-visual-evidence.json`; привяжи отчёт, target frame и style bible их SHA-256.
   После заполнения reviewer-полей выполни
   `node <движок>/scripts/bind-phase4-visual-evidence.mjs .` — он обновит только машинные
   пути/хеши и **не** превращает незаполненный/слабый review в PASS.
5. Независимый reviewer в другой host task/session запускает
   `node <движок>/scripts/record-phase4-visual-review.mjs .`, получая внешнюю по отношению к проекту
   tamper-evident receipt. Она обнаруживает последующую подмену evidence, но при полном shell-доступе
   сам host остаётся доверенной границей.
6. Запусти `node <движок>/scripts/check-phase4-visual-evidence.mjs .`. Только `PASS` разрешает
   команду `phase-state.mjs complete 4 ...`.

Gate отклоняет фазу, если: пропущено состояние из утверждённого screen-flow; нет пары 412px + desktop для каждого;
кадр устарел после правки UI; есть overflow/runtime error; reviewer совпадает с builder session;
не открыт/не оценён хотя бы один кадр; любой критерий или target distance ниже 6/10; reviewer не
назвал 2 совпадения + 3 конкретных расхождения с целью; остался Critical/Major; хеши
скриншота, target frame, style bible или отчёта не совпадают. Наличие CSS и `errors: []` больше
никогда не является визуальной приёмкой.
