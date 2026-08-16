---
name: game-polish
kind: tactical
description: "Pre-release game polish: what to improve before Yandex moderation, priority fixes, quality bar, production checklist. Covers onboarding, first-time experience, visual polish…"
---

# Game Polish — Ship Quality

## Phase 0: Research references (v4.5+, MANDATORY unless user skips)

**Before making changes, understand what similar successful games/apps do.** This prevents blind reinvention and grounds decisions in real patterns.

Invoke: `$research-references {genre/category} {specific-aspect}`

This produces `wiki/research/{Project}-references.md` with 3-5 real competitors, extracted patterns, and UI/UX direction. Wait for user confirmation of the direction before applying changes below.

**Skip if:** user explicitly says "skip research" / "без research", or `wiki/research/{Project}-references.md` already exists and is <14 days old.

---

## Purpose
Games pass SDK integration but fail moderation or get bad ratings because they feel unpolished. This skill is the producer's eye: what to fix BEFORE submission, in priority order.

## ⚠️ SAFE ZONE
- ✅ Visual improvements (particles, transitions, animations)
- ✅ Audio additions (sound effects, background music)
- ✅ UX improvements (loading screen, transitions, feedback)
- ✅ Onboarding / tutorial
- ✅ Content additions (levels, enemies, items)
- ✅ Performance optimization
- 🚫 NEVER: modify SDK integration, localization, debug panel

---

## Step 1: First 30 Seconds Audit

Play the game as a brand new player. Check:

| Moment | What Should Happen | Common Problem |
|--------|-------------------|----------------|
| 0-3s | Loading screen with progress | Blank white screen |
| 3-5s | Title screen with game art | Plain text on black |
| 5-10s | Tap to start → immediate action | Confusing menu |
| 10-20s | Player understands core mechanic | No tutorial, no hints |
| 20-30s | First reward / positive feedback | Nothing happens |

### Studio Splash (ОБЯЗАТЕЛЬНО — перед loading screen)

Показывается ПЕРВЫМ на 2-3 секунды, потом fade → loading screen.

```javascript
/**
 * Studio splash: "3/9 GAMES" + "Rodrik" + contact
 * Shows for 2.5s with fade-in → hold → fade-out
 * Call showSplash(ctx, canvas, callback) at game start
 */
function showSplash(ctx, canvas, onComplete) {
  const DURATION = 2500;  // total ms
  const FADE_IN = 400;    // ms
  const FADE_OUT = 400;   // ms
  const start = performance.now();

  function drawSplash(now) {
    const elapsed = now - start;
    if (elapsed >= DURATION) { onComplete(); return; }

    // Calculate alpha: fade in → hold → fade out
    let alpha;
    if (elapsed < FADE_IN) alpha = elapsed / FADE_IN;
    else if (elapsed > DURATION - FADE_OUT) alpha = (DURATION - elapsed) / FADE_OUT;
    else alpha = 1;

    const w = canvas.width, h = canvas.height;

    // Background: dark gradient
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';

    // "3/9 GAMES" — large, bold, with subtle glow
    const mainSize = Math.max(32, Math.min(64, w * 0.08));
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(245, 166, 35, 0.4)';
    ctx.font = 'bold ' + mainSize + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#f5a623';
    ctx.fillText('3/9 GAMES', w / 2, h / 2 - mainSize * 0.3);
    ctx.shadowBlur = 0;

    // "Rodrik" — smaller, elegant, white
    const subSize = Math.max(14, Math.min(22, w * 0.028));
    ctx.font = '300 ' + subSize + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('Rodrik', w / 2, h / 2 + mainSize * 0.5);

    // "info@rodrik.dev" — tiny, muted
    const contactSize = Math.max(10, Math.min(14, w * 0.018));
    ctx.font = contactSize + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#444444';
    ctx.fillText('info@rodrik.dev', w / 2, h / 2 + mainSize * 0.5 + subSize + 8);

    // Subtle decorative line
    const lineW = mainSize * 2.5;
    ctx.strokeStyle = 'rgba(245, 166, 35, ' + (alpha * 0.3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - lineW / 2, h / 2 + mainSize * 0.1);
    ctx.lineTo(w / 2 + lineW / 2, h / 2 + mainSize * 0.1);
    ctx.stroke();

    ctx.globalAlpha = 1;
    requestAnimationFrame(drawSplash);
  }

  requestAnimationFrame(drawSplash);
}

// Usage in game startup:
// showSplash(ctx, canvas, () => {
//   // splash done → show loading screen → load game
//   startLoading();
// });
```

