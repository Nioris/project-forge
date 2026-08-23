# Project Forge

**Терминальный multi-agent runtime для разработки, тестирования и выпуска игр и приложений.**

[English version](README.md)

Project Forge даёт нескольким AI-агентам один общий процесс: одинаковые фазы, состояние проекта, skills, STOP-points и проверки.

**Текущая публичная версия:** `v4.68.41`

| Агент | Авторизация | Статус |
|---|---|---|
| Claude Code | аккаунт/подписка · Anthropic API | stable |
| OpenAI Codex | ChatGPT · OpenAI API | stable |
| GigaChat | API через терминальный агент Forge | supported |
| GigaCode CLI | локальный CLI adapter | experimental / dormant до появления executable |
| Gemini CLI · Qwen Code · Kimi Code | нативный аккаунт или план/API провайдера | experimental, один агент на весь проект |
| DeepSeek · GLM · MiniMax M3 | API провайдера через OpenCode | experimental, один агент на весь проект |
| OpenRouter через OpenCode | один OpenRouter API key · ZDR по умолчанию | experimental, одна модель на весь проект |

> Forge — terminal-first. IDE не обязательна.

## Что даёт Forge

Forge — не отдельный чат. Это runtime вокруг терминальных AI-агентов.

Внутри:

- **9 канонических фаз** от анализа до Live;
- **142 канонических skill** и сгенерированный Codex discovery layer;
- **21 специализированный subagent**;
- единые phase markers, STOP-points и состояние проекта для всех поддерживаемых host'ов;
- штатные режимы Claude Code и Codex;
- отдельные API-профили Anthropic и OpenAI;
- собственный терминальный GigaChat-agent;
- профили «одна модель на весь проект» для Gemini, Qwen, Kimi K3, DeepSeek, GLM, MiniMax M3 и OpenRouter;
- AI Studio для prompt compilation, изображений, 3D, Art Director и Visual QA;
- интеграции и release-проверки платформ;
- Dashboard, синхронизация проектов, обновление и drift-check управляемых файлов.

## Платформы релиза

| Канонический ID | Платформа |
|---|---|
| `yandex` | Yandex Games |
| `vk` | VK Mini Apps |
| `telegram` | Telegram Mini App |
| `ok` | OK.ru |
| `max` | MAX messenger |
| `rustore` | RuStore |
| `web` | собственный HTTPS/PWA-хостинг |
| `steam` | Steam |
| `vkplay` | VK Play |

## 9 фаз

```text
1  Analyze
2  Design
3  Construct
4  Visual
5  Tech
6  Listing
7  Test
8  Release
9  Live
```

SDK, локализация, AI-генерация и другие возможности встроены в эти фазы и не создают отдельные псевдофазы.

## Быстрый старт

Нужно:

- Node.js 18+
- Git
- хотя бы один поддерживаемый terminal host

Клонирование:

```bash
git clone https://github.com/Nioris/project-forge.git
cd project-forge
```

Windows:

```powershell
.\setup.bat
```

Linux/macOS:

```bash
./setup.sh
```

После установки запускается нужный terminal host.

## Рекомендуемый старт: Dashboard

Для новой игры или приложения лучше всего начинать с [`dashboard.html`](dashboard.html). Откройте его локально после установки: Dashboard служит точкой входа для создания или выбора проекта и сразу показывает, что делать дальше.

1. Откройте `dashboard.html` в браузере.
2. Выберите **RU** или **EN** в Dashboard.
3. Создайте новую игру/приложение или выберите существующий проект.
4. Следуйте текущей фазе Forge и рекомендуемому следующему действию.
5. Запустите Claude Code, Codex или GigaChat с нужным профилем и продолжайте работу в общем 9-фазном процессе.

Терминал остаётся средой выполнения задач, а Dashboard — рекомендуемой стартовой точкой и навигационным слоем: здесь видны состояние проекта, профили агентов, прогресс по фазам и следующий шаг.

## Основные команды

Claude Code:

```text
/game
/app
/do <задача>
/continue
/status
```

Codex:

```text
$game
$app
$do <задача>
$continue
$status
```

Для экономичного запуска новой фазы используйте policy-launcher из папки рабочего проекта:

```powershell
node ../project-forge/scripts/codex-phase.mjs 1 --cwd .
node ../project-forge/scripts/codex-phase.mjs 5 --route payment-security --cwd .
```

Рекомендуемый запуск — один раз `node ../project-forge/scripts/codex-pipeline.mjs --cwd .`. Окно остаётся открытым на весь проект: ответы на STOP продолжают текущую фазовую сессию, а после `complete` Forge спрашивает о следующей фазе и запускает её в новой чистой сессии без старого контекста. Все фазы и подагенты используют GPT-5.6 Sol на Standard; reasoning зависит от работы. Ручной `codex-phase.mjs <1..9>` остаётся для точечного контроля. Полная таблица: `.claude/skills/status/references/MODEL-ROUTING.md`.

