---
name: pixel-art
kind: tactical
description: "Make GOOD pixel-art sprites the first time: limited-palette ramps, readable silhouettes, animation frames (idle/walk/attack/hit), sprite-sheet layout, integer-scale crisp…"
---

# Pixel Art — Readable sprites + animation, code-drawn, first-pass-good

## Why pixel art comes out bad (and the fix)

Flat detail-less blobs with no animation happen because the work skips the three things that
actually make pixel art read: **limited palette with ramps**, **silhouette-first design**, and
**purpose-built animation frames**. This skill enforces all three. Run **$art-direction first**
to get the binding palette; this skill turns it into sprites.

Code-drawn (canvas → ImageData or a tiny data format), not downloaded — keeps the zip small and
dodges the Yandex CDN/asset-size blockers (Lesson #69).

## Rule 0 — Crisp rendering (or everything looks like mud)

```css
canvas, img.sprite { image-rendering: pixelated; image-rendering: crisp-edges; }
```
Draw at **native resolution** (e.g. 16×16, 32×32) and scale up by **integer factors only**
(×3, ×4 — never ×2.5). Non-integer scale = blurry/uneven pixels = the #1 "looks cheap" cause.

## Rule 1 — Limited palette + RAMPS (the single biggest quality lever)

Don't pick colors per-pixel. Build **ramps**: 3–5 shades per material, hue-shifted (shadows go
cooler/toward the scene's ambient, highlights go warmer). Flat = 1 color per shape (bad). Good =
base + shadow + dark-shadow + highlight, hue-shifted along the ramp.

```javascript
// A ramp = ordered shades, dark→light. Hue-shift, don't just darken/lighten.
const RAMP = {
  skin:  ['#3a2a33','#7a4a48','#c8806a','#f0b088'],   // shadow → highlight, warming
  metal: ['#2b3a4a','#4a6a82','#8aa6be','#d6e6f0'],   // cool ramp
  leaf:  ['#1e3a24','#2f6b3a','#5aa64e','#9bd66a'],
};
// Total palette: aim for 8–16 colors for a whole sprite set. Reuse ramps across sprites.
```

## Rule 2 — Silhouette first (readability)

Block the **silhouette** in one color before any interior detail. If you can't tell what it is
(or tell two enemies apart) from the black silhouette alone, redesign the shape — no amount of
interior shading saves an unreadable silhouette. Distinct silhouettes per entity is how players
parse the screen at speed.

## Rule 3 — Detail that reads at native size

- **Outline:** 1px darker-than-base outline (or "selout" — selective outline, omit on lit edges).
- **Highlight:** 1–2 pixels on the light-facing side (top-left by convention). One bright accent
  pixel ("the sparkle") sells metal/eyes/gems.
- **Anti-aliasing:** manual, 1px of a mid-shade only on curved edges — sparingly. Don't auto-AA.
- **No noise:** every pixel is a decision. Random scattered pixels = dirt, not texture.
- **Banding:** avoid parallel diagonal stairs of equal length — break them up.

## Rule 4 — Animation (the part that's usually just missing)

Sprites must move or they look dead. Minimum frame budgets per action:

| Action | Frames | Key idea |
|--------|--------|----------|
| **Idle** | 2–4 | Breathing: bob 1px up/down, slow. NEVER fully static. |
| **Walk/Run** | 4–8 | Contact → down → pass → up cycle. Move pixels, bob the body. |
| **Attack** | 3–5 | **Anticipation** (wind-up back) → **strike** (fast, 1 smear frame) → recover. |
| **Hit** | 2 | Flash white/red 1 frame + recoil 2px. |
| **Death** | 4–6 | Collapse or pop into particles. |
| **Jump** | 3 | Crouch (anticipation) → stretch up → fall tuck. |

Principles that make frames feel alive: **anticipation** (wind up before a fast move),
**squash & stretch** (compress on impact, elongate in fast motion), **a smear/blur frame** on the
fastest part of an attack, **follow-through** (settle, don't stop dead). Linear pose-to-pose with
no anticipation = the "dead sprite" feeling.

## Sprite-sheet layout + runtime helper

Lay frames left→right per row, one action per row, all frames the same cell size.

```javascript
// Tiny sprite-sheet animator. sheet = image/canvas; frameW/H = native cell size.
class SpriteAnim {
  constructor(sheet, frameW, frameH, anims) {
    this.sheet = sheet; this.fw = frameW; this.fh = frameH;
    this.anims = anims;          // { idle:{row:0,frames:4,fps:6,loop:true}, attack:{row:2,frames:5,fps:18,loop:false}, ... }
    this.cur = 'idle'; this.t = 0; this.frame = 0;
  }
  play(name){ if(name!==this.cur){ this.cur=name; this.frame=0; this.t=0; } }
  update(dt){
    const a=this.anims[this.cur]; this.t+=dt;
    if(this.t >= 1/a.fps){ this.t=0; this.frame++;
      if(this.frame>=a.frames){ this.frame = a.loop ? 0 : a.frames-1; } }
  }
  draw(ctx,x,y,scale=4){
    const a=this.anims[this.cur];
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(this.sheet, this.frame*this.fw, a.row*this.fh, this.fw, this.fh,
                  x, y, this.fw*scale, this.fh*scale);
  }
}
```

## Generating sprites in code (no downloads)

Draw pixels into an offscreen canvas from a compact map, so sprites ship as data, not images:

```javascript
// '.' = transparent; other chars index into a palette array.
function spriteFromMap(map, palette, px=1){
  const h=map.length, w=map[0].length;
  const c=document.createElement('canvas'); c.width=w*px; c.height=h*px;
  const g=c.getContext('2d');
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const ch=map[y][x]; if(ch==='.') continue;
    g.fillStyle = palette[ch]; g.fillRect(x*px,y*px,px,px);
  }
  return c; // use as a sprite-sheet cell or standalone
}
// Build animation frames as separate maps that differ by a few pixels (the bob, the limb).
```

## Tilesets (environments)

Same palette/ramps. Make tiles **seamless** (edges line up when repeated) and add 2–3 variant
tiles per surface to break visible repetition. Decorative overlay tiles (cracks, moss, props)
on top of base tiles = "rich" instead of "просто стены" for 2D.

## Self-critique before delivery (from $art-direction Part B)

- [ ] **Silhouette test:** recognizable as a black shape; entities distinguishable from each other
- [ ] **Native-res test:** looks intentional at 1× (not just when scaled up)
- [ ] **Ramps used:** every material has ≥3 hue-shifted shades, not flat fill
- [ ] **Integer scaling only** + `image-rendering: pixelated`
- [ ] **Idle is animated** (no fully static sprite); attack has anticipation + a fast frame
- [ ] Palette ≤ 16 colors total, reused across the set (cohesion)

## Non-Negotiable
- [ ] $art-direction spec exists (binding palette/ramps) before drawing
- [ ] Limited palette with ramps — no flat single-color shapes
- [ ] Readable, distinct silhouettes per entity
- [ ] Every entity has at least idle + one action animation (never fully static)
- [ ] Integer scale + pixelated rendering (no blur)
- [ ] Sprites code-drawn / data — no CDN or large image downloads (check-external-cdn passes)
