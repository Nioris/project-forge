# Project Forge v4.68.18 — Cost/context-aware Codex orchestration

This release makes the one-window Codex pipeline measurable without feeding monitoring data back into the model.

- Every completed phase prints a compact cost/context report and stores machine-readable JSON under `wiki/diagnostics/codex-cost/`.
- The exec JSON stream provides safe fallback totals when no local rollout is available.
- Local rollout enrichment measures model responses, cumulative input/cached/output tokens, reasoning output, compactions, subagent sessions, tool-output payload bytes, and actual root model/reasoning policy.
- Warnings identify high-volume context amplification, oversized tool output, policy mismatch, unexpected incomplete endings, Codex process failures, excess subagents, and compactions.
- Thresholds are explicitly labeled Forge heuristics, and cache reuse is not misrepresented as semantic duplication.
- Output/input is not presented as a universal efficiency score because file edits, tests, and verified artifacts are also phase output.
- Reports omit prompts, messages, file contents, rate-limit state, and secrets, and are excluded from project Git history.
- Dashboard's **Codex Cost / Context** panel reads selected `phase-N-latest.json` files and renders comparable phase cards without hidden filesystem access.

Verified offline with JSON-event fallback tests, synthetic rollout aggregation, policy/warning fixtures, a full nine-phase fake pipeline, Dashboard syntax/integrity checks, and local browser rendering. The aggregator also reproduced the previously diagnosed `neftistan` context-amplification pattern from its existing rollout.
