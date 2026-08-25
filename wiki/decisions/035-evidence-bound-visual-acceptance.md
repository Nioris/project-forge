# ADR-035 — Evidence-bound visual acceptance

**Status:** accepted  
**Date:** 2026-08-25

## Context

Card Chaos was marked `Phase 4 complete` after DOM/runtime assertions and three screenshots, although
the already-recorded visual audit scored important screens 3–5/10. The central contract accepted any
256 bytes of CSS as “visual integration”; screenshot existence and `errors: []` were mistaken for
pixel-level quality.

## Decision

Phase 4 completion requires three independent enforcement layers:

1. Phase 2 shows the complete state/transition inventory at a dedicated user STOP and binds that approval
   to its deterministic hash. Phase 4 first generates state-specific mobile/desktop blueprints conditioned
   on the approved master PNG, then captures every state. Direct batch generation proves the reference
   request through `/v1/images/edits` + request ID; native generation remains a trusted-host attestation.
2. The Stop hook blocks an affirmative completion claim unless the durable marker and visual gate pass.
3. The `phase4-visual-evidence` verifier binds a `screens-shoot.mjs` capture manifest to actual PNG
   dimensions/hashes, strict PNG structure, screen-target/style/report hashes, all render-affecting input
   freshness, runtime state-transition proof, complete Phase 2 inventory coverage and a different reviewer
   session. Engine-adjacent HMAC receipts outside the project make later capture/review evidence edits
   detectable. Every frame receives
   five scores and concrete critique; any score below 6/10 or open Critical/Major defect rejects completion.
4. A native Godot route replaces browser capture with a production-inert runtime adapter, isolated
   rendered state capture and a deterministic MovieWriter proof. It binds capture + proof + current
   implementation snapshots, validates each MJPEG frame and final `idx1`, requires motion in both the
   AVI and one lossless sample per second, and rejects browser/test-harness substitution. The independent
   reviewer must watch the whole proof and bind every sample in timeline order.

Every key screen-flow state maps to its own GPT Image mobile/desktop visual blueprint through
`assets/target/screens/manifest.json`; a secondary state may explicitly inherit an approved archetype.
CSS, DOM assertions, console cleanliness and builder self-review remain useful diagnostics but are not
visual acceptance. Any implementation/style change after capture invalidates the evidence and requires
new screenshots and a new independent review. The canonical binding helper resets verdicts, scores,
critique and reviewer identity when capture, targets, style bible or native proof changes; it cannot
silently attach an old judgment to new pixels.

## Consequences

- Phase 4 cannot be closed by prose or presence-only media checks.
- Weak hosts may need a separate clean reviewer call/session before completion.
- Implementations expose `window.__FORGE_VISUAL_QA__` only under the local QA query so capture proves
  each requested state rather than guessing navigation from button text.
- Visual quality remains a semantic judgment, but the runtime now proves that the judgment covered the
  exact current pixels, every required viewport/state and an independently identified review session.
- A process with full access to the trusted engine and secret store remains inside the host trust boundary;
  receipts detect later project-local evidence edits, but they are not an external authorization service.
- Synthetic fixtures exercise policy failures but never constitute real-engine evidence; native readiness
  also requires a separate forward-test with an actual non-headless Godot renderer.
