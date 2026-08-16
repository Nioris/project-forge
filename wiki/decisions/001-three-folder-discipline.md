---
date: 2025-12 (v4.x earliest)
status: accepted
tags: [decision, architecture, workspace]
enforced-since: v4.7.7 (hook-level)
---

# 001: Three-folder workspace discipline

## Context

Forge handles 3 conceptually distinct file collections:
1. Original sources from user (HTML5 game, app, prototype)
2. Active workspace where edits happen (transformations, integrations)
3. Final outputs ready for store submission (immutable artifacts)

Без strict separation эти merge'аются — user edits production builds, Claude overwrites originals, версионирование становится impossible.

## Options Considered

1. **Single workspace** — all in one directory. Pros: simple. Cons: chaos, original files lost on first edit, no clean separation between "draft" and "shippable".

2. **Two folders (input/output)** — typical web build pipeline. Pros: clear input/output. Cons: doesn't capture "active development" state where iteration happens.

3. **Three folders (GameIntegration / WorkProgress / Release)** — explicit separation of source / draft / final. Pros: each has clear ownership and read/write semantics. Cons: more conceptual overhead.

## Decision

Three folders with strict semantics:

| Folder | Read | Write | Owner |
|--------|------|-------|-------|
| `GameIntegration/` | ✅ | ❌ NEVER | User (drops files here) |
| `WorkProgress/{Project}/` | ✅ | ✅ | Claude during active development |
| `Release/{Project}/{platform}/` | ✅ | Only `/release-*` skills | Final pipeline output |

Bypass for special cases via `FORGE_ALLOW_PROTECTED_WRITE=1` env var (used by release-* skills internally).

## Consequences

- **Pro**: Original sources always recoverable (just re-copy from GameIntegration/)
- **Pro**: Final builds immutable until next release run
- **Pro**: Clear mental model — "where am I editing?" answered by `pwd`
- **Con**: Extra setup step (copy on first touch) — but automated by /start, /analyze-game, /analyze-project Phase 0
- **Con**: Required 3-layer enforcement to actually stick — see [[009-workspace-discipline-three-layers]]

Lesson #27: Architectural rules without enforcement decay в течение weeks. Workspace discipline existed since v4.x but only became enforced in v4.7.7 with hook + skill text + verifier.
