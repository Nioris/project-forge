---
name: strategy-prototype
description: "Создаёт играбельные 2D-стратегии: пошаговая тактика, автобатлер, мини-RTS. Используй когда пользователь просит: стратегия, strategy, тактика, 'пошаговая', шахматы, 'управляй армией', автобатлер, auto chess, 'расставь юнитов'. Триггерится на: 'ход', 'юнит', 'армия', 'клетка', 'сетка', 'тактика', 'позиция'. Если геймплей про позиционирование юнитов и тактические решения — это стратегия."
---

# Strategy Prototype

Скил для пошаговых тактик и автобатлеров. Стратегия — жанр где кайф в ПЛАНЕ. Каждый ход должен быть значимым, каждый юнит — ценным.

## R1 40%

Прототип = сетка 8x8, 3-4 типа юнитов, 5 уровней/раундов, простой AI.

---

## Поджанры

| Поджанр | Ход | Механика | Пример |
|---------|-----|----------|--------|
| **Tactics** | Пошаговый, ходы юнитами | Движение + атака на сетке | Fire Emblem, Into the Breach |
| **Auto-battler** | Фаза расстановки → авто-бой | Ставь юнитов, они сами дерутся | Auto Chess, TFT |
| **Mini-RTS** | Реальное время | Строй, собирай, атакуй | Simplified StarCraft |

Если не указано — **tactics** самая прототипируемая.

---

## Core: Сетка и юниты

```javascript
const GRID = { cols: 8, rows: 8, cellSize: 56 };

const UNIT_TYPES = {
  warrior: { name: 'Warrior', hp: 10, atk: 3, def: 2, range: 1, move: 3, icon: 'W', color: '#c0392b' },
  archer:  { name: 'Archer',  hp: 6,  atk: 4, def: 1, range: 4, move: 2, icon: 'A', color: '#27ae60' },
  mage:    { name: 'Mage',    hp: 5,  atk: 5, def: 0, range: 3, move: 2, icon: 'M', color: '#8e44ad', splash: true },
  healer:  { name: 'Healer',  hp: 4,  atk: 1, def: 1, range: 2, move: 2, icon: 'H', color: '#f1c40f', heals: true },
};

class Unit {
  constructor(type, team, col, row) {
    this.type = type;
    this.stats = { ...UNIT_TYPES[type] };
    this.hp = this.stats.hp;
    this.team = team; // 0 = player, 1 = enemy
    this.col = col; this.row = row;
    this.moved = false; this.attacked = false;
  }

  getMovableCells(grid) {
    // BFS от текущей позиции, макс дистанция = this.stats.move
    // Пропускать клетки с юнитами
  }

  getAttackableCells() {
    // Все клетки в радиусе this.stats.range с вражескими юнитами
  }
}
```

### Пошаговый цикл

```
Player Phase:
  1. Выбери юнита (клик)
  2. Покажи доступные клетки движения (подсветка)
  3. Кликни куда двигать
  4. Покажи доступные цели атаки
  5. Кликни цель → расчёт урона → анимация
  6. Юнит отработал (серый)
  7. Повтори для остальных юнитов
  8. Кнопка "End Turn"

Enemy Phase:
  AI ходит автоматически (анимированно)
```

---

## AI (простой но эффективный)

```javascript
function aiTurn(enemies, playerUnits) {
  for (const unit of enemies) {
    // 1. Найти ближайшую цель
    let bestTarget = null, bestDist = Infinity;
    for (const target of playerUnits) {
      const dist = Math.abs(target.col - unit.col) + Math.abs(target.row - unit.row);
      if (dist < bestDist) { bestDist = dist; bestTarget = target; }
    }
    // 2. Двигаться к цели
    const moveCells = unit.getMovableCells();
    let bestMove = { col: unit.col, row: unit.row };
    let bestMoveDist = bestDist;
    for (const cell of moveCells) {
      const d = Math.abs(bestTarget.col - cell.col) + Math.abs(bestTarget.row - cell.row);
      if (d < bestMoveDist) { bestMoveDist = d; bestMove = cell; }
    }
    unit.col = bestMove.col; unit.row = bestMove.row;
    // 3. Атаковать если в радиусе
    if (bestMoveDist <= unit.stats.range) {
      applyDamage(unit, bestTarget);
    }
  }
}
```

---

## Визуальные стили

| Стиль | Сетка | Юниты | Когда |
|-------|-------|-------|-------|
| **Фэнтези** | Трава/камень | Рыцари, маги | По дефолту |
| **Sci-fi** | Металл/панели | Роботы, дроны | Для футуристичных |
| **Минималистичный** | Чистая сетка | Цветные круги с буквами | Для абстрактных |
| **Шахматный** | Чёрно-белый | Фигуры | Для chess-like |

## Спецэффекты

- Подсветка доступных клеток (полупрозрачный цвет)
- Анимация движения юнита (lerp, не телепорт)
- Анимация атаки (юнит "прыгает" к цели и обратно)
- Числа урона всплывают
- Смерть: юнит уменьшается → частицы
- Камера: при атаке — лёгкий zoom

## Звуки
```
select:    sine 500Hz, 0.03с
move:      sine 300→400Hz, 0.08с
attack:    noise 0.05с + sawtooth 400→150Hz
heal:      sine 600→900Hz, 0.15с (мажорный)
death:     noise 0.1с + sine 200→80Hz
turn_end:  sine 400→300Hz, 0.1с
```

## Чеклист

- [ ] Пошаговые ходы: выбор → движение → атака
- [ ] AI противник (не рандом, целенаправленный)
- [ ] 3+ типа юнитов с разными ролями
- [ ] Подсветка доступных действий
- [ ] Анимации движения и атаки (не мгновенно)
- [ ] Числа урона
- [ ] 5+ уровней с нарастанием
