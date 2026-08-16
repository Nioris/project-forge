---
name: visual-upgrade
kind: tactical
description: "Upgrade 2D/canvas/pixel game graphics: Canvas rendering (shadows, lighting, glow, blur), color palettes, animated mood/time-of-day palette lerp, distance fog, CSS vignette, parallax depth, art style, sprite prompts, animations (easing, tweens) and game-feel juice (screen shake, hit-flash, squash/stretch, hit-stop, particles). Transforms programmer-art into polished visuals. Triggers on: graphics, visual, art, ugly, style, palette, glow, shadow, light, animation, sprite, polish, pretty, juice, game feel, сочность, атмосфера, день ночь, day night, улучшить графику, красивая 2д графика, pixel art polish, пиксельная графика, mood, выглядит дёшево."
---

# Visual Upgrade — From Programmer Art to Polished

## Phase -1: Art-direction spec (v4.11+, MANDATORY)

Run `/art-direction` first. It produces `wiki/design/art-direction-{Project}.md` with the binding
palette (exact hex ramps), detail-density target, and hero details. Everything below upgrades the
game *to that spec*, then runs the Part B self-critique loop on a screenshot BEFORE showing the
user. Without the spec you get generic polish that needs re-doing.

## Phase 0: Research references (v4.5+, MANDATORY unless user skips)

**Before making changes, understand what similar successful games/apps do.** This prevents blind reinvention and grounds decisions in real patterns.

Invoke: `/research-references {genre/category} {specific-aspect}`

This produces `wiki/research/{Project}-references.md` with 3-5 real competitors, extracted patterns, and UI/UX direction. Wait for user confirmation of the direction before applying changes below.

**Skip if:** user explicitly says "skip research" / "без research", or `wiki/research/{Project}-references.md` already exists and is <14 days old.

## Phase 0.5: Layout system check (v4.10.5, MANDATORY)

**Before changing colors / fonts / shadows — verify hierarchy + grid spec exists.**

Visual choices (palette, glow, animations) **amplify** existing structure. If structure broken (random spacing, flat hierarchy, no tier system) — visual upgrade makes it **prettier broken**, not fixed.

Check:
1. `wiki/design/hierarchy-*.md` exists для главных screens? If not → **invoke `/info-hierarchy` first**.
2. `wiki/design/layout-system.md` exists? If not → **invoke `/layout-system` first**.

Why mandatory: observable pattern в самогонщик/genetic-lab — красивые цвета на flat hierarchy дают "приятный визуал но панели не на месте". Layout system fixes structure, visual-upgrade polishes the surface — этот order non-negotiable.

**Skip if:** user explicitly opts out OR existing UI scored ≥7/10 на ui-review.

---

## Purpose
Games arrive with basic shapes and flat colors. This skill transforms them into visually appealing products without replacing the engine — pure Canvas 2D upgrades.

## ⚠️ SAFE ZONE
- ✅ Drawing code (fillRect → gradient + shadow + glow)
- ✅ Color values, palettes
- ✅ Particle systems, effects
- ✅ Animation timing, easing
- ✅ Background rendering
- ✅ Sprite generation prompts (for AI tools)
- 🚫 NEVER: SDK, localization, ads, debug, sound mute

---

## Step 0.7: DESKTOP LAYOUT — никогда «квадрат в чёрной пустоте» (MANDATORY)

Больная тема (скрины tyl/dronedefence): игра рендерится квадратом по центру широкого экрана,
вокруг — плоская чернота. На десктопе (основной формат Яндекса, 1.6.2.1 «поле растягивается до
края») это выглядит как непродакшн и валит рантайм-чек «Canvas fills screen». Три правила:

### 1. Ширину экрана ЗАНИМАЕМ, а не игнорируем
Приоритет решений (сверху вниз):
- **Поле тянется** — если механика позволяет (раннер, аркада): canvas = 100vw×100vh, мир шире.
- **Панели по бокам** — если поле фикс-пропорций (сетка/TD/пошаговая): магазин/статы/лог хода
  выносятся в боковые колонки на ≥1200px (CSS grid: `grid-template-columns: 1fr auto 1fr`),
  а не сжимаются под полем. То, что на мобиле снизу — на десктопе по бокам.
- **Минимум**: поле масштабируется до max(высота, ширина/2) — помним 1.6.2.2 (≤2:1).

