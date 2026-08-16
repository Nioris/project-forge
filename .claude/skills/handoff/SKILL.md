---
name: handoff
kind: tactical
description: Prepare the project for the next session by crystallising state in wiki/_current.md. Use when context is long, switching tasks, or ending a work session. Triggers on "handoff", "передача", "save context", "сохрани контекст".
---

# Handoff

Crystallise everything the next session needs into `wiki/_current.md`.
This file is always injected at session start — if it's good, the next
session resumes seamlessly.

## Instructions

### Step 1 — Refresh wiki/_current.md

Update every section so a fresh Claude (after `/compact` or new session)
can pick up without questions:

```markdown
## Session goal
{One line — what we were solving}

## Active task
- [x] Step 1
- [x] Step 2
- [ ] Step 3 ← resume here
- [ ] Step 4

Files in work: `src/...`, `src/...`

## Blockers
{Empty or 1-3 lines}

## Last 3 decisions
- 2026-04-22: {what, link to [[decisions/NNN]]}
- ...

## Not yet documented
- [ ] wiki/features/{n}.md for module X
- [ ] wiki/changelog.md entry for today's commit

## Notes for next session
- If X fails, try Y
- Don't forget to run `scripts/verify-vk.mjs` before deploy
```

### Step 2 — Sync other wiki

- Close any acceptance boxes in `wiki/plan/*.md` that are done
- If a task is fully complete, set `status: done`
- Append any mistakes to `wiki/pitfalls.md`
- Update `wiki/_map.md` Done/In Progress/Next

### Step 3 — Self-review

Ask yourself: *If I lost all memory right now, could I resume in 30 seconds
with just `wiki/_current.md` + the plan summary + `wiki/_map.md`?*

If not → add what's missing.

### Step 4 — Optional: run wiki-audit manually

```bash
node .claude/hooks/wiki-audit.mjs
```

Fixes any findings before the Stop hook catches them.

## Non-Negotiable
- [ ] `wiki/_current.md` Session goal is one clear sentence
- [ ] Active task's unchecked item is the exact resume point
- [ ] "Notes for next session" has concrete, non-obvious hints
- [ ] `wiki/_map.md` Next/Done refreshed
- [ ] `wiki-audit` returns clean (no findings)
