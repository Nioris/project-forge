# Project Forge

**Terminal-first multi-agent runtime for building, testing and releasing games and apps.**

Project Forge keeps one project workflow and lets different AI agents work through the same rules, phases, state and verification gates.

**Current release:** `v4.68.1`

| Host | Auth modes | Status |
|---|---|---|
| Claude Code | subscription / Anthropic API | stable |
| OpenAI Codex | ChatGPT / OpenAI API | stable |
| GigaChat | API through Forge terminal agent | supported |
| GigaCode CLI | local CLI | experimental / dormant until executable is available |

> Project Forge is terminal-first. IDE integration is optional and is not required for the core workflow.

## What Forge gives you

- **9 canonical phases** from analysis to live operation.
- **141 canonical skills** with generated Codex adapters.
- **21 canonical subagents** for specialized work.
- One shared project state, STOP-points and phase markers for all hosts.
- Claude Code and Codex launch profiles for both normal account auth and API auth.
- A Forge-owned GigaChat terminal coding agent with controlled project tools.
- AI Studio workflows for prompts, image generation, visual QA and asset provenance.
- Platform integration and release checks for Yandex Games, VK Mini Apps, Telegram Mini Apps, OK, MAX, RuStore, Web, Steam and VK Play.
- Dashboard, project sync, upgrade flow and managed-file drift checks.

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

Forge does not create extra pseudo-phases for SDK work, localization or AI generation. Those capabilities live inside the appropriate canonical phase.

## Quick start

### Requirements

- Node.js 18+
- Git
- At least one supported terminal host: Claude Code or OpenAI Codex
- Optional API credentials for Anthropic, OpenAI or GigaChat

### Clone

```bash
git clone https://github.com/Nioris/project-forge.git
cd project-forge
```

### Setup

Windows:

```powershell
.\setup.bat
```

Linux/macOS:

```bash
./setup.sh
```

Then launch the terminal host you want to use.

## Main workflows

Claude Code syntax:

```text
/game
/app
/do <task>
/continue
/status
```

Codex syntax:

```text
$game
$app
$do <task>
$continue
$status
```

Typical examples:

```text
/do redesign the game UI
/do add a boss wave every 5 levels
/game new mobile tower-defense game
/app habit tracker
/status
```

The host reads project state and routes work through the appropriate Forge skill instead of requiring you to remember the whole skill catalog.

## Terminal agent launcher

Forge `v4.68.1` adds separate account/API profiles:

```bash
# Claude — existing account/subscription
node scripts/forge-agent.mjs launch claude --full --project ../my-game

# Claude — Anthropic API
node scripts/forge-agent.mjs launch claude --profile api --full --project ../my-game

# Codex — existing ChatGPT auth
node scripts/forge-agent.mjs launch codex --full --project ../my-game

# Codex — isolated OpenAI API profile
node scripts/forge-agent.mjs launch codex --profile api --full --project ../my-game

# GigaChat — Forge terminal agent through official API
node scripts/forge-agent.mjs launch gigachat --profile api --full --project ../my-game

# Inspect installed hosts
node scripts/forge-agent.mjs doctor
```

GigaCode remains an experimental adapter. Forge does not pretend that a CLI exists locally when no executable is installed.

## API keys and secrets

**No API keys are included in this repository.**

Recommended workspace layout:

```text
<workspace>/
  project-forge/
  forge-data/
    secrets/
      anthropic.key
      openai.key
      gigachat.key
  my-game/
```

Check configured providers without printing secret values:

```bash
node scripts/forge-secrets.mjs status
```

The repository `.gitignore` excludes `forge-data/`, `secrets/`, `*.key`, `.env`, provider key files, backups and other local state.

If a real credential is ever committed, revoke/rotate it first and then remove it from Git history. See [SECURITY.md](SECURITY.md).

## Universal Agent Runtime

The agent-neutral contract lives in [FORGE.md](FORGE.md).

Canonical sources:

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

Claude and Codex keep their native integrations, while generic terminal agents can use `FORGE.md` plus the canonical skill files without duplicating the entire Forge catalog for every provider.

## AI Studio

AI Studio is part of the normal 9-phase lifecycle, not a separate phase.

Core workflows:

```text
/studio
/prompt-compiler
/image-studio
/visual-qa
```

Codex uses the equivalent `$...` syntax.

Direct provider helpers are available for unattended/batch work, including OpenAI image generation and GigaChat image/3D backends. Secrets stay outside project repositories.

More details: [docs/AI-STUDIO-4.67.0.md](docs/AI-STUDIO-4.67.0.md).

## Platforms

Forge includes platform-specific integration and release tooling for:

`Yandex Games` · `VK Mini Apps` · `Telegram Mini Apps` · `OK` · `MAX` · `RuStore` · `Web` · `Steam` · `VK Play`

Platform release gates are intended to catch critical integration problems before submission.

## Repository map

```text
.claude/          canonical Claude skills, agents and hooks
.codex/           Codex adapter
.agents/          generated Codex skill discovery
adapters/         host registry
scripts/          Forge runtime, sync, checks and provider helpers
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
- [RELEASE_NOTES_v4.68.1.md](RELEASE_NOTES_v4.68.1.md) — current release notes
- [SECURITY.md](SECURITY.md) — credentials and security rules

## Updating an existing Forge workspace

For a managed Windows workspace, use the external updater described in the guide/release notes. The safe updater path is designed to preserve sibling projects and local `forge-data` state while validating managed-file drift after the upgrade.

For source installations, use normal Git workflows and run the relevant Forge sync/check scripts after changing canonical skills, agents or adapters.

## Contributing

Contributions are welcome. Keep provider credentials and local project state out of commits, and keep canonical/generated Forge layers in sync.

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

Project Forge is an independent project. Claude, Codex, GigaChat, GigaCode and the listed distribution platforms are products/services of their respective owners.