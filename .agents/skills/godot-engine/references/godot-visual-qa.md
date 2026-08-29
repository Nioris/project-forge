# Godot native visual QA protocol

Read this only for a Godot project with an approved `wiki/design/screen-flow.json`. The adapter is
production-inert unless Forge supplies `--forge-visual-mode`; it must expose real game states without
external clicks, test-only mock screens or browser globals.

## Install the driver

1. Copy the matching installed template into the Godot project:
   - GDScript: `templates/godot/ForgeVisualQA.gd`;
   - C#: `templates/godot/ForgeVisualQA.cs`.
2. Register it under `[autoload]` in `project.godot`, for example
   `ForgeVisualQA="*res://qa/ForgeVisualQA.gd"`.
3. Create root `forge.godot.visual.json` matching `schemas/godot-visual.schema.json`. Keep mobile
   width at 412, proof duration at 15–20 seconds and list at least two approved states.
4. On `adapter.targetNode` implement exactly:
   - `forge_visual_states()` — every approved `capture.adapterState`, no hidden omissions;
   - `forge_visual_show_state(id)` — synchronous deterministic state preparation;
   - `forge_visual_current_state()` — the state actually visible now;
   - `forge_visual_tick_proof(frame, total_frames, fps)` — deterministic visible behavior driven by
     frame number, not wall clock, network, input or unseeded randomness.

The driver waits for `RenderingServer.frame_post_draw` before saving a PNG. Never replace it with
`--headless`: Godot headless disables real rendering/window management and cannot prove pixels.

## Native capture

From the managed project root, inside a Forge host session:

```bash
node ../project-forge/scripts/godot-screens-shoot.mjs . --json
node ../project-forge/scripts/godot-proof-video.mjs . --json
```

The first command creates one 412px mobile and one desktop PNG for every approved state. The second
uses Godot MovieWriter at fixed FPS. It validates the MJPG stream headers, every JPEG frame, final
`idx1` offsets/sizes, frame count and at least 12 unique encoded video frames; separately it requires
one dimensioned lossless PNG sample per second and at least 12 unique samples. Changing samples while
leaving the AVI frozen is therefore a hard failure. Both commands run an isolated copy, bind the
adapter/contract/full implementation snapshot, classify missing display/GPU/codec as environment
failure and never treat a manually imported image as runtime evidence.

## Phase 4 evidence order

Builder session:

```bash
node ../project-forge/scripts/godot-screens-shoot.mjs . --json
node ../project-forge/scripts/godot-proof-video.mjs . --json
node ../project-forge/scripts/prepare-godot-phase4-review.mjs .
node ../project-forge/scripts/bind-phase4-visual-evidence.mjs . --init screens/review/phase-4-visual-evidence.template.json
```

Then a different host task/session opens every live mobile/desktop screenshot beside its exact target,
watches the complete AVI, opens every one-second PNG sample, writes the Markdown report and fills the
reject-by-default JSON. It must list each configured state exactly once and every sample hash in
timeline order. In the managed Codex pipeline the builder ends its turn here with Phase 4 still
`in_progress`: it must not spawn a subagent, start nested `codex exec`, or create a user STOP. The
authenticated parent creates the clean reviewer session and, after that session exits, runs:

```bash
node ../project-forge/scripts/bind-phase4-visual-evidence.mjs .
node ../project-forge/scripts/record-phase4-visual-review.mjs .
node ../project-forge/scripts/check-phase4-visual-evidence.mjs . --json
```

The reviewer itself writes only `wiki/qa/phase-4-visual-review.md` and
`wiki/qa/phase-4-visual-evidence.json`; the parent owns bind/receipt/check so the reviewer identity
cannot collide with the builder and a missing CLI login inside a sandbox cannot block the phase.
Outside the managed pipeline, run the same commands from the independent reviewer host session.
Once the parent records REJECT, that verdict is binding for the current repair cycle. The builder must
not spawn a counter-reviewer or rewrite QA; it repairs all Major/low-score findings, produces new
capture/proof identities and hands those new pixels back to the parent.

Binding changed capture, targets, style bible or proof resets the affected review to `reject`; it never
reuses prose/scores against new pixels. Receipts detect later project-local replacement. They are a
host-attested integrity boundary, not protection against a process that already has unrestricted
access to the trusted Forge installation and its private receipt store. Real-engine forward testing
must therefore remain separate from synthetic policy fixtures.
