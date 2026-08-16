---
name: shader-fx
kind: tactical
description: "Custom GLSL/TSL shaders для Three.js — toon, rim lighting, dissolve, water, hologram, force field, fresnel glow, vertex animation. ShaderMaterial с vertex+fragment shaders. Triggers on: shader, шейдер, glsl, custom shader, rim light, dissolve effect, water shader, hologram effect, vertex animation, fresnel, эффект растворения."
---

# Shader FX — Custom GLSL/TSL Shaders

## What this gives

GPU programs для effects beyond standard materials. Custom shaders give complete control over vertex positions и pixel colors. Effects: toon, rim lighting, dissolve, water, hologram, force field, energy.

Requires /three-setup. Assumes basic shader knowledge (vertex = position, fragment = color).

## ShaderMaterial basics

```javascript
import * as THREE from 'three';

const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x44aaff) },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
    }
  `,
});

// In animate loop:
material.uniforms.uTime.value = elapsed;
```

## Effect 1 — Rim lighting (glow on edges)

```glsl
// fragment
uniform vec3 uRimColor;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
  rim = pow(rim, 3.0);   // tighten к edges
  vec3 color = mix(uBaseColor, uRimColor, rim);
  gl_FragColor = vec4(color, 1.0);
}
```

Vertex shader provides vViewDir:
```glsl
varying vec3 vViewDir;
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
```

## Effect 2 — Dissolve (object disappears с burn edge)

```glsl
// fragment
uniform float uProgress;     // 0 = solid, 1 = fully dissolved
uniform vec3 uEdgeColor;     // burn color (orange)
varying vec2 vUv;

// simple noise function
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float n = noise(vUv * 10.0);
  if (n < uProgress) discard;   // dissolved pixels removed

  // Burn edge — pixels near threshold glow
  float edge = smoothstep(uProgress, uProgress + 0.1, n);
  vec3 color = mix(uEdgeColor, uBaseColor, edge);
  gl_FragColor = vec4(color, 1.0);
}
```

Animate uProgress 0→1 для dissolve-out, 1→0 для materialize-in.

## Effect 3 — Water surface

```glsl
// vertex — wave displacement
uniform float uTime;
varying vec3 vNormal;
varying float vWaveHeight;

