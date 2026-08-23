# Project Forge v4.68.43

## Verifier-Driven Repair Runtime

Change Tasks can now execute a declared set of deterministic Forge checks directly from the durable
workflow graph. A completed implementation entering a verifier node is checked automatically; PASS
reaches `done`, a deterministic FAIL returns to the bounded `repair` node with normalized file/rule
evidence, and timeout/dependency failures stop as infrastructure problems instead of consuming repair
attempts.

Only read-only project checks explicitly enabled by the installed engine registry may run. Project-local
or model-authored registries are not trusted, verifier targets remain inside the project, output and issue
counts are bounded, and concurrent execution is protected by an ownership token. An abandoned stale lock
stops safely for operator inspection rather than being stolen through a racy filesystem operation.

The host-neutral `forge-workflow result` path dispatches verifier nodes without a second command. GigaChat
direct gacha work derives its verifier plan only from an exact successful canonical command in its durable
ledger, preserves the separate modularization prerequisite, re-runs the registered browser check, and routes
failure back to the shared repair budget.

This release implements the verifier/repair runtime layer proposed for Stage C. It does not change the nine
canonical phases, and Task scope declarations still do not replace host sandboxing or future file leases.
