---
name: debugcheck-enhance
description: "Enhance debugcheck.js with RUNTIME checks that catch the actual rejection reasons. Current panel does static regex analysis — misses timing issues, overflow, actual ad behavior. This skill adds behavioral probes. Triggers on: debug, debugcheck, panel, false positive, shows OK but rejected, moderation fail, verification."
---

# Enhance Debug Panel — Runtime Checks

## Purpose
Current debugcheck.js says ✅ but moderation rejects. Why? It only does regex (static analysis). Real problems are RUNTIME: GameReady fires too early, language switches after UI visible, elements overflow on small screens, ads fire without user click. This skill adds runtime probes that catch what regex cannot.

## ⚠️ Rules
- Modify ONLY `templates/html5/debugcheck.js`
- Add NEW check categories — don't delete existing ones
- All new checks go into existing CATS array
- Keep activation: Ctrl+Shift+2 × 3 (panel UI)
- Keep same UI style (dc-* classes)

## 🔴 Self-Detection Gotcha (debugged Apr 2026, v2.6 — Circle 2048)

When debugcheck.js is **inlined** into the game HTML (single-file games), every regex literal in its check definitions appears in the source that `getSource()` reads back. So:
```js
{name:'No alert()', test:s=>!/alert\(/.test(s), failText:'alert() found!'}
```
self-matches `alert(` inside its own regex literal, and the panel reports "alert() found!" even when the game has zero alerts.

The fix is non-negotiable: any `templates/html5/*.js` file that gets inlined into a build MUST be wrapped in `// === <NAME>_SELF_START ===` / `// === <NAME>_SELF_END ===` markers, and `getSource()` MUST strip those blocks before scanning.

Markers exist in:
- `templates/html5/debugcheck.js` → `DEBUGCHECK_SELF_START/END`
- `templates/html5/cheats-base.js` → `CHEATS_SELF_START/END`

If you add a new template that gets inlined (e.g. `analytics-shim.js`), wrap it with markers and add a strip pass in `getSource()`. Otherwise expect ~10 false-positive FAILs the first time someone runs the panel against the marketing build.

When adding new checks that return `{pass:false}` as a "feature absent" guard (like the v2.5 IAP guards), tag them with `guard:true` so the optional-category short-circuit doesn't treat the FALSE pass as evidence the feature is in use.

## 🔴 Inlining Gotcha (debugged Apr 2026 — Circle 2048)

When a build script inlines `debugcheck.js` into HTML via:
```js
const inject = '\n<script>\n' + fs.readFileSync('debugcheck.js') + '\n</script>\n';
```
**any literal `</script>` inside the file (even in comments or strings) closes
the wrapping `<script>` tag prematurely.** The browser parses the rest as HTML
text, the panel never registers its keydown handler, and the user sees
"panel doesn't open" with no console error from debugcheck itself (just an
unrelated parser hiccup further down).

**Mandatory protection in any build script that inlines:**
```js
let debug = fs.readFileSync('debugcheck.js', 'utf8');
debug = debug.replace(/<\/script>/gi, '<\\/script>');  // <-- REQUIRED
const inject = '\n<script>\n' + debug + '\n</script>\n';
```
Same applies to `cheats-base.js` if inlined for marketing builds.

When loading via `<script src="debugcheck.js"></script>` (external file) the
problem doesn't exist — but our single-file games have no `js/` folder so
inlining is the only option.

## 🔴 CRITICAL: Script Loading Order

debugcheck.js has TWO parts:
1. **PROBES** — timing hooks, monkey-patches — must run BEFORE game code
2. **PANEL UI** — display overlay — opens on Ctrl+Shift+2

Current problem: script in `</body>` = probes load AFTER game = miss GameReady timing.

**FIX: Move to `<head>` with defer:**
```html
<!-- In <head>, BEFORE game scripts: -->
<script src="debugcheck.js"></script>

<!-- NOT before </body> — too late for timing probes! -->
```

**CRITICAL: Games use SDK wrappers, not raw window.ysdk!**
Known wrappers to intercept: `window.ysdk`, `YandexSDK._ysdk`, `Plat.ysdk`, `Plat._ysdk`
Use BOTH: YaGames.init() interception (catches creation) + 50ms polling (catches wrappers).
NEVER use setTimeout(1000) — SDK initializes in 200-500ms, you'll miss it.

