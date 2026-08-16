---
name: game-ui
description: "Game UI/UX standards: menus, HUD, shops, inventories, dialogs — all drawn on Canvas, not HTML forms. Prevents spreadsheet-style UI. Triggers on: menu, shop, inventory, HUD, UI, arsenal, dialog, pause, game over, title screen, settings."
---

# Game UI — Canvas-Native, Not HTML Forms

## Purpose

Game UI must FEEL like a game, not a web form. Everything drawn on Canvas with gradients, glow, animations. No DOM elements inside gameplay. If the UI looks like it belongs in an admin panel — it's wrong.

## Instructions

### Step 1: NEVER use DOM for game UI

These are FORBIDDEN inside game screens:
- `<div>`, `<span>`, `<ul>`, `<li>`, `<table>`
- `<button>`, `<input>`, `<select>`
- CSS flexbox/grid for game layouts
- HTML text with CSS styling
- Scrollable containers

Everything is `ctx.fillRect`, `ctx.fillText`, `ctx.drawImage`, `ctx.beginPath`.

The ONLY HTML element is `<canvas>`. Period.

### Step 2: Draw UI with game aesthetics

**Every UI panel follows this pattern:**

```javascript
function drawPanel(ctx, x, y, w, h, title) {
  // 1. Dark semi-transparent backdrop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  roundRect(ctx, x, y, w, h, 12);

  // 2. Border with glow
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#3b82f680';
  roundRect(ctx, x, y, w, h, 12, false, true);
  ctx.shadowBlur = 0;

  // 3. Header bar with gradient
  const headerGrad = ctx.createLinearGradient(x, y, x + w, y);
  headerGrad.addColorStop(0, '#3b82f640');
  headerGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = headerGrad;
  roundRect(ctx, x + 1, y + 1, w - 2, 36, [11, 11, 0, 0]);

  // 4. Title text with shadow
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 16px "Segoe UI", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 16, y + 24);

  // 5. Subtle inner line
  ctx.strokeStyle = '#ffffff10';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 38);
  ctx.lineTo(x + w - 10, y + 38);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  if (typeof r === 'number') r = [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + r[0], y);
  ctx.arcTo(x + w, y, x + w, y + h, r[1]);
  ctx.arcTo(x + w, y + h, x, y + h, r[2]);
  ctx.arcTo(x, y + h, x, y, r[3]);
  ctx.arcTo(x, y, x + w, y, r[0]);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
```

### Step 3: Specific UI patterns

**Shop / Arsenal / Store:**
```javascript
function drawShopItem(ctx, x, y, w, item, isSelected, canAfford) {
  const h = 56;

  // Background — hover highlight
  if (isSelected) {
    ctx.fillStyle = '#ffffff10';
    roundRect(ctx, x, y, w, h, 6);
  }

  // Icon (colored square with gradient — NOT text)
  const iconGrad = ctx.createRadialGradient(x + 28, y + h/2, 0, x + 28, y + h/2, 18);
  iconGrad.addColorStop(0, item.color || '#f59e0b');
  iconGrad.addColorStop(1, (item.color || '#f59e0b') + '60');
  ctx.fillStyle = iconGrad;
  ctx.beginPath();
  ctx.arc(x + 28, y + h/2, 18, 0, Math.PI * 2);
  ctx.fill();

  // Item name
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 14px "Segoe UI", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(item.name, x + 56, y + 22);

  // Stats line (small, muted)
  ctx.fillStyle = '#636e72';
  ctx.font = '11px "Segoe UI", system-ui';
  ctx.fillText(item.stats, x + 56, y + 40);

  // Price (right-aligned, colored by affordability)
  ctx.fillStyle = canAfford ? '#10b981' : '#ef4444';
  ctx.font = 'bold 14px "Segoe UI", system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('$' + item.price, x + w - 16, y + 32);

  // Separator line
  ctx.strokeStyle = '#ffffff08';
  ctx.beginPath();
  ctx.moveTo(x + 10, y + h);
  ctx.lineTo(x + w - 10, y + h);
  ctx.stroke();
}
```

