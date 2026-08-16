---
name: mobile-adapt
kind: tactical
description: "Adapt desktop games to mobile: auto-detect genre, choose orientation (portrait/landscape), map keyboard/mouse controls to touch. Covers ALL genres: shooters (top-down/FPS/TPS)…"
---

# Desktop → Mobile Adaptation

## Purpose
Desktop games arrive with keyboard+mouse controls. Adapt to mobile with correct orientation, touch scheme, and UI layout per genre. Agent MUST read this skill before choosing orientation or controls.

## Step 1: Detect Genre → Choose Orientation

NEVER default to portrait. Read the game code, find the genre, then pick:

| Genre | Orientation | Why |
|-------|-------------|-----|
| **Top-down shooter** | LANDSCAPE | Need both move + aim, wide view |
| **FPS shooter** | LANDSCAPE | Camera rotation needs width |
| **TPS (third person)** | LANDSCAPE | Same as FPS |
| **Side-scroll shooter** | LANDSCAPE | Horizontal movement |
| **Platformer** | LANDSCAPE | Horizontal levels |
| **Racing** | LANDSCAPE or PORTRAIT | Landscape for circuit, portrait OK for endless road |
| **Fighting** | LANDSCAPE | 2 fighters side by side |
| **Strategy / RTS** | LANDSCAPE | Need map overview |
| **Tower Defense** | PORTRAIT or LANDSCAPE | Portrait if vertical path, landscape if horizontal |
| **Puzzle (match-3, sokoban)** | PORTRAIT | Grid fits vertical, one-hand play |
| **Card game** | PORTRAIT | Hand of cards at bottom |
| **Idle / Clicker** | PORTRAIT | One-hand, vertical scroll |
| **Runner (endless)** | PORTRAIT | Vertical dodge lanes |
| **Rhythm** | PORTRAIT | Notes fall vertically |
| **Simulation / Tycoon** | LANDSCAPE | Need wide UI panels |
| **Arcade (simple)** | Either | Match original aspect ratio |
| **Visual novel** | PORTRAIT | Text + character portrait |
| **Sandbox** | LANDSCAPE | Need workspace |

**Decision rule:** If original game is wider than tall → LANDSCAPE. If taller than wide → PORTRAIT. If square → check genre table above. When in doubt → LANDSCAPE (safer, more screen for game view).

## Step 2: Map Controls by Genre

### SHOOTERS

**Top-down shooter (LANDSCAPE):**
```
┌──────────────────────────────────┐
│                                   │
│ [JOY]      Game View       [JOY] │
│  Move                    Aim+Fire│
│                  [R] [SPEC]       │
└──────────────────────────────────┘
```
- Left joystick: move (WASD replacement)
- Right joystick: aim direction, auto-fire while aiming (replace mouse)
- OR: right joystick aim + separate fire button
- Buttons: reload, special ability
- Auto-aim assist: snap to nearest enemy in 30deg cone

```javascript
// Top-down: right joystick controls aim angle
const aimAngle = Math.atan2(touch.rightJoyDY, touch.rightJoyDX);
const aimDist = Math.hypot(touch.rightJoyDX, touch.rightJoyDY);
if (aimDist > 0.3) { // deadzone
  player.aimAngle = aimAngle;
  if (autoFireWhileAiming) player.shoot();
}
```

**FPS / TPS (LANDSCAPE):**
```
┌──────────────────────────────────┐
│                                   │
│ [JOY]    3D View     [Swipe zone]│
│  Move               Look around  │
│          [JUMP][CROUCH][FIRE]     │
└──────────────────────────────────┘
```
- Left joystick: move (WASD)
- Right half screen: swipe = camera rotation (mouse look replacement)
- Fire button: bottom-right, BIG (64px)
- Jump, crouch: secondary buttons
- Sensitivity setting: 0.1-0.5 multiplier on swipe delta

```javascript
// FPS camera: swipe right half = mouse look
if (t.clientX > canvas.width * 0.4) {
  camera.yaw += (t.clientX - lastX) * sensitivity;
  camera.pitch -= (t.clientY - lastY) * sensitivity;
  camera.pitch = Math.max(-Math.PI/3, Math.min(Math.PI/3, camera.pitch));
}
```

**Side-scroll shooter (LANDSCAPE):**
```
┌──────────────────────────────────┐
│                                   │
│ [JOY]    Scrolling View    [FIRE]│
│  Move                      [SPEC]│
└──────────────────────────────────┘
```
- Left joystick: move up/down (horizontal scroll is auto)
- OR: tilt device for vertical movement
- Fire button right side (auto-fire option)
- Tap screen = shoot toward tap (like tap-to-shoot)

---

### RACING

