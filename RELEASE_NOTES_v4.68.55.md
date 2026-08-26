# Project Forge v4.68.55

> Rejected immutable candidate. This ZIP was built but was not published or installed. Final review found
> that a failed required Phase 8 push was not durable across restart, so a later run could advance to
> Phase 9 without retrying publication. v4.68.56 was also rejected before publication; the completed
> correction is v4.68.57.

## Git checkpoints move from the model sandbox to the pipeline host

Codex still edits only inside the selected project workspace, but the parent Forge process now owns Git
metadata. It creates a local checkpoint for pending work before a phase and another checkpoint after a
durably completed phase and its cost report. The nested phase runtime no longer attempts the duplicate
`.git/index.lock` write during pipeline execution.

Phases 1–7 remain local-first and do not contact GitHub. Phase 8 and later verify that the configured
repository is private and require the final push to succeed. Local checkpoint failures stopped the current
process, but this candidate did not preserve that failure in a restart-safe checkpoint ledger. That
omission is why v4.68.55 was rejected before publication.

Late repository initialization also installs local exclusions before staging, so durable `.forge/runs/`
state and local cost/diagnostic reports cannot leak into project history.

This repair was discovered by Q3-009 Godot pilot Run 02 after the real Phase 1 evidence gate passed.
