# Project Forge

**Terminal-first multi-agent runtime for building, testing and releasing games and apps.**

[Русская версия](README_RU.md)

Project Forge gives several terminal AI agents one shared workflow: the same phases, project state, skills, STOP-points and verification gates.

**Current public version:** `v4.68.47`

| Host | Auth modes | Status |
|---|---|---|
| Claude Code | account/subscription · Anthropic API | stable |
| OpenAI Codex | ChatGPT · OpenAI API | stable |
| GigaChat | API through Forge terminal agent | supported |
| GigaCode CLI | local CLI adapter | experimental / dormant until an executable is available |
| Gemini CLI · Qwen Code · Kimi Code | native account or provider plan/API | experimental whole-project lock |
| DeepSeek · GLM · MiniMax M3 | provider API through OpenCode | experimental whole-project lock |
| OpenRouter through OpenCode | one OpenRouter API key · ZDR by default | experimental whole-project lock |

> Forge is terminal-first. An IDE is optional; the core workflow does not depend on one.

## Why Project Forge

Forge is not another chat UI. It is a project runtime around terminal agents.

It provides:

- **9 canonical phases** from analysis to live operation;
- **142 canonical skills** plus generated Codex discovery adapters;
- **21 specialized subagents**;
- shared phase markers, STOP-points and project state across supported hosts;
- a restart-safe Task/RunResult execution graph with structured repair and decision routing;
- native Claude Code and Codex launch profiles;
- optional API profiles for Anthropic and OpenAI;
- a Forge-owned GigaChat terminal agent;
- one-model whole-project profiles for Gemini, Qwen, Kimi K3, DeepSeek, GLM, MiniMax M3 and OpenRouter;
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

## Durable execution graph

Forge keeps the nine phases as the only global project progression. Inside a phase or direct change,
work is represented by a typed `Task` and every meaningful attempt returns a structured `RunResult`.
Five restart-safe graphs cover `phase`, `change`, `review`, `diagnose`, and `release` work. User
decisions wait for an answer, repairable failures return to the agent for at most three attempts,
and infrastructure failures stop explicitly instead of being mistaken for a chat question.

Local graph state lives in `.forge/runs/`, is excluded from Git, and is shown by `/status` only as
supplemental execution state. It can never advance a phase without the canonical phase completion
contract. For manual inspection use `node scripts/forge-workflow.mjs status --project .`.

For direct `change` Tasks, the workflow can run an engine-declared verifier plan automatically. Registered
read-only checks turn PASS into `done`, deterministic failures into a bounded `repair → verify` loop, and
timeouts or missing dependencies into an explicit infrastructure stop. Only the installed Forge registry is
trusted; a project cannot make an arbitrary local script executable by writing its own registry.

## Machine-readable capability contracts

Skills with `contract_version: 1` expose executable phase/mode eligibility, declared read/write scope,
named STOP-points, risk and a trusted verifier allowlist. Forge records the contract hash in Task state;
model prose cannot expand it. The nine phases, `status` and `gacha-meta` form the first migrated set.
Other skills remain fully available for explicit use but are manual-only until they receive a contract.

Core subagent roles use typed Builder/Reviewer/Researcher contracts. Their structured reports help the
orchestrator merge work, but only host-recorded operations, evidence and verifier results can complete a Task.

The Codex phase pipeline now binds that Task before the model receives native file tools. Its hook rejects
`Edit`, `Write` and `apply_patch` targets outside the declared write scope; GigaChat applies the same guard
to its native writes and classified Forge scripts, and blocks raw shell execution while a Task is active.
Path validation also rejects junction/symlink escapes. This is a native tool boundary, not an OS sandbox:
arbitrary Codex shell code and external whole-project CLIs still need an isolated worktree and accepted diff.

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

For the recommended one-window workflow, run this once from the managed project directory:

```powershell
node ../project-forge/scripts/codex-pipeline.mjs --cwd .
```

The terminal remains open for the entire project. Within a phase, Forge resumes the same Codex session after your STOP answer. After a durable `complete`, it asks whether to start the next phase, discards the old session context, and launches a clean one in the same window. Every phase uses GPT-5.6 Sol on Standard; reasoning is high for creative/technical work and medium for deterministic listing, packaging, and routine metrics.

After every completed phase, the parent orchestrator prints and stores a privacy-bounded cost/context report under `wiki/diagnostics/codex-cost/phase-N-latest.json`. When the local Codex rollout is available, it measures model responses, input/cache/output tokens, compactions, subagents, tool-output volume, actual model policy, and unexpected stops. Reports never store prompts, messages, file contents, rate-limit state, or secrets. Open one or more reports in the Dashboard's **Codex Cost / Context** panel to compare phases.

Before the first phase, the launcher checks enabled loopback HTTP MCP endpoints inherited from the user Codex config. An unavailable local endpoint is disabled only for that pipeline run, preventing optional tools such as a stopped Unity MCP from breaking unrelated web-game work; the global config is not modified. Use `--keep-local-mcp` only when an endpoint is expected to become available after launch. Child Codex stdin remains attached to the terminal, so a supplied phase prompt is not misdetected as piped input.

