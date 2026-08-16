---
name: deepgame-systems
description: "Системы для создания сложных глубоких игр: RPG, deckbuilder, metroidvania, survival, strategy, sim. Используй когда создаёшь игру с несколькими взаимосвязанными системами: инвентарь, крафт, боевая система, диалоги, квесты, навыки, экономика, карта мира. Триггерится на: /deepgame, RPG, инвентарь, навыки, квесты, диалоги, крафт, дерево навыков, бестиарий, лут-таблицы, баланс формулы, экономика игры, deckbuilder, metroidvania, survival, стратегия, симулятор. Если игра сложнее чем один html прототип — используй этот скил."
---

# Deep Game Systems

Скил для создания сложных многосистемных игр. Содержит готовые реализации ключевых систем которые можно комбинировать.

## Когда использовать

Этот скил — ДОПОЛНЕНИЕ к жанровым скилам. Прочитай ОБЕРБА:
1. Жанровый скил из `skills/{genre}-prototype/SKILL.md` — для core-механики
2. ЭТОТ скил — для систем глубины (инвентарь, квесты, навыки и т.д.)

---

## Архитектура: Config-Driven Design

ВСЕ данные игры живут в `config.js`. Код читает данные из конфига. Менять баланс = менять ТОЛЬКО config.js.

```javascript
// config.js — ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ
const CONFIG = {
  player: {
    baseHP: 20, baseMana: 10, baseAtk: 3, baseDef: 1,
    hpPerLevel: 5, manaPerLevel: 3, atkPerLevel: 1,
    baseSpeed: 3, xpToLevel: (lvl) => Math.floor(50 * Math.pow(1.4, lvl - 1)),
  },
  enemies: { /* см. систему врагов */ },
  items: { /* см. систему предметов */ },
  skills: { /* см. систему навыков */ },
  zones: { /* см. систему мира */ },
  quests: { /* см. систему квестов */ },
  balance: {
    goldPerEnemy: (enemy) => enemy.level * 5 + 3,
    xpPerEnemy: (enemy) => enemy.level * 10,
    shopMarkup: 1.5,     // магазин продаёт за x1.5
    sellRatio: 0.3,       // продаёшь за x0.3 от стоимости
    healCostPerHP: 2,
  },
};
```

---

## СИСТЕМА 1: Боевая система (Combat)

### 1a. Пошаговый бой (RPG / Deckbuilder)

```javascript
// combat.js
class Combat {
  constructor(player, enemies) {
    this.player = player;
    this.enemies = [...enemies];
    this.turnOrder = [];
    this.currentTurn = 0;
    this.log = [];
    this.state = 'player_turn'; // player_turn, enemy_turn, victory, defeat
  }

  calculateDamage(attacker, defender, skill = null) {
    const baseDmg = skill ? skill.damage : attacker.stats.atk;
    const defense = defender.stats.def;
    // Формула: урон * (100 / (100 + защита)) + рандом ±15%
    const reduction = 100 / (100 + defense);
    const variance = 0.85 + Math.random() * 0.3;
    const dmg = Math.max(1, Math.floor(baseDmg * reduction * variance));

    // Крит: шанс = attacker.critChance (0-1), множитель = 1.5-2x
    const isCrit = Math.random() < (attacker.stats.critChance || 0.05);
    return {
      damage: isCrit ? Math.floor(dmg * 1.8) : dmg,
      isCrit,
      element: skill?.element || 'physical',
    };
  }

  applyDamage(target, result) {
    // Элементальные слабости
    const weakness = CONFIG.elements?.[target.element]?.weakTo;
    if (weakness === result.element) result.damage = Math.floor(result.damage * 1.5);

    target.hp -= result.damage;
    target.hp = Math.max(0, target.hp);

    // Визуальный feedback
    target.flashTimer = 6;
    target.damageNumbers.push({
      value: result.damage,
      isCrit: result.isCrit,
      x: target.x, y: target.y - 20,
      life: 1.0,
    });

    return target.hp <= 0;
  }

  getRewards() {
    let gold = 0, xp = 0, drops = [];
    for (const enemy of this.enemies) {
      gold += CONFIG.balance.goldPerEnemy(enemy);
      xp += CONFIG.balance.xpPerEnemy(enemy);
      // Лут-таблица
      for (const drop of enemy.lootTable || []) {
        if (Math.random() < drop.chance) {
          drops.push(drop.itemId);
        }
      }
    }
    return { gold, xp, drops };
  }
}
```

