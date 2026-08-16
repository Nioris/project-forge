---
description: "Протестировать игру перед отправкой на модерацию. Используй когда нужно протестировать игру, проверить что всё работает, найти баги, провести тестирование, QA."
---

# /test-game — Тестирование игры

Полное тестирование игры в `WorkProgress/{GameName}/` перед отправкой на модерацию.
Модерация Яндекс = 3-5 рабочих дней. Отказ = неделя потери. Тестируй ТЩАТЕЛЬНО.

---

## ЭТАП 1: Pre-submit (основной — 30+ REQ проверок)

**Mandatory:** активируй скил `pre-submit-gate` и запусти **ВСЕ ТРИ**:

```bash
# 1. Статика — 9 валидаторов покрывают 30+ REQ с цитатами из docs
node scripts/pre-submit.mjs WorkProgress/{GameName}/ --verbose
# Должен вывести "READY for submission" (0 blockers).

# 2. Smoke — runtime crashes + фризы ≥500ms
node scripts/smoke-test.mjs WorkProgress/{GameName}/
# Должен вывести "✅ No runtime errors".

# 3. Runtime ad probe — REQ-4.4 / REQ-4.5 (state-driven ad triggers)
node scripts/runtime-test.mjs WorkProgress/{GameName}/
# Должен вывести "READY — runtime ad probes passed."
# Это закрывает дыру через которую Circle 2048 v1 был отклонён:
# показ interstitial из endGame() / gameOver() (без user gesture).
# Yandex SDK НЕ нужен — скрипт подставляет stub.
```

**Все три = mandatory gate.** Если хоть один сказал blocker — исправь и перезапусти.
**НЕ переходи** к Этапу 2 пока все три не покажут 0 blockers.

### Legacy-скрипты (запускать ДОПОЛНИТЕЛЬНО)

```bash
# Дополнительные проверки которых нет в pre-submit
bash scripts/verify.sh WorkProgress/{GameName}/
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
```

Они могут дать дополнительные warnings — учитывай, но blocker-решения принимай по pre-submit.

Если есть FAIL → исправь → перезапусти скрипты → повтори до 0 FAIL.
НЕ переходи к Этапу 2 пока оба скрипта не покажут 0 FAIL.

**🔴 ЗАПРЕЩЕНО классифицировать FAIL как «не критично», «false positive», «ожидаемо», «known limitation».
Если скрипт сказал FAIL — это FAIL. Исправь или объясни пользователю КОНКРЕТНО почему это false positive
и попроси разрешение проигнорировать. НЕ решай сам что FAIL можно пропустить.**

---

## ЭТАП 2: Ручные проверки (то что скрипты не могут)

Скрипты проверяют наличие кода (grep). Ручные тесты проверяют ЛОГИКУ — правильно ли код работает.

### ТЕСТ 1: Навигация между экранами

Прочитать код и проследить КАЖДЫЙ переход:

```
Меню → [Play/Continue] → Игра
Меню → [New Game] → Катсцена (если есть) → Игра
Игра → [Pause] → Пауза
Пауза → [Resume] → Игра
Пауза → [Menu] → Меню
Игра → Смерть → Death Screen
Death Screen → [Retry] → Игра
Death Screen → [Menu] → Меню
Игра → Конец уровня → Victory Screen → Следующий уровень / Меню
```

Для каждого перехода:
- [?] gameState корректно меняется
- [?] Новый экран показывается, старый скрывается
- [?] Нет мёртвых состояний (игрок не может застрять)
- [?] GameplayAPI.start() при начале геймплея, stop() при выходе
- [?] start/stop вызываются ПАРАМИ (каждый start имеет stop)

### ТЕСТ 2: Кнопки и интерактивные элементы

Grep все `getElementById` в JS → проверить что КАЖДЫЙ элемент:
1. Существует в HTML (есть `id="..."`)
2. Имеет onclick / addEventListener

```bash
# Найти все getElementById:
grep -on "getElementById\s*(\s*['\"][^'\"]*['\"]\s*)" WorkProgress/{GameName}/index.html | head -40

# Найти все id= в HTML:
grep -on 'id="[^"]*"' WorkProgress/{GameName}/index.html | head -40
```

Сравнить списки. Если getElementById ссылается на несуществующий id → ❌ крэш.

### ТЕСТ 3: Рекламный модуль — логика

verify.sh проверяет что рекламные функции СУЩЕСТВУЮТ. Здесь проверяем что они работают ПРАВИЛЬНО:

- [?] Interstitial вызывается ТОЛЬКО после действия игрока (кнопка), НЕ автоматически
- [?] Interstitial НЕ вызывается во время активного геймплея
- [?] Между показами есть debounce (минимум 60 секунд / счётчик)
- [?] onOpen: gameState = paused + AudioContext.suspend()
- [?] onClose: gameState восстанавливается + AudioContext.resume()
- [?] Rewarded: награда начисляется ТОЛЬКО при onRewarded/ok=true
- [?] Rewarded: кнопка показывается ТОЛЬКО если реклама доступна
- [?] Нет двойного вызова рекламы (debounce / флаг isAdShowing)