For manual single-phase control, `codex-phase.mjs <1..9>` remains available. See `.claude/skills/status/references/MODEL-ROUTING.md` for the complete table and `--route` options.

Examples:

```text
/do redesign the game UI
/do add a boss wave every 5 levels
/game new mobile tower-defense game
/app habit tracker
/status
```

## Terminal launcher

`v4.68.47` keeps separate normal-account and API profiles.

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

# Lock one model to the whole project (choose one)
node scripts/forge-agent.mjs start gemini --project ../my-game
node scripts/forge-agent.mjs start qwen --project ../my-game
node scripts/forge-agent.mjs start kimi --project ../my-game
node scripts/forge-agent.mjs start deepseek --project ../my-game
node scripts/forge-agent.mjs start glm --project ../my-game
node scripts/forge-agent.mjs start minimax --project ../my-game
node scripts/forge-agent.mjs start openrouter --project ../my-game

# Continue the same OpenCode session after a Forge STOP
node scripts/forge-agent.mjs resume --project ../my-game --answer "approve"

# One OpenRouter key, one exact model for the whole project
node scripts/forge-agent.mjs presets openrouter
node scripts/forge-agent.mjs select openrouter --preset qwen --profile zdr --project ../my-game
# Free anonymous preview; provider retains prompts/completions — non-confidential tests only
node scripts/forge-agent.mjs select openrouter --preset ox-alpha --profile standard --project ../my-game
node scripts/forge-agent.mjs start openrouter --project ../my-game

# Show the project lock or change it explicitly
node scripts/forge-agent.mjs profile --project ../my-game
node scripts/forge-agent.mjs select qwen --profile coding-plan --model qwen3-coder-plus --project ../my-game

# One-time native CLI authentication
gemini
qwen  # /auth -> Alibaba ModelStudio -> Coding Plan or Standard API Key
kimi login

# Inspect GigaChat web/image search without exposing credentials
node scripts/forge-search-doctor.mjs --project ../my-game

# Inspect installed hosts
node scripts/forge-agent.mjs doctor
```

The selected whole-project agent and model are stored in `.forge/agent.json`. The same model handles every phase; Forge does not route phases to other providers. Gemini and Qwen start directly in interactive mode. Kimi performs one bootstrap prompt and then reopens that exact session interactively. DeepSeek, GLM, MiniMax and OpenRouter run through OpenCode while the chosen provider remains the only model. Their API keys use the central `forge-data/secrets/` store and an isolated OpenCode credential profile.

OpenRouter uses one `forge-data/secrets/openrouter.key` for named Qwen, DeepSeek, GLM, Kimi, MiniMax, Gemini, Grok and Ox Alpha presets. The Qwen preset is the tool-verified `qwen3-coder-next`; `qwen3-coder-plus` currently has no ZDR endpoint. The default `zdr` profile requires a zero-data-retention endpoint and denies provider data collection. Ox Alpha is a free anonymous preview whose provider retains prompts/completions, so Forge refuses ZDR selection and requires explicit `--profile standard`; use it only for non-confidential evaluation. Store the key without putting it on a command line: `node scripts/forge-secrets.mjs set openrouter --stdin`. OpenCode returns after each Forge STOP; `forge-agent resume --answer ...` continues its exact last session without putting the answer in provider command arguments. Each OpenCode turn is capped at 64 agentic steps; repeated identical `list` calls are suppressed after the first successful result so a weak model cannot burn an unlimited tool loop.

GigaCode remains an experimental adapter. Forge does not fake CLI availability when no executable is installed.

Every GigaChat STOP-point includes a deterministic `How to answer` block: an exact short approval phrase (`утверждаю`) and, when needed, the complete correction format expected by the gate.

Forge allows at most two phase subagents, starts phases as fresh tasks, bounds large tool/image context, and never enables Max/Ultra automatically. These limits do not change the Claude or GigaChat workflows.

## Local Git and private GitHub

Every new project gets its own local Git repository. Completing a Forge phase automatically creates a checkpoint commit. To enable private GitHub creation and push for all future games/apps in one workspace:

```powershell
node scripts/project-git.mjs configure --owner Nioris
```

The policy is stored outside the engine in `forge-data/git-policy.json`, so upgrades preserve it. Forge refuses automatic publication to a public repository, checks secret filenames/content before commits, and treats a remote/network failure as a warning while preserving the local checkpoint. Existing projects are onboarded only by an explicit command:

```powershell
node scripts/git-init-games.mjs --dry
node scripts/git-init-games.mjs --game my-game
```

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

For an urgent implementation change in the middle of the phase pipeline, use `/do <task>`. The command durably preserves the exact request, pauses phase autopilot, and blocks accidental release routing until the task is implemented and verified. `/task` shows the active direct task; `/resume-phase` clears the override and returns control to the canonical pipeline. Strong natural-language implementation commands are detected too, while `/do` is the deterministic manual form.

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
- [RELEASE_NOTES_v4.68.47.md](RELEASE_NOTES_v4.68.47.md) — current release notes
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
