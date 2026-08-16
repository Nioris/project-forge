---
name: mvp-to-yandex
kind: tactical
description: "Autonomous end-to-end workflow для MVP → Yandex Games submission-ready state. One command, не stop'ит до GREEN. Analyzes MVP, expands к 7-day retention (genre-aware), integrates…"
---

# MVP → Yandex Games — Autonomous Pipeline

## When to use

У тебя готова MVP игра (core loop работает, fun proven). Нужно довести её до состояния которое можно **подать в Yandex Console**:
- Expanded content/features до 7-day retention уровня
- Aggressive ad monetization (interstitial + rewarded х2/boosters/hard currency)
- Localized RU+EN+TR
- Production zip собран
- Все documents готовы (store-listing, SETUP_GUIDE, art-prompts, promo-screens)
- Все validators GREEN

Skill уходит в autonomous loop через `/goal`. Возвращает control только когда **всё** готово или enter critical decision point.

## Don't use when

- ❌ Core loop ещё не работает (играй вручную, fun-test первый)
- ❌ Идея ещё неясна (используй `$start <description>` для new project)
- ❌ Хочешь видеть каждый шаг (используй `$release-ready` + manual)
- ❌ Не Yandex platform (используй `$auto-release rustore` или similar)
- ❌ Claude Code < v2.1.139 (нет `/goal` command)

## Prerequisites — auto-check

Перед запуском loop, skill проверяет:

```bash
# 1. Claude Code version
claude --version  # должна быть 2.1.139+ для /goal (актуальная — 2.1.153+)
```

💡 **Opus 4.8 + effort:** этот loop — одна из самых тяжёлых autonomous-задач Forge.
Opus 4.8 по умолчанию работает на high effort; для долгого прогона (30-90 мин, 13 условий)
запусти `/effort xhigh` перед стартом — даёт модели больше «бюджета» на сложные шаги
(баланс, рекламная интеграция, локализация). Снять обратно: `/effort high`.

```bash
# 2. Project structure exists  
ls index.html OR src/*.html OR WorkProgress/*/index.html

# 3. Forge tooling synced
ls scripts/runtime-test.mjs scripts/check-store-listing.mjs scripts/check-setup-guide.mjs

# 4. Puppeteer installed (для runtime-test)
ls node_modules/puppeteer || echo "Run: npm install puppeteer"

# 5. Yandex SDK wrapper available
ls platforms/yandex/yandex-sdk-wrapper.js
```

Если что-то missing — skill сообщает user и stop. Не запускает goal до fix.

## Decision policy (v4.10.31)

User said: **"сам решить, не отвлекай — или всё сразу в код, или спроси для важных решений"**.

Skill использует **3-tier decision matrix:**

### Tier 1: Auto-decide (без вопросов)

- Feature selection per genre patterns (из `info-hierarchy/patterns/games.md`)
- Content quantity (X levels/biomes/upgrades — genre median)
- Balance numbers (drop rates, costs, progression curves)
- Ad placement timing (interstitial cooldowns, rewarded triggers)
- Localization phrasing (use translation для existing strings)
- File organization
- Code patterns (single-file vs modular, framework choice)

### Tier 2: Quick ask (single question, default обоснован)

Skill spawns ONE `ask_user_input_v0` call с default highlighted:

- Genre ambiguous (looks like idle OR clicker) → choose с default "idle"
- Pricing strategy если IAP planned — но **user said no IAP**, skip
- Art style direction (cartoon / pixel / vector / realistic)
- Tone (serious / humorous / dark)

### Tier 3: Critical block (always ask)

Skill stops loop и asks:

- ❌ Missing Yandex API credentials (skill сам не может get them)
- ❌ Existing code conflicts с planned changes (overwrites custom user work)
- ❌ Content/theme decision moral (e.g., gambling-adjacent mechanic — user must confirm)
- ❌ Estimated time > 4 hours (gives user chance к abort)

## Pipeline overview (6 phases)

```
Phase 1: Analyze        — read code, detect genre, output mvp-analysis.md
Phase 2: Retention plan — calculate 7-day plan, output mvp-plan.md
Phase 3: Implement      — apply features/content/balance/monetization
Phase 4: Build          — Yandex SDK integrate, localize RU+EN+TR, smoke+runtime test
Phase 5: Documents      — fill-yandex, art-prompts, promo-screens, all validators GREEN
Phase 6: Final gate     — release-ready yandex returns GREEN, package zip
```

## Phase 1 — Analyze (one-shot, не повторяется в loop)

