---
name: pre-submit-gate
description: Mandatory gate before building release ZIPs or saying a game is "ready". Runs full pre-submit validation suite. Use BEFORE any ZIP build or "ready for moderation" announcement. Triggers on - готовлю билд / собираю ZIP / готово к отправке / pre-submit / final check / отправляем на модерацию.
---

# pre-submit-gate

**Mandatory gate** before any release. **Three scripts** that complement each other; ALL must pass before building ZIP / saying "ready" / submitting.

```bash
node scripts/pre-submit.mjs WorkProgress/{Game}/    # static (9 validators, 30+ REQ)
node scripts/smoke-test.mjs WorkProgress/{Game}/    # runtime crashes + freezes ≥500ms
node scripts/runtime-test.mjs WorkProgress/{Game}/  # REQ-4.4/4.5 ad-without-gesture
```

| Layer | What it catches | Limitations |
|---|---|---|
| `pre-submit` (static regex) | Title CAPS, store-listings limits, missing i18n, hardcoded currency, ad from `setInterval`, ad inside `endGame`/`gameOver`/`onDeath` (state-fn blacklist) | Can't see runtime behavior. Doesn't run the game. |
| `smoke-test` (puppeteer, passive) | JS crashes during boot, Long Tasks ≥500ms (freezes) | Doesn't trigger gameplay. Misses state-driven ad calls that need a function call. |
| `runtime-test` (puppeteer + active probes) | **Probe A**: REQ-4.4 trap — programmatically calls `endGame`/`gameOver`/`onDeath`/etc with NO prior user gesture; if `showFullscreenAdv` fires → BLOCKER. **Probe B**: dispatches real button clicks, verifies ads fire within 500ms of gesture. **Probe C**: REQ-8.2.3 trap — calls `setLang('en')` + DOM scan; flags any Cyrillic text remaining in visible UI (HTML defaults that bypass applyStaticLang, or elements that lost their onLangChange registration). | Heuristic — if game uses unusual function names, Probe A may miss them (manual verify). |

**Without 0 blockers from ALL three, do NOT build ZIP, do NOT say "ready", do NOT submit.**

## When to invoke
- Before `scripts/build-release.sh` or any `archiver`-based ZIP creation
- Before final "ready" message to user
- After any structural change (new ad call, new lang block, new store-listing field)
- When user says "проверь готовность", "готов к отправке", "финальный билд"

## How to run

```bash
# Single game
node scripts/pre-submit.mjs WorkProgress/{GameName}/

# All games at once (smoke check)
node scripts/pre-submit.mjs --all

# Verbose (every issue, not just blockers)
node scripts/pre-submit.mjs WorkProgress/{GameName}/ --verbose

# JSON for parsing
node scripts/pre-submit.mjs WorkProgress/{GameName}/ --json
```

Exit codes:
- `0` — no blockers (warnings/info OK to ship — review them manually)
- `1` — at least one blocker — DO NOT ship
- `2` — fatal error in a validator (bug in tooling)

Output also written to `WorkProgress/{GameName}/.pre-submit-report.json` for CI/parsing.

## Reading the report

Each blocker has:
- `id` — REQ identifier (e.g. `REQ-8.2.1-CAPS`)
- `level` — `blocker` | `warning` | `info`
- `message` — what's wrong
- `citation` — direct quote from Yandex docs (or moderator)
- `url` — link to the requirements page
- `file`, `field`, `line` — exact location

## Decision tree on FAIL

For each blocker:

1. **Read the citation.** It's a direct quote from Yandex docs / moderator. Not negotiable.
2. **Find the exact file:line** from the report.
3. **Fix the code/data.** Examples:
   - REQ-8.2.1-CAPS: rename title in store-listing-{lang}.json AND in HTML `<title>` AND in I18N `metro_title`/`gameTitle`. Use proper case (`Metro` not `METRO`).
   - REQ-1.19.2-PRECISION: move `LoadingAPI.ready()` to `requestAnimationFrame(() => requestAnimationFrame(() => Plat.ready()))` AFTER `applyStaticLang()` AND removing the loading screen.
   - REQ-2.14: ensure `detectLang()` is called inside `Plat.init().then(...)` BEFORE any UI render. Avoid `?.` on `environment.i18n.lang`.
   - REQ-4.4: never call `showFullscreenAdv` from `setInterval`/`setTimeout`/render loop. Always from a click handler.
   - REQ-4.5.1: every RV button must have visible text combining ad-keyword (`Реклама`/`Watch ad`/`Reklam izle`) AND reward (`+50 монет`/`+5 lives`).
   - REQ-3.8: replace hardcoded `100₽` with `100 ${Plat.payments.getCurrencyImage()}` or similar.
   - REQ-FIELD-KEYWORDS: shorten keywords to ≤100 chars total (joined). Keep most relevant.
4. **Re-run pre-submit.** Repeat until 0 blockers.

## What is NOT covered (manual checks)

These cannot be statically validated. After pre-submit passes, manually verify:

