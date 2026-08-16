Run the FULL pipeline: raw prototype → polished game → SDK integrated → tested → release ZIP.

## Arguments

`$ARGUMENTS`:
- no args — full pipeline (all phases, with mandatory stops between them)
- `phase1` — only: analyze + design improvements + mobile adapt
- `phase2` — only: SDK integration + localization
- `phase3` — only: testing + debug panel + release build
- `resume` — read WorkProgress/{GameName}/PIPELINE.md and continue where left off

## Before Starting

1. Verify game exists in `GameIntegration/` folder
2. **Copy to WorkProgress:** `GameIntegration/{folder}` → `WorkProgress/{GameName}/`
3. Read `WorkProgress/{GameName}/PIPELINE.md` if exists (resume from last phase)
4. If fresh start — create PIPELINE.md tracker in `WorkProgress/{GameName}/` (template at bottom)

**⚠️ ALL work happens in `WorkProgress/{GameName}/`. NEVER edit GameIntegration/ or Release/.**

## ⚠️ CRITICAL RULES

1. **ONE PHASE AT A TIME.** After each phase → output report → STOP → wait for user.
2. **READ SKILL BEFORE WORK.** Load the skill file, THEN apply changes. Never skip.
3. **PRE-SUBMIT GATE BEFORE CLAIMING DONE.** Run `node scripts/pre-submit.mjs WorkProgress/{GameName}/` and require **0 blockers** before saying "ready". Legacy `bash scripts/verify.sh` and `node scripts/verify-i18n.mjs` give extra warnings but are NOT the gate.
4. **NO ZIP WITHOUT 0 BLOCKERS.** Never run `archiver` / build-release for any game whose pre-submit report still has blockers. No exceptions, no "small blocker", no "moderator may pass". Fix → re-run → 0 blockers → THEN build.
5. **DO NOT SILENTLY DOWNGRADE BLOCKERS.** If you believe a blocker is a false positive, ask the user with the citation visible. Don't decide alone.
6. **PHASES ARE ISOLATED.** Phase 1 never touches SDK/localization. Phase 2 never breaks Phase 1 gameplay.

---

## PHASE 1: ANALYZE + IMPROVE

### 1.1 Analyze Game
Read ALL files in `WorkProgress/{GameName}/`. Write analysis to PIPELINE.md:
- Genre, engine, orientation, what works, what's missing

### 1.2 Apply Skills (read EACH before applying)
| Order | Skill | What to check/fix |
|-------|-------|--------------------|
| 1 | `game-design` | Core loop, juice, difficulty, retention |
| 2 | `level-design` | Progression, variety, bosses, data-driven levels |
| 3 | `mobile-adapt` | Orientation by genre, touch controls mapping |
| 4 | `mobile-game-ui` | Max 5 buttons, panels, minimap position, font sizes |
| 5 | `game-polish` | Loading screen, transitions, sounds, onboarding |
| 6 | `monetization-design` | Ad placement map, RV hooks, IAP catalog |

For each skill: read → apply → note what was done in PIPELINE.md.

### ⛔ MANDATORY STOP — Phase 1 Complete

**STOP HERE. Do NOT proceed to Phase 2 without user confirmation.**

Output this report:
```
═══════════════════════════════════════
  PHASE 1 COMPLETE: {Game Name}
═══════════════════════════════════════
  Genre: {genre}
  Engine: {engine}
  Orientation: {landscape/portrait}

  Changes made:
  - {list each change with affected files}

  Skills applied:
  - {list each skill and what it changed}

  Files modified: {count}
  Lines added/changed: ~{estimate}

  Next: Phase 2 (SDK + Localization)
  Say "продолжи" to continue.
═══════════════════════════════════════
```

Update PIPELINE.md: mark Phase 1 DONE. **WAIT for user.**

---

## PHASE 2: SDK INTEGRATION + LOCALIZATION

### 2.1 SDK Integration
**Read skill:** `.claude/skills/yandex-sdk-integration/SKILL.md` — this is the ONLY source of truth.

