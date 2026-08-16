# Project Forge v4.68.1 — API Terminal Profiles

## What changed

- Canonical phase model stays at exactly **9 phases**.
- **Claude Code** keeps the existing subscription profile and adds an **Anthropic API** launch profile.
- **Codex** keeps the existing ChatGPT profile and adds an **isolated OpenAI API** profile so API login does not replace the normal ChatGPT auth store.
- Added a Forge-owned **GigaChat terminal coding agent** using GigaChat custom function calling.
- **GigaCode CLI** remains optional/dormant until an official executable is available locally.
- Dashboard project cards expose: `Claude Full`, `Claude API`, `Codex Full`, `Codex API`, `GigaChat API`, `GigaCode CLI`.

## Central secrets

Recommended location outside all projects:

```text
<workspace>/forge-data/secrets/
  anthropic.key
  openai.key
  gigachat.key
```

Check configuration without printing secret values:

```text
node scripts/forge-secrets.mjs status
```

Environment variables remain supported. Legacy `.openai_key` / `.gigachat_key` remain compatibility fallbacks where applicable.

## Auth isolation

- Claude API profile uses a generated runtime settings file with `apiKeyHelper` and does not pass the API key on the command line.
- Codex API profile uses `<workspace>/forge-data/runtime/codex-api` as a separate `CODEX_HOME`; `codex login --with-api-key` receives the key via stdin.
- Existing Claude subscription and Codex ChatGPT profiles are not rewritten by the API profiles.

## GigaChat terminal agent

Default model: `GigaChat-3-Ultra`.

Available project tools include read/list/search, controlled file edits, Forge skill loading, phase-aware status, git diff, and (in Full mode) shell execution. Direct file-edit tools enforce Forge protected `GameIntegration/` and `Release/` paths.

No paid/live API request is made by release verification; GigaChat checks use `--dry-run`.

## Release verification

Passed before packaging:

- API terminal profile regression
- Universal Agent Runtime audit
- AI Studio audit
- canonical 9-phase status audit
- Dashboard metadata + structural fingerprint
- buffered sibling sync regression
- Codex compatibility audit
- managed sync specification audit
- updater surface audit
- MCP 24/24
- drift audit
- manifest check

## Windows updater

The external Kaspersky-safe updater remains Node + Windows `tar.exe` only. It does not use PowerShell, `ExecutionPolicy Bypass`, downloads, antivirus exclusions, or network package fetching. The v4.68.0 R3 user-data conflict backup logic is retained.