### 2. Letterbox-зоны — АТМОСФЕРА, никогда flat-black
Если пустые поля всё же остаются — они часть арт-дирекшна:
```css
body{ background:
  radial-gradient(ellipse at 50% 40%, {PAL.bgAlt} 0%, {PAL.bg} 55%, #05070c 100%); }
body::before{ content:''; position:fixed; inset:0; pointer-events:none; opacity:.15;
  background-image:{тематический паттерн: сетка/шум/символика игры — inline SVG data-uri};
}
```
+ виньетка из Step 7c поверх. Тема паттерна — из art-direction спеки (гексы для варгейма,
шестерёнки для завода, звёзды для космоса). Генерённый арт-задник (asset-generation, роль
"backdrop") — ещё лучше: тёмный, низкоконтрастный, не спорит с полем.

### 2b. Панели — ЧАСТЬ МИРА, композиция — одна сцена (полевой кейс «Обход»)
Дефолтные CSS-коробки, раскиданные по углам = ХУЖЕ пустоты (три оторванных острова).
Правила боковых панелей:
- **Примыкают к полю** — единая композиция: панель растёт ОТ кромки игрового поля, не
  плавает у края экрана; всё вместе читается одной сценой в общей раме.
- **Из материалов игры**: та же палитра, те же фактуры (деревянная игра → панели-полки/
  таблички; терминальная → панели-мониторы; бумажная → стикеры/блокнот). Дефолтный
  border+background без стиля игры = дефект.
- **Центр тоже растёт**: вынос панелей — не повод оставить поле прежней ширины; поле
  масштабируется до комфортной (панели занимают ~20-25% ширины каждая, поле — остальное).
- Фон позади сцены — АТМОСФЕРА по art-direction (для интерьерной игры: вид двора/города
  за «окном» экрана, паттерн темы), не заливка с точками.
Сдача: скриншот, на котором панели неотличимы по стилю от игры (тест: «выглядит как один
арт или как игра + админка сбоку?»).

### 2c. Десктоп = ПЕРЕКОМПОНОВКА ядра, не декорация полей (полевой кейс «Обход» v2)
Если ядро игры — фиксированная портретная колонка, то панели/фон вокруг неё десктопом НЕ
являются: масштаб упирается в высоту, центр физически не растёт. Правила:
- десктопное ядро — своя ширина (ориентир ≥900px при базе ~420): контент перекладывается
  в 2-3 ряда ПО ШИРИНЕ, спрайты крупнее; узкая колонка в центре десктопа = дефект;
- типографика масштабируется: база 16-18px, заголовки 22-24 (мобильные 11-13 нечитаемы);
- модалки: ширина от десктопного ядра, отступы контента ≥16px, кнопки не касаются рамок,
  затемнение на ВЕСЬ экран;
- элементы, вынесенные в боковые панели, УБИРАЮТСЯ из центра (не дублируются);
- десктопный ввод: hover-подсказки по pointerover обязательны (удержание — тач-паттерн);
- HUD-панель без контента на половину высоты = дефект: раскладывай по высоте или ужимай.

### 3. Проверка глазами на 1920×1080 ОБЯЗАТЕЛЬНА
После вёрстки: playtest-скриншоты на 1280×720 + вручную окно на полную ширину. Вопрос-тест:
«если убрать игру, экран выглядит как обложка или как выключенный монитор?» Выключенный → Step 0.7
не выполнен.

## Step 1: Color Palette System

**WRONG:** Random colors, #ff0000 red everywhere, no harmony.
**RIGHT:** Curated palette, 5-7 colors, consistent mood.

```javascript
// Define palette ONCE, use everywhere
const PALETTE = {
  // Choose ONE style per game:

  // NEON CYBER
  bg: '#0a0a1a',
  bgAlt: '#12122e',
  primary: '#00f5d4',    // teal
  secondary: '#7b2ff7',  // purple
  accent: '#f72585',     // pink
  text: '#e0e0e0',
  textDim: '#666680',
  danger: '#ff4d6a',
  success: '#4ade80',
  gold: '#ffd700',

  // WARM FANTASY
  // bg: '#1a120b', bgAlt: '#2d1f14',
  // primary: '#d4a574', secondary: '#8b5e3c',
  // accent: '#e6553a', text: '#f5e6d3', gold: '#ffd700',

  // ARCTIC MINIMAL
  // bg: '#0c1824', bgAlt: '#142535',
  // primary: '#67d4e8', secondary: '#3a7ec0',
  // accent: '#ff6b6b', text: '#d4e5f7', gold: '#ffeaa7',

  // PIXEL RETRO
  // bg: '#1a1c2c', bgAlt: '#333c57',
  // primary: '#41a6f6', secondary: '#b13e53',
  // accent: '#73eff7', text: '#f4f4f4', gold: '#ffcd75',
};

// Usage: NEVER hardcode colors in draw calls
// ❌ ctx.fillStyle = '#ff0000';
// ✅ ctx.fillStyle = PALETTE.danger;
```

