# Memory System — how Project Forge v3 keeps context across sessions

## Проблема

Правила и контекст живут в окне Claude Code. Когда оно компактится, правила
обесцениваются — агент дрейфует: перестаёт обновлять документацию,
редактирует файлы вне плана, забывает решения. Никакие `NEVER`-формулировки
внутри контекста это не чинят.

## Решение

**Разделение памяти на три слоя с разными гарантиями:**

| Слой | Где живёт | Кто обновляет | Кто читает | Гарантия |
|------|-----------|---------------|------------|----------|
| Рабочий пульс | `wiki/_current.md` | Claude после каждого шага | Инжектится в контекст целиком на каждом старте | Маленький (<3KB) — не обрежется |
| План | `wiki/plan/*.md` | Claude при постановке задач | Хуки парсят для drift-detection; сводка инжектится | Машиночитаемый YAML frontmatter |
| Обзор | `wiki/_map.md` | Claude раз в сессию | Инжектится с урезанием 8KB | Живёт долго, описывает проект целиком |

**Плюс семь хуков**, которые вызываются CLI-ом снаружи — их нельзя пропустить
или забыть, потому что они не зависят от состояния окна.

## Архитектура v3

```
project/
├── .claude/
│   ├── settings.json              ← регистрирует 7 hook entries + statusLine
│   ├── context-essentials.md      ← "липкая записка" с правилами и триггерами
│   └── hooks/
│       ├── session-start.mjs      ← startup/resume/compact
│       ├── block-dangerous.mjs    ← безопасность bash
│       ├── plan-check.mjs         ← drift warning при Write/Edit
│       ├── post-tool-capture.mjs  ← семантические логи в sessions/
│       ├── stop-flush.mjs         ← делегирует аудит
│       ├── wiki-audit.mjs         ← 7 проверок (lib + CLI)
│       ├── status-line.mjs        ← активная задача в статус-баре
│       └── lib/parse-plan.mjs     ← общий парсер plan/*.md
└── wiki/
    ├── _current.md                ← 20-30 строк активного состояния
    ├── plan/                      ← одна задача = один файл
    ├── _map.md                    ← обзор
    └── sessions/YYYY/MM/DD.md     ← автологи
```

## Хуки детально

### SessionStart — `session-start.mjs`

Читает `source` из stdin (`startup` / `resume` / `compact`).

Инжектит в контекст:
1. Баннер компакции (если `source === "compact"`)
2. `context-essentials.md` — правила и триггеры
3. `wiki/_current.md` — пульс (целиком)
4. Сводку плана — `in_progress` задачи с `next` шагом
5. `wiki/_map.md` — обзор проекта (обрезается до 8KB если больше)
6. Последние 3 дня логов из `sessions/` (читает оба лэйаута — старый плоский и новый нестед)
7. Напоминание протокола

Суммарно ~15-25KB. Достаточно, чтобы Claude сразу ориентировался после `/compact`.

### PreToolUse:Bash — `block-dangerous.mjs`

Блокирует разрушительные команды: `rm -rf /`, `dd if=`, `mkfs`, fork bomb,
`chmod -R 777 /`. Предупреждает о рекурсивных `rm -rf` не на `.`.

### PreToolUse:Write/Edit — `plan-check.mjs`

Парсит `wiki/plan/*.md`, находит `status: in_progress` задачи, собирает их
`files:` списки. Если редактируемый файл не входит — инжектит в контекст
предупреждение с активными задачами и тремя вариантами действия.

**Не блокирует** — это информационный сигнал. Энфорсмент на Stop.

Пропускает:
- Файлы в `wiki/` — доки всегда в скоупе
- Случаи без плана
- Случаи с пустым списком `in_progress` (инжектит другое предупреждение)

### PostToolUse:Write/Edit/Bash — `post-tool-capture.mjs`

Пишет в `wiki/sessions/YYYY/MM/DD.md` с обогащением:

**Классификация bash:**
```
git:commit · git:push · git · install · build · test · dev
build:android · build:docker · verify · deploy · script · shell
```