### 1b. Real-time бой (Action RPG / Metroidvania)

```javascript
// В player.js — атака с хитбоксами
attack(direction) {
  if (this.attackCooldown > 0) return;
  this.attackCooldown = this.stats.attackSpeed;
  this.state = 'attacking';
  this.stateTimer = 0;

  // Хитбокс атаки
  this.attackHitbox = {
    x: this.x + direction.x * 30,
    y: this.y + direction.y * 30,
    w: 40, h: 40,
    damage: this.stats.atk,
    active: false, // станет true на кадрах 4-8
    startFrame: 4,
    endFrame: 8,
    totalFrames: 15,
  };
}

// В game loop
updateCombat(player, enemies) {
  const hb = player.attackHitbox;
  if (hb && player.stateTimer >= hb.startFrame && player.stateTimer <= hb.endFrame) {
    hb.active = true;
    for (const enemy of enemies) {
      if (!enemy.hitThisSwing && rectOverlap(hb, enemy)) {
        const result = calculateDamage(player, enemy);
        applyDamage(enemy, result);
        enemy.hitThisSwing = true; // не бить дважды одним ударом
        // HIT STOP — 3 кадра заморозки
        hitStopFrames = 3;
        screenShake(4);
        spawnHitParticles(enemy.x, enemy.y);
        playSound('hit');
      }
    }
  }
}
```

---

## СИСТЕМА 2: Инвентарь (Inventory)

```javascript
// inventory-sys.js
class Inventory {
  constructor(maxSlots = 20) {
    this.slots = new Array(maxSlots).fill(null);
    this.maxSlots = maxSlots;
    this.equipment = {
      weapon: null,
      armor: null,
      accessory: null,
    };
  }

  addItem(itemId, quantity = 1) {
    const itemDef = CONFIG.items[itemId];
    if (!itemDef) return false;

    // Стакающийся предмет? Найди существующий стак
    if (itemDef.stackable) {
      const existing = this.slots.find(s => s && s.id === itemId);
      if (existing) {
        existing.quantity += quantity;
        return true;
      }
    }

    // Новый слот
    const emptyIndex = this.slots.findIndex(s => s === null);
    if (emptyIndex === -1) return false; // инвентарь полон

    this.slots[emptyIndex] = { id: itemId, quantity, ...itemDef };
    return true;
  }

  removeItem(slotIndex, quantity = 1) {
    const slot = this.slots[slotIndex];
    if (!slot) return false;
    slot.quantity -= quantity;
    if (slot.quantity <= 0) this.slots[slotIndex] = null;
    return true;
  }

  equip(slotIndex) {
    const item = this.slots[slotIndex];
    if (!item || !item.equipSlot) return false;

    // Снять текущее
    const current = this.equipment[item.equipSlot];
    if (current) this.addItem(current.id);

    // Надеть новое
    this.equipment[item.equipSlot] = { ...item };
    this.slots[slotIndex] = null;
    return true;
  }

  getStats() {
    // Суммировать бонусы от экипировки
    const bonuses = { atk: 0, def: 0, hp: 0, mana: 0, speed: 0, critChance: 0 };
    for (const slot of Object.values(this.equipment)) {
      if (slot?.bonuses) {
        for (const [stat, val] of Object.entries(slot.bonuses)) {
          bonuses[stat] = (bonuses[stat] || 0) + val;
        }
      }
    }
    return bonuses;
  }
}
```

**Данные предметов в config.js:**
```javascript
items: {
  wooden_sword: {
    name: 'Wooden Sword', type: 'weapon', equipSlot: 'weapon',
    bonuses: { atk: 3 }, value: 30, rarity: 'common',
    desc: 'A basic sword.',
  },
  iron_armor: {
    name: 'Iron Armor', type: 'armor', equipSlot: 'armor',
    bonuses: { def: 5, speed: -0.5 }, value: 120, rarity: 'uncommon',
    desc: 'Sturdy but heavy.',
  },
  health_potion: {
    name: 'Health Potion', type: 'consumable', stackable: true,
    effect: { type: 'heal', value: 20 }, value: 15, rarity: 'common',
    desc: 'Restores 20 HP.',
  },
  fire_ring: {
    name: 'Ring of Flames', type: 'accessory', equipSlot: 'accessory',
    bonuses: { atk: 2, critChance: 0.1 }, value: 250, rarity: 'rare',
    desc: '+2 ATK, +10% crit chance.',
  },
},
```

