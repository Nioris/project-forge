# Project Forge v4.68.29 — Windows-safe whole-project startup

The first authenticated Qwen launch exposed Windows command-shell parsing of metacharacters inside the long startup prompt before the model request began.

- The complete whole-project startup contract now lives in `.forge/agent-start.md`.
- Qwen, Gemini, Kimi and OpenCode receive a short shell-safe instruction to read that file.
- Agent/model lock semantics and the autonomous nine-phase contract remain inspectable in the project.
- A real fake-`.cmd` subprocess regression verifies prompt delivery through the Windows npm shim path.

No provider quota was spent while reproducing the failed launch.
