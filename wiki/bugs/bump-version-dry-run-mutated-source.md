---
status: fixed
severity: high
tags: [bug, release, versioning, cli, q3-009]
---

# Unknown bump-version dry-run option mutated source

## Problem

During the v4.68.58 independent audit, `bump-version.mjs 4.68.59 --dry-run` was intended as a read-only
probe. The script recognized only `--dry`, silently ignored `--dry-run` and changed every managed version
surface to 4.68.59. No ZIP, commit or external publication occurred.

## Root cause

The CLI searched arguments for a semver and known flags but never rejected unknown options. Therefore an
unsupported option could coexist with a valid target and fall through to the mutating path.

## Fix

- `--dry-run` is an explicit alias of `--dry`.
- Unknown options and ambiguous `--current`/target combinations fail before reading or writing version
  surfaces.
- `--help` exits before repository work even when a target is also present.
- `check-bump-version.mjs` copies the complete Forge tree, hashes it before/after five informational or
  invalid invocations and rejects any byte change.
- The regression is part of `check-drift.mjs` and the internal verifier registry.

## Recovery evidence

- The accidental 4.68.59 normalization was restored through the corrected tool; no reset/clean command
  was used and no 4.68.58/4.68.59 ZIP existed.
- `rg 4.68.59` is empty across current source surfaces.
- The five side-effect regressions pass.

## Related

- [[../plan/Q3-009-godot-pilot-release]]

