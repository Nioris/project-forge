---
date: 2026-04-27 (v4.7.7)
status: accepted
tags: [decision, enforcement, architecture]
---

# 009: Workspace discipline enforcement — three layers (skill text + hook + verifier)

## Context

3-folder discipline (GameIntegration / WorkProgress / Release, see [[001-three-folder-discipline]]) existed since v4.x. Documented в `/full-pipeline` skill. But **NOT** enforced.

User report: "разрабатываем игру, но он игнорирует правила например что её надо скопировать в WorkProgress и там работать, он хер пойми где делает".

Investigation revealed:
- `/start`, `/analyze-game`, `/analyze-project` НЕ имели обязательного шага "copy to WorkProgress"
- Hook'ов на запись в защищённые папки НЕ было
- CLAUDE.md (главный context) упоминал правило одной фразой в headline

В итоге Claude Code в новых сессиях:
- Иногда копировал в WorkProgress (если попадался релевантный skill)
- Чаще редактировал прямо в GameIntegration/ (читая исходники, потом писая туда же)
- В Release/ писал куда попало

## Options Considered

1. **Just update CLAUDE.md prominently** — bold rule at top. Cons: Claude in mid-session might miss it after compaction.

2. **Add hook for write blocking** — automatic enforcement. Cons: hook alone doesn't explain what to do, just blocks.

3. **Update skills with explicit Phase 0** — `/start`, `/analyze-game`, `/analyze-project` get mandatory copy step. Cons: only catches new sessions, not running ones.

4. **All three combined** — skill text (instructions) + hook (auto-enforcement) + verifier script (manual audit).

## Decision

**Three layers** — each addresses different failure mode:

### Layer 1: Skill text (explanation)

`/start` Step 0, `/analyze-game` Phase 0, `/analyze-project` Phase 0 — explicit "copy to WorkProgress before reading".

Addresses: New sessions where Claude reads instructions from start.

### Layer 2: Hook (auto-enforcement)

`.claude/hooks/workspace-discipline.mjs` — PreToolUse:Write|Edit|MultiEdit blocks writes to:
- `GameIntegration/*` — always (read-only sources)
- `Release/{X}/*` (subpath, not top-level) — unless `FORGE_ALLOW_PROTECTED_WRITE=1` env set (used by release-* skills internally)

When blocked, helpful stderr message:
- Точный path
- Объясняет правило
- Даёт точную bash + pwsh команду для копировки
- Указывает bypass

Addresses: Sessions where Claude has read instructions but forgot mid-session.

### Layer 3: Verifier (manual audit)

`scripts/check-workspace-discipline.mjs` — scans `git status` for files modified outside `WorkProgress/`. Exit 0 if clean, 1 if violations.

Addresses: Sessions that pre-date hook OR where hook was bypassed via env var. Used in code review or pre-commit.

## Consequences

- **Pro**: Triple coverage — instruction (proactive) + hook (reactive) + audit (post-fact)
- **Pro**: Each layer catches different failure mode
- **Pro**: Hook's helpful error message acts as in-session teaching — Claude reads error, learns to use WorkProgress
- **Pro**: Bypass exists для legitimate cases (release-* skills writing to Release/)
- **Con**: 3 places to maintain when discipline rules change
- **Con**: Hook can be noisy if user does something unusual (e.g. quick fix to GameIntegration/) — bypass is one env var away

**Generalized pattern (lesson #27)**: Архитектурные правила без enforcement decay в течение weeks. Документировать в skill'ах недостаточно — Claude в новой сессии не читает все skills. Нужны три gateway:

1. **Skill text** (explanation)
2. **Hook** (auto-enforcement)
3. **Verifier script** (manual audit)

Без всех трёх — drift гарантирован.

This pattern will be applied to other architectural rules в v4.8 (tactical/architectural skill categorization, etc).
