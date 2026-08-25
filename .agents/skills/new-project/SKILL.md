---
name: new-project
kind: architectural
description: "Create a new isolated Project Forge project with its own local Git repository, managed runtime and explicit engine profile. Use when user says \"new project\", \"новый проект\"…"
---

# New Project

## Purpose

Creates a sibling project with the canonical `GameIntegration → WorkProgress → Release` layout,
durable wiki state, Claude/Codex/generic-agent runtime, local Git history and an explicit game-engine
profile. Projects do not share mutable code or phase state.

## Step 1 — Research the direction

For a genuinely new product idea, run `$research-references` and `$find-or-make-skill` before
implementation. Show the user the compact research direction and stop for confirmation when the
research skill requires it. Do not spend on assets or start implementation before that STOP is resolved.

If the user supplied a finished GDD/brief and explicitly asked for execution, create the project and let
Phase 1 validate the supplied evidence instead of inventing a second brief.

## Step 2 — Select project type and engine

Engine selection is independent from the terminal AI host:

| Engine | Status | Project types | Boundary |
|---|---|---|---|
| `web` | stable, default | game, app | Existing HTML/browser pipeline |
| `godot` | experimental | game only | Native desktop/mobile path; incomplete adapters fail closed; Godot C# has no Web export |

If the user did not select an engine, use `web`. Never put engine selection in `.forge-ai.json`, Task,
RunResult or an agent profile. The authoritative project file is `forge.engine.json`; missing files in
legacy projects mean `web`.

## Step 3 — Create the sibling project

From the installed Project Forge root:

```powershell
node scripts/new-project.mjs my-game --type game --engine web --title "Название игры"
```

Godot pilot:

```powershell
node scripts/new-project.mjs my-godot-game --type game --engine godot --title "Название игры"
```

The command creates the folder beside `project-forge`, writes `forge.engine.json`, syncs the managed
runtime and initializes a local Git checkpoint. Private GitHub creation follows the existing workspace
Git policy; a remote failure must not destroy the local repository.

## Step 4 — Add source material and start

Put user-provided sources only in `GameIntegration/`. Phase 1 copies them to `WorkProgress/`; all active
edits happen there. Then open the project and start the canonical phase:

```powershell
cd ..\my-game
node ..\project-forge\scripts\codex-pipeline.mjs --cwd .
```

Claude Code starts with `$phase-1-analyze .`; Codex uses `$phase-1-analyze .` in a manual session.

## Verification

```powershell
node scripts/engine-profile.mjs check ..\my-game
node scripts/check-project-git.mjs
```

Confirm the new project contains `forge.engine.json`, `.forge-managed.json`, `FORGE.md`, `AGENTS.md`,
both skill surfaces and a local Git commit. For `godot`, experimental status is expected until the native
construct/capture/playtest/export tasks are complete; browser checks must never substitute for them.

## Non-Negotiable Acceptance Criteria

- [ ] Project lives beside the Forge engine and has its own local Git repository.
- [ ] `forge.engine.json` is valid; missing legacy config defaults only to `web`.
- [ ] `app + godot` and unknown engines are rejected.
- [ ] Managed runtime sync completed for Claude, Codex and generic agents.
- [ ] Sources remain read-only in `GameIntegration/`; active edits use `WorkProgress/`.
- [ ] Research/decision STOP-points are preserved.
- [ ] Experimental Godot cannot claim completion through browser-only evidence.
