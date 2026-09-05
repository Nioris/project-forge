---
name: debugcheck-enhance
kind: tactical
description: "Maintain the shipped Yandex debug checker, reproduce false verdicts, and verify runtime evidence. Use for debugcheck defects, misleading PASS, timing, input, audio and viewport…"
---

# Maintain the Yandex debug checker

The shipped checker already contains static checks and live timing, input, ad, overflow and language
probes. Read its current implementation before changing it; do not reinstall historical snippets.

## Ownership

- Canonical overlay: `platforms/yandex/templates/debugcheck.js`.
- Canonical standalone page: `platforms/yandex/templates/debugcheck.html`.
- Exact distribution mirrors: `templates/html5/debugcheck.js` and `templates/html5/debugcheck.html`.
- Edit the engine source, then synchronize the mirrors. Never patch a game's injected checker.
- Preserve `DEBUGCHECK_SELF_START/END`, escaped script-closing tags, activation (Ctrl+Shift+2 three
  times), probe loading order and existing UI behavior.
- Install the overlay in the debug build's head after the SDK and before game scripts. The production
  artifact must omit development tooling.
- Check runtime SDK interception at creation and the existing bounded wrapper fallback. Do not introduce
  duplicate timers, a late one-second patch, or a second timeline implementation.

## Reproduce before changing

1. Read the affected `CATS` check, source collector and corresponding runtime probe.
2. Read `wiki/requirements-coverage.md` and the applicable current platform reference. A numerical
   recommendation is not a platform requirement. When a requirement is uncertain, verify it in official
   documentation rather than inserting an arbitrary timing/size threshold.
3. Add a small positive and negative example to `scripts/check-debugcheck-fixtures.mjs`. Both overlay
   and standalone HTML must produce the expected result.
4. Include the adversarial form: an unrelated event handler, commented code, quoted example, empty
   callback, stale source, wrong state or an otherwise valid optional-feature-free game.
5. For runtime issues, reproduce the observable behavior in a local browser fixture. A static signature
   does not prove that a button works, that audio stopped or that progress survived rotation.

## Verdict discipline

- PASS requires the specific fact the check claims to verify. A screenshot is not a gameplay action;
  an event-name token is not a connected handler.
- Use WARN when source inspection cannot resolve engine abstractions, dynamic imports or conditional
  behavior. Keep the required manual/runtime confirmation visible.
- FAIL should identify a concrete violation or missing mandatory runtime evidence, not an unrecognized
  naming convention.
- Scope event checks to the actual registration/assignment. Never infer its behavior from the next
  arbitrary 800–1000 source characters or from a different handler.
- Ignore comments and quoted explanations when identifying executable actions. Retain them only in
  checks explicitly concerned with visible player copy or provenance.
- Runtime probes must report unobserved events as unobserved. No magic delay around `ready()`, no
  checker-specific gameplay branch and no hardcoded wait to turn an indicator green.
- Preserve optional feature behavior, approved languages and screen orientations. Do not require
  thirteen translations, purchases, portrait-only rendering or a guessed content quota.
- Progress round trips require known game state and real actions. Canvas pixels, SDK method presence
  and an editable success report do not substitute for that evidence.
- Inspect canvas-drawn controls and text visually; DOM measurements alone cannot certify them.

## Validation and delivery

Run:
```text
node scripts/check-debugcheck-fixtures.mjs
node scripts/check-drift.mjs
node scripts/check-codex-compat.mjs
```

Also run the relevant local browser regression for runtime changes. Record the actual observed result,
including any scope still requiring manual inspection. Update coverage/checklist, checker version and
Forge release notes. Regenerate Codex skill mirrors; package and install through the normal Forge
release workflow. Never call an installed fix verified solely because a worker said it passed.
