---
id: B3-003
title: Durable execution graph foundation
status: done
started: 2026-08-23
deps: [B3-002]
files:
  - schemas/task.schema.json
  - schemas/run-result.schema.json
  - schemas/workflow.schema.json
  - .claude/skills/status/references/workflows/phase.json
  - .claude/skills/status/references/workflows/change.json
  - .claude/skills/status/references/workflows/review.json
  - .claude/skills/status/references/workflows/diagnose.json
  - .claude/skills/status/references/workflows/release.json
  - .claude/skills/status/references/execution-contract.mjs
  - .claude/skills/status/references/workflow-state.mjs
  - .agents/skills/status/references/workflows
  - .agents/skills/status/references/execution-contract.mjs
  - .agents/skills/status/references/workflow-state.mjs
  - scripts/forge-workflow.mjs
  - scripts/gigachat-agent.mjs
  - scripts/forge-agent.mjs
  - scripts/codex-pipeline.mjs
  - scripts/check-codex-pipeline.mjs
  - scripts/check-execution-contract.mjs
  - scripts/check-status-phase-model.mjs
  - scripts/check-api-terminal-profiles.mjs
  - scripts/check-universal-agent-runtime.mjs
  - scripts/check-drift.mjs
  - mcp-server/verifiers.json
  - scripts/new-project.mjs
  - .gitignore
  - .claude/skills/status/references/phase-state.mjs
  - .claude/skills/status/references/project-status.mjs
  - .agents/skills/status/references/phase-state.mjs
  - .claude/skills/status/SKILL.md
  - .claude/skills/phase-1-analyze/SKILL.md
  - .claude/skills/phase-2-design/SKILL.md
  - .claude/skills/phase-4-visual/SKILL.md
  - .agents/skills/status/SKILL.md
  - .agents/skills/phase-1-analyze/SKILL.md
  - .agents/skills/phase-2-design/SKILL.md
  - .agents/skills/phase-4-visual/SKILL.md
  - FORGE.md
  - FORGE.project.md
  - wiki/decisions/031-durable-execution-graph.md
  - wiki/_current.md
  - wiki/_map.md
  - wiki/plan/B3-002-state-integrity.md
  - wiki/plan/B3-003-durable-execution-graph.md
  - RELEASE_NOTES_v4.68.42.md
  - CLAUDE.md
  - docs/CHANGELOG.md
  - AGENTS.md
  - AGENTS.project.md
  - README.md
  - README_RU.md
  - GUIDE.md
  - dashboard.html
  - .dashboard-structure-baseline.json
  - setup.ps1
  - setup.sh
  - СПРАВОЧНИК-КОМАНД.md
  - .claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - MANIFEST.txt
---

# B3-003 — Durable execution graph foundation

## What

Add host-neutral Task, RunResult and FailureType contracts plus a declarative workflow graph and
durable `.forge/runs/` state. Connect canonical phase transitions and the Codex one-window runtime
to structured results so human-facing prose is no longer the primary workflow API.

## Why

State Integrity made phase completion honest, but turn routing still partly interprets assistant
text. A durable graph needs typed inputs, deterministic transitions and restart-safe current-node
state before repair loops or a Dashboard view can be trusted.

## Acceptance criteria

- [x] Task, RunResult and workflow schemas reject unknown modes, states, failure types and unsafe paths.
- [x] Five execution modes ship as validated declarative graphs without creating new global phases.
- [x] Run state survives restart and resumes from its durable current node.
- [x] Phase start/block/answer/reopen/complete emits correlated structured RunResult and graph transitions.
- [x] Codex prioritizes exact-attempt structured RunResult; natural-language question detection is legacy fallback only.
- [x] Retry/decision/terminal transitions are bounded and mechanically regression-tested.
- [x] Forge adapters, docs, package and synchronized sibling projects ship as v4.68.42.

## Notes

This is the graph/runtime foundation, not a visual node editor. Verifier-driven automatic repair and
file leases build on this contract in subsequent releases.

## Release verification

Released on 2026-08-23 as `project-forge-v4.68.42.zip`. The immutable archive passed extraction
verification, the installed engine passed drift/Codex/dashboard/MCP gates, and all 31 sibling
projects reported `missing=0`, `outdated=0`, `stale=0` after synchronization.
