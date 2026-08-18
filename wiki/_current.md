# Current Session State

> Текущий пульс работы. Обновляется после каждого значимого шага.

## Session goal

Ship safe, bounded GigaChat integration of features into existing large games as Project Forge `v4.68.23`.

## Active task

- [x] Diagnose the real «сделай гачу» Phase 8 intent hijack.
- [x] Add `/do <task>`, `/task`, and `/resume-phase` manual controls.
- [x] Detect strong natural-language implementation requests.
- [x] Preserve the exact task across compaction and restart.
- [x] Block phase/release calls mechanically while the direct task is active.
- [x] Require implementation evidence and checks before `forge_change_complete`.
- [x] Add adapter and API-profile regression coverage.
- [x] Complete release checks, package and synchronize v4.68.20.
- [x] Reproduce the false gacha completion and «собрал архивы?» release hijack.
- [x] Bind direct-task checks to successful post-activation runtime evidence.
- [x] Make factual status turns mechanically read-only.
- [x] Block counterfeit WorkProgress verifier/release scripts.
- [x] Protect direct-task files from blind full overwrite after compaction.
- [x] Complete release checks, package and synchronize v4.68.21.
- [x] Diagnose same-version ZIP overwrite in the canonical Yandex builder.
- [x] Auto-select the next release version and refuse existing ZIP paths.
- [x] Persist build history and print the exact selected version.
- [x] Require a newly named higher-version three-ZIP trio at the Phase 8 gate.
- [x] Complete release checks, package and synchronize v4.68.22.
- [x] Diagnose the 93 KB → 17 KB destructive gacha integration loop.
- [x] Add durable automatic read pagination across context compaction.
- [x] Block large-file reconstruction, suspicious shrinkage, and repeated full overwrites.
- [x] Add bounded read/compaction circuit breakers and clean explicit `/do` retries.
- [x] Complete release checks, package and synchronize v4.68.23 across 28 managed projects.

## Blockers

No code blocker. No paid GigaChat API call is required for the deterministic routing tests.

## Last 3 decisions

- 2026-08-18: Direct implementation intent outranks automatic continuation of a stale open phase.
- 2026-08-18: `/do` is the deterministic manual override; natural imperative detection is a convenience layer.
- 2026-08-18: Status intent and verification provenance must be enforced at the tool boundary, not trusted from model prose.
- 2026-08-18: Every build is a new immutable version; an overwritten filename is never fresh release evidence.
- 2026-08-18: Targeted feature integration must preserve existing large source files mechanically; prompt instructions alone are insufficient.

<!-- last updated 2026-08-18 during v4.68.23 safe large-file integration patch -->