**Inside debugcheck.js — split into immediate probes + deferred panel:**
```javascript
// TOP OF FILE — runs immediately when script loads (before game)
const TIMING = { /* domReady, fontsLoaded, gameReady, etc. */ };

// CRITICAL: Two-method interception strategy.
// Method 1 (primary): Intercept YaGames.init() BEFORE game calls it.
// This catches ysdk the MOMENT it's created — before game code gets it.
if (typeof YaGames !== 'undefined' && YaGames.init) {
  var _origInit = YaGames.init;
  YaGames.init = function() {
    TIMING.record('sdkInit');
    return _origInit.apply(this, arguments).then(function(sdk) {
      _patchYSDK(sdk);  // patch ready(), start(), showAd() on fresh ysdk
      return sdk;
    });
  };
}

// Method 2 (fallback): Poll every 50ms for ALL known SDK wrappers.
// Games use different wrappers: window.ysdk, YandexSDK._ysdk, Plat.ysdk, Plat._ysdk
var _pollTimer = setInterval(function() {
  if (window.ysdk) _patchYSDK(window.ysdk);
  if (window.YandexSDK && YandexSDK._ysdk) _patchYSDK(YandexSDK._ysdk);
  if (window.Plat && Plat.ysdk) _patchYSDK(Plat.ysdk);
  if (window.Plat && Plat._ysdk) _patchYSDK(Plat._ysdk);
  if (TIMING._patched) clearInterval(_pollTimer);
}, 50); // 50ms, NOT 1000ms! SDK initializes in 200-500ms

// ⚠️ NEVER use setTimeout(fn, 1000) — too slow, misses GameReady
// ⚠️ NEVER check only window.ysdk — games use wrappers (YandexSDK, Plat)

// BOTTOM OF FILE — panel UI creation, runs on activation
// Ctrl+Shift+2 × 3 still opens the panel
// Panel reads TIMING data that was collected since page load
```

**Build script must put debugcheck.js in `<head>`, not `</body>`.**
When building debug ZIP: add `<script src="debugcheck.js"></script>` to `<head>` AFTER `/sdk.js` but BEFORE any game scripts.

---

## Step 1: Add Timing Probes (inject at top of debugcheck.js)

These hooks RECORD when SDK events actually fire, so the panel can verify ORDER.

```javascript
// ── Runtime Timing Probes (inject after RT object) ──────────────
const TIMING = {
  domReady: 0,
  firstPaint: 0,
  fontsLoaded: 0,
  sdkInit: 0,
  gameReady: 0,      // LoadingAPI.ready()
  gameplayStart: 0,   // GameplayAPI.start()
  langDetected: 0,    // moment i18n.lang was read
  firstAdShown: 0,
  firstUserClick: 0,  // first actual click/tap
  firstInterstitial: 0,
  log: [],
  record(event) {
    const t = performance.now();
    this[event] = t;
    this.log.push({ event, time: t, delta: t - this.domReady });
  }
};

// Auto-record DOM events
document.addEventListener('DOMContentLoaded', () => TIMING.record('domReady'));
window.addEventListener('load', () => TIMING.record('firstPaint'));
document.fonts.ready.then(() => TIMING.record('fontsLoaded'));

// Record first user interaction
['click', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, function handler() {
    if (!TIMING.firstUserClick) TIMING.record('firstUserClick');
    document.removeEventListener(evt, handler);
  }, { once: true });
});

// Monkey-patch SDK methods to record timing
(function patchSDK() {
  // Patch LoadingAPI.ready()
  const origReady = window.ysdk?.features?.LoadingAPI?.ready;
  if (origReady) {
    window.ysdk.features.LoadingAPI.ready = function() {
      TIMING.record('gameReady');
      console.log('[DBG] LoadingAPI.ready() at', Math.round(TIMING.gameReady), 'ms');
      return origReady.apply(this, arguments);
    };
  }

  // Patch GameplayAPI.start()
  const origStart = window.ysdk?.features?.GameplayAPI?.start;
  if (origStart) {
    window.ysdk.features.GameplayAPI.start = function() {
      TIMING.record('gameplayStart');
      return origStart.apply(this, arguments);
    };
  }

  // Patch showFullscreenAdv to check if user clicked first
  const origFS = window.ysdk?.adv?.showFullscreenAdv;
  if (origFS) {
    window.ysdk.adv.showFullscreenAdv = function(cfg) {
      TIMING.record('firstInterstitial');
      if (!TIMING.firstUserClick) {
        TIMING.log.push({ event: 'AD_WITHOUT_CLICK', time: performance.now(), 
          warning: 'Interstitial shown before any user interaction!' });
      }
      return origFS.apply(this, arguments);
    };
  }

  // Retry patching if SDK not loaded yet
  if (!window.ysdk) setTimeout(patchSDK, 1000);
})();
```

