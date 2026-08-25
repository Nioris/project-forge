---
id: Q3-004
title: Godot construct verifier
status: done
started: 2026-08-25
completed: 2026-08-25
deps: [Q3-003]
files:
  - .claude/skills/godot-engine/SKILL.md
  - .claude/skills/godot-engine/references/godot-csharp.md
  - .gitignore
  - .claude/skills/advisor/SKILL.md
  - scripts/check-godot-project.mjs
  - scripts/check-godot-project-fixtures.mjs
  - scripts/check-task-verifier-runner.mjs
  - scripts/run-bounded-command.mjs
  - scripts/fixtures/godot-projects/
  - scripts/fixtures/godot-tools/
  - schemas/godot-project.schema.json
  - adapters/engine-profiles.json
  - .claude/skills/phase-3-construct/SKILL.md
  - .claude/skills/status/references/phase-completion-gate.mjs
  - .claude/skills/status/references/phase-state.mjs
  - .agents/skills/godot-engine/
  - .agents/skills/phase-3-construct/SKILL.md
  - .agents/skills/status/references/phase-completion-gate.mjs
  - .agents/skills/status/references/phase-state.mjs
  - scripts/check-engine-profiles.mjs
  - scripts/check-engine-phase-routing.mjs
  - scripts/check-drift.mjs
  - mcp-server/verifiers.json
  - FORGE.project.md
  - dashboard.html
  - .dashboard-structure-baseline.json
  - AGENTS.md
  - AGENTS.project.md
  - MANIFEST.txt
  - wiki/research/godogen-engine-profiles.md
  - wiki/plan/Q3-004-godot-construct-verifier.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-004 — Godot construct verifier

## What

Добавить Godot project scaffold contract и read-only Фаза 3 verifier: toolchain, project markers,
headless import/build, entry scene и smoke startup.

## Why

Компиляция без импорта/запуска не доказывает работоспособность Godot-проекта.

## Acceptance criteria

- [x] Проверяется фактическая версия Godot/.NET без хардкода из памяти.
- [x] Headless import/build/startup дают bounded evidence и классифицированные ошибки.
- [x] Silent scene-serialization failures имеют отдельную проверку.
- [x] Pass/fail/missing-tool fixtures покрыты регрессиями.

## Notes

Оригинальные знания формулируются заново; при материальном копировании добавляется MIT notice.

Forward-test собрал новый GDScript scaffold и прошёл штатный deterministic harness. После теста
контракт усилен точными типами обязательных узлов и точными script-to-node attachments; 16 fixture
regressions закрывают pass, serialization loss, detached script, wrong node type, missing tool,
phase dispatch и hung process tree.

Реальный установленный Godot `4.7.stable.official.5b4e0cb0f` зависает в editor import на этой машине.
Verifier корректно завершает дерево процессов и возвращает environment blocker; это не считается PASS.
