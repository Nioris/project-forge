# Project Forge v4.68.36

## Phase evidence consistency

- Phase 1 completion rejects `metrics.md` while its frontmatter still says `draft`, `blocked` or
  `qa_blocked`.
- Whole-project start/resume forwards the locked host and model to machine phase markers.
- Phase instructions require final wiki and evidence-status updates before the checkpointing
  completion command, avoiding a dirty tree immediately after completion.
- Offline regressions cover contradictory evidence status and runtime identity propagation.
