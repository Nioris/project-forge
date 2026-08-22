# Project Forge — Qwen Code adapter

Read `FORGE.md` first. It is the host-neutral runtime contract for the canonical nine phases, durable state, STOP-points, workspace discipline and verification.

Before implementing work, also read the project `CLAUDE.md`, `wiki/phases/phase-*.json`, `wiki/_current.md`, `wiki/_map.md`, and the applicable canonical `.claude/skills/<name>/SKILL.md` in full. Claude-specific invocation wording names the same Forge workflow; translate only the invocation syntax to Qwen Code capabilities and never invent unavailable tools.

When `.forge/agent.json` locks `qwen` to the project, remain the sole primary model for every phase. Continue autonomously until a canonical user-owned STOP-point, verified completion, or genuine blocker. Do not stop merely to announce the next step. Preserve local Git checkpoints and never claim completion without verifier evidence.
