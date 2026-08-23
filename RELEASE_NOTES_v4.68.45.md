# Project Forge v4.68.45

## Host-enforced native Task write scope

Forge now turns durable Task write scope into an executable host decision for supported native file
tools. The Codex one-window pipeline binds the exact phase Task before the model receives tools, and
its PreToolUse hook rejects `Edit`, `Write` or `apply_patch` targets outside the live SkillContract
scope. Missing Task authority, contract drift, terminal Tasks and unknown write targets fail closed
only in explicitly guarded sessions, preserving manual legacy compatibility.

GigaChat uses the same authority before text replacement, file copy, portable filesystem actions and
generated image/3D output plus provenance. While a Task is active, project-local or unclassified
raw shell execution is blocked fail-closed; trusted lifecycle actions, registered read-only verifiers and the small
set of mapped canonical mutators must prove all known output roots fit the Task scope first.

Path checks combine lexical containment with the real path of the nearest existing parent, preventing
a junction or symlink inside an allowed directory from escaping the project. Denials are recorded in
the existing local, secret-redacted Forge diagnostics so fleet audits can reveal repeated adapter or
contract problems.

This release is a native host-tool boundary, not an operating-system sandbox. Arbitrary Codex shell
code and whole-project external CLIs require the planned disposable task-worktree and host-accepted
diff layer before Forge can claim complete write isolation for the real project.

The regression suite covers mixed allowed/escaped targets, junction escapes, stale contracts, terminal
Tasks, untrusted project-local verifier shadows, raw GigaChat shell escapes and every mapped output of
`local-stage`. An authenticated isolated `gpt-5.6-sol` smoke also proved that a permitted patch succeeds,
while a mixed permitted/forbidden patch is denied as one operation and both of its files remain unchanged.
