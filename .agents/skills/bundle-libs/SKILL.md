---
name: bundle-libs
kind: tactical
description: "Bundle external CDN libraries into game zip для Yandex Games. Scans HTML/JS for external <script src=https://...>, downloads to assets/lib/, replaces refs с local paths. Yandex…"
---

# Bundle Libs — Download CDN Dependencies к Local

## Why this exists

Yandex Games sandbox blocks external HTTP requests during gameplay. Any `<script src="https://cdn..."` или ES `import 'https://...'` makes game **fail moderation** (REQ-2.1 sandbox compliance).

Common offenders:
- Three.js / Babylon.js loaded from CDN
- Phaser / Pixi.js / Howler / Tone.js from cdnjs/unpkg/jsdelivr
- Google Fonts via `<link href="https://fonts.googleapis.com...">`
- Tailwind via cdn.tailwindcss.com
- Skypack/esm.sh module imports

This skill **auto-downloads** все они в `assets/lib/` и **replaces refs** в HTML/JS с local paths.

## When к use

**Before Yandex submission** (every time external CDN ref present). Trigger automatic via:
- `$release-ready yandex` — теперь проверяет external CDN refs (release blocker)
- `$mvp-to-yandex` — Phase 4 build step
- Manual: `node scripts/check-external-cdn.mjs <build-dir>` returns violations → `$bundle-libs`

## Don't use when

- ❌ Project deploys к Steam/web хостинг (external CDN OK there)
- ❌ Reference is **runtime** API fetch (`fetch('https://api.example.com/scores')`), не script load — those need different solution (Yandex SDK proxy или cors-anywhere)

## Process

### Step 1 — Scan for violations

```bash
node scripts/check-external-cdn.mjs WorkProgress/{Project}-yandex/
```

Output: violations table с file:line + URL для each external ref. Save list.

### Step 2 — Per violation, decide approach

| Type | Approach |
|---|---|
| Library (.js minified file) | Download к `assets/lib/<libname>.min.js`, replace ref |
| CSS file | Download к `assets/lib/<libname>.css`, replace ref |
| Google Font CSS + WOFF | Download CSS, download referenced WOFF files, replace ref + fix paths |
| ES module import | Download к `assets/lib/<libname>.mjs`, change import statement |
| Worker URL | Download к `assets/workers/<name>.js`, change `new Worker('...')` |

### Step 3 — Download libs

For each external ref:

```bash
# Standard library download (use curl с timeout)
mkdir -p WorkProgress/{Project}-yandex/assets/lib/
curl -sSL --max-time 30 -o WorkProgress/{Project}-yandex/assets/lib/three.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js

# Verify download succeeded
ls -lh WorkProgress/{Project}-yandex/assets/lib/three.min.js
```

If download fails (404, timeout, network) → fall back к Manual instructions для user.

**Important version pinning:** record exact version downloaded к `assets/lib/_versions.txt`:
```
three.min.js       r128  from cdnjs.cloudflare.com  downloaded 2026-05-19
phaser.min.js      3.60.0  from unpkg.com  downloaded 2026-05-19
```

This helps future maintenance (e.g., если lib has security patch).

### Step 4 — Replace refs в HTML

For each `<script src="https://...">`:

Before:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

After:
```html
<script src="assets/lib/three.min.js"></script>
```

Use Edit tool с exact find-replace (не sed) к preserve indentation.

For CSS files:
```html
<!-- Before -->
<link href="https://fonts.googleapis.com/css?family=Roboto:400,700" rel="stylesheet">

<!-- After (steps 4a + 4b — see below) -->
<link href="assets/lib/roboto.css" rel="stylesheet">
```

### Step 4a — Special case: Google Fonts

Google Fonts CSS contains `@font-face` rules с `src: url(...woff)` references. Need к:
1. Download CSS
2. Parse @font-face URLs
3. Download each WOFF/WOFF2 file
4. Rewrite CSS к point к local font files

```bash
# 1. Get CSS
curl -sSL "https://fonts.googleapis.com/css?family=Roboto:400,700" -o /tmp/fonts.css

# 2. Extract WOFF URLs
grep -oE 'https://[^)]+\.woff2?' /tmp/fonts.css | sort -u

# 3. Download each WOFF
for url in $(grep -oE 'https://[^)]+\.woff2?' /tmp/fonts.css | sort -u); do
  fname=$(basename "$url" | sed 's/[?&]/-/g')
  curl -sSL --max-time 30 -o "WorkProgress/{Project}-yandex/assets/lib/fonts/$fname" "$url"
done

# 4. Rewrite CSS — replace URLs к relative paths
sed -i 's|https://fonts.gstatic.com/s/[^/]*/[^/]*/|fonts/|g' /tmp/fonts.css
cp /tmp/fonts.css WorkProgress/{Project}-yandex/assets/lib/roboto.css
```

