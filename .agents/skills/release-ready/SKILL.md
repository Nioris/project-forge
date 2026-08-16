---
name: release-ready
kind: tactical
description: "Pre-release readiness orchestrator. Runs all per-platform fill-* and pre-submit validators, checks store listing completeness, credentials (keystore/API keys), i18n coverage…"
---

> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.

# $release-ready — Pre-Release Readiness Orchestrator

## Purpose

Before running `/release <platform>` or `/release all`, run this skill to verify ALL prerequisites are in place. It doesn't build anything — it just checks. Output is a red/yellow/green report per platform.

Goal: eliminate the "oh I forgot the store listing" / "oh the keystore isn't here" / "oh localization is 50% done" surprises that happen AT release time and cost real days.

## Arguments

`[INVOCATION_INPUT]` — one or more platform names, or "all":

- `$release-ready yandex` — check yandex only
- `$release-ready yandex vk` — check two
- `$release-ready all` — check all 7 platforms that have WorkProgress dirs
- `$release-ready rustore --soft` — documents+assets only (no APK build required) — useful BEFORE wrapper exists
- `$release-ready rustore --hard` — full check including APK + AppMetrica + RuStore SDK validation

If no argument — check all platforms that have a `WorkProgress/{Project}-<platform>/` directory.

### Soft vs Hard mode (v4.10.29+)

By default `$release-ready rustore` requires `WorkProgress/{Project}-rustore/` to exist. If wrapper not built yet, returns N/A.

**Soft mode** (`--soft` flag) checks **what can be validated without wrapper:**
- Store listing schema (`check-store-listing.mjs` if store-listing-ru.json exists)
- Platform completeness for documents/assets (`check-platform-completeness.mjs --platform=rustore`)
- Icon RuStore-compliant (rule 6.4 — full bg, no transparency)
- Privacy policy URL, support email в documents
- Category from RuStore dictionary
- AppMetrica config notes documented

**Hard mode** (`--hard` flag, default if wrapper present) — full check including:
- All soft mode checks
- APK or AAB built present
- AppMetrica integration verified (`check-appmetrica.mjs`)
- RuStore Pay SDK integrated if IAP declared
- Keystore valid + signed с release key (not debug)
- Min/target SDK versions correct

If wrapper exists, hard mode runs automatically. Use `--soft` explicitly if wrapper present but you want documents-only verification.

## Check matrix — what this skill verifies

For each platform, the following checks run. Each returns RED (blocker), YELLOW (warning), or GREEN (ok).

### Cross-platform checks

| Check | Blocker criteria |
|---|---|
| WorkProgress dir exists | `WorkProgress/{Project}-<platform>/` present |
| SDK wrapper integrated | Platform-specific SDK script loaded in index.html |
| Debug code not in production | No `debugcheck.js`, `cheats-base.js`, `?debug=1` accessible |
| Localization coverage | Platform-required languages present (Yandex needs 13, others optional) |
| No console.log left | Grep for `console.log\|console.debug` — should be near-zero |
| index.html entry exists | `WorkProgress/{Project}-<platform>/index.html` present |
| **Runtime test passes (MANDATORY)** | For **Yandex**: `node platforms/yandex/scripts/runtime-test.mjs WorkProgress/{Project}-yandex/` exit 0 — this copy has Probe A (REQ-4.4 ad-gesture), Probe C (lang), Probe D (pause), **Probe E (REQ-1.19.2 ready-timing, un-gameable)**, **Probe F (REQ-1.10.1 multi-viewport overflow)**, **Probe G (REQ-1.10.3 UI-over-canvas overlap)**. For other platforms: `node platforms/<p>/scripts/runtime-test.mjs` (or `scripts/runtime-test.mjs` for the generic behavioral test). ⚠️ Do NOT use the generic `scripts/runtime-test.mjs` for a Yandex release — it lacks Probe A/E and will silently miss 4.4 and 1.19 (the genetic-lab/samogonshchik miss). |
| **Store listing schema valid (MANDATORY for stores with listings)** | `node scripts/check-store-listing.mjs StoreData/` exit 0 — all store-listing-{lang}.json files conform to canonical schema, no forbidden fields, all required fields present |
| **SETUP_GUIDE valid (MANDATORY for Yandex)** | `node scripts/check-setup-guide.mjs <yandex-release-dir>/` exit 0 — all 17 sections present, no placeholders, no invalid tags/categories, references reference/ data, consistent with store-listing JSON |
| **AppMetrica integration valid (MANDATORY for RuStore hard mode)** | `node scripts/check-appmetrica.mjs platforms/rustore/` exit 0 — `mobmetricalib` dependency, API key UUID (not placeholder), manifest meta-data + permissions, `AppMetrica.activate()` + `enableActivityAutoTracking()` calls present. RuStore featured consideration requires analytics. |
| **External CDN check (MANDATORY for Yandex — RELEASE BLOCKER)** | `node scripts/check-external-cdn.mjs WorkProgress/{Project}-yandex/` exit 0 — no `<script src="https://...">`, no ES `import 'https://...'`, no external `<link href>` или `@import url(https://...)`. Yandex sandbox blocks external HTTP, moderation rejects builds с external refs. Yandex SDK whitelisted. Fix via `$bundle-libs`. |

