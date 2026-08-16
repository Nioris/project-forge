# Forge Codex integration — unified-base design

Project Forge supports Claude Code and OpenAI Codex from the same repository. This is deliberately an adapter architecture, not a fork.

## Sources of truth

Human-maintained canonical files remain:

- `CLAUDE.md`
- `.claude/skills/`
- `.claude/agents/`
- `.claude/hooks/`
- Forge scripts, platform code, wiki, schemas, validators

Nothing in the Claude layer is removed or replaced for Codex.

## Generated Codex artifacts

- `AGENTS.md` — concise Codex engine instructions.
- `AGENTS.project.md` — portable runtime instructions copied to sibling projects as their `AGENTS.md`.
- `.agents/skills/` — exact mirror of `.claude/skills/` for Codex skill discovery.
- `.codex/agents/*.toml` — generated from `.claude/agents/*.md`.

Regenerate them with:

```bash
node scripts/generate-agents-md.mjs
node scripts/sync-codex-adapter.mjs
```

Do not hand-edit generated artifacts. Modify the canonical Claude/Forge source and regenerate.

## Native Codex adapter files

These are Codex-specific but are maintained as first-class Forge source files:

- `.codex/config.toml` — engine-root Codex configuration and optional Forge MCP.
- `.codex/config.project.toml` — template copied to sibling/generated projects (without the engine-local MCP path).
- `.codex/hooks.json` — lifecycle routing.
- `.codex/hooks/*.mjs` — Codex input adapters, notably native `apply_patch` path extraction.

Compatible safety hooks are reused directly from `.claude/hooks/` so Claude and Codex enforce the same policy instead of duplicating it.

## Update contract

1. Upgrade Forge normally by replacing files and running `upgrade.sh`, `upgrade.ps1`, or `upgrade.bat`.
2. Upgrade scripts regenerate `AGENTS.md`, `.agents/skills/`, and `.codex/agents/`.
3. `scripts/check-codex-compat.mjs` detects stale/missing generated artifacts and an oversized/stale `AGENTS.md`.
4. `scripts/check-drift.mjs` includes the Codex compatibility gate.
5. `scripts/sync.mjs` propagates both `.claude/*` and Codex adapter files to sibling projects.

This makes future Forge updates flow through one canonical base while both coding agents remain usable.

## Unified command layer (v4.66.6+)

Forge skill names are agent-neutral; only the explicit invocation syntax differs:

| Forge action | Claude Code | Codex |
|---|---|---|
| Game router | `/game` | `$game` |
| Continue | `/continue` | `$continue` |
| Project status | `/status` | `$status` |
| Phase 4 visual | `/phase-4-visual` | `$phase-4-visual` |
| Release | `/release-yandex` | `$release-yandex` |

Codex has native slash commands named `/status`, `/plan`, and `/review`; those are not Forge skills. The Forge versions are `$status`, `$plan`, and `$review`. Generated `.agents/skills/` content normalizes known canonical `/skill` references to `$skill`.

`dashboard.html` contains generated `FORGE_META` (version, canonical/Codex skill counts, known skill names) and a Claude/Codex command-mode switch. Run `node scripts/sync-dashboard-meta.mjs` to refresh it and `node scripts/check-dashboard-meta.mjs` to verify it.

Sibling propagation is owned by `scripts/sync.mjs`. Root `sync.bat` and legacy wrappers delegate to it. Each sibling receives `.forge-managed.json`; only paths recorded as Forge-owned are eligible for stale-file pruning on future syncs. User-created files outside that manifest are preserved.
## Dashboard full-access launch

Since v4.66.7 each project card exposes two separate launch actions:

- **Claude Full** copies a PowerShell command that changes to the project directory and starts `cf` (`claude --dangerously-skip-permissions`).
- **Codex Full** copies `codex -C <project> -a never -s danger-full-access`, so command approvals are disabled and model-generated shell commands are not sandbox-restricted.

The normal `.codex/config*.toml` defaults remain `approval_policy = "on-request"` and `sandbox_mode = "workspace-write"`; full access is an explicit launch choice rather than a silent global default. `scripts/cx(.bat)` provides the same Codex full-access flags as an optional shell alias.

