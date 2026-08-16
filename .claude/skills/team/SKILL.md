---
name: team
kind: tactical
description: Spawn Agent Team for parallel development. Use when user says "team", "команда", "parallel", "параллельно", or when task benefits from multiple agents working together.
---

# Agent Teams

## Arguments
`$ARGUMENTS`:
- `build` — full team: architect + developer + QA
- `feature {name1} {name2}` — parallel feature development
- `review` — architect reviews while QA tests
- `refactor` — parallel refactoring across modules

## Team Structure (3 agents)

### Team Lead: Architect
- Reads wiki/_map.md and wiki/architecture/
- Plans task breakdown
- Assigns features to Developer
- Assigns testing to QA
- Updates wiki/_map.md and wiki/architecture/
- Creates wiki/decisions/ for each decision
- Resolves conflicts

### Teammate 1: Developer
- Builds features assigned by Architect
- Follows ALL code comment rules
- Reports completion to Architect and QA
- Fixes bugs reported by QA
- Creates wiki/features/<n>.md for each feature

### Teammate 2: QA + Docs
- Tests every feature Developer builds
- Verifies code comments are present and accurate
- Checks wiki/architecture/ matches actual code
- Reports bugs with file:line references, creates wiki/bugs/<n>.md
- Updates wiki/_map.md "Done" after verified features

## How to Launch

Agent Teams require the experimental flag:
```json
// In ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Then describe team in natural language:
```
Create an agent team with 3 teammates:
- Teammate 1: Build {feature A} in src/featureA/
- Teammate 2: Build {feature B} in src/featureB/
- Teammate 3: Write tests for both features in tests/
```

## Keyboard Shortcuts
- `Shift+Up/Down` — select teammates
- `Ctrl+T` — view task list
- `Enter` — view session
- `Escape` — interrupt

## Coordination Rules
- Developer MUST write comments while coding (not after)
- QA checks comments as part of review
- Architect logs all decisions in wiki/decisions/
- Each teammate works in its own worktree (isolation)

## Non-Negotiable
- [ ] wiki/_map.md read by all agents at start
- [ ] wiki/_map.md updated by Architect at end
- [ ] All new code has required comments
- [ ] QA verified every completed feature
- [ ] New features documented in wiki/features/
