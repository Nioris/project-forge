---
name: shooter-prototype
description: "Создаёт играбельные 2D-шутеры: top-down, shmup (вертикальный/горизонтальный скроллер), twin-stick, bullet hell. Используй когда пользователь просит: шутер, стрелялка, shoot-em-up, 'стреляй по врагам', space shooter, bullet hell, 'хочу пострелять', twin-stick, top-down shooter, аркадный шутер. Триггерится на: пули, оружие, волны врагов, космические корабли, 'уничтожь всех', 'выживи как можно дольше против волн'. Если пользователь описывает игру где основное действие — стрельба, это шутер."
---

# Shooter Prototype

Скил для создания 2D-шутеров всех поджанров. Шутер — жанр, где кайф в сочетании точной стрельбы, уклонения и нарастающего хаоса. Хороший шутер: первая секунда — выстрел, первые 5 секунд — первый kill + взрыв, дальше — эскалация.

## R1 40%

Не строй систему оружия из 20 пушек. Прототип = 1-2 типа оружия, волны врагов с нарастающей сложностью, сочные взрывы.

---

## Поджанры — определи первым делом

| Поджанр | Камера | Движение | Прицел | Пример |
|---------|--------|----------|--------|--------|
| **Top-down** | Сверху | WASD во все стороны | Мышь | Hotline Miami |
| **Shmup vertical** | Скроллит вверх | Лево-право + вперёд-назад | Автоприцел вверх | 1942, Touhou |
| **Shmup horizontal** | Скроллит вправо | Вверх-вниз + вперёд-назад | Автоприцел вправо | Gradius, R-Type |
| **Twin-stick** | Статичная арена | Левый стик/WASD | Правый стик/мышь | Enter the Gungeon |
| **Bullet hell** | Как shmup | Медленное, точное | Авто | Touhou (boss patterns) |

Если пользователь не указал — **top-down twin-stick** самый универсальный.

---

## Core: Система пуль

Пули — основной визуальный элемент. Должны быть БЫСТРЫЕ, ЯРКИЕ, МНОЖЕСТВЕННЫЕ.

```javascript
class Bullet {
  constructor(x, y, angle, speed, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = opts.radius || 3;
    this.color = opts.color || '#ffcc00';
    this.damage = opts.damage || 1;
    this.life = opts.life || 120; // кадров
    this.isEnemy = opts.isEnemy || false;
    this.trail = []; // для визуального следа
  }
  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }
  draw(ctx) {
    // След
    for (let i = 0; i < this.trail.length; i++) {
      const alpha = i / this.trail.length * 0.4;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, this.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Пуля
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

**Паттерны стрельбы врагов (для bullet hell и обычных):**
```javascript
// Круговой залп — n пуль равномерно по кругу
function circularBurst(x, y, n, speed) {
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 / n) * i;
    bullets.push(new Bullet(x, y, angle, speed, { isEnemy: true, color: '#ff4444' }));
  }
}
// Веер — n пуль в секторе
function fanShot(x, y, targetAngle, n, spread, speed) {
  for (let i = 0; i < n; i++) {
    const angle = targetAngle - spread/2 + (spread / (n-1)) * i;
    bullets.push(new Bullet(x, y, angle, speed, { isEnemy: true, color: '#ff6666' }));
  }
}
// Спираль — вращающийся поток
function spiralShot(x, y, baseAngle, speed) {
  bullets.push(new Bullet(x, y, baseAngle, speed, { isEnemy: true, color: '#ff88aa' }));
}
```

---

## Визуальные стили для шутера

| Стиль | Фон | Корабли/персонажи | Пули | Взрывы |
|-------|-----|-------------------|------|--------|
| **Ретро аркада** | Чёрный + звёзды | Яркие простые формы | Белые/жёлтые точки | Мигающие квадраты | 
| **Геометрический** | Тёмно-синий `#0a1628` | Треугольники, ромбы | Тонкие линии | Осколки геометрии |
| **Военный** | Зелёно-коричневый сверху (земля) | Танки/самолёты | Жёлтые трассеры | Огонь + дым |
| **Подводный** | Глубокий синий | Подлодки/рыбы | Торпеды/пузыри | Водовороты |
| **Пиксель** | Космос/небо пиксельное | 8-bit спрайты | Маленькие квадраты | Пиксельные кольца |
| **Неон** | Чёрный | Glow-контуры | Светящиеся | Glow-вспышки |

