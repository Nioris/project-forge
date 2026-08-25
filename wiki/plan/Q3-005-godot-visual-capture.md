---
id: Q3-005
title: Godot visual capture
status: done
started: 2026-08-25
deps: [Q3-004]
files:
  - schemas/godot-visual.schema.json
  - scripts/godot-visual-contract.mjs
  - scripts/godot-visual-runtime.mjs
  - scripts/godot-screens-shoot.mjs
  - scripts/godot-proof-video.mjs
  - scripts/check-godot-visual-capture.mjs
  - scripts/fixtures/godot-tools/fake-godot.mjs
  - templates/godot/ForgeVisualQA.gd
  - templates/godot/ForgeVisualQA.cs
  - .claude/skills/godot-engine/SKILL.md
  - .claude/skills/godot-engine/references/godot-visual-qa.md
  - .claude/skills/screen-flow/SKILL.md
  - .claude/skills/phase-2-design/SKILL.md
  - .claude/skills/phase-3-construct/SKILL.md
  - .claude/skills/phase-4-visual/SKILL.md
  - .claude/skills/status/references/screen-flow-contract.mjs
  - scripts/gigachat-agent.mjs
  - scripts/check-drift.mjs
  - mcp-server/verifiers.json
  - wiki/research/godogen-engine-profiles.md
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

- [x] Все Phase 2 states можно открыть детерминированно без ручных кликов.
- [x] PNG сохраняют state/viewport/freshness provenance.
- [x] Видео показывает развитие поведения, а не один повторяющийся кадр.
- [x] Отсутствие GPU/codec классифицируется как environment blocker, не PASS.

## Notes

Windows является основным локальным путём. `--headless` запрещён для визуального PASS, потому что
выключает настоящий renderer/window management; Linux требует обычного display driver (например,
виртуального display окружения), а не dummy headless frames.

Независимый forward-test на Godot 4.7 прошёл: 6/6 state/viewport PNG, 15/15 уникальных
lossless proof samples и MJPEG 1280x720@30 (451 кадр при контракте 450, допустимые ±1). Размер
viewport задаётся через `override.cfg` только в изолированной копии; исходный `project.godot`
остаётся неизменным. Строгий AVI parser допускает известное Godot 4.7 RIFF undercount только когда
остаток является структурно целым финальным `idx1`. C# template остаётся environment-dependent:
на текущем хосте нет .NET-enabled Godot/GodotSharp, поэтому ложный compile PASS не заявляется.
