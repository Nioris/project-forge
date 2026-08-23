---
id: B3-002
title: Canonical nine-phase state integrity
status: done
started: 2026-08-23
deps: []
files:
  - .claude/skills/status/references/phase-completion-gate.mjs
  - .claude/skills/status/references/phase-state.mjs
  - .claude/skills/status/references/phase-contracts/phase-1.json
  - .claude/skills/status/references/phase-contracts/phase-2.json
  - .claude/skills/status/references/phase-contracts/phase-3.json
  - .claude/skills/status/references/phase-contracts/phase-4.json
  - .claude/skills/status/references/phase-contracts/phase-5.json
  - .claude/skills/status/references/phase-contracts/phase-6.json
  - .claude/skills/status/references/phase-contracts/phase-7.json
  - .claude/skills/status/references/phase-contracts/phase-8.json
  - .claude/skills/status/references/phase-contracts/phase-9.json
  - .claude/skills/phase-1-analyze/SKILL.md
  - .claude/skills/phase-2-design/SKILL.md
  - .claude/skills/phase-3-construct/SKILL.md
  - .claude/skills/phase-4-visual/SKILL.md
  - .claude/skills/phase-5-tech/SKILL.md
  - .claude/skills/phase-6-listing/SKILL.md
  - .claude/skills/phase-7-test/SKILL.md
  - .claude/skills/phase-8-release/SKILL.md
  - .claude/skills/phase-9-live/SKILL.md
  - scripts/check-phase-completion-gate.mjs
  - scripts/check-status-phase-model.mjs
  - scripts/check-pipeline-state.mjs
  - scripts/check-drift.mjs
  - mcp-server/verifiers.json
  - mcp-server/index.mjs
  - mcp-server/test.mjs
  - FORGE.md
  - FORGE.project.md
  - MANIFEST.txt
  - .claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - AGENTS.md
  - AGENTS.project.md
  - CLAUDE.md
  - README.md
  - README_RU.md
  - GUIDE.md
  - dashboard.html
  - setup.ps1
  - setup.sh
  - СПРАВОЧНИК-КОМАНД.md
  - RELEASE_NOTES_v4.68.41.md
  - docs/CHANGELOG.md
  - wiki/_current.md
  - wiki/_map.md
  - wiki/plan/B3-002-state-integrity.md
---

# B3-002 — Canonical nine-phase state integrity

## What

Make the nine Forge phases the only global progression model. Every phase completion must load a
machine-readable contract, validate relevant evidence and reject empty/irrelevant artifacts. The
legacy pipeline command becomes a compatibility view over canonical phase status, and MCP exposes
only explicitly registered read-only verifiers.

## Why

The v4.68.38 architecture review identified prompt-only enforcement and competing state models.
The v4.68.40 audit confirmed that Phase 5/6 completion examples provide no evidence and Phase 7/8
provide directories even though the central gate accepts only regular files.

## Acceptance criteria

- [x] All nine phases have executable, schema-checked contracts and relevant evidence checks.
- [x] Canonical phase skill completion commands satisfy their own contracts.
- [x] Phase 2–9 regressions reject missing, irrelevant and counterfeit completion evidence.
- [x] `check-pipeline-state.mjs` reports the canonical nine phases without a second progression model.
- [x] MCP verifier exposure is registry-driven; internal/deprecated checks cannot be called as tools.
- [x] Required Forge, adapter, MCP and packaging checks pass for v4.68.41.
- [x] v4.68.41 is installed/synced locally and merged to GitHub main with a successful GitVerse mirror.

## Notes

Workflow graph remains the next layer. It will be built on top of these contracts rather than
encoding the legacy state ambiguity.

Released from commit `9af7945`; the immutable ZIP SHA-256 is
`2683E775904AE086554186C4B1D9C3AEB70975CF0B892959F448E6DCB42B10E8`. Local installation and all
31 sibling-project audits passed, and GitHub Actions run `32627250644` mirrored the release to
GitVerse successfully.
