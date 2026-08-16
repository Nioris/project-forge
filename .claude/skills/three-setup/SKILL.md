---
name: three-setup
kind: tactical
description: "Three.js scene boilerplate + atmosphere recipe для HTML5 games. Sets up renderer (WebGPU с WebGL2 fallback), camera, lighting rig, resize handler (orientationchange+fullscreenchange), animation loop, and cheap mobile-first atmosphere (day/night palette lerp, fog-as-horizon, CSS vignette, player light). Three.js bundled LOCALLY (не CDN — Yandex sandbox compliance). Foundation для 3D games. Triggers on: three.js, threejs, 3d game, 3д игра, 3d scene, three setup, сделай 3д, webgl game, 3д сцена, графика 3д, атмосфера, день ночь, day night, освещение 3д, lighting, fog, туман, красивая графика, graphics quality."
---

# Three.js Setup — 3D Scene Boilerplate

## What this gives

Production-ready Three.js scene foundation для HTML5 game:
- Renderer с WebGPU (r171+) и automatic WebGL2 fallback
- Perspective или orthographic camera
- Lighting rig (ambient + directional с shadows)
- Resize handler (responsive)
- Animation loop (requestAnimationFrame)
- Three.js bundled **locally** — НЕ from CDN

⚠️ **Critical:** Three.js MUST be bundled в zip. Loading from cdnjs/jsdelivr/unpkg = Yandex release blocker (Lesson #67). This skill downloads Three.js к `assets/lib/`.

## When to use

First step для any 3D game. Other 3D skills (/visual-style, /procedural-geo, /shader-fx, /3d-perf) build on this foundation.

⚠️ **Run `/art-direction` first.** It produces the binding spec (palette, detail-density target,
hero details). This skill builds the scene *to that spec* — without it you get a bare grey box.

## Step 1 — Bundle Three.js locally

```bash
mkdir -p assets/lib/
# Download Three.js (r171+ for WebGPU support)
curl -sSL --max-time 30 -o assets/lib/three.module.js \
  https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js

# Verify download (should be ~1.2MB, not error page)
ls -lh assets/lib/three.module.js
head -c 50 assets/lib/three.module.js   # should show JS, not HTML

# Record version
echo "three.module.js  0.184.0  from jsdelivr  $(date +%Y-%m-%d)" >> assets/lib/_versions.txt
```

For WebGPU renderer also need:
```bash
curl -sSL --max-time 30 -o assets/lib/three.webgpu.js \
  https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.webgpu.js
```

## Step 2 — Scene boilerplate

`game.js`:

```javascript
import * as THREE from './assets/lib/three.module.js';

// ── Renderer (WebGL2 — universal compat) ──
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap к 2 для perf
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ── Scene ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// ── Camera ──
const camera = new THREE.PerspectiveCamera(
  60,                                      // FOV
  window.innerWidth / window.innerHeight,  // aspect
  0.1,                                     // near
  1000                                     // far
);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// ── Lighting rig ──
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 10, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 50;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
scene.add(sun);

// Optional: hemisphere light для outdoor scenes
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d2817, 0.4);
scene.add(hemi);

// ── Resize handler ──
// ⚠️ Bind to orientationchange + fullscreenchange too — NOT just "resize". On mobile, rotating
// the device or exiting fullscreen may not fire "resize" in time → the canvas keeps the old size
// and the scene clips (REQ-1.10.1) or deforms (REQ-1.6.1.3). This is the parkour rejection class;
// debugcheck v2.12 + runtime Probe F enforce it.
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
document.addEventListener('fullscreenchange', onResize);

// ── Animation loop ──
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();   // seconds since last frame
  const elapsed = clock.getElapsedTime();

  // Game update logic here
  update(delta, elapsed);

  renderer.render(scene, camera);
}

function update(delta, elapsed) {
  // Per-frame game logic
}

animate();

// Export для other modules
export { scene, camera, renderer, clock };
```

## Step 3 — WebGPU variant (optional, better perf)

WebGPU renderer (r171+) — console-quality, auto-fallback к WebGL2 если browser не support:

```javascript
import * as THREE from './assets/lib/three.webgpu.js';

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
await renderer.init();   // ⚠️ MANDATORY — без этого rendering fails silently

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Rest идентично WebGL — same scene/camera/lights API
// WebGPURenderer auto-falls-back к WebGL2 if WebGPU unavailable
```

⚠️ WebGPU `init()` is async — wrap game start в async function:
```javascript
async function startGame() {
  await renderer.init();
  // ... setup scene
  animate();
}
startGame();
```

## Step 4 — HTML shell

`index.html`:
```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Game</title>
  <style>
    body { margin: 0; overflow: hidden; background: #1a1a2e; }
    #game-canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="game-canvas"></canvas>
  <script type="module" src="game.js"></script>
</body>
</html>
```

Note: `import` в game.js uses **relative path** `./assets/lib/three.module.js` — НЕ `https://`. This passes check-external-cdn.mjs.

## Step 5 — Verify

```bash
# No external CDN refs
node scripts/check-external-cdn.mjs .

# Runtime test
node scripts/runtime-test.mjs . --scenarios=startup,assets,dom
```

## Camera types — when к use which

| Type | Use case |
|---|---|
| **PerspectiveCamera** | Most 3D games — depth perception, FOV |
| **OrthographicCamera** | Isometric games, 2.5D, strategy, puzzle — no perspective distortion |

Orthographic setup:
```javascript
const aspect = window.innerWidth / window.innerHeight;
const d = 10;  // view size
const camera = new THREE.OrthographicCamera(
  -d * aspect, d * aspect, d, -d, 0.1, 1000
);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);
```

## Mobile performance defaults

- `setPixelRatio(Math.min(devicePixelRatio, 2))` — capping prevents 3x retina overdraw
- `antialias: true` OK on desktop, consider `false` + FXAA pass on mobile
- Shadow map 2048 desktop, 1024 mobile (detect via `navigator.userAgent`)
- Target 60fps; if struggling, see /3d-perf skill

## Anti-patterns

❌ Loading Three.js from CDN — Yandex blocker. Always bundle local.
❌ `setPixelRatio(window.devicePixelRatio)` без cap — 3x retina kills perf.
❌ Forgetting `await renderer.init()` for WebGPU — silent render failure.
❌ Creating new geometries/materials every frame — memory leak. Create once, reuse.
❌ Not disposing removed objects — `geometry.dispose()`, `material.dispose()`, `texture.dispose()`.

## Step 6 — Scene composition: NEVER deliver a bare scene (fixes "просто стены")

The boilerplate above gives an empty stage. **Do not stop here and hand it over.** A renderer +
empty room is the "просто стены" result that then takes 10 rounds of "добавь кровать, картины,
текстуры". Furnish it to the `/art-direction` spec on the FIRST pass. Before showing the user,
the scene in camera view must satisfy ALL of:

- [ ] **A clear focal point** — one element the eye lands on first (lit brighter / centered / larger).
- [ ] **No large flat untextured surface.** Every wall/floor/big object gets material variation:
      a texture, a normal/roughness break-up, trim, or an emissive/decal. A single-color
      `MeshStandardMaterial` plane in view = fail.
- [ ] **Set dressing** — for an interior: ≥ the spec's detail count of props (furniture, clutter,
      light fixtures). For exterior: ground variation, scatter (rocks/foliage), a horizon element.
