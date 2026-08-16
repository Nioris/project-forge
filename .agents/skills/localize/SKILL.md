---
name: localize
kind: tactical
description: "Локализация: режим АРХИТЕКТУРА (дефолт конвейера — словарь I18N.ru + t(), хардкод = дефект, черновик ТОЛЬКО русский по доктрине RU-only) и режим ДОБАВИТЬ ЯЗЫК (только по явной…"
---
# Локализация — Пошаговая инструкция

## Проблема
Локализация = самая ошибкопронная часть пайплайна. 13 языков × десятки ключей = сотни строк.
Делать всё за один проход НЕЛЬЗЯ — Claude теряет контекст и пропускает ключи.

## Правила

1. **Работай ПОШАГОВО.** Каждый шаг — маленький, проверяемый.
2. **После каждого шага** запусти `node scripts/verify-i18n.mjs WorkProgress/{GameName}/` — исправь ВСЕ ❌.
3. **После каждого изменения кода** проверь синтаксис: `bash scripts/verify.sh WorkProgress/{GameName}/` — первая проверка в скрипте = SyntaxError. **Если SyntaxError — игра НЕ запустится. Исправь НЕМЕДЛЕННО.**
3. **var _lang, НЕ let _lang.** `let` не создаёт `window._lang` → чит-панель и YG скриншотер не смогут переключить язык.
4. **Игровые данные (названия ресурсов, зданий и т.д.)** — переводятся через `td()` и `DATA_EN`, НЕ через I18N.
5. **Fallback по правилам Яндекса:** `be/kk/uk/uz` → `ru`, все остальные неподдерживаемые → `en`.
6. **Автоопределение (п. 2.14):** через `ysdk.environment.i18n.lang` (язык портала), НЕ `browser.lang` и НЕ `navigator.language`. Обязательно во **ВСЕХ** играх — даже если заявлен один язык или текстов нет вообще (Яндекс это явно требует).
7. **detectLang() на СТАРТЕ, до начала игрового процесса** (не «в процессе игры»). Модерация смотрит на debug-индикатор 文: он должен стать зелёным НА СТАРТЕ, а не после нажатия «Играть». Точный критерий (как в debugcheck): язык определён ДО первого взаимодействия игрока, не «до первого рендера». **Допустим небольшой интервал**: на старте загрузочный текст может кратко мелькнуть на другом языке, пока язык подгружается — это ОК (не нужно делать UI «сразу» на нужном языке любой ценой). Практично: вызывать detectLang() до/около LoadingAPI.ready(), до игрового экрана.
8. **Ручной выбор языка (п. 6.9):** если есть UI переключения — иконки (глобус 🌐, флаги 🇬🇧🇷🇺), НЕ текст на конкретном языке. Чтобы пользователь мог найти переключатель не зная текущего языка.
9. **setLang() ОБЯЗАН перерисовать ТЕКУЩИЙ экран.** Если на экране катсцена — обновить текст катсцены. Если туториал — обновить шаг. Если магазин — обновить названия. Без этого переключение языка через YG скриншотер не работает. **НИКОГДА не говори «это ожидаемо» на кириллицу в FAIL/WARN — если скрипт нашёл, значит пользователь увидит русский текст при переключении.**
10. **Если verify нашёл кириллицу в data-массивах — НЕ СПРАШИВАЙ пользователя «проверь визуально». Это ТВОЯ работа. Сделай сам:**
    - Найди где этот массив рендерится (grep по имени массива + textContent/innerHTML/fillText)
    - Проверь что в месте рендера стоит `td()`: например `el.textContent = td(INTRO[step].text)`
    - Проверь что `setLang()` вызывает перерисовку этого экрана если он сейчас активен
    - Если `td()` нет → добавь. Если `setLang()` не перерисовывает → добавь.
    - Перезапусти verify → покажи результат → если 0 FAIL, скажи «готово»
    - **НЕ ПРЕДЛАГАЙ пользователю «переключи язык и посмотри».** Пользователь проверит сам когда захочет. Твоя задача — чтобы код был правильный.
