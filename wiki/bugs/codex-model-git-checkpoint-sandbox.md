---
status: fixed_pending_real_verification
severity: high
tags: [bug, codex, pipeline, git, sandbox, q3-009]
---

# Model-side phase checkpoint could not write Git metadata

## Problem

Q3-009 Run 02 completed the real Phase 1 contract on Forge v4.68.54, but the checkpoint invoked from
inside the Codex session could not create `.git/index.lock`. The phase marker was correctly complete,
while its required local Git checkpoint was missing.

## Root cause

`phase-state complete` persisted the canonical result and then called `checkpointProjectGit()` from the
nested model process. `workspace-write` intentionally authorises project content, not Git metadata.
Checkpoint ownership therefore contradicted the safe sandbox boundary introduced in v4.68.54.

## Fix

- `codex-pipeline` declares itself the Git owner for every nested turn.
- The host makes a local preflight checkpoint before model access and a phase checkpoint after the cost
  report is saved.
- The nested phase runtime skips only its duplicate checkpoint; direct non-pipeline hosts remain compatible.
- Phase 1–7 remote writes are disabled. Phase 8+ verifies the private repository and must push successfully.
- Local checkpoint errors stop progression and are recorded as `HOST_GIT_CHECKPOINT_FAILED` diagnostics.
- Completion checkpoint state is persisted outside Git and reconciled before any later model launch; a
  failed Phase 8 push therefore cannot be skipped after restart or with `--from 9`.
- Explicit early-phase failures block status/direct progression, while Phase 8+ requires a confirmed
  private push even when GitHub automation is missing or disabled.
- Git initialized after Task creation receives runtime-ledger, lock and `.forge/runs/` exclusions before
  staging; a PID-owned lease covers the full commit/push and Git errors are scrubbed before diagnostics.

## Evidence

- Pilot fingerprint: `daa837b168842956d2d3`.
- Regressions: `scripts/check-codex-pipeline.mjs`, `scripts/check-project-git.mjs`,
  `scripts/check-execution-contract.mjs` and `scripts/check-forge-diagnostics.mjs`.
- v4.68.55 was rejected before publication/install because failed release publication was not yet durable
  across restart.
- Real verification: install v4.68.56, start Phase 2 and require startup reconciliation to checkpoint pending
  Phase 1 work without pushing it.

## Related

- [[../plan/Q3-009-godot-pilot-release]]
- [[../decisions/034-native-task-write-boundary]]
