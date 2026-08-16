# wiki/plan/ — структурированный план работ

Машиночитаемый источник правды о задачах. Парсится хуками:

- **`plan-check.mjs`** (PreToolUse): предупреждает при правке файла вне `files:` активной задачи.
- **`status-line.mjs`**: показывает активную задачу в статус-баре Claude Code.
- **`session-start.mjs`**: инжектит сводку плана в контекст при каждом запуске.
- **`wiki-audit.mjs`** (Stop): блокирует завершение сессии, если acceptance все закрыты, а `status` ещё `in_progress`.
- **`post-tool-capture.mjs`**: тэгирует каждую запись в логе сессии id активной задачи.

## Формат файла

```
wiki/plan/Q1-001-vk-bridge-auth.md
```

Имя начинается с id, потом slug. Внутри — frontmatter + тело:

```markdown
---
id: Q1-001
title: VK Bridge auth
status: in_progress
started: 2026-04-22
deps: []
files:
  - src/auth/vk.ts
  - src/lib/storage.ts
---

# Q1-001 — VK Bridge auth

## Acceptance
- [x] VK Bridge initializes
- [x] Get access_token
- [ ] Persist to dexie
- [ ] Handle network errors

## Notes
...
```

См. `_template.md` для полного шаблона.

## Рабочий цикл

```
planned → in_progress → done
                ↓
             blocked (если зависимость висит)
```

1. **Взять в работу:** поменять `status: planned` → `in_progress`, заполнить `started:`.
2. **Править код:** каждый edit тэгируется id задачи в session log.
3. **Отметить шаги:** чекбоксы в acceptance по мере готовности.
4. **Закрыть:** когда все чекбоксы закрыты → `status: done`. `wiki-audit` напомнит, если забудешь.
5. **Создать feature page:** для модуля → `wiki/features/<n>.md`.
6. **Обновить `wiki/_map.md`:** перенести задачу из `Next` в `Done`.

## Anti-patterns

- **Два `in_progress` одновременно** → `status-line` покажет `⚠ 2 tasks in_progress`. Фокус один.
- **Правка файла вне `files:`** → `plan-check` предупредит. Либо дополни `files:`, либо заведи новую задачу.
- **Удаление закрытых задач** → НЕ делать. История нужна для `wiki/sessions/` контекста.
- **Задача без acceptance** → нельзя понять, что она сделана. Хотя бы 1 чекбокс.

## Индекс задач

Сам файл `wiki/_map.md` содержит секцию `## Tasks` с линками на активные
задачи. `session-start.mjs` автоматически строит сводку — руками индекс
вести не нужно.
