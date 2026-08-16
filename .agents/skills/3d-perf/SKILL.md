---
name: 3d-perf
kind: tactical
description: "Optimize Three.js game performance — reduce draw calls below 100, instancing, geometry merging, LOD, texture compression (Draco/KTX2), memory management. Target 60fps on mobile."
---

# 3D Performance — Optimize Three.js

## Targets

- **< 100 draw calls** — single biggest perf lever
- **60 fps** desktop, **30+ fps** mobile minimum
- **Memory stable** — no leaks over time
- **Fast load** — geometry/textures optimized

Requires existing Three.js scene ($three-setup).

## Step 1 — Measure first

Don't optimize blind. Add `renderer.info` logging:

```javascript
// In animate loop, every 60 frames:
if (frameCount % 60 === 0) {
  console.log('Draw calls:', renderer.info.render.calls);
  console.log('Triangles:', renderer.info.render.triangles);
  console.log('Geometries:', renderer.info.memory.geometries);
  console.log('Textures:', renderer.info.memory.textures);
}
```

Diagnosis:
- Draw calls > 100 → instancing/merging needed
- Triangles > 500k → reduce geometry detail или LOD
- Geometries climbing over time → memory leak (not disposing)
- Textures climbing → texture leak

## Step 2 — Instancing (biggest win)

If you have many copies of same geometry (trees, coins, enemies, voxels) — InstancedMesh renders ALL in **1 draw call**.

```javascript
import * as THREE from 'three';

const count = 1000;   // 1000 trees
const geo = new THREE.ConeGeometry(0.5, 2, 6);
const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a2d, flatShading: true });

const instanced = new THREE.InstancedMesh(geo, mat, count);

const dummy = new THREE.Object3D();
for (let i = 0; i < count; i++) {
  dummy.position.set(
    (Math.random() - 0.5) * 100,
    0,
    (Math.random() - 0.5) * 100
  );
  dummy.rotation.y = Math.random() * Math.PI * 2;
  dummy.scale.setScalar(0.8 + Math.random() * 0.4);
  dummy.updateMatrix();
  instanced.setMatrixAt(i, dummy.matrix);
}
instanced.instanceMatrix.needsUpdate = true;
scene.add(instanced);
// Result: 1000 trees = 1 draw call (was 1000)
```

Per-instance color:
```javascript
const color = new THREE.Color();
for (let i = 0; i < count; i++) {
  color.setHSL(Math.random(), 0.6, 0.5);
  instanced.setColorAt(i, color);
}
instanced.instanceColor.needsUpdate = true;
```

Animating instances — update matrix per frame:
```javascript
function update(delta) {
  for (let i = 0; i < count; i++) {
    instanced.getMatrixAt(i, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    dummy.position.y += Math.sin(elapsed + i) * delta;  // bob
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;
}
```

## Step 3 — Geometry merging (static objects)

For static objects that DON'T move but vary (a level layout) — merge into one geometry:

```javascript
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geometries = [];
for (const obj of staticObjects) {
  const geo = obj.geometry.clone();
  geo.applyMatrix4(obj.matrix);   // bake position into vertices
  geometries.push(geo);
}
const merged = mergeGeometries(geometries);
const mergedMesh = new THREE.Mesh(merged, sharedMaterial);
scene.add(mergedMesh);
// Many static objects → 1 draw call
```

Instancing vs merging:
- **Instancing** — same geometry repeated, can move individually
- **Merging** — different geometries, all static, never move

## Step 4 — LOD (Level of Detail)

Distant objects use simpler geometry:

```javascript
const lod = new THREE.LOD();

// High detail — close
const highGeo = new THREE.IcosahedronGeometry(1, 4);
lod.addLevel(new THREE.Mesh(highGeo, mat), 0);

// Medium — mid distance
const medGeo = new THREE.IcosahedronGeometry(1, 2);
lod.addLevel(new THREE.Mesh(medGeo, mat), 15);

// Low — far away
const lowGeo = new THREE.IcosahedronGeometry(1, 0);
lod.addLevel(new THREE.Mesh(lowGeo, mat), 40);

scene.add(lod);
// Three.js auto-switches based on camera distance
```

## Step 5 — Texture compression (if using textures)

Draco (geometry) + KTX2 (textures) — 60-95% size reduction.

