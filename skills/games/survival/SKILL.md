---
name: survival-prototype
description: "Создаёт играбельные 2D-survival: крафт, выживание, ресурсы, день-ночь. Используй когда пользователь просит: survival, выживание, крафт, 'собирай ресурсы', 'строй базу', 'переживи ночь', Don't Starve подобное, Minecraft 2D. Триггерится на: 'выживание', 'крафт', 'ресурсы', 'голод', 'ночь', 'база', 'дерево рубить', 'камень добывать'. Если геймплей про сбор ресурсов, крафт и выживание — это survival."
---

# Survival Prototype

Скил для 2D-survival. Survival — жанр про ДАВЛЕНИЕ. Ресурсы кончаются, ночь наступает, здоровье падает. Каждое решение — компромисс.

## R1 40%

Прототип = открытое поле с ресурсами, 5-8 рецептов крафта, цикл день-ночь, голод, враги ночью.

---

## Core: Ресурсы + Крафт

```javascript
const RESOURCES = {
  wood: { name: 'Wood', icon: 'W', color: '#8B4513', sources: ['tree'] },
  stone: { name: 'Stone', icon: 'S', color: '#888', sources: ['rock'] },
  food: { name: 'Food', icon: 'F', color: '#FF6347', sources: ['bush', 'animal'] },
  iron: { name: 'Iron', icon: 'I', color: '#AAA', sources: ['iron_ore'] },
};

const RECIPES = [
  { id: 'campfire', name: 'Campfire', cost: { wood: 5 }, desc: 'Light & warmth' },
  { id: 'workbench', name: 'Workbench', cost: { wood: 8, stone: 4 }, desc: 'Unlocks tools' },
  { id: 'axe', name: 'Axe', cost: { wood: 3, stone: 2 }, desc: 'Faster wood', requires: 'workbench' },
  { id: 'pickaxe', name: 'Pickaxe', cost: { wood: 3, stone: 4 }, desc: 'Mine iron', requires: 'workbench' },
  { id: 'sword', name: 'Sword', cost: { wood: 2, iron: 3 }, desc: '+5 damage', requires: 'workbench' },
  { id: 'wall', name: 'Wall', cost: { wood: 4 }, desc: 'Block enemies' },
  { id: 'bed', name: 'Bed', cost: { wood: 6 }, desc: 'Skip night' },
  { id: 'armor', name: 'Armor', cost: { iron: 5 }, desc: '+3 defense', requires: 'workbench' },
];
```

### Цикл день/ночь

```javascript
const DAY_CYCLE = {
  dayLength: 3600,    // кадров (60 секунд)
  nightLength: 2400,  // кадров (40 секунд)
  currentTime: 0,
  day: 1,
  isNight: false,
};

function updateDayCycle() {
  DAY_CYCLE.currentTime++;
  const total = DAY_CYCLE.dayLength + DAY_CYCLE.nightLength;
  if (DAY_CYCLE.currentTime >= total) {
    DAY_CYCLE.currentTime = 0;
    DAY_CYCLE.day++;
  }
  DAY_CYCLE.isNight = DAY_CYCLE.currentTime >= DAY_CYCLE.dayLength;
}

// Визуал: overlay затемнения
function drawDayNight(ctx) {
  if (DAY_CYCLE.isNight) {
    const nightProgress = (DAY_CYCLE.currentTime - DAY_CYCLE.dayLength) / DAY_CYCLE.nightLength;
    const darkness = Math.min(0.7, nightProgress * 0.7);
    ctx.fillStyle = `rgba(0, 0, 30, ${darkness})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Круг света вокруг игрока / костра
    const grad = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 120);
    grad.addColorStop(0, 'rgba(0,0,30,0)');
    grad.addColorStop(1, `rgba(0,0,30,${darkness})`);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = grad;
    ctx.fillRect(player.x - 120, player.y - 120, 240, 240);
    ctx.globalCompositeOperation = 'source-over';
  }
}
```

### Голод / HP

```javascript
const NEEDS = {
  health: 100,
  hunger: 100,       // уменьшается со временем
  hungerRate: 0.01,  // за кадр
};
// hunger <= 0 → здоровье падает
// food восстанавливает hunger на 30
```

---

## Визуальные стили

| Стиль | Мир | Атмосфера |
|-------|-----|-----------|
| **Лесной** | Зелёный, деревья, кусты | Уютный днём, тёмный ночью |
| **Пустошь** | Серо-коричневый, руины | Мрачный, опасный |
| **Островной** | Песок, пальмы, вода | Тропический |
| **Зимний** | Снег, ёлки | Холод как механика |

## Спецэффекты
- Частицы при добыче (щепки от дерева, осколки от камня)
- Огонь костра (частицы + свечение)
- Ночь: limited visibility с кругом света
- Враги: красные глаза в темноте перед атакой
- Индикаторы голода/HP пульсируют при низких значениях

## Звуки
```
chop:     noise 0.04с + sine 300→150Hz (удар)
mine:     noise 0.06с + sine 400→200Hz (звонче)
craft:    sine 500→700→900Hz, 0.2с (успех)
eat:      sine 300→400Hz, 0.08с (мням)
night:    sine drone 60Hz, тихий (атмосфера)
monster:  sawtooth 100→50Hz, 0.2с (рык)
```

## Чеклист
- [ ] Сбор ресурсов с анимацией и частицами
- [ ] 5+ рецептов крафта
- [ ] Цикл день/ночь с визуальным затемнением
- [ ] Голод / HP система
- [ ] Враги ночью
- [ ] Строительство (стены, костёр)
- [ ] Ощущение давления (ресурсы кончаются, ночь близко)