**Интент из `tool_input.description`:**
```
- 14:32:10 **Edit** [Q1-001] `src/auth/vk.ts` — wire VK Bridge token
```

**Группировка повторов:** повторный Edit того же файла в течение 5 минут →
счётчик `×2`, `×3`, не дублируется строка.

**Тэг активной задачи:** каждая запись помечается `[Q1-001]` если файл
входит в `in_progress` задачу.

**Авто-линт:** для `.js/.ts/.svelte/.css` если есть локальный `eslint`/`prettier`.

### Stop — `stop-flush.mjs` → `wiki-audit.mjs`

Делегирует в `wiki-audit.mjs::auditToday()`. Если findings есть — `{decision: "block", reason: "..."}` с нумерованным списком.

**7 проверок:**
1. Файлы в `src/`/`app/`/`lib/`/`scripts/` без `wiki/features/<n>.md`
2. `feat:` коммиты сегодня не в `wiki/changelog.md`
3. Build/deploy команды сегодня без записи в `wiki/deploy-log.md`
4. `wiki/_map.md` не трогался с начала сессии
5. `wiki/_current.md` отсутствует или старее session-лога
6. Редактируемые файлы не входят ни в одну `plan/*.md` → `files:`
7. `in_progress` задачи с полностью закрытым acceptance (надо → `done`)

**Нет "раз в день".** Каждая попытка Stop проходит аудит пока не чисто.

**Escape hatch:** `FORGE_SKIP_AUDIT=1` → пропустить, но записать в session log
`**⚠ bypass**`. Не тихий.

### StatusLine — `status-line.mjs`

Читает `wiki/plan/*.md`, ищет единственную `in_progress` задачу, выводит:
```
[Q1-001] VK Bridge auth · 2/4 · → persist to dexie
```

Если `in_progress` две или больше → `⚠ 2 tasks in_progress: Q1-001, Q1-002 — focus one`.
Если ни одной → fallback на `Session goal` из `_current.md`.

Вызывается Claude Code часто, поэтому работает за миллисекунды.

## Два вспомогательных модуля

### `lib/parse-plan.mjs` — общий парсер

Экспортирует:
- `parseFrontmatter(raw)` — минимальный YAML парсер (строки, inline-массивы, dashed-списки)
- `extractAcceptance(raw)` — считает `[ ]`/`[x]` в теле файла
- `loadPlan()` — список всех задач, отсортированный `in_progress → blocked → planned → done`
- `loadActive()` — только `in_progress`
- `isInScope(path, tasks)` — проверяет включение файла в `files:`

Без зависимостей, без YAML-библиотек. CLI-режим для ручной проверки:
```bash
node .claude/hooks/lib/parse-plan.mjs
```

### `scripts/migrate-sessions.mjs` — одноразовая миграция

Переносит старый плоский `wiki/sessions/YYYY-MM-DD.md` в новый нестед
`wiki/sessions/YYYY/MM/DD.md`. Безопасно запускать многократно. Если целевой
файл существует — источник не трогает, предупреждает.

```bash
node scripts/migrate-sessions.mjs            # migrate
node scripts/migrate-sessions.mjs --dry-run  # preview
```

Setup-скрипты (`setup.sh`, `setup.ps1`) запускают это автоматически, если
обнаруживают старый лэйаут.

## Обратная совместимость

Читатели сессий (`session-start.mjs`, `wiki-audit.mjs`) поддерживают
**оба лэйаута** — плоский и нестед. Это позволяет:
- Обновить хуки без обязательной миграции
- Постепенно перейти (новые дни записываются в нестед, старые читаются из плоского)
- Дешёвая миграция когда удобно

## Obsidian — единая вики по всем проектам

Без изменений с v2. См. скрипт `scripts/sync-to-obsidian.ps1`.

Obsidian — **read-only зеркало для человека**. Claude в него не ходит.

## Tuning

### Хуки слишком шумные

**plan-check много предупреждает** — значит план не соответствует реальности.
Решение: расширить `files:` активной задачи или разбить на подзадачи.

**stop-flush блокирует через чур** — посмотри на findings, это не false-positives,
это реальные пропуски в документации. Если одно конкретное правило не нужно —
отредактируй `wiki-audit.mjs` и закомментируй нужную проверку.

