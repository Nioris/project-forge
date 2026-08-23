# Project Forge v4.68.47

## Complete portable contract authority

This follow-up completes the managed-runtime repair begun in v4.68.46. Task creation already used the
trusted sibling engine, but the verifier node could re-read its SkillContract through the copied module
root inside the game. Verifier revalidation now uses the same resolved engine root as the registry, and
all SkillContract inspection resolves its source, completion contract and verifier metadata through
installed engine authority.

The resolver also closes two project-local promotion paths. A managed project cannot become engine
authority merely by being named `project-forge`, and `FORGE_ENGINE_ROOT` cannot point back inside that
managed project. Path identity remains realpath-based and case folding is Windows-only.

The portable regression now runs a deliberately tampered local Phase 1 contract, creates the durable
phase STOP through a sibling engine, then runs a tampered local `gacha-meta` contract through the full
`implement → verify → done` transition with a trusted registry. Isolated self-named and self-overridden
fake engines must fail closed.
