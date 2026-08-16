# Data Flow

## Overview

Forge transforms a user's "I want to make a game/app and release on N platforms" into actual builds for those platforms. Workflow uses 3-folder discipline (GameIntegration → WorkProgress → Release).

## Master flow

```
USER REQUEST
  │
  │ "сделай игру X для Yandex+VK+Telegram"
  │
  ▼
┌─────────────────────────────────────┐
│  /start  OR  /analyze-game          │  ← orchestrator skills
│                                     │
│  Phase 0a: research-references      │  ← search competitors via web_search
│  Phase 0b: skill-discovery          │  ← /find-or-make-skill for specialized needs
│  Step 0:   workspace setup          │  ← mkdir -p WorkProgress/{Project}
│  Step 1-7: vision → stack → wiki    │
│            → first feature          │
└─────────────────────────────────────┘
  │
  ▼
WorkProgress/{Project}/
  │
  │  ALL active edits happen here
  │  (workspace-discipline hook blocks
  │   writes to GameIntegration/ and
  │   Release/ subpaths)
  │
  ▼
┌─────────────────────────────────────┐
│  Development sessions               │
│                                     │
│  /continue ← wiki/_current.md       │
│  /improve, /deepen-game, /polish-app│
│  /i18n-foundation                   │
│  /research-references (as needed)   │
│  /find-or-make-skill (as needed)    │
│                                     │
│  hook'и работают:                   │
│   - plan-check before write         │
│   - workspace-discipline before write│
│   - wiki-audit before stop          │
│   - post-tool-capture for tracking  │
│                                     │
│  wiki/ updated continuously         │
└─────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────┐
│  Pre-release validation             │
│                                     │
│  /release-ready <platform>          │
│  /gate <platform>                   │
│  /credentials-check                 │
│  node scripts/check-*.mjs           │
└─────────────────────────────────────┘
  │
  │  All green
  │
  ▼
┌─────────────────────────────────────┐
│  Release pipelines                  │
│                                     │
│  /release-yandex   → Release/X/yandex/   (3 ZIPs + 13 langs)
│  /release-vk       → Release/X/vk/       (bundle + manifest)
│  /release-telegram → Release/X/telegram/ (HTTPS bundle + bot)
│  /release-rustore  → Release/X/rustore/  (AAB + Pay SDK)
│  /release-steam    → Release/X/steam/    (Electron + SteamPipe)
│  /release-vkplay   → Release/X/vkplay/   (iframe + signed auth)
│  /release-all      → all in parallel via Agent Teams (experimental)
│                                     │
│  workspace-discipline hook bypassed │
│  via FORGE_ALLOW_PROTECTED_WRITE=1  │
│  (set automatically by release-*    │
│   skills internally)                │
└─────────────────────────────────────┘
  │
  ▼
Release/{Project}/{platform}/
  │
  │  Final artifacts (read-only)
  │  - .zip / .aab / .exe / etc.
  │  - manifests, store listings
  │  - submit-ready
  │
  ▼
USER UPLOADS to platform store
```

## Memory flow (wiki/)

```
SESSION START
  ↓
session-start hook reads:
  - wiki/_current.md  (active task, blockers)
  - wiki/_map.md      (vision, status, backlog)
  - latest wiki/sessions/YYYY/MM/DD.md
  ↓
Claude has context for the work
  ↓
WORK IN PROGRESS
  ↓
post-tool-capture hook records:
  - Significant operations to wiki/sessions/YYYY/MM/DD.md
  ↓
SESSION END
  ↓
stop-flush hook updates:
  - Wiki audit (block stop if wiki out of sync)
  - Notes for next session
```

## Skills loading flow

```
Claude Code starts
  ↓
Reads .claude/settings.json
  ↓
Discovers .claude/skills/*/SKILL.md
  ↓
Each skill registered as /name slash-command
  ↓
User types /skill-name
  ↓
Claude loads SKILL.md content as instructions
  ↓
Skill may reference ./skills/{category}/{name}/SKILL.md (knowledge base)
  ↓
Claude reads those for technical depth
```

## Hooks event flow

```
USER ACTION (e.g. asks Claude to edit a file)
  ↓
Claude decides to call Edit/Write/MultiEdit tool
  ↓
PreToolUse hooks fire (in order):
  1. workspace-discipline.mjs ← blocks if GameIntegration/ or Release/{X}/
  2. plan-check.mjs           ← warns if no plan in wiki/plan/
  ↓
If both pass (exit 0) → tool executes
  ↓
PostToolUse hook fires:
  - post-tool-capture.mjs ← logs to wiki/sessions/
  ↓
Eventually, user wants to /stop session
  ↓
Stop hooks fire:
  - stop-flush.mjs ← runs wiki-audit
    - blocks stop if wiki/_current.md not updated since session start
    - blocks stop if wiki/_map.md stale
  ↓
If clean → session ends, state saved
```

## Platform completeness flow (the meta-audit)

```
Developer adds a new platform (e.g. v4.7.0 added Steam + VK Play)
  ↓
Touches ~18 files per platform (validators, scripts, templates,
  release/fill/sdk skills, agent, cross-refs in 4 orchestrators,
  dashboard, setup, README, GUIDE, workflow)
  ↓
Without script-enforced check, drift guaranteed (lesson #17)
  ↓
node scripts/check-platform-completeness.mjs runs:
  ↓
For each platform, 18 checks:
  - platforms/{p}/README.md exists
  - platforms/{p}/scripts/pre-submit.mjs exists
  - platforms/{p}/validators/ has files
  - platforms/{p}/templates/ has files
  - .claude/skills/release-{p}/ exists
  - .claude/skills/fill-{p}/ exists
  - .claude/skills/{p}-sdk-integration/ exists
  - .claude/agents/{p}-builder.md exists
  - release-all skill mentions {p}
  - release-ready skill mentions {p}
  - gate skill mentions {p}
  - advisor catalog mentions {p}
  - dashboard.html PLATFORMS list
  - dashboard.html getBuildPrompt branch
  - setup.sh platform matrix
  - setup.sh validation loop
  - README.md mentions {p}
  - GUIDE.md mentions {p}
  - .github/workflows/release.yml matrix
  ↓
PERFECT (all green) OR DRIFT report
```