**Session logs слишком шумные** — в `settings.json` измени matcher:
```json
"matcher": "Write|Edit|MultiEdit"
```
Уберёт логирование Bash.

### Хуки не срабатывают

- `claude` должен запускаться из корня worktree (не из подпапки) — хуки
  используют `git rev-parse --show-toplevel` чтобы найти корень
- Node.js 18+ нужен — хуки используют ES modules
- На Windows убедись что PowerShell не блокирует `.mjs` (обычно не блокирует)

### Диагностика

```bash
# Синтаксис всех хуков
for f in .claude/hooks/*.mjs; do node --check "$f"; done

# Что покажет status-line
node .claude/hooks/status-line.mjs

# Текущий план
node .claude/hooks/lib/parse-plan.mjs

# Ручной аудит
node .claude/hooks/wiki-audit.mjs
```

## Миграция с v2

Если у тебя был v2 проект:

```bash
# 1. Бэкап
cp -r .claude .claude.bak
cp -r wiki wiki.bak

# 2. Наложить v3
unzip -o project-forge-v3.zip -d /tmp/forge-v3
cp -r /tmp/forge-v3/.claude/* .claude/
cp -r /tmp/forge-v3/scripts/* scripts/
cp -r /tmp/forge-v3/wiki/plan ./wiki/
cp /tmp/forge-v3/wiki/_current.md.template ./wiki/
cp /tmp/forge-v3/CLAUDE.md .
cp /tmp/forge-v3/README*.md .
cp /tmp/forge-v3/setup.sh /tmp/forge-v3/setup.ps1 .

# 3. Удалить устаревший хук (если был)
rm -f .claude/hooks/post-compact-restore.mjs

# 4. Запустить setup — он сам мигрирует sessions и создаст _current.md
./setup.sh   # или powershell -ExecutionPolicy Bypass -File setup.ps1

# 5. Перенести текущие задачи из wiki/_map.md "Next" в отдельные wiki/plan/*.md
# (это делается руками один раз или скажи Claude: "разнеси Next в plan/")
```

## Design принципы

**Три-файловая память, а не одна:** разделение "что сейчас" (маленькое, не обрезается)
от "что вообще" (большое, обрезается). Гарантия что критичное выживает компакцию.

**План машиночитаемый:** YAML frontmatter позволяет хукам делать drift-detection.
Без этого любой блок — эвристический и шумный.

**Блок на Stop, предупреждение на Write:** прерывать поток работы — плохо.
Окно между "дрейфом" и "остановкой" даёт Claude шанс самому заметить и поправиться
(через инжектированный warning), не ломая пользователю опыт.

**Append-only вики:** удаление истории ломает восстановление контекста. Всё что
было важно — остаётся.

**Нестед sessions:** плоская папка забьётся за два месяца и замедлит читатели.
`YYYY/MM/DD.md` масштабируется и даёт естественную группировку.

**No-deps хуки:** Node.js без `npm install` в глобальной или локальной — работает
на чистом системном Node. Проекты Forge могут быть python/rust/что угодно, хуки
от этого не зависят.

---

## v4 note — платформы ортогональны памяти

В v4 добавлены платформенные адаптеры (`platforms/yandex/`, `platforms/telegram/`, etc).
Они не влияют на систему памяти — это отдельный слой.

- Память (`wiki/_current.md`, `wiki/plan/`, `wiki/_map.md`, сессии, хуки) — **общая** для всего проекта, не платформенная.
- Платформы — это способ ВЫВОДА: один и тот же полированный код из `WorkProgress/` собирается в разные `Release/{Project}/<platform>/` артефакты.
- Хуки `plan-check` и `wiki-audit` работают по-прежнему против единой памяти — им безразлично сколько платформ.

Хорошая практика: при `/release all` создаётся задача в `wiki/plan/` с `files:`, куда входит `WorkProgress/{Project}/`. После успешной сборки — `status: done` и запись в `wiki/changelog.md` с перечнем платформ. Так весь маршрут виден в одной истории.
