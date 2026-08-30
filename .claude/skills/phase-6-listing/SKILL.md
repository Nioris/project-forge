---
name: phase-6-listing
kind: architectural
description: "Фаза 6 — локализация и листинг: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 6, phase 6, листинг, описания стора."
contract_version: 1
phases:
  - 6
modes:
  - phase
requires: []
reads:
  - "**"
writes:
  - SETUP_GUIDE.md
  - WorkProgress/**
  - StoreData/**
  - wiki/**
  - assets/**
verifiers: []
stop_points: []
risk_shell: write
risk_external: read
references: []
completion_contract: status/references/phase-contracts/phase-6.json
---
# /phase-6-listing — языки и тексты стора

## 🧭 Phase state marker (v4.67.1+)

На входе в фазу **обязательно** зафиксируй machine state:

```bash
node .claude/skills/status/references/phase-state.mjs start 6
```

Только после всех штатных gate/проверок и обязательных решений пользователя отметь выход фазы:

```bash
node .claude/skills/status/references/phase-state.mjs complete 6 SETUP_GUIDE.md wiki/qa/phase-6-listing.md
```

Marker не заменяет evidence и не разрешает перескочить STOP-point. `/status` использует его как
machine-readable progression state, а сами артефакты остаются доказательством результата.
`complete` проверяет не только отчёт: нужны валидный `store-listing-*.json`,
промо-скриншот и i18n runtime в коде. Для web также обязателен
`screens/video/promo.mp4`; для Godot вместо него обязательна текущая подписанная
native capture/proof/review цепочка. Результаты запиши в `wiki/qa/phase-6-listing.md`.


**Модели:** Claude `sonnet`. Codex base `gpt-5.6-sol/medium`; route
`creative-conflict` → `gpt-5.6-sol/high` только при реальном конфликте локализации,
позиционирования или visual selection.
Канон: `status/references/model-policy.json`.


Сначала прочитай доверенный `forge.engine.json`.

### Web route

1. `/localize` (режим АРХИТЕКТУРА): словарь I18N.ru + t() везде, хардкод = дефект; черновик заявляет ТОЛЬКО русский. Другие языки — НЕ добавлять (только явная команда пользователя).
2. `/promo-screens` — промо-скриншоты.
3. `/fill-yandex` — только когда текущий release scope действительно включает Yandex/web: описания/SEO/how-to-play без дублей (5.11), без капса.
4. `node scripts/record-promo.mjs <игра>` — только web/browser implementation.

### Godot route

1. Используй native Godot localization: реальный каталог `.po`/`.translation`, зарегистрированный в `project.godot`, и `tr()`/`tr_n()` во всех player-visible production строках. По умолчанию всё ещё RU-only.
2. Не вызывай `/fill-yandex` и не заявляй browser/mobile/Yandex, если engine profile и release scope остаются Windows Desktop-only. Создай честный `store-listing-ru.json` и самодостаточный `SETUP_GUIDE.md` для фактической desktop-поставки.
3. Сними свежие native кадры через `godot-screens-shoot.mjs` и motion proof через `godot-proof-video.mjs`. Подписанная текущая capture/proof/review цепочка является promo-media evidence; web `screens/video/promo.mp4` для Godot не требуется.
4. Store icon/cover всё равно проходят `/art-prompts` → `/prompt-compiler` → `/image-studio` и фактическую проверку размеров.

Нельзя удовлетворять Godot i18n словом `I18N` в `debugcheck.js`, а Godot media — поддельным MP4 header. Completion gate читает только активный Godot project path и проверяет текущую подписанную native visual evidence chain.

## Выход фазы — ФАЙЛЫ, проверь фактом (ls, не «сделано»)
| Артефакт | Кто создаёт | Проверка |
|---|---|---|
| `SETUP_GUIDE.md` (ручные шаги Консоли) | fill-yandex | ls + непустой |
| Тексты листинга (описание/SEO/how-to) | web/Yandex: fill-yandex; Godot: текущий desktop route | файл(ы) есть, поля не дублируются и не обещают отсутствующие платформы |
| Промо-скриншоты | web: promo-screens; Godot: native signed capture | файлы есть, размеры верны и текущий Godot store-кадр совпадает с подписанным capture |
| i18n RU | web: localize + t(); Godot: catalog + tr()/tr_n() | хардкода нет; черновик = только русский |
| Промо-видео / native motion proof | web: `record-promo.mjs`; Godot: `godot-proof-video.mjs` | web: `screens/video/promo.mp4`; Godot: текущая подписанная proof manifest + AVI, `testHarness=false` |

Нет любого артефакта → фаза НЕ завершена, вернись к соответствующему шагу. «Скил отработал» ≠
«файл существует» (полевой кейс: SETUP_GUIDE не был создан, пользователь запускал fill-yandex
руками).

Следующая фаза: `/phase-7-test`


## 🎛️ AI STUDIO 4.67 — store creatives как воспроизводимые hypotheses

Для иконки/обложки/промо:

1. `/art-prompts` формулирует marketing hypothesis и store constraints.
2. `/prompt-compiler` сохраняет A/B/C как отдельные prompt packs (одна гипотеза на вариант).
3. `/image-studio` создаёт candidates; `art-director` принимает только соответствующие style bible.
4. Финальные размеры проверяются фактом после resize/crop; generated text внутри image запрещён.
5. Не выбрасывай проигравшие, но валидные hypotheses — сохрани для A/B Ф9.

## Правила фазы (общие)
- Каждый под-скил сохраняет свои гейты (game-design жёстко стоит без metrics.md и т.д.) — фаза их НЕ обходит.
- Между шагами: короткая сверка «что сделано» фактом (файл/греп), не заявлением.
- В конце фазы: сводка (что создано, что требует твоего решения) + команда СЛЕДУЮЩЕЙ фазы.
- Финал: wiki/_map.md + запись в sessions + node scripts/check-drift.mjs (для движковых правок).

**Возрастной рейтинг и тексты** берутся из аудитории в `wiki/design/brief.md` (Ф1), а не
придумываются на этапе заполнения черновика.

## 👀 ЛИСТИНГ ПИШЕТСЯ ГЛЯДЯ НА ВЫДАЧУ, а не из головы

Иконка и название соревнуются в ленте с соседями, а не существуют сами по себе.
Перед fill-yandex: открой каталог платформы, КАТЕГОРИЮ своей игры, топ-20.
1. **Иконки соседей**: какие доминируют по цвету и композиции? Твоя должна ОТЛИЧАТЬСЯ
   (иначе сливается), но принадлежать жанру (иначе непонятно, что это).
2. **Названия**: длина, приём (существительное / глагол / пара слов). Проверь, что твоё
   не дублирует существующее — п. 5.12 требует уникальности, а найти дубль после отказа
   дороже, чем поискать сейчас.
3. **Описания**: с чего начинают первую строку — она видна в карточке.
4. Запиши наблюдения в `wiki/` одной строкой с датой: через полгода выдача изменится.
Это 15 минут, которые решают CTR — метрику, которую потом не починишь ничем.