После каждой завершённой фазы родительский оркестратор печатает и сохраняет локальный cost/context-отчёт в `wiki/diagnostics/codex-cost/phase-N-latest.json`. Когда доступен rollout Codex, отчёт считает модельные ответы, input/cache/output tokens, compaction, подагентов, объём tool output, фактическую модель и неожиданные остановки. Промпты, сообщения, содержимое файлов, состояние лимита и секреты не сохраняются. Несколько отчётов можно открыть в панели **Codex Cost / Context** в Dashboard.

Перед первой фазой launcher проверяет унаследованные из пользовательского Codex-конфига loopback HTTP MCP. Недоступный локальный endpoint временно отключается только для этого pipeline-run: например, остановленный Unity MCP больше не ломает разработку HTML5-игры, а глобальная настройка остаётся без изменений. `--keep-local-mcp` отменяет это поведение. Stdin дочернего Codex остаётся подключённым к терминалу, поэтому готовый фазовый prompt больше не определяется как дополнительный piped input.

Примеры:

```text
/do redesign the game UI
/do add a boss wave every 5 levels
/game new mobile tower-defense game
/app habit tracker
/status
```

## Терминальный launcher

В `v4.68.41` обычная авторизация и API-профили остаются разделены.

```bash
# Claude — существующий аккаунт/подписка
node scripts/forge-agent.mjs launch claude --full --project ../my-game

# Claude — Anthropic API
node scripts/forge-agent.mjs launch claude --profile api --full --project ../my-game

# Codex — существующая ChatGPT-авторизация
node scripts/forge-agent.mjs launch codex --full --project ../my-game

# Codex — отдельный OpenAI API profile
node scripts/forge-agent.mjs launch codex --profile api --full --project ../my-game

# GigaChat — терминальный Forge-agent через API
node scripts/forge-agent.mjs launch gigachat --profile api --full --project ../my-game

# OpenRouter — один ключ, одна выбранная модель на все фазы
node scripts/forge-secrets.mjs set openrouter --stdin
node scripts/forge-agent.mjs presets openrouter
node scripts/forge-agent.mjs select openrouter --preset qwen --profile zdr --project ../my-game
# Бесплатный anonymous preview; провайдер сохраняет запросы/ответы — только несекретный тест
node scripts/forge-agent.mjs select openrouter --preset ox-alpha --profile standard --project ../my-game
node scripts/forge-agent.mjs start openrouter --project ../my-game

# После STOP продолжить ту же сессию OpenCode
node scripts/forge-agent.mjs resume --project ../my-game --answer "утверждаю"

# Проверка web/image search без вывода credentials
node scripts/forge-search-doctor.mjs --project ../my-game

# Проверка доступных host'ов
node scripts/forge-agent.mjs doctor
```

OpenRouter presets охватывают Qwen, DeepSeek, GLM, Kimi, MiniMax, Gemini, Grok и Ox Alpha. Пресет Qwen использует проверенный инструментами `qwen3-coder-next`; у `qwen3-coder-plus` сейчас нет ZDR-endpoint. Ключ хранится вне проектов в `forge-data/secrets/openrouter.key`. Профиль `zdr` по умолчанию требует endpoint без хранения данных. Ox Alpha — бесплатный анонимный preview, провайдер которого сохраняет запросы и ответы; Forge отклоняет его в ZDR и требует явный `--profile standard`, поэтому модель разрешена только для несекретных тестов. После STOP команда `forge-agent resume --answer ...` продолжает последнюю сессию и передаёт ответ через файл, а не через аргументы процесса провайдера. Один ход OpenCode ограничен 64 агентными шагами, а повторный идентичный `list` после успешного результата подавляется, чтобы слабая модель не тратила бюджет в бесконечной петле инструментов.

GigaCode пока остаётся экспериментальным adapter'ом. Если CLI/executable не установлен, Forge не делает вид, что он доступен.

Каждый STOP-point GigaChat выводит детерминированный блок `Как ответить`: точную короткую фразу подтверждения (`утверждаю`) и, когда нужны изменения, полный формат ответа, который ожидает гейт.

По умолчанию Forge разрешает фазе не более двух субагентов и не включает Max/Ultra автоматически. Эти ограничения уменьшают расход токенов, не меняя поведение GigaChat или Claude.

## Диагностика поведения Forge

Если сам Forge нарушает фазовый или STOP-протокол, адаптер возвращает неверный формат, hook/runtime падает либо состояние и capabilities противоречат друг другу, ИИ записывает локальный структурированный инцидент. Обычные баги разрабатываемой игры/приложения в этот журнал не попадают.

Журнал проекта: `wiki/diagnostics/forge-events.jsonl`. Он маскирует типовые credentials, принимает только относительные evidence-пути и локально исключается из Git. Текущие инциденты видны в `$status`/`/status`.

Проверить все проекты рядом с движком:

```powershell
node scripts/audit-forge-diagnostics.mjs --since 30d
node scripts/audit-forge-diagnostics.mjs --since all --json
```

Повторения группируются по классу ошибки, компоненту и операции. После проверенного исправления ИИ закрывает тот же fingerprint; история наблюдений сохраняется.

