---
date: 2026-04-24 (v4.7.0)
status: accepted
tags: [decision, automation, drift-detection]
---

# 006: Platform completeness automated check

## Context

When v4.7.0 added Steam + VK Play (3rd time adding new platform), realized:

**Adding a platform = touching ~18 files** in different parts of Forge:
- 4 в `platforms/{p}/` (README, pre-submit, validators, templates)
- 4 в `.claude/skills/` (release-, fill-, sdk-integration, agent)
- 4 cross-references в orchestrator skills (release-all, release-ready, gate, advisor)
- 2 в dashboard.html (PLATFORMS list, getBuildPrompt branch)
- 4 в setup/docs/CI (setup.sh, README, GUIDE, release.yml)

After releasing v4.7.0, user demanded audit. Found 5 missed integration points (phantom skill ref, hardcoded loops, README counts, missing GUIDE sections, missing builder agents). Without script-enforced check, drift была guaranteed.

## Options Considered

1. **Manual checklist в release process** — markdown checklist before publish. Cons: forgettable, requires discipline.

2. **CI matrix per platform** — GitHub Actions tests each platform. Pros: automated. Cons: doesn't catch documentation/skill/dashboard drift.

3. **Standalone audit script** — `node scripts/check-platform-completeness.mjs` that scans 18 points × N platforms. Pros: fast, comprehensive, exit code = ci-friendly.

## Decision

**Standalone audit script** with known-exemptions support.

Script `scripts/check-platform-completeness.mjs`:
- Defines 18 checks (see [[architecture/data-flow]])
- Iterates 9 platforms
- Each check returns ✓/✗
- Known exemptions for platforms with structural differences (rustore/web don't have validators because they use Capacitor/Docker, not JS bundle gate)
- Exit 0 if PERFECT, 1 if drift, 2 if invocation error
- Supports `--json` for machine-readable output
- Supports single-platform mode: `node scripts/check-platform-completeness.mjs steam`

Run before EVERY release. Add to CI pipeline (planned for v4.8).

## Consequences

- **Pro**: Drift caught immediately. v4.7.7 ran это script and verified PERFECT 9/9 before ship.
- **Pro**: Adding new platform now has explicit "all 18 points covered?" gate.
- **Pro**: Verifier itself documents the integration surface — newcomers reading the script know what 18 places need updating.
- **Con**: Script needs maintenance when new integration points are added (e.g. v4.8 might add point #19)
- **Con**: Doesn't catch semantic drift (e.g. release-yandex skill mentions "vkplay" but in wrong context — script just checks string presence)

Lesson #17: Adding a platform = touching ~18 files. Без script-enforced audit drift гарантирован.
