---
name: level-design
kind: architectural
description: "Procedural and hand-crafted level design for ALL genres: wave tables, room generators, track layouts, puzzle grids, map builders, boss arenas. Creates level data structures, difficulty progression, and content variety. Triggers on: level, wave, room, map, dungeon, track, stage, floor, zone, spawn, layout, procedural, generator, content."
---

# Level Design

## Phase 0: Research references (v4.5+, MANDATORY unless user skips)

**Before making changes, understand what similar successful games/apps do.** This prevents blind reinvention and grounds decisions in real patterns.

Invoke: `/research-references {genre/category} {specific-aspect}`

This produces `wiki/research/{Project}-references.md` with 3-5 real competitors, extracted patterns, and UI/UX direction. Wait for user confirmation of the direction before applying changes below.

**Skip if:** user explicitly says "skip research" / "без research", or `wiki/research/{Project}-references.md` already exists and is <14 days old.

---

## Purpose
Games arrive with 1 level or infinite random. Both are bad. This skill creates proper level progression: hand-tuned early levels for onboarding, procedural mid-game for variety, curated endgame for challenge. Genre-specific generators with data-driven configs.

## ⚠️ SAFE ZONE
- ✅ Level data (arrays, objects, configs)
- ✅ Spawning logic, wave tables, room templates
- ✅ Procedural generators (BSP, cellular automata, WFC)
- ✅ Difficulty scaling per level
- ✅ New enemy types, obstacles, power-ups per level
- 🚫 NEVER: SDK calls, localization strings (use t() for new text), ad placements, debug panel

---

## Step 1: Choose Generator by Genre

| Genre | Level Structure | Generator Type |
|-------|----------------|----------------|
| **Wave shooter** | Wave table: enemy types × counts × timing | Data table + difficulty curve |
| **Roguelike / Dungeon** | Rooms connected by corridors | BSP tree or random walk |
| **Platformer** | Linear segments with jumps + enemies | Segment pool + difficulty chain |
| **Racing** | Track: turns, straights, hazards | Spline + obstacle placement |
| **Puzzle** | Grid with target state | Reverse solve (build from solution) |
| **Tower defense** | Path + build zones | Path graph + zone grid |
| **Strategy / RTS** | Map with resources + bases | Symmetric placement + noise |
| **Arena / Boss rush** | Arena shape + boss phases | Phase table + attack patterns |
| **Idle / Tycoon** | Unlock tiers + scaling | Exponential cost/reward table |
| **Runner** | Obstacle patterns in lanes | Pattern pool + speed curve |

---

## Step 2: Generators by Genre

### WAVE SHOOTER (top-down, arena, horde)

```javascript
/**
 * @level Wave table generator
 * @genre shooter, arena, horde survival
 * 
 * Principles:
 * - Introduce ONE new enemy type per 3-5 waves
 * - Every 5th wave = boss or elite
 * - Wave after boss = breather (fewer enemies, more loot)
 * - Mix enemy types after introduction (combos are harder)
 */
const ENEMY_TYPES = {
  grunt:    { hp: 1, speed: 60, damage: 5, score: 10, color: '#4ade80', intro: 1 },
  fast:     { hp: 1, speed: 120, damage: 3, score: 15, color: '#facc15', intro: 4 },
  tank:     { hp: 5, speed: 30, damage: 10, score: 25, color: '#ef4444', intro: 7 },
  ranged:   { hp: 2, speed: 40, damage: 8, score: 20, color: '#a78bfa', intro: 10 },
  splitter: { hp: 3, speed: 50, damage: 5, score: 30, color: '#f97316', intro: 13, onDeath: 'spawn_2_grunts' },
  healer:   { hp: 2, speed: 35, damage: 0, score: 35, color: '#67e8f9', intro: 16, ability: 'heal_nearby' },
  boss:     { hp: 30, speed: 20, damage: 15, score: 100, color: '#dc2626', isBoss: true },
};

function generateWaveTable(totalWaves) {
  const waves = [];
  
  for (let w = 1; w <= totalWaves; w++) {
    const isBoss = w % 5 === 0;
    const isBreather = w % 5 === 1 && w > 1;
    
    // Available enemy types (introduced by this wave)
    const available = Object.entries(ENEMY_TYPES)
      .filter(([k, v]) => !v.isBoss && v.intro <= w)
      .map(([k]) => k);
    
    if (isBoss) {
      // Boss wave: 1 boss + a few grunts
      waves.push({
        wave: w, type: 'boss',
        enemies: [
          { type: 'boss', count: 1 },
          { type: 'grunt', count: Math.floor(w / 5) },
        ],
        spawnDelay: 0.5,
        reward: { coins: 50 * (w / 5), drop: 'health_pack' },
      });
    } else if (isBreather) {
      // Breather: half enemies, double loot
      waves.push({
        wave: w, type: 'breather',
        enemies: [
          { type: available[0], count: Math.floor(2 + w * 0.3) },
        ],
        spawnDelay: 1.5,
        reward: { coins: 20, lootMultiplier: 2 },
      });
    } else {
      // Normal wave: mix of available types
      const composition = [];
      const totalEnemies = Math.floor(3 + w * 1.1);
      
      // Primary type (60%)
      composition.push({ type: available[available.length - 1], count: Math.ceil(totalEnemies * 0.6) });
      // Secondary type (40%)
      if (available.length > 1) {
        const secondary = available[Math.floor(Math.random() * (available.length - 1))];
        composition.push({ type: secondary, count: Math.floor(totalEnemies * 0.4) });
      }
      
      waves.push({
        wave: w, type: 'normal',
        enemies: composition,
        spawnDelay: Math.max(0.3, 1.5 - w * 0.04),
        reward: { coins: 5 + w * 2 },
      });
    }
  }
  return waves;
}
```

