# Project Forge v4.68.19 — Clean Codex launch with optional local MCPs

This patch fixes two startup failures exposed by the first real `neftistan` run of the one-window Codex pipeline.

- Enabled loopback HTTP MCP endpoints inherited from the user Codex config are checked before Phase 1–9 starts.
- An unreachable local MCP is disabled through a child-process config override for the current pipeline run only.
- Global Codex configuration is never edited, so Unity MCP remains available when its service is actually running.
- Remote HTTP MCPs, stdio MCPs, and reachable local endpoints remain enabled.
- `--keep-local-mcp` explicitly bypasses the preflight when a service is expected to start later.
- Phase starts and STOP resumes receive the same MCP override set.
- Child Codex stdin now inherits the interactive terminal instead of appearing as a closed pipe, removing the misleading additional-stdin mode.

Verified with selective loopback/remote/stdio fixtures, start/resume argument assertions, the full fake Phase 1–9 lifecycle, and a real read-only preflight against the user's stopped `unityMCP` endpoint on `127.0.0.1:8091`.
