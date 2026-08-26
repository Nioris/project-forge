---
name: godot-engine
kind: architectural
description: "Создаёт и проверяет native Godot 4 scaffold в Project Forge: project.godot, entry scene, GDScript cache/startup, C# import/build и serialization contract. Только когда forge.engine.json выбирает godot."
contract_version: 1
phases:
  - 3
modes:
  - phase
  - change
requires: []
reads:
  - "**"
writes:
  - forge.godot.json
  - forge.godot.visual.json
  - WorkProgress/**
  - wiki/**
verifiers:
  - godot-project
stop_points: []
risk_shell: write
risk_external: none
references:
  - references/godot-csharp.md
  - references/godot-visual-qa.md
  - references/godot-test-release.md
completion_contract: status/references/phase-contracts/phase-3.json
---

# Godot engine scaffold and construct gate

Use this only after `phase-state.mjs start 3` reports `engineRuntime.engine=godot` and
`constructVerifier=true`. `forge.engine.json` selects the engine; it does not describe or authorize
the implementation layout.

## Contract first

Create root `forge.godot.json` matching `schemas/godot-project.schema.json`. It owns four facts:

- `projectPath` — safe path to the actual Godot workspace, normally `WorkProgress/<project>`;
- `scripting` — `gdscript` or `csharp`;
- `entryScene` and bounded smoke marker/frame count;
- minimum serialized scene graph: required node paths, exact node types and exact script attachments.

Use this dependency-light baseline for a first 2D GDScript construct, then replace paths/types with the
approved Phase 2 architecture instead of weakening the contract:

```json
{
  "minimumNodeCount": 3,
  "requiredNodes": ["Main", "Main/World", "Main/UI"],
  "requiredNodeTypes": { "Main": "Node", "Main/World": "Node2D", "Main/UI": "Control" },
  "requiredScripts": ["res://main.gd"],
  "requiredScriptAttachments": { "Main": "res://main.gd" }
}
```

Do not point the contract at `GameIntegration/` or `Release/`. Do not weaken required nodes merely to
make a broken save pass; derive them from the approved Phase 2 architecture.

## Build the native scaffold

Inside `projectPath` create at minimum:

1. `project.godot` with `run/main_scene` equal to the contract `entryScene`;
2. a text `.tscn` entry scene whose serialized nodes satisfy `sceneContract`;
3. production script(s) attached to that scene;
4. a `_ready` path that prints the exact smoke marker only after essential initialization succeeds;
5. `.gitignore` coverage for `.godot/`, C# `bin/` and `obj/` when applicable.

If Phase 2 has an approved Godot screen flow, also read
[references/godot-visual-qa.md](references/godot-visual-qa.md) and build its native state/proof
adapter during Phase 3. Do not postpone the adapter until visual acceptance: Phase 4 must inspect
the real runtime states, not retrofit test-only screens after construction.

For the Phase 5/7 native state/save protocol and Phase 8 Windows bundles, read
[references/godot-test-release.md](references/godot-test-release.md). Those later phase adapters are
engine-profile capabilities; they do not turn the common Forge pipeline into a Godot-only workflow.

Prefer GDScript for the fastest dependency-light pilot. Use C# only when the project needs it and the
machine has a .NET-enabled Godot editor plus a compatible SDK. For C#, read
[references/godot-csharp.md](references/godot-csharp.md) before creating the first script.

## Mechanical verification

Run from the managed Forge project root:

```bash
node ../project-forge/scripts/check-godot-project.mjs . --json
```

The verifier copies the implementation to an isolated temporary directory and gives Godot a temporary
writable user profile, so `user://`, editor settings and `.godot` caches cannot touch the project or the
developer profile. For GDScript it regenerates the global `class_name` cache inside that copy and loads
the real game through a bounded startup; it does not start editor-only `--import`. For C# it retains the
separate isolated import/build path. It checks the factual tool versions, contract, serialized scene
graph, exact node types, actual script attachment and startup marker. Exit `0` is PASS, `1` is a project
defect, and `2` is an environment/toolchain blocker.

Do not replace this with `playtest.mjs`, browser screenshots, a manually written PASS report, or an
editor window that was merely opened. Fix every project defect; surface environment blockers with the
reported code and exact detected versions.

Project-specific smoke scenes or scripts are supplementary and must never be launched through a raw
`godot`, `godot_console`, positional scene command, or an unbounded shell timeout against the working
project. Use the installed isolated runner instead:

```bash
node ../project-forge/scripts/run-godot-smoke.mjs . --scene res://tests/smoke/example.tscn --marker EXAMPLE_SMOKE_PASS --json
node ../project-forge/scripts/run-godot-smoke.mjs . --script res://tests/smoke/example.gd --marker EXAMPLE_SCRIPT_PASS --json -- --mode=verify
```

It copies only the Godot implementation to a temporary directory, regenerates the GDScript class
cache there, supplies a separate writable `user://`, forces headless execution and kills the entire
process tree on timeout. A timeout, missing marker or nonzero exit is a failure; do not reinterpret a
forced Godot crash-handler backtrace as harmless success. Real-window rendering remains exclusive to
the canonical visual/tech/playtest tools described in the references.
