---
name: visual-style
kind: tactical
description: "Apply distinctive visual style к Three.js game via post-processing + materials. 16 looks: realistic PBR, toon, low-poly, wireframe, neon, glass, pixel art, voxel, matcap, hologram, blueprint, X-ray, gold/chrome, sunset, clay, normals. One scene → completely different vibe. Triggers on: visual style, art style, стиль графики, toon shading, neon look, post-processing, сделай красиво, polish graphics, low poly look, выглядит дёшево."
---

# Visual Style — 16 Looks via Post-Processing

## What this gives

Transform a plain Three.js scene into a distinctive-looking game. Same geometry, completely different vibe — chosen via materials + post-processing passes. Makes a game **look expensive** without an artist.

Requires `/three-setup` first (needs working scene + renderer). Run `/art-direction` first for the binding palette + mood; pick the style that matches the spec, then run the Part B self-critique loop on a screenshot before delivering.

## The 16 styles

| Style | Look | Technique | Best for |
|---|---|---|---|
| **Realistic PBR** | Photoreal | MeshStandardMaterial + env map | Serious sims, racing |
| **Toon** | Cel-shaded cartoon | MeshToonMaterial + gradient map + outline | Casual, adventure |
| **Low-Poly** | Faceted flat | flatShading: true | Idle, hyper-casual |
| **Wireframe** | Tech mesh lines | wireframe: true | Puzzle, tech themes |
| **Neon** | Glowing edges dark bg | emissive + UnrealBloomPass | Arcade, rhythm |
| **Glass** | Translucent refractive | MeshPhysicalMaterial transmission | Abstract, zen |
| **Pixel Art** | Retro pixelated | RenderPixelatedPass | Retro, nostalgic |
| **Voxel** | Minecraft blocks | box geometry instancing | Sandbox, builder |
| **Matcap** | Baked sphere shading | MeshMatcapMaterial | Quick polish, sculpt look |
| **Hologram** | Sci-fi scan lines | custom shader + fresnel | Sci-fi, futuristic |
| **Blueprint** | Technical drawing | dark bg + line material | Engineering, strategy |
| **X-Ray** | See-through ghostly | fresnel + additive blending | Mystery, abstract |
| **Gold/Chrome** | Reflective metal | metalness: 1 + env map | Luxury, casino |
| **Sunset** | Warm gradient mood | hemisphere light + fog + bloom | Relaxing, casual |
| **Clay** | Soft matte sculpt | MeshStandardMaterial roughness:1 | Cute, tactile |
| **Normals** | RGB debug colorful | MeshNormalMaterial | Prototyping, abstract |

## Setup — post-processing pipeline

Bundle EffectComposer locally (same CDN-avoidance rule):
```bash
curl -sSL --max-time 30 -o assets/lib/three-addons.js \
  https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/EffectComposer.js
# Note: addons have nested imports — better к use full examples/jsm folder
# OR use importmap to point three/addons к local
```

Recommended: importmap в index.html к keep addon imports clean:
```html
<script type="importmap">
{
  "imports": {
    "three": "./assets/lib/three.module.js",
    "three/addons/": "./assets/lib/three-addons/"
  }
}
</script>
```

Then download the needed addon files к `assets/lib/three-addons/`.

## Style implementations

### Toon (most popular для casual games)

```javascript
import * as THREE from 'three';

// Gradient map для sharp cel-shading cutoffs
const colors = new Uint8Array([0, 128, 255]);  // 3-tone gradient
const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
gradientMap.needsUpdate = true;

const toonMaterial = new THREE.MeshToonMaterial({
  color: 0x44aa88,
  gradientMap: gradientMap,
});

// Outline: render mesh slightly scaled, back faces, black
function addOutline(mesh, thickness = 0.03) {
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
  });
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  outline.scale.multiplyScalar(1 + thickness);
  mesh.add(outline);
}
```

### Low-Poly (cheapest, very effective)

```javascript
const lowPolyMat = new THREE.MeshStandardMaterial({
  color: 0x88aa44,
  flatShading: true,   // ← the magic — no smooth normals
  roughness: 0.8,
  metalness: 0.1,
});
// Use low-segment geometry: SphereGeometry(1, 8, 6) not (1, 64, 32)
```

### Neon (glow в darkness)

```javascript
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

scene.background = new THREE.Color(0x050510);

// Emissive materials glow
const neonMat = new THREE.MeshStandardMaterial({
  color: 0x000000,
  emissive: 0x00ffff,
  emissiveIntensity: 2,
});

// Bloom pipeline
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,   // strength
  0.4,   // radius
  0.85   // threshold — only bright pixels bloom
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// In animate loop: composer.render() instead of renderer.render()
```

### Pixel Art (retro)

```javascript
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';

const composer = new EffectComposer(renderer);
const pixelPass = new RenderPixelatedPass(6, scene, camera);  // 6 = pixel size
pixelPass.normalEdgeStrength = 0.3;
pixelPass.depthEdgeStrength = 0.4;
composer.addPass(pixelPass);
composer.addPass(new OutputPass());
```

