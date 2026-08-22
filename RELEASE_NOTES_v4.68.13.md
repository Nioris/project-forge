# Project Forge v4.68.13 — GigaChat Decision and Gate Integrity

This release prevents false phase completion and lost decisions across one-shot GigaChat terminal resumes.

- Answering a durable STOP restores its owning phase, runtime baseline and resolved decision state before consuming the answer.
- Phase decisions remain associated with the correct phase across separate terminal processes.
- Runtime-owned decision and evidence ledgers reject direct model writes.
- Native `forge_script` phase completion now enforces the same hard gate as shell completion and requires explicit evidence arguments.
- Decision STOP-points automatically persist a `blocked` phase marker with honest GigaChat host metadata.
- Phase 2 monetization, multiplayer and content-plan gates receive deterministic fast-MVP recommendations and exact approval guidance.
- Phase 2 accepts canonical UI hierarchy filenames and reports the exact required `assets/prompts/*.json` prompt-pack location.
