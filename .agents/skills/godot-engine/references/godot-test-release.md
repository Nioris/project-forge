# Godot native tech, playtest and export evidence

Godot is an **engine adapter**, not a storefront target. These rules apply only when trusted
`forge.engine.json` selects `godot`; they produce native evidence and candidates for targets that
the installed platform registry marks compatible with Godot. They never choose targets, invent a
Windows store, or replace target-specific receipt/delivery requirements.

Before Phase 8, project `forge.targets.json` is mandatory and must validate against the installed
registry. Read `docs/PLATFORM-RELEASE-CONTRACTS.md` and run:

```bash
node scripts/platform-profile.mjs check <project-root>
```

For each selected target, use its profile's artifact family/format and write a target release receipt.
After the immutable base Web/Android/Windows artifacts exist, let `build-all-platforms.mjs --level
local` create a missing per-target matrix and verify it. The coordinator requires one coherent version
and source snapshot, never guesses between release slugs and never overwrites an existing matrix. Only
actual external delivery can raise it to `--level submit`; that mode is read-only.

## GDScript QA contract

Root `forge.godot.playtest.json` must match `schemas/godot-playtest.schema.json`. It declares:

- the exact inert `ForgePlaytestQA.gd` autoload and target production node;
- at least two existing InputMap actions;
- non-empty expected state before input and after every action;
- final progress and expected fresh-process reload state.

Copy `templates/godot/ForgePlaytestQA.gd` byte-for-byte into the Godot implementation. The trusted
reader rejects modified adapters. The production node, not a QA shim, implements
`forge_playtest_state()`, `forge_playtest_reset()`, `forge_playtest_save()` and
`forge_playtest_load()`.

```bash
node <Forge>/scripts/godot-tech-check.mjs . --json
node <Forge>/scripts/godot-playtest.mjs . --json
```

Both use a real window/renderer. Tech proves InputMap, production methods and isolated `user://`.
Playtest starts two fresh processes and independently compares save/reload state. Test shims, runtime
errors, source mutation and headless/dummy rendering cannot PASS. Godot C# remains environment-blocked
until a separate exact .NET QA adapter exists.

## Windows export lane

Root `forge.godot.export.json` must match `schemas/godot-export.schema.json` and select only preset
`Windows Desktop` with target `windows-x86_64`. `export_presets.cfg` needs that exact preset,
`binary_format/architecture="x86_64"`, a separate PCK, debug-only console wrapper (default or
`debug/export_console_wrapper=1`), no credentials and no custom template. Installed export templates
must match the detected Godot editor. Keep `.godot/export_credentials.cfg` out of source control and
release artifacts.

```bash
node <Forge>/scripts/build-godot-release.mjs <slug> --root . --json
node <Forge>/scripts/godot-release-verify.mjs . --json
```

The builder exports release/debug from an isolated copy, creates a new version directory and records
an engine-owned signed receipt outside the project. The verifier checks archives without extracting,
hashes, source/preset/export modes, receipt binding and Phase 4 evidence. Fixture exporters cannot
publish `Release/` or pass Phase 8.

This lane proves a Godot Windows distribution. It is **not** a universal release and does not imply
Steam or VK Play upload, IDs, SteamPipe/GameCenter delivery, account access, moderation or publication.
For a selected Windows storefront, create that storefront's candidate/receipt and use:

```bash
node scripts/build-all-platforms.mjs <project-root> --level local --json
node scripts/build-all-platforms.mjs <project-root> --level submit --json
```

At `local`, an honest `external-blocked` receipt is valid if external prerequisites remain. `submit`
requires verified delivery, passed required integrations and no blockers for every selected target.

Official references:

- CLI/export: https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html
- Export presets/templates: https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html
- Windows export: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html
- `res://` and `user://`: https://docs.godotengine.org/en/stable/tutorials/io/data_paths.html