### Matcap (instant polish, zero lighting setup)

```javascript
// Matcap texture = sphere pre-lit. Bundle a matcap PNG locally.
const matcapTex = new THREE.TextureLoader().load('assets/matcaps/clay.png');
const matcapMat = new THREE.MeshMatcapMaterial({ matcap: matcapTex });
// No lights needed — matcap bakes lighting into the texture
```

### Sunset (mood для casual)

```javascript
scene.fog = new THREE.Fog(0xffa07a, 10, 60);
scene.background = new THREE.Color(0xffa07a);

const hemi = new THREE.HemisphereLight(0xffd9a0, 0xff6b35, 1.0);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffaa55, 1.5);
sun.position.set(-5, 3, -8);  // low angle = sunset
scene.add(sun);

// Subtle bloom enhances warmth
const bloom = new UnrealBloomPass(resolution, 0.6, 0.5, 0.7);
```

## EffectComposer pass ordering

```
RenderPass        ← always FIRST (renders scene)
  ↓
[effect passes]   ← bloom, pixelate, custom shaders в middle
  ↓
OutputPass        ← always LAST (color space conversion)
```

Wrong order = broken colors или missing effects.

## Choosing style per genre

| Genre | Recommended styles |
|---|---|
| Idle/clicker | Low-Poly, Clay, Toon |
| Hyper-casual | Low-Poly, Neon, Matcap |
| Puzzle | Wireframe, Blueprint, Glass |
| Racing | Realistic PBR, Sunset |
| Arcade | Neon, Pixel Art, Voxel |
| Adventure | Toon, Sunset, Low-Poly |
| Sci-fi | Hologram, Neon, X-Ray |
| Casino/luxury | Gold/Chrome, Glass |

## Performance notes

- Post-processing adds GPU cost — each pass = full-screen render
- Mobile: limit к 1-2 passes (RenderPass + 1 effect + OutputPass)
- Bloom expensive — lower resolution param on mobile
- Pixel Art pass actually IMPROVES perf (renders at low res)
- Matcap CHEAPEST realistic-ish look (no lighting calc)

## Anti-patterns

❌ Stacking 6+ post-processing passes — kills mobile framerate
❌ Bloom threshold 0 — everything blooms, looks washed out (use 0.7-0.9)
❌ Forgetting OutputPass — colors look wrong (gamma)
❌ Toon без gradient map — looks like flat MeshBasicMaterial
❌ Loading matcap/env textures from CDN — bundle locally

## Accessibility — don't lock players out with color alone

~8% of male players have a color-vision deficiency (deuteranopia/protanopia most common).
A style that looks great but encodes critical state in red-vs-green (damage, teams,
match-3 colors, danger zones) is unreadable for them — and reviewers increasingly flag it.
Two cheap, always-on rules:

1. **Never encode meaning by hue alone.** Pair color with a second channel: shape, icon,
   pattern, position, or brightness. Red enemy + spiky silhouette; green pickup + pulse +
   "+" icon. If you greyscale a screenshot and can still play it, you're fine.

2. **Ship a colorblind palette toggle** when the game uses color as a mechanic. Don't try
   to "simulate" CVD — just offer a high-distinction palette and let the player pick.

```javascript
// Color-vision-safe categorical palette (Okabe–Ito, 8 colors, distinguishable
// across deuteranopia/protanopia/tritanopia). Use for team/state/category colors.
const CVD_SAFE = {
  orange:    0xE69F00,
  skyBlue:   0x56B4E9,
  green:     0x009E73,
  yellow:    0xF0E442,
  blue:      0x0072B2,
  vermillion:0xD55E00,
  purple:    0xCC79A7,
  black:     0x000000,
};
// Apply as material colors / emissive for gameplay-critical objects:
// enemyMat.color.setHex(CVD_SAFE.vermillion);  ally.color.setHex(CVD_SAFE.skyBlue);
```

**Contrast for HUD/text over 3D scenes:** body text ≥ 4.5:1 against its backdrop, large
text ≥ 3:1 (WCAG AA). A bright bloom scene will wash out white text — add a subtle dark
scrim behind HUD elements rather than fighting the post-processing.

Verify via `/ui-review` — grey-out one screenshot and confirm the game is still playable.

## Integration

- Requires **/three-setup** (scene foundation)
- **/shader-fx** — for custom styles beyond these 16
- **/3d-perf** — if post-processing tanks framerate
- **/ui-review** — verify final look via screenshot

## Non-Negotiable

- [ ] /three-setup done first
- [ ] EffectComposer addons bundled locally (not CDN)
- [ ] Pass order: RenderPass → effects → OutputPass
- [ ] Mobile: max 1-2 effect passes
- [ ] Style matches genre (see table)
- [ ] No gameplay-critical state encoded by hue alone (shape/icon/pattern backup)
- [ ] HUD/text contrast ≥ WCAG AA (4.5:1 body, 3:1 large)
- [ ] check-external-cdn.mjs passes
