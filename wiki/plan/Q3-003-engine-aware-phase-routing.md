---
id: Q3-003
title: Engine-aware phase routing
status: done
started: 2026-08-25
completed: 2026-08-25
deps: [Q3-001, Q3-002]
files:
  - FORGE.md
  - FORGE.project.md
  - CLAUDE.md
  - adapters/engine-profiles.json
  - scripts/engine-profile.mjs
  - .claude/skills/status/references/project-engine.mjs
  - .claude/skills/status/references/phase-state.mjs
  - .claude/skills/status/references/phase-completion-gate.mjs
  - .claude/skills/status/references/phase-4-visual-evidence.mjs
  - .claude/skills/status/references/phase-contracts/phase-3.json
  - .claude/skills/status/references/phase-contracts/phase-4.json
  - .claude/skills/status/references/phase-contracts/phase-5.json
  - .claude/skills/phase-1-analyze/SKILL.md
  - .claude/skills/phase-3-construct/SKILL.md
  - .claude/skills/phase-4-visual/SKILL.md
  - .claude/skills/phase-5-tech/SKILL.md
  - scripts/check-engine-phase-routing.mjs
  - scripts/check-engine-profiles.mjs
  - scripts/check-drift.mjs
  - mcp-server/verifiers.json
  - .agents/skills/phase-1-analyze/SKILL.md
  - .agents/skills/phase-3-construct/SKILL.md
  - .agents/skills/phase-4-visual/SKILL.md
  - .agents/skills/phase-5-tech/SKILL.md
  - .agents/skills/status/references/project-engine.mjs
  - .agents/skills/status/references/phase-state.mjs
  - .agents/skills/status/references/phase-completion-gate.mjs
  - .agents/skills/status/references/phase-4-visual-evidence.mjs
  - .agents/skills/status/references/phase-contracts/phase-3.json
  - .agents/skills/status/references/phase-contracts/phase-4.json
  - .agents/skills/status/references/phase-contracts/phase-5.json
  - AGENTS.md
  - AGENTS.project.md
  - wiki/plan/Q3-003-engine-aware-phase-routing.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-003 — Engine-aware phase routing

## What

Научить канонические фазы читать engine profile и fail closed, если для выбранного движка ещё
нет эквивалентного verifier/capture adapter.

## Why

Выпадающий список без честного исполнения создаёт ложную поддержку и ложную приёмку.

## Acceptance criteria

- [x] Фазы 1 и 3–5 используют один reader, а не читают JSON каждая по-своему.
- [x] Web-путь не меняет существующее поведение.
- [x] Godot не может пройти browser-only verifier или `window.__FORGE_VISUAL_QA__`.
- [x] Генерируемые Codex surfaces синхронизированы и проверены.

## Notes

Девять фаз остаются единственным глобальным progression state.

## Verification

- `node scripts/check-engine-phase-routing.mjs` — 30 passed.
- `node scripts/check-engine-profiles.mjs` — 26 passed.
- `check-phase-completion-gate`, `check-execution-contract`, `check-status-phase-model` — PASS.
- `check-skill-contracts`, `check-codex-compat`, `check-sync-spec` — PASS.
