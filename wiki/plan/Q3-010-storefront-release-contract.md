---
id: Q3-010
title: Storefront-aware release contract
status: in_progress
started: "2026-08-30"
deps: [Q3-009]
files:
  - adapters/platform-profiles.json
  - schemas/platform-profile.schema.json
  - schemas/forge-targets.schema.json
  - scripts/platform-profile.mjs
  - scripts/check-platform-profile.mjs
  - scripts/new-project.mjs
  - scripts/build-all-platforms.mjs
  - scripts/check-platform-completeness.mjs
  - .claude/skills/status/references/project-targets.mjs
  - .claude/skills/status/references/phase-completion-gate.mjs
  - .claude/skills/status/references/phase-contracts/phase-8.json
  - .claude/skills/phase-8-release/SKILL.md
  - dashboard.html
  - wiki/plan/Q3-010-storefront-release-contract.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-010 — Storefront-aware release contract

## What

Сделать выбранную витрину машинным контрактом проекта. Движок отвечает за исходный экспорт,
а профиль витрины — за допустимый формат, SDK/инициализацию, развёртывание, подпись и внешние
предпосылки. Windows ZIP больше не может закрыть релиз для Яндекс Игр или Android-магазина.

## Target set

- Primary: Yandex Games, VK Mini Apps, Telegram Mini Apps, RuStore, Google Play, AppGallery,
  VK Play and Steam.
- Evaluation: CrazyGames and TapTap mobile.
- Artifact families: hosted/browser Web, signed Android package and Windows distribution.

## Acceptance criteria

- [x] `forge.targets.json` persists one or more known storefronts; absence is never guessed at Phase 8.
- [x] The installed registry distinguishes artifact family, delivery form, integration and external prerequisites.
- [x] Project creation and Dashboard expose all ten targets and preserve the manifest selection.
- [x] Phase 8 verifies every selected target independently and rejects an artifact from the wrong family.
- [x] Local build verification and submit-ready verification are separate states; account IDs, bot setup,
  signing keys, hosted URLs and uploader receipts remain explicit blockers.
- [x] Godot can route real Windows, Web and Android exports when matching official templates/toolchains exist.
- [x] Circuit Courier produced a v1.1.2 ten-target local matrix with explicit external blockers (historical result).
- [ ] Reconcile that matrix with current sources after the v1.1.3 production Android identity/export change.
- [x] Adversarial regressions cover cross-family substitution, missing target manifest, unsigned Android,
  missing hosted URL/SDK initialization and mixed-version target artifacts.
- [x] Engine surfaces, packaging and installed sync were released through the v4.68.77 baseline.

## Current environment facts

- The pilot has Windows, Web and Android presets. Its v1.1.2 matrix used Godot 4.6.3; the separately
  recorded production Android v1.1.3 base used 4.7.stable. Preserve each artifact's actual engine identity.
- Production APK/AAB and their public signing binding exist (pilot commit `f0efc11`). Private material
  is in the external Forge vault, not missing or awaiting regeneration.
- Read-only verification on 2026-09-05 reports `PLATFORM_RELEASE_SOURCE_STALE` for all ten v1.1.2
  receipts. The old summary's local PASS is historical, not current-source acceptance.
- No new device test, SDK-container test, upload or moderation is claimed by this audit. Do not replace
  the matrix manifest with an Android-only base or call all ten targets released.

## Release truth levels

1. `not-built` — no matching local artifact.
2. `local-verified` — correct engine artifact and local target checks pass.
3. `external-blocked` — local artifact passes, but credentials, app/bot ID, hosted URL, signing enrollment,
   uploader receipt or moderation are missing.
4. `submit-ready` — every deterministic and required external prerequisite for console upload is evidenced.
5. `published` — only a platform receipt may assert publication; Forge never infers it from a local file.
