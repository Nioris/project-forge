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

### Executable phase completion contracts

Every canonical phase loads `.claude/skills/status/references/phase-contracts/phase-N.json` before
it can become `complete`. The contract names the exact evidence files, minimum content and project
checks required for that phase. A directory, a success claim in prose, an unrelated existing file,
or a counterfeit `PASS` line is not completion evidence.

Only `phase-state.mjs` may persist a durable phase transition after the contract passes. The legacy
`scripts/check-pipeline-state.mjs` command is a compatibility view over this same nine-phase state;
it must not maintain `steps`, `current_step` or any other competing progression model.

### Durable execution graph

The nine phase markers remain Forge's only global progression state. A `Task` is a bounded unit of
work inside that pipeline; its optional `phase` field is a reference, never a replacement phase.
Forge stores active graph runs under `.forge/runs/<taskId>.json` using atomic writes and excludes
them from Git. These files are runtime-owned: agents may inspect them through `project-status.mjs`
or `forge-workflow.mjs`, but must never edit them directly.

Five validated graphs ship with Forge: `phase`, `change`, `review`, `diagnose`, and `release`.
Each transition consumes a typed `RunResult` and a fixed `FailureType`. User decisions route to
`wait-user`; verifier/code failures route to a bounded agent repair loop; infrastructure blockers
stop explicitly. Codex correlates phase results to the exact model turn through `attemptId`.
Natural-language question detection exists only as a named legacy fallback.

When a change graph enters a `verifier` node, the runtime owns deterministic check execution. It loads
only Task-enabled, read-only project checks from the installed engine's `mcp-server/verifiers.json`,
normalizes bounded issues into `RunResult.verification`, and routes PASS/FAIL/environment outcomes without
asking the model to interpret raw stdout. A project-local registry is untrusted. Never edit a verifier
plan after the Task has left an agent node, and never treat a stale `.verify.lock` as permission to start a
second verifier; inspect the owning process before removing an abandoned lock.

Task read/write scopes are executable host authority for guarded native file operations. The Codex
pipeline binds the exact phase Task before native `Edit`, `Write` or `apply_patch`, and GigaChat checks
its text/copy/media/portable writes plus classified Forge-script outputs against the same durable scope.
Unknown targets, stale contract provenance, terminal Tasks, lexical escapes and junction/symlink
escapes fail closed. This is not an operating-system sandbox: arbitrary Codex shell code and external
whole-project CLIs still require a disposable task worktree and host-accepted diff boundary.

### Executable skill and agent contracts

A canonical skill with `contract_version: 1` declares its allowed phases/modes, read/write scope,
named STOP-points, risk class, completion contract and Task-runnable verifier IDs. Forge persists the
contract id/hash in a Task, rejects phase/mode/scope mismatches and never lets model prose expand its
verifier plan. A legacy skill remains explicitly invokable and readable, but is manual-only: it cannot
be auto-selected or grant runtime authority until migrated.

Contracted subagent roles are registered in `adapters/agent-contracts.json` and return typed
Builder/Reviewer/Researcher results. Those reports are structured explanations, not completion proof.
Only host-recorded writes, existing evidence, trusted registry operations and RunResult transitions may
complete a Task. A verifier plan can be derived from a successful structured `forge_script` ledger
operation; a copied command string or a model-requested check is never executable authority.

### Public MCP verifier surface

The MCP server exposes only checks explicitly marked public in `mcp-server/verifiers.json`. Every
entry is read-only, has a bounded timeout and declares its scope and applicable phases. Internal,
regression and mutating scripts are never inferred from filenames and cannot be called as MCP tools.

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
