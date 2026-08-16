---
name: fighting-prototype
description: "Создаёт играбельные 2D файтинги и beat-em-up: 1v1 бои, side-scrolling brawler, арена. Используй когда пользователь просит: файтинг, драка, бой, beat-em-up, 'бей врагов', fighting game, brawler, 'дерись', 'боевые комбо', Street Fighter подобное, 'PvP бой'. Триггерится на: 'удар', 'комбо', 'блок', 'арена', 'два игрока', 'ближний бой', 'рукопашная'. Если основной геймплей — рукопашные бои с ударами/комбо — это файтинг."
---

# Fighting / Beat-em-up Prototype

Скил для создания 2D-файтингов и beat-em-up. Файтинг — жанр, где кайф в ощущении УДАРА. Каждый удар должен быть тяжёлым, каждый комбо — наградой за тайминг.

## R1 40%

Не делай 30 приёмов и систему комбо из 10 ударов. Прототип = 3-4 атаки, блок/уклонение, хороший hit feedback, 1 противник (AI или 2й игрок). Один бой = 30-60 секунд.

---

## Два поджанра

| Поджанр | Камера | Враги | Движение | Пример |
|---------|--------|-------|----------|--------|
| **1v1 Fighting** | Сбоку, 2 бойца | Один противник | Лево-право + прыжок | Street Fighter, Mortal Kombat |
| **Beat-em-up** | Сбоку, скролл | Волны врагов | Лево-право + вверх-вниз (глубина) | Streets of Rage, Castle Crashers |

Если не указано — **1v1** проще прототипировать и эффектнее.

---

## Core: Система атак и состояний

Файтинг = конечный автомат. Персонаж всегда в одном из состояний:

```javascript
const STATES = {
  IDLE: 'idle',
  WALK: 'walk',
  JUMP: 'jump',
  ATTACK_LIGHT: 'attack_light',
  ATTACK_HEAVY: 'attack_heavy',
  BLOCK: 'block',
  HIT_STUN: 'hit_stun',     // оглушён после получения удара
  KNOCKDOWN: 'knockdown',    // лежит на полу
  GETUP: 'getup',
};

class Fighter {
  constructor(x, facing, controls, color) {
    this.x = x;
    this.y = GROUND_Y;
    this.vy = 0;
    this.facing = facing;     // 1 = вправо, -1 = влево
    this.state = STATES.IDLE;
    this.stateTimer = 0;      // кадров в текущем состоянии
    this.hp = 100;
    this.maxHp = 100;
    this.combo = 0;           // счётчик комбо
    this.controls = controls; // маппинг кнопок
    this.color = color;
    this.w = 40;
    this.h = 64;

    // Hitbox атаки (появляется только в момент удара)
    this.attackBox = null;
  }

  setState(newState) {
    this.state = newState;
    this.stateTimer = 0;
    this.attackBox = null;
  }

  update() {
    this.stateTimer++;

    switch (this.state) {
      case STATES.ATTACK_LIGHT:
        // Startup: 0-4 кадров — замах (ноу хитбокс)
        // Active: 5-8 кадров — удар АКТИВЕН
        // Recovery: 9-18 кадров — возврат
        if (this.stateTimer === 5) {
          this.attackBox = {
            x: this.x + this.facing * 20,
            y: this.y - 30,
            w: 35, h: 20,
            damage: 8,
          };
        }
        if (this.stateTimer === 9) this.attackBox = null;
        if (this.stateTimer >= 18) this.setState(STATES.IDLE);
        break;

      case STATES.ATTACK_HEAVY:
        // Медленнее, сильнее
        if (this.stateTimer === 10) {
          this.attackBox = {
            x: this.x + this.facing * 15,
            y: this.y - 35,
            w: 45, h: 30,
            damage: 18,
          };
        }
        if (this.stateTimer === 16) this.attackBox = null;
        if (this.stateTimer >= 30) this.setState(STATES.IDLE);
        break;

      case STATES.HIT_STUN:
        if (this.stateTimer >= 15) this.setState(STATES.IDLE);
        break;

      case STATES.KNOCKDOWN:
        // Падает, лежит, встаёт
        this.vy += 0.3;
        this.y += this.vy;
        if (this.y >= GROUND_Y) {
          this.y = GROUND_Y;
          if (this.stateTimer > 40) this.setState(STATES.GETUP);
        }
        break;
    }
  }
}
```

**Startup → Active → Recovery** — фундамент файтинга. Startup = замах (уязвим). Active = удар попадает. Recovery = возврат (уязвим). Хевик дольше, но сильнее.

