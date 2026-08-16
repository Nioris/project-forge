---
name: roguelike-prototype
description: "Создаёт играбельные 2D-рогалики: dungeon crawler, roguelite, пошаговые и real-time. Используй когда пользователь просит: рогалик, roguelike, roguelite, 'случайные подземелья', dungeon crawler, 'каждый забег уникальный', permadeath, 'генерация уровней', 'выбирай улучшения'. Триггерится на: 'подземелье', 'данжен', 'лут', 'прокачка за забег', 'случайные комнаты', 'перманентная смерть', Hades-подобное, Slay the Spire. Если игра про прохождение случайно-генерируемых уровней с permadeath и выбором улучшений — это рогалик."
---

# Roguelike Prototype

Скил для создания 2D-рогаликов. Рогалик — жанр, где кайф в уникальности каждого забега, выборах "что взять" и напряжённых боях где один неверный ход = смерть.

## R1 40%

Не делай систему из 100 предметов и 30 комнат. Прототип = процедурный этаж из 5-8 комнат, 3-4 типа врагов, 5-6 перков для выбора, 1 босс. Один удачный забег = 2-3 минуты.

---

## Два подхода — выбери один

| Подход | Движение | Бои | Темп | Прототипируемость |
|--------|----------|-----|------|-------------------|
| **Пошаговый (классика)** | По клеткам, 4/8 направлений | Ход за ход | Медленный, тактический | Проще генерация |
| **Real-time (roguelite)** | Свободное, WASD | Экшен в комнатах | Быстрый | Проще геймплей |

Если не указано — **real-time roguelite** (Hades/Enter the Gungeon стиль). Доступнее и эффектнее для прототипа.

---

## Core: Процедурная генерация подземелья

Простой алгоритм: граф комнат.

```javascript
function generateDungeon(numRooms) {
  const rooms = [];
  const connections = [];

  // Комната = прямоугольная арена
  const ROOM_W = 300, ROOM_H = 250;

  // 1. Расставь комнаты на сетке
  const grid = []; // 3x3 или 4x3 сетка позиций
  const positions = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      positions.push({ col: c, row: r });

  // Случайно выбери numRooms позиций
  shuffle(positions);
  const selected = positions.slice(0, numRooms);

  for (let i = 0; i < selected.length; i++) {
    rooms.push({
      id: i,
      col: selected[i].col,
      row: selected[i].row,
      type: i === 0 ? 'start' : i === selected.length - 1 ? 'boss' : randomRoomType(),
      enemies: [],
      cleared: false,
    });
  }

  // 2. Соедини соседние комнаты (Manhattan distance == 1)
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const dist = Math.abs(rooms[i].col - rooms[j].col) + Math.abs(rooms[i].row - rooms[j].row);
      if (dist === 1) connections.push([i, j]);
    }
  }

  return { rooms, connections };
}

function randomRoomType() {
  const roll = Math.random();
  if (roll < 0.5) return 'combat';   // враги
  if (roll < 0.75) return 'treasure'; // сундук с перком
  return 'shop';                      // магазин
}
```

**Мини-карта:** обязательно! Маленький вид всего подземелья в углу. Посещённые комнаты — цветные, непосещённые — серые контуры.

---

## Система перков / улучшений

Рогалик без выбора = скучный бег. После каждой боевой комнаты или из сундука — ВЫБОР из 2-3 перков:

```javascript
const PERK_POOL = [
  { id: 'dmgUp', name: 'Сила', desc: '+25% урона', icon: '⚔️',
    apply: (p) => p.damage *= 1.25 },
  { id: 'hpUp', name: 'Выносливость', desc: '+2 HP', icon: '❤️',
    apply: (p) => { p.maxHp += 2; p.hp += 2; } },
  { id: 'speedUp', name: 'Скорость', desc: '+20% скорости', icon: '💨',
    apply: (p) => p.speed *= 1.2 },
  { id: 'dash', name: 'Рывок', desc: 'Dash на пробел', icon: '⚡',
    apply: (p) => p.hasDash = true },
  { id: 'lifeSteal', name: 'Вампиризм', desc: 'Хил за убийство', icon: '🧛',
    apply: (p) => p.lifeSteal = 1 },
  { id: 'spread', name: 'Разброс', desc: 'Стреляешь 3 снарядами', icon: '🔱',
    apply: (p) => p.projectiles = 3 },
  { id: 'shield', name: 'Щит', desc: 'Блок 1 удара каждые 10с', icon: '🛡️',
    apply: (p) => p.shieldTimer = 600 },
  { id: 'thorns', name: 'Шипы', desc: 'Враги получают урон при атаке', icon: '🌵',
    apply: (p) => p.thorns = 2 },
];

function offerPerks(count = 3) {
  const available = shuffle([...PERK_POOL]);
  return available.slice(0, count);
}
```