11. **t() и td() ЗАПРЕЩЕНЫ на верхнем уровне скрипта.** Вызов `t()` вне функции выполняется ОДИН РАЗ при загрузке, когда `_lang` ещё `'ru'` (дефолт). Результат замораживается навсегда — переключение языка его НЕ обновит. Примеры БАГОВ:
    ```js
    // ❌ БАГ: t() вызывается при загрузке, _lang='ru', результат заморожен
    const tutSteps = [ {text: t('tut_1_desktop')} ];
    const TITLE = t('game_title');
    el.innerHTML = t('start_objective');  // на верхнем уровне скрипта

    // ✅ ПРАВИЛЬНО: t() внутри функции, выполняется при каждом рендере
    function getTutSteps() { return [ {text: t('tut_1_desktop')} ]; }
    function renderTitle() { el.textContent = t('game_title'); }
    ```
    **Правило:** Каждый `t()` и `td()` должен быть внутри функции. Верхний уровень = баг. verify-i18n проверяет это автоматически.
12. **Паттерн onLangChange() — ОБЯЗАТЕЛЕН.** Каждая функция которая ставит текст через `t()`/`td()` ОБЯЗАНА зарегистрировать обновление:
    ```js
    // ❌ БАГ: текст не обновится при смене языка
    function showTip() { tipEl.textContent = t('tip_1'); }

    // ✅ ПРАВИЛЬНО: текст обновится автоматически
    function showTip() {
      var update = function() { tipEl.textContent = t('tip_1'); };
      update();                  // отрисовать сейчас
      onLangChange(update);      // обновлять при смене языка
    }
    function hideTip() { offLangChange(update); }
    ```
    Без `onLangChange()` переключение языка НЕ обновит текст на экране. Это касается: туториала, катсцен, подсказок на загрузке, брифинга, магазина, меню паузы, экрана смерти, экрана победы — ВСЕГО что показывает текст через `t()`/`td()`. verify-i18n проверяет наличие `_langListeners`/`onLangChange`.

---

## ШАГ 1: Найти ВСЕ отображаемые строки

Grep по коду. Записать ПОЛНЫЙ список. Не пропустить:

```bash
# Найти все хардкод строки в display-контекстах:
grep -n "textContent\s*=\s*['\"]" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -50
grep -n "innerText\s*=\s*['\"]"  WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -50
grep -n "innerHTML\s*=\s*['\"]"  WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -50
grep -n "fillText\s*(\s*['\"]"   WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -50
grep -n "placeholder\s*=\s*['\"]" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -20
grep -n "title\s*=\s*['\"]"     WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -20
grep -n "spawnTxt\|showNotify\|showToast\|\.value\s*=" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -20

# Также в HTML-разметке:
grep -n ">[а-яА-ЯёЁ]" WorkProgress/{GameName}/index.html | grep -v "<script\|<style\|<!--" | head -30

# CSS content: (::before/::after псевдоэлементы):
grep -n "content:" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -10

# Склейки строк ('Уровень ' + level):
grep -n "+'[а-яА-ЯёЁ]\|[а-яА-ЯёЁ]'+" WorkProgress/{GameName}/index.html | head -20

# HTML атрибуты (placeholder, title, alt):
grep -n 'placeholder="\|title="\|alt="' WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -10

# Текст рекламных кнопок:
grep -n "реклам\|Смотреть\|Получи\|reward" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]" | head -10
```

Составить список:
```
UI-СТРОКИ (будут через t()):
  1. 'Играть'        → t('play')
  2. 'Настройки'     → t('settings')
  3. 'Продолжить'    → t('continue')
  ...

ИГРОВЫЕ ДАННЫЕ (будут через td()):
  1. 'Камень'        → td('Камень')   // DATA_EN: 'Камень': 'Stone'
  2. 'Деревянный дом'→ td('Деревянный дом')
  ...
```

**Не пропусти:** toast-сообщения, ошибки, placeholder, тексты в canvas (fillText), popup, подсказки, описания апгрейдов, квесты, диалоги.

