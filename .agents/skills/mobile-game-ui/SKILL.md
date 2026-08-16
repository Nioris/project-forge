---
name: mobile-game-ui
kind: tactical
description: "Mobile game UI/UX adaptation: HUD layout, collapsible menus, radial wheels, minimap placement, modal panels, responsive scaling. Fixes: buttons overload, minimap under thumbs…"
---

# Mobile Game UI/UX

## Purpose
Desktop games dump 20+ buttons on screen. Mobile has 1/4 the space and thumbs block 30% of it. This skill teaches how to restructure UI: group, collapse, prioritize, place correctly.

## The Golden Rule

**If player doesn't need it RIGHT NOW — hide it.** Show on demand.

## Step 1: Screen Zones — What Goes Where

```
LANDSCAPE:
┌──────────────────────────────────────┐
│ [SAFE: status]                [SAFE] │ ← Top bar: HP, ammo, score, timer
│                                      │
│                                      │
│ DEAD         GAME VIEW        DEAD   │ ← Center: NEVER put UI here
│ ZONE                          ZONE   │
│                                      │
│                                      │
│ [CONTROLS]              [CONTROLS]   │ ← Bottom corners: touch controls
│ ←thumb zone→          ←thumb zone→   │
└──────────────────────────────────────┘

PORTRAIT:
┌────────────────────┐
│ [HP] [SCORE] [MENU]│ ← Top: compact status
│                    │
│                    │
│    GAME VIEW       │ ← Middle: NO UI
│                    │
│                    │
│                    │
│ [CTRL]      [CTRL] │ ← Bottom: controls
│ ←thumb→    ←thumb→ │
└────────────────────┘
```

### Zones:
- **Top bar** (top 8-10%): status info only (HP, ammo, score, wave, timer)
- **Game view** (middle 60-70%): NEVER put permanent UI here
- **Thumb zones** (bottom corners, ~25%): joystick + action buttons ONLY
- **Dead zones** (under thumbs): NEVER put readable info here
- **Safe corners** (top-left, top-right): pause, minimap, settings

## Step 2: The 5 UI Problems and Solutions

### Problem 1: ALL buttons on screen at once

**WRONG:**
```
[Move] [Jump] [Attack] [Block] [Dodge] [Reload] [Grenade]
[Inventory] [Map] [Build] [Craft] [Skills] [Chat] [Settings]
```

**RIGHT — Group into layers:**

**Layer 0 — Always visible (max 4-5 elements):**
- Joystick/D-pad
- Primary action (attack/shoot)
- Secondary action (jump/dodge)
- Pause button (top corner, small)

**Layer 1 — Quick radial wheel (hold button to open):**
```javascript
// Hold [GEAR] button for 300ms → radial wheel appears
const WHEEL_ITEMS = [
  { icon: 'R', label: 'Reload', angle: 0 },
  { icon: 'G', label: 'Grenade', angle: Math.PI * 0.4 },
  { icon: 'H', label: 'Heal', angle: Math.PI * 0.8 },
  { icon: 'B', label: 'Build', angle: Math.PI * 1.2 },
  { icon: 'M', label: 'Map', angle: Math.PI * 1.6 },
];

function drawRadialWheel(ctx, cx, cy, items, selectedIndex) {
  // Dim background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const radius = 80;
  items.forEach((item, i) => {
    const x = cx + Math.cos(item.angle) * radius;
    const y = cy + Math.sin(item.angle) * radius;
    
    // Highlight selected
    ctx.fillStyle = i === selectedIndex ? '#ffffff40' : '#ffffff15';
    ctx.beginPath();
    ctx.arc(x, y, 32, 0, Math.PI * 2);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = i === selectedIndex ? '#3b82f6' : '#ffffff30';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Icon
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.icon, x, y + 6);
  });
}

// Selection: drag thumb toward item while holding
function getWheelSelection(touchX, touchY, cx, cy, items) {
  const angle = Math.atan2(touchY - cy, touchX - cx);
  let closest = 0, minDiff = Infinity;
  items.forEach((item, i) => {
    const diff = Math.abs(angleDiff(angle, item.angle));
    if (diff < minDiff) { minDiff = diff; closest = i; }
  });
  return Math.hypot(touchX - cx, touchY - cy) > 30 ? closest : -1;
}
```

**Layer 2 — Full panels (tap dedicated button to open):**
- Inventory, skill tree, map, settings → open as overlay panel
- Panel covers 80% of screen with close button
- Game PAUSES while panel is open