### Auto-generate palette from genre:
| Genre | Mood | Primary | Accent | Background |
|-------|------|---------|--------|-----------|
| Shooter | Aggressive | Neon teal/green | Hot pink/red | Dark blue-black |
| Puzzle | Calm | Soft blue/lavender | Warm orange | Off-white or deep navy |
| Platformer | Playful | Bright green/blue | Yellow/orange | Sky gradient |
| Horror/Survival | Tense | Desaturated teal | Blood red | Near-black |
| Racing | Speed | Electric blue | Flame orange | Dark asphalt |
| Idle/Tycoon | Cozy | Warm gold/amber | Green (money!) | Cream/beige |
| Strategy | Serious | Steel blue | Gold/bronze | Dark slate |

## Step 2: Canvas Rendering Upgrades

### Shadows (depth)
```javascript
// Every significant object should cast a shadow
function drawWithShadow(ctx, drawFn, shadowOpts = {}) {
  const { blur = 10, color = 'rgba(0,0,0,0.3)', offX = 3, offY = 5 } = shadowOpts;
  ctx.save();
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  ctx.shadowOffsetX = offX;
  ctx.shadowOffsetY = offY;
  drawFn();
  ctx.restore();
}

// Usage:
drawWithShadow(ctx, () => {
  ctx.fillStyle = PALETTE.primary;
  ctx.fillRect(player.x, player.y, player.w, player.h);
});
```

### Glow (neon effect)
```javascript
// Glow = draw twice: blurred big + sharp small
function drawGlow(ctx, drawFn, color, intensity = 15) {
  ctx.save();
  ctx.shadowBlur = intensity;
  ctx.shadowColor = color;
  drawFn(); // first pass: glow
  drawFn(); // second pass: sharper core (stacks)
  ctx.restore();
}

// Glowing bullet:
drawGlow(ctx, () => {
  ctx.fillStyle = PALETTE.accent;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
  ctx.fill();
}, PALETTE.accent, 20);
```

### Lighting (radial gradient overlay)
```javascript
// Player emits light in dark environment
function drawLighting(ctx, lightSources) {
  // Draw darkness overlay
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cut out light circles using 'destination-out'
  ctx.globalCompositeOperation = 'destination-out';
  for (const light of lightSources) {
    const grad = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Usage:
drawGame(ctx);
drawLighting(ctx, [
  { x: player.x, y: player.y, radius: 150 },
  { x: torch.x, y: torch.y, radius: 80 },
]);
```

### Gradient everything (no flat fills)
```javascript
// ❌ FLAT
ctx.fillStyle = '#2a2a4a';
ctx.fillRect(0, 0, w, h);

// ✅ GRADIENT
const bg = ctx.createLinearGradient(0, 0, 0, h);
bg.addColorStop(0, PALETTE.bg);
bg.addColorStop(1, PALETTE.bgAlt);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, w, h);

// ✅ RADIAL for objects
function drawOrb(ctx, x, y, r, color) {
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, lighten(color, 40));  // bright center
  grad.addColorStop(0.7, color);              // main color
  grad.addColorStop(1, darken(color, 30));    // dark edge
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Color helpers
function lighten(hex, pct) {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, r + Math.round(r * pct / 100));
  g = Math.min(255, g + Math.round(g * pct / 100));
  b = Math.min(255, b + Math.round(b * pct / 100));
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}
function darken(hex, pct) { return lighten(hex, -pct); }
```

### Outline/stroke style (makes shapes pop)
```javascript
// Every game entity: fill + thin stroke
function drawEntity(ctx, x, y, w, h, color) {
  // Fill with gradient
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, lighten(color, 20));
  grad.addColorStop(1, darken(color, 10));
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 4, true, false);

  // Subtle stroke
  ctx.strokeStyle = lighten(color, 40);
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 4, false, true);
}

// Rounded rect helper
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
```