**⚠️ САМОЕ ЧАСТО ПРОПУСКАЕМОЕ — массивы данных с текстом:**
```bash
# Диалоги, катсцены, квесты, миссии — ищи кириллицу в массивах:
grep -n "text:" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]{5,}" | head -30
grep -n "desc:" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]{5,}" | head -20
grep -n "\.text\s*=" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]{5,}" | head -20
# Если есть DIAL, QUEST_CHAINS, MISSIONS, CUTSCENES и т.п. — ВСЕ строки через td()
```
Эти строки verify-i18n.mjs теперь ловит, но Claude часто забывает про них.

**ВЫХОД:** Полный пронумерованный список строк. Записать количество: UI = N, Data = M.

---

## ШАГ 2: Создать инфраструктуру i18n

Добавить в код:

```javascript
// ═══ I18N ═══
var _lang = 'ru'; // ОБЯЗАТЕЛЬНО var, НЕ let! (чит-панель и расширение меняют через window._lang)

function t(key) {
  const block = I18N[_lang] || I18N.en || I18N.ru;
  return (block && block[key]) || (I18N.ru && I18N.ru[key]) || key;
}

function td(key) {
  if (_lang === 'ru') return key; // Русские данные = оригинал
  return (DATA_EN && DATA_EN[key]) || key;
}

// Яндекс fallback: be/kk/uk/uz → ru, остальные → en (документация Яндекс Игр)
const LANG_FALLBACK = { be:'ru', kk:'ru', uk:'ru', uz:'ru' };

function detectLang() {
  // ⚠️ ПОРЯДОК КРИТИЧЕН (кейс tyl): Яндекс ВСЕГДА добавляет &lang= в URL iframe.
  // Если URL-параметр проверять ПЕРВЫМ — до чтения ysdk.environment.i18n.lang код
  // не доходит НИКОГДА → debug-панель Яндекса показывает "I18n is not used" → риск
  // отказа по 2.14 (автоопределение обязано идти через SDK). SDK — ПЕРВЫМ.

  // 1. SDK (обязательно по п. 2.14 — и само ЧТЕНИЕ регистрируется панелью Яндекса)
  if (typeof ysdk !== 'undefined' && ysdk.environment) {
    const sdkLang = ysdk.environment.i18n.lang; // язык ПОРТАЛА, не браузера
    if (I18N[sdkLang]) { _lang = sdkLang; }
    else if (LANG_FALLBACK[sdkLang] && I18N[LANG_FALLBACK[sdkLang]]) { _lang = LANG_FALLBACK[sdkLang]; }
    else { _lang = 'en'; }
    return;
  }

  // 2. URL параметр (ТОЛЬКО локальное тестирование без SDK: file:// или dev-сервер)
  const urlLang = new URLSearchParams(location.search).get('lang');
  if (urlLang && I18N[urlLang]) { _lang = urlLang; return; }

  // 3. Браузер (dev-mode fallback, когда SDK недоступен)
  const navLang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  if (I18N[navLang]) { _lang = navLang; }
  else if (LANG_FALLBACK[navLang] && I18N[LANG_FALLBACK[navLang]]) { _lang = LANG_FALLBACK[navLang]; }
  else { _lang = 'en'; }
}

function setLang(lang) {
  _lang = lang;
  // Сбросить UI-кеш если есть (KNOWN_ISSUES #1):
  if (typeof lastUIHash !== 'undefined') lastUIHash = '';
  if (typeof lastHash !== 'undefined') lastHash = '';
  applyStaticLang();
  // Перерисовать ВСЕ активные экраны через слушатели
  _langListeners.forEach(function(fn) { try { fn(); } catch(e) {} });
  // RTL для арабского
  document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
}

// ═══ ПАТТЕРН-СЛУШАТЕЛЬ для реалтайм переключения языка ═══
// 
// ПРОБЛЕМА: Claude Code добавляет экраны (туториал, катсцены, подсказки)
// но КАЖДЫЙ РАЗ забывает добавить их обновление в setLang().
// Результат: при переключении языка старый текст остаётся на экране.
//
// РЕШЕНИЕ: каждый экран РЕГИСТРИРУЕТ себя. setLang() вызывает всех автоматически.
//
var _langListeners = [];
function onLangChange(fn) { if (_langListeners.indexOf(fn) === -1) _langListeners.push(fn); }
function offLangChange(fn) { _langListeners = _langListeners.filter(function(f) { return f !== fn; }); }
//
// ИСПОЛЬЗОВАНИЕ — каждый экран при показе регистрирует свой рендер:
//
//   function showTutorial() {
//     tutorialVisible = true;
//     renderTutStep();                    // отрисовать сейчас
//     onLangChange(renderTutStep);        // обновлять при смене языка
//   }
//   function hideTutorial() {
//     tutorialVisible = false;
//     offLangChange(renderTutStep);       // убрать слушатель
//   }
//
//   function showCutscene(idx) {
//     renderCutsceneFrame(idx);
//     onLangChange(function() { renderCutsceneFrame(idx); });
//   }
//
//   // Подсказки на загрузке:
//   function showLoadingTip() {
//     tipEl.textContent = t(tips[tipIdx]);
//     onLangChange(function() { tipEl.textContent = t(tips[tipIdx]); });
//   }
//
// ПРАВИЛО: Если функция ставит текст через t()/td() — она ОБЯЗАНА
// вызвать onLangChange() с функцией обновления этого текста.
// Без исключений. Это единственный способ гарантировать реалтайм.

function applyStaticLang() {
  // Обновить ВСЕ статические HTML-элементы
  // Пример:
  // const $ = id => document.getElementById(id);
  // $('playBtn').textContent = t('play');
  // $('settingsBtn').textContent = t('settings');
  // ... (добавлять по мере обёртки строк)
}
```

