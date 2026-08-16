---
name: product-metrics
kind: architectural
description: "Сгенерировать целевые метрики продукта (D1/D7/D30 retention, ARPU, conversion, session length, north-star) ДО геймдизайна. Использует web research для бенчмарков жанра +…"
---

# Product Metrics — KPI таргеты ДО геймдизайна

## Зачем

Без целевых метрик гейм-дизайнер делает "по вкусу" — фичи оказываются ad-hoc, без точек ориентации. Когда продукт релизится — задним числом обнаруживается что retention 12% (а ожидали 25%), session length 2 минуты (а планировали 6).

С метриками **до** дизайна:
- Дизайнер знает целевую session length → строит loop под это
- Монетизация знает целевой ARPU → балансирует rewarded vs IAP vs ads
- Архитектор знает целевую concurrency → выбирает stack
- Все feature decisions сверяются с "это поможет нам достичь D7=18%?"

Это **architectural skill** ([[decisions/010-architectural-vs-tactical-skills]]) — дешевле сделать в начале чем retrofit'ить.

## Когда вызывать

Skill универсален:

- **Новые проекты**: после `$start` (см. Step 6.6 в `$start` skill — auto-invoked)
- **Existing projects**: после `$analyze-game` или `$analyze-project` (Phase 7)
- **Pivot**: когда меняется audience / monetization model

Не вызывать если: метрики уже есть в `wiki/architecture/metrics.md` и они меньше 30 дней старые.

## Pipeline (4 шага)

### Шаг 1 — Read context

Перед research'ем нужно знать что за продукт. Прочитай:

```
wiki/_map.md                        # vision, целевые платформы
wiki/_current.md                    # current state
wiki/research/{Project}-references.md  # competitors (если есть)
wiki/architecture/stack.md          # что используется
```

Если `research/` пуст — invoke `$research-references {genre} {target-platform}` first. Метрики без знания конкурентов = guess work.

### Шаг 2 — Web research benchmarks

**Сначала classify** — это игра или приложение? Читай `wiki/_map.md` или `ANALYSIS.md` секцию `type` и `category`. Бенчмарки **очень разные**:

#### For GAMES — search

```
"{genre} {platform} retention benchmarks 2026"
"{genre} mobile games ARPU IAP conversion"
"{platform} session length distribution"
"hyper casual / mid-core / strategy retention curves"
```

Game KPIs focus: D1/D7/D30 retention, ARPDAU, session length, IAP conversion.

#### For APPS — different searches per category

App benchmarks **отличаются drastically** от games. D7=15% это успех для game, но катастрофа для productivity app (там норма 50%+). ARPU тоже другой — apps часто лонгер LTV, lower per-session monetization.

| Category | Search queries | Key KPIs |
|---|---|---|
| **productivity** | `"productivity app retention benchmark 2026"`, `"task management app D30 retention"`, `"notes app freemium conversion"` | D7 retention 40-60%, D30 25-45%, freemium→paid 2-5%, time-in-app 10-30min/day |
| **tools / reference** | `"reference app session frequency"`, `"calculator app retention"`, `"utility app DAU MAU"` | Session frequency (1-3x/week typical), search success rate, return rate over 30d |
| **business / B2B** | `"B2B SaaS retention NPS"`, `"CRM weekly active users"`, `"business app churn rate"` | Weekly active users (60-80% of paid seats), feature adoption, monthly churn <5% |
| **saas** | `"SaaS retention trial conversion"`, `"freemium SaaS conversion rate"`, `"SaaS LTV CAC ratio"` | Trial→paid conversion 5-15%, monthly churn 2-7%, LTV/CAC ≥3, ARPU $5-50/month |
| **health / wellness** | `"health app streak retention"`, `"fitness app habit formation"`, `"meditation app D90"` | Streak length, habit formation rate (D7 with consecutive use), D90 retention |
| **finance** | `"fintech app retention"`, `"budgeting app monthly active"`, `"finance app session frequency"` | Monthly active 70%+ of installs, session frequency (3-7x/week), feature adoption (advanced features) |
| **education** | `"education app lesson completion"`, `"learning app D30 retention"`, `"skill-building app habit"` | Lesson completion rate, daily active learners, skill progression metrics |
| **social / community** | `"social app DAU MAU ratio"`, `"community app posts per user"`, `"chat app retention"` | DAU/MAU ratio (sticky factor), posts per user, network growth |