## Step 2: New Check Categories to Add to CATS array

### Category: Timing Verification (п.1.19 — #1 rejection reason)

```javascript
{
  id: 'timing', title: 'Timing Verification', icon: '⏱️', checks: [
    {
      name: 'GameReady after fonts',
      desc: 'п.1.19 — ready() must fire AFTER fonts loaded',
      test: function() {
        if (!TIMING.gameReady) return 'warn';
        if (!TIMING.fontsLoaded) return 'warn';
        return TIMING.gameReady > TIMING.fontsLoaded;
      },
      warnText: 'Not detected yet — interact with game first, then re-check',
      failText: 'LoadingAPI.ready() fired BEFORE fonts loaded! Move ready() after document.fonts.ready'
    },
    {
      name: 'GameReady after first paint',
      desc: 'п.1.19 — ready() must fire AFTER title screen is visible',
      test: function() {
        if (!TIMING.gameReady) return 'warn';
        if (!TIMING.firstPaint) return 'warn';
        // ready() should be at least 100ms after first paint (UI needs time to render)
        return (TIMING.gameReady - TIMING.firstPaint) > 50;
      },
      warnText: 'Not detected yet — re-check after game loads',
      failText: 'LoadingAPI.ready() fired immediately with page load — must wait for title screen to RENDER'
    },
    {
      name: 'GameReady not too late',
      desc: 'п.1.19 — ready() should fire within 10s of load',
      test: function() {
        if (!TIMING.gameReady) return 'warn';
        return (TIMING.gameReady - TIMING.domReady) < 10000;
      },
      warnText: 'Not detected yet',
      failText: 'LoadingAPI.ready() took >10s — moderation may flag as slow'
    },
    {
      name: 'Language before GameReady',
      desc: 'п.2.14 — language must be detected BEFORE ready()',
      test: function() {
        if (!TIMING.gameReady) return 'warn';
        if (!TIMING.langDetected) {
          // Check if lang was set in code (static check fallback)
          return 'warn';
        }
        return TIMING.langDetected < TIMING.gameReady;
      },
      warnText: 'Language detection timing not captured — verify manually: is UI already translated when ready() fires?',
      failText: 'Language detected AFTER ready()! Player sees wrong language for a moment → rejection п.2.14'
    },
    {
      name: 'Timing log',
      desc: 'Sequence of SDK events (click to see)',
      test: function() {
        // Always show as info
        return TIMING.log.length > 0 ? true : 'warn';
      },
      warnText: 'No events recorded yet — play the game, then re-check'
    },
  ]
},
```

### Category: Visual Overflow Check (п.1.10.1)

