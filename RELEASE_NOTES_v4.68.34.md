# Project Forge v4.68.34

## Evidence-bound experimental agents

The first autonomous Qwen/OpenRouter Phase 1 reached Forge tools but then produced unsupported KPI
claims, checked unbuilt acceptance criteria and called the phase complete. This release moves the
critical decision out of model prose and into the phase-state runtime.

- `phase-state complete` validates evidence before writing `complete` or touching Git.
- Phase 1 rejects missing canonical evidence, template briefs, unsourced numeric KPI claims and
  checked runtime criteria when no implementation source exists.
- Rejected completion becomes a durable `blocked` marker with bounded failure reasons.
- OpenCode whole-project hosts require version `1.18.20` or newer.
- Experimental whole-project checkpoints remain local through Phase 7; private GitHub push is
  deferred until Phase 8 produces the verified final result.
- Offline regressions cover the failure modes and the valid completion path.