**ВЫХОД:** Инфраструктура готова, `setLang('es')` из чит-панели будет работать.

---

## ШАГ 3: Создать I18N.ru со ВСЕМИ ключами

Сначала ТОЛЬКО русский блок. Все ключи из списка Шага 1:

```javascript
I18N.ru = {
  play: 'Играть',
  settings: 'Настройки',
  continue_: 'Продолжить',
  // ... ВСЕ ключи из списка
};
```

**Запустить проверку:**
```bash
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
```
Убедиться: `I18N.ru: N keys — OK`.

---

## ШАГ 4: Обернуть строки в t() / td() в коде

Заменить каждую хардкод строку:

```javascript
// БЫЛО:
el.textContent = 'Играть';
// СТАЛО:
el.textContent = t('play');

// БЫЛО:
ctx.fillText('Камень', x, y);
// СТАЛО:
ctx.fillText(td('Камень'), x, y);
```

Заполнить `applyStaticLang()` для HTML-элементов.

**КРИТИЧНО — реалтайм обновление при смене языка:**
Каждая функция `show*()`/`render*()` которая ставит текст через `t()`/`td()` ОБЯЗАНА содержать `onLangChange()`:

```javascript
// Туториал:
function showTutorial() {
  renderTutStep();             // рисуем сейчас
  onLangChange(renderTutStep); // обновлять при смене языка
}
function closeTutorial() { offLangChange(renderTutStep); }

// Катсцена:
function renderCutscene(idx) {
  textEl.innerHTML = td(SCENES[idx].text);
  onLangChange(function() { textEl.innerHTML = td(SCENES[idx].text); });
}

// Подсказки на загрузке:
function showTip(i) {
  tipEl.textContent = t(TIPS[i]);
  onLangChange(function() { tipEl.textContent = t(TIPS[i]); });
}

// Экран смерти / победы / паузы / брифинга — КАЖДЫЙ:
function showDeathScreen() {
  deathText.textContent = t('you_died');
  onLangChange(function() { deathText.textContent = t('you_died'); });
}
```

**Правило: если функция вызывает `t()` или `td()` — она вызывает `onLangChange()`. Без исключений.**

**Запустить проверку:**
```bash
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
# Должно быть: "No hardcoded Cyrillic in display contexts"
# Должно быть: "N onLangChange registrations" (N > 0)
# Если ❌ — обернуть пропущенные строки
```

