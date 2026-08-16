# Project Forge v4.66.6 — unified command layer audit

Date: 2026-08-12

## Goal

Keep one Project Forge base usable from both Claude Code and OpenAI Codex without deleting or forking the existing Claude layer. Make dashboard/project creation/update/sync describe and distribute the same build.

## Command contract

- Claude Code explicit Forge skill: `/skill-name`.
- Codex explicit Forge skill: `$skill-name`.
- Codex native `/status`, `/plan`, `/review` are not Forge project skills; Forge equivalents are `$status`, `$plan`, `$review`.
- Shell lifecycle is agent-independent: `new-project`, `upgrade`, root `sync`, external `update-forge`.
- `.claude/*` remains the human-maintained Claude/canonical source; generated `.agents/*`, `.codex/*`, `AGENTS*.md` adapt it for Codex.

## Implemented

1. `dashboard.html`
   - Claude/Codex mode selector.
   - `/skill` ↔ `$skill` display for known Forge skills.
   - phase table has native Codex `$phase-*` entries.
   - explicit collision note for status/plan/review.
   - project wizard emits both Claude and Codex entry commands.
   - project creation, root sync, upgrade and external updater guidance shown in dashboard.
   - generated `FORGE_META` stores engine version, canonical/Codex counts and skill names.

2. Dashboard integrity
   - `scripts/sync-dashboard-meta.mjs` refreshes version/count metadata.
   - `scripts/check-dashboard-meta.mjs` verifies version/counts, all phase mappings, collisions and project/update/sync guidance.
   - `check-drift.mjs` includes the dashboard gate.

3. Project creation
   - canonical `scripts/new-project.mjs <name> --type game|app`.
   - root `new-project.bat/.sh`.
   - `new-game` and `new-app` wrappers retained.
   - legacy `forge.ps1/sh new` delegates instead of maintaining a second incompatible creator.
   - new projects receive both runtimes and `.forge-managed.json` immediately.

4. Managed sibling sync
   - one implementation: `scripts/sync.mjs`.
   - `scripts/sync.bat` and `scripts/sync.ps1` are compatibility wrappers.
   - shared payload: `scripts/forge-sync-spec.mjs`.
   - `.forge-managed.json` records only Forge-owned destination files.
   - stale files are removed only when a previous Forge manifest proves Forge owned them; user custom files are preserved.
   - `scripts/check-sync-status.mjs` verifies every sibling.
   - `scripts/check-sync-spec.mjs` guards file/directory expansion, unique destinations and required payload entries.

5. Update/upgrade
   - `extras/update-forge.bat` is the external one-click updater template.
   - selects highest semantic version package, not file modification time.
   - shows current/package version and sibling count.
   - asks separately before downgrade.
   - aborts on backup, extraction, upgrade, sync, dashboard, Codex, drift or sibling verification failure.
   - `setup`, `upgrade` and `bump-version` regenerate Codex + dashboard surfaces.
   - `scripts/check-update-surface.mjs` statically gates updater/upgrade wiring.

6. Codex adapter
   - known Forge `/skill` references in generated Codex skills normalize to `$skill`.
   - 137 canonical skills + 3 Codex router skills = 140 discoverable Codex skills.
   - 17 canonical agents = 17 generated Codex agents.

## Regression audit

Executed in the release workspace:

- all top-level `scripts/*.mjs`: Node syntax check.
- modified shell entry points: `bash -n`.
- BAT encoding/comments checks.
- PowerShell encoding checks.
- dashboard metadata and dashboard structural baseline.
- Codex compatibility audit.
- managed sync payload structural audit.
- full Forge `check-drift`.
- platform completeness audit.
- MCP server tests (20/20).

### Isolated sibling end-to-end test

A clean temporary Forge parent was created. From it:

- created a `game` project via `new-project`;
- created an `app` project via `new-project`;
- verified game receives Claude `/phase-1-analyze .` and Codex `$phase-1-analyze .`;
- verified app receives Claude `/app` and Codex `$app`;
- synced both projects;
- `check-sync-status` reported both current;
- added a user custom Codex skill not present in Forge;
- removed one Forge-owned payload source in the temporary engine and re-synced;
- verified the stale Forge-owned sibling file was deleted while the user custom skill remained.

This test exposed and then fixed a real pre-release bug in `forge-sync-spec.mjs`: single-file payload entries were initially passed to directory traversal. `check-sync-spec.mjs` was added so this class is now a release gate.

## Environment limitation

Windows `.bat` files were statically audited (encoding, comments, required commands/gates), but this Linux build environment cannot execute `cmd.exe`/Windows PowerShell. The updater therefore still requires one real Windows acceptance run before treating the BAT UI itself as field-proven. Its delegated Node scripts and sync/update logic were tested independently.