- **REQ-2.3** Genre matches: open the game, play 5 minutes, confirm category in store-listing matches genre.
- **REQ-1.9** Save round-trip: play, refresh page, confirm progress preserved.
- **REQ-1.13.5** Purchase applies: in marketing build mock-buy, confirm item appears in inventory/balance.
- **REQ-4.5.2** RV not mandatory: try playing through main loop without watching any RV. If you can't progress — fail.
- **MOD-SCREENSHOT-LANG** Screenshots per language: when uploading to Yandex Console, attach per-language screenshots manually.

## Warnings vs blockers

- **Blocker** — moderator will reject. Fix before submit.
- **Warning** — risky, but moderator may pass. Review the citation, decide based on context. Examples:
  - "RV button text has ad keyword but no explicit reward" — may pass if context obvious
  - "English UI word in es block: 'No disponible'" — could be legit (Spanish phrase)
  - "Optional chaining on i18n" — works but fragile

When unsure about a warning, ASK the user. Don't silently dismiss.

## Past mistake to avoid

We previously masked `localStorage` calls as `window['local'+'Storage']` to bypass `verify.sh` warnings. **Do not do this.** Pre-submit doesn't ban `localStorage` — it requires it to be inside `try/catch` or behind `if (_isLocal)` fallback. Real fallbacks are fine; cosmetic masking is misleading.

## Trust calibration

- Approved games (Metro, Block2048) currently have **23+ blockers** that moderation missed. They're not safe references — could fail next release.
- **The validator is stricter than moderation by design.** This is correct. Better to over-fix than to gamble.

---

## 🟦 Build matrix (after pre-submit passes)

Once pre-submit shows 0 blockers, build **3 ZIPs** with strict roles. Never collapse them into one — each has a different audience.

| Build | Contents | Audience |
|---|---|---|
| **production** `{Game}-v{N}.zip` | ONLY index.html + game assets. **NO** debugcheck, **NO** cheats, **NO** `.pre-submit-report.json`, **NO** internal markers (TODO/FIXME, debug flags) | Yandex moderation |
| **debug** `{Game}-v{N}-debug.zip` | production + `templates/html5/debugcheck.js` inlined into `<head>` after `/sdk.js` + `.pre-submit-report.json` (so the v2.5 banner can fetch it) | Internal QA — open in Yandex dev slot, press **Ctrl+Shift+2 ×3** for the runtime panel |
| **marketing** `{Game}-v{N}-marketing.zip` | debug + `templates/html5/cheats-base.js` inlined before `</body>` with game-specific buttons replacing the `gameButtons = [...]` block | Demo videos, influencers, **YG Screenshot extension** for per-language screenshots |

### ⚠️ Marketing build MUST include BOTH cheats and debugcheck
Common mistake: only adding cheats. Marketing build is what the team uses for screenshot generation across 13 languages — the debug panel is needed there too so the operator can verify (during a screenshot session) that `setLang` switching is reactive and no Russian text leaked into the non-RU locale.

### ⚠️ YG Screenshot Extension compatibility
The extension at `tools/game-screenshot-ext` programmatically calls (via Chrome DevTools Protocol):
```js
setLang(lang);
// — or —
_lang = lang; applyStaticLang(); ui(); renderAll();
```
For this to work the game MUST expose:
- `var _lang = '...'` (NOT `let`/`const` — these are not on `window`)
- `function setLang(lang)` as a top-level function (not nested)
- `function applyStaticLang()` global
- `function ui()` and any `renderAll()` global if used

If the game uses `let _lang`, the extension can't write it → screenshots all come out in default language. Add a safe top-level `var _lang;` alias if the codebase uses block-scoped declarations.

### ⚠️ Inlining gotcha — `</script>` literals break the wrapper
When inlining `debugcheck.js` or `cheats-base.js`:
```js
const inject = '<script>\n' + fs.readFileSync(file, 'utf8') + '\n</script>';
```
**any literal `</script>` inside the file (even in JSDoc comments) closes the wrapper tag prematurely.** The browser parses the rest as HTML body text → the panel's keydown handler never registers → user reports "panel doesn't open" with no console error from debugcheck itself.

**Mandatory protection:**
```js
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/<\/script>/gi, '<\\/script>');  // ← REQUIRED
const inject = '<script>\n' + content + '\n</script>';
```
Apply to BOTH `debugcheck.js` AND `cheats-base.js`. Also keep `<\/script>` (escaped) in any docblock inside those files as a second line of defense.

### Build script naming
Per-game one-off scripts: `scripts/build-{Game}.mjs` (e.g. `scripts/build-circle2048.mjs`).
Generic alternative: `scripts/build-release.sh` for multi-file games (uses `archiver` npm — NEVER PowerShell `Compress-Archive`, it produces backslash paths that 404 on Yandex S3).

### Sanity check after build
```bash
# Production must have ONLY index.html (no internal data leaked)
unzip -l Release/{Game}/{Game}-v{N}.zip
# Debug must have index.html + .pre-submit-report.json + debugcheck signature
unzip -p Release/{Game}/{Game}-v{N}-debug.zip index.html | grep -c "debugcheck\|Ctrl+Shift+2"
# Marketing must have BOTH debugcheck AND cheats signatures
unzip -p Release/{Game}/{Game}-v{N}-marketing.zip index.html | grep -cE "debugcheck|cheat-panel|gameButtons"
```