---

## Hit Detection и Feedback

```javascript
function checkHit(attacker, defender) {
  if (!attacker.attackBox) return;
  if (defender.state === STATES.HIT_STUN || defender.state === STATES.KNOCKDOWN) return;

  const a = attacker.attackBox;
  const d = { x: defender.x - defender.w/2, y: defender.y - defender.h, w: defender.w, h: defender.h };

  if (a.x < d.x + d.w && a.x + a.w > d.x && a.y < d.y + d.h && a.y + a.h > d.y) {
    // Блок?
    if (defender.state === STATES.BLOCK) {
      // Стружка, отталкивание, тихий звук
      defender.x -= attacker.facing * 8;
      spawnBlockSparks(defender.x, a.y);
      playSound('block');
      return;
    }

    // ПОПАДАНИЕ!
    applyHit(attacker, defender, a.damage);
  }
}

function applyHit(attacker, defender, damage) {
  defender.hp -= damage;
  attacker.combo++;

  // === JUICE — самая важная часть файтинга ===

  // 1. Hit stop (freeze frame) — ОБА бойца замирают на 4-6 кадров
  hitStopTimer = damage > 12 ? 6 : 4;

  // 2. Screen shake
  screenShake = damage > 12 ? 8 : 4;

  // 3. Отбрасывание
  defender.x += attacker.facing * (damage > 12 ? 15 : 8);

  // 4. Состояние
  if (damage > 15 || defender.hp <= 0) {
    defender.setState(STATES.KNOCKDOWN);
    defender.vy = -6;
  } else {
    defender.setState(STATES.HIT_STUN);
  }

  // 5. Частицы: искры в точке удара
  const hitX = attacker.attackBox.x + attacker.attackBox.w / 2;
  const hitY = attacker.attackBox.y + attacker.attackBox.h / 2;
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: hitX, y: hitY,
      vx: (Math.random() - 0.5) * 8 + attacker.facing * 3,
      vy: (Math.random() - 0.5) * 6,
      life: 0.5 + Math.random() * 0.3,
      color: '#fff',
      size: 2 + Math.random() * 3,
    });
  }

  // 6. Flash: белая вспышка на точке удара
  flashes.push({ x: hitX, y: hitY, radius: 25, life: 3 });

  // 7. Звук
  playSound(damage > 12 ? 'heavy_hit' : 'light_hit');

  // 8. Комбо-текст
  if (attacker.combo > 1) {
    floatingTexts.push({
      x: hitX, y: hitY - 30,
      text: attacker.combo + ' HIT!',
      life: 1.0, vy: -1.5,
      color: '#ffcc00', size: 18 + attacker.combo * 2,
    });
  }
}
```

**Hit stop** — ОБЯЗАТЕЛЬНО. Это когда оба бойца замирают на 3-6 кадров при ударе. Даёт ощущение ВЕСА. Без этого удары как тыкание подушкой.

---

## Визуальные стили для файтинга

| Стиль | Арена | Бойцы | Эффекты ударов | Когда |
|-------|-------|-------|----------------|-------|
| **Пиксельный** | Каменная арена | 16-32px спрайты | Пиксельные звёзды | Классика |
| **Рисованный** | Неровные линии | "Нарисованные от руки" | Чернильные кляксы | Инди |
| **Яркий мультяшный** | Цветной фон | Большеголовые | Мультяшные звёзды/молнии | Для весёлых |
| **Тёмный** | Переулок/подвал | Тёмные силуэты | Красные/белые вспышки | Для серьёзных |
| **Минималистичный** | Плоский однотонный | Геометрические фигуры | Чистые линии, круги | Абстрактный |

По дефолту — **пиксельный** или **яркий мультяшный**. Читаемость ударов важнее красоты фона.

---

## Рисование бойца