void main() {
  vec3 pos = position;
  float wave = sin(pos.x * 2.0 + uTime) * 0.2
             + sin(pos.z * 1.5 + uTime * 0.7) * 0.15;
  pos.y += wave;
  vWaveHeight = wave;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

```glsl
// fragment — depth-based color
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
varying float vWaveHeight;

void main() {
  float mixFactor = (vWaveHeight + 0.35) / 0.7;
  vec3 color = mix(uDeepColor, uShallowColor, mixFactor);
  gl_FragColor = vec4(color, 0.85);   // slightly transparent
}
```

Set material `transparent: true`.

## Effect 4 — Hologram

```glsl
// fragment
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  // Scan lines
  float scanline = sin(vUv.y * 80.0 + uTime * 5.0) * 0.5 + 0.5;

  // Fresnel edge glow
  float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
  fresnel = pow(fresnel, 2.0);

  // Flicker
  float flicker = sin(uTime * 30.0) * 0.05 + 0.95;

  float alpha = (scanline * 0.3 + fresnel * 0.7) * flicker;
  gl_FragColor = vec4(uColor, alpha);
}
```

Material: `transparent: true`, `side: THREE.DoubleSide`, `blending: THREE.AdditiveBlending`.

## Effect 5 — Force field / energy shield

```glsl
// fragment
uniform float uTime;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
  // Fresnel — strong at grazing angles
  float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), 2.0);

  // Hex pattern (simplified)
  float hex = sin(vWorldPos.x * 5.0) * sin(vWorldPos.y * 5.0);

  // Impact ripple
  float ripple = sin(length(vWorldPos) * 3.0 - uTime * 4.0) * 0.5 + 0.5;

  float alpha = fresnel * 0.8 + hex * 0.1 + ripple * 0.1;
  gl_FragColor = vec4(uColor, alpha);
}
```

## Effect 6 — Vertex animation (wind, breathing, jelly)

```glsl
// vertex — wind sway on foliage
uniform float uTime;
attribute float aWindStrength;   // per-vertex: 0 at base, 1 at tip

void main() {
  vec3 pos = position;
  float sway = sin(uTime * 2.0 + position.x) * aWindStrength * 0.3;
  pos.x += sway;
  pos.z += sway * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

## TSL alternative (Three.js Shading Language, r167+)

TSL = write shaders в JavaScript instead of GLSL strings. Type-safe, autocomplete.

```javascript
import { Fn, sin, time, positionLocal, vec4 } from 'three/tsl';
import * as THREE from 'three/webgpu';

const material = new THREE.MeshBasicNodeMaterial();
material.positionNode = Fn(() => {
  const pos = positionLocal.toVar();
  pos.y.addAssign(sin(time.add(positionLocal.x)).mul(0.3));
  return pos;
})();
```

TSL works с both WebGPU и WebGL backends. Recommended для new projects (no string GLSL).

## Toon shader (sharp cel cutoffs)

```glsl
// fragment — toon = step function on lighting
uniform vec3 uLightDir;
uniform vec3 uColor;
varying vec3 vNormal;

void main() {
  float NdotL = dot(normalize(vNormal), normalize(uLightDir));
  // Quantize к 3 bands
  float light;
  if (NdotL > 0.5) light = 1.0;
  else if (NdotL > 0.0) light = 0.6;
  else light = 0.3;
  gl_FragColor = vec4(uColor * light, 1.0);
}
```

## Performance notes

- Shaders run per-pixel (fragment) или per-vertex — fragment cost scales с screen coverage
- `discard` (dissolve) — disables early-Z optimization, use sparingly
- `pow()`, `sin()` cheap; loops и branches (`if`) more expensive on mobile GPU
- Shared ShaderMaterial across objects — uniforms shared too (clone if need per-object values)
- AdditiveBlending — overdraw cost, limit count of blended objects

## Anti-patterns

❌ Recompiling shader every frame — create ShaderMaterial once
❌ Forgetting к update `uTime` uniform — static effect
❌ `discard` everywhere — kills GPU early-Z
❌ Heavy branches в fragment shader — mobile GPU slow на divergent branches
❌ Not setting `transparent: true` for alpha effects — alpha ignored

## Integration

- Requires **/three-setup**
- **/visual-style** — shaders implement custom styles beyond the 16
- **/procedural-geo** — vertex shaders animate procedural terrain
- **/3d-perf** — shader cost considerations

## Self-check before delivering (look at it running, not just the code)

A shader that compiles is not a shader that works. Render it and verify on a `--screenshot`
before handing over:

- [ ] **It renders** — no black mesh / no silent compile failure (check console for GLSL/TSL errors).
- [ ] **It looks like the intent** — matches the /art-direction mood, not just "some effect". If it
      reads as random noise or a flat color, the look failed even if it compiles.
- [ ] **It didn't tank the framerate** — check FPS after adding it; a beautiful shader at 20fps is a
      regression. If it dropped below target, simplify or move work to vertex stage (see /3d-perf).
- [ ] **It survives motion** — uniforms animate smoothly, no popping/z-fighting/alpha-sort artifacts
      when the camera or object moves.

If any fail, fix before delivery. State a one-line verdict ("self-check: renders, matches the neon
spec, 58fps mobile, alpha sorts clean").

## Non-Negotiable

- [ ] /three-setup done first
- [ ] ShaderMaterial created once, not per-frame
- [ ] uTime (or relevant uniforms) updated in animate loop
- [ ] transparent: true set для alpha effects
- [ ] discard used sparingly (early-Z impact)
- [ ] TSL preferred для new projects (type-safe vs GLSL strings)
