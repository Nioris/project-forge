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

## Native visual capture facts — 2026-08-25

- Godot `--write-movie` records at deterministic fixed FPS; `.avi` uses MJPEG and `.png` produces a
  lossless numbered frame sequence. Forge uses bounded, normal process completion so the container is
  finalized instead of killing a writer mid-file.
- `--fixed-fps` and `--quit-after` make the proof reproducible by frame count rather than wall time.
- `--headless` is not visual evidence: it disables display/rendering behavior and may return dummy
  RenderingServer values. Native capture therefore uses a real display driver without external clicks.
- A state PNG is saved only after `RenderingServer.frame_post_draw`, from the actual viewport texture.

Official MovieWriter guide:
https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html

Official Viewport capture references:
https://docs.godotengine.org/en/stable/classes/class_viewport.html
https://docs.godotengine.org/en/stable/tutorials/rendering/viewports.html

Official headless RenderingServer limitation:
https://docs.godotengine.org/en/stable/classes/class_renderingserver.html

Official C# prerequisites and platform limits:
https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html

## Native evidence forward-test — 2026-08-25

- A second independent run used real Godot `4.7.stable`, a normal renderer and no shim/headless mode.
- State capture produced all 6 required frames: three states at mobile `412×820` and desktop
  `1280×720`; different states had different pixel hashes.
- MovieWriter produced MJPEG `1280×720@30`, `451` actual frames for `450` expected (allowed ±1),
  `450` unique encoded frames, and a validated final `idx1` with `451` video entries among `902`
  total entries. All 15 one-second lossless samples were unique.
- Capture/proof implementation snapshots and engine-owned receipts verified; source `project.godot`
  kept the same SHA-256 before/after, and no Godot process remained.
- Deterministic regressions separately cover frozen AVI with changing samples, bad `idx1`, malformed
  JPEG/AVI, short video, state mismatch, duplicate review coverage, stale snapshots/media,
  self-review and Web/Godot evidence substitution. Synthetic policy fixtures are not counted as
  real-engine proof because the receipt store trusts the installed host boundary.

## Integration boundary

- Keep Forge as orchestrator and evidence authority.
- Represent the game engine independently from the terminal AI host.
- Adapt concepts in original Forge code/text; do not vendor Godogen wholesale.
- Add attribution in this research/decision record. Add a full MIT notice only if material upstream
  code or prose is copied later.