## API-ключи и секреты

**Реальные API-ключи, токены и локальные credentials не должны попадать в этот репозиторий.**

Рекомендуемая структура workspace:

```text
<workspace>/
  project-forge/
  forge-data/
    secrets/
      anthropic.key
      openai.key
      gigachat.key
      gigasearch.key       # опционально, только для настроенного production GigaSearch
  my-game/
```

Проверить настроенные provider'ы без вывода значений ключей:

```bash
node scripts/forge-secrets.mjs status
```

При запуске GigaChat Forge включает системное хранилище CA до старта дочернего Node-процесса. Если явный `FORGE_SEARCH_PROVIDER` или endpoint `GIGASEARCH_*` не настроен, launcher выбирает no-key fallback `bing-html`. Явная production-конфигурация всегда имеет приоритет; активный provider можно проверить командой `/search-doctor` в GigaChat terminal.

Для срочной доработки посреди фаз используйте `/do <задача>`. Команда временно приостанавливает фазовый автопилот, сохраняет точный запрос через сжатия контекста и блокирует случайный уход в Release. `/task` показывает текущую прямую задачу, `/resume-phase` возвращает управление каноническому конвейеру. Обычные императивные фразы тоже распознаются, но `/do` — гарантированный ручной режим.

`.gitignore` исключает `forge-data/`, `secrets/`, `*.key`, `.env`, provider key files, backups и другое локальное состояние.

Если настоящий credential когда-либо попал в Git, сначала его нужно отозвать/сменить у provider'а, затем удалить из Git history. См. [SECURITY.md](SECURITY.md).

## Universal Agent Runtime

Общий provider-neutral контракт находится в [FORGE.md](FORGE.md).

Основные пути:

```text
FORGE.md                общий runtime contract
.claude/skills/         канонические Forge skills
.claude/agents/         канонические subagents
.agents/skills/         generated Codex discovery mirror
.codex/                 Codex adapter/config/hooks
AGENTS.md               инструкции для Codex
adapters/agents.json    registry терминальных host'ов
scripts/forge-agent.mjs launcher / doctor / skill bridge
```

Claude и Codex сохраняют свои native integrations. Другой терминальный агент может работать через `FORGE.md` и канонические skill-файлы без копирования всего каталога под каждого provider'а.

## AI Studio

AI Studio встроен в те же 9 фаз.

Основные workflows:

```text
/studio
/prompt-compiler
/image-studio
/visual-qa
```

Для Codex используются эквивалентные `$...` команды.

Для unattended/batch сценариев есть direct provider helpers, включая OpenAI image generation и GigaChat image/3D backend. Секреты остаются вне project repositories.

Подробнее: [docs/AI-STUDIO-4.67.0.md](docs/AI-STUDIO-4.67.0.md).

## Платформы

Forge содержит integration/release tooling для:

`Yandex Games` · `VK Mini Apps` · `Telegram Mini Apps` · `OK` · `MAX` · `RuStore` · `Web` · `Steam` · `VK Play`

## Структура репозитория

```text
.claude/          Claude skills, agents и hooks
.codex/           Codex adapter
.agents/          generated Codex skill discovery
adapters/         terminal host registry
scripts/          runtime, sync, checks и provider helpers
platforms/        platform integrations и validators
templates/        project templates
schemas/          Forge config schemas
mcp-server/       локальный Forge MCP server
docs/             техническая документация
wiki/             Forge knowledge/state templates
extras/           вспомогательные updater/tools
dashboard.html    локальный Dashboard
```

## Документация

- [GUIDE.md](GUIDE.md) — полное руководство
- [СПРАВОЧНИК-КОМАНД.md](СПРАВОЧНИК-КОМАНД.md) — справочник команд
- [FORGE.md](FORGE.md) — universal runtime contract
- [RELEASE_NOTES_v4.68.15.md](RELEASE_NOTES_v4.68.15.md) — изменения текущей версии
- [SECURITY.md](SECURITY.md) — правила по секретам и безопасности
- [CONTRIBUTING.md](CONTRIBUTING.md) — правила contribution
- [ROADMAP.md](ROADMAP.md) — публичное направление развития
- [SUPPORT.md](SUPPORT.md) — добровольная личная поддержка оригинального автора

## Безопасность

Публичный source не должен содержать workspace secrets, личные проекты или локальный `forge-data`. Любые credentials в документации должны быть только очевидными placeholder'ами.

## Лицензия

Project Forge распространяется по лицензии [Apache License 2.0](LICENSE).

Информация об авторстве и attribution находится в [NOTICE](NOTICE) и должна сохраняться при распространении в соответствии с условиями лицензии.

---

Project Forge разрабатывается [Rodrik Studio](https://rodrik.dev) / Rodrik LTD.

Оригинальный автор: **Aleksandr Krasnokutskiy**.

Project Forge — независимый проект. Claude, Codex, GigaChat, GigaCode и перечисленные платформы принадлежат их соответствующим владельцам.
