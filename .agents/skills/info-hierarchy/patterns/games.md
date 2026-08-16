# Game UI Patterns Reference

> Reference база паттернов для разных жанров игр. Используется skills `/info-hierarchy`, `/layout-system`, `/ui-review` для **жанро-специфических** decisions.
>
> Источники: Game UI Database (1300+ games), Material Design Games guidelines, GDC talks, F2P design literature.

## HUD типы — фундаментальная таксономия

Классификация Fagerholt & Lorentzon (2009), подтверждённая через 15+ лет industry use:

| Тип | Что это | Когда использовать | Pitfall |
|---|---|---|---|
| **Non-diegetic** | UI overlay поверх 3D/2D scene. Юзер видит, character не видит. Health bar, score, minimap. | Default. Fastest readability. F2P mobile, action games, любая casual. | Overload — Cookie Clicker showing 8 currencies сразу = wall |
| **Diegetic** | UI integrated в game world. Health bar на броне (Dead Space), карта в руках (Far Cry 2). | Immersion-critical: horror, narrative, VR | Hard to read под pressure. Не для fast-paced. |
| **Spatial** | UI в 3D space но не in-fiction. Floating quest markers. | Open-world, RPG navigation | Blocks view at scale |
| **Meta** | UI affects world. Blood splatter on screen = damage. Vignette = low health. | Modern shooters, survival horror | Hard to debug feedback |

**Default для большинства F2P/mobile/web games:** non-diegetic. Не пытайся быть Dead Space.

## Genre-specific HUD anatomy

### Action / Shooter (FPS/TPS)

**Eye flow:** centre-fixed (crosshair). Periphery only.

```
┌──────────────────────────────────┐
│ [HP]              [QUEST/MARKER] │  ← top corners
│                                  │
│                                  │
│                ⊕                 │  ← center: crosshair
│                                  │
│                                  │
│ [WEAPON/AMMO]      [MINIMAP]     │  ← bottom corners
└──────────────────────────────────┘
```

- Crosshair: **centre, never moves**, primary focal point
- HP/shield: top-left **OR** bottom-left, never blocking centre
- Ammo: bottom-right (one-handed grip)
- Minimap: **top-right OR bottom-right**, max 15% width
- Quest text: top-right, fade-out 5s

**Critical:** Tier 1 = action zone (center). Tier 2 = essential stats (HP/ammo). Tier 3 = minimap, objectives.

### Strategy / RTS / Tower Defense

**Eye flow:** map-focal с peripheral controls.

```
┌──────────────────────────────────┐
│ [RESOURCES]     [TIME/WAVE]      │  ← top: persistent state
│                                  │
│                                  │
│         GAME BOARD               │  ← center: 70% real estate
│                                  │
│                                  │
│ [UNIT BUILDER]    [ACTION BAR]   │  ← bottom: controls
└──────────────────────────────────┘
```

- Resources: top-left, money/wood/etc. **Always visible**, never hidden in submenu
- Wave/timer: top-right или center top
- Build menu: bottom horizontal strip OR right sidebar
- Selected unit info: bottom-left popup

### Idle / Clicker / Tycoon

**Eye flow:** vertical центральная ось — tap target dominant.

```
┌──────────────────────────────────┐
│      [STATS: $/sec/click]        │  ← top: numbers update live
│                                  │
│                                  │
│         ●●●                      │  ← center: tap target
│      TAP HERE                    │     (60% real estate)
│         ●●●                      │
│                                  │
│                                  │
│ [SHOP]  [UPGRADES]  [PRESTIGE]   │  ← bottom: tabs (mobile)
└──────────────────────────────────┘
```

- Currency: top, single row, **3 stats max** (current, /sec, /click)
- Tap target: **dead center**, largest element on screen, animated
- Shop: bottom drawer (mobile) или right sidebar (desktop)
- Multiple currencies: collapse to "+" expand button

**Anti-pattern:** правая панель занимающая 50%+ экрана на desktop — **зажимает** core action. Max 30%.

### Match-3 / Puzzle

**Eye flow:** focal grid, peripheral support.

