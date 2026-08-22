# Project Forge v4.68.12 — Durable GigaChat Phase Resume

This release fixes Phase 1 continuation after the user has already approved research, the five-question brief and the KPI/content budget.

- Product-metrics research evidence is stored independently from the currently active phase and survives phase switches.
- Approved KPI and research artifacts satisfy the resumed evidence gate without repeating searches or asking for approval again.
- A fully approved Phase 1 completes deterministically and stops before Phase 2 without another GigaChat model round-trip.
- Phase markers record GigaChat as the actual host without claiming that a Codex Terra/Sol/Luna model ran the phase.
- Memory snapshots remove obsolete nested `STOP:` lines so the current instruction stays authoritative.
- Exhausted empty or malformed GigaChat responses are logged as `GIGA_EMPTY_RESPONSE_LOOP` incidents for fleet auditing.
- Regression tests cover durable Phase 1 completion, approved metrics provenance, honest host-only model metadata and transport diagnostics.
