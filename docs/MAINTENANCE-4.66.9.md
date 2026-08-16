# Project Forge v4.66.9 — Codex config compatibility and Full launch trust behavior

## Fix: `AgentRoleToml` config parse failure

Some installed Codex CLI builds parse the `[agents]` table as a map of role declarations and reject scalar children such as `enabled = true` with an error similar to:

```text
invalid type: boolean `true`, expected struct AgentRoleToml
```

Forge no longer emits optional global `[agents]` scalar settings in portable `.codex/config.toml`. This is safe for current Codex because multi-agent is enabled by default and the concurrency cap is optional. Custom project agents remain under `.codex/agents/*.toml`.

## Full launch

Dashboard `Codex Full` and the `cx` alias now launch with:

```text
codex -a never -s danger-full-access --dangerously-bypass-hook-trust
```

This removes command approval prompts, sandbox restrictions and separate hook-trust prompts for the explicit Full mode. Codex project-directory trust is intentionally not bypassed; it is a distinct security boundary and normally appears once per project.