```bash
# Read project state
cat wiki/_current.md 2>/dev/null
cat wiki/_map.md 2>/dev/null
find . -name "*.html" -path "*/src/*" -o -name "index.html" -not -path "*/node_modules/*" -not -path "*/output/*"

# Read patterns
cat .claude/skills/info-hierarchy/patterns/games.md  # genre-specific UX patterns
```

Output: `wiki/mvp-analysis-{YYYY-MM-DD}.md`:

```markdown
# MVP Analysis — {Project}

## Detected
- **Genre**: idle / clicker / match-3 / RPG / racing / etc.
- **Subgenre**: idle business / merge / runner / etc.
- **Mechanics**: tap, timer-based, swipe, drag, ...
- **Current state**: N features, ~X minutes of content
- **Languages present**: ru | en | tr | none
- **Yandex SDK integration**: yes/no
- **Monetization current**: none / soft currency / ads / IAP

## Reference patterns (from games.md)
- Genre HUD anatomy: [diagram reference]
- F2P pattern: [Idle: prestige + offline progress + dailies]
- Mobile thumb zones: [reference]
- Anti-patterns to avoid: [list]

## Gaps к 7-day retention
- [ ] Feature gap 1 (e.g., no prestige loop — needed for replay)
- [ ] Content gap 1 (e.g., 3 eras only — need 5+ for week of play)
- [ ] Monetization gap 1 (e.g., no rewarded ads)
- [ ] Localization gap (e.g., only RU — need EN+TR)
```

## Phase 2 — Retention plan

Based на analysis, generate `wiki/mvp-plan-{date}.md`:

### Per-genre 7-day retention requirements

Skill уже знает median benchmarks per genre. Approximate gates:

| Genre | D1 retention req | D7 retention req | Min features | Min content |
|---|---|---|---|---|
| Idle/clicker | 35%+ | 10%+ | Prestige + offline + dailies | 5+ eras |
| Match-3 | 40%+ | 12%+ | 50+ levels + boosters + leaderboard | 100+ levels target, 50 minimum |
| Hyper-casual | 30%+ | 5%+ | Endless + leaderboards + cosmetics | 20+ skins |
| RPG-lite | 45%+ | 18%+ | Equipment + skills + dungeons | 10+ areas |
| Puzzle | 40%+ | 15%+ | Daily puzzle + hint system + level packs | 60+ puzzles |
| Strategy | 35%+ | 12%+ | Tech tree + missions + leaderboards | 20+ missions |

(Benchmarks от Sensor Tower / data.ai industry medians 2025-2026)

### Plan structure

```markdown
# MVP к 7-Day Retention Plan — {Project}

## Target genre median
- D1: {X}%
- D7: {Y}%

## Features к add ({estimated dev time: N hours})
- [ ] {Feature 1} — {why это improves retention}
- [ ] {Feature 2}
- ...

## Content к add
- [ ] {X} new levels/biomes/upgrades
- [ ] {Y} new {asset type} (cosmetics, characters, ...)
- [ ] {Z} new achievements

## Balance changes
- [ ] {Specific balance change 1}
- [ ] {Specific balance change 2}

## Monetization plan (ad-only, no IAP per user choice)

**Interstitial:**
- {Placement 1, e.g., after level completion}
- {Placement 2, e.g., after prestige}
- Cooldown: 60s (Yandex SDK enforced)
- Frequency cap: 3/session

**Rewarded:**
- {Placement 1, e.g., х2 reward at level end}
- {Placement 2, e.g., +1 life}
- {Placement 3, e.g., skip wait timer}
- {Placement 4, e.g., trade ad → hard currency}
- ALL must be user-initiated (REQ-4.4 compliance)

**Sticky banner:**
- If genre fits (idle/clicker yes, match-3 no — UI conflict)

**Soft currency:**
- Use: {coins/gems/whatever fits genre}
- Earned: by gameplay + daily rewards + ach rewards
- Spent: upgrades + cosmetics

**Hard currency** (если genre supports):
- Use: {premium boost / skip / cosmetic unlock}
- Earned: ONLY by rewarded ads + achievements + leaderboard rewards
- Never spent automatically
- NEVER buyable via real money (user choice — no IAP)
```

## Phase 3 — Implementation

For each item в plan, AI:

1. **Read** current code (relevant file)
2. **Edit** в реальные changes (не "fixed it" hallucination — pre-claim-fixed hook будет catch)
3. **Validate** immediately:
   - lint passes (если есть config)
   - smoke-test passes
   - related runtime-test scenario passes
4. **Commit** progress в wiki/sessions/{date}.md