#### Standard queries (any project)

Always also search:
- `"{platform} session length distribution"` — for all
- `"{genre/category} drop-off curve"` — where users typically leave

#### Сбор benchmarks в таблицу

For games:

```
Метрика          | Industry low | Industry avg | Industry high | Source
D1 retention     | 20%          | 30%          | 45%           | apptopia 2025
D7 retention     | 5%           | 12%          | 22%           | gamerefinery
ARPDAU           | $0.02        | $0.10        | $0.30         | gamerefinery 2025
Session length   | 3 min        | 6 min        | 12 min        | adjust
IAP conversion   | 0.5%         | 2%           | 5%            | sensor tower
```

For apps (productivity example):

```
Метрика              | Industry low | Industry avg | Industry high | Source
D7 retention         | 25%          | 45%          | 65%           | mixpanel 2025
D30 retention        | 15%          | 30%          | 50%           | mixpanel 2025
Sessions/week        | 3            | 7            | 14            | annie
Avg session length   | 2 min        | 5 min        | 12 min        | adjust
Freemium conversion  | 1%           | 3%           | 8%            | revenue cat
Monthly churn (paid) | 8%           | 4%           | 1.5%          | profitwell
```

For SaaS:

```
Метрика              | Industry low | Industry avg | Industry high | Source
Trial→paid          | 3%           | 10%          | 25%           | openview 2025
Monthly churn        | 7%           | 5%           | 2%            | profitwell
LTV/CAC ratio        | 2:1          | 3:1          | 5:1           | saastr
NPS (Net Promoter)   | 10           | 30           | 60            | qualtrics
ARPU/month           | $5           | $25          | $100          | (varies wildly by tier) |
```

For health/fitness:

```
Метрика              | Industry low | Industry avg | Industry high | Source
D7 retention         | 15%          | 30%          | 50%           | adjust 2025
D30 retention        | 5%           | 15%          | 35%           | adjust 2025
Streak D7+           | 10%          | 25%          | 45%           | habit research
Subscription conv.   | 2%           | 5%           | 12%           | revenue cat
Premium ARPU/month   | $5           | $10          | $25           | varies |
```

Используй те benchmarks которые соответствуют твоей category из `wiki/_map.md`.

### Шаг 3 — Generate proposal

На основе benchmarks **предложи 3 уровня таргетов**:

```
Метрика          | Industry avg | Floor (worth shipping) | Target | Stretch
D1 retention     | 30%          | 25%                    | 35%    | 50%
D7 retention     | 12%          | 8%                     | 15%    | 25%
D30 retention    | 4%           | 2%                     | 5%     | 10%
ARPDAU           | $0.10        | $0.05                  | $0.12  | $0.30
Session length   | 6 min        | 4 min                  | 7 min  | 10 min
Sessions/day     | 2.5          | 1.5                    | 3      | 5
IAP conversion   | 2%           | 1%                     | 3%     | 6%
North-star       | DAU × ARPDAU | $50/day                | $200   | $1000
```

**Floor** = "ниже этого даже не релизим, продукт не работает".
**Target** = "успешный запуск, можно масштабировать".
**Stretch** = "если повезёт + полировка".

Plus **engagement narrative**:
- Loop length (один core loop): X секунд
- Session structure: N циклов loop'а в среднем
- Drop-off points: где обычно теряем игрока (после tutorial / после первого death / после первого retention loop)
- Retention hooks (что вернёт игрока): daily reward / energy regen / social / новый контент

Plus **monetization narrative**:
- Primary model: IAP / Ads / Subscription / Hybrid
- Konkretnye точки rewarded video (5-7 штук): где вызываются
- Конкретные точки interstitial (2-3 штуки): после чего
- IAP catalog (если применимо): tier'ы, ценники, что продаётся
- **Что НЕ монетизируем** — явно: pay-to-win, ускорения core gameplay, и т.д.

### Шаг 4 — Stop, await user approval

