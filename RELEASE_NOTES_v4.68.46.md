# Project Forge v4.68.46

## Portable runtime engine authority repair

Managed projects now resolve SkillContract and verifier authority from the installed Project Forge
engine instead of treating their own copied runtime folder as the engine root. The resolver prefers an
explicit host-owned `FORGE_ENGINE_ROOT`, then the standard sibling `project-forge` installation, and
accepts an external module root or the canonical `project-forge` checkout.

This fixes phase Task creation in ordinary Codex App chats such as `CardGameRoblox`, where
`phase-state.mjs` previously failed with `SKILL_CONTRACT_VERIFIER_REGISTRY_MISSING` because it searched
for `mcp-server/verifiers.json` inside the game. The trusted registry remains engine-only and is not
added to the managed sync payload.

The verifier registry lookup and SkillContract Task creation use installed-engine resolution, while
explicit registry paths are compared against the real trusted file. Regression coverage executes a
copied managed runtime with no environment override and proves sibling fallback creates a durable
Phase 1 Task. Full verifier-node contract revalidation is completed in v4.68.47.
