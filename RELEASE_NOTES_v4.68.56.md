# Project Forge v4.68.56 — rejected immutable candidate

This ZIP was never published or installed. An informational `package-forge.mjs --help` invocation
unexpectedly created the complete archive, so the immutable version number could no longer be reused.
Final review also found that the manual checkpoint entrypoint did not share the phase runner's full
commit/push lease. The archive is preserved for audit only (SHA-256
`65F01A222EA15E4B82073858FD1A7A91F69FCF4D19845B58ED79D2E7100F0BCC`).

## Restart-safe local checkpoints and verified private release publication

Codex continues to edit only inside the selected project workspace, while the parent Forge pipeline owns
Git metadata. Before each phase it preserves pending work locally; after a phase passes its executable
contract and cost report, it creates the completion checkpoint. Nested model sessions no longer need
permission to write `.git/index.lock`.

Checkpoint results now live in the ignored atomic `.forge/git-checkpoints.json` ledger. A crash or failed
Git operation cannot be forgotten: on restart Forge reconciles every completed phase before probing MCP,
binding the next Task, asking the user or launching another model. Explicit failed or pending checkpoints
also hold project status and direct next-phase commands at the unfinished boundary.

Phases 1–7 create local commits only. Phase 8 and Phase 9 fail closed unless a push to the configured
private GitHub repository is confirmed. A completed remote checkpoint is invalid unless both the private
remote identity and successful push are recorded. Ledger writes are atomic and locked; the ledger, lock,
Task runs and cost reports remain outside project history. A PID-owned lease covers the entire checkpoint,
including commit and push, so parallel pipeline launches cannot publish concurrently.

Git/GitHub errors are bounded and scrubbed before they enter diagnostics or terminal output. Regression
coverage proves early-phase local failures, restart reconciliation even with `--from 9`, corrupt-ledger
handling, strict Phase 8 publication, late Git initialization and secret redaction.

These changes were carried forward and completed in v4.68.57. v4.68.55 also remains preserved as an
immutable rejected candidate; neither candidate was published or installed.
