---
status: fixed
severity: high
tags: [bug, codex, pipeline, sandbox, q3-009]
---

# Codex pipeline inherited a read-only sandbox

## Problem

The one-window Codex pipeline did not declare its filesystem sandbox. During Q3-009 Run 01 it inherited
read-only access and could not create the Phase 1 evidence that its Task contract explicitly authorised.

## Reproduction

1. Create a clean managed Godot project with Forge v4.68.52.
2. Run `node ..\project-forge\scripts\codex-pipeline.mjs --cwd .`.
3. Let Phase 1 perform research and attempt to persist its canonical evidence.

## Expected vs actual

- Expected: unattended Codex can write only inside the selected project workspace and reaches the real
  Phase 1 STOP or completion gate.
- Actual: the launch inherited read-only mode. Forge correctly recorded an infrastructure-owned
  `PHASE1_WRITE_SCOPE_BLOCKED` result and did not fabricate completion.

## Root cause

`firstExecArgs()` selected the project working directory but did not select a sandbox. The caller's ambient
mode therefore became an accidental part of the execution contract. A recovery attempt also used the
unknown resume policy `rerun`, which was validated too late and surfaced an internal stack trace.

## Fix

- Initial phase sessions explicitly launch with `workspace-write` and `approval_policy=never`.
- No full-filesystem, approval-bypass or hook-trust-bypass option is used.
- Resumed turns inherit the original session policy instead of attempting to broaden it.
- `phase-state` rejects unknown resume policies before mutating durable state.
- Offline regressions cover both the safe argument boundary and the invalid-policy path.

## Evidence

- Pilot diagnostic fingerprint: `e082064537bb69ad2916`.
- Targeted checks: `scripts/check-codex-pipeline.mjs` and `scripts/check-execution-contract.mjs`.
- Real verification: the same pilot wrote all Phase 1 evidence and reached `PHASE_CONTRACT_PASSED` on
  v4.68.54. Diagnostic `e082064537bb69ad2916` was resolved after that run.

## Related

- [[../plan/Q3-009-godot-pilot-release]]
- [[../decisions/034-native-task-write-boundary]]
