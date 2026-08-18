# Project Forge

**Terminal-first multi-agent runtime for building, testing and releasing games and apps.**

[Русская версия](README_RU.md)

Project Forge gives several terminal AI agents one shared workflow: the same phases, project state, skills, STOP-points and verification gates.

**Current public version:** `v4.68.11`

| Host | Auth modes | Status |
|---|---|---|
| Claude Code | account/subscription · Anthropic API | stable |
| OpenAI Codex | ChatGPT · OpenAI API | stable |
| GigaChat | API through Forge terminal agent | supported |
| GigaCode CLI | local CLI adapter | experimental / dormant until an executable is available |

> Forge is terminal-first. An IDE is optional; the core workflow does not depend on one.

## Why Project Forge

Forge is not another chat UI. It is a project runtime around terminal agents.

It provides:

- **9 canonical phases** from analysis to live operation;
- **142 canonical skills** plus generated Codex discovery adapters;
- **21 specialized subagents**;
- shared phase markers, STOP-points and project state across supported hosts;
- native Claude Code and Codex launch profiles;
- optional API profiles for Anthropic and OpenAI;
- a Forge-owned GigaChat terminal agent;
- AI Studio workflows for prompt compilation, images, 3D, art direction and visual QA;
- platform integrations and release checks;
- dashboard, fleet sync, upgrade and managed-file drift validation.

## Release targets

| Canonical ID | Platform |
|---|---|
| `yandex` | Yandex Games |
| `vk` | VK Mini Apps |
| `telegram` | Telegram Mini App |
| `ok` | OK.ru |
| `max` | MAX messenger |
| `rustore` | RuStore |
| `web` | self-hosted HTTPS/PWA |
| `steam` | Steam |
| `vkplay` | VK Play |

## The 9 phases

```text
1  Analyze
2  Design
3  Construct
4  Visual
5  Tech
6  Listing
7  Test
8  Release
9  Live
```

SDK integration, localization, AI generation and other capabilities live inside these phases instead of creating extra pseudo-phases.

## Quick start

Requirements:

- Node.js 18+
- Git
- at least one supported terminal host

Clone:

```bash
git clone https://github.com/Nioris/project-forge.git
cd project-forge
```

Windows:

```powershell
.\setup.bat
```

Linux/macOS:

```bash
./setup.sh
```

Then launch the terminal host you want to use.

## Recommended: start with the Dashboard

For a new game or app, the recommended entry point is [`dashboard.html`](dashboard.html). Open it locally after setup: the Dashboard is the control center for creating or opening projects and for seeing what to do next.

1. Open `dashboard.html` in your browser.
2. Choose **EN** or **RU** in the Dashboard.
3. Create a new game/app or select an existing project.
4. Follow the current Forge phase and the recommended next action.
5. Launch Claude Code, Codex or GigaChat with the profile you want and continue through the same 9-phase workflow.

The terminal remains the execution environment; the Dashboard is the recommended starting point and navigation layer for project status, agent profiles, phase progress and next steps.

## Main commands

Claude Code:

```text
/game
/app
/do <task>
/continue
/status
```

Codex:

```text
$game
$app
$do <task>
$continue
$status
```

For an economy-aware fresh Codex phase, run the policy launcher from the managed project directory:

```powershell
node ../project-forge/scripts/codex-phase.mjs 1 --cwd .
node ../project-forge/scripts/codex-phase.mjs 5 --route payment-security --cwd .
```

It opens a fresh Codex task on the Standard service tier with phase-specific model and reasoning settings: Terra handles normal implementation, Sol covers design and difficult escalations, and Luna is limited to mechanical work. Calling `$phase-*` inside an existing task cannot switch that task's primary model. See `.claude/skills/status/references/MODEL-ROUTING.md` for the complete table and `--route` options.

Examples:

```text
/do redesign the game UI
/do add a boss wave every 5 levels
/game new mobile tower-defense game
/app habit tracker
/status
```

## Terminal launcher

`v4.68.11` keeps separate normal-account and API profiles.

```bash
# Claude — existing account/subscription
node scripts/forge-agent.mjs launch claude --full --project ../my-game

# Claude — Anthropic API
node scripts/forge-agent.mjs launch claude --profile api --full --project ../my-game

# Codex — existing ChatGPT authentication
node scripts/forge-agent.mjs launch codex --full --project ../my-game

# Codex — isolated OpenAI API profile
node scripts/forge-agent.mjs launch codex --profile api --full --project ../my-game

# GigaChat — Forge terminal agent through API
node scripts/forge-agent.mjs launch gigachat --profile api --full --project ../my-game

# Inspect GigaChat web/image search without exposing credentials
node scripts/forge-search-doctor.mjs --project ../my-game

# Inspect installed hosts
node scripts/forge-agent.mjs doctor
```

GigaCode remains an experimental adapter. Forge does not fake CLI availability when no executable is installed.

Every GigaChat STOP-point includes a deterministic `How to answer` block: an exact short approval phrase (`утверждаю`) and, when needed, the complete correction format expected by the gate.