### Problem 2: Minimap under thumbs / at bottom

**WRONG:** Minimap at bottom-center or bottom-right (thumb covers it)

**RIGHT:** Minimap placement rules:
```
LANDSCAPE: top-right corner (small, 80-100px)
PORTRAIT:  top-right corner (60-80px)
NEVER:     bottom of screen (thumb zone)
NEVER:     center of screen (blocks game)
```

```javascript
// Minimap: always top-right, scaled to screen
const MINIMAP = {
  size: Math.min(canvas.width, canvas.height) * 0.12, // 12% of smaller dimension
  margin: 10,
  get x() { return canvas.width - this.size - this.margin; },
  get y() { return this.margin; },
  opacity: 0.7,
};

function drawMinimap(ctx, player, enemies, mapBounds) {
  const m = MINIMAP;
  ctx.globalAlpha = m.opacity;
  
  // Background
  ctx.fillStyle = '#000000cc';
  roundRect(ctx, m.x, m.y, m.size, m.size, 8);
  
  // Scale factor
  const scale = m.size / mapBounds.width;
  
  // Entities
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(m.x + player.x * scale - 2, m.y + player.y * scale - 2, 4, 4);
  
  ctx.fillStyle = '#ef4444';
  enemies.forEach(e => {
    if (e.hp > 0)
      ctx.fillRect(m.x + e.x * scale - 1, m.y + e.y * scale - 1, 3, 3);
  });
  
  ctx.globalAlpha = 1;
}

// Tap minimap to expand to fullscreen map
function handleMinimapTap(x, y) {
  if (x > MINIMAP.x && y < MINIMAP.y + MINIMAP.size) {
    showFullMap = true;  // opens Layer 2 panel
    gamePaused = true;
  }
}
```

### Problem 3: Windows/panels don't fit screen

**WRONG:** 800x600px panel on 360px screen

**RIGHT — Responsive panels:**

```javascript
// Panel ALWAYS fits screen with margins
function drawPanel(ctx, title, content, options = {}) {
  const maxW = Math.min(400, canvas.width - 32);   // 16px margin each side
  const maxH = Math.min(500, canvas.height - 64);   // 32px margin top/bottom
  const x = (canvas.width - maxW) / 2;
  const y = (canvas.height - maxH) / 2;
  
  // Dark overlay behind panel
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Panel background
  ctx.fillStyle = '#1a1a2e';
  roundRect(ctx, x, y, maxW, maxH, 12);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, maxW, maxH, 12, false, true);
  
  // Title bar
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `bold ${Math.min(18, maxW * 0.045)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 16, y + 28);
  
  // Close button (top-right, 44px touch target)
  const closeX = x + maxW - 36, closeY = y + 8;
  ctx.fillStyle = '#ef444480';
  ctx.beginPath();
  ctx.arc(closeX + 14, closeY + 14, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('×', closeX + 14, closeY + 20);
  
  // Content area (scrollable)
  return {
    contentX: x + 12,
    contentY: y + 44,
    contentW: maxW - 24,
    contentH: maxH - 56,
    closeBtn: { x: closeX, y: closeY, w: 36, h: 36 }
  };
}
```

**Scrollable content inside panel:**
```javascript
const panelScroll = { offset: 0, maxOffset: 0, dragging: false };