### Step 4b — ES module imports

For `import 'https://...'`:
```javascript
// Before
import * as THREE from 'https://cdn.skypack.dev/three';

// After  
import * as THREE from './assets/lib/three.mjs';
```

Note: ES module имеет sub-imports. Skypack/esm.sh bundle them all. Direct import URL → need download the full bundle, не just entrypoint. May need recursive download:

```bash
# Skypack/esm.sh: download the lookup URL, then follow Location header to actual module file
curl -sSL -o /tmp/three.mjs "https://cdn.skypack.dev/three"
# Check для nested imports inside that file:
grep -E 'from "https?:' /tmp/three.mjs
# If нет nested imports — copy к assets/lib/
# Если nested — need recursive download
```

**Recommendation:** для projects использующих ES module imports, switch к bundler (esbuild/rollup) перед Yandex submission, не try к pull bundle dynamically.

### Step 5 — Re-validate

```bash
node scripts/check-external-cdn.mjs WorkProgress/{Project}-yandex/
```

Should output `✓ No external CDN references found`. If any remain → repeat Step 2-4 for those.

### Step 6 — Functional test

Bundled libs могут break (especially Three.js если loaded из different CDN с different module format). Test runtime:

```bash
node scripts/runtime-test.mjs WorkProgress/{Project}-yandex/ --scenarios=startup,assets,dom
```

If startup fails — library API mismatch. Diagnose:
- Check that bundle is in correct format (UMD vs ESM vs script-tag)
- Check that download wasn't HTML error page (some CDNs return HTML for 404)
- Check that file size matches expected (3kb file probably error page)

## Common libraries — download URLs reference

| Library | Recommended source | URL pattern |
|---|---|---|
| Three.js (r128+) | cdnjs.cloudflare.com | `https://cdnjs.cloudflare.com/ajax/libs/three.js/<version>/three.min.js` |
| Phaser 3 | cdn.jsdelivr.net | `https://cdn.jsdelivr.net/npm/phaser@<version>/dist/phaser.min.js` |
| Pixi.js | cdnjs.cloudflare.com | `https://cdnjs.cloudflare.com/ajax/libs/pixi.js/<version>/pixi.min.js` |
| Howler.js | cdnjs.cloudflare.com | `https://cdnjs.cloudflare.com/ajax/libs/howler/<version>/howler.min.js` |
| Tone.js | cdn.jsdelivr.net | `https://cdn.jsdelivr.net/npm/tone@<version>/build/Tone.js` |
| GSAP | cdn.jsdelivr.net | `https://cdn.jsdelivr.net/npm/gsap@<version>/dist/gsap.min.js` |
| Matter.js | cdn.jsdelivr.net | `https://cdn.jsdelivr.net/npm/matter-js@<version>/build/matter.min.js` |
| jQuery | code.jquery.com | `https://code.jquery.com/jquery-<version>.min.js` |

Use these к find right URL when only generic CDN ref present.

## Anti-patterns

❌ **Don't download minified library twice** if multiple HTML files reference same CDN URL — dedup к single `assets/lib/<libname>.js`, point all к it.

❌ **Don't hardcode absolute paths** `/assets/lib/three.js` — use relative `assets/lib/three.js` (Yandex serves games from various root paths).

❌ **Don't skip version pinning** в _versions.txt — без него future security audit / library upgrade impossible.

❌ **Don't bundle huge libs unused** — если игра uses 2% of Three.js, ship full library = 600KB загрузка. Consider tree-shaking via esbuild before Yandex submission (separate concern).

❌ **Don't trust 200 OK** blindly — some CDNs return HTML "package not found" page с 200 status. Check file size + first few bytes after download.

## Integration с другими skills

- **`check-external-cdn.mjs`** — validator, called before/after
- **`$release-ready yandex`** — теперь mandatory gate, blocks GREEN if external refs
- **`$mvp-to-yandex`** — Phase 4 build step (after build, before runtime-test)
- **`runtime-test.mjs`** — verifies bundled libs work runtime

## Non-Negotiable

- [ ] Run `check-external-cdn.mjs` first к see violations
- [ ] Download к `assets/lib/` (consistent location)
- [ ] Version pinning в `assets/lib/_versions.txt`
- [ ] Verify file size > 1KB (not error page)
- [ ] Replace refs в HTML/JS с relative paths
- [ ] Re-run `check-external-cdn.mjs` — should return 0 violations
- [ ] Run runtime-test — startup/assets/dom scenarios pass
- [ ] Whitelist Yandex SDK domains (sdk.games.s3.yandex.net etc) — those allowed
