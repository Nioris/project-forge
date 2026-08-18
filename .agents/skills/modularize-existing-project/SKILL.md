---
name: modularize-existing-project
kind: architectural
description: "Safely decompose an existing monolithic web game/app before feature work. Use when an HTML/JS/CSS entrypoint is over 32 KB, over 800 lines, repeatedly exhausts model context, or…"
---

# Modularize Existing Project

Use this workflow to reduce model context without changing product behavior. It is a structural prerequisite, not permission to redesign the game or add the requested feature in the same unverified step.

## Workflow

1. Identify the active `WorkProgress/<project>/index.html`. Never modify `GameIntegration/` or `Release/`.
2. Record a scoped local Git checkpoint of the entrypoint and directly related source files. If unrelated changes exist, stage explicit paths only.
3. Run the canonical analyzer from the managed project root:

   ```text
   node ../project-forge/scripts/modularize-existing-project.mjs WorkProgress/<project>/index.html
   ```

4. Capture a baseline playtest and at least one gameplay screenshot before mutation.
5. Apply the deterministic split:

   ```text
   node ../project-forge/scripts/modularize-existing-project.mjs WorkProgress/<project>/index.html --apply
   ```

   The tool externalizes inline CSS, splits classic inline JavaScript at existing top-level semantic section markers, preserves script order, rewrites relative CSS URLs, backs up the original entrypoint, and writes `wiki/architecture/modules.json` plus `modules.md`.

6. Run the structural verifier:

   ```text
   node ../project-forge/scripts/modularize-existing-project.mjs WorkProgress/<project>/index.html --check
   ```

7. Run the same playtest actions as the baseline, inspect screenshots, compare `render_game_to_text`, run local-stage, and review console errors. Fix regressions before feature work.
8. Commit only the verified module split. Then continue the original feature task by loading `modules.json`, `modules.md`, and only the owning/dependent modules.
9. After verified feature edits, connect every intentionally added numbered module from the entrypoint, then refresh hashes/symbols and adopt those referenced feature modules without reordering the previously approved sequence. Check again:

   ```text
   node ../project-forge/scripts/modularize-existing-project.mjs WorkProgress/<project>/index.html --refresh
   node ../project-forge/scripts/modularize-existing-project.mjs WorkProgress/<project>/index.html --check
   ```

## Invariants

- Default analyzer mode is read-only; mutation requires `--apply`.
- Ordered classic scripts share a global lexical environment. Do not reorder them or convert individual files to `type="module"` during this mechanical split.
- Existing module paths are never overwritten by `--apply`.
- A project-level `modules.json` may describe only the active user-targeted entrypoint; `--apply` refuses to replace another entrypoint's contract implicitly.
- A timestamped original entrypoint is preserved under `wiki/runtime/modularize-backups/`.
- `modules.json` hashes bind the documentation to the actual entrypoint and module files; `--check` fails on stale code or contracts.
- `--refresh` updates hashes, sizes, symbols, state/persistence owners and DOM IDs. It may adopt a newly referenced file under the entrypoint's `js/` or `styles/` directory, but preserves the relative order of every previously approved module. It refuses missing modules, orphan numbered files, new inline code, syntax errors, or reordering of approved boundaries.
- `--check` rejects both sides of a disconnected feature: a numbered module file that the entrypoint does not load, and a loaded `js/`/`styles/` module absent from `modules.json`.
- Do not combine modularization with a gameplay/economy/UI change. Establish behavioral equivalence first.

## Completion evidence

- `wiki/architecture/modules.json`
- `wiki/architecture/modules.md`
- successful `--check`
- successful canonical playtest and local-stage commands
- inspected before/after gameplay screenshots
- no new console/runtime errors
