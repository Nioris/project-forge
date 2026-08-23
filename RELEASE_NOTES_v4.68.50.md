# Project Forge v4.68.50

## Marker-authoritative project status

`$status` no longer mixes machine phase markers with legacy artifact inference phase by phase. Once a
project has started using `wiki/phases/phase-N.json`, the first missing marker remains the current gate,
even when an imported prototype already contains visual, SDK, localization, listing or QA artifacts.

Those artifacts are still reported as `artifactState` and `evidence ahead of gate`; they simply cannot
skip executable phase contracts. Projects with no valid markers retain the conservative legacy fallback.
The regression covers complete Phase 1–3 markers plus enough downstream evidence to reproduce the former
Phase 6 jump deterministically.