## Step 3: Particle System (universal)

```javascript
class ParticleSystem {
  constructor() { this.particles = []; }

  emit(x, y, config) {
    const { count = 20, speed = 100, life = 1, size = 3, color = PALETTE.accent,
            gravity = 0, spread = Math.PI * 2, drag = 0.98, sizeDecay = true } = config;
    for (let i = 0; i < count; i++) {
      const angle = -spread / 2 + Math.random() * spread;
      const spd = speed * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life, maxLife: life,
        size, color, gravity, drag, sizeDecay,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const t = p.life / p.maxLife; // 1→0
      ctx.globalAlpha = t;
      const sz = p.sizeDecay ? p.size * t : p.size;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Presets:
const FX = {
  explosion: { count: 30, speed: 200, life: 0.6, size: 4, gravity: 100 },
  sparkle: { count: 10, speed: 60, life: 0.4, size: 2, gravity: 0 },
  blood: { count: 15, speed: 120, life: 0.5, size: 3, color: PALETTE.danger, gravity: 300 },
  coins: { count: 8, speed: 80, life: 0.8, size: 3, color: PALETTE.gold, gravity: 200 },
  smoke: { count: 20, speed: 30, life: 1.5, size: 6, color: '#888', gravity: -20, drag: 0.95 },
  trail: { count: 3, speed: 10, life: 0.3, size: 2, gravity: 0 },
};

// Usage:
particles.emit(enemy.x, enemy.y, FX.explosion);
particles.emit(coin.x, coin.y, FX.coins);
// Every frame: particles.update(dt); particles.draw(ctx);
```

## Step 4: Animations & Easing

```javascript
// Easing functions — makes everything feel alive
const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  outBack: t => { const s = 1.70158; return --t * t * ((s + 1) * t + s) + 1; },
  outBounce: t => {
    if (t < 1/2.75) return 7.5625 * t * t;
    if (t < 2/2.75) return 7.5625 * (t -= 1.5/2.75) * t + 0.75;
    if (t < 2.5/2.75) return 7.5625 * (t -= 2.25/2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625/2.75) * t + 0.984375;
  },
  outElastic: t => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
  },
};

// Tween system
class Tween {
  constructor(target, props, duration, easeFn = ease.outQuad, onComplete) {
    this.target = target;
    this.startValues = {};
    this.endValues = props;
    this.duration = duration;
    this.elapsed = 0;
    this.ease = easeFn;
    this.onComplete = onComplete;
    this.done = false;
    for (const key in props) this.startValues[key] = target[key];
  }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    const e = this.ease(t);
    for (const key in this.endValues) {
      this.target[key] = this.startValues[key] + (this.endValues[key] - this.startValues[key]) * e;
    }
    if (t >= 1) { this.done = true; this.onComplete?.(); }
  }
}

// Usage examples:
// Score popup flies up and fades
const popup = { x: 100, y: 200, alpha: 1, scale: 0 };
tweens.push(new Tween(popup, { y: 150, alpha: 0, scale: 1.5 }, 0.8, ease.outBack));

// Button press bounce
new Tween(button, { scale: 0.85 }, 0.1, ease.inQuad, () => {
  new Tween(button, { scale: 1 }, 0.3, ease.outElastic);
});

// Enemy death: shrink + fade
new Tween(enemy, { scale: 0, alpha: 0 }, 0.3, ease.inQuad);

// Screen shake (manual, not tween)
let shakeIntensity = 0, shakeTimer = 0;
function shake(intensity, duration) {
  shakeIntensity = intensity;
  shakeTimer = duration;
}
// In draw: if (shakeTimer > 0) ctx.translate(
//   (Math.random()-0.5) * shakeIntensity,
//   (Math.random()-0.5) * shakeIntensity);
```

### What to animate:
| Event | Animation | Easing |
|-------|-----------|--------|
| Button hover | Scale 1 → 1.05 | outQuad |
| Button press | Scale → 0.9 → 1.1 → 1 | outElastic |
| Score change | Number rolls up + bounce | outBack |
| Enemy death | Shrink + particles | inQuad |
| Player hit | Flash white + shake | linear |
| Pickup | Scale pop + float up | outBack |
| Level transition | Fade to black → fade in | inOutQuad |
| UI panel open | Scale 0 → 1 from center | outBack |
| Damage number | Float up + fade | outQuad |

