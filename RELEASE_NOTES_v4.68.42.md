# Project Forge v4.68.42

## Durable Execution Graph

Forge now has strict host-neutral `Task`, `RunResult`, `FailureType`, and workflow contracts on top
of the canonical nine phases. Five declarative graphs cover phase execution, direct changes,
reviews, diagnostics, and releases without introducing another global progression model.

Durable Task state is stored locally under `.forge/runs/` with atomic writes, transition locks,
restart recovery, bounded repair/provider retries, and automatic Git exclusion. `/status` can show
the active Task while phase progression remains controlled only by phase markers and executable
completion contracts.

Codex phase turns now use exact attempt correlation and structured STOP ownership. User decisions,
agent-repair failures, and infrastructure blockers follow different deterministic paths; a restored
user STOP is shown before a new model process starts. Natural-language question detection remains
only a visible compatibility fallback. A supplemental completed RunResult cannot advance a phase.

GigaChat direct tasks persist the exact request before graph creation, recover an orphaned matching
Task after restart, record verified completion through the shared change graph, and route confirmed
verification failures back to bounded repair.
