---
name: analyze-game
kind: architectural
description: "Анализировать новую игру перед интеграцией SDK. Используй когда нужно проанализировать игру, изучить структуру, подготовиться к интеграции, понять архитектуру игры."
---

# $analyze-game — Анализ игры для интеграции

Анализировать игру в `GameIntegration/` и подготовить отчёт для интеграции Yandex Games SDK.

## Шаги

### Phase 0 — Workspace setup (MANDATORY, v4.7.7+)

**Перед любым чтением файлов — определи имя проекта и скопируй sources в WorkProgress/.**

```bash
# Auto-detect project name from GameIntegration/ folder name (or ask user)
# Then:
mkdir -p WorkProgress/{ProjectName}
cp -r GameIntegration/{ProjectName}/* WorkProgress/{ProjectName}/  # bash
# Or:
Copy-Item -Recurse "GameIntegration\{ProjectName}\*" "WorkProgress\{ProjectName}\"  # pwsh
```

**Critical:** ВСЁ дальнейшее чтение/анализ кода — из `WorkProgress/{ProjectName}/`, не `GameIntegration/`. `GameIntegration/` — read-only снапшот того что юзер дропнул.

`workspace-discipline` hook автоматически блокирует Edit/Write в `GameIntegration/*` — если попытаешься править там, получишь error message с инструкцией.

Если в `GameIntegration/` уже распакованный архив (как `spiral-vigil-project.zip`) — копируй ВСЁ содержимое включая распакованную папку.

После копировки — обнови `wiki/_current.md`:
```
- Source: GameIntegration/{ProjectName}/ (read-only snapshot)
- Active workspace: WorkProgress/{ProjectName}/
```

### 1. Определить тип игры

**HTML5:** есть `index.html` + JS/CSS файлы, нет `.wasm`/`.data`
**Unity:** есть `Build/` папка с `.wasm`, `.data`, `.loader.js` + `index.html`

Использовать `Glob` для обнаружения В WORKPROGRESS:
- `WorkProgress/{ProjectName}/index.html`
- `WorkProgress/{ProjectName}/Build/*.wasm`
- `WorkProgress/{ProjectName}/**/*.js`
- `WorkProgress/{ProjectName}/**/*.css`

### 2. Структура файлов

Вывести дерево файлов с размерами:
```bash
ls -la GameIntegration/
```
Общий размер (должен быть < 100 МБ).

### 3. Анализ кода (HTML5)

Прочитать ВЕСЬ код игры. Определить:

**Архитектура:**
- Точка входа (index.html)
- Основные JS файлы / inline скрипты
- Фреймворк (Phaser, PixiJS, Three.js, vanilla, etc.)
- Модульность (один файл / несколько)

**Игровой цикл:**
- Где `requestAnimationFrame` или `setInterval`
- Переменная состояния игры (gameState, gs, state, etc.)
- Возможные значения (menu, playing, paused, dead, etc.)

**Паузы (для Interstitial рекламы):**
- Конец уровня
- Смерть / game over
- Возврат в меню
- Переход между экранами

**Бонусные механики (для Rewarded Video):**
- Дополнительные жизни
- Ускорение / бусты
- Монеты / валюта × 2
- Продолжение после смерти
- Разблокировка контента

**Покупки (IAP):**
- Внутриигровая валюта
- Скины / кастомизация
- Отключение рекламы
- Стартовые наборы

**Сохранения:**
- `localStorage.getItem` / `setItem`
- Другие механизмы persistence
- Что сохраняется (прогресс, скоры, настройки)

**Звуковая система:**
- `AudioContext` / `Audio` объекты
- Web Audio API
- Способ mute/unmute
- Переменная громкости

**Скоринг (для лидербордов):**
- Счёт / очки
- Где максимальный скор
- Что можно отправить в лидерборд

**Текстовые строки (для локализации):**
- UI строки (меню, кнопки, сообщения)
- Игровые данные (названия предметов, описания)
- Сколько строк примерно

### 4. Анализ кода (Unity)

Если Unity — проверить:
- Версия Unity (из index.html)
- Размер .data файла
- Есть ли StreamingAssets
- index.html шаблон

### 5. Проверка существующих проблем

- Есть ли `alert()`, `confirm()`, `prompt()`
- Есть ли абсолютные URL
- Есть ли CORS проблемы (внешние ресурсы)
- Кириллица в именах файлов
- Пробелы в именах файлов

### 6. Research references (MANDATORY, v4.4+)

После того как известен жанр и ключевые механики — вызови `$research-references` с темой вида:

