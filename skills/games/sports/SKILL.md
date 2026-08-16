---
name: sports-prototype
description: "Создаёт играбельные 2D-спортивные игры: футбол, баскетбол, гольф, теннис, бильярд, боулинг. Используй когда пользователь просит: спорт, sports, футбол, баскетбол, гольф, теннис, пинг-понг, бильярд, боулинг, хоккей, 'забей гол', 'попади в кольцо'. Триггерится на: 'мяч', 'гол', 'корзина', 'лунка', 'удар', 'ворота', 'ракетка', 'кий'. Если геймплей про спортивное соревнование — это спорт."
---

# Sports Prototype

Скил для 2D-спорта. Спорт — жанр про физику и тайминг. Мяч должен ЛЕТЕТЬ красиво: дуга, вращение, отскок.

## R1 40%

Прототип = одна спортивная механика, физика мяча, счёт, 1v1 (AI или 2 игрока).

---

## Поджанры

| Спорт | Камера | Core-механика | Сложность |
|-------|--------|---------------|-----------|
| **Пинг-понг** | Сбоку/сверху | Ракетки + мяч | Простая |
| **Гольф** | Top-down | Сила + направление удара | Простая |
| **Баскетбол** | Сбоку | Дуга броска | Средняя |
| **Футбол 1v1** | Top-down | 2 команды по 1 | Средняя |
| **Бильярд** | Top-down | Кий + физика шаров | Средняя |
| **Боулинг** | Сбоку/перспектива | Направление + сила | Простая |

---

## Core: Физика мяча

```javascript
class Ball {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 8;
    this.friction = 0.99;    // воздушное сопротивление
    this.bounce = 0.8;       // коэффициент отскока
    this.spin = 0;           // вращение (для визуала)
    this.trail = [];
  }
  update() {
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += 0.2; // гравитация (если сбоку), убрать для top-down
    this.x += this.vx;
    this.y += this.vy;
    this.spin += this.vx * 0.1;
    // Trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();
  }
  applyForce(angle, power) {
    this.vx = Math.cos(angle) * power;
    this.vy = Math.sin(angle) * power;
  }
  bounceOff(normalAngle) {
    const dot = this.vx * Math.cos(normalAngle) + this.vy * Math.sin(normalAngle);
    this.vx -= 2 * dot * Math.cos(normalAngle) * this.bounce;
    this.vy -= 2 * dot * Math.sin(normalAngle) * this.bounce;
  }
}
```

### Механика "сила + направление" (гольф, бильярд, боулинг)

```javascript
const aimState = {
  active: false,
  startX: 0, startY: 0,
  angle: 0, power: 0,
  maxPower: 15,
};

// Зажал мышь → тянешь → отпустил = удар
canvas.addEventListener('mousedown', (e) => {
  aimState.active = true;
  aimState.startX = e.clientX;
  aimState.startY = e.clientY;
});
canvas.addEventListener('mousemove', (e) => {
  if (!aimState.active) return;
  const dx = aimState.startX - e.clientX;
  const dy = aimState.startY - e.clientY;
  aimState.angle = Math.atan2(dy, dx);
  aimState.power = Math.min(Math.hypot(dx, dy) * 0.15, aimState.maxPower);
});
canvas.addEventListener('mouseup', () => {
  if (!aimState.active) return;
  ball.applyForce(aimState.angle, aimState.power);
  aimState.active = false;
  playSound('hit');
});

// Визуализация прицеливания: пунктирная линия + индикатор силы
function drawAim(ctx) {
  if (!aimState.active) return;
  ctx.strokeStyle = '#fff';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(
    ball.x + Math.cos(aimState.angle) * aimState.power * 10,
    ball.y + Math.sin(aimState.angle) * aimState.power * 10
  );
  ctx.stroke();
  ctx.setLineDash([]);
  // Power bar
  const barW = 50, barH = 8;
  ctx.fillStyle = '#333';
  ctx.fillRect(ball.x - barW/2, ball.y - 25, barW, barH);
  const fill = aimState.power / aimState.maxPower;
  ctx.fillStyle = fill > 0.8 ? '#e74c3c' : fill > 0.5 ? '#f39c12' : '#2ecc71';
  ctx.fillRect(ball.x - barW/2, ball.y - 25, barW * fill, barH);
}
```

---

## Визуальные стили

| Стиль | Поле | Мяч | Когда |
|-------|------|-----|-------|
| **Зелёное поле** | Зелёный газон | Белый | Футбол, гольф |
| **Паркет** | Деревянный пол | Оранжевый | Баскетбол |
| **Зелёное сукно** | Бильярдный стол | Цветные шары | Бильярд |
| **Пиксельный** | 8-bit | 8-bit | Ретро спорт |
| **Минималистичный** | Белый фон, линии | Чёрный круг | Абстрактный |

## Спецэффекты
- **Trail за мячом** (последние 5-10 позиций, затухающие)
- **Сетка при голе** — вибрирует
- **Slow-mo** при красивом голе/попадании
- **Частицы** при ударе (пыль, искры)
- **Screen shake** при мощном ударе
- **Крупный текст "GOAL!" / "STRIKE!"** с анимацией масштаба

## Звуки
```
kick:       noise 0.04с + sine 200→100Hz (глухой удар)
bounce:     sine 500→300Hz, 0.03с
goal:       sine chord 400-500-600Hz, 0.3с + crowd noise
miss:       sine 200→150Hz, 0.1с
whistle:    sine 1000Hz, 0.3с (свисток)
applause:   noise 0.5с lowpass (crowd)
```

## Чеклист
- [ ] Физика мяча (гравитация, отскок, трение)
- [ ] Прицеливание визуализировано (линия, сила)
- [ ] Trail за мячом
- [ ] Счёт работает
- [ ] AI-противник или 2 игрока
- [ ] Slow-mo при красивом моменте
- [ ] Звук при каждом касании мяча
