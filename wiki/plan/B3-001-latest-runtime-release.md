---
id: B3-001
title: Runtime-test selects the newest release archive
status: done
started: 2026-08-23
deps: []
files:
  - scripts/runtime-test.mjs
  - scripts/lib/release-zip-selection.mjs
  - scripts/check-runtime-release-selection.mjs
  - scripts/check-drift.mjs
  - scripts/bump-version.mjs
  - scripts/gigachat-agent.mjs
  - scripts/generate-manifest.mjs
  - MANIFEST.txt
  - .claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - CLAUDE.md
  - AGENTS.md
  - AGENTS.project.md
  - README.md
  - README_RU.md
  - GUIDE.md
  - FORGE.md
  - setup.ps1
  - setup.sh
  - dashboard.html
  - СПРАВОЧНИК-КОМАНД.md
  - RELEASE_NOTES_v4.68.40.md
  - docs/CHANGELOG.md
  - wiki/_current.md
  - wiki/_map.md
  - wiki/plan/B3-001-latest-runtime-release.md
---

# B3-001 — Runtime-test selects the newest release archive

## What

Make release runtime testing deterministic: for the requested production,
debug, or marketing variant, select the archive with the highest numeric
version instead of the first directory entry. Ship the fix as Forge v4.68.40.

## Why

The Ox Alpha experiment produced v0.2.1, but `runtime-test.mjs` silently opened
v0.2.0 because filesystem enumeration order was treated as release order. That
can validate stale code and create a false release result.

## Acceptance criteria

- [x] Production, debug, and marketing selection is variant-exact and chooses the highest numeric version.
- [x] Regression covers unsorted files and numeric ordering such as v1.10.0 over v1.9.9.
- [x] The regression is part of the normal Forge drift audit and the helper is included in MANIFEST/package output.
- [x] Forge version surfaces and release documentation are updated to v4.68.40.
- [x] Required validators and packaging verification pass.
- [x] v4.68.40 is installed into ProjectForgeUniversal, committed, pushed, and merged into main.

## Notes

Observed diagnostic: `RUNTIME_TEST_RELEASE_VARIANT_SELECTS_OLDEST`, fingerprint
`77933c008f42c9452ab8`.
