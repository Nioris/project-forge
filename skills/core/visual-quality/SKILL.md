---
name: visual-quality
description: "Canvas 2D rendering standards: composite operations, gradients, particle systems, animations, game feel, screen shake, sound design. Load when creating or reviewing any game prototype. Triggers on: game.html, prototype, render, particles, visual, effects, juice, screen shake, sound."
---

# Visual Quality Standards

## Purpose
Every prototype must look like a REAL GAME, not a student project. This skill defines the mandatory visual and audio bar.

## Instructions

### Step 1: Rendering — Canvas 2D
Use ALL modern Canvas 2D capabilities:

**Composite operations (mandatory):**
- `lighter` — additive blending for glow, fire, energy
- `screen` — soft light for ambient effects
- `multiply` — shadows, darkening
- `destination-out` — erasing, masking, fog of war

**Gradients on EVERY object (no flat fills):**
```javascript
const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
grad.addColorStop(0, '#ff6b6b');
grad.addColorStop(1, '#c0392b');
ctx.fillStyle = grad;
```

**Shadows for depth:**
```javascript
ctx.shadowBlur = 15;
ctx.shadowColor = 'rgba(0,0,0,0.5)';
```

### Step 2: Render Layers (draw in THIS order)
1. Background (gradient or pattern)
2. Parallax far (stars, clouds — slow)
3. Parallax mid (trees, buildings — medium)
4. Game objects (enemies, items)
5. Player
6. Particles
7. Screen effects (flash, vignette)
8. UI (HUD, score, lives)

### Step 3: Particle System (minimum 4 types)
```javascript
class Particle {
  constructor(x, y, config) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * config.spread;
    this.vy = (Math.random() - 0.5) * config.spread - config.upforce;
    this.life = 1.0;
    this.decay = 0.01 + Math.random() * config.decayVar;
    this.size = config.minSize + Math.random() * config.sizeVar;
    this.color = config.colors[Math.floor(Math.random() * config.colors.length)];
    this.gravity = config.gravity || 0;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += this.gravity;
    this.life -= this.decay;
    this.size *= 0.98;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.globalAlpha = this.life;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
```

Required types: explosion, sparks, smoke, trails. Use additive blending. Limit array to 200.

### Step 4: Animation — easing on EVERYTHING
```javascript
const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outElastic: t => Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
```
Squash & stretch on player. Scale bounce on pickups. Fade transitions between screens.

### Step 5: Game Feel (mandatory effects)
- **Screen shake:** `shakeX = Math.random() * intensity - intensity/2;` on impacts
- **Hit stop:** freeze 3-5 frames on powerful hits
- **Flash:** white overlay 1 frame on damage
- **Slow-mo:** `deltaTime *= 0.3` for 20 frames on kills
- **Camera lerp:** `cam.x += (target.x - cam.x) * 0.08;`

### Step 6: Sound Design — Web Audio API synthesis
```javascript
let audioCtx;
function initAudio() { audioCtx = audioCtx || new AudioContext(); }

function playSound(type) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  const f = audioCtx.createBiquadFilter();
  o.connect(f); f.connect(g); g.connect(audioCtx.destination);
  // Configure per type...
  const pitch = 1 + (Math.random() - 0.5) * 0.1; // ±5% variation
  o.frequency.value *= pitch;
  o.start(); o.stop(audioCtx.currentTime + 0.15);
}
```
Minimum 5 sounds per game. Every action has audio feedback. Pitch variation ±5%.

## Non-Negotiable Acceptance Criteria

- [ ] No flat-colored rectangles — everything has gradients
- [ ] Composite operations used (at least `lighter` for glow)
- [ ] 8 render layers in correct order
- [ ] Particle system with 4+ types, additive blending, array limited
- [ ] Easing functions (not linear movement)
- [ ] Screen shake on impacts
- [ ] 5+ synthesized sounds with pitch variation
- [ ] AudioContext created on first user click only
- [ ] ctx.save()/restore() paired, globalAlpha reset to 1