**HUD (heads-up display):**
```javascript
function drawHUD(ctx, player) {
  // HP bar — gradient red→green
  const hpRatio = player.hp / player.maxHp;
  const hpW = 150, hpH = 12, hpX = 20, hpY = 20;

  // Background
  ctx.fillStyle = '#1a1a2e';
  roundRect(ctx, hpX, hpY, hpW, hpH, 6);

  // Fill
  const hpGrad = ctx.createLinearGradient(hpX, 0, hpX + hpW * hpRatio, 0);
  hpGrad.addColorStop(0, hpRatio > 0.5 ? '#10b981' : '#ef4444');
  hpGrad.addColorStop(1, hpRatio > 0.5 ? '#059669' : '#dc2626');
  ctx.fillStyle = hpGrad;
  roundRect(ctx, hpX, hpY, hpW * hpRatio, hpH, 6);

  // Glow on low HP
  if (hpRatio < 0.3) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ef444480';
    roundRect(ctx, hpX, hpY, hpW * hpRatio, hpH, 6);
    ctx.shadowBlur = 0;
  }

  // HP text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(player.hp + '/' + player.maxHp, hpX + hpW / 2, hpY + 10);

  // Score (top-right)
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('$' + player.money, canvas.width - 20, 34);

  // Weapon indicator (bottom-center)
  ctx.fillStyle = '#3b82f680';
  roundRect(ctx, canvas.width / 2 - 60, canvas.height - 50, 120, 36, 8);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px "Segoe UI", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(player.weapon.name + ' | ' + player.ammo, canvas.width / 2, canvas.height - 28);
}
```

**Inventory grid:**
```javascript
function drawInventory(ctx, items, selected, cols, cellSize, startX, startY) {
  for (let i = 0; i < items.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * (cellSize + 4);
    const y = startY + row * (cellSize + 4);

    // Slot background
    ctx.fillStyle = i === selected ? '#3b82f630' : '#ffffff08';
    ctx.strokeStyle = i === selected ? '#3b82f6' : '#ffffff15';
    ctx.lineWidth = i === selected ? 2 : 1;
    roundRect(ctx, x, y, cellSize, cellSize, 6, true, true);

    if (items[i]) {
      // Item icon (colored circle with letter)
      const rarityColors = { common: '#9ca3af', uncommon: '#10b981', rare: '#3b82f6', epic: '#8b5cf6', legendary: '#f59e0b' };
      ctx.fillStyle = rarityColors[items[i].rarity] || '#9ca3af';
      ctx.beginPath();
      ctx.arc(x + cellSize / 2, y + cellSize / 2 - 4, cellSize / 3, 0, Math.PI * 2);
      ctx.fill();

      // Letter
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${cellSize / 3}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(items[i].name[0], x + cellSize / 2, y + cellSize / 2);

      // Quantity
      if (items[i].qty > 1) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('x' + items[i].qty, x + cellSize - 4, y + cellSize - 4);
      }
    }
  }
}
```

**Title screen:**
```javascript
function drawTitleScreen(ctx) {
  // Background gradient
  const bg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width/2);
  bg.addColorStop(0, '#1a1a3e');
  bg.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Floating particles behind title
  // (use particle system from visual-quality skill)

  // Title — large, with glow
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#3b82f680';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 48px "Segoe UI", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('GAME TITLE', canvas.width / 2, canvas.height / 2 - 40);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.fillStyle = '#636e72';
  ctx.font = '16px "Segoe UI", system-ui';
  ctx.fillText('Click to Start', canvas.width / 2, canvas.height / 2 + 20);

  // Pulsing prompt
  const pulse = 0.5 + Math.sin(Date.now() / 500) * 0.3;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#3b82f6';
  ctx.fillText('▶  PRESS ANY KEY  ◀', canvas.width / 2, canvas.height / 2 + 60);
  ctx.globalAlpha = 1;
}
```

