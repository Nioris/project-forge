---
name: add-pipeline
kind: tactical
description: "Add a new permanent pipeline, workflow, or capability to Project Forge. Beyond SDKs — any repeatable process: new store integration, new build target, new testing flow, new deployment method. Use when user says 'добавь процесс', 'новый пайплайн', 'add pipeline', 'хочу чтобы forge умел', 'на постоянку', 'навсегда'."
---

# Add Pipeline — Новый постоянный процесс

## Purpose
Добавить в Project Forge ЛЮБОЙ новый повторяемый процесс:
новый магазин, новый SDK, новый тип сборки, новый workflow.
После добавления — доступен во ВСЕХ проектах навсегда.

## Arguments
`$ARGUMENTS`: описание того, что нужно добавить. Примеры:
- `публикация в VK Mini Apps`
- `сборка PWA с Telegram Mini App`
- `интеграция Sentry для отлова ошибок`
- `CI/CD через GitHub Actions`
- `автоматические скриншоты для магазинов`

---

## Process

### 1. Исследование

Изучить тему через веб-поиск:
- Официальная документация
- Best practices
- Частые ошибки
- Требования (ключи, аккаунты, инструменты)

Результат: заметки по структуре из `/learn-sdk` Step 1.

### 2. Декомпозиция — что создать

Определить набор артефактов:

| Артефакт | Когда нужен | Пример |
|----------|------------|--------|
| **Skill** (SKILL.md) | Всегда | Инструкция + код |
| **Reference** (references/*.md) | Если API большой | Полная документация |
| **Script** (scripts/*.sh) | Если есть автоматизация | Сборка, верификация |
| **Template** (templates/*) | Если есть boilerplate | HTML/JS шаблоны |
| **Agent** (.claude/agents/*.md) | Если задача для субагента | Специализированный агент |
| **Hook** (.claude/hooks/*.sh) | Если нужна автоматизация | Auto-lint, auto-test |
| **Credentials** | Если нужны ключи | Обновить credentials-check |

### 3. Создание

Для каждого артефакта:

**Skill** → `.claude/skills/{name}/SKILL.md`
```markdown
---
name: {kebab-case}
description: "{Что делает}. {Когда использовать}. Triggers on: {ключевые слова на RU и EN}."
---
# {Name}
## Purpose ...
## Credentials Required (если есть) ...
## Step 1-3 ...
## Non-Negotiable Acceptance Criteria ...
```

**Reference** → `.claude/skills/{name}/references/{detail}.md`
Подробная документация, примеры API, таблицы параметров.
Claude читает только когда нужны детали — не загружает контекст.

**Script** → `scripts/{name}.sh` или `scripts/{name}.mjs`
Автоматизация: сборка, верификация, деплой.
Должен работать standalone: `bash scripts/{name}.sh path/to/project`

**Template** → `templates/{name}/*`
Файлы-шаблоны для копирования в проект.
Claude копирует и адаптирует, не пишет с нуля.

**Agent** → `.claude/agents/{name}.md`
Субагент для специализированной задачи.
Своё контекстное окно, своя изоляция.

**Hook** → `.claude/hooks/{name}.sh`
Автоматическое действие на событие Claude Code.
Обновить `.claude/settings.json` после создания.

### 4. Интеграция в forge

Обязательные обновления:

```
[ ] skills/CATALOG.md — добавить в таблицу
[ ] credentials-check/SKILL.md — если нужны ключи
[ ] CLAUDE.md — если меняется общий пайплайн
[ ] GUIDE.md — добавить инструкцию
[ ] README.md — обновить список skills/commands
```

### 5. Тест

Создать тестовый проект и проверить:
```
.\scripts\forge.ps1 new test-integration "тест нового скила"
cd ..\test-integration
cf
# Попросить Claude использовать новый скил
```

### 6. Отчёт

```
════════════════════════════════════
  NEW PIPELINE: {name}
════════════════════════════════════

Created:
  Skill:      .claude/skills/{name}/SKILL.md
  Reference:  .claude/skills/{name}/references/*.md
  Script:     scripts/{name}.sh (если создан)
  Template:   templates/{name}/* (если создан)
  Agent:      .claude/agents/{name}.md (если создан)

Updated:
  CATALOG.md:        ✓ added to table
  credentials-check: ✓ {N} new credentials
  GUIDE.md:          ✓ section added

Available in ALL projects via:
  /{name}
  or: "Прочитай скил {name} и примени"
════════════════════════════════════
```

## Non-Negotiable
- [ ] Исследование проведено (веб-поиск, не выдумки)
- [ ] SKILL.md содержит рабочий код
- [ ] credentials-check обновлён (если есть ключи)
- [ ] CATALOG.md обновлён
- [ ] Протестировано в тестовом проекте
