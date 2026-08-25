---
name: godot-engine
kind: architectural
description: "Создаёт и проверяет native Godot 4 scaffold в Project Forge: project.godot, entry scene, GDScript/C#, headless import/build/startup и serialization contract. Только когда forge.engine.json выбирает godot."
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

The verifier copies the implementation to an isolated temporary directory, so headless import/build
cannot write `.godot` caches into the project. It checks the factual tool versions, contract, serialized
scene graph, exact node types, actual script attachment, import, C# build when selected, and bounded
startup marker. Exit `0` is PASS, `1` is a project defect, and `2` is an environment/toolchain blocker.

Do not replace this with `playtest.mjs`, browser screenshots, a manually written PASS report, or an
editor window that was merely opened. Fix every project defect; surface environment blockers with the
reported code and exact detected versions.