- [ ] **Layered depth** — foreground / midground / background reads, not everything on one plane.
- [ ] **Lighting tells a story** — at least one motivated light source + cast shadows + a fill;
      shadow colour is tinted (spec §6), not pure black.
- [ ] **Hero details present** (spec §7) — e.g. rim light on characters, dust motes, soft fog.

Build props from `/procedural-geo` (code geometry — no downloads). Reuse via `InstancedMesh`
(see `/3d-perf`). Example: a room is not 6 planes — it's planes + textured materials + 1 key
light + a few code-built props + a focal object. That difference is the whole problem.

Then run the **/art-direction Part B self-critique loop** on a `--screenshot` of the scene
(richness, readability, hierarchy, intentionality) and revise BEFORE delivering.

## Step 7 — Atmosphere: cheap techniques that make 3D look "expensive" (mobile-first)

The biggest visual lift on a Yandex 3D game comes NOT from post-processing (Bloom/SSAO/composer —
all expensive on mobile GPUs and a load-time cost), but from **light, fog, tone and a palette that
shifts over time**. This recipe is extracted from a hand-tuned parkour game whose graphics read as
high-end despite zero post-fx and `MeshLambertMaterial`. Use it on stylized games; for realism you'd
swap to `MeshStandardMaterial` + envMap (see /visual-style).