## Step 5: Sprite generation

**For pixel-art sprites → use `/pixel-art`** (code-drawn sprites + sprite sheets + animation
frames, zero downloads, tiny zip — the proper path for retro/2D games). Use the AI-prompt route
below ONLY when the project deliberately wants AI-generated raster art AND you've cleared the
asset-size / CDN constraints.

When game needs AI-generated sprites, generate prompts for AI art tools (feed them the
/art-direction palette + style so output matches the game, not generic):

```markdown
## Sprite: Player Character
**Midjourney:** 2D game character sprite sheet, {genre} style, {color palette},
facing right, idle + run + attack poses, transparent background,
pixel art / vector art / hand-painted style --ar 4:1 --v 6

**GPT Image:** Create a 2D game character sprite sheet with 4 frames:
idle, run frame 1, run frame 2, attack. Style: {style}. Colors: {palette}.
Character: {description}. Transparent background. 512x128 pixels.

## Sprite: Enemy
**Midjourney:** 2D enemy sprite for {genre} game, {description},
menacing pose, {style}, game-ready, transparent bg --ar 1:1 --v 6

## Tileset: Environment
**Midjourney:** 2D tileset for {genre} game, {environment description},
top-down / side-view, seamless tiles, {style} --tile --ar 1:1 --v 6
```

### Style keywords by genre:
| Genre | Style Keywords |
|-------|---------------|
| Shooter | Sci-fi, neon glow, metallic, dark atmosphere |
| Platformer | Colorful, cartoon, bouncy, hand-drawn |
| Puzzle | Clean, minimal, geometric, pastel |
| RPG | Fantasy, detailed, medieval, painterly |
| Horror | Gritty, dark, organic, desaturated |
| Casual | Flat design, bright, rounded, cheerful |

## Step 6: Background Upgrade

```javascript
// NEVER plain solid color. ALWAYS layered:
function drawBackground(ctx, camera) {
  const w = canvas.width, h = canvas.height;

  // Layer 1: Gradient sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, PALETTE.bg);
  sky.addColorStop(1, PALETTE.bgAlt);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Layer 2: Parallax stars/particles (slow)
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (const star of bgStars) {
    const x = ((star.x - camera.x * star.depth) % w + w) % w;
    ctx.fillRect(x, star.y, star.size, star.size);
  }

  // Layer 3: Parallax clouds/shapes (medium)
  ctx.globalAlpha = 0.1;
  for (const cloud of bgClouds) {
    const x = ((cloud.x - camera.x * 0.3) % (w + 200)) - 100;
    ctx.fillStyle = PALETTE.primary;
    ctx.beginPath();
    ctx.arc(x, cloud.y, cloud.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Layer 4: Grid/ground (closest, moves with camera)
  // Optional: subtle grid lines for sci-fi feel
}
```

## Step 7: Cheap atmosphere & juice — the "expensive look" for 2D (ported from 3D lessons)

The same insight that makes a stylized Three.js game look high-end applies to 2D/canvas: the lift
comes from **a palette that shifts over time, soft lighting, vignette, and game-feel** — not from
more detail. These are near-free on a 2D canvas and are the highest-leverage upgrades after Step 1's
static palette. (3D parallel: this is the `lerpEnv` / fog-horizon / CSS-vignette recipe from
/three-setup Step 7, adapted to 2D.)

### 7a. Time-of-day / mood palette LERP (the standout — animate the whole mood from one scalar)
A static palette (Step 1) is good; a palette that *drifts* (day→dusk→night, calm→danger, depth
levels) is what reads as "produced". Define palette stops and interpolate every colour together:

