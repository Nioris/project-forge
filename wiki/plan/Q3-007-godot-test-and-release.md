---
id: Q3-007
title: Godot test and release
status: planned
started: ""
deps: [Q3-006]
files:
  - .claude/skills/phase-7-test/SKILL.md
  - .claude/skills/phase-8-release/SKILL.md
  - scripts/godot-playtest.mjs
  - scripts/build-godot-release.mjs
  - wiki/plan/Q3-007-godot-test-and-release.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-007 — Godot test and release

## What

Добавить нативный scripted playtest и Godot export в новый неизменяемый versioned release bundle.

## Why

Без Фаз 7–8 Godot остаётся прототипом, а не поддерживаемым результатом Forge.

## Acceptance criteria

- [ ] Native flows проверяют управление, прогрессию, сохранение и ошибки runtime.
- [ ] Export presets валидируются до сборки.
- [ ] Каждая сборка создаёт новую версию и не перезаписывает старую.
- [ ] Production/debug/marketing artifacts относятся к одной версии.

## Notes

Первый target — Windows desktop; Android включается после доказанного desktop pilot.