```javascript
{
  id: 'overflow', title: 'Visual Overflow (п.1.10.1)', icon: '📐', checks: [
    {
      name: 'No elements overflow viewport',
      desc: 'п.1.10.1 — nothing outside screen bounds',
      test: function() {
        const all = document.querySelectorAll('*');
        const overflowed = [];
        const vw = window.innerWidth, vh = window.innerHeight;
        all.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (getComputedStyle(el).display === 'none') return;
          if (r.right > vw + 2 || r.bottom > vh + 2 || r.left < -2 || r.top < -2) {
            if (el.closest('.dc-overlay')) return; // skip debug panel itself
            overflowed.push({
              tag: el.tagName,
              id: el.id || '',
              class: (el.className || '').toString().slice(0, 30),
              rect: `L:${Math.round(r.left)} T:${Math.round(r.top)} R:${Math.round(r.right)} B:${Math.round(r.bottom)}`
            });
          }
        });
        if (overflowed.length === 0) return true;
        // Store for display
        RT._overflowed = overflowed;
        return false;
      },
      failText: 'Elements overflow viewport! Check RT._overflowed in console for details'
    },
    {
      name: 'Canvas fills available space',
      desc: 'п.1.6.2.1 — game area stretches to edges',
      test: function() {
        const canvas = document.querySelector('canvas');
        if (!canvas) {
          const gameDiv = document.getElementById('game') || document.querySelector('[id*=game]');
          if (!gameDiv) return 'warn';
          const r = gameDiv.getBoundingClientRect();
          return (r.width >= window.innerWidth * 0.95 || r.height >= window.innerHeight * 0.95);
        }
        return (canvas.width >= window.innerWidth * 0.9 && canvas.height >= window.innerHeight * 0.9)
          || (canvas.clientWidth >= window.innerWidth * 0.9);
      },
      warnText: 'No canvas or #game found',
      failText: 'Game area does not fill screen — must stretch to edges (п.1.6.2.1)'
    },
    {
      name: 'Text not overflowing containers',
      desc: 'п.1.10.3 — no text clipping',
      test: function() {
        const issues = [];
        document.querySelectorAll('div, span, p, button, label, h1, h2, h3').forEach(el => {
          if (el.closest('.dc-overlay')) return;
          if (getComputedStyle(el).display === 'none') return;
          if (el.scrollWidth > el.clientWidth + 4 && getComputedStyle(el).overflow !== 'hidden') {
            issues.push(el.tagName + (el.id ? '#' + el.id : '') + '.' + (el.className || '').toString().slice(0, 20));
          }
        });
        if (issues.length === 0) return true;
        RT._textOverflow = issues;
        return issues.length <= 2 ? 'warn' : false;
      },
      warnText: 'Some text may overflow — check RT._textOverflow in console',
      failText: 'Multiple text overflow issues! Check RT._textOverflow'
    },
    {
      name: 'Touch targets >= 44px',
      desc: 'п.1.8 — buttons big enough to tap',
      test: function() {
        const small = [];
        document.querySelectorAll('button, [onclick], [role=button], a, input, .btn').forEach(el => {
          if (el.closest('.dc-overlay')) return;
          if (getComputedStyle(el).display === 'none') return;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
            small.push({ tag: el.tagName, id: el.id, w: Math.round(r.width), h: Math.round(r.height) });
          }
        });
        if (small.length === 0) return true;
        RT._smallButtons = small;
        return small.length <= 2 ? 'warn' : false;
      },
      warnText: 'Some buttons may be too small — check RT._smallButtons',
      failText: 'Multiple buttons < 44px! Check RT._smallButtons in console'
    },
  ]
},
```

### Category: Ad Behavior Verification (п.4.4, 4.5)

```javascript
{
  id: 'ad_behavior', title: 'Ad Behavior (Runtime)', icon: '📺', checks: [
    {
      name: 'No interstitial before user click',
      desc: 'п.4.4 — ad only after user interaction',
      test: function() {
        const adBeforeClick = TIMING.log.find(e => e.event === 'AD_WITHOUT_CLICK');
        if (adBeforeClick) return false;
        if (!TIMING.firstInterstitial) return 'warn';
        return TIMING.firstInterstitial > TIMING.firstUserClick;
      },
      warnText: 'No interstitial shown yet — play through to trigger one, then re-check',
      failText: 'Interstitial shown BEFORE user clicked anything! Must be after button press (п.4.4)'
    },
    {
      name: 'Ad cooldown >= 60s',
      desc: 'п.4.4 — not too frequent',
      test: function(s) {
        // Static: look for cooldown/timer implementation
        if (pat(s, /cooldown|adTimer|lastAd|adInterval|MIN_AD_INTERVAL/i)) return true;
        // Check for 60000 or 60 * 1000
        if (pat(s, /60000|60\s*\*\s*1000/)) return true;
        return 'warn';
      },
      warnText: 'No explicit ad cooldown found in code — verify ads dont show more often than every 60s'
    },
    {
      name: 'RV button has ad marker text',
      desc: 'п.4.5.1 — user must know its an ad with a reward',
      test: function() {
        // Runtime: find buttons with reward/ad indicators
        const buttons = document.querySelectorAll('button, [onclick], [role=button]');
        let rvButtons = 0, markedButtons = 0;
        buttons.forEach(btn => {
          const text = (btn.textContent || '').toLowerCase();
          const hasReward = /reward|наград|бонус|x2|удвои|продолж|continue|free|бесплатн|\+\d/.test(text);
          const hasAdMarker = /рекла|ad|video|видео|📺|▶|🎬|смотр|watch/.test(text) 
            || btn.querySelector('img[src*=ad], img[src*=video], [class*=ad], [class*=video]');
          if (hasReward) {
            rvButtons++;
            if (hasAdMarker) markedButtons++;
          }
        });
        if (rvButtons === 0) return 'warn';
        return markedButtons === rvButtons;
      },
      warnText: 'No rewarded buttons detected — may be canvas-drawn (verify manually)',
      failText: 'RV buttons found but missing ad marker! Add 📺 icon or word "реклама" to each'
    },
  ]
},
```

