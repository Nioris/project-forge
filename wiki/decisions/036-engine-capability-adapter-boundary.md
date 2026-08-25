# ADR-036 — Engine-neutral phases, capability-specific adapters

**Status:** Accepted
**Date:** 2026-08-25

## Context

Q3-004..Q3-007 implement native verification and release for Godot. Naming the scripts after Godot
can make the whole Forge architecture look engine-specific even though the product must later support
other game engines without duplicating its nine phases.

## Decision

The nine phase contracts, STOP-points, durable state, evidence outcome and release semantics remain
engine-neutral. `adapters/engine-profiles.json` maps only the required capabilities:

- construct verifier;
- visual capture and motion proof;
- technical verifier;
- scripted playtest;
- release exporter.

Each engine supplies its own trusted implementation for those capabilities. Web stays the stable
browser/Yandex profile. Godot GDScript is the first complete native profile. Unity, Defold or another
engine becomes supported only after it supplies equivalent construct/capture/tech/playtest/export
adapters and adversarial plus real-engine forward-tests. A missing capability always fails closed;
evidence from another engine is never accepted as a fallback.

Native release manifests do not attest themselves. A release adapter must publish an immutable version
and bind it to an engine-owned signed receipt outside the project before its independent verifier may
return PASS.

## Consequences

- Adding another engine does not rewrite Phases 1–9 or their human decisions.
- Runtime-specific code remains explicit and testable instead of pretending that one universal
  browser/headless check proves every engine.
- Godot C#, Android and signed Windows binaries remain honest follow-up lanes rather than implicit
  support.
- The current Q3-007 implementation is useful beyond Godot as the reference contract for future
  native profiles.
