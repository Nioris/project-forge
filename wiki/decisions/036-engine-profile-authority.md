# Decision 036 — Engine profiles are orthogonal to agent hosts

Date: 2026-08-25
Status: accepted

## Context

Forge already routes work across Codex, Claude, GigaChat and OpenCode/OpenRouter hosts. Godogen shows
that one compact source can publish guidance for several game engines, but its current runtime leaves
planning and implementation to the host model.

## Decision

1. Add a project-level `forge.engine.json` contract whose allowed values come from an installed-engine
   registry. Missing configuration means `web` for backward compatibility.
2. Keep `engine` outside `.forge-ai.json`, Task and RunResult. AI provider configuration, project
   execution environment and bounded task state have different lifetimes and authorities.
3. Route phases through engine capabilities. A browser verifier cannot prove a Godot build; a missing
   engine adapter fails closed instead of falling back silently.
4. Keep the nine Forge phases, durable graphs, independent reviewer and release invariants. Engine
   profiles supply implementation/capture/test/export adapters inside those phases.
5. Treat Godogen as an attributed research source, not a runtime dependency.

## Consequences

- Existing projects need no migration and remain web projects.
- New native engines can be added without multiplying host adapters or phase state machines.
- Godot may appear as experimental before its runtime adapters exist, but cannot pass browser-only gates.
- Any material MIT-licensed upstream code copied later must carry its copyright and license notice.

Sources:
- https://github.com/htdt/godogen/blob/master/docs/PROJECT.md
- https://github.com/htdt/godogen/blob/master/CHANGELOG.md
- https://docs.godotengine.org/en/4.6/tutorials/scripting/c_sharp/index.html