### Category: Language Runtime Check (п.2.14)

```javascript
{
  id: 'lang_runtime', title: 'Language Check (Runtime)', icon: '🌍', checks: [
    {
      name: 'Current language detected',
      desc: 'п.2.14 — SDK language applied',
      test: function() {
        // Check various ways language could be stored
        const lang = window.currentLang || window.gameLang || window._lang
          || (window.I18N && window.I18N._current)
          || (window.Plat && window.Plat._lang)
          || document.documentElement.lang;
        if (!lang) return 'warn';
        RT._detectedLang = lang;
        return true;
      },
      warnText: 'Could not detect current language — check if window.currentLang or I18N._current exists'
    },
    {
      name: 'All visible text matches language',
      desc: 'п.8.2.3 — no mixed language text',
      test: function() {
        // Get current language
        const lang = RT._detectedLang || 'ru';
        if (lang === 'ru') return true; // can't detect mixed if primary is Russian
        
        // Check visible DOM text for Cyrillic (shouldn't exist if lang != ru)
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const cyrillicTexts = [];
        let node;
        while (node = walker.nextNode()) {
          if (node.parentElement.closest('.dc-overlay')) continue;
          if (getComputedStyle(node.parentElement).display === 'none') continue;
          const text = node.textContent.trim();
          if (text.length > 2 && /[а-яА-ЯёЁ]{3,}/.test(text)) {
            cyrillicTexts.push({
              text: text.slice(0, 50),
              parent: node.parentElement.tagName + (node.parentElement.id ? '#' + node.parentElement.id : '')
            });
          }
        }
        if (cyrillicTexts.length === 0) return true;
        RT._untranslated = cyrillicTexts;
        return false;
      },
      failText: 'Cyrillic text found on non-Russian language! Check RT._untranslated in console'
    },
    {
      name: 'Canvas text check hint',
      desc: 'Reminder: Canvas-drawn text not detectable by DOM scan',
      test: function() {
        const hasCanvas = !!document.querySelector('canvas');
        if (!hasCanvas) return true;
        return 'warn';
      },
      warnText: 'Game uses Canvas — DOM language check cannot see drawText(). Manually verify all Canvas text is translated for each ?lang=xx'
    },
  ]
},
```

### Category: Scroll/Refresh Runtime (п.1.10.2)

```javascript
{
  id: 'scroll_runtime', title: 'Scroll/Refresh (Runtime)', icon: '📜', checks: [
    {
      name: 'No body scroll',
      desc: 'п.1.10.2 — page should not scroll',
      test: function() {
        // Check computed styles
        const html = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        const htmlOk = html.overflow === 'hidden' || html.overflowY === 'hidden';
        const bodyOk = body.overflow === 'hidden' || body.overflowY === 'hidden';
        const osb = html.overscrollBehavior || body.overscrollBehavior 
          || html.overscrollBehaviorY || body.overscrollBehaviorY;
        const osbOk = osb === 'none' || osb === 'contain';
        
        if (htmlOk && bodyOk && osbOk) return true;
        if (htmlOk || bodyOk) return 'warn';
        return false;
      },
      warnText: 'Partial scroll protection — add overscroll-behavior:none to html,body',
      failText: 'No scroll protection! Add: html,body { overflow:hidden; overscroll-behavior:none; position:fixed; width:100%; height:100dvh; }'
    },
    {
      name: 'Document is scrollable?',
      desc: 'Actual scroll test',
      test: function() {
        // Check if document actually scrolls
        const scrollable = document.documentElement.scrollHeight > window.innerHeight + 5
          || document.body.scrollHeight > window.innerHeight + 5;
        return !scrollable;
      },
      failText: 'Page content is taller than viewport — will cause scroll on mobile!'
    },
  ]
},
```

