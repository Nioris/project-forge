---
name: rhythm-prototype
description: "Создаёт играбельные ритм-игры: нажимай в такт, Guitar Hero стиль, Geometry Dash, музыкальные паззлы. Используй когда пользователь просит: ритм-игра, rhythm game, 'нажимай в такт', 'музыкальная игра', beat, 'попадай в ритм', Guitar Hero, Geometry Dash, Dance Dance Revolution, OSU подобное. Триггерится на: 'ритм', 'такт', 'бит', 'музыка', 'нота', 'попадание'. Если геймплей привязан к ритму или музыке — это ритм-игра."
---

# Rhythm Prototype

Скил для ритм-игр. Ритм-игра — жанр где геймплей СИНХРОНИЗИРОВАН с музыкой/битом. Главный кайф: попадание в такт + нарастающая сложность паттернов.

## R1 40%

Не делай редактор уровней и систему BPM-синхронизации. Прототип = программно-генерируемый бит, 4 дорожки, ноты падают, попадай.

---

## Core: Генерация ритма (без mp3!)

Музыка генерируется программно через Web Audio API:

```javascript
const BEAT = {
  bpm: 120,
  beatInterval: 60000 / 120, // мс между битами
  subdivision: 4,             // ноты на бит
  noteInterval: 60000 / 120 / 4,
};

// Паттерн нот = массив: [дорожка, время]
// Генерация по шаблонам
function generatePattern(difficulty) {
  const pattern = [];
  const measures = 8 + difficulty * 4;
  const notesPerMeasure = 4 + Math.min(difficulty, 4);

  for (let m = 0; m < measures; m++) {
    for (let n = 0; n < notesPerMeasure; n++) {
      if (Math.random() < 0.3 + difficulty * 0.1) {
        pattern.push({
          lane: Math.floor(Math.random() * 4),
          time: m * BEAT.beatInterval * 4 + n * BEAT.noteInterval,
          type: Math.random() < 0.1 ? 'hold' : 'tap',
        });
      }
    }
  }
  return pattern;
}
```

### Синтезированная музыка-подклад

```javascript
// Бас-линия (играет в фоне, задаёт ритм)
function playBassline(audioCtx, bpm) {
  const interval = 60 / bpm;
  const notes = [65, 65, 82, 73]; // частоты нот
  let time = audioCtx.currentTime;

  for (let bar = 0; bar < 16; bar++) {
    for (let note of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = note;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + interval * 0.8);
      osc.start(time);
      osc.stop(time + interval);
      time += interval;
    }
  }
}

// Метроном (тик на каждый бит)
function playMetronome(audioCtx, bpm) {
  const interval = 60 / bpm;
  let time = audioCtx.currentTime;
  for (let i = 0; i < 64; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = i % 4 === 0 ? 1000 : 700;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(i % 4 === 0 ? 0.1 : 0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.05);
    time += interval;
  }
}
```

---

## Поджанры

| Поджанр | UI | Ввод | Пример |
|---------|-----|------|--------|
| **Falling notes** | 4 дорожки, ноты падают сверху | D F J K (4 клавиши) | Guitar Hero, DDR |
| **Runner-rhythm** | Персонаж бежит, прыгает в такт | Space / tap | Geometry Dash |
| **Circle tap** | Круги появляются, нажми когда совпадёт | Клик по кругу | OSU! |
| **Sequence** | Повтори паттерн | Нажми в правильном порядке | Simon Says |

---

## Hit Detection (тайминг попаданий)

```javascript
const TIMING_WINDOWS = {
  perfect: 40,   // ±40мс от идеала
  great: 80,
  good: 120,
  miss: 200,     // больше = промах
};

function judgeHit(noteTime, hitTime) {
  const diff = Math.abs(noteTime - hitTime);
  if (diff <= TIMING_WINDOWS.perfect) return { grade: 'PERFECT', score: 300, color: '#FFD700' };
  if (diff <= TIMING_WINDOWS.great) return { grade: 'GREAT', score: 200, color: '#00FF00' };
  if (diff <= TIMING_WINDOWS.good) return { grade: 'GOOD', score: 100, color: '#00AAFF' };
  return { grade: 'MISS', score: 0, color: '#FF0000' };
}
```

**Combo system:** каждое попадание (не MISS) увеличивает комбо. MISS сбрасывает. Комбо = множитель очков.

---

## Визуальные стили

| Стиль | Фон | Ноты | Когда |
|-------|-----|------|-------|
| **Неон/ночной клуб** | Тёмный + пульсирующие линии | Светящиеся круги/квадраты | По дефолту (ритм = неон уместен!) |
| **Ретро 8-bit** | Пиксельный | Пиксельные стрелки | Для chiptune |
| **Пастельный** | Светлый мягкий | Цветные пузыри | Для казуальных |
| **Космический** | Звёзды | Метеориты/звёзды | Для атмосферных |

**Для ритм-игр неон УМЕСТЕН** — пульсация и свечение в такт музыке это жанровая конвенция.

---

## Пульсация в такт (визуальная)

```javascript
// Фон пульсирует с каждым битом
let beatPulse = 0;
function onBeat() {
  beatPulse = 1.0; // сбрасывается каждый бит
}
// В render: beatPulse *= 0.9;
// Фон: alpha = 0.05 + beatPulse * 0.1;
// Дорожки слегка расширяются на бит
// HUD-текст scale = 1 + beatPulse * 0.05
```

## Звуки

```
hit_perfect:  sine 800Hz + 1200Hz chord, 0.05с
hit_great:    sine 600Hz, 0.05с
hit_good:     triangle 400Hz, 0.05с
miss:         noise 0.03с, lowpass 500Hz
combo_break:  sawtooth 300→100Hz, 0.1с
```

## Управление

- **D F J K** — 4 дорожки (левая рука + правая рука)
- **Мобилка** — 4 зоны тапа внизу экрана

## Чеклист

- [ ] Ноты синхронизированы с битом
- [ ] Тайминг: perfect/great/good/miss с разными наградами
- [ ] Комбо-счётчик
- [ ] Визуальная пульсация в такт
- [ ] Фоновая музыка (синтез)
- [ ] Нарастание сложности (больше нот, сложнее паттерны)
