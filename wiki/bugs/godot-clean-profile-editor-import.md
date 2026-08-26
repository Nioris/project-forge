---
status: fixed_pending_installed_pilot
severity: high
tags: [bug, godot, sandbox, verifier, q3-009]
---

# Clean Godot profile crashed or stalled construct verification

## Problem

Q3-009 Phase 3 produced a valid modular GDScript game, but `check-godot-project.mjs` inherited the host
profile. Inside the Codex workspace boundary Godot could not write `user://` or editor settings and
reported certificate/profile errors before terminating with signal 11. After redirecting the profile,
editor-only `--import` no longer crashed but stalled indefinitely while generating editor theme assets.

## Expected vs actual

- Expected: verify a clean temporary project without touching the source `.godot` cache or the user's
  real Godot profile.
- Actual: the child inherited `APPDATA`/`USERPROFILE`, host errors were classified as project failures,
  and a fresh isolated editor profile made `--import` hang at `EditorTheme: Generating new styles`.

## Root cause

The project copy was isolated but the Godot user environment was not. The GDScript gate also used the
editor import path even though the authoritative requirement is to load the real game and reach its
startup marker. A clean runtime copy lacked `global_script_class_cache.cfg`, so simply removing editor
import exposed unresolved `class_name` references.

## Fix

- Every Phase 3–5/7 Godot runtime receives writable user/profile/XDG roots inside its temporary run.
- GDScript construct verification regenerates the global class cache from source only in the isolated
  copy, then loads the actual game through bounded native startup.
- C# keeps its explicit editor import/build lane.
- Certificate/user-store failures are infrastructure-owned; parse/compiler errors take precedence and
  remain project defects.
- Visual capture, proof video, tech and playtest use the same user/profile and class-cache helpers.

## Evidence

- Pilot diagnostic fingerprint: `c530d96159c9038b1875`.
- Regressions: `scripts/check-godot-project-fixtures.mjs`, `scripts/check-godot-visual-capture.mjs`,
  `scripts/check-godot-phase4-evidence.mjs`, `scripts/check-godot-playtest.mjs`.
- A direct pre-install Q3-009 diagnostic reached `CIRCUIT_COURIER_READY` from a cache-free isolated copy;
  this is root-cause evidence, not a Phase 3 completion claim. Installed-pipeline revalidation remains.

## Related

- [[../plan/Q3-009-godot-pilot-release]]
- [[../decisions/036-engine-capability-adapter-boundary]]