If validation fails → fix → re-validate → continue. Не proceed к next plan item пока current passes.

**Auto-decisions (Tier 1):**
- Place ad calls в exact spots per pattern (idle: after prestige is canonical)
- Translation phrasing for new strings (use AI translation, mark с TODO для professional review later)
- Asset naming conventions (kebab-case PNG, snake_case JSON)

**Critical block (Tier 3 — stop loop, ask):**
- User has custom UI code that planned change would overwrite (show diff, ask "apply / skip / customize?")
- Plan estimates > 4 hours total dev time (ask "proceed / reduce scope / abort")

## Phase 4 — Build for Yandex (3-zip variant matrix)

⚠️ **v4.10.32 fix:** Forge standard requires **3 ZIPs**, не один. Prior version (v4.10.31) собирал только production-zip и тестировал runtime-test на нём — это слабее чем тест на debug-build с debugcheck.js (где behavioral probes выявляют больше проблем).

### 3 variants per Forge standard

| Variant | Suffix | Contains | Purpose |
|---|---|---|---|
| **Production** | `{project}-v{N}.zip` | clean game | Submission в Yandex Console |
| **Debug** | `{project}-v{N}-debug.zip` | + debugcheck.js + cheats-base.js | Internal QA (Ctrl+Shift+2 debug panel) |
| **Marketing** | `{project}-v{N}-marketing.zip` | + cheats-base.js + screenshots.js | Screenshot generation для store cards |

### Build procedure

```bash
# 1. Build all 3 variants
node scripts/build-yandex-3zips.mjs {Project} v{N}

# Output:
#   Release/{Project}/yandex/{Project}-v{N}.zip
#   Release/{Project}/yandex/{Project}-v{N}-debug.zip
#   Release/{Project}/yandex/{Project}-v{N}-marketing.zip
```

If support files missing (debugcheck.js, cheats-base.js, screenshots.js) — warnings printed but builds proceed. Variant features degrade gracefully.

### Runtime testing — на DEBUG build, не production

```bash
# v4.10.34: BEFORE runtime-test, validate no external CDN refs (RELEASE BLOCKER)
node scripts/check-external-cdn.mjs Release/{Project}/yandex/{Project}-v{N}.zip

# If violations → invoke $bundle-libs к download CDN libs locally
# Then rebuild 3 zips и re-validate

# Test runtime against DEBUG variant (more probes catch more issues)
node scripts/runtime-test.mjs Release/{Project}/yandex/ --variant=debug --scenarios=startup,lang,assets,dom,sdk

# Iterate fix → re-test пока все scenarios GREEN
```

Rationale: debugcheck.js имеет 30+ behavioral probes (i18n leak detection, SDK contract verification, asset load tracking, event sequence validation). Testing against production misses these — code might pass surface checks но fail behavioral.

⚠️ **External CDN check is RELEASE BLOCKER** — Yandex sandbox blocks external HTTP, moderation rejects builds. Even one `<script src="https://cdnjs..."` fails submission. Must bundle all libs locally via `$bundle-libs`.

### UI/UX review — MANDATORY before Phase 5

