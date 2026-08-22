# Project Forge v4.68.23 — safe GigaChat large-file integration

Direct GigaChat tasks can no longer destroy an existing large game while trying to add a feature after context compaction.

- `read_file` automatically advances through 300-line pages during a direct task and persists each file cursor across compaction.
- Reading past the end is rejected with a deterministic instruction to use `search_text` and targeted `replace_text` edits.
- Existing files of 32 KB or more cannot be reconstructed with `write_file` during a targeted integration unless the user explicitly requested a full rebuild.
- Suspicious shrinkage of existing medium-size files is blocked before disk mutation.
- Only one full `write_file` replacement per path is allowed in a direct task; rereading no longer permits another reconstruction.
- Durable compaction checkpoints carry only bounded recent operations and read cursors, not the repeated raw read history.
- A direct turn stops safely after 12 consecutive file reads without implementation progress or after four context compactions.
- Reissuing an explicit `/do` starts a clean retry instead of inheriting failed-task operations and cursors.
- Blocked destructive writes and loop stops are recorded in the Forge behavior diagnostics ledger.

Verified with syntax checks, the complete deterministic GigaChat adapter self-test suite, drift/API/Codex compatibility checks, and managed-fleet synchronization.