### MANDATORY runtime test (v4.10.17)

Static checks catch structure bugs. Runtime test catches **behavioral** bugs that AI sometimes misses:

- Lang switch leaves Cyrillic in DOM (Самогонщик v1.9.5 case)
- LoadingAPI.ready never called (Yandex shows wrong loading bar)
- Asset 404s discovered only by browser

### ⚠️ "Couldn't verify" ≠ "passed" (genetic-lab v1.0.21 lesson)

REQ-4.4 (ad after a user gesture) and REQ-8.2.3 (no untranslated text on lang switch) checks can
return **"warn / play-through, re-check"** when the test session didn't happen to trigger an ad or a
lang switch. **A warn here is NOT a pass — it is an unverified blocker.** genetic-lab shipped because
its ad only fires on the 3rd sim-end after 60s, so the short test never fired it → checker warned →
warn was treated as OK → Yandex rejected (ad fired on sim auto-end, no gesture).

For Yandex, these MUST be actively proven before GREEN, via the yandex runtime-test Probe suite:
- **Probe A (REQ-4.4):** programmatically calls state-driven end functions (endGame, gameOver,
  **showResult, onComplete, roundOver…**) with NO gesture; if any ad fires (gestureDelta > 500ms) → BLOCKER.
- **Probe B:** real button clicks; ads must fire < 500ms after the gesture.
- **Probe C (REQ-8.2.3):** `setLang('en')` + DOM scan; any Cyrillic left in visible UI → BLOCKER.

Run `node platforms/yandex/scripts/runtime-test.mjs <yandex-build>/` — this is the copy with the
4.4 trap. If Probe A/C report "no state-fn found / no ad fired", do NOT mark GREEN on the strength of
a warn — confirm the ad/lang paths manually. `check-drift.mjs` guards that this trap stays present.
- DOM not rendered (JS works but UI invisible)
- SDK contract violations (init/start/stop sequence wrong)

**Before saying "ready to ship", invoke:**

```bash
# Yandex (has Probe A REQ-4.4 + Probe E REQ-1.19.2 + lang/pause probes):
node platforms/yandex/scripts/runtime-test.mjs WorkProgress/{Project}-yandex/
# Other platforms (generic behavioral test):
node scripts/runtime-test.mjs WorkProgress/{Project}-<platform>/
```

Scenarios run: startup, lang, assets, dom, sdk. Each must pass.

**Puppeteer is auto-installed** by runtime-test if missing (one-time). If auto-install fails, the
script exits **3 = UNVERIFIED**, which is a BLOCKER, not a skip. Never report GREEN on an unverified
runtime — a probe that didn't run is a false pass (genetic-lab v1.0.21 shipped exactly this way).

**HARD RULE:** runtime-test exit non-zero → RED for that platform, regardless of other checks.
- exit 0 = passed
- exit 2 = usage/config error (bad path, no index.html) → fix and re-run
- exit 3 = puppeteer unavailable, behavioral probes did NOT run → **UNVERIFIED = BLOCKER**, never GREEN

### Platform-specific checks

**Yandex:**
- `game.description.ru` and `game.description.en` in store-listing  ≥120 chars
- At least 3 screenshots in store-listing assets
- Icon 1024x1024 present
- 11 validators via `node platforms/yandex/scripts/pre-submit.mjs`
- Runtime-test passes (puppeteer auto-installed; exit 3 = unverified = BLOCKER, never skip)

**VK:**
- VK Bridge integrated, `VKWebAppInit` is first bridge call
- 3 validators via `node platforms/vk/scripts/pre-submit.mjs`
- If VK Pay used: `amount` inside `params:{}`, action enum valid
- App icon + cover in store-listing

