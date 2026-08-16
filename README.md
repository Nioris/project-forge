# Project Forge v4.68.1

Multi-platform project bootstrapper с универсальным terminal runtime для Claude Code, OpenAI Codex и GigaChat API; GigaCode CLI остаётся optional/dormant bridge. Одна команда собирает игру или приложение под Yandex Games, VK Mini Apps, Telegram Mini App, Одноклассники, MAX мессенджер, RuStore и свой HTTPS-хостинг.

## Что внутри

- **9 платформ** — yandex, vk, telegram, ok, max, rustore, web, steam, vkplay
- **34 валидатора** — каждая платформа имеет свой pre-submit gate, блокирующий релиз при критических ошибках
- **3 runtime-test'а** — headless puppeteer probes для yandex/telegram/ok (ad gestures, ready/expand timing, FAPI API_callback contract)
- **4 main entry workflows** — `game`, `app`, `do`, `continue` (Claude: `/game`; Codex: `$game`). 141 canonical skills + 3 generated Codex router adapters work behind the scenes.
- **21 canonical subagents** — роли хранятся в `.claude/agents/`, а native Codex TOML генерируется в `.codex/agents/`.
- **Единые lifecycle hooks** — Claude hooks остаются в `.claude/hooks/`, Codex получает native adapter в `.codex/hooks.json` + `.codex/hooks/`.
- **Agent Teams поддержка** — `/release all` может работать параллельно через experimental flag


## 🚀 Quick start (v4.68.1)

**Один workflow, несколько terminal hosts:** Claude Code использует `/skill`, Codex — `$skill`; GigaChat/generic host читает `FORGE.md` и канонический `.claude/skills/<skill>/SKILL.md`. Claude и Codex могут запускаться как через подписочную авторизацию, так и через отдельные API-профили.

```
/do         # universal: reads context, picks the skill, EXECUTES it, keeps working (no prompt handoff)
/game       # для игр — auto-detects: new project / analyze / continue / UI redesign / release
/app        # для приложений — то же
/continue   # resume saved session
```

You don't need to remember 80 commands. Just say what you want в нормальной речи:

```
/do переделай интерфейс под игру      # → art-direction spec → ui-pipeline → applies it, self-critique
/do добавь boss wave каждые 5 уровней  # → game-design, implemented on the files
/do сделай 3д сцену комнаты            # → art-direction → three-setup composed scene (not bare walls)
/game new tower defense game with mobile support
/app habit tracker for runners
/game redesign UI         # на existing project
/app deploy to production
/continue                  # resume где остановился
```

Each command **auto-detects intent** from project state + your description. Internally invokes the right sub-skill. No menu choices, no decision trees — AI figures out next step.

Codex equivalents: `$do`, `$game`, `$app`, `$continue`. Для конфликтующих имён помни: Forge `$status` / `$plan` / `$review`, а Codex `/status` / `/plan` / `/review` относятся к самому клиенту Codex. Dashboard умеет переключать отображение между Claude и Codex.

## Единая база Forge для Claude Code, Codex и generic agents

Forge не раздваивается по AI-клиентам. Каноническая логика остаётся в существующем Claude-слое, а Codex-слой генерируется поверх неё:

- `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `CLAUDE.md` — канонические Forge/Claude sources;
- `.agents/skills/` — сгенерированное зеркало skills для native Codex discovery;
- `.codex/agents/` — сгенерированные custom subagents из `.claude/agents/`;
- `.codex/hooks.json` + `.codex/hooks/` — native Codex lifecycle adapter;
- `AGENTS.md` / `AGENTS.project.md` — короткие Codex-инструкции для engine/sibling, генерируемая из текущей Forge версии и hash `CLAUDE.md`;
- `.codex/config.toml` — project-scoped Codex settings и локальный Forge MCP;
- `FORGE.md` — agent-neutral runtime contract, который синхронизируется в каждый sibling project;
- `.gitverse/pr_rules/forge.md` — документированные project rules для GigaCode-агента на GitVerse;
- `adapters/agents.json` + `scripts/forge-agent.mjs` — registry/launcher для terminal agents.

После изменения canonical skills/agents/instructions выполни:

```bash
node scripts/generate-agents-md.mjs
node scripts/sync-codex-adapter.mjs
node scripts/sync-dashboard-meta.mjs
node scripts/check-codex-compat.mjs
node scripts/check-dashboard-meta.mjs
```

`setup.*` и `upgrade.*` пересобирают Codex adapter и metadata dashboard автоматически. Корневой `sync.bat` / `node scripts/sync.mjs` — единственный canonical sibling sync; `.forge-managed.json` позволяет удалять только старые Forge-owned файлы, не затрагивая пользовательские skills.

### Запуск

```bash
# Claude Code
claude
# затем: /game, /do, /release-yandex ...

# Codex
codex
# затем: $game, $do, $release-yandex ...

# Claude через Anthropic API
node scripts/forge-agent.mjs launch claude --profile api --full --project ../my-game

# Codex через OpenAI API (отдельный auth-профиль, не ломает ChatGPT login)
node scripts/forge-agent.mjs launch codex --profile api --full --project ../my-game

# GigaChat terminal agent через официальный GigaChat API
node scripts/forge-agent.mjs launch gigachat --profile api --full --project ../my-game

