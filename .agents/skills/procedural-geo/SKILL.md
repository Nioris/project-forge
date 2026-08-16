---
name: procedural-geo
kind: tactical
description: "Generate 3D geometry procedurally в code — terrain via simplex noise, low-poly clouds, voxel structures, hex grids, buildings. No asset downloads — geometry is math, keeps zip…"
---

# Procedural Geometry — Generate 3D by Code

## Why this matters

Geometry generated в code = **zero asset downloads**. No .glb files, no textures к bundle. The whole 3D world is math. Critical advantages:

- **Tiny zip** — Yandex 100MB limit easily met (a noise terrain is ~0 bytes of assets)
- **No CDN problem** — nothing к load externally (Lesson #67)
- **Infinite variety** — change seed → new world
- **Instant** — no loading screen для assets

Run `$art-direction` first — geometry is cheap, but a scene still needs a focal point, set dressing and detail density per the spec (see $three-setup Step 6). Procedural ≠ bare: compose to the spec, not just scatter noise.

Requires `$three-setup` first.

## Core technique 1 — Noise terrain

Simplex noise displaces a plane grid into terrain. Bundle a noise lib locally:

```bash
curl -sSL --max-time 30 -o assets/lib/simplex-noise.js \
  https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js
echo "simplex-noise  4.0.1  jsdelivr  $(date +%Y-%m-%d)" >> assets/lib/_versions.txt
```

```javascript
import * as THREE from 'three';
import { createNoise2D } from './assets/lib/simplex-noise.js';

function createTerrain(width = 50, depth = 50, segments = 100) {
  const noise2D = createNoise2D();
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);   // lay flat

  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Layered noise (octaves) для natural detail
    let height = 0;
    height += noise2D(x * 0.05, z * 0.05) * 4;      // large hills
    height += noise2D(x * 0.15, z * 0.15) * 1.5;    // medium bumps
    height += noise2D(x * 0.4, z * 0.4) * 0.4;      // fine detail
    pos.setY(i, height);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();   // recalc lighting normals

  const material = new THREE.MeshStandardMaterial({
    color: 0x6b8e4e,
    flatShading: true,   // low-poly faceted look
  });
  return new THREE.Mesh(geometry, material);
}
```

### Height-based coloring (biome zones)

```javascript
// Per-vertex colors based on height
const colors = [];
const lowColor = new THREE.Color(0x3a5f3a);   // grass
const midColor = new THREE.Color(0x8b7355);   // rock
const highColor = new THREE.Color(0xffffff);  // snow

for (let i = 0; i < pos.count; i++) {
  const h = pos.getY(i);
  let color;
  if (h < 1) color = lowColor;
  else if (h < 3) color = midColor;
  else color = highColor;
  colors.push(color.r, color.g, color.b);
}
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
material.vertexColors = true;
```

## Core technique 2 — Low-poly clouds

```javascript
function createCloud() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
  });
  // Cloud = cluster of low-poly spheres
  const blobCount = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < blobCount; i++) {
    const geo = new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.6, 0); // detail 0 = lowest poly
    const blob = new THREE.Mesh(geo, mat);
    blob.position.set(
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 2
    );
    group.add(blob);
  }
  return group;
}
```

## Core technique 3 — Voxel structures

```javascript
function createVoxelStructure(blueprint) {
  // blueprint: 3D array [y][z][x] of color indices (0 = empty)
  const palette = [null, 0x8b4513, 0x228b22, 0x4169e1];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  // Instanced mesh — все voxels = 1 draw call
  const voxelCount = blueprint.flat(2).filter(v => v > 0).length;
  const meshes = {};   // one InstancedMesh per color

  // Count per color first
  // ... then InstancedMesh per palette color, setMatrixAt per voxel
  // See $3d-perf skill для full instancing pattern

  // Simple version (non-instanced — OK for <500 voxels):
  const group = new THREE.Group();
  for (let y = 0; y < blueprint.length; y++) {
    for (let z = 0; z < blueprint[y].length; z++) {
      for (let x = 0; x < blueprint[y][z].length; x++) {
        const c = blueprint[y][z][x];
        if (c === 0) continue;
        const mat = new THREE.MeshStandardMaterial({ color: palette[c], flatShading: true });
        const cube = new THREE.Mesh(boxGeo, mat);
        cube.position.set(x, y, z);
        group.add(cube);
      }
    }
  }
  return group;
}
```

⚠️ For >500 voxels — use InstancedMesh (see $3d-perf). Non-instanced kills framerate.

## Core technique 4 — Hex grid

```javascript
function createHexGrid(radius = 5) {
  const group = new THREE.Group();
  const hexGeo = new THREE.CylinderGeometry(1, 1, 0.5, 6);  // 6 sides = hexagon
  const hexW = Math.sqrt(3);

  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      // Axial → world coordinates
      const x = hexW * (q + r / 2);
      const z = 1.5 * r;
      const mat = new THREE.MeshStandardMaterial({
        color: Math.random() > 0.5 ? 0x4a7c3a : 0x5a8c4a,
        flatShading: true,
      });
      const hex = new THREE.Mesh(hexGeo, mat);
      hex.position.set(x, 0, z);
      group.add(hex);
    }
  }
  return group;
}
```

## Core technique 5 — Stacked-block buildings

```javascript
function createBuilding(floors) {
  const group = new THREE.Group();
  const floorHeight = 0.8;
  let width = 2 + Math.random();
  for (let f = 0; f < floors; f++) {
    // Taper as building rises
    if (f > 0 && Math.random() > 0.7) width *= 0.85;
    const geo = new THREE.BoxGeometry(width, floorHeight, width);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x5a6978,
      flatShading: true,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.position.y = f * floorHeight + floorHeight / 2;
    group.add(floor);
  }
  return group;
}
```

## Seeded randomness — reproducible worlds

```javascript
// Mulberry32 PRNG — deterministic from seed
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(12345);   // same seed = same world every time
const val = rng();   // deterministic 0..1
```

Use seeded RNG для: daily challenge levels, shareable seed codes, reproducible testing.

## Performance — procedural geometry tips

- Compute geometry **once** at load, не every frame
- For animated terrain (waves), modify positions in-place + `needsUpdate = true`
- `computeVertexNormals()` after displacement — else lighting wrong
- Merge static geometries via `BufferGeometryUtils.mergeGeometries()` — fewer draw calls
- >500 repeated objects → InstancedMesh (see $3d-perf)
- Dispose old geometry when regenerating: `oldMesh.geometry.dispose()`

## Anti-patterns

❌ Regenerating terrain every frame — compute once
❌ Forgetting `computeVertexNormals()` after vertex displacement — broken lighting
❌ 1000s of individual Mesh objects — use InstancedMesh
❌ High-segment geometry для low-poly look — `IcosahedronGeometry(1, 0)` not `(1, 5)`
❌ Loading noise lib from CDN — bundle local

## Integration

- Requires **$three-setup**
- **$visual-style** — apply look к generated geometry
- **$3d-perf** — instancing для many procedural objects
- **$shader-fx** — animate terrain via vertex shader

## Non-Negotiable

- [ ] $three-setup done first
- [ ] Noise lib bundled locally (not CDN)
- [ ] Geometry computed once, not per-frame
- [ ] computeVertexNormals() after displacement
- [ ] >500 repeated objects use InstancedMesh
- [ ] Old geometry disposed when regenerating
- [ ] check-external-cdn.mjs passes