### ТЕСТ 4: Сохранение / Загрузка — порядок операций

verify.sh проверяет что localStorage заменён. Здесь проверяем ЛОГИКУ:

- [?] saveGame() вызывается при значимых событиях (конец уровня, покупка, настройки)
- [?] loadGame() / syncCloud() вызывается при старте игры
- [?] Данные НЕ теряются если SDK недоступен (dev-mode fallback)
- [?] setData вызывается НЕ в каждом кадре (rate limit: 100/5мин)

### ТЕСТ 5: Покупки — порядок операций (если есть)

```bash
grep -n "consumePurchase\|getPurchases\|purchase" WorkProgress/{GameName}/index.html | head -10
```

Если покупки есть:
- [?] Порядок: начислить товар → player.setData() → consumePurchase()
- [?] consumePurchase ПОСЛЕ успешного setData (не параллельно)
- [?] При старте: getPurchases() → для каждой незавершённой → начислить → consume
- [?] Цены из getCatalog(), не захардкожены

### ТЕСТ 6: Звук — порядок событий

verify.sh проверяет что visibilitychange и game_api_pause ЕСТЬ. Здесь проверяем порядок:

- [?] AudioContext.resume() вызывается по клику/тапу (autoplay policy)
- [?] При рекламе onOpen → suspend() ПЕРЕД показом рекламы
- [?] При рекламе onClose → resume() ПОСЛЕ закрытия рекламы
- [?] При visibilitychange(hidden) → suspend(), visible → resume() (учитывая toggle звука)
- [?] Если пользователь выключил звук → resume() после рекламы НЕ включает его обратно

---

## Формат вывода

```
═══════════════════════════════════════
  ТЕСТ-РЕПОРТ: {Game Name}
═══════════════════════════════════════

ЭТАП 1: АВТОМАТИЧЕСКИЕ ПРОВЕРКИ
  verify.sh:      ✅ {PASS} passed, {FAIL} failed
  verify-i18n.mjs: ✅ {PASS} passed, {FAIL} failed
  smoke-test:      ✅ No runtime errors / ❌ {N} runtime errors

ЭТАП 2: РУЧНЫЕ ПРОВЕРКИ
  ТЕСТ 1: Навигация         ✅ PASS / ❌ FAIL
  ТЕСТ 2: Кнопки/ID         ✅ PASS / ❌ FAIL
  ТЕСТ 3: Рекламная логика  ✅ PASS / ❌ FAIL
  ТЕСТ 4: Сохранения        ✅ PASS / ❌ FAIL
  ТЕСТ 5: Покупки           ✅ PASS / ⏭️ SKIP
  ТЕСТ 6: Звук              ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🐛 НАЙДЕННЫЕ БАГИ:
  1. {описание} — строка {N} — КРИТИЧНОСТЬ: {HIGH/MED/LOW}
  2. ...

ВЕРДИКТ: определяется АВТОМАТИЧЕСКИ:
  - verify.sh 0 FAIL + verify-i18n 0 FAIL + smoke-test 0 errors + все ручные тесты PASS → ✅ ГОТОВО
  - ЛЮБОЙ FAIL (скрипты или ручные) → ❌ НУЖНЫ ИСПРАВЛЕНИЯ
  ⚠️ Claude НЕ МОЖЕТ изменить вердикт на ✅ при наличии FAIL.
  Если считаешь что FAIL — false positive, СПРОСИ пользователя, не решай сам.
```

---

## ЭТАП 3: Сборка (автоматически при ВЕРДИКТ ✅)

Если verify.sh = 0 FAIL И verify-i18n = 0 FAIL И smoke-test = 0 errors И все ручные тесты PASS → СРАЗУ собрать 3 ZIP.
Не ждать отдельной команды. Не спрашивать пользователя.

Если ЕСТЬ хотя бы 1 FAIL или runtime error → НЕ собирать. Показать пользователю список проблем и спросить:
«Есть {N} проблем. Исправить или считаешь что это false positive?»

Сборка по инструкции из `full-pipeline.md` секция 3.4:

1. **Production** (`{Name}-v{N}.zip`) — чистый код, без дебага
2. **Debug** (`{Name}-v{N}-debug.zip`) — + `debugcheck.js` в `<head>` после sdk.js
3. **Marketing** (`{Name}-v{N}-marketing.zip`) — + `cheats.js` с игроспецифичными кнопками перед `</body>`

Из `WorkProgress/{GameName}/` → в `Release/{GameName}/`.

Если ВЕРДИКТ ❌ → НЕ собирать. Сначала исправить все FAIL.
