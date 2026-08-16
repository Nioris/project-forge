---
name: sandbox-prototype
description: "Создаёт играбельные 2D-sandbox игры: строительство, рисование, физические песочницы, террария-подобные. Используй когда пользователь просит: sandbox, песочница, 'строй что хочешь', 'рисуй', физическая симуляция, 'разрушай', Terraria, 'пиксельный мир', 'свободная игра'. Триггерится на: 'песочница', 'строить', 'разрушать', 'блоки', 'свобода', 'творчество', 'физика', 'симуляция частиц', 'порошковая игра'. Если геймплей про свободное творчество или физическую симуляцию — это sandbox."
---

# Sandbox Prototype

Скил для 2D-sandbox. Sandbox — жанр про СВОБОДУ. Нет правильного пути, нет проигрыша. Игрок сам создаёт, разрушает, экспериментирует.

## R1 40%

Прототип = мир из блоков/частиц, инструменты для создания и разрушения, 5-8 типов элементов, физика.

---

## Поджанры

| Тип | Механика | Пример |
|-----|----------|--------|
| **Block builder** | Ставь/ломай блоки в сетке | Terraria, Minecraft 2D |
| **Powder sandbox** | Частицы: песок, вода, огонь | Powder Toy, Sandspiel |
| **Physics sandbox** | Объекты с физикой | Bridge Builder |
| **Drawing** | Рисуй и оно оживает | Line Rider |

Если не указано — **powder sandbox** самый эффектный для прототипа.

---

## Core: Powder / Particle Sandbox

```javascript
// Сетка частиц
const WORLD_W = 200, WORLD_H = 150;
const CELL_SIZE = 4; // маленькие клетки = больше деталей
const grid = new Uint8Array(WORLD_W * WORLD_H); // 0 = пусто, 1-N = тип

const ELEMENTS = {
  0: { name: 'Empty', color: '#000' },
  1: { name: 'Sand', color: '#e8c170', gravity: true, density: 3 },
  2: { name: 'Water', color: '#4a9be8', gravity: true, density: 1, liquid: true },
  3: { name: 'Stone', color: '#888', gravity: false },
  4: { name: 'Fire', color: '#ff4500', gravity: false, rises: true, life: 30, spreads: true },
  5: { name: 'Wood', color: '#8B4513', gravity: false, flammable: true },
  6: { name: 'Smoke', color: '#666', gravity: false, rises: true, life: 60 },
  7: { name: 'Lava', color: '#ff3300', gravity: true, density: 4, liquid: true, hot: true },
  8: { name: 'Ice', color: '#aaddff', gravity: false, meltable: true },
};

function getCell(x, y) {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return -1;
  return grid[y * WORLD_W + x];
}
function setCell(x, y, type) {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return;
  grid[y * WORLD_W + x] = type;
}

// Симуляция — обновить каждую клетку снизу вверх
function simulate() {
  for (let y = WORLD_H - 2; y >= 0; y--) {
    for (let x = 0; x < WORLD_W; x++) {
      const type = getCell(x, y);
      if (type === 0) continue;
      const elem = ELEMENTS[type];

      // Гравитация (песок, вода, лава)
      if (elem.gravity) {
        const below = getCell(x, y + 1);
        if (below === 0) {
          setCell(x, y, 0);
          setCell(x, y + 1, type);
        } else if (elem.liquid) {
          // Жидкость растекается
          const dir = Math.random() < 0.5 ? -1 : 1;
          if (getCell(x + dir, y) === 0) {
            setCell(x, y, 0);
            setCell(x + dir, y, type);
          } else if (getCell(x - dir, y) === 0) {
            setCell(x, y, 0);
            setCell(x - dir, y, type);
          }
        } else {
          // Песок сыпется вбок
          const dir = Math.random() < 0.5 ? -1 : 1;
          if (getCell(x + dir, y + 1) === 0) {
            setCell(x, y, 0);
            setCell(x + dir, y + 1, type);
          }
        }
      }

      // Огонь: горит, поджигает дерево, создаёт дым
      if (type === 4) { // Fire
        elem._life = (elem._life || 30) - 1;
        if (elem._life <= 0) { setCell(x, y, 0); continue; }
        // Поджечь соседей
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const neighbor = getCell(x+dx, y+dy);
          if (neighbor > 0 && ELEMENTS[neighbor].flammable && Math.random() < 0.05) {
            setCell(x+dx, y+dy, 4); // → огонь
          }
        }
        // Дым вверх
        if (Math.random() < 0.1 && getCell(x, y-1) === 0) {
          setCell(x, y-1, 6); // дым
        }
      }

      // Дым / пар поднимается
      if (elem.rises) {
        if (getCell(x, y-1) === 0) {
          setCell(x, y, 0);
          setCell(x, y-1, type);
        }
      }

      // Лава + Вода = Камень
      if (elem.hot) {
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          if (getCell(x+dx, y+dy) === 2) { // вода
            setCell(x+dx, y+dy, 3); // → камень
            setCell(x, y, 3);
          }
        }
      }
    }
  }
}
```