**Game startup sequence with splash:**
```javascript
// 1. Canvas ready
resize();
// 2. Studio splash (2.5s)
showSplash(ctx, canvas, function() {
  // 3. Loading screen (while assets load)
  loadAssets(function() {
    // 4. Init SDK
    YandexSDK.init().then(function() {
      // 5. Detect language
      detectLang();
      // 6. Show title screen
      renderTitleScreen();
      // 7. GameReady (title visible + fonts loaded)
      document.fonts.ready.then(function() {
        YandexSDK.ready();
      });
    });
  });
});
```

⚠️ Splash shows BEFORE SDK init — no SDK dependency.
⚠️ Splash is pure Canvas — works on any game without DOM.
⚠️ Keep splash ≤ 3 seconds (Yandex п.2.1 — don't annoy users).
⚠️ Tap/click to skip (optional but recommended).

### Loading Screen (required)
```javascript
// Minimal loading screen — show before anything else
function drawLoadingScreen(ctx, progress) {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Game title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(GAME_TITLE, canvas.width / 2, canvas.height / 2 - 40);
  
  // Progress bar
  const barW = 200, barH = 6;
  const barX = (canvas.width - barW) / 2;
  const barY = canvas.height / 2 + 20;
  ctx.fillStyle = '#333';
  roundRect(ctx, barX, barY, barW, barH, 3);
  ctx.fillStyle = '#3b82f6';
  roundRect(ctx, barX, barY, barW * progress, barH, 3);
}
```

### Onboarding (first-time tutorial)
```javascript
// Non-intrusive tutorial — contextual hints, NOT text walls
const TUTORIAL_STEPS = [
  { trigger: 'first_spawn', hint: 'Двигайся джойстиком', highlight: 'joystick', auto_dismiss: 5000 },
  { trigger: 'first_enemy_near', hint: 'Стреляй!', highlight: 'fire_btn', auto_dismiss: 3000 },
  { trigger: 'first_kill', hint: 'Отлично! +10 монет', highlight: null, auto_dismiss: 2000 },
  { trigger: 'first_death', hint: 'Попробуй снова', highlight: 'restart_btn', auto_dismiss: 0 },
];

// Show hint as floating text near the highlighted element
// Dim everything except highlighted element
// Auto-dismiss OR dismiss on any tap
// Mark step as completed in saveData (don't repeat)
```

## Step 2: Visual Polish Priority

From most impactful to least:

### 1. Screen Transitions (HIGH IMPACT, LOW EFFORT)
```javascript
// Fade between screens (not instant cut)
let transitionAlpha = 0;
let transitionTarget = null;

function transitionTo(newState) {
  transitionTarget = newState;
  transitionAlpha = 0; // will fade to 1, switch, fade back to 0
}

function updateTransition(dt) {
  if (transitionTarget) {
    transitionAlpha += dt * 3; // 0.33s fade
    if (transitionAlpha >= 1) {
      gameState = transitionTarget;
      transitionTarget = null;
    }
  } else if (transitionAlpha > 0) {
    transitionAlpha -= dt * 3;
  }
}

function drawTransition(ctx) {
  if (transitionAlpha > 0) {
    ctx.fillStyle = `rgba(0,0,0,${transitionAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
```

### 2. Floating Damage/Score Numbers
```javascript
class FloatingText {
  constructor(x, y, text, color = '#fff', size = 20) {
    this.x = x; this.y = y; this.text = text;
    this.color = color; this.size = size;
    this.life = 1.0; this.vy = -60;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy += 30 * dt; // slight gravity
    this.life -= dt * 1.5;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.globalAlpha = this.life;
    ctx.font = `bold ${this.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}
// Usage: floatingTexts.push(new FloatingText(enemy.x, enemy.y, '-25', '#ff4444'));
// Usage: floatingTexts.push(new FloatingText(player.x, player.y, '+100', '#ffd700', 24));
```

### 3. Background (NEVER plain black)
```javascript
// Minimum: gradient background
function drawBackground(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Optional: parallax stars / particles
  bgParticles.forEach(p => {
    ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    p.y += p.speed;
    if (p.y > canvas.height) { p.y = 0; p.x = Math.random() * canvas.width; }
  });
}
```

### 4. Title Screen (professional, not placeholder)
Must have: game title with glow/shadow, background art or particles, "Tap to Play" with pulse animation, version number (small, corner).

### 5. Game Over Screen
Must have: final score (big), best score, performance summary (kills, time, combos), restart button, menu button, share score button (optional).

## Step 3: Audio Checklist

```javascript
// Minimum sounds every game needs:
const REQUIRED_SOUNDS = [
  'click',      // Every button press
  'start',      // Game starts
  'hit',        // Player/enemy takes damage
  'kill',       // Enemy dies
  'death',      // Player dies
  'pickup',     // Collect item/coin
  'levelup',    // Level complete / new achievement
  'error',      // Can't do that (not enough coins, etc)
];
// Optional but recommended:
// 'music_menu', 'music_gameplay' — background music loops
// 'woosh' — UI transitions
// 'combo' — combo multiplier increase

// Generate with Web Audio API (no external files needed):
function synthSound(type) {
  const ctx = audioCtx;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  // ... configure per type
  // Add ±10% pitch variation for organic feel
  o.frequency.value *= 0.9 + Math.random() * 0.2;
}
```

## Step 4: Performance Quick Wins

```javascript
// 1. Object pooling (don't create/destroy objects per frame)
const bulletPool = [];
function getBullet() {
  return bulletPool.find(b => !b.active) || createNewBullet();
}

// 2. Offscreen culling
function isOnScreen(obj) {
  return obj.x > cam.x - 50 && obj.x < cam.x + canvas.width + 50
      && obj.y > cam.y - 50 && obj.y < cam.y + canvas.height + 50;
}

// 3. Mobile GPU: reduce particles
const MAX_PARTICLES = isMobile ? 80 : 300;

// 4. Limit draw calls: batch similar objects
// Draw all enemies in one loop, all bullets in one loop, etc.
```

## Step 5: Pre-Moderation Quality Bar

Before submitting, game MUST pass:

| Check | Minimum | Good | Great |
|-------|---------|------|-------|
| Loading screen | Progress bar | + Game art | + Animated |
| Title screen | Title + Start | + Background art | + Particles + Music |
| Tutorial | Text hint | Contextual arrows | Interactive walkthrough |
| Game over | Score + Restart | + Best score + Share | + Stats + Achievements |
| Sound effects | 3+ sounds | 8+ sounds | + Background music |
| Visual juice | Score counter | + Particles | + Shake + Flash + Slow-mo |
| Session length | Can play 1+ min | 3-5 min sessions | + Meta-progression |
| Retention | High score only | + Daily bonus | + Upgrades + Achievements |
| Performance | 30 FPS mobile | 50+ FPS | 60 FPS stable |
| Onboarding | Nothing | Text hints | Contextual + dismissable |

## Non-Negotiable Acceptance Criteria
- [ ] Loading screen present (not white/blank)
- [ ] First 30 seconds: player understands core mechanic
- [ ] Screen transitions (fade, not instant cut)
- [ ] At least 5 sound effects with pitch variation
- [ ] Background is NOT plain black (gradient minimum)
- [ ] Game over shows final score + best score
- [ ] Floating damage/score numbers on significant events
- [ ] Object pooling for bullets/particles (no GC stutter)
- [ ] FPS >= 30 on mobile
- [ ] ⚠️ ZERO changes to SDK, localization, ads, debug systems
