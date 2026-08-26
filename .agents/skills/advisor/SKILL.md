---
name: advisor
kind: tactical
description: "Режим советчика. Читает состояние проекта (wiki/_current.md, _map.md, последний план) ДО формулировки промпта. Не выполняет задачу сам — только формулирует промпт для Claude…"
---

# Режим советчика (v4.7+) — context-aware

> **Хочешь чтобы я СДЕЛАЛ, а не советовал?** → `$do {что нужно}`. Тот же context-aware роутинг
> по этому каталогу, но на выходе — **исполнение на файлах и продолжение работы**, без выдачи
> промпта на копипаст. Advisor формулирует промпт; `$do` его выполняет. Если юзер говорит
> «не советуй, делай» / «сразу примени» / «не надо промт» / «сам сделай» — переключайся на логику
> `$do` (см. `.claude/commands/do.md`): прочитай контекст, выбери скил, выполни, не возвращай промпт.

## Главное отличие от v4.6 advisor

**До v4.7:** advisor формулировал промпты только из текста запроса юзера.

**v4.7+:** advisor СНАЧАЛА читает состояние проекта (`wiki/_current.md`, `wiki/_map.md`, последний `wiki/plan/*.md` и `wiki/decisions/*.md`) → потом формулирует промпт **с учётом контекста**.

Зачем: чтобы не предлагать уже отвергнутое, не стартовать с нуля если есть план, и подставлять реальные имена/пути/решения из проекта.

## Как работает (4 шага)

### Шаг 1 — Прочитай контекст ПЕРЕД формулировкой

ВСЕГДА (без исключений) читай эти файлы если они существуют:

```
wiki/_current.md          # активная задача, blockers, последние решения, "Notes for next session"
wiki/_map.md              # vision, status (Done/In Progress/Next), priority backlog
wiki/plan/*.md            # активные планы — последний по mtime
wiki/decisions/*.md       # последние 3-5 ADR (architecture decisions)
```

Это ДЕШЕВО — несколько коротких read'ов. Это критично — без контекста advisor генерирует промпты в вакууме.

Если файлов нет (новый проект) — пропускаешь, работаешь по v4.6 логике.

### Шаг 2 — Классифицируй запрос

После чтения контекста, определи в какую из 4 категорий попадает запрос юзера:

| Категория | Признаки | Что делать |
|---|---|---|
| **A. Continuation** | Юзер продолжает существующий план/работу. В `_current.md` есть active task. В `plan/*.md` есть план с `[ ]` пунктами | Промпт продолжает работу: `$continue` ИЛИ конкретный шаг плана |
| **B. Pivot** | Юзер хочет сменить направление (отверг план, новая идея, изменил приоритеты) | Промпт явно говорит "забудь предыдущий план" + новый план |
| **C. New task** | `_current.md` пуст или явно завершён. Юзер начинает что-то совсем новое | Промпт по v4.6 логике (orchestrator-first) |
| **D. Question** | Юзер спрашивает мнения/decision rationale, не просит делать | Не давай промпт — отвечай прямо своими словами что думаешь |

### Шаг 3 — Сформулируй промпт С УЧЁТОМ контекста