## Step 3: Add Timing Log Viewer

Add a section in the panel that shows the event timeline:

```javascript
// In buildLBTools() or similar, add timing display:
function buildTimingLog() {
  const events = TIMING.log.map(e => {
    const ms = Math.round(e.delta);
    const color = e.warning ? '#ed1b35' : '#44b85c';
    return `<div style="font-size:10px;color:${color};font-family:monospace">
      +${ms}ms ${e.event}${e.warning ? ' ⚠️ ' + e.warning : ''}
    </div>`;
  }).join('');
  
  return `<div class="dc-sec">
    <div class="dc-sh" onclick="this.classList.toggle('dc-open');this.nextElementSibling.classList.toggle('dc-open')">
      <span class="dc-arr">▶</span><span class="dc-si">📊</span>
      <span class="dc-st">Event Timeline</span>
      <span class="dc-badge dc-bwarn">LOG</span>
    </div>
    <div class="dc-sb" style="padding:8px 12px;max-height:200px;overflow-y:auto">
      ${events || '<div style="color:#666;font-size:11px">No events yet — interact with game, then re-check</div>'}
      <div style="margin-top:8px;font-size:10px;color:#666">
        Expected order: domReady → fontsLoaded → langDetected → firstPaint → gameReady → firstUserClick → gameplayStart
      </div>
    </div>
  </div>`;
}
```

## Non-Negotiable Acceptance Criteria

- [ ] Timing probes record: domReady, fontsLoaded, gameReady, gameplayStart, langDetected, firstUserClick, firstInterstitial
- [ ] GameReady timing check: FAIL if ready() before fonts or first paint
- [ ] Language timing check: FAIL if lang detected after ready()
- [ ] Overflow check: scans ALL DOM elements for viewport overflow
- [ ] Touch target check: finds buttons < 44px
- [ ] Ad behavior: FAIL if interstitial before first user click
- [ ] RV button check: verifies ad marker text on rewarded buttons
- [ ] Scroll check: verifies computed overflow:hidden + overscroll-behavior
- [ ] Canvas text warning: reminds to manually check drawText translations
- [ ] Untranslated text finder: detects Cyrillic on non-Russian language
- [ ] Timeline viewer shows event sequence with timestamps
- [ ] All new checks added to existing CATS array (not replacing)
- [ ] Existing checks remain untouched

---

## Version History

### v2.6 (Apr 2026 — false-positive purge after Circle 2048 marketing-build run)
The first real-world run of the inlined v2.5 panel reported **13 FAILs**, but inspection showed only 2 were real game issues. The other 11 were **debugcheck self-detecting its own source** when inlined into the game HTML. This release adds the missing infrastructure to scan game code without polluting it with the panel's own definitions.

- **Self-stripping markers**: `templates/html5/debugcheck.js` now bracketed by `// === DEBUGCHECK_SELF_START ===` / `// === DEBUGCHECK_SELF_END ===`. Same for `cheats-base.js` (`CHEATS_SELF_START/END`). `getSource()` strips both blocks before passing to checks.
- **`{pass, details}` result shape**: `runChecks()` normalises three additional return shapes besides `true`/`'warn'`/`false`. v2.5 IAP guard checks returning `{pass:true,details:'No IAP — n/a'}` now correctly count as PASS instead of falling through to FAIL.
- **`guard:true` flag on guard checks**: optional-category short-circuit no longer treats `{pass:true,details:'No IAP — n/a'}` as evidence the feature is present. A guard check is one that passes when an absent feature stays absent — never proves presence.
- **Visibility walking**: Cyrillic-on-non-RU check now walks ancestors via `getComputedStyle` chain, not just immediate parent. Text inside hidden overlay screens (`.overlay-screen { display:none }`) is no longer flagged.
- **Pattern coverage**: All-13-languages check now matches unquoted `ru:{` form. Yandex-fallback check now matches array forms like `['be','kk','uk','uz']`.
- **Soft timing**: GameReady-after-paint downgraded to WARN when delta is 0–50ms. Single-file games on local server fire `load` and `gameReady` in the same frame — fine, but worth verifying on real Yandex Stage where assets create natural separation.