### UI Инвентаря (Canvas)

```javascript
function drawInventory(ctx, inventory, selectedSlot) {
  const COLS = 5, CELL = 52, PAD = 4;
  const startX = (canvas.width - COLS * CELL) / 2;
  const startY = 100;

  // Фон панели
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  roundRect(ctx, startX - 20, startY - 60, COLS * CELL + 40, 400, 12);

  // Заголовок
  ctx.fillStyle = '#ddd';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('INVENTORY', startX, startY - 30);

  // Слоты
  for (let i = 0; i < inventory.maxSlots; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = startX + col * CELL, y = startY + row * CELL;

    // Фон слота
    ctx.fillStyle = i === selectedSlot ? '#555' : '#2a2a2a';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, CELL - PAD, CELL - PAD, 4, true, true);

    const item = inventory.slots[i];
    if (item) {
      // Иконка (цветной квадрат по rarity)
      const rarityColors = { common: '#aaa', uncommon: '#4CAF50', rare: '#2196F3', epic: '#9C27B0', legendary: '#FF9800' };
      ctx.fillStyle = rarityColors[item.rarity] || '#aaa';
      ctx.fillRect(x + 6, y + 6, CELL - PAD - 12, CELL - PAD - 12);

      // Первая буква
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.name[0], x + CELL/2 - 2, y + CELL/2 + 2);

      // Количество
      if (item.quantity > 1) {
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(item.quantity, x + CELL - PAD - 4, y + CELL - PAD - 4);
      }
    }
  }

  // Описание выбранного предмета
  const selected = inventory.slots[selectedSlot];
  if (selected) {
    const descY = startY + Math.ceil(inventory.maxSlots / COLS) * CELL + 20;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(selected.name, startX, descY);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText(selected.desc, startX, descY + 18);
    if (selected.bonuses) {
      const bonusText = Object.entries(selected.bonuses)
        .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k.toUpperCase()}`)
        .join('  ');
      ctx.fillStyle = '#8f8';
      ctx.fillText(bonusText, startX, descY + 34);
    }
  }
}
```

---

## СИСТЕМА 3: Навыки / Дерево навыков (Skill Tree)

```javascript
// progression.js
const SKILL_TREE = {
  // Ветка воина
  power_strike: { name: 'Power Strike', desc: '+50% damage', branch: 'warrior',
    requires: [], cost: 1, effect: (p) => p.stats.atkMultiplier += 0.5 },
  shield_bash: { name: 'Shield Bash', desc: 'Stun 2 turns', branch: 'warrior',
    requires: ['power_strike'], cost: 2, effect: (p) => p.abilities.push('shield_bash') },
  berserker: { name: 'Berserker', desc: '+30% ATK when HP < 30%', branch: 'warrior',
    requires: ['power_strike'], cost: 2, effect: (p) => p.passives.push('berserker') },

  // Ветка мага
  fireball: { name: 'Fireball', desc: 'AoE fire damage', branch: 'mage',
    requires: [], cost: 1, effect: (p) => p.abilities.push('fireball') },
  mana_pool: { name: 'Mana Pool', desc: '+20 max mana', branch: 'mage',
    requires: ['fireball'], cost: 1, effect: (p) => p.stats.maxMana += 20 },
  chain_lightning: { name: 'Chain Lightning', desc: 'Hits 3 enemies', branch: 'mage',
    requires: ['fireball', 'mana_pool'], cost: 3, effect: (p) => p.abilities.push('chain_lightning') },

  // Ветка рейнджера
  double_shot: { name: 'Double Shot', desc: '2 projectiles', branch: 'ranger',
    requires: [], cost: 1, effect: (p) => p.stats.projectiles += 1 },
  poison_arrow: { name: 'Poison Arrow', desc: 'DoT 3 turns', branch: 'ranger',
    requires: ['double_shot'], cost: 2, effect: (p) => p.abilities.push('poison_arrow') },
  evasion: { name: 'Evasion', desc: '15% dodge chance', branch: 'ranger',
    requires: [], cost: 1, effect: (p) => p.stats.dodgeChance += 0.15 },
};

class SkillManager {
  constructor() {
    this.unlockedSkills = new Set();
    this.skillPoints = 0;
  }