**Circuit racing (LANDSCAPE):**
```
┌──────────────────────────────────┐
│                                   │
│          Race View                │
│                                   │
│  [BRAKE]  [TILT/STEER]   [GAS]  │
└──────────────────────────────────┘
```
- Option A: Tilt steering (accelerometer) — most immersive
- Option B: Left/right buttons or small joystick
- Gas: right thumb hold
- Brake: left thumb hold
- Nitro: swipe up on gas button

```javascript
// Tilt steering
window.addEventListener('deviceorientation', (e) => {
  // gamma: left/right tilt (-90 to 90)
  steerInput = Math.max(-1, Math.min(1, e.gamma / 30));
});
```

**Endless road (PORTRAIT OK):**
```
┌─────────────────┐
│                  │
│   Road View      │
│                  │
│  Swipe L/R       │
│  or tilt         │
│                  │
│  [NITRO]         │
└─────────────────┘
```
- Swipe left/right to change lanes
- OR tilt device
- Auto-accelerate
- Tap for nitro/jump

---

### PLATFORMER (LANDSCAPE)

```
┌──────────────────────────────────┐
│                                   │
│          Level View               │
│                                   │
│ [<] [>]                [B] [A]   │
│  D-pad               Attack Jump │
└──────────────────────────────────┘
```
- Option A: D-pad (left/right arrows) — more precise
- Option B: Joystick — if 8-directional movement needed
- A button: jump (right thumb, bottom)
- B button: attack/interact (above A or left of A)
- Up: look up / enter door (on D-pad)

```javascript
// D-pad: draw as 3 zones (left, right, up)
const DPAD = { x: 80, y: canvas.height - 80, size: 50, gap: 10 };
function drawDpad(ctx) {
  // Left arrow
  drawDpadBtn(ctx, DPAD.x - DPAD.size - DPAD.gap, DPAD.y, '<', touch.left);
  // Right arrow
  drawDpadBtn(ctx, DPAD.x + DPAD.gap, DPAD.y, '>', touch.right);
  // Up (smaller, above)
  drawDpadBtn(ctx, DPAD.x - DPAD.size/2, DPAD.y - DPAD.size - DPAD.gap, '^', touch.up);
}
```

---

### STRATEGY / RTS (LANDSCAPE)

```
┌──────────────────────────────────┐
│  [Resources]  [Minimap]          │
│                                   │
│  Pinch zoom / Pan drag           │
│  Tap to select                   │
│  Tap to move/attack              │
│                                   │
│  [Build] [Unit1] [Unit2] [Unit3] │
└──────────────────────────────────┘
```
- Drag: pan camera (replace WASD/arrow scroll)
- Pinch: zoom in/out (replace scroll wheel)
- Tap unit: select (replace left click)
- Tap ground: move selected (replace right click)
- Double-tap: select all of type
- Long-press: context menu
- Bottom bar: build/unit buttons (scrollable)

```javascript
// Pinch zoom
let lastPinchDist = 0;
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (lastPinchDist > 0) {
      camera.zoom *= dist / lastPinchDist;
      camera.zoom = Math.max(0.5, Math.min(3.0, camera.zoom));
    }
    lastPinchDist = dist;
  }
});
```

---

### PUZZLE (PORTRAIT usually)

```
┌─────────────────┐
│  [Score] [Moves] │
│                  │
│  ┌──┬──┬──┬──┐  │
│  │  │  │  │  │  │
│  ├──┼──┼──┼──┤  │  Tap / Swipe / Drag
│  │  │  │  │  │  │
│  ├──┼──┼──┼──┤  │
│  │  │  │  │  │  │
│  └──┴──┴──┴──┘  │
│                  │
│  [Hint] [Undo]   │
└─────────────────┘
```
- Match-3: swipe to swap tiles
- Sokoban: swipe direction to push
- Jigsaw: drag pieces
- Logic: tap to toggle/place
- Replace keyboard arrows with swipe gestures
- Replace mouse drag with touch drag

---

### FIGHTING (LANDSCAPE)

```
┌──────────────────────────────────┐
│                                   │
│  [HP]     Arena      [HP]        │
│                                   │
│ [JOY]             [Y]            │
│  Move        [X]      [B]       │
│                  [A]              │
└──────────────────────────────────┘
```
- Left joystick: move + crouch (down) + jump (up)
- Right side: 4 attack buttons (diamond layout like gamepad)
- A = light attack, B = heavy, X = special, Y = grab/throw
- Combo: fast sequential taps A→A→B
- Block: hold back on joystick (or dedicated button if needed)

---

### IDLE / CLICKER (PORTRAIT)

