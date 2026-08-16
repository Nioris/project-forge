# Project Forge

**Терминальный multi-agent runtime для разработки, тестирования и выпуска игр и приложений.**

[English version](README.md)

Project Forge даёт нескольким AI-агентам один общий процесс: одинаковые фазы, состояние проекта, skills, STOP-points и проверки.

**Текущая публичная версия:** `v4.68.2`

| Агент | Авторизация | Статус |
|---|---|---|
| Claude Code | аккаунт/подписка · Anthropic API | stable |
| OpenAI Codex | ChatGPT · OpenAI API | stable |
| GigaChat | API через терминальный агент Forge | supported |
| GigaCode CLI | локальный CLI adapter | experimental / dormant до появления executable |

> Forge — terminal-first. IDE не обязательна.

## Что даёт Forge

Forge — не отдельный чат. Это runtime вокруг терминальных AI-агентов.

Внутри:

- **9 канонических фаз** от анализа до Live;
- **141 канонический skill** и сгенерированный Codex discovery layer;
- **21 специализированный subagent**;
- единые phase markers, STOP-points и состояние проекта для всех поддерживаемых host'ов;
- штатные режимы Claude Code и Codex;
- отдельные API-профили Anthropic и OpenAI;
- собственный терминальный GigaChat-agent;
- AI Studio для prompt compilation, изображений, 3D, Art Director и Visual QA;
- интеграции и release-проверки платформ;
- Dashboard, синхронизация проектов, обновление и drift-check управляемых файлов.

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

Примеры:

```text
/do redesign the game UI
/do add a boss wave every 5 levels
/game new mobile tower-defense game
/app habit tracker
/status
```

## Терминальный launcher

В `v4.68.2` обычная авторизация и API-профили остаются разделены.

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

# Проверка доступных host'ов
node scripts/forge-agent.mjs doctor
```

GigaCode пока остаётся экспериментальным adapter'ом. Если CLI/executable не установлен, Forge не делает вид, что он доступен.

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
  my-game/
```

Проверить настроенные provider'ы без вывода значений ключей:

```bash
node scripts/forge-secrets.mjs status
```

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
- [RELEASE_NOTES_v4.68.2.md](RELEASE_NOTES_v4.68.2.md) — изменения текущей версии
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