Включай в промпт ссылки на реальные файлы:
- `Прочитай wiki/plan/01-build-game.md секция B2` (вместо "сделай синергии")
- `wiki/_current.md показывает active task: X. Продолжи с шага Y` (вместо "что дальше?")
- `Решение в wiki/decisions/001-platform-adapter.md уже принято — НЕ предлагай альтернативы` (защита от advisor'а который забывает что обсудили)

Подставляй реальные имена из проекта:
- Имя проекта (не `MyApp`, а `Spiral Vigil`)
- Реальный технологический стек из `wiki/architecture/stack.md`
- Платформы из `wiki/_map.md`

### Шаг 4 — Выдай промпт + 1 строчку контекста

Формат ответа:
```
Контекст: {1 строка — что прочитал из wiki, в каком state проект}

Промпт:

{сам промпт, на русском, готов к копированию в Claude Code}
```

Пример:
```
Контекст: Spiral Vigil. Активный план — wiki/plan/01-build-game.md (7 блоков B1-B7).
Сейчас ждём апрув плана. Юзер хочет сжать контент.

Промпт:

$continue

Апрув плана с правками:
1. Декомпозиция — ок, оставь.
2. Стопы — только после B1, B3, B7. Между ними иди сам.
3. Сжать контент: 12 карт ✓, 6 врагов ✓, 8 перков (вместо 12+),
   6 рингов + 6 оружий (вместо 10+10).
4. Босс — 2 фазы для MVP. Phase 3 отложи в B7 polish.
5. Multi-loop — оставь обязательно.
6. B7 onboarding — minimal: 3-4 tooltip'а на первый забег.

Старт с B1.1 Save persistence. Иди до конца B1, потом стоп.
```

---

## КАТАЛОГ ОРКЕСТРАТОРОВ — пробуй их первыми (как раньше)

Эти команды сами вызывают нужные skills и хуки. Если задача попадает под orchestrator — рекомендуй сразу.

### ⭐ Quick Start (v4.10.9+) — три команды покрывают 90% случаев

Это **smart routers**. Они читают контекст проекта (`wiki/_map.md`, `wiki/_current.md`, screenshots, файлы) и сами решают что вызвать. Юзеру не нужно помнить какой именно skill — router определяет intent.

| Команда | Когда |
|---|---|
| `$do [что нужно]` | **Действие, не совет.** Универсальный action-router: читает контекст, выбирает скил, ВЫПОЛНЯЕТ на файлах и продолжает. Покрывает игры, приложения И Forge-tooling. Используй когда нужен результат, а не промпт. |
| `$game [arguments]` | Игровой проект. Auto-detects: new project / analyze existing / continue / UI redesign / release. Аргумент: описание идеи, путь к файлу, или action verb. |
| `$app [arguments]` | Приложение. То же что $game, но для apps. Auto-detects категорию (productivity/health/finance/social/SaaS/etc) и применяет category-specific patterns. |
| `$continue` | Resume с того где остановились (читает `wiki/_current.md`, `_map.md`). Универсальный. |

Примеры использования routers:
```
$game tower defense с зомби в средневековье    # new project
$game                                          # читает контекст, решает что делать
$game redesign UI                              # → запускает ui-pipeline
$app habit tracker для бегунов                 # new app, health category
$app deploy to production                       # → release flow
```

**Если router не понял intent** или юзер просит **специфичный** skill — используй прямой вызов skill через `/{skill-name}` (skills auto-mergeятся как commands в CC v2.1.101+).

### 🎯 Autonomous workflows (v2.1.139+) — `/goal` и `$auto-release`

Claude Code v2.1.139 (12 May 2026) добавил `/goal` команду для outcome-driven loops. Юзер задаёт completion condition один раз, Claude итерирует пока не достигнет, **без spectacle на каждом turn**. Independent evaluator (Haiku) после каждого turn проверяет condition. (Актуальная версия CC — 2.1.153+; `/goal` доступен с 2.1.139, floor-проверки в скилах корректны.)

**`/goal` use cases:**
| Pattern | Example |
|---|---|
| Test до zero failures | `/goal все тесты в test/auth pass и lint clean` |
| Validator до GREEN | `/goal release-ready возвращает GREEN для yandex` |
| Refactor до budget | `/goal каждый файл в src/ меньше 500 lines` |
| Backlog processing | `/goal все issues с label "bug" closed` |

**Управление активным goal:**
- `/goal` (без аргумента) — статус (turns, tokens, latest evaluator reason)
- `/goal clear` — отмена (aliases: stop, off, reset, none, cancel)
- `/clear` (новая беседа) — тоже снимает goal

**`$auto-release {platform}`** — Forge wrapper над `/goal` для release workflow. Sets condition "release-ready GREEN для {platform}", Claude iterates fix→validate→fix пока не зелёно. Использовать когда:
- Готовая игра/приложение, нужно довести до модерации без сидения
- Известно что 5-20 issues есть, не хочется их fix'ить по одному

**Don't use /goal для:**
- Feature work (evaluator не может судить "done" для subjective work)
- Vague conditions ("make it better")
- Initial development (нужно user feedback на direction)

**Dynamic workflows (Opus 4.8, v2.1.150+) — опция для ОЧЕНЬ крупных задач, НЕ замена /goal.**
Opus 4.8 умеет создавать workflow, который оркестрирует работу через десятки-сотни агентов в
фоне. Когда что выбирать:
- **`/goal`** (дефолт для Forge) — измеримое условие (exit 0, validator GREEN, тесты pass). Проверен,
  evaluator-driven, предсказуем. Использовать почти всегда.
- **Dynamic workflow** — задача слишком крупная/ветвистая для одного линейного loop (например «прогнать
  10 sibling-проектов до релиза параллельно»). Делегирует пачкам фоновых агентов. Дороже и менее
  предсказуемо — бери только когда масштаб реально требует параллельной оркестрации.

Для типичного MVP→Yandex прогона `/goal` (через `$mvp-to-yandex` / `$auto-release`) — правильный выбор.

**Caveats:**
- Default runaway guard = 500 stop-continuations. Set `CLAUDE_GOAL_MAX_STOP_CONTINUES=50-100` для release loops
- Token consumption может быть значительный (10-100K tokens на medium goal)
- Активный goal restores при `--resume` / `--continue`

### Создание / анализ проекта (специфичные skills)

Можно вызывать напрямую если знаешь что нужно. Но `$game` и `$app` обычно их зарутят сами.

| Команда | Когда |
|---|---|
| `$pipeline` | Full lifecycle orchestrator (8 steps): discovery → research → metrics → design → build → test → release-ready → release. `$game` routes сюда для multi-step workflows. |
| `$start {имя}: {описание}. Платформы: X. Тип: игра/приложение` | НОВЫЙ проект с нуля. Auto-research конкурентов (Phase 0a) + skill discovery (Phase 0b) + i18n foundation. `$game <идея>` и `$app <идея>` routes сюда. |
| `$new-project` | Новый проект через git worktree (изолированный sibling). Auto-research |
| `$analyze-game` | Готовая игра — Claude изучит код, жанр, состояние. `$game` без args routes сюда если код есть. |
| `$analyze-project` | Готовое приложение — то же что analyze-game для apps. `$app` без args routes сюда. |
| `$product-metrics` | STEP 2 of pipeline — KPI таргеты на основе benchmarks. |
| `$design-pipeline` | STEP 3 of pipeline — спавнит specialists через Agent Teams. |
| `$autopilot` | STEP 4 of pipeline — autonomous mode по master plan. |
| `$find-skill {query}` | Discovery. Local search по 102 Forge skills + marketplace fallback через npx skills CLI. Используй когда: 1) юзер просит capability которой ты не знаешь существует ли в Forge, 2) хочешь установить из public marketplace. |

### Расширение и полировка

| Команда | Когда |
|---|---|
| `$deepen-game` | Игра работает но feels thin — больше уровней, прогрессия, retention |
| `$improve` | Полная полировка игры (визуал + звук + геймплей + мобилка) |
| `$polish-app` | Полная полировка приложения |
| `$full-pipeline` | Raw prototype → release-ready для Yandex (3 фазы с остановками) |

