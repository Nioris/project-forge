# Current Session State

> Текущий пульс работы. Обновляется после каждого значимого шага.

## Session goal

Ship Project Forge v4.68.40 with deterministic newest-release ZIP selection, install it into the
local Universal fleet, and fast-forward the verified result to GitHub `main`.

## Active task

- [x] Reproduce `runtime-test.mjs` selecting Ox Alpha v0.2.0 while v0.2.1 exists.
- [x] Select the highest numeric version for exact production/debug/marketing variants.
- [x] Add a standalone regression and wire it into `check-drift.mjs`.
- [x] Bump and document Project Forge v4.68.40.
- [x] Pass release validators and package verification.
- [x] Install/sync ProjectForgeUniversal and verify the deployed version.
- [ ] Push the working branch and fast-forward GitHub `main`.

### Previous Ox Alpha benchmark

- [x] Reproduce Qwen3 Coder Next tool use through OpenRouter ZDR.
- [x] Record the Phase 1 unsupported-research and false-completion incidents.
- [x] Add evidence validation before the durable phase marker or Git checkpoint.
- [x] Reject template briefs, missing evidence, unsourced KPI numbers and unbuilt checked criteria.
- [x] Require OpenCode 1.18.20+ for whole-project OpenCode hosts.
- [x] Keep experimental Phase 1–7 checkpoints local and defer GitHub until Phase 8.
- [x] Add and pass offline regressions for rejected and valid completion paths.
- [x] Install v4.68.34 and repeat the real Qwen Phase 1 benchmark.
- [x] Reproduce OpenCode one-turn exit and Qwen's document-level source laundering.
- [x] Add file-backed same-session STOP resume and a bounded `list` compatibility tool.
- [x] Harden Phase 1 research evidence from document-level to line-level validation.
- [x] Install v4.68.35 and repeat the rejected research correction through Forge resume.
- [x] Reproduce contradictory `qa_blocked` metrics with a passed phase marker and unknown host/model.
- [x] Reject blocked/draft evidence and forward actual whole-project runtime identity.
- [x] Install v4.68.36 and perform the final Phase 1 consistency revalidation.
- [x] Reproduce a positive Yandex assertion hidden inside a localization `TBD` line.
- [x] Reject mixed TBD + verified/requires external claims.
- [x] Install v4.68.37 and remove the final unsupported line through Forge resume.
- [x] Verify the managed OpenCode `list` tool against the live Qwen session.
- [x] Reproduce Qwen repeating a successful `list` result without producing a final answer.
- [x] Add per-session identical-list suppression and a 64-step OpenCode turn budget.
- [x] Release, install and fleet-sync v4.68.38 across all 30 sibling projects.
- [x] Verify official Ox Alpha capabilities and retained-data policy.
- [x] Add the exact `openrouter/stealth/ox-alpha` preset with a standard-only privacy guard.
- [x] Release, install and fleet-sync v4.68.39.
- [x] Create and lock clean non-confidential `ox-alpha-snake-test` to Ox Alpha / standard.
- [ ] Run and evaluate canonical Phase 1–3.

## Blockers

No engine blocker. Ox Alpha is free during preview but retains prompts/completions; the benchmark
must stay confined to the intentionally public, synthetic Snake GDD.

## Last 3 decisions

- 2026-08-21: A model may propose evidence, but only the phase-state runtime may persist completion.
- 2026-08-21: Missing external evidence is represented as `TBD`/hypothesis, never filled from model memory.
- 2026-08-21: Experimental hosts publish the verified Phase 8 result, not intermediate phase claims.
- 2026-08-21: OpenCode STOP answers resume through a durable file because `run --interactive` is one-turn output, not a persistent terminal conversation.
- 2026-08-21: A complete marker may not coexist with blocked/draft evidence metadata, and runtime identity must be factual.
- 2026-08-21: `TBD` describes an unknown value; it cannot authorize a positive external claim elsewhere on the same line.
- 2026-08-21: OpenCode whole-project turns use a 64-step ceiling; repeated successful directory listings are not billable progress.
- 2026-08-22: Retained-data models require an explicit non-ZDR profile and may receive only non-confidential evaluation material.

<!-- last updated 2026-08-23 during v4.68.40 runtime release selection fix -->