ВЫВЕДИ proposal таблицу + narratives **и остановись**. Пользователь:
- Approve as-is
- Скорректирует ("D7 завышенный, поставь 12%")
- Спросит rationale ("почему D1 = 35% когда avg = 30%?")
- Скажет "не реалистично, на 20% ниже"

После approve — записать:

```
wiki/architecture/metrics.md         # human-readable таблица + narrative
wiki/decisions/{NNN}-product-metrics.md  # ADR с обоснованием
```

## Output template — `wiki/architecture/metrics.md`

```markdown
---
date: YYYY-MM-DD
status: approved
target-platforms: [yandex-games, telegram-mini-app, ...]
genre: {genre}
---

# Product Metrics — {Project}

> Approved targets ДО геймдизайна. Все feature decisions сверяются с этими цифрами.
> Re-review every 30 days or after major pivot.

## ⚠️ Красная линия рейтинга (Yandex 2.13, ужесточён 07.2026)

**Рейтинг ≤30 три недели подряд → Яндекс СНИМАЕТ игру с публикации.** Рейтинг формируется ~2 недели
после публикации (этот период не считается). Порог тревоги: **рейтинг < 40 → действовать, не ждать 30.**

План реакции (по нарастающей):
1. Прочитать свежие отзывы → починить главную боль игроков (обычно 1-2 повторяющиеся жалобы)
2. Выпустить обновление (контент/фикс) — обновление освежает игру в рекомендациях
3. Подать на ближайшее тематическое событие → `$seasonal-event` (приток игроков поднимает рейтинг)
4. Промо на главной каталога через Консоль (платно) — крайняя мера

Чек еженедельно: рейтинг в Консоли → вписать в таблицу ниже.

| Дата | Рейтинг | Статус | Действие |
|---|---|---|---|
| | | 🟢 >40 / 🟡 30-40 / 🔴 ≤30 | |

## Контент-бюджет под таргеты (ОБЯЗАТЕЛЬНО — иначе метрики описывают несуществующую игру)

Кейс tyl: KPI-таблицы образцовые, но все числа описывали ОДНУ кампанию на ~11 минут — а рядом
стояли таргеты D7/D30, требующие недель контента. Разрыв никто не посчитал. Аналитик ОБЯЗАН
выставить контент-бюджет, который его же таргеты подразумевают:

| Корзина | Таргет | Мин. контент, который таргет ТРЕБУЕТ | Часов геймплея | Есть сейчас | Дефицит |
|---|---|---|---|---|---|
| D0–D1 | {D1} | {напр.: 1 кампания + онбординг + 3 «вау»} | 0.5–1ч | {факт} | {разница} |
| D2–D7 | {D7} | {напр.: 5+ кампаний БЕЗ повтора ощущений: карты/доктрины/события, 12+ тех, daily-петля} | 3–5ч | {факт} | ⚠ {разница} |
| D8–D30 | {D30} | {мета-прогрессия между партиями, события, престиж} | 10ч+ | {факт} | ⚠ |

Правила: (1) минимум расчёта — **7 дней**; D30-строка может быть «после замера D7», но D1-D7 —
всегда с числами. (2) «Дефицит» — главный выход документа: это ТЗ для $game-design (его Step 0.5
раскладывает дефицит в фичи). (3) KPI без контент-бюджета = метрики несуществующей игры —
документ считается НЕПОЛНЫМ.

## Targets table

| Метрика | Floor | Target | Stretch | Notes |
|---|---|---|---|---|
| D1 retention | 25% | 35% | 50% | Industry avg 30%; we aim above due to {differentiator} |
| D7 retention | 8% | 15% | 25% | |
| D30 retention | 2% | 5% | 10% | |
| ARPDAU | $0.05 | $0.12 | $0.30 | |
| Session length | 4 min | 7 min | 10 min | One full loop = ~30 sec |
| Sessions/day | 1.5 | 3 | 5 | |
| IAP conversion | 1% | 3% | 6% | |

## North-star metric

**{Metric name}**: target {value}.

Rationale: {why this is the metric}.

## Engagement narrative

### Core loop
- Length: ~{X} seconds
- Components: {step 1} → {step 2} → {step 3} → {reward} → repeat
- Drop-off risk: {where most players quit}

### Session structure
- Median session: N loops = ~{Y} minutes
- Sessions/day target: from {bench} to {target}
- Daily routine: {when player typically plays}

### Retention hooks
1. **{Hook 1}** — e.g. "Daily reward escalator" — keeps D1
2. **{Hook 2}** — e.g. "Energy regen every 30min" — keeps D7
3. **{Hook 3}** — e.g. "Weekly challenge" — keeps D30

### Drop-off points (where to focus)
- After tutorial (typical loss: 30-50%) — onboarding quality
- First death (typical loss: 15%) — too punishing?
- After first hour (typical loss: 40%) — content runway
- After day 3 (typical loss: 60%) — depth runway

## Monetization narrative

### Primary model: {IAP / Ads / Hybrid / Subscription}

### Rewarded video hooks (target: 5-7 per session)
1. {Hook} — e.g. "2x reward after run" — fairness preserved
2. {Hook}
...

### Interstitial (target: 1 per 3 sessions)
1. {Trigger} — e.g. "After 3 deaths in row" — frustration moment ok for ad
2. {Trigger}

### IAP catalog
| Tier | Price | What | Conversion target |
|---|---|---|---|
| Starter | $1.99 | Cosmetic skin pack | 30% of paying users |
| ... |

### What we DON'T monetize
- Pay-to-win mechanics (no stat boosts via $)
- Speeding up core gameplay (no skip-the-fun)
- {project-specific exclusions}

## Acceptance criteria

Project is "ready to release" when (during alpha test):
- [ ] D1 retention ≥ Floor ({floor value})
- [ ] Session length ≥ Floor
- [ ] Crash rate < 1%
- [ ] Sub-3sec load time
- [ ] {Project-specific criteria}

Project is "successful launch" when (D7 after release):
- [ ] D1 ≥ Target
- [ ] D7 ≥ Target
- [ ] ARPDAU trending towards Target
```

