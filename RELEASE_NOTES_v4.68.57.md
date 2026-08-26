# Project Forge v4.68.57

## Restart-safe local checkpoints and verified private publication

Codex edits only the selected project workspace; the parent Forge pipeline owns Git metadata. Before
each phase it preserves pending work locally, and after the executable completion gate it records the
phase checkpoint in ignored atomic `.forge/git-checkpoints.json` state.

On restart Forge reconciles missing, pending or failed checkpoints before MCP probing, Task binding,
questions or model access. Phases 1–7 remain local-only. Phase 8 and Phase 9 fail closed unless the
configured private GitHub repository and successful push are confirmed. Corrupt or forged release
ledger state cannot advance the pipeline.

One PID-owned operation lease covers phase checkpoints, the manual CLI and every exported checkpoint
entrypoint for the full commit/push interval. Git errors are bounded and redact credentials before they
reach the ledger, diagnostics or terminal.

## Immutable packaging guard

`package-forge.mjs --help` now prints usage and exits without reading the manifest or creating a ZIP.
Unknown options and ambiguous output paths fail before packaging. An offline regression supplies a fresh
output path and proves that informational and invalid invocations cannot consume a release version.

v4.68.55 and v4.68.56 are preserved as immutable rejected candidates. Neither was published or installed.