**Test: marketing build of Circle 2048** went from 67 pass / 13 fail / 8 warn (76%) → 75 pass / 0 fail / 7 warn (91%). Remaining 7 warns are all "needs interaction" reminders (no interstitial yet, no RV yet, etc — expected before you actually play).

### v2.5 (Apr 2026)
- **Pre-Submit Banner**: panel auto-fetches `.pre-submit-report.json` (written by `scripts/pre-submit.mjs`) from same origin and shows static-validator verdict at the top — single pane of glass for static + runtime.
- **IAP gap closed**: added `getCatalog()` check (REQ-1.13/3.8 — DriftWorld rejection), hardcoded `₽/$/€` near numbers scan (with `$1`/`${...}` exclusions), and `IAP-PERMIT` marker check (BattleFront rejection: "Покупки не подключены... Дождитесь ответного письма").

### v2.4 (Mar 2026)
- `ad_context_runtime` — hooks `showFullscreenAdv`/`showRewardedVideo`, measures gesture delta, flags >500ms (Circle 2048 rejection: REQ-4.4 ad without user gesture).
- `lang_switch_runtime` — programmatically switches lang and scans visible DOM for residual untranslated text.

### v2.3 (Feb 2026)
- Fixed contextmenu probe (was checking `defaultPrevented` BEFORE dispatch).

### v2.2 (Feb 2026)
- Runtime probes for `touch-action` + synthetic `contextmenu` dispatch.

---

## 🟡 Deferred Runtime Probes (NOT YET IMPLEMENTED)

These runtime probes would automate manual checks listed in CLAUDE.md. They are **intentionally** deferred — implement only when a real game blocks on them.

### B. REQ-1.9 Save Round-Trip
- **What it would do**: A "Test Save" button in the panel that calls `Plat.saveCloud(testToken)` → sets reload guard → triggers `location.reload()` → on reload, checks if testToken survived.
- **Why deferred**: Requires page-reload coordination + per-game knowledge of save shape. Currently the manual instruction in CLAUDE.md ("play, refresh, confirm progress preserved") is fast enough.
- **When to add**: If a game's save logic is complex enough that we suspect it breaks across reloads but can't reliably reproduce.

### C. REQ-1.13.5 Purchase Applies (item arrives in game)
- **What it would do**: Hook `payments.purchase().then(...)` → snapshot game state before resolve → wait 1s after resolve → diff state → flag if no change.
- **Why deferred**: Per-game knowledge required (what's the inventory shape? balance variable?). False positives are easy. Manual check is more reliable.
- **When to add**: When we ship a game with multiple IAP items and want regression detection.

### D. REQ-4.5.2 RV Not Mandatory for Progress
- **What it would do**: Track game-state transitions and count how many require completing a Rewarded Video. If any progression path is RV-gated → fail.
- **Why deferred**: Hard to define "progression path" generically. Each game models progression differently (level number, story chapter, currency threshold).
- **When to add**: If we get a moderation rejection citing "RV is mandatory", we'll know exactly what to detect.

### E. Per-Language Screenshot Reminder
- **What it would do**: Read a config of which languages need screenshots, check `localStorage` for "I screenshotted lang=X today" markers, show progress UI.
- **Why deferred**: Already handled externally by `tools/game-screenshot-ext` (browser extension). Would duplicate state.
- **When to add**: If we move screenshot orchestration into the game runtime.

### F. (Done in v2.5) Pre-submit summary in panel.

When implementing any of B/C/D/E:
1. Add to `CATS` array in debugcheck.js
2. Update version header + changelog block here
3. Move the item from "Deferred" to "Version History"
4. Add corresponding manual-check note to CLAUDE.md if needed