### ROGUELIKE / DUNGEON CRAWLER

```javascript
/**
 * @level BSP Dungeon Generator
 * @genre roguelike, dungeon crawler, RPG
 * 
 * Binary Space Partition: split rectangle → rooms in leaves → corridors between
 */
function generateDungeon(width, height, depth, floorNum) {
  const MIN_ROOM = 5;
  const grid = Array.from({ length: height }, () => Array(width).fill(1)); // 1=wall
  const rooms = [];
  
  // BSP split
  function split(x, y, w, h, d) {
    if (d <= 0 || w < MIN_ROOM * 2 || h < MIN_ROOM * 2) {
      // Leaf: carve room with 1-tile padding
      const rx = x + 1 + Math.floor(Math.random() * 2);
      const ry = y + 1 + Math.floor(Math.random() * 2);
      const rw = Math.max(MIN_ROOM - 2, w - 3 - Math.floor(Math.random() * 3));
      const rh = Math.max(MIN_ROOM - 2, h - 3 - Math.floor(Math.random() * 3));
      
      for (let gy = ry; gy < ry + rh; gy++)
        for (let gx = rx; gx < rx + rw; gx++)
          grid[gy][gx] = 0; // 0=floor
      
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw/2), cy: ry + Math.floor(rh/2) });
      return;
    }
    
    const horizontal = Math.random() > 0.5;
    if (horizontal) {
      const split = y + MIN_ROOM + Math.floor(Math.random() * (h - MIN_ROOM * 2));
      split(x, y, w, split - y, d - 1);
      split(x, split, w, y + h - split, d - 1);
    } else {
      const splitX = x + MIN_ROOM + Math.floor(Math.random() * (w - MIN_ROOM * 2));
      split(x, y, splitX - x, h, d - 1);
      split(splitX, y, x + w - splitX, h, d - 1);
    }
  }
  
  split(0, 0, width, height, depth);
  
  // Connect rooms with L-shaped corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    let cx = a.cx, cy = a.cy;
    while (cx !== b.cx) { grid[cy][cx] = 0; cx += cx < b.cx ? 1 : -1; }
    while (cy !== b.cy) { grid[cy][cx] = 0; cy += cy < b.cy ? 1 : -1; }
  }
  
  // Assign room roles based on floor depth
  rooms[0].role = 'start';
  rooms[rooms.length - 1].role = 'exit';
  
  // Enemies scale with floor number
  const enemyBudget = 5 + floorNum * 3;
  let placed = 0;
  rooms.forEach((room, i) => {
    if (room.role === 'start') return;
    if (room.role === 'exit') { room.content = { type: 'stairs' }; return; }
    
    const isSecret = Math.random() < 0.15;
    if (isSecret) {
      room.content = { type: 'treasure', loot: getTreasure(floorNum) };
    } else {
      const count = Math.min(3, Math.ceil(enemyBudget * 0.2));
      room.content = { type: 'enemies', enemies: getFloorEnemies(floorNum, count) };
      placed += count;
    }
  });
  
  // Every 5 floors = boss room (largest room)
  if (floorNum % 5 === 0) {
    const largest = rooms.reduce((a, b) => (a.w * a.h > b.w * b.h ? a : b));
    largest.role = 'boss';
    largest.content = { type: 'boss', boss: getFloorBoss(floorNum) };
  }
  
  return { grid, rooms, floorNum };
}

function getFloorEnemies(floor, count) {
  const types = ['slime', 'bat', 'skeleton', 'mage', 'golem', 'demon'];
  const maxType = Math.min(types.length - 1, Math.floor(floor / 3));
  return Array.from({ length: count }, () => ({
    type: types[Math.floor(Math.random() * (maxType + 1))],
    level: floor,
  }));
}

function getFloorBoss(floor) {
  const bosses = [
    { name: 'Слизень-король', hp: 50, atk: 8, pattern: 'charge_split' },
    { name: 'Некромант', hp: 80, atk: 12, pattern: 'summon_shoot' },
    { name: 'Голем', hp: 150, atk: 20, pattern: 'slam_rocks' },
    { name: 'Демон-лорд', hp: 200, atk: 25, pattern: 'teleport_fire' },
  ];
  return bosses[Math.min(bosses.length - 1, Math.floor(floor / 5) - 1)];
}
```