```
┌──────────────────────────────────┐
│ [LEVEL] [MOVES] [GOAL]           │  ← top: progress
│                                  │
│  ┌─────────────────┐             │
│  │                 │             │
│  │   PUZZLE GRID   │             │  ← center: dominant
│  │                 │             │
│  │                 │             │
│  └─────────────────┘             │
│                                  │
│ [BOOSTERS]   [PAUSE]             │  ← bottom: tools
└──────────────────────────────────┘
```

- Goal indicator: top-left (что нужно достичь)
- Moves remaining: top-center, **Tier 1 Stress indicator** (тур 3 цифры → red)
- Boosters: bottom row, 3-5 max
- Score: top-right или collapse в "more"

### RPG / Open-world

**Eye flow:** exploration-driven, layered information.

```
┌──────────────────────────────────┐
│ [HP][MP]      [QUEST OBJECTIVE]  │  ← top
│                                  │
│                                  │
│          GAME WORLD              │  ← center: 80%
│                                  │
│                                  │
│                                  │
│ [HOTBAR/SKILLS] [MINIMAP]        │  ← bottom
└──────────────────────────────────┘
```

- Vitals (HP/MP/Stamina): top-left compact
- Quest text: top-right, expandable
- Hotbar: bottom-center, 8-12 slots (PC), 4-6 (mobile)
- Minimap: bottom-right, expandable to fullmap

**Sub-screens:** Inventory, Map, Quests — all modal overlays, never inline panels.

### Casual / Hyper-casual

**Eye flow:** simple, single-action focal.

```
┌──────────────────────────────────┐
│ [PROGRESS]    [SETTINGS]         │  ← top: minimal
│                                  │
│                                  │
│                                  │
│     ACTION AREA                  │  ← 90% screen
│                                  │
│                                  │
│                                  │
│      [PRIMARY ACTION]            │  ← thumb zone
└──────────────────────────────────┘
```

- Progress bar: top, slim
- Score popup: floating, transient
- Tap area: nearly fullscreen
- Single CTA in thumb zone bottom

### Calibration / Sim / Parameter games

**Eye flow:** tri-zone — input controls / preview / launch.

```
┌──────────────────────────────────┐
│ [HEADER: STATUS / RESOURCES]     │
├────────────┬──────────┬──────────┤
│            │          │          │
│ INPUTS     │ PREVIEW  │ TARGETS/ │
│ (sliders,  │ (visual  │ OPTIONS  │
│  toggles,  │  result) │ (where   │
│  values)   │          │  to use) │
│            │          │          │
├────────────┴──────────┴──────────┤
│           [LAUNCH CTA]           │  ← always thumb-reach
└──────────────────────────────────┘
```

- 3 columns desktop, vertical stack mobile
- Inputs: left column, group by category (visual, mechanical, etc.)
- Preview: center, **Tier 2** (юзер should see effect of changes)
- Targets/output options: right column
- Launch: full-width bottom, sticky, always visible

**Anti-pattern (genetic-lab):** preview занимает 60% real estate с пустым фоном. Preview should be **20-30%** with content on edges. Launch CTA on **bottom**, not in right column.

## Shop / IAP screens

**3 patterns по data:**

### Pattern A — Currency store (single resource type)

Top: header + close. Body: vertical scroll grid 2x columns of packs (mobile) или 4-cols (desktop). Each pack:

```
┌─────────────┐
│ [✦ BEST]    │  ← badge top-right
│             │
│  💎 5,000   │  ← amount large (Tier 1)
│   +500 BONUS│  ← bonus middle (Tier 2)
│             │
│  $9.99      │  ← price prominent
└─────────────┘
```

- "Best Value" / "Most Popular" labels guide spend (research: explicit nudges work better than hidden)
- Show **value progression** (10% / 20% / 30% / 50% extra) — explicit better than implicit

### Pattern B — Mixed offers (bundles + currency + cosmetics)

Tabs at top: "Featured / Bundles / Coins / Gems / Skins". Featured = always default tab.

Each bundle shows what's inside (icons + counts), price, optional timer.

### Pattern C — Daily/timed rewards

Calendar view — 7-30 days. Today highlighted. Past = checked. Future = preview.

```
┌─ Day 1 ─┬─ Day 2 ─┬─ Day 3 ─┬─ ...
│   ✓    │   ✓    │  ►NOW  │
│  10💰   │  20💰   │  50💰   │
└────────┴────────┴────────┴───
```

