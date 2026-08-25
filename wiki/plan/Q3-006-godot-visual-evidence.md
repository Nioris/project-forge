---
id: Q3-006
title: Godot visual evidence binding
status: planned
started: ""
deps: [Q3-005]
files:
  - .claude/skills/phase-4-visual/SKILL.md
  - scripts/bind-phase4-visual-evidence.mjs
  - scripts/check-phase4-visual-evidence.mjs
  - .claude/skills/status/references/phase-contracts/phase-4.json
  - wiki/plan/Q3-006-godot-visual-evidence.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-006 — Godot visual evidence binding

## What

Связать Godot screenshots/video с существующей независимой рецензией, hash receipts и Phase 4
completion contract.

## Why

Самопроверка модели и существование видео не являются независимой визуальной приёмкой.

## Acceptance criteria

- [ ] Reviewer отличается от builder session и видит фактические кадры/видео.
- [ ] Stale/replaced/fake media отклоняется.
- [ ] Critical/Major и оценка ниже порога блокируют Phase 4.
- [ ] Web и Godot evidence используют общий outcome contract без взаимной подмены.

## Notes

Сохраняется инвариант v4.68.51: current pixels + independent review.

