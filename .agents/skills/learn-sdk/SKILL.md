---
name: learn-sdk
kind: tactical
description: "Research a new SDK, understand its requirements, create full integration skill with credentials checklist, pipeline, and documentation. Use when user says 'добавь SDK'…"
---

> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.

# Learn SDK — Research → Understand → Create Skill

## Purpose
Пользователь хочет добавить новый SDK/сервис на постоянку. Этот скил:
1. Изучает документацию SDK
2. Понимает какие ключи/ID нужны и где их взять
3. Создаёт полный скил для интеграции
4. Добавляет credentials в чеклист
5. Все проекты получают доступ к новому скилу

## Arguments
`[INVOCATION_INPUT]`: название SDK или сервиса. Примеры:
- `VK Ads SDK`
- `Firebase Analytics`
- `Telegram Bot API`
- `RuStore Push SDK`
- `AppMetrica`
- `Yandex Maps SDK`

---

## Step 1: Research — Изучить документацию

```
ЗАДАЧА: Изучить SDK "{name}" максимально глубоко.

ИСТОЧНИКИ (приоритет):
1. Официальная документация SDK (веб-поиск)
2. GitHub репозиторий SDK (README, примеры)
3. Quickstart / Getting Started гайды
4. API Reference (endpoints, методы)
5. Примеры интеграции (sample projects)

ЧТО НУЖНО ПОНЯТЬ:
┌─────────────────────────────────────────────────┐
│ 1. ПОДКЛЮЧЕНИЕ                                  │
│    - Как установить (npm, gradle, cdn, script)  │
│    - Минимальная версия (Android API, Node, etc)│
│    - Зависимости (другие библиотеки)            │
│                                                  │
│ 2. CREDENTIALS                                   │
│    - Какие ключи/ID нужны                       │
│    - Где их получить (URL кабинета)              │
│    - Какие секретные (в .env) vs публичные       │
│    - Есть ли тестовые ключи для разработки       │
│                                                  │
│ 3. ИНИЦИАЛИЗАЦИЯ                                 │
│    - Код инициализации (минимальный рабочий)     │
│    - В какой момент вызывать (до/после DOM)      │
│    - Обработка ошибок инициализации              │
│                                                  │
│ 4. ОСНОВНЫЕ МЕТОДЫ                               │
│    - 5-10 самых важных методов с примерами       │
│    - Формат параметров и ответов                 │
│    - Callback'и / Promise'ы / события            │
│                                                  │
│ 5. ПОДВОДНЫЕ КАМНИ                               │
│    - Частые ошибки из issues/stackoverflow       │
│    - Ограничения (rate limits, размеры, etc)     │
│    - Особенности мобилки vs десктопа             │
│    - Причины отказа модерации (если есть)        │
│                                                  │
│ 6. ТЕСТИРОВАНИЕ                                  │
│    - Как проверить что SDK работает              │
│    - Тестовый режим / sandbox                    │
│    - Debug-логи                                  │
└─────────────────────────────────────────────────┘
```

Результат: структурированные заметки по всем 6 пунктам.

## Step 2: Create Skill — Создать скил

На основе исследования создать файл:

```
.claude/skills/{sdk-name}/
├── SKILL.md              ← Главный скил (инструкции + код)
└── references/
    └── {sdk-name}-api.md ← Полная документация API
```

### Формат SKILL.md:

```markdown
---
name: {sdk-name}
description: "{SDK Name} integration: {что делает}. Use when {когда использовать}. Triggers on: {ключевые слова}."
---

# {SDK Name} Integration

## Purpose
{Что этот SDK делает и зачем нужен — 2-3 предложения}

## Credentials Required
{Перечислить ВСЕ ключи/ID с инструкциями где взять}

| Credential | Где получить | Куда положить | Секретный? |
|------------|-------------|---------------|------------|
| API Key | https://... → Раздел → Кнопка | config.js → SDK_API_KEY | Нет |
| Secret Key | https://... → Настройки | .env → SDK_SECRET | ДА |

## Step 1: Install
{Точные команды установки}

## Step 2: Initialize
{Код инициализации с комментариями}

## Step 3: Core Methods
{5-10 главных методов с примерами кода}

## Common Pitfalls
{Частые ошибки и как их избежать}

## Testing
{Как проверить что всё работает}

## Non-Negotiable Acceptance Criteria
- [ ] {Проверяемые критерии}
```

## Step 3: Update Credentials Check

Добавить новый SDK в скил `credentials-check`:

```markdown
### Для {SDK Name} (если используется)

  [ ] {Credential 1} → {где получить}
      → Положить в: {путь к файлу}
  [ ] {Credential 2} → {где получить}
      → Положить в: {путь к файлу}
```

## Step 4: Update Catalog

Добавить в `skills/CATALOG.md` новую строку в таблицу:

```markdown
| {sdk-name} | `.claude/skills/{sdk-name}/` | {ключевые слова для авто-выбора} |
```

## Step 5: Test — Проверить скил

Попросить Claude (в тестовом проекте):
```
Прочитай скил {sdk-name} и интегрируй в этот проект.
```

Проверить:
- [ ] Claude правильно запрашивает credentials
- [ ] Код инициализации рабочий
- [ ] Методы вызываются корректно
- [ ] Ошибки обрабатываются

## Step 6: Report

```
════════════════════════════════════
  NEW SKILL CREATED: {sdk-name}
════════════════════════════════════

Location:     .claude/skills/{sdk-name}/SKILL.md
Reference:    .claude/skills/{sdk-name}/references/{sdk-name}-api.md
Credentials:  {N} keys required (added to credentials-check)
Methods:      {N} core methods documented
Pitfalls:     {N} documented

All projects can now use:
  /sdk-name
  or: "Прочитай скил {sdk-name} и интегрируй"

Catalog updated: skills/CATALOG.md ✓
════════════════════════════════════
```

## Examples — Как запускать

```
# Добавить VK Ads SDK навсегда
$learn-sdk VK Ads SDK для Android

# Добавить Firebase Analytics
$learn-sdk Firebase Analytics для HTML5/web

# Добавить Telegram Bot API
$learn-sdk Telegram Bot API для Node.js

# Добавить RuStore In-App Purchases
$learn-sdk RuStore Billing SDK

# Добавить VK Bridge для VK Mini Apps
$learn-sdk VK Bridge для мини-приложений
```

## Non-Negotiable Acceptance Criteria
- [ ] Документация SDK изучена (не выдумана)
- [ ] ВСЕ необходимые credentials перечислены с URL где получить
- [ ] Код инициализации протестирован или взят из official docs
- [ ] SKILL.md содержит рабочий код, а не описания
- [ ] references/ содержит детальную API документацию
- [ ] credentials-check обновлён
- [ ] CATALOG.md обновлён
- [ ] Скил доступен из ЛЮБОГО проекта через forge