### 7a. Renderer tuning for mobile (deliberate trade-offs)
```javascript
const renderer = new THREE.WebGLRenderer({
  antialias: false,                 // MSAA is costly on mobile; the look survives without it
  powerPreference: 'high-performance',
  stencil: false                    // not needed → saves memory/bandwidth
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); // 1.75 ≈ invisible vs 2-3×, far cheaper
renderer.outputColorSpace = THREE.SRGBColorSpace;          // r152+ (was outputEncoding=sRGBEncoding)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;              // soft-enough, cheaper than PCFSoft on mobile
```
The `antialias:false` + `pixelRatio ≤ 1.75` pairing is the single biggest mobile-FPS lever — colour
and palette carry the image instead of edge-smoothing.

### 7b. Fog as horizon + draw-distance cull (one line, two wins)
```javascript
scene.fog = new THREE.Fog('#101828', 20, 38);   // near, far in world units
scene.background = new THREE.Color('#101828');   // SAME colour as fog → seamless horizon
```
Fog hides far geometry (so you can cull / not draw it) AND blends the world edge into the sky. Match
`scene.background` to `fog.color` and the horizon seam disappears for free.

### 7c. Day/night (or any mood) via palette lerp — the "wow" with near-zero cost
Define a few palette objects, then interpolate ALL environment values together with one function:
```javascript
const DAY   = { bg:new THREE.Color('#7e9cc0'), fogN:20, fogF:38,
                hSky:new THREE.Color('#aec8e0'), hGround:new THREE.Color('#5a5440'), hI:0.9,
                sun:new THREE.Color('#fff2d8'), sunI:1.0, lampI:0.0 };
const DUSK  = { bg:new THREE.Color('#5a3a4a'), fogN:17, fogF:33,
                hSky:new THREE.Color('#b07a6a'), hGround:new THREE.Color('#3a3040'), hI:0.6,
                sun:new THREE.Color('#ff8a4a'), sunI:0.55, lampI:0.7 };
const NIGHT = { bg:new THREE.Color('#0a1020'), fogN:40, fogF:100,
                hSky:new THREE.Color('#101a36'), hGround:new THREE.Color('#0a0c16'), hI:0.22,
                sun:new THREE.Color('#6a7fc0'), sunI:0.16, lampI:0.5 };

function lerpEnv(A, B, t) {                       // t = 0..1 between two palettes
  scene.background.copy(A.bg).lerp(B.bg, t);
  scene.fog.color.copy(scene.background);         // keep horizon seamless as it shifts
  scene.fog.near = A.fogN + (B.fogN - A.fogN) * t;
  scene.fog.far  = A.fogF + (B.fogF - A.fogF) * t;
  hemi.color.copy(A.hSky).lerp(B.hSky, t);
  hemi.groundColor.copy(A.hGround).lerp(B.hGround, t);
  hemi.intensity = A.hI + (B.hI - A.hI) * t;
  sun.color.copy(A.sun).lerp(B.sun, t);
  sun.intensity  = A.sunI + (B.sunI - A.sunI) * t;
  lamp.intensity = A.lampI + (B.lampI - A.lampI) * t;
}
// drive it: 0..0.55 = DAY→DUSK, 0.55..1 = DUSK→NIGHT
function setTimeOfDay(p){ p < 0.55 ? lerpEnv(DAY, DUSK, p/0.55) : lerpEnv(DUSK, NIGHT, (p-0.55)/0.45); }
```
One scalar (`p`) animates the entire mood. Cheapest atmosphere upgrade that exists.

