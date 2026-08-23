---
id: B3-005
title: Machine-readable skill and agent contracts
status: done
started: 2026-08-23
deps: [B3-004]
files:
  - .claude/skills/status/references/skill-contract.mjs
  - .claude/skills/status/references/agent-contract.mjs
  - adapters/agent-contracts.json
  - schemas/skill-contract.schema.json
  - schemas/agent-contract.schema.json
  - schemas/agent-result.schema.json
  - scripts/check-skill-contracts.mjs
  - scripts/check-agent-contracts.mjs
  - scripts/search-skills.mjs
  - scripts/gigachat-agent.mjs
  - .claude/skills/status/references/execution-contract.mjs
  - .claude/skills/status/references/verifier-runner.mjs
  - wiki/decisions/033-machine-contract-authority.md
  - RELEASE_NOTES_v4.68.44.md
---

# B3-005 — Machine-readable skill and agent contracts

## What

Turn the most important skill and subagent rules into strict runtime-readable contracts. Bind a
declared SkillContract id/hash to durable Task state, filter deterministic skill selection by phase
and mode, and keep structured agent reports separate from completion authority.

## Acceptance criteria

- [x] Flat SkillContract v1 has one strict parser/validator and a public JSON Schema.
- [x] Missing contracts remain backward-compatible but manual-only.
- [x] Status, all nine phases and gacha-meta have declared executable contracts.
- [x] Task records contract provenance and rejects phase/mode/scope/verifier/hash mismatch.
- [x] GigaChat binds the exact loaded tactical contract and derives its verifier plan only from a
      successful structured host `forge_script` operation.
- [x] Builder/Reviewer/Researcher AgentContracts and AgentResult variants validate mechanically.
- [x] Generated Codex agents reference contracts without duplicating the manifest into prompts.
- [x] Search and MCP expose compact contract eligibility/resources without loading all skill prose.
- [x] Version, generated mirrors, package, installed engine and sibling fleet are released as v4.68.44.

## Boundary

Contracts are executable selection and authority metadata, but write scope remains declarative in
this release. Host write-boundary enforcement and file leases remain separate subsequent layers.