**Telegram:**
- `Telegram.WebApp.ready()` called
- HTTPS-only URLs in bundle (no http://)
- 5 validators via `node platforms/telegram/scripts/pre-submit.mjs`
- Runtime-test passes
- Bot token in env (not in source)

**OK:**
- `window.API_callback` defined globally (FAPI contract)
- Rewarded preload → show sequence
- 1 validator + runtime-test via `node platforms/ok/scripts/pre-submit.mjs`

**MAX:**
- MaxSDK wrapper (renames `window.WebApp` → `window.MaxSDK` to avoid Telegram conflict)
- URL ≤1024 chars, latin+digits+.+-
- 5 validators via `node platforms/max/scripts/pre-submit.mjs`
- Legal entity / ИП requirement known (manual confirmation)

**RuStore:**
- Release keystore exists in expected location (check path, do NOT open)
- `AndroidManifest.xml` has correct applicationId
- If IAP: Pay SDK 10.2+ integrated, receipt validation endpoint reachable (smoke test)
- If cloud sync: user_bonus grant idempotency implemented
- Privacy policy URL in listing

**Web (self-hosted):**
- `Dockerfile` present (or deploy script for chosen target)
- `nginx.conf` valid (if Docker)
- HTTPS cert plan documented (Let's Encrypt / Cloudflare / custom)

**Steam:**
- `package.json` has `electron` + `steamworks.js` (or legacy `greenworks`)
- `steam_appid.txt` exists, contains real App ID (not 480 = SpaceWar test)
- Electron `main.js` calls `steamworks.restartAppIfNecessary` BEFORE `init`
- Native binary present: `steam_api64.dll` / `libsteam_api.so` / `libsteam_api.dylib` in lib/
- 5 validators via `node platforms/steam/scripts/pre-submit.mjs`
- Steamworks Partner account approved + Steam Direct fee paid (manual confirmation)
- `app_build.vdf` + `depot_build.vdf` present и AppID совпадает с steam_appid.txt
- Build account отдельный от main developer (security best practice)

**VK Play (vkplay.ru — НЕ путать с VK Mini Apps):**
- VK Play SDK script in HTML (`<script src="https://vkplay.ru/embed/v1/sdk.js">`)
- `VKPlaySDK.init()` или `window.onVKPlaySDKReady` callback registered
- secret_key NOT в client code (server-only, env var)
- Client reads `uid`, `hash`, `app_id` из URL и POST'ит на server для verification
- Server has `/api/auth/vkplay` endpoint using `verifyVKPlayHash` from sign-helper.mjs
- Payment webhook idempotent by `order_id`
- HTTPS-only (no http:// in bundle)
- 5 validators via `node platforms/vkplay/scripts/pre-submit.mjs`
- Developer account approved (developers.vkplay.ru), Game card created
- Payment system enabled (manual: integration@vk.team)

## Execution flow

### Step 1: Discover projects and platforms

```bash
# Find all WorkProgress dirs with platform suffix
ls -d WorkProgress/*/ | grep -oE '-[a-z]+/$' | sort -u
```

Determine which platforms have `WorkProgress/{Project}-<platform>/` dirs.

### Step 2: Run checks per platform

For each target platform, iterate the check matrix. For each check:
- Exit code 0 + no warnings → GREEN ✓
- Exit code 0 + warnings → YELLOW ⚠
- Exit code ≠ 0 OR missing file → RED ✗

### Step 3: Compose readiness report

Output format (per platform):

```
═══════════════════════════════════════
  Release-Ready: {Platform}
═══════════════════════════════════════
  Overall: RED (3 blockers) / YELLOW (4 warnings) / GREEN (ready)

  ✓ WorkProgress/{Project}-yandex/ exists
  ✓ SDK wrapper integrated (yandex-sdk-wrapper.js)
  ✓ pre-submit validators — 11/11 pass
  ✗ Store listing description RU: 67 chars (need ≥120)
  ✗ Only 2 screenshots, need ≥3
  ⚠ Localization 11/13 languages (missing AR, HI)
  ✓ Icon 1024x1024 present
  ⚠ 7 console.log found in bundle (review before ship)

  Next action:
  → Run $fill-yandex to complete store listing (2 blockers)
  → Add translations for AR, HI or skip with explicit note
  → Strip console.log via: grep -rn 'console\.' WorkProgress/{Project}-yandex/ | grep -v debugcheck
═══════════════════════════════════════
```

**ALWAYS append the MANUAL checklist** (do not let GREEN imply "fully cleared"). These are the
requirements Forge CANNOT prove statically — see `wiki/requirements-coverage.md` (the MANUAL rows).
Even on a GREEN automated result, print:

```
  ── Проверь сам (Forge не может проверить автоматически) ──
  □ Контент (3.4): нет политики/религии/эзотерики/насилия над детьми/предсказаний здоровья
  □ Геймплей (2.4/2.8/2.9): есть механика, нарастающая сложность, >10 мин контента
  □ Качество (2.1): игра играбельна, нет тупиков, есть рестарт/меню
  □ Управление мобайл (1.6.1.5) — полностью жестами; одной рукой (1.10.4)
  □ Кросс-браузер (1.20): Chrome/FF/Safari/Яндекс, моб. Android+iOS
  □ Медиа (8.3): иконка/обложка без рамок/скруглений/системного UI, не скриншот (5.6)
  □ Название уникально в каталоге (5.12); орфография текстов (8.2.1)
  □ Облачные сохранения отмечены в черновике, если используются (1.11)
  □ Покупки убраны из черновика, если кода покупок нет (1.13)
```
GREEN means "all AUTO checks pass" — it never means the MANUAL list is done. State this explicitly.

### Step 4: Aggregate all-platform summary

If checking multiple platforms, end with:

```
═══════════════════════════════════════
  RELEASE READINESS — all platforms
═══════════════════════════════════════
  yandex:    RED    — 3 blockers, 2 warnings
  vk:        YELLOW — 0 blockers, 1 warning
  telegram:  GREEN  — ready
  ok:        GREEN  — ready
  max:       RED    — legal entity confirmation needed
  rustore:   YELLOW — privacy URL missing in listing
  web:       GREEN  — ready

  Can ship now: telegram, ok, web
  Need fixes:   yandex, max, rustore

  Recommended order:
    1. Fix RED blockers (yandex store listing, max legal entity)
    2. Re-run $release-ready yandex max
    3. Ship GREEN platforms via /release all
    4. Ship YELLOW platforms with explicit acknowledgment of warnings
═══════════════════════════════════════
```

## Execution details

### Where the checks actually live

This skill does not duplicate validator logic. It calls into:
- `node platforms/<p>/scripts/pre-submit.mjs` — for validator suite
- `node platforms/<p>/scripts/runtime-test.mjs` — if runtime tests exist for platform
- Grep/find for file existence checks
- Read of store-listing HTML/JSON/MD files from `WorkProgress/{Project}-<platform>/store-listing/` or `assets/store-listing/`

### How to tell the user to fix

For each RED blocker, output a specific "Next action" line naming the skill/command to run. Don't just say "incomplete" — say `Run $fill-yandex`.

For YELLOW warnings, explain what the warning is about and what the user's options are ("localize the remaining 2 languages" OR "ship as-is with 11/13").

## Non-Negotiable

- [ ] **Never ships anything.** Read-only: no file modifications, no builds, no uploads.
- [ ] Reports RED/YELLOW/GREEN per platform — never just a binary ready/not-ready.
- [ ] Names specific next action per issue (skill/command).
- [ ] Groups platforms by readiness state in summary.
- [ ] If a platform's WorkProgress dir doesn't exist — mark as N/A, not RED.
- [ ] Does NOT invalidate caches, does NOT trigger hooks beyond normal tool use.

## Anti-patterns

- Do NOT say "all green" if there are any RED blockers (user might miss them).
- Do NOT invent platform checks that aren't in the validator suite — if validator doesn't check it, this skill shouldn't claim to either.
- Do NOT block shipping on YELLOW (warnings are informational, user decides).
- Do NOT run `npm install` or any build step — this is verification, not prep.

## Related skills

- `$gate <platform>` — runs JUST the pre-submit validators, no extra checks
- `$fill-yandex`, `$fill-vk`, `$fill-rustore` — store listing helpers (what release-ready tells user to run when listing is incomplete)
- `/release <platform>` — actual build (what to run AFTER release-ready is GREEN)
- `/release all` — multi-platform build (after release-ready shows all GREEN)
- `$credentials-check` — deeper security audit (keystore, API keys, env vars)

## When to use vs alternatives

Use `$release-ready` when:
- You're about to release, want a single screen that shows blockers across platforms
- You've been working for a while and don't remember what's done vs not
- You want a clear list of "next actions" before calling `/release`

Use `$gate <platform>` when:
- You already know store-listing/keystore/etc is fine, just want validator result
- You're iterating on code fixes and want fast feedback

Use `/release <platform>` directly when:
- You've already run `$release-ready` and got GREEN
- Or you're in a rush and willing to catch blockers at build time