---

## ШАГ 5: I18N.en — английский перевод

Скопировать I18N.ru → I18N.en, перевести ВСЕ значения:

```javascript
I18N.en = {
  play: 'Play',
  settings: 'Settings',
  continue_: 'Continue',
  // ... КАЖДЫЙ ключ из I18N.ru должен быть здесь
};
```

Если есть td() → создать DATA_EN:
```javascript
const DATA_EN = {
  'Камень': 'Stone',
  'Деревянный дом': 'Wooden House',
  // ... каждая игровая строка
};
```

**Запустить проверку:**
```bash
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
# I18N.en: N keys — OK
# DATA_EN found — OK
```

---

## ШАГ 6: Остальные 11 языков — ПОРЦИЯМИ

⚠️ НЕ делать все 11 за раз. Делать по 3-4 языка, проверять после каждой порции.

**Порция 1: es, tr, pt**
```javascript
I18N.es = { play: 'Jugar', settings: 'Ajustes', continue_: 'Continuar', ... };
I18N.tr = { play: 'Oyna', settings: 'Ayarlar', continue_: 'Devam', ... };
I18N.pt = { play: 'Jogar', settings: 'Configurações', continue_: 'Continuar', ... };
```

```bash
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
# Все 3 — OK? Следующая порция.
```

**Порция 2: ar, id, fr**
```javascript
I18N.ar = { play: 'لعب', settings: 'الإعدادات', continue_: 'متابعة', ... };
I18N.id = { play: 'Main', settings: 'Pengaturan', continue_: 'Lanjut', ... };
I18N.fr = { play: 'Jouer', settings: 'Paramètres', continue_: 'Continuer', ... };
```

```bash
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
```

**Порция 3: ja, it, de**
```javascript
I18N.ja = { play: 'プレイ', settings: '設定', continue_: '続ける', ... };
I18N.it = { play: 'Gioca', settings: 'Impostazioni', continue_: 'Continua', ... };
I18N.de = { play: 'Spielen', settings: 'Einstellungen', continue_: 'Weiter', ... };
```

```bash
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
```

**Порция 4: hi, zh**
```javascript
I18N.hi = { play: 'खेलें', settings: 'सेटिंग्स', continue_: 'जारी रखें', ... };
I18N.zh = { play: '开始', settings: '设置', continue_: '继续', ... };
```

```bash
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
# ВСЕ 13 — OK? Локализация готова.
```

---

## ШАГ 7: Финальная проверка

```bash
# 1. Скрипт верификации
node scripts/verify-i18n.mjs WorkProgress/{GameName}/
# Должно быть 0 FAIL

# 2. Проверить переключение работает (для чит-панели / расширения):
grep -n "var _lang" WorkProgress/{GameName}/index.html
# Должен найти "var _lang" (НЕ let, НЕ const)

grep -n "function setLang\|function applyStaticLang" WorkProgress/{GameName}/index.html
# Должен найти обе функции

grep -n "lastUIHash\|lastHash" WorkProgress/{GameName}/index.html
# Если найден — проверить что сбрасывается в setLang()

# 3. Canvas-текст (скрипты не видят — проверить вручную):
grep -n "fillText\|strokeText" WorkProgress/{GameName}/index.html | grep -v "debugcheck\|cheats" | head -20
# Каждый аргумент должен быть через t()/td(), НЕ хардкод строка

# 4. Туториальные и диалоговые данные:
grep -n "text:" WorkProgress/{GameName}/index.html | grep -P "[а-яА-ЯёЁ]{5,}" | head -20
# Если есть кириллица — обернуть в td()
```

**⚠️ ВАЖНО: Скрипты НЕ заменяют визуальную проверку.**
Сказать пользователю: «Переключи язык в YG скриншотере на TR/ZH/AR и пройди все экраны: меню → туториал → геймплей → паузу → магазин → конец уровня. Если видишь смесь языков — скажи какой экран, я исправлю.»

---

## Чеклист для Claude Code (скопируй себе)