Follow the integration checklist IN ORDER (from the skill):
1. Add `/sdk.js` + wrapper (copy from templates/, don't rewrite)
2. Init + Lifecycle (ready AFTER fonts + title screen visible)
3. Dev-mode (game works without SDK on file://)
4. Sound muting (ads, tab hidden, game_api_pause)
5. Replace ALL localStorage → cloud saves
6. Interstitial ads (natural pauses, 60s cooldown)
7. Rewarded video (player-initiated, reward shown before)
8. Purchases if applicable (consume after grant, check uncompleted)
9. Leaderboards if applicable

### 2.2 Localization (13 languages)
From the SDK integration skill, section on localization:
- All UI strings through `t()` function
- All game data strings through `td()` function
- 13 languages: RU, EN, ES, TR, PT, AR, ID, FR, JA, IT, DE, HI, ZH
- Arabic RTL support
- CJK font fallback
- Language detection BEFORE LoadingAPI.ready()

### 2.3 Quick Verification
```bash
# Must return empty (no localStorage left):
grep -rn "localStorage" WorkProgress/{GameName}/ --include="*.js" | grep -v "debugcheck\|cheats\|fallback\|dev.mode"

# Must find SDK calls:
grep -rn "LoadingAPI\|GameplayAPI\|showFullscreenAdv\|showRewardedVideo" WorkProgress/{GameName}/ --include="*.js" | head -10

# Must find language detection:
grep -rn "i18n.lang\|getLang\|detectLang" WorkProgress/{GameName}/ --include="*.js" | head -5
```

### ⛔ MANDATORY STOP — Phase 2 Complete

**STOP HERE. Do NOT proceed to Phase 3 without user confirmation.**

Output this report:
```
═══════════════════════════════════════
  PHASE 2 COMPLETE: {Game Name}
═══════════════════════════════════════
  SDK Integration:
  - [x] Init + Lifecycle
  - [x] Dev-mode fallback
  - [x] Sound muting
  - [x] Cloud saves (localStorage removed)
  - [x] Interstitial: {N} placement points
  - [x] Rewarded: {N} hooks
  - [x/skip] Purchases
  - [x/skip] Leaderboards

  Localization:
  - Languages: 13/13
  - UI strings: {N} keys in t()
  - Game data: {N} keys in td()
  - RTL support: {yes/no}

  Verification:
  - localStorage grep: {empty/issues}
  - SDK calls found: {yes/no}
  - Lang detection: {yes/no}

  Next: Phase 3 (Test + Release)
  Say "продолжи" to continue.
═══════════════════════════════════════
```

Update PIPELINE.md: mark Phase 2 DONE. **WAIT for user.**

---

## PHASE 3: TESTING + DEBUG + RELEASE

### 3.1 Pre-Submit Validation (MANDATORY)
**Activate skill:** `pre-submit-gate`

```bash
# Main gate: 9 validators, 30+ REQ checks with citations
node scripts/pre-submit.mjs WorkProgress/{GameName}/ --verbose
# Must show "READY for submission" (0 blockers).
# Exit 1 = DO NOT BUILD ZIP.

# Smoke test (runtime crashes + freezes >=500ms)
node scripts/smoke-test.mjs WorkProgress/{GameName}/

# Legacy scripts (additional warnings, not gating)
bash scripts/verify.sh WorkProgress/{GameName}/
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
```
Fix ALL blockers. Re-run pre-submit. If exit code 1 → **stop, do not build ZIP, do not say "ready"**.

The pre-submit report contains for each issue:
- REQ ID
- citation from Yandex docs (or moderator quote)
- exact file:line
- URL to the requirements page

### 3.2 Debug Panel
**Read skill:** `.claude/skills/debugcheck-enhance/SKILL.md`
- Ensure debugcheck.js has runtime checks (not just regex)
- Add timing probes, overflow detection, ad behavior checks

### 3.3 Mobile Check (if Puppeteer available)
```bash
node mobile-check.mjs
```
Fix until 🟢 GOOD (0 fail, ≤1 warn). Read screenshots if available.

### 3.4 Build 3 ZIPs

Общие правила для ВСЕХ билдов:
- `index.html` в корне ZIP (не в подпапке!)
- Нет пробелов и кириллицы в именах файлов
- Размер < 100 MB

**A. Production** (`{Name}-v{N}.zip`):
- Только файлы игры (index.html, JS, CSS, ассеты)
- БЕЗ debugcheck.js, БЕЗ cheats.js
- Этот ZIP идёт на модерацию Яндекс

**B. Debug** (`{Name}-v{N}-debug.zip`):
- Все файлы production-билда
- Скопировать `templates/html5/debugcheck.js` в архив
- В `index.html` добавить `<script src="debugcheck.js"></script>` в `<head>` ПОСЛЕ `<script src="/sdk.js">` но ПЕРЕД игровыми скриптами
- Активация: **Ctrl+Shift+2** нажать 3 раза → оверлей проверки SDK (20+ категорий)
- Этот билд — для проверки SDK интеграции перед модерацией

**C. Marketing** (`{Name}-v{N}-marketing.zip`):
- Все файлы production-билда
- Скопировать `templates/html5/cheats-base.js` как `cheats.js`, добавить ИГРОСПЕЦИФИЧНЫЕ кнопки
- В `index.html` добавить `<script src="cheats.js"></script>` перед `</body>`
- Активация: **Ctrl+Shift+9** — toggle чит-панель
- Горячие клавиши: **P** = silent pause (для скриншотов), **L** = cycle language
- Этот билд пользователь использует для скриншотов через **YG скриншотер** (Chrome-расширение):
  переключает язык кнопкой L или через расширение, прокачивает через читы, делает скриншоты
- **Обязательно:** добавить игроспецифичные кнопки в `gameButtons`:
  +ресурсы, +уровень, пропуск, разблокировка всего, макс апгрейды, win/lose
  (всё что нужно чтобы быстро показать все состояния игры для скриншотов)

### 3.5 Store Materials
Generate in `Release/{GameName}/`:
- `store-listing.md` — RU store description (see CLAUDE.md section 12)
- `{Name}-art-prompts.md` — 3 variants per asset (Midjourney, GPT Image, Nano Banan 2)
- `SETUP_GUIDE.md` — leaderboards, IAP, ad placements, screenshots checklist
- `rodrik-import.json` — format from `Rodrik_Studio_Import_Prompt.md`

**Скриншоты:** НЕ делать. Пользователь делает скриншоты сам через YG скриншотер + маркетинговый билд.

### ⛔ FINAL STOP — Pipeline Complete

Output this report:
```
═══════════════════════════════════════
  PIPELINE COMPLETE: {Game Name}
═══════════════════════════════════════
  Version: v{N}

  verify.sh: ✅ {PASS} passed, {FAIL} failed, {WARN} warnings
  Debug panel: {0 FAIL / N FAIL}
  Mobile check: {🟢 GOOD / ⚠️ issues}

  Release files:
  - Release/{Name}/{Name}-v{N}.zip ({size})
  - Release/{Name}/{Name}-v{N}-debug.zip ({size})
  - Release/{Name}/{Name}-v{N}-marketing.zip ({size})
  - Release/{Name}/store-listing.md
  - Release/{Name}/{Name}-art-prompts.md
  - Release/{Name}/SETUP_GUIDE.md
  - Release/{Name}/rodrik-import.json

  ✅ Ready for Yandex Games moderation
═══════════════════════════════════════
```

---

## PIPELINE.md Template

Create in `WorkProgress/{GameName}/PIPELINE.md` at start:

```markdown
# Pipeline: {Game Name}
Started: {date}

## Analysis
- Genre: {genre}
- Engine: {engine}
- Orientation: {landscape/portrait}
- Key files: {list}
- State: {what works, what's missing}

## Phase 1: Improve — {NOT STARTED / IN PROGRESS / DONE}
- [ ] game-design applied
- [ ] level-design applied
- [ ] mobile-adapt applied
- [ ] mobile-game-ui applied
- [ ] game-polish applied
- [ ] monetization-design applied
Changes: {list}

## Phase 2: Integrate — {NOT STARTED / IN PROGRESS / DONE}
- [ ] SDK init + lifecycle
- [ ] Dev-mode fallback
- [ ] Sound muting
- [ ] Cloud saves
- [ ] Interstitial ads
- [ ] Rewarded video
- [ ] Purchases (if applicable)
- [ ] Leaderboards (if applicable)
- [ ] Localization (13 languages)
Changes: {list}

## Phase 3: Test + Release — {NOT STARTED / IN PROGRESS / DONE}
- [ ] verify.sh: 0 FAIL
- [ ] Debug panel: 0 FAIL
- [ ] Mobile check: GOOD
- [ ] 3 ZIPs built
- [ ] Store materials
Version: v{N}

## Issues Found
{list issues and fixes}
```

## Non-Negotiable Rules

1. ⛔ STOP after each phase. Output report. Wait for user.
2. 📖 Read skill BEFORE applying its changes (not after, not skip).
3. 🔍 Run `bash scripts/verify.sh` before claiming Phase 3 done.
4. 🔒 Phase 1 NEVER touches SDK/localization code.
5. 🔒 Phase 2 NEVER breaks Phase 1 gameplay changes.
6. 📝 Update PIPELINE.md after each sub-step (not at the end).
7. ❌ NEVER say "ready for moderation" if verify.sh has any FAIL.