### PLATFORMER

```javascript
/**
 * @level Segment-based level generator
 * @genre platformer, side-scroller
 * 
 * Levels built from pre-designed segments chained by difficulty
 */
const SEGMENTS = {
  // Difficulty 1: Tutorial segments
  flat_run:       { d: 1, platforms: [[0,8,20,1]], enemies: [], coins: [[5,7],[10,7],[15,7]] },
  small_gap:      { d: 1, platforms: [[0,8,8,1],[12,8,8,1]], enemies: [], coins: [[10,5]] },
  single_enemy:   { d: 1, platforms: [[0,8,20,1]], enemies: [{ type:'walker', x:12, y:7 }], coins: [] },
  
  // Difficulty 2: Basic challenge
  moving_plat:    { d: 2, platforms: [[0,8,6,1],['moving',4,12,5,8,1]], enemies: [], coins: [[9,3]] },
  gap_enemy:      { d: 2, platforms: [[0,8,7,1],[11,8,9,1]], enemies: [{ type:'walker', x:14, y:7 }], coins: [[5,5]] },
  staircase:      { d: 2, platforms: [[0,8,5,1],[6,6,5,1],[12,4,5,1]], enemies: [], coins: [[14,3]] },
  
  // Difficulty 3: Skilled
  spike_run:      { d: 3, platforms: [[0,8,20,1]], hazards: [{type:'spikes',x:5,w:3},{type:'spikes',x:12,w:2}], coins: [[8,5]] },
  multi_gap:      { d: 3, platforms: [[0,8,4,1],[7,7,3,1],[13,6,3,1],[18,8,4,1]], enemies: [], coins: [[8,4],[14,3]] },
  enemy_gauntlet: { d: 3, platforms: [[0,8,20,1]], enemies: [{type:'walker',x:5,y:7},{type:'flyer',x:10,y:4},{type:'walker',x:16,y:7}], coins: [] },
  
  // Difficulty 4: Expert
  blind_jump:     { d: 4, platforms: [[0,8,3,1],[10,6,3,1],[18,8,3,1]], enemies: [{type:'flyer',x:6,y:5}], coins: [[11,3]] },
  boss_arena:     { d: 4, platforms: [[0,8,24,1],[4,5,4,1],[16,5,4,1]], enemies: [], isBossArena: true },
};

function generatePlatformerLevel(levelNum, totalSegments) {
  const level = { segments: [], totalLength: 0 };
  const targetDifficulty = Math.min(4, 1 + Math.floor(levelNum / 3));
  
  for (let i = 0; i < totalSegments; i++) {
    // Difficulty ramp within level
    let segDifficulty;
    if (i < 2) segDifficulty = Math.max(1, targetDifficulty - 1); // easy start
    else if (i === totalSegments - 1) segDifficulty = targetDifficulty; // hard end
    else segDifficulty = targetDifficulty - (Math.random() > 0.6 ? 1 : 0); // mostly target
    
    const candidates = Object.entries(SEGMENTS)
      .filter(([k, v]) => v.d === segDifficulty && !v.isBossArena);
    const [name, seg] = candidates[Math.floor(Math.random() * candidates.length)];
    
    level.segments.push({
      ...seg, name, offsetX: level.totalLength
    });
    level.totalLength += 20; // segment width
  }
  
  // Last level of world = boss arena
  if (levelNum % 5 === 0) {
    const arena = { ...SEGMENTS.boss_arena, offsetX: level.totalLength };
    arena.boss = getPlatformerBoss(Math.floor(levelNum / 5));
    level.segments.push(arena);
    level.totalLength += 24;
  }
  
  return level;
}
```

