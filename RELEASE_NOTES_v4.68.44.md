# Project Forge v4.68.44

## Machine-readable Skill and Agent Contracts

Forge now distinguishes descriptive instructions from executable runtime authority. Eleven canonical
skills — status, all nine phases and gacha-meta — declare strict SkillContract v1 metadata for eligible
phases and modes, bounded read/write scope, STOP points, completion references and trusted verifier
allowlists. The remaining skill catalog stays backward-compatible and explicitly manual-only.

Durable Tasks persist the selected contract id, version and content hash. A phase, mode, scope,
verifier or mid-run hash mismatch is rejected mechanically. GigaChat can bind a tactical skill during a
direct change, but its verifier plan is derived only from a successful structured Forge operation in the
host ledger; copied command text and model-authored completion claims grant no authority.

Five core subagent roles now have Builder, Reviewer or Researcher contracts and typed result schemas.
Their reports remain advisory: only host-recorded writes, evidence, the installed verifier registry and
durable RunResult transitions can complete work. Generated Codex mirrors reference these contracts
without duplicating them into every prompt, while skill search and MCP expose compact eligibility data.

This release does not change the canonical nine phases. Declared write scope is selection metadata in
v4.68.44, not yet an operating-system sandbox or file lease; enforcement remains a separate future layer.