НЕ ВЫБИРАЙ неон по умолчанию. Ретро аркада или геометрический — лучше для шутера по дефолту.

---

## Волны и эскалация

Шутер без нарастания сложности — скучный. Простая система волн:

```javascript
const WAVES = {
  spawnInterval: 60,    // кадров между спавнами (уменьшается)
  waveSize: 5,          // врагов в волне (увеличивается)
  wavePause: 180,       // кадров между волнами
  difficultyScale: 1.0, // множитель (растёт)
};

// Каждую волну:
// - spawnInterval *= 0.9 (чаще спавнятся)
// - waveSize += 2 (больше врагов)
// - difficultyScale += 0.15 (враги быстрее, стреляют чаще)
// - Каждые 3 волны — мини-босс (большой, много HP, паттерн стрельбы)
```

**Типы врагов (минимум 3):**
1. **Прямолинейный** — летит на игрока, не стреляет. HP: 1. Быстрый.
2. **Стрелок** — двигается медленно, стреляет в игрока каждые 60-90 кадров. HP: 2.
3. **Танк** — большой, медленный, HP: 5-8, стреляет веером.
4. **Босс** (каждые 3-5 волн) — большой, сложные паттерны, HP: 20+.

---

## Взрывы — главный juice шутера

```javascript
function spawnExplosion(x, y, color, size = 'medium') {
  const configs = {
    small:  { count: 8,  speed: 3, life: 0.6, particleSize: 2 },
    medium: { count: 20, speed: 5, life: 0.8, particleSize: 3 },
    large:  { count: 40, speed: 7, life: 1.0, particleSize: 4 }, // для боссов
  };
  const c = configs[size];
  for (let i = 0; i < c.count; i++) {
    particles.push(new Particle(x, y, color, {
      speed: c.speed * (0.5 + Math.random()),
      life: c.life,
      size: c.particleSize,
      decay: 0.02 + Math.random() * 0.01,
    }));
  }
  // Вспышка — белый круг на 3 кадра
  flashes.push({ x, y, radius: c.count, life: 3 });
  // Screen shake
  screenShake = size === 'large' ? 8 : size === 'medium' ? 4 : 2;
}
```

**Flash (вспышка)** — белый круг в точке взрыва на 2-3 кадра. Простейший эффект, огромный импакт.

---

## Оружие игрока

Не перегружай — 1-2 типа достаточно:

```
Базовое:    одиночные пули, быстро, cooldown 8 кадров
Shotgun:    веер 5 пуль, cooldown 25 кадров
Laser:      непрерывный луч (линия от игрока до края), cooldown 0, потребляет энергию
Missile:    медленная, наведение, большой взрыв, cooldown 60
```

Для прототипа хватит базового + один мощный. Переключение по кнопке или подбор.

---

## Звуки шутера

```
shoot:      square 800→200Hz за 0.08с
explosion:  noise burst 0.2с, gain 0.4 → 0
big_explosion: noise 0.4с + sine 100→30Hz за 0.3с
pickup:     sine 500→1200Hz за 0.15с
hit:        noise 0.03с + sawtooth 300→50Hz за 0.05с
wave_start: sine sweep 200→800→200Hz за 0.5с
```

---

## Управление

**Top-down / Twin-stick:**
- WASD — движение
- Мышь — прицел + ЛКМ стрельба
- Пробел — спецатака / бомба

**Shmup:**
- Стрелки / WASD — движение
- Пробел / Z — стрельба (зажать)
- X / Shift — бомба / спецатака

---

## Твисты

1. **Рикошет** — пули отскакивают от стен
2. **Поглощение** — пули врагов можно "ловить" и стрелять обратно
3. **Время** — bullet time по кнопке (всё замедляется кроме прицела)
4. **Комбо** — множитель очков растёт, если убивать без пауз
5. **Бомба-пылесос** — взрыв притягивает все бонусы на экране
6. **Дрон** — за игроком летит дрон, стреляет автоматически

---

## Чеклист

- [ ] Стрельба работает с хорошим fire rate
- [ ] Пули врагов имеют паттерны (не просто рандом)
- [ ] Взрывы с частицами + flash + screen shake
- [ ] Минимум 3 типа врагов
- [ ] Волны с нарастанием сложности
- [ ] Очки + хайскор
- [ ] 3+ разных звука
- [ ] 60 FPS при 100+ пулях на экране (лимит частиц ~500)
- [ ] Title screen + Game Over
