---
date: 2026-04-27 (recognized in v4.7.6, formalized in v4.7.7)
status: proposed (full implementation in v4.8)
tags: [decision, skills-taxonomy, architecture]
---

# 010: Architectural vs Tactical skills — auto-invoke architectural

## Context

While building `/i18n-foundation` skill (v4.7.6), realized that Forge's 81 skills fall into two distinct categories:

**Architectural skills** — set up patterns ДО writing logic. Cheap upfront, expensive retrofit:
- `/i18n-foundation` (foundation for translations)
- `/anon-auth-sync` (auth pattern from day 1)
- `/error-boundary` (error handling pattern, hypothetical for v4.8)
- `/save-system` (save persistence pattern, hypothetical for v4.8)
- `/event-bus` (cross-module communication, hypothetical for v4.8)

**Tactical skills** — applied as needed during development:
- `/localize` (translate to 13 languages, after content exists)
- `/visual-upgrade` (polish visuals, after gameplay exists)
- `/research-references` (look at competitors, when designing)
- `/release-yandex` (build for Yandex, when releasing)
- `/fix-moderation` (respond to rejection, after submission)

**Critical insight**: Architectural skills called too late = days of retrofit. Tactical skills called too early = wasted work or premature optimization.

Forge until v4.7.6 had only ONE architectural skill that auto-invoked from `/start`: i18n-foundation (Step 6.5). Other architectural skills exist but are tactical in invocation pattern (called only when user explicitly asks).

## Options Considered

1. **No formal categorization** — leave skills as flat list. Cons: users (and Claude) don't know which are architectural. Result: defer them, retrofit later.

2. **Categorize but don't change invocation** — add tags. Cons: doesn't change behavior, still skipped.

3. **Categorize + auto-invoke architectural from `/start`** — review всех 81 skills, mark architectural, add to `/start` mandatory phases. Cons: lengthens `/start` workflow, may add unwanted setup for tiny projects.

4. **Categorize + dependency graph** — architectural skills declare what they bootstrap, `/start` reads graph and asks user "you'll have feature X — invoke architectural skill Y?". Pros: smart. Cons: complex to maintain dependency declarations.

## Decision (proposed for v4.8)

**Combination of options 3 + 4 — categorize + smart auto-invoke based on project type.**

Plan:
1. **Review** all 81 skills, mark each as `architectural` or `tactical` in frontmatter
2. **Architectural list для default `/start`**:
   - `/i18n-foundation` (already done v4.7.6)
   - `/save-system` (новый — localStorage abstraction with cloud-sync hooks)
   - `/error-boundary` (новый — global error catcher, telemetry, user-friendly message)
   - `/event-bus` (новый — typed pub-sub for cross-module events)
3. **Game-specific architectural** (auto when type=game): scene-graph, game-loop, input-abstraction
4. **App-specific architectural** (auto when type=app): router, state-management, api-client
5. **`/start` Step 6.5 → 6.5–6.9**: each architectural skill called sequentially with stop-points for user opt-out

Status: **proposed**. Need to implement остальные architectural skills (save-system, error-boundary, etc.) before this decision can be fully realized.

## Consequences

- **Pro**: New projects get proper foundation. No "wait, I forgot to add error handling" три недели в.
- **Pro**: Dependency graph (in v4.8 dependency-aware version) makes architecture explicit.
- **Con**: `/start` becomes longer workflow. Stop points help, but feels heavyweight.
- **Con**: Need to write 4-5 new architectural skills before this lands. Each is its own design problem.
- **Con**: Some projects are simple (calculator) and don't need full foundation — need opt-out

Mitigation для opt-out: like `/start --skip-research`, allow `/start --skip-architecture` for trivial projects.

Lesson #26: Architectural skills отличаются от tactical skills. Architectural должны быть auto-invoked из `/start`, не optional. Каждый раз когда есть pattern "X надо делать с нуля чтобы потом не страдать" — это architectural skill.