### Рисование мира (быстрый способ)

```javascript
// ImageData — самый быстрый способ для pixel-сетки
function render() {
  const imageData = ctx.createImageData(WORLD_W, WORLD_H);
  const data = imageData.data;
  for (let i = 0; i < grid.length; i++) {
    const type = grid[i];
    const color = hexToRgb(ELEMENTS[type].color);
    // Добавить вариацию цвета для естественности
    const variation = (Math.random() * 10 - 5) | 0;
    data[i * 4 + 0] = color.r + variation;
    data[i * 4 + 1] = color.g + variation;
    data[i * 4 + 2] = color.b + variation;
    data[i * 4 + 3] = type === 0 ? 0 : 255;
  }
  // Масштабировать на весь canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = WORLD_W;
  tempCanvas.height = WORLD_H;
  tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = false; // пиксельный вид
  ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
}
```

---

## Core: Block Builder

```javascript
const BLOCK_SIZE = 16;
const BLOCKS = {
  dirt: { color: '#8B6F47', hardness: 1 },
  stone: { color: '#888', hardness: 3 },
  wood: { color: '#6B4226', hardness: 2 },
  glass: { color: 'rgba(150,200,255,0.4)', hardness: 1 },
  brick: { color: '#b55239', hardness: 4 },
  leaf: { color: '#228B22', hardness: 0.5 },
};

// Ставить блок — ПКМ или тап
// Ломать блок — ЛКМ (с прогрессом: удерживай для твёрдых блоков)
let breakProgress = 0;
function breakBlock(col, row) {
  const block = world[row][col];
  if (!block) return;
  breakProgress += 1 / (BLOCKS[block].hardness * 10);
  if (breakProgress >= 1) {
    world[row][col] = null;
    breakProgress = 0;
    spawnBlockParticles(col, row, BLOCKS[block].color);
    playSound('break');
  }
}
```

---

## UI: Палитра инструментов

```javascript
// Панель внизу экрана с элементами
function drawToolbar(ctx) {
  const tools = Object.entries(ELEMENTS).filter(([id]) => id > 0);
  const toolW = 40, toolH = 40, pad = 4;
  const startX = (canvas.width - tools.length * (toolW + pad)) / 2;
  const y = canvas.height - toolH - 10;

  for (let i = 0; i < tools.length; i++) {
    const [id, elem] = tools[i];
    const x = startX + i * (toolW + pad);
    const isSelected = selectedTool === parseInt(id);

    // Фон
    ctx.fillStyle = isSelected ? '#fff' : '#333';
    roundRect(ctx, x, y, toolW, toolH, 6, true);
    // Цвет элемента
    ctx.fillStyle = elem.color;
    ctx.fillRect(x + 6, y + 6, toolW - 12, toolH - 12);
    // Имя
    ctx.fillStyle = '#fff';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(elem.name, x + toolW / 2, y + toolH + 10);
  }
}
```

---

## Визуальные стили

| Стиль | Когда |
|-------|-------|
| **Пиксельный** | Block builder (Terraria стиль) |
| **Fluid/smooth** | Powder sandbox (частицы текут) |
| **Минималистичный** | Physics sandbox (чистые линии) |
| **Яркий мультяшный** | Drawing sandbox |

## Звуки
```
place:      sine 400→500Hz, 0.05с
break:      noise 0.06с + sine 300→100Hz
splash:     noise lowpass 0.1с (вода)
fire:       noise bandpass 0.05с (огонь)
select:     sine 600Hz, 0.03с
```

## Управление
- **ЛКМ** — рисовать/ставить текущий элемент
- **ПКМ** — стирать
- **1-9** — выбор элемента
- **Колёсико** — размер кисти
- **Мобилка** — тап = рисовать, панель внизу = выбор

## Чеклист
- [ ] 5+ типов элементов с разным поведением
- [ ] Физика (гравитация, жидкости, газы)
- [ ] Взаимодействие элементов (огонь + дерево, лава + вода)
- [ ] Инструменты (рисовать, стирать, размер кисти)
- [ ] Палитра элементов внизу
- [ ] 60 FPS при заполненном мире (оптимизация рендера)
- [ ] Приятно просто наблюдать (медитативный эффект)
