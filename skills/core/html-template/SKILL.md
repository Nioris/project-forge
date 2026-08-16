---
name: html-template
description: "HTML5 game template: single file structure, Canvas setup, game loop, state machine, 3 screens. Load when creating any game.html file. Triggers on: game.html, template, scaffold, boilerplate."
---

# HTML5 Game Template

## Purpose
Standard structure for all single-file game prototypes.

## Template
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Game Name</title>
<style>
*{margin:0;padding:0}
canvas{display:block;touch-action:none;-webkit-touch-callout:none;user-select:none}
html,body{overflow:hidden;width:100%;height:100%;background:#000}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let audioCtx;

// --- STATE ---
let state = 'menu'; // menu | play | gameover
let score = 0;

// --- RESIZE ---
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

// --- INPUT ---
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('click', () => {
  if (!audioCtx) audioCtx = new AudioContext();
  if (state === 'menu') { state = 'play'; startGame(); }
  else if (state === 'gameover') { state = 'menu'; }
});

// --- GAME LOOP ---
let lastTime = 0;
function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

function update(dt) { /* per-state update */ }
function render() { ctx.clearRect(0, 0, canvas.width, canvas.height); /* per-state render */ }
function startGame() { score = 0; /* reset all state */ }

requestAnimationFrame(gameLoop);
</script>
</body>
</html>
```

## Non-Negotiable Acceptance Criteria
- [ ] Single self-contained HTML file
- [ ] Canvas with id, getContext('2d')
- [ ] requestAnimationFrame game loop with deltaTime
- [ ] clearRect or background fill before rendering
- [ ] State machine: menu → play → gameover → menu
- [ ] AudioContext created on first click only
- [ ] No localStorage (prototypes are stateless)
- [ ] All key/touch listeners with preventDefault for Space