## Output template — `wiki/decisions/{NNN}-product-metrics.md`

Standard ADR format from `_template.md`.

## Integration с другими skills

После создания `metrics.md`, следующие skills **должны** его читать в контекст:

| Skill | Что использует |
|---|---|
| `$game-design` | Loop length, session length, retention hooks |
| `$level-design` | Difficulty curve, drop-off points |
| `$monetization-design` | Rewarded hooks list, IAP catalog, exclusions |
| `$improve` | Acceptance criteria for "ready" |
| `$deepen-game` | Retention hooks, drop-off points |
| `$release-ready` | Acceptance criteria as gate |

К v4.8 — добавить `scripts/check-metrics-alignment.mjs` который проверяет что новые feature decisions упоминают metrics.

## Common pitfalls

1. **Завышение таргетов** — "у нас D1=60%". Industry top достигает 50%. Если ставишь выше — обоснуй чем именно ты лучше всех. Иначе занижай.

2. **Игнорирование платформы** — Telegram Mini App имеет другую retention curve чем Steam игры. Бенчмарки должны быть **для твоей платформы**.

3. **Только vanity metrics** — DAU без revenue-per-user = sea of fake numbers. Всегда есть north-star metric связанная с **бизнес-результатом**.

4. **Slap-and-forget** — метрики без re-review через 30 дней становятся stale. Date их.

5. **Не различать Floor/Target/Stretch** — если только один уровень, у команды нет градации между "обязательно" и "хочется".

## Non-Negotiable

- [ ] Read `wiki/_map.md`, `wiki/research/{Project}-references.md` BEFORE research
- [ ] Web search для benchmarks конкретно жанра + платформы + 2025/2026 года
- [ ] 3 уровня таргетов: Floor / Target / Stretch
- [ ] Engagement narrative + monetization narrative — без них метрики мёртвые числа
- [ ] Stop, await user approval ДО записи файлов
- [ ] Output: `wiki/architecture/metrics.md` + `wiki/decisions/{NNN}-product-metrics.md`
- [ ] Re-review reminder через 30 дней

## 🏰 ДВУХЭТАЖНОЕ УДЕРЖАНИЕ для игр с социальным слоем (кланы, альянсы, гильдии)