### Backend / сервер

| Команда | Когда |
|---|---|
| `$choose-backend-stack` | Нужен сервер — задаст 4 вопроса, рекомендует 1 из 5 канонических стеков |
| `$server-detect` | Определить нужен ли вообще сервер этому проекту |
| `$anon-auth-sync` | Анонимная auth + E2E cloud sync — универсальный паттерн |
| `$deploy` | Docker + Nginx + SSL для self-hosted web |

### Перед релизом — ОБЯЗАТЕЛЬНО

| Команда | Когда |
|---|---|
| `$release-ready <platform>` | Pre-release checklist read-only: red/yellow/green per platform |
| `$release-ready yandex vk telegram` | Проверка нескольких платформ одной командой |
| `$gate <platform>` | Только validators (быстрая проверка кода) |
| `$credentials-check` | Глубокая проверка keystore, API keys, env vars |

### Релиз

| Команда | Когда |
|---|---|
| `$release-all` | Параллельная сборка всех 9 платформ через Agent Teams |
| `$release-yandex` | Yandex Games: SDK + 13 языков + 3 ZIP |
| `$release-vk` | VK Mini Apps: VK Bridge + 3 validators |
| `$release-telegram` | Telegram Mini App: WebApp SDK + HTTPS |
| `$release-ok` | OK.ru: FAPI + API_callback + rewarded preload |
| `$release-max` | MAX мессенджер: MaxSDK + 5 validators |
| `$release-rustore` | RuStore: AAB + Pay SDK + receipt validation |
| `$release-web` | Self-hosted: Dockerfile + nginx + Let's Encrypt |
| `$release-steam` | Steam: Electron + steamworks.js + SteamPipe upload |
| `$release-vkplay` | VK Play (vkplay.ru, **не путать с VK Mini Apps**): iframe + signed auth |
| `$convert` | HTML5 → Android APK через Capacitor (для RuStore) |
| `$convert-all` | Конвертация в несколько форматов сразу |
| `$rustore-publish` | Метаданные RuStore + IAP + Pay SDK + receipt validation |

### Инструменты и агенты ВНЕ каталога скилов (advisor: знай и советуй)

Каталог ниже покрывает скилы. Эти возможности живут вне его — предлагай по контексту:

