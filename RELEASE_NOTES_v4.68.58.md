# Project Forge v4.68.58

## Crash-safe isolated Godot runtime

Godot construct, visual capture, proof-video, tech and playtest processes now receive a fresh writable
user profile inside each verifier's temporary runtime. `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `HOME`
and the XDG data/config/cache roots no longer point at the developer's real profile. This keeps
`user://`, editor settings and runtime cache writes inside the verifier boundary.

Host certificate/user-store failures are reported as `environment_failure`. A real GDScript/C# parse or
compile error always remains a project failure, including output that also contains a display or host
error.

## Editor-free GDScript construct gate

Godot 4.7 can stall in editor-only `--import` while generating a clean profile's editor theme. The
GDScript verifier no longer starts the editor for a game construct check. It regenerates
`.godot/global_script_class_cache.cfg` only inside the isolated copy and then performs a bounded native
game startup that loads the actual scenes, scripts and resources and must print the contract smoke
marker. The C# lane retains its separate editor import and solution-build checks.

The same isolated class-cache preparation is shared by Phase 4 capture/proof and Phase 5/7 native
runtime checks, so a fresh checkout does not depend on an ignored developer `.godot` cache.

## Verification

- 22 construct-verifier fixture regressions pass.
- 26 native visual-capture regressions pass.
- 25 Phase 4 adversarial evidence regressions pass.
- 34 native tech/playtest adversarial checks pass.
- A direct pre-install diagnostic against Q3-009 reached native startup on Godot
  `4.7.stable.official.5b4e0cb0f`; durable Circuit Courier Phase 3 completion is intentionally pending
  repetition through the installed v4.68.58 phase gate.

Repository headers now say “current source version” instead of claiming an unbuilt candidate is already
public. The bump tool preserves this truthful wording for future immutable packages.

`bump-version.mjs` also treats `--dry-run` as a real dry-run and rejects unknown or ambiguous options
before mutation. A full-tree hash regression covers both dry aliases, help and invalid modes.
