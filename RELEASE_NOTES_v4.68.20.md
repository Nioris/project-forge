# Project Forge v4.68.20 — GigaChat direct-task intent guard

This release prevents a direct implementation request from being replaced by a stale phase marker.

- Added deterministic `/do <task>` change-request mode for urgent implementation work inside an existing project.
- Added `/task` for current override status and `/resume-phase` for an explicit return to the canonical phase pipeline.
- Strong natural-language implementation commands such as «добавь магазин и начинай делать» activate the same mode automatically.
- The exact active task is stored in `wiki/runtime/gigachat-evidence.json` and injected explicitly after context compaction or transport retry.
- Phase preflight/gates, `phase-state`, phase skills, release skills, and release packaging are blocked at the tool boundary while a direct task is active.
- Malformed textual tool-call recovery passes through the same guard and therefore cannot silently resume Release.
- Added `forge_change_complete`, which clears the override only after recorded implementation work, existing evidence paths, and verification checks.
- Direct-task STOP-points no longer mutate the canonical phase marker to `blocked`.

Verified with the GigaChat adapter self-test, Cyrillic natural-intent fixtures, release-hijack guards, compaction persistence assertions, and the full API terminal profile audit.
