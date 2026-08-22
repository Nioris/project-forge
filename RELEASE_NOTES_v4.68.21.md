# Project Forge v4.68.21 — GigaChat evidence-bound status guard

This release closes the false-completion and status-mutation failures found during a real direct-task GigaChat run.

- Past-tense factual questions such as «собрал архивы?» are classified as read-only status turns.
- Status turns expose only read-only inspection functions and reject mutating pseudo-tool calls at the execution boundary.
- `forge_change_complete` accepts only exact checks backed by successful commands recorded after the active direct task started.
- Fabricated prose such as “playtest passed” can no longer clear direct-task mode without matching runtime evidence.
- Canonical-looking `verify-*`, `check-*`, `release-*`, `build-yandex*`, and `phase-state*` substitutes cannot be invented under `WorkProgress/<project>/scripts/`.
- Repeated full writes to the same direct-task file require a fresh read after the previous write, protecting work across context compaction.
- New behavioral diagnostics record unverified completion claims, status-turn mutation attempts, and counterfeit verifier attempts.

Verified with syntax checks and the full GigaChat adapter self-test, including Russian status-intent, post-activation evidence provenance, read-only function pruning, counterfeit-script, and compaction-overwrite fixtures.