| Что | Когда советовать |
|---|---|
| **Параллельный аудит** — N × агент `moderation-auditor` (read-only, model: sonnet) | «проверь все игры» / несколько игр перед подачей → по агенту на игру, оркестратор сводит. Правило: вердикт воркера ≠ факт, перепроверять верификатором |
| **`node scripts/playtest.mjs <игра>`** — активный плейтест (кликает, играет, 4 скриншота) | «протестируй игру», «работает ли» → внутри $test-game ЭТАП 1.5; скриншоты смотреть глазами |
| **`node scripts/local-stage.mjs <игра>`** — панель Яндекса локально (мок-SDK) | «проверить без заливки черновика», рантайм-факты (_i18nRead, ready) → $test-game ЭТАП 1.6; --ai для машиночитаемого rt.json |
| **Codex-слой** — AGENTS.md (генерится из CLAUDE.md, drift-guard #13) | вопросы «под Codex/другой инструмент» → та же папка, скилы читаются путём, хуки компенсируются блоком «В конце» |
| **update-forge.bat** (лежит РЯДОМ с проектом) | «как обновить движок» → скачал zip → двойной клик |

### Монетизация и мета (advisor: предлагай проактивно)
- «мало зарабатывает / RV/DAU < 1» → 🔥 агрессивная доктрина monetization-design (ретрофит:
  таблица хук→награда, ≥5 разных) + `$gacha-meta` (колесо/гача/сундуки за RV).
- «игроки не возвращаются» → дейли-слой из $gacha-meta (колесо, календарь) + seasonal-event.
- Проверка перед советом: grep showRewardedVideo (сколько хуков есть) — советуй дельту, не всё.

### После релиза — жизнь игры (advisor: предлагай проактивно)

Релиз — не конец. Если контекст (wiki/_current.md, _map.md) показывает недавний релиз/публикацию,
advisor ПРЕДЛАГАЕТ следующий шаг из этой таблицы, не дожидаясь вопроса:

| Команда / действие | Когда предлагать |
|---|---|
| `$seasonal-event` | Сразу после публикации И раз в 2-3 недели: проверить календарь тематических событий Яндекса — бейдж «Акция» = бесплатный трафик; заявка закрывается за ~4-5 раб. дней до старта |
| Rating-watch (таблица в `wiki/architecture/metrics.md`) | Еженедельно: рейтинг из Консоли → в таблицу. Красная линия 2.13: ≤30 три недели → игру СНИМУТ. Порог тревоги <40 → план эскалации в metrics.md |
| `$audit-requirements` | Раз в месяц или при любом отказе модерации: не изменились ли требования Яндекса с базовой даты (движок сверяет живую страницу с baseline) |
| `$product-metrics` (re-review) | Каждые 30 дней: сверить факт с таргетами D1/D7/ARPU, скорректировать |

### Заполнение store-листингов

| Команда | Когда |
|---|---|
| `$fill-yandex` | Карточка Yandex Games: 13 языков JSON |
| `$fill-vk` | Карточка VK Mini Apps |
| `$fill-rustore` | Карточка RuStore: SEO, категория, теги |
| `$fill-steam` | Steam Store page |
| `$fill-vkplay` | VK Play Game card |
| `$store-listing` | Универсальное store listing |
| `$art-prompts` | Промпты для иконки/баннера |
| `$promo-screens` | Промо-карточки С ТЕКСТОМ для магазина |

### Управление сессией

| Команда | Когда |
|---|---|
| `$continue` | Продолжить — читает _current.md, _map.md |
| `$status` | Прогресс: что готово, что осталось |
| `$plan` | Дорожная карта разработки |
| `$review` | Аудит кода: баги, мёртвый код, безопасность |
| `$doc` | Обновить документацию |
| `$handoff` | Сохранить контекст перед закрытием |
| `$team` | Agent Teams parallel режим |

### Расширение Forge

| Команда | Когда |
|---|---|
| `$research-references {жанр} {аспект}` | Изучить конкурентов вручную (обычно auto в start/analyze) |
| `$find-or-make-skill {название}` | Discovery chain: local → Anthropic → community → создать |
| `$learn-sdk {SDK}` | Изучить новый SDK и создать skill навсегда |
| `$mcp-server` | Setup Forge as MCP server: expose 96 skills, 12 ADRs, 13 invariants, 10 verifiers, 3 prompts to Claude Desktop / Claude Code в other projects |
| `$add-pipeline` | Добавить новый workflow |
| `$write-skill` | Создать skill вручную |

---

## Sub-skills (когда нужно точечно)

### Полировка игры
| Skill | Что делает |
|---|---|
| visual-upgrade | Палитры, частицы, glow, параллакс, floating numbers |
| game-design | Core loop, juice, difficulty curve, retention |
| level-design | Генераторы уровней для 10 жанров, прогрессия, боссы |
| sound-design | 12 SFX + фоновая музыка через Web Audio API |
| mobile-adapt | Ориентация по жанру, тач-управление, джойстики |
| mobile-game-ui | Максимум 4-5 кнопок, radial wheel, размеры шрифтов |
| game-polish | Загрузочный экран, splash, переходы, онбординг |
| monetization-design | Карта рекламы, rewarded hooks, IAP каталог |

### UX/UI Systems Designer skills (v4.10.5+) — auto-invoked в design-pipeline ПЕРЕД art/visual

**v4.10.7 update:** все 4 skill читают **comprehensive pattern reference base** в `info-hierarchy/patterns/`:
- `games.md` (342 lines) — 7 жанров (action, strategy, idle, match-3, RPG, casual, calibration), F2P patterns, mobile thumb zones, safe areas. Source: Game UI Database 1300+ games, Material/HIG, Fagerholt taxonomy.
- `apps.md` (415 lines) — 10 категорий (productivity, health, finance, social, tools, SaaS, education, communication, media, e-commerce), navigation per screen size, dashboard types, form patterns. Source: Material 3, Apple HIG, Mobbin 10000+ apps, SaaSFrame 5000+ dashboards.

| Skill | Что делает | Когда invoke |
|---|---|---|
| ui-pipeline | Architectural — master orchestrator (5 steps): audit → hierarchy → layout → implement → verify. Один command вместо ручного вызова info-hierarchy + layout-system + ui-review по очереди. ⭐ recommended entry point для UI rework. | Юзер: "переделай UI", "redesign", "почини layout". MVP с visual chaos. |
| info-hierarchy | Architectural — primary/secondary/tertiary tier system per screen + 3-second test + squint test. Без этого все элементы одинаково кричат. | До художника. Когда юзер: "не понимаю куда смотреть", "плоский UI". |
| layout-system | Architectural — 8pt grid + spacing tokens + 12-col responsive + breakpoints + density modes. Foundation для всего CSS. | До visual-upgrade. Когда юзер: "панели разной высоты", "spacing рандомный", "ломается на mobile". |
| ui-review | Tactical — Nielsen 10 heuristics + layout/hierarchy/density audit + severity-ranked findings + actionable fixes. | После implementation. Когда юзер: "это говно", "плохо выглядит" но не объясняет точно. |

### Архитектурные skills для приложений (v4.7.9+) — auto-invoked в design-pipeline для apps

| Skill | Что делает |
|---|---|
| app-data-model | Architectural — заложить data model (entities, repositories, schema versioning, migrations). ОБЯЗАТЕЛЬНО для apps с >100 records. |
| app-onboarding-flow | Architectural — onboarding strategy (Level 1/2/3), empty states, permission asks, sample data. Снижает D1 churn. |
| app-search | Architectural для tools/reference apps — Fuse.js / Lunr / linear search, autocomplete, history, analytics. ОБЯЗАТЕЛЬНО для tools. |
| app-permissions | Architectural для business/SaaS — RBAC (4 roles), audit log, multi-tenant. ОБЯЗАТЕЛЬНО для multi-user apps. |
| subscription-design | Architectural monetization для apps — tiers, trial, paywall placement, churn prevention. Замена monetization-design для не-games. |

### Per-category app foundations (v4.7.10+) — auto-invoked для специфичных категорий

| Skill | Категория | Что добавляет |
|---|---|---|
| health-app-foundation | health/wellness | GDPR Article 9 + encryption at-rest + behavior design (streaks без shame, smart reminders) + crisis intervention для mental health + medical disclaimer + privacy-first analytics |
| finance-app-foundation | finance | Decimal arithmetic (NEVER float for money) + atomic transactions + financial audit (7-year retention) + currency snapshots + PCI scope avoidance + tax export (РФ XML, US CSV) + verifier `check-no-float-money.mjs` |
| business-app-foundation | business / B2B | Multi-tenant isolation (orgId scoping at storage layer) + custom roles + manager-subordinate hierarchies + workflow state machines + advanced audit с legal hold + webhooks + REST API + white-label + reports |
| saas-foundation | saas | Trial → paid conversion flow + admin panel (impersonation audited) + Stripe webhooks (idempotent) + dunning + plan change/proration + customer health score + CSM queue + growth loops (referrals, viral) + SaaS metrics (MRR, churn, NDR, LTV/CAC) |
| education-foundation | education | Pedagogy framework (Bloom's taxonomy) + spaced repetition (Leitner/SM-2/FSRS) + progression curve (ZPD) + COPPA compliance если детям + multi-role architecture (student/teacher/parent) + content versioning + assessment integrity (anti-cheat per stakes) |
| social-foundation | social/community | Trust & Safety architecture (prevention + detection + response) + auto-moderation (Perspective/OpenAI Mod + CSAM hash matching) + human review queue с SLA + action ladder + appeals + rate limiting + bot detection + real-time messaging (WebSocket/SSE) + privacy (block/mute/restrict, E2E options) + age gating |


### Полировка приложения
| Skill | Что делает |
|---|---|
| app-ux-polish | Empty states, undo, валидация, swipe-to-delete |
| app-data-flow | Поиск с подсветкой, фильтры, сортировка, virtual scroll |
| app-notifications | Тосты, напоминания, badge |
| app-settings | Тёмная/светлая тема, preferences, export/import |

### SDK интеграции
| Skill | Что делает |
|---|---|
| yandex-sdk-integration | SDK init, lifecycle, saves, ads, leaderboards |
| vk-sdk-integration | VK Bridge init, storage, реклама, покупки |
| steam-sdk-integration | Steamworks.js: achievements, stats, cloud, leaderboards |
| vkplay-sdk-integration | VK Play JS API: payments + webhook, auth signing |
| yandex-ads | Yandex Mobile Ads SDK |
| mytracker | MyTracker аналитика |
| capacitor-wrap | Обёртка через Capacitor (HTML→Android) |
| twa-wrap | Trusted Web Activity для PWA |

### Сборка и проверка
| Skill | Что делает |
|---|---|
| build-apk | Собрать APK если Capacitor настроен |
| rebuild | Пересобрать после изменений |
| debugcheck-enhance | Дебаг-панель для проверки SDK |
| test-game | Автотесты + 6 ручных проверок |
| mobile-ready | Аудит мобильной готовности |

### Локализация и метаданные
| Skill | Что делает |
|---|---|
| i18n-foundation | Заложить i18n архитектуру С НУЛЯ (src/i18n/, t()/td(), detect, hot-swap, validation gate). Default ru+en, runtime подход. ДО любых работ с UI. |
| localize | На 13 языков порциями (после foundation, для Yandex Games) |
| monetization-strategy | Стратегия монетизации |
| pwa-convert | Service worker + manifest |
| reprocess | Переобработка выпущенной игры |
| fix-moderation | Разбор замечаний модерации |
| fix-ui | Советчик по UI |

### Infrastructure awareness (v4.10.16+) — что знать о Forge tooling

Эти инструменты не skills, но advisor должен знать о них чтобы рекомендовать когда нужно:

| Tool / Script | Когда упомянуть |
|---|---|
| `scripts/runtime-test.mjs` | Юзер собирается релизить. `$release-ready` авто-вызывает. Headless Chrome + 5 scenarios: startup/lang/assets/dom/sdk. Ловит то, что static analysis пропускает (lang leaks, asset 404, SDK contract). Требует `npm install puppeteer` один раз. |
| `upgrade.ps1` / `upgrade.sh` | После copy-with-replace распаковки нового Forge zip — **обязательно**. Unblock MoW + remove orphans (legacy list + MANIFEST.txt catch-all) + nested dupes + advisor sync. |
| `MANIFEST.txt` | Auto-generated. Lists все файлы в текущей версии. upgrade удаляет файлы которых нет в манифесте. **Не редактировать вручную** — `scripts/generate-manifest.mjs` создаёт. |
| `scripts/check-sync-status.mjs` | Юзер сомневается прошёл ли sync к siblings. Show real diff (verification, не reporting). |
| `scripts/check-nested-dirs.mjs` | Подозрение что `platforms/platforms` или подобные nested artifacts накопились. Detector с `--fix` mode. |
| `scripts/check-ps1-encoding.mjs` | Юзер создаёт PS1 script. Все .ps1 должны быть ASCII или с UTF-8 BOM (иначе Windows PowerShell 5.x crash на non-ASCII). |
| `scripts/check-store-listing.mjs` | Юзер делает релиз с store-листингом. Validator против `schemas/store-listing.schema.json`. Catches: AI-invented fields (`_comment`, `_removed_fields`, `developer_comment`, `ageRating`), missing required, wrong types (category should be array 1-3 items not string). |
| `scripts/check-setup-guide.mjs` | Юзер генерирует SETUP_GUIDE.md через `$fill-yandex`. Проверяет: все 17 секций, нет placeholders ({N}, {Project}), нет invalid tags в positive context (idle/tycoon/СНГ — должно быть в "❌ НЕ ставь" anti-pattern context), нет non-existent categories (Аркады/Идл), >60% tags coverage с store-listing JSON, reference к reference/ files, §4 имеет anti-patterns warning. |
| `scripts/search-skills.mjs` | Internal — используется `$find-skill` skill'ом. Можно запустить напрямую для exploration: `node scripts/search-skills.mjs "<query>"`. |

---

## Правила формулировки промптов

1. **Сначала прочти wiki/** — `_current.md`, `_map.md`, `plan/*.md`, `decisions/*.md`. Без этого ты slepой.

2. **Классифицируй** — Continuation / Pivot / New task / Question. Промпт зависит от категории.

3. **Сначала smart routers** — `$game`, `$app`, `$continue`. Они auto-route к нужным sub-skills. **Только** если router явно не подходит — рекомендуй orchestrator (`$pipeline`, `$start`, `/analyze-*`, `$release-ready`, `$improve`, `$polish-app`, `$choose-backend-stack`). Если есть — рекомендуй его.

4. **ОДНА СТРОКА** для простых случаев. Для orchestrator'а: `/orchestrator арг\n\nКонтекст: {1-2 строки}`.

5. **На РУССКОМ** — иначе Claude переключится на английский.

6. **КОНКРЕТНО** — не "улучши", а "добавь boss spawn trigger в src/main.ts:505".

7. **С ССЫЛКАМИ НА ФАЙЛЫ** — `Прочитай wiki/plan/01-build-game.md секция B2` лучше чем "сделай синергии".

8. **С ОГРАНИЧЕНИЯМИ** — если в `_current.md` blocker'ы или явные "не трогай X" — включай в промпт.

9. **Для НОВЫХ проектов** — `$start`, не enumerated skills.

10. **Перед релизом** — ВСЕГДА `$release-ready <platform>` ДО `/release-*`.

11. **Если непонятно** — задай ОДИН вопрос, не три. "Это continuation или pivot?".

---

## Примеры с context-awareness (v4.7+)

### Пример 1 — Continuation

User в Claude Code:
> "ну давай первый шаг плана делать"

Advisor:
1. Reads `wiki/_current.md` — видит "active task: ждём апрув плана wiki/plan/01-build-game.md"
2. Reads `wiki/plan/01-build-game.md` — видит 7 блоков B1-B7, B1.1 = Save persistence
3. Classifies as **Continuation**

Output:
```
Контекст: Spiral Vigil. План в wiki/plan/01-build-game.md (B1-B7), сейчас Block 1.

Промпт:

$continue

Апрув плана. Стартуем с B1.1 — Save persistence через localStorage.
Иди по B1 (B1.1 → B1.10) до конца, потом стоп для проверки.
```

### Пример 2 — Pivot

User:
> "стой, не нравится план, давай не 7 блоков а просто доделай core loop"

Advisor:
1. Reads `wiki/_current.md` — видит активный план B1-B7
2. Reads `wiki/plan/01-build-game.md`
3. Classifies as **Pivot** (юзер отвергает существующий план)

Output:
```
Контекст: Spiral Vigil. Юзер отверг план B1-B7 в wiki/plan/01-build-game.md, 
хочет упростить до core loop.

Промпт:

$continue

Pivot — забудь план в wiki/plan/01-build-game.md (отметь как abandoned, 
не удаляй для истории).

Делай ТОЛЬКО core loop:
- Boss spawn trigger при bossProgress >= 1.0
- End-of-run screen (победа/смерть)
- Save persistence через localStorage
- Resource gain при kill enemy

Без камп UI, без synergies engine, без класс selection. После — стоп.

Создай wiki/plan/02-core-loop-only.md с этим списком.
```

### Пример 3 — New task

User:
> "хочу новое приложение для рустора, просмотрщик документов"

Advisor:
1. Reads `wiki/_current.md` — пусто или другой проект
2. No active plan
3. Classifies as **New task**

Output:
```
Контекст: новый проект, не существует.

Промпт:

$start UniDocs: Просмотрщик документов для Android. Платформы: rustore. Тип: приложение
```

### Пример 4 — Question (no prompt)

User:
> "слушай, multi-loop в B5 — это сложно или просто? Стоит делать?"

Advisor:
1. Reads `wiki/plan/01-build-game.md` — видит B5 с multi-loop pattern
2. Classifies as **Question**

Output (NO prompt, прямой ответ):
```
Multi-loop — это то что отличает Loop Hero от обычного auto-battler'а. 
Без него забег = один прогон одной петли = тупо.

Сложность реализации средняя: после убийства первого босса генерится 
новая петля (вызов loopGenerator с инкрементом seed). State machine 
loop-1 → loop-2 → loop-3 уже есть в каркасе через bossProgress.

Решение: оставь. Без multi-loop игра будет "тупой clicker", и придётся 
потом всё равно добавлять.
```

---

## Non-Negotiable

- [ ] Сначала прочти `wiki/_current.md`, `_map.md`, `plan/*.md`, `decisions/*.md` (если существуют)
- [ ] Классифицируй запрос: Continuation / Pivot / New task / Question
- [ ] Для Question — отвечай прямо, не давай промпт
- [ ] Для остальных — формулируй промпт с реальными именами файлов проекта
- [ ] НИКОГДА не выполнять задачу — только промпт (или ответ для Question)
- [ ] На русском, конкретно, с ссылками на файлы wiki
- [ ] Для новых проектов — `$start`, не "Прочитай скилы X+Y+Z"
- [ ] Перед `/release-*` всегда упомянуть `$release-ready` ПЕРВЫМ
- [ ] Если непонятно — ОДИН вопрос
- [ ] НЕ ссылайся на несуществующие skills (правильные имена: `release-vk`, `release-yandex`)
## Recently installed (auto-managed)

> Auto-updated by `update-advisor-catalog.mjs` on 2026-05-15.
> Skills installed via `$find-skill` marketplace flow или manually.

| Skill | Description |
|---|---|
| $appmetrica-integration | Integrate Yandex AppMetrica analytics SDK в Android wrapper (TWA/Capacitor/Cordova/Native). Auto-detects wrapper type, adds mobmetricalib dependency + manifest meta-data + activation code + JS bridge для WebView. Validates через check-appmetrica.mjs. Used during RuStore release prep. |
| $mvp-to-yandex | Autonomous end-to-end workflow для MVP → Yandex Games submission-ready state. One command, не stop'ит до GREEN. Analyzes MVP, expands к 7-day retention (genre-aware), integrates aggressive ad monetization (rewarded х2/boosters/hard currency, no IAP), localizes RU+EN+TR, builds production zip, generates all documents + art prompts. Uses /goal v2.1.139+. |
| $bundle-libs | Bundle external CDN libraries into game zip для Yandex Games. Scans HTML/JS for external <script src=https://...>, downloads to assets/lib/, replaces refs с local paths. Yandex Games sandbox blocks ex |
| $3d-perf | Optimize Three.js game performance — reduce draw calls below 100, instancing, geometry merging, LOD, texture compression (Draco/KTX2), memory management. Target 60fps on mobile. Triggers on: 3d perfor |
| $procedural-geo | Generate 3D geometry procedurally в code — terrain via simplex noise, low-poly clouds, voxel structures, hex grids, buildings. No asset downloads — geometry is math, keeps zip tiny (critical для Yande |
| $shader-fx | Custom GLSL/TSL shaders для Three.js — toon, rim lighting, dissolve, water, hologram, force field, fresnel glow, vertex animation. ShaderMaterial с vertex+fragment shaders. Triggers on: shader, шейдер |
| $three-setup | Three.js scene boilerplate для HTML5 games. Sets up renderer (WebGPU с WebGL2 fallback), camera, lighting rig, resize handler, animation loop. Three.js bundled LOCALLY (не CDN — Yandex sandbox complia |
| $visual-style | Apply distinctive visual style к Three.js game via post-processing + materials. 16 looks: realistic PBR, toon, low-poly, wireframe, neon, glass, pixel art, voxel, matcap, hologram, blueprint, X-ray, g |
| $art-direction | MANDATORY first phase for ANY visual work (3D, pixel, vector, UI). Defines a concrete per-game art-direction spec BEFORE generating pixels, and a self-critique loop that runs BEFORE showing the user — |
| $pixel-art | Make GOOD pixel-art sprites the first time: limited-palette ramps, readable silhouettes, animation frames (idle/walk/attack/hit), sprite-sheet layout, integer-scale crisp rendering. Code-drawn (canvas |
| $asset-generation | Coordinate REAL production assets: visuals via $prompt-compiler + $image-studio (Codex-native ImageGen first, optional direct OpenAI batch), voice/SFX via ElevenLabs, music prompt sheets via Suno |
| $audit-requirements | Check whether Yandex Games requirements changed since Forge's last audit, and if so, what to re-verify. Fetches the live release-notes + requirements page, compares against the baseline date recorded  |
| $seasonal-event | Подготовка игры к тематическому событию Яндекс Игр (бейдж «Акция» → бесплатный трафик). Проверяет календарь событий, генерирует тематическую активность в игру, готовит промоакцию для Консоли. Triggers |
| $phase-1-analyze | Фаза 1 — занести и посчитать: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 1, phase 1, занести прототип, новый прототип пришёл |
| $phase-2-design | Фаза 2 — дизайн от таргетов: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 2, phase 2, дизайн фаза, спроектировать игру. |
| $phase-4-visual | Фаза 4 — визуал и ассеты: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 4, phase 4, визуальная фаза, графика и арт. |
| $phase-5-tech | Фаза 5 — мобайл и SDK: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 5, phase 5, sdk фаза, техническая фаза. |
| $phase-6-listing | Фаза 6 — локализация и листинг: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 6, phase 6, листинг, описания стора. |
| $phase-7-test | Фаза 7 — тест: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 7, phase 7, тестовая фаза, протестировать перед релизом. |
| $phase-8-release | Фаза 8 — релиз: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 8, phase 8, релизная фаза, собрать и подать. |
| $phase-9-live | Фаза 9 — жизнь после релиза: проходит ВСЮ фазу конвейера одной командой, вызывая под-скилы по порядку с их гейтами и stop-points. Triggers on: фаза 9, phase 9, после релиза, поддержка игры. |
| $port | Портировать ГОТОВУЮ для Яндекса игру на другую платформу (rustore, vk, google-play, huawei, telegram, ok, vkplay, steam, web). Доктрина: Яндекс-first — порт начинается ТОЛЬКО после release-ready GREEN |
| $phase-3-construct | Фаза 2.5 — СТРОЙКА: реализовать в КОДЕ игры фичи из GDD/дефицита контента, спринт за спринтом. Это та фаза, где меняется сама игра, а не пишутся документы. Triggers on: construct, стройка, билд фичей, |
| $gacha-meta | Встроить в игру гача/рулетку/дейли-мету с крутками за рекламу: колесо фортуны, гача-баннер со скинами и расходкой, дейли-календарь, скретч-карты, сундуки, коллекции. Каталог механик + pity-система + R |
| $asset-library | Искать готовые ассеты в библиотеке пользователя (asset-library.json в корне движка) ДО генерации новых: 2D-спрайты, 3D-модели, аудио, Unity-паки, шрифты, UI-киты. Проверка лицензии, правила извлечения |
| $asset-scan | Просканировать папку с пакетами ассетов и завести их в библиотеку: инвентаризация фактами (типы файлов, размеры), уточнение в интернете что это за пак и чья лицензия, простановка тегов и применимости, |
| $multiplayer | Подключить мультиплеер к игре на своём сервере: асинхронный профиль (кланы, лента действий, лидерборды, ходы — HTTP+Postgres) или синхронный (Colyseus, комнаты, реалтайм-стейт). Проверка подписи игрок |

### Новое в движке (v4.4x) — предлагай по признакам
- «игра с длинным прогрессом / таймеры / кланы / стратегия» → 💰 **ГИБРИДНАЯ МОДЕЛЬ**
  (monetization-design): платежи = прогресс, реклама = привычка; маршрут **RuStore-first**
  ($port), ИП/юрлицо обязательны. Ads-only тут не работает — не предлагай его по инерции.
- «социальная игра / кланы / альянсы / ДВУХЭТАЖНОЕ удержание» → 🏰 **двухэтажное удержание** (product-metrics):
  дни 1-3 одиночные, клан включается к D5-D7 конфликтом; метрика «доля вступивших в клан к D7».
- «непонятно 2D или 3D» / «какой стек» → **Размерность** устанавливается в Ф1 (фактом из
  прототипа или 🔴 решением) и пишется в `wiki/_map.md`; фазы 2/4/5 читают её оттуда.
- «нужен арт / где взять ассеты» → `node scripts/asset-find.mjs "<запрос>" --use <2d|3d>`
  (поиск по библиотеке без загрузки в контекст), завести новые паки — `$asset-scan <папка>`.
- «перед обновлением движка» → `node scripts/backup-data.mjs` (снимок пользовательских данных;
  они живут в `../forge-data`, обновлением не трогаются).
- «мультиплеер / кланы / общий мир» → `$multiplayer` (профиль async), развёртывание —
  агент `backend-builder`.
- «не влезаем в лимит / надо резать игру под N КБ (мс, объектов)» → проверь 📏 в ядре: есть ли
  у порога ссылка на требование платформы. Нет — это гипотеза, предлагай пересмотр 🔴-блоком,
  а не режь игру под выдуманный лимит.
- «игроки не понимают игру / туториал для галочки / D1 низкий» → `$game-tutorial`: ведущий
  туториал с подсветкой-маской, одно действие за раз, скрипт данными, контекстные подсказки.
- «мало кликают / низкий CTR / игру не открывают» → `$store-creatives`: креатив как реклама
  (жанр за секунду, эмоция, читаемость в 100px), гипотеза на каждый вариант, штатный A/B-тест
  иконок в Консоли Яндекса, чтение ctr_icon/ctr_cover/conversion_to_play в Ф9.
- «игра сделана по старым правилам / что в ней устарело / с чего начать ретрофит» →
  `node <движок>/scripts/gap-audit.mjs <игра>`: разрывы с приоритетом и оценкой времени.
- «мету не видно / всё на одном экране / вкладки / прогресс не чувствуется / туториалу нечего
  показывать» → `$screen-flow`: цикл штаб→карта→бой→итог→штаб, точки входа вместо вкладок.
- «выглядит как меню / не как игра / не пойму что не так с экранами» → сними и оцени сам:
  `screens-shoot.mjs` + самооценка баллами (ui-review §самооценка). Работает лучше описаний.
- «сам не знаю чего хочу / опиши мне идею / стоит ли делать» → `$grilling`: интервью раундами
  по дереву решений, каждый вопрос с рекомендованным ответом, до общего понимания.
- «а нет ли готового скила / писать ли свой» → `$find-skills`: сперва каталог (npx skills find),
  фильтр по установкам 1000+ и официальному источнику. Своё пишем только под нашу специфику.
- «скучно / неинтересно / оптимальный ход очевиден / игра не цепляет» → `$gameplay-balance`:
  измерить exploratory_ratio (умная политика против тупой). mono_dominant или tied = дефект
  дизайна, числами не лечится. Три попытки исчерпаны → Failure Report, а не полировка.
- «пиксель-арт / спрайты / анимация персонажа / тайлсет / 8 направлений» →
  `$pixel-art-pipeline`: 🔴 выбор источника (PixelLab MCP умеет анимации и направления,
  своя генерация — нет), затем производство по общим правилам размеров и палитры.
| $image-studio | Generate and edit real game/store images through Codex-native ImageGen first, with optional direct OpenAI GPT Image 2 batch fallback; preserves prompt packs, provenance, references and art-director re |
| $prompt-compiler | Compile reproducible image/promo prompts from the game's brief, style bible, target frame and asset constraints into validated JSON prompt packs for Codex ImageGen or OpenAI GPT Image 2. Triggers on:  |
| $studio | Phase-aware AI Studio orchestrator: delegates bounded work to Forge agents, keeps phase gates intact, merges evidence, code, art and QA without skipping the 9-phase pipeline. Triggers on: studio, кома |
| $visual-qa | Visual QA for games/apps: capture real mobile/desktop states, inspect clipping, hierarchy, readability, style consistency and target-frame distance; can use Codex Computer Use when available, with scr |
| $forge-diagnostics | Record a machine-readable incident when Forge itself behaves incorrectly: malformed phase or STOP output, adapter mismatch, hook/runtime failure, wrong capability mapping, validator contradiction, or  |
| $modularize-existing-project | Safely decompose an existing monolithic web game/app before feature work. Use when an HTML/JS/CSS entrypoint is over 32 KB, over 800 lines, repeatedly exhausts model context, or a targeted edit risks  |
| $godot-engine | Создаёт и проверяет native Godot 4 scaffold в Project Forge: project.godot, entry scene, GDScript/C#, headless import/build/startup и serialization contract. Только когда forge.engine.json выбирает go |
| $forge-metrics | Collect truthful Project Forge delivery metrics per release and across a portfolio: time-to-release, AI cost, repair cycles, pre-release defects, moderation pass rate and workflow automation. Triggers |