Forge allows at most two phase subagents by default and never enables Max/Ultra automatically. These economy limits do not change the Claude or GigaChat workflows.

## Forge behavioral diagnostics

When Forge itself violates a phase/STOP contract, returns the wrong adapter format, suffers a hook/runtime failure, or reports contradictory state/capabilities, the AI records a local structured incident. Ordinary bugs in the game or app are excluded.

Each project stores `wiki/diagnostics/forge-events.jsonl`. Common credentials and the absolute project root are redacted, evidence paths must remain project-relative, and the local log is excluded from Git. Current incidents also appear in `$status`/`/status`.

Audit every managed sibling project from the engine:

```powershell
node scripts/audit-forge-diagnostics.mjs --since 30d
node scripts/audit-forge-diagnostics.mjs --since all --json
```

Repeated observations are grouped by stable error class, component, and operation. A verified fix closes the same fingerprint without deleting its history.

## API keys and secrets

**No real API keys, tokens or local credentials belong in this repository.**

Recommended workspace layout:

```text
<workspace>/
  project-forge/
  forge-data/
    secrets/
      anthropic.key
      openai.key
      gigachat.key
      gigasearch.key       # optional; only for a configured production GigaSearch endpoint
  my-game/
```

Check configured providers without printing secret values:

```bash
node scripts/forge-secrets.mjs status
```

On GigaChat launch, Forge enables Node's system CA store before the child process starts. If no explicit `FORGE_SEARCH_PROVIDER` or `GIGASEARCH_*` endpoint is configured, the launcher selects the no-key `bing-html` live-search fallback. Explicit production search configuration always wins; use `/search-doctor` in the GigaChat terminal to inspect the active provider.

The repository `.gitignore` excludes `forge-data/`, `secrets/`, `*.key`, `.env`, provider key files, backups and other local state.

If a credential is ever committed, revoke or rotate it first and then remove it from Git history. See [SECURITY.md](SECURITY.md).

## Universal Agent Runtime

The provider-neutral contract lives in [FORGE.md](FORGE.md).

Important paths:

```text
FORGE.md                shared runtime contract
.claude/skills/         canonical Forge skills
.claude/agents/         canonical subagents
.agents/skills/         generated Codex discovery mirror
.codex/                 Codex adapter/config/hooks
AGENTS.md               Codex-facing project instructions
adapters/agents.json    terminal host registry
scripts/forge-agent.mjs launcher / doctor / skill bridge
```

Claude and Codex keep their native integrations. Generic terminal agents can use `FORGE.md` plus canonical skill files without duplicating the full catalog for every provider.

## AI Studio

AI Studio is part of the same 9-phase lifecycle.

Core workflows:

```text
/studio
/prompt-compiler
/image-studio
/visual-qa
```

Codex uses the equivalent `$...` syntax.

Direct provider helpers support unattended/batch work, including OpenAI image generation and GigaChat image/3D backends. Secrets stay outside project repositories.

See [docs/AI-STUDIO-4.67.0.md](docs/AI-STUDIO-4.67.0.md).

## Supported release targets

Forge contains integration and validation tooling for:

`Yandex Games` · `VK Mini Apps` · `Telegram Mini Apps` · `OK` · `MAX` · `RuStore` · `Web` · `Steam` · `VK Play`

## Repository map

```text
.claude/          canonical Claude skills, agents and hooks
.codex/           Codex adapter
.agents/          generated Codex skill discovery
adapters/         terminal host registry
scripts/          runtime, sync, checks and provider helpers
platforms/        platform integrations and validators
templates/        project templates
schemas/          Forge configuration schemas
mcp-server/       local Forge MCP server
docs/             technical documentation
wiki/             Forge knowledge/state templates
extras/           auxiliary updater/tools
dashboard.html    local Forge dashboard
```

## Documentation

- [GUIDE.md](GUIDE.md) — full guide
- [СПРАВОЧНИК-КОМАНД.md](СПРАВОЧНИК-КОМАНД.md) — command reference
- [FORGE.md](FORGE.md) — universal runtime contract
- [RELEASE_NOTES_v4.68.2.md](RELEASE_NOTES_v4.68.2.md) — current release notes
- [SECURITY.md](SECURITY.md) — credentials and security rules
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guide
- [ROADMAP.md](ROADMAP.md) — public development direction
- [SUPPORT.md](SUPPORT.md) — voluntary personal support for the original author

## Security and privacy

Public source must never contain workspace secrets, personal projects or local `forge-data` state. Example credentials in documentation must be obvious placeholders only.

## License

Project Forge is licensed under the [Apache License 2.0](LICENSE).

Attribution information is provided in [NOTICE](NOTICE) and should be preserved with distributions as required by the license.

---

Project Forge is developed by [Rodrik Studio](https://rodrik.dev) / Rodrik LTD.

Original author: **Aleksandr Krasnokutskiy**.

Project Forge is an independent project. Claude, Codex, GigaChat, GigaCode and the listed distribution platforms are products/services of their respective owners.
