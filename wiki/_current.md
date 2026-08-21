# Current Session State

> Текущий пульс работы. Обновляется после каждого значимого шага.

## Session goal

Validate Qwen through OpenRouter as a whole-project Forge agent without allowing unsupported facts,
false phase completion, or premature remote publication.

## Active task

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
- [ ] Install v4.68.36 and perform the final Phase 1 consistency revalidation.

## Blockers

No engine blocker. The final verdict depends on the v4.68.36 consistency revalidation.

## Last 3 decisions

- 2026-08-21: A model may propose evidence, but only the phase-state runtime may persist completion.
- 2026-08-21: Missing external evidence is represented as `TBD`/hypothesis, never filled from model memory.
- 2026-08-21: Experimental hosts publish the verified Phase 8 result, not intermediate phase claims.
- 2026-08-21: OpenCode STOP answers resume through a durable file because `run --interactive` is one-turn output, not a persistent terminal conversation.
- 2026-08-21: A complete marker may not coexist with blocked/draft evidence metadata, and runtime identity must be factual.

<!-- last updated 2026-08-21 during v4.68.36 Qwen consistency work -->
