---
name: reprocess
kind: tactical
description: "Переобработка уже выпущенной игры через полный пайплайн с новыми скилами. Распаковка → аудит → исправления → верификация → пересборка. Triggers on: reprocess, переобработка, обнови, пересобери, новая версия."
---

Re-process an already released game through the full pipeline with new skills and standards.

## Arguments

`$ARGUMENTS`:
- `{GameName}` — name of game folder in `Release/` (e.g. "SnakeIO", "2048Black")
- `all` — reprocess ALL games in `Release/` one by one
- `list` — show all games in Release/ with status

## How It Works

Game is already in `Release/<GameName>/`. We unpack the latest production ZIP into `WorkProgress/`, fix issues there, rebuild into `Release/`.

---

## Step 1: Discover and Unpack

1. Find `Release/{GameName}/{GameName}-v*.zip` — take LATEST version (highest v number)
2. Backup: if `WorkProgress/{GameName}/` exists, rename to `WorkProgress/{GameName}_backup_{date}/`
3. Unpack latest ZIP → `WorkProgress/{GameName}/`
4. Read `Release/{GameName}/SETUP_GUIDE.md` if exists
5. Create `WorkProgress/{GameName}/PIPELINE.md` with status "REPROCESS v{N} → v{N+1}"

**⚠️ ALL work happens in `WorkProgress/{GameName}/`. NEVER edit files in `Release/`.**

## Step 2: Automated Audit

```bash
# SDK, structure, sound, ads, mobile, dev-mode
bash scripts/verify.sh WorkProgress/{GameName}/

# Localization: keys, languages, hardcoded Cyrillic, var _lang, setLang re-render
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
```

Record ALL ❌ FAIL and ⚠️ WARN results in `WorkProgress/{GameName}/REPROCESS_REPORT.md`.

Then check skills manually (only what scripts don't cover):

| Skill | What to check |
|-------|--------------|
| game-design | Core loop, juice, difficulty, retention |
| level-design | Progression, variety, bosses |
| mobile-adapt | Orientation, touch controls |
| mobile-game-ui | Max 5 buttons, panels, minimap |
| game-polish | Loading screen, transitions, sounds, onboarding |
| monetization-design | Ad placement, RV hooks, cooldown |

## Step 3: Generate Reprocess Report

Save to `WorkProgress/{GameName}/REPROCESS_REPORT.md`:

```markdown
# Reprocess Report: {GameName}
Date: {date}
Previous version: v{N}
Reprocess version: v{N+1}

## Automated Audit
verify.sh: {PASS} pass, {FAIL} fail, {WARN} warn
verify-i18n.mjs: {PASS} pass, {FAIL} fail, {WARN} warn

## Manual Audit
| Category | Status | Issues |
|----------|--------|--------|
| Game Design | ✅/⚠️/🔴 | {details} |
| Level Design | ✅/⚠️/🔴 | {details} |
| Mobile Controls | ✅/⚠️/🔴 | {details} |
| Mobile UI | ✅/⚠️/🔴 | {details} |
| Visual Polish | ✅/⚠️/🔴 | {details} |
| Monetization | ✅/⚠️/🔴 | {details} |

## Priority Fixes
🔴 CRITICAL (will be rejected):
1. {issue}

⚠️ SHOULD FIX:
2. {issue}

📈 NICE TO HAVE:
3. {issue}

## Action Plan
1. {first fix}
2. ...
```

## Step 4: Fix Issues

Apply fixes in `WorkProgress/{GameName}/` in priority order:
1. 🔴 CRITICAL first (rejection risks)
2. ⚠️ SHOULD FIX second
3. 📈 NICE TO HAVE if time allows

After each fix: re-run `verify.sh` and `verify-i18n.mjs` — confirm nothing broke.

**Localization fixes → follow `.claude/commands/localize.md` rules (порциями, verify между шагами).**

## Step 5: Verify → Build

```bash
# All 3 must show 0 FAIL before building:
bash scripts/verify.sh WorkProgress/{GameName}/
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
node scripts/smoke-test.mjs WorkProgress/{GameName}/
```

If ANY FAIL remains → fix first. Do NOT build with failures.

Build 3 ZIPs from `WorkProgress/{GameName}/` → into `Release/{GameName}/`:
1. **Production:** `{GameName}-v{N+1}.zip`
2. **Debug:** `{GameName}-v{N+1}-debug.zip` (+ debugcheck.js in `<head>` after sdk.js)
3. **Marketing:** `{GameName}-v{N+1}-marketing.zip` (+ cheats.js with game-specific buttons before `</body>`)

Regenerate if missing or outdated:
- store-listing.md
- SETUP_GUIDE.md
- rodrik-import.json (update version + status)

Move `REPROCESS_REPORT.md` → `Release/{GameName}/REPROCESS_REPORT_v{N+1}.md`

## Step 6: Summary

```
═══════════════════════════════════
  REPROCESS COMPLETE: {GameName}
═══════════════════════════════════

  Previous: v{N}
  New:      v{N+1}

  verify.sh:       {PASS} pass, {FAIL} fail
  verify-i18n.mjs: {PASS} pass, {FAIL} fail

  Fixed:    {X} critical, {Y} warnings
  Added:    {list}
  Skipped:  {list}

  Files: Release/{GameName}/
═══════════════════════════════════
```

---

## For `list` argument:

Scan `Release/` and show:
```
═══════════════════════════════════
  Games in Release/
═══════════════════════════════════

  # | Name         | Version | ZIPs | Store | Rodrik
  1 | SnakeIO      | v3      | 3/3  | ✅    | ✅
  2 | 2048Black    | v1      | 1/3  | ❌    | ❌
  3 | PlagueEvo    | v2      | 3/3  | ✅    | ✅
  ...

  Legend: ZIPs = prod+debug+marketing
```

## For `all` argument:

Loop through each game in Release/, run full reprocess.
Between games: clear `WorkProgress/`, start fresh.

## Non-Negotiable Rules

1. ⚠️ Unpack into `WorkProgress/`, NEVER work in `Release/`
2. 🔍 Run verify.sh + verify-i18n.mjs BEFORE building — 0 FAIL required
3. 📝 REPROCESS_REPORT.md generated with audit results
4. 🔒 Version incremented (never overwrite)
5. 📦 All 3 ZIP variants built
6. ❌ NEVER say "ready" if any verify has FAIL
