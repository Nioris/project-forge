# Project Forge v4.68.17 — One-window Codex phase orchestration

This release removes the manual close/reopen workflow between Codex phases.

- `codex-pipeline.mjs` keeps one terminal window for the full Phase 1–9 lifecycle.
- A STOP answer resumes the current phase session, preserving only the context that is still useful.
- A durable phase `complete` prompts for the next phase, discards the old Codex session, and launches a clean one in the same terminal.
- Premature `in_progress` endings are resumed automatically up to a bounded limit instead of silently stopping development.
- `--auto` advances completed phases without asking while preserving real STOP-points.
- The Windows launcher resolves the installed Codex JavaScript entrypoint, avoiding `codex.cmd`/WindowsApps child-process failures.
- Dashboard, new-project output, README, GUIDE and command reference now make the one-window command the primary Codex workflow.

Verified without model calls through JSON event parsing, STOP/resume state classification, Windows CLI resolution, dry-run policy inspection, and a complete nine-child-session integration fixture.
