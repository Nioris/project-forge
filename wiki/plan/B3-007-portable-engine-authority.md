---
id: B3-007
title: Portable managed-runtime engine authority
status: done
started: 2026-08-23
deps: [B3-006]
files:
  - .claude/skills/status/references/forge-engine-root.mjs
  - .claude/skills/status/references/skill-contract.mjs
  - .claude/skills/status/references/verifier-runner.mjs
  - scripts/check-execution-contract.mjs
  - RELEASE_NOTES_v4.68.46.md
---

# B3-007 — Portable managed-runtime engine authority

## What

Repair copied phase runtimes so they can bind executable SkillContracts while preserving the installed
engine as the only verifier authority. Managed projects must find their sibling engine without a special
terminal launcher and must never gain authority from a project-local registry or forged engine markers.

## Acceptance criteria

- [x] SkillContract loading and verifier execution share one trusted engine-root resolver.
- [x] `FORGE_ENGINE_ROOT` remains the explicit host override and the normal managed sibling layout works
      without it.
- [x] Real paths and canonical engine markers are validated before registry or verifier scripts are used.
- [x] A copied runtime creates a durable Phase 1 Task against the sibling installed engine.
- [x] A project-local fake engine is rejected when no external authority is available.
- [x] The verifier registry remains excluded from managed project sync.
- [x] Version, generated mirrors, package, installed engine and affected project are released as v4.68.47.

## Release verification

The execution-contract regression launches the copied runtime from a separate game folder with no
`FORGE_ENGINE_ROOT`, a deliberately invalid local SkillContract and fake local registry. Phase Task
creation and a full contracted verifier transition succeed only through the sibling engine. A second
isolated managed fixture is itself named `project-forge`, has no sibling engine, and must still fail with
`FORGE_ENGINE_ROOT_UNAVAILABLE`, including when it points `FORGE_ENGINE_ROOT` back at itself.

The initial immutable v4.68.46 package repaired phase Task creation. Review then found the verifier-node
contract lookup still used the copied module root, so the complete path shipped as the new immutable
v4.68.47 package instead of overwriting v4.68.46.
