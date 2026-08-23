# Решение: Task scope проверяет host до нативной записи

**Дата:** 23.08.2026 · **Версия:** v4.68.45

## Ситуация

В v4.68.44 Task уже хранил точный SkillContract и объявленный write scope, но эти поля оставались
метаданными. Codex и GigaChat могли получить правильный контракт, а затем записать файл через
нативный tool за его пределами. Простая проверка строкового пути также не защищает от junction или
symlink, ведущего наружу.

## Решение

1. Общий `task-scope-guard.mjs` читает только durable Task, повторно проверяет SkillContract и
   сопоставляет нормализованный target с `Task.scope.write`.
2. Codex pipeline создаёт и записывает Task id в phase marker до первого model/tool round-trip.
   Guarded-сессия наследует Task id и contract hash через host environment.
3. Codex PreToolUse проверяет все targets `Edit`, `Write` и `apply_patch`; неизвестная форма
   записи в guarded mode отклоняется.
4. GigaChat вызывает тот же guard непосредственно перед text/copy/media write. Его внутренние
   phase markers, ledgers и diagnostics остаются runtime-owned и не маскируются под model scope.
5. При активном GigaChat Task raw shell работает fail-closed. Разрешены безопасные host translations,
   native scoped tools, host lifecycle, зарегистрированные read-only verifiers и явно описанные
   canonical operations, у которых проверены все известные output roots.
6. Lexical containment дополняется realpath ближайшего существующего родителя, поэтому junction и
   symlink не могут вынести нативную запись за project root.
7. Отказ записывается в локальный Forge diagnostic log с устойчивым кодом, без содержимого файла и
   секретов.

## Последствия

- Declared scope становится исполняемой authority для поддержанных host tools, а не подсказкой
  модели.
- Ручная legacy-сессия без Task продолжает работать как раньше; защищённый режим всегда opt-in и
  fail-closed по Task identity.
- Прямой shell Codex и внешние whole-project CLI пока не входят в эту гарантию. Следующий слой —
  одноразовый task worktree и перенос в основной проект только scope-valid diff после verifiers.