### TOWER DEFENSE

```javascript
/**
 * @level Path + Build Zone generator
 * @genre tower defense
 */
function generateTDLevel(levelNum) {
  const GRID_W = 15, GRID_H = 10;
  const grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill('build')); // default buildable
  
  // Generate path (entry → exit with turns)
  const path = [];
  let x = 0, y = Math.floor(GRID_H / 2);
  path.push({ x, y });
  grid[y][x] = 'path';
  
  const turns = 2 + Math.floor(levelNum / 3); // more turns = harder pathing
  const segLen = Math.floor(GRID_W / (turns + 1));
  let dir = 'right';
  
  for (let t = 0; t <= turns; t++) {
    const len = segLen + Math.floor(Math.random() * 3) - 1;
    for (let s = 0; s < len && x < GRID_W - 1; s++) {
      if (dir === 'right') x++;
      else if (dir === 'up') y = Math.max(1, y - 1);
      else if (dir === 'down') y = Math.min(GRID_H - 2, y + 1);
      if (x < GRID_W && y < GRID_H) {
        path.push({ x, y });
        grid[y][x] = 'path';
      }
    }
    dir = (y < GRID_H / 2) ? 'down' : 'up';
    if (t === turns) dir = 'right'; // finish going right
  }
  
  // Wave config for this level
  const waves = [];
  const totalWaves = 5 + levelNum * 2;
  for (let w = 1; w <= totalWaves; w++) {
    waves.push({
      enemies: [
        { type: 'normal', count: 3 + w, hp: 10 + levelNum * 5, speed: 40 + levelNum * 2 },
        ...(w > 3 ? [{ type: 'fast', count: Math.floor(w / 2), hp: 5, speed: 80 }] : []),
        ...(w % 5 === 0 ? [{ type: 'boss', count: 1, hp: 100 + levelNum * 30, speed: 25 }] : []),
      ],
      spawnInterval: Math.max(0.3, 1.0 - w * 0.02),
      reward: 20 + w * 5,
    });
  }
  
  return {
    level: levelNum, grid, path, waves,
    startBudget: 100 + levelNum * 20,
    availableTowers: getTDTowers(levelNum),
  };
}

function getTDTowers(level) {
  const all = [
    { id: 'basic', name: 'Турель', cost: 25, dmg: 5, range: 3, rate: 1.0, unlock: 1 },
    { id: 'sniper', name: 'Снайпер', cost: 50, dmg: 20, range: 6, rate: 0.3, unlock: 3 },
    { id: 'splash', name: 'Взрыв', cost: 75, dmg: 8, range: 2.5, rate: 0.5, unlock: 5, splash: 1.5 },
    { id: 'slow', name: 'Заморозка', cost: 40, dmg: 2, range: 3, rate: 0.8, unlock: 7, slow: 0.5 },
    { id: 'laser', name: 'Лазер', cost: 100, dmg: 30, range: 5, rate: 0.2, unlock: 10, pierce: 3 },
  ];
  return all.filter(t => t.unlock <= level);
}
```

### RACING

```javascript
/**
 * @level Track generator
 * @genre racing, driving
 * 
 * Track = series of control points → Catmull-Rom spline → road mesh
 */
function generateTrack(levelNum) {
  const numPoints = 8 + levelNum * 2;
  const radius = 300 + levelNum * 20;
  const points = [];
  
  // Base circle with random perturbation
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * radius * 0.5;
    points.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  }
  
  // Road properties per segment
  const segments = points.map((p, i) => ({
    point: p,
    width: 60 - levelNum * 2, // narrower on harder levels
    hazard: Math.random() < 0.1 + levelNum * 0.02 ? 'oil' : null,
    boost: Math.random() < 0.08 ? true : false,
  }));
  
  // Opponents
  const opponents = Array.from({ length: 2 + Math.floor(levelNum / 2) }, (_, i) => ({
    speed: 0.85 + i * 0.05 + levelNum * 0.01,
    skill: 0.5 + levelNum * 0.05,
    name: AI_NAMES[i % AI_NAMES.length],
  }));
  
  return { points, segments, opponents, laps: 3 };
}
```

### PUZZLE

