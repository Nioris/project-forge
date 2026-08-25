---
id: Q3-002
title: Project engine selection
status: done
started: 2026-08-25
completed: 2026-08-25
deps: [Q3-001]
files:
  - scripts/new-project.mjs
  - scripts/check-engine-profiles.mjs
  - dashboard.html
  - scripts/check-dashboard-meta.mjs
  - .dashboard-structure-baseline.json
  - .claude/skills/new-project/SKILL.md
  - .agents/skills/new-project/SKILL.md
  - AGENTS.md
  - AGENTS.project.md
  - FORGE.project.md
  - GUIDE.md
  - wiki/plan/Q3-002-project-engine-selection.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-002 — Project engine selection

## What

Добавить выбор `web|godot` в создание проекта и Dashboard. Старые записи и команды получают
`web`, а `godot` маркируется как экспериментальный и допускается только для игр.

## Why

Профиль должен создаваться одним штатным путём и не зависеть от ручной правки JSON.

## Acceptance criteria

- [x] `new-project` принимает `--engine`, по умолчанию создаёт `web`.
- [x] `app + godot` отклоняется понятной ошибкой.
- [x] Dashboard показывает статус и ограничения движков и передаёт `--engine`.
- [x] Legacy localStorage мигрируется к `engine: web`.
- [x] Dashboard/new-project regressions проходят.

## Notes

Этот этап ещё не создаёт Godot scaffold и не разрешает завершать Godot-фазы.

## Verification

- `node scripts/check-engine-profiles.mjs` — 26 passed.
- `node scripts/check-dashboard-meta.mjs` — PASS.
- `node scripts/check-dashboard-structure.mjs` — baseline match.
- `node scripts/generate-agents-md.mjs` and `node scripts/sync-codex-adapter.mjs` — generated surfaces synced.
