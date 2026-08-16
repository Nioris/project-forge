# Project Forge v4.67.1 — canonical 9-phase status

## Why this maintenance release exists

A real `$status` run on an existing game correctly found the Phase 1 STOP-point, but displayed the retired 0..6 pseudo-pipeline where art/mobile/SDK/localization were presented like independent phases. That model no longer matches Forge 4.67: the canonical workflow is 9 phases and AI Studio is embedded inside them.

## New status model

`/status` now reports:

- all 9 canonical phases;
- exactly one current phase / STOP-point;
- AI Studio state appropriate to the current phase;
- Project Health as a separate lane (mobile, SDK, localization, debug checker, builds, QA);
- `not_reached` for future work instead of treating absence as a defect;
- contradictions when downstream evidence exists ahead of an earlier unresolved gate.

The read-only helper is:

```text
.claude/skills/status/references/project-status.mjs
```

It performs only filesystem/code-signature inspection. It never runs browser tests, release gates, network calls or the game itself.

## Machine phase markers

Each phase now records progress in:

```text
wiki/phases/phase-1.json
...
wiki/phases/phase-9.json
```

using:

```text
node .claude/skills/status/references/phase-state.mjs start N
node .claude/skills/status/references/phase-state.mjs block N "reason"
node .claude/skills/status/references/phase-state.mjs complete N [evidence...]
```

Markers do not replace evidence or approvals. They only make phase progression machine-readable.

## State ownership fix

New project `CLAUDE.md` files no longer contain mutable state such as `Just created`. `CLAUDE.md` is stable project description/rules; mutable state goes to `wiki/_current.md` and `wiki/phases/`.

Existing projects are not rewritten automatically. `/status` explicitly ignores stale mutable text in their project `CLAUDE.md` and trusts phase markers/artifacts instead.

## Regression gate

```text
node scripts/check-status-phase-model.mjs
```

covers:

- fresh project stays in Phase 1 despite pre-created brief/draft Style Bible;
- Phase 1 artifacts advance legacy inference to Phase 2;
- explicit blocked marker carries STOP reason;
- stale `Just created` CLAUDE text cannot roll progress backward;
- downstream SDK evidence cannot skip a missing early gate;
- phase-state start/block writes valid markers.