```javascript
/**
 * @level Reverse-solve puzzle generator
 * @genre puzzle, match-3, sokoban, logic
 * 
 * Build from SOLUTION backwards → guarantee solvable
 */
function generatePuzzleLevel(levelNum, type) {
  if (type === 'sokoban') {
    // Start with boxes ON targets, then reverse N random moves
    const size = Math.min(10, 5 + Math.floor(levelNum / 3));
    const numBoxes = Math.min(5, 1 + Math.floor(levelNum / 2));
    const moves = 10 + levelNum * 5; // more moves = harder to solve
    
    // Place targets and boxes (same positions = solved state)
    const grid = Array.from({ length: size }, () => Array(size).fill(0));
    const targets = [], boxes = [];
    
    for (let b = 0; b < numBoxes; b++) {
      let x, y;
      do { x = 1 + Math.floor(Math.random() * (size - 2)); y = 1 + Math.floor(Math.random() * (size - 2)); }
      while (grid[y][x] !== 0);
      grid[y][x] = 2; // box+target
      targets.push({ x, y });
      boxes.push({ x, y });
    }
    
    // Place player and reverse-walk
    let px = Math.floor(size / 2), py = Math.floor(size / 2);
    if (grid[py][px] !== 0) px++;
    
    // Reverse N moves to scramble
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (let m = 0; m < moves; m++) {
      const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      // Check if we're pulling a box (reverse of push)
      const bx = px - dx, by = py - dy;
      const boxIdx = boxes.findIndex(b => b.x === px && b.y === py);
      if (boxIdx >= 0 && bx >= 0 && by >= 0 && bx < size && by < size) {
        boxes[boxIdx] = { x: bx, y: by }; // pull box
      }
      px = nx; py = ny;
    }
    
    return { grid, targets, boxes, player: { x: px, y: py }, par: moves, level: levelNum };
  }
  
  if (type === 'match3') {
    const cols = Math.min(9, 5 + Math.floor(levelNum / 5));
    const rows = Math.min(12, 7 + Math.floor(levelNum / 5));
    const colors = Math.min(7, 3 + Math.floor(levelNum / 3)); // more colors = harder
    const targetScore = 500 + levelNum * 200;
    const maxMoves = Math.max(10, 30 - levelNum);
    
    // Generate board without initial matches
    const board = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => Math.floor(Math.random() * colors))
    );
    // Remove initial 3-in-a-row
    removeInitialMatches(board, colors);
    
    return { board, colors, targetScore, maxMoves, level: levelNum };
  }
}
```

### RUNNER (endless)

```javascript
/**
 * @level Pattern-based obstacle generator
 * @genre runner, endless
 */
const OBSTACLE_PATTERNS = {
  // Difficulty 1
  single_low:     { d: 1, lanes: [0,0,1,0,0], type: 'jump' },  // jump center
  single_high:    { d: 1, lanes: [0,0,2,0,0], type: 'slide' },  // slide center
  gap_left:       { d: 1, lanes: [0,1,1,0,0], type: 'dodge' },  // go right
  
  // Difficulty 2
  double_gap:     { d: 2, lanes: [1,0,1,0,1], type: 'dodge' },  // go to gaps
  jump_slide:     { d: 2, sequence: ['single_low', 'single_high'], gap: 0.5 },
  coins_high:     { d: 2, lanes: [0,0,3,0,0], type: 'reward' },  // jump to get coins
  
  // Difficulty 3
  triple:         { d: 3, lanes: [1,1,0,1,1], type: 'precision' },
  rapid_fire:     { d: 3, sequence: ['gap_left', 'gap_right', 'single_low'], gap: 0.3 },
  
  // Difficulty 4
  wall:           { d: 4, lanes: [1,1,1,1,1], gap_lane: 'random', type: 'quick_react' },
  boss_section:   { d: 4, sequence: ['triple','jump_slide','double_gap','wall'], gap: 0.4 },
};

function generateRunnerChunk(distanceTraveled, speed) {
  const difficulty = Math.min(4, 1 + Math.floor(distanceTraveled / 500));
  const patterns = Object.entries(OBSTACLE_PATTERNS)
    .filter(([k, v]) => v.d <= difficulty);
  
  const chunk = [];
  const count = 3 + Math.floor(difficulty * 1.5);
  
  for (let i = 0; i < count; i++) {
    // 70% current difficulty, 30% easier (breathing room)
    const targetD = Math.random() < 0.7 ? difficulty : Math.max(1, difficulty - 1);
    const options = patterns.filter(([k, v]) => v.d === targetD);
    const [name, pattern] = options[Math.floor(Math.random() * options.length)];
    
    chunk.push({
      pattern: name,
      distance: i * (200 / speed * 60), // spacing decreases with speed
      ...pattern,
    });
  }
  
  // Coin placement between obstacles
  chunk.forEach((obs, i) => {
    if (i < chunk.length - 1 && Math.random() < 0.4) {
      obs.coins = { lane: findSafeLane(obs), count: 3 };
    }
  });
  
  return chunk;
}
```

