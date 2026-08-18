# Project Forge v4.68.22 — immutable release build versions

Every Yandex build now creates a new version instead of overwriting an existing three-ZIP release.

- `build-yandex-3zips.mjs` scans existing production archives and automatically increments the latest numeric version.
- Omitting a version selects the next version; explicitly requesting the current or an older version also auto-bumps to the next version.
- A genuinely newer explicit version remains supported.
- Existing ZIP paths are immutable: the builder refuses to unlink or overwrite them.
- Both `WorkProgress/<project>-yandex/` and `WorkProgress/<project>/` are supported as canonical sources.
- Every successful build prints `BUILD_VERSION: v...` and appends the three artifacts to `Release/<project>/yandex/build-history.json`.
- The GigaChat Phase 8 gate requires three newly named production/debug/marketing ZIPs of one version newer than the pre-phase baseline.
- Rewriting the same three filenames no longer satisfies fresh-release evidence.

Verified with builder version-selection self-tests, GigaChat Phase 8 baseline/trio regression tests, syntax checks, drift checks, and the managed-fleet updater audit.
