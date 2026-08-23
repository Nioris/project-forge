---
id: B3-006
title: Host-enforced native Task write scope
status: done
started: 2026-08-23
deps: [B3-005]
files:
  - .claude/skills/status/references/task-scope-guard.mjs
  - .codex/hooks/task-scope.mjs
  - .codex/hooks.json
  - scripts/codex-pipeline.mjs
  - scripts/gigachat-agent.mjs
  - scripts/check-task-scope-guard.mjs
  - wiki/decisions/034-native-task-write-boundary.md
  - RELEASE_NOTES_v4.68.45.md
---

# B3-006 — Host-enforced native Task write scope

## What

Turn the write scope already bound to a durable Task into a real host decision for native file
operations. The host must establish Task identity before a model receives tools, validate the live
SkillContract provenance, reject lexical and junction/symlink escapes, and keep runtime-owned state
separate from model-authored work.

## Acceptance criteria

- [x] One shared guard resolves an explicit Task or the exact Task recorded by a phase marker.
- [x] Codex pipeline binds the phase Task before the first model turn and exports immutable Task id
      and contract hash to native `Edit`, `Write` and `apply_patch` hooks.
- [x] Missing authority, contract drift, terminal Tasks, unknown targets and paths outside declared
      write scope fail closed in guarded mode.
- [x] Existing-parent realpath validation rejects writes through a junction or symlink outside the
      project.
- [x] GigaChat applies the same authority to native text/copy/media writes and known portable file
      operations; unclassified mutating scripts are rejected while a Task is active.
- [x] Runtime lifecycle state remains host-owned, and a session with no explicit/phase Task retains
      legacy compatibility.
- [x] Scope denials enter local, secret-redacted Forge behavioral diagnostics.
- [x] A real authenticated Codex smoke proves one in-scope write succeeds and one out-of-scope
      native write is denied without touching a production project.
- [x] Version, generated mirrors, package, installed engine and sibling fleet are released as
      v4.68.45.

## Boundary

This layer enforces adapters and native file tools that actually call the guard. It is not an
operating-system sandbox: arbitrary Codex shell code and whole-project external CLIs still require a
disposable worktree/overlay plus host-side diff acceptance before Forge can claim complete write
isolation for the real project.

## Release verification

Released on 2026-08-23 after strict drift, Codex pipeline, GigaChat self-test, MCP registry and manifest
checks passed. A real isolated Codex Sol turn applied its in-scope patch, rejected one mixed-scope patch
atomically, preserved both denied files and recorded `CODEX_TASK_SCOPE_DENIED` without touching a user
project. The immutable archive is extraction-verified before fleet installation and post-sync status.