Полевой опыт (Hired Heroes: Medieval Warfare, 2023-2025, команда пользователя): **первые 3 дня
игрок кланы не открывает вообще** — изучает мир, историю, задания, собирает отряд. А когда
появились ВОЙНЫ кланов (клан объявляет войну клану), сессии выросли **до 3-4 часов в день**.
Отсюда обязательная структура для любой игры с социалкой:

### Этаж 1 — дни 1-3: ОДИНОЧНАЯ игра
Мир, история, задания, первый прогресс, сбор отряда/базы. Социальные системы в это время
**не нужны и не мешают**: клан-кнопка есть, но игрок в неё не идёт — и это нормально.
Следствие: **этаж 1 не зависит от населения** и целиком в зоне соло-разработчика.
Сюда идёт основной контент-бюджет, и он в основном ТЕКСТОВЫЙ (мир, задания, диалоги), а не
сотни арт-единиц.

### Между этажами — 🪜 лестница открытий (Ф2)
Этаж 1 не заканчивается на первой минуте: дни 2-4 держатся последовательностью открытий
(одно за сессию), и только к D5-D7 включается социальное. Без лестницы игрок уходит на
второй сессии, и второй этаж не наступает вообще.

### Этаж 2 — с D5-D7: КЛАН как двигатель
Клан включается, когда игрок уже вложился и понял мир. Двигатель — не чат и не бонусы, а
**конфликт**: война клан-против-клана, борьба за территории/ресурсы, расписание событий.
Именно смена режима («зашёл на 15 минут» → «сижу вечер») даёт часы в сессии, и она покупается
только соревнованием живых людей — контентом не заменяется.

### Что это значит для проектирования
1. **Критическая масса нужна НЕ на входе, а в узком месте воронки.** Клановый слой обслуживает
   удержавшееся ядро: из 10 000 установок до D7 доживает ~500 — этого хватает на 20-30 живых
   кланов и осмысленные войны. Не проектируй социалку под весь входящий поток.
2. **Не размазывай социалку по всему пути.** Ранние социальные фичи в дни 1-3 = потраченные
   ресурсы на то, чего игрок не видит.
3. **Ключевая метрика перехода: доля игроков, вступивших в клан к D7.** Она диагностичнее D7:
   ядро не идёт в кланы → второй этаж не построится, сколько контента ни добавляй. Ставить в
   metrics.md отдельной строкой с целевым числом.
4. **Клан = обязательство по LiveOps.** Войны работают, пока идут по расписанию; это не фича, а
   операция, которую нельзя поставить на паузу ради другого проекта. Указывать в 🔴-решении
   вместе со сроками.

### В таблицу «Математика удержания» добавляются строки
| День | Что удерживает | Этаж |
|---|---|---|
| D1-D3 | мир, история, задания, первый прогресс | одиночный |
| D4-D6 | углубление прогресса + знакомство с кланом | переход |
| D7-D30 | войны кланов, соревнование, события по расписанию | социальный |

## 🎯 ОТКУДА БЕРУТСЯ ЦЕЛЕВЫЕ ЧИСЛА (снаружи, а не из своих релизов)

Цель «D7 = 10%» без источника — гадание, а по ней считается весь контент-бюджет.

**Не смотреть на свои прошлые игры при постановке целей.** Собственные цифры — потолок, а не
ориентир: они заставят проектировать повторение прошлого результата. Свои факты нужны в другом
месте — в Ф9, чтобы сравнить план с фактом ПОСЛЕ релиза и понять, где ошиблась модель.

**Источники цели:**
1. **Топ жанра в каталоге платформы** — лидеры, плотность категории, плейтайм, отзывы;
2. **Внешние данные по жанру** — разборы, постмортемы, публичные бенчмарки. Ориентир для
   казуалок: D1 30-40%, D7 10-15%, D30 3-5%; у игр с длинным прогрессом D1 ниже, D7 выше;
3. **2-3 прямых конкурента** — чем держат, что в мете, на чём зарабатывают.

**Формулировка цели:** диапазон + источник + дата. «D7 8-12% (ориентир по жанру: <источник>,
08.2026)». Голое число = 📏 гипотеза.

**После релиза** цель пересматривается по факту (Ф9, «план vs факт») — вот там свои цифры
и работают, уже как измерение, а не как ориентир.