  canUnlock(skillId) {
    const skill = SKILL_TREE[skillId];
    if (!skill) return false;
    if (this.unlockedSkills.has(skillId)) return false;
    if (this.skillPoints < skill.cost) return false;
    return skill.requires.every(req => this.unlockedSkills.has(req));
  }

  unlock(skillId, player) {
    if (!this.canUnlock(skillId)) return false;
    const skill = SKILL_TREE[skillId];
    this.skillPoints -= skill.cost;
    this.unlockedSkills.add(skillId);
    skill.effect(player);
    return true;
  }
}
```

---

## СИСТЕМА 4: Квесты (Quests)

```javascript
// quest.js
const QUEST_TYPES = {
  kill: (progress, target) => progress.kills >= target.count,
  collect: (progress, target) => progress.collected >= target.count,
  reach: (progress, target) => progress.reachedZone === target.zone,
  talk: (progress, target) => progress.talkedTo === target.npcId,
  boss: (progress, target) => progress.bossKilled === target.bossId,
};

class QuestSystem {
  constructor() {
    this.active = [];   // текущие квесты
    this.completed = []; // завершённые
  }

  activate(questId) {
    const def = CONFIG.quests[questId];
    if (!def || this.active.find(q => q.id === questId)) return;
    this.active.push({
      id: questId, ...def,
      progress: { kills: 0, collected: 0, reachedZone: null, talkedTo: null, bossKilled: null },
    });
  }

  update(event) {
    // event: { type: 'kill', enemyType: 'skeleton' }
    for (const quest of this.active) {
      if (quest.objective.type === event.type) {
        if (event.type === 'kill') quest.progress.kills++;
        if (event.type === 'collect') quest.progress.collected++;
        if (event.type === 'reach') quest.progress.reachedZone = event.zone;
        if (event.type === 'talk') quest.progress.talkedTo = event.npcId;
        if (event.type === 'boss') quest.progress.bossKilled = event.bossId;
      }
    }

    // Проверить завершение
    const done = this.active.filter(q => {
      const checker = QUEST_TYPES[q.objective.type];
      return checker && checker(q.progress, q.objective);
    });

    for (const q of done) {
      this.active = this.active.filter(a => a.id !== q.id);
      this.completed.push(q.id);
      return { completed: q }; // для UI попапа
    }
    return null;
  }
}
```

**Данные квестов в config.js:**
```javascript
quests: {
  first_blood: {
    name: 'First Blood', desc: 'Defeat 3 slimes',
    objective: { type: 'kill', enemyType: 'slime', count: 3 },
    reward: { gold: 50, xp: 30, item: 'health_potion' },
    nextQuest: 'dungeon_entrance',
  },
  dungeon_entrance: {
    name: 'Into the Dark', desc: 'Reach the Dungeon',
    objective: { type: 'reach', zone: 'dungeon' },
    reward: { gold: 100, xp: 50 },
    nextQuest: 'kill_boss_1',
  },
  kill_boss_1: {
    name: 'The Guardian', desc: 'Defeat the Dungeon Guardian',
    objective: { type: 'boss', bossId: 'guardian' },
    reward: { gold: 300, xp: 200, item: 'guardian_sword' },
  },
},
```

---

## СИСТЕМА 5: Диалоги (Dialogue)

```javascript
// dialogue.js
class DialogueSystem {
  constructor() {
    this.active = null;
    this.currentNode = null;
  }

  start(dialogueId) {
    this.active = CONFIG.dialogues[dialogueId];
    this.currentNode = this.active.start;
  }

  getCurrentNode() {
    return this.active.nodes[this.currentNode];
  }

