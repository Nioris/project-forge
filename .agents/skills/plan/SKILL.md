---
name: plan
kind: tactical
description: "Create a development roadmap as structured task files. Use when user says \"plan\", \"roadmap\", \"план\", \"дорожная карта\", \"разбей на задачи\"."
---

# Development Plan

## Instructions

### Step 1 — Read current state

1. `wiki/_map.md` — Vision, Done, Next
2. `wiki/plan/` — existing tasks (avoid duplicating)
3. `wiki/architecture/stack.md` — constraints

### Step 2 — Propose phases

Organize work into **phases** of 3-5 tasks each. Estimate complexity per task
(S/M/L). Identify dependencies.

### Step 3 — Write each task as a file in `wiki/plan/`

For each task, create `wiki/plan/<id>-<slug>.md` using `wiki/plan/_template.md`.

Id scheme:
- `Q<N>-NNN` — quarterly goals (default for new tasks)
- `R<N>-NNN` — release-specific
- `B<N>-NNN` — bug fixes
- `D<N>-NNN` — tech debt

Example: `wiki/plan/Q1-001-vk-bridge-auth.md`

```markdown
---
id: Q1-001
title: VK Bridge auth
status: planned
started: ""
deps: []
files:
  - src/auth/vk.ts
  - src/lib/storage.ts
---

# Q1-001 — VK Bridge auth

## What
Реализовать авторизацию через VK ID, сохранить токен в dexie.

## Why
Нужно для MVP — без авторизации не работают персональные функции.

## Acceptance
- [ ] VK Bridge initializes
- [ ] Get access_token
- [ ] Persist to dexie
- [ ] Handle network errors
```

### Step 4 — Report back to user

```
═══ DEVELOPMENT PLAN ═══

## Phase 1: {name} — {estimated duration}
- Q1-001 (M) VK Bridge auth
- Q1-002 (S) Dexie storage setup
- Q1-003 (L) First user-facing feature

## Phase 2: {name}
- Q2-001 (M) ...
- ...
```

### Step 5 — Update `wiki/_map.md` "Next" section

List phase 1 task ids (not full titles — the plan files are the source of truth).

## Non-Negotiable
- [ ] Each task is a separate file in `wiki/plan/<id>-<slug>.md`
- [ ] Frontmatter has `id`, `title`, `status`, `files`
- [ ] Acceptance section has checkboxes, not prose
- [ ] `deps:` identifies blockers between tasks
- [ ] At most one task has `status: in_progress`
- [ ] `wiki/_map.md` "Next" updated with ids of phase 1
