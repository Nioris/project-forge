---
name: continue
kind: tactical
description: Resume work on the project. Reads wiki/_current.md, plan, then _map.md and picks up where we left off. Use when user says "continue", "продолжай", "resume", "where were we", "what's next".
---

# Continue Project

## Instructions

### Step 1 — Read state in order of specificity

1. **`wiki/_current.md`** — session goal, active task, last decisions. Hook
   already injected this at session start; re-read if you need detail.
2. **`wiki/plan/` summary** — already in context via `session-start.mjs`.
   If you need a task's full details: read `wiki/plan/<id>-<slug>.md`.
3. **`wiki/_map.md`** — project-wide picture.
4. **`wiki/architecture/stack.md`** — tech stack.
5. **`wiki/pitfalls.md`** — don't repeat old mistakes.

### Step 1.5 — Pipeline state check (v4.9.0+)

If project follows the 7-step pipeline (`/start` was used, or `/pipeline` invoked), run:

```bash
node scripts/check-pipeline-state.mjs
```

This shows:
- Which steps are complete ✓
- Where you are now → (current step)
- What's required for the next step
- Suggested command для invoke

Use this output to **confirm** what `_current.md` says — иногда они расходятся (file timestamps вне sync с manual status block). The verifier reads filesystem reality.

Skip this step if:
- Project не следует pipeline (e.g. just bug fix sessions, no plan structure)
- `wiki/architecture/metrics.md` doesn't exist (means no formal pipeline started)

### Step 2 — Identify where to resume

- If `_current.md` has an unchecked item → continue it.
- Else if any `wiki/plan/*.md` has `status: in_progress` → resume that task.
- Else → pick first task from `wiki/plan/` with `status: planned` whose `deps`
  are all `done`. Flip it to `in_progress`, update `_current.md`.
- Else → tell the user the plan is empty, ask what to work on next.

### Step 3 — Work the task

Follow the acceptance list top-to-bottom. After each meaningful step:
- Check the box in `wiki/plan/<id>-<slug>.md`
- Update progress checkbox in `wiki/_current.md`

When all acceptance boxes are checked:
- Set `status: done` in the plan file
- Create/update `wiki/features/<n>.md`
- Move the task entry from `Next` to `Done` in `wiki/_map.md`
- Pick the next task, flip `status: in_progress`, refresh `_current.md`

### Step 4 — Follow code rules from CLAUDE.md

- File-header JSDoc
- Function-level JSDoc for any fn >5 lines
- No magic numbers without comments
- No hardcoded values that repeat

### Step 5 — Update wiki as you go

| Trigger | Update |
|---------|--------|
| Decision made | `wiki/decisions/<NNN>-<n>.md` |
| Mistake made | append `wiki/pitfalls.md` |
| Bug found | `wiki/bugs/<n>.md` |
| Shortcut taken | `wiki/tech-debt.md` |
| Build/deploy | append `wiki/changelog.md` + `wiki/deploy-log.md` |

**plan-check** will warn you if you edit outside the active task's `files:`.
**wiki-audit** will block stop if any of the above is missed.

### Step 6 — End of session

Before you stop:
1. Refresh `wiki/_current.md` "Active task" progress
2. Refresh `wiki/_map.md` Done/In Progress/Next sections
3. Note anything important for next session in `_current.md` "Notes for next session"

## Non-Negotiable
- [ ] `_current.md` read first
- [ ] No edits outside the active task's `files:` without updating the plan
- [ ] All new code has file headers and JSDoc comments
- [ ] New features get `wiki/features/<n>.md`
- [ ] Decisions logged in `wiki/decisions/`
- [ ] `wiki/_current.md` and `wiki/_map.md` refreshed before stop
