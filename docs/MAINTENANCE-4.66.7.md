# Project Forge v4.66.7 — dual launch and upgrade cleanup

Date: 2026-08-14

## Why this release exists

Two field issues surfaced immediately after the unified Claude/Codex release:

1. Dashboard project cards had one Claude-oriented `Открыть терминал` action and no equivalent hands-off Codex launch.
2. A real 4.66.5 → 4.66.6 update retained six obsolete phase directories after their files were gone. Directory-based counting then saw 143 canonical entries while the real Codex mirror had 140, so the dashboard integrity gate correctly aborted the fleet sync.

A third updater UX issue was also confirmed: the generic Windows package-discovery pipeline could fail to see a correctly named ZIP next to `update-forge.bat`.

## Dashboard launch contract

Every project card now exposes two explicit actions:

- **Claude Full** → copies `Set-Location -LiteralPath '<project>'; cf`. `cf` is the existing `claude --dangerously-skip-permissions` alias.
- **Codex Full** → copies `codex -C '<project>' -a never -s danger-full-access`.

The normal `.codex/config.toml` and `.codex/config.project.toml` remain conservative (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`). Full access is therefore an explicit launch choice rather than a hidden default applied to every Codex session.

`scripts/cx.bat` and `scripts/cx` provide the same full-access Codex flags as an optional short alias.

## Obsolete phase-directory migration

The canonical phase map since construct was inserted is:

`phase-1-analyze → phase-2-design → phase-3-construct → phase-4-visual → phase-5-tech → phase-6-listing → phase-7-test → phase-8-release → phase-9-live`.

The following pre-shift directories are obsolete and are now removed by both `upgrade.ps1` and `upgrade.sh`:

- `phase-3-visual`
- `phase-4-tech`
- `phase-5-listing`
- `phase-6-test`
- `phase-7-release`
- `phase-8-live`

If any obsolete directory unexpectedly contains data, the upgrade path first copies it to `../forge-data/backups/obsolete-skill-dirs-<timestamp>/` and only then removes the stale engine directory.

## Windows updater discovery

`extras/update-forge.bat` still chooses the highest semantic-version ZIP from the updater folder and Downloads, but package discovery no longer depends on command-substitution output from a long PowerShell pipeline. The PowerShell result is written to a temporary file and then parsed by the BAT, which is less fragile across Windows shells.

## Release gates added

- Dashboard audit requires both launch buttons and their exact Claude/Codex full-access command contracts.
- Update-surface audit requires obsolete-phase cleanup in both Windows and POSIX upgrade scripts.
- Update-surface audit requires the `cx` launchers to contain `-a never -s danger-full-access`.
- Update-surface audit checks the hardened temporary-file package-discovery path.

## Security boundary

`Codex Full` deliberately disables command approval prompts and uses the unrestricted sandbox policy. It is intended for trusted local development projects. It does not grant operating-system privileges that the current user account does not already have. The ordinary `codex` launch remains the safer default when unrestricted access is unnecessary.