## Mobile-specific game UI

### Thumb zones (Steven Hoober research)

```
┌─────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  RED (top): 
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  Hard to reach 
│                 │  (settings, status, info)
│ ░░░░░░░░░░░░░░░ │  YELLOW (mid): 
│ ░░░░░░░░░░░░░░░ │  Stretchable 
│ ░░░░░░░░░░░░░░░ │  (content, preview)
│                 │
│ ●●●●●●●●●●●●●●● │  GREEN (bottom 30-40%): 
│ ●●●●●●●●●●●●●●● │  Easy reach 
│ ●●●●●●●●●●●●●●● │  (CTA, primary action, nav)
└─────────────────┘
```

- **CTA always bottom 30-40%** of screen
- Right-handed users: bottom-right easiest. But **center** universal.
- Touch targets: **44×44pt iOS / 48×48dp Android** minimum (WCAG 2.1)
- Spacing between targets: 8px minimum to prevent mis-taps

### Safe areas (mandatory for mobile)

```
- Top inset: notch / status bar (iOS: dynamic, Android: 24-28dp)
- Bottom inset: home indicator (iOS: 34pt) / gesture nav (Android: 48dp)  
- Side insets: rounded corners + landscape camera cutout
```

Critical UI **must** anchor к `safe-area-inset` not viewport edge:

```css
.hud {
  padding-top: env(safe-area-inset-top);
  padding-bottom: max(env(safe-area-inset-bottom), 16px);
}
```

### Portrait vs Landscape

- **Portrait:** vertical stack, bottom-heavy CTA
- **Landscape:** horizontal split, controls left+right, content center
- **Some genres force orientation:** FPS/racing → landscape; idle/clicker/match3 → portrait

## Common AAA-game anti-patterns (avoid)

1. **HUD overload** — 12+ permanent elements. Cap at 5-7 visible at once.
2. **Hidden important info** — minimap stuff hidden by HUD. Layer carefully.
3. **No accessibility options** — no colorblind mode, no font scaling, no motion reduction.
4. **CTAs in red zones** — "Pause" button top-left на phone — unreachable.
5. **Permanent overlays blocking gameplay** — non-toggleable elements covering action area.
6. **Inconsistent button positions** — Yes/No swap places between modals (F2P dark pattern).

## F2P-specific patterns (когда применимо)

### Currency display
- **Top corner persistent** — both currencies (soft + premium) always visible
- **`+` button** — tap to enter shop directly
- **Animation on change** — when value changes, animate (count up/down)

### Reward feedback
- **Loot pile** — items rain from top, large, animated
- **Tier reveals** — common slow, rare fast (anticipation)
- **"Tap to continue"** — pause player attention on rewards

### Progression hooks
- **Always show next milestone** — "3 levels to next reward"
- **Zeigarnik effect** — partial completion ("7/10 puzzle pieces")
- **Cliffhanger interruptions** — stop at progress, not failure

### Anti-dark-pattern (DO)
- Place close button in **consistent location** все screens
- **Sufficient delay** between modals (read time)
- **Both currencies always shown** with prices
- **Decline button** as visible as accept button

## Onboarding patterns

### First-time experience (FTUE)

3 approaches by complexity:

**A. Guided tutorial** (linear, RPG, complex):
- Block all UI except current step
- Highlight target with hand pointer / glow
- "Tap to continue" между steps
- Max 5-7 steps before unblock

**B. Empty state hints** (sandbox, builders):
- Empty containers с CTA "Add your first X"
- Coach marks on key UI on first interaction
- Dismissible, not blocking

**C. Pre-loaded sample content** (creative tools, dashboards):
- Show app **with example data**
- "Reset and start fresh" option visible
- Tutorial appears как side-panel, not blocker

## How to use this reference в skills

`/info-hierarchy` reads this when designing tier system:
- "Idle game?" → use Idle pattern (tap target dominant, currency top)
- "Strategy?" → top resources / center board / bottom controls

`/layout-system` reads this for grid + density:
- "FPS?" → center-fixed, periphery sparse
- "RPG?" → multi-zone, modal overlays for sub-screens

`/ui-review` reads this when evaluating:
- "Idle game с правой панелью 50%?" → flag — anti-pattern
- "Tap target не в центре?" → flag — eye flow broken
