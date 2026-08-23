---
id: B3-008
title: Unicode-aware Phase 1 evidence gate
status: done
started: 2026-08-23
deps: [B3-007]
files:
  - .claude/skills/status/references/phase-completion-gate.mjs
  - scripts/check-phase-completion-gate.mjs
  - RELEASE_NOTES_v4.68.48.md
  - RELEASE_NOTES_v4.68.49.md
---

# B3-008 — Unicode-aware Phase 1 evidence gate

## What

Remove the accidental English-only requirement from Phase 1 KPI hypotheses. JavaScript `\b` and
`\w` use ASCII word semantics, so Russian labels and research terms were invisible to several evidence
checks. Use Unicode letter/mark/number boundaries and explicit Russian inflection handling instead.

## Acceptance criteria

- [x] `гипотеза`, `гипотезы` and `предположение` authorize a numeric KPI hypothesis.
- [x] A label embedded inside a larger Cyrillic word does not authorize the claim.
- [x] Unsupported numeric KPI claims are rejected in Russian and English.
- [x] Inflected Russian competitor, market and platform claims require evidence.
- [x] Russian no-evidence statements remain valid and positive confirmations cannot hide behind a
      hypothesis/TBD label.
- [x] Internal Retention/research headings are not misclassified as standalone external facts.
- [x] The canonical regression, installed-project reproduction and immutable v4.68.49 package pass.

## Release verification

The phase-completion regression exercises both accepted and rejected Cyrillic wording alongside the
existing English cases. The original CardGame evidence is then revalidated with only the Russian
`гипотеза` label after installing the new engine; the diagnostic is resolved only after that real gate
passes.

The immutable v4.68.48 build introduced the Unicode checks. Real-project revalidation then exposed an
over-broad line-level `retention` classification, so the complete repair ships as v4.68.49 rather than
overwriting v4.68.48.