**Game Over screen:**
```javascript
function drawGameOver(ctx, score, bestScore) {
  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Central panel
  drawPanel(ctx, canvas.width/2 - 160, canvas.height/2 - 120, 320, 240, 'GAME OVER');

  // Score
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(score, canvas.width / 2, canvas.height / 2 - 20);

  ctx.fillStyle = '#636e72';
  ctx.font = '14px "Segoe UI", system-ui';
  ctx.fillText('BEST: ' + bestScore, canvas.width / 2, canvas.height / 2 + 10);

  // New record flash
  if (score >= bestScore) {
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 16px "Segoe UI", system-ui';
    ctx.fillText('★ NEW RECORD ★', canvas.width / 2, canvas.height / 2 + 40);
  }

  // Buttons
  drawButton(ctx, canvas.width/2 - 100, canvas.height/2 + 60, 200, 44, 'RESTART', '#3b82f6');
  drawButton(ctx, canvas.width/2 - 100, canvas.height/2 + 112, 200, 44, 'MENU', '#636e72');
}

function drawButton(ctx, x, y, w, h, text, color) {
  // Gradient background
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + '80');
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 8);

  // Text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px "Segoe UI", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h / 2 + 5);
}
```

**Tabs (weapon slots, categories):**
```javascript
function drawTabs(ctx, tabs, activeIndex, x, y) {
  const tabW = 100, tabH = 32, gap = 4;
  tabs.forEach((tab, i) => {
    const tx = x + i * (tabW + gap);
    const isActive = i === activeIndex;

    // Background
    ctx.fillStyle = isActive ? '#3b82f630' : '#ffffff08';
    ctx.strokeStyle = isActive ? '#3b82f6' : '#ffffff15';
    ctx.lineWidth = isActive ? 2 : 1;
    roundRect(ctx, tx, y, tabW, tabH, [6, 6, 0, 0], true, true);

    // Active indicator line
    if (isActive) {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(tx, y + tabH - 2, tabW, 2);
    }

    // Text
    ctx.fillStyle = isActive ? '#e2e8f0' : '#636e72';
    ctx.font = (isActive ? 'bold ' : '') + '12px "Segoe UI", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(tab, tx + tabW / 2, y + 20);
  });
}
```

**Scrollable list (Canvas-based, not DOM):**
```javascript
const scroll = { offset: 0, maxOffset: 0, dragging: false, startY: 0 };

function updateScroll(items, visibleH, itemH) {
  scroll.maxOffset = Math.max(0, items.length * itemH - visibleH);
  scroll.offset = Math.max(0, Math.min(scroll.offset, scroll.maxOffset));
}

// Mouse wheel / touch drag to scroll
canvas.addEventListener('wheel', e => { scroll.offset += e.deltaY * 0.5; });
// Draw items with offset: y - scroll.offset, clip to panel bounds
```

## Non-Negotiable Acceptance Criteria

- [ ] ZERO DOM elements used for game UI (no div, button, input, table, ul, li)
- [ ] All UI drawn on Canvas with ctx methods
- [ ] Panels have dark backdrop + colored border + glow
- [ ] Text uses ctx.fillText (not HTML text)
- [ ] Buttons are drawn rectangles with hover/click detection via mouse position
- [ ] HUD uses gradient health bars (not plain rectangles)
- [ ] Shop items have icon + name + stats + price (not a text list)
- [ ] Colors use palette constants (not hardcoded per element)
- [ ] Selected/hovered items visually highlighted
- [ ] Title screen has glow/particles (not plain text on black)
- [ ] Game Over has panel + score + buttons (not alert())
- [ ] All UI scales with canvas.width/height (not fixed pixels)
