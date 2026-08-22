# Project Forge v4.68.25 — safe module-contract refresh

Feature work can now update an approved modular game without manually editing or bypassing its hash-bound architecture contracts.

- `modularize-existing-project.mjs --refresh` recalculates module hashes, sizes, symbols, state/persistence ownership, storage keys, DOM IDs and entrypoint hash.
- Refresh preserves the approved module list, paths and load order.
- Refresh refuses missing or unreferenced modules, new inline CSS/JS, JavaScript syntax errors and implicit boundary changes.
- The canonical skill now requires `--refresh` followed by `--check` after verified feature edits.
- Fixture coverage proves stale edits are rejected before refresh and accepted only after a safe contract refresh that records the new symbol surface.

This closes the workflow gap found during the real `testgigachat-v4` forward test before giving GigaChat the gacha integration task.