```javascript
function hexToRgb(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function lerpHex(a,b,t){ const A=hexToRgb(a),B=hexToRgb(b);
  return `rgb(${Math.round(A[0]+(B[0]-A[0])*t)},${Math.round(A[1]+(B[1]-A[1])*t)},${Math.round(A[2]+(B[2]-A[2])*t)})`; }

const MOODS = {
  day:   { bg:'#7e9cc0', bgAlt:'#aec8e0', fog:'#c8d8ec', tint:'#fff2d8', vignette:0.30 },
  dusk:  { bg:'#5a3a4a', bgAlt:'#b07a6a', fog:'#7a5a55', tint:'#ff8a4a', vignette:0.45 },
  night: { bg:'#0a1020', bgAlt:'#101a36', fog:'#10182a', tint:'#6a7fc0', vignette:0.80 },
};
// current interpolated palette — recompute when `p` (0..1 time-of-day) changes:
function moodAt(p){
  const [A,B,t] = p<0.55 ? [MOODS.day,MOODS.dusk,p/0.55] : [MOODS.dusk,MOODS.night,(p-0.55)/0.45];
  return { bg:lerpHex(A.bg,B.bg,t), bgAlt:lerpHex(A.bgAlt,B.bgAlt,t),
           fog:lerpHex(A.fog,B.fog,t), tint:lerpHex(A.tint,B.tint,t),
           vignette:A.vignette+(B.vignette-A.vignette)*t };
}
// use it: PAL = moodAt(timeOfDay); drawBackground uses PAL.bg/PAL.bgAlt; vignette uses PAL.vignette
```
One scalar animates the entire scene's mood. Drive `p` by a level timer, depth, score, or real time.

### 7b. Distance fog / haze in 2D (depth + horizon, like 3D fog)
Fade distant parallax layers toward the fog colour so the world dissolves into the horizon instead
of ending at a hard edge — and it hides pop-in of far layers:
```javascript
// when drawing a far parallax layer at depth d (0=near .. 1=far):
ctx.globalAlpha = 1 - d * 0.6;                 // far layers fainter
ctx.drawImage(layer, x, y);
ctx.fillStyle = PAL.fog; ctx.globalAlpha = d * 0.5;  // wash far layers toward fog colour
ctx.fillRect(0, 0, canvas.width, horizonY);
ctx.globalAlpha = 1;
```

### 7c. Vignette via CSS overlay (NOT per-pixel canvas — free)
Darkening canvas edges per-pixel is slow; a CSS radial-gradient over the canvas costs zero draw time
and reads as cinematic. Tie its opacity to the mood (`PAL.vignette`):
```html
<div id="vignette"></div>
<style>
#vignette{ position:fixed; inset:0; pointer-events:none; z-index:5; transition:opacity .8s;
  background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%); }
</style>
<script> vignette.style.opacity = PAL.vignette; </script>
```

### 7d. Game-feel "juice" — the cheapest perceived-quality jump of all
Players read responsiveness as polish. None of this needs assets:
- **Screen shake** on impact: offset the canvas/camera a few px for ~120ms, decaying.
  `shake=8; …; const s=shake*(Math.random()-0.5); ctx.translate(s,s); shake*=0.85;`
- **Hit-flash**: draw the sprite white for 1–2 frames on damage (`ctx.globalCompositeOperation='lighter'` or a white-tinted copy).
- **Squash & stretch**: scale a jumping/landing sprite 1.15×0.85 then ease back — sells weight.
- **Particle burst** on every meaningful event (Step 3 system) — coins, hits, pickups.
- **Ease everything** (Step 4) — no value snaps; pops, slides, fades. Number tweens on score.
- **Hit-stop**: freeze the frame ~40–60ms on a big hit before resuming — makes impact land.

### Pixel-art specific (keep it crisp + cohesive)
- Render at integer scale only: `ctx.imageSmoothingEnabled=false` + scale ×2/×3/×4 (never ×2.5) so
  pixels stay square. (See /pixel-art for sprite construction.)
- Apply the mood tint (7a) as a low-alpha full-screen `globalCompositeOperation='multiply'` pass so
  day/night recolours the whole sprite set without redrawing art — a classic cheap retro trick.
- Dithering (2×2 / Bayer) for gradients instead of smooth fills keeps the retro feel while adding depth.

### /do instruction (improve a 2D/pixel game's graphics)
> Apply visual-upgrade Step 7 to this 2D game: add a MOODS palette set + moodAt(p) lerp driven by one
> time-of-day/level scalar so the whole scene recolours over time; fade far parallax layers toward a
> fog colour for depth; add a CSS #vignette overlay tied to mood; and add game-feel juice (screen
> shake + hit-flash + squash/stretch + hit-stop + particle bursts on events, all eased). For pixel
> art keep integer scaling + imageSmoothingEnabled=false and apply the mood tint as a multiply pass.


