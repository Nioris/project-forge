---
name: tower-defense-prototype
description: "Создаёт играбельные 2D Tower Defense игры: классические TD, lane defense, open-field TD. Используй когда пользователь просит: tower defense, TD, 'расставь башни', 'защити базу', 'волны врагов идут по дороге', 'стратегия с башнями', defense game. Триггерится на: 'башни', 'оборона', 'волны', 'враги по пути', 'апгрейд башен', 'растения против зомби'. Если игра про размещение защитных структур против волн врагов — это TD."
---

# Tower Defense Prototype

Скил для создания 2D Tower Defense. TD — жанр, где кайф в стратегическом планировании + наблюдении за результатом. Игрок расставляет, враги идут, всё работает (или не работает) как часы.

## R1 40%

Не делай 15 типов башен и дерево апгрейдов. Прототип = 3-4 башни, 1 путь, волны с нарастанием, визуально сочная стрельба башен.

---

## Core: Путь и навигация врагов

Враги идут по предопределённому пути. Простейший способ:

```javascript
// Путь = массив точек
const PATH = [
  { x: 0, y: 200 },
  { x: 200, y: 200 },
  { x: 200, y: 350 },
  { x: 500, y: 350 },
  { x: 500, y: 150 },
  { x: 700, y: 150 },
  { x: 700, y: 400 }, // конец — база игрока
];

class Enemy {
  constructor(type) {
    this.pathIndex = 0;
    this.x = PATH[0].x;
    this.y = PATH[0].y;
    this.speed = type.speed;
    this.hp = type.hp;
    this.maxHp = type.hp;
    this.color = type.color;
    this.radius = type.radius;
    this.reward = type.reward;
  }
  update() {
    const target = PATH[this.pathIndex + 1];
    if (!target) { /* дошёл до базы — урон игроку */ return; }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < this.speed) {
      this.pathIndex++;
    } else {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
    }
  }
}
```

**Рисование пути:** путь должен быть чётко виден — широкая дорога/тропа, отличающаяся от зоны размещения башен.

---

## Система башен

```javascript
const TOWER_TYPES = {
  archer: {
    name: 'Лучник',
    cost: 50,
    range: 120,
    damage: 1,
    fireRate: 30, // кадров между выстрелами
    color: '#4a7c59',
    projectile: 'arrow', // быстрый прямой снаряд
  },
  mage: {
    name: 'Маг',
    cost: 100,
    range: 100,
    damage: 2,
    fireRate: 60,
    color: '#6b5b95',
    projectile: 'magic', // медленный, с AoE
    splashRadius: 40,
  },
  frost: {
    name: 'Мороз',
    cost: 75,
    range: 90,
    damage: 0.5,
    fireRate: 20,
    color: '#5b9bd5',
    projectile: 'frost', // замедляет врагов
    slowFactor: 0.5,
    slowDuration: 90,
  },
  cannon: {
    name: 'Пушка',
    cost: 150,
    range: 80,
    damage: 5,
    fireRate: 90,
    color: '#c0392b',
    projectile: 'bomb', // медленный, большой AoE
    splashRadius: 60,
  },
};
```

**Логика стрельбы башни:**
```javascript
class Tower {
  constructor(col, row, type) {
    this.col = col;
    this.row = row;
    this.x = col * CELL + CELL / 2;
    this.y = row * CELL + CELL / 2;
    this.type = TOWER_TYPES[type];
    this.cooldown = 0;
    this.target = null;
    this.angle = 0; // для поворота к цели
  }
  findTarget(enemies) {
    let closest = null, minDist = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.type.range && d < minDist) {
        closest = e; minDist = d;
      }
    }
    // Альтернатива: "first" (самый далёкий по пути), "strongest", "weakest"
    this.target = closest;
  }
  update(enemies, projectiles) {
    this.findTarget(enemies);
    if (this.cooldown > 0) this.cooldown--;
    if (this.target && this.cooldown <= 0) {
      this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      projectiles.push(new Projectile(this.x, this.y, this.target, this.type));
      this.cooldown = this.type.fireRate;
    }
  }
}
```

---

## Визуальные стили для TD