После КАЖДОГО файла с локализацией — пройти:

```
□ var _lang (НЕ let, НЕ const)
□ _langListeners + onLangChange() + offLangChange() определены
□ setLang() вызывает _langListeners.forEach(fn => fn())
□ Каждый show*() / render*() с t()/td() вызывает onLangChange(updateFn)
□ Нет t()/td() на верхнем уровне скрипта (всё внутри функций)
□ detectLang() на старте, ДО игрового процесса (до/около LoadingAPI.ready); индикатор 文 зелёный на старте (п. 2.14)
□ Автоопределение через SDK реализовано ДАЖЕ если игра одноязычная / без текстов (п. 2.14)
□ detectLang() использует ysdk.environment.i18n.lang (не navigator.language)
□ Fallback: be/kk/uk/uz → ru, остальные → en
□ setLang() сбрасывает UI-кеш (lastUIHash = '')
□ applyStaticLang() обновляет ВСЕ HTML-элементы с текстом
□ Нет русского текста в HTML — всё через JS в applyStaticLang()
□ ?lang=xx работает (URL параметр для тестирования)
□ RTL для Arabic (dir='rtl')
□ CJK font fallback
□ Все fillText/strokeText аргументы через t()/td()
□ Катсцены/диалоги/туториал — все .text/.desc через td()
□ node scripts/verify-i18n.mjs → 0 FAIL
```

## Типичные ошибки Claude (НЕ ПОВТОРЯТЬ)