### 7d. Night detail: light that follows the player + drop sun shadows
```javascript
const playerLight = new THREE.PointLight('#ffe2b4', 0, 11);
scene.add(playerLight);
// each frame, at night:
playerLight.position.set(player.x, 1.9, player.z);
playerLight.intensity = nightAmount * 3.2;        // glow halo around the player after dark
sun.castShadow = nightAmount < 0.5;               // kill directional shadows at night —
                                                  // they fight the radial player light
```

### 7e. Vignette in CSS, NOT WebGL (free "cinematic" edge darkening)
A radial-gradient overlay costs zero GPU vs a post-process pass — ideal for Yandex mobile:
```html
<div id="vignette"></div>
<style>
#vignette { position:fixed; inset:0; pointer-events:none; z-index:6; opacity:0;
  background:radial-gradient(circle 520px at var(--px,50%) var(--py,50%),
    rgba(3,5,11,0) 0%, rgba(3,5,11,0) 38%, rgba(3,5,11,.3) 66%, rgba(3,5,11,.58) 92%); }
</style>
```
```javascript
// center the dark spot on the player's screen position, fade in at night:
vignette.style.setProperty('--px', (projected.x*0.5+0.5)*innerWidth + 'px');
vignette.style.setProperty('--py', (-projected.y*0.5+0.5)*innerHeight + 'px');
vignette.style.opacity = Math.min(0.9, nightAmount);
```

### /do instruction (apply this recipe to a 3D game)
> Apply the three-setup Step 7 atmosphere recipe: add fog matched to scene.background for a seamless
> horizon; add a DAY/DUSK/NIGHT palette set + lerpEnv() driven by one time-of-day scalar; add a
> player-following PointLight that fades in at night and disable sun.castShadow at night; add a CSS
> radial-gradient #vignette overlay (not a WebGL post-pass). Keep renderer antialias:false +
> pixelRatio≤1.75 for mobile. Then run /release-ready yandex — Probe F must stay green.

⚠️ Do NOT copy the reference game's resize handling — it binds only window "resize" (no
orientationchange/fullscreenchange) and would fail REQ-1.6.1.3/1.10.1. Use Step 2's fixed handler.


- **/procedural-geo** — generate terrain/objects/props кодом для this scene
- **/visual-style** — apply 16 post-processing looks
- **/shader-fx** — custom shaders для objects
- **/3d-perf** — optimize when draw calls exceed 100 (use InstancedMesh for set dressing)
- **/bundle-libs** — if Three.js accidentally CDN-referenced, this fixes it

## Non-Negotiable

- [ ] /art-direction spec exists before building the scene
- [ ] Three.js bundled locally в assets/lib/ (NOT CDN)
- [ ] Version recorded в assets/lib/_versions.txt
- [ ] setPixelRatio capped к 2
- [ ] Resize handler attached — bound to resize + orientationchange + fullscreenchange (REQ-1.6.1.3/1.10.1)
- [ ] WebGPU init() awaited if using WebGPURenderer
- [ ] Scene is COMPOSED (focal point, set dressing, no flat surfaces) — not a bare stage
- [ ] Self-critique loop run on a screenshot before delivery (no axis ≤ 3)
- [ ] check-external-cdn.mjs passes (no external refs)
- [ ] Objects disposed when removed (no memory leaks)
