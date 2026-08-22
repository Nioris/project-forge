# Project Forge v4.68.10 — Codex Economy Routing

## What changed

- Fast mode is disabled in the recommended local Codex setup; phase launches use the Standard service tier.
- Added a canonical per-phase Codex policy with Terra as the normal implementation model, Sol for design and documented escalations, and Luna only for mechanical metadata/metrics work.
- Added `scripts/codex-phase.mjs` to start a fresh Codex task with the selected phase model and reasoning effort. Dashboard now copies both the normal `$phase-*` skill and the policy-aware launcher.
- Default phase orchestration is capped at two subagents. Generated Codex custom agents are pinned to Terra/medium; Max and Ultra are never automatic.
- Phase markers now keep the recommended Codex route separate from the actual reported runtime. Claude and GigaChat runs are no longer mislabeled as Terra when no Codex launcher evidence exists.

## Verification

- Model-policy, route escalation, phase-state persistence and launcher dry-run regressions pass.
- Codex 0.147.0 accepts the local economy configuration and reports `fast_mode=false`.
- Codex adapter, Dashboard, drift, sync snapshot, updater, manifest and terminal-agent regression gates pass before packaging.

## Usage

From a managed project directory:

```powershell
node ..\project-forge\scripts\codex-phase.mjs 3 --cwd .
node ..\project-forge\scripts\codex-phase.mjs 5 --route payment-security --cwd .
```

Existing `$phase-*` commands still work, but an already-running Codex task cannot change its primary model from prompt text alone.