1. **Пропущенные ключи** — добавил ключ в I18N.ru и I18N.en, забыл в I18N.tr. Решение: копировать ВЕСЬ блок и менять значения.
2. **let _lang** — YG скриншотер делает `window._lang = 'es'`, но `let` не создаёт свойство на window. Решение: всегда `var`.
3. **Забыл сбросить UI-кеш** — `setLang()` меняет `_lang`, но `ui()` видит тот же хеш и не перерисовывает. Решение: `lastUIHash = ''` в `setLang()`.
4. **Хардкод в canvas** — `ctx.fillText('Камень', x, y)` не ищется grep'ом по textContent. Решение: grep по fillText отдельно.
5. **Toast/notify строки** — `showToast('Сохранено!')` — самые часто пропускаемые. Решение: grep по showToast, showNotify, spawnTxt.
6. **Строки в шаблонных литералах** — `` el.innerHTML = `<b>${name}</b> найден!` `` — «найден!» не обёрнут. Решение: `` el.innerHTML = `<b>${name}</b> ${t('found')}` ``.
7. **Все 11 языков за один проход** — к 8-му языку забыл ключи. Решение: по 3-4 языка, verify между порциями.
8. **Катсцены / диалоги / туториал** — массивы типа `DIAL=[{text:'Меня зовут...'}]` или `TUTORIAL=[{text:'перемещение'}]` — Claude пропускает потому что это «данные, не UI». Решение: grep по `text:` и `desc:` с кириллицей, ВСЕ обернуть в `td()`.
9. **Смесь языков на одном экране** — часть UI на китайском, часть на русском/английском. Это РЕДЖЕКТ. Причина: строки из разных источников (t() переведено, но данные из массива нет). Решение: КАЖДЫЙ отображаемый текст должен проходить через t() или td(). Переключить язык в YG скриншотере и ВИЗУАЛЬНО проверить каждый экран.
10. **Canvas-текст невидим для проверки** — `ctx.fillText(item.name, x, y)` где `item.name` = русская строка из массива. DOM-сканер и grep по textContent не найдут. Решение: grep по `fillText` и `strokeText`, проверить что каждый аргумент обёрнут в `td()` или уже переведён.
11. **CSS content:** — `.locked::after { content: 'Заблокировано' }` — CSS не переключается через `t()`. Решение: убрать текст из CSS, поставить через JS в `applyStaticLang()`.
12. **Склейка строк** — `'Уровень ' + level + ' из ' + total` — каждый фрагмент текста должен быть через `t()`: `t('level') + ' ' + level + ' ' + t('of') + ' ' + total`. Grep по `+'` с кириллицей.
13. **HTML атрибуты** — `placeholder="Введите имя"`, `title="Инвентарь"`, `alt="Карта"` — не видны в grep по textContent. Решение: в `applyStaticLang()` поставить `el.placeholder = t('enter_name')`.
14. **Текст рекламных кнопок** — `'📺 Смотреть рекламу → +50 монет'` — нужно перевести и «Смотреть рекламу» и «монет». Решение: `t('watch_ad') + ' → +' + amount + ' ' + t('coins')`.
15. **setLang() не перерисовывает текущий экран** — самая коварная ошибка. `td()` правильно возвращает перевод, но катсцена/туториал уже отрисованы и `setLang()` их не обновляет. Пользователь переключает язык в YG скриншотере — видит русский текст. Claude говорит «это ожидаемо» — это НЕ ожидаемо, это баг. Решение: в `setLang()` добавить перерисовку каждого динамического экрана если он сейчас активен.
16. **SyntaxError после редактирования** — Claude добавил I18N блок, пропустил запятую или скобку → игра не запускается, но Claude говорит «✅ ГОТОВО». Решение: ВСЕГДА после редактирования запускай `bash scripts/verify.sh` — первая проверка в нём = синтаксис. Если SyntaxError → ИГРА МЕРТВА.
17. **Ключи NARRATIVE не совпадают с исходными строками** — в INTRO текст содержит реальный `\n` (перенос строки), а в NARRATIVE_EN ключ содержит `\\n` (два символа). `td()` ищет точное совпадение → не находит → возвращает русский текст. Решение: в `td()` нормализовать переносы перед поиском: `var key = text.replace(/\n/g, '\\n');` ИЛИ при создании NARRATIVE убедиться что ключи точно совпадают с исходными строками.
18. **HTML хардкод со смешанным текстом** — `<div>WASD — движение · МЫШЬ — фонарь</div>` — строка начинается с латиницы, поэтому простой regex `>[а-яА-ЯёЁ]` не ловит. Решение: regex `>[^<]*[а-яА-ЯёЁ]{2,}` (кириллица где-то между `>` и `<`). Все HTML-текстовые ноды нужно рендерить через JS `el.innerHTML = t('key')` в `applyStaticLang()`.
19. **Меню рендерится до setLang()** — I18N ключи ЕСТЬ во всех языках, но `t()` возвращает русский. Причина: `showMenu()` вызван до того как Yandex SDK вернул язык и `setLang()` отработал. Решение: не показывать UI до завершения `setLang()`, ИЛИ вызвать `setLang()` синхронно с дефолтным языком, а после SDK — перерисовать.
20. **Yandex SDK lang-код не совпадает с ключом I18N** — SDK может вернуть `'zh'` (Hans) / `'zh-TW'` / `'zh-CN'`, а в I18N блок называется `I18N.zh`. `detectLang()` должен нормализовать: `'zh-CN'` → `'zh'`, `'zh-TW'` → `'zh'`, `'pt-BR'` → `'pt'` и т.д. Проверь: `console.log('SDK lang:', raw, '→ mapped:', _lang)` в detectLang().

**Аргумент:** `$1 = код языка (en, tr...)` — Claude Code подставляет $1 из команды (с июля 2026 плейсхолдеры не съедаются); аргумента нет → спроси пользователя.

## ⚠️ ДВА РЕЖИМА (v4.33 — доктрина RU-only)

**Режим 1 — АРХИТЕКТУРА (дефолт, часть конвейера):** игра RU-only. Задача скила: все строки
игрока в словарь I18N.ru (ключ→слово), t() везде, хардкод = дефект, detectLang SDK-first.
Черновик заявляет ТОЛЬКО русский. Переводов НЕ делать.

**Режим 2 — ДОБАВИТЬ ЯЗЫК (только явная команда «$localize en» от пользователя):** перевести
словарь на указанный язык, снять скрины этого языка (promo-screens ?lang=xx), добавить
языковые тексты листинга, язык в черновик. По одному языку за команду.