function drawScrollableList(ctx, items, area) {
  // Clip to content area
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.contentX, area.contentY, area.contentW, area.contentH);
  ctx.clip();
  
  const itemH = 52; // 48px touch + 4px gap
  panelScroll.maxOffset = Math.max(0, items.length * itemH - area.contentH);
  
  items.forEach((item, i) => {
    const y = area.contentY + i * itemH - panelScroll.offset;
    if (y < area.contentY - itemH || y > area.contentY + area.contentH) return; // cull
    
    // Draw item row
    ctx.fillStyle = '#ffffff08';
    roundRect(ctx, area.contentX, y, area.contentW, 48, 6);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.name, area.contentX + 12, y + 30);
  });
  
  ctx.restore();
  
  // Scrollbar indicator
  if (panelScroll.maxOffset > 0) {
    const barH = Math.max(20, area.contentH * (area.contentH / (items.length * itemH)));
    const barY = area.contentY + (panelScroll.offset / panelScroll.maxOffset) * (area.contentH - barH);
    ctx.fillStyle = '#ffffff30';
    roundRect(ctx, area.contentX + area.contentW - 4, barY, 4, barH, 2);
  }
}
```

### Problem 4: No grouping — flat list of actions

**WRONG:** 12 separate buttons scattered on screen

**RIGHT — Contextual grouping:**

```javascript
// Only show buttons relevant to CURRENT game state
function getVisibleButtons(gameState, player) {
  const buttons = [];
  
  // ALWAYS visible
  buttons.push({ id: 'primary', icon: 'ATK', priority: 0 });
  
  // Context: near interactable
  if (player.nearInteractable)
    buttons.push({ id: 'interact', icon: 'E', priority: 1 });
  
  // Context: has throwable equipped
  if (player.grenades > 0)
    buttons.push({ id: 'grenade', icon: 'G', priority: 2 });
  
  // Context: weapon needs reload
  if (player.ammo < player.maxAmmo * 0.3)
    buttons.push({ id: 'reload', icon: 'R', priority: 1 });
  
  // Context: in build mode
  if (gameState === 'building')
    buttons.push(
      { id: 'wall', icon: 'W', priority: 1 },
      { id: 'floor', icon: 'F', priority: 1 },
      { id: 'cancel', icon: '×', priority: 0 }
    );
  
  // Max 5 buttons visible at once
  return buttons.sort((a, b) => a.priority - b.priority).slice(0, 5);
}
```

### Problem 5: Text/info too small or too much

**Rules:**
- Game info text: minimum 14px (on 360px screen = readable)
- Scale text with screen: `Math.max(14, canvas.width * 0.035)`
- Damage numbers: 20px+, bold, with outline for readability
- Status bars: minimum 8px height, prefer 12px
- Tooltips: NEVER show on mobile (no hover). Use tap-to-inspect.
- Long text: truncate with "..." — full text in panel on tap

```javascript
// Responsive font size
function fontSize(base) {
  return Math.max(base, Math.min(base * 1.5, canvas.width * (base / 400)));
}

// Text with outline (readable on any background)
function drawTextOutlined(ctx, text, x, y, size, color) {
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
```

## Step 3: Adaptation Checklist

When converting desktop game UI to mobile, go through this list:

```
1. LIST all UI elements from desktop version
2. CATEGORIZE each:
   - [A] Always visible (HP, ammo, primary action) → Layer 0
   - [D] On demand (reload, grenade, map) → Radial wheel (Layer 1)
   - [R] Rarely used (inventory, settings, skill tree) → Panel (Layer 2)
   - [X] Remove entirely (desktop-only like keybind display)
3. PLACE Layer 0 elements in correct zones (top bar + bottom corners)
4. GROUP Layer 1 into radial wheel (max 6-8 items)
5. DESIGN Layer 2 panels (responsive, scrollable, close button)
6. CHECK: can I play the game without Layer 1/2? (must be yes)
7. TEST: thumb coverage — put phone on desk, hold thumbs on controls,
   can I see HP, ammo, score, game action? (must be yes)
```

## Non-Negotiable Acceptance Criteria

- [ ] Max 4-5 permanent buttons on screen (not 12+)
- [ ] Radial wheel for secondary actions (not individual buttons)
- [ ] Full panels for complex UI (inventory, map, settings) — not inline
- [ ] Minimap: top-right corner ONLY, never bottom (thumb zone)
- [ ] All panels fit screen: maxW = min(400, screenW-32)
- [ ] Scrollable content in panels (not overflowing)
- [ ] Close button on every panel (44px+ touch target)
- [ ] Game pauses when panel is open
- [ ] Context-sensitive buttons (show only whats relevant NOW)
- [ ] Font size responsive: minimum 14px, scales with screen
- [ ] No hover-dependent tooltips (tap-to-inspect instead)
- [ ] Thumb coverage test passes (controls dont block vital info)

## ⌨️ Клавиатура: ТОЛЬКО e.code, никогда e.key для управления (полевой дефект)

WASD через `e.key === 'w'` НЕ работает в русской раскладке (там 'ц'). Правило:
- движение/действия — ТОЛЬКО физические коды: `e.code === 'KeyW' / 'KeyA' / 'KeyS' / 'KeyD' /
  'Space' / 'ArrowUp'...` — работают в ЛЮБОЙ раскладке;
- `e.key` допустим только для ввода ТЕКСТА (имя игрока) и Escape;
- стрелки — всегда дублируют WASD (бесплатно и ожидаемо);
- в подсказках управления пиши «WASD / стрелки», игрок с ru-раскладкой жмёт те же физические клавиши.