  choose(choiceIndex) {
    const node = this.getCurrentNode();
    if (node.choices) {
      const choice = node.choices[choiceIndex];
      if (choice.action) choice.action(); // побочный эффект
      this.currentNode = choice.next;
    } else if (node.next) {
      this.currentNode = node.next;
    } else {
      this.active = null; // конец диалога
    }
    return this.active ? this.getCurrentNode() : null;
  }
}
```

**Данные диалогов:**
```javascript
dialogues: {
  merchant: {
    start: 'greeting',
    nodes: {
      greeting: {
        speaker: 'Merchant', portrait: 'merchant',
        text: 'Welcome, traveler! Looking to trade?',
        choices: [
          { text: 'Show me your wares', next: 'shop', action: () => openShop() },
          { text: 'Any quests?', next: 'quest_offer' },
          { text: 'Goodbye', next: null },
        ],
      },
      quest_offer: {
        speaker: 'Merchant', portrait: 'merchant',
        text: 'Rats in my cellar. Clear them and I\'ll pay 100 gold.',
        choices: [
          { text: 'I\'ll do it', next: null, action: () => questSystem.activate('rat_cellar') },
          { text: 'Not interested', next: 'greeting' },
        ],
      },
    },
  },
},
```

### UI Диалогов (Canvas)

```javascript
function drawDialogue(ctx, node) {
  if (!node) return;
  const boxH = 160;
  const y = canvas.height - boxH - 20;

  // Фон
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  roundRect(ctx, 20, y, canvas.width - 40, boxH, 10);

  // Портрет (цветной квадрат)
  ctx.fillStyle = '#555';
  ctx.fillRect(30, y + 10, 60, 60);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px serif';
  ctx.fillText(node.speaker[0], 48, y + 48);

  // Имя
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(node.speaker, 100, y + 25);

  // Текст (с анимацией печати — typewriter)
  ctx.fillStyle = '#ddd';
  ctx.font = '14px sans-serif';
  wrapText(ctx, node.text, 100, y + 48, canvas.width - 160, 18);

  // Варианты ответов
  if (node.choices) {
    for (let i = 0; i < node.choices.length; i++) {
      const cy = y + 80 + i * 24;
      const isHovered = i === hoveredChoice;
      ctx.fillStyle = isHovered ? '#ffcc00' : '#aaa';
      ctx.font = isHovered ? 'bold 14px sans-serif' : '14px sans-serif';
      ctx.fillText(`${i + 1}. ${node.choices[i].text}`, 100, cy);
    }
  }
}
```

---

## СИСТЕМА 6: Карта мира / Зоны (World Map)

```javascript
// world-map.js
class WorldMap {
  constructor() {
    this.zones = {};
    this.currentZone = null;
    this.discovered = new Set();
  }

  loadZone(zoneId) {
    const def = CONFIG.zones[zoneId];
    this.currentZone = {
      id: zoneId, ...def,
      rooms: this.generateRooms(def),
      currentRoom: 0,
    };
    this.discovered.add(zoneId);
  }

  generateRooms(zoneDef) {
    // Процедурная генерация комнат внутри зоны
    const rooms = [];
    for (let i = 0; i < zoneDef.roomCount; i++) {
      const type = i === 0 ? 'entrance' :
                   i === zoneDef.roomCount - 1 ? 'boss' :
                   weightedRandom(zoneDef.roomTypes);
      rooms.push({
        type, // combat, treasure, shop, rest, puzzle, boss
        enemies: type === 'combat' ? this.spawnEnemies(zoneDef, i) : [],
        loot: type === 'treasure' ? this.generateLoot(zoneDef) : [],
        cleared: false,
        connections: [], // заполняется после генерации
      });
    }
    return rooms;
  }

  spawnEnemies(zoneDef, roomIndex) {
    const difficulty = 1 + roomIndex * 0.3; // нарастание
    const pool = zoneDef.enemyPool;
    const count = 2 + Math.floor(Math.random() * 3);
    return Array.from({ length: count }, () => {
      const template = pool[Math.floor(Math.random() * pool.length)];
      return createEnemy(template, difficulty);
    });
  }
}
```

**Данные зон:**
```javascript
zones: {
  forest: {
    name: 'Dark Forest', theme: 'nature',
    palette: { bg: '#1a3a1a', ground: '#2d5a27', accent: '#8bce5a' },
    roomCount: 8,
    roomTypes: { combat: 0.5, treasure: 0.2, shop: 0.1, rest: 0.1, puzzle: 0.1 },
    enemyPool: ['slime', 'wolf', 'goblin'],
    bossId: 'forest_guardian',
    unlocks: ['dungeon'], // зоны которые открываются после прохождения
    ambientSound: 'forest', // для звукового дизайна
  },
  dungeon: {
    name: 'Ancient Dungeon', theme: 'stone',
    palette: { bg: '#1a1a2e', ground: '#3a3a4e', accent: '#8888cc' },
    roomCount: 10,
    roomTypes: { combat: 0.6, treasure: 0.15, shop: 0.05, rest: 0.1, puzzle: 0.1 },
    enemyPool: ['skeleton', 'bat', 'ghost', 'mimic'],
    bossId: 'dungeon_guardian',
    unlocks: ['volcano'],
  },
  volcano: {
    name: 'Fire Peak', theme: 'fire',
    palette: { bg: '#2a0a00', ground: '#4a1a00', accent: '#ff6b35' },
    roomCount: 12,
    roomTypes: { combat: 0.65, treasure: 0.1, shop: 0.05, rest: 0.1, puzzle: 0.1 },
    enemyPool: ['fire_elemental', 'lava_golem', 'dragon_whelp'],
    bossId: 'fire_dragon',
    unlocks: ['final_tower'],
  },
},
```

---

## СИСТЕМА 7: Магазин (Shop)

```javascript
// shop.js
class Shop {
  constructor(zoneId) {
    this.items = this.generateStock(zoneId);
  }

