# Project Forge v4.68.1 — Codex engine instructions

<!-- GENERATED from Forge canonical sources; claude-hash:4c4feb4f8ffc54e3; target:engine; do not edit by hand. -->

This is the Project Forge engine repository. Claude Code support in `.claude/` remains canonical. Codex is a generated/native adapter over that source; `FORGE.md` + `adapters/agents.json` provide a host-neutral contract for additional terminal agents such as GigaCode.

## Critical workspace discipline

- `GameIntegration/` = user-dropped source material. Read-only. Never modify it.
- `WorkProgress/{Project}/` = active workspace. ALL implementation edits happen here.
- `Release/{Project}/{platform}/` = final artifacts. Treat as read-only except during the matching release workflow.
- On first work with a dropped project, copy it from `GameIntegration/{Project}` to `WorkProgress/{Project}`, then edit only the WorkProgress copy.
- Never bypass this rule merely to make a checker pass. `FORGE_ALLOW_PROTECTED_WRITE=1` is reserved for intentional release operations.

## Before changing anything

1. Read `FORGE.md` when present; it is the host-neutral Forge runtime contract.
2. Read project memory that exists: `wiki/_current.md`, `wiki/_map.md`, the relevant `wiki/plan/` task, and applicable decisions/pitfalls.
3. Select the matching Forge skill. Codex-native discovery is under `.agents/skills/`; its upstream Forge source is `.claude/skills/`.
4. Read the selected `SKILL.md` fully before implementing. Do not recreate a workflow from memory when Forge already has one.
5. Read root `CLAUDE.md` too. In the Forge engine it contains canonical architecture rules; in a sibling project it contains project-specific instructions.

## Skills and commands

- 141 canonical Forge skills are shipped under `.claude/skills/<name>/SKILL.md`. Codex gets those plus 3 generated smart-router skills from `.claude/commands/`, for 144 discoverable skills under `.agents/skills/`.
- In Codex, invoke a Forge skill explicitly with `$skill-name` or browse skills through `/skills`.
- Do not confuse Forge skills with Codex native slash commands: Forge project status/plan/review are `$status`, `$plan`, `$review`; Codex `/status`, `/plan`, `/review` control the Codex session/mode/review surface.
- Claude slash-command wording inside canonical sources names the same Forge workflow; generated Codex skill mirrors translate known `/skill` references to `$skill`. Unknown slash commands remain untouched because they may be Codex built-ins.
- Generated Codex mirrors are not the place for manual edits; update the Forge source and regenerate/sync from the engine.
- Other terminal agents can execute the same canonical workflow by reading `FORGE.md` plus `.claude/skills/<name>/SKILL.md`; do not invent host-specific command syntax when the host has none.

## Multi-agent work

Forge ships 21 role definitions in `.claude/agents/`; native Codex equivalents are generated in `.codex/agents/`.

- Delegate bounded, independent, read-heavy work (review, security, exploration, QA) to the matching custom subagent when that improves quality.
- Keep parallel write-heavy work separated by files/worktrees; avoid multiple agents editing the same files.
- Generated `.codex/agents/*.toml` translate Claude-only orchestration terms to Codex-native subagent behavior.

## Hooks and safety

Codex lifecycle hooks are configured in `.codex/hooks.json`; Claude Code hooks remain intact in `.claude/hooks/`.

Codex hooks enforce or assist with:
- dangerous shell-command blocking and Forge approval gates;
- protected `GameIntegration/` / `Release/` writes, including native `apply_patch`;
- active-plan drift warnings;
- session activity logging;
- stop-time wiki audit and false completion-claim checks.

Do not disable hooks to bypass a legitimate Forge invariant. Project-local Codex config/hooks load only for a trusted project.

## Definition of Done

- Run the verifier(s) named by the selected skill.
- Refresh `wiki/_current.md` and `wiki/_map.md` after meaningful project work; record decisions/pitfalls where applicable.
- Show factual verification results. Never claim “fixed”, “ready”, or “done” without evidence from repository/tool output.
- Do not invent platform/API facts from memory when a reference, verifier, or current documentation can establish them.
- Numeric thresholds must be identified as requirements or hypotheses; do not present guesses as platform requirements.
- Money values must not use floating-point `number` for authoritative amounts; follow the Forge money invariant in the applicable skill/instructions.
- Persisted-data/UI migrations must account for existing local storage/state.
- A platform addition is cross-cutting; use the platform-completeness workflow instead of updating only the obvious directory.


## Engine maintenance

Canonical human-maintained sources include `CLAUDE.md`, `FORGE.project.md`, `adapters/agents.json`, `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, platform code, scripts, wiki, schemas, and validators.

Generated Codex artifacts:
- `AGENTS.md` and `AGENTS.project.md`;
- `.agents/skills/`;
- `.codex/agents/`.

Native Codex adapter sources under `.codex/` (config and hook adapters) are maintained alongside Forge and must never replace/delete their Claude counterparts.

After canonical instruction/skill/agent changes, run:

`node scripts/generate-agents-md.mjs && node scripts/sync-codex-adapter.mjs`

Before finishing Forge engine changes, run:
- `node scripts/check-drift.mjs`;
- `node scripts/check-codex-compat.mjs`;
- relevant cross-reference/platform/fixture checks;
- `node mcp-server/test.mjs` if MCP changed.

The engine-root `.codex/config.toml` registers the local Forge MCP server from `mcp-server/index.mjs`. The MCP is optional/non-blocking; AGENTS + skills remain the fallback.