- [ ] PALETTE defined (no hardcoded colors outside palette)
- [ ] Background: gradient + at least 1 parallax layer
- [ ] All entities: gradient fill (not flat) + subtle stroke
- [ ] Shadows on player, enemies, UI panels
- [ ] Glow on bullets, pickups, special effects
- [ ] Particle effects on: death, pickup, hit, levelup (minimum 4)
- [ ] Easing on ALL animations (no linear movement)
- [ ] Screen shake on impacts
- [ ] Floating numbers (damage, score) with fade
- [ ] Text: outlined (readable on any background)
- [ ] At least 3 sprite prompts generated for AI art
- [ ] Performance: particles capped (mobile: 80, desktop: 300)
- [ ] Mood: if the game has time/depth/danger progression — a MOODS palette + moodAt() lerp (Step 7a), not one static palette
- [ ] CSS #vignette overlay present (Step 7c) — NOT per-pixel canvas darkening
- [ ] Game-feel: hit-flash + squash/stretch or hit-stop on impacts (Step 7d), beyond just screen shake
- [ ] Pixel art (if applicable): integer scale + imageSmoothingEnabled=false; mood tint as multiply pass
- [ ] ⚠️ ZERO changes to SDK, localization, ads, debug

## Перед полировкой — сверься с планом стиля
У art-direction есть план (палитра именованными hex, гарнитуры по ролям, раскладка, SIGNATURE).
Полировка обязана его РЕАЛИЗОВАТЬ, а не изобретать заново. Нет SIGNATURE-элемента в игре —
визуал не сдан: он и есть то, по чему игру запомнят.

## 🔊 СЛОВАРИ ОТКЛИКА по смыслу события (не по типу объекта)
> Из `maximizing-game-feel` (abagames, MIT).

Эффект выбирается по СОБЫТИЮ и его важности, а не по тому, что это за объект. Держи словари
раздельно, иначе всё сливается в кашу:
- **опасность** — резкие силуэты, тревожные вспышки, искры, короткий жёсткий удар;
- **награда** — блики, радиальные частицы, мягкий хлопок, яркое подтверждение;
- **смена состояния** — локальный пульс, переходный мотив, сдержанный отклик камеры;
- **почти попал** — приятно, но ЗАМЕТНО слабее настоящей награды.

Для каждого важного события явно выбери эффект ИЛИ `none` — «по умолчанию ничего» это тоже
решение, но принятое, а не забытое.

**Презентация не трогает механику:** деформации, наклоны, тряска и вспышки — только на
визуальном слое; коллизии и игровое состояние остаются авторитетными. Любое смещение
и деформацию ограничивай и возвращай в покой. Дорогие эффекты включай по скорости, заряду,
величине удара или редкости события.

## 🕹️ ТЕСТ «БРАУЗЕРКА 90-х» — обязательная проверка перед сдачей визуала

Полевой кейс: игра прошла все фазы и выглядела как административная панель — таблицы, свёрнутые
секции, системный шрифт, дефолтные рамки. Признаки, каждый = дефект:

| Признак | Что должно быть |
|---|---|
| Системный шрифт (Arial/sans-serif) в игровом UI | Игровой шрифт под сеттинг (из art-direction) |
| Дефолтные `border: 1px solid` + сплошная заливка | Панели из материалов мира: дерево/камень/пергамент, 9-slice |
| Эмодзи или буквы вместо иконок | Нарисованные иконки (библиотека или генерация) |
| Таблицы, списки и `<details>` как основной экран | СЦЕНА как основной экран, таблицы — вспомогательное |
| Плоский однотонный фон | Атмосферный фон: градиент + фактура + виньетка |
| Кнопки браузерного вида | Кнопки-объекты мира с состояниями hover/press |
| Ничего не двигается | Отклик на действия: подсветка, тряска, партиклы, всплывающие числа |

**Вердикт формулируется словами:** «это выглядит как игра 2026 года или как браузерная
поделка 90-х?» Второе → фаза не сдана, возвращайся к ассетам и композиции.

Отдельно: **инструменты разработчика в релизной сборке = дефект** (поля сида, выбор ИИ,
скорость хода, «Заново», панели замеров). Прятать под `?debug=1`, в продакшене их нет —
иначе отказ по 1.15 «игра выглядит незавершённой».
