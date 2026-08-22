# Project Forge v4.68.35

## Reliable OpenCode STOP continuation

- New `forge-agent resume --project ... --answer ...` command continues the last OpenCode session.
- STOP answers are stored in `.forge/agent-resume.md`; provider process arguments contain only a
  fixed instruction, avoiding Windows shell metacharacter exposure.
- OpenCode launches use the current `--auto` permission flag.
- A bounded project-local `list` compatibility tool prevents Qwen's repeated unavailable-tool loop.

## Research evidence hardening

- Phase 1 external factual claims are validated line by line.
- A document-level no-source disclaimer no longer permits uncited competitor names, dates or market
  conclusions elsewhere in the same file.
- Each detected external factual line must carry a URL/local source or an explicit TBD/unverified
  label.
