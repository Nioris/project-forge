# Project Forge v4.68.19 — Codex project runtime instructions

<!-- GENERATED from Forge canonical sources; claude-hash:aff656112e933d7c; target:project; do not edit by hand. -->

This project is managed by Project Forge. The copied `.claude/*`, Codex adapter files, `FORGE.md`, and GitVerse rules come from one Forge engine and are intended to stay behaviorally aligned across supported hosts. Root `CLAUDE.md` belongs to this project and may contain additional project-specific rules.

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

- 142 canonical Forge skills are shipped under `.claude/skills/<name>/SKILL.md`. Codex gets those plus 3 generated smart-router skills from `.claude/commands/`, for 145 discoverable skills under `.agents/skills/`.
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

## Codex quality and token discipline

- All Forge Codex phases and generated custom agents use GPT-5.6 Sol on Standard tier. Never select Fast automatically.
- Prefer one-window orchestration with `node ../project-forge/scripts/codex-pipeline.mjs --cwd .`. It resumes STOP answers inside a phase and starts a fresh internal session after phase completion; do not carry a multi-phase transcript forward.
- Use high reasoning for analysis/design/implementation/visual/technical/QA work and medium for deterministic listing, routine release packaging, and ordinary metrics. Max/Ultra and xhigh are never automatic defaults.
- Keep model-facing tool output bounded: read relevant ranges, summarize large logs, and inspect no more than one high-detail image per turn. Do not feed megabytes of screenshots or terminal output back into the model.
- Continue autonomously until a real Forge STOP-point, verified completion, or genuine blocker. Do not end a task merely to announce the next implementation step.

## Hooks and safety

Codex lifecycle hooks are configured in `.codex/hooks.json`; Claude Code hooks remain intact in `.claude/hooks/`.

Codex hooks enforce or assist with:
- dangerous shell-command blocking and Forge approval gates;
- protected `GameIntegration/` / `Release/` writes, including native `apply_patch`;
- active-plan drift warnings;
- session activity logging;
- stop-time wiki audit and false completion-claim checks.

Do not disable hooks to bypass a legitimate Forge invariant. Project-local Codex config/hooks load only for a trusted project.

## Forge behavioral diagnostics

When Forge itself behaves incorrectly—malformed phase/STOP output, wrong adapter format, hook/runtime failure, capability mismatch, validator contradiction, or unexpected orchestration—record it immediately with the `forge-diagnostics` skill or:

`node .claude/skills/status/references/forge-event.mjs report --severity error --code STABLE_ERROR_CODE --kind phase_protocol --component phase-1-analyze --operation ask-user --message "Short factual description" --expected "Expected Forge behavior" --actual "Observed Forge behavior" --phase 1 --host codex --evidence wiki/phases/phase-1.json`

Do not log ordinary game/app bugs unless Forge caused or misreported them. Continue safe work after recording when possible. Never include secrets, prompts, full terminal output, or full file contents; evidence paths must be project-relative. Resolve a fingerprint only after verification with `forge-event.mjs resolve --fingerprint <id> --message "Verified correction"`.

## Definition of Done

- Run the verifier(s) named by the selected skill.
- Refresh `wiki/_current.md` and `wiki/_map.md` after meaningful project work; record decisions/pitfalls where applicable.
- Show factual verification results. Never claim “fixed”, “ready”, or “done” without evidence from repository/tool output.
- Do not invent platform/API facts from memory when a reference, verifier, or current documentation can establish them.
- Numeric thresholds must be identified as requirements or hypotheses; do not present guesses as platform requirements.
- Money values must not use floating-point `number` for authoritative amounts; follow the Forge money invariant in the applicable skill/instructions.
- Persisted-data/UI migrations must account for existing local storage/state.
- A platform addition is cross-cutting; use the platform-completeness workflow instead of updating only the obvious directory.
- Completing a phase invokes the local-first Git checkpoint helper. Preserve that checkpoint even if a private GitHub push temporarily fails.


## Synced-project update contract

- Do not treat this project as a separate Forge distribution.
- Update Forge in the engine repository, then run root `sync.bat` / `node scripts/sync.mjs` to propagate the unified Forge runtime here.
- `.forge-managed.json` records only files owned by Forge sync. Removed Forge files can be pruned safely without deleting user-created project files.
- Local edits to generated `.agents/skills/`, `.codex/agents/`, or this `AGENTS.md` can be overwritten by the next Forge sync.
- This project intentionally uses the portable `.codex/config.toml` without an engine-relative MCP path. Skills, hooks, agents, AGENTS instructions, and the agent-neutral `FORGE.md` contract must work without Forge MCP.