```javascript
function drawFighter(ctx, fighter, time) {
  ctx.save();
  ctx.translate(fighter.x, fighter.y);
  ctx.scale(fighter.facing, 1);

  // Мигание при hit stun
  if (fighter.state === STATES.HIT_STUN && Math.floor(time / 3) % 2) {
    ctx.globalAlpha = 0.4;
  }

  // Тело (прямоугольник с "позой")
  const bodyOffsetY = fighter.state === STATES.ATTACK_HEAVY ? -5 :
                      fighter.state === STATES.BLOCK ? 3 : 0;

  ctx.fillStyle = fighter.color;
  ctx.fillRect(-fighter.w/2, -fighter.h + bodyOffsetY, fighter.w, fighter.h);

  // Кулак (выдвигается при атаке)
  if (fighter.state === STATES.ATTACK_LIGHT && fighter.stateTimer >= 4 && fighter.stateTimer <= 9) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(fighter.w/2, -40, 20, 12);
  }
  if (fighter.state === STATES.ATTACK_HEAVY && fighter.stateTimer >= 8 && fighter.stateTimer <= 16) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(fighter.w/2 - 5, -50, 30, 18);
  }

  // Щит при блоке
  if (fighter.state === STATES.BLOCK) {
    ctx.strokeStyle = '#88ccff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(10, -fighter.h/2, 20, -0.5, 0.5);
    ctx.stroke();
  }

  // Глаза
  ctx.fillStyle = '#fff';
  ctx.fillRect(8, -fighter.h + 12, 6, 6);
  ctx.fillStyle = '#111';
  ctx.fillRect(10, -fighter.h + 13, 3, 3);

  ctx.restore();
}
```

---

## AI противника (для 1v1 vs CPU)

```javascript
function updateAI(ai, player) {
  const dist = Math.abs(ai.x - player.x);
  const facingPlayer = Math.sign(player.x - ai.x);
  ai.facing = facingPlayer;

  if (ai.state !== STATES.IDLE && ai.state !== STATES.WALK) return;

  // Подходить на дистанцию удара
  if (dist > 70) {
    ai.x += facingPlayer * 2;
    ai.state = STATES.WALK;
  } else {
    // На дистанции — решай
    const roll = Math.random();
    if (roll < 0.02) ai.setState(STATES.ATTACK_LIGHT);
    else if (roll < 0.03) ai.setState(STATES.ATTACK_HEAVY);
    else if (roll < 0.06) ai.setState(STATES.BLOCK);
    // Иногда отходит
    else if (roll < 0.08) ai.x -= facingPlayer * 3;
  }

  // Реакция на атаку игрока (блок с задержкой)
  if (player.attackBox && dist < 80 && Math.random() < 0.4) {
    ai.setState(STATES.BLOCK);
  }
}
```

---

## HP-бары (стилизованные)

```javascript
function drawHPBar(ctx, x, y, hp, maxHp, color, width = 250) {
  const ratio = hp / maxHp;
  const barH = 16;

  // Фон
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, width, barH);

  // HP
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 2, (width - 4) * ratio, barH - 4);

  // Анимированный "белый" остаток (показывает потерянный HP с задержкой)
  // Реализуй через displayHp который догоняет реальный hp с lerp
}
```

---

## Звуки файтинга

```
light_hit:   noise 0.04с + sine 500→200Hz, gain 0.3
heavy_hit:   noise 0.1с + sine 300→80Hz, gain 0.4 (ТЯЖЁЛЫЙ)
block:       sine 800→400Hz, 0.05с, gain 0.15 (металлический)
whiff:       sine 600→300Hz, 0.08с, gain 0.1 (промах — свист)
jump:        sine 200→400Hz, 0.08с
ko:          noise 0.3с + sine 200→50Hz + sine sweep 800→200Hz
round_start: sine chord C-E-G, 0.3с
```

---

## Управление

**Игрок 1:**
- A/D — лево/право
- W — прыжок
- J — лёгкий удар
- K — тяжёлый удар
- S — блок

**Игрок 2 (или AI):**
- Стрелки — лево/право
- Стрелка вверх — прыжок
- Numpad 1 / O — лёгкий удар
- Numpad 2 / P — тяжёлый удар
- Стрелка вниз — блок

Показывай управление на Title screen!

---

## Твисты

1. **Суперудар** — заполняешь шкалу ударами, затем мощная атака с кинематографичной паузой
2. **Окружение** — арена с ловушками (шипы, ямы, падающие объекты)
3. **Оружие** — подбираешь мечи/стулья на арене
4. **Парирование** — идеальный тайминг блока = контратака
5. **Мутации** — после каждого раунда выбирай усиление
6. **Tag team** — два персонажа, переключение по кнопке

---

## Чеклист

- [ ] Hit stop при каждом ударе (3-6 кадров freeze)
- [ ] Screen shake при попаданиях
- [ ] Startup → Active → Recovery у каждой атаки
- [ ] Блок работает (уменьшает/отменяет урон)
- [ ] Частицы/вспышки в точке удара
- [ ] HP-бары с анимацией
- [ ] Комбо-счётчик
- [ ] AI для single player (или 2 игрока)
- [ ] Звук на каждый удар (разный для лёгкого/тяжёлого)
- [ ] "FIGHT!" + "K.O.!" текст с анимацией
- [ ] Round system (best of 3)
