# Project Forge rules for GigaCode on GitVerse

This repository/project is managed by Project Forge.

1. Read `FORGE.md` before reviewing or proposing a change.
2. Preserve the canonical nine-phase pipeline. Do not treat SDK, mobile, localization, AI Studio or release checks as extra phases.
3. Do not edit `GameIntegration/`; implementation belongs in the active WorkProgress copy.
4. Respect STOP-points and phase gates. Later-phase evidence does not authorize skipping an earlier phase.
5. For a Forge workflow, read the canonical `.claude/skills/<skill>/SKILL.md` and preserve its acceptance criteria and verifiers even if the current GigaCode surface uses different commands.
6. Prefer reproducible evidence: tests, verifier output, diffs and concrete file paths.
7. Do not claim a project is ready/fixed solely from source inspection when the workflow requires runtime evidence.
8. Do not expose API keys, credentials or private player data in comments, patches or logs.
