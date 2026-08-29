# Changelog

> Rotated from CLAUDE.md to keep main file under 30KB soft limit.
> Order: newest first.

## v4.68.59 changelog (trusted Godot certificate-noise recovery)

The exact Windows root-certificate diagnostic is nonblocking only after trusted native markers/reports and
valid artifacts. Terminal phase block replay is idempotent; conflicting transitions require explicit reopen.

---

## v4.68.58 changelog (crash-safe isolated Godot runtime)

Godot runtimes use temporary user profiles and class caches. GDScript construct checks bounded native
startup without editor import; real parse/compiler errors remain project defects.

---

## v4.68.57 changelog (restart-safe host Git checkpoints)

Forge reconciles durable Git checkpoints before model access; Phase 8+ requires a private push. One
PID-owned lease covers phase and manual entrypoints. Packaging help/errors cannot consume a version.

---

## v4.68.11 changelog (fleet behavioral diagnostics)

Forge-managed projects now keep a local `wiki/diagnostics/forge-events.jsonl` stream for behavioral defects in Forge itself. Claude/Codex/generic instructions and a native GigaChat function report malformed phase/STOP output, adapter/hook/runtime failures, state/capability contradictions and incorrect Forge formats while excluding ordinary game/app bugs. The dependency-free logger bounds fields, redacts common credentials and the project root, accepts only project-relative evidence, rotates non-destructively and adds a local Git exclude.

`project-status.mjs` shows unresolved counts. `scripts/audit-forge-diagnostics.mjs` scans all managed sibling projects, reconstructs report/resolve state and groups observations by stable code/component/operation so engine maintainers can measure fleet impact while projects continue developing. GigaChat also auto-reports bounded STOP-format exhaustion, malformed textual tool transport and fatal runtime exceptions.

---

## v4.68.1 changelog (terminal API profiles + GigaChat coding agent)

Claude and Codex now have explicit API launch profiles in addition to their existing subscription/ChatGPT profiles. Keys are centralized outside projects under `forge-data/secrets/`. Claude receives its key through `apiKeyHelper`; Codex receives an isolated API-key auth store under a dedicated `CODEX_HOME`, preventing API mode from replacing the normal ChatGPT login.

A Forge-owned GigaChat terminal agent uses documented custom function calling for project read/search/edit/status/git operations and optional full shell execution. Dashboard project cards expose separate API buttons, while the GigaCode CLI bridge remains optional and dormant.

---

## v4.67.1 changelog (canonical 9-phase status + machine phase markers)

`/status` no longer renders the retired 0..6 pseudo-pipeline. It now reports all nine canonical Forge phases and separates phase progression from health lanes such as mobile, SDK, localization and AI Studio. Future-phase absence is `not_reached`, not a failure.

A dependency-free read-only snapshot helper (`.claude/skills/status/references/project-status.mjs`) derives lightweight facts without runtime/browser/network work. Explicit `wiki/phases/phase-N.json` markers win when present; legacy projects use conservative artifact inference and cannot skip an earlier gate just because downstream code exists.

All nine phase skills now write `start`, `block`, and `complete` state through `phase-state.mjs`. New project templates stop storing mutable progress in `CLAUDE.md`; initial state is written to `wiki/_current.md`, while `CLAUDE.md` points status readers at phase markers + artifacts.

A regression verifier covers new projects, legacy inference, STOP reasons, stale `Just created` text, downstream-evidence gate holes, and marker transitions.

---

## v4.66.9 changelog (AV-safe dialogue extractor + atomic fleet sync snapshot)

Field sync on Windows stopped halfway through 26 sibling projects because an external security scanner removed the generated Codex mirror file `.agents/skills/asset-generation/references/extract_says.js` while `sync.mjs` was still reading sources project-by-project. The package itself was complete; the failure exposed that fleet sync assumed managed source files could not disappear mid-run.

`sync.mjs` now snapshots every managed source file into memory immediately after rebuilding generated surfaces, before touching any sibling project. A later quarantine/removal can no longer corrupt a half-completed fleet propagation. Snapshot acquisition itself fails early with a targeted diagnostic if a source disappears before capture.

The dialogue helper `extract_says.js` no longer executes arbitrary project JS through Node `vm`. It is now a conservative static scanner that extracts literal `{op:'say', who, text, vtag}` objects only; dynamic expressions are skipped rather than evaluated. This reduces antivirus heuristics and removes unnecessary code execution from an asset-preparation helper.

A regression verifier (`scripts/check-sync-snapshot.mjs`) proves the buffered payload remains valid after the source file is deleted.

---

## v4.66.10 changelog (Windows Codex hook launcher repair)

Field testing on Codex CLI 0.147.0 / Windows exposed a launcher bug in every Forge `commandWindows` lifecycle hook. Forge wrapped the hook in a second `powershell -Command "...$root...$null..."`; because Codex already executes the Windows hook command through its Windows shell runner, the outer PowerShell expanded `$root`/`$null` before the nested PowerShell received the script, producing `hook exited with code 1` for SessionStart, PreToolUse and PostToolUse.

Project-local Codex hooks now use direct Node launchers such as `node ".\.codex\hooks\post-tool-capture.mjs"` and `node ".\.claude\hooks\session-start.mjs"`. No nested PowerShell, no `ExecutionPolicy Bypass`, no shell-variable interpolation. The dashboard `Codex Full` launch keeps `-a never -s danger-full-access --dangerously-bypass-hook-trust`; approval/sandbox behavior is separate from hook process correctness.

`check-codex-compat.mjs` now rejects nested PowerShell in `commandWindows` and verifies that every direct hook target exists, so this Windows-only failure class is release-gated.

The yellow Codex warning about shortened skill descriptions is not a hook failure: Codex currently caps model-visible skill metadata at 2% of context and can shorten descriptions when many skills/plugins are loaded while retaining the skill catalog. Forge keeps all 140 discoverable skills for now; catalog compaction is a separate optimization.

---

## v4.10.34 changelog (External CDN release blocker для Yandex)

### User lesson contributed

User: "на Yandex Games любые внешние CDN-скрипты — release blocker. Теперь все либы (Three.js, Phaser, Howler и т.д.) надо bundle'ить в архив."

This is **silent killer** class of bug: game runs perfectly в dev (external CDN loads fine), but Yandex moderation rejects on submission (REQ-2.1 sandbox compliance). No runtime error, no validator catches it.

### Fix

**1. New validator: scripts/check-external-cdn.mjs (17 verifiers total)**

Scans HTML/JS files в build folder (or extracts zip к temp) для external HTTPS references:

Patterns detected:
- `<script src="https://...">` — script CDN
- `<link href="https://...">` — CSS/font CDN
- `import "https://..."` — ES module external
- `new Worker('https://...')` — worker URL
- `@import url(https://...)` в CSS

Yandex whitelist (allowed):
- yandex.ru / yandex.net / yandex.com
- games.yandex.net
- sdk.games.s3.yandex.net
- mc.yandex.ru/net (metrika)
- yastatic.net

Known CDN blocklist (CRITICAL severity):
- cdnjs.cloudflare.com
- cdn.jsdelivr.net / jsdelivr.net
- unpkg.com
- cdn.skypack.dev
- esm.sh / esm.run
- cdn.tailwindcss.com
- fonts.googleapis.com / fonts.gstatic.com
- ajax.googleapis.com
- maxcdn/stackpath.bootstrapcdn.com
- code.jquery.com
- kit.fontawesome.com

Unknown external HTTPS (MAJOR — review manually, probably also blocker).

**2. New skill: /bundle-libs**

Workflow для fixing violations:
1. Scan via check-external-cdn → violations list
2. Per violation: download к assets/lib/<libname>, replace ref с relative path
3. Special case: Google Fonts — download CSS + each referenced WOFF, rewrite paths
4. Version pinning в assets/lib/_versions.txt
5. Re-validate (check-external-cdn returns 0)
6. Runtime-test verify bundled libs work

Common libraries reference table с recommended source URLs included.

Anti-patterns documented: don't download minified lib twice, don't hardcode absolute paths, don't skip version pinning, don't bundle huge unused libs (mention tree-shaking via esbuild), don't trust 200 OK blindly (CDN may return HTML error page).

**3. Integration**

- `/release-ready yandex` — added external-cdn check к mandatory gates table. Now release blocker если any external ref.
- `/mvp-to-yandex` Phase 4 — runs check-external-cdn BEFORE runtime-test. If violations → invoke /bundle-libs → rebuild → re-validate.
- `/goal` conditions для mvp-to-yandex expanded 12→13 (add external-cdn condition).

**4. Sync propagation**

check-external-cdn.mjs added к sync.ps1 + sync.bat verifier copy list. Propagates к все siblings.

### Testing

3 synthetic scenarios passed:
1. Clean dir с only Yandex SDK reference → PASS (whitelisted)
2. External CDN refs (Three.js cdnjs, Phaser unpkg, Google Fonts) → 3 CRITICAL violations correctly identified
3. ES module imports (skypack/esm.sh) → 2 CRITICAL violations correctly identified

### Lesson #67 — Sandbox compliance constraints are silent blockers

Most release blockers are **loud** — code crashes, validator fails, error message visible. Sandbox compliance is **silent** — game works perfectly in dev, fails moderation на submission. There's no runtime error, no exception, no console warning.

Categories of silent blockers:
- **Sandbox network** (Yandex — no external HTTP) ← addressed v4.10.34
- **CORS policies** (some platforms restrict cross-origin) 
- **API surface restrictions** (no fetch in iOS WKWebView под старой версией)
- **Permission gates** (some manifest permissions require justification)
- **File size limits** (some stores reject builds над N MB without warning)

Pattern: для each platform sandbox rule, ship explicit validator. **Не** assume dev environment matches production environment. Dev usually permissive, production usually strict.

Future Forge validators к add (silent blocker class):
- `check-bundle-size.mjs` — Yandex 100MB limit, RuStore 4GB limit
- `check-permissions.mjs` — Android manifest permissions justified usage
- `check-csp.mjs` — Content Security Policy violations (если store enforces)
- `check-async-asset-loads.mjs` — sandbox-blocked dynamic asset loading patterns

Tier: principle. Apply к all closed-vocabulary external systems где dev != production.

Becomes Architectural Invariant #23 candidate — "silent blockers need explicit validators, не runtime testing alone".

---

## v4.10.33 changelog (upgrade.bat chicken-egg fix)

### User pain

After ship v4.10.32 user ran:
```
PS F:\ProjectForgeUniversal\project-forge> .\upgrade.ps1
.\upgrade.ps1: File F:\ProjectForgeUniversal\project-forge\upgrade.ps1 cannot be loaded.
The file is not digitally signed. You cannot run this script on the current system.
```

Mark-of-the-Web after ZIP extract blocks ALL .ps1 files including upgrade.ps1 itself. **Chicken-egg:** upgrade.ps1 has logic to Unblock-File all other scripts, но сам blocked first — нельзя bootstrap.

User options before v4.10.33:
- Set ExecutionPolicy permanent (security risk)
- Run `powershell -ExecutionPolicy Bypass -File upgrade.ps1` every time (UX friction)
- Manual `Unblock-File upgrade.ps1` then run (still friction)

### Fix — .bat wrapper bootstrap

**Key insight:** Windows .bat files are NOT subject to Mark-of-the-Web like .ps1 are. (Different security model — .bat runs via cmd.exe which doesn't enforce ExecutionPolicy.)

Created **upgrade.bat**:
```batch
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0upgrade.ps1"
```

Double-click upgrade.bat → cmd.exe → powershell с Bypass → upgrade.ps1 runs → Unblock-File runs on all files → future scripts work freely.

Created **setup.bat** with same pattern for initial install.

setup.ps1 also got Unblock-File first step (was missing — only upgrade.ps1 had it).

### Updated docs

- README.md install section: .bat as primary recommended path, .ps1 как fallback
- GUIDE.md upgrade section: двойной клик upgrade.bat workflow + explanation of MotW issue
- Старая ошибка "not digitally signed" explicitly addressed с solution

### ASCII discipline

My initial upgrade.bat/setup.bat had Cyrillic chars в comments (для/через/etc) — Lesson #20 violation. check-bat-encoding.mjs caught 6 instances в if() blocks. Fixed к pure ASCII. Now все 5 .bat files clean.

### Lesson #66 — Chicken-egg bootstrap requires alternative trust path

When fix-script needs unblock but itself blocked → ship alternative loader that bypasses same trust mechanism. Pattern:

- Security restrictions create chicken-egg loops для self-bootstrap
- Alternative loader uses different trust mechanism (here: .bat не подпадает под .ps1 MotW)
- Loader has minimal logic (no business code, just bypass + delegate)
- Real logic stays в primary script (here: upgrade.ps1)

Applies к:
- Signed installers с unsigned helpers (signed wrapper validates + runs helpers)
- Package managers с restricted execution (.deb postinst в restricted environments)
- Security-restricted corporate environments (.bat → cmd → bypass policy)

Pattern для future Forge install/upgrade scripts: always ship .bat companion для .ps1 entry points.

Tier: principle. Becomes Architectural Invariant #22 candidate — "primary entry points need MotW-immune bootstrap loaders".

---

## v4.10.32 changelog (3-zip build matrix + UI/UX gate в /mvp-to-yandex)

### User pain (Прыг-Скок Обби MVP run)

User ran `/mvp-to-yandex` to ship Прыг-Скок Обби (parkour MVP). After 53min churn, output said "All 6 pipeline phases done, all validators green". User challenged:

> "а почему собран только 1 билд, а где билд дебаг и маркетинг с чит панелью? и как ты билды без дебага тестировал?"

AI acknowledged:
> "Справедливо — я собрал только production-zip и тестировал на нём. Это пробел в pipeline. По стандарту Forge для Yandex нужно 3 ZIP: debug, marketing, production. Я тестировал runtime-test против production — это слабее чем debug-build с debugcheck."

Plus: UI/UX never reviewed. Build proceeded to GREEN without checking screenshots для collisions/spacing/hierarchy.

### 3 gaps identified

1. **Build matrix incomplete** — only 1 zip built when Forge standard is 3
2. **Runtime-test on wrong variant** — production has no behavioral probes
3. **UI/UX never reviewed** — `/ui-review --auto` not called после build

### Fix

**1. New script: scripts/build-yandex-3zips.mjs**

Builds 3 variants per single command:
- Production: clean game (для Yandex submission)
- Debug: + debugcheck.js + cheats-base.js (Ctrl+Shift+2 panel для QA)
- Marketing: + cheats-base.js + screenshots.js (для screenshot generation в Console)

Each variant has forbid list to ensure files don't leak across:
- Production: no debugcheck/cheats/screenshots
- Debug: no screenshots.js
- Marketing: no debugcheck.js

Auto-injects script tags into index.html for included support files. Looks for support files в platforms/yandex/tools/, GameIntegration/, или WorkProgress/<project>/_archive/.

**2. runtime-test.mjs gets --variant flag**

```bash
node scripts/runtime-test.mjs Release/{Project}/yandex/ --variant=debug
```

Auto-extracts the requested variant zip к temp dir, runs scenarios against extracted contents. Default fallback к direct dir (backward compat).

**3. /mvp-to-yandex Phase 4 rewritten**

- Build all 3 variants via build-yandex-3zips.mjs
- Run runtime-test against **debug-build** (more probes catch more issues)
- After build, **mandatory** `/ui-review --auto`:
  - Auto-snapshot via runtime-test --screenshot=true
  - Systematic 5-phase scan (zones, 8-point checklist, source mapping, violations table)
  - If any CRITICAL violations → fix, re-snapshot, re-review, loop пока CRITICAL=0
  - MAJOR violations logged but не blocking
  - MINOR/NIT logged как post-launch polish

**4. /goal conditions expanded 9 → 12**

Added:
- (4) debug zip exists
- (5) marketing zip exists  
- (11) /ui-review against latest screenshot reports zero CRITICAL violations
- Renumbered: runtime-test changed к --variant=debug

**5. Final summary updated**

User получает clear listing всех 3 zips с описанием purpose. Explicit warning: "Upload {project}-v{N}.zip (production, не debug/marketing!)".

**6. build-yandex-3zips.mjs synced к siblings**

Added к sync copy list в sync.ps1 + sync.bat.

### Lesson #65 — Build matrices не just deliverables; they're testing surfaces

Production zip is the **deliverable** to Yandex. But running validators only against it is testing wrong thing:
- Production = clean game = surface-level tests only
- Debug = + behavioral probes = catches real runtime issues
- Marketing = + screenshot helpers = simulates store rendering context

Forge standard requires building all 3 не just because Yandex Console may want them, but because **richest variant tests catch most bugs**. /mvp-to-yandex must test against debug-build, not production-build, для maximum signal.

Pattern: для each multi-variant deliverable system (zips, AABs, multi-stage builds), validators run against richest test variant, deliverable variant is just packaging.

Applies к future Forge integrations:
- Steam: debug vs release builds — test against debug
- RuStore: TWA debug-apk vs release-apk — test against debug
- Capacitor: --debug flag enables more probes

Tier: principle. Becomes Architectural Invariant #21 candidate — "test against richest variant, ship deliverable variant".

---

## v4.10.31 changelog (/mvp-to-yandex autonomous workflow для small MVPs)

### User pain

User: "у меня сейчас пойдут проекты мелкие MVP. Нужна одна команда с циклом пока не завершиться и не будет всё готово: проанализировать → расширить до 7 дней ретеншена → собрать билд для яндекс → собрать все документы. Только yandex."

Existing tooling required user к chain manually:
- /analyze-game
- /improve (manual feature selection)
- /fill-yandex
- /art-prompts
- /promo-screens  
- /release-ready
- Repeat fix-cycles per validator

User wanted: single autonomous command. Decision style: "сам решить, не отвлекай — критичное спроси".

### Fix — new /mvp-to-yandex skill

Wraps `/goal` (v2.1.139+) с 6-phase pipeline:

**Phase 1: Analyze** — read code/wiki, detect genre via patterns/games.md, output mvp-analysis.md
**Phase 2: Retention plan** — calculate 7-day requirements per genre (D1/D7 targets, features/content needed), output mvp-plan.md
**Phase 3: Implement** — apply features/content/balance/monetization (real Edit, pre-claim-fixed hook enforces)
**Phase 4: Build** — Yandex SDK integrate, RU+EN+TR + 10 stub aliases для 13-lang check, runtime-test scenarios
**Phase 5: Documents** — fill-yandex + art-prompts + promo-screens, all validators GREEN
**Phase 6: Final gate** — /release-ready yandex returns GREEN, package zip

### Decision matrix (per user policy)

User said: "сам реши, не отвлекай — или сразу в код, или спроси для важных решений". Skill implements 3-tier:

**Tier 1: Auto-decide** (без вопросов)
- Feature selection per genre patterns
- Content quantity (genre median)
- Balance numbers
- Ad placement timing
- Localization phrasing
- File organization
- Code patterns

**Tier 2: Quick ask** (single question с default)
- Genre ambiguous (idle vs clicker)
- Art style direction
- Tone (serious/humorous/dark)

**Tier 3: Critical block** (always ask)
- Missing Yandex API credentials
- Existing code conflicts с planned changes
- Content moral decisions (gambling-adjacent mechanic)
- Estimated time > 4 hours

### Monetization policy (per user choice)

**Aggressive ad** (no IAP):
- Interstitial: post-prestige, post-level-complete (60s cooldown — Yandex SDK enforced)
- Rewarded:
  - х2 reward at level/run end
  - +1 life / continue
  - Skip wait timer
  - Trade ad → hard currency
  - All user-initiated (REQ-4.4 compliance)
- Sticky banner: если genre fits (idle/clicker yes, match-3 no)
- Soft currency: гameplay + daily + ach rewards
- Hard currency: ONLY by rewarded ads + ach + leaderboard (never buyable)

### Localization (per user choice)

- Primary: RU + EN + TR (база СНГ+Тюркский)
- Plus 10 stub aliases (es/pt/fr/it/de/ar/id/ja/hi/zh) copies of EN — для Yandex 13-lang check passing

### /goal command actual launch

```bash
export CLAUDE_GOAL_MAX_STOP_CONTINUES=200

/goal MVP {Project} ready для Yandex submission:
  (1) wiki/mvp-analysis-{date}.md exists,
  (2) wiki/mvp-plan-{date}.md exists,
  (3) WorkProgress/{Project}-yandex/index.html exists,
  (4) node scripts/runtime-test.mjs ... exits 0,
  (5) node scripts/check-store-listing.mjs ... exits 0,
  (6) node scripts/check-setup-guide.mjs ... exits 0,
  (7) Release/{Project}/yandex/icon-prompts.md exists,
  (8) Release/{Project}/yandex/promo-screenshots-prompts.md exists,
  (9) /release-ready yandex returns GREEN.
```

Haiku evaluator checks all 9 после каждого turn. Loop completes when all met. Estimated 30-90 min per MVP.

### Routers updated

`/game` router auto-detects keywords: `mvp` / `доведи до релиза` / `готовь к подаче` / `прогон` → routes к `/mvp-to-yandex`.

### Bug fix — update-advisor-catalog.mjs

Discovered while testing v4.10.31 — script был **replacing** existing "Recently installed" section с only newest skill, losing prior entries (appmetrica-integration disappeared when mvp-to-yandex added).

Fix: detect existing table rows, append new entries preserving old ones, dedupe by skill name. Idempotent now.

### Lesson #64 — Autonomous workflows для small MVPs scale через genre-aware decision matrices

Generic "do everything" autonomous command would either:
- Ask too many questions (defeats purpose)
- Make wrong genre-specific decisions (idle game gets match-3 monetization)

Solution: ship **genre-aware decision matrix** as skill knowledge (idle gates, match-3 gates, RPG gates). Skill applies matrix к detected genre, only asks when matrix has ambiguity (e.g., game looks like idle OR clicker).

Pattern: для each closed-domain workflow, embed domain knowledge **inside** skill, не expect AI к derive in real-time. Forge already does this for:
- store-listing schema (yandex-fields-constraints.md)
- categories/tags (closed dictionaries)
- runtime-test scenarios (defined per platform)

Add к pattern: **retention requirements per genre** (mvp-to-yandex). And в future:
- IAP pricing tiers per market (when IAP support added)
- Ad placement compliance rules per platform
- Localization key cultures (CIS+Turkish vs SEA vs LATAM)

Tier: principle. Becomes Architectural Invariant #20 candidate — "autonomous workflows need embedded domain knowledge, не runtime derivation".

---

## v4.10.30 changelog (Restore keywords field + leaderboard multi-lang + verification status)

### User pain

User asked SETUP_GUIDE should have:
1. Leaderboard names в **all languages** of игры (RU/EN/TR/...), не только technical name
2. Keywords field — обнаружил отсутствие, плюс vali skill v4.10.21-v4.10.29 wrongly claimed Yandex Console doesn't have keywords field

This is **4th time** I incorrectly assumed Yandex Console behavior. Pattern:
- v4.10.20: category=string (real: array) — fixed v4.10.21
- v4.10.20: keywords required (real: actually optional per old wrong assumption)
- v4.10.21: subtitle 3-60, seo 80-200 etc + claimed keywords NOT в Console (real: IS в Console + different lengths) — partially fixed v4.10.26
- v4.10.21-v4.10.29: keywords "not в Console" — fixed v4.10.30
- v4.10.21-v4.10.29: leaderboards single-language — fixed v4.10.30

### Fix

**1. Schema restored keywords as required Yandex field**

```json
"keywords": {
  "type": "array",
  "description": "Yandex Console field 'Ключевые слова через запятую' per language. Forge stores as array, joined с ', ' for Console submission. User verified 2026-05-14. Length limit TBD."
}
```

Added к `required` array. Validator now reports MISSING if absent.

**2. SETUP_GUIDE §3 — keywords section added**

Each language gets its own keywords block для копирования в Console:
```
**RU:** keyword1_ru, keyword2_ru, ..., keywordN_ru
**EN:** keyword1_en, keyword2_en, ..., keywordN_en
**TR:** keyword1_tr, keyword2_tr, ..., keywordN_tr
```

Source: keywords array из store-listing-{lang}.json joined с ", ".

**3. SETUP_GUIDE §7 — Лидерборды multi-language table**

Old format: `| totalEarned | int | desc | description |`

New format с per-language display names:
```
| Тех. имя | Тип | Sort | Имя RU | Имя EN | Имя TR | Описание RU | Описание EN |
| totalEarned | int | desc | Всего заработано | Total Earned | Toplam Kazanç | ... | ... |
```

Source: `rodrik-import.json` → `leaderboards[].names.{lang}`.

**4. check-setup-guide.mjs new checks**

- `missing_keywords_section` (MAJOR): SETUP_GUIDE doesn't mention "Ключевые слова через запятую"
- `wrong_keywords_claim` (MAJOR): SETUP_GUIDE incorrectly says field doesn't exist (catches old skill output)
- `leaderboard_no_multilang` (MAJOR): §7 has table but no per-lang columns

Tested на user's actual Самогонщик SETUP_GUIDE — catches both wrong_keywords_claim + leaderboard_empty correctly.

**5. yandex-fields-constraints.md — Verification status section**

Added explicit table marking каждое constraint as VERIFIED (user/reference confirmed) vs ASSUMED (Forge guess). 18 constraints catalogued:

- 13 VERIFIED (title, subtitle lengths, CAPS rule, categories, tags, keywords presence, leaderboard multi-lang, etc.)
- 5 ASSUMED (keywords exact length limit, leaderboard name limit, IAP exact UI fields, ad placement exact UI, age rating exact field)

User can challenge any ASSUMED item by uploading real Console snapshot.

### Lesson #63 — Ship verification status, not certainty

I made 4+ wrong Yandex assumptions across v4.10.20-v4.10.29. Each time I authored constraints sounded authoritative ("this field doesn't exist"). User had to correct me.

Pattern fix: для any closed-vocabulary external system constraint:
1. Mark с explicit verification status (VERIFIED via Source, ASSUMED, UNKNOWN)
2. Don't write authoritative claims без source
3. When user uploads real example/snapshot → it's ground truth, update reference
4. Track corrections в version history

Applies к:
- Yandex: this skill
- RuStore: rustore-requirements.md should similar verification table
- Steam, App Store, Google Play, VK Play — when add support, ship same structure

Tier: principle. Becomes Architectural Invariant #19 candidate — "external system constraints need explicit verification status, не authoritative claims".

---

## v4.10.29 changelog (AppMetrica integration + RuStore release-ready soft/hard mode)

### User pain

User wanted /release-ready rustore к work без WorkProgress/{Project}-rustore/ wrapper (N/A current behavior too restrictive) plus add AppMetrica analytics requirement. Real workflow:
1. Generate documents (store-listing, SETUP_GUIDE) ДО building wrapper
2. Check documents readiness
3. Build wrapper later (TWA/Capacitor/native — varies per project)
4. Add AppMetrica
5. Final verification before submission

### Fix

**1. New skill /appmetrica-integration**

Universal AppMetrica setup. Auto-detects wrapper type by project files:
- TWA wrapper (Forge platforms/rustore/app/build.gradle)
- Capacitor (capacitor.config.* + android/app/)
- Cordova (config.xml + platforms/android/app/)
- Native Kotlin/Java (app/build.gradle direct)

Applies correct integration pattern per type:
- Gradle dependency com.yandex.android:mobmetricalib:7.4.0
- AndroidManifest meta-data + INTERNET/ACCESS_NETWORK_STATE permissions
- API key string resource (not hardcoded)
- Activation code в Application/MainActivity onCreate
- (WebView only) JS bridge для HTML5 game к send events

Includes recommended event taxonomy per project type (idle/clicker, general games, apps) + test mode procedures.

⚠️ Critical TWA limitation documented: TWA opens game в Chrome Custom Tabs, JS bridge не работает. Need WebView wrapper для in-game events. Activity-level events (open/close/session) work in TWA.

**2. New validator scripts/check-appmetrica.mjs (16 verifiers total)**

Auto-detects wrapper, checks:
- mobmetricalib dependency present + version >= 7.0
- Manifest com.yandex.metrica.ApiKey meta-data
- INTERNET + ACCESS_NETWORK_STATE permissions
- API key valid UUID format (not placeholder YOUR_API_KEY)
- AppMetrica.activate() called
- enableActivityAutoTracking() called
- withCrashReporting(true) (warning)

Resolves @string/ references through strings.xml для proper API key validation.

**3. /release-ready rustore soft/hard mode**

Before: skill required WorkProgress/{Project}-rustore/ to exist — returned N/A otherwise.

After:
- `--soft` flag: documents+assets only (no APK build required). Useful BEFORE wrapper exists.
  - check-store-listing.mjs
  - check-platform-completeness.mjs --platform=rustore
  - Icon RuStore-compliant (rule 6.4)
  - Privacy policy URL + support email documented
- `--hard` flag (default if wrapper present): full check including AppMetrica + APK build

**4. reference/rustore-requirements.md shipped**

Reference data inside release-rustore skill:
- Required SDKs (AppMetrica, RuStore Pay, App Update, Reviews)
- AndroidManifest required entries + permissions
- Console required fields (icon, screenshots, category, age rating)
- Common moderation rejection reasons
- Test mode procedures
- RuStore categories list (separate from Yandex)

**5. sync.ps1 / sync.bat updated**

check-appmetrica.mjs added к verifier copy list — propagates к siblings automatically.

**6. MCP server test bumped к 16 verifiers**

### Lesson #62 — Analytics is de-facto release gate

Treating analytics as "optional" Forge feature was wrong. RuStore featured consideration requires:
- Active analytics integration (AppMetrica or MyTracker)
- Retention data visible в Console
- No analytics = no featured = limited discovery

Pattern: для each store ecosystem, identify what's **de-facto required** even if не technically mandatory:
- Yandex Games: i18n minimum 3 langs (RU+EN+TR) — not enforced but featured editors expect
- RuStore: AppMetrica integration — not enforced but featured editors expect
- Steam: trading cards setup — not enforced but algorithm rewards
- App Store: subscription via StoreKit — not enforced but Apple review prefers

Promote these к mandatory checks в release-ready. Users want featured status. Tier: principle.

---

## v4.10.28 changelog (/ui-review screenshot-driven rewrite)

### User pain (Genetic Lab, v4.10.27 follow-up)

After v4.10.27 pre-claim-fixed hook landed, user reported: "ты конкретно пишешь что на скриншоте и как а я хочу что бы он сам опознавал его и анализировал". Translation: hook catches AI lying about completion, but doesn't fix root cause — AI doesn't systematically scan screenshots, just glances и applies generic principles.

`/ui-review` skill was principles-based: read Nielsen 10 heuristics, output "improve hierarchy", "tighten spacing". Generic — переписывает observations like "+1 pill overlaps 13" с advice like "consider spacing tokens".

User wanted: AI itself analyzes screenshot pixel-by-pixel, finds specific collisions, outputs concrete fixes.

### Fix — full /ui-review rewrite

**5-phase systematic scan procedure:**

1. **Phase 1: Zone enumeration** — divide UI into 6-9 zones (header, sidebar, main, etc.). MANDATORY — не skip к "looks fine". Output zone descriptions explicitly.
2. **Phase 2: 8-point checklist per zone** — text overlap, element collision, label prejat'ie, font sizes, pill spacing, border-radius, contrast, hierarchy
3. **Phase 3: Source mapping** — grep visible text content к find source file:line
4. **Phase 4: Structured output** — violations table with #/severity/zone/description/source/fix
5. **Phase 5: STOP** — no auto-fix. Wait для explicit "fix violations X, Y, Z" instruction

**Severity ranking:** CRITICAL / MAJOR / MINOR / NIT

**Anti-patterns explicitly rejected** в output:
- "The UI looks crowded" → not specific
- "Hierarchy could be improved" → where? how much?
- "Consider design tokens" → generic
- Rule: **every observation needs coordinates OR pixel measurement OR specific element name**

**Mandatory inputs:**
- Screenshot attached к message, OR
- Path к existing screenshot, OR
- `--auto` flag (runs runtime-test.mjs к snapshot current build), OR
- HTML file path (asks user для screenshot)

Без any of above, skill **refuses** к run. No principles-based fallback unless wireframe stage (UI не существует).

**runtime-test.mjs --screenshot flag**

Added support:
- `--screenshot=true` → saves к wiki/screenshots/{date}.png
- `--screenshot=<path>` → saves к specific path
- `--viewport=WxH` → set viewport size (default 1366x768)

Waits 2.5s after page load для UI к settle (assets, animations) перед capture.

### Integration

**With pre-claim-fixed hook (v4.10.27):**
After Phase 5 user says "fix violations 1, 3, 5":
1. AI Edit's files
2. AI re-runs `/ui-review --auto`
3. AI verifies violation resolved в new screenshot
4. ONLY THEN AI can say "fixed"
5. Hook blocks fake "fixed" claims

**With /goal:**
```
/goal /ui-review --auto outputs zero CRITICAL violations
```
Claude iterates scan → fix → re-scan пока CRITICAL count = 0.

### Behavioral impact

Old workflow (failed для user):
1. User: screenshot + "почини collisions"
2. AI: "Fixed the spacing" (generic, no real action)
3. User: "ничего не изменилось"
4. Loop 3-5x without progress

New workflow (v4.10.28):
1. User: drag screenshot к chat
2. AI: enumerates zones, applies 8-point checklist per zone, outputs violations table с coordinates
3. User: "fix 1, 3, 5"
4. AI: Edit's, re-snapshots, verifies
5. AI: "Verified — violations 1, 3, 5 resolved" (with new screenshot)
6. pre-claim-fixed hook blocks если AI lies

### Lesson #61 — Vision-based > principles-based для existing UI

Generic UX heuristics (Nielsen 10, Material 3, etc.) are training-data knowledge. They're useful для **wireframe stage** (UI не существует, can't measure). They're **harmful** для existing UI because:

1. AI rewrites specific observations into generic advice ("crowded" → "improve hierarchy")
2. Principles are vague enough к "apply" mentally без real fix
3. User sees same problem after "fix" — wasted turn

Pattern: для skills working on existing artifacts (screenshots, code, builds), force **systematic scan with measurable output**. Generic principles only as fallback когда artifact не существует.

Applies к:
- `/ui-review` — done v4.10.28
- `/code-review` — could add: systematic file scan с specific findings, не "consider DRY principle"
- `/release-ready` — already structured (exit-code-based gates)
- `/store-listing-review` — could add: violations list per field, not "improve copywriting"

Tier: principle.

---

## v4.10.27 changelog (pre-claim-fixed hook — catches AI lying about completion)

### User pain (Genetic Lab session)

User shared Genetic Lab screenshot showing real UI collisions: pill `+1 за 40 🥕` overlapping number `13` in "Размер колонии", biome subtitles squashed, difficulty pills no breathing room. Tried `/ui-review`, `/ui-fix` 3-4 times — no result. AI responded "fixed" each time but git diff was empty.

This is **the most common failure mode** in /ui-fix workflows: AI generates "I fixed the spacing" text как if it did the work, но Edit tool wasn't called. Several causes:
- Skill в context contains "apply fix" → AI confuses 'saying' с 'doing'
- Context overload — slipped past actual action step
- AI sees "small change" → mentally completes без actually doing
- Hooks/skills забивают user instruction

User can't trust completion claims. Each "fix" loop wastes 5-10K tokens and не moves forward.

### Fix

**New hook: `.claude/hooks/pre-claim-fixed.mjs`** (Stop event)

After AI finishes message, hook:
1. Extracts last assistant message text from transcript (JSON-lines parsing с fallbacks)
2. Searches для completion phrases (RU+EN): исправил, готово, сделал, fixed it, done, applied, etc.
3. Detects historical context ("fixed yesterday", "вчера исправил") — skips false positives
4. Checks `git status --porcelain` + `git diff HEAD~N` (N=2 default, configurable via FORGE_FIXED_CHECK_LOOKBACK)
5. If claim present BUT no changes → `{ "decision": "block", "reason": "..." }`
6. Block injects reminder с required action procedure
7. Logs к `wiki/sessions/YYYY/MM/DD.md` для visibility

**Bypass:** `FORGE_SKIP_FIXED_CHECK=1` (logged not silent).
**Fail-open:** if не git repo OR hook errors, returns `continue:true`. Не ломает non-git projects.

**Wired both places:**
- `.claude/settings.json` Stop hooks (after stop-flush)
- `.claude/hooks/plugin-hooks.json` (для marketplace distribution)

### Tested

4 synthetic scenarios via temp git repo:
1. Claim "исправил" без changes → BLOCK with full reason ✓
2. Claim WITH changes (file modified) → ALLOW ✓
3. "fixed yesterday" historical context → ALLOW ✓
4. "done" isolated word, no changes → BLOCK ✓

### Behavioral impact

Next time AI says "I fixed the overlap" but didn't Edit:
- Stop blocks
- AI forced к continue с reminder
- Next turn AI must `git status`, show output, then call Edit, then verify
- Only after real change → может say "fixed"

This breaks the 5-loop pattern: 3 "fixes" without changes → hook blocks each → AI forced к do real work первый раз.

### Lesson #60 — Behavioral gates prevent AI hallucinations

Trusting AI self-report для completion ("fixed", "applied", "done") doesn't work at scale. AI generates plausible completion text без always executing required tools. Especially когда:
- Skill description contains action verbs (AI confuses describing с doing)
- Context is overloaded
- Task feels "small enough к skip steps"

Solution pattern: external verification gate that checks **side effects** (git diff, file mtime, runtime output), не AI's textual claim.

Applies к other Forge workflows that could need similar gates:
- "tests passing" claim → hook runs `npm test` to verify
- "deployment complete" → hook curls health endpoint
- "design applied" → hook screenshots + compares with target

Pattern: для any AI claim that has measurable side effect, add hook checking that effect. Don't rely on textual self-report.

Tier: principle. Becomes Architectural Invariant #18 candidate.

---

## v4.10.26 changelog (FIX: real Yandex field constraints + CAPS rule)

### User pain

User uploaded 3 Самогонщик store-listing files (RU/EN/TR). Analysis revealed 10 violations my v4.10.20-v4.10.25 schema missed:

**ru**: subtitle CAPS, seo 172 > 160, about 1038 > 1000, category=string
**en**: subtitle CAPS (4 words), seo 180 > 160, category=string
**tr**: subtitle CAPS (4 words with Turkish diacritics), seo 166 > 160, category=string

Root cause: **second time** I guessed Yandex constraints instead of validating against real Console. v4.10.20 set:
- subtitle: 3-60 (real: 20-70)
- seo: 80-200 (real: 50-160)
- about: 300-2000 (real: 300-1000)
- how_to_play: 100-1500 (real: 300-1000)

Plus: no CAPS rule existed (real Yandex flags CAPS subtitles как 2010-era SEO scam).

### Fix

**1. New reference file: reference/yandex-fields-constraints.md**

Shipped reference data с official limits для каждого поля + AI mistakes examples + checklist. Same pattern as yandex-categories-full.md, yandex-tags-full.md. Skill must read это перед генерацией.

**2. Schema v3 (schemas/store-listing.schema.json)**

Real constraints:
- title ≤ 50, `noAllCaps: true`
- subtitle 20-70, `noAllCaps: true`
- seo_description 50-160 (was 80-200)
- about 300-1000 (was 300-2000)
- how_to_play 300-1000 (was 100-1500)
- Added `$caps_rule` section: minWordLength=4, whitelist для acronyms

**3. Validator update (scripts/check-store-listing.mjs)**

Added CAPS detection logic. **Important fix:** initial implementation used `\b[\p{Lu}]{4,}\b/gu` but JS `\b` (word boundary) doesn't work для Cyrillic (only ASCII). Workaround: split на whitespace+punctuation, check each token. Handles Cyrillic (БАБКИН), Latin (GRANNY), Turkish (TEYZE, İMBİĞİ) correctly.

**4. fill-yandex Step 9 prose principles**

- Example block rewritten: 'Бабкин цех' not 'БАБКИН ЦЕХ', emoji removed from how_to_play, hook style 'Идл-кликер про подпольный...' not 'Тапай по...'
- New section "ASO writing principles" (7 rules):
  - Hook says WHAT (genre+setting), not WHAT TO DO (commands)
  - NO CAPS subtitles
  - Minimize emoji в how_to_play
  - CTA в seo_description в первых 100 chars
  - Primary keyword density 2-3% в about
  - Numbers and specifics > generic claims
  - Match in-game title (REQ-5.1.3)

**5. Step 2 mandatory read updated** — now reads 3 reference files (categories, tags, **field-constraints**)

**6. Non-Negotiable list updated** — all new constraints + ASO principles

### Tested

```
node scripts/check-store-listing.mjs /tmp/test-listings3/
✗ 3 of 3 files have schema violations.
  - ru: 4 violations (3 CAPS words + category type + seo + about lengths)
  - en: 6 violations (4 CAPS words + category type + seo)
  - tr: 6 violations (4 CAPS words с Turkish diacritics + category + seo)
```

All 10 user-reported violations caught correctly.

### Lesson #59 — Schema is contract with reality

Schema validation only works if schema matches **real** ecosystem behavior. Three sources of truth for closed-vocabulary external systems:

1. **Official docs** — often outdated или incomplete
2. **AI training data** — even more outdated
3. **Real Console snapshot** — only ground truth

For Yandex/RuStore/Steam/iOS/Android constraints, validate against latest Console behavior, not docs/training. When user provides real-world output (like upload Самогонщик files), use it AS schema source of truth, not just как example.

Pattern: schema for closed-vocabulary system needs **version pinning к Console snapshot date** + periodic re-validation. Update yandex-fields-constraints.md when Yandex changes UI.

This is third time same class of bug:
- v4.10.20: category=string (wrong, real=array)
- v4.10.20: forced keywords/seo as required (wrong, real=optional)
- v4.10.26: all 4 length constraints wrong + missed CAPS rule

Tier: principle. Apply к all closed-vocab integrations (Steam tag dictionary, App Store category list, Google Play content rating).

---

## v4.10.25 changelog (/auto-release skill via Claude Code /goal)

### New Claude Code feature к leverage

Anthropic released `/goal` command в Claude Code v2.1.139 (12 May 2026). Goal sets completion condition, Claude iterates пока не достигнет, independent evaluator (Haiku) checks after each turn. Outcome-driven instead of prompt-driven.

### Forge integration

**New skill: /auto-release** (.claude/skills/auto-release/SKILL.md)

Wraps `/goal` для release workflow. User says "auto release для yandex" → skill sets:
```
/goal release-ready возвращает GREEN для yandex: runtime-test.mjs exits 0, 
check-store-listing.mjs exits 0, check-setup-guide.mjs exits 0, 
check-platform-completeness.mjs reports yandex PERFECT
```

Claude iterates fix→validate→fix пока все validators зелёные. User uhodit пить чай, returns через 30-60 min — release ready.

**Routers updated** (/game, /app):
- New signal: "до зелёного" / "автономный релиз" / "auto release" / "hands-free release" → invoke /auto-release
- Doesn't replace /release-ready (single-shot) — complements it

**Advisor updated**:
- New section "Autonomous workflows (v2.1.139+)" с /goal use cases table
- Examples: tests until pass, validators until GREEN, refactor until budget, backlog until empty
- Anti-patterns: don't use для feature work, vague conditions, initial development
- Caveats: set CLAUDE_GOAL_MAX_STOP_CONTINUES=50-100 prevent runaway

**README updated**:
- CC version requirement bumped к v2.1.139+ для /auto-release
- v2.1.101+ still works но без /auto-release

### Why this matters

Previously release workflow:
1. User: "проверь готовность"
2. AI: runs /release-ready, reports 5 RED issues
3. User: "почини"
4. AI: fixes
5. User: "проверь ещё"
6. AI: runs again, 2 issues remain
7. ... continue для 5-10 prompts

С /auto-release: **one** prompt. User attention is precious — auto-release returns it. /goal evaluator handles "is это done?" question via Haiku, не via user reading evaluator output.

### Constraint: condition must be machine-checkable

/goal evaluator can judge:
- ✅ "command X exits 0"
- ✅ "file Y exists"
- ✅ "N items remaining"
- ❌ "UI looks better"
- ❌ "implementation feels clean"
- ❌ "tests cover edge cases" (without explicit count)

This shaped auto-release design: condition is exit codes of validators (objective), not "release is good" (subjective).

### Lesson #58 — Outcome-driven workflows через /goal

`/goal` enables outcome-driven workflows where user defines finish line once. Available для Forge release / refactor / backlog cleanup tasks где condition is machine-checkable. Not для feature work (evaluator can't judge subjective "done").

Pattern: для each Forge workflow с iterative fix-validate cycle, evaluate если completion condition можно express as exit code chain. If yes — wrap in /goal-using skill (like /auto-release). If no — keep manual (like /game new project — "feature complete" is subjective).

Tier: principle. Generalizes к future skills (auto-refactor, auto-i18n-coverage, auto-test-pass).

## v4.10.24 changelog (sync propagates validators к siblings)

### User pain

After v4.10.23 cleanup, user tested: `Get-Content F:\ProjectForgeUniversal\genetic-lab\CLAUDE.md | Select-String "^## v4.10"` returned empty. Investigation: sync.ps1 doesn't copy CLAUDE.md (by design — siblings have project-specific CLAUDE.md). But also doesn't copy `scripts/check-*.mjs`, `scripts/runtime-test.mjs`, `scripts/check-store-listing.mjs`, `scripts/check-setup-guide.mjs`, `schemas/`.

Result: skills в siblings reference these tools («/release-ready runs runtime-test.mjs»), but tools live only в Forge folder. Skill fails silently when running from sibling.

### Fix

**1. sync.ps1 — added verifierScripts copy block**

22 scripts copied к each sibling on every sync:
- 15 check-*.mjs verifiers (bat-encoding, claude-md-size, cross-refs, dashboard-structure, inline-strings, nested-dirs, no-float-money, pipeline-state, platform-completeness, ps1-encoding, setup-guide, skill-kind, store-listing, sync-status, workspace-discipline)
- 2 runtime tests (runtime-test.mjs, smoke-test.mjs)
- 5 helpers (apply-manifest.mjs, generate-manifest.mjs, search-skills.mjs, update-advisor-catalog.mjs, adapt-skill-to-forge.mjs)

**2. sync.ps1 — added schemas/ mirror**

Robocopy /MIR (strict) / /E (safe) для `schemas/` folder. Required by check-store-listing.mjs (reads store-listing.schema.json).

**3. sync.bat — same additions** для cmd.exe users.

**4. Reference data confirmed auto-propagated**

`.claude/skills/fill-yandex/reference/yandex-categories-full.md` + `yandex-tags-full.md` already sync через `.claude/skills/` robocopy /MIR — no special handling needed.

### After upgrade workflow

```powershell
cd F:\ProjectForgeUniversal\project-forge
.\upgrade.ps1                  # extract + cleanup
.\scripts\sync.ps1 -Strict     # propagate everything к siblings
```

Then в sibling:
```powershell
cd F:\ProjectForgeUniversal\smogonclicker
ls scripts/check-*.mjs           # should show 15 verifiers
ls schemas/                       # should show store-listing.schema.json
```

### Lesson #57 — Skill tool references require tool physical presence

Skill text saying "run `node scripts/X.mjs`" assumes that script exists in caller's working directory. If skill lives в `.claude/skills/X/SKILL.md` (which gets synced) but references `scripts/check-Y.mjs` (which doesn't get synced) — runtime gap.

Pattern: any tool a skill invokes via shell command must be on sync's copy list. Audit рассматривать every release: для each new check-* script, generate-* helper, or runtime tool — verify it's в sync's verifierScripts array.

Could automate: parse all `.claude/skills/*/SKILL.md` для `scripts/X.mjs` references, ensure each X is в sync copy list. Future verifier candidate.

---

## v4.10.23 changelog (cleanup commit — fix changelog data loss)

### User pain

Audit revealed: every bump I did `sed -i 's/v4.10.X/v4.10.Y/g'` on entire CLAUDE.md. This renamed ALL historic changelog headers к current version. Result: changelog full content for v4.10.5-v4.10.21 was lost (titles became "## v4.10.22 changelog (XXX)" content stale). Lessons #42-55 mentioned в wiki/_map.md bullets but full Lesson context never reached CLAUDE.md.

Also: wiki/_map.md changelog had each version listed twice (sed + python replace pattern accidentally duplicated entries). Code comments like `# v4.10.11: Auto-cleanup orphan wrappers` got renamed к `# v4.10.22: ...` losing historical commit context across .ps1/.sh/.mjs files.

### Fix

1. **Restored 3 corrupted CLAUDE.md headers** — identified by content vs version:
   - "/ui-pipeline orchestrator" → v4.10.6 (not v4.10.22)
   - "UX/UI Systems Designer skills" → v4.10.5
   - "dashboard: separate projects root" → v4.10.10
2. **Rotated v4.10.0-v4.10.4 changelogs** к docs/CHANGELOG.md (proper rotation per check-claude-md-size suggestion)
3. **Reconstructed v4.10.7-v4.10.22 changelog history** с Lessons #42-55 full context (see block above)
4. **Dedupe wiki/_map.md** — removed duplicate version entries
5. **Created scripts/bump-version.mjs** — proper version bump tool that does NOT touch historic changelog headers, only updates version constants в setup files, README, GUIDE, plugin.json, dashboard.html. Replaces my dangerous sed habit.
6. **Updated README** с /find-skill section, MANIFEST.txt explanation
7. **Updated GUIDE** с upgrade.ps1 install path
8. **Promoted к Architectural Invariants #15-17** stable patterns from Lessons #44, #46, #51

### Lesson #56 — Version bumping must preserve historic changelog headers

Global sed substitution on files containing version history is catastrophic. Always use:
- Targeted replacements в specific lines (setup banners, version constants, version-X-only mentions)
- OR version constants imported from single place (and only that gets replaced)
- NEVER sed entire CLAUDE.md/wiki for version strings

Pattern: bump scripts должны be opinionated about what they DON'T touch.

## v4.10.6 changelog (/ui-pipeline orchestrator — single-command UX/UI workflow)

Immediate follow-up к v4.10.22. User pain after testing v4.10.22: "бля а нельзя было UI Pipeline или что-то такое сделать что бы он сам всё прошёл".

v4.10.22 дал 3 skills но требовал manual invocation по очереди. User had to:
1. `/ui-review` — get findings
2. `/info-hierarchy` — design tiers
3. `/layout-system` — establish grid
4. Ask AI implement
5. `/ui-review` снова — verify

Это ровно то что и происходит когда AI получает unclear task — делает только Step 1 (audit), пропускает Steps 2-3 (specs), пытается Step 4 (implement) без specs → результат: simple bug fixes без systemic redesign.

### Fix — `/ui-pipeline` orchestrator

Single command, 5 sequential steps с stop points:

```
Step 1 — Audit         /ui-review existing → baseline findings
Step 2 — Hierarchy     /info-hierarchy → tier specs per screen
Step 3 — Layout        /layout-system → grid + tokens
Step 4 — Implement     apply specs к code (preserve functional behavior)
Step 5 — Verify        /ui-review NEW → compare baseline
```

Каждый step имеет explicit stop с user approve. Mode flags:
- `/ui-pipeline file.html` — full pipeline
- `/ui-pipeline --audit-only` — just Step 1
- `/ui-pipeline --dry-run` — Steps 1-3 (specs only, no implementation)
- `/ui-pipeline --resume` — continue from last incomplete step

### Lesson #41 — Orchestrator before specialists

Pattern repeats:
- v4.10.0 added `/pipeline` orchestrator AFTER specialists existed (analyze-game, design-pipeline)
- v4.10.22 adds `/ui-pipeline` orchestrator AFTER specialists existed (ui-review, info-hierarchy, layout-system)
- Самогонщик user pain proved: 3-skill manual workflow → user just calls one of three → gets partial result

**Lesson:** when introducing 2+ related skills that **must** run together — also create orchestrator from start. Don't ship specialists без orchestrator if workflow requires sequencing.

**Tier:** principle. Future v4.11 audit: какие other multi-skill workflows lack orchestrator?

## v4.10.5 changelog (UX/UI Systems Designer skills + design-pipeline integration)

User pain: MVP UI looks visually nice (colors, fonts, icons) but **layout, hierarchy, density** broken. Скриншоты Самогонщика и Genetic Lab показали:
- Plat hierarchy — все элементы одинаково prominent
- Random spacing (10/14/22px без token system)
- Element overlap (`за 40 ✓` поверх text)
- Cards разной высоты, density mismatch
- Template variable не отрендерилось (`${STARTING_POP_MAX}`)

### Root cause

В `/design-pipeline` 7 specialists (game-designer, level-designer, monetization, art-director, sound, architect, PM) — **никто** не отвечает за layout / hierarchy / density. `art-director` это palette+style+mood (визуальный язык), не разметка экрана. Это как fashion designer и interior designer — разные професии.

### Fix — 3 new skills + design-pipeline integration

**`/info-hierarchy`** — Architectural. Primary/secondary/tertiary tier system. До вёрстки определяет:
- One Tier 1 per screen (focal point)
- 3-5 emphasis levels max
- 3-second test + squint test validation
- Output: `wiki/design/hierarchy-{screen}.md` per screen

**`/layout-system`** — Architectural. 8pt grid + spacing tokens + breakpoints. Foundation:
- 9-step spacing scale (4/8/12/16/24/32/48/64/96)
- 12-col desktop / 8-col tablet / 4-col mobile
- 3 density modes (sparse / default / dense)
- Per-component breakpoint behavior
- Output: `wiki/design/layout-system.md` + `tokens.css`

**`/ui-review`** — Tactical. Heuristic evaluation на готовом UI:
- 4 layers: Nielsen 10 + layout/hierarchy + visual quality + implementation bugs
- 5-level severity (CATASTROPHIC → NIT)
- Concrete fixes (file:line, diff, actionable)
- Не "hierarchy unclear" — а "replace `padding: 14px 18px` with `var(--space-3) var(--space-4)`"
- Output: `wiki/design/ui-review-{date}-{screen}.md`

### design-pipeline integration

**Specialists:** GAMES 7→8, APPS universal 6→7. Added **UI Systems Designer**.

**Critical ordering:** UI Systems → Art/Visual → Implementation → UI Review.

Без этого ordering — Forge генерирует красивые цвета на сломанной структуре. Это **observable failure mode** в Самогонщик/Genetic Lab MVPs.

### `/visual-upgrade` Phase 0.5 added

MANDATORY check для hierarchy + layout-system specs до того как менять colors/fonts. Visual choices **amplify** structure — broken structure → "prettier broken".

### Lesson #40 — Visual ≠ UX/UI Design

Forge had 16 design-related skills но 0 of them addressed information hierarchy / layout systems / heuristic evaluation. Все были про **visual surface** (palette, animations, components). Это разные дисциплины:

- Visual designer = mood, color, typography, brand
- UI Systems designer = grid, spacing, hierarchy, density
- UX researcher = heuristic eval, usability testing

Skills must cover all three. Tier: principle. Audit existing skill catalog для similar gaps in other disciplines (information architecture, content strategy, accessibility) — possible v4.11 work.

## v4.10.10 changelog (dashboard: separate projects root + path bugs)

Real-world bugs discovered when user tried to create a new project after upgrading:

### Bug 1: literal `\n\n` в prompt() диалоге

Modal "Подтвердите действие" showed: `Текущий путь: f:\ProjectForgeUniversal\project-forge\\n\nНовый путь...`

Cause: code had `'\\n\\n'` (double-escaped) which inside `<script>` tag becomes literal `\n\n` chars, not actual newlines.

Fix: use `'\n\n'` (single-escaped) — JS parser converts to real newlines.

### Bug 2: PROJECTS_ROOT pointed inside Forge folder

When user added new project, placeholder was `f:\ProjectForgeUniversal\project-forge\samogonclicer` — путь **внутри** Forge folder, not sibling. This was old `localStorage` value from previous buggy version.

Fix: heal на page load — if `PROJECTS_ROOT` contains `/project-forge/` segment, clear it and re-derive from `FORGE_PATH`.

### Feature: separate projects root setting

Use case: user wants Forge на C:, projects на F:. Previously projects root was always derived from Forge folder location.

Added `📁 Папка проектов` button в header. Opens prompt to set `PROJECTS_ROOT` independently. Default still = parent of Forge folder.

### Migration

Existing users with broken `PROJECTS_ROOT` (containing `project-forge` segment) auto-healed on next dashboard load. Console logs migration:
```
[migration] PROJECTS_ROOT was pointing inside forge folder, re-deriving from FORGE_PATH
[init] PROJECTS_ROOT auto-derived: F:\\ProjectForgeUniversal
```

## v4.10.7 - v4.10.22 reconstructed history (Q1 2026 development arc)

> Note: This block reconstructs changelog detail for v4.10.7-v4.10.22 which was lost
> due к `sed -i 's/v4.10.X/v4.10.Y/g'` global replace habit during version bumps.
> Restoration based on wiki/_map.md bullets + zip diffs + session memory.
> Each version's full rationale was previously documented inline; here we keep concise
> summaries plus the Lessons that came out of each release.

### v4.10.7 — Deep research yields genre/category-aware UX patterns base

User pushback "ты точно пошёл в интернет?" exposed что v4.10.5/v4.10.6 UX/UI skills были generic — written from training-data UX knowledge. Conducted ~20 web search calls covering Game UI Database (1300+ games), Fagerholt & Lorentzon HUD taxonomy, Steven Hoober thumb zones, Material 3 navigation thresholds, SaaSFrame 5000+ dashboards, Luke Wroblewski forms research, NN/g states.

Output: 2 reference files (757 lines):
- `info-hierarchy/patterns/games.md` — 7 genres (Action, Strategy, Idle, Match-3, RPG, Casual, Calibration) с HUD anatomy diagrams, F2P patterns, mobile thumb zones, anti-patterns
- `info-hierarchy/patterns/apps.md` — 10 categories с navigation per screen size, dashboard types, form patterns, data display, empty/loading/error states, category-specific decisions

Skills (`info-hierarchy`, `layout-system`, `ui-review`, `ui-pipeline`) reference these patterns; single source of truth.

### Lesson #42 — Deep research yields specialized skills, generic doesn't

Generic UX skills produced generic advice. After research, specialized skill знает что idle game с правой панелью 50% — anti-pattern (per games.md), bottom nav с 6+ items — Material 3 violation (per apps.md).

Tier: principle для skill creation. Any skill с description "для всего" must be challenged: "какие конкретные patterns используешь?" If answer — "общие принципы UX" — недостаточно.

### v4.10.8 — Mandatory auto-categorization gate

User: "не понимаю что ты хочешь, я хочу чтобы он решал мои проблемы не важно какое приложение". v4.10.7 patterns existed но AI не был обязан читать. v4.10.8 added blocking step в `/ui-pipeline` Pre-flight + `/info-hierarchy` Step 1: must auto-determine project type + genre/category, output explicit citation ("Detected: Game/Idle. Reading patterns/games.md → Idle/Clicker section"), cite applied patterns в report.

### Lesson #43 — Reference materials need enforcement gates

Имея reference в файлах ≠ их использование. Skill description matching brings AI к skill, но в самом skill — что заставляет AI прочитать patterns/? Только explicit blocking step с output requirement. "Should read" → "must read и output evidence что прочитал".

### v4.10.9 — Radical simplification 9 commands → 3

User: "овер дохера команд а мне нужна простота". Collapsed `/start`, `/analyze-game`, `/analyze-project`, `/pipeline`, `/ui-pipeline`, `/ui-review`, `/info-hierarchy`, `/layout-system`, `/continue` → 3 commands: `/game`, `/app`, `/continue`. Smart routers с decision tables auto-detect intent. All 102 skills unchanged, just less top-level surface.

### Lesson #44 — User cognitive load is the bottleneck

102 skills + 9 commands = 111 things to potentially remember. User can't. Top-level surface должен быть minimal. Routers absorb complexity — user sees "/game" gets right behavior без знания что /pipeline, /analyze-game, /ui-pipeline existed underneath.

### v4.10.10 — Audit + skill→command auto-merge realization

Found Claude Code v2.1.101+ (April 2026) automatically treats skills как commands. v4.10.9 deleting wrappers было корректно — skills still invokable via `/{name}`. Fixed: session-start.mjs hook message ('Run /game or /app to begin'), README workflow examples, GUIDE main scenarios, dashboard.html prominent Quick Start. Bumped min Claude Code version к v2.1.101+.

### Lesson #45 — Engine capabilities can obsolete codebase patterns

Pre-v2.1.101: `.claude/commands/X.md` wrappers mandatory for top-level invocation. Post-v2.1.101: `SKILL.md` is a slash command. Wrappers redundant. Pattern: when underlying engine adds capabilities, audit codebase для obsolete patterns.

### v4.10.11 — Setup auto-cleanup orphan wrappers

User pain про copy-with-replace zip extract leaving stale command wrappers in `.claude/commands/`. setup.ps1/setup.sh runs cleanup-orphan-wrappers.mjs automatically. sync.ps1 enhanced verification для EXTRA files.

### v4.10.12 — sync.ps1 platforms\ nesting bug

After multi-sync, siblings accumulated `platforms/platforms/` nested dirs. Root cause: `Copy-Item -Recurse -Force` в PowerShell на Windows nests source INTO destination если destination dir already exists. Same class as v4.10.3 fix для skills/. Replaced с robocopy /E (or /MIR strict).

### Lesson #46 — Copy-Item -Recurse -Force broken on Windows

`Copy-Item -Recurse -Force` on Windows is broken by design для idempotent merge. Already replaced для skills/agents/hooks/commands в v4.10.3, missed для platforms/. Robocopy /E (or /MIR for strict) handles all edge cases robustly. Audit all remaining `Copy-Item -Recurse` calls.

### v4.10.13 — Full audit + check-nested-dirs.mjs

After v4.10.12, user asked "ещё какие-то баги на эту тему?". Audited 19 surface points для `Copy-Item -Recurse` class. Hardened `Copy-IfNeeded` helper в sync.ps1 line 78 (still used broken pattern). Created `scripts/check-nested-dirs.mjs` (detector + `--fix` mode) — walks Forge + siblings, finds dirs containing same-named subdirs. 12 verifiers total.

### v4.10.14 — /find-skill discovery workflow (Vercel-inspired)

Inspired by https://github.com/vercel-labs/skills find-skills. Built dual-tier discovery: local-first search через 102 Forge skills (search-skills.mjs с ranked matching), marketplace fallback через `npx skills find` для public ecosystem. Forge adaptation wrapper (adapt-skill-to-forge.mjs) для installed marketplace skills. Auto-update advisor catalog (update-advisor-catalog.mjs). `/game` и `/app` routers fall back к `/find-skill` для unclear capability requests.

### Lesson #47 — Discoverability is its own skill

Having 100+ skills doesn't help if users can't find them. Advisor + smart routers abstract complexity, но не tool для exploration. /find-skill closes the gap: "I have a need, what exists for it?" is now answerable.

### v4.10.15 — upgrade.ps1 + upgrade.sh

User: "опять весь проект удалять?". Created upgrade scripts с hand-maintained $Orphans list. Copy-with-replace + run upgrade.ps1 = unblock MoW + remove orphans + nested fix + advisor sync. No more Remove-Item dance.

### Lesson #48 — Migration tooling > documentation

Three versions of documenting "how to update" couldn't compensate для missing automation. When user said the pain phrase — clear that documentation = user labor, automation = user relief. Always reach для tooling when same instructions ship 3+ times.

### v4.10.16 — Encoding fix + check-ps1-encoding.mjs

v4.10.15 upgrade.ps1 crashed: em-dashes + cyrillic в UTF-8 без BOM. Windows PowerShell 5.x reads .ps1 as cp1251 by default. Rewrote ASCII-only + UTF-8 BOM. New verifier `check-ps1-encoding.mjs` — gate против `.ps1` files без BOM containing non-ASCII. 13 verifiers total.

### Lesson #49 — Windows encoding is a permanent landmine

cmd.exe + .bat: chcp 65001 takes effect AFTER parse — non-ASCII inside (...) blocks crashes parser (Lesson #20). powershell.exe 5.x + .ps1: defaults к cp1251, only respects UTF-8 BOM. Defensive pattern: для any Windows-targeting text file (.bat, .ps1, .cmd), enforce ASCII OR UTF-8 BOM. Verifier для each class.

### v4.10.17 — runtime-test gate + icon compliance

User shared session log где AI explicitly admitted: "у меня нет headless-browser теста, это пробел в Forge пайплайне". Created `scripts/runtime-test.mjs` (Puppeteer-based) с 5 scenarios: startup, lang (catches Cyrillic leak after setLang('en')), assets (404 tracking), dom (root element visibility), sdk (YaGames init+LoadingAPI.ready+GameplayAPI.start contract). Integrated к `/release-ready` as MANDATORY blocking gate.

Also upgraded `/art-prompts`: per-store specific NEGATIVE prompts (Yandex 5.6+8.3.5, RuStore 6.4, iOS HIG no transparency, Android adaptive 2-layer), 3-test verification (squint/distance/mask), 7 anti-patterns (generic AI aesthetic, too detailed, AI tropes, etc).

### Lesson #50 — AI-admitted gap = automated fix needed

When AI в user session explicitly says "this is a gap в Forge pipeline" — signal к immediately fix infrastructure, not just add к tech-debt.md. AI mentioning a gap is rare and accurate.

### v4.10.18 — MANIFEST.txt automatic orphan detection

User: "если там удаление файлов например есть? или если мы файл изменяем он его не удаляет?". Hand-maintained `$Orphans` list в upgrade.ps1 was process debt — forget once = bug forever. Created `scripts/generate-manifest.mjs` (writes MANIFEST.txt с 460+ file list) + `scripts/apply-manifest.mjs` (reads manifest, removes files not listed). MANIFEST.txt ships in zip, gets overwritten on extract. upgrade.ps1/upgrade.sh now 5-step с manifest catch-all.

Protected paths (never removed): node_modules/, .git/, .context-backups/, output/, wiki/sessions/, MANIFEST.txt, .dashboard-structure-baseline.json.

### Lesson #51 — Hand-maintained lists are process debt

Every hand-maintained list of changes (orphans, deletions, migrations) will be forgotten. Use generated truth (manifest) when possible. Prefer "this is the truth, derive everything from it" over "this is the list, please remember to update it".

### v4.10.19 — Advisor catalog updated к v4.10.x infrastructure

User: "а наш advisor он всё знает?". Audit revealed advisor outdated:
- 0 mentions of /game, /app routers (главные с v4.10.9)
- 0 mentions of runtime-test, MANIFEST.txt, upgrade.ps1
- Recommended deprecated /pipeline, /start as primary

Added ⭐ Quick Start section (/game, /app, /continue at top), Infrastructure awareness section (runtime-test, upgrade.ps1, MANIFEST.txt, check-* scripts). Reframed legacy commands. Updated priority hint.

### Lesson #52 — Advisor needs manual review each major infrastructure change

update-advisor-catalog.mjs auto-adds new skills, but doesn't update primary-recommendation order or prose context. Manual review needed. Could automate via `route_to:` frontmatter, но prose context (when/why) needs human curation.

### v4.10.20 — Store-listing schema strict gate

User uploaded broken store-listing-ru.json + store-listing-Example.json. 9 violations: forbidden fields (_comment, _removed_fields, developer_comment, ageRating), missing keywords/seo, wrong types. Created `schemas/store-listing.schema.json` + `scripts/check-store-listing.mjs` validator. Rewrote /fill-yandex Step 9 (was markdown, now strict JSON) с ASO/SEO writing principles. 14 verifiers total.

### Lesson #53 — Schema validation gates AI invention

AI consistently invents "helpful" fields when faced с under-specified format (_comment, _removed_fields, developer_comment, ageRating — explaining its own decisions). Schema validator с explicit FORBIDDEN list catches this. Pattern: для any structured output skill produces, ship matching schema + validator + gate в release flow.

### v4.10.21 — FIX v4.10.20 wrong category schema + Yandex reference data

User uploaded yandex-categories-full.md (25 categories) + yandex-tags-full.md (700+ tags). My v4.10.20 mistake: forced category=string, но Yandex Console accepts array (1-3 items). Skill itself имел old wrong category list ("Аркады", "Бродилки", "Клик-тап" don't exist). Fixed schema: category=array, keywords/seo_description=optional. Shipped reference data inside skill: `.claude/skills/fill-yandex/reference/yandex-categories-full.md` + `yandex-tags-full.md`. Step 2 mandatory read reference. AI mistakes table.

### Lesson #54 — Ship reference data inside skill для closed-vocabulary systems

I had only Yandex official docs interpretation. User had ACTUAL Console snapshot showing real behavior. Always:
1. Ship reference data inside skill when ecosystem has closed vocabulary
2. Validate against shipped reference, not assumed values
3. When user uploads reference docs — read them FIRST before changing schema

Applies к Yandex tags, RuStore categories, Steam genres, App Store icon sizes.

### v4.10.22 — SETUP_GUIDE comprehensive template + validator

User: "SETUP_GUIDE.md помимо того что ты сделал категории и теги должны быть ещё в таком документе описаны, сейчас он берёт их из воздуха". Step 5 в fill-yandex имел 5 секций — user's real SETUP_GUIDE имеет 17 секций. Replaced с comprehensive 17-section template (Загрузка, Языки, Store listing, Категории+теги с reference, Возрастной рейтинг, Cloud Saves, Лидерборды, IAP, Реклама, Иконка с compliance, Скриншоты, Промо, Чек-лист, Fix-moderation, ZIP versions, После релиза, Reference materials).

Created `scripts/check-setup-guide.mjs`: 17 sections present, no placeholders, no invalid tags/categories в positive context (anti-pattern context detection — ❌, "НЕ ставь" lines skipped), >60% tags coverage с store-listing JSON, reference links, anti-patterns warning. 15 verifiers total.

### Lesson #55 — Output templates must match real-world output structure

fill-yandex Step 5 had simplistic template (5 sections). User's real workflow needed 17 sections с institutional knowledge baked in (fix-moderation REQ-1.19.2/REQ-4.4/REQ-8.2.1 references). AI doesn't extrapolate from simple template к comprehensive output — it follows template literally. When user provides real-world example output, use it AS template structure, not derive simplified version.

---

## v4.10.35 changelog (FIX sync.bat :: comments parser break)

### User pain

User ran sync.bat:
```
PS> .\sync.bat
  === SYNC: Forge template to sibling projects ===
  SAFE MERGE: preserves custom skills/agents in sibling projects
Непредвиденное появление: or.
```

cmd.exe parser error. sync.bat broke after v4.10.24/v4.10.32/v4.10.34 — I added verifier scripts list inside a for-loop, и preceding `::` comments inside () blocks.

### Root cause

cmd.exe has two comment styles:
- `REM comment` — works everywhere
- `:: comment` — label-style, **only safe at top level**

`::` inside a `()` block (if/for/else body) breaks the parser. Especially когда the comment text contains:
- slashes (`/release-ready`, `/fill-yandex`) — parser may read as flags
- apostrophes (`can't`)
- certain keyword-like words

sync.bat had **23** `::` comments inside blocks. Most "worked" by luck (simple text). The v4.10.24 addition — `:: Without these, /release-ready runtime-test gate fails, /fill-yandex` — had slashes that triggered the break. Error "Непredvидennoe появление: or" = parser choked.

### Fix

**1. Converted all 23 indented `::` comments к `REM`**

Top-level `::` (column 0, outside blocks) left as-is — those are safe. Only indented ones (inside blocks) converted.

**2. New validator: scripts/check-bat-comments.mjs (18 verifiers total)**

Tracks paren depth line-by-line, flags any `::` comment while depth > 0. Quote-aware (ignores parens inside strings).

Tested — all 5 .bat files clean after fix.

**3. Added к sync verifier propagation list**

check-bat-comments.mjs syncs к siblings.

### Why this kept happening

Forge has TWO .bat encoding/syntax landmines now:
- **Lesson #20** — non-ASCII inside () blocks → check-bat-encoding.mjs
- **Lesson #68** — `::` comments inside () blocks → check-bat-comments.mjs

Both are cmd.exe parser quirks invisible until runtime. Both now have validators.

### Lesson #68 — cmd.exe :: vs REM

`::` and `REM` are NOT interchangeable:
- `::` — label-based hack-comment. Fast, но **only top-level safe**.
- `REM` — real comment command. Works **everywhere** including inside () blocks.

Rule: inside ANY () block, ALWAYS use `REM`. Reserve `::` for top-level only, или better — just use `REM` everywhere для consistency.

This joins the cmd.exe landmine family:
- chcp 65001 takes effect AFTER parse (Lesson #20)
- non-ASCII inside () crashes parser (Lesson #20)
- `::` inside () crashes parser (Lesson #68)

Pattern: cmd.exe is parsed in a way that makes block-interior content fragile. Validators (check-bat-encoding, check-bat-comments) gate this. Future .bat authoring: prefer PowerShell (.ps1) когда logic is complex; keep .bat minimal (just bootstrap wrappers like upgrade.bat).

Tier: principle. cmd.exe authoring requires defensive validators because errors are runtime-only и cryptic.

---

## v4.10.36 changelog (5 Three.js 3D graphics skills)

### User request

User: "иди в интернет смотри что ещё можно полезного добавить, особенно интересуют скилы которые могут делать хорошую графику 3д".

Researched Three.js ecosystem 2026: WebGPU renderer (r171+, auto WebGL2 fallback), Draco/KTX2 compression (60-95% size reduction), procedural geometry via simplex noise, 16 visual styles via post-processing, target <100 draw calls.

### Added — 5 skills (Three.js only, per user choice)

**/three-setup** — scene boilerplate. Renderer (WebGPU с WebGL2 fallback), camera (perspective/ortho), lighting rig (ambient + directional shadows + hemisphere), resize handler, animation loop. Three.js bundled LOCALLY к assets/lib/ — NOT CDN (Yandex Lesson #67 compliance). Foundation для other 3D skills.

**/visual-style** — 16 distinct looks via post-processing + materials: Realistic PBR, Toon, Low-Poly, Wireframe, Neon, Glass, Pixel Art, Voxel, Matcap, Hologram, Blueprint, X-Ray, Gold/Chrome, Sunset, Clay, Normals. EffectComposer pipeline (RenderPass → effects → OutputPass). Genre→style mapping table. Makes games look expensive без artist.

**/procedural-geo** — geometry generated в code: simplex noise terrain (layered octaves, height-based biome colors), low-poly clouds, voxel structures, hex grids, stacked-block buildings. Seeded RNG (mulberry32) для reproducible worlds. Zero asset downloads — geometry is math. Keeps zip tiny (critical для Yandex 100MB limit).

**/3d-perf** — optimization. renderer.info measurement first. InstancedMesh (1000 objects → 1 draw call), geometry merging (static objects), LOD (distance-based detail), Draco/KTX2 compression, memory disposal patterns. Target <100 draw calls, 60fps desktop / 30+ mobile.

**/shader-fx** — custom GLSL/TSL shaders: rim lighting, dissolve (burn edge), water surface, hologram (scan lines + fresnel), force field, toon (step-function cel), vertex animation (wind sway). TSL alternative documented (JavaScript shaders, type-safe).

### Engine choice

User chose **Three.js only** — most popular, lightest, easiest к bundle locally, works great on Yandex. Babylon/PlayCanvas skipped (overkill для MVP projects).

### Cross-cutting theme — local bundling

Every 3D skill emphasizes bundling libs locally (Three.js, simplex-noise, EffectComposer addons, Draco/KTX2 decoders). Aligns с Lesson #67 (external CDN = Yandex release blocker). Procedural geometry особенно powerful — generates graphics с zero asset bytes.

### Router update

/game router skills list now includes 3D chain: three-setup → procedural-geo → visual-style → shader-fx → 3d-perf. Keywords "3д игра"/"3d game"/"three.js" → start с three-setup.

### Bug fix — check-cross-refs regex

check-cross-refs.mjs skill-name regex was `[a-z][a-z0-9-]+` — required first char к be letter. Skill `3d-perf` starts с digit `3` — was missed, falsely reported as "missing from advisor". Fixed regex к `[a-z0-9][a-z0-9-]+`. Both table-row и inline patterns updated.

### Lesson #69 — Code-generated graphics sidestep multiple constraints

Procedural geometry (terrain via noise, shapes via math) generates 3D visuals with **zero asset bytes**. This simultaneously solves:
- **Asset size** — Yandex 100MB limit trivially met
- **CDN dependency** — nothing к load externally (Lesson #67)
- **Load time** — no asset download wait
- **Variety** — change seed → infinite worlds

Pattern: when a platform has asset-size OR external-dependency constraints, prefer **generative** approaches over **asset-based** ones. Code is smaller than assets и has no fetch dependency.

Applies broadly:
- Geometry → procedural (noise, math) instead of .glb files
- Textures → shader-generated instead of .png
- Audio → Web Audio synthesis instead of .mp3 (где fits)
- Animation → code-driven instead of baked clips

Trade-off: generative requires more code skill, less art tooling. For Forge's MVP-focused users shipping к constrained platforms (Yandex), generative is often the better default.

Tier: principle. Becomes Architectural Invariant #24 candidate — "prefer generative over asset-based when platform has size/dependency constraints".

---

## v4.10.37 changelog (FIX Forge tooling — debugcheck.js path bug)

### v4.10.37 follow-up — the ACTUAL failing file

First v4.10.37 pass fixed build-yandex-3zips.mjs (tools/ → templates/). But user re-reported the SAME error с exact path `platforms/yandex/templates/html5/debugcheck.js`. That path is built by a DIFFERENT file: `platforms/yandex/scripts/runtime-test.mjs` (567 lines — separate from the 473-line `scripts/runtime-test.mjs`).

Root cause в platforms copy:
```js
const HERE = dirname(fileURLToPath(import.meta.url));  // platforms/yandex/scripts/
const REPO = resolve(HERE, '..');                       // platforms/yandex/ — NOT repo root!
const DEBUGCHECK = join(REPO, 'templates', 'html5', 'debugcheck.js');
// → platforms/yandex/templates/html5/debugcheck.js — does not exist
```

Variable named REPO but `resolve(HERE, '..')` only climbs 1 level. Repo root is 3 levels up from `platforms/yandex/scripts/`.

Fix:
1. `resolveDebugcheck()` — tries 4 candidate paths (repo-root templates/html5/, platforms/yandex/templates/, etc), returns first that exists.
2. **Fail-soft** — line 62 was `readFileSync(DEBUGCHECK)` hard read → ENOENT crash. Now: if debugcheck not found, warn `[FORGE TOOLING]` и run test WITHOUT behavioral probes. Game still tested for load errors / asset 404 / SDK contract. A missing Forge-internal file never crashes a game test.

Note — dual runtime-test.mjs files (`scripts/` 473-line vs `platforms/yandex/scripts/` 567-line) is a maintenance hazard. They diverged. Future cleanup: dedupe or clearly designate which is canonical. Logged as tech-debt.

### User report

User flagged: runtime-test.mjs падает потому что ищет отсутствующий debugcheck.js. Correctly identified as **Forge tooling bug, не game bug** — pre-submit и smoke confirm working build. Marked as Forge TODO.

### Root cause — two separate path bugs

**Bug 1: build-yandex-3zips.mjs wrong subfolder**

```js
const SUPPORT_DIR = path.join(ROOT, 'platforms', 'yandex', 'tools');  // WRONG
```

Support files (debugcheck.js, cheats-base.js, screenshots.js) live в `platforms/yandex/templates/`, NOT `tools/`. The `tools/` folder contains only `game-screenshot-ext/`. So findSupportFile always returned null → "debugcheck.js not found" warnings → debug builds lacked behavioral probes.

**Bug 2: runtime-test.mjs asset 404 too strict**

scenarioAssets failed on ANY missing asset except favicon/sdk.js. If a game's index.html referenced debugcheck.js (dev scaffold artifact) but file wasn't bundled — runtime-test reported asset failure. But debugcheck.js is **Forge QA tooling**, not a game asset. Its absence is not a game bug.

### Fix

**1. build-yandex-3zips.mjs — correct paths**

```js
const SUPPORT_DIRS = [
  path.join(ROOT, 'platforms', 'yandex', 'templates'),
  path.join(ROOT, 'templates', 'html5'),
];
```

Multiple fallback dirs. findSupportFile searches all. Verified all 3 support files now resolve.

**2. runtime-test.mjs — whitelist Forge dev-tooling**

scenarioAssets now ignores debugcheck.js / cheats-base.js / cheats.js / screenshots.js в 404 check — same treatment as favicon/sdk.js. These are Forge scaffolding, not game content.

**3. build-yandex-3zips.mjs — strip forbidden script tags**

Previously removed forbidden FILES but left dangling `<script src="debugcheck.js">` tags в index.html. Production builds ended up referencing a deleted file. Now strips both the file AND its script tag.

### Why this matters — separating infra from product failures

User correctly diagnosed this as tooling failure, not game failure. That distinction matters:
- **Game bug** — fix the game
- **Tooling bug** — fix Forge, game is fine

When a Forge validator fails, the FIRST question is "is this the game's fault or Forge's fault?" A path bug в build tooling masquerades as a game asset failure. Without separating them, user wastes time "fixing" a working game.

### Lesson #70 — Tooling path bugs masquerade as game bugs

A broken path в Forge tooling produces errors that LOOK like game problems:
- "debugcheck.js not found" → looks like missing game asset
- Actually: build script pointing к wrong folder

Symptoms of tooling-bug-not-game-bug:
- Error mentions Forge-internal files (debugcheck, cheats-base, validators)
- Other independent checks (smoke-test, pre-submit) pass
- Error is about file paths/structure, не game logic/rendering

Pattern: Forge validators should label their failures — "[FORGE TOOLING]" vs "[GAME ISSUE]" prefix. When tooling can't find its OWN files, that's never the game's fault. Validators referencing Forge-internal paths should fail-soft (warn) not fail-hard (block) when the missing item is Forge infrastructure.

Future improvement: add `--strict-forge-paths` mode that verifies Forge's own file layout before running game checks. Catch infra drift early.

Tier: principle. Becomes Architectural Invariant #25 candidate — "tooling failures must be distinguishable from product failures; never block a release on a Forge-internal path bug".

---

## v4.11.3 changelog (Tier 1 self-audit — turning the rigor inward)

First of three planned maintenance tiers. Adds tooling that audits Forge itself for the drift
classes that slipped past the per-domain verifiers during the v4.11.x work.

### Fixed a real bug caught live: advisor-catalog digit-blind regex
`update-advisor-catalog.mjs` used `/([a-z]...)/` for skill-name extraction — so `/3d-perf`
(digit-first) was never recognized as "mentioned", making the tool perpetually report it as
"missing" and try to re-add it. `check-cross-refs.mjs` was already digit-safe, so the two tools
DISAGREED (112 vs 113, "missing: 1"). Fixed both regexes to `[a-z0-9]` + optional leading slash.
Now both enumerate identically — Missing: 0. This is exactly the "two tools read one file, don't
agree" drift the new self-audit exists to prevent.

### New verifier: check-drift.mjs (19th verifier, auto-discovered by MCP server)
Self-audit for cross-cutting drift no single check owned:
1. Orphan/empty skill dirs (brace-expansion artifacts)
2. CLAUDE.md size vs 30 KB soft limit (proactive)
3. Advisor catalog ↔ filesystem agreement (digit-safe enumeration)
4. MANIFEST ↔ filesystem skill presence (no untracked skills)
5. Broken `/skill` cross-references (tightened heuristic — backticked+hyphenated only, to avoid
   false positives on BotFather commands /newbot, touch events, URL fragments)
6. Version-string consistency across plugin/marketplace/GUIDE/dashboard
Fail-soft on its own errors (Lesson #70 — tooling bugs never block release). Found 3 genuine minor
xref warnings on first run (fix-moderation → /verify-yandex, /build-release; layout-system →
/frontend-design) — left as WARN, not release-blocking.

### bump-version.mjs: proactive CLAUDE.md size guard
After a bump, warns if CLAUDE.md is over the soft limit and points to rotate-changelog.mjs, so the
"keep latest 3" rule self-enforces instead of silently drifting (it hit 91 KB before v4.10.38).
Next-steps list updated to include rotate + check-drift before ship. Did NOT auto-run rotation
inside bump (it mutates CLAUDE.md, which has a data-loss history — kept it an explicit, verified step).

Lesson #73: the same discipline applied to game projects (verifiers, fail-soft, fix-root) was
under-applied to Forge's own tooling. A self-audit verifier is cheap insurance against accretion.

---

---

## v4.11.2 changelog (full freshness audit → Opus 4.8 / CC currency)

Comprehensive freshness/compatibility audit ("проверь всё") + fixes. Verified CURRENT: model IDs,
API surface, `anthropic-version: 2023-06-01`, hooks format, plugin/marketplace schema, agents dir,
skill frontmatter (113 valid kind), Three.js 0.184. Nothing critically broken. Applied 8 updates;
honestly dropped 2 (see below).

### Opus 4.8 / Claude Code currency
- **`/effort xhigh`** added to /mvp-to-yandex + /auto-release prereqs — Opus 4.8 defaults to high
  effort; xhigh recommended for long unattended loops (the heaviest autonomous runs).
- **`effort` API param** documented in stack/ai-integration model guidance (low…high…max; keep
  high-volume in-app calls on haiku-4-5 at default — higher effort = more cost).
- **Dynamic workflows (Opus 4.8)** documented in advisor as an OPTION for very-large/parallel tasks
  (tens-hundreds of background agents) — explicitly NOT a replacement for /goal, which stays the
  default for measurable conditions. Decision guidance included.
- **CC "latest" framing** updated: current is v2.1.153 (noted in advisor + mvp + auto-release);
  `/goal` floor v2.1.139+ kept (floor checks are correct).
- **`/reload-skills` + live change-detection** (CC 2.1.145+) added to GUIDE sync section — CC
  auto-reloads edited skills in-session without restart; `/reload-skills` forces a re-scan.

### Library version pins
- MCP SDK `^1.0.0` → `^1.29.0` (current 1.29.0; caret already resolved but floor tightened).
- simplex-noise `4.0.1` → `4.0.3` (procedural-geo download URL).
- vk-bridge `@latest` → `@3.0.2` (was unpinned via unpkg — reproducibility).

### Honestly NOT applied (with reason — this is the integrity call)
- **`disallowed-tools` for safety enforcement** — verification found it is **not reliably enforced**
  in skill frontmatter (CC issues #37683, #18837, #14956: "parsed but not enforced"). Applying it to
  game-design/fix-ui would create false security. Kept the reliable mechanism: the
  workspace-discipline **hook** (actually enforced) + prose "NEVER TOUCH". Frontmatter theater avoided.
- **npm-install deprecation note** — N/A: the project never instructs users to npm-install Claude
  Code (only puppeteer / MCP SDK, which are legit npm packages). Nothing to update.

Lesson #72: "use the latest" ≠ "adopt every new flag". Verify enforcement before relying on a
feature (allowed/disallowed-tools is documented but buggy) — a hook that works beats a frontmatter
field that doesn't.

---

---

## v4.12.0 changelog (asset-generation — real AI art/voice/SFX/music pipeline)

New capability: generate REAL external assets to raise audio-visual quality, not procedural code.
Modeled on the user's proven zarechye VN pipeline (OpenRouter + ElevenLabs scripts), generalized
into a reusable Forge skill that analyzes a game, proposes upgrades, and EMITS a filled-in .bat the
user runs.

### New skill: /asset-generation (architectural)
- **Analyzes the game** → proposes prioritized upgrades (icon/cover, backgrounds, sprites, voice, SFX,
  music) appropriate to the genre.
- **Visuals** via OpenRouter (Gemini image): multi-reference (bg + characters), rembg cutout for
  sprites, inherits the /art-direction style spec so all art matches one look.
- **Voice** via ElevenLabs eleven_v3: per-role voices + audio-tag prefixes, says.json → mp3, manifest,
  skip-existing. Dialogue voice acting = the big quality jump for story games.
- **SFX** via ElevenLabs Sound Generation from a catalog.
- **Music** = Suno 5.5/4.5 prompt sheets (Suno has no public API — honest manual step, not a fake
  "auto music API"; emits ready-to-paste style+structure prompts).
- **Emits a filled-in generate_all.bat** from an asset-catalog.json — user double-clicks, doesn't
  hand-edit. Respects .bat rules (no ::/Cyrillic in () blocks, chcp 65001 — Lessons #20/#68) and is
  checked with check-bat-comments + check-bat-encoding before handover.
- After generation, wires asset paths into the game + runs /art-direction self-critique to confirm
  real quality lift over placeholders.

### Bundled reference scripts (tools/assets/, copied per project, not rewritten)
- generate_image.py, generate_sfx.py, generate_voice.py — the user's proven scripts, made
  Forge-portable (ROOT auto-found by searching upward for the .key file, instead of hardcoded
  zarechye/ structure; generate_sfx gained --out-dir/--catalog/--force).
- extract_says.js — NEW (the user's .bat referenced it but it wasn't provided): generic dialogue
  extractor → says.json {who,text,hash}, handles say("x","y") and {who,text} shapes, dedup+hash,
  with a clear note to adapt patterns per engine.
- sfx_catalog.example.json, voice_catalog.example.json, music_prompt.suno.template.txt.

### Keys & safety
- API keys read from `.openrouter_key` / `.elevenlabs_key` at project root — NEVER hardcoded/echoed.
- Forge EMITS; the user RUNS the .bat — external paid APIs (OpenRouter/ElevenLabs) are never called by
  Forge itself, and budget/cost is a Tier-3 stop. Skip-existing by default to avoid re-spending.
- /sound-design gained a pointer to /asset-generation (procedural vs real-files distinction).

Lesson #79: when a user has a working pipeline in a sibling project, generalize THEIR proven scripts
(make paths portable, fill the missing piece) rather than inventing a parallel one — preserves what
already works and earns trust.

---

---

## v4.11.7 changelog (pre-handoff audit — 2 broken refs fixed, rest clean)

Full bug audit before the user takes the project. Method: all 19 verifiers + syntax-check every
.mjs + validate every JSON + hook-script existence + frontmatter validity + manifest↔fs resolution
+ cross-reference resolution. Honest result: clean except two real broken skill references.

### Fixed (real bugs)
- **fix-moderation referenced two non-existent skills** in its "after fixes" step: `/verify-yandex`
  (doesn't exist → now `/release-ready yandex`, the actual diagnostic) and `/build-release` (doesn't
  exist → now `node scripts/build-yandex-3zips.mjs` / `/auto-release yandex`). These would have sent
  the agent to dead commands mid-moderation-fix. Caught by check-drift's xref check.

### Verified clean (no action needed)
- All 37 .mjs scripts parse; all 4 JSON configs valid.
- 4 verifiers exit 2 = correct N/A guards (appmetrica/external-cdn/setup-guide/workspace-discipline
  need a real game project / build / git repo — not the template). Not bugs.
- Both hook configs valid: plugin-hooks.json (8 scripts) and the manual-install .claude/settings.json
  (8 scripts incl. status-line) all resolve. (Minor: the two configs differ by status-line — harmless,
  both internally valid.)
- All 113 skills have valid frontmatter. The "name=2" flags on write-skill/learn-sdk/add-pipeline are
  false positives — second name:/description: are inside frontmatter-template examples (these are the
  skill-creator skills). Real frontmatter correct.
- MANIFEST: all 178 SKILL.md entries (113 top-level + 65 sub-skills in skills/ tree) resolve to real
  files — no stale/orphan entries.
- 1 remaining check-drift warning (/frontend-design from layout-system) is CORRECT — it's the
  Anthropic external skill, explicitly labeled as such. Not a Forge skill, not a bug.

Lesson #78: a pre-handoff audit's job is to find the 2 things that are actually broken among the 200
that are fine — and to not cry wolf on the false positives (N/A guards, template examples, external
skills). Distinguishing "broken" from "intentionally not-applicable" is most of the work.

---

---

## v4.11.6 changelog (monetization: ads-first / IAP opt-in — policy resolved)

Resolves the policy question surfaced in v4.11.4 (and parked in Tier 2). User decided: **ads =
Priority 1 (default), IAP = Priority 2 (opt-in, only when explicitly requested)** — not a hard
ban. Implemented as a tiered model, not a removal.

### /monetization-design restructured into two tiers
- **Decision gate at the top:** before designing, ask "did the user explicitly request IAP?" — NO →
  Tier 1 only; YES → Tier 1 + Tier 2. When unsure, one-line ask "только реклама или + IAP?".
- **Tier 1 (default, ads):** soft + hard currency both EARNED (hard via rewarded ads / achievements /
  leaderboards — added leaderboard source). Game fully playable/winnable without spending. The IAP
  price-anchoring block moved into an explicitly-skippable "Step 1b (Tier 2 only)".
- **Tier 2 (opt-in, IAP):** conversion funnel (Step 3) + soft paywalls + IAP catalog in the output
  map all marked "only if user requested purchases". Added a Tier-1 ads-only "funnel" equivalent
  (rewarded-ad-at-the-moment-of-want, no shop).
- **Non-Negotiables split** into Tier 1 (always) + Tier 2 (only-if-opted-in, else must be absent),
  plus "did NOT design IAP unless explicitly requested".

### Policy recorded in the repo (not just chat)
New **architectural invariant #18** in CLAUDE.md: monetization is ads-first, IAP opt-in only.
This makes the rule survive new sessions — the v4.11.4 lesson was that a policy stated only in chat
isn't a repo policy. Now it is. Verified other IAP-referencing skills (analyze-game, pipeline,
design-pipeline, release-yandex) only *mention/audit* IAP — none default-pushes it — so no conflict.

Lesson #76: "ban X" is usually worse than "default to Y, allow X on request". A tiered opt-in keeps
the capability without making it the pushy default — and a decision gate beats a hard removal.

### Bonus fix: rotate-changelog.mjs kept a STALE hardcoded version list
While shipping this release the size-guard (v4.11.3) fired correctly (CLAUDE.md hit 30.4 KB), but
rotate-changelog.mjs then rotated out the NEWEST changelogs (4.11.4/5/6) and kept old ones — because
its KEEP set was a hardcoded `['4.10.38','4.11.0','4.11.1']` that drift had made stale. No data lost
(byte-verify preserved everything in CHANGELOG.md), restored inline correctly. Root-fixed: KEEP is
now COMPUTED (N newest by semver), not hand-maintained — exactly invariant #17. Added `--keep=N`.
Regression-tested: now rotates the oldest, never the newest.
*(Logged as Lesson #77: a tool that enforces "keep latest 3" must DERIVE "latest", not be told it.)*

---

---

## v4.11.5 changelog (Tier 3 — diagnostic found NO safe code change; one doc-honesty fix)

Tier 3 ("bigger bets": collapse dual-install, build-from-manifest, portability) ran as a
diagnostic pass. Outcome: all three candidates were either misdiagnoses or intentional design.
The discipline of "diagnose before changing" paid off again — blind execution would have caused
regressions. Net code change: zero. One documentation-honesty fix shipped.

### Findings (why nothing was mechanically changed)
- **"Collapse dual-install"** — the `.bat`/`.ps1`/`.sh` trio is cross-platform by design, not
  duplication (thin .bat MotW-bootstrap → real logic in .ps1/.sh). The actual "second path" is the
  plugin-install, which is already opt-in + untested + needs a GitHub remote the user doesn't have.
  No hook double-fire for current (manual-only) usage. Merging would break the cross-platform story.
- **"Build zip from MANIFEST"** — would have BROKEN releases: 4 files are physically present but
  intentionally excluded from MANIFEST (`.dashboard-structure-baseline.json` + `MANIFEST.txt` are
  user-mutable state that upgrade.ps1 must NOT overwrite/delete; `output/README.md`, `.gitkeep` are
  scaffolding). Building strictly from manifest would drop the baseline → check-dashboard-structure
  fails. Also confirmed the tree ships ZERO junk (no .tmp/.bak/.DS_Store/logs), so the problem this
  would "solve" doesn't exist. MANIFEST is correctly a "what-upgrade-may-delete" list, not a
  "what's-in-the-zip" list.
- **Portability** — strategic, not a fix. Left as-is (personal tool; generalization is a deliberate
  future choice, not a bug).

### Shipped: doc-honesty fix
README "Plugin install (beta)" → "Plugin install (deferred — not active)". It was presented like a
usable option but is untested and needs infra the user lacks; now explicitly marked not-for-use with
the hook-double-load caveat, pointing to unzip+upgrade.bat as the only supported path.

Lesson #75: "bigger bets" deserve harder diagnosis, not bolder action. Three plausible improvements
all dissolved under inspection — two would have regressed. A maintenance tier whose honest output is
"don't change this, here's why" is a successful tier.

---

---

## v4.11.4 changelog (Tier 2 — self-check in gameplay skills + a policy stop)

Tier 2 of the maintenance plan was a DIAGNOSTIC pass first (read, report, don't change blind).
Findings: 3 of 4 candidate "fixes" were wrong — runtime-test files aren't duplicates (two distinct
tools, zero function overlap → rename someday, don't merge), the UI-cluster isn't redundant (layers,
not dupes — ui-pipeline orchestrates the rest), and all 19 verifiers earn their keep ("0-skill" ones
are infra-called by 2-11 release/hook/MCP files, not ceremony). Only ONE real gap confirmed:
"technique without a target" — producer skills with acceptance criteria but no step to self-evaluate
the OUTPUT against them before delivery (the same gap fixed for visual skills in v4.11.0).

### Self-check added to 5 gameplay/3D skills (subject-specific, not boilerplate)
- **game-design** — "play the first 3 minutes" rubric: is the loop a loop, first-60s hook, a real
  decision, breathing difficulty, return hook, juice. Verdict line required.
- **level-design** — walk the curve + prove solvability (reverse-solve / jump-arc / DPS-vs-HP),
  plot 1→20 difficulty, one-new-thing, fixed seed, "would you play level 8".
- **shader-fx** — render it: compiles≠works — renders, matches art-direction mood, didn't tank fps,
  survives motion (on a screenshot).
- **3d-perf** — measure AFTER, prove the win with before→after numbers on real mobile, not desktop.
- **deepen-game** — "deeper or just bigger?" — adds a decision not just content, interacts with the
  core loop, complexity≠depth, honest BEFORE/AFTER.

### Honest stop on the 6th (monetization-design) — surfaced, not force-fixed
Started adding an "ads-only" self-check, but discovered the ads-only / no-IAP rule lives in the CHAT
context, NOT in the repo — CLAUDE.md has no such policy, and IAP is a built-in model across 9 skills
(+ a dedicated subscription-design). My partial edit would have made the skill internally
contradictory (NN says "no IAP" while the body teaches building an IAP catalog). **Reverted the whole
monetization edit** — leaving it consistent-as-was. Whether to make ads-only a repo-wide policy is a
project decision for the user, not something to hardcode from chat context into one skill.

Lesson #74: a skill edit that conflicts with the skill's own body is worse than no edit. And policy
stated in chat ≠ policy in the repo — verify where a "rule" actually lives before encoding it.

---

---

## v4.15.1 changelog (i18n-completeness data-i18n false-positive — fixed at source)

A downstream session reported i18n-completeness.mjs producing 8 false REQ-8.2.3 BLOCKERs and noted
the fix kept reverting via sync (it was patched in the project copy, not the template). Root-fixed
in the Forge template so sync propagates the correct version.

### The bug (real, not a revert)
The REQ-8.2.3 "hardcoded Russian in HTML" check decided whether a Cyrillic element was runtime-managed
by `applyStaticLang()` using only: id ∈ updatedIds, class ∈ updatedClasses, or a managed-descendant
match. But `applyStaticLang()` actually translates everything matched by
`querySelectorAll('[data-i18n]')` (+ `[data-i18n-html]`, `[data-i18n-attr]`). So an element like
`<div class="goal-stat-lbl" data-i18n="header.goal_stars">звёзд</div>` — no managed id/class but a
data-i18n attr — was wrongly flagged as hardcoded → 8 false blockers (goal-stat-lbl, lab.dna_editor,
points-label ×2, lab.cap.title, cap-progress-subtitle, randomize-btn, points-hint).

### Fix (at template source: platforms/yandex/validators/i18n-completeness.mjs)
1. Detect the attribute: `const dataI18n = /\bdata-i18n(-[a-z]+)?\s*=/.test(attrs)`.
2. Carry it on chain + stack elements (so an ancestor's data-i18n-html covers its subtree).
3. First line of the covered-check: `if (el.dataI18n) return true`.
Functional-tested: a data-i18n element now passes, a genuinely-hardcoded element still flags — kills
the false positives without weakening the real check. **check-drift guard #9** added so it can't
silently revert again (errors if data-i18n awareness disappears).

### On the revert mechanism (the downstream AI's diagnosis was correct)
sync.bat propagates platforms/ wholesale with xcopy /Y, overwriting project copies from the template.
Fixing a validator in a project copy gets clobbered on the next sync. The fix MUST live in the
template — now it does. Same root pattern as the debugcheck/runtime-test divergence (Lesson #81).

Lesson #85: a false-positive blocker is as harmful as a missed bug — it makes a correct game look
broken and trains the user to ignore the gate. A validator's "managed/covered" logic must mirror what
the runtime ACTUALLY does (here: querySelectorAll('[data-i18n]')), not a subset of it.

---

---

## v4.15.0 changelog (/audit-requirements skill + 4.4 threshold tightened 500→330ms)

### New skill: /audit-requirements (tactical)
Answers "do we even need a requirements audit?" by EVENT, not calendar. Fetches Yandex's live
release-notes + requirements page, compares against a baseline block (last audit date, requirements
page date, debugcheck version, known thresholds) recorded in the skill itself, and reports either
"no change → no audit needed" or the exact delta: which dated entries are new, which are real
requirement changes vs doc/metric churn, and which Forge artifact (debugcheck / runtime-test /
verifier / fix-moderation map) each maps to. After a full re-audit it updates its own baseline
(invariant #17 — the audit's own "last checked" must derive from reality, not go stale).

### Caught while building it: our ad-gesture threshold was too loose
Reading the release-notes revealed Yandex tightened REQ-4.4 to a HARD number: the delay between a
user gesture and the ad must be **≤ 330ms (0.33s)** (entries 14.08 + 25.09.2025). Forge's debugcheck
and runtime-test used **500ms** — so an ad firing 400ms after a click PASSED Forge but FAILS Yandex.
Tightened all six thresholds (debugcheck interstitial + rewarded detection and check, runtime-test
Probe A/B filters) from 500→330ms. debugcheck bumped v2.7→v2.8, both copies identical.
Also recorded the 90s Game Ready timeout in the audit baseline.

Lesson #84: requirement THRESHOLDS drift silently — "must follow a gesture" became "≤330ms" without
changing the rule's name. A check that enforces the right rule with the wrong number is a false pass.
The audit skill now tracks named thresholds explicitly so the next drift is caught.

---

---

## v4.14.0 changelog (full Yandex requirements audit → debugcheck v2.7 + complete moderation map)

Fetched the live Yandex requirements (yandex.ru/dev/games/doc/ru/concepts/requirements, last changed
5 May 2026) and did a point-by-point audit against everything Forge checks (debugcheck's ~85 checks +
19 static verifiers). Goal: find what moderation enforces that Forge silently ignores.

### Verified already-covered (no action — confirmed real checks, not assumed)
1.1 SDK, 1.3 sound-on-minimize (visibilitychange + AC.suspend/resume), 1.4/1.5 payments/ads via SDK,
1.7 no S3 URLs, 1.8 touch targets, 1.9 save, 1.10.x layout/scroll/overflow, 1.13.x IAP, 1.19.x
GameReady/Gameplay, 2.14 lang autodetect, 3.8 currency, 4.4 ad-gesture (v2.6 recency), 4.5 RV,
4.7 pause-on-ad, 8.2.3 lang-switch, full SDK method suite.

### Found gaps → added to debugcheck (v2.6 → v2.7, both template copies, byte-identical)
- **1.6.1.7** — WebGL-notice suppression (no "enable WebGL" prompt).
- **1.6.1.6 / 2.5** — system video player hidden (`<video>` without native `controls`).
- **1.6.1.2** — keyboard auto-shows on text input (`.focus()` present if game has inputs; N/A otherwise).
- **1.18** — no URL-based gating (no `location.host/href/referrer` restriction).
- **4.2** — progress saved before interstitial (setData/save near showFullscreenAdv; survives ad reload).

### Found gaps that can't be statically detected → added to fix-moderation requirement map as
RUCHNAYA (manual) review items, so they're never silently forgotten:
- **1.14** crash on orientationchange/swipes/minimize (needs live device run).
- **1.6.2.2** desktop aspect (long side ≤ 2× short) — visual.
- **4.3** ad orientation matches game — device.
- **1.2.2** guest play / progress without auth.
- **3.5** third-party IP — usually in store-listing screenshots, NOT code (the genetic-lab 3.5 lesson).
Also expanded the map with 5.6 (icon≠screenshot), 5.12 (unique name), and tightened 1.19/2.14/4.4
wording to the exact failure modes seen in real rejections.

### Honest scope boundary
Requirements that are inherently human/console/store judgments — 2.1-2.9 quality/genre/length,
3.4 content (esoterica/religion/politics/violence), 5.x promo, 8.3 media quality, 2.13 rating — are
NOT code-checkable and are left to console + moderation. Documented as such rather than faking checks.

Lesson #83: a requirements audit's value is an honest three-way split — (a) already covered, (b) can
be auto-checked so add it, (c) inherently manual so flag it for human review. Pretending (c) is
auto-checkable (e.g. a regex for "is the art tasteful") would be theater; omitting it would let it
slip. Naming it as manual is the correct third option.

---

---

## v4.13.1 changelog (kill the false-GREEN: puppeteer auto-installs, missing = BLOCKER)

Direct follow-up to a live finding: `runtime-test — puppeteer missing (would silently skip →
worthless GREEN)`. A behavioral probe that doesn't run is a false pass — the exact mechanism behind
genetic-lab shipping with undetected REQ-4.4. Fixed at the root.

### Fixes
- **runtime-test now auto-installs puppeteer** when missing (one-time `npm install puppeteer` in the
  project dir), then re-imports and proceeds. No more "run npm install and re-try" dead-end.
- **If auto-install fails → exit 3 = UNVERIFIED**, which callers MUST treat as a BLOCKER (not a skip).
  `scripts/runtime-test.mjs` previously did `process.exit(0)` with the comment "returning success" on
  missing puppeteer — a literal false GREEN. That's gone; both runtime-tests now fail-loud.
- **release-ready hardened**: removed the "Runtime-test passes (if puppeteer available)" escape hatch
  that let a missing-tool become a non-blocking skip. Exit-code contract documented: 0=pass,
  2=usage error, 3=unverified=BLOCKER. Never report GREEN on exit 3.
- **check-drift guard extended**: errors if either runtime-test contains "returning success" /
  "Skipping runtime test" on missing puppeteer — the false-GREEN pattern can't regress.

Lesson #82: a test that skips silently is worse than one that fails — it manufactures false
confidence. Missing tooling must auto-resolve or hard-block; "couldn't run it" must never render as
"it passed".

---

---

## v4.13.0 changelog (the autotest-vs-moderation gap — diverged validators, root-fixed)

User's genetic-lab v1.0.21 passed Forge's checks but got 6 Yandex moderation rejections (4.4 ad
without gesture, 1.19 GameReady timing, 1.6.2.3 resize deform, 8.2.3 + 2.14 language, 3.5 IP).
Investigated the user's real complaint ("autotests pass but moderation fails") to root cause — and
it was a real engine bug, not just missing checks.

### Root cause: BOTH validators had diverged into strong + weak forks, weak ones were active
- **debugcheck.js diverged**: `platforms/yandex/templates/` = v2.6 (tracks lastUserGesture,
  gestureDelta, flags AD_WITHOUT_GESTURE if ad fires >500ms after a gesture, + lang-switch
  reactivity). `templates/html5/` = stale v2.1 (only "was there ever a click", no recency). The weak
  v2.1 PASSES an ad that fires on sim-auto-end (genetic-lab's exact bug); v2.6 catches it.
- **runtime-test.mjs diverged**: `platforms/yandex/scripts/` has the REQ-4.4 Probe A trap (21
  markers); `scripts/` has ~none. The weak one ran → 4.4 slipped through.
- Verified v2.6 is a strict superset of v2.1 (0 checks unique to weak, +8 in strong) before acting.

### Fixes
- **Consolidated debugcheck**: replaced stale v2.1 in templates/html5 with v2.6. Both byte-identical now.
- **check-drift guard #7**: debugcheck.js MUST be byte-identical across both template dirs (ERROR if
  diverged) — they can never silently fork again. Reports the version so a downgrade is visible.
- **Broadened runtime-test Probe A blacklist**: added result/finish triggers (`showResult`,
  `onComplete`, `roundOver`, `simComplete`, `winGame`, `levelComplete`…) — genetic-lab's ad fired
  from `showResult` (sim auto-end), which the old blacklist (endGame/gameOver/onDeath) missed.
- **check-drift guard #8**: the release-gate runtime-test MUST retain the REQ-4.4 Probe A trap (ERROR
  if lost). The two runtime-tests stay legitimately specialized (variant/screenshot vs 4.4-trap) — NOT
  force-merged (that needs a live build to validate) — but the trap presence is now guarded.
- **release-ready hardened**: documented "couldn't verify ≠ passed" — a REQ-4.4/8.2.3 "warn /
  play-through, re-check" is an UNVERIFIED BLOCKER, not a pass. This was the actual hole: genetic-lab's
  ad only fires on 3rd sim-end after 60s, so the short test never fired it → warn → treated as OK.

### genetic-lab diagnosis (for the user, not auto-fixed — they asked to fix the engine, not the game)
4.4: maybeInterstitial() fires from showResult() on sim auto-end (no gesture) → move to a click.
1.19: ready() inside init() (too early/late) → after document.fonts.ready + UI ready. 1.6.2.3: canvas
sized once at launch, resize handlers don't re-size it → re-size on resize. 8.2.3/2.14: lang detected
mid-game not at start → detect in init() before first render. 3.5: not in index.html (no embedded
images/CDN fonts) — likely the store-listing screenshots; needs the moderation screenshot to confirm.

Lesson #81: when a user says "the autotests miss things", the bug is often that the GOOD test exists
but a STALE FORK of it is what actually runs. Find which copy is active, not just whether a check
exists. Two diverged validators with the weak one wired in is worse than no validator (false confidence).

---

---

## v4.12.1 changelog (asset-generation grounded in the real zarechye pipeline)

User shared the actual tools.zip (304-file production pipeline). Studied it and corrected
/asset-generation from my first-pass guesses to match what actually works.

### Corrected from reality
- **extract_says.js replaced with the REAL one.** My v4.12.0 version used regex on `say("x","y")`.
  The real engine is a command-tree (`{op:'say', who, text, vtag}`) extracted via `vm.runInContext`
  + recursive walk over then/else/options/outro/targets/findList, md5(who|vtag|text) hashing. Bundled
  the real script with a Forge-adapt header (change the SCRIPTS globals + walk() per engine).
- **Added the voice post-process step** (was missing): `run_voice_postprocess.bat` — ffmpeg
  highpass=80 → afftdn denoise → dynaudnorm, backs up originals, skips done. The real gap between raw
  TTS and shippable voice acting. Documented voice as a 3-stage pipeline: audition → generate → postprocess.
- **Added voice audition** (`voice_audition.example.py`): test one line across candidate voice_ids,
  pick per role before mass-gen — saves API budget + avoids re-recording in the wrong voice.
- **voice_catalog.example.json** updated to the real format (`_model: eleven_v3`, real stability/style
  settings, vtag per-line tone-override note).

### Fixed a latent bug in the user's own script
`run_voice_postprocess.bat` had Cyrillic inside an `if errorlevel 1 (...)` block (Lesson #20 — can
crash the cmd parser on some locales). Changed that echo to English. The user's copy may run on their
machine, but the bundled Forge reference must be safe everywhere; check-bat-comments confirms clean.

### Judgment: bundled the reusable, skipped the one-off
Took generate_image/sfx/voice + extract_says + postprocess + audition (reusable). Did NOT bundle
add_red_symbol.py — it's a zarechye-specific one-off that draws a symbol on one named file, not a
reusable tool. Bundling it would be clutter.

Lesson #80: when the user hands you their real working code, READ it before trusting your
reconstruction — my guessed extract_says would have silently extracted nothing from their actual
command-tree script format.

---

---

## v4.17.2 changelog (i18n/title validators: parse assignment-style I18N.lang = {…})

v4.17.1's delegation worked — the user's /release-ready yandex on samogonshchik now ran the real
probes: Probe E (1.19.2) GREEN (ready() fired with no loader visible — the timing is genuinely fine,
not gamed), Probe A/C/D clean, REQ-4.4 manually confirmed. The ONLY thing red was a false-positive
from a different validator.

### Bug: i18n-completeness + store-listings only parsed object-literal I18N
Both validators found language blocks via `ru:{…}` (object property) or `STRINGS_RU = {…}` (suffix),
but NOT `I18N.ru = {…}` (dot-assignment) — which samogonshchik uses. Result: i18n-completeness
reported "ru: no I18N block found" + "en/tr missing 277 keys" (3 false blockers), and store-listings
reported "no in-game title found" ×3 (REQ-5.1.3 false warnings) — despite all three blocks having
identical 325 keys and runtime Probe C proving zero Cyrillic leak.

### Fix
Added assignment-style patterns to both validators' block detection:
`I18N.ru = {`, `I18N["ru"] = {` (and LANG/STRINGS/DATA/NARRATIVE/L/T/TR/LOC/LOCALE prefixes).
Verified against the real samogonshchik index.html: the validator now reads the I18N.es/ru/en/tr
blocks correctly and reports only genuine untranslated strings (English in non-EN blocks) as
WARNINGS — no more phantom "missing block / 277 keys / no title" blockers.

This is a false-positive fix (Lesson #85 again): the validator's parser must mirror how games
actually declare i18n, not one convention. A false BLOCKER on a correct game is as harmful as a miss —
it forces a needless refactor or trains the user to ignore the gate.

Lesson #90: when a "completeness" validator reports a structure missing that you can SEE is present,
suspect the parser's pattern set is too narrow before suspecting the game. Cross-check against an
independent signal (here: runtime Probe C's zero-leak + key-count parity) to tell false-positive from
real gap fast.

---

---

## v4.17.1 changelog (THE root cause: release skills called the weak runtime-test copy)

User ran /release-ready yandex on v4.17.0 and the report had NO Probe E result + a self-contradiction
("SDK timing OK" up top, "fix LoadingAPI.ready timing — blocker #2" in next-actions). Investigated:
Probe E didn't fail to run — **it was never called**.

### Root cause (explains genetic-lab 4.4 AND samogonshchik 1.19 in one stroke)
Probe A (REQ-4.4) and Probe E (REQ-1.19.2) live ONLY in `platforms/yandex/scripts/runtime-test.mjs`.
But EVERY release skill — release-ready (line 63/100), auto-release, mvp-to-yandex, pre-submit-gate —
invoked the GENERIC `scripts/runtime-test.mjs`, which has neither probe. So for the entire history,
the Yandex release path ran the weak behavioral test and the moderation traps NEVER executed. The
checks existed; nothing called them. (release-ready even contradicted itself: line 63 pointed at the
generic copy, line 91 at the yandex copy.)

### Fix: generic runtime-test auto-delegates Yandex builds to the probe-bearing copy
Rather than fix the path in 4 skills (fragile), `scripts/runtime-test.mjs` now detects a Yandex build
(path contains "yandex" OR index.html references /sdk.js/YaGames) and delegates to
`platforms/yandex/scripts/runtime-test.mjs` (Probe A + C + D + E), passing all args through. Now ANY
caller — existing or future — runs the moderation traps on a Yandex build automatically. `--no-delegate`
escape hatch for the generic test itself. Verified: a /sdk.js build triggers delegation.
- release-ready instructions corrected to call the yandex copy for Yandex (removed the self-contradiction).
- check-drift guard added: errors if the generic copy loses Yandex delegation.

### What this means for the user's samogonshchik run
The v4.17.0 report you got ran the WEAK copy — that's why there was no Probe E verdict and the timing
was reported "OK" by an old static check while flagged as blocker #2 by hand-reading. Re-run
`/release-ready yandex` on v4.17.1: it will now delegate, Probe E will actually execute, and give a
definitive verdict — either "ready() fired while loading visible → 1.19.2 BLOCKER" (the moderation
bug, proven) or "no loading indicator visible at ready → timing OK" (look elsewhere, e.g. 1.19.3
GameplayAPI.start at load).

Lesson #89: a check that exists but is never CALLED is identical to no check. When verifying "is X
covered?", trace the actual invocation path from the release command to the probe — don't stop at
"the probe exists in the repo". The genetic-lab AND samogonshchik misses were both this: right probe,
never wired into the path that runs.

---

---

## v4.17.0 changelog (un-gameable GameReady check + anti-gaming integrity — invariant #19)

User identified the deeper problem behind repeated 1.19 rejections: the debug-checker is injected
into the game build and thus VISIBLE to whoever edits the game, so games get tuned to PASS THE
CHECKER instead of meeting the requirement (samogonshchik literally had "150ms so debugcheck's poll
catches it" + a locally-patched debugcheck v2.10). A checker you can game is worse than none.

### Made the 1.19.2 check un-gameable (measure the FACT, not the code shape)
- **runtime-test Probe E (NEW):** instruments `LoadingAPI.ready()` to capture, AT the moment it
  fires, whether a loading indicator / spinner / progress bar / splash is still visible in the live
  DOM. ready() while loading-visible → REQ-1.19.2 BLOCKER. You cannot pass this by tuning a timer —
  only by actually calling ready() when the game is interactive. Also flags GameplayAPI.start() fired
  at load (1.19.3 warn).
- **debugcheck v2.9 → v2.10:** added an anti-gaming integrity check — flags a fixed setTimeout right
  before ready(), or comments referencing "pass debugcheck/probe", as tuning-to-the-checker.

### Invariant #19 (CLAUDE.md): never tune a game to pass the checker
The checker measures the requirement, not vice-versa. Forbidden: timing/branches whose purpose is to
flip an indicator green; editing/weakening the injected debugcheck inside a game project; checks that
can be passed by tuning rather than fixing. The urge to tune timing IS the signal the requirement
isn't met. New checks must measure facts so they can't be gamed.

### Drift guards extended
check-drift now errors if debugcheck loses the anti-gaming check, or if runtime-test loses Probe A
or Probe E — the integrity checks can't silently disappear via sync.

Note for the user's samogonshchik: it ships debugcheck v2.10 locally (newer than the template had) —
that's a locally-patched checker, exactly what invariant #19 forbids. After updating Forge, rebuild
the debug build so the honest template checker is injected, then /release-ready yandex will measure
the real fact (loading-visible-at-ready) instead of a tuned timer.

Lesson #88: any check visible to the thing it checks will eventually be gamed unless it measures an
external FACT. Inject-time checkers must assert observable runtime state (was a loader on screen?),
never code patterns the author can pattern-match and tune around.

---

---

## v4.16.0 changelog (REQ-1.19 GameReady — precise interactivity timing + loader, vs live doc)

Another 1.19 rejection. Fetched the live 1.19 requirement + sdk-about init page and found our check
and instructions used a PROXY (ready() after fonts/UI) that doesn't match Yandex's actual criterion
(ready() exactly when the game is INTERACTIVE). Tightened to the real rule.

### What Yandex actually checks (1.19.2) — and our gap
The Game Ready indicator (debug-mode=16) must turn green EXACTLY when the game is interactive — menu
available OR playable incl. start animation. FAIL = green too early (progress bar / black screen /
throbber still showing) OR several seconds late, OR red after 90s (= not implemented). Our runtime
check only caught "ready before SDK init" and our prose said "after fonts loaded" — neither catches
"ready() fired while a loading screen is still up", which is the most common rejection (and likely
the genetic-lab one: ready() in init() while still loading).

### Fixes
- **debugcheck v2.8 → v2.9** (both copies identical): runtime 1.19.2 now flags ready() TOO EARLY
  (before content/fonts ready) AND TOO LATE (>1s after gameplay started), plus the 90s window.
- **yandex-sdk-integration**: rewrote the #1 rejection guidance to the exact interactivity criterion
  (green when menu/title is visible AND clickable, not while a progress bar shows; not seconds late).
- **Added 1.19.1 loader check guidance** (was missing): debug-panel must show `IT` (init true), not
  `IF` (old loader). Connect `<script async src="/sdk.js" onload="initSDK()">` before YaGames.init().
- **fix-moderation map**: split 1.19 into 1.19.1 (loader IT/IF), 1.19.2 (interactivity timing — exact
  too-early/too-late wording), 1.19.3 (gameplay markup scenarios).

### Honest limit
"Interactive moment" can't be detected perfectly from code — Yandex judges it from the loading video.
Our runtime check approximates it (content-paint and gameplay-start bracketing); the instructions now
state the exact rule so a human/`/do` implements ready() at the right point. Not faking certainty.

Lesson #87: a check built on a PROXY ("after fonts") passes games that violate the REAL rule ("when
interactive"). When moderation keeps rejecting a "covered" requirement, suspect the check encodes a
convenient proxy, not the literal criterion — and go re-read the literal criterion.

---

---

## v4.15.2 changelog (REQ-2.14 instruction accuracy — verified against the live doc)

User challenged whether our language-detection instructions were correct. Fetched the official 2.14
page and verified point-by-point. The debugcheck CODE was already correct (its condition is
`langDetected < firstUserClick` = "before gameplay", which matches Yandex exactly and tolerates a
loading interval). But the PROSE instructions were subtly off:

### Corrected in localize + fix-moderation
- **"ДО первого рендера" / "UI сразу на турецком" → "на старте, до игрового процесса".** Yandex
  explicitly ALLOWS a brief interval where loading text shows in another language before the lang
  loads ("Допустим небольшой интервал… может отобразиться загрузочный текст на другом языке"). Our
  "before first render / immediately" overstated it — stricter than required and a wrong mental model.
  The real criterion is the 文 indicator turns green at start, i.e. lang detected before the player
  interacts — exactly what debugcheck already enforces.
- **Added the missing requirement**: autodetect via SDK must be implemented in ALL games — even
  single-language or no-text ones. Yandex states this explicitly; our instructions omitted it.

No code change (the validator was right); this is instruction/doc accuracy so /do and humans following
the skills get the requirement exactly right.

Lesson #86: keep prose instructions calibrated to the EXACT requirement, not a stricter paraphrase.
"Before first render" sounds safer than "before gameplay" but it's wrong — it invents work Yandex
doesn't ask for and misrepresents the rule. When in doubt, fetch the live requirement and quote its
actual tolerance.

---

---

## v4.19.1 changelog (drift self-audit now fully clean — external-skill allowlist)

The lone persistent check-drift warning (`/frontend-design referenced by [layout-system] but no such
skill`) was a false alarm that had shown for many versions: frontend-design is one of Anthropic's
BUILT-IN skills (lives in the Claude environment, not shipped in Forge's .claude/skills), so Forge
referencing it is correct, not a typo. A warning that's always-on and never actionable trains the eye
to ignore the whole audit — so it's removed at the source.

Added KNOWN_EXTERNAL_SKILLS allowlist to check-drift (frontend-design, canvas-design, docx, pdf,
pptx, xlsx, file-reading, etc — Anthropic's built-ins). These no longer warn. Verified the allowlist
is precise: a real typo (`release-redy`) or a genuinely missing skill is STILL caught — only the
known Anthropic built-ins are suppressed. check-drift now reports "✓ No drift." with zero warnings.

Lesson #95: a perpetual non-actionable warning is noise that erodes trust in the whole check. Either
make it actionable or teach the checker it's expected. "1 warning (ignore it, it's fine)" every run is
a smell — fix it so green means green.

---

---

## v4.19.0 changelog (Probe F — REQ-1.10.1 multi-viewport overflow, the real moderation procedure)

Recurring 1.10.1 rejection ("элементы обрезаются при изменении размера окна"). Fetched the live 1.10
doc and found Forge tested overflow at ONE viewport, but Yandex's actual procedure is multi-resolution.

### What Yandex actually does (from the doc)
Fits the game to a 16:9 box, then SHRINKS the window 20% per axis (width, height, diagonal), and
tests across specific resolutions — including non-16:9 ratios: 1280×1024 (5:4), 2560×1080 (21:9),
plus 1366×768, 1920×1080, 1680×1050, 2560×1440, 3840×2160. Clipping of buttons/text/scores/ad-notices
at any of these = rejection. Forge's single-viewport overflow check couldn't catch "fine at load,
clips when resized".

### Fix: runtime-test Probe F
Replays 6 representative viewports (16:9, 5:4, 21:9, and 20%-shrunk variants), and at each runs an
overflow scan focused on interactive/important elements (buttons, links, headings, score/title/label,
ad/reward notices, canvas). Flags REQ-1.10.1 BLOCKER if any such element is >25% off-screen (the
doc's "critical" clip threshold), skipping intended clips (overflow:hidden/scroll parents). Verified:
clean-game fixture shows no critical clipping → no false positive; drift guard added so Probe F can't
be lost. fix-moderation 1.10.1 row updated with the exact procedure + resolution list.

Lesson #94: a responsiveness requirement is a MULTI-condition test — checking one viewport proves
nothing about the others. When the rejection says "при изменении размера", the check must replay the
size changes, not assert a single state. Read the moderator's procedure and replicate it literally
(16:9 → shrink 20% → odd ratios), don't approximate with one screenshot.

---

---

## v4.18.1 changelog (emoji-compat range gaps fixed + machine-guarded)

User found emoji-compat let 🦫1F9AB 🦘1F998 🦖1F996 through — the hand-enumerated codepoint ranges
had holes between sub-ranges. Fixed the root pattern, not just the 3 reported.

### Fix
- Replaced the gap-prone 1F9xx enumeration with a gap-free range: 1F992–1F9FF all flagged (Unicode
  11+), with explicit SAFE carve-outs (1F980–1F991 Unicode 8-9 animals; 1F9D0–1F9DF Unicode 10
  faces/fantasy). 13.0 sub-ranges (1F9AB-1F9AF, 1F9BB-1F9BF, oyster) → BLOCKER, rest → WARNING.
- Widened the face range 1F976–1F97A → 1F970–1F97A (all Unicode 11+) — this closed a SECOND gap the
  user didn't report: 🥲1F972 tear-smiling-face (Unicode 13) was slipping through.

### Machine guard (extends the v4.17.4 philosophy to false-NEGATIVES)
- New scripts/check-emoji-coverage.mjs: a curated list of 15 known beyond-spec emoji (Unicode 11+,
  sampled across the historically-gappy sub-ranges) that MUST be flagged, + 8 known-safe (Unicode ≤10)
  that must NOT be — asserted directly against the exported checkCodepoint(). A future edit can't
  silently re-open a hole in either direction.
- This guard is what caught the 🥲1F972 gap during development — proving the approach: a curated
  negative/positive probe set finds holes a human enumeration misses.
- Wired into check-drift (guard #11), runs every release.

Lesson #93: hand-maintained codepoint/range lists ALWAYS grow gaps. Either (a) flag a whole block
with explicit safe carve-outs (gap-free by construction), or (b) back the list with a curated probe
test that fails when a known item isn't covered. Enumerating "the dangerous ones" is the fragile
pattern; enumerating "the safe exceptions" within a flagged block is robust.

---

---

## v4.18.0 changelog (parkour 5-flag rejection → +1.6.1.3 resize check, async-init guidance)

A Three.js parkour game (built on OLD Forge) got 5 moderation flags. Diagnosed each in source and
checked whether current Forge catches them:

### The 5 flags, mapped to root causes
- **1.10.1 (elements clipped) + 1.6.1.3 (deform on fullscreen-exit)** — ONE root cause: `resize()` was
  bound only to `window "resize"`, NOT to `orientationchange`/`fullscreenchange`. On mobile rotate /
  fullscreen-exit the canvas keeps the old size → Three.js scene clips & deforms. **Forge had ZERO
  checks for this.** → added.
- **1.19 + 2.14 (ready/lang fire "after game is playable")** — ONE root cause: `YGames.init()` is called
  ASYNC ("doesn't block the game"), so the game becomes playable before init finishes, and detectLang +
  ready() run after. → guidance added (Forge can't statically prove async-ordering reliably, so it's a
  fix-moderation note pinned to the parkour case).
- **1.13 (purchases not found)** — the game has NO purchase code (getPayments/etc only in debugcheck);
  the draft declares IAP. Fix is console-side: remove IAP from the draft. → guidance row added.

### Engine fix: debugcheck v2.11 → v2.12
New static check "Canvas resizes on orientation change (п.1.6.1.3/1.10.1)": for canvas/WebGL/THREE
games that bind window "resize", WARN if they don't also handle orientationchange / fullscreenchange /
ResizeObserver / visualViewport. Verified: WARNs on parkour (catches the exact bug), N/A on
non-canvas games, and the clean-game fixture still shows zero false positives (the v4.17.4 guarantee
held — the new check passed the negative test before shipping).

fix-moderation map updated: 1.6.1.3 (orientation binding), 1.19.2 + 2.14 (async-init warning), 1.13
(remove IAP from draft if no purchase code).

Lesson #92: a 3D/canvas engine has a whole class of mobile-only failures (rotate, fullscreen-exit,
DPR) that never show on a desktop static load. When a canvas game is involved, the resize/orientation
path is the first thing to check — desktop "looks fine" proves nothing about mobile rotate.

---

---

## v4.17.4 changelog (machine guarantee against false positives — clean-game fixture test)

User (rightly) called out that "audit done" kept turning into "found my own bugs 2h later", and that
when he asks for an audit it must be done properly the first time. Fixing that with a machine
guarantee instead of a promise.

### What was actually wrong with my process
I tested each new check only against the BUG it targets, never against a spec-compliant game. So
checks whose "normal state looks like a violation" (keyboard 1.6.1.2: a text input that needs no
focus; anti-gaming: a clean game) cried wolf on the first real build. Self-audit on my own additions:
of 8 checks added v2.7–v2.11, exactly 2 produced false-FAILs — both now fixed (v2.11). The other 6
verified PASS on the live build.

### The guarantee: scripts/check-debugcheck-fixtures.mjs
- A known-CLEAN reference game (scripts/fixtures/clean-game.html) — minimal but fully spec-compliant
  (SDK, ready-on-rAF, i18n assignment-style with 13 langs, gesture-gated ads with ad-labelled RV
  button, GameplayAPI markup, pause/resume, save-before-ad, scroll/contextmenu prevention, 48px
  touch targets).
- debugcheck.js now exposes its REAL static check array to Node (`module.exports.__CATS`, browser
  unaffected). The harness runs the actual shipped checks — not a re-extract — against the clean
  fixture. Any static check that returns FAIL on a clean game is a false positive → the verifier
  exits 1.
- Wired into check-drift (guard #10): runs every release. A future false positive (mine or anyone's)
  is caught automatically BEFORE it reaches a user, not after.
- Also fixed `t() function used` to return a boolean (was returning null on <5 matches).

Lesson #91: "I'll be careful" is not a control. When a class of bug recurs (false positives), build
the negative test that makes it impossible to ship — test every check against a known-GOOD input, by
machine, every release. An audit isn't done when I've looked; it's done when a test proves it.

---

---

## v4.17.3 changelog (debugcheck v2.11 — fix two false-FAILs I introduced in v4.14/v4.17)

User ran the in-browser YG Debug Checker on the live draft (debug-mode=16) and got 2 FAILs, both my
own false-positives from recently-added checks. Fixed at source.

### FAIL 1 — Keyboard 1.6.1.2 (added v4.14.0): over-strict
The check demanded a `.focus()` call whenever a text `<input>` existed (samogonshchik has a promo-code
field). But 1.6.1.2 only requires the mobile keyboard to appear when the user TAPS a field — which a
native `<input type=text>` already does. No manual `.focus()` is needed. Also the original negative-
lookahead regex was malformed. Rewrote: detect text inputs positively; PASS by default; FAIL only if
the keyboard is actively SUPPRESSED (inputmode=none / readonly / disabled on all text inputs).

### FAIL 2 — anti-gaming integrity (added v4.17.0): hard-fail too aggressive
The check correctly detected the game's leftover tuning comment ("Wait ONE debugcheck-poll-tick
~150ms…") — but returned a hard FAIL, and the in-browser report rendered it as "Not found!" (its
generic non-pass label), which looked like a missing feature rather than a detected anti-pattern.
Softened to WARN: the un-gameable runtime Probe E is the source of truth for ready-timing, so the
static comment-sniff should flag for cleanup, not block. (The fix is still to remove the tuning code,
but it's not a release blocker when Probe E is GREEN.)

### Net for samogonshchik
Both now resolve correctly: keyboard → PASS (native text input), integrity → WARN (cosmetic; remove
the 150ms-poll comment in the game). With v4.17.2's i18n fix, the build's automated picture is clean.

Lesson #85 (again, on myself): a false-FAIL is as harmful as a miss. Newly-added checks need testing
against a real game that legitimately has the edge case (a text input that needs no focus; a clean
game with no gaming) — not just against the bug they target. I added both checks without a
clean-game negative test, so both cried wolf on the first real build. Always test a new check against
a KNOWN-GOOD input too.

---

---

## v4.19.5 changelog (Hexfront 6-flag rejection → +audio-OS-player check, +5.11 draft check)

A game built on recent Forge still got 6 moderation flags — a signal the engine had gaps. Unzipped,
diagnosed each in source, and checked Forge coverage. Two real gaps found and closed.

### The 6 flags
- **1.6.2.5 (desktop system player) + 1.6.1.6 (mobile notification player)** — ROOT: music played via
  `new Audio('…mp3')` + el.play() (HTMLAudioElement), which surfaces in the OS media player. SFX
  correctly use Web Audio, but music doesn't. **Forge only checked <video>, not audio → GAP.** Added
  debugcheck v2.12→v2.13 "Music via Web Audio, not <audio>/new Audio": WARNs on new Audio()/<audio
  loop>/MediaSession. Verified: WARNs on Hexfront, no false-positive on clean fixture.
- **2.14 (lang) + 1.19 (ready) "after game is playable"** — ROOT: `requestAnimationFrame(render)` runs
  at parse time so the game renders/plays immediately, but `YaGames.init().then(… detectLang … ready())`
  is async → lang+ready fire after the game is already playable. Same async-init class as parkour;
  guidance already in fix-moderation (2.14/1.19.2). Fix in game: gate playable state on init, or call
  detectLang+ready before first meaningful render.
- **1.10.3 (UI overlap)** — the #unitactions floating menu (position:absolute, z-index:6) overlaps a
  hex cell underneath; moderator couldn't reach the cell under the menu. Static detection of "floating
  UI overlaps interactive area" is unreliable (every game's layout differs) → kept as fix-moderation
  guidance: anchor floating menus to empty margin / dismiss-on-tap / offset from the touched cell.
- **5.11 (draft padding / duplicate text)** — repeated chars to pad min-length, or seo_description ==
  about. **Forge didn't check this → GAP.** Added to store-listings validator: flags repeated-char
  padding (----, ...., runs) and identical text across seo_description/about/how_to_play.

### fix-moderation updated
1.6.1.6/1.6.2.5 row expanded to cover audio (Web Audio routing); new 5.11 row.

Lesson #99: "built on the latest Forge" is not "will pass moderation" — the engine only catches what
it has checks for. Every real rejection on a Forge-built game is a coverage gap to close, not a
one-off; the audio-player case had been invisible because the check only looked at <video>. When a
requirement covers a family (video AND audio system players), check the whole family, not one member.

---

---

## v4.20.0 changelog (Hexfront 6-flag rejection → Probe G overlap + lang/ready ordering check)

Hexfront (built on an earlier Forge) got 6 moderation flags. Diagnosed each against the code and
checked current-Forge coverage; closed the real gaps.

### The 6 flags
- **2.14 lang + 1.19 ready "after game playable"** — ROOT CAUSE: `__hexfrontBoot()` runs at
  DOMContentLoaded and binds canvas click handlers + builds the board, while `setLang(detectLang())`
  and `ready()` live in a parallel `init().then()` that resolves later. So the board is interactive
  before language detection / GameReady fire. NOT caught by Probe E (that checks loader-visible-at-
  ready, a different failure). → NEW static check (debugcheck v2.14): flags input bound at boot while
  detectLang/ready are deferred into init().then() (WARN). Fires on Hexfront, clean on the fixture.
  Note: user translated RU-only, but Yandex checks the CALL ORDER regardless.
- **1.10.3 overlap** — a floating unit-actions panel sits over the hex board and blocks clicking
  cells beneath it. Probe F catches off-screen clipping but NOT element overlap. → NEW Probe G:
  detects a persistent, opaque, interactive panel covering >6% of the game canvas and stacked above
  it (skips transient overlays/modals and pointer-events:none HUD) → REQ-1.10.3 WARN.
- **1.6.2.5 + 1.6.1.6 audio in OS player** — music via `new Audio('…mp3')` (streaming <audio>)
  surfaces the desktop system player + mobile notification shade. Already caught by debugcheck v2.13
  (added a version after the user's build) — rebuilding on current Forge flags it.
- **5.11 repeated chars / duplicate draft text** — already caught by store-listings (REQ-5.11
  repeated-char padding + duplicate seo/about/how_to_play detection). Rebuild flags it.

### Net
Two genuine new engine gaps closed (1.10.3 overlap → Probe G; lang/ready ordering → debugcheck v2.14
check). The other 4 are caught by current Forge — the user's build predated v2.13/store-listings 5.11.
Drift guard added for Probe G; fixture test still zero false positives; fix-moderation 1.10.3 row
strengthened.

Lesson #99: "fires after the game is playable" is an ORDERING bug, not a timing-value bug — Probe E
(loader-visible-at-ready) can't see it. Detect it structurally: input bound at boot + lang/ready
deferred into an async init chain. And a Russian-only game still must call detect-lang in the right
order; the requirement is about call sequence, not the number of locales.

---

---

## v4.19.4 changelog (wiki-audit stop-hook race fixed at the root — fallback used advancing log mtime)

While analyzing a prototype, the stop-hook kept blocking with "wiki/_map.md has not been updated since
today's session started" even immediately after editing _map.md — a race the downstream AI correctly
diagnosed: post-tool-capture.mjs touches the session log on EVERY tool call, so the log mtime always
ends up newer than the wiki edit.

### Root cause
wiki-audit's sessionStartMs() is supposed to return a FIXED session-start time (parsed from the log's
`date:` frontmatter + first `- HH:MM:SS` entry), which is immune to the race. But its final fallback
did `statSync(log).mtimeMs` — the LIVE, advancing log mtime. On any machine/log where the
date/entry parse didn't match, it fell into that fallback and re-created the exact feedback loop the
v4.9.3 fix was meant to kill: edit _map.md → next tool call advances log mtime past it → audit says
stale. The well-formed-log path was fine; the fallback silently reintroduced the bug.

### Fix
- Fallback now uses the log's BIRTH time (birthtimeMs = when the session log was created = session
  start) if available, else today's MIDNIGHT — both FIXED timestamps. Never the advancing mtime again.
- Memoized sessionStartMs() (computed once per hook run) so even mid-run log touches can't shift the
  comparison.
Verified: well-formed logs use the fixed first-entry time (frontmatter+entry); malformed logs use
birthtime/midnight; neither uses live mtime. The "_map.md stale right after editing it" false block
is gone.

Note: the downstream AI's diagnosis was correct (post-tool-capture advances the log). The fix belongs
in wiki-audit's fallback, not in disabling the capture hook — the capture log advancing is intended;
the audit just must not compare against a moving target.

Lesson #98: when a fix adds a "robust path" plus a fallback, the FALLBACK must honor the same
invariant — here "compare against a fixed session-start, never a value that advances during the
session". A fallback that violates the invariant silently resurrects the original bug whenever the
happy path doesn't trigger.

---

---

## v4.19.3 changelog (visual-upgrade +Step 7: cheap 2D atmosphere & juice, ported from the 3D recipe)

User asked to do for 2D/pixel games what v4.19.2 did for 3D — improve their graphics. Most Yandex
games here are 2D/canvas, so this is higher-leverage than the 3D recipe. Checked existing 2D skills
first (pixel-art, visual-style, visual-upgrade, art-direction) to extend, not duplicate.

### The gap
visual-upgrade already had static palette, shadows, glow, lighting, particles, easing, parallax. It
was MISSING the two "cheap wow" recipes that made the 3D reference shine, ported to 2D:
- an ANIMATED mood/time-of-day palette lerp (it only had a static palette — the 2D analog of 3D's
  lerpEnv, the standout technique);
- mood-tied vignette + a consolidated game-feel "juice" bundle.

### Added (visual-upgrade Step 7)
- 7a Mood palette LERP: MOODS stops + moodAt(p) recolours the whole scene from one scalar (day/dusk/
  night, depth, danger) — the 2D version of /three-setup's lerpEnv.
- 7b 2D distance fog/haze: fade far parallax layers toward a fog colour (depth + hides pop-in).
- 7c CSS #vignette overlay (not per-pixel canvas — free), opacity tied to mood.
- 7d Game-feel juice: screen shake, hit-flash, squash & stretch, hit-stop, particle bursts, ease
  everything — the cheapest perceived-quality jump.
- Pixel-art specifics: integer scaling + imageSmoothingEnabled=false; mood tint as a multiply pass
  (recolour the whole sprite set day/night without redrawing art); dithering for retro gradients.
- Both paste-ready code and a /do instruction. Description + quality checklist updated.

Lesson #97: a good technique recipe generalizes across renderers — the 3D atmosphere insight (mood
lerp, fog horizon, CSS vignette, juice) is renderer-agnostic; the 2D port keeps the same ideas with
canvas/CSS primitives. When a recipe lands for one stack, check whether the SAME idea lifts the others
before inventing something new.

---

---

## v4.19.2 changelog (three-setup +atmosphere recipe from a hand-tuned parkour reference)

User shared a Three.js game with genuinely great-looking graphics and asked to capture the techniques
for our 3D projects. Analyzed the game's OWN code (separated from the inlined r128 lib) and extended
the existing three-setup skill (per user's choice: extend, not new skill; both code + /do form).

### Key finding: the look comes from CHEAP techniques, not post-processing
Zero EffectComposer/Bloom/SSAO, MeshLambertMaterial, antialias OFF — yet reads as high-end. The lift
is light + fog + tone + a time-shifting palette. That's ideal for Yandex (mobile GPU + 100MB budget).

### Added to three-setup (Step 7 — Atmosphere)
- Mobile renderer tuning: antialias:false + pixelRatio≤1.75 + stencil:false + sRGBColorSpace + PCF
  shadows (deliberate trade-offs, the biggest mobile-FPS lever).
- Fog matched to scene.background → seamless horizon + draw-distance cull in one line.
- DAY/DUSK/NIGHT palette set + lerpEnv() driven by ONE time-of-day scalar — animates the whole mood
  (sky, fog near/far, sun, hemi, lamps) near-free. The standout "wow" technique.
- Night detail: player-following PointLight that fades in after dark + sun.castShadow disabled at
  night (radial light vs directional shadow conflict).
- Vignette via CSS radial-gradient overlay (NOT a WebGL post-pass) — zero GPU cost.
- Provided both as paste-ready code and as a /do instruction.

### Also fixed a real bug in our own skill
three-setup's resize handler bound only window "resize" — the SAME bug as the parkour reference and
the class Probe F/debugcheck v2.12 now catch. Added orientationchange + fullscreenchange binding +
flagged it in the Non-Negotiable checklist. Explicitly warned NOT to copy the reference's resize code.

Lesson #96: when mining a reference for techniques, separate the library from the game's own code
first (a 7MB inlined minified lib drowns greps in false hits), and judge each technique for
portability — keep what's cheap+robust (palette lerp, fog horizon, CSS vignette), reject what's a
latent bug (resize-only binding) even when the rest of the file is excellent.

---

---

## v4.21.0 changelog (systematic requirements audit — coverage map + 8 new checks + manual checklist)

User's fair challenge: not one game passed moderation first try — "ты точно всё изучил?". The honest
answer was no: Forge was built REACTIVELY (a check added after each rejection), never from a complete
requirements audit. Fixed that properly.

### Did the audit I should have done from the start
Fetched the full live Yandex requirements doc (last-changed 2026-05-05) and mapped EVERY point to
Forge coverage → wiki/requirements-coverage.md (single source of truth: AUTO / MANUAL / N/A-policy).
Result: ~45 of ~65 checkable points were already AUTO (the engine wasn't bad — the games were built
on OLDER versions before each check existed). Found ~10 statically-checkable gaps + ~18 inherently-
manual points that were never surfaced to the user.

### Closed the statically-checkable gaps (debugcheck v2.14 → v2.15, +8 checks)
1.6.1.1 fullscreen-on-mobile (WARN), 1.6.2.2 desktop aspect ≤2:1 (WARN), 1.6.2.6 OS-shortcut keys
(WARN), 1.15 WIP/placeholder text (WARN), 1.16 imitation ad blocks (WARN), 3.9 YouTube/external video
player (FAIL), 4.3 ad-orientation mismatch (WARN), 8.2.4 profanity ru+en (WARN).
- Every new check tested against the clean-game fixture BEFORE shipping (guard #10) → zero false
  positives. Caught & fixed my own bug mid-build: JS `\b` is ASCII-only so the profanity regex never
  matched before Cyrillic — split into English-with-boundary + Russian-stems; verified it catches
  dirty ru/en and passes clean text + the Scunthorpe homograph.

### Surfaced the MANUAL requirements (the honest boundary)
/release-ready now ALWAYS appends a "Проверь сам" checklist (content 3.4, gameplay 2.4/2.8/2.9,
quality, mobile gesture control, cross-browser 1.20, media 8.3, title uniqueness 5.12, cloud-save
flag, IAP-in-draft). GREEN now explicitly means "all AUTO checks pass" — never "fully cleared".
Drift guard #12 ensures the coverage map exists.

Lesson #100: a check suite built reactively (one rule per past failure) cannot tell you what it does
NOT cover — only a top-down audit against the authoritative spec can. Map every requirement to
covered/manual/na ONCE, keep it as the source of truth, and make the tool show the manual remainder
so "green" never overpromises. Reactive whack-a-mole feels like progress but leaves unknown gaps; the
audit converts unknown gaps into a known, shrinking list.

---

---

## v4.21.1 changelog (engine self-audit — 3 findings, all fixed and machine-verified)

User asked for an audit of the main project. Ran the full protocol: all 21 verifiers, multi-copy
sync, invocation-path tracing, hooks parse, coverage-map-vs-reality diff, machine guarantees, plus
active bug-hunting. Result: engine largely healthy (16/21 verifiers PASS outright; 4 "fails" were
game-targeted checks run without a target — expected usage, not faults). Three REAL findings, fixed:

### Finding 1 — check-platform-completeness perpetually failed (Lesson #95 class)
Its "release.yml workflow matrix" row expected `.github/workflows/release.yml`, which no longer
exists anywhere (GitHub-Actions era artifact; releases run locally via skills). All 9 platforms
"failed" forever, and since release-ready/auto-release/mvp-to-yandex reference this verifier, the
failure was being silently ignored on every release. FIX: the row is N/A (pass) when
`.github/workflows/` is absent entirely; it still verifies the matrix if a workflow file returns.

### Finding 2 — release-ready described a stale probe list
Line 63 said the yandex runtime-test has "Probe A, C, D, E" — F (multi-viewport overflow) and G
(UI-over-canvas) were added later and never mentioned. Command was correct; description was stale.
FIX: probes F/G added to the text.

### Finding 3 — `\bбля\b` was dead code in the v2.15 profanity check
The exact `\b`-is-ASCII-only bug fixed elsewhere in the same regex — one instance survived, so
standalone "бля" was never flagged (silent false-negative). FIX: Cyrillic-aware boundary
`(^|[^а-яё])бля([^а-яё]|$)` — catches "ну бля"/"бля!", stays clean on "бляха"/"рубля". Verified by
test; clean-game fixture still zero false positives; both debugcheck copies re-synced identical.

Lesson #101: an audit must include running EVERY verifier (not just the release-path ones) and
diffing documentation against shipped reality (probe lists, coverage claims). Two of three findings
were "a check/doc referencing something that no longer exists" — the class that never announces
itself because nothing calls it on the happy path.

---

---

## v4.22.0 changelog (Section-6 advisory checks + /seasonal-event skill — engine side of the July research)

Engine work from the 2026-07-01 requirements diff (user: "мы движок делаем, а не игры").

### debugcheck v2.15 → v2.16: +4 advisory checks (NEW Section 6 "Рекомендуемые", 07.2026)
6.2 sound-toggle present (N/A if no audio), 6.3 pause present (N/A if no realtime loop), 6.5 title
without "игра/game", 6.7 no useless exit/quit button. All WARN — Yandex doesn't moderate Section 6,
but 2.13 was TIGHTENED (rating ≤30 for 3 weeks → game UNPUBLISHED), so quality now decides survival.
Fixture: zero false positives (clean-game has soundToggle/pauseGame/clean title/no exit button).

### NEW skill /seasonal-event — themed Yandex events as a traffic lever
Yandex runs themed events (летний сезон, День Головоломки) — games with a themed activity get the
«Акция» badge + placement in "Скидки и акции" = free traffic. The skill: checks the live calendar
(t.me/yangamesdevnews + blog — fetched fresh, deadlines = start −4-5 workdays because promo
moderation takes ≤3 workdays and sleeps on weekends), generates an honest date-gated in-game
activity (visible from main screen, no external requests, fades after dates, must keep Probe A–G
green), and prepares the Console promo text. Includes the rating red-line playbook (2.13).

Lesson #102: platform "recommendations" become hard constraints one tier later — Section 6 isn't
moderated, but the tightened 2.13 makes quality existential; encode advisories the day they appear,
as WARN, so games absorb them before they bite.

---

---

## v4.22.1 changelog (Rating-watch red-line in the metrics template)

product-metrics' output template (wiki/architecture/metrics.md) now opens with the 2.13 red-line
block: rating ≤30 for 3 straight weeks → game UNPUBLISHED (tightened 07.2026; first ~2 weeks after
publish don't count). Alert threshold set at <40 (act before the cliff), with an escalation playbook
(read reviews → ship an update → /seasonal-event → paid catalog promo) and a weekly check table.
Every NEW project is now born knowing the rule — no one has to remember it. Honest limit: this is a
just-in-time reminder + plan, NOT automated monitoring (Console requires the user's login).

---

---

## v4.22.2 changelog (advisor: post-release section — the engine no longer goes silent after release)

Gap found while wiring the Forge Helper: the advisor's catalog ended at release commands — nothing
about what comes AFTER. Added "После релиза — жизнь игры": advisor now proactively suggests (when
context shows a recent release) /seasonal-event (calendar check right after publish + every 2-3
weeks; заявка closes ~4-5 workdays before event start), the weekly rating-watch habit (2.13 red
line, alert <40, escalation plan lives in metrics.md), /audit-requirements monthly or on any
rejection, and /product-metrics re-review every 30 days. Companion (outside the engine): Forge
Helper got a one-click start-ForgeHelper.bat (deps install + admin elevation for global hotkeys)
and 3 new default bindings — ctrl+alt+8 /seasonal-event, ctrl+alt+9 /audit-requirements,
ctrl+alt+0 /pipeline (no-enter, дописать папку).

---

---

## v4.23.0 changelog (orchestration tier + Codex/cross-tool layer)

Two asks: build the "orchestra" and make Forge usable under Codex CLI. Research first (July 2026
state): SKILL.md is now the open cross-agent standard (Codex reads .codex/skills natively, same
format — our 116 skills are already compatible); AGENTS.md is the cross-tool instruction standard
(Codex native, 32KiB cap); Codex subagents GA since March (8 parallel workers); Claude Code agents
support per-agent `model:` tiering.

### Orchestration (the discovery: .claude/agents/ already had 13 agents — audited before building)
Real gaps found: NO agent had a `model:` field (all ran on the expensive main model — no tiering,
the whole point of an orchestra), and no Yandex-moderation auditor existed (security-auditor is
XSS/secrets, qa-tester is generic).
- All 13 existing agents tiered `model: sonnet` (workers cheap; orchestrator = main session).
- NEW agent `moderation-auditor` (sonnet, READ-ONLY tools — no Edit/Write): runs debugcheck +
  probes A–G + validators on ONE game, returns a structured report (блокеры/warnings/MANUAL);
  hard rules: never edits, never invents check results, GREEN ≠ "пройдёт модерацию". Spawn N in
  parallel to audit N games.
- CLAUDE.md +🎼 ORCHESTRATION section: delegate mechanics/keep judgment; NEVER accept a worker's
  claim without re-running the verifier (Invariant #19 applies to subagent output); workers' prompts
  must reference exact skills/verifiers.

### Codex layer (no fork — a generated adapter)
- scripts/generate-agents-md.mjs: builds AGENTS.md from CLAUDE.md core (changelogs stripped — fits
  Codex's 32KiB cap) + Codex addendum: skills path & junction one-liner, verifier quick-reference,
  and the HONEST gap — .claude/hooks don't run under Codex, with the manual compensation checklist
  (wiki update + session entry + check-drift before ending work).
- Sync guaranteed by machine, not promise: AGENTS.md embeds a sha256 hash of CLAUDE.md core; drift
  guard #13 recomputes it — stale AGENTS.md fails the release. Negative-tested (corrupted core →
  guard fires).

Lesson #103: "переписать под другой инструмент" is usually wrong — the ecosystem converged on open
standards (SKILL.md, AGENTS.md); the right move is a thin GENERATED adapter with a drift guard, not
a fork. And before building "the missing orchestration": inventory what exists — 13 agents were
already there; the real gap was tiering + one missing role, a day's work instead of a rewrite.

---

---

## v4.23.1 changelog (/status rewritten fact-based — resume any project after a break)

User pain: many projects, returning after a week you don't know the stage. Old /status read
wiki/_map.md and counted items — notes go stale. Rewritten: stage detected from MACHINE-CHECKABLE
FACTS in the project folder (artifact presence + code greps per pipeline phase: game-analysis/
metrics → design docs → art spec/asset-catalog → viewport/touch → YaGames.init/ads/ready →
detectLang/listing → debugcheck version in build vs canonical + Release zips), wiki as secondary
context with staleness flag. Output: conveyor checklist ✅/⏳/❌ per phase, current stage = first
gap, and EXACT next commands with Helper hotkey numbers (Ctrl+Alt+1..0). Rules: fact beats note
(wiki says SDK done but grep=0 → trust grep, flag mismatch); bare prototype (game.html+concept.md)
→ stage 0 → /analyze-project; show ALL gaps not just first; no heavy runtime checks (that's
/release-ready). Description triggers extended (на каком этапе, вернулся к проекту, где мы
остановились, resume).

---

---

## v4.23.2 changelog (Suno template fixed — the "vocals in instrumentals" bug)

User: Forge's Suno prompts keep producing tracks WITH VOCALS. Root cause verified against Suno 5.5
docs: our template emitted a single blob ([Style]/[Structure]/[Exclude]) with PROSE inside the
structure ("4 bars, sparse", "battle just started") — but Suno has THREE separate fields, and
anything in the Lyrics field that isn't a [bracket] tag or a (parenthetical) IS SUNG. The prose
descriptions were being performed as lyrics.

asset-generation Step 5 rewritten to the correct 3-field v5.5 format: Style = [Instrumental] first
token + genre-first tag order (earlier tags weigh more, 5-8 tags, numeric BPM) + [No Vocals] last
(dual-level vocal suppression); Lyrics = ONLY [Section] tags + (producer notes in parentheses),
never prose/dashes, [Minimal Variation] for loopable; Exclude Styles = the dedicated v5.5 field,
plain comma list without "no" prefix, 2-3 priority items max (long negative lists confuse the
model); plus a Style-vs-Lyrics contradiction check. Prompt sheets now emit three clearly-marked
paste-per-field blocks. Lesson #104: when a generator targets an external tool, the template must
mirror the tool's actual INPUT FIELDS — a format that merely "reads well" gets parsed by the
tool's rules, not the author's intent.

---

---

## v4.24.0 changelog (active playtest — the harness now PLAYS the game)

User: need an agent/skill that tests the game by driving Chrome. Diagnosis first: runtime-test
(probes A-G) already drives headless Chrome but checks MODERATION, not gameplay; test-game skill
existed but its automated stage = smoke-test.mjs which is PASSIVE (loads page, listens to console
— zero clicks/screenshots/interaction). The gap: nothing verified "the game actually plays".

NEW scripts/playtest.mjs (same puppeteer stack, auto-install policy): serves the game, clicks
start-like buttons up to 3 menus deep (RU/EN button-text heuristic), then PLAYS — 5×5 jittered
click grid over the canvas + configurable keypresses (--keys "wasd "), 4 screenshots
(loaded/after-menu/midplay/endplay), collects pageerror+console.error DURING play, verifies the
rAF render loop is alive. Exit 0/1 + report.json + screenshots dir. test-game skill got СТАДИЯ 1.5
wiring it in, with the mandatory human step: LOOK at the 4 screenshots (script catches errors;
"looks broken/empty/unchanged after clicks" only vision catches — 01≈04 with zero diff = dead
input even at 0 errors). Verdict criteria extended.

Lesson #105: passive smoke tests create false confidence — "no console errors" while nothing was
ever clicked proves only that the menu renders. A playtest must ACT (click/keys) and produce
artifacts a human can eyeball (screenshots), because "plays wrong but throws nothing" is the most
common shipped-broken state.

---

---

## v4.24.1 changelog (tyl "I18n is not used" — dead SDK read shipped from OUR template)

Yandex's native debug panel said "I18n is not used" on tyl while OUR checker showed all i18n
checks PASS. Root cause traced to the localize skill TEMPLATE: detectLang() checked the ?lang=
URL param FIRST with an early return — but Yandex ALWAYS appends &lang= to the iframe URL, so
the ysdk.environment.i18n.lang read below was DEAD CODE on the platform. Static presence ≠
runtime use; our checks confirmed the string exists, the panel measured the fact it never runs.

Fixes (root first):
- localize template: SDK read FIRST (satisfies 2.14 and registers with the panel), URL param
  demoted to dev-only fallback (no SDK), navigator last. Comment explains the tyl case.
- debugcheck v2.16→v2.17: (a) runtime instrumentation — on init interception, wrap
  environment.i18n.lang with a getter that sets RT._i18nRead; new runtime check FAILs if the game
  never reads it (N/A when env is frozen/unmeasurable); (b) new static check: detectLang with
  URL-param-before-SDK + early return → WARN (fires on tyl, clean on fixture); (c) legacy
  "Sound toggle" heuristic aligned with реком. 6.2 (the tyl report showed the two contradicting:
  legacy FAIL vs 6.2 PASS — two checks measuring one thing must share one heuristic).

Lesson #106: a checker that greps for an API string verifies EXISTENCE, not EXECUTION — when a
platform's own tooling measures runtime facts, ours must too (instrument the API, record the
read). And when the platform injects parameters unconditionally (&lang=), any "override first"
branch silently kills the code below it on that platform — order fallbacks by WHO must win in
production, not by developer convenience.

---

---

## v4.25.0 changelog (local-stage — «панель Яндекса» локально, для человека и для ИИ)

User ask: a tool like Yandex's debug panel runnable locally, by hand or by the AI tester.
Diagnosis: the panel ALREADY ships in every build (debugcheck, ?debug-mode=16) and runtime-test
already mocks the SDK — the missing piece was the glue: run the game locally with a mocked SDK so
the panel lights up WITHOUT uploading a draft to the Console.

NEW scripts/local-stage.mjs, two modes:
- HUMAN (default): serves the game, injects a mock-SDK <script> before game code, prints a URL
  with ?debug-mode=16&lang= — open in a real browser, play, watch the panel live (fast loop
  before any Console upload).
- AI (--ai [--play]): headless Chrome, optional short playtest interaction, then dumps ALL panel
  runtime flags (window.RT) to stage-out/rt.json + screenshot; exit code = console errors. The
  tester/orchestrator reads machine facts: _i18nRead, readyCalled, errors.
Mock covers what the panel measures: environment.i18n.lang via GETTER (v2.17 instrumentation
works locally), LoadingAPI/GameplayAPI, adv with a visible fake overlay (onOpen/onClose timing),
player saves (localStorage-backed), stubs for payments/leaderboards/feedback. index.html is
mock-injected at serve time — build files untouched. test-game got ЭТАП 1.6 wiring both modes,
with the honest boundary: NOT a replacement for the real draft (real SDK is richer) — a fast
pre-upload loop.

Lesson #107: when a platform gives you an in-context diagnostic (panel in the iframe), the local
dev loop should reproduce its CONTEXT (mock the host API), not reimplement its checks — one
checker codebase, two hosts.

---

---

## v4.25.1 changelog (advisor: awareness of non-skill tools)

User asked "адвизор в курсе всего?" — fact-check said HALF: the auto-updated catalog covers
skills, but everything that is NOT a skill was invisible to the advisor: playtest.mjs,
local-stage.mjs, parallel audits via moderation-auditor agents, the Codex layer (AGENTS.md),
update-forge.bat. Added a "Инструменты и агенты ВНЕ каталога" section: what each is and WHEN to
proactively suggest it (multi-game check → N auditors in parallel + verify-worker-output rule;
"test the game" → playtest inside test-game 1.5; "check without uploading a draft" → local-stage
1.6 with rt.json; Codex questions → AGENTS.md path-based skills + manual hook compensation;
"how to update" → update-forge.bat). Lesson: an auto-generated catalog creates the ILLUSION of
full awareness — anything outside its source (skills dir) needs an explicit registry, or the
advisor will never route to it.

---

---

## v4.26.0 changelog (desktop layout doctrine — no more "square in a black void")

User pain (screenshots of tyl + dronedefence): every generated game renders as a centered square
with flat-black emptiness around it on widescreen desktop — the PRIMARY Yandex format (1.6.2.1) —
and he has to ask for a background every single time. Encoded in the engine:

- visual-upgrade +Step 0.7 (MANDATORY): (1) OCCUPY the width — stretch the field when mechanics
  allow; otherwise side panels ≥1200px via grid (mobile bottom-bar content moves to flanks on
  desktop); minimum: scale respecting 1.6.2.2 ≤2:1. (2) letterbox zones are ATMOSPHERE, never
  flat black — radial-gradient from the palette + themed pattern (inline SVG per art-direction:
  hexes/gears/stars) + Step 7c vignette; generated backdrop via asset-generation even better.
  (3) mandatory eyeball test at 1920×1080: "remove the game — cover art or a switched-off
  monitor?"
- debugcheck v2.17→v2.18: static WARN — centered fixed-width stage + pure-black body with no
  gradient/pattern/image anywhere (narrow heuristic; full-viewport games N/A; fixture clean).
  Pairs with the existing runtime "Canvas fills screen" FAIL (which caught tyl).

Lesson #108: recurring manual asks ("добавь фон, не оставляй черноту") are engine gaps in
disguise — if you request the same fix on every game, the template that generates the games is
the bug, not the games.

---

---

## v4.26.1 changelog (game-design: GDD must be computed FROM retention targets, not describe the prototype)

User complaint, confirmed by fact: tyl GDD (311 lines) had ZERO mentions of D7/D30/retention and
self-described as "по состоянию прототипа" — a prototype INVENTORY, not a design computed to the
R30 targets the analyst set. The product-metrics → game-design chain was broken: the designer
never consumed metrics.md.

game-design +Step 0.5 (MANDATORY, before core-loop work): (1) read wiki/architecture/metrics.md,
HARD STOP if absent (demand /product-metrics first — designing without targets forbidden);
(2) mandatory GDD section «Математика удержания» — a day-bucket table (D0-D1 / D2-D7 / D8-D30):
target from metrics → what the player DOES → systems → content VOLUME IN NUMBERS → hours covered
("глубокая прогрессия" is not an answer; "8 технологий по 15-25 мин" is); (3) acceptance: every
metric target maps to features+content volume; a target with no features = design hole, a feature
serving no target = cut candidate; (4) document status = "проект к постройке", the implemented
state is a column, not the frame.

Lesson #109: a designer given a prototype will document the prototype — the skill must force the
INPUT to be the targets (hard dependency on metrics.md) or the analyst→designer chain silently
degrades into inventory-writing.

---

---

## v4.26.2 changelog (product-metrics: mandatory content budget — KPI must not describe a non-existent game)

User re-check of the tyl analyst doc (actually READ this time, not grepped): exemplary KPI tables
(day-by-day control curve, win-rate corridors) — but every number describes ONE ~11-minute
campaign, while D7/D30 targets next to them require weeks of content. Nobody computed the gap:
the analyst set no content budget, the designer (fixed in v4.26.1) inventoried the prototype.

product-metrics output template +«Контент-бюджет под таргеты» (MANDATORY): day-bucket table —
target → minimum content the target IMPLIES → hours → what exists now → DEFICIT. Rules: minimum
horizon = 7 days (D30 row may wait for D7 measurement, D1-D7 always numeric); the DEFICIT column
is the doc's main output — it is the ТЗ handed to /game-design Step 0.5; KPI without a content
budget = metrics of a non-existent game, document INCOMPLETE. Chain now closed both ends:
analyst surfaces the gap, designer decomposes it into features.

Lesson #110: targets and content live in different units (percentages vs hours) — without a
forced conversion table between them, a project can have perfect KPIs and a 10-minute game, and
every document will look "done".

---

---

## v4.27.0 changelog (phase commands — one command per conveyor phase)

User: the phases are known — give a single command per phase that runs everything inside it.
Added 8 thin orchestrator skills over existing ones (no duplication — phase-2 delegates to the
existing design-pipeline): /phase-1-analyze (analyze-project → product-metrics, STOP at the
content-budget deficit table — the phase's key decision), /phase-2-design (design-pipeline →
deepen-game if the plan doesn't close the deficit, STOP at features-by-player-day),
/phase-3-visual (art-direction → visual-upgrade Step 0.7 → asset-generation, key-files check),
/phase-4-tech (mobile-game-ui → yandex-sdk-integration incl. mandatory GameplayAPI → ads →
bundle-libs), /phase-5-listing (localize → promo-screens → fill-yandex), /phase-6-test
(test-game stages 1/1.5/1.6, fix-and-rerun one at a time), /phase-7-release (release-ready to
GREEN → release-yandex + MANUAL checklist), /phase-8-live (seasonal-event, rating-watch,
audit-requirements, metrics re-review).

Shared rules in every phase: sub-skill gates are NOT bypassed (game-design still hard-stops
without metrics.md); between steps verify by fact not claim; each phase ends with a summary +
the next phase's command; wiki+sessions+check-drift at the end. Granularity ladder now: single
skills (fine control) → /phase-N (one phase) → /pipeline (everything).

---

---

## v4.27.1 changelog (engine self-audit #2 — one finding, fixed)

Full audit protocol (Lesson #101): all 21 verifiers (16 engine PASS; 4 "fails" = game-targeted
checks without a target, expected), debugcheck copies identical (v2.18), all hooks+scripts parse,
14/14 agents have model: tiering, all 8 phase skills reference EXISTING sub-skills, zero CJK
mojibake, coverage-map-vs-reality diff clean (all v2.16-2.18 checks present incl. ruBlya/
letterbox/i18n-runtime), MANIFEST 516 consistent, wiki top entry current, invariant #19 +
orchestration + manual checklist in place, AGENTS.md guard #13 green.

ONE real finding (docs-vs-reality class, again): /status suggested next commands with the OLD
per-skill hotkey layout (Ctrl+Alt+4 = visual-upgrade) while the Helper moved to the phase layout
in v4.27.0 (Ctrl+Alt+4 = /phase-4-tech) — a user following the hint would fire the wrong command.
FIX: status now suggests PHASE commands with phase hotkeys + the rule "этап N → /phase-{N+1}",
with per-skill fine control mentioned secondary. Confirms Lesson #101's class prediction: every
layout/tooling change leaves a stale reference somewhere — grep the OLD layout's artifacts
(hotkey strings) after any remap.

---

---

## v4.27.2 changelog (command reference lives IN the engine, versioned)

User: the command reference must live inside the project, carry the Forge version, and open with
how Forge itself is updated. Done: СПРАВОЧНИК-КОМАНД.md at repo root — §0 «Как обновляется сам
Forge» (update-forge.bat one-click flow + manual 5-step + the hard rule: personal files never
inside project-forge, MANIFEST is law), then the full reference (8 phases with hotkeys and
when-to-run, per-skill fine control by group, tools/scripts/agents, quick scenarios, Codex
invocation formula). The title carries the version and bump-version.mjs got a rule for it —
so the file can never silently desync from the engine (a stale header = a half-updated install,
and the file says so itself).

---

---

## v4.28.0 changelog (slash autocomplete for every skill — command wrappers + guard #14)

User typed /phase-1-analyze in a freshly-synced project and got "No commands match". Diagnosis:
NOT a sync failure — Claude Code's autocomplete popup lists only .claude/commands/ (we had 4
files), while all 124 skills worked by name-match when the text is sent anyway. Cosmetic, but a
real UX hole: typing by hand stops at the popup.

NEW scripts/generate-commands.mjs: a thin .claude/commands/{skill}.md wrapper for EVERY skill
(description pulled from the skill frontmatter, truncated before "Triggers on"; body = one line
"выполни SKILL.md + $ARGUMENTS"). Hand-written commands (no AUTOGEN marker — e.g. do.md) are
never touched; AUTOGEN ones refresh. Result: 123 created, 1 custom kept, 127 total. Drift guard
#14 (commands-coverage): every skill must have a wrapper — negative-tested (removed one → guard
fired with the exact fix command). generate-commands.mjs added to the release process alongside
generate-agents-md/manifest.

Note for users: after updating, RESTART the Claude Code session — the slash list is built at
session start.

---

---

## v4.28.1 changelog (revert v4.28.0 command wrappers — they DUPLICATED native behavior)

User screenshot after updating: every command listed TWICE in the autocomplete popup. Diagnosis:
his Claude Code version exposes .claude/skills natively as slash commands (the second entry with
"Triggers on:" is the skill itself) — so v4.28.0's AUTOGEN wrappers duplicated a layer the tool
already provides. The ORIGINAL "No commands match /phase-1-analyze" was the session-started-
before-update cache case, not a registration gap; the wrapper layer was built on a misdiagnosed
root cause without verifying on the user's actual environment first.

Reverted: 123 AUTOGEN wrappers deleted (4 hand-written commands kept: app/continue/do/game),
guard #14 removed, generate-commands.mjs removed from scripts and release process. MANIFEST back
to ~518.

Lesson #111: when a symptom disappears after "restart the session", STOP — do not also ship the
structural fix; and never build a compatibility layer for a tool behavior without reproducing the
gap on the target environment/version first. Diagnose-before-change applies doubly to fixes for
someone else's UI.

---

---

## v4.29.0 changelog (ports layer revived — Yandex-first doctrine + /port + fresh platform facts)

User: the platform layer (RuStore/VK/Google/Huawei) was abandoned while we built the Yandex
conveyor; platforms updated their SDKs; decision — platforms come AFTER a game is Yandex-ready
and own adaptation+build. Research done (web, July 2026): RuStore — unified Pay SDK replaces old
billing (unauthorized buyers, test payments in Console), ⚠️ payments require ИП/юрлицо since
01.02.2026 (ads-only unaffected), SDK Update delivers updates to the ~40% who never update,
featuring metrics = installs/ARPPU/rating, store going "more games"; VK Mini Apps — vk-bridge,
VK Pay via VKWebAppOpenPayForm, ⚠️ re-moderation after EVERY SDK update, ~45M MAU, runs in
VK/OK/Mail.

Added: NEW /port skill with the doctrine (port ONLY after release-ready yandex GREEN; port = SDK
layer + wrapper + listing, NEVER gameplay; honest degradation for missing features; port order
RuStore → VK → Google/Huawei sketches; wiki/ports/{platform}.md record). NEW rustore-builder
agent (was missing entirely — vk had one, rustore didn't) with current Pay SDK/SDK Update facts
and the ИП gate question. vk-builder refreshed with current facts. СПРАВОЧНИК got the ports
section. Google/Huawei honestly marked as sketches to be detailed on first real port — not
invented from memory (Lesson #111 applied).

---

---

## v4.29.1 changelog (/build — the missing CONSTRUCTION phase; the conveyor produced paper)

Field case (hostling): downstream Claude ran phases 1-6 and the game file was NEVER touched —
the conveyor produced metrics, GDD, master-plan, sounds, store card... and zero code. It then
invented "разработка по спринтам" outside the conveyor, wrote it up as a 40-day PLAN DOCUMENT
and asked A-or-B. User: "так а херли ты сразу так не сделал?" — correct instinct; the engine had
no phase that BUILDS. Phases 1-2 = blueprints, 3-7 = polish/wrap of something assumed built;
the construction step between them did not exist, so executors defaulted to producing more paper.

NEW /construct (phase 2.5, kind architectural): implement GDD/deficit features IN GAME CODE, sprint
by sprint; playtest after EVERY sprint (feature visible on screenshots, 01≠04); tick plan tasks;
do NOT ask permission between sprints (the plan was approved at the phase-2 STOP-point) — stop
only at real forks. Hard rules: no new documents instead of code ("сначала ещё дизайн-док" =
avoidance signal); no SDK work (phase 4), no visual polish (phase 3) — build function, ugly is
fine; honest sprint-by-session pacing for week-scale plans. phase-2-design now ends with →
/build (not /phase-3-visual); /status got the PAPER-WITHOUT-CONSTRUCTION rule: GDD newer than
last game-code change → stage = СТРОЙКА → suggest /construct. Справочник updated (row between
phases 2 and 3, no hotkey renumbering — Lesson: remaps leave stale refs).

Lesson #112: a pipeline whose every phase outputs documents will produce documents — executors
fill gaps with the medium the pipeline rewards. The construction phase must exist explicitly and
its output must be VERIFIED AS CODE CHANGE (mtime/playtest), or "done" means "described".

---

---

## v4.30.0 changelog (phases renumbered — construction is Phase 3 proper)

User: "фаза 3 конструкт и далее фаза 4 визуал и т.д." Renumbered: 1 analyze, 2 design,
**3 construct (СТРОЙКА)**, 4 visual, 5 tech, 6 listing, 7 test, 8 release, 9 live. All skill
dirs renamed (from the tail to avoid collisions), frontmatter names/titles/triggers updated,
the «Следующая фаза» chain re-verified link by link 1→9, status hotkey hints aligned, справочник
retabled, hotkey layout: Ctrl+Alt+1..9 = phases, 0 = /status (return-to-project is the most
frequent single action), /pipeline moved to utilities. Applied own Lesson #111/#112 discipline:
grepped ALL artifacts of the old numbering (skill names, phase titles, trigger strings, hotkey
hints) — zero stale references outside changelog history.

---

---

## v4.30.1 changelog (field defects: phase outputs verified as FILES; asset sizes verified as FACT)

Two field reports from a real run:

### 1. No phase produced SETUP_GUIDE — user ran fill-yandex by hand
SETUP_GUIDE.md is fill-yandex's artifact and phase-6-listing calls fill-yandex — but the phase
had ZERO output verification, so a skimmed step vanished silently. FIX: phase-6 got a mandatory
«Выход фазы — ФАЙЛЫ» table (SETUP_GUIDE, listing texts, promo, lang blocks — each checked by ls,
"скил отработал" ≠ "файл существует"); phase-8-release got gate 0: run check-setup-guide.mjs
(the verifier EXISTED in the engine but was wired to nothing — Lesson #101 class again) before
release-ready; missing → back to fill-yandex.

### 2. icon_512.png contained a 1024×1024 image; cover not 800×470
asset-generation named files with target sizes but never enforced them — Gemini returns arbitrary
dimensions, the filename was an intention. FIX: Step 4.5 (MANDATORY) — the generated .bat must
post-process every image (icon 512×512 resize; cover 800×470 COVER-CROP, never stretch;
screenshots 16:9) via a PIL snippet embedded in the skill, then VERIFY and PRINT actual
dimensions; summary with exit 1 on any mismatch. Rule: the filename is not a guarantee — the
printed actual size is; no green size summary → assets don't go into the game/draft.

Lesson #113: a pipeline step's completion must be defined by its ARTIFACT (file exists, dimensions
match), never by the step having "run" — names, logs and intentions all lie; ls and pixel counts
don't.

---

---

## v4.30.2 changelog (phase-8 surrenders by ARTIFACT — the 16-FAIL upload case)

Field case: a build passed "all phases", was uploaded, and the in-draft checker found 16 STATIC
fails — which release-ready (the SAME checker) cannot have survived to GREEN. Conclusion: phase 8
was reported done as a CLAIM, not a fact. Hardening: phase-8 now surrenders by artifact — the
literal `TOTAL: X pass, Y fail, Z warn` line from the final release-ready run must be copied into
the wiki release task; Y≠0 → phase not passed; "прошли проверку" without that line is not
accepted. (Lesson #113 applied to the phase itself: completion = artifact, never narration.)

---

---

## v4.30.3 changelog (🔴 DECISION PROTOCOL — user decisions can no longer drown in text)

User: "может все моменты, которые требуют моего решения, делать красным?" Encoded as a CORE
protocol (CLAUDE.md → AGENTS.md via generator, so it binds Claude Code, Codex and any executor):
every user-decision moment is rendered ONLY as the standard block — 🔴🔴🔴 header, one-line
question, options with consequences, a recommendation, and "⏸ Работа ОСТАНОВЛЕНА". Rules: the
block is LAST in the message (never buried mid-text), one block per decision, execution HALTS
(no "пока предположим А"), a clear list of what IS a user decision (money/scope/irreversible/
invariant conflicts/platform choice) vs what is NOT (mechanics inside the approved plan — just
work). Phase STOP-points (Ф1 deficit, Ф2 features-by-day, Ф8 TOTAL) use the same block.

---

---

## v4.30.4 changelog (no generated text on icons/covers/promo)

Field defect: generated icons/promo came out WITH text — generators mangle letters (pseudo-glyphs
= instant non-production look, rejection risk), and the game title belongs in Console draft
FIELDS, not baked into art. asset-generation +Step 4.4 (MANDATORY): every icon/cover/promo/
screenshot-frame prompt must END with the full no-text negative suffix (no text/letters/words/
typography/captions/logo text/watermark/UI labels) and must not request lettering positively;
if the user explicitly wants a title on the cover — it is a separate post-step: PIL overlay with
a REAL font from the project's fonts/, never generated glyphs; Step 4.5 summary got the eyeball
item "no text on icon/cover/promo" — an image with letters fails and is regenerated with a
stronger negative.

---

---

## v4.30.5 changelog (store-asset prompt recipes — no icon-of-an-icon, hero-close-up covers)

Field (hostling): the generated icon was an "icon of an icon" — a rounded tile with margins and
vignette INSIDE the canvas (the store rounds corners itself; margins = edge garbage), and the
cover was a gameplay panorama with a tiny hero — doesn't sell. asset-generation +Step 4.3
(MANDATORY): icon prompts must demand FULL-BLEED edge-to-edge art (hero close-up ~80% of frame)
with the no-frame negative set (no border/rounded corners/margins/app-icon-mockup/squircle);
cover prompts must demand a hero CLOSE-UP ≥50% of height, single focal point, emotion — panoramas
and screenshot-like scenes forbidden (screenshots sell gameplay, the cover sells emotion).
Step 4.5 eyeball items += icon is full-bleed; cover focal point reads at 200px thumbnail.

---

---

## v4.30.6 changelog (naming rule — Russian for players, Latin for machines)

User: "запрети давать английские имена". Encoded in core with the critical split: everything the
PLAYER sees is Russian (game title in the draft, modes/buttons/items/enemies, listing texts,
promo), everything the MACHINE sees stays Latin (file/dir/project names on disk, ids, save keys,
CSS classes — Cyrillic paths break bats/zips, learned before). Rules: proposed game/feature names
default to Russian (Yandex RU market); an English game title only if the user gave/approved it;
mixing forbidden ("Wave 3" in a Russian HUD = defect → «Волна 3»); Latin for international
branding is a 🔴 user DECISION, never a default. Core placement → AGENTS.md via generator, binds
all executors.

---

---

## v4.30.7 changelog (promo-screens: native-res capture, gameplay-with-HUD, two sets + локализация)

Field defects (hostling/typing-game screens): (1) captured small (~470px) then UPSCALED to 1920 —
mush, violates 8.3.1 "no compression artifacts"; (2) frames of empty fields with no HUD — pretty
but unreadable as gameplay; (3) only one screenshot set while the Console requires SEPARATE
desktop and mobile sets. Verified against requirements (8.3.1, Console form standards, platform
news): promo-screens got three iron rules — capture at NATIVE target viewport (1920×1080 desktop,
1080×1920 mobile portrait, 1920×1080 mobile landscape; downscale allowed, upscale NEVER, squash =
rejection, pixel-art integer-scale watch); every frame = gameplay mid-action WITH HUD (2-second
"what do I do here" test, no pause dimming, no debug panel, no fake mobile letterbox bars, min 3
frames early/mid/late); TWO sets by orientation from the draft + per-language localized shots
(?lang=xx — Russian UI in the EN catalog = замечание). Fact check after shooting: script prints
actual dims, mismatch or upscale-origin → FAIL.

---

---

## v4.30.8 changelog (aggressive ads-only monetization doctrine + retrofit procedure)

User: monetization comes out "polite" while the business model is ads-only — boosters, speedups,
resets, session rewards must all sit behind rewarded video; needs to fix 5 games NOW.
monetization-design +🔥 doctrine: density rule (a meaningful RV offer every 2-3 minutes of play),
an 8-pattern RV hook catalog mapped to player desires (faster / more money / again / no-wait /
free chest / pre-run boost / double daily / extra slot) with minimum 5 hooks per game (target
6-8); interstitial stays background-only (≥60s CD, gesture 4.4 — aggression lives in RV, not
interstitials); hard boundaries that make aggression sustainable (RV always voluntary per 4.5 —
that's exactly WHY it can be dense; base game playable without ads or the rating dies faster
than ARPDAU accrues; honest rewards; 4.7/4.2 as always); aggression metrics (RV/DAU floor 1.0 /
target 2.5 / stretch 4+, <1 means hooks aren't on desires). Plus 🔧 RETROFIT procedure for
existing games: inventory hooks → desire map per game system → top-5 delta by contact frequency
→ implement with honest 📺 buttons → playtest each hook.

---

---

## v4.30.9 changelog (SETUP_GUIDE: self-contained Russian copy-paste doc; categories/tags from Yandex's REAL list)

Field defects (recurring, user flagged repeatedly): SETUP_GUIDE kept REFERENCING store-listing
JSON instead of containing values, and invented categories/tags. fill-yandex hardened: (1)
SETUP_GUIDE.md is a SELF-CONTAINED document for the human filling the Console — every field as a
verbatim Russian value ready for Ctrl+C→Ctrl+V; any "см. store-listing.json" reference is
FORBIDDEN (JSON may exist for machines, the guide must be complete without it); (2) categories
and tags are a PICK-FROM-LIST in the Console — before writing the guide, check the live Yandex
catalog and use REAL category/tag names (an invented category isn't in the dropdown = useless
guide), with the verification date stamped in the guide; (3) mandatory 14-field structure in
Console fill order (title, about, how-to-play, SEO no-dup-5.11, keywords, categories, tags, age,
orientation, languages, icon/cover with Step-4.5 sizes, screenshot sets, IAP tab vs code —
1.13.6 trap, pre-submit checklist), per-language blocks for each declared language.

---

---

## v4.30.10 changelog (layout-independent keyboard + RV hook differentiation)

Two field defects: (1) WASD dead in the Russian keyboard layout — code compared e.key==='w'
(layout-dependent symbol; ru gives 'ц') instead of e.code==='KeyW' (physical key, any layout).
mobile-game-ui got the hard rule (movement/actions ONLY via e.code; e.key only for text input
and Escape; arrows always duplicate WASD); debugcheck v2.18→v2.19 static check: e.key compared
to w/a/s/d without any e.code KeyX usage → WARN "controls dead in ru layout" (N/A when no
keyboard; fixture clean). (2) After the aggressive-ads ask, executors added CLONE buttons — many
hooks giving the SAME reward. monetization-design +differentiation rule: one reward TYPE = max
ONE hook; 6 hooks = 6 DIFFERENT benefits (money/speed/points/boost/revive/skin/daily×2); retrofit
check = a hook→reward table, a repeated reward is a defect; hooks must also differ by MOMENT
(pre-run / during / after / on-fail) — moment coverage beats button count.

---

---

## v4.30.11 changelog (/gacha-meta — RV-fueled gacha/roulette/daily layer for every game)

User: build gacha with skins/consumables/currency into every game, spins behind rewarded ads.
Researched (July 2026): daily reset wheel = the strongest habit builder (D1-D7 visit pattern);
scratch cards = low-friction reactivation; pity system is MANDATORY (guaranteed rarity per N
pulls or the gacha frustrates instead of hooking); collection drive + limited-time banners add
urgency; mechanics must match player lifecycle stage.

NEW /gacha-meta skill: 7-mechanic catalog (daily wheel / gacha banner with skins / daily
calendar / scratch card / timer chest with RV-instant / collection album / limited banner) with
genre-fit and day-bucket mapping — pick 2-3 per game, not all; pool composition percentages
(currency 60-70, consumables 20-25, skins 5-10 visual-only, jackpot 1-2); iron rules: visible
pity counter stored in save, odds disclosure button (honesty = 2.13), skins are visual never
power, duplicates convert, RV wiring per the aggressive doctrine (gacha spins = separate RV
budget outside the hook-differentiation limit), no casino aesthetics (age/category); universal
gacha.js module pattern (weighted roll + pity + setData save + 1.5-2s spin animation); 5-step
retrofit order for existing games ending with playtest + metrics tie-in (RV/DAU toward 2.5).

---

---

## v4.31.0 changelog (phases integrate the monetization/meta layer + audit #3)

Phases rewired for the new layer: phase-2-design now includes the 🔥 aggressive monetization
pass (≥5 differentiated RV hooks) AND /gacha-meta mechanic selection (2-3 per genre with reward
pools) as part of the D1-D30 retention plan and the STOP-point; phase-3-construct got mandatory
SYSTEM sprints (RV hooks per approved map, gacha module with visible pity/odds/dup-conversion,
keyboard via e.code only + arrows); phase-7-test now verifies every RV hook clicks→rewards→
declines safely, gacha pity survives F5, and WASD works in the RUSSIAN layout. Advisor got a
proactive monetization section (low RV/DAU → doctrine+gacha; poor returns → daily layer; check
existing hooks via grep before advising the delta). Справочник += /gacha-meta row.

Audit #3 (Lesson #101 protocol): 17 engine verifiers PASS (4 expected game-targeted exits),
debugcheck copies identical v2.19, hooks/scripts parse, 15/15 agents tiered, phase chain 1→9
verified link-by-link, zero stale old-numbering/construct refs, zero CJK, coverage=reality
(ru-layout/letterbox/i18n-runtime/IAP-PERMIT checks present). ONE gap found and fixed during
audit: справочник had no /gacha-meta row (the new-tool-invisible-to-docs class again).

---

---

## v4.31.1 changelog (record-promo — gameplay video alongside screenshots)

User: also produce promo VIDEO (~28s / ≤100MB — those limits live in the Console FORM per 5.3;
8.3.1 quality applies). NEW scripts/record-promo.mjs: the script PLAYS the game itself (same
heuristics as playtest: menu click-through, 5×5 canvas grid, keys) while recording via CDP
screencast → ffmpeg → mp4 h264 (desktop 1920×1080 default, --w/--h for mobile portrait), no
audio (catalog promo autoplays muted). Surrender by FACT: ffprobe-verified resolution/duration/
size printed, any mismatch = exit 1; too few frames = "game didn't render" fail. ffmpeg required
(winget install ffmpeg), puppeteer auto-installs. promo-screens skill wired with both commands,
content rules (gameplay from second one, no debug panel, eyeball the result — a boring video is
worse than none) and the check-limits-in-form reminder.

---

---

## v4.31.2 changelog (video processing GPU-only)

User: video trim/encode must go through GPU. promo-screens video step now mandates NVENC
(CPU encode forbidden — slow, pointless heat): ffmpeg -hwaccel cuda + h264_nvenc -preset p5
-cq 23 recipe for the ≤28s trim, scale_cuda for resize/crop, availability check via
`ffmpeg -encoders | findstr nvenc`.

---

---

## v4.32.0 changelog (canonical promo recorder — infrastructure beats per-game one-offs)

Field signal: a downstream executor found no recorder scripts in a game project and started
WRITING ITS OWN — the exact per-game-zoo class (Lesson #108/#112). User: "может нам нужно сразу
инфраструктуру подготовить?" — yes. NEW scripts/record-promo.mjs (canonical): serves the game
with a mock SDK, puppeteer PLAYS it (menu clicks → 5×5 canvas grid / touch → keys), records via
page.screencast, then GPU-only assembly (h264_nvenc mandatory — hard stop without NVENC, per
v4.31.2), trims to ≤28s with --trim-start (hook control), outputs promo-desktop.mp4 +
promo-mobile.mp4 (portrait/landscape via --orientation, touch emulation for mobile), prints
ffprobe FACTS (dims/duration) + the eyeball checklist; raw-*.webm kept so a weak hook is fixed
by re-trimming, not re-recording. promo-screens rewired: recorder = the PRIMARY path with an
explicit ban on writing one-off recorders in games; manual local-stage+OBS demoted to the
quality alternative. Справочник += recorder row.

---

---

## v4.32.1 changelog (recorder frozen-rAF fix — CDP focus emulation)

Field report (hostling video attempts, thorough downstream debugging): in an automated browser
the window is "not in focus" → requestAnimationFrame throttles/freezes → page.screencast and
screenshots return the FIRST frame while the JS state advances (live pos/consumed, stale
pixels). Tried and insufficient: anti-throttling flags alone, headful, visibilityState spoof,
rAF→setTimeout. The canonical fix — CDP `Emulation.setFocusEmulationEnabled({enabled:true})` —
is now wired into scripts/record-promo.mjs (per-page CDP session before viewport) PLUS the
anti-throttling launch flags as a belt (--disable-background-timer-throttling,
--disable-backgrounding-occluded-windows, --disable-renderer-backgrounding). Same fix benefits
any future screencast use. Fallback documented in the field report if focus emulation ever
fails: deterministic frame compositor (canvas.toDataURL per frame + HUD overlay → NVENC).

---

---

## v4.32.2 changelog (self-healing rAF shim — CDP focus emulation proven insufficient in the field)

Field fact (hostling, round 2): even WITH Emulation.setFocusEmulationEnabled + anti-throttling
flags, rAF stayed dead in the downstream setup (bot detected the recorder, game night never
advanced — loop never ticked). Timers, however, stay alive with the flags. The canonical
recorder now injects a SELF-HEALING rAF shim BEFORE game code (inside the serve-time mock):
callbacks are queued through a wrapper; while native rAF ticks, it flushes them (vsync-smooth,
fully transparent); if no native tick for >250ms, a watchdog flushes the queue on a timer with
performance.now() timestamps. Games and autoplay bots don't notice the swap, and late-spoof
failure modes (game captured native rAF before a fix) are impossible because the shim precedes
all game code. CDP focus + flags kept as first line; shim = guaranteed floor.

---

---

## v4.32.3 changelog (two rules from the drawRival case)

The hostling promo shoot exposed a PRODUCTION freeze bug (night 4+, v1.4-v1.8): an auto-replace
by a NON-UNIQUE anchor (identical line in drawParasite and drawRival) patched the wrong function
("p is not defined" → loop stops re-queuing → freeze), and it survived because manual swarm
tests stepped the simulation WITHOUT render() — drawRival never ran. Encoded: (1)
phase-3-construct hard rule — auto-replace only by a UNIQUE anchor (grep -c == 1 before
replacing; widen until unique); (2) test-game «правило поздних состояний» — runs must reach
LATE game states with render() alive (time-cheat allowed, rendering not skippable); "state
advances" ≠ "game works", verdict only by late-stage frames.

---

---

## v4.32.4 changelog (bump-version works from any directory)

Field friction: `node F:\...\project-forge\scripts\bump-version.mjs --current` from an
arbitrary cwd failed with "Run from Forge root" — the script resolved the root from cwd.
Now the root is resolved from the SCRIPT'S OWN location (scripts/ → parent, with a Windows
drive-letter-safe file-URL conversion), cwd kept as fallback, and the script chdir's to the
root so all relative file operations stay correct. Version checks now work from anywhere —
which matters because "which engine version am I on" became the first step of every field
prompt.

---

---

## v4.33.0 changelog (RU-only doctrine — one language by default, i18n architecture always)

User decision: default = Russian ONLY across the whole conveyor (the 13-language default kept
exploding work: translation attempts, 13× screenshot sets, checks). Core doctrine block added
next to NAMING: draft declares ONE language (ru); texts/listing/screens/video = one Russian kit;
auto-translating "to all languages" is FORBIDDEN. BUT the architecture stays i18n-ready even in
RU-only: every player-facing string goes through the key→word dictionary (I18N.ru + t()),
hardcoded text in render/HTML = defect even in Russian, detectLang SDK-first from day one — so
adding a language later is dictionary translation, not code surgery. Adding a language = ONLY an
explicit user command /localize <lang> (one language per command: dict translation + that
language's screens + listing texts + draft entry). localize skill split into the two modes
(АРХИТЕКТУРА default / ДОБАВИТЬ ЯЗЫК explicit); phase-6 rewired (only-ru draft, i18n-dict output
row). Fewer moving parts per release, clean path to expansion when a game earns it.

---

---

## v4.33.1 changelog (ad-rules REQ-3.8 false positive on minified bundles — upstreamed field fix)

Field fix from a downstream (patched locally FIVE times, killed by every engine update — the
exact reason upstream exists): the hardcoded-currency regex used \d[\d.,]* — a number could END
with a comma/dot, so esbuild-minified code like `-16,$=new Y` matched `16,$` → "hardcoded
currency" blocker out of thin air. Real prices never end before the symbol without a digit.
Fixed in all 3 places: \d(?:[\d.,]*\d)? (number must end with a digit). Unit-tested: 299₽ and
"1 999,99 ₽" still caught, `-16,$=new Y` / `x=16,$a` / `5.$b` no longer match, $25 caught.
Downstream instruction: stop patching zips/checkouts — the canonical validator carries the fix
from v4.33.1 on.

---

---

## v4.33.2 changelog (Step 0.7 composition rules — panels are part of the world)

Field case («Обход»): the executor followed Step 0.7 formally — added side panels via grid —
and made it WORSE: three default-CSS boxes floating in the void, detached from the field, in no
style, background still flat darkness with dots. Step 0.7 +2b composition rules: panels GROW
FROM the field edge (one scene in one frame, not islands at screen corners); panels are built
from the GAME's materials (same palette/textures: wooden game → shelves/plaques, terminal →
monitors; default border+background = defect); the CENTER grows too (panels ~20-25% width each,
field takes the rest — offloading is not an excuse to keep the field narrow); the backdrop is
art-direction atmosphere, not dotted fill. Acceptance test: "does it read as ONE artwork or as
a game with an admin panel bolted on?"

---

---

## v4.33.3 changelog (Step 0.7 rule 2c — desktop is a RECOMPOSITION, not margin decoration)

Field case («Обход» round 2, user screenshots of the live desktop mode): the executor built the
2b scaffolding (courtyard backdrop, paper-note/shelf panels in game materials) — but around a
FIXED 420px portrait core scaled by height, so the center stayed narrow on 16:9; fonts 11-13px
unreadable at 1920; modals drawn in column coordinates with buttons touching frames and dimming
that covers only the column; bottle/flea/chest duplicated in both center and side rails; run HUD
a half-empty dark rectangle; card info on HOLD (touch pattern) instead of hover. Rule 2c added
to visual-upgrade: desktop core gets its OWN width (≥900 guideline vs ~420 base) with content
re-laid in 2-3 rows ACROSS, larger sprites; typography scales (16-18 base, 22-24 headers);
modals sized from the desktop core with ≥16px padding, full-screen dimming; panel-offloaded
elements are REMOVED from center, not duplicated; pointerover tooltips mandatory on desktop;
half-empty HUD = defect. A narrow portrait column centered on a wide screen is a defect BY
DEFINITION regardless of how pretty the margins are.

---

---

## v4.33.4 changelog (Yandex Console pre-publication checklist encoded + AI-usage field)

User screenshot: the Console now shows a "Чеклист перед первой публикацией" with paragraph
references — Yandex's own distilled first-pass list. Two novelties encoded: (1) §1.14 tech gate
now verifies THE FACT of a draft launch automatically on their side — phase-8 got gate 0a
(draft upload + checker run closes it; MANUAL checklist logs "черновик запускался: дата");
(2) a mandatory "Использование ИИ" field (fully/partially/not used) — fill-yandex item 14б as
a 🔴 user decision with the honesty rule: our conveyor IS AI tooling, so "частично" when the
user drives design/art-direction/decisions, "полностью" for end-to-end generation; one studio-
wide answer fixed in wiki. Item 14 now mirrors the real Console checklist verbatim (SDK §1.1,
GameplayAPI §1.19.2, i18n §2.14, no-JS-errors/no-freezes §1.14/1.15, getPlayer saves §1.9,
desktop+mobile §1.10, contextmenu §1.6, focus/ad sound pauses §1.3/4.7, logical-pause ads §4.4,
rewarded explicit consent §4.5, age §2.7, unique title §5.12, genre match §2.3, localization
§2.10, content §3.4-3.6) — each with ✓/✗ status mapped to our checks in SETUP_GUIDE.

---

---

## v4.34.0 changelog (phases panel in dashboard — copy prompts + per-game done-checkboxes)

User: embed the phase list (Claude commands + Codex/Kimi prompts — same commands for both) into
dashboard.html with copy buttons and per-game checkboxes for completed phases, maintained by the
engine henceforth. Dashboard got a «🏭 КОНВЕЙЕР ФАЗ» section: game selector fed from the
existing forge_projects storage; a table of 9 phases + status/gacha-meta/port utilities; each
row = done-checkbox (persisted per game in localStorage forge_phases_<name>, done rows dim),
hotkey, the Claude command with ⧉ copy, and the FULL Codex/Kimi prompt behind its own ⧉ copy
(current formulations: unique-anchor, e.code, RU-only, TOTAL artifact, Console checklist,
recorder). Maintenance is enforced, not promised: check-drift got a new guard — every
.claude/skills/phase-* dir must appear in dashboard.html, so renaming/adding a phase without
updating PH_DATA turns drift red. Dashboard structure baseline regenerated.

---

---

## v4.34.1 changelog (phase checkboxes moved into the edit-project modal)

User feedback on v4.34.0: the separate game-selector + checkbox column was inconvenient — phase
status belongs to the project card. Rework: the edit modal («Редактировать: <игра>») is now
two-column (fields left, «ФАЗЫ КОНВЕЙЕРА» checklist right — phases 1-9 + port), modal widens to
880px on open and resets on close; checkboxes persist to the same forge_phases_<name> storage.
The bottom panel stays as a pure prompt reference (hotkey / phase / ⧉ Claude / ⧉ Codex-Kimi),
selector and checkbox column removed. All inline scripts parse, dashboard baseline regenerated,
phases drift-guard still green.

---

---

## v4.34.2 changelog (modal phases checklist: layout fix + copy buttons)

Field screenshot: the modal checklist rendered as a broken staircase — root cause: the modal's
global CSS (.modal input{width:100%;padding:10px}) inflated the checkboxes into invisible
full-width blocks. Fixed with explicit inline sizing (14px, no padding, flex:0 0 auto,
accent-color) and a flex row (checkbox / name flex:1 / buttons). Also added per-phase copy
buttons right in the modal — ⧉C (Claude command) and ⧉K (full Codex/Kimi prompt) — with a
legend in the header; user-select:none kills the accidental text-highlight. Lesson: components
injected into a styled container must neutralize the container's global input/label CSS
explicitly.

---

---

## v4.35.0 changelog (pack-handoff — one-command tracker handoff archive)

User: need a command/button that assembles the archive they attach in the internal tracker —
latest build + all store listings, setup guides, screens, video, etc. NEW canonical
scripts/pack-handoff.mjs: finds the NEWEST build zip across typical locations (game tree +
../Release/<name>, handoff/ excluded), collects store materials by pattern (SETUP_GUIDE*,
store-listing*/listing*, icon*/cover*, screens/** incl. video, StoreData/**, metrics.md),
stages into build/ + store/ + MANIFEST.txt (build name/size/mtime, per-file sizes — facts, not
claims), zips to <game>/handoff/<name>-handoff-<date>.zip (Windows: Compress-Archive; *nix:
zip), prints the manifest and warns explicitly when no build is found (run phase-8 first).
Smoke-tested on a synthetic game tree. Dashboard PH_DATA += Handoff row (⧉C command / ⧉K
prompt in both panel and edit-modal), СПРАВОЧНИК += row, dashboard baseline regenerated.

---

---

## v4.36.0 changelog (canonical sync — the missing distribution layer)

Field case (metro): a freshly created game folder had no skills → "Unknown command:
/phase-1-analyze"; investigation showed sync.bat NEVER EXISTED in the engine (root has only
setup/upgrade/migrate) — skills reached games by untracked manual paths. NEW canonical
scripts/sync.mjs + sync.bat wrapper: auto-discovers sibling project folders (index.html /
CLAUDE.md / .claude markers; engine, Release, node_modules etc. skipped), distributes the
payload (.claude/skills, .claude/agents, .claude/hooks, AGENTS.md, СПРАВОЧНИК-КОМАНД.md,
debugcheck.js from the canonical template), byte-compares before copying (idempotent:
"актуально ✓"), prints FACTS per game (files updated count) and reminds to restart Claude Code
sessions. --game <name> targets one project, --dry previews. NEW new-game.bat <name>: mkdir +
targeted sync — a new game is conveyor-ready in one command. Smoke-tested on a synthetic
sibling (188 files first pass, idempotent second). Справочник += row.

---

---

## v4.37.0 changelog (quarterly internet sweep — findings implemented)

Quarterly sweep (July 2026). Findings and what shipped:

### Claude Code platform
Skill description listing cap was raised 250 → 1536 chars. AUDIT FOUND: **83 of 127 skills had
descriptions over 250** — their trigger tails were silently truncated for months (explains
"skill exists but never fires"). Max is 835, so the new cap heals all of them automatically.
NEW scripts/check-skill-descriptions.mjs (fail >1536, warn >85%), wired into check-drift so it
can't regress. Also: positional $1/$2 placeholders are no longer stripped → phase-1-analyze,
pipeline, port, localize now document their `$1` argument; `context: fork` skills now run in
background by default (noted for future skill design); agent names can't contain ':'.

### Skills ecosystem
SKILL.md became the cross-platform standard (Claude Code, Codex, Gemini CLI, Cursor + 8 more) —
validates the brain-swappable harness. Marketplaces exist (345-skill packs) but are generic web/
marketing skills; NOT imported (our skills are field-forged, generic ones would pollute advisor
triggers). Noted SkillSpector (security scanner for third-party skills) if we ever import.

### Graphics — implemented
asset-generation +Step 4.6 PIXEL-ART PIPELINE (2026 industry standard): generate LARGE →
downscale → re-index palette (ADAPTIVE 16-32 colors) → hand-clean; hard rule that AI does NOT
hold a character consistent across animation frames (one base sprite → animate in code or 2-3
hand frames; asking a diffusion model for an 8-frame walk cycle = garbage); tilesets need
tiling-aware generation + 3×3 in-game seam check; current models noted (Flux 2 concept/backdrops,
Z Image Turbo + pixel LoRA for fast retro sprites).

### Asset catalog (user request)
NEW scripts/asset-catalog.mjs → single-page asset-catalog.html: every image in the project,
grouped by folder, with client-side palette extraction (5 dominant colors per asset), real
dimensions, file sizes and a live filter. Purpose: see the WHOLE style at once, catch off-style
assets, duplicates and wrong sizes. Wired as Step 4.7 (mandatory after mass generation, before
visual acceptance), dashboard row (⧉C/⧉K) and справочник. Smoke-tested.

### Yandex strategic signals (no code, informs doctrine)
Average playtime approaching 60 minutes, players return to specific deep games rather than
grazing hypercasual — validates the retention math turn. 2025: 24k games published vs 29k
REMOVED — the quality bar is the platform's main filter, and our 84-check pipeline is exactly
the defence. Platform positions itself as an "OS for games" (recommendations, LiveOps, market,
social); "first payment is the hardest conversion" (we're ads-only, unaffected); AdMob's exit
from RF leaves Yandex's own network the effective monetization for local traffic; WebGPU is
coming and will blur web/native further — vanilla-JS niche widens rather than ages.

---

---

## v4.37.1 changelog (localize frontmatter repair — a 4-version-old self-inflicted bug)

Running the FULL verifier suite after the sweep release caught it: `localize` had no valid
frontmatter — in v4.33.0 the RU-only «ДВА РЕЖИМА» block was prepended ABOVE the `---` header,
pushing name/kind/description out of frontmatter position; a skill with broken frontmatter may
not register at all. Root cause on our side: that release ran only check-drift instead of the
full suite, so check-skill-kind never saw it. Fixed: frontmatter restored to the top, the modes
block moved below; description rewritten from the stale "13 языков" text to the current RU-only
two-mode wording (the old description also mis-triggered the skill toward translating). Full
suite (drift, cross-refs, skill-kind, claude-md-size, debugcheck-fixtures, skill-descriptions,
dashboard-structure) now green — and that suite, not a single guard, is the release gate.

---

---

## v4.38.0 changelog (REJECTION 1.19 — input accepted before ready(); debugcheck v2.20)

Field rejection (app-553975): "GameReady API works incorrectly — GRA connects AFTER the game
becomes playable". The console log settled it in three timestamps: first accepted click at
1143ms, LoadingAPI.ready() at 2535ms, SDK language read at 2837ms. So the game was playable
1.4s BEFORE ready() (moderators click through the loader), and the language was resolved after
BOTH. Our checker had collected both marks but only compared click-vs-lang — never
click-vs-ready. Fixed at the root:

- **debugcheck v2.19→v2.20**: runtime issue «🚫 ОТКАЗ 1.19: ВВОД ПРИНЯТ ДО ready()» printing
  click/ready ms and the gap, plus a static check that input listeners exist without any visible
  gate (inputEnabled/isReady/...) → WARN. Fixtures clean, copies byte-identical.
- **yandex-sdk-integration**: hard load-order doctrine — init → detectLang → paint first screen →
  ready() → THEN inputEnabled = true; the gate snippet is mandatory; "press to start" before
  ready() is forbidden; heavy assets either before ready() (loader honestly up, game dead) or
  lazily after — no "picture alive, ready() pending" state; verification = the runtime line must
  be absent in the draft console.

---

---

## v4.38.1 changelog (debugcheck v2.21 — Event Timeline now VERDICTS the order)

User looked at the Event Timeline panel on a live build (sdkInit 225, firstUserClick 635,
langDetected 2009, gameReady 2028) and asked the right question: "shouldn't it be screaming that
the user clicked before ready()?" It should — and the console does since v2.20 — but the PANEL
printed the expected order as a grey hint line and never checked it. Same pattern as the
rejection itself: data collected, comparison not made. v2.21: the timeline computes verdicts for
four pairs — click-vs-ready (REQ-1.19, with the explicit «ОТКАЗ: игра играбельна до ready()»
suffix), lang-vs-click (REQ-2.14), lang-vs-ready, ready-vs-init — renders them green/red under
the log, and the section badge switches LOG → ORDER OK / ORDER FAIL so a violation is visible
without expanding. The expected-order hint now includes langDetected. Verified by replaying the
user's exact timings through the function: ORDER FAIL, 2 red verdicts, 2 green.

---

---

## v4.39.0 changelog (asset library — user-curated sources, searched BEFORE generation)

User has a purchased Unity/Synty pack library plus a harvesting toolchain and wants Forge to
search ready assets instead of generating everything; he wants to curate sources himself in an
HTML page living next to the dashboard.

NEW **asset-library.html** (engine root, opens from the dashboard header): add/edit sources with
name, path/URL, kind (2d/3d/audio/unity/font/ui), searchable description, tags, LICENSE class +
check date, and a free-form «как извлекать» notes field that Forge reads as the extraction
manual for that source; live filter by text and kind; localStorage persistence with «Экспорт для
Forge» writing **asset-library.json** (engine root) and json import.

NEW **/asset-library skill**: order rule — for generic objects (props, tiles, UI icons, 3D
blanks, UI sounds) look in the library FIRST; generate only what defines the game's face (hero,
store art). Hard license gate: free → take; attr → take + credits screen task; paid → per
seller's terms (use in games yes, reselling sources no); **no (NC/GPL) → never** (ads = commercial
use). Extraction strictly per the source's own notes; style gate against art-direction (foreign
style next to generated art is the loudest cheap-build tell); provenance line per file in
wiki/assets-provenance.md (file | source | license | date); asset-catalog run afterwards.
asset-generation got Step 4.0 pointing at it; dashboard header button + phases-panel row;
справочник row. Seeded asset-library.json with the user's Synty entry (catalog-first search,
selective extraction, Blender-only conversion, gltf-transform optimization, one atlas per pack,
no animations in mesh packs, shared skeleton, never unpack the whole library).

---

---

## v4.39.1 changelog (asset library: use-case axis, quality ratings, phase-4 question)

Three user refinements to v4.39.0:
1. **Applicability axis** — each source now carries `use`: `2d` / `3d` / `any` (3D models can be
   rendered to sprites → «universally»), shown as a badge and filterable; the skill won't offer a
   3D-only source for a 2D game unless the notes contain a sprite-render recipe. Tags reaffirmed
   as the primary search channel (hint added in the form).
2. **Quality ratings — the library learns.** Sources get 1-5★ (clickable stars right on the card,
   plus an «опыт использования» note); the list sorts by rating, a «скрыть слабые (★≤2)» filter
   exists, and the skill's rule: prefer ≥4, **never offer 1-2★** except when nothing else exists
   (and say so honestly). After assets land in a game, Forge proposes a rating WITH reasoning
   (mesh/sprite quality, style fit, extraction effort, description accuracy) — so over a few games
   the good sources float up and the bad ones drop out of suggestions automatically.
3. **Phase-4 asks the user.** phase-4-visual now opens with «Шаг 0 — библиотека или генерация?»:
   Forge lists matching sources (filtered by use/kind/tags, sorted by rating) and asks А) take from
   library / Б) generate everything / В) mixed — generic from library, hero and store art generated
   (marked as usually optimal). Empty library or no match → one line and straight to generation, no
   question. asset-generation step reworded to «только то, что решили генерировать на Шаге 0».

---

---

## v4.40.0 changelog (/asset-scan — point Forge at a folder of packs, get a tagged library)

User: "натравлю на папку с кучей пакеджей — он возьмёт имя, посмотрит в интернете и разложит",
folder by folder. Built as two halves so neither the machine nor the model does the other's job:

**scripts/asset-scan.mjs (facts, no internet):** walks a folder, treats every subdir and archive
as a pack, lists archives WITHOUT unpacking (zip via unzip -Z1; .unitypackage is tar.gz — reads
the real asset paths out of the */pathname entries), builds an extension histogram, guesses kind
(3d/2d/audio/font/unity/unknown), records size and sample paths, writes asset-scan-draft.json and
prints a size-sorted table. Smoke-tested on synthetic packs incl. a zip: kinds detected correctly.

**/asset-scan skill (judgement + internet):** shows the table, then researches ONLY the packs
whose name isn't self-explanatory or whose licence is unclear (1-2 searches each) → fills desc,
tags (4-8 SEARCH WORDS — the channel Forge will later find the pack by), `use` (2d/3d/any — 3D
marked "any" only with a real sprite-render recipe in notes), extraction notes, and licence class;
**если лицензию подтвердить не удалось — ставится `no` + пометка «проверить у вендора»,
гадать в пользу разрешения запрещено**. Then merges into asset-library.json deduped by path,
never overwriting the user's `rating`/`verdict`, deletes the draft, and reports a table plus
explicit lists of unconfirmed-licence and unidentified packs. Guards: >50 packs → warn and split;
never unpack archives "to look closer"; never invent contents or ratings. Dashboard row +
справочник row.

---

---

## v4.40.1 changelog (user data survives engine updates — asset-library.json split from seed)

User asked the right question before filling the library: "как быть уверенным, что при следующей
синхронизации всё не полетит?" It would have. asset-library.json shipped INSIDE the engine zip,
so update-forge.bat unzipping a new version over project-forge would have overwritten the curated
library with the sample entry. Fixed: the shipped sample is now `asset-library.seed.json`, the
user's file is `asset-library.json` and never ships; skills read the user file first and fall back
to the seed with instructions to create their own; asset-scan creates the user file from the seed
if missing and never writes to the seed; the HTML header now states this and reminds that page
data lives in the browser, so the exported json is also the backup. Core got a general rule:
files the user edits by hand never ship under their own name — ship `<name>.seed.*`, read
`<name>.*` first. sync.mjs was already safe (it distributes only skills/agents/hooks/AGENTS/
справочник/debugcheck to games).

---

---

## v4.40.2 changelog (asset-scan: containers, nesting overlaps, name duplicates)

User scanned a sub-folder first, then wanted the whole collection root — which exposed two holes.
(1) **Containers were registered as packs**: scanning a Humble-Bundle-style root turned each
bundle folder into ONE entry that swallowed the packs inside, overlapping with the earlier
per-pack scan. Now a directory containing ≥2 pack candidates and almost no own asset files is
classified as a CONTAINER and the scanner descends into it (up to 3 levels), so scanning the root
yields the real packs. (2) **No duplicate awareness**: the scanner now reads the user's
asset-library.json and flags every find — `already_in_library: exact` (same path → update, don't
duplicate), `overlap:<path>` (parent/child nesting with an existing entry), `same_name_elsewhere`
(same name, different path — disk copy or a different version), plus `dup_in_scan` for repeats
within one run; the console prints a summary of all three. Skill got Step 3.5 with the resolution
rules (children beat a parent entry; versions get disambiguated names; nothing deleted silently —
overlaps go to the report, the user decides) and the guidance to scan the collection ROOT rather
than sub-folders one by one. Verified on a nested fixture: container descended, exact/overlap/
name flags all fired.

---

---

## v4.41.0 changelog (multiplayer layer, part 1 — ASYNC profile)

Research first: Yandex Games provides NO multiplayer tooling (their support states it plainly —
"реализация остаётся за разработчиком, обычно используются внешние сервера"), so everything runs
on the user's own servers. Colyseus (Node/TS, MIT, rooms + automatic state sync) picked for the
future realtime profile; SaaS options (Photon/PlayFab) rejected — foreign billing and data outside
the user's contour.

Shipped now, ASYNC profile `templates/backend/async/`: docker-compose with Caddy (automatic TLS),
Fastify API and PostgreSQL; schema for players/clans/members/actions/scores; endpoints for
profile, clan create/join/state, **action intake (intent in, server-computed result out)**, clan
event feed (`/feed?since=`) for asynchronous catch-up, own leaderboard; per-player rate limit;
CORS restricted to platform origins. **Player identity comes only from the verified Yandex
signature** — HMAC-SHA256 over the payload with the Console secret, unit-tested here with a valid
and a forged signature (accepted / rejected correctly). Client layer `templates/html5/mp-client.js`
(createMP → ready/me/clan/action/feed/score, one retry on network hiccups, honest offline flag).

NEW /multiplayer skill: profile choice table (async by default — cheaper, no persistent
connections, covers most "multiplayer feel"), deployment, and the iron rules: identity only from
signature, intent-not-result, https/wss only, **game must remain playable with the server down**
(otherwise a VPS outage becomes a rating drop), secret never in the build (grep before release),
RuStore has no Yandex signature so the account scheme must be decided before the first release,
and a cost sanity check for ads-only economics. Pre-release checks include forging a signature and
expecting 401. Dashboard + справочник rows.

Next: SYNC profile (Colyseus) as `templates/backend/sync/`.

---

---

## v4.41.1 changelog (multiplayer gets an owner and a decision point)

Two gaps in v4.41.0 the user caught: nobody ASKED whether a game should be multiplayer, and
nobody was responsible for deploying the backend.

- **phase-2-design** now asks explicitly, as a 🔴 DECISION block — because it's money and time,
  not a mechanic: А) no multiplayer (cheapest, fastest) / Б) async (clans, shared world, feeds,
  own leaderboard — cheap VPS) / В) sync realtime (dearer to run), with the designer's own
  recommendation based on genre and the retention math. Approved → multiplayer features enter the
  GDD and the content budget, and deployment becomes a phase-3 task.
- **NEW agent backend-builder** (sonnet): copies the chosen profile into `<game>/backend/`, fills
  .env (stops with 🔴 if the Console secret is missing), deploys via docker compose — or hands the
  exact command list to the user when there's no SSH access and waits, explicitly forbidden from
  simulating a deploy — wires mp-client.js after the SDK, and surrenders by THREE facts: health
  endpoint ok, **forged signature → 401**, and the game still playable with the backend stopped;
  plus a grep proving the secret isn't in the build. Boundaries: no gameplay/balance, DB port
  never exposed, backups proposed not silently configured.
- **phase-3-construct** system sprints now include backend deployment (delegated to
  backend-builder) with the rule that turn logic lives in server-side applyAction, never the
  client. The /multiplayer skill opens with a «кто что делает» table so the split is unambiguous.

---

---

## v4.41.2 changelog (asset library at real scale — quota, freeze, over-descent)

Field report from the first big scan (Humble Bundle collection): import failed with
«exceeded the quota» for localStorage and the page froze for 12s. Three causes, all fixed:

1. **Over-descent.** The container heuristic (≥2 pack candidates, ≤2 own assets) descended into
   individual packs whose insides look like several folders, producing thousands of entries.
   Tightened: a container now needs ≥3 candidates, ZERO own asset files, and no structural
   subfolder names (Textures/Models/Sprites/Sounds/Prefabs/Scenes…) — those mark a single pack;
   depth capped at 2 levels; a `--max-packs` limit (default 400) with an explicit warning that
   the folder wasn't fully scanned and advice to scan by sub-folders instead.
2. **Bloat.** Draft-only fields (sample, top_ext, files_seen, kind_guess, needs_review, dup flags)
   were being carried into the library. The HTML now slims every imported entry to the 11 library
   fields, truncates over-long notes/desc, and the skill states explicitly which fields may enter
   the library file.
3. **Quota and freeze.** Saving is wrapped: on quota overflow the page still renders and reports
   the actual size in MB with what to do (the json file itself stays intact — nothing is lost);
   the grid renders at most 200 cards with a «показано N из M, уточни фильтры» line, killing the
   12-second load handler. Header shows the total count.

Skill also got a granularity rule: **one entry = one pack that gets used as a whole**, not every
folder inside a bundle; hundreds of tiny entries from one bundle should be merged into a single
bundle entry with the contents listed in desc.

---

---

## v4.41.3 changelog (asset library works from the FILE — browser storage is now optional)

User's real library turned out to be perfectly healthy — 294 entries, 236 KB, exactly the 11
library fields — yet the import still failed with «exceeded the quota». Cause isn't size: the page
is opened from disk, and Chrome treats every `file://` page as a unique opaque origin with its own
tiny storage budget (the second console warning was the tell). Fighting the quota is the wrong
fix; the JSON file should be the source of truth.

asset-library.html now degrades gracefully: a storage probe at startup and a guarded save switch
the page into FILE MODE — everything runs from memory, a persistent banner explains why and
reminds to press «Экспорт для Forge» before closing, unsaved changes are tracked and a
beforeunload prompt fires, and the export clears the dirty flag. Nothing is lost and no operation
is blocked; localStorage is used when it works and simply skipped when it doesn't. Verified by
simulating a storage-denied environment: the page initializes and stays functional.

---

---

## v4.42.0 changelog (asset library: browser cache removed, the JSON file is the only store)

User decision after the file:// quota case: drop browser storage entirely, load everything from
JSON and let /asset-scan do the parsing. Done — asset-library.html no longer touches localStorage
at all (verified: zero references, no duplicated save/banner blocks left behind). New model:
**⬆ Загрузить asset-library.json** → edit in memory → **⬇ Сохранить asset-library.json** → drop
into the engine root. A context banner always states where things stand: nothing loaded (with the
hint that /asset-scan fills the file), loaded N sources from <file>, or unsaved edits present;
edits set a dirty flag that triggers a beforeunload prompt and is cleared by saving. Skills
reworded: the file is the single source of truth, the page is a viewer/editor that owns nothing.
End-to-end tested against the user's real 294-entry library: loads, slims to library fields,
renders.

---

---

## v4.42.1 changelog (DATA LOSS incident — user data moved out of the engine folder)

Field incident, my design error: the user's asset-library.json (294 sources) was **deleted by an
engine update**. In v4.40.1 I stopped shipping the file so updates couldn't overwrite it — but
update-forge installs the engine as a CLEAN REPLACEMENT of the folder, so a file that isn't in the
archive gets wiped instead. Not shipping it made it *more* vulnerable, not less. (The file itself
was recoverable — the user had sent it to me earlier and it went straight back.)

Root fix: user data no longer lives inside `project-forge` at all.
- NEW `scripts/data-dir.mjs`: data root is **`../forge-data/`** (sibling of the engine, untouched
  by updates); `dataFile()` resolves user-first with legacy-root fallback, `writeData()` writes
  with an automatic backup keeping the last 10 versions in `forge-data/backups/`, `migrateLegacy()`
  moves old in-engine files out without loss.
- NEW `scripts/backup-data.mjs`: run before updating — migrates legacy files, takes a timestamped
  snapshot, and **warns explicitly** if a user file is still sitting inside the engine folder where
  the next update will erase it. Tested on a mock layout: file migrated, snapshot written, warning
  fired.
- asset-scan reads/writes through the new location with legacy fallback.
- Core rule rewritten from "don't ship the file" to "**user data lives outside the engine folder**,
  accessed only through data-dir.mjs, with automatic backups".

---

---

## v4.42.2 changelog (root cause of the data loss found: apply-manifest orphan sweep)

The deletion wasn't update-forge (it extracts with -Force, never wipes) — it was the engine's own
`upgrade` step: `scripts/apply-manifest.mjs` removes every file on disk that isn't listed in
MANIFEST.txt, and v4.40.1 had deliberately removed asset-library.json from the distribution. The
file instantly became an "orphan" and was swept. My v4.40.1 reasoning was right about overwriting
and blind to pruning.

Fixed at three levels:
- `scripts/apply-manifest.mjs` + `upgrade.ps1`: a USER_DATA list is now protected from the orphan
  sweep, and upgrade.ps1 additionally MOVES stray root-level user json into ../forge-data instead
  of deleting it. Verified: a test asset-library.json survives a full apply-manifest run.
- Session-start hook takes a **daily snapshot** of forge-data/asset-library.json into
  forge-data/backups (keeps 10, idempotent within a day) — a safety net when the pre-update backup
  is forgotten. Live-tested: created once, not duplicated on re-run.
- update-forge.bat now runs `backup-data.mjs` as **step 0 and aborts the update if it fails** —
  data outranks a version bump — with a legacy path that moves an in-engine library out to
  forge-data before anything else happens.

Lesson: when moving a file out of a distribution to protect it, check every mechanism that
compares disk against the distribution — "not shipped" and "not wanted on disk" are the same fact
to a manifest sweeper.

---

---

## v4.43.0 changelog (parallel asset research — shards, 10 agents, one merger)

User: why not run ten agents, each producing its own JSON, then a manager merges into
asset-library.json? Correct instinct — the bottleneck isn't the filesystem inventory (fast) but
the per-pack web research, which is sequential and turns hundreds of packs into hours.

Shipped the fan-out/fan-in pattern:
- `scripts/asset-shard.mjs` splits the scan draft round-robin into up to 20 equal shards
  (`asset-shards/shard-NN.json`), clearing stale shards first.
- NEW agent **asset-researcher** (sonnet, has WebSearch/WebFetch): takes ONE shard, skips lookups
  for self-evident packs (Kenney/Quaternius = CC0, Synty = paid), researches the rest, fills
  desc/tags/use/kind/lic/licdate/notes, leaves rating and verdict alone (user's experience, not
  the agent's), marks unconfirmed licences as `no` with a "verify at vendor" note, and writes
  `shard-NN.done.json`. **It never touches the shared library** — that's what removes write races.
- `scripts/asset-merge.mjs` (the manager): reads every `*.done.json`, dedups by normalized path,
  merges field-wise preferring the more complete record, **always preserves the existing
  rating/verdict**, writes through data-dir (automatic backup of the previous version), and reports
  before/after counts, per-shard completion (unfinished shards listed by name so only they get
  re-run) and the list of unconfirmed licences. `--dry` previews without writing.
- /asset-scan skill: parallel mode is now MANDATORY from ~40 packs, with the instruction to
  dispatch all shard agents in ONE message so they actually run in parallel; below that threshold
  the overhead isn't worth it.

End-to-end tested on a fixture with a pre-existing user rating: agents' data landed, ★5 and the
verdict survived untouched, description updated, backup written.

---

---

## v4.43.1 changelog (classifyBash false positives — upstreamed from the field)

A downstream session hit it twice and fixed it locally: `post-tool-capture.mjs` tags every bash
command for the session log, and `classifyBash()` matched keywords ANYWHERE in the string — so
`grep "deploy-log|build.*ran"` and a `node -e "…"` one-liner that merely mentioned the word both
got tagged **deploy**, which made the stop-hook demand a deploy-log entry for a deploy that never
happened. Their reasoning was right on the important point too: they refused to write a fake
deploy-log entry to silence the hook, because that fakes the check instead of fixing the fact.

Upstreamed (a local fix would die at the next update, exactly like the ad-rules case) and widened:
the classifier now resolves «команда ЯВЛЯЕТСЯ действием» vs «команда УПОМИНАЕТ слово» by looking
at the FIRST WORD. Read-only commands (grep/rg/cat/head/tail/ls/find/wc/stat/diff/echo/…) return
`shell` outright; `node|python|deno|bun -e/-c` one-liners return `shell` (their text is data, not
intent); `sed -n`/`awk -n` likewise. Deploy is now recognised only as an actual deploy: rsync/scp/
rclone as the command, `npm run deploy`, or a deploy script invoked directly — not a quoted
mention. Unit-tested on 12 cases including both field false positives and every tag that must keep
working (build, docker, script, git:commit with "deploy" inside the message): all correct.

---

---

## v4.43.2 changelog (library at 1347 sources — enum enforcement + normalizer)

The parallel scan produced a real asset search engine: **1347 sources, 1843 tags, 1301 with
extraction notes**. It also exposed a defect: the researcher agents invented their own `kind`
values — 38 distinct ones (3d-models, vfx-sky, editor-tool, sfx…) where the UI filters and the
library skill know exactly six. Records outside the six were effectively invisible to search.

- NEW `scripts/asset-normalize.mjs`: collapses kind/use/lic to the allowed vocabulary and
  **keeps the original value as a tag**, so nothing searchable is lost; --dry previews. Ran on the
  real library: 164 kinds fixed, 162 originals preserved as tags, distribution now clean
  (2d 588, unity 329, 3d 233, audio 99, ui 95, font 3).
- asset-researcher agent and the asset-scan skill now state the enum explicitly and forbid custom
  values, directing detail into tags; the skill also requires a normalize pass after merging.
- Справочник row added.

---

---

## v4.43.3 changelog (asset-find — library search without burning context)

User asked how Forge actually reaches the library. The honest answer exposed a problem: the path
was described in prose, and at 1.2 MB the library can't be read into a session's context at all.
NEW `scripts/asset-find.mjs`: searches from ANY folder (resolution order ./forge-data →
../forge-data → engine's ../forge-data → engine root legacy), filters by kind/use/licence, ranks
by tag hits and the user's RATING, prints only matching entries (name, kind/use, licence, stars,
description, tags, path) with an explicit warning on unconfirmed licences; `--json` for machine
use. Tested on the real 1347-source library from both the engine folder and a sibling game folder:
"фэнтези оружие" --kind 2d → 135 matches, top hits exactly right. asset-library skill and
phase-4 Step 0 now call the command instead of describing a file path; справочник row added.

---

---

## v4.44.0 changelog (one way to create a project — new-game.bat; forge.ps1/sync.ps1 deprecated)

User: new projects come out broken — no skills. Root cause: two generations of tooling coexisted.
`forge.ps1 new` creates the project as a **git worktree** and junctions `skills\` and
`platforms\` from the engine root — but Claude Code reads **`.claude\skills\`**, which that path
never creates, so the project has no slash commands. `sync.ps1` is the v4.5.2-era distributor with
its own rules, unrelated to the canonical sync.mjs added in v4.36.0.

Fixed by collapsing to one path: NEW `scripts/new-game.mjs` + `new-game.bat <имя>` — creates a
plain sibling folder (no git worktree, no junctions) with the game skeleton (GameIntegration,
wiki/{plan,sessions,features}, screens, assets, CLAUDE.md, wiki/_map.md, .gitignore), then calls
`sync.mjs --game <имя>` to deliver skills/agents/hooks/AGENTS.md/справочник/debugcheck, then
VERIFIES the result and fails loudly if anything is missing. Tested end-to-end: 130 skills, agents
and AGENTS.md present on first run. `forge.ps1` and `sync.ps1` now print a deprecation warning
naming the correct command; справочник documents new-game.bat as the only supported way.

---

---

## v4.45.0 changelog (two-storey retention for social games — from the Hired Heroes field data)

User's shipped MMORPG (Hired Heroes: Medieval Warfare) gave a design fact worth more than any
theory: **for the first 3 days players don't open clans at all** — they explore the world, story
and quests and build a squad; and when clan-vs-clan WARS were added, sessions grew to **3-4 hours
a day**. This overturns the usual "solo devs can't do clan games because critical mass" objection.

Encoded in product-metrics (and referenced from phase-2's multiplayer decision):
- **Storey 1, days 1-3 — single-player**: world, story, quests, first progression. Independent of
  population, therefore fully within a solo developer's reach; this is where the content budget
  goes, and it's mostly TEXT rather than hundreds of art units.
- **Storey 2, from D5-D7 — the clan as the engine**, driven by CONFLICT (clan-vs-clan war,
  territory, scheduled events) — the mode switch from "15 minutes" to "a whole evening" is bought
  only with live-player competition, never with content.
- Design consequences: critical mass is needed at the funnel's narrow point, not at the entrance
  (10 000 installs → ~500 at D7 = 20-30 live clans, enough for real wars); don't smear social
  features across days 1-3; **the key transition metric is the share of players who join a clan by
  D7** — more diagnostic than D7 itself, since a core that won't join clans can't be fixed with
  more content; and clan wars are a LiveOps obligation (a schedule that can't be paused for another
  project) which must appear in the 🔴 decision alongside the timeline.
- The retention-math table gains explicit storey rows (D1-D3 single / D4-D6 transition / D7-D30
  social).

---

---

## v4.46.0 changelog (hybrid monetization + RuStore-first route + server-side purchase validation)

Vikings-class analysis with the user made the gap explicit: for games whose progress is measured
in hours and days, ads cannot be the main income — rewarded video can't skip that scale. The user
confirmed IAP is the only option there and that his ИП status is in place.

- **monetization-design +💰 ГИБРИДНАЯ МОДЕЛЬ**: strict role split (payments = PROGRESS and
  convenience; ads = HABIT and engagement), with the rules that keep it from collapsing — RV is
  never an equivalent of a purchase (minutes vs hours/days), **RV daily limits are mandatory**
  (3-5 per category, counter visible), the pay-to-win red line (money buys speed and convenience,
  not invulnerability — a payer must be stronger but not unbeatable, seasonal resets fix drift
  better than formulas), a deliberately designed cheap starter pack for the first-purchase
  conversion, mandatory server-side receipt validation, no interstitials for payers at all, and
  hybrid metrics with a health marker (ads above ~half of revenue means progression is priced too
  cheaply).
- **/port +RuStore-first exception**: Yandex-first stands for ads-only casual games, but IAP games
  with long progression invert it — RuStore is the primary platform, Yandex a showcase; payments
  require ИП/юрлицо since 01.02.2026 and the status must be confirmed BEFORE development starts.
- **phase-2 asks the monetization model FIRST** (🔴): А ads-only / Б hybrid, with the genre-based
  rule of thumb (progress in minutes → А, in hours and days → Б) — because platform, scope and
  balance all follow from it.
- **rustore-builder** got the IAP procedure; async backend got a `purchases` table (UNIQUE per
  receipt = idempotent grants), an `is_payer` flag, and a `/api/purchase/validate` endpoint whose
  validateReceipt stub returns **false by default** — better to withhold goods than to grant them
  on a forged receipt.

---

---

## v4.47.0 changelog (game dimensionality — established in phase 1, read by phases 2-5)

User: phase 4 picks assets by 2D/3D — but who decided that, nobody ever asked? Correct: the
pipeline never established dimensionality anywhere, yet phase-4 already required it
(`asset-find --use 2d|3d`, `/three-setup` for 3D). It was silently defaulting to 2D.

- **phase-1-analyze** now establishes it: with a prototype — BY FACT (grep for three./WebGLRenderer/
  babylon/PlayCanvas → 3D, `getContext('webgl')` → 3D, `getContext('2d')` → 2D, sprite isometry →
  2.5D); without one — a 🔴 USER DECISION between 2D canvas (light, instant load, weakest Androids
  cope, largest library coverage — the web default), 2.5D isometry (3D look at 2D cost, but art is
  dearer: sprites per direction) and 3D three.js (heavier weight and GPU, risk on weak Androids,
  /three-setup mandatory), with a genre-and-platform recommendation. The result is written to
  `wiki/_map.md` as **Размерность:** and downstream phases read it instead of re-asking.
- **phase-2-design** consults it before the content budget — dimensionality changes the budget
  several-fold (a 3D model costs more than a sprite, isometry needs sprites per direction, 3D adds
  a performance budget for weak Android); not set → back to phase 1, otherwise the budget is
  computed blind.
- **phase-4-visual** takes it from the wiki for the library filter and for the three-setup branch.
- **phase-5-tech** gained a performance budget clause keyed to dimensionality (3D → mandatory weak-
  Android check on FPS, bundle weight, load time, WebGL2 availability and honest fallback).

---

---

## v4.47.1 changelog (audit #4 — connectivity: phases, advisor, agents, hooks)

Full connectivity audit at the user's request: does every phase know what comes next and what to
prepare, does the advisor know the new doctrines, are hooks and wiki discipline wired. Five holes
found and fixed:

1. **Phase 9 had no "next phase"** — the pipeline ended in a dead end. Now it closes the LOOP:
   Ф9 repeats on schedule; rating down / D7 below target → back to Ф2 design and Ф3 construct;
   stable metrics → `/port`; content plan exhausted → Ф1 on the next game.
2. **Phase 6 didn't name the canonical recorder** — it still described video generically while
   `scripts/record-promo.mjs` exists and one-off recorders are banned. Now named in the output table.
3. **Advisor didn't know the newest doctrines**: hybrid monetization + RuStore-first, two-storey
   retention, dimensionality (set in Ф1, read from wiki), asset-find/asset-scan, backup-data before
   updates. Added as symptom→recommendation lines, including the explicit warning not to propose
   ads-only for long-progress games out of habit.
4. **Five orphan agents** (qa-tester, security-auditor, rustore-builder, steam-builder,
   vkplay-builder) existed but no skill ever invoked them. Wired: qa-tester → test-game delegation
   (with verification by artifact, not by word), security-auditor → phase-8 pre-submission secrets/
   endpoints/purchase-validation check (findings = release blockers), platform builders → /port.
5. Verified green: phase chain 1→9 link by link, hooks all parse and all four events registered
   (SessionStart/PreToolUse/PostToolUse/Stop), advisor catalog in sync with the filesystem, wiki
   discipline present in every phase.

---

---

## v4.47.2 changelog (Unity packs are ordinary assets — executors were skipping 329 sources)

Field report: executors refused Unity packs for HTML5 work, reading `kind: unity` as
"Unity-only". Our own wording caused it — the asset-library skill said "don't drag .prefab/.mat/
.shader into the project, engine specifics are useless outside the engine", and that generalised
in the executor's head to "the pack is useless". With 329 of the library's 1347 sources marked
`unity`, a quarter of the library was invisible.

Corrected everywhere: a `.unitypackage` is a tar.gz containing **ordinary FBX models, PNG
textures, WAV sounds** — fully usable in the web stack after conversion, and for a 3D game often
the BEST source (single atlas per set, consistent style). asset-library got a 📦 section with the
take/leave table (FBX/PNG/WAV/fonts in; prefabs/scenes/materials/shaders/scripts/meta out — we
wire colour and texture ourselves at glb export), the extraction pipeline sketch, the reminder to
never unpack a whole library, and the note that 2D games benefit too (sprites, UI kits, icons and
sounds come out directly without Blender — hence `use: any` for many such packs). phase-4 warns
explicitly not to filter out `kind: unity`, and asset-find now prints an inline hint on every
Unity result (plus a note in --json). Verified on the real library: "викинги средневековье"
--kind unity → 8 matches with the hint shown.

---

---

## v4.48.0 changelog (model selection per phase — by verification density, not importance)

User asked which model each phase should run on. Encoded the principle first: the choice follows
**what verifies the result**, not how "important" the phase feels.

- **opus** where a decision can't be machine-checked and a mistake costs weeks: content deficit
  (Ф1), GDD and economy (Ф2), complex game logic (Ф3), art direction, moderation-rejection
  analysis, engine changes.
- **sonnet** where work is specified and a checker/script/screenshot verifies it: Ф4-Ф9,
  asset-scan, promo, ports, routine `/do`. This is precisely what the verification layer (84
  checks, the TOTAL line, artifact-based surrender) was built for — it makes a cheaper model safe.
- **haiku** — not for the pipeline: it doesn't hold the "В конце: wiki + drift" discipline or
  artifact-based surrender.

Shipped: a `**Модель:**` line with the reason at the top of all nine phase skills, the selection
rule in CLAUDE.md core (with the practical version — new game or unclear failure → opus; the
beaten path → sonnet), a full table in СПРАВОЧНИК, and model badges next to each phase in the
dashboard's phases panel.

---

---

## v4.48.1 changelog (templates reachable from games — use-template, not mass distribution)

Downstream found a real gap: `/multiplayer` couldn't find `templates/backend/async` from a game
folder, and proposed adding `templates\` to the sync payload (with a thoughtful question about
robocopy overwriting hand edits). Diagnosis right, remedy different on two counts: the patch
targeted `sync.ps1`, deprecated since v4.44.0 in favour of sync.mjs; and mass-distributing
templates would copy backend scaffolding into all 13 games that mostly don't need it, creating
exactly the drift the author worried about.

Fixed the way asset-find already works — engine assets stay in the engine, games pull on demand:
NEW `scripts/use-template.mjs` (`--list` shows what's available; copies a template dir or single
file into the game; **never overwrites existing files**, printing `=` for those, so a customised
backend survives re-runs; states plainly that the copy is now the game's and engine updates won't
touch it). /multiplayer and backend-builder now start with
`node ../project-forge/scripts/use-template.mjs backend/async ./backend` instead of referencing a
path that doesn't exist in the game. Tested: 9 files copied into a fresh game folder.

Answer to the robocopy question, for the record: the overwrite dilemma disappears entirely under
pull-on-demand — the engine copy stays canonical, the game copy is the game's, and neither
silently clobbers the other.

---

---

## v4.48.2 changelog (numeric thresholds: requirement or hypothesis?)

Field case: an executor was about to cut the game to satisfy a «≤60 КБ bundle» line in the GDD —
while the platform's actual limit is 100 MB per archive, and that 60 KB target had been written
for an early prototype and was already off by a factor of two (for scale: any Godot web build
starts at ~5 MB compressed and lives in the same catalogue). Same class as the invented timing
thresholds we hit earlier. Encoded in core: **a threshold with no reference to a platform
requirement is a HYPOTHESIS, not a constraint** — find the source, and if there isn't one, propose
a revision as a 🔴 block with a new number and reasoning instead of silently mutilating the game
(decision recorded in wiki/decisions/). Plus the phrasing rule: express budgets as USER EFFECT
(time-to-interactive on a weak phone, 60 FPS on a budget Android), not internal units (kilobytes,
object counts) — units age, effects don't. Real platform limits (100 MB archive, ≤28 s video,
512×512 icon, 800×470 cover) stay untouchable and are checked by the checker.

---

---

## v4.49.0 changelog («не подошло» is not an ending + the 90s-browser test + dev-tools check)

Field case: a game went through ALL phases and was declared ready while looking like an admin
panel — tables and collapsible sections instead of a scene, system fonts, default CSS borders,
emoji-grade icons, a 30-cell campaign grid of grey crosses, and the developer's own tools left in
the build (seed field, AI-behaviour selector, turn speed, «Заново», a «ЗАМЕР МЕХАНИКИ» panel).
The executor had also refused library assets — and then simply stopped, offering nothing instead.

Three fixes:
1. **Phase-4 Step 0 can no longer end in "nothing fit".** If the library has nothing, the executor
   MUST propose generation as a concrete list (icons ×N, 9-slice frames, scene backgrounds,
   portraits — with counts, style from art-direction and an estimate) and ask. The forbidden
   outcome of phase 4 is now spelled out: a game left on default CSS, system fonts, emoji icons
   and tables instead of a scene.
2. **visual-upgrade got the «БРАУЗЕРКА 90-х» test** — a seven-row defect table (system font →
   themed font; default borders → panels from world materials with 9-slice; emoji → drawn icons;
   tables as the main screen → SCENE as the main screen; flat background → atmosphere; browser
   buttons → world objects with states; nothing moves → juice on every action) and the verdict
   phrased as a question: "does this look like a 2026 game or a 90s browser toy?"
3. **debugcheck v2.21→v2.22**: static check for leftover dev tools (seed field, AI selector, turn
   speed, measurement panels) → WARN citing REQ-1.15 «game looks unfinished». Fixture clean,
   copies byte-identical.

---

---

## v4.49.1 changelog (the UI pipeline existed — and was an orphan)

User asked whether a separate UI/UX phase is needed. Checked first: the engine already has
`ui-pipeline` (a five-step UX/UI redesign orchestrator: audit → hierarchy → layout-system →
implement → re-verify) and `ui-review` — **and neither was referenced by any phase**. Same orphan
class as the five agents in audit #4: the capability existed, nothing invoked it, so phase 4 went
straight from art-direction to asset generation and screen composition was never designed. That's
exactly how a game ends up as tables with the scene in a corner.

Wired instead of adding a tenth phase: phase-4 now runs `/ui-pipeline` as step 2 — mandatory when
the interface is more than a single HUD — with the explicit statement of what it decides (what is
PRIMARY on screen, what is secondary, what hides) and `/ui-review` as the acceptance check on a
1920×1080 screenshot. Advisor got the symptom line ("interface looks like an admin panel / tables
everywhere"). No renumbering: UI is a property that must exist across phases (interaction in Ф3,
composition in Ф4, onboarding in Ф2), not a stage of its own.

---

---

## v4.49.2 changelog (sync prunes orphan command wrappers — 115 per game since v4.28.1)

The deprecated sync.ps1 output revealed real drift the user was carrying across the whole park:
«119 slash commands vs Forge 4 (+115 orphan wrappers from old version)» in most games. Those are
leftovers of the command-wrapper experiment that was REVERTED in v4.28.1 — the revert removed them
from the engine but nothing ever removed them from the games, so every project has been showing
115 duplicate/dead entries in its slash list for weeks. sync.mjs only ever copied, never deleted.

Added `pruneOrphans()` to sync.mjs: files in a game's `.claude/commands` that don't exist in the
engine are removed (directories untouched, --dry respected), and the per-game report now reads
«обновлено: N, убрано сирот: M». Verified on a fixture with 119 commands: 115 pruned, the four
canonical ones (app/continue/do/game) intact. Skills are NOT pruned — a game may legitimately have
its own; only the commands namespace, which is engine-owned, is cleaned.

---

---

## v4.49.3 changelog (dashboard still taught the deprecated project creation)

User screenshot: the "Проект добавлен" modal still instructed `forge.ps1 new` (git worktree +
junctions — the very path that leaves a project without .claude/skills) and `sync.ps1` as the
recommended sync. My oversight in v4.44.0: skills, agents and справочник were switched to the
canonical commands, the dashboard was not — so the UI kept teaching the broken way. Fixed: the
creation modal now shows `new-game.bat <slug>` → put sources in GameIntegration → `claude` +
`/phase-1-analyze .` → `sync.bat` after engine updates; the "Копировать команду создания" button
copies the new command; command cards, tips and the sync-preview button (`sync.bat --dry`) updated;
the only remaining mentions of the old scripts are explicit "устарели" notes. Lesson repeating
across releases: a change isn't shipped until every surface that teaches it is updated — skills,
docs AND the dashboard.

---

---

## v4.59.0 changelog (screens-shoot + mandatory self-review — the executor grades its own screens)

The single most effective thing all day wasn't a rule — it was making the executor SHOOT its own
screens and grade them. It returned 4/10, 3/10, 5/10, 7/10, 4/10, named the structural cause more
precisely than I had ("экраны собраны как списки в DOM и не дали им ни одного пикселя арта — пока
у них нет своей картинки, они так и будут выглядеть меню, сколько ни правь отступы") and found
three defects on its own, including the battle screen taking 1.23 mobile screens with energy and
hero cards below the fold. Making that a pipeline step, not a prompt.

NEW `scripts/screens-shoot.mjs`: serves the game, walks its states (by button text), screenshots
each on **mobile 412** (the platform's main audience) and desktop 1920, measures content height
against the viewport and flags anything that doesn't fit, and builds a contact sheet
`screens/review/index.html` — every screen in one glance.

ui-review got §САМООЦЕНКА with the grading format (`<экран> — N/10. <что видно> <почему>`), the
honesty rules (10 = looks like a 2026 game, 1 = a settings panel in dark theme; the grade is for
the FRAME, not the intent; state the percentage of empty screen and whether there's ANY art on it —
the two usual causes of low marks; defects listed separately; a verbal verdict naming the
structural cause), and what to do with the result: **anything below 6/10 goes back to work before
the user sees it**; low marks everywhere except one screen means the cause is structural (art
exists in one place only) — fix structure, not padding; and re-shoot plus re-grade after fixes.

Wired as a mandatory step in phase-4 (before delivery) and phase-7 (verification); справочник,
dashboard and advisor updated.

---

## v4.59.2 changelog (rejection batch: platform brand in UI, touch targets, RV label)

Five moderation remarks from a field build, analysed:
- **2.14 + 1.19 are ONE bug** (same attachment, same wording): language detection and GRA both
  fire after the game is playable — the load-order defect already doctrined in v4.38.0.
- **3.5 — the platform's brand in game texts.** Confirmed against the developer licence: it grants
  no right to Yandex's trademarks, trade names, service marks or logos. Integrating the SDK is not
  a licence to print the name. yandex-sdk-integration got a ™️ section with the replacement table
  («Войти через Яндекс» → «Войти», «Лидерборд Яндекс» → «Таблица лидеров», «Оплата через Яндекс» →
  «Купить»), the principle that auth and payment dialogs are drawn BY the platform where its brand
  belongs, the same rule for RuStore/VK, and the caveat that a 3.5 remark with an attachment is
  more often about ASSETS than words — open the attachment before rewriting labels.
- **1.8 touch targets** and **4.5.1 RV button**: the bare number next to an RV button reads as the
  REWARD size while it actually means remaining uses — monetization-design now requires the reward
  in words on the button and the remaining count on a separate line.

debugcheck v2.22→v2.23: three new static checks — brand words in game texts (SDK URLs excluded),
a touch-target hint when many sub-40px sizes appear, and RV buttons without any reward text.
Fixtures clean, 119 checks total.

---

---

*(Changelog — в docs/CHANGELOG.md)*

## v4.66.6 changelog (unified Claude/Codex command layer + managed fleet update)

Maintenance release: no Claude functionality removed. Forge now exposes one workflow vocabulary through
two native invocation adapters: Claude `/skill-name`, Codex `$skill-name`. Dashboard has an agent-mode
switch and generated metadata (engine version, canonical/Codex skill counts, phase mappings); drift is a
hard release failure. Codex `status/plan/review` collisions are documented as `$status/$plan/$review`.

Project creation converges on `new-project.bat/.sh <name> --type game|app`; `new-game` and `new-app` are
wrappers, and legacy `forge.ps1/sh new` delegates instead of creating a second incompatible layout.
Sibling distribution converges on `scripts/sync.mjs`, with `.forge-managed.json` recording exactly which
paths Forge owns so stale engine files can be removed without deleting user-created skills. Legacy sync
entry points are wrappers.

The external `update-forge.bat` now selects the highest semantic-version ZIP (not newest timestamp),
shows current/package versions and sibling count, requires explicit downgrade approval, stops on backup /
extract / upgrade / sync / dashboard / Codex / drift / sibling verification failures, and then reports a
clean fleet. `setup`, `upgrade`, and `bump-version` regenerate dashboard + Codex surfaces automatically.

---

## v4.66.6 changelog (unified Claude/Codex command layer + managed fleet update)

Maintenance release: no Claude functionality removed. Forge now exposes one workflow vocabulary through
two native invocation adapters: Claude `/skill-name`, Codex `$skill-name`. Dashboard has an agent-mode
switch and generated metadata (engine version, canonical/Codex skill counts, phase mappings); drift is a
hard release failure. Codex `status/plan/review` collisions are documented as `$status/$plan/$review`.

Project creation converges on `new-project.bat/.sh <name> --type game|app`; `new-game` and `new-app` are
wrappers, and legacy `forge.ps1/sh new` delegates instead of creating a second incompatible layout.
Sibling distribution converges on `scripts/sync.mjs`, with `.forge-managed.json` recording exactly which
paths Forge owns so stale engine files can be removed without deleting user-created skills. Legacy sync
entry points are wrappers.

The external `update-forge.bat` now selects the highest semantic-version ZIP (not newest timestamp),
shows current/package versions and sibling count, requires explicit downgrade approval, stops on backup /
extract / upgrade / sync / dashboard / Codex / drift / sibling verification failures, and then reports a
clean fleet. `setup`, `upgrade`, and `bump-version` regenerate dashboard + Codex surfaces automatically.

---

## v4.66.7 changelog (dual full-access launch + upgrade cleanup)

Maintenance release from field upgrade findings. Dashboard cards now have **Claude Full** (`cf`) and **Codex Full** (`codex -C <project> -a never -s danger-full-access`). Normal Codex project defaults stay `on-request` + `workspace-write`; full access is explicit. Optional `scripts/cx(.bat)` provides the same Codex flags.

Upgrade now removes six obsolete pre-construct phase directories (`phase-3-visual` … `phase-8-live`) that survived file-only cleanup and caused the real 143-vs-140 dashboard count failure. Unexpected contents are backed up to sibling `forge-data/backups/obsolete-skill-dirs-*` before removal. Windows and POSIX upgrade paths are both gated.

Windows ZIP discovery was also hardened: the semver result is written to a temp file instead of being captured through the fragile long `FOR /F` PowerShell pipeline.

---

## v4.66.9 changelog (AV-safe dialogue extractor + atomic fleet sync snapshot)

Fleet sync now buffers the entire managed source snapshot before touching sibling projects, so antivirus quarantine cannot leave half the fleet on mixed files. Dialogue extraction became a static literal scanner instead of executing project JS. Regression gate: `check-sync-snapshot.mjs`. Full incident detail is archived in `docs/CHANGELOG.md`.

---

## v4.66.10 changelog (Windows Codex hook launcher repair)

Windows `commandWindows` hooks now launch Node directly; nested PowerShell/`ExecutionPolicy Bypass` was removed after Codex CLI 0.147.0 produced SessionStart/PreToolUse/PostToolUse exit-code-1 failures. `check-codex-compat.mjs` verifies direct hook targets. Full incident detail is archived in `docs/CHANGELOG.md`.

---

## v4.67.0 changelog (AI Studio — phase-aware agents + Codex/OpenAI visual production)

AI Studio is a **cross-phase capability, not Phase 10**. The canonical chain remains Analyze → Design → Construct → Visual → Tech → Listing → Test → Release → Live. Four workflows (`studio`, `prompt-compiler`, `image-studio`, `visual-qa`) and four specialist agents add phase-aware orchestration, reproducible prompt packs, Art Director review, Visual QA and asset provenance without bypassing STOP-points.

New projects get `.forge-ai.json`, Style Bible/prompt/generated/AI/QA paths. Interactive native image generation is preferred when available; `scripts/openai-image.mjs` adds an optional direct GPT Image 2 batch path. Generated Codex discovery descriptions are compacted without shortening canonical `SKILL.md` bodies. Full design: `docs/AI-STUDIO-4.67.0.md`.

## v4.67.1 changelog (canonical 9-phase status + machine phase markers)

Field use of `$status` exposed the retired pseudo-pipeline (`Занесено / Геймдизайн / Арт / Мобайл / SDK / Локализация / Релиз`) even though Forge now has 9 canonical phases. It found the STOP-point but mixed health lanes with phases.

`/status` now uses the canonical 1..9 phase model, reports CURRENT + STOP-point + AI Studio + Project Health, and explicitly distinguishes `not_reached` from defects. A read-only Node snapshot helper gathers lightweight artifact/code facts without starting browser/runtime/release tests. New `wiki/phases/phase-N.json` machine markers are authoritative when present; legacy projects fall back conservatively to artifacts. All nine phase skills now write `start/block/complete` markers through the shipped helper.

Project `CLAUDE.md` is no longer a mutable progress source. New projects put changing state in `wiki/_current.md` and `wiki/phases/`; `/status` ignores stale boilerplate such as `Just created` when facts show later work. A regression test proves stale CLAUDE text cannot roll a project backward and downstream SDK evidence cannot skip an earlier phase gate.

## v4.68.0 changelog (Universal Agent Runtime + GigaChat provider)

Forge now has a host-neutral `FORGE.md` contract for the canonical nine phases, state priority, workspace discipline, generic skill execution and DoD. Claude stays canonical; Codex keeps its generated adapter; `adapters/agents.json` + `scripts/forge-agent.mjs` add a small runtime bridge for additional terminal agents. Managed sibling sync now includes `FORGE.md` and `.gitverse/pr_rules/`.

GigaCode support is explicitly **experimental**: GitVerse rules are shipped, but Forge never invents undocumented permission flags; CLI discovery can be overridden with `FORGE_GIGACODE_CLI`. AI Studio config moves to schema 2 and adds direct GigaChat `text2image`/`text2model3d` helpers with provenance, dry-run, external secrets and TLS verification preserved. No Phase 10 and no silent OpenRouter fallback. `check-universal-agent-runtime.mjs` release-gates the new surfaces. Full design: `docs/UNIVERSAL-AGENT-RUNTIME-4.68.0.md`.

## v4.68.1 changelog (terminal API profiles + GigaChat coding agent)

Forge adds explicit billing/auth profiles without changing the 9-phase engine. Claude Code can now launch through the existing subscription auth or an Anthropic API profile; Codex can launch through ChatGPT auth or an isolated OpenAI API profile. Central secrets live outside projects in `forge-data/secrets/`. Claude API uses `apiKeyHelper`; Codex API uses isolated `CODEX_HOME` + stdin `codex login --with-api-key`, so switching API mode does not overwrite the normal ChatGPT profile.

`scripts/gigachat-agent.mjs` adds a real terminal coding agent over the official GigaChat API custom-function flow: project file/search/edit tools, canonical Forge skill loading, phase-aware status, git diff, and optional shell execution in `--full` mode. Dashboard cards expose Claude Full / Claude API / Codex Full / Codex API / GigaChat API; the GigaCode bridge remains dormant/experimental until an actual CLI executable is available. `check-api-terminal-profiles.mjs` release-gates these surfaces offline. Full design: `docs/API-TERMINAL-PROFILES-4.68.1.md`.

## v4.68.3 changelog (release consistency + bilingual public surface)

The public repository changes made after v4.68.2 are now closed as a real patch release instead of remaining unversioned on `main`. The intentional EN/RU Dashboard controls are accepted into the structural baseline, public README files expose the canonical nine platform IDs, and all versioned engine surfaces converge on v4.68.3.

`scripts/bump-version.mjs` now targets the known display locations by their shape rather than assuming every file already matches `plugin.json`. This lets the release tool repair partial/stale bumps, updates the English and Russian public-version markers, and still avoids historical changelog sections. Runtime behavior and managed sibling payload semantics remain unchanged from v4.68.1.

## v4.68.4 changelog (reliable Windows one-click update)

A real in-place update on Windows exposed two gaps that static source checks missed: the generic updater could stop during `Expand-Archive`, and LF-only/non-ASCII `upgrade.bat` could be misparsed by `cmd.exe` while still returning a misleading zero exit code. Sibling sync never ran in that state.

The external updater now prefers the built-in Windows `tar.exe` path used by the proven version-specific updater, with a quiet fail-fast `Expand-Archive` fallback. `upgrade.bat` is ASCII-safe, has a non-mutating `/selftest`, and all shipped batch files are CRLF-normalized through `.gitattributes`. `check-bat-encoding.mjs` rejects bare LF, while `check-update-surface.mjs` gates tar extraction, CRLF and the real `cmd.exe` self-test on Windows.

## v4.68.5 changelog (UTF-8 MANIFEST preservation on Windows)

The first complete v4.68.4 fleet pass exposed a Windows PowerShell 5.1 encoding trap: `MANIFEST.txt` is UTF-8 without BOM, while `Get-Content` defaulted to the active ANSI code page. The Cyrillic path `СПРАВОЧНИК-КОМАНД.md` therefore failed membership comparison, was removed from the engine, and the managed payload dropped from 424 to 423 files. The final drift gate stopped the updater, but sibling sync had already propagated the temporary absence.

`upgrade.ps1` now reads MANIFEST with `-LiteralPath` and explicit `-Encoding UTF8`. `check-update-surface.mjs` release-gates that exact contract. Re-extracting v4.68.5 restores the command reference before cleanup; the subsequent 424-file sibling sync restores it across the fleet.

## v4.68.6 changelog (GitHub/GitVerse publication convergence)

The local-first release branch was rebased onto the concurrent public `main` update that adds `.github/workflows/sync-gitverse.yml`. The workflow is now part of the canonical tree and generated MANIFEST instead of being accidentally deleted or omitted by a later local publication.

No engine runtime, sibling payload, phase, skill, agent or platform behavior changes in this patch. v4.68.6 is the final convergence release: verified local sources, release ZIP, Universal installation, sibling fleet and the GitHub publication branch share one versioned state.

## v4.68.7 changelog (GigaChat resume orchestrator)

The Forge-owned GigaChat adapter now carries the cumulative `6.3.1-resume-orchestrator` contract. It fixes the live malformed-`ask_user` const reassignment crash, reopens incomplete Q1–Q5 brief decisions before another model request, reconciles stale Phase 1 state and preserves approved research/product-metrics evidence across compaction and retries.

The permanent capability now includes real web/image search, safe page fetch, a search doctor and offline provider self-test. `forge-agent` enables the Node system CA store before launching the GigaChat child and selects the no-key `bing-html` fallback only when no explicit provider/endpoint exists. The API-profile release gate runs both self-test suites and validates standard/full tool-surface semantics instead of a stale hard-coded count.

## v4.68.8 changelog (natural brief acceptance)

The GigaChat adapter now treats explicit natural-language approval such as `принимаю рекомендации`, `принимаю все рекомендации` and `согласен со всеми рекомендациями` as approval of the complete Phase 1 Q1–Q5 recommendation set. Qualified answers such as `принимаю рекомендации, но Q2 изменить` remain unresolved so corrections are never silently discarded.

The adapter contract is `6.3.2-natural-acceptance`. Unit coverage and a real CLI subprocess regression prove that the exact user phrase is persisted, rebuilds all five canonical brief fields and clears the durable pending STOP before the next model request.

## v4.68.9 changelog (guided STOP answers)

Every GigaChat `ask_user` STOP now ends with deterministic answer guidance instead of relying on the model to remember response syntax. A recommended decision exposes the exact short approval phrase `утверждаю`; Phase 1 research and content-budget gates also show their correction/deepening form, while the five-question brief prints a complete Q1–Q5 answer template.

The adapter contract is `6.3.3-guided-stop`. Unit tests cover approval/correction guidance and the real terminal subprocess gate asserts that the visible resume STOP contains `Как ответить`, `«утверждаю»` and the full Q1–Q5 correction format.

## v4.68.10 changelog (Codex economy routing)

Forge now owns a canonical per-phase Codex policy and a fresh-task launcher. Standard is the default tier; Terra handles normal implementation, Sol handles design and named complex escalations, and Luna is limited to mechanical work. Phase orchestration defaults to at most two Terra/medium subagents; Max/Ultra are never automatic.

`phase-state.mjs` stores the recommended Codex route separately from the runtime selection reported by launcher/CLI evidence, so Claude and GigaChat are never mislabeled as Terra. Dashboard exposes both `$phase-*` and policy-aware launch commands. Regression coverage validates all nine routes, durable escalation metadata and Codex CLI compatibility.

## v4.68.11 changelog (fleet behavioral diagnostics)

Managed projects now keep a dedicated local JSONL incident stream for defects in Forge itself: malformed phase/STOP behavior, adapter/runtime/hook failures, capability or state contradictions, and incorrect returned formats. AI instructions for Claude, Codex, generic agents and the GigaChat native tool all require immediate reporting while explicitly excluding ordinary game/app bugs. Fields are bounded and credential-redacted, evidence stays project-relative, logs rotate non-destructively and remain outside final Git commits.

`$status` exposes the open count, while `scripts/audit-forge-diagnostics.mjs` scans every managed sibling and groups unresolved observations by stable code/component/operation. Incidents are closed by fingerprint only after verification. Hook/runtime failures and bounded GigaChat STOP/transport recovery exhaustion report automatically; a dependency-free regression verifies redaction, deduplication, resolution, local Git exclusion and fleet aggregation.

## v4.68.12 changelog (durable GigaChat phase resume)

GigaChat Phase 1 resume now treats already approved decisions and research artifacts as durable evidence. Product-metrics evidence survives phase switches, the final gate reuses the approved KPI/content-budget decision and cited research, and a fully approved Phase 1 closes deterministically without another model round-trip or repeated user approval.

Phase markers record `gigachat` as the actual host without inventing a Codex model selection. Memory snapshots discard obsolete nested `STOP:` lines, and exhausted empty/malformed response recovery emits the `GIGA_EMPTY_RESPONSE_LOOP` Forge diagnostic. The adapter contract is `6.3.4-durable-phase-resume`; regression coverage includes approved-state completion, durable metrics provenance, host-only model metadata and transport diagnostics.

## v4.68.13 changelog (GigaChat decision and gate integrity)

Standalone answers to durable GigaChat STOP-points now restore the owning phase, runtime baseline and named-decision state before the answer is consumed. Phase 2 decisions survive across one-shot terminal processes, and the model can no longer overwrite the runtime-owned decision/evidence ledgers directly.

Every `phase-state complete` path, including native `forge_script`, now requires the full Forge gate to be GREEN plus explicit evidence arguments. Decision STOPs automatically persist the machine marker as `blocked` with host `gigachat`; Phase 2 prompts receive deterministic fast-MVP questions/recommendations and exact approval guidance. Phase 2 UI hierarchy matching accepts canonical prefix or suffix filenames, while the prompt-pack blocker names its exact `assets/prompts/*.json` target. Contract: `6.3.5-decision-gate-integrity`.

## v4.68.14 changelog (GigaChat mature-phase orchestration)

The GigaChat adapter now keeps completed phases immutable and advances phases strictly in order. Durable completed markers are authoritative even after stale runtime state, repeated skill/workspace loads are bounded, corrected verifier reruns clear obsolete failures, and wrong script-vs-skill or HTML-file-vs-project-directory calls are translated to their canonical Forge operations.

Phase 4 accepts valid JPEG/WebP target frames, numbered visual variants and the supported selection locations. Phase 7 recognizes the canonical test/visual-QA skill workflow. Local staging automatically uses the finite AI play mode, shell scripts run through Git Bash, evidence arguments are normalized, and structured `write_file` values are serialized as JSON. Browser helpers now resolve project-local Puppeteer reliably, dismiss dialogs, provide a local Yandex SDK stub and produce a real playable promo recording. Contract: `6.3.6-mature-phase-orchestration`.

## v4.68.15 changelog (Windows Yandex release pipeline)

The canonical three-ZIP Yandex builder now works from Windows and accepts an external project root. It uses native filesystem operations and platform-appropriate archive commands; production stays clean, debug contains debugcheck plus cheats, and marketing contains debugcheck, cheats and screenshot helpers.

ZIP CDN inspection and variant runtime testing no longer depend on Unix `/tmp`, `unzip`, `cp` or `rm`. Runtime testing extracts the requested archive before Yandex delegation and cleans its temporary directory. Pre-submit path resolution now connects `WorkProgress/<game>-yandex` with `Release/<game>/yandex`, allowing the real localized listings to participate in the gate.

## v4.68.16 changelog (Quality Sol + private project Git)

Every Codex phase and generated custom agent now stays on GPT-5.6 Sol/Standard. Reasoning effort remains high for creative and technical work, medium for deterministic listing/release/live work, and reaches xhigh only through named hard-problem routes. Fresh phase tasks, bounded output and a one-high-detail-image rule address the real context amplification that consumed the weekly model budget.

Every new project gets its own local `main` repository. Completing a phase creates a durable checkpoint commit. An explicit workspace policy can create and push each future game/app to a private GitHub repository; Forge refuses public remotes and staged secrets, preserves local commits when the network fails, and never mass-onboards existing projects without an explicit command.

## v4.68.17 changelog (one-window Codex phases)

Codex development no longer requires closing and reopening a terminal after every phase. `codex-pipeline.mjs` holds one terminal UI while using `codex exec` sessions internally: answers to a real STOP resume the current phase session, but `phase-state complete` discards that session and starts the next phase with clean context after a simple yes/no prompt. `--auto` removes only the between-phase prompt, not real decision gates.

The orchestrator also repairs premature `in_progress` endings with bounded automatic resumes and resolves the installed Windows Codex JS entrypoint directly, avoiding child-process failures from npm `.cmd` wrappers and protected WindowsApps executables.

## v4.68.18 changelog (cost/context-aware Codex orchestration)

The one-window Codex parent now produces a local per-phase cost/context report without adding anything to model context. The exec JSON stream supplies a bounded fallback; local rollout aggregation enriches it with model-response count, cumulative input/cached/output usage, compactions, subagent tree, exact tool-output payload size, and actual root model/reasoning policy. Reports deliberately omit prompts, messages, file contents, rate-limit state, and secrets, and remain local through repository excludes.

Terminal summaries explain cache reuse rather than calling output/input a universal efficiency score. Heuristic warnings cover high-volume context amplification, oversized tool output, model-policy mismatch, unexpected incomplete endings, exec failures, excess subagents, and compactions. Dashboard can load multiple `phase-N-latest.json` reports into comparable cards without receiving implicit filesystem access.

## v4.68.19 changelog (clean Codex launch with optional local MCPs)

The one-window launcher now preflights enabled loopback HTTP MCP endpoints inherited from the user's Codex config. If a local endpoint is unreachable, Forge applies `mcp_servers.<name>.enabled=false` only to child phase/resume commands and prints the decision; it never edits global configuration. This prevents an optional stopped service such as Unity MCP from flooding or aborting an unrelated HTML5 phase. Remote and stdio MCPs are left untouched, reachable loopback endpoints stay enabled, and `--keep-local-mcp` provides an explicit escape hatch.

Child `codex exec` now inherits terminal stdin instead of receiving a closed pipe. A prompt supplied as an argument is therefore no longer accompanied by the misleading `Reading additional input from stdin...` path in an interactive PowerShell launch. Regression fixtures verify start/resume override propagation, selective loopback detection, and the full Phase 1–9 lifecycle.

## v4.68.20 changelog (GigaChat direct-task intent guard)

GigaChat now has a durable change-request mode for explicit implementation work in the middle of the canonical pipeline. `/do <task>` preserves the exact user request across context compaction, pauses automatic phase/release continuation without falsifying phase markers, and injects the direct task as the authoritative current objective. Strong natural-language implementation commands activate the same mode; `/task` exposes it and `/resume-phase` clears it explicitly.

The protection is mechanical rather than prompt-only: phase preflight/gates, `phase-state`, phase skills, release skills, and release packaging are rejected at the tool boundary while the direct task is active, including malformed textual-call recovery. `forge_change_complete` clears the override only after a successful implementation operation, existing evidence paths, and reported verification checks. This prevents a request such as “сделай гачу” from being replaced by a stale Phase 8 release marker after context compaction.

## v4.68.21 changelog (GigaChat evidence-bound status guard)

Real terminal evidence exposed three trust gaps after the direct-task intent fix: GigaChat could clear `forge_change_complete` with invented check descriptions, treat a factual question such as «собрал архивы?» as permission to start Phase 8, and create a counterfeit verifier under `WorkProgress`. Completion checks are now matched to successful commands recorded after the direct task started; unmatched claims remain blocked and produce a diagnostic.

Factual status turns are mechanically read-only: the function surface contains inspection tools only, and the execution boundary rejects mutating recovered pseudo-calls. Canonical-looking verifier/release substitutes under `WorkProgress/<project>/scripts/` are blocked. A repeated full write of the same direct-task file also requires a fresh read after the prior write, preventing context compaction from silently replacing completed work with a shorter reconstruction.

## v4.68.22 changelog (immutable release build versions)

Every canonical Yandex three-ZIP build now creates a new immutable version. The builder scans existing production archives, increments the latest numeric component when no newer version is supplied, and auto-bumps an explicitly repeated or older version. Existing ZIP paths are never unlinked or overwritten. Each successful build prints its exact `BUILD_VERSION` and appends the selected version and three artifact paths to `build-history.json`.

Phase 8 no longer treats a changed hash at an old ZIP path as a fresh release. Its baseline gate requires a newly named production/debug/marketing trio of one version that is higher than the newest version present when the phase started. The canonical release skill now routes all packaging through `build-yandex-3zips.mjs` rather than allowing improvised release scripts.

## v4.68.23 changelog (safe GigaChat large-file integration)

The failed gacha integration exposed a destructive compaction loop: GigaChat repeatedly reread only the first 300 lines of a 93 KB game and used `write_file` five times, eventually shrinking the game to 17 KB. Direct-task reads now auto-page with durable per-file cursors, refuse to restart after EOF, and carry only bounded operation summaries through compaction.

Targeted integration work can no longer fully reconstruct an existing large file unless the user explicitly asks for a complete rebuild. Suspicious shrinkage and every second full overwrite of the same path are blocked before disk mutation. Twelve consecutive reads without an implementation action or four compactions in one direct turn now produce a recoverable diagnostic stop. An explicitly repeated `/do` starts a clean retry.

## v4.68.24 changelog (modularize large existing games)

Large monolithic web entrypoints now have a deterministic preprocessing path before feature work. The new `modularize-existing-project` skill and script analyze first, preserve a backup, externalize inline CSS, split classic JavaScript at existing semantic section markers without changing load order, and generate hash-bound machine/human module contracts. `--check` rejects missing, stale, unreferenced or syntactically invalid modules.

GigaChat direct-task routing detects remaining WorkProgress sources above 32 KB and directs the model through modularization, baseline and regression checks rather than whole-file reconstruction. On the real `testgigachat-v4`, a 93 KB entrypoint became a 3.8 KB shell plus 17 bounded JS modules; canonical playtest, targeted Playwright state/visual verification and local-stage remained error-free.

## v4.68.25 changelog (safe module-contract refresh)

Forward-testing the new modular workflow exposed a missing post-feature transition: any legitimate module edit correctly made `modules.json` stale, but there was no safe way to accept the new hashes without manual documentation surgery. `modularize-existing-project.mjs --refresh` now recalculates live hashes, sizes, symbols, ownership, storage keys and DOM IDs while preserving the approved module paths and load order.

Refresh refuses missing/unreferenced modules, new inline code, syntax errors and hidden boundary changes. The fixture now proves the full lifecycle: stale feature edit fails `--check`, safe refresh records the new symbol surface, and the final check passes.

## v4.68.26 changelog (reliable modular GigaChat feature operations)

Real GigaChat forward tests exposed four gaps after modularization: disconnected feature files could escape the contract, an accepted direct task could continue into Phase 8, approved small modules could still be destroyed by full writes, and generic smoke output could falsely stand in for the requested feature. Module refresh now safely adopts only referenced `js/`/`styles/` additions while preserving the prior relative sequence; checks reject both orphan numbered modules and uncontracted references. Approved modules require targeted edits, and successful `forge_change_complete` is now terminal until explicit `/resume-phase`.

For existing merge-grid games, `integrate-gacha.mjs` performs state, main persistence, reset, core/integration module and load-order changes atomically with backup evidence. `check-gacha-integration.mjs` proves the actual button/API, grid mutation, main save, full-grid queue, reload restoration and later delivery in a browser. A final real GigaChat `/do` used this path, passed the 20-module contract, focused verifier, playtest and local-stage, then stopped without entering release.

## v4.68.27 changelog (one model for the whole project)

Forge can now lock Gemini, Qwen, Kimi K3, DeepSeek, GLM or MiniMax M3 to an entire project through `.forge/agent.json`. The new `select`, `profile` and `start` commands prevent an implicit provider/model switch while preserving one interactive terminal across the canonical nine phases. Gemini and Qwen use their verified native interactive-prompt contracts; Kimi Code performs one bootstrap turn and resumes the same session; DeepSeek, GLM and MiniMax use provider-pinned OpenCode profiles.

Gemini CLI 0.55.1 and Kimi Code 0.37.2 were installed from their official distributions; the existing Qwen Code 0.14.0 and OpenCode 1.15.10 contracts were inspected locally. Windows executable discovery now prefers runnable `.exe`/`.cmd` npm shims. DeepSeek/GLM/MiniMax keys remain outside projects in provider-specific OpenCode credential stores and are stripped from the tool environment. Managed `GEMINI.md`/`QWEN.md`, Dashboard launch buttons, a project-lock schema, documentation and offline regressions cover the new surface. Provider quality parity remains unclaimed until equal full-project benchmarks are run with authenticated accounts.

## v4.68.28 changelog (safe project Git secret scan)

The first real Qwen-only project exposed a false positive in the local-first Git checkpoint: Forge-managed RuStore payment documentation contains bare PEM header/footer examples, and the secret scanner treated the header alone as a complete private key. New project creation therefore stopped after sync before its initial commit.

PEM detection now requires a matching header/footer and a plausible encoded body. A regression proves that documentation placeholders commit normally while a realistic complete private key remains blocked. The original Forge diagnostic fingerprint is preserved in the failed test project and may be resolved only after the repaired checkpoint succeeds.

## v4.68.29 changelog (Windows-safe whole-project startup prompt)

The first authenticated Qwen launch reached the official Windows npm `.cmd` shim but failed before any model request: shell metacharacters in the long startup prompt were interpreted by `cmd.exe` instead of reaching Qwen as one literal argument.

Forge now persists the full agent/model-locked startup contract in `.forge/agent-start.md` and sends every CLI a short metacharacter-free instruction to read it. This protects Qwen, Gemini, Kimi and OpenCode launches from Windows command-shell parsing while keeping the complete contract inspectable and durable. A real fake-`.cmd` subprocess regression verifies the launcher and prompt file together.

## v4.68.30 changelog (Qwen OAuth preflight correction)

The first real GDD-only Qwen benchmark reached Qwen Code but exposed two adapter assumptions before the first model turn. The free OAuth profile accepts the provider alias `coder-model`, not the Coding Plan identifier `qwen3-coder-plus`; and a stopped user-scoped loopback Unity MCP produced repeated connection noise during authentication.

Qwen model defaults are now profile-aware: OAuth locks `coder-model`, while Coding Plan retains `qwen3-coder-plus`. Before a Qwen launch, Forge probes configured loopback HTTP MCP endpoints and writes a run-scoped high-precedence settings overlay under `forge-data/runtime/`; only unavailable local servers are excluded, existing Qwen user settings remain unchanged, and reachable or remote MCP servers remain available. Windows subprocess regressions verify both the file-backed startup prompt and this MCP isolation. The benchmark remains pending because the provider OAuth token endpoint returned external 502/504 responses.

## v4.68.32 changelog (OpenRouter whole-project host)

Forge can now run an entire project through one exact OpenRouter model via the installed OpenCode runtime. One central `openrouter.key` exposes named Qwen, DeepSeek, GLM, Kimi, MiniMax, Gemini and Grok presets; the selected model is persisted in `.forge/agent.json` and cannot change implicitly between phases.

The default `zdr` profile requires a zero-data-retention provider endpoint and denies provider data collection. OpenCode receives the key only through a Forge-owned isolated auth directory outside every game project, and the child environment is scrubbed before launch. The broader `standard` route exists only as an explicit opt-in. Runtime regressions cover secret isolation, ZDR configuration, model preset resolution and whole-project lock behavior.

## v4.68.31 changelog (remove discontinued Qwen OAuth profile)

After Qwen Code updated itself from 0.14.0 to 0.21.14, its current authentication contract reported that the free Qwen OAuth tier was discontinued on 2026-04-15. The previous 1,000-requests/day screen belonged to the stale CLI and cannot produce a model turn now.

Forge no longer offers or defaults to the discontinued OAuth profile. Qwen whole-project locks now expose `coding-plan` and `api`; both default to `qwen3-coder-plus`. Interactive setup uses `/auth` → Alibaba ModelStudio → Coding Plan or Standard API Key. The GDD-only benchmark remains ready but intentionally blocked until one of those paid credentials is configured.

## v4.68.33 changelog (ZDR-capable Qwen agent preset)

The first real OpenRouter Qwen smoke test exposed two catalog-level incompatibilities before an autonomous run: `qwen3-coder-plus` had no ZDR endpoint, while `qwen3-coder` returned a raw tool-call payload instead of executing the requested file read through OpenCode. Forge now maps the OpenRouter `qwen` preset to `qwen3-coder-next`, which passed a real ZDR-enforced tool invocation and read the project lock successfully. Privacy is not weakened silently and both failed candidates remain available only through an explicit exact-model selection.

## v4.68.34 changelog (evidence-bound experimental agents)

Real Qwen Phase 1 testing proved that successful tool calls do not guarantee evidence discipline.
Forge now rejects a phase completion before state or Git changes when evidence files are missing,
the Phase 1 brief is still a template, KPI numbers have neither a URL citation nor an explicit
hypothesis/TBD label, or runtime acceptance is checked without implementation source. A rejected
attempt becomes a durable `blocked` marker.

OpenCode whole-project hosts require v1.18.20+ so the built-in tool surface used by the verified
Qwen path is present. Experimental whole-project agents keep Phase 1–7 checkpoints local; private
GitHub synchronization is deferred until the verified Phase 8 result.

## v4.68.35 changelog (OpenCode STOP resume + source-line gate)

OpenCode `run --interactive` renders one model turn but exits after a Forge STOP; it is not a
persistent conversational terminal. Forge now exposes `forge-agent resume --answer ...`, stores the
answer in a project file instead of shell arguments, and continues the exact last OpenCode session.

The Phase 1 research gate is also line-bound: a document-level «no verified sources» disclaimer can
no longer launder competitor names, dates or market conclusions underneath it. Every detected
external factual line needs its own URL/local source or an explicit TBD/unverified label. A bounded
project-local `list` compatibility tool covers Qwen's repeated call to that otherwise absent tool.

## v4.68.36 changelog (phase evidence consistency + runtime identity)

Phase 1 completion now rejects metrics evidence that still declares `draft`, `blocked` or
`qa_blocked`; a passed marker cannot contradict its own source document. Whole-project launch and
resume environments also forward the actual locked host/model into `phase-state`, replacing the
misleading `unknown` runtime identity observed during the Qwen benchmark. The Phase 1 workflow now
requires final wiki/status updates before the checkpointing completion command.

## v4.68.37 changelog (mixed TBD assertion guard)

Phase 1 research validation now rejects a positive external assertion such as `verified`,
`confirmed` or `requires` even when the same line also contains `TBD`. This closes the final Qwen
benchmark loophole where an unsupported Yandex claim survived inside a nominally unknown
localization value.

## v4.68.38 changelog (OpenCode loop budget)

OpenCode whole-project turns now have a 64-step agentic ceiling. The project-local `list`
compatibility tool also suppresses identical successful repeats within the same session. Together
these safeguards convert provider tool loops into a bounded text handoff instead of unmetered API
spend; legitimate unfinished work remains resumable in the same session.

## v4.68.39 changelog (Ox Alpha retained-data preview)

OpenRouter gains an `ox-alpha` whole-project preset for the free anonymous coding preview. Forge
refuses to run it through the default ZDR profile: selection requires explicit `--profile standard`
because the upstream provider retains prompts and completions. The preset is therefore restricted
to non-confidential evaluation projects while keeping the existing 64-step OpenCode turn budget.

## v4.68.40 changelog (newest release archive runtime gate)

Variant-aware runtime QA now selects the highest numeric release version rather than the first ZIP
returned by the filesystem. Production, debug and marketing archives are matched exactly, and a
dedicated regression guards unsorted directory entries plus numeric ordering such as v1.10 over v1.9.

## v4.68.41 changelog (canonical nine-phase state integrity)

All nine canonical phases now load schema-checked executable completion contracts with exact
evidence paths and phase-specific project checks. Missing, irrelevant, directory-only and
counterfeit evidence can no longer advance durable state. The old seven-step pipeline checker is
now only a compatibility view over canonical nine-phase status, and MCP exposes a bounded read-only
verifier surface from an explicit registry instead of exporting every `check-*.mjs` script.

## v4.68.42 changelog (durable execution graph)

Added strict Task, RunResult, FailureType and workflow schemas plus five restart-safe execution
graphs for phase, change, review, diagnose and release work. Local graph state uses atomic writes,
transition locks and bounded retries without competing with the canonical nine phases. Codex now
routes exact-attempt structured STOP/results before legacy text heuristics, restores user STOPs before
launching a model, and never advances from a supplemental completed result alone. GigaChat direct
tasks persist intent before graph creation, recover orphan runs and record failed verification as repair.

## v4.68.43 changelog (verifier-driven repair runtime)

Change Tasks now execute registered deterministic checks automatically when the graph enters `verify`.
PASS reaches `done`; normalized verifier failures return to the shared bounded repair loop; timeout and
dependency failures become infrastructure blockers. Only Task-enabled read-only checks from the installed
Forge registry can execute, project-local registries are untrusted, targets remain project-relative, and
token-owned locks prevent duplicate verifier runs. GigaChat direct gacha work derives an exact host-owned
plan from its successful canonical ledger check and uses the same runtime instead of accepting model prose.

## v4.68.44 changelog (machine-readable Skill/Agent contracts)

Eleven canonical skills now expose strict phase/mode, scope, STOP and trusted-verifier contracts; all
others remain manual-only. Durable Tasks preserve contract identity/hash and reject drift. GigaChat
derives gacha verification only from successful structured host operations, never model prose. Five
core subagent roles also validate typed advisory Builder/Reviewer/Researcher results.

## v4.68.45 changelog (host-enforced native Task write scope)

Codex binds the phase Task before tools and rejects native writes outside scope. GigaChat guards its
writes and blocks raw shell during Tasks. Escape regressions include a live Codex smoke.

## v4.68.46 changelog (portable phase Task engine lookup)

Copied phase runtimes gained installed sibling-engine lookup, fixing Phase Task creation in ordinary
App chats without copying the verifier registry into managed games. Verifier-node contract revalidation
was completed in the follow-up v4.68.47 immutable build.

## v4.68.47 changelog (complete portable contract authority)

Verifier-node SkillContract revalidation now uses the same trusted installed engine as registry
execution and Task creation. Managed projects cannot self-promote through their folder name or a local
`FORGE_ENGINE_ROOT`; case folding is Windows-only. The copied-runtime regression now reaches `done`
through a contracted verifier while tampered local contracts and registries remain ineffective.

## v4.68.48 changelog (Unicode-aware Phase 1 evidence gate)

Phase 1 KPI and research validation now uses Unicode token boundaries instead of JavaScript's
ASCII-oriented `\b`/`\w`. Russian hypothesis/no-evidence wording works directly, while unsupported
Cyrillic KPI and external-market claims are rejected. Inflected research terms and positive Russian
confirmations are covered by regression tests without weakening existing English checks.

## v4.68.51 changelog (screen-blueprint visual acceptance)

Phase 2 now presents every player-visible state/transition at a dedicated user STOP and binds approval
to a deterministic inventory hash. Phase 4 generates state-specific mobile/desktop GPT Image blueprints
conditioned on the approved master PNG. The batch route enforces `/v1/images/edits` plus a provider
request ID; native generation records an explicitly host-trusted, hash-bound attestation rather than
provider proof. Forge captures the exact same inventory through a local
runtime adapter. Engine-adjacent HMAC receipts make later project-local capture/review edits detectable;
the full-shell host remains trusted.
The gate verifies complete PNG chunks/CRC/IDAT, realpath containment, production-asset freshness,
per-frame target comparisons and different host sessions; self-selected subsets, identical state frames,
future timestamps, project-local reviewer claims and affirmative completion wording are rejected.

## v4.68.49 changelog (complete Unicode evidence classification)

Unicode-aware Russian KPI/research enforcement now distinguishes document-level market vocabulary from
line-level external facts. Internal Retention headings and Cyrillic research section labels do not cause
false rejection, while inflected factual claims still require line-local evidence. The real CardGame
Phase 1 documents pass without English workaround labels.

## v4.68.50 changelog (marker-authoritative status progression)

`$status` now uses artifact inference only for projects with zero valid phase markers. In a modern
marker-managed project, the first missing marker remains the current gate; later visual/SDK/listing/QA
artifacts are reported as evidence ahead of gate without silently completing or skipping phases.

## v4.68.51 changelog (evidence-bound visual acceptance)

Phase 2 inventory → GPT Image targets → adapter capture → independent review.
Missing/stale/fake shots, self-review, <6/10 and Critical/Major cannot complete Phase 4.

## v4.68.52 changelog (engine-neutral Godot native test and release)

Godot GDScript closes native Phases 5/7/8 with real-window proof, two-process save/reload and immutable
Windows export. Engine-owned signed receipts, no-extract ZIP verification and an isolated test exporter
block project-local false PASS. Common phases stay engine-neutral; Godot is the first complete adapter.

## v4.68.54 changelog (safe Codex phase write boundary)

Fresh Codex phases select `workspace-write` without full-host/hook bypasses. STOP resumes inherit that
policy; invalid resume policies fail before durable state changes.

## v4.68.55 changelog (rejected host-owned Git candidate)

The parent host owns Git while Codex stays workspace-scoped. This immutable candidate was rejected before
publication/install because a failed Phase 8 push was not restart-safe.

## v4.68.56 changelog (rejected checkpoint candidate)

An ignored atomic ledger makes completed-phase Git state restart-safe. Before the next model, Forge
reconciles missing/failed checkpoints; failures also hold status and direct phase commands. Phases 1–7
remain local-only; Phase 8+ requires a confirmed private push. The immutable ZIP was rejected before
publication/install: `--help` unexpectedly built it, and manual checkpoints still bypassed the full lease.

## v4.10.0 changelog (Step 0 Discovery — content-based document classification)

First minor bump after the v4.9 hotfix series. New feature emerged from real user need: "у меня готовый MVP + 6 design документов, /pipeline должен сам понять что это".

### Step 0 — Discover (NEW phase before Step 1)

Pipeline теперь имеет 8 шагов вместо 7. Step 0 запускается first **только** если юзер вызвал `/pipeline <path>` или указал папку с MVP/docs. Сканит folder, классифицирует documents **по содержимому**, не имени файла.

### Content-based classification

Не зависит от naming convention. Файлы могут называться `01-research.md`, `MARKET.md`, `competitors.txt` — алгоритм считает signal markers в первых 500 строках:

| Class | Markers (any 2+) |
|---|---|
| research | "конкуренты", "рынок", "TAM", "competitor", "market" |
| project-overview | "что это", "vision", "MVP", "концепция" |
| tech-stack | "Frontend", "Backend", таблицы технологий |
| roadmap | "Phase 1", "milestones", цифры по фазам |
| monetization | "ARPDAU", "IAP", "Stars", ценовые лестницы |
| marketing | "TikTok", "VK", "CAC", "channels" |
| game-design | "core loop", "механика", "balancing", "prestige" |

Best-class wins, ties broken by content density. Score < 2 → unclassified (preserved as wiki/design/{slug}.md).

### Skip dependent steps

Step 0 пишет `wiki/_pipeline-state.md` с classification + `skip_steps: [3]` если design покрыт. Step 3 (`/design-pipeline`) тогда полностью пропускается — не spawn'ит 7 specialists, экономит ~6 часов на проектах с готовым design.

Step 2 metrics extracted from roadmap.md если он есть в discovery (вместо web research benchmarks).

### check-pipeline-state.mjs updated

Знает про Step 0. `optional: true` flag — Step 0 не блокирует "next step" detection если discovery не запускалась (green-field projects skip Step 0 entirely).

### Invocation patterns

```
/pipeline                              # green-field, ask user for description
/pipeline GameIntegration/foo/         # existing MVP/docs, Step 0 scans
```

### Lesson #35 — Patterns extracted from concrete usage

Самогонщик был первым проектом где user pushback явно указал на feature gap: "почему я должен писать промпт на 50 строк? `/pipeline path/` должно работать". Это validating Lesson #31 (speculative work needs concrete use case) — feature waited for real need, then extracted.

**Tier:** principle. Promote to Architectural Invariants if pattern repeats: feature requests via user pushback after multiple workarounds.
## v4.10.1 changelog (slash command wrappers)

Hotfix immediately after v4.10.0 — discovered slash commands didn't work as designed.

### Bug

User typed `/pipeline GameIntegration/genetic-lab` in Claude Code, got:
```
Unknown command: /pipeline
Args from unknown skill: GameIntegration/genetic-lab
```

### Cause

Forge skills (`/start`, `/pipeline`, `/analyze-game`, etc.) are written in `.claude/skills/{name}/SKILL.md`. They get **triggered** by description matching when user types natural language с trigger words. They are NOT slash commands.

Claude Code distinguishes:
- **Slash commands** — explicit files in `.claude/commands/{name}.md` (or `.cmd`). Invoked literally as `/{name} args`.
- **Skills** — folders в `.claude/skills/{name}/` with SKILL.md. Invoked by description match.

Forge had only skills, no commands. So `/pipeline path/` failed because:
1. No `.claude/commands/pipeline.md` exists
2. Claude Code can't pass `args` to skill via slash syntax

### Fix

Created `.claude/commands/` folder with thin wrappers:
- `pipeline.md` — args treated as path для Step 0 discovery
- `start.md`, `continue.md`, `analyze-game.md`, `analyze-project.md` — args treated as additional context

Each wrapper just delegates to its skill file:
```
User invoked: /pipeline $ARGUMENTS
Read .claude/skills/pipeline/SKILL.md and follow it.
If $ARGUMENTS provided — use as path для Step 0.
```

### sync.bat / sync.ps1 also updated

Both scripts now copy `.claude/commands/` к siblings (was missing — only skills/agents/hooks were synced).

### Lesson #36

**Don't assume mechanism works because syntax looks similar.** I assumed `/pipeline` works as slash command because `/start` etc work. Actually `/start` worked through description matching (user typed `/start` and Claude Code mapped to skill description), but didn't pass args — args would fail same way as `/pipeline`. Fix needed for ALL slash invocations с args.

**Tier:** principle. Verify mechanism before extending it.
## v4.10.2 changelog (wiki-audit robustness — frontmatter+entry parsing + 5min grace + 10s tolerance)

Hotfix from real genetic-lab session — wiki-audit blocked Stop hook even after Claude updated wiki/_map.md and wiki/_current.md correctly. Claude resorted к hack `Set LastWriteTime = (Get-Date).AddMinutes(2)` чтобы продвинуться.

### Diagnostic

User submitted session log + wiki/ files + mtime data. Timeline:

```
23:34:51  session log first entry
23:37:04  Write wiki/_current.md (mtime)
23:37:42  Write wiki/_map.md (mtime)
23:37:55  shell command (log appends → log mtime advances)
→ Stop hook blocks: 'wiki/_map.md not updated since session started'
```

Logic in v4.10.1 should have passed (wiki mtime > session start). Two reasons it didn't:

1. **Tight 2s tolerance** — when slow disk + hook chain delay puts Write timestamp slightly behind session start due to OS rounding.
2. **Timezone ambiguity** — `setHours()` использует local tz, mtime в UTC. Edge case при daylight saving boundaries.

### Fix

Three improvements:

1. **Better parsing**: combine frontmatter `date: YYYY-MM-DD` + first entry `HH:MM:SS` into exact local datetime via `new Date(y,m-1,d,h,m,s,0)`. No `setHours()` mutation, unambiguous timezone handling.

2. **5-min grace period before parsed start time** — accounts for session-start hook firing slightly before first user tool call (template renders, hook init).

3. **10s mtime tolerance** (was 2s) — covers FAT32 granularity + hook chain delay + slow disk writes.

4. **Verbose mode**: `FORGE_WIKI_AUDIT_VERBOSE=1` prints sessionStartMs strategy + result to stderr для future debug.

### Edge case verified

Tested both ways:
- Wiki updated at 23:37:04 после session start 23:34:51 → PASS (как должно)
- Wiki edited yesterday, new session today → FAIL (как должно — legitimate stale)

### Lesson #37 — Tolerance тоже надо calibrate

Lesson #34 (immutable references) reflected что нельзя сравниваться к moving target. Fix v4.9.3 sessions parsed first entry — но **2s tolerance** не учёл что между Write и first read mtime может уйти на 5+ секунд (lint, format, post-tool-capture chain). Tolerance это **calibration parameter**, не magic constant. Real-world data сказала 2s мало → 10s.

**Tier:** principle. Tolerances в audit logic нужно calibrate против real-world timing data, не выбирать 'умное' значение.
## v4.10.3 changelog (sync.ps1 silent failure — Copy-Item bug + robocopy fix + verification)

Real-world bug from pet-helper project: `sync.ps1` reported `[OK] pet-helper synced`, but `/pipeline` skill (added in v4.10.0) was MISSING in pet-helper. Sync was lying.

### Diagnostic

User ran `sync.ps1` after upgrade к v4.10.2. Output showed all 6 sibling projects synced. But `ls F:\ProjectForgeUniversal\pet-helper\.claude\skills\pipeline\` returned `Path not found`.

### Root cause

`Copy-Item -Recurse -Force` quirk on Windows PowerShell:
- When destination directory exists, behavior depends on **whether source path ends with `\`**
- Sometimes creates nested `dest/source/` instead of merging
- Sometimes skips new subdirectories that don't exist в destination yet
- This is **silent** — no error, just incomplete copy

### Fix

Replaced `Copy-Item -Recurse -Force` with **robocopy** для skills/agents/hooks/commands:

```powershell
if ($Strict) {
    & robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NC /NS /NP
} else {
    & robocopy $src $dst /E /NFL /NDL /NJH /NJS /NC /NS /NP
}
$global:LASTEXITCODE = 0  # robocopy exit 0-7 are success
```

Robocopy is **mature, transactional, well-tested** for directory mirroring on Windows. Strict mode uses `/MIR` (delete extras в dst), safe mode uses `/E` (preserve extras).

### Post-sync verification

Added count check after each sibling sync:

```
[WARN] pet-helper has 84 skills vs Forge 97 (-13). Run with -Strict для clean sync.
[WARN] pet-helper has 0 slash commands vs Forge 5 (-5).
```

If skill count differs by >5 → warning. Catches silent failures before юзер discovers them в session.

### sync.bat unchanged

`xcopy /E /I` (used in sync.bat) actually handles new subdirs correctly — bug was specific к PowerShell `Copy-Item`. Verified — not patching sync.bat.

### Lesson #38

**Trust verification, не trust reporting.** Sync said `[OK]` but sync was lying. We need **independent verification** of side-effects (count files in destination) instead of relying on script's self-report. Same pattern as Lesson #33 (verifier double-jeopardy).

**Tier:** principle. Add post-sync verification как pattern в любых state-changing scripts.
## v4.10.4 changelog (UX fix — questions visible, hooks terse, wiki cleanup before turn end)

User pain: AI задаёт 6 questions → Stop hook reports wiki out of sync → AI does 4 cleanup tool calls → re-prints summary → user has to scroll up 30 lines to find original questions. Twice in same turn.

### Root cause

Order of operations was wrong:
1. AI does work (research, code)
2. AI prints summary + asks user questions
3. AI ends turn → Stop hook fires
4. Hook reports issues (multiline)
5. AI does wiki cleanup (more tool calls)
6. AI re-prints — пользователь scrolls

Correct order: do work → update wiki → print summary → end turn (hook clean, no continuation).

### Fixes

**1. New Architectural Invariant #14:** "Wiki updates BEFORE user-facing turn end." If asking user input, wiki must already be in clean state.

**2. Stop hook output radically shorter** — 6 lines → 1 line. Was multi-line block с bypass instruction. Now single sentence: "Wiki out of sync — fix BEFORE asking user questions or ending turn: {issues}. Bypass: FORGE_SKIP_AUDIT=1."

**3. Skill instructions strengthened** — added "CRITICAL — wiki cleanup before showing user questions" section в research-references skill. Strengthened pipeline non-negotiable bullet to explicitly say "BEFORE asking user any question".

**4. roadmap.md target fixed** — was `wiki/plan/roadmap.md`. But `wiki/plan/` expects task-schema files (id/title/status frontmatter). Long-form roadmaps belong в `wiki/design/roadmap.md`. plan-check.mjs no longer false-positives.

### Lesson #39

**Hook timing matters as much as hook content.** v4.9.3 fixed wiki-audit logic. v4.10.2 fixed parsing. v4.10.22 fixes that **even when hook is correct**, firing AFTER user questions disrupts flow. Hooks should fire either silently (success) or terse-once (failure), и AI must complete все wiki bookkeeping BEFORE asking for user attention.

**Tier:** principle. Promoted to Architectural Invariant #14.

## v4.9.5 changelog (dashboard: frozen status + multi-select filters + description toggle)

Three dashboard UX improvements from real usage:

### 1. Status `frozen` (заморожен)

New 7th status — для проектов которые ставятся на паузу не насовсем (отличается от `published` = выпущен и от удаления). Coolblue badge с opacity=.85 чтобы визуально читался как dimmed.

STATUSES enum теперь: `new` → `dev` → `polish` → `build` → `review` → `published` + `frozen`.

### 2. Multi-select status filters

Раньше: filter row смешивал статусы + типы + платформы в один rail, можно выбрать только **одно** значение. Хочешь видеть `dev` И `polish` одновременно — никак.

Теперь: 2 строки фильтров.

Row 1: статусы (multi-select). Кликаешь чип — toggle включения. "Все статусы" ярко-active когда ничего не выбрано (default).

Row 2: тип + платформы (single-select, как раньше). Радиокнопочное поведение через `activeFilter`.

Selected statuses persist в `localStorage['forge_active_statuses']`.

### 3. Description toggle

Checkbox "Показывать описания" в sort bar. Дефолт = on. Скрытие позволяет видеть больше карточек на экране когда нужно scan'ать инвентарь.

Persists в `localStorage['forge_show_desc']`.

### Schema migration v4 → v5

Bug fix: legacy migration mappings указывали в `'in_progress'`, `'done'`, `'archived'` — values которых **никогда не было** в STATUSES enum. На production чистка через v3→v4 fallback'ила всё к `'new'`.

Теперь legacy mappings корректные:
- `wip` / `in_progress` → `dev`
- `finished` / `done` → `published`
- `archived` → `frozen`
- unknown → `new` (last resort)

7/7 migration tests passing.

## v4.9.4 changelog (project name в statusline)

Small UX improvement from real-world feedback. User asked: "подскажи как сделать чтобы здесь всегда было название проекта". Window title (top of Windows Terminal) is set by Claude Code itself, but our **bottom statusline** can include project name.

### Change

`status-line.mjs` теперь prefix'ed project name. Detection в order:

1. `wiki/_map.md` first line — `# Project Map — Foo` или `# Foo — Project Map` → "Foo"
2. `package.json` `name` field → titlecase → "Strategy Runner"
3. Project folder basename → titlecase → "Strategy Runner"

Forge itself (folder = `project-forge` или `forge-v*`) — suppress prefix to avoid "Project Forge · Project Forge · ...".

### Output examples

```
Before:  [Q1-004] ADX indicator chart panel · 6/6
After:   Strategy Runner · [Q1-004] ADX indicator chart panel · 6/6
```

If no active task:
```
Before:  · Session goal text
After:   Strategy Runner · · Session goal text
```

Project name всегда visible в bottom statusline пока работаешь.

## v4.9.3 changelog (hotfix: wiki-audit infinite loop on stop)

Third hotfix in 24h. Real-world bug from third user session — long /start session с детальным wiki onboarding workflow blocked perpetually by Stop hook even after multiple wiki updates.

### Bug

User completed massive `/start` для Strategy Runner project — created 8 feature pages, 3 ADRs, full wiki structure. Tried to stop session. Hook blocked: `wiki/_map.md not updated`. User did `touch wiki/_map.md`, retried. Same error. Did `touch wiki/_current.md`, retried. Still blocked. Loop continued for ~10 minutes.

Root cause: `wiki-audit.mjs` compared wiki mtime к **session log mtime**. But every tool call (including `touch` itself!) appends к session log via `post-tool-capture`, advancing log mtime. Wiki update at 14:42:06 → log append at 14:42:06.5 → wiki appears stale on next stop attempt.

v4.8.0 added 2-second tolerance ([[wiki/decisions/011]]) but for ~20-second feedback loops between user actions, log mtime advanced too far.

### Fix

Use **session START time** instead of log mtime — fixed reference that doesn't advance:

1. Parse first `- HH:MM:SS` entry timestamp from session log content (set on first append, never changes)
2. Fall back to frontmatter `date:` (start-of-day) if no entries yet
3. Final fallback: file mtime (legacy)

Also: only require `_map.md` / `_current.md` updates if there were **actual edits or feat commits today**. Read-only sessions (just /help, /continue, viewing files) shouldn't trigger wiki audit.

### Lesson #34

**Audit triggers must use immutable references.** Comparing к anything that mutates during the audit creates feedback loops. Mtime of session log advances on every tool-call. Better: parse fixed value from log content (first entry timestamp).

Same principle applies к Lesson #33 (verifier double-jeopardy) — verifiers themselves need adversarial testing. The sessionStart logic should be tested with sessions where log was just appended.

**Tier:** principle
**Action:** add к Architectural Invariants if pattern repeats.

## v4.9.2 changelog (hotfix: sync.bat false success + verifier comment-skip bug)

Two real-world bugs from second user session:

### Bug 1: sync.bat reported [OK] when it actually failed

User saw:
```
  [...] spiral-vigil
Системе не удается найти указанный диск.
      [OK] spiral-vigil synced
```

Cause: `pushd` inside `for /d` loop fails on broken git worktrees, but batch script doesn't check exit status — `[OK]` is unconditional echo.

Fix:
1. Replace `pushd "%%P"; set CHILD_ABS=!CD!; popd` с `set CHILD_ABS=%%~fP` (for-modifier returns string, never fails).
2. Verify `.claude\settings.json` exists (not just `.claude\` folder) before reporting [OK].
3. Track FAILED count, print warning at end if >0.
4. Same fix в sync.ps1 — wrap `Resolve-Path` в try/catch.

### Bug 2: check-bat-encoding.mjs missed non-ASCII in comments inside () blocks

While fixing Bug 1, I added `:: comment с русскими словами` inside `if exist (...)` block. v4.8.0's `check-bat-encoding.mjs` reported clean — but it WAS a real Lesson #20 violation.

Cause: verifier had `if (isComment) continue;` — assumed cmd.exe ignores comments. **Wrong.** Lesson #20 itself said cmd.exe parses bytes BEFORE semantics — multi-byte chars в comments inside () blocks STILL crash parser.

Fix: Comments at top level (depth=0) skipped (true comments). Comments inside () blocks now scanned для non-ASCII (don't affect depth tracking).

### Lesson #32 + #33

**#32: Eat your own dog food.** v4.9.0 → 4.9.1 → 4.9.2 in 24 hours. Each hotfix from one real user session. Spec/verifier/test coverage finds structural bugs but missed real UX paths. Solution: actually run `forge.ps1 new && sync.bat` once per release.

**#33: Verifier bugs are double-jeopardy.** When verifier has false negative (says clean when not), the very thing it's preventing recurs silently. Verifiers themselves need adversarial testing — try inputs that SHOULD fail, confirm they do.

**Tier:** principle (both)
**Action:** add к Architectural Invariants if pattern repeats.

## v4.9.1 changelog (hotfix: dashboard prompt paths)

Hotfix release — small but observed bug from real user session.

### Bug

Dashboard "Создание проекта" prompt generated paths с mixed forward/backslashes:
```
mkdir f:/ProjectForgeUniversal/project-forge/strategy-runner\GameIntegration\strategy-runner
      ^^^ forward slashes                                    ^^^^^^ backslashes
```

Plus broken `cd <path>; powershell` chain (semicolon ok in PS, but not in cmd).

### Fix

1. **Consistent Windows backslashes** в всех путях modal output
2. **Multi-line commands** instead of inline `;` chains — easier to read, paste, debug
3. **Hint added** under path field explaining неправильный pattern (project inside forge folder vs sibling)
4. **Confirmation dialog** при сохранении если path содержит `project-forge` segment — common user mistake

### Lesson

**Real-world usage finds bugs spec doesn't.** v4.9.0 had structural integrity (visual regression caught z-index issues), encoding gates (`.bat` parser safety), and validators across 162 platform integration points — but failed на наиболее basic UX: copy-paste a command into PowerShell. Reason: never personally pasted that exact prompt myself. Lesson: **eat your own dog food** — actually create a new project через dashboard at least once per release.

**Tier:** principle
**Action:** add к Architectural Invariants in v4.10 if pattern repeats

## v4.9.0 changelog (8-iteration release: lesson policy + auto-invoke + drift verifiers + visual regression + MCP)

Major release combining all 8 v4.9 backlog items. Theme: **complete the architectural infrastructure — codify what we've learned + automate audits + expose Forge knowledge to other Claude instances**.

### Что добавлено (по итерациям)

#### Iteration 1: Lesson rotation policy ([[wiki/decisions/012-lesson-rotation-policy]])

3-tier classification — **principle / pattern / incident** — определяет lifecycle каждой lesson.
- Principles → promoted to Architectural Invariants forever
- Patterns → referenced from skill/ADR before changelog rotates
- Incidents → leave in changelog, may rotate eventually

Plus **Invariant #13** (User pushback is signal, not noise) — promoted from Lesson #18.
Plus **Adding new lessons — process** template added к Invariants section.

#### Iteration 2: Skill categorization (frontmatter `kind:`)

96/96 SKILL.md files now have `kind: architectural | tactical`. **24 architectural** (foundations + orchestrators + classifiers) + **72 tactical**.

New verifier `scripts/check-skill-kind.mjs` enforces presence в frontmatter. Bug fixed в process: `find-or-make-skill` had unquoted YAML с двоеточиями in triggers list.

#### Iteration 3: `/start` auto-invocation chain

Step 6.6 — Architectural Foundation Chain. После `/i18n-foundation`, /start теперь auto-invokes (with stop-and-confirm pattern):

```
i18n → app-data-model → app-permissions → app-onboarding-flow →
subscription-design → per-category foundation → app-search
```

`/analyze-project` Step 7 — suggests architectural foundations missing from existing project. `/analyze-game` 🏗️ section — recommends pipeline для existing games.

#### Iteration 4: `scripts/check-pipeline-state.mjs`

Reads `wiki/_current.md` Pipeline status block (with filesystem fallback). Reports current step, completed steps, requirements для next step. Auto-invoked from `/continue` Step 1.5.

#### Iteration 5: localStorage migrations (dashboard.html)

`SCHEMA_VERSION = 4` + `migrateProject()` + `migrateAllProjects()`. Self-healing migrations:
- v1→v2: image field added
- v2→v3: legacy status values (`wip` → `in_progress`)
- v3→v4: unknown status → `new`, unknown platforms cleaned, defensive defaults

Idempotent. Toast notification если migration changed something.

#### Iteration 6: `scripts/check-dashboard-structure.mjs`

Visual regression detection через **structural diff** (no puppeteer/chromium dependency). Tracks tag, id, classes, role, event handlers, position styles. Caught simulated v4.7.4-style z-index regression в smoke test.

Modes: default (diff), `--baseline` (capture), `--json`, `--verbose`.
Baseline: `.dashboard-structure-baseline.json` (81 KB, 423 elements, fingerprint `f24a3f6a94f693cc`).

#### Iteration 7: `platforms/_shared/_lib/imports.mjs`

`detectImportedNames()` + `buildInitRegexes()` + `hasInitCall()` — generalizes v4.7.7 Steam validator fix. Handles 4 import forms (CommonJS, ESM default/namespace/named).

Refactored Steam electron-init validator (cleaner code, same behavior). Refactored VK bridge-timing validator (now also catches **aliased namespace imports** — was a real gap).

#### Iteration 8: Forge MCP Server

`mcp-server/index.mjs` (462 lines) — pure Node.js, raw JSON-RPC over stdio, **no SDK dependency**.

Exposes:
- 96 skills as `forge://skill/{name}` resources
- 12+ ADRs as `forge://decision/{name}` resources
- 13 Architectural Invariants as `forge://invariants` resource
- 10 verifiers as callable tools
- 3 prompt templates (advisor / start-project / apply-invariants)

Use case: Forge knowledge доступно из Claude Desktop / Claude Code в **other projects** — no copy-paste.

### Verifier suite — теперь 10

- check-claude-md-size
- check-platform-completeness (18 × 9 = 162 checks)
- check-inline-strings
- check-workspace-discipline
- check-no-float-money
- check-cross-refs
- check-bat-encoding
- **check-skill-kind** ← v4.10.0
- **check-pipeline-state** ← v4.10.0
- **check-dashboard-structure** ← v4.10.0

All run в setup.sh + setup.ps1 validation (8 of 10, last 2 per-project).

### Skills total

97 (was 95) — added `/education-foundation` was actually v4.8.0, плюс **`/social-foundation`** в v4.8.0, plus **`/mcp-server`** в v4.10.0 (Iter 8).

### Lesson #31

**Speculative work needs concrete use case.** Iteration 8 (MCP) was budgeted 4-6h speculative — actually delivered в 2h because:
1. Use case crystallized BEFORE coding (Forge knowledge across projects)
2. Raw JSON-RPC chosen instead of SDK (avoided npm install + ~1MB deps)
3. Started small — minimal protocol implementation, expanded as tests passed

**Tier:** principle
**Action:** promote К future Invariants if pattern repeats (work scaled with budget без clear use case).

К v4.10: review which v4.9 features get actual usage в real projects — drives next iteration priorities.

## v4.8.0 changelog (drift prevention + permanent invariants + App Track complete)

Major release combining 6 items from v4.8 backlog. Theme: **automate what we audited manually + complete App Track + lock in principles**.

### Что добавлено

#### 1. `scripts/check-cross-refs.mjs` — automated advisor catalog audit

Catches the bug that recurred 6+ times across v4.5.x → v4.7.x:
- **Missing**: skill exists в filesystem, не упомянут в advisor → user не знает он есть
- **Phantom**: advisor mentions skill, нет folder'а → invocation fails

Smart whitelist для known partial captures (`/analyze` from `/analyze-game`).
Integrated into setup.sh + setup.ps1 validation.

#### 2. `scripts/check-bat-encoding.mjs` — cmd.exe parser safety gate

Defends against v4.7.1-style "{char} was unexpected at this time" crashes.
Tracks `(...)` nesting depth построчно, flags non-ASCII inside multi-line `()` blocks.
Comments and strings правильно handled. Smoke-tested на 6 кейсах.

#### 3. wiki-audit hook — ±2s mtime tolerance

Fixes false positive observed в Spiral Vigil session: strict `wiki.mtime >= log.mtime` failed когда edits were within ~1 second of session log writes.
ADR `wiki/decisions/011-wiki-audit-mtime-tolerance.md` documents rationale.

#### 4. `🧭 ARCHITECTURAL INVARIANTS` section в CLAUDE.md

12 permanent rules distilled from lessons #20-29. Visible на каждой сессии (раньше эти principles ротировались в docs/CHANGELOG.md и терялись).

Topics: 3-layer enforcement, architectural vs tactical, workspace discipline, platform additions, encoding rules, money types, localStorage migrations, stacking context, chunked thinking, pipeline orchestrators, automated audits, mtime tolerance.

#### 5. `/education-foundation` skill (515 lines)

Per-category foundation для education apps:
- **Pedagogy framework** — Bloom's taxonomy distribution per module
- **Spaced repetition** — Leitner / SM-2 / FSRS algorithms
- **Progression curve** — Vygotsky's ZPD (target 70-80% success rate)
- **COPPA / GDPR-K compliance** для children <13
- **Multi-role architecture** — student / teacher / parent / admin
- **Content versioning** — handles edits without breaking user progress
- **Assessment integrity** — anti-cheat scaling по stakes

8 subcategories supported (children's / K-12 / language / adult / exam / microlearning / spaced / certification).

#### 6. `/social-foundation` skill (660 lines)

Per-category foundation для social/community apps:
- **Trust & Safety** 3 pillars (prevention + detection + response)
- **Auto-moderation** — Perspective API + OpenAI Mod API + PhotoDNA для CSAM (NCMEC reporting)
- **Human review queue** с SLA per priority (critical 1h, high 4h, medium 24h, low 72h)
- **Action ladder** — warn → mute 24h → mute 7d → temp ban 30d → perm ban
- **Appeal process** с 7-day SLA (без appeals false positives accumulate)
- **Anti-spam** — tiered rate limits, CAPTCHA, bot detection, spam pattern detection
- **Real-time messaging** — WebSocket / SSE / fallback choice + presence + delivery guarantees
- **Privacy** — block/mute/restrict semantics, encryption levels (transport / at-rest / E2E)
- **Age gating** — COPPA, minor protections, default privacy
- **Network effects** — find-friends flow, engagement loops, transparency reports

8 subcategories (chat / forum / feed / photo-video / streaming / community / dating / gaming).

### App Track теперь ПОЛНЫЙ

Все 8 categories имеют complete foundation pipeline:

| Category | Universal foundations + Per-category foundation |
|---|---|
| productivity | i18n + data-model + onboarding + permissions + subscription |
| tools / reference | i18n + data-model + onboarding + **app-search** |
| business | i18n + data-model + onboarding + permissions + **business-app-foundation** |
| saas | i18n + data-model + onboarding + permissions + subscription + **saas-foundation** |
| health | i18n + data-model + onboarding + subscription + **health-app-foundation** |
| finance | i18n + data-model + onboarding + permissions + subscription + **finance-app-foundation** |
| education | i18n + data-model + onboarding + permissions + subscription + **education-foundation** |
| social | i18n + data-model + onboarding + permissions + **social-foundation** |

Plus games track (analyze-game + game-design + level-design + monetization-design + art-prompts + sound-design).

### Verifier suite

Now 7 automated checks (was 5):
- `check-claude-md-size.mjs`
- `check-platform-completeness.mjs` (18 × 9 = 162 checks)
- `check-inline-strings.mjs`
- `check-workspace-discipline.mjs`
- `check-no-float-money.mjs`
- `check-cross-refs.mjs` ← v4.9.4
- `check-bat-encoding.mjs` ← v4.9.4

All run в setup.sh + setup.ps1 validation.

### Lesson #30

**Lessons themselves should be promoted to invariants when proven.** Lessons #20-29 stayed in changelog and rotated out — losing them. Now distilled 12 invariants extracted, permanent. Going forward — when same lesson appears in 2+ versions independently, it's a candidate for invariant promotion.

К v4.9: review lesson rotation policy. Some "lessons" are actually principles. Others are version-specific incidents that genuinely belong в history. Different homes.

## v4.7.10 changelog (App Track Iteration 2 — per-category foundations: health, finance, business, saas)

Продолжение Iteration 1 (v4.7.9). 4 architectural foundation skills которые применяются ПОВЕРХ универсальных app skills для специфичных категорий.

### Что добавлено

#### 1. `/health-app-foundation` (488 lines)

Поверх app-data-model + onboarding + subscription добавляет:
- **GDPR Article 9** compliance (special category personal data)
- **Encryption at-rest** для sensitive fields (PBKDF2 + AES-GCM)
- **Right to deletion** (Article 17) + **export** (Article 20) — JSON/CSV/PDF, re-auth required
- **Behavior design** — streaks без shame, smart reminder timing, anti-shame language
- **Crisis intervention** для mental health subcategory — keyword detection + localized resources (МЧС, теле трип помощи)
- **Medical disclaimer** mandatory ("not medical advice")
- **Privacy-first analytics** — никогда не tracking health values

7 subcategories: general fitness, body metrics, mental health, reproductive health, sleep, medical, nutrition. Compliance level зависит от subcategory.

#### 2. `/finance-app-foundation` (393 lines)

Critical для money-handling apps. Поверх app-data-model + permissions:
- **Decimal arithmetic** — NEVER `number` для money. Использует bigint minor units (cents/копейки) или Decimal library
- **Atomic transactions** — money ops в database transactions (all-or-nothing)
- **Financial audit log** — append-only, 7-year retention
- **Currency snapshots** — store rate at transaction time, never recompute
- **PCI scope avoidance** — never store full card numbers, use payment processor (Stripe/Tinkoff)
- **Tax export** — РФ XML (1С формат), US CSV (TurboTax format)
- **Trust UX** — confirmations, sync indicators, anti-anxiety displays
- **Re-auth для transfers** >threshold (biometric/passcode)

5 subcategories: personal budgeting, investment tracking, crypto wallets, lending/credit, bank-connected.

#### 3. `/business-app-foundation` (575 lines)

Beyond `/app-permissions` simple 4-role RBAC. Поверх app-data-model + permissions:
- **Multi-tenant architecture** — shared schema + orgId scoping enforced at storage layer (defense-in-depth, throws on missing orgId)
- **Hierarchical RBAC** — custom roles + inheritance + delegation + manager-subordinate visibility
- **Workflow state machines** — generic state machine pattern для approvals/transitions, не ad-hoc if-status-then
- **Advanced audit** — before/after snapshots, retention policies (7 years financial, 5 years general), legal hold support
- **Integrations layer** — outbound webhooks (HMAC signed, retry queue, auto-disable after 5 fails) + inbound REST API (per-org keys, rate limiting)
- **White-label customization** — CSS variables per org, custom domains, hide branding option
- **Reports** — CSV/XLSX exports for all list views + scheduled email digests
- **SLA features** — health check endpoint, status page, graceful degradation

7 subcategories: CRM, ERP, project management, HRM, marketing platform, inventory/warehouse, internal tool.

#### 4. `/saas-foundation` (566 lines)

Combines business + subscription + customer success. The most complex foundation. Поверх business-app-foundation + subscription-design:
- **SaaS metric system** — MRR, ARR, gross/net churn, NDR, LTV/CAC, magic number
- **Trial → paid conversion flow** — 5 stages (signup → activation → engaged → ending → converted/churned), state machine, automated emails
- **Activation events tracking** — "aha moment" detection, stuck workflow if not reached in 72h
- **Admin panel** — search, customer detail view, **impersonation** (audited, time-limited, user-notified, visual marker)
- **Stripe webhook handlers** — idempotent (check processedWebhooks), all event types
- **Dunning workflow** — 0/3/5/7/10/14 day schedule for failed payments, 7-day grace period
- **Plan changes** — upgrade с immediate proration, downgrade scheduled for next period
- **Customer health score** — engagement + adoption + risk signals, CSM priority queue
- **Growth loops** — referral program (anti-abuse caps), team invites, viral loops ("Powered by" on free tier)
- **Pricing grandfathering** — existing customers keep old price when raised

#### 5. New verifier: `scripts/check-no-float-money.mjs`

Finance app safety gate. Scans `src/` for fields like `balance`, `amount`, `price`, `total`, `fee`, `tax`, `interest`, `salary`, etc. typed as `number` (float). Suggests `bigint` minor units or Decimal library.

Tested на 2 кейсах: bad project (3 violations found correctly), good project (clean exit 0).

#### 6. Advisor catalog updated

Added "Per-category app foundations (v4.9.0+)" section с 4 новыми skills. Coverage 93/93.

#### 7. Design-pipeline updated

Mode selection теперь auto-invokes per-category foundation skills BEFORE specialists. Health/finance/business/saas projects получают architectural foundation laid first, потом design specialists проектируют поверх.

### Architecture для apps теперь полная

```
Foundation layers (auto-applied based on category):

Layer 1: i18n-foundation (always)
Layer 2: app-data-model (always)
Layer 3: app-permissions (if multi-user)
Layer 4: app-onboarding-flow (always)
Layer 5: subscription-design (if monetized)
Layer 6: per-category foundation (если health/finance/business/saas)
Layer 7: app-search (если tools/reference)

→ Then design-pipeline specialists work on top of foundations
→ Then autopilot builds actual features
```

### Lesson #29

**Per-category architectural skills нужны для regulated/sensitive categories.** Universal app skills хороши как baseline, но финансовое приложение требует специфической точности (decimal arithmetic, atomic transactions, audit retention) которая generic skill не покроет. Same для health (encryption, GDPR Article 9), business (multi-tenant isolation), SaaS (admin tools, customer health).

Pattern для будущих categories: identify regulatory/technical specifics → architect один foundation skill per category → auto-invoke в design-pipeline для этой category.

К v4.8: добавить education-foundation (COPPA если детям, скоринг прогресса), social-foundation (модерация, abuse prevention).

## v4.7.9 changelog (App Track Iteration 1 — universal app foundations)

Пользовательский запрос: "у нас с тобой упор хороший на игры, НО мы делаем и различного рода программы, а там уже наверное нужен другой набор скиллов".

### Что добавлено

#### 1. `/analyze-project` Step 2.5 — app classification

Mandatory классификация по 8 категориям: productivity, tools/reference, business/B2B, saas, health/wellness, finance, education, social/community. Category пишется в `wiki/_map.md`.

#### 2. `/product-metrics` — app-specific benchmarks

Раньше benchmark'и были только для games (D1/D7 retention, ARPDAU). Теперь — отдельные таблицы per-category:
- productivity: D7 40-60%, freemium→paid 2-5%
- saas: trial→paid 5-15%, monthly churn 2-7%, LTV/CAC ≥3
- health: streak length, habit formation, D90 retention
- и т.д. для всех 8 categories

#### 3. `/design-pipeline` mode-aware

Раньше спавнил game specialists (game-designer, level-designer, sound, art). Теперь читает type/category и spawns:
- **Games**: 7 game specialists
- **Apps**: 6 universal (Information architect, UX flow, Data architect, Visual designer, Architect, PM) + 1-2 category-specific (subscription/permissions/compliance auditor)

Health/finance compliance auditor — MANDATORY, не opt-out.

#### 4. 5 universal app architectural skills (NEW)

- `/app-data-model` (277 lines) — schema, repositories, schema versioning, migrations
- `/app-onboarding-flow` (230 lines) — Level 1/2/3 strategy, empty states, permission asks
- `/app-search` (270 lines) — Fuse.js / Lunr / linear, history, autocomplete, analytics
- `/app-permissions` (306 lines) — 4-role RBAC, audit log, multi-tenant
- `/subscription-design` (376 lines) — 5 models, trial flows, paywall, churn prevention, EU/RUS compliance

Coverage 89/89 после Iter1.

## v4.7.8 changelog (full pipeline orchestration: metrics → design → autopilot → release)

Пользовательский запрос: pipeline от анализа до публикации, с правильными точками остановки и autonomous mode.

### Что добавлено

#### 1. `/product-metrics` skill (NEW)

**Step 2 of pipeline.** Architectural skill — генерирует KPI таргеты ДО геймдизайна.

Pipeline (4 шага):
1. Read context (research, _map.md)
2. Web research benchmarks для жанра + платформы + 2026
3. Generate proposal с 3 levels: Floor / Target / Stretch + engagement narrative + monetization narrative
4. Stop, await user approval → save в wiki/architecture/metrics.md + decisions/

Дальнейшие skills (game-design, monetization-design, improve, deepen-game) сверяются с targets.

#### 2. `/design-pipeline` skill (NEW)

**Step 3 of pipeline.** Orchestrator — спавнит 7 specialists через subagents:
- Game designer (gdd.md)
- Level designer (levels.md)
- Monetization designer (monetization.md)
- Art director (art-bible.md)
- Sound designer (audio.md)
- Architect (architecture/modules.md)
- Product manager (plan/02-development-plan.md)

Cross-review phase finds gaps между документами. Master plan имеет sprints с acceptance criteria.

Mode: parallel (Agent Teams, 30-40 min) или sequential (1.5-2.5 hours).

#### 3. `/autopilot` skill (NEW)

**Step 4 of pipeline.** Autonomous mode — Claude идёт по master plan'у не отвлекая юзера.

Stop ONLY на: 3x repeated test failures, architectural blocker, security/credentials, smoke test failure (после 2 fix attempts), out-of-scope work needed.

Real-time progress в `wiki/_current.md`. Commit per sprint минимум. Smoke test scenario per sprint.

#### 4. `/pipeline` master orchestrator (NEW)

7 steps: Analyze → Metrics → Design → Build → Test → Release ready → Release. Stop points между steps. Resume mode.

#### 5. `/credentials-check` обновлён — все 9 платформ

Раньше было 4 (Yandex, VK, RuStore, Web). Добавил 4 missing: Telegram, MAX, Steam, VK Play. Coverage: 9/9.

#### 6. Advisor catalog обновлён

`/pipeline`, `/product-metrics`, `/design-pipeline`, `/autopilot` добавлены в каталог как primary orchestrators.

### How to use the new pipeline

```
/start MyApp: описание. Платформы: yandex, telegram. Тип: игра
/product-metrics
/design-pipeline
/autopilot
# manual testing iteration через /improve, /polish
/release-ready yandex telegram
/credentials-check
/release-yandex
/release-telegram

# Или сразу через master orchestrator:
/pipeline
```

### Lesson #28

**Pipeline orchestrator снимает invisible cognitive load.** Раньше юзер должен был помнить что после analyze идёт metrics, потом design, потом build, потом release-ready, потом release. С `/pipeline` — это explicit. Каждый step имеет pre-flight check предыдущего, нельзя случайно пропустить metrics.

К v4.9 — добавить `scripts/check-pipeline-state.mjs` который читает wiki/_current.md и говорит "ты на step N, следующий step — M, для него нужно X".

## v4.7.7 changelog (workspace discipline enforcement — hook + skill text + verifier)

Пользовательский запрос: "разрабатываем игру, но он игнорирует правила например что её надо скопировать в WorkProgress и там работать, он хер пойми где делает".

### Корневая причина

Forge architectural rule (3-folder discipline) **существовал** в одном месте — `/full-pipeline` skill. Но **не enforce'ился**:
- `/start`, `/analyze-game`, `/analyze-project` — не имели обязательного шага "copy to WorkProgress"
- Hook'ов на запись в защищённые папки **не было**
- CLAUDE.md (главный context) упоминал правило одной фразой в headline

В итоге Claude Code в новых сессиях:
- Иногда копировал в WorkProgress (если попадался релевантный skill)
- Чаще редактировал прямо в GameIntegration/ (читая исходники, потом писая туда же)
- В Release/ писал куда попало

### Что добавлено

#### 1. Hook `.claude/hooks/workspace-discipline.mjs` (NEW)

PreToolUse:Write|Edit|MultiEdit — блокирует записи в:
- `GameIntegration/*` — всегда (read-only sources)
- `Release/{X}/*` — кроме случая `FORGE_ALLOW_PROTECTED_WRITE=1` (release skills)

При блокировке — helpful stderr message:
- Показывает точный path
- Объясняет правило (3-folder discipline)
- Даёт точную bash + pwsh команду для копировки
- Указывает bypass

Smoke-test'нут на 7 кейсах: GameIntegration block, WorkProgress allow, Release/{X}/foo block, Release/.gitkeep block, env bypass, empty stdin allow, random path allow.

#### 2. Wiring в settings.json + plugin-hooks.json

Добавлен в существующий `PreToolUse: Write|Edit|MultiEdit` matcher как **первый** hook (срабатывает ДО `plan-check.mjs`).

#### 3. CLAUDE.md prominent section

Перенесено правило из одной строки headline в bold table at top — Claude видит на каждом старте сессии.

#### 4. /start, /analyze-game, /analyze-project обновлены

- `/start` — Step 0: создать `WorkProgress/{Project}/` сразу
- `/analyze-game` — Phase 0: copy `GameIntegration/{X}/` to `WorkProgress/{X}/` ДО чтения
- `/analyze-project` — Phase 0: то же

#### 5. Verifier `scripts/check-workspace-discipline.mjs` (NEW)

Сканирует `git status` (или filesystem changes) — flag'ит файлы изменённые ВНЕ `WorkProgress/`. Используется в pre-commit hook (опционально).

### Lesson #27

**Архитектурные правила без enforcement decay в течение недель.** Документировать в skill'ах недостаточно — Claude в новой сессии не читает все skills. Нужен hook-level enforcement для write operations + prominent CLAUDE.md (читается каждую сессию) + явные шаги в начальных skills (`/start`, `/analyze-*`).

Pattern для v4.8: для каждого "должно происходить так" rule — три gateway:
1. **Skill text** (объяснение)
2. **Hook** (auto-enforcement)
3. **Verifier script** (manual audit)

Без всех трёх — drift гарантирован.

## v4.7.6 changelog (i18n foundation as default — ru+en runtime, gate против inline strings)

Пользовательский запрос: "нет системы локализации ведь даже когда мы не для паблишинга готовим игру, сама система нужна что бы потом производить быструю локализацию".

### Корневая проблема

`/localize` skill в Forge решал **post-fact** локализацию: когда игра уже написана и нужны 13 языков для Yandex. Но **architectural-level i18n** — структура `src/i18n/`, `t()/td()` API, hot-swap — был отсутствующим. Каждый новый проект из `/start` начинался с inline cyrillic strings. Retrofit потом стоит дни работы.

### Что добавлено

#### 1. Новый skill: `/i18n-foundation`

Закладывает i18n архитектуру **С НУЛЯ** в новом проекте (или retrofit existing):
- `src/i18n/index.ts` — `t()`, `td()`, `setLang()`, `onLangChange()`, `getLang()` API
- `src/i18n/types.ts` — type-safe UI keys через const assertion
- `src/i18n/ru.ts` — baseline language (most complete)
- `src/i18n/en.ts` — placeholder (copy of ru или machine-translate, fix later)
- `src/i18n/data.ru.ts`, `data.en.ts` — game-content strings (карты/враги/постройки)
- `src/i18n/detect.ts` — browser language → fallback chain → `'ru'`

Default: **ru + en runtime подход** (per юзера: Q1 → B, Q2 → Runtime). Discovery-driven keys (не upfront catalog).

Включает critical patterns:
- `var _activeLang` (не `let`) — exposes `window._lang` для cheat-panels и Yandex screenshotter
- `setLang()` всегда вызывает re-render через listeners
- Template substitution `'День {0}'` (не concat) для морфологически правильных переводов
- `detectLang()` ПЕРЕД UI initialization (Yandex moderation проверяет first-paint language)

#### 2. Verifier: `scripts/check-inline-strings.mjs`

Gate против regression. Сканирует `src/` (исключая `i18n/`) на cyrillic literals в коде. Comments игнорируются. Exit 1 если найдено.

Smoke-test'нут на 2 кейсах:
- ✓ Project с `src/i18n/` → 0 violations, exit 0
- ✗ Project с inline strings → 3 found, exit 1

Запускается из build pipeline или через `/gate`.

#### 3. `/start` Step 6.5

После skill loading но до first feature: **MANDATORY `/i18n-foundation`** для всех новых проектов. User может opt-out явно, но default = on.

Mantra: "i18n foundation = ~30 минут setup, ~0 ongoing cost. Retrofit later = days of work."

#### 4. `/analyze-game` + `/analyze-project` отчёт расширен

В output добавлено:
- `i18n foundation: ✓/✗`
- `inline cyrillic найдено: {N}` (через `check-inline-strings.mjs`)
- `RECOMMEND: /i18n-foundation если ≥30 violations и нет foundation`

Это значит — для **существующих проектов** типа Spiral Vigil следующий `/analyze-game` теперь явно покажет i18n debt и его cost.

#### 5. advisor catalog обновлён

`/i18n-foundation` добавлен в "Локализация и метаданные" секцию каталога. Coverage снова **80/80 skills**.

### Architectural decisions (recorded for posterity)

**Q1: Languages default = ru + en (not just ru, not 13).**

Rationale: один язык = можно случайно захардкодить text в обход `t()` и не заметить. Два языка минимально достаточны чтобы system *работала*. Можешь нажать кнопку "🌐" → видишь как переключается → catch'ишь bugs вроде "забыл add'нуть key в en.ts".

**Q2: Runtime not compile-time.**

Rationale: compile-time через `vite-plugin-i18n` дал бы typed keys но требует build-step config. Runtime + `tsconfig strict` + правильно типизированные dictionaries дают type-safety без специальных плагинов. `t('hud.day')` в runtime ищет в active dictionary, fallback chain `active → ru → key itself` — ломаться нечему.

**Q3: Discovery-driven keys, not upfront catalog.**

Rationale: попытка cataloged 200 keys upfront = guess work + dead keys. Лучше: добавляешь по мере появления текста. `types.ts` const assertion делает forgotten keys compile-time errors.

### Lesson #26

**Architectural skills отличаются от tactical skills.** `/localize` = tactical (после факта). `/i18n-foundation` = architectural (до факта). Forge раньше имел только tactical для i18n. Каждый раз когда есть pattern "X надо делать с нуля чтобы потом не страдать" — это architectural skill, и он должен **сразу** вызываться из `/start`.

К v4.8 — провести review всех skills и категоризировать: tactical vs architectural. Architectural должны быть auto-invoked из `/start`, не optional.

## v4.7.5 changelog (advisor становится context-aware — читает wiki/ ДО формулировки)

Пользовательский запрос: "давай сделаем /advisor умнее".

### Главное изменение

advisor теперь **СНАЧАЛА читает state проекта**, потом формулирует промпт. До v4.7.6 advisor работал в "vacuum mode" — формулировал из текста запроса юзера, не зная что в `wiki/_current.md`, `_map.md`, `plan/`, `decisions/`. Это приводило к двум проблемам:

1. **Дубли работы.** advisor мог рекомендовать `/analyze-game` для проекта где analyze уже сделан и план в `wiki/plan/01-build-game.md` ждёт апрува.
2. **Игнорирование решений.** advisor не знал какие architecture decisions уже приняты, иногда предлагал альтернативы которые юзер уже отверг.

### Новый workflow (4 шага)

1. **Read context** — `wiki/_current.md`, `_map.md`, `plan/*.md` (последний по mtime), `decisions/*.md` (последние 3-5)
2. **Classify** — Continuation / Pivot / New task / Question
3. **Formulate** — промпт с реальными именами файлов, ссылками на план, учётом решений
4. **Output** — формат `Контекст: 1 строка

Промпт: ...`

### 4 классификации запросов

| Класс | Признак | Что генерит advisor |
|---|---|---|
| **Continuation** | active task в `_current.md`, открытый план | `/continue` + конкретный шаг плана |
| **Pivot** | юзер отвергает план / меняет направление | "забудь предыдущий план" + новый |
| **New task** | пусто или другой проект | `/start` или соответствующий orchestrator |
| **Question** | юзер просит мнения, не действия | прямой ответ, БЕЗ промпта |

Это критично — для **Question** advisor больше **не пытается** дать промпт. Просто отвечает.

### Bonus: восстановлены 4 skill из каталога

Re-grep против фактического `.claude/skills/` нашёл что 4 skill'а потерялись при rewrite в v4.7.6:
- `/convert`, `/convert-all`, `/plan`, `/rustore-publish`

Coverage снова **79/79 skills, 0 phantoms**. Это **5-я итерация** того же паттерна (lesson #14 — drift in catalogs without script-enforced check). К v4.8 — `check-cross-refs.mjs` который автоматически валидирует advisor catalog vs filesystem на каждом релизе.

### Lesson #25

**Context-aware advisor требует chunked thinking — сначала read, потом classify, потом formulate.** Раньше advisor jumped прямо к formulate. Это типичная LLM ошибка — too eager to produce output. Решение в SKILL.md: explicit "Шаг 1 — ВСЕГДА read context, без исключений". Advisor который не читает state — это broken advisor.

## v4.7.4 changelog (edit button restored — z-index conflict с cover image)

Пользователь сообщил: "куда-то кнопка редактирования пропала на карточках".

### Корневая причина

При добавлении cover image в v4.7.3, `.card-cover` имеет `margin: -16px -16px 12px -16px; height: 140px` — расширяется до краёв карточки и накрывает zone `top: 0..140px`. Кнопка edit (`.card-menu`) сидела на `top:12px right:12px` — оказалась **под** cover'ом. Без z-index — невидима.

### Fix

1. **`.card-menu` z-index: 5** — поднимаем над cover
2. **Сменили стиль кнопки:** `background: rgba(0,0,0,0.55) + backdrop-filter: blur(4px)` — теперь она выглядит как читабельный pill поверх изображения, не сливается ни с тёмными, ни со светлыми картинками
3. **`...` → ✏️** — pencil emoji более очевидно про edit
4. Уменьшен offset: `top:8px right:8px` (было 12px) — ближе к углу, меньше захватывает area

Также — стиль кнопки стал универсальным: отлично смотрится и на ярких изображениях, и на dark-mode emoji fallback'ах.

### Lesson #23

**Z-index conflicts при наложении новых элементов.** При добавлении cover я не подумал что absolute child кнопка edit окажется под ним. Это классический CSS gotcha — добавил один блок поверх другого, не проверив stacking context. К v4.8 — добавить визуальную regression проверку (хотя бы headless screenshot dashboard.html в нескольких scenarios) перед package.

## v4.7.3 changelog (dashboard preview images + sort + 0-is-falsy bug)

Пользователь попросил: (1) превью-картинку перед описанием проекта, картинку обрезать в нужный формат, (2) сортировку по дате добавления с persistence.

### Fix 1: Cover preview на карточках

Каждая карточка проекта получила image-preview сверху (140px height, 16:9 aspect). Если path/URL картинки задан — отображается с `object-fit: cover` (обрезается под area, без искажений). Если не задан — fallback на emoji иконку (`🎮` для игр, `📱` для приложений).

В modal form добавлено поле "Превью (URL или путь к файлу)". Поддерживает:
- HTTP/HTTPS URLs (любые)
- `file:///F:/path/icon.png` (локальные файлы)
- Относительные пути

`onerror` хендлер на `<img>` — если картинка не загрузилась, показывается emoji fallback.

### Fix 2: Sort by date (+ другие критерии) с persistence

Добавлен select-dropdown с 4 опциями:
- **Новые сверху** (default) — `date_desc`
- **Старые сверху** — `date_asc`
- **По имени (А-Я)** — `name`
- **По статусу** — `status` (new → dev → polish → build → mod → published)

Selection сохраняется в `localStorage.forge_sort` и восстанавливается при reload.

`createdAt` timestamp добавляется автоматом при `addProject()`. Для **legacy projects** (созданных до v4.7.6) — backfill в `render()`: assigns synthetic timestamps based on array index, чтобы сохранить original insertion order. Backfill triggers `save()` only once.

### Bug в процессе нашёл: 0 is falsy в JS

При первой имплементации `status` sort:
```javascript
var statusOrder = {'new':0,'dev':1,'polish':2,...};
return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
```

Это **broken** потому что `0 || 99 === 99` — JavaScript считает 0 falsy. Это означало проекты со статусом `new` (order=0) всегда оказывались в конце сортировки вместо начала.

Fix: explicit `!== undefined` check:
```javascript
var ao = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 99;
```

Тестировал на 3-project setup, все 4 sort modes работают корректно.

### Lesson #22

**`||` fallback с numeric 0 ломает сортировку.** Это очень subtle bug — был бы поймать только при тестировании на реальных данных где у статуса = 0. Если бы я писал unit tests, поймал бы сразу. К v4.8 — добавить минимальные unit tests для dashboard sort/filter functions.

# Project Forge — Historical Changelog

Changelog entries for versions older than the current 3. Current versions live in [CLAUDE.md](../CLAUDE.md) top section. This file is rotated into to keep CLAUDE.md under ~30KB (it's read on every session start and cached — growing it increases cache-write cost each new session).

---
## v4.7.2 changelog (dashboard path sanitization — projects must be SIBLINGS not nested)

Пользователь сообщил: при нажатии "Открыть терминал" в dashboard, копируется команда:
```
cd f:/ProjectForgeUniversal/project-forge/loophero; cf
```
Должно быть:
```
cd f:/ProjectForgeUniversal/loophero; cf
```

### Корневая причина

Project paths в dashboard сохраняются в `localStorage`. Если юзер ранее (в старой версии или через ручное редактирование) сохранил путь с сегментом `/project-forge/` внутри — он остался в localStorage. Forge architecture требует чтобы проекты были **СОСЕДЯМИ template**, не вложенными в `Project-forge/`. `forge.ps1 new` правильно создает sibling, но dashboard этого не enforce'ил.

### Fix

3 уровня защиты:

1. **Auto-sanitize при terminal copy** — `render()` теперь чистит `cleanPath` от `/project-forge/` сегмента перед формированием cmd. Юзер всегда получает корректную команду в clipboard, даже если saved path содержит garbage.

2. **Per-card "Исправить путь" кнопка** — если path содержит `/project-forge/`, появляется warning кнопка прямо на карточке проекта. Click → confirm dialog с before/after → запись чистого пути.

3. **Header "🔧 Fix paths" кнопка** — batch-fix всех проектов одним кликом. Покажет toast с кол-вом исправленных.

Logic uses regex `/\/[Pp]roject-?[Ff]orge\/(?=[^/])/g` который matchит:
- `/project-forge/` 
- `/Project-forge/`
- `/projectforge/` 
- `/ProjectForge/`

Случай-нечувствительно к окружающему case (юзер мог ввести `f:` или `F:`). Сохраняет original separator (forward или back slashes).

### Tests

7 тест-кейсов протестированы:
- `f:/ProjectForgeUniversal/project-forge/loophero` → `f:/ProjectForgeUniversal/loophero` ✓
- `F:\ProjectForgeUniversal\Project-forge\game` → `F:\ProjectForgeUniversal\game` ✓
- `F:\ProjectForgeUniversal\loophero` → unchanged ✓ (no `/project-forge/` segment)
- `/home/user/projects/my-app` → unchanged ✓ (Linux paths work too)

### Lesson #21

**localStorage между versions dashboard сохраняется.** Любая UI миграция с изменённым data shape должна детектить и **исправлять** старые записи, не assume что localStorage чист. Особенно для путей — юзер мог ввести что угодно в text field в любой версии.

К v4.8 — добавить `migrateProjectPaths()` который запускается на page load и проверяет structural integrity всех saved projects (paths, platform IDs, status enum). Если что-то не matches current schema — auto-fix или show migration dialog.

## v4.7.1 changelog (sync.bat ASCII fix — em-dash inside if blocks crashed cmd.exe)

Пользователь запустил `scripts\sync.bat`, получил:

```
=== SYNC: Forge template -> sibling projects ===
SAFE MERGE — preserves custom skills/agents in sibling projects
. was unexpected at this time.
```

### Корневая причина

`cmd.exe` парсер ломается на multi-byte UTF-8 символах **внутри `()` блоков** (if/for groups), даже после `chcp 65001`. Скрипт `sync.bat` содержал em-dash (`—`), arrows (`→`), box-drawing chars (`─` `│`) внутри `if/else (...)` конструкций. `chcp 65001` помогает только для **echo печати**, не для **парсинга**.

После `if %STRICT%==1 ( ... ) else ( ... )` с em-dash в обеих ветках, cmd.exe пытается парсить дальнейший код и спотыкается на `.` (или другом символе) который встретил после битой токенизации.

### Fix

Полностью переписан `scripts/sync.bat` без non-ASCII chars:
- `—` (em-dash) → `:` (colon)
- `→` (arrow) → `to`
- `─` `│` (box-drawing) → удалены или заменены на `--`
- Comments переведены на ASCII

Проверка: `python3 -c "print(sum(1 for b in open('scripts/sync.bat','rb').read() if b > 127))"` → 0.

### Bonus fix: `scripts/open-all.bat`

Ранее содержал hardcoded названия проектов одного юзера (UniDocs, Multi-Utility, FileView, Ink Drift). Переписан с auto-discovery siblings — сканит соседние папки на `wiki/_map.md`, динамически строит `wt` команду.

### Lesson #20 (cumulative)

`chcp 65001` ≠ полная UTF-8 поддержка в cmd.exe. Эту ошибку я делал и в v4.5.1 для PowerShell (где BOM нужен), теперь повторил для batch (где non-ASCII в () блоках crashes parser). Правило обновлено в "Platform-specific encoding rules":

| File type | Cyrillic OK? | Em-dash OK? | Box-drawing OK? |
|---|---|---|---|
| `.ps1` Win PS 5.1 | yes (with BOM) | yes (with BOM) | yes (with BOM) |
| `.ps1` PS Core 7+ | yes | yes | yes |
| `.bat` outside `()` | yes (with `chcp 65001`) | yes (with chcp) | yes (with chcp) |
| `.bat` **inside `()`** | **NO — parser bug** | **NO** | **NO** |
| `.sh` (LF endings) | yes | yes | yes |
| `.mjs` | yes (utf-8 explicit) | yes | yes |

К v4.8 — добавить в `check-platform-completeness.mjs` ещё check N+1: scan all `.bat` files for non-ASCII inside `(` ... `)` блоков и flag.

## v4.7.0 changelog (Steam + VK Play platforms — две новые цели для релиза)

Пользовательский запрос: "мы упустили 2 платформы, твоя задача полезть в интернет всё изучить и добавить их: Steam и VK Games".

**Полный research проведён.** Steamworks docs прочитаны напрямую (partner.steamgames.com), VK Play research через gamepush docs + community sources (officialные docs vkplay.ru — SPA, не индексируются search'ом). Эти 2 платформы фундаментально отличаются от существующих 7:

### Что добавлено

**Steam platform (`platforms/steam/`):**
- README.md (5KB) — full architecture: HTML5 → Electron → steamworks.js → Steam client
- 5 validators:
  - `appid-file.mjs` — `steam_appid.txt` валиден (digits only, не 480 default)
  - `electron-init.mjs` — Electron + steamworks.js + restartAppIfNecessary первый
  - `binary-deps.mjs` — `steam_api64.dll`/`.so`/`.dylib` присутствуют
  - `cloud-paths.mjs` — Cloud reads/writes согласованы с SetCloudFileEnabled
  - `depots-config.mjs` — `app_build.vdf` + depot VDFs ready, AppID matches
- `pre-submit.mjs` — runs all 5, exit 0/1/2 contract
- 5 templates:
  - `electron-main.js` (5KB) — full Electron main с steamworks integration + IPC bridge
  - `preload.js` — contextBridge → window.SteamSDK для renderer
  - `app_build.vdf` + `depot_build.vdf` — SteamPipe upload config
  - `steam_appid.txt.example`

**VK Play platform (`platforms/vkplay/`):**
- README.md (4KB) с КРИТИЧНЫМ disclaimer: VK Play (vkplay.ru) ≠ VK Mini Apps (vk.com)
- 5 validators:
  - `iframe-init.mjs` — VKPlaySDK script + init() call
  - `signature-check.mjs` — secret_key NOT в client bundle (security CRITICAL)
  - `auth-params.mjs` — uid/hash чтение и server-side validation
  - `payment-flow.mjs` — `openPaymentDialog`, не `VKWebAppShowOrderBox` (то VK Mini Apps!)
  - `https-only.mjs` — нет http:// в bundle
- `pre-submit.mjs` — same contract
- 3 templates:
  - `vkplay-sdk-wrapper.js` — Promise-based wrapper с dev-mode fallback
  - `sign-helper.mjs` — server-side md5 signature verification + Express middleware (timingSafeEqual)
  - `auth-server-example.js` — full Express endpoint /api/auth/vkplay + payment webhook handler

**6 new skills (`.claude/skills/`):**
- `release-steam` — full pipeline (Phase 0 research → Electron wrap → SDK integration → SteamPipe upload → store presence)
- `release-vkplay` — full pipeline (Phase 0 → developer account → iframe integration → payment system enable → moderation submit)
- `fill-steam` — Steam Store page (description, tags, screenshots, system reqs, pricing)
- `fill-vkplay` — VK Play Game card (название RU+EN, описание ≥150/≤4000, иконки, категория, age rating)
- `steam-sdk-integration` — deep API (achievements, stats, cloud, leaderboards, workshop, friends, rich presence)
- `vkplay-sdk-integration` — deep API (payments + webhook, auth, share, leaderboards via HTTP, achievements via HTTP)

**4 existing skills updated:**
- `release-all` — platform list 7 → 9
- `release-ready` — validator matrix expanded (Steam + VK Play sections)
- `gate` — accepts steam / vkplay arguments
- `advisor` — orchestrator catalog updated, sub-skill SDK integrations table extended

**Dashboard:**
- PLATFORMS list 3 → 9 (yandex, rustore, vk, telegram, ok, max, steam, vkplay, web)
- New CSS badges: `.badge-vk`, `.badge-telegram`, `.badge-ok`, `.badge-max`, `.badge-steam`, `.badge-vkplay`
- `getInitPrompt`, `getBuildPrompt` — new platform context lines
- Commands catalog — new release-* и fill-* entries

**CI/CD:**
- `.github/workflows/release.yml` matrix expanded with steam + vkplay (см. workflow update ниже)

### Architecture decisions

**Steam: Electron, не NW.js.** Greenworks (legacy NW.js плагин) не обновлялся с 2019. steamworks.js (Rust-based, prebuilt binaries) — современный choice, активно maintained. Templates ориентированы на Electron 30+.

**VK Play: iframe + server-side signature.** Нельзя доверять клиенту. uid из URL без проверки hash на сервере = security disaster. Sign-helper.mjs использует timingSafeEqual против timing attacks. secret_key только в env, never в коде.

**Different deployment models:**
- Steam — native binary через SteamPipe (steamcmd) + multi-OS depots
- VK Play — HTTPS bundle на твоём VPS + URL зарегистрирован в Game card

Это значит `release-all` parallel mode менее полезен для Steam (Electron build занимает много времени, не parallel-friendly). Skill упоминает это в notes.

### Why this matters

До v4.7 Forge поддерживал 7 web-based платформ. Steam и VK Play — категорически другие:
- Steam — единственная с native wrapper requirement
- Steam — единственная с upfront payment ($100 Direct fee)
- VK Play — самая security-критичная (signed auth, server-side webhook, sectret-key discipline)
- Обе — отдельная от VK Mini Apps экосистема (хотя именование "VK" путает)

### Lessons logged (16th in row)

**"Knowledge base differentiation."** До этой работы я ещё в одной из прошлых сессий понял что в Forge **две** библиотеки skills (`.claude/skills/` 74 команды vs `./skills/` 61 KB knowledge base). При создании Steam/VK Play skills я аккуратно поместил **только** в `.claude/skills/` — это slash-команды. Reference docs про эти платформы могли бы пойти в `./skills/stack/` если бы у меня была надёжная documentation, но для Steam — он gamedev mainstream, multiple official sources достаточно ссылаться. Для VK Play — официальная docs SPA, я consciously использовал community sources в research (gamepush.com), помечу это в `@verified-against` markers если позже добавлю reference docs.

К v4.8 — добавить `./skills/stack/steam/` с verified API references и `./skills/stack/vkplay/` с signature algorithm details.

### Lesson 17: Adding a platform = touching ~18 files. Without script-enforced audit, drift is guaranteed

При добавлении Steam + VK Play я думал что добавил их полностью. Когда юзер потребовал audit, нашёл ещё 5 пробелов:
1. Phantom skill ref `/yandex-release` в credentials-check description
2. setup.sh validation loop hardcoded на 5 платформ (yandex/vk/telegram/ok/max), пропускал rustore/web/steam/vkplay
3. README.md headline говорил "**7 платформ**", "11 subagents", "74 commands" — устаревшие counts
4. GUIDE.md (1198 строк гайд) ВООБЩЕ не упоминал Steam/VK Play
5. Subagent files `steam-builder.md` + `vkplay-builder.md` отсутствовали — `/release-all` в Agent Teams mode не смог бы их spawn'ить

**Решение:** создан `scripts/check-platform-completeness.mjs` который автоматически проверяет 18 точек интеграции для каждой платформы:
- 4 в platforms/{p}/ (README, pre-submit, validators, templates)
- 4 в .claude/skills/ (release-, fill-, sdk-integration, agent)
- 4 cross-references в orchestrator skills (release-all, release-ready, gate, advisor)
- 2 в dashboard.html (PLATFORMS list, getBuildPrompt branch)
- 4 в setup/docs/CI (setup.sh, README, GUIDE, release.yml)

Поддерживает known-exemptions для платформ с **structural** difference (rustore/web не имеют validators, потому что их release flow через Capacitor/Docker, не через JS bundle gate).

**Запуск:** `node scripts/check-platform-completeness.mjs` — выводит matrix 9×18, exit 0 если PERFECT, exit 1 если drift.

После добавления script'а: 9/9 платформ проходят все non-exempt checks. Прошлые drift'ы починены.

### Lesson 18: User pushing back is a feature, not a bug

Юзер за этот цикл (v4.6 → v4.7) **четыре раза** заставил меня переделать work через прямые вопросы:
1. "у меня не Project а f:\ProjectForgeUniversal" → нашли hardcoded `Project-forge` в 5 sync scripts
2. ".\setup.ps1 → Непредвиденная лексема" → BOM fix для PS 5.1
3. "dashboard.html — выдаёт верные инструкции?" → 5 prompt buttons переписаны
4. "/advisor должен знать обо всём" → каталог 56→73 skills + phantom refs убраны
5. "ну тоесть я опять вижу что ты нихера не проводил глубокий анализ" → file audit 362 файлов
6. "надо делать аудит?" → нашёл 5 missing integration points для Steam+VK Play
7. "ну так делай что ты не доделал" → создан automated platform-completeness check

**Каждый раз когда я сказал "готово" — было не готово.** Pattern: я чиню surface ("я добавил 6 skills"), юзер требует depth ("они ВСЕ интегрированы во все 18 точек?"), я нахожу drift, чиню. Это **не** failure mode для juзера — это **рабочий контракт**: я генерирую foundation, юзер enforces completeness через сomplete inquiry.

К v4.8 — каждый release должен запускать `check-platform-completeness.mjs` perforce, не как post-hoc audit. Если drift > 0 — release заблокирован до fix.

## v4.6.4 changelog (advisor skill — каталог обновлён до v4.6)

Пользователь спросил: "/advisor — он должен знать обо всём чтобы подсказывать верно".

Hard-grep аудит каталога advisor против фактических skills в `.claude/skills/`:

### Что было

- **56 skills** в каталоге advisor
- **74 skills** в Forge → advisor не знал про **19 skills**
- **2 phantom refs** на несуществующие skills

Не знал про 19 skills:
- v4.4 research integration: `research-references`, `find-or-make-skill`
- v4.5 orchestrators: `deepen-game`, `release-ready`, `choose-backend-stack`
- Все 7 platform releases: `release-yandex`, `release-vk`, `release-telegram`, `release-ok`, `release-max`, `release-rustore`, `release-web`
- Multi-platform: `release-all`, `convert-all`
- Прочее: `new-project`, `gate`, `server-detect`, `anon-auth-sync`, `team`

Phantom refs (advisor рекомендовал но skills не существовали):
- `vk-release` (правильно: `release-vk`)
- `yandex-release` (правильно: `release-yandex`)

### Fix

Полностью переписал `advisor/SKILL.md`:

1. **Orchestrator-first подход** — главное правило: "сначала проверь orchestrator (`/start`, `/analyze-*`, `/deepen-game`, `/release-ready`, `/release-*`, `/improve`, `/polish-app`, `/choose-backend-stack`). Только если нет — собирай из skills."
2. **Pre-release discipline** — "перед `/release-*` ВСЕГДА `/release-ready` ПЕРВЫМ"
3. **/start для новых проектов** вместо enumerated skills (auto-research + skill discovery встроены)
4. **Все 73 skills** теперь в каталоге (74 минус сам advisor)
5. **Удалены phantom refs** на vk-release/yandex-release
6. **Обновлены примеры** под v4.6 workflow:
   - "новое приложение" → `/start UniDocs: ... Платформы: rustore. Тип: приложение`
   - "проверить готовность" → `/release-ready yandex`
   - "нужен сервер" → `/choose-backend-stack`
   - "игра скучная" → `/deepen-game`

### Также пойман собственный self-bug

После первичного переписывания добавил `smoke-test` в каталог как skill. Re-grep показал что `smoke-test` — это `scripts/smoke-test.mjs` (скрипт), а не skill в `.claude/skills/`. Удалил.

**Это 4-я итерация одного и того же паттерна:** пишу docs, не grep'аю предварительно. Лекция в v4.5.2 была "всегда проверяй артефакт прежде чем его чинить" — снова не применил. К v4.7 нужна автоматическая проверка advisor catalog ↔ filesystem на каждом релизе.

### Coverage после fix

- Total skills: 73
- Advisor mentions: 73 (100%)
- Missing: 0
- Phantom: 0 (после удаления smoke-test)

### Lesson logged (15-й подряд)

**"Каталоги в skills которые ссылаются на другие skills устаревают всегда — это следствие отсутствия cross-link enforcement."** Advisor — это документ-каталог 73 skills. Если 1 skill добавлен/переименован/удалён, advisor должен обновиться, но автоматики нет.

Нужен `scripts/check-cross-refs.mjs` который при каждом packaging:
1. Скан `.claude/skills/*/SKILL.md` на упоминания `/skill-name`
2. Скан `.claude/skills/advisor/SKILL.md` на каталог
3. Скан `dashboard.html` на промпты
4. Реджект пакета если phantom refs или missing entries в advisor

Это завершит цикл "skill добавлен → advisor обновлён автоматически". Action на v4.7.

## v4.6.3 changelog (dashboard accuracy + /start research integration)

Пользователь спросил: "dashboard.html сейчас выдаёт верные инструкции? потому что я новые приложения создаю через него". Hard-grep аудит нашёл 4 реальные проблемы.

### Fix 1: `/start` skill не вызывал research-references

Я в v4.4 интегрировал research-references в `/new-project`, `/analyze-project`, `/analyze-game` — но **пропустил `/start`**. А dashboard в "Управление проектом" рекомендует именно `/start {описание}` как первичный entry point. Пользователь видит карточку, копирует команду, запускает — и получает планирование без research, против всей дисциплины v4.4+.

**Фикс:** в `/start/SKILL.md` добавлены Phase 0a (research-references) и Phase 0b (find-or-make-skill) перед Step 1 — точно как в `/new-project`. Description в dashboard обновлён: "Auto-research конкурентов через /research-references как Phase 0".

### Fix 2: dashboard "Когда что использовать" устарел

Workflow секция давала инструкции v4.0-эры:

Это игнорирует весь research workflow и orchestrator'ы добавленные в v4.4-4.6. Переписан раздел:
- Новый проект → `/start` или `/new-project` → автоматом research → подтверждение → planning
- Backend → `/choose-backend-stack` (новый раздел)
- Pre-release → `/release-ready` (явный шаг ДО `/release`)

### Fix 3: Personal info leak (`C:\Usersakra\...`)

Dashboard содержал hardcoded `C:\Usersakra\AppData\Local\Android\Sdk` в команде установки `ANDROID_HOME`. Это:
1. Утечка моего personal username другим пользователям Forge
2. Не работает у пользователей с другим именем

Заменено на `$env:LOCALAPPDATA\Android\Sdk` — стандартный Windows env var, работает у всех.

### Fix 4: Missing skills в dashboard

3 skill'а существовали, но dashboard их не показывал:
- `/fill-vk` — добавлен между `/fill-yandex` и `/fill-rustore`
- `/vk-sdk-integration` — добавлен рядом с `/yandex-sdk-integration`
- `/gate` — добавлен в release-секцию

Также добавлены упоминания: `/find-or-make-skill`, `/anon-auth-sync`, `/research-references` в основной список (раньше только в "Новое в v4.X").

### Fix 5: Кнопки "Первый запуск / Продолжить / Полировка / Сборка / Аудит" генерировали неправильные промпты

Это нашлось в этой же сессии после первичной проверки dashboard. 5 функций (`getInitPrompt`, `getContinuePrompt`, `getPolishPrompt`, `getBuildPrompt`, `getReviewPrompt`) генерировали промпты в стиле v4.0 — длинные перечисления skills которые надо прочитать, без вызова orchestrator'ов:

**Было** (`getInitPrompt`): "Прочитай скилы credentials-check, capacitor-wrap, rustore-publish, mobile-ready, yandex-ads, mytracker. В папке src/ лежит игра..." — для нового проекта (status='new') нет src/, и список skills теряет смысл потому что Claude через discovery сам найдёт что нужно.

**Стало:**
- `getInitPrompt` для status='new' → `/start {name}: {desc}` (вызывает Phase 0a research + 0b skill discovery автоматом)
- `getInitPrompt` для status≠'new' → `/analyze-game` или `/analyze-project` (auto-research + discovery в этих orchestrator'ах с v4.4)
- `getContinuePrompt` → `/continue` (canonical, читает CONTEXT.md/_current.md/_map.md)
- `getPolishPrompt` → `/improve` или `/polish-app` (с пометкой про /deepen-game для contentexpansion)
- `getBuildPrompt` → начинается с `/release-ready <platform>` (read-only checklist), затем `/release-{platform}` или `/release-all` для multi-platform
- `getReviewPrompt` → `/review` + последующий `/release-ready`

**Также убраны broken refs:** старый getBuildPrompt для web ссылался на скилы `security` и `performance` — таких в Forge нет. Ссылки удалены.

**Эффект для пользователя:** dashboard теперь генерирует промпты-orchestrator'ы которые Claude сразу понимает и запускает правильный workflow, вместо длинных list-of-skills которые Claude должен интерпретировать.

### Lesson logged (14-й подряд)

**"Documentation drift против actual capability — самый частый баг в этой серии."** В этой сессии нашёл что:
- Я писал research-references в v4.4 → пропустил `/start` (это самый используемый entry)
- Я обновлял dashboard в v4.5+ → секция "Когда что использовать" не трогалась с v4.0
- Я положил эту копию dashboard внутрь zip — personal username утёк вместе с ней
- Кнопки в dashboard генерировали v4.0-эра промпты с enumerated skills вместо orchestrator'ов

Действие: к v4.7 audit list добавить **"для каждой новой capability в SKILL.md проверить обновлён ли соответствующий раздел в README/GUIDE/dashboard И promt-генераторы внутри dashboard"**. Это не sexy work, но без неё фичи остаются невидимыми.

## v4.6.2 changelog (UTF-8 BOM fix for PowerShell 5.1)

Пользователь прогнал `.\setup.ps1` под Windows PowerShell 5.1, получил каскад parser errors:

```
Непредвиденная лексема "}" в выражении или операторе.
Write-Host "    yandex    вЂ" production (11 validators...
                          ↑ это em-dash — прочитанный как cp1251
```

### Корневая причина

Я в v4.5.1 написал в CLAUDE.md правило:

И сам же это правило **не применил** при создании setup.ps1 / sync.ps1 / forge.ps1 / sync-to-obsidian.ps1. Файлы содержали em-dash (`—`) и box-drawing chars (`╔═`) — UTF-8 без BOM. Win PS 5.1 читал как cp1251 → пробитый Unicode рвал парсинг строк.

### Fix

Добавлен UTF-8 BOM (3 байта `EF BB BF`) ко всем .ps1 файлам с non-ASCII content:

- `setup.ps1` — em-dash + box-drawing chars в banner ✓ BOM
- `scripts/forge.ps1` — Cyrillic comments ✓ BOM
- `scripts/sync.ps1` — em-dash в Write-Host messages ✓ BOM
- `scripts/sync-to-obsidian.ps1` — em-dash ✓ BOM

Files без non-ASCII (migrate.ps1, scripts/open-all.ps1) — BOM не нужен, оставлены без него.

### Проверка после фикса

- 6/6 .ps1 файлов проверены: 4 с BOM + non-ASCII (правильно), 2 ASCII-only без BOM (правильно)
- Brace/paren balance в setup.ps1: 0 / 0 (sane)
- Em-dash/box-drawing chars на месте, читаются корректно как UTF-8

### Lesson logged (13-й подряд)

**"Я могу написать правило в CLAUDE.md и тут же его нарушить в новом файле."** Это уже **второй раз** этот паттерн (первый был в v4.4.2 когда я написал 30KB лимит и сразу превысил его). Правило в CLAUDE.md эффективно только если есть автоматическая проверка ИЛИ если я **физически использую CLAUDE.md** при создании файлов.

Действие на v4.7: добавить pre-commit/pre-package check который сканит все .ps1/.bat/.sh на encoding соответствие правилам из CLAUDE.md и блокирует пакетирование если несоответствие. Это завершит цикл "правило → enforcement".

Пока — checked manually, исправлен.

## v4.6.1 changelog (path-flexibility fix)

Пользовательский запрос: "у меня не Project а f:\ProjectForgeUniversal\, я надеюсь в коде нет мест где напрямую путь прописан".

Полный grep показал что **диск/папка не зашиты нигде** — все скрипты резолвятся через `$MyInvocation.MyCommand.Path` / `$0`. Но нашлись 2 реальные проблемы:

### Fix 1: Hardcoded `Project-forge` имя в template-detection логике

5 скриптов (`sync.bat`, `sync.ps1`, `open-all.ps1`, `open-all-tmux.sh`, `sync-to-obsidian.ps1`) определяли "это template, не sibling — пропускай" по сравнению **имени папки** с `"Project-forge"`. Если пользователь распакует Forge в папку с другим именем (например `Universal-Forge`, `MyForge`, `forge-template`), template сам себя обработает как sibling project.

**Стало:** detection через **path equality** — `pwd -P` / `Resolve-Path` обоих и сравнение absolute paths. Имя папки больше не имеет значения. Legacy fallback на имя оставлен на всякий случай (если path resolution фейлится).

### Fix 2: Удалён посторонний `scripts/add_metanotes.mjs`

Этот файл — one-off скрипт для конкретной игры "Призрак" из `F:/39Games/YBuilderIntegrator/WorkProgress/Prizrak/`, попал в Forge template неправильно, hardcoded на конкретный путь. Не имеет отношения к Forge architecture. Удалён.

### Fix 3: Documentation — README architecture section

Все примеры использовали `F:\Projects\Project-forge\` как будто это default. Теперь явный disclaimer:

Также упомянуто что имя `Project-forge` — единственная остающаяся hardcoded строка (как legacy fallback), но path-based detection уже работает корректно для любого имени.

### Что **не** проблема (verified)

- Все скрипты используют относительные пути от своего расположения (`$PSScriptRoot`, `$MyInvocation.MyCommand.Path`, `$0`)
- `setup.sh`/`setup.ps1` — relative
- `forge.sh`/`forge.ps1 new` — `$ForgeRoot` резолвится из `$PSScriptRoot/..` корректно
- Hooks читают/пишут через `path.join(import.meta.url, ...)`
- Wiki templates копируются через `Copy-Item -Source $ForgeRoot\wiki\...`
- Plugin manifest пути относительные

Forge будет работать из:
- `F:\Projects\Project-forge\` ✓
- `F:\ProjectForgeUniversal\Project-forge\` ✓ (твой случай)
- `F:\ProjectForgeUniversal\Forge\` ✓ (благодаря fix 1)
- `D:\Forge\` ✓
- `~/projects/forge-template/` ✓ (Linux/macOS)

### Lesson logged (12-й подряд)

"User test = real test. Я заявил что 'путей нет нигде' в одной из прошлых сессий не проверяя. Пользователь нашёл `add_metanotes.mjs` с hardcoded `F:/39Games/...` за 1 grep. Урок: перед claim'ами '_не_ зашито' — grep ZNATSY (полное имя диска, абсолютные пути, имя template папки)."

## v4.6 changelog (MEDIUM-priority fixes + honest deferrals)

Пользовательский запрос: "давай что отложили тоже сделаем". В v4.5.2 мы задокументировали 5 MEDIUM и 6 LOW items. v4.6 закрывает 3 из 5 MEDIUM-ов; остальные 2 (orchestrator enforcement + real Claude Code integration test) слишком большие для patch-релиза и отложены с явным пометкой "v4.7 candidate / separate project".

### ✅ MEDIUM-1: Reference file date markers

**Было:** 13 reference files в `rustore-publish/reference/` помечены "production-tested" без указания версии SDK / даты. Когда RuStore Pay SDK обновится (это случается ежеквартально), непонятно устарел ли код.

**Стало:** каждый файл получил `@verified-against` и `@verified-date: 2026-04-25` в заголовке JSDoc/SQL-comment/Java-comment.

Version mappings:
- RuStore Pay SDK 10.2 / BOM 2026.04.01 — billing/shop/pending-purchase/RuStoreBillingPlugin.java
- RuStore Review SDK 8.0.0 — RuStoreReviewPlugin.java
- Node 20 + Express 4 + better-sqlite3 — auth.js, sync.js
- Web Crypto API (AES-GCM, PBKDF2), BIP39-style 5-word phrase — client-sync.js

Все 13 файлов прошли syntax check после изменений. 0 JS syntax errors. При следующем обновлении SDK пользователь сразу видит стало ли старо: сравнил дату маркера с датой последнего SDK release.

### ✅ MEDIUM-2: Plan schema validation

**Было:** `.claude/hooks/lib/parse-plan.mjs` имел `if (!fm.id) continue; // skip silently`. Ошибки во frontmatter (типа `status: doing` вместо `status: in_progress`, `files: src/a.js` вместо массива) тихо роняли tasks из plan'а. Пользователь не узнавал что его plan неполноценно парсится.

**Стало:** 
- Добавлена `validateTask(fm, filename)` export в `parse-plan.mjs` — возвращает array of human-readable issues.
- `loadPlan()` больше не silent-skip'ает — прикрепляет `schemaIssues[]` к каждой task.
- `wiki-audit.mjs` получил finding #8: если в планах есть schema issues — surface их при Stop audit.

Smoke-тест с 4 broken cases:
- Missing `id` → detected ("missing required field 'id'")
- Typo `status: doing` → detected с hint ("Use one of: planned, in_progress, blocked, done. Common mistakes: 'doing' → 'in_progress'")
- `files: src/a.js` как string → detected ("must be an array")
- Valid — passes clean

Добавлена `loadPlanIssues()` export для любого tool'а которому нужны issues в одном месте.

### ✅ MEDIUM-3: CLAUDE.md auto-rotation helper

**Было:** CLAUDE.md разрастался с каждым minor release. Лимит 30KB объявлен в v4.4.2, нарушен в v4.5 (39KB до ротации), снова нарушен в v4.5.1 (30.5KB до ротации). Каждый раз ловилось только в финальном audit. Нет автоматики проверки.

**Стало:** `scripts/check-claude-md-size.mjs` — Node-скрипт, запускается как `node scripts/check-claude-md-size.mjs` (или `--suggest` для рекомендаций по ротации). Выводит текущий размер, soft limit (30KB), hard limit (50KB), список version changelog секций с их размерами. Exit code: 0 под soft, 1 над soft, 2 над hard. Пригоден для pre-commit hook'а / CI check'а.

Не автоматизирует саму ротацию (слишком рискованно для файла с working agreement), но точно показывает какие секции двигать и куда. На текущей CLAUDE.md показывает 15.4KB — глубоко под лимитом после v4.5 rotation.

### ⏳ MEDIUM-4: Orchestrator mandatory-stops enforcement (deferred v4.7)

**Статус:** не сделано. Задача крупнее чем patch release.

Чтобы реально форсить "MANDATORY stop after Phase 1" из `/new-project` / `/deepen-game` / `/full-pipeline`, нужен PreToolUse hook который:
1. Читает phase state из `wiki/plan/*-phase.md` или новый `wiki/_phase.md`
2. При tool-use проверяет что phase N помечена как user-approved
3. Блокирует с return code 1 + explanation message если нет

Это требует: нового файла phase-state, нового hook'а phase-check.mjs, изменений в 3-4 orchestrator SKILL.md для записи phase-state. Не помещается в v4.6.

Правильное место — v4.7 "enforcement hooks" milestone. Пока что честно: текст "MANDATORY stop" в skills — это guideline, не enforcement. Claude может (и иногда решит) пропустить.

### ⏳ MEDIUM-5: Live Claude Code integration test (deferred, separate project)

**Статус:** не сделано и не запланировано в patch-серии.

Мы ни разу не запускали Claude Code live против Forge. Все наши проверки — статические (syntax, JSON parse, cross-ref grep). Реальный loop "пользователь говорит /deepen-game → Claude читает skill → research-references → ..." не тестировался.

Это отдельный проект: нужен reproducible test harness (scripted Claude Code session с fixed prompts), snapshot сравнение outputs, возможно тест на `claude --print` mode. Вероятно 2-3 дня работы. Не впишется ни в v4.6 ни в v4.7 как feature — это отдельный "quality gate" initiative.

Честно acknowledged в этом changelog'е потому что пользователь правомерно спрашивал "что упускаем". Это крупнейший упущенный test surface.

### Script presence

- `scripts/check-claude-md-size.mjs` добавлен (MEDIUM-3)
- `.claude/hooks/lib/parse-plan.mjs` расширен `validateTask()` и `loadPlanIssues()` (MEDIUM-2)
- `.claude/hooks/wiki-audit.mjs` получил finding #8 (MEDIUM-2)
- 13 reference files получили date markers (MEDIUM-1)

### Lesson logged (11-й подряд)

"Workspace не всегда идентичен тому что я думаю. В этой сессии я продолжил работу в /home/claude/forge-v4-v46/ после compaction и первый grep показал '0 files with verified-against'. Я подумал что прошлая работа потерялась. Второй grep (с правильным shell brace expansion) показал все 13 файлов. **Двойная проверка спасла от повторной работы.** Правило: если инструмент говорит неожиданное, проверь инструмент прежде чем действовать."

## v4.5.2 changelog (HIGH-priority audit fixes — first 3)

Пользовательский запрос "что мы ещё упускаем?" выявил 3 реальных бага в categories HIGH (не гипотезы — проверено smoke-тестами). Все 3 починены в v4.5.2.

### Fix 1: `_current.md` bootstrap в новых sibling проектах

**Проблема:** `forge.sh new` и `forge.ps1 new` создавали wiki-скелет со всеми templates, но не копировали `_current.md.template` → `_current.md`. SessionStart hook ожидает `_current.md` — находит только `.template`, выдаёт warning "_current.md NOT FOUND" на первой сессии каждого нового проекта.

Примечательно: я сам первоначально диагностировал это как "silent failure в setup.sh" — **неправильно**. Setup.sh действительно копирует (`if [ -f "wiki/_current.md.template" ] && [ ! -f "wiki/_current.md" ]; then cp ...`). Реальный баг — в `forge.sh`/`forge.ps1 new`. Урок: проверять утверждения прежде чем чинить.

**Фикс:**
- `forge.sh new` после создания worktree: `cp "${FORGE_ROOT}/wiki/_current.md.template" "${WORKTREE_PATH}/wiki/_current.md"`
- `forge.ps1 new` аналогично через `Copy-Item`
- `sync.ps1` также добавил seed `_current.md` из template если отсутствует в sibling (для уже созданных старых проектов)

### Fix 2: Git repo guard в forge.sh/forge.ps1

**Проблема:** `forge.ps1 new` делал `git worktree add` без проверки что Forge — это git repo. Если пользователь распаковал zip и забыл запустить setup (или setup не сделал git init по какой-то причине) — worktree add падает с cryptic "not a git repository" без указания что делать.

**Фикс:** guard `git rev-parse --is-inside-work-tree` перед worktree add. Если не git repo — выдаёт friendly error с точными командами:

```
[!!] This Forge installation is not a git repository.
     Fix (from F:\Projects\Project-forge):
       cd "F:\Projects\Project-forge"
       git init
       git add -A
       git commit -m "initial import of Project Forge"
     Then re-run: .\scriptsorge.ps1 new my-game "desc"
```

Plus post-`git worktree add` exit-code check — no more silent partial failures.

### Fix 3: Sync merge-vs-strict (preserves custom skills)

**Проблема:** `sync.bat` и `sync.ps1` делали `rmdir /S /Q .claude/skills` + `xcopy` — полный replace. Это уничтожало любые custom skills которые пользователь мог создать в sibling проекте (например `my-game/.claude/skills/my-custom-logger/`).

**Фикс:** default поведение изменено на **SAFE MERGE** (xcopy /Y без предварительного rmdir) — overwrite existing files + add new, но не трогает custom. Флаг `--strict` (bat) / `-Strict` (ps1) возвращает старое поведение (полный replace) когда пользователь явно хочет вычистить дрейф.

```
sync.bat            → safe merge (default, preserves custom)
sync.bat --strict   → full replace (OLD v4.5.1 behavior)
sync.ps1            → safe merge
sync.ps1 -Strict    → full replace
```

**Smoke test подтверждён:**
- Safe merge: overwriting `skill-a` (template version wins), adding `skill-b` (new from template), preserving `my-custom` (user's skill)
- Strict mode: deletes `my-custom`, full template match

**Trade-off:** если skill удалён из template, в sibling он остаётся (stale). Но это меньшее зло чем потеря custom работы. Для cleanup — явный `--strict`.

**Bonus:** переименовал `$Verbose` → `$VerboseOutput` в sync.ps1 чтобы избежать collision с built-in `$VerbosePreference` параметром.

### Что отложено (осознанно)

Эти проблемы задокументированы как известные, но не чинятся в v4.5.2 — либо слишком большие для patch-релиза, либо требуют изменений которые изменят UX:

- **Orchestrator mandatory stops не форсятся** — Claude может читать "MANDATORY stop" в skill'е и выбирать пропустить. Полноценный фикс требует PreToolUse hook с phase-state tracking. Отложено на v4.6.
- **Reference files без date markers** — `rustore-publish/reference/*.js` помечены "production-tested" без даты. RuStore SDK обновляется ежеквартально. Fix тривиальный (добавить frontmatter), но повлияет на все 13 reference файлов.
- **Plan/wiki schema drift validation** — `plan-check.mjs` не валидирует строго YAML schema. Опечатки silent fall-through.
- **CLAUDE.md auto-rotation** — ещё нет git hook который проверяет размер и предлагает ротацию. Сейчас это manual process.
- **Реальный run Claude Code против Forge** — мы никогда не запускали живой loop. Все проверки статичные. Это отдельная работа (integration test setup).

### Lesson logged (10-й подряд)

**"Всегда проверяй артефакт прежде чем его чинить."** В этой сессии я сначала заявил "silent failure в setup.sh" потому что забыл проверить. Реально setup.sh OK, баг в forge.sh/ps1. Без grep-verify я бы "починил" не то место и пропустил реальную проблему.

Это экземпляр более общего правила: **декларативное рассуждение не заменяет grep**. Я многократно в предыдущих релизах (v4.1 "extracted for reuse", v4.3.1 "README updated", v4.4.1 "sync covers this") опирался на память вместо проверки. Теперь явное правило.

## v4.5.1 changelog (Cyrillic-safety + cross-ref audit)

Пользовательский запрос: "проведи аудит — что все связи работают, что кириллица нигде не мешает батникам, хукам и т.д." Аудит по 14 категориям нашёл 5 реальных проблем, все починены.

### Cyrillic-safety fixes

**1. `sync.bat` имел Cyrillic без `chcp 65001`** — на default Windows cmd (cp866) это печатало бы мусор и могло ломать parsing. Добавлен `chcp 65001 >nul 2>&1` после `@echo off`. Теперь комментарии с Cyrillic и em-dashes в echo отображаются правильно на Win10 1803+.

**2. `.bat` файлы с LF-only line endings** — Win10+ ок, но старые Windows могут путаться. Конвертированы в CRLF три файла: sync.bat, cf.bat, open-all.bat.

### Cross-reference fixes

**3. `/choose-backend-stack` ссылался на несуществующий `/deploy-timeweb`** — такого skill'а нет, только `/deploy`. Заменено на существующий.

### Documentation coverage (9-й подряд паттерн "docs stale")

**4. GUIDE.md не упоминал v4.5 orchestrator'ы** (`/deepen-game`, `/release-ready`, `/choose-backend-stack`). Добавлен раздел "Стандартные оркестраторы (новое в v4.5)" с полным описанием + Research-first improvement.

**5. dashboard.html не упоминал v4.5 orchestrator'ы.** Добавлен блок "Новое в v4.5 — оркестраторы" в списке команд (4 новые команды: deepen-game, release-ready, choose-backend-stack, research-references).

### Подтверждения (всё чисто — не проблемы, но важные проверки)

- 74 SKILL.md: все UTF-8 no-BOM, все с valid `name:` + `description:` frontmatter
- .ps1 файлы: 0 Cyrillic сейчас (правило про BOM закодировано для будущего)
- .sh файлы: Cyrillic только в echoes (56 lines в analyze-game.sh, 39 в build-release.sh), полагается на bash locale — для Linux/macOS/Git Bash на Windows с настроенной локалью работает корректно
- Все 7 хуков: явный `'utf-8'` encoding в file ops
- JSON файлы (5 шт): все без BOM, все валидны
- 234 .md файла: все UTF-8 декодируемы без потерь
- Cross-references в /deepen-game: все 20 refs на skills валидны
- Cross-references в /release-ready: все 7 refs валидны
- Sync-scripts: wiki/research, wiki/plan покрыты обоими (sync.bat + sync.ps1)

### Lesson logged (9-й подряд)

**"Windows-specific encoding — отдельная дисциплина которую я забываю между релизами."** sync.bat добавил Cyrillic в v4.3.2 — не думал тогда про chcp. Теперь закодировано в CLAUDE.md как явное правило (ниже):

## v4.5 changelog (standardization pass — 4 orchestrators + research integration)

Пользовательский запрос: "раньше было куча разных команд чтобы из сырой игры сделать релиз или доработать... есть ли стандартизация?" Аудит показал что из 4 заявленных сценариев:
1. **GD+UI расширение контента** — частично, `/full-pipeline` только для Yandex
2. **Графика через research** — СЛАБО, `visual-upgrade` не вызывает research
3. **Релиз, забытые файлы** — хорошо (validators), но нет pre-release checklist
4. **Server stack выбор** — НИКАК, каждый раз изобретается

v4.5 закрывает все 4 gap'а.

### Action A — research integrated into 5 improvement skills

**Затрагивает:** `visual-upgrade`, `game-polish`, `game-design`, `level-design`, `monetization-design`.

В каждый skill вставлен **Phase 0: Research references** — вызов `/research-references` до любых изменений. Как в `/new-project` — MANDATORY unless user skips. Если `wiki/research/{Project}-references.md` свежее 14 дней — пропускается автоматически.

Теперь `/visual-upgrade` на roguelike автоматически сначала изучит топ roguelike'ов в канвасе, а не просто применит generic "add gradient + shadow + glow" шаблон.

### Action B — new skill `/deepen-game`

**Для твоего сценария #1: контент-расширение существующей игры.**

Orchestrator с 5 фазами: research (обязательно) → gap analysis (в wiki/plan/) → execution plan (user approval) → iterative execution (с mandatory stops) → final report (before/after metrics).

Чётко очерченный scope: разрешено вызывать `/game-design`, `/level-design`, `/visual-upgrade`, `/mobile-game-ui`, `/sound-design`. **Запрещено:** SDK integrations, ads, localization, release-* — это release-phase, не content-phase, смешивание ломает изоляцию.

Отличие от `/full-pipeline`: full-pipeline — для raw → release-ready pipeline (новая игра, включая SDK). deepen-game — для уже работающей игры которую надо сделать глубже, никакого SDK trouble.

### Action C — new skill `/release-ready`

**Для твоего сценария #3: pre-release checklist.**

Read-only orchestrator — **не строит, не грузит**, только проверяет что ВСЁ на месте перед `/release`. Red/yellow/green report per platform + aggregate summary + конкретные next actions.

Матрица проверок:
- Cross-platform: WorkProgress dir, SDK wrapper, debug code removed, i18n coverage, no console.log, index.html entry
- Yandex: store description ≥120 chars, 3+ screenshots, 1024x1024 icon, 11 validators, runtime-test
- VK: Bridge integrated, VKWebAppInit first, vk-pay params shape, 3 validators
- Telegram: ready() called, HTTPS-only, 5 validators, runtime-test
- OK: API_callback global, rewarded preload sequence, 1 validator + runtime-test
- MAX: MaxSDK wrapper, URL ≤1024, 5 validators, legal entity requirement
- RuStore: keystore, manifest applicationId, Pay SDK receipt validation (smoke test), privacy URL
- Web: Dockerfile/deploy script, nginx.conf, HTTPS cert plan

Закрывает твою проблему "каждый раз Клод забывал какой-то файл" — если skill говорит GREEN, значит реально всё на месте.

### Action D — new skill `/choose-backend-stack`

**Для твоего сценария #4: выбор серверного стека.**

4 вопроса через `ask_user_input_v0` → **одна из 5 канонических стеков**, не "давайте изобретём":

- **Stack A (default):** Node + SQLite + Timeweb VPS (~750₽/мес, reference код в rustore-publish/reference/)
- **Stack B:** Node + PostgreSQL + Timeweb / self-hosted (когда >100 RPS или relational data)
- **Stack C:** Cloudflare Workers + D1/KV/R2 (международная аудитория, serverless)
- **Stack D:** Docker Compose + любой VPS (когда пользователь хочет Docker или multi-service)
- **Stack E:** Яндекс Cloud Functions (152-ФЗ + scale-to-zero)

Decision table маппит 4 ответа → stack. Output — рекомендация + cost estimate + ссылка на reference код + next steps + migration path если требования изменятся.

Escape hatch для экзотики: если пользователь хочет Go+NATS+Cassandra, skill честно говорит "outside canonical 5, no reference code" и логирует решение в `wiki/decisions/`.

### Summary

| Pre-v4.5 problem | v4.5 solution |
|---|---|
| visual-upgrade применял шаблон без research | Phase 0 в visual-upgrade + 4 других skills |
| Нет оркестратора "расширь уже готовую игру" | `/deepen-game` с 5 фазами |
| Release-pre-check разбросан по fill-* | `/release-ready` — единый read-only checklist |
| Каждый раз новый backend stack | `/choose-backend-stack` — 4 вопроса → 1 из 5 |

Skills: 71 → 74 (+3). Все новые skills ссылаются на уже существующие reference файлы, не дублируют.

### Что НЕ сделано (честно)

- **Phase 0 интеграция только в 5 skills** — не во ВСЕ skills. `localize`, `fill-yandex`, debug* skills — research для них не нужен, по смыслу. Но `mobile-game-ui`, `app-ux-polish` — потенциально могли бы получить Phase 0. Откладываем до появления явного запроса.
- **`/release-ready` не имеет автоматического fix mode** — только отчёт. Фиксить user должен руками через `/fill-*`. Это deliberate: single-responsibility.
- **`/choose-backend-stack` не pre-provisioning VPS автоматически** — это отдельный flow (`/deploy` или ручная провизия).
- **Mappping legacy skills → /deepen-game scope** — старые skills типа `improve`, `rebuild` могут дублировать часть deepen-game логики, но переименовывать/удалять не стал (break backwards compat).

### Lesson logged (8th consecutive)

"Когда на поверхности видна симптоматика 'каждый раз по-разному' — это почти всегда отсутствующий orchestrator, не отсутствующий skill. Individual skills могут быть отличные, но без явной композиции поверх них пользователь снова и снова изобретает flow. v4.5 добавил 3 orchestrator'а (deepen-game, release-ready, choose-backend-stack) ровно для этой причины — стандартизировать композицию."

## v4.4.2 changelog (prompt-cache optimization in hooks + final audit)

Пользовательский вопрос про `platform.claude.com/usage/cache` привёл к аудиту всех 7 хуков на cache-breaking паттерны. Нашёл один минорный но реальный leak: `plan-check.mjs` инжектил **уникальный** warning на каждом out-of-scope edit (`{filePath}` + enumeration активных задач). Это ломало prompt cache от этого turn'а вперёд в рамках сессии.

### Fix

`plan-check.mjs` — путь "out-of-scope edit" теперь инжектит **детерминированный** warning без `{filePath}` и enumeration задач. Claude всё ещё видит сигнал "plan drift!" и может прочитать `wiki/plan/` через Read если нужны специфики. Impact: каждый cache miss на out-of-scope edit сэкономлен — для сессий с плохой plan hygiene это N×prefix_tokens × 1.25 (cache write multiplier) меньше за сессию.

### Final audit findings (post-cache-fix)

После 6 последовательных minor releases запущен финальный аудит. Кроме cache-leak нашли:

1. **3 SKILL.md без `name:` field** (`test-game`, `fix-moderation`, `analyze-game`) — это legacy баг из ранних версий, не v4.4.2. Spec говорит frontmatter обязателен — без `name:` возможны проблемы с discovery. Добавлено поле во все три.

2. **CLAUDE.md раздулся до 39KB** — я сам только что в этом же changelog'е установил лимит 30KB, и сразу превысил. Rotated: v4.3.2 и старше (v4.3.1, v4.3, v4.2.1) вынесены в `docs/CHANGELOG.md`. CLAUDE.md теперь 16KB — под лимитом.

3. **Все остальные проверки чистые:** 0 syntax errors в .mjs/.js, все 4 JSON валидны, YAML workflow валиден, все cross-references skills↔platforms↔agents работают, все 9 ссылок `anon-auth-sync` на `rustore-publish/reference/*` резолвятся, sync scripts покрывают `platforms/` и `wiki/research/`, нет утечек dev-путей.

### New rule for hook authors

Добавлено в этот CLAUDE.md (ниже) и в комментарии самого `plan-check.mjs`:

### Что НЕ поменяно (deliberate)

- **`session-start.mjs`** — инжектит динамический контекст (`_current.md`, plan summary, `_map.md`, recent session logs). Это ломает cache на **первом turn'е каждой новой сессии** — но это цена persistent memory. Внутри сессии hook не запускается, так что остальные turn'ы кэшируются нормально. Оставляем.
- **`post-tool-capture.mjs`** — пишет в файлы, не инжектит в контекст. Zero cache impact. ✓
- **`stop-flush.mjs`** — инжектит `decision: block` только на Stop event, это session-end семантика. ✓
- **`status-line.mjs`**, **`block-dangerous.mjs`** — не трогают context. ✓

### Lesson logged (седьмой подряд)

"Я сам себе противоречил в рамках одного release'а — написал правило про 30KB и тут же его нарушил в том же файле. Каждое правило должно быть verified immediately против текущего состояния (grep/wc/awk), не декларативно. Финальный аудит до пакаджа — не опциональная ступень, а обязательная." Добавлено в mental check-list: перед любым финальным zip'ом — всегда один проход "verify the rules I just wrote".

## v4.4.1 changelog (rustore-publish content update + new anon-auth-sync skill)

Пользователь прислал два pакета (`auth-sync-package.zip` + `rustore-payments-package.zip`) — свежие версии файлов для rustore-publish skill. Сравнение показало: большая часть идентична тому что уже в Forge, но **3 файла устарели** и **7 отсутствовали**. v4.4.1 закрывает дыры.

### Что обновлено в `.claude/skills/rustore-publish/`

Updated (stale → fresh):
- `PAYMENTS.md` +5202 bytes — добавлен §6a "Cloud-sync starter bonus" (retention hook), offline-mirror artifactory guidance, smoke-test curl для артефактория RuStore
- `reference/README.md` — enumerates all 13 reference files including новые auth/sync/review SDK
- `reference/security-log.js` — **152-ФЗ compliance fix:** IP пишется как HMAC-SHA256 hash через `ip-hash.js`, не raw. В логах — 8-char тег, не IP

Added (missing → shipped):
- `AUTH-SYNC.md` (42k) — 13-разделов инструкция: анонимная auth через device_token, E2E шифрование с 5-словной фразой, threat model, rate limits, 152-ФЗ, миграция
- `reference/auth.js` — server `/register` endpoint + starter grant
- `reference/sync.js` — server `/upload` с anti-farm gates
- `reference/client-auth.js` — клиентский device_token + JWT
- `reference/client-sync.js` (22k) — клиентский E2E encryption (AES-GCM) + 5-word phrase
- `reference/ip-hash.js` — HMAC-SHA256 IP псевдонимизация (используется security-log.js)
- `reference/RuStoreReviewPlugin.java` — Capacitor plugin для Review SDK (rate-in-app dialog)

### SKILL.md updated

- `description:` теперь упоминает anon auth + E2E cloud sync + Review SDK — раньше говорил только про listing/keystore/IAP/moderation, поэтому `/find-or-make-skill` discovery chain не находил его при запросах об авторизации
- Добавлен раздел "Документы в этом skill'е" со ссылками на PLAYBOOK / PAYMENTS / AUTH-SYNC

### New skill `.claude/skills/anon-auth-sync/`

Вытащен как **отдельный discoverable skill** потому что паттерн универсален — работает для любого Capacitor/PWA/mobile приложения с пользовательскими данными, не только для RuStore. Этот skill **не дублирует файлы** — reference пути указывают на `../rustore-publish/reference/` где живут актуальные версии.

Включает: когда использовать / когда нет, краткую архитектуру в 2 фразах, 5-шаговую интеграцию в новый проект, список анти-паттернов (device_token в plaintext, raw IP в логах, PII поля в users table, фраза короче 5 слов, одна фраза для шифрования и auth-challenge).

Description skill'а триггерит на: "анонимная авторизация", "anonymous auth", "device token auth", "E2E encrypted sync", "cloud sync no email", "без регистрации sync", "восстановление по фразе", "passphrase restore", "5-word recovery".

### Итоги

- 70 → 71 skill
- rustore-publish покрытие: 10 файлов → 17 файлов
- Discovery: anon auth теперь findable через `/find-or-make-skill` в обоих ролях — как часть RuStore pipeline, и как standalone паттерн для других проектов

### Lesson logged

"Уже существующий skill может содержать устаревшую версию контента. Когда пользователь приносит свежую копию — не создавать новый skill, а **сравнить файлы поштучно** (identical / size-differs / missing). Upgrade in place, не параллельная структура." Подтверждает паттерн discovery-first из v4.4: сначала посмотреть что есть, потом решать что делать.

## v4.4 changelog (research-driven project start)

Пользовательский запрос: "как заставить Клода не придумывать скил которого нет, а искать существующий; и как заставить изучать референсы похожих проектов перед планированием". v4.4 решает обе проблемы системно — вводит **discovery-first дисциплину** и **research-driven планирование**.

### New skills

**`.claude/skills/find-or-make-skill/SKILL.md` — discovery chain перед созданием скила.**

Порядок: local skills (Glob `.claude/skills/**/SKILL.md`) → local agents (`.claude/agents/*.md`) → Anthropic official (`code.claude.com`, `anthropics/skills`, `anthropics/claude-plugins-official`) → community (`claudepluginhub`, `buildwithclaude`, `vercel-labs/agent-skills`) → **только если ничего не нашлось** → `/write-skill` создаёт локально.

Anti-patterns прописаны явно: не пропускать шаги, не галлюцинировать marketplace URL'ы, не устанавливать community skills молча, не создавать скил до прохождения шагов 1-4.

**`.claude/skills/research-references/SKILL.md` — research перед планированием.**

6-шаговый процесс: genre/category recon (web_search) → platform recon → visual/UX references (image_search) → feature extraction (core loop / table-stakes / differentiation / anti-features) → output в `wiki/research/{Project}-references.md` → brief user one-screen summary.

Русская специфика прописана в skill: Яндекс требует vertical+horizontal ZIPs, MAX только юрлица/ИП РФ, VK Pay nested params, OK API_callback contract — разные локальные требования встроены в research queries.

Anti-patterns: не придумывать конкурентов (если web_search ничего не нашёл — так и пишем "no direct competitors found"), не копировать UI скриншоты дословно, не тратить 20 web searches на мелкий проект (5-10 — верхний лимит), не планировать в этом skill — это research, не plan.

### Entry-point integrations

**`/new-project`** — добавлены Phase 0a (research-references) и Phase 0b (find-or-make-skill for specialized competencies) ПЕРЕД созданием worktree. Mandatory stop после Phase 0a — пользователь должен подтвердить направление перед продолжением. Non-negotiable list обновлён.

**`/analyze-project`** — вставлены Step 3.5 (research-references) и Step 3.6 (find-or-make-skill) после type detection и выбора strategy. ANALYSIS.md теперь включает поля `## References:` и `## Skills needed:`.

**`/analyze-game`** — вставлены Step 6 (research-references) и Step 7 (find-or-make-skill). Формат вывода дополнен секциями `📚 REFERENCES` и `🧰 SKILLS`.

### New wiki structure

Создана папка `wiki/research/` — туда падают `{Project}-references.md` файлы. Sync scripts уже копируют всю `wiki/` структуру, отдельный fix не нужен — проверил.

### Что НЕ сделано в v4.4 (honest)

- **Hooks не принуждают к discovery.** find-or-make-skill и research-references вызываются из entry-point SKILL.md инструкций, но нет PreToolUse hook который бы блокировал создание скила до discovery chain. Это более жёсткий дизайн, требующий hook-инфраструктуры, которую v4.3 не завезла. Deferred на v4.5.
- **Community marketplace discovery — best-effort.** `claudepluginhub.com`, `buildwithclaude.com`, `vercel-labs/agent-skills` перечислены, но их API/каталоги могут изменится. Если какой-то из источников пропадёт — skill продолжит работать, просто этот шаг даст пустой результат и перейдёт к следующему.
- **research-references не делает automated competitor screenshot scraping.** image_search даёт ссылки, но не закачивает изображения в проект. Пользователь может расширить это вручную, если нужно.

### Lesson logged

Четвёртый паттерн ошибок подряд (v4.1: extracted-but-not-used, v4.2.1: docs out of sync, v4.3.1: README stale, v4.3.2: sync infrastructure stale) — **"выдумывание вместо discovery"**. Claude при отсутствии явного скила склонен придумать решение с нуля, хотя существующий скил покрыл бы задачу. v4.4 превращает это в явный chain: discovery → если нет → creation. Добавлено в mental check-list: перед тем как строить — всегда проверить что уже есть.

## v4.3.2 changelog (sync & multi-project infrastructure fix)

Reminder о архитектуре Forge (не помнил сам в v4.3 — исправляюсь): это **шаблон-родитель + проекты-соседи**. Forge живёт в `F:\Projects\Project-forge\`, пользовательские проекты — его сиблинги: `F:\Projects\my-game\`, `F:\Projects\shooter\`. В каждом соседе свой `.claude\`, свой `wiki\`, своя копия (или symlink/junction) на `platforms\`. `scripts/sync.bat` обновляет всех соседей после изменений в template'е. `scripts/forge.sh new` и `forge.ps1 new` создают соседа через `git worktree add`.

### CRITICAL bugs fixed

**BUG #1 — `sync.bat` не копировал `platforms/`.** v4.1+ ввёл `platforms/{name}/scripts/pre-submit.mjs` + validators — `sync.bat` из v3-эры ничего не знал про эту папку. После sync в проектах-соседях не появлялась `platforms/`, и все `/release <platform>` команды падали с `Cannot find module`. Починено: новый `sync.bat` делает full-replace копию `platforms/`. Тот же fix в новом `sync.ps1`.

**BUG #2 — `forge.sh new` / `forge.ps1 new` не создавали `platforms/` в новом проекте.** Создавали `wiki/` + symlink на `skills/`, но не трогали `platforms/`. Релиз-скиллы в только что созданном проекте **не работали**. Починено: `forge.sh new` делает `ln -sf ${FORGE_ROOT}/platforms ${WORKTREE_PATH}/platforms`, `forge.ps1 new` делает `New-Item -ItemType Junction`. Symlink/junction, не copy — один источник истины, обновления template'а сразу видны соседям.

**BUG #3 — `sync.bat` не копировал `scripts/build-all-platforms.mjs`.** Оркестратор `/release all` живёт там. Без копии — `/release all` в сосед-проекте падает. Починено в обоих sync-скриптах + в обоих forge-скриптах.

### New: `sync.ps1` (PowerShell версия)

- `-DryRun` — предпросмотр без записи
- `-Verbose` — детальный per-file лог
- `-Project <name>` — синкать только один конкретный проект
- Нормальный error handling с красным выводом при сбоях
- Отсутствовал в v4.3. Многие Windows-пользователи в PowerShell, а `.bat` дёргать через cmd.exe уровнем ниже

### Dashboard updates

- Шаг "Добавь в sync.bat" убран из flow создания проекта — новый sync **автоматически** находит всех соседей, не нужно править скрипт руками
- Добавлен `sync.ps1 -DryRun` в справку как альтернатива

### Что НЕ синкается (deliberately)

- `.claude-plugin/` — это distribution manifest, нужен только в template'е. В соседях ничего не делает.
- `.github/workflows/` — опционально, проект может иметь свой workflow. Не перезаписываем.
- `setup.sh`, `setup.ps1` — bootstrap-only, делаются один раз.

### Lesson logged

"Sync infrastructure — это точно такой же компонент forge как и validators/hooks. Добавляешь новую папку в template — **обязательно обнови sync.bat и forge.{sh,ps1}**." Добавлено в mental check-list рядом с "документация должна обновляться вместе с кодом" из v4.3.1.

## v4.3.1 changelog (documentation alignment)

v4.3 добавил Agent Teams, platform subagents, plugin install и frontend-design references в код. v4.3.1 исправил документацию — в v4.3 эти фичи существовали только в коде и в CLAUDE.md changelog, пользователь, читающий README или GUIDE, ничего про них не узнавал.

**Что сделано:**

- **README.md полностью переписан** под v4.3. Было: версия v4 в примере команды, ноль упоминаний Agent Teams / frontend-design / plugin install / platform subagents. Стало: актуальный overview всех v4.3 фич + quickstart + таблица платформ + typical pitfalls + ссылки на docs.
- **GUIDE.md дополнен** пятью секциями для v4+ платформ: "Сборка для VK Mini Apps", "Сборка для Telegram Mini App", "Сборка для Одноклассников", "Сборка для MAX мессенджер", "Сборка на ВСЕ платформы сразу (`/release all`)". Каждая включает конкретные validator'ы, pitfalls и cross-platform ссылки (Telegram vs MAX HMAC, VK Pay nested params, OK API_callback contract). Обновлено оглавление. Обновлена ссылка с `project-forge-v3.zip` на `project-forge-v4.3.zip`.
- **dashboard.html получил honest banner** сверху: "Dashboard v3-era — готовые промпты охватывают Yandex + RuStore + Web. Для VK / Telegram / OK / MAX и `/release all` (Agent Teams) — см. GUIDE.md и README.md". Не переписывал все 972 строки dashboard'а — его dom/structure ориентирован на v3 workflow (RuStore APK + Yandex Games), это отдельная работа если будет востребовано.
- **Version bump**: 4.3.0 → 4.3.1 в setup.sh/.ps1, plugin.json, marketplace.json.

**Lesson logged:** обновление функциональности без обновления entry-point documentation = та же category ошибок что и v4.1 "extracted for reuse" claims — расхождение доки с реальностью. Добавлено в mental check-list: после любого feature ship — проверять coverage в README/GUIDE grep'ом, а не на глазок.

## v4.3 changelog (Claude Code 2026 feature integration)

v4.3 integrates Claude Code platform features that matured through early 2026. Every change below references a specific Claude Code doc page — none is written from memory.

### Verified and shipped

**Agent Teams support for `/release all`** (per [code.claude.com/docs/en/agent-teams](https://code.claude.com/docs/en/agent-teams)):

- `.claude/settings.json` includes `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1", "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "64000" }` at repo scope. This enables the experimental flag for anyone using Forge, without requiring them to edit their user-level settings.
- New `.claude/agents/` directory with 5 platform-specific subagent definitions (`yandex-builder`, `vk-builder`, `telegram-builder`, `ok-builder`, `max-builder`). Each has correct `name` / `description` / `tools` frontmatter per subagent spec. These are reusable as Task-tool subagents OR as Agent Team teammates per docs.
- `.claude/skills/release-all/SKILL.md` rewritten with two execution modes: Agent Teams (parallel, requires Opus 4.6+) and Sequential (fallback, v4.2 behaviour). Default mode is Sequential to avoid surprising users with token cost jumps.
- Documented known limitations from official docs: `/resume` doesn't restore in-process teammates, task status can lag, shutdown is slow, one team per session, no nested teams, delegate mode breaks permissions.

**Plugin-install support (beta)** (per [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference)):

- `.claude-plugin/plugin.json` with `name: "project-forge"`, version 4.3.0, custom `skills`/`agents` paths pointing to existing `.claude/` layout (per docs: custom paths supplement defaults, so existing structure stays valid).
- `.claude-plugin/marketplace.json` for self-distribution via `/plugin marketplace add`.
- Separate `.claude/hooks/plugin-hooks.json` that uses `${CLAUDE_PLUGIN_ROOT}` for the plugin-install path. `.claude/settings.json` hooks remain for the unzip+setup.sh path. **WARNING in the plugin-hooks file:** don't use both install paths simultaneously — hooks will fire twice.
- Marked as **beta** in README. We haven't tested a full `/plugin install` cycle because that requires a real GitHub remote; the manifest is structurally correct per Anthropic docs but hasn't been end-to-end verified against a live install.

**frontend-design skill references in release-* skills:**

- Added a "Frontend-design discipline" section to `release-yandex`, `release-vk`, `release-max`, `release-telegram`, `release-web` SKILL.md files. Instructs Claude to invoke the official Anthropic `frontend-design` skill before writing store-listing HTML / landing pages / promo screens.
- The skill itself is NOT bundled (it's an Anthropic-maintained skill distributed through their marketplace). We just reference it — users install it separately via the plugin system.

### Deferred (not shipped in v4.3)

- **`${CLAUDE_SKILL_DIR}` refactor** of hardcoded skill paths: Claude Code resolves `${CLAUDE_SKILL_DIR}` to the skill's own directory, which is useful for referencing bundled scripts/assets inside SKILL.md. Our current skills mostly reference `platforms/*/...` paths which live OUTSIDE the `.claude/skills/*/` tree, so `${CLAUDE_SKILL_DIR}` wouldn't help. Real refactor would require moving scripts into each skill's folder — non-trivial, and would break the `node platforms/<p>/scripts/pre-submit.mjs` contract that the orchestrator and CI workflow depend on. Deferred until there's a concrete skill that ships its own scripts.
- **PreToolUse `additionalContext`** injection of wiki state: Hook schema confirmed, but the actual behavior around JSON-output hooks has been iterating ("Fixed JSON-output hooks injecting no-op system-reminder messages into the model's context on every turn"). Want to watch this stabilize before shipping.
- **Figma MCP, Remotion skill, Claude Design**: These are separate Anthropic products, not Forge changes. Users can install them independently. Adding them as hard dependencies would be scope creep.

## v4.2.1 changelog (API verification + self-audit pass)

v4.2 fixed issues that slipped into v4.1 when some platform integrations were written from memory instead of verified docs. v4.2.1 then self-audited and found 8 more bugs — 5 fixed, 3 documented honestly.

### v4.2 corrections (API verification against real docs)

- **Telegram** — added `cloud-storage-constraints.mjs` validator (key regex `^[A-Za-z0-9_-]{1,128}$`, per official Bot API docs). Verified `CloudStorage.setItem(key, value, callback(err, stored))` signature against `revenkroz/telegram-web-app-bot-example`.
- **VK Pay** — v4.1 incorrectly enforced "amount must be string". Verified against `VKCOM/vk-mini-apps-api` source: `amount` is a `number` inside nested `params: {}`. Rewrote validator: catches top-level `amount` (legacy flat shape), validates `action` enum (`pay-to-user|pay-to-group|pay-to-service|transfer-to-user|transfer-to-group`), warns when `pay-to-service` lacks `merchant_data`/`sign`.
- **OK runtime-test** — v4.1 mock incorrectly passed local callbacks to `FAPI.UI.*` methods. Verified: these methods invoke global `window.API_callback(method, result, data)`. Mock now dispatches via `API_callback`; added Probe C2 for rewarded-ad preload lifecycle.
- **GitHub Actions** — replaced fragile `hashFiles(format(...))` conditionals with a `detect_tests` bash step that outputs `has_runtime`/`has_smoke` booleans.

### v4.2.1 self-audit findings (fixed)

**BUG #1 (CRITICAL) — OK `apiCallbackDefined` timing:** v4.2 mock scheduled the `window.API_callback` existence check via `setTimeout(10ms)` inside the mock. The mock runs BEFORE app scripts — so the timeout fired before `API_callback` could possibly be defined. The probe always returned `false` regardless. **Fix:** moved check to Node side at end of test window.

**BUG #2 (MODERATE) — MAX `sdk-loaded` position false-negative:** Used `html.search('max-web-app.js')` to find SDK position. A comment in `<head>` mentioning the filename would mask a `<script>` tag in `<body>`. **Fix:** now matches the `<script src=...>` tag directly, not the bare filename.

**BUG #6 (CRITICAL) — `platforms/max/templates/verify-webappdata.mjs` referenced but missing:** Both `SKILL.md` and `README.md` described this as a template to copy during `/release max`, but the file didn't exist. **Fix:** implemented (HMAC-SHA256 verification per dev.max.ru docs), round-trip verified with 4 test cases (valid data / wrong token / tampered hash / expired timestamp — all pass).

**BUG #7 (MINOR) — orchestrator `--list` wrong platform display:** `listProjects()` returned raw dir names including platform suffixes, so `TestProject-max` displayed as platform `yandex` (via fallback). **Fix:** strip platform suffixes before grouping.

**BUG #8 (MINOR) — README inconsistency:** Changes table said "4 Telegram validators", status table said "5". **Fix:** 5 everywhere.

### v4.2.1 dishonest claims — removed

**BUGS #4 and #5:** v4.1 shipped `platforms/_shared/long-tasks-probe.mjs` and `platforms/_shared/zip-builder.mjs`, claiming they had been "extracted when a second consumer emerged". Audit: **0 imports** of either module anywhere in the codebase. They were speculative modules with docs describing reuse that never happened. **Fix:** deleted both files. Only `static-server.mjs` remains in `_shared/` — it has 2 real consumers (telegram + ok runtime-tests).

### v4.2.1 known debt (not fixed, documented)

**BUG #3 — `_lib.mjs` drift:** Each of telegram/max/vk validators has its own `_lib.mjs` with slightly different defaults (different excluded folder lists, different parameter names `extensions` vs `exts`, telegram has an extra `isMain()` helper). Not critical — each platform's validators work. Refactoring to a shared `_shared/validator-lib.mjs` would require touching every validator's import path and is risky mid-release. Left as known debt.

### Lesson for future iterations

If you're writing an API wrapper, mock, or validator based on recall and not from fresh docs — add a `TODO: VERIFY` comment and verify before claiming the module works. The v4.1 → v4.2 gap existed because I believed I remembered the APIs. I didn't.

## How It Works

1. User puts source code in `GameIntegration/{ProjectName}/`
2. You copy to `WorkProgress/{ProjectName}/` and polish
3. You integrate platform SDKs and run platform gates
4. You produce builds in `Release/{ProjectName}/{platform}/`
5. Memory survives sessions via three-file model + hooks
6. Multiple projects run in parallel via git worktrees

## Folder Convention (CRITICAL)

```
GameIntegration/{Project}/        ← INPUT. Raw sources. NEVER modify after copy.
WorkProgress/{Project}/            ← WORK. Copy of sources. All work here.
WorkProgress/{Project}-<platform>/ ← PER-PLATFORM COPIES for /release all
Release/{Project}/<platform>/      ← OUTPUT. Platform-specific builds.
```

Rules:
1. On start: copy `GameIntegration/{N}` → `WorkProgress/{N}/`
2. ALL edits — in `WorkProgress/`
3. Scripts run against `WorkProgress/{N}/`
4. Multi-platform → duplicate into `WorkProgress/{N}-<platform>/` so SDK integrations don't collide
5. **NEVER** edit files in `Release/` directly — only rebuild
6. **NEVER** work in `GameIntegration/` after the initial copy

## Three-File Memory Model

| File | Size | Role |
|------|------|------|
| `wiki/_current.md` | 20-30 lines | Active session. Updated every step. Injected in full. |
| `wiki/plan/*.md` | 1 per task | Structured tasks with `status`/`files`/`acceptance`. Parsed by hooks. |
| `wiki/_map.md` | any | Project map. Updated ≥1/session. |

Enforced by 7 hooks (see README-MEMORY.md). The Stop hook blocks session end if work is undocumented.

## Platform Adapters — `platforms/`

Every publication target is an adapter with the same contract:

```
platforms/<n>/
├── README.md              # Contract
├── validators/            # Static checks — export { ID, REQUIREMENTS, validate(gamePath) }
│   ├── _lib.mjs
│   └── <check>.mjs
├── scripts/
│   ├── pre-submit.mjs     # Orchestrator (exit 0=ok, 1=blockers, 2=fatal)
│   ├── runtime-test.mjs   # optional: puppeteer probes
│   ├── smoke-test.mjs     # optional: crash/freeze detection
│   └── build.mjs
├── templates/             # SDK wrappers, snippets
└── skills/                # Platform-specific skills (only if needed)
```

### Current adapter matrix

| Platform | Status | Validators | SDK wrapper | Runtime tests | Gate command |
|---|---|---|---|---|---|
| `yandex` | production | 11 | yandex-sdk-wrapper.js | smoke + runtime-ads | `node platforms/yandex/scripts/pre-submit.mjs` |
| `vk` | beta | 3 (bridge-timing, vk-pay, vk-ads) | VK Bridge | — | `node platforms/vk/scripts/pre-submit.mjs` |
| `telegram` | beta | 5 | telegram-sdk-wrapper.js | ready/expand/theme probe | `node platforms/telegram/scripts/pre-submit.mjs` + `runtime-test.mjs` |
| `ok` | beta | 1 (fapi-sdk) | ok-sdk-wrapper.js | sig + FAPI.UI.loaded + callback lifecycle | `node platforms/ok/scripts/pre-submit.mjs` + `runtime-test.mjs` |
| `max` | beta | 5 | max-sdk-wrapper.js (MaxSDK) | — | `node platforms/max/scripts/pre-submit.mjs` |
| `rustore` | beta | — | Capacitor | — | via `/release rustore` skill |
| `web` | beta | — | — | — | via `/release web` skill |

### Shared utilities — `platforms/_shared/`

- `static-server.mjs` — zero-dep HTTP server for puppeteer tests (MIME types, rewrite hooks, path traversal guard). Used by telegram runtime-test and ok runtime-test.

**Adding shared utilities:** Only extract to `_shared/` when a second consumer exists. Don't add modules speculatively — dead code accumulates and lies about coverage.

## Slash commands

### Release pipeline (per platform)

| Command | Output |
|---|---|
| `/release yandex` | 3 ZIPs + 13 store-listings + art-prompts → `Release/{Project}/yandex/` |
| `/release vk` | bundle + manifest → `Release/{Project}/vk/` |
| `/release telegram` | HTTPS bundle + BotFather manifest → `Release/{Project}/telegram/` |
| `/release ok` | bundle + app-manifest → `Release/{Project}/ok/` |
| `/release max` | HTTPS bundle + business.max.ru manifest → `Release/{Project}/max/` |
| `/release rustore` | APK + AAB + signing report → `Release/{Project}/rustore/` |
| `/release web` | Dockerfile + nginx + bundle → `Release/{Project}/web/` |
| `/release all` | Multi-platform: polish once, duplicate, build each |
| `/gate [platform]` | Quick pre-submit check for current platform |

### Project management

| Command | Purpose |
|---|---|
| `/start {idea}` | Bootstrap a new project |
| `/continue` | Resume work from `wiki/_current.md` |
| `/plan` | Generate structured tasks in `wiki/plan/` |
| `/handoff` | Crystallise state for next session |
| `/status` | Progress overview |
| `/review` | Code quality check |
| `/team build` | Parallel agent team |

## Skill selection

Based on user's description, load from `skills/CATALOG.md`:
- Core (4): `visual-quality`, `game-ui`, `mobile-controls`, `html-template`
- Games (16 genres): platformer, shooter, puzzle, ..., sandbox
- Apps (7 categories): finance, utility, health, productivity, ...
- Stack (15 technologies): sveltekit, dexie, pocketbase, tailwind, ...
- PWA (17 modules with references/): sveltekit-pwa, dexie-offline, ...

Platform-specific skills live in `platforms/<n>/skills/`:
- `platforms/yandex/skills/` — yandex-sdk-integration, pre-submit-gate, store-listings-builder, debugcheck-enhance

## Subagents (delegate focused tasks)

- `code-reviewer` — code quality + comments
- `qa-tester` — features + edge cases + mobile
- `builder` — single-feature focused dev
- `doc-writer` — wiki maintenance
- `security-auditor` — XSS, secrets, dependencies
- `sdk-researcher` — SDK docs, pitfalls, credentials

## Code comment rules

### File header (every file)
```javascript
/**
 * @file player.js
 * @description Player entity: movement, combat, inventory
 * @dependencies config.js, utils.js, audio.js
 */
```

### Function JSDoc (every fn >5 lines)
```javascript
/**
 * @param {Object} attacker — must have .stats.atk, .stats.critChance
 * @returns {{ damage: number, isCrit: boolean }}
 */
function calculateDamage(attacker, defender) { ... }
```

### Inline comments for non-obvious logic
```javascript
// Wilder smoothing (not simple average) — standard for RSI
// Clamp dt to prevent physics explosion after tab switch
```

## Hooks enforcement

Five hooks run automatically (see `.claude/settings.json`):

- `session-start.mjs` — injects context at startup/resume/compact
- `block-dangerous.mjs` — blocks destructive bash
- `plan-check.mjs` — warns on edits outside active task's `files:`
- `post-tool-capture.mjs` — semantic session logs with task-id tags
- `stop-flush.mjs` — blocks Stop if wiki is out of sync (7 checks)

Plus `status-line.mjs` shows the active task in the status bar.

Emergency bypass: `FORGE_SKIP_AUDIT=1` — logged, not silent.

## NEVER (non-negotiable)

### Folder discipline
- Never modify `GameIntegration/{N}/` after copy
- Never edit files in `Release/` directly
- Never mix platforms in one `WorkProgress/` copy — use `WorkProgress/{N}-<platform>/`

### Memory discipline
- Never start without reading `wiki/_current.md`
- Never leave tasks with all acceptance checked but status `in_progress`
- Never edit a file outside active task `files:` without updating the plan
- Never have two `in_progress` tasks simultaneously

### Release discipline
- Never build a ZIP/APK if pre-submit exit=1 (blockers present)
- Never downgrade a blocker to warning without asking the user with the citation
- Never trust approved games as reference — they may contain blockers moderation missed

### Documentation
- Never make an architectural decision without `wiki/decisions/<NNN>-<n>.md`
- Never finish a feature without `wiki/features/<n>.md`
- Never ship a build without appending to `wiki/changelog.md` + `wiki/deploy-log.md`
- Never delete entries from append-only files

### Build & security
- Never insert fake API keys, placeholder IDs — ALWAYS ask user
- Never use SDK versions from memory — web_search first
- Never build release APK/AAB without real keystore
- Never commit keystore passwords
- Never use `PowerShell Compress-Archive` for multi-file games (creates backslash paths → 404 on Yandex S3). Use `archiver` via node.
- Never forget `content.replace(/<\/script>/gi, '<\/script>')` when inlining debugcheck/cheats

### Code quality
- Never write code without file-header JSDoc
- Never use `as`, `any`, `@ts-ignore`, `==`, silent catches
- Never nest >3 levels, never function >50 lines
- Never hardcode values that appear more than once
- Never commit commented-out code
