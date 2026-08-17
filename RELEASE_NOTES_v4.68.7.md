# Project Forge v4.68.7 — GigaChat Resume Orchestrator

## What changed

- Upgraded the Forge-owned GigaChat terminal adapter to contract `6.3.1-resume-orchestrator`.
- Fixed the live `Assignment to constant variable` crash in malformed `ask_user` recovery.
- Reopens an incomplete Phase 1 Q1–Q5 brief directly from durable decisions before another model request.
- Reconciles partial pasted answers, stale skill completion, approved research evidence and persisted product-metrics state.
- Rejects nonexistent `analyze-project.mjs` / `dimensionality.mjs` routes and resolves the canonical skill/state paths instead.
- Adds real web search, image search and safe page fetch tools with a search doctor, mock self-test, configurable production GigaSearch and a no-key `bing-html` launcher fallback.
- Sanitizes function-call history and resets the transport epoch after compaction or transient server failures without losing durable Forge state.
- Enables Node's system CA store before the GigaChat child process starts, while preserving TLS verification.

## Verification

- Nine changed/imported runtime and release-gate modules pass `node --check`.
- GigaChat terminal self-test: 112 checks passed.
- Search provider self-test: 6 checks passed.
- Resume integration against an isolated copy of the real failed `testgigachat-v4` state: 19/19 passed and Phase 1 gate reached GREEN.
- The API-profile audit now launches fresh CLI subprocess fixtures to prove that partial Q1–Q5 state is restored before credential lookup, survives restart and blocks an unsafe phase switch.
- The same audit validates the semantic standard/full tool relationship instead of a stale hard-coded function count.

## Compatibility

Existing project state does not need to be reset. The adapter reads and repairs durable Phase 1 evidence in place. Explicit `FORGE_SEARCH_PROVIDER` and `GIGASEARCH_*` settings remain authoritative; the no-key fallback is selected only when no search provider or endpoint was configured.
