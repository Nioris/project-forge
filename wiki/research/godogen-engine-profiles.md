# Godogen research — useful parts for Project Forge

Date: 2026-08-25

## Primary sources

- Repository/source layout: https://github.com/htdt/godogen#source-layout
- Current runtime: https://github.com/htdt/godogen/blob/master/prompts/runtime.md
- Current architecture: https://github.com/htdt/godogen/blob/master/docs/PROJECT.md
- Godot guide: https://github.com/htdt/godogen/blob/master/engines/godot.md
- Asset skill: https://github.com/htdt/godogen/blob/master/asset-gen/SKILL.md
- Runtime simplification: https://github.com/htdt/godogen/blob/master/CHANGELOG.md
- Godot C# platform limits: https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html

## Findings

1. Current Godogen is a thin publisher of a runtime manifest, one engine guide and one asset skill.
   Codex/Claude supplies planning, scaffolding and implementation; Godogen is not another model or
   a standalone orchestrator.
2. The July 2026 runtime deliberately removed the old fixed stages and hooks. Forge should not copy
   that choice: durable phases, verifier authority, STOP ownership and independent review are required
   for weaker/non-native hosts and for restart safety.
3. High-value reusable ideas are engine-specific progressive disclosure, proof from the running game,
   deterministic motion capture, silent-failure recipes, and an asset manifest with in-game scale/cost.
4. The upstream setup is Linux/macOS-oriented (`bash`, `rsync`, `xvfb`). Forge needs native Node/Windows
   implementations and must not depend on the upstream repository at runtime.
5. Godot 4 C# currently has no Web export. The initial profile is desktop/native; web projects remain
   on the stable web pipeline or a future Babylon.js profile.

## Local toolchain probe — 2026-08-25

- Detected Godot: `4.7.stable.official.5b4e0cb0f` at `C:\Tools\Godot`.
- Detected .NET SDK: `5.0.416`; compatibility is not inferred from that number. The verifier records
  it and lets Godot `--build-solutions` decide against the actual editor/SDK combination.
- A clean GDScript scene starts headlessly and reaches `FORGE_SMOKE_READY`.
- The installed editor's `--headless --import --quit` hangs during editor initialization. The bounded
  verifier kills the whole process tree after 45 seconds and reports `environment_failure`; it does
  not leak background Godot processes or reinterpret the timeout as project PASS.

Official command semantics: https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html

Official C# prerequisites and platform limits:
https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html

## Integration boundary

- Keep Forge as orchestrator and evidence authority.
- Represent the game engine independently from the terminal AI host.
- Adapt concepts in original Forge code/text; do not vendor Godogen wholesale.
- Add attribution in this research/decision record. Add a full MIT notice only if material upstream
  code or prose is copied later.
