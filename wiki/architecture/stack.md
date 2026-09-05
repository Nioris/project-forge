# Stack

Architecture snapshot: 2026-09-05. Version authority: `.claude-plugin/plugin.json`; derive changing counts from the generators, not old prose.

## Engine and hosts

- Core: Node.js ES modules, PowerShell/Bash setup, Windows batch launch/update wrappers.
- Canonical workflows/roles: `.claude/skills/`, `.claude/agents/`, `CLAUDE.md`.
- Generated Codex adapters: `.agents/`, `.codex/`, `AGENTS.md`; regenerate, do not edit directly.
- Host-neutral contracts bind Tasks, verifier results, STOPs and phase markers. Claude/Codex, GigaChat and OpenCode/provider adapters have distinct capabilities; model selection is not an end-to-end benchmark result.
- Core scripts largely use built-in Node modules. Browser capture/playtest needs browser automation; native Godot export/QA needs the actual binary and matching toolchains.

## Product contracts

- Nine phases and completion contracts: `.claude/skills/status/references/`.
- `forge.engine.json` selects the supported engine path; web/native Godot use different verifiers.
- `forge.targets.json` selects storefronts from `adapters/platform-profiles.json` (ten canonical targets). Older `platforms/` directories are compatibility adapters, not target authority.
- Phase 2 screen-flow approval, visual targets, current captures and independent review are hash/receipt-bound. Real player input is separate from forced-state capture.
- `forge.web.playtest.json` defines bounded real-input scenarios and explicit persistence expectations.
- `forge.identity.json` is public metadata. Private keys/passwords live in the external security vault, never Git, ZIPs, wiki text or diagnostic reports.

## Memory and measurement

`wiki/_current.md` records the stopping point; maps/plans/decisions retain history. The local excluded
`wiki/diagnostics/forge-events.jsonl` stores incidents, not a verified live bug inventory. Cost, phase and
product metrics use recorded facts; unknown pricing, moderation and runtime outcomes stay unknown.

## Versioning and distribution

Use `scripts/bump-version.mjs`, AGENTS/Codex/dashboard/manifest generators and release checks.
`scripts/package-forge.mjs` produces an immutable `project-forge-vX.Y.Z.zip`; never overwrite a consumed
version. Install through the workspace updater and synchronize managed surfaces, preserving project content.

## Verification and encoding

`check-drift.mjs` audits the engine from its own location. Codex compatibility and platform completeness
have dedicated checks. `mcp-server/verifiers.json` classifies every check explicitly; new scripts do not
automatically gain public MCP or Task authority.

UTF-8 without BOM for JS/JSON/Markdown; preserve PowerShell BOM where needed for PS 5.1.
Batch control-flow blocks must stay ASCII-safe; prefer PowerShell literal paths for filesystem work.
