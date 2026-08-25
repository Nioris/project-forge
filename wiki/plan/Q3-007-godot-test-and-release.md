---
id: Q3-007
title: Godot test and release
status: done
started: 2026-08-25
completed: 2026-08-26
deps: [Q3-006]
files:
  - FORGE.md
  - README.md
  - GUIDE.md
  - dashboard.html
  - adapters/engine-profiles.json
  - schemas/godot-playtest.schema.json
  - schemas/godot-export.schema.json
  - scripts/godot-playtest-contract.mjs
  - scripts/godot-playtest-runtime.mjs
  - scripts/godot-tech-check.mjs
  - .claude/skills/phase-7-test/SKILL.md
  - .claude/skills/phase-8-release/SKILL.md
  - .claude/skills/phase-5-tech/SKILL.md
  - .claude/skills/godot-engine/SKILL.md
  - .claude/skills/godot-engine/references/godot-test-release.md
  - .claude/skills/status/references/project-engine.mjs
  - .claude/skills/status/references/phase-completion-gate.mjs
  - .claude/skills/status/references/phase-contracts/phase-5.json
  - .claude/skills/status/references/phase-contracts/phase-7.json
  - .claude/skills/status/references/phase-contracts/phase-8.json
  - scripts/godot-playtest.mjs
  - scripts/godot-export-contract.mjs
  - scripts/build-godot-release.mjs
  - scripts/godot-release-verify.mjs
  - scripts/lib/safe-zip.mjs
  - scripts/check-godot-tech.mjs
  - scripts/check-godot-native-playtest.mjs
  - scripts/check-godot-native-release.mjs
  - scripts/check-godot-playtest.mjs
  - scripts/check-godot-playtest-real.mjs
  - scripts/check-godot-release.mjs
  - scripts/check-engine-phase-routing.mjs
  - scripts/check-godot-visual-capture.mjs
  - scripts/check-task-verifier-runner.mjs
  - scripts/check-drift.mjs
  - scripts/gigachat-agent.mjs
  - scripts/godot-visual-contract.mjs
  - mcp-server/verifiers.json
  - .claude/skills/status/references/godot-release-receipts.mjs
  - scripts/fixtures/godot-playtest/**
  - scripts/fixtures/godot-release/**
  - templates/godot/ForgePlaytestQA.gd
  - wiki/plan/Q3-007-godot-test-and-release.md
  - wiki/decisions/036-engine-capability-adapter-boundary.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-007 — Godot test and release

## What

Добавить нативный scripted playtest и Godot export в новый неизменяемый versioned release bundle.

## Why

Без Фаз 7–8 Godot остаётся прототипом, а не поддерживаемым результатом Forge.

## Acceptance criteria

- [x] Phase 5 получает отдельную нативную техпроверку и больше не блокирует Godot pilot.
- [x] Native flows проверяют управление, прогрессию, сохранение и ошибки runtime.
- [x] Export presets валидируются до сборки.
- [x] Каждая сборка создаёт новую версию и не перезаписывает старую.
- [x] Production/debug/marketing artifacts относятся к одной версии.
- [x] Фазы 5/7/8 принимают только нативные Godot evidence и не ослабляют Web route.
- [x] Adversarial fixtures и реальный Godot forward-test проходят; generated Codex layer и drift чисты.

## Notes

Первый target — Windows desktop; Android включается после доказанного desktop pilot.
Архитектура остаётся движок-независимой: phase contracts используют capability-профили,
а Godot здесь является первым реализованным native adapter, не единственным возможным движком.