# GigaCode CLI — optional/dormant bridge, пока executable реально недоступен
node scripts/forge-agent.mjs doctor gigacode
```

### Централизованные API-ключи

Ключи лежат вне проектов:

```text
<workspace>/forge-data/secrets/anthropic.key
<workspace>/forge-data/secrets/openai.key
<workspace>/forge-data/secrets/gigachat.key
```

Проверка без показа значений:

```bash
node scripts/forge-secrets.mjs status
```

Claude API использует `apiKeyHelper`, поэтому ключ не передаётся в командной строке и удаляется из окружения запускаемых tools. Codex API получает отдельный `CODEX_HOME` и один раз логинится через `codex login --with-api-key` со stdin; ChatGPT-профиль остаётся отдельно. GigaChat работает через Forge-owned terminal agent и документированный function calling.

## 🧭 Status 4.67+ — одна модель фаз для всех Forge hosts

`/status` / `$status` теперь показывает **ровно 9 канонических фаз**, текущий STOP-point, AI Studio и Project Health. Mobile/SDK/localization больше не выдаются как отдельные фазы, а отсутствие будущей фичи помечается `not reached`, а не FAIL. Новые проходы фаз пишут machine markers в `wiki/phases/phase-N.json`; старые проекты поддерживаются через консервативный artifact fallback. Mutable progress не хранится в project `CLAUDE.md`.

## 🎛️ AI Studio 4.67 — AI внутри фаз, а не вместо фаз

В 4.67 Forge остаётся **9-фазовым**. Новые Codex/OpenAI-возможности встроены в существующий путь: Ф1 фиксирует baseline, Ф2 готовит briefs/prompt packs, Ф3 использует phase-aware agent orchestration для независимых coding lanes, Ф4 ведёт полный visual production loop, Ф6 — store creatives, Ф7 — visual QA, Ф9 — measured creative A/B. Поэтому отдельной «Ф10 AI» нет.

Новые workflows доступны в обоих синтаксисах: Claude `/studio`, `/prompt-compiler`, `/image-studio`, `/visual-qa`; Codex — `$studio`, `$prompt-compiler`, `$image-studio`, `$visual-qa`. `/studio` не обходит STOP-points текущей фазы: он только раздаёт параллельные независимые workstreams и собирает их обратно.

Для изображений primary path — **native image capability текущего host**, когда она доступна. Для unattended/batch есть прямой OpenAI helper `scripts/openai-image.mjs` с `forge-data/secrets/openai.key` / `OPENAI_API_KEY` (legacy `.openai_key` поддерживается), а в 4.68 добавлен direct GigaChat backend `scripts/gigachat-image.mjs`; для 3D — `scripts/gigachat-3d.mjs`. OpenRouter больше не является primary image provider Forge. Каждый production asset проходит цепочку `prompt pack → candidates → Art Director → approved → integration → Visual QA → provenance`.

Новый проект автоматически получает `.forge-ai.json`, `assets/style/STYLE-BIBLE.md`, `assets/prompts/`, `assets/generated/` и `wiki/ai/`. Секреты в `.forge-ai.json` не хранятся. Подробно: [`docs/AI-STUDIO-4.67.0.md`](docs/AI-STUDIO-4.67.0.md).

Codex mirror теперь дополнительно **сжимает только descriptions skills**, не содержание `SKILL.md`: это оставляет больше discovery-context при большом каталоге, не урезая канонические Claude skills.


## 🌐 Universal Agent Runtime 4.68

Forge 4.68 отделяет **workflow semantics** от конкретного AI-клиента. `FORGE.md` задаёт девять фаз, источники состояния, workspace discipline, generic skill execution и Definition of Done. Claude/Codex сохраняют свои native adapters, а остальные terminal agents могут читать тот же канонический `SKILL.md` без копии каталога под каждого host.

`node scripts/forge-agent.mjs doctor` показывает доступные hosts. Claude и Codex остаются stable adapters. GigaCode помечен `experimental`: публичные материалы GitVerse подтверждают терминальный агент, но Forge не подставляет непроверенные binary names/permission flags. Если auto-detect не находит executable, укажи `FORGE_GIGACODE_CLI`.

Для GitVerse отдельно синхронизируется `.gitverse/pr_rules/forge.md`, поэтому GigaCode review/agent получает Forge-инварианты на документированном GitVerse surface.

AI Studio также получил direct **GigaChat API** backend: `scripts/gigachat-image.mjs` использует встроенную `text2image`, а `scripts/gigachat-3d.mjs` — `text2model3d` и сохраняет FBX. Оба helper'а поддерживают `--dry-run`, не логируют ключ и не отключают TLS-проверку. Секреты: `forge-data/secrets/gigachat.key` / `GIGACHAT_AUTH_KEY` (legacy `.gigachat_key` поддерживается) или короткоживущий `GIGACHAT_ACCESS_TOKEN`.

```bash
node scripts/forge-agent.mjs prompt gigacode --skill phase-2-design --args .
node scripts/gigachat-image.mjs --prompt "game icon, no text" --output assets/generated/candidates/test/a.jpg --dry-run
node scripts/gigachat-3d.mjs --prompt "low-poly oil pump prop" --output assets/generated/candidates/test/pump.fbx --dry-run
```

GigaCode support в 4.68 — тестовый adapter, а не заявление о полной feature parity с Codex/Claude. Реальный acceptance test — прогнать одну и ту же фазу на копии проекта и сравнить соблюдение phase gates, edits и verifier evidence.

## Системные требования

- Node.js 18+
- Claude Code 2.x для Claude workflow (существующий `.claude/*` слой сохранён полностью).
- OpenAI Codex CLI/IDE для Codex workflow (`.codex/*`, `.agents/skills`, `AGENTS.md`).
- GigaCode CLI — опционально для experimental universal-agent adapter; Forge не требует его для Claude/Codex.
- GigaChat API credentials — опционально только для direct GigaChat image/3D helpers.
- Opus 4.6+ (для Agent Teams — рекомендуется 4.7)
- git, unzip, tmux опционально (для split-pane режима Agent Teams)

## Установка

### Первый раз

```bash
unzip project-forge-v4.68.1.zip -d ~/projects/forge
cd ~/projects/forge
./setup.sh         # Linux/macOS
# или Windows:
.\setup.bat        # ← рекомендуемый (no MotW issue)
.\setup.ps1        # альтернатива (требует ExecutionPolicy)
```

Setup проверит Node.js, покажет счётчики (платформ, скиллов, сабагентов, хуков) и платформенную матрицу. Делается один раз на папку forge — дальше оттуда работаешь с любым количеством проектов.

### Upgrade на новую версию (Windows)

**Основной путь для парка проектов — внешний `update-forge.bat`.** Один раз скопируй `extras/update-forge.bat` рядом с папкой `project-forge/`. Для следующего релиза достаточно скачать `project-forge-vX.Y.Z*.zip` рядом с updater или оставить в Downloads и запустить BAT. Он выбирает максимальную semver-версию, показывает current/package и число sibling projects, делает backup, upgrade, managed sync и hard-gates. Downgrade требует отдельного подтверждения.

```text
F:\ProjectForgeUniversal\update-forge.bat
F:\ProjectForgeUniversal\project-forge\
F:\ProjectForgeUniversal\my-game\
```

**Ручной fallback — через `.bat` wrapper:**

```powershell
# 1. Распакуй zip через проводник: ПКМ → Извлечь всё → путь project-forge → Заменить все

# 2. Двойной клик на upgrade.bat (или из консоли):
cd .\project-forge
.\upgrade.bat

# 3. Sync к sibling projects:
.\sync.bat
```

`upgrade.bat` запускает `upgrade.ps1` через `-ExecutionPolicy Bypass` — `.bat` файлы не блокируются Mark-of-the-Web после ZIP extract (unlike `.ps1`). Это **постоянный** fix chicken-egg проблемы: до v4.10.33 пользователь не мог запустить `upgrade.ps1` пока сам upgrade.ps1 был blocked.

**Альтернативно** (если хочешь напрямую через PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File .\upgrade.ps1
# или после set policy:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\upgrade.ps1
```

`upgrade.ps1`/`upgrade.bat` знает hit-list файлов removed между версиями — чистит orphans которые copy-with-replace оставляет висеть. **Idempotent** (безопасно запускать многократно).

**Не нужно** удалять старую папку. **Не нужно** помнить ExecutionPolicy. **Не нужно** искать что я удалил между версиями.

### Upgrade на новую версию (Linux/macOS)

```bash
unzip -o project-forge-v4.68.1.zip -d ~/projects/forge
cd ~/projects/forge
./upgrade.sh   # cleans orphans, runs catalog updates
node scripts/sync.mjs
```

## Первый запуск

```bash
cd ~/projects/forge
claude   # Claude Code, обычный approval mode
codex    # OpenAI Codex, обычный project sandbox

# Если нужен hands-off локальный режим без постоянных вопросов:
cf       # claude --dangerously-skip-permissions
cx       # codex -a never -s danger-full-access --dangerously-bypass-hook-trust
```

`cf` и `cx` лежат в `scripts/` как короткие aliases; на Windows это `cf.bat` / `cx.bat`. Dashboard показывает на каждой карточке **Claude Full**, **Codex Full** и экспериментальную **GigaCode** и копирует launch-команду с правильной папкой проекта. `Codex Full` явно задаёт `-a never -s danger-full-access`; обычный `codex` сохраняет более безопасные project defaults.

В Claude Code сохраняется существующий status line и SessionStart memory flow. В Codex project hooks подхватывают тот же Forge context, safety gates и stop-time проверки через native `.codex/hooks.json`.

## Стандартные workflow (v4.68.1)

Вместо "каждый раз изобретаем" — чётко определённые orchestrator'ы для типичных сценариев:

### "Расширить уже работающую игру" → `/deepen-game`

Для игры которая технически работает но feels thin — 5 минут контента, нет причины вернуться. 5 фаз:
1. Research конкурентов в том же жанре (обязательно)
2. Gap analysis — что у нас vs что у них (в `wiki/plan/`)
3. Execution plan с приоритетами (user approval)
4. Iterative execution с mandatory stops между приоритетами
5. Final report с before/after метриками

Разрешено звать: `game-design`, `level-design`, `visual-upgrade`, `mobile-game-ui`, `sound-design`.
Запрещено: SDK, ads, localization, release — это release-phase, не content-phase.

### "Проверь всё перед релизом" → `/release-ready`

Read-only checklist. Не строит, не грузит — только проверяет что прерыквайзиты на месте **до** `/release`. Red/yellow/green per platform.

Проверяет: WorkProgress существует, SDK wrapper интегрирован, debug код убран, i18n покрытие, console.log minimized, store listing заполнен (≥120 chars RU/EN + 3 screenshot'а), keystore для Android, pre-submit validators чисто, runtime-test проходит.

Вывод: не binary ready/not-ready, а явный список "что почини / чем скиллом" per issue.

### "Какой бэкенд выбрать" → `/choose-backend-stack`

4 вопроса через `ask_user_input_v0` → **одна из 5 канонических стеков**:
- **A:** Node + SQLite + Timeweb VPS (~750₽/мес, default)
- **B:** Node + PostgreSQL (>100 RPS или relational)
- **C:** Cloudflare Workers + D1/KV/R2 (международная, serverless)
- **D:** Docker Compose (multi-service или user предпочтение)
- **E:** Яндекс Cloud Functions (152-ФЗ + scale-to-zero)

Больше никаких "давай изобретём". Reference код для Stack A уже живёт в `.claude/skills/rustore-publish/reference/` (auth.js, sync.js, schema.sql и т.д.).

### Research-integrated improvement skills

`visual-upgrade`, `game-polish`, `game-design`, `level-design`, `monetization-design` теперь **обязательно** вызывают `/research-references` в Phase 0 перед изменениями. Никакого generic "add gradient + shadow + glow" без изучения референсов жанра.

Skip по команде: "без research" / "skip research" / или если `wiki/research/{Project}-references.md` моложе 14 дней.

### Discovery: `/find-skill` (v4.10.14+)

Forge содержит 100+ skills. Не нужно их помнить. `/find-skill {query}` ищет:

1. **Local search** — по 102 встроенным skills (ranked relevance + cyrillic-aware tokenization)
2. **Marketplace fallback** — `npx skills find` для public ecosystem (Vercel Labs Skills CLI)
3. **Quality verification** — install count, source reputation
4. **Forge adaptation** — wrapper для public skills чтобы интегрировать в Forge conventions

```
/find-skill валидация форм             # local search
/find-skill stripe integration         # → fallback к marketplace если local nothing
/find-skill ui redesign                # → strong local match /ui-pipeline
```

Routers `/game` и `/app` сами вызовут `/find-skill` если intent unclear. Можно вызвать напрямую если ищешь конкретную capability.

### Infrastructure (v4.10.16+)

- **`MANIFEST.txt`** — auto-generated список всех файлов в текущей версии. upgrade.ps1 использует для catch-all orphan cleanup.
- **`runtime-test.mjs`** — Puppeteer-based headless Chrome test. 5 scenarios (startup/lang/assets/dom/sdk). Mandatory gate в `/release-ready`. Требует `npm install puppeteer` один раз.
- **`check-store-listing.mjs`** + **`check-setup-guide.mjs`** — schema validators для Yandex release artifacts. Catches AI-invented fields, missing required fields, invalid tag/category vocabulary.
- **15 verifiers total** — check-*.mjs scripts в `scripts/`.

---

## Research-driven start (новое в v4.4)

Forge v4.4 вводит **discovery-first дисциплину** — перед тем как Claude что-то строит, он сначала изучает что уже есть. Два новых скила работают вместе:

**`/research-references`** — перед планированием Claude изучает конкурентов/аналоги через web_search и image_search. Результат падает в `wiki/research/{Project}-references.md` с:
- 3-5 реальных конкурентов с ссылками (не из памяти — из свежего web_search)
- Table-stakes фичи которые есть у всех
- Differentiation opportunities
- UI/UX ссылки из image_search (если проект визуальный)
- Anti-patterns: на что жалуются пользователи похожих продуктов

**`/find-or-make-skill`** — перед тем как придумать решение, Claude ищет подходящий скил. Порядок discovery:
1. Локальные скилы (`.claude/skills/`)
2. Локальные агенты (`.claude/agents/`)
3. Anthropic official marketplace
4. Community marketplaces (claudepluginhub, buildwithclaude, vercel-labs)
5. **Last resort:** `/write-skill` создаёт локально

Оба скила (`/research-references`, `/find-or-make-skill`) вызываются **автоматически** из `/game` и `/app` routers. Пользователь не должен помнить их явно — пишет `/game` или `/app`, всё остальное orchestrator решает.

### Пример 1: только ТЗ, проекта нет

```
User: я хочу hypercasual timing game с препятствиями, платформа Яндекс Игры
Claude: [/app router → start skill → Phase 0a: research-references]
        [web_search: top hypercasual timing games 2026 yandex]
        [image_search: hypercasual timing game UI mobile]
        ...
        📚 Research complete → wiki/research/{Project}-references.md

        TOP 3 competitors found:
        1. Helix Jump (Yandex Games) — rotation-based, 40M plays, main complaint: ads too frequent
        2. Timing Hero (Poki) — obstacle course, retention 22% D1
        3. Stack Jump (Яндекс) — color match, strong UI clarity

        TABLE-STAKES features: instant tap-to-play, restart in 1 tap, ...
        DIFFERENTIATION: ...
        UI direction suggested: minimal + bold color accents

        Подтверждаешь direction или нужно копнуть в конкретного конкурента?
User: да, идём
Claude: [Phase 0b: find-or-make-skill for needed competencies]
        [... and so on to actual planning]
```

### Пример 2: готовый проект, надо доработать

```
User: возьми input/my-game — изучи и скажи план
Claude: [/game router → analyze-game skill]
        Step 1-5: type detection + problems + architecture
        Step 6: /research-references based on detected genre
        Step 7: /find-or-make-skill for gaps
        
        Output: анализ + references + skills list + план интеграции
```

Переопределить research можно словами "skip research" или "без research" — но default всегда с research.

## Типичный workflow — одна платформа

```
/game MyGame                 # smart router: создаст / проанализирует / починит
# AI читает контекст и выбирает: new project / analyze / polish / release
/release yandex               # интеграция SDK + 11 validators + 3-ZIP matrix → Release/MyGame/yandex/
```

Если 0 blockers — заливай в Yandex Games Console.

## Мультиплатформенный workflow — два режима

Новое в v4.3. Та же игра на 4 платформы:

### Режим A: Sequential (default, безопасный)

```
/release all
```

Claude через `ask_user_input` спросит:
1. **На какие платформы?** (multi-select) — Yandex / VK / Telegram / OK / MAX / RuStore / Web
2. **Режим?** (single-select) — Sequential (default) / Agent Teams

При Sequential Claude идёт по платформам по одной с mandatory stop между ними — отчёт, ждёт "продолжи", следующая.

### Режим B: Agent Teams (параллельный, experimental)

Agent Teams — это несколько полноценных Claude Code сессий, работающих параллельно, с общим task list и peer-to-peer messaging. Один — team lead (ты), остальные — teammates. Каждый teammate читает `CLAUDE.md` + свой платформенный subagent из `.claude/agents/`.

**Как работает в Forge:**

1. Выбираешь Agent Teams режим
2. Claude создаёт команду, спавнит по teammate на платформу
3. Каждый teammate работает в своём `WorkProgress/{Project}-{platform}/` — не пересекаются
4. `Shift+↓` / `Shift+↑` — переключение между teammate'ами (in-process режим)
5. `Ctrl+T` — общий task list
6. По завершении **обязательно**: "Ask all teammates to shut down, then clean up the team"

**Стоимость:** ×3-5 токенов от sequential, но реальное время меньше в разы.

**Когда использовать:** 3+ платформы, Opus 4.6+, permissions не зажаты.

**Когда НЕ использовать:** 1-2 платформы (overhead > выгода), единичный сложный баг, не включай `delegate mode` (ломает permissions у teammate'ов — задокументировано в официальной доке).

**Известные ограничения** (из docs.claude.com/agent-teams):
- `/resume` и `/rewind` не восстанавливают in-process teammate'ов
- Task status иногда лагает — проверяй вручную если задача "застряла"
- Shutdown медленный — teammates завершают текущий tool call перед выходом
- One team per session, no nested teams

## Платформенная матрица

| Платформа | Валидаторы | SDK wrapper | Runtime test | Notes |
|---|---|---|---|---|
| yandex | 11 | YaGames | ✓ (smoke + ad-gesture probe) | production |
| vk | 3 | VK Bridge | — | VK Pay validator верифицирован на VKCOM/vk-mini-apps-api |
| telegram | 5 | WebApp wrapper | ✓ (ready/expand + CloudStorage probe) | CloudStorage key regex `^[A-Za-z0-9_-]{1,128}$` |
| ok | 1 | FAPI | ✓ (sig + API_callback + rewarded preload) | FAPI.UI.* → global window.API_callback |
| max | 5 | MaxSDK wrapper | — | `window.WebApp` конфликт с Telegram — разносятся по WorkProgress |
| rustore | 0 | Capacitor | — | Android APK/AAB через Capacitor wrap |
| web | 0 | — | — | Docker + nginx + HTTPS |

## Plugin install (deferred — not active)

v4.3 добавил `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` для возможной установки Forge как Claude Code plugin. **Этот путь отложен и не используется** — он требует публичного GitHub remote, которого нет, и end-to-end цикл никогда не тестировался.

**Единственный поддерживаемый путь установки — unzip + `upgrade.bat`** (см. выше). Он стабилен, idempotent, и не конфликтует ни с чем. Plugin-манифесты оставлены в репозитории на будущее (структурно соответствуют docs.claude.com/plugins-reference), но не активируй их, пока путь не протестирован на реальном remote — иначе рискуешь двойной загрузкой хуков.

```bash
# НЕ используется сейчас — оставлено для будущего:
# /plugin marketplace add https://github.com/your-org/project-forge
# /plugin install project-forge@project-forge-marketplace
```

## Архитектура: template + соседние проекты

Forge — **engine/template в корне, проекты — его соседи**. Один Forge обслуживает много проектов, а каждый sibling получает Claude + Codex runtime через один managed sync.

```text
F:\ProjectForgeUniversal\
├── update-forge.bat              ← внешний one-click updater
├── project-forge\               ← engine/template
│   ├── dashboard.html
│   ├── new-project.bat
│   ├── sync.bat                  ← canonical sibling sync
│   ├── .claude\                 ← canonical Claude sources
│   ├── .agents\ + .codex\      ← Codex adapter
│   └── scripts\
├── my-game\                     ← sibling project
└── another-app\                 ← sibling project
```

### Создание проекта

```powershell
cd F:\ProjectForgeUniversal\project-forge
.\new-project.bat my-game --type game
.\new-project.bat my-app  --type app

# Backward-compatible wrappers:
.\new-game.bat my-game
.\new-app.bat my-app
```

После создания:

```powershell
cd ..\my-game
claude   # /phase-1-analyze .  или /game
# либо
codex    # $phase-1-analyze .  или $game
```

### Обновление всех sibling projects

```powershell
cd F:\ProjectForgeUniversal\project-forge
.\sync.bat

# Один проект / dry-run:
node scripts\sync.mjs --game my-game
node scripts\sync.mjs --dry
```

`sync.mjs` — единственная реализация синхронизации. Старые `scripts/sync.bat` и `scripts/sync.ps1` существуют только как compatibility wrappers. Он раздаёт `.claude/*`, `.agents/*`, `.codex/*`, `AGENTS.md`, справочник и platform checker; список Forge-owned файлов фиксируется в `.forge-managed.json`. При следующем релизе Forge может убрать свои устаревшие файлы, но пользовательский custom skill, которого нет в managed manifest, не удаляется.

Dashboard генерирует версию, skill counts и Claude/Codex mappings из текущего движка; `check-drift.mjs` блокирует релиз при dashboard drift.

## Структура папок

```
~/projects/forge/
├── GameIntegration/{Project}/      ← INPUT, НЕ редактируй после копирования
├── WorkProgress/{Project}/         ← основная рабочая копия
├── WorkProgress/{Project}-yandex/  ← per-platform копии (Agent Teams / /release all)
├── WorkProgress/{Project}-vk/
├── ...
├── Release/{Project}/yandex/       ← финальные билды
├── wiki/
│   ├── _current.md                 ← активная сессия, autoinjected в каждую беседу
│   ├── plan/{Project}.md           ← структурированные задачи со статусами
│   └── changelog.md                ← история релизов
├── platforms/
│   ├── _shared/static-server.mjs   ← HTTP server для puppeteer-тестов
│   ├── yandex/ vk/ telegram/ ok/ max/ rustore/ web/
│   │   ├── validators/*.mjs        ← pre-submit gates
│   │   ├── scripts/                ← pre-submit.mjs, runtime-test.mjs, build-*.mjs
│   │   └── templates/              ← SDK wrappers, server-verify, etc
├── .claude/
│   ├── settings.json               ← Agent Teams env flag включён здесь
│   ├── skills/*/SKILL.md           ← 137 canonical Forge skills
│   ├── agents/*.md                 ← 17 canonical subagents
│   └── hooks/*.mjs                 ← автоматизация (wiki-audit, plan-check)
├── .claude-plugin/                 ← v4.3 plugin manifest (beta)
│   ├── plugin.json
│   └── marketplace.json
├── setup.sh / setup.ps1
├── CLAUDE.md                       ← главная инструкция для Claude, читается в каждой сессии
├── GUIDE.md                        ← подробный human guide со сценариями
└── dashboard.html                  ← v3-стиль визуальный гид (частично актуален для v4+)
```

**Правила:**
1. `GameIntegration/` — read-only после копирования
2. Вся работа в `WorkProgress/`
3. `Release/` не трогай вручную — пересобирай через `/release`
4. `wiki/_current.md` + `wiki/plan/` + `wiki/_map.md` — три-файл memory system, не удаляй

## Memory system

Три файла синхронизируются автоматически через hooks:

- **`wiki/_current.md`** — что в работе прямо сейчас. SessionStart hook инжектит в новую сессию.
- **`wiki/plan/<Project>.md`** — YAML-like план задач со статусами (`todo` / `in_progress` / `done` / `blocked`).
- **`wiki/_map.md`** — карта файлов проекта, обновляется через `/app` или `/game` (router routes к analyze skill).

**Hooks:**
- SessionStart → инжектит `_current.md` в контекст
- PreToolUse Write/Edit → проверяет что задача в `plan/` (иначе warning)
- PostToolUse → фиксирует изменения обратно
- Stop → финальный flush

Если wiki разъехалась с реальностью — `/gate` покажет warning через `wiki-audit.mjs`.

## Основные команды

Полный список: `ls .claude/skills/`. Часто используемые:

**Старт:**
- `/game` — для игр (smart router: new / analyze / continue / redesign / release)
- `/app` — для приложений (то же)
- `/continue` — resume saved session

**Работа:**
- `/game polish` — чистка кода, фикс ошибок (router routes к game-polish skill)
- `/fix-ui` — UI проблемы (mobile-adapt, viewport, touch targets)
- `/localize` — добавить i18n (Yandex требует 13 языков)
- `/debugcheck-enhance` — добавить debug/cheat panel

**Релиз:**
- `/release yandex` / vk / telegram / ok / max / rustore / web / steam / vkplay — pipeline одной платформы
- `/release all` — все сразу (sequential или Agent Teams)

**Gate:**
- `/gate yandex` — прогнать валидаторы без изменений
- Или из терминала: `node platforms/yandex/scripts/pre-submit.mjs WorkProgress/MyGame/ --verbose`

**Management:**
- `/plan` — обновить `wiki/plan/<Project>.md`
- `/status` — canonical 9-phase status: CURRENT/STOP-point + AI Studio + Project Health; machine markers + artifacts, wiki supplemental
- `/continue` — вернуться к последнему месту (читает wiki/_current.md)
- `/handoff` — подготовить сессию для передачи

## Параллельные проекты через git worktrees

Две игры одновременно:

```bash
cd ~/projects/forge
git worktree add ../forge-gameA feature-gameA
git worktree add ../forge-gameB feature-gameB

# Терминал 1:
cd ../forge-gameA && claude

# Терминал 2:
cd ../forge-gameB && claude
```

Каждый worktree — своя Claude Code сессия со своим `wiki/`. Не пересекаются.

## Подводные камни

**Telegram показывает спиннер бесконечно** → не вызван `Telegram.WebApp.ready()`. Validator `ready-expand` это ловит.

**Yandex игра не показывает рекламу** → нужен user gesture перед `showFullscreenAdv()`. Runtime-test ad-gesture probe ловит.

**VK Pay молча падает** → `amount` положен на верхний уровень вместо `params: { amount: N }`. Validator `vk-pay` ловит (ещё валидирует action enum).

**OK платежи проходят но игра не узнаёт результат** → не реализован `window.API_callback(method, result, data)` global. Runtime-test Probe C ловит. FAPI.UI.* методы доставляют результаты через этот глобал, а не через локальные callbacks.

**MAX + Telegram в одном проекте ломают друг друга** → оба используют `window.WebApp`. Разноси по `WorkProgress/{Project}-telegram/` и `WorkProgress/{Project}-max/` (Agent Teams + `/release all` делают это автоматически).

**MAX и Telegram HMAC по-разному** → Telegram: `secret = HMAC_SHA256(bot_token, "WebAppData")`. MAX: `secret = HMAC_SHA256("WebAppData", bot_token)`. Ключ и сообщение поменяны местами — подписи не совместимы. Шаблоны `platforms/{telegram,max}/templates/*verify*.mjs` корректно реализуют каждый.

**Agent Team залип на permissions** → teammate ждёт подтверждение tool call, некому ответить. Либо расширь allowlist в settings.json, либо переключись на Sequential.

**`/plugin install` не работает** → это beta. Используй основной путь (unzip+setup.sh).

## CI

`.github/workflows/release.yml` настроен:
- На push в main → matrix job по всем `WorkProgress/{Project}-{platform}/` которые есть в репо
- Запускает pre-submit.mjs, если есть runtime-test.mjs — и его
- Артефакты попадают в Actions artifacts
- Использует bash-based `detect_tests` step вместо `hashFiles()` (более предсказуемо)

## Версия, changelog

**v4.7.0:** Steam + VK Play platforms. Forge теперь поддерживает 9 платформ (было 7). **Steam** — единственная с native wrapper (Electron + steamworks.js → SteamPipe upload), требует Steam Direct fee $100. **VK Play** (vkplay.ru, **не** VK Mini Apps) — iframe + signed auth + payment webhook. Добавлены 5+5 validators, 5+3 templates, 6 skills (`release-steam`, `release-vkplay`, `fill-steam`, `fill-vkplay`, `steam-sdk-integration`, `vkplay-sdk-integration`). Updated: release-all, release-ready, gate, advisor. Dashboard: 9 platforms with badges. Workflow: matrix expanded.

**v4.6.4:** Advisor skill каталог обновлён до v4.6. Аудит advisor против фактического `.claude/skills/`: было известно 56 skills, в Forge — 73, **отсутствовало 19** (включая critical: research-references, find-or-make-skill, deepen-game, release-ready, choose-backend-stack, все 7 release-*). 2 phantom refs на несуществующие skills. Полностью переписан с orchestrator-first подходом. Coverage: 73/73 (100%).

**v4.6.3:** Dashboard accuracy + button prompts rewrite. (1) `/start` skill теперь имеет Phase 0a (research) + Phase 0b (find-or-make-skill). (2) Dashboard "Когда что использовать" обновлён с v4.0-эры до v4.6 workflow. (3) Удалён leak personal username `aakra` → `$env:LOCALAPPDATA`. (4) Добавлены 3 пропавших skill'а в dashboard: /fill-vk, /vk-sdk-integration, /gate. (5) Все 5 prompt-генераторов кнопок переписаны с enumerated skills на orchestrator-вызовы. Удалены broken refs на несуществующие `security` и `performance`.

**v4.6.2:** UTF-8 BOM fix для Windows PowerShell 5.1. Я в v4.5.1 написал в CLAUDE.md правило "ps1 с non-ASCII требует UTF-8 BOM на PS 5.1" — и сам же его не применил к setup.ps1 / sync.ps1 / forge.ps1 / sync-to-obsidian.ps1. Пользователь под Win PS 5.1 получил cascade parser errors при `.\setup.ps1`. Добавлен BOM ко всем 4 файлам с em-dash и box-drawing chars.

**v4.6.1:** Path-flexibility fix. Template detection в 5 скриптах (sync.bat, sync.ps1, open-all.ps1, open-all-tmux.sh, sync-to-obsidian.ps1) переведена с hardcoded имени `Project-forge` на path equality — Forge работает из любого пути и под любым именем папки. Удалён посторонний `scripts/add_metanotes.mjs` с hardcoded путём. README обновлён с disclaimer про path-flexibility.

**v4.6:** MEDIUM-priority audit fixes + honest deferrals. 3 из 5 MEDIUM-ов закрыты: (1) 13 reference files в rustore-publish получили `@verified-against` + date markers, (2) plan schema validation — `validateTask()` в parse-plan.mjs + finding #8 в wiki-audit.mjs, (3) `scripts/check-claude-md-size.mjs` предупреждает при приближении к 30KB лимиту. 2 оставшихся MEDIUM честно deferred — v4.7 candidates.

**v4.5.2:** HIGH-priority audit fixes. (1) `forge.sh new` / `forge.ps1 new` теперь копируют `_current.md` из template в новые sibling проекты. (2) Git repo guard в forge скриптах — friendly error если Forge не git repo. (3) Sync по умолчанию теперь SAFE MERGE (preserves custom skills), `--strict` для полного replace.

**v4.5.1:** Cyrillic-safety + cross-ref audit. `sync.bat` получил `chcp 65001` + CRLF line endings. `/choose-backend-stack` broken ref на /deploy-timeweb заменён на /deploy. GUIDE.md и dashboard.html дополнены секциями про v4.5 orchestrator'ы. Закодированы правила "Windows encoding discipline" в CLAUDE.md для будущих sessions.

**v4.5:** Standardization pass — 3 новых orchestrator'а + research integration. `/deepen-game` (расширение готовой игры через research → gap analysis → planned execution). `/release-ready` (pre-release checklist — red/yellow/green per platform). `/choose-backend-stack` (4 вопроса → 1 из 5 канонических стеков). 5 improvement skills (visual-upgrade, game-polish, game-design, level-design, monetization-design) получили Phase 0: research-references. Закрывает gap'ы "каждый раз по-разному делаем улучшения / релиз / backend выбор". Skills: 71 → 74.

**v4.4.2:** Prompt-cache optimization. Аудит всех 7 хуков нашёл один leak в `plan-check.mjs` — уникальный warning на каждом out-of-scope edit ломал cache от того turn'а вперёд. Warning сделан детерминированным. Добавлено правило "Hook authoring: cache-stable additionalContext" в CLAUDE.md для будущих hook authors.

**v4.4.1:** `rustore-publish` skill обновлён — 3 устаревших файла заменены на свежие версии (PAYMENTS.md +§6a cloud-sync starter bonus, reference/README.md, reference/security-log.js с 152-ФЗ HMAC IP), добавлены 7 отсутствовавших файлов (AUTH-SYNC.md 42k + reference/auth.js/sync.js/ip-hash.js/client-auth.js/client-sync.js/RuStoreReviewPlugin.java). Новый skill `anon-auth-sync` вытаскивает паттерн анонимной auth + E2E cloud sync как standalone.

**v4.4:** Research-driven start. Два новых скила — `/research-references` (изучает конкурентов/UI/UX через web_search + image_search) и `/find-or-make-skill` (discovery chain local → Anthropic → community → create). Интегрированы как Phase 0 в `/new-project`, `/analyze-project`, `/analyze-game`. Новая папка `wiki/research/`. Discovery-first дисциплина.

**v4.3.2:** Sync & multi-project infrastructure fix. `sync.bat` теперь копирует `platforms/` в проекты-соседи (без этого все `/release` команды падали с Cannot find module). Новый `sync.ps1` с `-DryRun`/`-Verbose`/`-Project` флагами. `forge.sh new` и `forge.ps1 new` симлинкуют `platforms/` автоматически при создании нового проекта.

**v4.3.1:** Documentation alignment pass — README переписан под v4.3, в GUIDE добавлены секции VK/Telegram/OK/MAX/`release all`, dashboard.html получил v3-era banner. Код v4.3 не менялся.

**v4.3:** Agent Teams для `/release all` (parallel mode), 5 platform subagents, frontend-design skill refs в release skills, plugin-install manifests (beta). Полный changelog — в `CLAUDE.md`.

**v4.2.1:** API verification pass (VK Pay, OK FAPI, Telegram CloudStorage, MAX HMAC) + self-audit (8 bugs найдено, 5 исправлено, 2 удалены как dead code, 1 задокументирован как debt).

**v4.1:** MAX messenger поддержка + runtime tests + CI workflow.

**v4.0:** Base multi-platform архитектура (platforms/, _shared/, orchestrator).

**v3 (legacy):** Yandex + RuStore + Web. Dashboard.html соответствует этому поколению.

## Документация

- **`CLAUDE.md`** — главная инструкция для Claude в каждой сессии (читается автоматически)
- **`GUIDE.md`** — полный human guide со сценариями (A: игра с нуля, Б: приложение с нуля, В: доработка, и т.д.)
- **`platforms/README.md`** — архитектура адаптеров
- **`.claude/skills/*/SKILL.md`** — документация каждой slash-команды
- **`dashboard.html`** — визуальный v3-era гид, частично актуален для v4+
