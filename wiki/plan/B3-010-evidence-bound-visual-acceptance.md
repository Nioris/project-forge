---
id: B3-010
title: Evidence-bound Phase 4 visual acceptance
status: complete
started: 2026-08-25
deps: [B3-009]
files:
  - .claude/skills/status/references/phase-4-visual-evidence.mjs
  - .claude/skills/status/references/phase-completion-gate.mjs
  - scripts/screens-shoot.mjs
  - scripts/screen-targets.mjs
  - scripts/bind-phase4-visual-evidence.mjs
  - scripts/record-phase4-visual-review.mjs
  - scripts/record-image-provenance.mjs
  - scripts/check-phase4-visual-evidence.mjs
  - .claude/skills/status/references/screen-flow-contract.mjs
  - .claude/skills/status/references/png-integrity.mjs
  - .claude/skills/status/references/visual-receipts.mjs
  - .claude/hooks/phase-visual-claim-gate.mjs
  - RELEASE_NOTES_v4.68.51.md
---

# B3-010 — Evidence-bound Phase 4 visual acceptance

## What

Replace presence-only Phase 4 checks with a capture/review contract bound to current pixels. Every
declared state must have real mobile 412px and desktop screenshots, hashes, dimensions, complete
coverage and an independent per-frame visual review against a screen-specific target/style bible.

## Why

Card Chaos was formally completed even though its own earlier visual audit scored core screens 3–5/10.
The completion gate accepted CSS as integration and treated runtime cleanliness as visual quality.

## Acceptance criteria

- [x] CSS-only and screenshot-presence-only Phase 4 completion are rejected.
- [x] `screens-shoot.mjs` emits hashes, native dimensions, state coverage, overflow and browser errors.
- [x] Every state has mobile 412px + desktop evidence and a per-frame five-axis critique.
- [x] Every state maps to a dedicated or explicitly inherited GPT Image mobile/desktop blueprint.
- [x] Phase 2 owns the complete machine-readable screen inventory; Phase 4 cannot shrink it.
- [x] Runtime adapter proves every requested state transition; identical state frames are rejected.
- [x] Dedicated blueprints bind prompt pack, master target, provider/model and output hashes.
- [x] Builder session cannot be its own acceptance reviewer.
- [x] Engine-adjacent HMAC receipts detect later project-local capture/review evidence edits (full-shell host remains trusted).
- [x] Full PNG chunks/CRC/IDAT and realpath containment reject fabricated files and symlink escapes.
- [x] Any score below 6/10 or open Critical/Major defect blocks completion.
- [x] UI, production asset, data, font, style, flow or target changes after capture make screenshots stale.
- [x] Stop hook prevents an unsupported “Phase 4 complete” claim.
- [x] GigaChat and the central phase-state runtime use the same visual validator.
- [x] Regression reproduces and rejects the Card Chaos false-acceptance class.
- [x] Full Forge suite, immutable package, installed sync and real Card Chaos reopen pass.
