# Project Forge v4.68.77

## Yandex Games Debug Checker v2.24

- The requirements baseline is updated to 18 August 2026.
- Explicit third-party login providers now fail the authorization check; ambiguous custom OAuth endpoints warn for manual review.
- `auth.openAuthDialog()` must be visibly tied to a click/tap, and the login offer must explain its player benefit.
- Audio checks now require a real pause/mute path for `visibilitychange` and `blur`/`pagehide`; event-name tokens alone no longer pass.
- WASD through layout-dependent `event.key` or legacy `keyCode` warns even when unrelated `event.code` code exists elsewhere.
- Destructive orientation handlers warn when no save/restore path is visible, and canvas checks require an active resize plus rotation/fullscreen response.
- Nineteen focused contract regressions cover broken and correct integrations, including the former token-presence false positives.

The checker intentionally does not claim what static source inspection cannot prove: exact save → rotate/reload → restore equality, real-device layout, guest-flow completeness, or monetization state in the Yandex Console remain explicit manual gates.
