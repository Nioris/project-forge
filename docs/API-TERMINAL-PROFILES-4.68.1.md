# Project Forge 4.68.1 — API Terminal Profiles

## Goal

Keep Forge terminal-first while separating agent workflow from billing/authentication.

The canonical pipeline remains exactly 9 phases. Skills, phase markers, STOP-points, workspace discipline and verifiers do not change when switching authentication profiles.

## Terminal matrix

| Host | Native/subscription profile | API profile | Runtime |
|---|---|---|---|
| Claude Code | current Claude auth / `cf` | Anthropic API | official Claude Code CLI |
| OpenAI Codex | current ChatGPT auth / `cx` | OpenAI API | official Codex CLI |
| GigaChat | — | GigaChat API | Forge-owned terminal agent |
| GigaCode | optional | n/a | dormant experimental bridge until CLI executable exists |

## Central secrets

Default secret directory:

`<workspace>/forge-data/secrets/`

Files:

- `anthropic.key`
- `openai.key`
- `gigachat.key`

Environment variables remain supported and have precedence. Legacy `.openai_key` / `.gigachat_key` lookup remains compatible where applicable.

Use `node scripts/forge-secrets.mjs status` to inspect configuration without printing values.

## Claude API profile

Forge generates a runtime-only settings file under `forge-data/runtime/claude-api/` and launches Claude Code with `--settings`.

The settings file configures `apiKeyHelper` to call `forge-secret-helper.mjs`. The API key is therefore not placed in the process command line. Forge removes `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the launched Claude process environment so Bash/tools do not inherit the raw key from the launcher.

Project/user settings continue to load because Claude's `--settings` overrides only keys explicitly present in the supplied settings object.

## Codex API profile

Forge creates an isolated `CODEX_HOME` under `forge-data/runtime/codex-api/` and forces file-backed auth storage there.

On the first launch, or after the central OpenAI key changes, Forge sends the key to `codex login --with-api-key` via stdin. The API key is never placed in command arguments. The isolated auth profile keeps existing ChatGPT login state separate.

After authentication, Forge removes `OPENAI_API_KEY` from the launched Codex environment and relies on the isolated Codex auth store.

## GigaChat terminal agent

`scripts/gigachat-agent.mjs` is an interactive Forge REPL using the official GigaChat chat-completions API and documented custom function calling.

Default model: `GigaChat-3-Ultra` (override with `FORGE_GIGACHAT_MODEL` or `--model`).

Available tools:

- read file
- list files
- text search
- write file
- exact text replacement
- load canonical Forge skill
- phase-aware Forge status
- git status/diff
- shell command when launched with `--full`

File tools are constrained to the selected project. Full mode adds the shell tool and should be used only for trusted projects, just like Claude/Codex Full.

The system prompt embeds `FORGE.md` and the initial phase-aware status, so the same 9-phase state model and STOP-point semantics apply.

Direct implementation override commands:

- `/do <task>` — durably preserve an exact implementation request, pause automatic phase/release continuation, implement and verify the task;
- `/task` — show the active direct task and paused phase;
- `/resume-phase` — clear the override and make the canonical phase machine available again without advancing it automatically.

Strong natural-language implementation requests are detected too. While a direct task is active, the adapter blocks `forge_gate`, `phase-state`, phase skills, and release commands at the tool boundary so context compaction or malformed function-call recovery cannot redirect the model to Release. The model clears the override through `forge_change_complete` only after recording real implementation operations, existing evidence paths, and verification checks.

## Dashboard

Per-project launcher buttons:

- Claude Full
- Claude API
- Codex Full
- Codex API
- GigaChat API
- GigaCode CLI

The first two subscription buttons retain the previous launch behavior. API buttons route through `scripts/forge-agent.mjs`.

## Offline release gates

`check-api-terminal-profiles.mjs` verifies:

- required scripts and registry profiles;
- GigaChat terminal dry-run without network;
- Claude use of `apiKeyHelper`;
- Codex stdin API-key login;
- removal of raw provider keys from launched tool environments;
- Dashboard API routing.

No release test performs paid API generation.
