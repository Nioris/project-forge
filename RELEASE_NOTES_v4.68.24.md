# Project Forge v4.68.24 — modularize large existing games

Forge can now reduce large monolithic web games into bounded, documented source modules before an AI performs feature work.

- New canonical `modularize-existing-project` skill activates for HTML/JS/CSS entrypoints over 32 KB, over 800 lines, or repeatedly exhausting model context.
- New deterministic `modularize-existing-project.mjs` analyzer is read-only by default; `--apply` performs the controlled split and `--check` verifies it.
- Inline CSS is externalized with relative `url(...)` rebasing.
- Classic inline JavaScript is split at existing top-level semantic section markers while preserving exact execution order and shared browser lexical scope.
- Existing module paths are never overwritten, and an original timestamped entrypoint backup is retained.
- `wiki/architecture/modules.json` records hashes, load order, state/persistence owners, storage keys, DOM IDs and required regression commands.
- `wiki/architecture/modules.md` gives agents a compact module map so feature work loads only relevant files.
- GigaChat direct-task routing detects remaining large WorkProgress sources and requires modularization plus baseline/regression checks before feature edits.
- GigaChat file reads expose a `modularize-existing-project` recommendation for large existing sources.
- A deterministic fixture test validates analysis, extraction, module order, state ownership, CSS URL rebasing, backup creation and stale-contract checks.

Validated on `testgigachat-v4`: its 93,367-byte / 2,549-line entrypoint became a 3,881-byte shell, one stylesheet and 17 ordered JavaScript modules. Structural verification, canonical playtest, targeted Playwright state/visual checks and local-stage all passed with zero runtime errors.