  generateStock(zoneId) {
    const zone = CONFIG.zones[zoneId];
    const tier = Object.keys(CONFIG.zones).indexOf(zoneId) + 1;
    const stock = [];

    // Зелья всегда
    stock.push({ id: 'health_potion', price: 15, quantity: 5 });
    if (tier >= 2) stock.push({ id: 'mana_potion', price: 25, quantity: 3 });

    // Снаряжение по тиру
    const equipPool = Object.entries(CONFIG.items)
      .filter(([id, item]) => item.tier === tier && (item.type === 'weapon' || item.type === 'armor'))
      .map(([id]) => id);
    for (const id of equipPool.slice(0, 3)) {
      stock.push({ id, price: Math.floor(CONFIG.items[id].value * CONFIG.balance.shopMarkup), quantity: 1 });
    }

    return stock;
  }

  buy(itemIndex, player) {
    const shopItem = this.items[itemIndex];
    if (!shopItem || shopItem.quantity <= 0) return 'sold_out';
    if (player.gold < shopItem.price) return 'no_gold';
    if (!player.inventory.addItem(shopItem.id)) return 'full';

    player.gold -= shopItem.price;
    shopItem.quantity--;
    return 'ok';
  }
}
```

---

## СИСТЕМА 8: Сохранение (Save/Load)

```javascript
// save.js
class SaveSystem {
  serialize(gameState) {
    return {
      version: 1,
      timestamp: Date.now(),
      player: {
        level: gameState.player.level,
        xp: gameState.player.xp,
        hp: gameState.player.hp,
        mana: gameState.player.mana,
        gold: gameState.player.gold,
        stats: gameState.player.baseStats,
        inventory: gameState.player.inventory.slots.map(s =>
          s ? { id: s.id, quantity: s.quantity } : null
        ),
        equipment: Object.fromEntries(
          Object.entries(gameState.player.inventory.equipment)
            .map(([slot, item]) => [slot, item ? item.id : null])
        ),
        skills: [...gameState.player.skillManager.unlockedSkills],
        skillPoints: gameState.player.skillManager.skillPoints,
      },
      quests: {
        active: gameState.questSystem.active.map(q => ({ id: q.id, progress: q.progress })),
        completed: gameState.questSystem.completed,
      },
      world: {
        currentZone: gameState.worldMap.currentZone?.id,
        discovered: [...gameState.worldMap.discovered],
      },
      settings: gameState.settings,
      stats: gameState.statistics, // время игры, убийства, и т.д.
    };
  }

  async save(gameState) {
    const data = this.serialize(gameState);
    // Для Yandex Games: await YandexSDK.saveData(data);
    // Для локальной версии:
    localStorage.setItem('deepgame_save', JSON.stringify(data));
  }

  async load() {
    const raw = localStorage.getItem('deepgame_save');
    return raw ? JSON.parse(raw) : null;
  }
}
```

---

## СИСТЕМА 9: Крафт (Crafting) — для Survival

```javascript
// crafting.js
const RECIPES = {
  wooden_pickaxe: {
    name: 'Wooden Pickaxe', category: 'tools',
    ingredients: { wood: 5, stone: 2 },
    result: { id: 'wooden_pickaxe', count: 1 },
    unlocked: true,
  },
  campfire: {
    name: 'Campfire', category: 'structures',
    ingredients: { wood: 8, stone: 4 },
    result: { id: 'campfire', count: 1 },
    unlocked: true,
  },
  iron_sword: {
    name: 'Iron Sword', category: 'weapons',
    ingredients: { iron_ore: 5, wood: 2 },
    result: { id: 'iron_sword', count: 1 },
    unlocked: false, // открывается после нахождения наковальни
  },
};

