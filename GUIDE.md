# Project Forge v4.68.45 — Полная инструкция по работе

## Оглавление

- [Начальная настройка](#начальная-настройка)
- [Сценарий А: Игра с нуля](#а-игра-с-нуля)
- [Сценарий Б: Приложение с нуля](#б-приложение-с-нуля)
- [Сценарий В: Доработка готовой игры](#в-доработка-готовой-игры)
- [Сценарий Г: Доработка готового приложения](#г-доработка-готового-приложения)
- [Исправление багов](#исправление-багов)
- [Полный аудит перед релизом](#полный-аудит-перед-релизом)
- [Сборка для RuStore (APK)](#сборка-для-rustore)
- [Сборка для Яндекс Игр](#сборка-для-яндекс-игр)
- [Деплой на сервер (Web)](#деплой-на-сервер)
- [Сборка для VK Mini Apps](#сборка-для-vk-mini-apps)
- [Сборка для Telegram Mini App](#сборка-для-telegram-mini-app)
- [Сборка для Одноклассников (OK.ru)](#сборка-для-одноклассников-okru)
- [Сборка для MAX мессенджер](#сборка-для-max-мессенджер)
- [Сборка на ВСЕ платформы сразу (`/release all`)](#сборка-на-все-платформы-сразу-новое-в-v43)
- [Правки от модераторов](#правки-от-модераторов)
- [Параллельная работа](#параллельная-работа)
- [Шпаргалка команд](#шпаргалка-команд)

---

## Начальная настройка

Делается ОДИН раз. После этого forge готов для любого количества проектов.

```powershell
# 1. Распаковать
cd E:\Projects
# распаковать project-forge-v4.3.zip → E:\Projects\project-forge

# 2. Инициализировать
cd project-forge
powershell -ExecutionPolicy Bypass -File setup.ps1
# (или на Linux/Mac: ./setup.sh)

# 3. Установить короткие launch aliases
# Windows: скопировать scripts\cf.bat и scripts\cx.bat в папку из PATH
copy scripts\cf.bat C:\Windows\cf.bat
copy scripts\cx.bat C:\Windows\cx.bat

# Linux/Mac:
chmod +x scripts/cf scripts/cx
sudo ln -s $(pwd)/scripts/cf /usr/local/bin/cf
sudo ln -s $(pwd)/scripts/cx /usr/local/bin/cx

# Claude Code без permission prompts:
cf

# Codex без approval prompts, sandbox=danger-full-access:
cx
```

> `cf` запускает `claude --dangerously-skip-permissions`. `cx` запускает `codex -a never -s danger-full-access --dangerously-bypass-hook-trust`.
> Dashboard также умеет копировать обе команды напрямую с правильной папкой проекта. Full-режим используй только для доверенных локальных проектов.

---

## Выбор terminal-профиля: один агент на весь проект

Одна база Forge, девять фаз и те же STOP-points. Меняется только host/auth profile.

```powershell
# Subscription / existing auth
cf
cx

# API profiles
node scripts\forge-agent.mjs launch claude --profile api --full --project .
node scripts\forge-agent.mjs launch codex --profile api --full --project .
node scripts\forge-agent.mjs launch gigachat --profile api --full --project .
node scripts\forge-search-doctor.mjs --project .

# Один выбранный агент и одна модель проходят все девять фаз
node scripts\forge-agent.mjs start gemini --project .
node scripts\forge-agent.mjs start qwen --project .
node scripts\forge-agent.mjs start kimi --project .
node scripts\forge-agent.mjs start deepseek --project .
node scripts\forge-agent.mjs start glm --project .
node scripts\forge-agent.mjs start minimax --project .

# Проверить или явно изменить закрепление
node scripts\forge-agent.mjs profile --project .
node scripts\forge-agent.mjs select qwen --model qwen3-coder-plus --project .

# Первичная авторизация нативных CLI выполняется один раз
gemini
qwen auth qwen-oauth
kimi login

# Optional dormant bridge
node scripts\forge-agent.mjs doctor gigacode
```

### Локальный журнал ошибок Forge

ИИ обязана отличать баг проекта от сбоя самого Forge. Неверный фазовый/STOP-формат, ошибка adapter/hook/runtime, противоречивое состояние или неверно заявленная capability записываются в `wiki/diagnostics/forge-events.jsonl`; обычные ошибки игры/приложения — нет. Журнал не содержит полных prompts/выводов и локально исключается из Git.

Чтобы оценить масштаб одной и той же проблемы по всем проектам рядом с движком:

```powershell
node scripts\audit-forge-diagnostics.mjs --since 30d
```

Для машинного разбора добавьте `--json`, для всей истории — `--since all`. Исправленный инцидент закрывается только после повторной проверки.

### Качественный запуск фаз Codex без лишнего расхода

Основной способ — одна команда и одно окно на весь проект:

```powershell
node ..\project-forge\scripts\codex-pipeline.mjs --cwd .
```

Оркестратор сам определяет текущую фазу. На STOP он принимает ваш ответ и продолжает ту же внутреннюю сессию. После `complete` печатает `Начинаем Phase N? [Y/n]`; ответ `да` запускает новую чистую сессию в том же терминале. Закрывать окно или повторно вводить команду не нужно. Прежний `codex-phase.mjs N --cwd .` остаётся для ручного запуска одной фазы.

Все запуски используют GPT-5.6 Sol на Standard tier и максимум двух субагентов. `high` применяется к анализу, дизайну, реализации, визуалу, интеграциям и QA; листинг, штатная упаковка и обычные метрики идут на Sol `medium`. Max/Ultra остаются только ручным решением. Таблица фаз и эскалаций: `.claude/skills/status/references/MODEL-ROUTING.md`.

### Task/RunResult и надёжное продолжение

Девять фаз не заменены графом и остаются единственным глобальным прогрессом. Граф отвечает за
выполнение ограниченной работы внутри фазы: `phase`, прямое `change`, `review`, `diagnose` или
`release`. Состояние каждой Task атомарно сохраняется в `.forge/runs/`, поэтому текущий узел,
ожидание решения и число попыток ремонта переживают закрытие терминала.

Адаптеры принимают решения по структурированному `RunResult`, а не по красивому тексту модели:

- `user_decision_required` — показать один STOP и дождаться ответа;
- `retryable_failure` — вернуть работу агенту, максимум три попытки;
- `environment_failure` / `blocked` — остановиться с конкретным внешним blocker;
- `completed` — завершить узел; фазу всё равно закрывает только её completion contract.

Codex связывает результат с конкретным запуском через `attemptId`, поэтому старый STOP не может
повторно сработать на быстрый ответ. Вопросы в обычном тексте распознаются только как legacy fallback.
Ручной просмотр без изменения состояния:

```powershell
node scripts\forge-workflow.mjs status --project .
node .claude\skills\status\references\project-status.mjs . --json
```

Файлы `.forge/runs/` принадлежат runtime и не редактируются вручную. Поля scope пока являются
проверяемой декларацией; фактическую защиту записи обеспечивают workspace rules, host sandbox и
защищённые пути. Принудительные file leases будут отдельным следующим слоем.

### SkillContract и AgentContract

В каноническом `SKILL.md` поле `contract_version: 1` включает машинный контракт: допустимые фазы
и режимы, scope чтения/записи, STOP ids, risk, completion contract и разрешённые Task-verifiers.
Task сохраняет id/hash контракта; несовместимые phase/mode/scope/verifier и изменение контракта
посреди работы отклоняются. Навыки без контракта не ломаются, но доступны только для явного ручного
вызова и не участвуют в автоматическом выборе.

```powershell
node scripts\check-skill-contracts.mjs
node scripts\search-skills.mjs "gacha" --phase 8 --mode change --auto-only --json
```

`adapters/agent-contracts.json` задаёт форматы Builder/Reviewer/Researcher. Ответ субагента не
выбирает исполняемые проверки и не закрывает Task: runtime доверяет только host ledger, существующим
файлам и зарегистрированным verifiers. Scope в этой версии ещё декларативный; принудительная граница
записи остаётся следующим отдельным релизом.

### Локальный Git и приватный GitHub для каждой игры

Forge всегда создаёт локальный репозиторий нового проекта, а `phase-state ... complete` автоматически делает checkpoint-коммит. Один раз включите приватную GitHub-политику для workspace:

```powershell
node scripts\project-git.mjs configure --owner Nioris
```

Настройка живёт в `forge-data\git-policy.json` вне обновляемого движка. Для каждого следующего проекта Forge создаст private-репозиторий и отправит checkpoint. Public remote, отслеживаемые ключи и вероятные секреты блокируются. Сетевой сбой не уничтожает локальную историю. Существующие проекты подключаются только явно: сначала `node scripts\git-init-games.mjs --dry`, затем `--game имя`.

Ключи хранятся централизованно и не копируются в проекты:

```text
F:\ProjectForgeUniversal\forge-data\secrets\anthropic.key
F:\ProjectForgeUniversal\forge-data\secrets\openai.key
F:\ProjectForgeUniversal\forge-data\secrets\gigachat.key
F:\ProjectForgeUniversal\forge-data\secrets\gigasearch.key   # optional production search
F:\ProjectForgeUniversal\forge-data\secrets\deepseek.key
F:\ProjectForgeUniversal\forge-data\secrets\zai.key
F:\ProjectForgeUniversal\forge-data\secrets\minimax.key
```

Проверка:

```powershell
node scripts\forge-secrets.mjs status
```

Claude API запускается через `apiKeyHelper`. Codex API использует отдельный `CODEX_HOME`, чтобы не перетирать ChatGPT login. GigaChat API запускает Forge-owned REPL с file/search/edit/status/git tools; `--full` дополнительно даёт shell tool. Launcher включает системный CA store для дочернего Node-процесса и, если production GigaSearch явно не настроен, использует no-key fallback `bing-html`. Текущий search provider проверяется через `/search-doctor`. Каждый GigaChat STOP печатает блок `Как ответить` с готовым `утверждаю` и точным форматом для изменений. Значения ключей Forge не печатает и не передаёт как command-line arguments.

Для DeepSeek/GLM/MiniMax/OpenRouter через OpenCode один модельный ход имеет лимит 64 агентных
итерации. При достижении лимита OpenCode принудительно запрашивает текстовый итог; незавершённую
полезную работу можно продолжить через `forge-agent resume`. Адаптер `list` также не возвращает
один и тот же успешный листинг повторно в рамках сессии.

Экспериментальный OpenRouter preset `ox-alpha` бесплатен во время preview, но анонимный провайдер
сохраняет prompts/completions. Forge механически требует `--profile standard` и разрешает такой
запуск только на несекретных тестовых проектах без credentials, персональных и закрытых данных.

Если посреди конвейера нужно немедленно реализовать отдельную доработку, используйте `/do <задача>`, например `/do добавь гачу, составь ТЗ, реализуй и протестируй`. Forge сохранит точный запрос, приостановит фазовый автопилот и механически заблокирует случайный переход к release-командам. `/task` показывает активную прямую задачу, `/resume-phase` отменяет override и возвращает управление текущей канонической фазе. Сильные естественные команды вроде «добавь магазин и начинай делать» распознаются автоматически, но `/do` остаётся гарантированным ручным вариантом.

После изменений canonical runtime:

```powershell
node scripts\generate-agents-md.mjs
node scripts\sync-codex-adapter.mjs
node scripts\sync-dashboard-meta.mjs
node scripts\check-api-terminal-profiles.mjs
node scripts\check-codex-compat.mjs
node scripts\check-dashboard-meta.mjs
```

Корневой `sync.bat` распространяет managed runtime в sibling projects.

## AI Studio 4.67 и работа по фазам

AI Studio **не добавляет десятую фазу**. Он встраивается в девять существующих фаз, чтобы артефакт создавался именно там, где он нужен и где уже действует соответствующий gate.

| Фаза | Что делает AI Studio |
|---|---|
| Ф1 Analyze | Инициализирует `.forge-ai.json`, visual/asset baseline; не запускает массовую генерацию |
| Ф2 Design | Готовит art briefs, prompt packs и `wiki/ai/studio-plan.md` на базе утверждённого GDD |
| Ф3 Construct | `$studio`/`/studio` может параллельно раздать **непересекающиеся** coding workstreams; один writer на файл |
| Ф4 Visual | STYLE-BIBLE → Prompt Compiler → Image Studio → Art Director → integration → Visual QA |
| Ф5 Tech | Проверяет AI config/secrets/perf и не допускает debug/provider leakage в релиз |
| Ф6 Listing | Создаёт store-creative hypotheses и production prompt packs; сохраняет варианты для A/B |
| Ф7 Test | Multi-agent QA + `/visual-qa`; Computer Use применяется только когда доступен в текущем Codex |
| Ф8 Release | Проверяет provenance, секреты, generated assets и release cleanliness |
| Ф9 Live | Measured creative A/B; победившие решения возвращаются в STYLE-BIBLE/visual DNA |

Основные команды:

```text
Claude: /studio, /prompt-compiler, /image-studio, /visual-qa
Codex:  $studio, $prompt-compiler, $image-studio, $visual-qa
```

`/image-studio`/`$image-studio` сначала использует native ImageGen текущей Codex-сессии. Для unattended batch используется `node <forge>/scripts/openai-image.mjs ...`; ключ берётся из `OPENAI_API_KEY` или `forge-data/secrets/openai.key` (legacy `.openai_key` поддерживается) и никогда не хранится в `.forge-ai.json`. Если native ImageGen и OpenAI API недоступны, workflow останавливается на готовом prompt pack, а не молча переключается на другой provider.

Четыре новые роли: `studio-director`, `prompt-architect`, `art-director`, `visual-qa`. Director обязан уважать текущую фазу, пользовательские STOP-points и ownership файлов.

## Обновление Forge до новой версии

Когда выходит новая версия Forge — **не нужно** удалять старую папку. Для парка sibling projects основной путь — внешний `update-forge.bat`: один раз скопируй `extras/update-forge.bat` рядом с `project-forge/`, дальше скачивай ZIP и запускай updater. Он выбирает максимальную semver-версию, делает backup, `upgrade`, `sync` всех проектов и финальные проверки.

### One-click updater (Windows, рекомендуется)

```text
F:\ProjectForgeUniversal\update-forge.bat
F:\ProjectForgeUniversal\project-forge\
F:\ProjectForgeUniversal\game-one\
F:\ProjectForgeUniversal\app-two\
```

ZIP `project-forge-vX.Y.Z*.zip` можно оставить в Downloads. Updater показывает установленную/пакетную версии, отдельно подтверждает downgrade и завершает работу с ошибкой при любом failed gate.

### Через проводник (ручной fallback)

1. Открой `F:\ProjectForgeUniversal\` в проводнике
2. ПКМ на `project-forge-vX.Y.Z.zip` → "Извлечь всё..."
3. Путь: `F:\ProjectForgeUniversal\project-forge` (БЕЗ суффикса версии)
4. "Извлечь" → когда Windows спросит "Заменить?" — **"Заменить все"**
5. Открой `F:\ProjectForgeUniversal\project-forge\`
6. **Двойной клик на `upgrade.bat`** ← рекомендуемый (v4.10.33+)
7. После завершения — двойной клик на корневой `sync.bat`

⚠️ **Используй `.bat`, не `.ps1`**. Windows блокирует unsigned `.ps1` файлы после ZIP extract (Mark-of-the-Web). `.bat` файлы это обходят — запускают `.ps1` через `-ExecutionPolicy Bypass` и unblock'ают остальные файлы.

💡 **Скилы в активной сессии (CC 2.1.145+):** Claude Code следит за `.claude/skills/` и подхватывает
правки скилов **без рестарта** в текущей сессии. Если редактировал скилы и хочешь форсировать
пере-скан — `/reload-skills`. (Создание новой top-level директории скилов всё ещё требует рестарта.)

Если ты по привычке делаешь правый клик на `upgrade.ps1` → "Выполнить с помощью PowerShell" и получаешь:

```
.\upgrade.ps1 : File ... is not digitally signed.
```

Это **то самое** — Windows blocked unsigned script. Решение: используй `upgrade.bat` (двойной клик).

`upgrade.bat` делает 7 шагов через upgrade.ps1:
1. Unblock-File на всех файлах (снимает Mark-of-the-Web)
2. Remove legacy orphan files (hand-maintained hit-list, pre-manifest era)
3. **MANIFEST.txt orphan detection** — удаляет файлы которых нет в новой версии
4. Fix nested duplicate directories (`platforms/platforms/` и подобные)
5. Sync advisor catalog с filesystem
6. Rebuild `AGENTS.md` + native Codex adapter из canonical Forge sources
7. Refresh + verify `dashboard.html` version/skill counts/Claude↔Codex command mappings

### Через PowerShell (CLI)

Если предпочитаешь команды:
```powershell
cd F:\ProjectForgeUniversal\project-forge
.\upgrade.bat              # ← preferred, no MotW issues

# Или старый путь (требует ExecutionPolicy):
powershell -ExecutionPolicy Bypass -File .\upgrade.ps1
 .\sync.bat
```

### Linux/macOS

```bash
unzip -o project-forge-vX.Y.Z.zip -d ~/projects/forge
cd ~/projects/forge
./upgrade.sh
node scripts/sync.mjs
```

### Проверка что upgrade прошёл

```powershell
ls F:\ProjectForgeUniversal\<sibling-project>\.claude\commands
```

Должно быть **3 файла**: `app.md`, `continue.md`, `game.md`. Если больше — старые orphans не удалились (запусти upgrade.ps1 ещё раз).

---

## А. Игра с нуля

> Пример: «Хочу сделать 2D шутер с волнами врагов»

> **v4.4:** `/new-project` теперь автоматически запускает `/research-references` и `/find-or-make-skill` в Phase 0 — Claude изучает конкурентов и находит нужные скилы ДО того как планирует. Если хочешь пропустить research — скажи "без research" явно. По умолчанию research всегда делается.

### Шаг 1 — Создать изолированный проект

```powershell
.\new-project.bat shooter-game --type game
cd ..\shooter-game
cf      # Claude Code
# или: codex
```

### Шаг 2 — Описать идею

```
# Claude Code:
/game 2D top-down шутер с волнами врагов, прокачкой между раундами,
боссами каждые 5 волн, нарастающей сложностью

# Codex: тот же запрос начинается с $game
```

Claude Code:
- Прочитает `skills/CATALOG.md`
- Загрузит скилы: `visual-quality`, `game-ui`, `mobile-controls`, `html-template`, `shooter`
- Создаст `CONTEXT.md`, `ARCHITECTURE.md`
- Построит первую играбельную версию
- Применит палитру по жанру (из `visual-upgrade`)

### Шаг 3 — Полировка визуала и геймплея

```
/improve
```

Пайплайн: анализ → visual-upgrade → game-design → level-design → sound-design → mobile-adapt → game-polish

Результат:
- Градиенты вместо плоских заливок
- Частицы (взрывы, искры, подбор монет)
- Juice (shake, hitstop, slowmo)
- 12 процедурных звуков
- Фоновая музыка
- Тач-управление (два джойстика)
- Загрузочный экран + splash студии
- Difficulty curve с волнами

### Шаг 4 — Проверка

```
/review       # качество кода + комментарии
/status       # 9 фаз: current/STOP-point + AI Studio + Project Health
```

### Шаг 5 — Сохранить контекст

```
/handoff      # если заканчиваешь сессию
```

Следующая сессия:
```
cd ..\shooter-game
cf
/continue     # подхватит с места остановки
```

---

## Б. Приложение с нуля

> Пример: «Трекер подписок с напоминаниями и статистикой»

### Шаг 1 — Создать проект

```powershell
.\new-project.bat my-subs --type app --title "Трекер подписок"
cd ..\my-subs
cf
```

### Шаг 2 — Описать идею

```
/app PWA трекер подписок: добавление подписок (название, цена, период,
категория), напоминания о списаниях, статистика по месяцам и категориям,
тёмная тема, offline, экспорт данных
```

Claude Code:
- Загрузит скилы: `productivity` (из apps), `deepapp-systems`
- Если PWA — загрузит: `sveltekit-pwa`, `dexie-offline`, `tailwind-mobile`
- Создаст структуру + первую фичу

### Шаг 3 — Полировка функционала

```
/polish-app
```

Пайплайн из 6 фаз:
1. **Аудит** — проверка всех 7 состояний экрана
2. **UX Polish** — empty states, скелетоны, undo-тосты, валидация форм
3. **Data Flow** — поиск, фильтры, сортировка, дашборд статистики
4. **Notifications** — тосты, напоминания, центр уведомлений
5. **Settings** — темы, настройки, экспорт/импорт
6. **Финальная проверка** — прохождение как новый пользователь

### Шаг 4 — Если нужно точечно

Не обязательно запускать весь пайплайн. Можно по частям:

```
# Только UX
Прочитай скил app-ux-polish и добавь empty states + undo + валидацию

# Только поиск и фильтры
Прочитай скил app-data-flow и добавь поиск с подсветкой + фильтры по категориям

# Только уведомления
Прочитай скил app-notifications и добавь напоминания о списаниях за 3 дня

# Только тёмная тема
Прочитай скил app-settings и добавь систему тем + страницу настроек
```

---

## В. Доработка готовой игры

> Пример: есть `index.html` с рабочей игрой, нужно сделать сочной

> **v4.4:** `/analyze-game` теперь после type detection запускает `/research-references` (изучить конкурентов похожего жанра) и `/find-or-make-skill` (найти нужные специализированные скилы). Результат — грамотный план доработки на основе реальных конкурентов, а не общих соображений.

### Шаг 1 — Создать проект и положить файлы

```powershell
.\new-project.bat my-game --type game --title "Доработка шутера"
cd ..\my-game

# Положить файлы
mkdir src
copy E:\Games\my-shooter\* src\

cf
```

### Шаг 2 — Claude видит файлы

```
Вот в src/ лежит готовая игра. Проанализируй её: жанр, что есть, чего не хватает.
```

Claude:
- Сканирует все файлы
- Определяет жанр
- Создаёт `CONTEXT.md` с описанием текущего состояния
- Выдаёт отчёт: что есть, чего не хватает

### Шаг 3 — Полировка

```
/improve
```

Если нужно по частям:

```
# Только графику
Прочитай скил visual-upgrade и примени к src/index.html:
палитра, градиенты, glow, частицы, параллакс-фон

# Только звук
Прочитай скил sound-design и добавь все 12 звуков + фоновую музыку

# Только управление на мобилке
Прочитай скил mobile-adapt — определи ориентацию по жанру,
замени все keyboard/mouse на touch

# Только level design
Прочитай скил level-design — добавь прогрессию,
боссов каждые 5 волн, breather-волны
```

### Шаг 4 — Командная доработка (для крупных задач)

```
/team build
```

Запускает 3 агента параллельно:
- **Architect** — планирует, координирует
- **Developer** — пишет код
- **QA** — тестирует каждую фичу

---

## Г. Доработка готового приложения

> Пример: есть HTML приложение «Записочная», работает базово

### Шаг 1 — Создать проект и положить файлы

```powershell
.\new-project.bat notes-app --type app --title "Записочная"
cd ..\notes-app
mkdir src
copy E:\Apps\notes\* src\
cf
```

### Шаг 2 — Аудит

```
В src/ лежит готовое приложение Записочная. Сделай полный аудит:
что есть, какие состояния экрана обрабатываются, чего не хватает.
```

Claude создаст `CONTEXT.md` и выдаст детальный отчёт.

### Шаг 3 — Полировка

```
/polish-app
```

Или точечно:

```
# Поиск по заметкам
Прочитай app-data-flow — добавь мгновенный поиск с подсветкой,
фильтр по тегам, сортировку по дате

# Auto-save
Прочитай app-ux-polish — добавь авто-сохранение при вводе,
чтобы пользователь никогда не терял текст

# Swipe-to-delete + undo
Прочитай app-ux-polish — добавь swipe-to-delete на карточки заметок
с undo-тостом на 5 секунд

# Центр уведомлений
Прочитай app-notifications — добавь напоминания по заметкам,
тосты при сохранении
```

---

## Исправление багов

### Один конкретный баг

```
cd ..\my-game
cf

# Описать баг максимально конкретно:
Баг: при двойном тапе на кнопку атаки игра зависает.
Воспроизведение: быстро тапни 2 раза на кнопку FIRE.
Ожидание: два выстрела.
Реальность: freeze на 2-3 секунды.
```

Claude найдёт причину, исправит, протестирует.

### Массовый баг-фикс после тестирования

```
cd ..\my-app
cf

Вот список багов после тестирования:
1. При пустом поле цены — краш при сохранении
2. Длинное название подписки вылезает за карточку
3. Фильтр по категории не сбрасывается
4. Тёмная тема — белый текст на белом фоне в модалке
5. Экспорт JSON не включает архивные подписки

Исправь все по порядку, после каждого покажи что изменилось.
```

### Баги от пользователей

```
cd ..\my-game
cf

Пользователь пишет: «На Samsung A12 игра тормозит после 10 волны,
FPS падает до 5». Найди причину и оптимизируй.
Прочитай скил visual-upgrade (секция про performance)
и game-design (секция про object pooling).
```

---

## Полный аудит перед релизом

Запускай перед каждой публикацией на любую платформу.

### Для игры

```
cd ..\my-game
cf

Полный аудит перед релизом. Проверь:

1. ФУНКЦИОНАЛ
   - Игра запускается без ошибок в консоли
   - Все кнопки работают (старт, пауза, рестарт, меню)
   - Game over показывает счёт + лучший результат
   - Сохранение/загрузка прогресса работает

2. ВИЗУАЛ (читай visual-upgrade)
   - Фон НЕ чёрный (градиент минимум)
   - Частицы на: смерть врага, подбор, попадание, levelup
   - Переходы между экранами (fade, не instant)
   - Floating numbers (урон, очки)

3. ЗВУК (читай sound-design)
   - Минимум 8 звуков
   - Фоновая музыка меню + геймплей
   - Pitch variation ±10%

4. МОБИЛКА (читай mobile-adapt + mobile-game-ui)
   - Ориентация соответствует жанру
   - Тач-управление работает
   - Максимум 4-5 кнопок на экране
   - Touch targets >= 48px
   - FPS >= 30 на мобилке

5. КОД (читай review)
   - Все файлы с header-комментарием
   - Все функции с JSDoc
   - Нет magic numbers
   - Нет console.log (кроме debug mode)

Создай AUDIT_REPORT.md с результатами.
```

### Для приложения

```
cd ..\my-app
cf

Полный аудит перед релизом. Проверь:

1. 7 СОСТОЯНИЙ (читай app-ux-polish)
   - Empty state — есть иконка + текст + кнопка действия?
   - Loading — skeleton, не пустой экран?
   - Error — понятное сообщение + retry?
   - Offline — данные доступны?
   - Каждое состояние протестировано?

2. DATA (читай app-data-flow)
   - Поиск работает мгновенно?
   - Фильтры комбинируются?
   - Сортировка переключает направление?
   - Данные не теряются при краше?

3. UX (читай app-ux-polish)
   - Удаление — есть undo или подтверждение?
   - Формы валидируются в реальном времени?
   - Auto-save работает?
   - Pull-to-refresh на мобилке?

4. НАСТРОЙКИ (читай app-settings)
   - Тёмная тема без артефактов?
   - Экспорт/импорт работает?
   - Размер шрифта меняется?

5. МОБИЛКА
   - Всё влезает на 375×667 (iPhone SE)?
   - Кнопки >= 44px?
   - Нет горизонтального скролла?
   - Safe area (notch) обработана?

Создай AUDIT_REPORT.md с результатами.
```

---

## Сборка для RuStore

### Шаг 0 — Подготовить ключи

Claude сам спросит всё что нужно, но вот чеклист заранее:

```
ОБЯЗАТЕЛЬНО:
  • Keystore (.jks) — для подписи APK. Нет? Claude предложит сгенерировать.
  • Пароль keystore + alias + пароль ключа

РЕКЛАМА (если нужна):
  • Yandex Ads Block ID → https://partner.yandex.ru
    Нужны ID для: баннер / interstitial / rewarded

АНАЛИТИКА (если нужна):
  • AppMetrica API Key → https://appmetrica.yandex.ru
  • MyTracker SDK Key → https://tracker.my.com

RUSTORE SDK (опционально):
  • Company ID + Key ID + .pem файл → https://console.rustore.ru
```

Claude при запуске `/convert` или `/build-apk` проверит всё это и спросит чего нет.
Пока ты готовишь ключи — он продолжает работать над кодом.
Когда скинешь — вставит в нужные файлы и покажет куда что легло.

### Шаг 1 — Проверка мобильной готовности

```
cd ..\my-app
cf

Прочитай скил analyze-project — проанализируй src/.
Потом прочитай mobile-ready — проверь готовность к Android.
```

### Шаг 2 — Конвертация

```
/convert
```

Пайплайн:
1. Анализ типа проекта (HTML5 / PWA / Canvas game)
2. Мобильный аудит + исправления
3. Выбор стратегии (Capacitor или TWA)
4. Обёртка в Android-проект
5. Сборка APK (debug для теста) + AAB (для магазина)
6. Подготовка материалов RuStore

### Шаг 3 — Подготовка к публикации

```
Прочитай скил rustore-publish и подготовь:
- Название и описание
- Категорию
- Политику конфиденциальности
- Список скриншотов для создания
```

### Шаг 4 — Реклама (опционально)

```
# Яндекс Ads
Прочитай скил yandex-ads и интегрируй:
- Banner (нижний) на главном экране
- Interstitial между уровнями
- Rewarded за удвоение награды

# MyTracker (аналитика)
Прочитай скил mytracker и добавь отслеживание:
- Установки, сессии, retention
- Кастомные события (покупка, достижение)
```

---

## Сборка для Яндекс Игр

### Шаг 0 — Подготовить ключи

```
ОБЯЗАТЕЛЬНО:
  • App ID → https://games.yandex.ru/console → твоя игра → ID

ЛИДЕРБОРДЫ (если есть):
  • Leaderboard Name → создать в кабинете

IAP (если есть):
  • Product ID каждого товара → создать в кабинете

МОНЕТИЗАЦИЯ:
  • Включить рекламу в кабинете (SDK создаст блоки сам)
```

Claude при `/yandex-release` спросит всё что отсутствует.

### Шаг 1 — Полный пайплайн

```
cd ..\my-game
cf
/yandex-release
```

**Фаза 1: Полировка игры** (без SDK)
- game-design → level-design → mobile-adapt → game-polish → monetization
- ⛔ СТОП → отчёт → жди «продолжи»

**Фаза 2: SDK + локализация**
- Yandex SDK интеграция (saves, ads, leaderboards)
- Локализация на 13 языков
- ⛔ СТОП → отчёт → жди «продолжи»

**Фаза 3: Тест + сборка**
- Автоверификация (verify.sh)
- Проверка всех языков (verify-i18n.mjs)
- Smoke test
- 3 ZIP-архива (Яндекс, VK, OK)

### Шаг 2 — Если только SDK (игра уже готова)

```
cd ..\my-game
cf

Игра уже отполирована, нужно только SDK.
Прочитай скил yandex-sdk-integration и интегрируй:
1. LoadingAPI.ready() — после отрисовки UI + загрузки шрифтов
2. Сохранения через player.setData/getData (убрать localStorage)
3. Реклама: interstitial между уровнями, rewarded за жизни
4. Leaderboard по очкам
5. Контекстное меню отключено

Потом прочитай .claude/commands/localize.md и добавь 13 языков.
```

### Шаг 3 — Верификация

```
# Обязательно перед отправкой:
bash scripts/verify.sh src/
node scripts/verify-i18n.mjs src/

# Если есть ошибки — Claude исправляет и перезапускает.
# НИКОГДА не публиковать с FAIL.
```

---

## Деплой на сервер

```
cd ..\my-app
cf
/deploy
```

Claude:
1. Создаст `Dockerfile` + `nginx.conf`
2. Настроит кеширование статики
3. Сгенерирует инструкцию для деплоя

Для полного деплоя (SSL, CI/CD, бэкапы):
```
Прочитай скил deploy-timeweb (из skills/pwa/) и настрой:
- Docker контейнер с автоперезапуском
- Nginx с SSL (Let's Encrypt)
- CI/CD через GitHub Actions
- Бэкапы в Yandex S3
```

---

## Сборка для VK Mini Apps

Новое в v4.1. Платформа — `vk`.

```
cd ..\my-game
cf
/release vk
```

Claude:
1. Интегрирует VK Bridge (`<script src="https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js"></script>`)
2. Добавляет `vkBridge.send('VKWebAppInit', {})` первым вызовом
3. Прогоняет 3 валидатора: `bridge-timing`, `vk-pay`, `vk-ads`
4. Собирает bundle в `Release/{Project}/vk/`

**Если игра использует VK Pay** — validator `vk-pay` проверит что:
- `amount` лежит внутри `params: {}`, не на верхнем уровне (legacy shape)
- `action` один из: `pay-to-user` / `pay-to-group` / `pay-to-service` / `transfer-to-user` / `transfer-to-group`
- Для `pay-to-service` есть `merchant_data` + `sign` (подпись генерируется на сервере с CLIENT_SECRET)

**Реклама:** формат передаётся в `VKWebAppShowNativeAds({ ad_format: 'reward' | 'interstitial' })`. Оба варианта поддерживаются.

Dev Console: https://dev.vk.com/mini-apps

---

## Сборка для Telegram Mini App

Новое в v4.1. Платформа — `telegram`.

```
cd ..\my-game
cf
/release telegram
```

Claude:
1. Подключает Telegram WebApp SDK (`<script src="https://telegram.org/js/telegram-web-app.js"></script>`)
2. Использует `platforms/telegram/templates/telegram-sdk-wrapper.js` для унифицированного API
3. Гарантирует вызов `Telegram.WebApp.ready()` (иначе спиннер бесконечный)
4. Прогоняет 5 валидаторов + runtime-test с puppeteer (ready/expand timing, theme sync, CloudStorage round-trip)

**CloudStorage constraints** (validator `cloud-storage-constraints`):
- Key regex: `^[A-Za-z0-9_-]{1,128}$`
- Value: 0-4096 символов
- Макс 1024 ключа на пользователя
- Захардкоженные ключи не подходящие под regex — silent fail. Валидатор ловит их в коде.

**Сервер-side auth** (если игра с платежами/сохранениями):
```
Прочитай platforms/telegram/templates/telegram-server-verify.mjs и интегрируй
HMAC-верификацию initData в бот-бэкенд.
```

HMAC-деривация Telegram:
```
secret_key = HMAC_SHA256(bot_token, "WebAppData")
hash = hex(HMAC_SHA256(secret_key, sorted_params_joined_by_\n))
```

**⚠️ HMAC у MAX другой** — см. ниже, не путай.

Bot registration: `/newbot` в @BotFather, потом `/setdomain` для webapp URL.

---

## Сборка для Одноклассников (OK.ru)

Новое в v4.1. Платформа — `ok`.

```
cd ..\my-game
cf
/release ok
```

Claude:
1. Подключает FAPI SDK (`<script src="//api.ok.ru/js/fapi5.js" defer="defer"></script>`)
2. Вызывает `FAPI.init(apiServer, apiConnection, onSuccess, onError)`
3. Прогоняет 1 валидатор + runtime-test (sig, FAPI.UI.loaded, API_callback contract, rewarded preload)

**Критично:** `FAPI.UI.*` методы (showPayment, showAd, loadAd, showLoadedAd) **не принимают callback**. Они вызывают глобальный `window.API_callback(method, result, data)` который должно реализовать приложение. Если не реализовано — платежи и награды за рекламу теряются silently. Runtime-test Probe C это ловит.

**Rewarded video lifecycle:**
```javascript
FAPI.UI.loadAd();  // preload
// ждёшь window.API_callback('loadAd', 'ok', ...)
FAPI.UI.showLoadedAd();  // теперь показывать
```

Без preload первый `showLoadedAd()` падает. Probe C2 это ловит.

**FAPI.Client.call** — наоборот, callback идёт параметром: `(params, callback(status, data, error))`. Не путай с FAPI.UI.

Payment signature: `SHA-256("{code}:{price}:{secretKey}")` на сервере.

Dev Console: https://apiok.ru

---

## Сборка для MAX мессенджер

Новое в v4.1. Платформа — `max`.

```
cd ..\my-game
cf
/release max
```

Claude:
1. Подключает MAX Bridge (`<script src="https://st.max.ru/js/max-web-app.js"></script>`)
2. Использует `platforms/max/templates/max-sdk-wrapper.js` — renames `window.WebApp` → `window.MaxSDK` во избежание конфликта с Telegram
3. Прогоняет 5 валидаторов: `sdk-loaded` (позиция scripta в head), `url-constraints` (URL ≤1024 chars, latin+digits+.+-), `https-only`, `initdata-and-conflict`, `gesture-required`

**⚠️ Конфликт window.WebApp:** Telegram и MAX оба используют `window.WebApp`. Если проект собирается под обе платформы — они должны быть в разных `WorkProgress/` копиях. `/release all` автоматически разводит через суффиксы `-telegram` и `-max`.

**HMAC-верификация MAX (отличается от Telegram!):**
```
secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)
//                         ^^^ key     ^^^ message
//  у Telegram наоборот — bot_token это message, "WebAppData" это key
hash = hex(HMAC_SHA256(secret_key, sorted_params_joined_by_\n))
```

Шаблон `platforms/max/templates/verify-webappdata.mjs` реализует правильно, round-trip верифицирован на 4 тест-кейсах (valid / wrong token / tampered / expired).

**MAX quirks:**
- Есть `BackButton`, нет `MainButton`
- `DeviceStorage` + `SecureStorage` доступны (но **не** на веб-клиенте, только iOS/Android)
- `Biometric` + `NFC` только iOS/Android
- `chatType`: 'DIALOG' / 'CHAT' / 'CHANNEL'
- Deep links: `https://max.ru/<botName>?startapp=<payload>` (payload ≤512 chars)
- Регистрация: https://business.max.ru/self — **только юрлица/ИП РФ**

---

## Steam (новое в v4.7)

Steam — единственная Forge-платформа с **native wrapper requirement**. HTML5 игра обёрнута в Electron, native-binding `steamworks.js` даёт доступ к Steamworks API.

```
cf
/release-ready steam
/release-steam
```

Перед стартом проверь:
- ☐ Steamworks Partner account approved (1-3 weeks)
- ☐ Steam Direct fee paid ($100 USD одноразовый)
- ☐ App ID создан в Partner panel
- ☐ Tax/banking info verified
- ☐ Steam client установлен и запущен на dev машине

**Что Forge делает:**
1. Установит `electron` + `steamworks.js` через npm
2. Создаст `main.js` (Electron main) и `preload.js` (IPC bridge → `window.SteamSDK`)
3. Прогонит 5 validators: `appid-file`, `electron-init`, `binary-deps`, `cloud-paths`, `depots-config`
4. Соберёт `dist/win-unpacked/` через `electron-builder`
5. Подготовит `app_build.vdf` + `depot_build.vdf` для SteamPipe upload
6. Покажет команду для `steamcmd` upload

**Что Forge НЕ делает:**
- Не платит Steam Direct fee — это твоя ручная оплата на partner.steamgames.com
- Не добавляет VAC anti-cheat (требует C++ integration, не steamworks.js)
- Не управляет sale schedule — Steam Sales bookings делаются вручную через Partner panel

**Steam features через `window.SteamSDK`:**
- `achievement.activate(name)` / `isActivated` / `clear`
- `cloud.writeFile(name, content)` / `readFile` / `fileExists`
- `overlay.activateToWebPage(url)`
- `getName()`, `getSteamId()`

Шаблон `platforms/steam/templates/electron-main.js` корректно вызывает `restartAppIfNecessary` ДО `init` — без этого если юзер запустит .exe не из Steam, achievements/cloud не работают.

---

## VK Play (новое в v4.7) — vkplay.ru, **НЕ** VK Mini Apps

| Что | VK Mini Apps (`/release-vk`) | VK Play (`/release-vkplay`) |
|---|---|---|
| Где живёт | vk.com внутри VK социалки | vkplay.ru — отдельный игровой портал |
| URL шаблон | `vk.com/app{id}` | `vkplay.ru/app/{GMRID}` |
| SDK | VK Bridge (postMessage с vk.com) | VKPlay JS API (postMessage + secret-key signing) |
| Аудитория | VK социал, ~80M MAU | Геймеры, оверлап с Steam/Yandex |
| Auth | VK access_token | VK Play user_id + signature (md5 + secret) |
| Payments | VK Pay (rubles) | VK Play Wallet (rubles) |

Если есть и то и то — **обычно делают версию для каждой**, потому что разные требования и разная аудитория.

```
cf
/release-ready vkplay
/release-vkplay
```

Перед стартом проверь:
- ☐ Developer account на developers.vkplay.ru/welcome (1-3 дня)
- ☐ Game card создана (название, описание, скриншоты, иконка)
- ☐ App ID + Secret Key получены
- ☐ HTTPS hosting готов (Timeweb/Selectel/etc)
- ☐ Юр. лицо/ИП оформлены
- ☐ Payment system enabled (manual: email integration@vk.team)

**Critical security: secret_key ТОЛЬКО на сервере.** В client'ом коде — никогда. Если оно туда попадёт, attacker может forge'нуть любой `uid` и grant'нуть себе any item.

**Auth flow:**
1. VK Play открывает iframe с твоим URL + query params (`uid`, `hash`, `app_id`, `time`)
2. Client читает params → POST на твой `/api/auth/vkplay`
3. Server verifies hash через `md5(sorted_params + secret_key)` и `timingSafeEqual`
4. Server issues sessionToken
5. Client использует sessionToken для всех subsequent API calls

**Payment flow:**
1. Client вызывает `VKPlaySDK.openPaymentDialog({sku, amount, currency: 'RUB'})`
2. VK Play показывает диалог оплаты юзеру
3. После оплаты VK Play делает webhook на твой `/api/webhook/vkplay-payment`
4. Server verifies hash → idempotent grant по `order_id` → respond `{status: 'success'}`

Шаблон `platforms/vkplay/templates/sign-helper.mjs` использует `crypto.timingSafeEqual` против timing attacks. Шаблон `auth-server-example.js` показывает Express endpoint с `vkplayAuthMiddleware`.

5 validators:
- `iframe-init` — VKPlaySDK script + init() call
- `signature-check` — secret_key НЕ в client bundle (security CRITICAL)
- `auth-params` — uid/hash чтение и server validation
- `payment-flow` — `openPaymentDialog`, не `VKWebAppShowOrderBox` (то VK Mini Apps!)
- `https-only` — нет http:// в bundle

---

## Сборка на ВСЕ платформы сразу (новое в v4.3)

```
cf
/release all
```

Claude через `ask_user_input` спросит:

**1. На какие платформы?** (multi-select)
- ☐ Yandex Games
- ☐ VK Mini Apps
- ☐ Telegram Mini App
- ☐ Одноклассники (OK)
- ☐ MAX мессенджер
- ☐ RuStore Android
- ☐ Свой HTTPS-хостинг
- ☐ Steam (Electron + steamworks.js)
- ☐ VK Play (vkplay.ru, не путать с VK Mini Apps)

**2. Режим выполнения?** (single-select)
- ☐ Sequential (default, по одной платформе с остановками)
- ☐ Agent Teams (параллельно, experimental)

### Sequential режим — классика

Claude идёт по платформам по одной: yandex → stop → "продолжи" → vk → stop → ... После каждой — отчёт и mandatory stop, ждёт твоего "продолжи".

Стоимость: сумма стоимостей `/release {platform}`.

### Agent Teams режим — новое в v4.3

Claude запускает несколько полноценных сессий параллельно. Каждый teammate — отдельный Claude Code со своим контекстом, читает `CLAUDE.md` + свой subagent из `.claude/agents/{platform}-builder.md`.

**Требования:**
- Claude Code v2.1.32+ (`claude --version`)
- Opus 4.6 или выше (у тебя 4.7 — ок)
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (уже в `.claude/settings.json` Forge)

**Управление:**
- `Shift+↓` / `Shift+↑` — переключиться между teammate'ами в одном окне (in-process режим)
- `Ctrl+T` — общий task list: что у кого в работе, что завершено
- Можно написать teammate'у напрямую, он ответит через mailbox
- Если установлен `tmux` — Claude Code может запустить split-pane режим (каждый teammate — своя панель)

**Обязательный cleanup:**
```
Ask all teammates to shut down, then clean up the team.
```
Без этого в `~/.claude/teams/` останутся висящие конфиги.

**Когда Agent Teams НЕ стоит использовать:**
- 1-2 платформы — overhead координации съест выгоду
- `delegate mode` — **не включай**, ломает permissions у teammate'ов (они наследуют ограничения lead'а и перестают читать файлы — задокументировано в официальных docs)
- Сложный единичный баг — один teammate лучше команды

**Известные ограничения** (из [docs.claude.com/agent-teams](https://code.claude.com/docs/en/agent-teams)):
- `/resume` и `/rewind` не восстанавливают in-process teammate'ов после resume — может потребоваться пересоздать команду
- Task status иногда лагает — если задача «застряла», проверь фактический статус и обнови вручную
- Shutdown медленный — teammate завершает текущий tool call перед выходом
- One team per session, no nested teams

**Стоимость токенов:** ×3-5 от sequential, но реальное wall-clock время меньше в разы для 3+ платформ.

---

## Стандартные оркестраторы

Forge добавил 3 оркестратора для ситуаций где раньше было "каждый раз по-разному".

### Расширить уже работающую игру → `/deepen-game`

Игра технически работает, но feels thin — 5 минут контента, нет причины вернуться, 5 уровней, без прогрессии.

```
cd ..\my-game
cf
/deepen-game
```

Что сделает Claude:
1. **Research** — изучит 3-5 успешных игр в том же жанре через `/research-references`
2. **Gap analysis** — таблица "у нас vs конкуренты" в `wiki/plan/{Project}-deepen.md`
3. **Execution plan** — приоритеты + какие skills надо звать + expected LOC + stop points
4. **Execute iteratively** — с mandatory stops между приоритетами
5. **Final report** — before/after metrics (сколько уровней было/стало, прогрессия, retention hooks)

**Чёткий scope.** Разрешено звать: `game-design`, `level-design`, `visual-upgrade`, `mobile-game-ui`, `sound-design`. **Запрещено:** SDK integrations, ads, localization, `release-*` — это release-phase, не content-phase. Смешивание ломает изоляцию.

Отличие от `/full-pipeline`: полный пайплайн — для raw prototype → release-ready (включая SDK). `/deepen-game` — для уже работающей игры которую надо углубить, без SDK трогания.

### Проверить всё перед релизом → `/release-ready`

Read-only checklist. **Не строит, не грузит** — только проверяет prerequisites.

```
/release-ready yandex vk telegram
```

Проверит:
- WorkProgress директория существует
- SDK wrapper интегрирован
- Debug код убран
- i18n coverage (Yandex: 13 языков обязательно)
- console.log minimized
- Store listing ≥120 chars RU/EN + 3 скриншота + 1024×1024 иконка (Yandex)
- Pre-submit validators проходят
- Runtime-test проходит (где есть)
- Keystore на месте (Android)
- Pay SDK receipt validation smoke test (RuStore)

Выдаёт **red/yellow/green per platform** + aggregate summary + конкретные "Next action: /fill-yandex" per issue. Никакого binary "готово / не готово" — всегда явный список что именно чинить и каким скилом.

Workflow: `/release-ready` → список проблем → чинишь → снова `/release-ready` → всё зелёное → `/release all`.

### Выбрать backend stack → `/choose-backend-stack`

4 вопроса через `ask_user_input` → **одна из 5 канонических стеков**:

| Stack | Когда | Cost |
|---|---|---|
| **A** Node+SQLite+Timeweb | default, B2C, <100 RPS, RU users | ~750₽/мес |
| **B** Node+PostgreSQL | >100 RPS или relational-heavy | ~2300₽/мес |
| **C** Cloudflare Workers+D1+R2 | international, serverless | pay-per-request |
| **D** Docker Compose | multi-service или user wants Docker | varies |
| **E** Яндекс Cloud Functions | 152-ФЗ + scale-to-zero | pay-per-request |

Вопросы:
1. Persistence нужна? (yes/ephemeral/unknown)
2. Real-time нужен? (critical/no/future)
3. Ожидаемая RPS? (<10 / 10-100 / 100-1000 / 1000+ / unknown)
4. 152-ФЗ compliance? (RU only / international / mixed)

Ответы сводятся в decision table → одна рекомендация с cost estimate + ссылкой на готовый reference код (для Stack A это `.claude/skills/rustore-publish/reference/` — auth.js, sync.js, schema.sql etc).

Escape hatch: если хочешь Go+NATS+Cassandra — skill честно говорит "outside canonical 5, no reference code" и логирует решение в `wiki/decisions/`.

### Research-first improvement

5 skills обновлены: `visual-upgrade`, `game-polish`, `game-design`, `level-design`, `monetization-design`. Каждый теперь **обязательно** начинается с Phase 0 — вызов `/research-references` с темой жанра + специфика.

Никакого больше generic "add gradient + shadow + glow" без изучения топа roguelike'ов в канвасе. Никакого "add 3 difficulty levels" без понимания как match-3 делают progression.

**Skip по команде:** "без research" / "skip research" / или если `wiki/research/{Project}-references.md` моложе 14 дней.

---



### RuStore отклонил

```
cd ..\my-app
cf

RuStore отклонил APK. Причина:
«Приложение не адаптировано под мобильные устройства.
Элементы интерфейса слишком мелкие на экранах 5-6 дюймов.»

Исправь:
1. Прочитай скил mobile-ready — сделай полный аудит
2. Прочитай скил mobile-game-ui — увеличь все touch targets до 48px+
3. Пересобери APK: /build-apk
```

### Яндекс Игры отклонили

```
cd ..\my-game
cf

Яндекс модерация отклонила. Причины:
1. «Игра не определяет язык пользователя» — locale detection
2. «Нет паузы при показе рекламы» — звук продолжает играть
3. «Элементы обрезаются на 375×667» — не responsive

Прочитай скил yandex-sdk-integration — секция 8 причин отказа.
Исправь все 3 проблемы. Потом перезапусти верификацию:
bash scripts/verify.sh src/
```

### Типичные причины отказа и что делать

```
# Модератор: «Нет политики конфиденциальности»
Прочитай скил rustore-publish — сгенерируй privacy policy

# Модератор: «Краш при повороте экрана»
Прочитай скил mobile-adapt — добавь обработку resize + orientation change

# Модератор: «Приложение не работает offline»
Прочитай скил pwa-convert — добавь service worker + manifest

# Модератор: «Слишком медленная загрузка»
Прочитай скил performance (из skills/stack/) — оптимизируй ассеты,
добавь lazy load, сжати изображения

# Модератор (Яндекс): «Нет всех 13 языков»
node scripts/verify-i18n.mjs src/
# Покажет какие языки/строки пропущены. Исправь.

# Модератор (Яндекс): «localStorage вместо облачных сохранений»
grep -rn "localStorage" src/
# Замени ВСЕ на player.setData/getData из SDK.
```

---

## Параллельная работа

### Три проекта одновременно

Открой 3 терминала:

**Терминал 1:**
```powershell
cd E:\Projects\shooter-game
cf
/continue
# работаешь над игрой
```

**Терминал 2:**
```powershell
cd E:\Projects\my-subs
cf
/continue
# работаешь над подписками
```

**Терминал 3:**
```powershell
cd E:\Projects\notes-app
cf
/continue
# работаешь над записочной
```

Каждый проект изолирован: свои файлы, свой CONTEXT.md, свой git branch.

### Быстро посмотреть статус всех

```powershell
cd E:\Projects\project-forge
.\scripts\forge.ps1 status
```

### Использовать Agent Teams в проекте

```
cd ..\shooter-game
cf

Создай команду из 3 агентов:
- Агент 1: добавь систему частиц из скила visual-upgrade
- Агент 2: добавь 12 звуков из скила sound-design
- Агент 3: добавь level design из скила level-design
Работайте параллельно, каждый в своём worktree.
```

---

## Добавление нового SDK / процесса навсегда

Главная фича forge — он растёт вместе с тобой. Добавил один раз — все проекты умеют.

### Пример: добавить VK Ads SDK

```
cd E:\Projects\project-forge
cf

/learn-sdk VK Ads SDK для Android-приложений
```

Claude сделает:
1. Веб-поиск документации VK Ads SDK
2. Изучит: установка, инициализация, форматы рекламы, callbacks
3. Определит какие ключи нужны (App ID, Block ID) и где их взять
4. Создаст `.claude/skills/vk-ads/SKILL.md` с рабочим кодом
5. Создаст `.claude/skills/vk-ads/references/vk-ads-api.md` с детальным API
6. Добавит credentials в `credentials-check` (VK Ads App ID, Block IDs)
7. Обновит `CATALOG.md`

После этого в ЛЮБОМ проекте:
```
cf
Прочитай скил vk-ads и интегрируй рекламу: баннер внизу + rewarded за жизни
```

Claude:
- Загрузит скил → увидит что нужен VK Ads App ID
- Спросит: «Дай VK Ads App ID. Получить: https://ads.vk.com → ...»
- Ты даёшь → он вставляет в config.js
- Интегрирует рекламу по инструкции из скила

### Пример: добавить новый магазин (AppGallery)

```
/learn-sdk Huawei AppGallery публикация Android-приложений
```

### Пример: добавить процесс (не SDK)

```
/add-pipeline CI/CD через GitHub Actions: линт + тест + сборка + деплой
```

```
/add-pipeline автоматические скриншоты для магазинов через Playwright
```

```
/add-pipeline генерация политики конфиденциальности под российское законодательство
```

### Что создаётся при `/learn-sdk` и `/add-pipeline`

```
.claude/skills/{name}/
├── SKILL.md              ← Инструкция + код (Claude читает при вызове)
└── references/
    └── {name}-api.md     ← Детальная документация (читает по необходимости)

+ Обновления:
  credentials-check  ← новые ключи/ID
  CATALOG.md         ← чтобы автоподбор работал
  scripts/           ← автоматизация (если нужна)
  templates/         ← шаблоны (если нужны)
```

### Как посмотреть все доступные скилы

```
cf
/help                    # покажет все slash-команды
```

Или вручную:
```powershell
dir .claude\skills\ /AD /B     # Windows
ls .claude/skills/              # Linux/Mac
```

---

## Шпаргалка команд

### Управление проектами

| Действие | Команда |
|----------|---------|
| Новый проект | `.\new-project.bat name --type game|app --title "описание"` |
| Список проектов | `.\scripts\forge.ps1 list` |
| Статус всех | `.\scripts\forge.ps1 status` |
| Открыть проект | `cd ..\name && cf` |
| Удалить проект | `.\scripts\forge.ps1 remove name` |

### Внутри Claude Code — Общие

| Команда | Что делает |
|---------|------------|
| `/game {идея}` | Игровой проект (new / analyze / redesign / release) |
| `/app {идея}` | Приложение (то же) |
| `/continue` | Продолжить с прошлой сессии |
| `/status` | 9 фаз по machine markers + артефактам; STOP-point, AI Studio, Project Health |
| `/plan` | Дорожная карта |
| `/review` | Аудит качества кода |
| `/doc all` | Обновить документацию |
| `/handoff` | Сохранить контекст |
| `/team build` | 3 параллельных агента |

### Внутри Claude Code — Полировка

| Команда | Для чего |
|---------|----------|
| `/improve` | Полировка ИГРЫ (визуал + звук + геймплей) |
| `/polish-app` | Полировка ПРИЛОЖЕНИЯ (UX + data + notifications) |
| `/visual-upgrade` | Только графика |
| `/sound-design` | Только звук |
| `/game-design` | Только геймплей |
| `/level-design` | Только уровни |
| `/mobile-adapt` | Только мобильное управление |

### Внутри Claude Code — Релиз

| Команда | Для чего |
|---------|----------|
| `/convert` | HTML → Android APK |
| `/build-apk` | Собрать APK для RuStore |
| `/yandex-release` | Полный пайплайн Яндекс Игр |
| `/deploy` | Деплой на сервер |
| `/rustore-publish` | Подготовка к RuStore |

### Внутри Claude Code — Расширение forge

| Команда | Для чего |
|---------|----------|
| `/learn-sdk {name}` | Изучить SDK, создать скил навсегда |
| `/add-pipeline {desc}` | Добавить новый процесс/workflow |
| `/write-skill {desc}` | Создать скил вручную |

### Текстовые команды (не slash)

Не все задачи покрыты slash-командами. Можно просто описать задачу:

```
# Точечные доработки
Прочитай скил app-ux-polish и добавь empty state для списка подписок

# Исправление бага
В файле src/game.js на строке 240 — при score > 999 число вылезает за HUD. Исправь.

# Оптимизация
Игра тормозит после 15 волны. Прочитай скил game-polish (секция performance)
и оптимизируй: object pooling, offscreen culling, лимит частиц.

# Подготовка к модерации
Прочитай скил yandex-sdk-integration — секция 8 причин отказа.
Проверь мою игру по каждому пункту.
```

---

## Жизненный цикл проекта — от идеи до публикации

```
ИДЕЯ
  │
  ├─ /game или /app ──────────── Каркас + первая фича (router auto-detects)
  │
  ├─ /continue (итерации) ────── Функционал
  │
  ├─ /improve или /polish-app ── Полировка
  │
  ├─ /review ─────────────────── Аудит кода
  │
  ├─ Полный аудит (см. выше) ─── Всё по чеклисту
  │
  ├── ПЛАТФОРМА? ──┬── RuStore ──── /convert → /build-apk → /rustore-publish
  │                ├── Яндекс ──── /yandex-release (SDK + 13 языков)
  │                └── Web ──────── /deploy
  │
  ├─ Правки модераторов ──────── Исправить → пересобрать → перезалить
  │
  └─ Обновления ──────────────── /continue → новые фичи → пересборка
```
