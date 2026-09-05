---
id: Q3-011
title: Evidence-based game quality audit
status: completed
started: "2026-09-05"
deps: [Q3-009]
files:
  - scripts/web-playtest-contract.mjs
  - scripts/web-playtest-runner.mjs
  - scripts/check-web-playtest.mjs
  - scripts/check-phase-completion-gate.mjs
  - scripts/screens-shoot.mjs
  - scripts/godot-screens-shoot.mjs
  - scripts/check-drift.mjs
  - scripts/check-debugcheck-fixtures.mjs
  - docs/FORGE-QUALITY-AUDIT-2026-09-05.md
---

# Q3-011 — Quality audit

## Scope

Audit runtime acceptance and repair false PASS/stale evidence paths. No paid model/Godot pilot or
game-source edits. Preserve existing identities/releases. Canonical code first, generated adapters last.

## Acceptance

- [x] Read engine state, fleet diagnostics and actual Circuit Courier release history.
- [x] Reproduce checker false positives and repair both canonical surfaces with negative/positive tests.
- [x] Require real normal-entry web input evidence with source-bound external receipts.
- [x] Respect approved viewport orientation and isolate diagnostic captures from Phase 4 acceptance.
- [x] Recheck visual acceptance in Phase 7 and enforce the internal 7/10 floor.
- [x] Cross-review repairs; run the full engine audit and repair/retest its failing regression domains.
- [x] Reconcile stale wiki/plans and document remaining GDD/native-route/QA-parity gaps honestly.

Delivery follows the standard immutable ZIP/updater workflow, including a full installed drift and
sibling-sync check before publication. Its actual result is recorded in the release task, not predicted here.

The next real-game acceptance pass and current-source storefront rebuild are separate work, not implied
by passing synthetic engine regressions. See the audit report for exact boundaries.
