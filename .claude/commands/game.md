---
description: Smart router for game projects. Auto-detects what to do based on context — new game / analyze existing / continue work / UI redesign / pre-release. One command, AI figures out next step.
argument-hint: "[optional: description / file path / specific task]"
---

# /game — Smart router для игровых проектов

User invoked `/game $ARGUMENTS`.

You are the **game project orchestrator**. The user said `/game` — your job is to **figure out what they need** without asking 5 questions. Read context, decide, execute.

## Step 1 — Read context (silent)

Before any action, gather state:

1. Read `wiki/_map.md` if exists — current project state
2. Read `wiki/_current.md` if exists — active task
3. Check working directory — `.html` / `index.html` / canvas code → existing game; empty / no game files → new project
4. If `$ARGUMENTS` provided — that's intent signal:
   - File path → analyze that file
   - Description ("idle clicker about pirates") → new project
   - Action verb ("redesign UI", "release", "continue") → that action
   - Empty → check state, default to most likely action

## Step 2 — Determine intent

Use this decision table. **Pick one path, don't ask user unless truly ambiguous.**

| Signal | Intent | Action |
|---|---|---|
| No `wiki/` and `$ARGUMENTS` describes idea | **New project** | Invoke `start` skill with description |
| No `wiki/` and existing `.html` game file | **Analyze existing** | Invoke `analyze-game` skill |
| `wiki/_current.md` shows incomplete task | **Continue** | Invoke `continue` skill |
| `wiki/` exists, no active task, screenshots provided showing UI issues | **UI redesign** | Invoke `ui-pipeline` skill |
| `wiki/` exists, project is mature (>5 sessions), no urgent pain | **Pre-release prep** | Invoke `release-yandex` / `build-apk` skills as appropriate |
| `$ARGUMENTS` contains "mvp" / "доведи до релиза" / "готовь к подаче" / "прогон" | **MVP autonomous pipeline** | Invoke `mvp-to-yandex` skill (analyze + expand к 7-day retention + build + documents) |
| `$ARGUMENTS` contains "auto release" / "до зелёного" / "автономный релиз" / similar | **Hands-free release loop** | Invoke `auto-release` skill (uses `/goal` v2.1.139+) |
| `wiki/` exists, ambiguous | **Show status** | Read map, show short summary, ask user "что дальше: продолжить / UI / релиз / новая фича?" |

Voice the determination explicitly:

```
Project state: {summary in 1 sentence}
Detected intent: {what I think you want}
Running: /{skill-name}
```

If user's `$ARGUMENTS` overrides detection — respect them. User signals win over inference.

## Step 3 — Execute via sub-skills

You don't do the work yourself. You **invoke the right skill** based on intent.

Game-specific skills available:
- `start` — bootstrap new project from description
- `analyze-game` — analyze existing HTML5 game
- `pipeline` — full lifecycle orchestrator (8 steps: discovery → research → metrics → design → build → polish → mobile → release)
- `continue` — resume from saved state
- `ui-pipeline` — full UI redesign (audit → hierarchy → layout → implement → verify)
- `game-design` — core loop, retention, balance
- `level-design` — generators for 10 genres
- `visual-upgrade` — palette, juice, animation
- `mobile-adapt` — port to mobile
- `monetization-design` — ad placements, IAP
- `release-yandex` / `build-apk` / `rustore-publish` — release flows
- `polish-app` / `game-polish` — pre-release polish
- **3D games (Three.js):** `three-setup` (scene boilerplate) → `procedural-geo` (geometry by code) → `visual-style` (16 looks) → `shader-fx` (custom GLSL/TSL) → `3d-perf` (optimization). For "3д игра" / "3d game" / "three.js" — start with `three-setup`.
- 90+ more skills available — invoke by capability, not name

If you need a capability you don't see — read `.claude/skills/advisor/SKILL.md` for full catalog.

## Step 4 — Fallback to /find-skill (if no clear intent)

If after Step 2 you can't pick a clear path AND `$ARGUMENTS` describes a capability ("integrate Stripe", "add Discord bot", "OAuth login"):

**Don't just invoke `start` with that description.** Instead:

1. Run `node scripts/search-skills.mjs "<arguments>"` to find local skills first
2. If strong match (relevance ≥70) — invoke that skill
3. If weak — invoke `/find-skill` который handles marketplace discovery

This routes specific capability requests to discovery rather than blind project bootstrap.

## Step 5 — Stay silent on machinery

User doesn't need to know about routing logic. Just say:

```
Running pipeline for new tower defense game.
Step 0 — discovering existing assets...
```

Not:

```
I have determined that since wiki/_map.md doesn't exist and you provided a description,
my routing logic indicates I should invoke the start skill. Initializing now...
```

## Anti-patterns

- ❌ Don't ask "what do you want to do" if context makes it obvious
- ❌ Don't list all 9 sub-skills as menu options — pick one
- ❌ Don't run multiple skills in parallel — sequential, with stops
- ❌ Don't ignore `$ARGUMENTS` — that's the user's explicit signal
- ❌ Don't create file paths blind — read context first

## Begin

Read context. Determine intent. Invoke right skill. Now.