```
$research-references {genre} canvas game, mechanics: {main-loop}, target: Yandex Games
```

Результат — `wiki/research/{Project}-references.md`:
- 3-5 похожих игр на Яндекс Играх / Poki / itch.io (из web_search, не из памяти)
- UI/UX паттерны жанра (из image_search)
- Table-stakes фичи которые есть у всех конкурентов
- Differentiation opportunities — что можно сделать уникально
- Anti-patterns — на что жалуются пользователи

Покажи summary пользователю, дождись подтверждения направления.

### 7. Skill discovery (v4.4+)

Для каждой специализированной компетенции — `$find-or-make-skill`:

- Game uses Phaser → ищем skill для Phaser best practices
- Game uses WebGL particles → ищем skill для particle systems
- Game needs complex audio → ищем skill для Web Audio API

Всё что не нашлось на шагах 1-4 discovery chain — `$write-skill` создаёт локально.

Формат вывода find-or-make-skill встраивается в раздел **📋 ПЛАН ИНТЕГРАЦИИ** как `Skills: {list}`.

## Формат вывода

```
═══════════════════════════════════════
  АНАЛИЗ ИГРЫ
═══════════════════════════════════════

📌 ОСНОВНОЕ
  Тип: HTML5 / Unity
  Название: {из <title> или определить}
  Размер: {X} МБ ({N} файлов)
  Фреймворк: {Phaser / PixiJS / Vanilla / etc.}

🏗️ АРХИТЕКТУРА
  Точка входа: index.html
  Скрипты: {список}
  Модульность: {один файл / модули}
  Состояние: переменная `{gs}`, значения: {menu, playing, ...}

⏸️ ТОЧКИ ПАУЗЫ (для Interstitial)
  1. {описание} — строка {N}
  2. {описание} — строка {N}

🎬 БОНУСНЫЕ МЕХАНИКИ (для Rewarded)
  1. {описание} — как интегрировать
  2. {описание} — как интегрировать

💰 ПОКУПКИ (IAP)
  1. {описание} — товар и цена
  Или: Покупки не рекомендуются (причина)

💾 СОХРАНЕНИЯ
  Механизм: localStorage / нет
  Что сохраняется: {список}
  Заменить на: player.setData/getData

🔊 ЗВУК
  Система: AudioContext / Audio / нет
  Mute: {как заглушить}
  Переменная: {имя}

🏆 ЛИДЕРБОРД
  Скоринг: {что считается}
  Максимум: {где хранится}

🌐 ЛОКАЛИЗАЦИЯ
  Языки: {текущий}
  i18n foundation: ✓ есть (src/i18n/) / ✗ нет — INLINE STRINGS!
  UI строк: ~{N}
  Данных строк: ~{N}
  Inline cyrillic найдено: {N} (через grep [А-Я] или scripts/check-inline-strings.mjs)
  Подход: I18N + DATA_EN / только I18N
  RECOMMEND: если нет foundation + ≥30 inline strings → запустить $i18n-foundation
    ДО любых других работ. Retrofit 100+ литералов = дни. Foundation сейчас = 30 минут.

⚠️ ПРОБЛЕМЫ
  {список проблем которые нужно решить}

📋 ПЛАН ИНТЕГРАЦИИ
  1. SDK подключение + dev-mode
  2. Lifecycle API (LoadingAPI.ready + GameplayAPI)
  3. Реклама ({N} interstitial точек + {M} rewarded)
  4. Сохранения (localStorage → SDK)
  5. Локализация (RU + EN)
  6. Покупки (если есть)
  7. Лидерборд (если есть скоринг)

📚 REFERENCES (v4.4+)
  Файл: wiki/research/{Project}-references.md
  Топ-3 конкурента: {list}
  Direction: {brutalist / retro / editorial / …}

🧰 SKILLS (v4.4+)
  Required: {list from find-or-make-skill}
  Created locally: {list}
  Installed from marketplace: {list}

🏗️ ARCHITECTURAL FOUNDATIONS (v4.9.0+)
  Recommended pipeline for this game:
  - $i18n-foundation         (если ≥30 inline strings)
  - $product-metrics         (если targets не utверждены, до redesign)
  - $design-pipeline         (если нужен GDD/level/monetization design refresh)

  Tactical (по необходимости):
  - $game-polish, $improve, $deepen-game, $level-design

  Если запускаешь $design-pipeline — он сам spawn'нит specialists:
  game-designer, level-designer, monetization, art-director, sound-designer.
```
