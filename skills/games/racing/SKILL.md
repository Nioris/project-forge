---
name: racing-prototype
description: "Создаёт играбельные 2D-гонки: top-down racing, дрифт, drag racing, endless road. Используй когда пользователь просит: гонки, racing, 'гоночная игра', дрифт, 'объезжай машины', drag race, 'кто быстрее', трасса, заезд, Need for Speed подобное. Триггерится на: 'скорость', 'обгон', 'трасса', 'машина', 'дрифт', 'финишная прямая'. Если основной геймплей — управление транспортом на скорости, это гонка."
---

# Racing Prototype

Скил для создания 2D-гонок. Гонка — жанр про ощущение СКОРОСТИ. Каждый кадр должен кричать "быстро!": speed lines, размытие, наклон в поворотах.

## R1 40%

Не делай систему тюнинга и 20 машин. Прототип = 1 трасса / бесконечная дорога, 3-5 соперников/препятствий, ощущение скорости.

---

## Поджанры

| Поджанр | Камера | Механика | Пример |
|---------|--------|----------|--------|
| **Top-down circuit** | Сверху, вращение | Руль + газ по кольцевой трассе | Micro Machines |
| **Endless road** | Сзади (pseudo-3D) или сверху скролл | Уклоняйся от машин, собирай | Road Fighter |
| **Drift** | Top-down | Дрифт через повороты, набирай очки | Drift-стиль |
| **Drag race** | Сбоку | Тайминг переключения передач | Drag Racing |

Если не указано — **top-down endless road** самый прототипируемый.

---

## Core: Физика машины (top-down)

```javascript
const CAR = {
  x: 0, y: 0, angle: 0,
  speed: 0, maxSpeed: 6, acceleration: 0.15,
  brakeForce: 0.3, friction: 0.03,
  turnSpeed: 0.04,    // поворот на скорости
  driftFactor: 0.92,  // 1.0 = нет дрифта, 0.8 = сильный дрифт
  
  // Вектор скорости (для дрифта)
  vx: 0, vy: 0,
};

function updateCar(car, input) {
  // Газ/тормоз
  if (input.up) car.speed = Math.min(car.speed + car.acceleration, car.maxSpeed);
  else if (input.down) car.speed = Math.max(car.speed - car.brakeForce, -car.maxSpeed * 0.3);
  else car.speed *= (1 - car.friction);

  // Поворот (сильнее на скорости)
  const turnAmount = car.turnSpeed * (car.speed / car.maxSpeed);
  if (input.left) car.angle -= turnAmount;
  if (input.right) car.angle += turnAmount;

  // Вектор направления
  const forwardX = Math.cos(car.angle) * car.speed;
  const forwardY = Math.sin(car.angle) * car.speed;

  // Дрифт: скорость не мгновенно следует за направлением
  car.vx = car.vx * car.driftFactor + forwardX * (1 - car.driftFactor);
  car.vy = car.vy * car.driftFactor + forwardY * (1 - car.driftFactor);

  car.x += car.vx;
  car.y += car.vy;
}
```

## Core: Pseudo-3D дорога (endless)

```javascript
// Дорога = массив сегментов с кривизной
const ROAD_W = 300;
const segments = [];
for (let i = 0; i < 300; i++) {
  segments.push({
    curve: Math.sin(i * 0.02) * 2,  // кривизна
    y: i,
    color: i % 2 === 0 ? '#555' : '#666', // полоски
  });
}

function drawRoad(ctx, playerPos, speed) {
  for (let i = 0; i < 100; i++) {
    const seg = segments[(Math.floor(playerPos) + i) % segments.length];
    const scale = 1 / (i + 1); // перспектива
    const screenY = canvas.height / 2 + i * 3;
    const roadW = ROAD_W * scale;
    const xOffset = seg.curve * i * scale * 50;

    ctx.fillStyle = seg.color;
    ctx.fillRect(canvas.width / 2 - roadW / 2 + xOffset, screenY, roadW, 4);
  }
}
```

---

## Визуальные стили

| Стиль | Дорога | Машины | Окружение |
|-------|--------|--------|-----------|
| **Ретро аркада** | Полосатая, яркая | Простые цветные | Деревья-спрайты |
| **Ночной город** | Тёмная с фонарями | Неоновые фары | Здания с окнами |
| **Пустыня** | Песочная, прямая | Внедорожники | Кактусы, горы |
| **Зимний** | Белая, скользкая | С цепями | Ёлки, снег |
| **Футуристичный** | Светящаяся | Ховеркрафты | Sci-fi декор |

---

## Спецэффекты

- **Speed lines** — горизонтальные линии по бокам при высокой скорости
- **Дым из-под колёс** при дрифте — частицы серого цвета
- **Искры** при столкновении с бортиком
- **Следы торможения** — тёмные линии на дороге
- **Экран трясётся** при столкновении
- **Размытие фона** при максимальной скорости (trail эффект)

## Звуки

```
engine:     sawtooth 80-200Hz (тон зависит от скорости), непрерывный
drift:      noise lowpass 0.3с, повторяющийся
crash:      noise burst 0.15с + sine 200→50Hz
pickup:     sine 600→1000Hz, 0.1с
countdown:  sine 400Hz (3 бипа) → 800Hz (старт)
```

## Управление

- **Стрелки / WASD** — газ, тормоз, руль
- **Мобилка** — наклон (deviceOrientation) или тач-кнопки лево/право + авто-газ

## Твисты

1. **Дрифт = очки** — чем длиннее занос, тем больше множитель
2. **Полиция** — за тобой гонятся, уворачивайся
3. **Разрушаемая трасса** — бортики ломаются
4. **Slow-mo перед столкновением** — время замедляется на секунду
5. **Топливо** — кончается, собирай канистры
6. **Оружие** — стреляй по соперникам (Mario Kart стиль)

## Чеклист

- [ ] Ощущение скорости (speed lines, blur, shake)
- [ ] Дрифт работает (машина "скользит")
- [ ] Столкновения с feedback (искры, звук, shake)
- [ ] Соперники / препятствия
- [ ] Нарастание сложности (скорость, трафик)
- [ ] 3+ звука (мотор, дрифт, столкновение)
- [ ] Lap counter или distance score
