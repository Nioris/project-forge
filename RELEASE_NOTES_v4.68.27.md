# Project Forge v4.68.27 — one model for the whole project

Forge can now assign one selected AI agent and model to a project for all nine phases without automatic phase-based model switching.

- Added whole-project profiles for Gemini CLI, Qwen Code, Kimi K3, DeepSeek, GLM 5.3 and MiniMax M3.
- Added project-local `.forge/agent.json` locking with explicit `select`, `profile` and `start` commands.
- Implicit agent/provider changes are rejected; changing the lock is always an explicit action.
- Gemini and Qwen launch with a verified interactive startup prompt and autonomous approval mode.
- Kimi Code runs one bootstrap turn and resumes the same session interactively because its current CLI exposes separate prompt and interactive contracts.
- DeepSeek, GLM and MiniMax run through provider-pinned OpenCode profiles.
- Central provider keys are copied into isolated OpenCode credential stores outside projects and removed from the launched tool environment.
- Windows executable discovery prefers runnable `.exe`/`.cmd` npm shims instead of extensionless POSIX wrappers.
- Added managed `GEMINI.md` and `QWEN.md` rules, Dashboard buttons, project-lock schema, setup documentation and offline regressions.

Locally inspected runtime contracts: Gemini CLI 0.55.1, Qwen Code 0.14.0, Kimi Code 0.37.2 and OpenCode 1.15.10. Runtime/adapter integrity is verified offline. Full-project quality parity remains pending authenticated equal-fixture benchmarks and is not claimed by this release.