function canCraft(recipe, inventory) {
  for (const [resourceId, needed] of Object.entries(recipe.ingredients)) {
    const have = inventory.countItem(resourceId);
    if (have < needed) return false;
  }
  return true;
}
```

---

## СИСТЕМА 10: Колода карт (Deckbuilder)

```javascript
// deck.js
class Deck {
  constructor(starterCards) {
    this.drawPile = shuffle([...starterCards]);
    this.hand = [];
    this.discardPile = [];
    this.handSize = 5;
    this.energy = 3;
    this.maxEnergy = 3;
  }

  drawHand() {
    this.energy = this.maxEnergy;
    for (let i = 0; i < this.handSize; i++) {
      this.drawCard();
    }
  }

  drawCard() {
    if (this.drawPile.length === 0) {
      this.drawPile = shuffle([...this.discardPile]);
      this.discardPile = [];
    }
    if (this.drawPile.length > 0) {
      this.hand.push(this.drawPile.pop());
    }
  }

  playCard(handIndex, target) {
    const card = this.hand[handIndex];
    if (!card || card.cost > this.energy) return false;

    this.energy -= card.cost;
    card.effect(target); // применить эффект карты
    this.hand.splice(handIndex, 1);
    this.discardPile.push(card);
    return true;
  }

  endTurn() {
    // Сброс руки
    this.discardPile.push(...this.hand);
    this.hand = [];
  }

  addCard(cardId) {
    this.discardPile.push({ ...CONFIG.cards[cardId] });
  }

  removeCard(handIndex) {
    this.hand.splice(handIndex, 1);
  }
}
```

---

## СИСТЕМА 11: Лут-таблицы (Loot Tables)

```javascript
// В config.js — таблицы дропа
enemies: {
  slime: {
    name: 'Slime', hp: 10, atk: 2, def: 0, speed: 1,
    level: 1, element: 'nature',
    lootTable: [
      { itemId: 'slime_gel', chance: 0.5 },
      { itemId: 'health_potion', chance: 0.15 },
    ],
  },
  skeleton: {
    name: 'Skeleton', hp: 25, atk: 5, def: 3, speed: 2,
    level: 2, element: 'dark',
    lootTable: [
      { itemId: 'bone', chance: 0.6 },
      { itemId: 'rusty_sword', chance: 0.1 },
      { itemId: 'health_potion', chance: 0.2 },
    ],
  },
  // босс — гарантированный лут
  forest_guardian: {
    name: 'Forest Guardian', hp: 100, atk: 12, def: 8, speed: 1.5,
    level: 5, element: 'nature', isBoss: true,
    phases: 2, // 2 фазы боя
    lootTable: [
      { itemId: 'guardian_sword', chance: 1.0 },
      { itemId: 'forest_amulet', chance: 0.5 },
      { itemId: 'health_potion', chance: 1.0, count: 3 },
    ],
  },
},
```

---

## Жанровые комбинации — какие системы использовать

| Жанр | Обязательные системы | Опциональные |
|------|---------------------|-------------|
| **RPG** | Combat, Inventory, Progression, Quests, World Map, Shop, Save | Dialogue, Crafting |
| **Action-RPG** | Combat (real-time), Inventory, Progression, World Map, Loot | Shop, Quests |
| **Roguelike-Deckbuilder** | Deck, Combat (пошаговый), World Map (граф), Loot, Progression (per-run) | Shop |
| **Metroidvania** | Combat (real-time), World Map (связанная), Progression (abilities), Save | Inventory light |
| **Survival** | Crafting, Inventory, World Map, Day/Night, Combat (real-time) | Building, Quests |
| **Strategy** | Units, Grid Combat, Economy, Progression (campaign), Save | Shop, Diplomacy |
| **Sim** | Economy, Building, Time management, Progression, Save | Quests, NPCs |
| **RPG+TD mix** | Combat (TD), Inventory (башни), Progression (герой+башни), World Map, Economy | Quests, Skill Tree |

Читай этот скил ВМЕСТЕ с жанровым скилом из `skills/{genre}-prototype/SKILL.md` для core-механики конкретного жанра.