```bash
# Compress .glb с Draco
npx gltf-pipeline -i model.glb -o model-draco.glb -d

# KTX2 textures via toktx (KTX-Software)
toktx --bcmp output.ktx2 input.png
```

In Three.js:
```javascript
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('assets/lib/draco/');   // bundle decoder locally!

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('assets/lib/basis/');  // bundle locally!
ktx2Loader.detectSupport(renderer);

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.setKTX2Loader(ktx2Loader);
```

⚠️ Draco decoder + KTX2 transcoder must be bundled locally too (Lesson #67).

## Step 6 — Memory management

Every removed object MUST be disposed:

```javascript
function removeObject(obj) {
  scene.remove(obj);
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => disposeMaterial(m));
      } else {
        disposeMaterial(child.material);
      }
    }
  });
}

function disposeMaterial(mat) {
  Object.values(mat).forEach(value => {
    if (value && value.isTexture) value.dispose();
  });
  mat.dispose();
}
```

Memory leak symptom: `renderer.info.memory.geometries` climbs over time.

## Step 7 — Other quick wins

```javascript
// Cap pixel ratio (retina 3x overdraw kills mobile)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Frustum culling (on by default — don't disable)
mesh.frustumCulled = true;

// Disable shadows on small/distant objects
mesh.castShadow = false;
mesh.receiveShadow = false;

// Lower shadow map on mobile
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);

// Reuse geometries/materials — create once, share
const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
const sharedMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
// All boxes share these — don't create per-object

// Static objects — mark matrix non-auto-updating
mesh.matrixAutoUpdate = false;
mesh.updateMatrix();   // once

// Pause rendering when tab hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clock.stop();
  else clock.start();
});
```

## Mobile detection

```javascript
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

if (isMobile) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  // fewer particles, lower shadow res, simpler post-processing
}
```

## Performance checklist

```
[ ] renderer.info shows < 100 draw calls
[ ] Repeated objects use InstancedMesh
[ ] Static varied objects merged via mergeGeometries
[ ] Distant objects use LOD
[ ] Pixel ratio capped к 2 (1.5 mobile)
[ ] Geometries/materials shared, not per-object
[ ] Removed objects disposed (geometry + material + textures)
[ ] renderer.info.memory.geometries stable over time
[ ] Shadows disabled on small/distant objects
[ ] Rendering pauses when tab hidden
[ ] Mobile: lower shadow map, fewer effects
```

## Anti-patterns

❌ Optimizing without measuring `renderer.info` first
❌ 1000 individual Mesh — should be InstancedMesh
❌ New geometry/material per object — share them
❌ Not disposing removed objects — memory climbs
❌ `setPixelRatio(devicePixelRatio)` uncapped
❌ Shadows on every tiny object
❌ Draco decoder loaded from CDN — bundle local

## Integration

- Works on any $three-setup scene
- **$procedural-geo** — instancing для procedural objects
- **$visual-style** — post-processing perf trade-offs
- **runtime-test.mjs** — measures startup perf
- **check-external-cdn.mjs** — verify Draco/KTX2 decoders bundled local

## Self-check before delivering: measure AFTER, prove the win

Optimization without a before/after number is a guess. The NN list says "measured before" — also
**measure after** and confirm the target was actually hit, on the device that matters:

- [ ] **Re-read `renderer.info`** after changes — draw calls actually < 100 (not "should be").
- [ ] **FPS on a real mid mobile** (or throttled DevTools) ≥ 30, ideally 60 — desktop fps lies.
- [ ] **Memory doesn't climb** over a 60s session (geometries/textures disposed, no leak).
- [ ] **The win is real, not cosmetic** — state before→after ("draw calls 340→72, 24→58 fps mobile").
      If the number didn't move, the optimization didn't work — find the actual bottleneck, don't
      claim victory.

A regression caught here is free; one shipped to the store is a 1-star review.

## Non-Negotiable

- [ ] Measured renderer.info before optimizing
- [ ] Draw calls < 100
- [ ] Repeated objects instanced
- [ ] Memory stable (geometries don't climb)
- [ ] Pixel ratio capped
- [ ] Removed objects disposed
- [ ] Decoders (Draco/KTX2) bundled locally if used
- [ ] 30+ fps on mobile verified
