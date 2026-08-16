---
name: mobile-controls
description: "Adaptive PC + mobile controls: virtual joystick, touch buttons on Canvas, responsive resize, touch-action CSS. Load when creating any game prototype. Triggers on: game.html, prototype, controls, mobile, touch, joystick, responsive."
---

# Mobile Controls

## Purpose
Every game must work on both PC (keyboard+mouse) and mobile (touch). Controls drawn ON Canvas, not DOM.

## Instructions

### Step 1: Device detection
```javascript
const isMobile = /Android|iPhone|iPad|iPod|Opera Mini/i.test(navigator.userAgent) || 'ontouchstart' in window;
```

### Step 2: Virtual joystick (mobile)
```javascript
const joystick = { active: false, baseX: 80, baseY: 0, touchX: 0, touchY: 0, radius: 40 };
// Position: bottom-left, Y set on resize
canvas.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    if (t.clientX < canvas.width / 2) { // left half = joystick
      joystick.active = true;
      joystick.touchX = t.clientX; joystick.touchY = t.clientY;
    }
  }
});
// Draw: outer circle + inner circle following touch
```

### Step 3: Touch buttons (mobile)
Draw action buttons (A, B) in bottom-right. Min 44px touch targets. Check touch position against button rects.

### Step 4: Adaptive Canvas
```javascript
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  joystick.baseY = canvas.height - 100;
}
window.addEventListener('resize', resize);
resize();
```

### Step 5: CSS requirements
```css
* { margin: 0; padding: 0; }
canvas { display: block; touch-action: none; -webkit-touch-callout: none; user-select: none; }
html, body { overflow: hidden; width: 100%; height: 100%; }
```

### Step 6: HTML meta tag
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

## Non-Negotiable Acceptance Criteria
- [ ] isMobile detection present
- [ ] Virtual joystick drawn on Canvas (not DOM buttons)
- [ ] Touch targets >= 44px
- [ ] Canvas resizes on window resize
- [ ] touch-action: none on canvas
- [ ] Viewport meta tag with user-scalable=no
- [ ] preventDefault on touch events (no pull-to-refresh)
