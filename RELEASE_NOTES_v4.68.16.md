# Project Forge v4.68.16 — Quality Sol + private project Git

This release makes the Codex path quality-first while putting every generated game or app under a safe local-first Git lifecycle.

- All nine Codex phases and all generated custom agents use GPT-5.6 Sol on the Standard service tier. Fast is never selected automatically.
- Reasoning effort follows the work: high for analysis, design, implementation, visual direction, integrations and QA; medium for deterministic listing, normal release packaging and routine metrics. `xhigh`, Max and Ultra remain explicit escalations.
- Fresh tasks per phase, bounded tool output and one high-detail image per turn prevent the multi-megabyte context amplification observed in real development sessions.
- New projects receive a local `main` repository and first commit. Every successful `phase-state complete` creates another checkpoint automatically.
- A workspace policy can create and push each future game/app to its own private GitHub repository. Public remotes are refused, likely secrets are blocked, and remote failures preserve local history.
- Existing projects remain untouched until explicitly selected with `git-init-games.mjs`; `--dry` provides the fleet preview.

Verified with offline local-repository/checkpoint/secret-ignore regressions, authenticated read-only checks against an existing private repository, and a refusal test against an existing public repository.
