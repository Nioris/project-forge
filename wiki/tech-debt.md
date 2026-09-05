---
tags: [tech-debt]
---

# Technical Debt

> Known issues, shortcuts, and TODOs in Forge.
> Mark as resolved when fixed. Never delete — cross out with ~~strikethrough~~.

## Critical (blocks features or causes bugs)

Current audit (2026-09-05): see `docs/FORGE-QUALITY-AUDIT-2026-09-05.md`. Historical items below are not
proof that current runtime/game quality has no defects.

- [ ] **GDD feature-to-test traceability** — bind approved feature IDs to code/runtime acceptance;
  smoke and document length alone do not prove the entire intended game exists.
- [ ] **Godot full player route** — require win/loss/retry/progression/persistence, beyond native smoke.
- [ ] **Normal-launch / QA-capture parity** — prove normal controls reach the same layout/content as
  forced-state art capture; add production-entry evidence for the key route.
- [ ] **Circuit Courier target freshness** — v1.1.2 receipts are stale after v1.1.3 signing/export changes.
  Rebuild/reverify one coherent matrix without rekeying the production identity.

## Should fix (quality/performance impact)

- [ ] **wiki-audit hook strict mtime** — current `wiki-audit.mjs` does strict mtime comparison. If wiki files mtime is even 1 second behind session log, blocks `/stop` with "wiki out of sync". Spiral Vigil session showed real example — Claude had to do `touch -d "+5 minutes"` workaround.
  Added: 2026-04-27 | Related: [[plan/v4.8-roadmap]] item 7
  Fix: ±2 second tolerance, or compare to git log changes since session start

- [ ] **Advisor catalog needs automated check** — 5+ occurrences of skills disappearing from advisor catalog after rewrites/edits. Each time caught manually via grep. Should be `scripts/check-cross-refs.mjs`.
  Added: 2026-04-26 (recognized after v4.7.5 lost 4 skills) | Related: [[plan/v4.8-roadmap]] item 4

- [ ] **No visual regression for dashboard** — v4.7.4 had z-index regression where edit button was hidden under cover image. Caught by user, not automation. Headless screenshot diff would have caught it.
  Added: 2026-04-25 | Related: [[plan/v4.8-roadmap]] item 8

- [ ] **`.bat` non-ASCII inside `()` blocks** — fix exists in `sync.bat` and `open-all.bat` (v4.7.1) but no gate against regression. If someone edits a .bat and accidentally pastes em-dash, build won't catch it.
  Added: 2026-04-24 | Related: [[plan/v4.8-roadmap]] item 3

- [ ] **Validators only check string presence, not semantics** — e.g. `check-platform-completeness.mjs` checks "release-yandex skill mentions vkplay" — but it could be the wrong context. False negative if string appears in unrelated way.
  Added: 2026-04-26 | Related: [[decisions/006-platform-completeness-check]]

## Nice to have (cleanup, consistency)

- [ ] **CLAUDE.md contains both invariants and changelog** — currently mixes permanent rules with version history. Rotation pushes both to docs/CHANGELOG.md eventually. Should separate: `## Architectural Invariants` permanent, `## Recent Changelog` rotates.
  Added: 2026-04-27 | Related: [[plan/v4.8-roadmap]] item 2

- [ ] **Skills not categorized tactical vs architectural** — informal categorization in my head, not in frontmatter.
  Added: 2026-04-27 | Related: [[plan/v4.8-roadmap]] item 5, [[decisions/010-architectural-vs-tactical-skills]]

- [ ] **Architectural skills missing** — only `/i18n-foundation` exists for now. Others planned: `/save-system`, `/error-boundary`, `/event-bus`, etc. Need to write before [[plan/v4.8-roadmap]] item 6 can be implemented.
  Added: 2026-04-27 | Blocks v4.8 item 6

- [ ] **No platform-adapter pattern enforcement** — Spiral Vigil analysis showed projects can grow TG-only architecture without abstraction. By the time someone adds Yandex/RuStore tracks, refactor cost is high. Could be architectural skill `/platform-adapter`.
  Added: 2026-04-27 | Maybe v4.8 item 11 (not yet in roadmap)

- [ ] **Steam validator regex generalization** — v4.7.7 fix for aliased ESM imports in `electron-init.mjs` should be extracted to shared lib `platforms/_shared/_lib/imports.mjs`. Same pattern likely affects vkplay/yandex SDK init validators.
  Added: 2026-04-26 | Related: [[plan/v4.8-roadmap]] item 9

- [ ] **Dashboard localStorage migration not tested** — `migrateProjectPaths()` planned for v4.8 but UI migrations between dashboard versions could break in unforeseen ways. No test coverage.
  Added: 2026-04-25 | Related: lesson #21 (localStorage between versions)

- [ ] **Session log file format informal** — `wiki/sessions/YYYY/MM/DD.md` written by `post-tool-capture.mjs`. Format is loose markdown. Should have schema for easier parsing.
  Added: ongoing tech debt | Low priority

## Resolved

- [x] ~~**Workspace discipline not enforced**~~ — Resolved 2026-04-27 (v4.7.7) via 3-layer enforcement (skill text + hook + verifier). [[decisions/009-workspace-discipline-three-layers]]

- [x] ~~**No i18n foundation**~~ — Resolved 2026-04-27 (v4.7.6). `/i18n-foundation` skill + `scripts/check-inline-strings.mjs`. [[decisions/007-i18n-runtime-default]]

- [x] ~~**Advisor not aware of project context**~~ — Resolved 2026-04-26 (v4.7.5). Reads wiki/ before formulating. [[decisions/008-context-aware-advisor]]

- [x] ~~**Dashboard cover image hiding edit button**~~ — Resolved 2026-04-25 (v4.7.4). z-index: 5 + dark pill bg.

- [x] ~~**Status sort broken (0 is falsy in JS)**~~ — Resolved 2026-04-25 (v4.7.3). `!== undefined` check instead of `||` fallback.

- [x] ~~**Dashboard path can include /project-forge/ segment**~~ — Resolved 2026-04-25 (v4.7.2). 3 layers of path sanitization.

- [x] ~~**`scripts\sync.bat` crashes with `". was unexpected"`**~~ — Resolved 2026-04-24 (v4.7.1). Pure ASCII inside `()` blocks.

- [x] ~~**No automated platform completeness check**~~ — Resolved 2026-04-24 (v4.7.0). `scripts/check-platform-completeness.mjs`. [[decisions/006-platform-completeness-check]]

- [x] ~~**setup.ps1 fails on Windows PS 5.1 with Cyrillic**~~ — Resolved 2026-04-22 (v4.6.2). UTF-8 BOM. [[decisions/004-encoding-rules]]

- [x] ~~**sync ignores Forge if not named Project-forge**~~ — Resolved 2026-04-22 (v4.6.1). Path equality detection. [[decisions/003-template-by-path-equality]]

- [x] ~~**`/start` produces generic decisions ignoring competitive landscape**~~ — Resolved 2026-04-21 (v4.6.0). Mandatory Phase 0a research-references. [[decisions/005-auto-research-phase0]]
