# Project Forge — universal agent runtime

This file is the agent-neutral contract for a Project Forge managed project. It is intended to be readable by Claude Code, OpenAI Codex, GigaCode, and other terminal/MCP agents.

## Canonical pipeline

Forge has exactly nine canonical phases:

1. Analyze
2. Design
3. Construct
4. Visual
5. Tech
6. Listing
7. Test
8. Release
9. Live

AI Studio, image generation, multi-agent work, MCP and provider integrations operate *inside* those phases. They are not extra phases.

## Authoritative project state

Use these sources in this order:

1. `wiki/phases/phase-*.json` — machine phase markers when present.
2. concrete project artifacts and verifier output.
3. `wiki/_current.md` and `wiki/_map.md` — supplemental human-readable context.
4. `CLAUDE.md` — project rules/description only; mutable progress written there may be stale.

Never advance a phase solely because later-phase evidence already exists. Report it as evidence ahead of gate.

## Workspace discipline

- `GameIntegration/` is source material and read-only.
- `WorkProgress/{Project}/` is the active implementation workspace.
- `Release/{Project}/{platform}/` contains release artifacts and is changed only by the matching release workflow.
- Do not bypass protected-write rules just to satisfy a checker.

## How to execute a Forge skill on a generic agent

Forge's canonical workflow source is `.claude/skills/<skill>/SKILL.md`. Host-specific adapters may mirror or translate it, but the workflow semantics remain canonical.

When the user asks for a Forge skill and the current host has no native skill mechanism:

1. identify the requested skill name;
2. read `.claude/skills/<skill>/SKILL.md` fully;
3. treat the user's trailing text as the invocation arguments;
4. translate host-specific orchestration instructions to capabilities actually available in the current agent;
5. preserve phase gates, STOP-points, workspace rules and required verifiers;
6. never simulate a tool or agent capability that the host does not provide.

Examples:

- Claude Code: `/phase-2-design .`
- Codex: `$phase-2-design .`
- Generic/GigaCode: `Read FORGE.md and execute Forge skill phase-2-design with arguments ".".`

## Terminal host profiles

Forge keeps agent semantics separate from billing/authentication:

- Claude Code: subscription profile or Anthropic API profile.
- OpenAI Codex: ChatGPT profile or isolated OpenAI API profile.
- GigaChat: Forge terminal agent over the official GigaChat API.
- GigaCode CLI: optional dormant bridge until an executable is actually available.

OpenCode whole-project hosts return after each model turn. After a Forge STOP, continue the exact
last session with `forge-agent resume --project <path> --answer "<answer>"`; Forge stores the answer
in `.forge/agent-resume.md` and passes only a fixed instruction to the provider process.

API secrets live outside projects under `forge-data/secrets/`; never copy them into project files, wiki, prompts or shell output. Switching profiles must not change the nine-phase state machine or skill semantics.

## Multi-agent rule

Parallelize only independent work. Read-only reviewers can run freely. Writers must own different files/directories or separate worktrees. One file has one writer at a time. The orchestrator merges evidence and runs the final verifier.

If the host does not expose subagents, execute the same workstreams sequentially instead of pretending parallel agents exist.

## AI Studio providers

Project AI settings live in `.forge-ai.json`; secrets never do.

Supported Forge provider surfaces can include:

- native host image generation when available;
- direct OpenAI API batch generation;
- direct GigaChat API generation for supported image/3D workflows;
- additional providers only when explicitly configured.

Never silently fall back to a paid provider. Preserve prompt packs and provenance.

## Forge behavioral diagnostics

If Forge itself behaves incorrectly, record the incident immediately. Examples include malformed phase or STOP output, an adapter returning the wrong format, a hook/runtime failure, a capability contradiction, validator drift, or unexpected orchestration behavior. Do not use this journal for ordinary bugs in the game or app unless Forge caused or misreported them.

From the managed project root, run:

`node .claude/skills/status/references/forge-event.mjs report --severity error --code STABLE_ERROR_CODE --kind phase_protocol --component phase-1-analyze --operation ask-user --message "Short factual description" --expected "Expected Forge behavior" --actual "Observed Forge behavior" --phase 1 --host codex --evidence wiki/phases/phase-1.json`

Continue safe work after recording when possible. Never include secrets, bearer tokens, prompts, full terminal output, or full file contents. Use only project-relative evidence paths. After a verified correction, close the fingerprint with `forge-event.mjs resolve --fingerprint <id> --message "How the correction was verified"`.

The durable machine log is `wiki/diagnostics/forge-events.jsonl`. Use the `forge-diagnostics` skill for the complete protocol.

## Definition of done

A task is not complete until the selected skill's required evidence/verifiers pass. Update project memory after meaningful work. Never claim fixed/ready/done without repository or runtime evidence.
