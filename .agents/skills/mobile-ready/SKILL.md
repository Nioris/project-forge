---
name: mobile-ready
kind: tactical
description: "Audit HTML5 project for mobile readiness: touch controls, responsive UI, orientation, performance. If not ready — fix before wrapping."
---

# Mobile Readiness Audit + Fix

## Purpose
HTML5 projects arrive as desktop-only. Wrapping in Capacitor without fixing = broken app. This skill audits AND fixes mobile issues BEFORE Capacitor wrap.

## ⚠️ Run AFTER analyze-project, BEFORE capacitor-wrap

---

## Step 1: Audit Checklist

Read all source files and check:

### A. Touch Controls
```bash
# Search for keyboard-only input
grep -rn "keydown\|keyup\|keypress\|addEventListener.*key" --include="*.js" --include="*.html"
# Search for mouse-only input
grep -rn "mousedown\|mouseup\|mousemove\|click" --include="*.js" --include="*.html"
# Search for existing touch
grep -rn "touchstart\|touchend\|touchmove\|ontouchstart\|pointer" --include="*.js" --include="*.html"
```

| Result | Status | Action |
|--------|--------|--------|
| Has touch events | ✅ Ready | Verify they work |
| Only keyboard+mouse | 🔴 Not ready | Add touch controls |
| Has pointer events | ⚠️ Partial | Pointer = OK for taps, check drag/joystick |

### B. Responsive Layout
```bash
# Check viewport meta
grep -n "viewport" --include="*.html" -r
# Check fixed pixel sizes
grep -rn "width:\s*[0-9]\{3,\}px\|height:\s*[0-9]\{3,\}px" --include="*.css" --include="*.html"
# Check canvas sizing
grep -rn "canvas.width\|canvas.height\|innerWidth\|innerHeight\|resize" --include="*.js"
```

| Result | Status | Action |
|--------|--------|--------|
| Canvas uses innerWidth/Height | ✅ Ready | OK |
| Canvas = fixed 800x600 | 🔴 Not ready | Add resize handler |
| No viewport meta | 🔴 Not ready | Add viewport tag |
| Fixed px layout (no responsive) | 🔴 Not ready | Add responsive CSS |

### C. Orientation
```bash
# Detect intended orientation from canvas/game
grep -rn "canvas.width\|GAME_WIDTH\|WIDTH\|screenWidth" --include="*.js" | head -10
```
- Width > Height → landscape
- Height > Width → portrait
- Square or dynamic → any

### D. Performance Concerns
```bash
# Count images/assets
find . -name "*.png" -o -name "*.jpg" -o -name "*.mp3" -o -name "*.ogg" | wc -l
# Check for heavy operations
grep -rn "setInterval\|requestAnimationFrame" --include="*.js" | wc -l
# Particle/object count
grep -rn "particles\|MAX_PARTICLES\|MAX_ENEMIES\|maxObjects" --include="*.js"
```

### E. Browser APIs that break on mobile
```bash
# hover-dependent
grep -rn "onmouseover\|mouseenter\|:hover" --include="*.js" --include="*.css" --include="*.html"
# right-click
grep -rn "contextmenu" --include="*.js"
# scroll-dependent
grep -rn "onscroll\|scrollTop\|scrollY" --include="*.js"
# localStorage (works but limited on some Android WebViews)
grep -rn "localStorage" --include="*.js"
```

## Step 2: Generate Audit Report

Write `MOBILE_AUDIT.md`:
```markdown
# Mobile Audit: {project}

## Score: {X}/10

## Touch Controls
- Status: {✅ Ready | 🔴 Missing | ⚠️ Partial}
- Found: {keyboard/mouse/touch/pointer events}
- Needs: {what to add}

## Responsive Layout
- Status: {✅ | 🔴 | ⚠️}
- Canvas: {fixed/dynamic}
- Viewport: {present/missing}
- Needs: {what to fix}

## Orientation
- Detected: {landscape/portrait/any}
- Lock needed: {yes/no}

## Performance
- Asset count: {N}
- Total size: {MB}
- Particle limit: {detected/not set}
- Concern: {none/medium/high}

## Compatibility
- Hover deps: {yes/no}
- Right-click deps: {yes/no}
- Scroll deps: {yes/no}

## Verdict: {READY | NEEDS_FIXES | MAJOR_REWORK}
## Fixes needed: {numbered list}
```

## Step 3: Auto-Fix by Genre

### Fix: Add Touch Controls to Canvas Game

Detect genre from game code, then add appropriate controls:

