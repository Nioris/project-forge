---
name: cardgame-prototype
description: "Создаёт играбельные карточные игры: покер, блекджек, карточные бои, коллекционные, пасьянсы. Используй когда пользователь просит: карточная игра, card game, покер, блекджек, solitaire, пасьянс, 'карточные бои', 'колода', 'раздача', CCG, TCG. Триггерится на: 'карты', 'колода', 'рука', 'раздача', 'козырь', 'покер', 'блекджек', 'пасьянс'. Если основной объект геймплея — карты, это карточная игра."
---

# Card Game Prototype

Скил для карточных игр. Карты — универсальный объект: от казино до тактических боёв. Главное — красивые карты и сочные анимации раздачи/сброса.

## R1 40%

Прототип = одна карточная механика, красивые анимированные карты, AI-противник или логика правил.

---

## Поджанры

| Поджанр | Механика | Пример |
|---------|----------|--------|
| **Классика** | Покер, блекджек, дурак | 21/покер |
| **Пасьянс** | Раскладывание по правилам | Косынка, паук |
| **Карточные бои** | Карты = атака/защита | Hearthstone light |
| **Deckbuilder** | Строй колоду в процессе | Slay the Spire (см. deepgame-systems) |

---

## Core: Колода и карты

```javascript
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_COLORS = { hearts: '#e74c3c', diamonds: '#e74c3c', clubs: '#2c3e50', spades: '#2c3e50' };
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      deck.push({ suit, rank: RANKS[i], value: i + 1, faceUp: false });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
```

## Рисование карты (красиво!)

```javascript
function drawCard(ctx, card, x, y, w = 70, h = 100, highlighted = false) {
  // Тень
  ctx.shadowBlur = highlighted ? 15 : 5;
  ctx.shadowColor = highlighted ? '#ffcc00' : 'rgba(0,0,0,0.3)';
  ctx.shadowOffsetY = 3;

  // Фон карты
  ctx.fillStyle = card.faceUp ? '#fff' : '#2c3e50';
  roundRect(ctx, x, y, w, h, 6, true);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 6, false, true);

  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  if (card.faceUp) {
    const color = SUIT_COLORS[card.suit];
    ctx.fillStyle = color;

    // Ранг сверху-слева
    ctx.font = 'bold 16px serif';
    ctx.textAlign = 'left';
    ctx.fillText(card.rank, x + 6, y + 18);

    // Масть
    ctx.font = '14px serif';
    ctx.fillText(SUIT_SYMBOLS[card.suit], x + 6, y + 34);

    // Большой символ по центру
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.fillText(SUIT_SYMBOLS[card.suit], x + w / 2, y + h / 2 + 8);
  } else {
    // Рубашка — паттерн
    ctx.fillStyle = '#34495e';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(x + 10 + c * 18, y + 10 + r * 18, 12, 12);
      }
    }
  }
}
```

---

## Анимации карт (КРИТИЧНО для карточных игр)

```javascript
class AnimatedCard {
  constructor(card, startX, startY, targetX, targetY) {
    this.card = card;
    this.x = startX; this.y = startY;
    this.targetX = targetX; this.targetY = targetY;
    this.rotation = 0; this.targetRotation = 0;
    this.scale = 1; this.alpha = 1;
    this.flipProgress = 0; // 0 = рубашка, 1 = лицо
    this.animating = true;
  }
  update() {
    this.x += (this.targetX - this.x) * 0.12;
    this.y += (this.targetY - this.y) * 0.12;
    this.rotation += (this.targetRotation - this.rotation) * 0.1;
    if (Math.abs(this.x - this.targetX) < 0.5) this.animating = false;
  }
  flip() {
    // Двухфазная анимация: сжатие → расширение с переворотом
    this.flipPhase = 'shrink'; // shrink → expand
  }
}

// Раздача: карты вылетают из колоды с задержкой
function dealCards(cards, positions) {
  cards.forEach((card, i) => {
    setTimeout(() => {
      animatedCards.push(new AnimatedCard(
        card,
        canvas.width / 2, canvas.height / 2, // из центра (колоды)
        positions[i].x, positions[i].y
      ));
      playSound('deal');
    }, i * 150); // 150мс между картами
  });
}
```

---

## Визуальные стили

| Стиль | Стол | Карты | Когда |
|-------|------|-------|-------|
| **Казино зелёный** | Зелёное сукно `#1a6b3c` | Классические белые | Покер, блекджек |
| **Тёмный элегантный** | Тёмно-серый с текстурой | С золотым ободком | Пасьянс, VIP |
| **Фэнтези** | Деревянный стол | С иллюстрациями монстров | Карточные бои |
| **Минималистичный** | Светлый | Плоские, цветные | Казуальные |

## Звуки
```
deal:       noise 0.02с (шелест, тихий, частый)
flip:       noise 0.03с + sine 600Hz (клик)
place:      noise 0.02с + sine 300Hz (стук о стол)
win:        sine chord C-E-G, 0.3с
lose:       sine 300→100Hz, 0.2с
shuffle:    noise 0.3с с модуляцией (шшш)
chip:       sine 1200Hz, 0.02с (для ставок)
```

## Чеклист
- [ ] Карты красиво нарисованы (тени, закруглённые углы)
- [ ] Анимация раздачи (из колоды к позициям)
- [ ] Анимация переворота
- [ ] Звук на каждое действие с картой
- [ ] AI-противник или правила пасьянса
- [ ] Кнопки: Hit/Stand, Raise/Fold и т.д. — большие, понятные
- [ ] Результат: выигрыш/проигрыш с анимацией