| Стиль | Фон / земля | Путь | Башни | Враги |
|-------|-------------|------|-------|-------|
| **Фэнтези / природа** | Зелёная трава `#4a7c3f` | Коричневая дорога `#8B7355` | Каменные с флагами | Гоблины, скелеты |
| **Средневековье** | Земля/камень | Мощёная дорога | Деревянные / каменные | Рыцари, осадные |
| **Sci-fi** | Серый металл | Светящиеся рельсы | Турели с индикаторами | Роботы, дроны |
| **Пиксельный** | Тайловая карта | Пиксельная тропа | 8-bit башенки | 8-bit монстры |
| **Садовый** | Земля + грядки | Тропинка | Растения (PvZ стиль) | Жуки, кроты |

По дефолту — **фэнтези/природа**. Самый читаемый и привычный для TD.

---

## Рисование башни (программно)

```javascript
function drawTower(ctx, tower, time) {
  const { x, y, type, angle } = tower;

  // Основание
  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ствол/направление — поворачивается к цели
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#555';
  ctx.fillRect(0, -3, 18, 6); // ствол
  ctx.restore();

  // Радиус — при наведении
  if (tower.showRange) {
    ctx.strokeStyle = `${type.color}44`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, type.range, 0, Math.PI * 2);
    ctx.stroke();
  }
}
```

---

## HP-бар врага (обязательно!)

```javascript
function drawHealthBar(ctx, enemy) {
  const barWidth = enemy.radius * 2;
  const barHeight = 4;
  const x = enemy.x - barWidth / 2;
  const y = enemy.y - enemy.radius - 8;
  const ratio = enemy.hp / enemy.maxHp;

  // Фон
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, barWidth, barHeight);
  // Здоровье
  ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#f44336';
  ctx.fillRect(x, y, barWidth * ratio, barHeight);
}
```

---

## Спецэффекты TD

**Выстрел башни:**
- Снаряд летит к цели (не телепортация!)
- Маленькая вспышка у дула
- Звук зависит от типа (arrow = тихий свист, cannon = бух)

**Попадание:**
- Частицы 5-8 штук цвета врага
- Число урона всплывает "-3" и исчезает
- Враг мигает белым на 1 кадр

**Смерть врага:**
- Взрыв частиц (15-20)
- "+金" — монетки подбираются
- Screen shake при массовом AoE

**AoE (area of effect):**
- Круг взрыва расширяется и исчезает за 10 кадров
- Все враги в радиусе мигают

**Размещение башни:**
- "Строительные" частицы при размещении
- Звук "установка" (низкий thud)

---

## Экономика

```javascript
let gold = 200; // стартовое золото
// За убийство врага: gold += enemy.reward
// Стоимость башен: растёт для баланса
// Продажа: возврат 50% стоимости

// HUD: показывай золото, волну, HP базы
```

---

## Звуки TD

```
arrow:      noise 0.02с + sine 800→400Hz, gain 0.1 (тихий, частый)
magic:      sine 600→300Hz с вибрато, 0.15с
cannon:     noise burst 0.15с + sine 100→40Hz, gain 0.3
frost:      sine 1200→600Hz, 0.1с, gain 0.1 (высокий "пинг")
place:      sine 200→100Hz, 0.1с (thud)
sell:       sine chord нисходящий
enemy_die:  noise 0.05с, gain 0.15
wave_start: sine sweep 300→600→900Hz, 0.4с
base_hit:   square 100→50Hz, 0.2с (тревожный)
```

---

## Управление

- **Мышь** — основное! Клик на тип башни → клик на клетку для размещения
- **Hover** — показывать радиус будущей/текущей башни
- **Правый клик / кнопка** — продать башню
- **Пробел** — запустить волну досрочно (за бонус)
- **1-4** — горячие клавиши выбора башни

---

## Твисты

1. **Башни растут** — маленькая → средняя → большая со временем, не за деньги
2. **Строй путь сам** — враги идут кратчайшим путём, ты ставишь стены чтобы удлинить
3. **Ротация** — башни стреляют только в одном направлении, надо вращать
4. **Мобильные башни** — можно двигать после размещения
5. **Комбо-эффекты** — две башни рядом = бонус (мороз + огонь = пар)
6. **Ресурс = враги** — убитые враги дают детали для новых башен

---

## Чеклист

- [ ] Враги плавно идут по пути
- [ ] Башни стреляют снарядами (не мгновенный урон)
- [ ] HP-бары у врагов
- [ ] 3-4 типа башен с разной ролью
- [ ] Волны с нарастанием (больше врагов, новые типы)
- [ ] Экономика (золото, стоимость, награда)
- [ ] Визуальный feedback: вспышки, частицы, числа урона
- [ ] UI: выбор башни, золото, волна, HP базы
- [ ] 60 FPS при 30+ врагах и 10+ башнях
