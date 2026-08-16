---
name: new-project
kind: architectural
description: "Create a new isolated project workspace using git worktrees. Use when user says \"new project\", \"новый проект\", \"create workspace\", \"ещё один проект\", or wants to work on multiple…"
---

# New Project (Isolated Workspace)

## Purpose
Creates a completely isolated workspace for a new project using git worktrees.
Each project gets its own branch, directory, and context — no file conflicts.

**v4.4 change:** before creating the worktree, this skill now runs research + skill discovery phases. Plan built from references beats plan built from assumptions.

## Instructions

### Phase 0a: Research references (MANDATORY, v4.4+)

Before creating the worktree — understand what already exists in the space.

Invoke `$research-references` with the project topic as argument. Example:

```
$research-references hypercasual timing game with obstacle course
```

This produces `wiki/research/{Project}-references.md` with:
- 3-5 real competitors (from web_search, not memory)
- Table-stakes features + differentiation opportunities
- UI/UX visual references (from image_search if applicable)
- Platform-specific conventions (if platforms specified)
- Open questions for the user to confirm

**Stop after this phase.** Show the user the one-screen summary from research-references and wait for them to confirm or correct the direction before moving forward.

### Phase 0b: Skill discovery for specialized competencies (v4.4+)

Identify specialized competencies the project will need beyond general coding:
- Physics engine? Animation library? Specific monetization model?
- Particular design aesthetic (retro, brutalist, editorial)?
- Platform-specific SDK integrations?

For each specialized need, invoke `$find-or-make-skill` with the topic. Example:

```
$find-or-make-skill physics-based puzzle mechanics for canvas games
```

This checks (in order):
1. Local `.claude/skills/` — is there already a skill for this?
2. Local `.claude/agents/` — is there a subagent?
3. Anthropic official skills (code.claude.com, anthropics/skills, anthropics/claude-plugins-official)
4. Community marketplaces (claudepluginhub, buildwithclaude, vercel-labs/agent-skills)
5. **Last resort:** falls back to `$write-skill` to create one locally

**Never hallucinate a solution** when a skill could exist. Discovery-first discipline. If Phase 0b finds skills that need installation — show user and wait for approval before installing.

### Step 1: Create the worktree

```bash
# From the project-forge root directory
PROJECT_NAME="$1"  # e.g., "my-cool-app"
BRANCH_NAME="project/${PROJECT_NAME}"

# Create isolated worktree
git worktree add "../${PROJECT_NAME}" -b "${BRANCH_NAME}" main

# Copy skill references (symlink to save space)
cd "../${PROJECT_NAME}"
ln -s ../project-forge/skills ./skills 2>/dev/null || cp -r ../project-forge/skills ./skills
```

Or use Claude Code's built-in worktree:
```bash
claude --worktree "${PROJECT_NAME}"
```

Or use forge CLI:
```bash
./scripts/forge.sh new "${PROJECT_NAME}" "описание проекта"
```

### Step 2: Initialize the project

In the new worktree, run:
```
$start {project description}
```

This creates wiki/_map.md, wiki/architecture/, wiki/decisions/, and builds the first feature — all isolated from other projects.

### Step 3: Switch between projects

```bash
# List all active projects (worktrees)
git worktree list

# Open a specific project
cd "../${PROJECT_NAME}" && claude

# Or use tmux for parallel sessions
claude --worktree "${PROJECT_NAME}" --tmux

# Remove finished project
git worktree remove "../${PROJECT_NAME}"
```

## Quick Reference

| Action | Command |
|--------|---------|
| New project | `claude --worktree my-app` |
| List projects | `git worktree list` |
| Switch project | `cd ../my-app && claude` |
| Parallel (tmux) | `claude --worktree my-app --tmux` |
| Remove project | `git worktree remove ../my-app` |

## Non-Negotiable
- [ ] **Phase 0a executed:** wiki/research/{Project}-references.md exists before worktree creation
- [ ] **Phase 0b executed:** for each specialized competency, find-or-make-skill chain ran (not skipped)
- [ ] **User confirmed direction** after research summary (stop + wait, don't barrel through)
- [ ] Each project in its own worktree (never share working directory)
- [ ] Skills accessible from every worktree
- [ ] wiki/_map.md created immediately via $start
- [ ] Wiki structure (features/, decisions/, bugs/, sessions/, research/) created
- [ ] No file conflicts between projects
