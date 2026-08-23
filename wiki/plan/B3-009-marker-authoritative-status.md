---
id: B3-009
title: Marker-authoritative status progression
status: done
started: 2026-08-23
deps: [B3-008]
files:
  - .claude/skills/status/references/project-status.mjs
  - scripts/check-status-phase-model.mjs
  - RELEASE_NOTES_v4.68.50.md
---

# B3-009 — Marker-authoritative status progression

## What

Keep modern marker-managed projects on the first phase without an explicit completion marker. Legacy
artifact inference remains available only when a project has no valid phase markers at all. Existing
later-phase artifacts stay visible as evidence ahead of the gate but cannot advance progression.

## Why

Card Chaos completed Phase 3 with valid schema v3 markers for Phases 1–3. Because its imported
prototype already contained visual, SDK, localization and QA artifacts, `$status` mixed those files
with the marker chain and incorrectly reported Phase 6 as current. That bypassed the Phase 4 and 5
completion contracts even though neither phase had been started.

Observed diagnostic: `STATUS_MARKER_FALLBACK_LEAK`, fingerprint `8e058b748530825533ba`.

## Acceptance criteria

- [x] A project with zero markers keeps conservative legacy artifact inference.
- [x] Once any valid phase marker exists, every missing phase marker is an unpassed gate.
- [x] Complete markers for Phases 1–3 plus later artifacts report Phase 4 `pending`.
- [x] Later artifacts remain visible through `artifactState` and `evidence ahead of gate` warnings.
- [x] Regression uses deterministic approved visual evidence rather than filesystem timestamp order.
- [x] Full Forge verifier suite and immutable v4.68.50 package pass.
- [x] Installed ProjectForgeUniversal and Card Chaos reproduce the corrected Phase 4 status.

## Release verification

The canonical status regression, drift audit, Codex compatibility audit, cross-reference and batch
encoding checks passed. The immutable archive contains 1011 manifest-bound files and passed extraction
verification. `update-forge.bat` installed v4.68.50 and synchronized 32 sibling projects with
`missing=0`, `outdated=0`, `stale=0`. Installed Card Chaos now reports Phase 4 `pending`; the original
diagnostic fingerprint was resolved only after that reproduction passed.
