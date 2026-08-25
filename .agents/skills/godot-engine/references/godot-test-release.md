# Godot native tech, playtest and Windows release

Godot is one engine adapter behind the common Forge phase contracts. These commands are valid only
when trusted `forge.engine.json` selects `godot`; they never substitute for the Web/Yandex route.

## GDScript QA contract

Root `forge.godot.playtest.json` must match `schemas/godot-playtest.schema.json`. It declares:

- the exact inert `ForgePlaytestQA.gd` autoload and target production node;
- at least two existing InputMap actions;
- non-empty expected state before input and after every action;
- final progress and expected fresh-process reload state.

Copy `templates/godot/ForgePlaytestQA.gd` byte-for-byte into the Godot implementation. The trusted
reader rejects modified adapters. The production node, not a QA shim, implements:

- `forge_playtest_state()`;
- `forge_playtest_reset()`;
- `forge_playtest_save()`;
- `forge_playtest_load()`.

Run from the managed project root:

```bash
node <Forge>/scripts/godot-tech-check.mjs . --json
node <Forge>/scripts/godot-playtest.mjs . --json
```

Both use a real window/renderer. Tech proves InputMap, production methods and isolated `user://`.
Playtest starts two fresh processes: save and reload. Forge independently compares every state and
requires the reloaded state to equal the state given to production save. Test shims, runtime errors,
source mutation and headless/dummy rendering cannot PASS.

Godot C# is intentionally environment-blocked until a separate exact .NET QA adapter is installed.

## Windows export contract

Root `forge.godot.export.json` must match `schemas/godot-export.schema.json` and select only:

- preset: `Windows Desktop`;
- target: `windows-x86_64`.

`export_presets.cfg` must expose that exact preset, explicitly set
`binary_format/architecture="x86_64"`, keep a separate PCK, contain no credential values and use no
custom template. Install export templates matching the detected Godot editor.
Keep `.godot/export_credentials.cfg` outside source control and release artifacts.

```bash
node <Forge>/scripts/build-godot-release.mjs <slug> --root . --json
node <Forge>/scripts/godot-release-verify.mjs . --json
```

The builder validates current trusted Phase 4 capture/proof/review, exports release and debug from an
isolated copy, then atomically publishes a new patch version. One whole version directory is committed
with a single rename: `Release/<slug>/godot/windows/<vN.N.N>/`:

- production ZIP: `<slug>.exe` + `<slug>.pck`;
- debug ZIP: debug `<slug>.exe` + `<slug>.pck`;
- marketing ZIP: current Phase 4 evidence/media only;
- external release manifest binding source, preset, engine, export-mode provenance and artifact hashes.

After a real export, the installed Forge records an engine-owned signed build receipt outside the
project. The verifier reads ZIP entries without extracting them to disk, rejects links/traversal,
unsafe paths, secrets and binary marketing content, then verifies every hash, current source/preset,
export modes, signed build receipt and Phase 4 receipt binding. A fixture exporter writes only under
`qa/godot-release-test-output/` and is permanently unable to publish `Release/` or PASS Phase 8.

Official references:

- CLI and `--headless`/`--export-release`: https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html
- Export presets/templates: https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html
- Windows export: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html
- `res://` and `user://`: https://docs.godotengine.org/en/stable/tutorials/io/data_paths.html