⚠️ **v4.10.32 new gate:** После build, **обязательно** запустить screenshot-based UI review (skip'нул prior version).

```bash
# Auto-snapshot via runtime-test + invoke $ui-review
node scripts/runtime-test.mjs Release/{Project}/yandex/ --variant=marketing --screenshot=true --viewport=1366x768

# This produces wiki/screenshots/{date}.png
# AI then invokes $ui-review с этим screenshot

# $ui-review systematic scan:
#   Phase 1: Zone enumeration (header, main, sidebars, etc)
#   Phase 2: 8-point checklist per zone (overlap, collision, prejat'ie, fonts, etc)
#   Phase 3: Source mapping (grep visible text)
#   Phase 4: Structured violations table
```

If `$ui-review` reports **any CRITICAL** violations:
- AI fixes them (Edit + verify)
- Re-snapshots
- Re-runs $ui-review
- Loops пока CRITICAL count = 0

MAJOR violations: fix recommended but не blocking (warning).
MINOR/NIT: log к wiki/mvp-plan.md как post-launch polish list.

### Localization

- Read existing strings из game
- Generate ru/en/tr translations via AI (mark TODO для professional review)
- Add 10 stub aliases (es/pt/fr/it/de/ar/id/ja/hi/zh — copies of EN) для Yandex 13-lang check
- Validate i18n coverage: `node scripts/check-inline-strings.mjs` → no hard-coded strings remain

## Phase 5 — Documents

```bash
# Generate all Yandex documents
$fill-yandex
# Outputs:
#   Release/{Project}/yandex/StoreData/store-listing-{ru,en,tr}.json
#   Release/{Project}/yandex/SETUP_GUIDE.md
#   Release/{Project}/yandex/rodrik-import.json
#   Release/{Project}/yandex/icon-prompts.md (generated separately by $art-prompts)
#   Release/{Project}/yandex/promo-screenshots-prompts.md

# Generate art prompts
$art-prompts yandex
# Outputs к Release/{Project}/yandex/icon-prompts.md (3 variants: MJ/DALL-E/Кандинский)

# Generate marketing screen prompts
$promo-screens yandex
# Outputs к Release/{Project}/yandex/promo-screenshots-prompts.md (5 cards × 3 variants)

# Validate documents
node scripts/check-store-listing.mjs Release/{Project}/yandex/StoreData/
node scripts/check-setup-guide.mjs Release/{Project}/yandex/
```

If validators report violations → regenerate failing parts → re-validate → пока GREEN.

## Phase 6 — Final readiness gate

```bash
# Master diagnostic
$release-ready yandex
```

Returns RED / YELLOW / GREEN. Loop targets **GREEN на все mandatory checks:**
- ✓ Runtime test (startup/lang/assets/dom/sdk all pass)
- ✓ Store listing schema valid (all 3 languages)
- ✓ SETUP_GUIDE valid (17 sections, no placeholders, multi-lang leaderboards, keywords sections)
- ✓ Platform completeness PERFECT
- ✓ Localization coverage (ru, en, tr + 10 stub aliases)
- ✓ No debug code present
- ✓ Production zip built

When all GREEN → goal completes → return control к user с final summary.

## Goal command — actual launch

Skill executes:

```bash
export CLAUDE_GOAL_MAX_STOP_CONTINUES=200   # generous для MVP loop, can take 30-90 min

/goal MVP {Project} ready для Yandex submission: 
  (1) wiki/mvp-analysis-{date}.md exists, 
  (2) wiki/mvp-plan-{date}.md exists, 
  (3) Release/{Project}/yandex/{Project}-v{N}.zip exists (production),
  (4) Release/{Project}/yandex/{Project}-v{N}-debug.zip exists (debug с debugcheck.js),
  (5) Release/{Project}/yandex/{Project}-v{N}-marketing.zip exists (marketing с cheats+screenshots.js),
  (6) node scripts/runtime-test.mjs Release/{Project}/yandex/ --variant=debug exits 0 (tested against debug-build с behavioral probes), 
  (7) node scripts/check-store-listing.mjs Release/{Project}/yandex/StoreData/ exits 0, 
  (8) node scripts/check-setup-guide.mjs Release/{Project}/yandex/ exits 0, 
  (9) Release/{Project}/yandex/icon-prompts.md exists, 
  (10) Release/{Project}/yandex/promo-screenshots-prompts.md exists, 
  (11) $ui-review against latest screenshot reports zero CRITICAL violations,
  (12) node scripts/check-external-cdn.mjs Release/{Project}/yandex/{Project}-v{N}.zip exits 0 (no external CDN refs — Yandex release blocker),
  (13) $release-ready yandex returns GREEN.
```

`/goal` evaluator (Haiku) проверяет все 13 conditions после каждого turn. Loop continues пока все 13 met.

## Final summary template

When goal completes, skill outputs:

```
✅ MVP {Project} готов к Yandex Games submission.

📊 Analysis:
- Genre: {detected}
- Dev time spent: {turns × ~5K tokens}
- Features added: {N from plan}
- Content added: {N from plan}
- Monetization placements: {N interstitial + N rewarded + sticky if applicable}

📦 Build (3 ZIPs per Forge standard):
- Production: Release/{Project}/yandex/{Project}-v{N}.zip ({size} KB) ← FOR YANDEX UPLOAD
- Debug:      Release/{Project}/yandex/{Project}-v{N}-debug.zip ({size} KB) ← INTERNAL QA (Ctrl+Shift+2)
- Marketing:  Release/{Project}/yandex/{Project}-v{N}-marketing.zip ({size} KB) ← SCREENSHOT GEN

📋 Documents:
- Store listing: store-listing-{ru,en,tr}.json (+ 10 stub aliases для 13-lang check)
- SETUP_GUIDE.md (17 sections, multi-lang leaderboards, keywords sections)
- rodrik-import.json (batch import format)

🎨 Art prompts (требуют manual generation в DALL-E/Кандинский):
- Icon 1024×1024 prompts: icon-prompts.md (3 variants per generator)
- Promo screenshots 1280×720: promo-screenshots-prompts.md (5 cards × 3 variants)

✅ Validators (all GREEN):
- runtime-test (tested against debug-build с behavioral probes)
- check-store-listing (all 3 languages)
- check-setup-guide (17 sections + multi-lang leaderboards + keywords)
- check-platform-completeness (yandex PERFECT)
- $ui-review (zero CRITICAL violations)
- $release-ready yandex GREEN

🎯 Next steps (manual):
1. Сгенерируй иконку из icon-prompts.md → сохрани к Release/{Project}/yandex/icon-1024.png
2. Сгенерируй 5 скриншотов из promo-screenshots-prompts.md → Release/{Project}/yandex/screenshots/
   (используй marketing zip для quick states via cheats panel)
3. Открой Yandex Console → создай новую игру → следуй SETUP_GUIDE.md
4. Upload {Project}-v{N}.zip (production, не debug/marketing!)
5. Submit на модерацию
```

## Anti-patterns

❌ **Don't use для core gameplay invention.** This skill takes existing fun MVP к release-ready, не creates from scratch. Use `$start <description>` для new project.

❌ **Don't use если хочешь видеть progress real-time.** Goal loop running, не stop'ит для checkpoints. Use individual skills ($fill-yandex etc.) если нужны checkpoints.

❌ **Don't run в production folder.** Skill creates WorkProgress/ + Release/ — if your code is **там** уже, skill может overwrite. Always run от project root, не от inside WorkProgress.

❌ **Don't expect art generated.** Skill generates PROMPTS. You generate images в DALL-E/Кандинский. This is Forge-wide design — AI image gen out of scope.

❌ **Don't skip puppeteer install.** Runtime-test is mandatory gate. Without puppeteer, goal can't reach Phase 6 GREEN.

## Estimated time

Per project complexity:
- **Small** (clicker, hyper-casual, single-screen): 30-45 min
- **Medium** (idle с прокачкой, match-3 simple): 60-90 min
- **Large** (RPG-lite, strategy, complex content): 2-3 hours

If estimated time > 4 hours per Phase 2 plan → Tier 3 critical block, ask user "proceed / reduce scope / abort".

## Integration с other Forge tooling

- **pre-claim-fixed hook (v4.10.27)** — catches AI lying about completion. Без него skill might claim "feature added" без real Edit.
- **$ui-review (v4.10.28)** — если visual collisions detected в Phase 4 runtime-test screenshot, skill invokes $ui-review к surface violations.
- **/goal (v2.1.139+)** — actual loop driver. Без него no autonomous.
- **$release-ready (v4.10.29+)** — final gate.

## Files this skill writes

- `wiki/mvp-analysis-{date}.md`
- `wiki/mvp-plan-{date}.md`
- `wiki/sessions/{date}.md` (progress log)
- `WorkProgress/{Project}-yandex/` (full build)
- `Release/{Project}/yandex/StoreData/store-listing-{lang}.json` ×13
- `Release/{Project}/yandex/SETUP_GUIDE.md`
- `Release/{Project}/yandex/rodrik-import.json`
- `Release/{Project}/yandex/icon-prompts.md`
- `Release/{Project}/yandex/promo-screenshots-prompts.md`
- `Release/{Project}/yandex/{Project}-v{N}.zip` (final production)

## Non-Negotiable

- [ ] Claude Code v2.1.139+ (for /goal command)
- [ ] Puppeteer installed (for runtime-test + screenshot capture)
- [ ] Phase 1 (analysis) completes before Phase 2 starts
- [ ] Phase 2 (plan) requires user confirmation only if estimated > 4 hours
- [ ] Phase 3 implementations use real Edit tool (pre-claim-fixed hook enforces)
- [ ] Phase 4 builds **3 ZIPs** via build-yandex-3zips.mjs (production + debug + marketing)
- [ ] Runtime-test runs against **DEBUG variant**, не production (catches more issues)
- [ ] **$ui-review --auto** runs after build с zero CRITICAL violations target
- [ ] All 12 goal conditions must be machine-checkable
- [ ] No IAP integration (user policy v4.10.31)
- [ ] Localization: RU + EN + TR + 10 stub aliases для 13-lang check
- [ ] Aggressive ad monetization (rewarded х2/boosters/hard currency)
- [ ] Final user instructions включают manual art generation
- [ ] Final summary указывает что upload именно PRODUCTION zip (не debug/marketing)
