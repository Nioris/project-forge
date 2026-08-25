---
id: Q3-006
title: Godot visual evidence binding
status: done
started: 2026-08-25
deps: [Q3-005]
files:
  - .claude/skills/phase-4-visual/SKILL.md
  - .claude/skills/godot-engine/references/godot-visual-qa.md
  - .claude/skills/status/references/phase-4-visual-evidence.mjs
  - .claude/skills/status/references/phase-completion-gate.mjs
  - .claude/skills/status/references/project-engine.mjs
  - .claude/skills/status/references/visual-receipts.mjs
  - adapters/engine-profiles.json
  - scripts/bind-phase4-visual-evidence.mjs
  - scripts/prepare-godot-phase4-review.mjs
  - scripts/record-phase4-visual-review.mjs
  - scripts/check-phase4-visual-evidence.mjs
  - scripts/check-godot-phase4-evidence.mjs
  - scripts/check-godot-visual-capture.mjs
  - scripts/godot-proof-video.mjs
  - scripts/godot-visual-runtime.mjs
  - scripts/gigachat-agent.mjs
  - mcp-server/verifiers.json
  - wiki/decisions/035-evidence-bound-visual-acceptance.md
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

- [x] Reviewer отличается от builder session и видит фактические кадры/видео.
- [x] Stale/replaced/fake media отклоняется.
- [x] Critical/Major и оценка ниже порога блокируют Phase 4.
- [x] Web и Godot evidence используют общий outcome contract без взаимной подмены.

## Notes

Сохраняется инвариант v4.68.51: current pixels + independent review.
Локальные receipts являются host-attested integrity boundary, а не защитой от процесса с полным
доступом к установленному Forge. Поэтому synthetic policy fixtures и real-Godot forward-test
учитываются раздельно.

Завершено с 24 capture/proof regressions, 25 изолированными adversarial evidence scenarios,
полным Web Phase 4 regression audit и повторным real Godot 4.7 forward-test.