**Экран выбора перка** — пауза, 2-3 карточки с иконкой, названием, описанием. Клик/кнопка для выбора. Это КЛЮЧЕВОЙ момент рогалика.

---

## Визуальные стили для рогалика

| Стиль | Пол/стены | Персонаж | Враги | Когда |
|-------|-----------|----------|-------|-------|
| **Пиксельный данжен** | Каменные тайлы серые/коричневые | 16x16 спрайт | Пиксельные монстры | Классика рогалика |
| **Тёмное фэнтези** | Тёмный камень + факелы (свет) | Маленький рыцарь | Тёмные тени | Для атмосферы |
| **Красочный** | Цветные полы по зонам | Яркий персонаж | Мультяшные монстры | Для лёгких roguelite |
| **Бумажный** | Бежевый с "нарисованными" стенами | Скетч | Нарисованные | Инди-стиль |
| **Sci-fi** | Металлические панели | Космонавт | Роботы/чужие | Для sci-fi |

По дефолту — **пиксельный данжен** или **красочный**, в зависимости от тона.

---

## Боевая система (real-time roguelite)

```javascript
const PLAYER = {
  x: 0, y: 0,
  hp: 5, maxHp: 5,
  damage: 1,
  speed: 3,
  attackCooldown: 0,
  attackRate: 15,       // кадров между атаками
  invincibleTimer: 0,   // после получения урона — мигание
};

// Атака = снаряд в направлении мыши или последнего движения
function playerAttack() {
  if (PLAYER.attackCooldown > 0) return;
  const angle = Math.atan2(mouse.y - PLAYER.y, mouse.x - PLAYER.x);
  playerBullets.push({
    x: PLAYER.x, y: PLAYER.y,
    vx: Math.cos(angle) * 6,
    vy: Math.sin(angle) * 6,
    damage: PLAYER.damage,
    life: 60,
  });
  PLAYER.attackCooldown = PLAYER.attackRate;
  playSound('attack');
}

// Получение урона — invincibility frames!
function playerHit(dmg) {
  if (PLAYER.invincibleTimer > 0) return;
  PLAYER.hp -= dmg;
  PLAYER.invincibleTimer = 45; // 0.75 секунд мигания
  screenShake = 6;
  playSound('hit');
  if (PLAYER.hp <= 0) gameOver();
}
```

**I-frames (неуязвимость после удара)** — обязательно. Без этого игра несправедливая. Персонаж мигает (рисуется через кадр) пока неуязвим.

---

## Спецэффекты рогалика

**Вход в комнату:** двери открываются, камера плавно переезжает
**Спавн врагов:** появляются из "порталов" (расширяющийся круг)
**Атака:** trail за снарядом, вспышка при попадании
**Смерть врага:** взрыв частиц + дроп (сердечко/монета) с подпрыгиванием
**Получение урона:** red flash на экране (полупрозрачный красный overlay на 3 кадра)
**Выбор перка:** карточки "влетают" снизу с задержкой (stagger animation)
**Смерть:** slow-mo на секунду, fade to red/black, экран статистики

---

## Звуки рогалика

```
attack:     square 500→200Hz, 0.06с (свист)
hit:        noise 0.04с + sine 300→100Hz
enemy_die:  noise 0.08с, gain 0.2
pickup:     sine 500→1000Hz, 0.1с
door_open:  sine 200→300Hz, 0.2с (скрип)
perk_select: sine chord C-E-G, 0.2с
boss_appear: noise 0.3с + square 80→40Hz (угрожающий)
player_die:  sine 400→100Hz, 0.5с, затухающий
```

---

## Управление

- **WASD** — движение
- **Мышь** — направление атаки + ЛКМ атака
- **Пробел** — dash/рывок (если есть перк)
- **E** — взаимодействие (сундук, магазин, дверь)
- **Tab** — мини-карта (полноэкранная)

---

## Твисты

1. **Проклятые предметы** — мощный бонус + дебафф. Риск/награда.
2. **Мутации** — каждый этаж меняет одно правило (враги быстрее, комнаты темнее)
3. **Компаньон** — подбираешь NPC, он помогает/мешает
4. **Карточная система** — вместо атаки — колода карт (Slay the Spire)
5. **Метаморфоза** — персонаж физически меняется от перков
6. **Dual resource** — HP = валюта. Тратишь жизнь на покупку перков.

---

## Чеклист

- [ ] Процедурная генерация (каждый забег разный)
- [ ] Выбор перков после боя (2-3 варианта)
- [ ] Permadeath + экран статистики
- [ ] I-frames при получении урона
- [ ] Мини-карта подземелья
- [ ] 3+ типа врагов с разным поведением
- [ ] Босс в конце
- [ ] Частицы, screen shake, вспышки при боях
- [ ] Забег = 2-3 минуты максимум
