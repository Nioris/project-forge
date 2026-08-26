# Project Forge v4.68.54

## Codex phases receive a safe, explicit project write boundary

The one-window Codex pipeline now starts each fresh phase session with `workspace-write` instead of
inheriting an ambient read-only or broader host mode. Non-interactive runs use `approval_policy=never`,
while full-filesystem access, approval bypass and hook-trust bypass remain disabled. A STOP resume keeps
the policy of the original session rather than trying to widen it.

The durable phase-state command now lists every supported resume policy and rejects unknown values before
it can change a marker. Regression coverage proves both behaviours and preserves fail-closed handling for
real infrastructure failures.

This is the corrective runtime release discovered by Q3-009 Godot pilot Run 01. The same pilot must be
reopened and pass the canonical phase gates before Q3-009 itself can be marked complete.

The v4.68.53 ZIP was rejected before publication and installation because its Russian README still linked
to stale release notes. The immutable artifact was preserved rather than overwritten; v4.68.54 contains
the corrected documentation surface.
