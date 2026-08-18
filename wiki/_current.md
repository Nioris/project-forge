# Current Session State

> Текущий пульс работы. Обновляется после каждого значимого шага.

## Session goal

Ship a durable GigaChat direct-task intent guard as Project Forge `v4.68.20`.

## Active task

- [x] Diagnose the real «сделай гачу» Phase 8 intent hijack.
- [x] Add `/do <task>`, `/task`, and `/resume-phase` manual controls.
- [x] Detect strong natural-language implementation requests.
- [x] Preserve the exact task across compaction and restart.
- [x] Block phase/release calls mechanically while the direct task is active.
- [x] Require implementation evidence and checks before `forge_change_complete`.
- [x] Add adapter and API-profile regression coverage.
- [x] Complete release checks, package and synchronize v4.68.20.

## Blockers

No code blocker. No paid GigaChat API call is required for the deterministic routing tests.

## Last 3 decisions

- 2026-08-18: Direct implementation intent outranks automatic continuation of a stale open phase.
- 2026-08-18: `/do` is the deterministic manual override; natural imperative detection is a convenience layer.
- 2026-08-18: Intent protection must be enforced at the tool boundary and survive context compaction.

<!-- last updated 2026-08-18 during v4.68.20 GigaChat direct-task patch -->
