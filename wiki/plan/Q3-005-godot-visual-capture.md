---
id: Q3-005
title: Godot visual capture
status: planned
started: ""
deps: [Q3-004]
files:
  - scripts/godot-screens-shoot.mjs
  - scripts/godot-proof-video.mjs
  - templates/godot/ForgeVisualQA.cs
  - .claude/skills/phase-4-visual/SKILL.md
  - wiki/plan/Q3-005-godot-visual-capture.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-005 — Godot visual capture

## What

Добавить native QA adapter для именованных состояний, снимков утверждённых экранов и
детерминированного 15–20-секундного proof video.

## Why

Статический кадр не выявляет замороженную анимацию, плохую камеру и неработающее управление.

## Acceptance criteria

- [ ] Все Phase 2 states можно открыть детерминированно без ручных кликов.
- [ ] PNG сохраняют state/viewport/freshness provenance.
- [ ] Видео показывает развитие поведения, а не один повторяющийся кадр.
- [ ] Отсутствие GPU/codec классифицируется как environment blocker, не PASS.

## Notes

Windows является основным локальным путём; Linux headless остаётся переносимым дополнением.