**Top-down / arena (keyboard WASD + mouse aim):**
```javascript
// ADD: dual joystick for landscape
// Left = move (replaces WASD), Right = aim (replaces mouse)
// See YBuilder mobile-adapt skill for full code

// Minimal touch wrapper:
const TOUCH = { lx:0, ly:0, rx:0, ry:0, lActive:false, rActive:false, lId:null, rId:null };

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.clientX < canvas.width/2 && !TOUCH.lActive) {
      TOUCH.lActive=true; TOUCH.lId=t.identifier;
      TOUCH.lStartX=t.clientX; TOUCH.lStartY=t.clientY;
    } else if (!TOUCH.rActive) {
      TOUCH.rActive=true; TOUCH.rId=t.identifier;
      TOUCH.rStartX=t.clientX; TOUCH.rStartY=t.clientY;
    }
  }
}, {passive:false});

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier===TOUCH.lId) {
      TOUCH.lx = Math.max(-1, Math.min(1, (t.clientX-TOUCH.lStartX)/40));
      TOUCH.ly = Math.max(-1, Math.min(1, (t.clientY-TOUCH.lStartY)/40));
    }
    if (t.identifier===TOUCH.rId) {
      TOUCH.rx = Math.max(-1, Math.min(1, (t.clientX-TOUCH.rStartX)/40));
      TOUCH.ry = Math.max(-1, Math.min(1, (t.clientY-TOUCH.rStartY)/40));
    }
  }
}, {passive:false});

canvas.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (t.identifier===TOUCH.lId) { TOUCH.lActive=false; TOUCH.lx=0; TOUCH.ly=0; }
    if (t.identifier===TOUCH.rId) { TOUCH.rActive=false; TOUCH.rx=0; TOUCH.ry=0; }
  }
});

// Map to existing input system:
// In game update: replace keys.left/right/up/down with TOUCH.lx/ly
// Replace mouse.x/y with player.x + TOUCH.rx*300, player.y + TOUCH.ry*300
```

**Platformer (arrow keys + space):**
```javascript
// ADD: D-pad left + buttons right
// Left/Right arrows at bottom-left, Jump+Attack at bottom-right
// Touch target 56px minimum
```

**Puzzle / click-based:**
```javascript
// Tap = click (usually works with pointer events)
// Add: pinch zoom if scrollable
// Add: long-press = right-click
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  // Simulate mouse click at touch position
  const rect = canvas.getBoundingClientRect();
  mouseX = t.clientX - rect.left;
  mouseY = t.clientY - rect.top;
  mouseDown = true;
}, {passive:false});
```

**Idle / clicker:**
```javascript
// Tap = click (works naturally)
// Add: multi-touch support for rapid tapping
// Add: scrollable panels via touch drag
```

### Fix: Add Responsive Canvas

```javascript
// REPLACE fixed canvas size with dynamic:
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Recalculate game scale
  SCALE = Math.min(canvas.width / DESIGN_W, canvas.height / DESIGN_H);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
resize();
```

### Fix: Add Viewport Meta

```html
<!-- Add to <head> if missing: -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

### Fix: Disable Browser Behaviors

```css
/* Add to existing CSS: */
* { -webkit-touch-callout:none; -webkit-user-select:none; user-select:none; }
html,body { overflow:hidden; overscroll-behavior:none; position:fixed; width:100%; height:100dvh; }
canvas { touch-action:none; }
```
```javascript
document.addEventListener('contextmenu', e => e.preventDefault());
```

### Fix: Remove Hover Dependencies

```javascript
// Find: element.addEventListener('mouseover', ...)
// Replace: element.addEventListener('pointerdown', ...)
// Find: CSS :hover on interactive elements
// Add: :active equivalent for touch
```

### Fix: Mobile Performance

```javascript
// Add if not present:
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const MAX_PARTICLES = isMobile ? 80 : 300;
const MAX_ENEMIES = isMobile ? 30 : 100;
// Reduce shadow/blur on mobile
if (isMobile) { ctx.shadowBlur = 0; }
```

## Step 4: Re-audit After Fixes

Run audit again. Score must be >= 7/10 before proceeding to Capacitor wrap.

```
Before: Score 3/10 — keyboard only, fixed 800x600, no viewport
After:  Score 9/10 — touch joysticks, responsive canvas, viewport, fullscreen
→ Ready for Capacitor wrap
```

## Non-Negotiable
- [ ] Audit BEFORE any conversion (write MOBILE_AUDIT.md)
- [ ] Touch controls added if missing (appropriate to genre)
- [ ] Canvas responsive (not fixed pixels)
- [ ] Viewport meta present
- [ ] Browser behaviors disabled (context menu, selection, scroll)
- [ ] Performance adjusted for mobile
- [ ] Hover dependencies removed
- [ ] Re-audit passes >= 7/10
- [ ] NEVER wrap a 3/10 project — fix first
