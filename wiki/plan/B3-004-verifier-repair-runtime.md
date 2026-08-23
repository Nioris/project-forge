---
id: B3-004
title: Verifier-driven repair runtime
status: done
started: 2026-08-23
deps: [B3-003]
files:
  - .claude/skills/status/references/verifier-runner.mjs
  - .claude/skills/status/references/execution-contract.mjs
  - .claude/skills/status/references/workflow-state.mjs
  - scripts/check-task-verifier-runner.mjs
  - scripts/gigachat-agent.mjs
  - mcp-server/verifiers.json
  - schemas/task.schema.json
  - schemas/run-result.schema.json
  - wiki/decisions/032-trusted-verifier-repair-runtime.md
  - RELEASE_NOTES_v4.68.43.md
---

# B3-004 — Verifier-driven repair runtime

## What

Execute an exact registry-backed verifier plan when a durable change Task reaches `verify`, normalize
the outcome into RunResult evidence, and route PASS/FAIL/environment into done/repair/blocked without a
second model interpretation step.

## Acceptance criteria

- [x] Only explicitly Task-enabled read-only project checks from the installed engine may execute.
- [x] Project-local registries, unsafe targets and mutating/internal checks are rejected before execution.
- [x] PASS completes, deterministic FAIL repairs, and timeout/environment failure blocks distinctly.
- [x] Repair uses the existing three-attempt graph budget and survives restart.
- [x] Workflow `result` automatically dispatches the verifier node.
- [x] GigaChat gacha direct tasks derive and run an exact host-owned verifier plan.
- [x] Concurrent and stale verifier locks never permit a silent duplicate run.
- [x] Structured nested issues are bounded and preserved as repair evidence.
- [x] Version, generated mirrors, package, installed engine and sibling fleet are released as v4.68.43.

## Boundary

This is the deterministic execution/repair layer. It does not replace phase completion contracts,
enforce Task write scopes, add file leases, or introduce a visual workflow editor.

## Release verification

Released on 2026-08-23 as `project-forge-v4.68.43.zip` after the Task runner, execution contract,
GigaChat self-test, MCP registry, Codex adapter, Dashboard metadata, manifest and strict drift gates
passed. The immutable archive is extraction-verified before installation and the managed sibling fleet
is checked for missing, outdated and stale files after synchronization.