## Step 3: Universal Level Progression Rules

```javascript
/**
 * Level progression template — works for ANY genre
 */
const PROGRESSION = {
  // New mechanic introduction cadence
  introduce: {
    newEnemy:    'every 3-5 levels',
    newHazard:   'every 4-6 levels',
    newMechanic: 'every 8-10 levels',
    newBiome:    'every 10-15 levels',
  },
  
  // Difficulty curve formula
  difficultyAt: (level) => ({
    enemyHP:       Math.floor(10 * Math.pow(1.15, level)),
    enemyCount:    Math.floor(3 + level * 1.2),
    enemySpeed:    Math.min(200, 60 + level * 5),
    spawnRate:     Math.max(0.3, 2.0 - level * 0.06),
    hazardDensity: Math.min(0.4, 0.05 + level * 0.02),
  }),
  
  // Reward curve (must outpace difficulty feeling)
  rewardAt: (level) => ({
    coins:   Math.floor(10 + level * 8),
    xp:      Math.floor(20 + level * 15),
    dropRate: Math.min(0.3, 0.05 + level * 0.01),
  }),
  
  // Level structure
  structure: [
    // World 1 (levels 1-5): TUTORIAL
    { levels: '1-2', focus: 'teach core mechanic, very easy, lots of rewards' },
    { levels: '3-4', focus: 'introduce first challenge, still forgiving' },
    { levels: '5', focus: 'BOSS — test everything learned, big reward' },
    
    // World 2 (levels 6-10): DEVELOP
    { levels: '6', focus: 'new mechanic introduced (breather level)' },
    { levels: '7-9', focus: 'combine mechanics, rising difficulty' },
    { levels: '10', focus: 'BOSS — harder, uses new mechanic' },
    
    // World 3+ (levels 11+): MASTER
    { levels: '11+', focus: 'remix, combine, surprise — player knows all mechanics' },
    { levels: 'every 5', focus: 'BOSS with unique pattern' },
    { levels: 'every 10', focus: 'NEW BIOME — visual refresh, new enemy set' },
  ],
};
```

## Self-check before delivering: walk the curve, solve the levels

Generated levels can be unsolvable, flat, or spike-walled — and you won't know from the config.
Before handing over, **trace the actual sequence**:

- [ ] **Solvability proven, not assumed** — puzzle: reverse-solve from goal; platformer: verify each
      required jump is within the character's jump arc; survival: enemy DPS vs player HP at that level.
      An impossible level 7 kills retention dead.
- [ ] **Plot the difficulty curve** for levels 1→20 and eyeball it: gradual rise, no cliff, breather
      after each spike, bosses at 5/10/15/20. If it's flat or jagged, retune before delivery.
- [ ] **One new thing at a time** — confirm no level dumps 2+ new mechanics at once.
- [ ] **The seed is fixed** — same seed → same level (so a "broken level" bug is reproducible).
- [ ] **It's not boring** — would YOU play level 8? If the mid-game is filler, add a twist mechanic.

State a one-line verdict ("self-check: levels 1-20 solvable, curve rises smooth w/ bosses at 5/10/15,
new mechanic each 3 levels, seeded"). If you can't confirm solvability, it's not done.

## Non-Negotiable Acceptance Criteria

- [ ] Levels are DATA-DRIVEN (config objects, not hardcoded in game loop)
- [ ] Difficulty scales gradually (no sudden spikes except bosses)
- [ ] New mechanics introduced one at a time (not all at once)
- [ ] Every 5th level = boss or special challenge
- [ ] Breather moments after difficulty spikes
- [ ] Levels are SOLVABLE (puzzle: reverse-solve, platformer: tested jumps)
- [ ] Rewards scale with difficulty (player feels progress)
- [ ] Generator is SEEDED (`Math.seedrandom`) for reproducible levels
- [ ] At least 3 enemy/obstacle types before level 10
- [ ] ⚠️ ZERO changes to SDK, localization, ads, debug systems
