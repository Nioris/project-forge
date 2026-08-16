# Project Forge v4.66.8 — resilient fleet sync and AV-safe dialogue extraction

Date: 2026-08-14

## Field failure

During a real Windows fleet update, Project Forge had already synchronized several sibling projects when `scripts/sync.mjs` failed with `ENOENT` while reading:

`project-forge/.agents/skills/asset-generation/references/extract_says.js`

The shipped ZIP contains that file and `sync-codex-adapter.mjs` recreates it correctly. The disappearance happened after adapter generation and while the long fleet sync was in progress, which is consistent with an external security/indexing process modifying the generated tree. Regardless of the external cause, Forge should not allow a source-tree mutation to produce a half-synchronized fleet.

## Fix 1 — atomic source snapshot before propagation

`forge-sync-spec.mjs` now exposes `snapshotPayload(root)`, which expands the managed payload and immediately reads every Forge-owned source file into memory.

`sync.mjs` uses those buffers for all sibling comparisons and writes. It no longer re-opens engine source files while walking project 1, project 2, ... project N.

Consequences:

- a file removed after snapshot capture cannot break the current fleet sync;
- no sibling receives content from a different source-tree state than another sibling in the same run;
- if a source disappears before it can be captured, sync aborts before touching any sibling and prints a targeted diagnostic.

## Fix 2 — no dynamic execution in extract_says.js

The old helper used Node `vm.runInContext()` to load project dialogue scripts and inspect globals. That was useful for one historical VN shape but is unnecessarily execution-heavy for a reusable asset helper and can resemble suspicious dynamic-code behavior to endpoint security products.

The v4.66.8 helper is a conservative static tokenizer/scanner. It extracts only literal string properties from literal `op: "say"` / `op: 'say'` command objects. It never evaluates the project script. Dynamic values, concatenations and template literals with `${...}` are skipped instead of executed.

The output contract remains `{ who, text, hash[, vtag] }`, so `generate_voice.py` stays compatible.

## Regression gate

`scripts/check-sync-snapshot.mjs` snapshots a synthetic managed file, deletes the source, and verifies the in-memory payload remains usable.

## Security boundary

This release does not add antivirus exclusions, disable endpoint protection, change the registry, or download code. The safer extractor removes one dynamic execution path instead.