```
┌─────────────────┐
│  [Currency]      │
│                  │
│  ┌────────────┐  │
│  │  TAP HERE  │  │  ← Main tap zone (big)
│  └────────────┘  │
│                  │
│  [Upgrade 1]     │
│  [Upgrade 2]     │  ← Scrollable list
│  [Upgrade 3]     │
│  [Prestige]      │
└─────────────────┘
```
- Main area: tap to generate (replace mouse click)
- Scroll list: upgrades, buildings
- Long-press upgrade: bulk buy (x10, x100)
- No joystick needed

---

### RUNNER (PORTRAIT)

```
┌─────────────────┐
│                  │
│   Obstacles      │
│   coming         │
│                  │
│  Swipe L/R/U/D   │
│  to dodge/jump   │
│                  │
└─────────────────┘
```
- Swipe left: move/dodge left
- Swipe right: move/dodge right
- Swipe up: jump
- Swipe down: slide/crouch
- Tap: shoot/attack (if applicable)
- Tilt: alternative steering (option)
- No joystick — swipe only

---

## Step 3: Desktop → Mobile Mapping Cheat Sheet

| Desktop Input | Mobile Replacement |
|--------------|-------------------|
| WASD / Arrows | Joystick OR D-pad OR Swipe |
| Mouse look | Swipe on right half (FPS) or right joystick (top-down) |
| Left click | Tap |
| Right click | Long-press or second button |
| Scroll wheel | Pinch zoom |
| Mouse drag | Touch drag |
| Spacebar (jump) | Button A or swipe up |
| E (interact) | Tap on object or button |
| R (reload) | Button |
| Shift (sprint) | Double-tap joystick or hold joystick at edge |
| Ctrl (crouch) | Joystick down or button |
| Tab (inventory) | Swipe from edge or button |
| Esc (pause) | Tap pause icon (top corner) |
| 1-9 (hotbar) | Scrollable toolbar at bottom |
| Mouse hover | Does not exist on mobile — remove hover-dependent mechanics |

## Common Adaptation Rules

### Canvas sizing
```javascript
function resize() {
  // Use full screen
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Detect orientation
  const isLandscape = canvas.width > canvas.height;
  
  // Reposition controls based on orientation
  if (isLandscape) {
    setupLandscapeControls();
  } else {
    setupPortraitControls();
  }
}
window.addEventListener('resize', resize);
// Also listen for orientation change
screen.orientation?.addEventListener('change', resize);
```

### Lock orientation (if game requires it)
```javascript
// Request landscape (async, may be denied)
async function lockLandscape() {
  try {
    await screen.orientation.lock('landscape');
  } catch { /* silently fail on unsupported browsers */ }
}
// Show rotate-device hint instead of locking
function showRotateHint() {
  if (REQUIRES_LANDSCAPE && window.innerWidth < window.innerHeight) {
    drawRotatePhoneIcon(ctx); // show "please rotate" overlay
    return true; // skip game rendering
  }
  return false;
}
```

### Force fullscreen on mobile
```javascript
canvas.addEventListener('touchstart', () => {
  if (!document.fullscreenElement && isMobile) {
    document.documentElement.requestFullscreen?.()
      .catch(() => {}); // ignore if denied
  }
}, { once: true });
```

### Remove hover-dependent mechanics
Desktop games often have tooltip-on-hover, highlight-on-hover. On mobile:
- Hover tooltips → long-press to show info
- Hover highlights → selected state on tap
- Hover-triggered menus → tap to open

### Performance on mobile
- Reduce particle count (mobile GPU weaker): `const MAX_PARTICLES = isMobile ? 100 : 300;`
- Lower resolution if needed: `const SCALE = isMobile ? 0.75 : 1.0;`
- Disable expensive shadows/blur on low-end: check `navigator.hardwareConcurrency < 4`

## Non-Negotiable Acceptance Criteria

- [ ] Genre detected BEFORE choosing orientation
- [ ] Orientation matches genre table (NOT always portrait)
- [ ] Lock/suggest correct orientation if game requires it
- [ ] Every keyboard input has a touch replacement (see mapping table)
- [ ] Mouse hover mechanics removed or replaced with tap/long-press
- [ ] Touch targets >= 48px (56px for action buttons in shooters/fighters)
- [ ] Controls semi-transparent (opacity 0.2-0.4) — don't block game view
- [ ] All controls reposition on resize/orientation change
- [ ] preventDefault on touch events (no pull-to-refresh, no zoom)
- [ ] Multi-touch tracked by touch.identifier (not array index)
- [ ] Deadzone on all joysticks (min 8px before registering input)
- [ ] Fullscreen requested on first tap
- [ ] Pause button always accessible (top corner, outside game controls)
- [ ] Tested: does the game ACTUALLY PLAY well? Not just "controls exist"
