---
name: fill-yandex
kind: tactical
description: "Заполнение карточки игры для Яндекс Игр: описание, как играть, категория, теги, ключевые слова, возраст, локализованные JSON на 13 языков, SETUP_GUIDE (лидерборды, IAP, реклама), rodrik-import.json, арт-промпты. Все в StoreData/. Triggers on: fill yandex, заполни яндекс, карточка яндекс, листинг яндекс, описание яндекс игры, yandex games listing, подготовь для яндекса, оформление яндекс."
---

# Fill Yandex — Карточка игры для Яндекс Игр

## Цель
Подготовить ВСЕ данные для консоли Яндекс Игр. Результат — папка `StoreData/` со всеми файлами которые пользователь копирует в консоль поле за полем.

---

## Step 1: Анализ игры

Прочитать код, wiki/_map.md. Ответить:

1. Жанр и механика (одно предложение)
2. Что делает игрок? (core loop)
3. Управление: ПК (какие клавиши) + мобилка (тач/свайп/джойстик)
4. Уникальная фишка (чем цепляет за 3 секунды)
5. Какие SDK фичи используются: сохранения, лидерборды, IAP, реклама
6. Сколько языков локализовано

## Step 2: Поля черновика консоли

⚠️ **MANDATORY — read reference files first** (v4.10.21+):

```bash
cat .claude/skills/fill-yandex/reference/yandex-categories-full.md
cat .claude/skills/fill-yandex/reference/yandex-tags-full.md
cat .claude/skills/fill-yandex/reference/yandex-fields-constraints.md
```

Эти файлы — **единственный источник правды** про валидные значения категорий, тегов И field constraints в Yandex Console. Snapshot с реальной консоли.

### Категории — 25 валидных (multi-select, 1-3 на игру)

Полный список читай в `reference/yandex-categories-full.md`. Кратко (для удобства, но **проверяй reference файл если сомневаешься**):

```
Боевики, Викторины, Головоломки, Гонки, Детские, Для двоих,
Для девочек, Для мальчиков, Игры .io, Казино, Казуальные,
Карточные, Мидкорные, Настольные, Новеллы, Обучающие,
Приключения, Ролевые, Симуляторы, Спорт, Стратегии,
Три в ряд, Хорроры, Шарики, Экономические
```

Mapping популярных жанров → реальные категории:

| Жанр (как обычно думают) | Реальные Yandex категории |
|---|---|
| idle / clicker | `["Экономические", "Казуальные"]` (НЕ "Клик-тап" — такой нет!) |
| tycoon / business sim | `["Экономические", "Симуляторы"]` |
| match-3 / bejeweled | `["Три в ряд", "Головоломки"]` |
| RPG / JRPG | `["Ролевые", "Приключения"]` |
| FPS shooter | `["Боевики"]` |
| visual novel | `["Новеллы"]` |
| platformer | `["Приключения", "Боевики"]` |
| farming sim | `["Симуляторы", "Экономические"]` |
| roguelike | `["Приключения", "Ролевые"]` |
| .io multiplayer | `["Игры .io"]` |
| horror | `["Хорроры"]` |

Правило: 1-3 категории, ALWAYS array (даже если одна — `["Боевики"]`).

### Теги — 700+ валидных, MANDATORY use dictionary

⚠️ **Теги — closed vocabulary.** Yandex принимает только теги из своего словаря. Если попытаешься ввести `idle`, `clicker`, `simulator`, `СНГ`, `humor`, `multiplayer` — Console их **не сохранит** (или сохранит как ошибку).

Полный список (~700 тегов) — в `reference/yandex-tags-full.md`. Перед добавлением тега в JSON — **проверь** что он там есть.

**Common AI mistakes (что AI invents неправильно):**

| AI пишет | Правильно (из словаря) |
|---|---|
| `idle` / `clicker` | `тапалки`, `бесконечные`, `с прокачкой` |
| `tycoon` | `магнат`, `бизнес`, `денежные`, `с менеджментом` |
| `simulator` | (нет такого тега! только категория) — use specific: `с менеджментом`, `строительные` |
| `СНГ` / `russian` | `на русском`, `мемы` |
| `humor` / `юмор` | `мемы`, `веселые` |
| `multiplayer` | `мультиплеер` (с маленькой буквы) |
| `casual` | `казуальные` is category, теги: `простые`, `расслабляющие`, `увлекательные` |
| `meme` | `мемы`, `брейнрот` |
| `russian-folk` / `slavic` | `на русском`, `мемы`, `мистика` |

**Optimal: 8-15 тегов.** Mix: жанр + механика + сеттинг + настроение + technical (`на русском`, `браузерные`, `мобильные`, `без скачивания`).

### Ключевые слова — НЕТ в Yandex Console

⚠️ **В Yandex Console поля "ключевые слова через запятую" НЕТ.** Это field только для Forge internal tracking + RuStore (где он есть) + PWA meta description.

Если генерируешь только Yandex JSON — `keywords` array можно omit, или включить с RuStore-целью (когда тот же листинг будет использован).

Если включаешь keywords — это **multi-word фразы** (2-5 слов), отличаются от tags (single words из словаря):

```
keywords: [
  "симулятор самогонщика онлайн",
  "идл игра про самогон бесплатно",
  "тапалка с прокачкой 2026 браузер",
  ...
]
```

### SEO description — НЕТ в Yandex Console

То же что keywords — Yandex Console этого поля не имеет. Forge использует для PWA meta + share previews. **Optional**.

### Поддерживаемые платформы
- Десктоп (ПК)
- Мобильные устройства
- Всё (если игра адаптирована под оба)

### Ориентация
- Портретная
- Альбомная
- Обе

### Возрастной рейтинг
- 0+ (нет насилия, крови, ругательств)
- 6+ (мягкое насилие без крови)
- 12+ (битвы с лёгкой кровью, лёгкий юмор)
- 16+ (насилие, кровь, сложные темы)
- 18+ (жёсткое насилие, ужасы)

### Облачные сохранения
- Да (если используется player.setData/getData)

## Step 3: Описание (на каждом из локализованных языков)

### Об игре (до 1000 символов)

```
СТРУКТУРА:
{Хук — одно предложение которое ЦЕПЛЯЕТ}
{Пустая строка}
{Что делает игрок — 2-3 предложения о core loop}
{Пустая строка}
{Фичи — 3-5 предложений о ключевых механиках}
{Пустая строка}
{Вопрос-вызов или призыв}

ПРАВИЛА:
- Первое предложение = хук. НЕ "Это аркадная игра". А "Ты — единственный выживший посреди океана"
- Без технического жаргона (нет SDK, WebGL, Canvas)
- Писать от второго лица ("ты", "собирай", "строй")
- Уникальные фичи конкретно: "Исследуй 5 веток технологий" а не "много контента"
- Конкретные числа: "100 000 метров", "14 инструментов", "5 веток"
- Последняя строка — вопрос-вызов: "Доберёшься ли до Маяка?"
```

### Как играть (до 1000 символов)

```
СТРУКТУРА:
**Управление (ПК):** {клавиши}
**Управление (Мобильные):** {тач/свайп/джойстик}

{Пустая строка}
**Советы:** или **Основы:**
• {совет 1 — самое важное для новичка}
• {совет 2}
• {совет 3}
• {совет 4}
• {совет 5}

ПРАВИЛА:
- Обязательно ОБОРУДОВАНИЕ отдельно для ПК и мобилки
- Советы = не описание фич, а ПОМОЩЬ новичку выжить первые 2 минуты
- Конкретно: "Построй кухню первой — голод убивает быстрее пиратов"
- НЕ описывать все механики — только стартовые
```

## Step 4: Локализованные JSON-файлы (13 языков)

Создать JSON для КАЖДОГО языка. Формат:

```json
{
  "lang": "RU",
  "title": "{Название игры}",
  "subtitle": "{ПОДЗАГОЛОВОК КАПСОМ}",
  "category": "{Категория на этом языке}",
  "tags": ["тег1", "тег2", "тег3", "тег4", "тег5"],
  "keywords": ["ключ фраза 1", "ключ фраза 2", "..."],
  "seo_description": "{SEO описание до 160 символов}",
  "about": "{Об игре — перевод русского текста}",
  "how_to_play": "{Как играть — перевод}"
}
```

### Обязательные языки (13 штук):

| Файл | Язык | Код |
|------|------|-----|
| store-listing-ru.json | Русский | RU |
| store-listing-en.json | Английский | EN |
| store-listing-es.json | Испанский | ES |
| store-listing-tr.json | Турецкий | TR |
| store-listing-pt.json | Португальский | PT |
| store-listing-ar.json | Арабский | AR |
| store-listing-id.json | Индонезийский | ID |
| store-listing-fr.json | Французский | FR |
| store-listing-ja.json | Японский | JA |
| store-listing-it.json | Итальянский | IT |
| store-listing-de.json | Немецкий | DE |
| store-listing-hi.json | Хинди | HI |
| store-listing-zh.json | Китайский | ZH |

```
ПРАВИЛА ПЕРЕВОДА:
- Название игры НЕ переводить (оставить латиницей)
- Subtitle — перевести КАПСОМ
- Категория — на языке локализации
- Теги — на языке локализации (пользователи ищут НА СВОЁМ языке)
- about и how_to_play — полный перевод, НЕ машинный
- Управление: WASD не переводить, но описание кнопок — да
- Локальные единицы: метры везде, но формат чисел по locale
```

## Step 5: SETUP_GUIDE.md

⚠️ **MANDATORY** — это **финальный документ который читает разработчик при загрузке игры в Yandex Console.** Должен покрывать ВСЁ что разработчик должен сделать в Console. Если skill ленится и пропускает поля — разработчик упустит настройки.

⚠️ **MANDATORY READ** перед заполнением (как Step 2):
- `reference/yandex-categories-full.md` — для секции категорий в guide
- `reference/yandex-tags-full.md` — для секции тегов в guide

SETUP_GUIDE.md **дублирует** конкретные значения из store-listing JSON и reference files. **Не пиши "выбери подходящие категории"** — пиши конкретные значения с галочками для разработчика-checklist'а.

### Структура (17 секций — все обязательны)

```markdown
# {Game Name} — Setup Guide для Yandex Developer Console

> Версия: **v{N}**
> Source-of-truth: `Release/{Project}/yandex/`

## 1. Загрузка архива

**Production ZIP:** `{name}-v{N}.zip` ({size} KB)

Содержимое:
- `index.html` в корне
- `yandex-sdk-wrapper.js` рядом
- Чистая игра, без debugcheck/cheats

**ВАЖНО:** в Yandex Console загружать **именно production ZIP**.
- `*-debug.zip` ({size} KB) — для draft-теста с panel Ctrl+Shift+2
- `*-marketing.zip` ({size} KB) — для скриншот-снимков с cheats

## 2. Языки

Игра локализована на **{RU/EN/TR/...}** (Phase A — UI strings).
{Если есть stub aliases:} Build expandит {N} stub lang aliases (es/pt/fr/...) копиями {основной EN/RU} для прохождения Yandex debugcheck «All 13 languages» проверки.

## 3. Карточка игры — Store listing

Source-of-truth файлы:
- `Release/{Project}/store-listing-ru.json`
- `Release/{Project}/store-listing-en.json`
{остальные языки}

Содержат: `title`, `subtitle`, `category` (массив), `tags` (массив), `keywords` (массив), `seo_description`, `about`, `how_to_play`.

### Ключевые слова через запятую (per language)

⚠️ **CORRECTED v4.10.30:** Yandex Console **ИМЕЕТ** поле "Ключевые слова через запятую" для каждой language карточки (v4.10.21-v4.10.29 mistakenly said "this field doesn't exist").

Source-of-truth: `keywords` array в store-listing-{lang}.json. Skill joins с ", " при submission.

Для каждой language карточки (RU/EN/TR/...) — копируй в Console «Ключевые слова через запятую»:

**RU:**
```
{keyword1_ru}, {keyword2_ru}, {keyword3_ru}, ..., {keywordN_ru}
```

**EN:**
```
{keyword1_en}, {keyword2_en}, {keyword3_en}, ..., {keywordN_en}
```

**TR:**
```
{keyword1_tr}, {keyword2_tr}, {keyword3_tr}, ..., {keywordN_tr}
```

Skill generates с long-tail phrases 2-5 слов each, 8-20 phrases per language.

### Описание SEO (опционально per lang)

Forge field `seo_description` — usable как Console "SEO description" если такое поле есть в текущей версии Console UI, OR для PWA meta description / share previews. Constraint: 50-160 chars single line. Verification status: TBD (ASSUMED based on Forge usage, не verified против real Console).

## 4. Категория и теги — реальные значения Yandex

### Категории (multi-select)

Полный список — `yandex/reference/yandex-categories-full.md` (25 категорий).

Для {ProjectName} отмечаем **{N} категории**:
- ☑ **{Категория1}** ← {обоснование, например "основная (idle про деньги)"}
- ☑ **{Категория2}** ← {обоснование}
- ☑ **{Категория3}** ← {обоснование}

❌ НЕ ставь: {категории которые AI часто invent'нул бы для этого жанра, но они не подходят}. Объясни почему.

### Теги (multi-select)

Полный словарь ~700 тегов — `yandex/reference/yandex-tags-full.md`.

Для {ProjectName} **{N} тегов** из реального Yandex-словаря:

```
{tag1}, {tag2}, {tag3}, {tag4}, {tag5},
{tag6}, {tag7}, {tag8}, {tag9}, {tag10},
{tag11}, {tag12}, {tag13}, {tag14}, {tag15}
```

❌ НЕ ставь (нет в словаре): `idle`, `clicker`, `tycoon`, `simulator`, `СНГ`, `humor`, `multiplayer`. Используй: `тапалки`/`магнат`/`мемы`/`на русском`/`мультиплеер`.

## 5. Возрастной рейтинг

**{12+/6+/16+/18+}** — {обоснование на основе содержимого}

## 6. Cloud Saves — {используем/не используем}

{Если да:}
**Да, интегрированы.** Source:
- `yandex-sdk-wrapper.js:{line}` — `setData(data, flush)` через `player.setData`
- `index.html:{lines}` — cloud-first load на startup, сравниваем `savedAt` с локальным, применяем newer
- Save triggers: {интервал} interval + `visibilitychange:hidden` + `beforeunload`

Payload ~{size} на игрока. В Yandex Console этого поля нет — cloud saves работают prog'но через SDK.

{Если нет:}
**Не используется.** Сохранения локальные (localStorage).

## 7. Лидерборды

{Если есть — таблица с **per-language display names** для копирования в Console:}

| Тех. имя | Тип | Сортировка | Имя RU | Имя EN | Имя TR | Описание RU | Описание EN |
|---|---|---|---|---|---|---|---|
| `totalEarned` | int | desc | Всего заработано | Total Earned | Toplam Kazanç | Кумулятивный доход за всё время | Cumulative income across all runs |
| `bestPrestige` | int | desc | Лучший престиж | Best Prestige | En İyi Prestij | Максимальный уровень за один прогон | Highest prestige in single run |
| ... | ... | ... | ... | ... | ... | ... | ... |

⚠️ **Тех. имя** — только латиница, без подчёркиваний, дефисов и пробелов.
⚠️ **Display names per language** — обязательно для всех языков карточки игры (RU/EN/TR/...). Не оставляй пустыми.
⚠️ **Длина display names** — TBD точный лимит (skill assumed 30 chars per name), keep concise.

В Yandex Console:
1. Game settings → Лидерборды → Создать
2. Введи **technical name** (`totalEarned`)
3. Выбери **type** (целые числа / float / время)
4. Выбери **sort** (по убыванию / по возрастанию)
5. **Для каждого языка** игры (RU, EN, TR, ...):
   - Display name (имя что видит игрок)
   - Description (опционально, но useful для clarity)

Source-of-truth: `rodrik-import.json` → `leaderboards` array. Skill auto-generates with localized names matched к store-listing-{lang}.json languages.

{Если нет:}
**Лидерборды не используются.**

## 8. Покупки (IAP)

{Если есть — таблица:}
| ID товара | Название | Цена YAN | Тип |
|---|---|---|---|
| `coins_100` | 100 монет | 10 | Consumable |

### Обработка покупок
- Каталог: `payments.getCatalog()`
- После покупки: начисление → `consumePurchase()` → сохранение
- Незавершённые покупки проверяются при запуске

{Если нет:}
**Real-money IAP не используется.** {Если есть soft currency — описать.} В Yandex Console раздел Catalog можно оставить пустым.

## 9. Реклама

- **Interstitial:** {где показывается, когда, cooldown}. REQ-4.4 compliant.
- **Rewarded:** {интегрировано / заглушка готова / не используется}.

Yandex SDK сам enforce'ит 60s cooldown между interstitials.

## 10. Иконка 1024×1024

Промпты для AI-генерации в `yandex/icon-prompts.md` (3 варианта: Midjourney / DALL-E / Stable Diffusion + Кандинский). Готовый PNG сохранить в `Release/{Project}/yandex/icon-1024.png`, загрузить через Console → Game settings → Icon.

**Требования:**
- 1024×1024 PNG
- БЕЗ прозрачности (opaque)
- БЕЗ UI элементов (clause 5.6)
- БЕЗ suggestive контента (clause 8.3.5)

## 11. Скриншоты

Минимум 5, рекомендуется 8. Промпты в `yandex/promo-screenshots-prompts.md`.

**Требования:**
- 16:9 (1280×720 минимум, идеально 1920×1080)
- PNG или JPG
- Реальный геймплей, не CGI
- Без watermarks/UI debugcheck'а

Готовые файлы сохранить в `Release/{Project}/yandex/screenshots/`.

## 12. Промо-акции (Скидки и акции)

{Если есть — карточки событий → `yandex/yandex-promo-events.md`. Запускаются через Yandex Console → Скидки и акции.}

{Если нет:}
Не используются в этой версии.

## 13. Чек-лист перед загрузкой

- [ ] Production ZIP залит (`{name}-v{N}.zip`)
- [ ] Store-listing заполнен по `store-listing-ru.json`
- [ ] Иконка 1024×1024 загружена (без UI, без transparency)
- [ ] Минимум 5 скриншотов загружены
- [ ] Категории: {категории через +} ({N} штук, multi-select)
- [ ] Теги: {N} штук из реального Yandex-словаря (см. §4)
- [ ] Возрастной рейтинг: {N}+
- [ ] Privacy Policy URL указан (для cloud saves)
- [ ] Игра вмещается в {limit} МБ (текущий {size} — {с запасом/впритык})
- [ ] runtime-test.mjs прошёл (`node scripts/runtime-test.mjs`)
- [ ] check-store-listing.mjs прошёл (`node scripts/check-store-listing.mjs StoreData/`)

## 14. Что делать если модератор отклонил

Запусти `/fix-moderation <текст замечания>` — skill разберёт причину и применит fix.

### Известные причины из past releases

- **REQ-1.19.2** — `LoadingAPI.ready()` слишком рано/поздно. Должен вызываться сразу после `await YandexSDK.init()`, до cloud loadData.
- **REQ-4.4** — реклама не из user-action. Только player-initiated клик.
- **REQ-8.2.1** — название с CAPS/эмоджи. Title должен быть чистым.
- **«Indicator stuck loading»** — ready/startGameplay должны быть перед cloud load.
- **«contextmenu не блокируется»** — дубль handler с `capture: true`.

## 15. Версии ZIP

| ZIP | Размер | Куда использовать |
|---|---|---|
| `{name}-v{N}.zip` | {size} KB | **Production** — заливать в Yandex Games консоль |
| `{name}-v{N}-debug.zip` | {size} KB | Внутренний QA. debugcheck.js (Ctrl+Shift+2). Для draft-теста. |
| `{name}-v{N}-marketing.zip` | {size} KB | Скриншоты для каталога. debugcheck + cheats-base. |

## 16. После релиза

- Обнови `wiki/deploy-log.md` и `wiki/changelog.md`
- Создай `wiki/plan/{TaskID}-yandex-v{N}-followup.md` для постмодерационных фиксов
- Активируй карточки промо-акций через 2-3 недели

## 17. Ссылки на reference-материалы

- `reference/yandex-categories-full.md` — все 25 категорий + mapping жанров
- `reference/yandex-tags-full.md` — все ~700 тегов + curated subset
- `icon-prompts.md` — AI prompts для иконки 1024×1024
- `promo-screenshots-prompts.md` — marketing card prompts
- `yandex-promo-events.md` — карточки для промо-акций
- `rodrik-import.json` — batch-import формат
- `../store-listing-{ru,en,tr,...}.json` — per-language listing (источник истины)
```

### Critical rules для skill при генерации SETUP_GUIDE

1. **Категории — ТОЧНЫЕ значения с галочками**, не "выбери подходящие". Скопируй из `store-listing-ru.json` `category` array.
2. **Теги — ВСЕ конкретные теги с обоснованием**, не "релевантные". Скопируй из `store-listing-ru.json` `tags` array.
3. **Цифры и размеры — реальные**, не {placeholders}. Прочитай размер production zip, размер payload, etc.
4. **Reference к reference files** — каждая секция категорий/тегов **должна** ссылаться на `yandex/reference/yandex-*.md`
5. **«Не используется» секции** — для лидербордов/IAP/cloud-saves если не интегрированы. **Не пропускай** секцию.
6. **Чек-лист 13.x** — actionable items с конкретными значениями, не общие "проверить настройки".
7. **Анти-паттерны** — обязательная секция в §4 что НЕ ставить (idle, tycoon, СНГ — все common AI mistakes из reference/yandex-tags-full.md).

## Step 6: rodrik-import.json

Формат для импорта в Rodrik Studio (трекер проектов):

```json
{
  "description": "{Краткое описание игры}",
  "status": "{Релиз/На модерации/В разработке}",
  "genre": "{Жанр}",
  "engine": "HTML5/JS",
  "monetizationModel": "{Реклама/IAP/Гибрид/Нет}",
  "publishDate": "",
  "notes": "{Тех. детали: строки кода, движок, SDK фичи}",
  "platforms": {
    "yandex": {"status": "{статус}", "url": ""},
    "vk": {"status": "Не начато", "url": ""},
    "ok": {"status": "Не начато", "url": ""},
    "rustore": {"status": "Не начато", "url": ""}
  },
  "versions": [{
    "name": "v{N}",
    "date": "{дата}",
    "changelog": "{что в этой версии}",
    "metrics": {
      "dau": "", "r1": "", "r7": "", "arpdau": "",
      "revenue": "", "installs": "", "cpi": "",
      "sessionLength": "", "sessionsPerDay": "",
      "rating": "", "reviews": ""
    }
  }],
  "tasks": [
    {"title": "{задача}", "priority": "{Критичный/Высокий/Средний/Низкий}", "status": "{В работе/Backlog}"}
  ],
  "competitors": [
    {
      "name": "{конкурент}",
      "genre": "{жанр}",
      "rating": "{оценка}",
      "mechanics": "{механики}",
      "strengths": "{сильные стороны}",
      "weaknesses": "{слабые стороны}"
    }
  ]
}
```

## Step 7: Промпты для арта

Вызвать скил `art-prompts` для генерации:
- Иконка 512x512 (3 варианта x 3 генератора)
- Обложка 800x470 (2 варианта x 3 генератора)
- Промо 1920x1080 (1 вариант x 3 генератора)
- Квадратный промо 1080x1080 (1 вариант x 3 генератора)

Сохранить в `StoreData/{GAME_NAME}-art-prompts.md`

## Step 8: Структура StoreData/

```
StoreData/
├── store-listing.md              ← основное описание (RU)
├── store-listing-ru.json         ← RU локализация (JSON)
├── store-listing-en.json         ← EN локализация
├── store-listing-es.json         ← ES
├── store-listing-tr.json         ← TR
├── store-listing-pt.json         ← PT
├── store-listing-ar.json         ← AR
├── store-listing-id.json         ← ID
├── store-listing-fr.json         ← FR
├── store-listing-ja.json         ← JA
├── store-listing-it.json         ← IT
├── store-listing-de.json         ← DE
├── store-listing-hi.json         ← HI
├── store-listing-zh.json         ← ZH
├── SETUP_GUIDE.md                ← лидерборды, IAP, реклама
├── {GAME_NAME}-art-prompts.md    ← промпты для иконки и обложки
├── rodrik-import.json            ← импорт в Rodrik Studio
└── screenshots/
    └── README.md                 ← порядок скриншотов
```

## Step 9: store-listing-{lang}.json (один файл на язык)

⚠️ **CRITICAL — schema strict.** Skill MUST output JSON matching `schemas/store-listing.schema.json` exactly. Validator (`scripts/check-store-listing.mjs`) will reject if you add `_comment`, `_removed_fields`, `developer_comment`, `ageRating` or any other "helpful" fields. **No exceptions.**

### Schema (REQUIRED — emit exactly these 9 fields, keywords/seo are OPTIONAL):

```json
{
  "lang": "ru",
  "title": "Game Name",
  "subtitle": "TAGLINE",
  "category": ["Category1", "Category2", "Category3"],
  "tags": ["6-15 tags from yandex-tags-full.md dictionary"],
  "keywords": ["8-20 multi-word SEO phrases (optional, for Forge/RuStore/PWA)"],
  "seo_description": "80-200 chars (optional, for PWA meta/share previews)",
  "about": "300-2000 chars, hook + features + progression + CTA",
  "how_to_play": "Controls + tips, 100-1500 chars"
}
```

### Schema RULES (real Yandex limits — v4.10.26):

| Field | Type | Constraint | Common AI mistake |
|---|---|---|---|
| lang | string | lowercase `ru`, `en`, `tr` | "RU" uppercase → fail pattern |
| title | string | **≤ 50 chars**, no CAPS, matches in-game name | Putting CAPS title или emoji |
| subtitle | string | **20-70 chars**, **NO CAPS** | `БАБКИН ЦЕХ — ПОДПОЛЬНАЯ ИМПЕРИЯ` → caps violation. Use `Бабкин цех — подпольная империя`. Same для en/tr. |
| **category** | **array of strings** (1-3 items) | each from yandex-categories-full.md | Putting string `"Симуляторы"` — must be array `["Симуляторы"]`. Using non-existent ("Аркады", "Бродилки"). |
| tags | array of strings | 5-15 items, each MUST exist в yandex-tags-full.md | Inventing tags ("idle", "tycoon", "simulator", "СНГ") — not in dictionary. |
| **keywords** | array of strings (OPTIONAL) | 6-25 multi-word phrases | Forge ASO field, NOT Yandex Console. Omit if listing only для Yandex. |
| **seo_description** | string (OPTIONAL) | **50-160 chars**, single line, no \n | Forge field, NOT Yandex Console. Make 100-150 chars sweet spot. Primary keyword + benefit + CTA. |
| about | string | **300-1000 chars**, newlines OK | AI tends к exceed 1000 (was 1038 в Самогонщик v1.9.4). Stay under. |
| how_to_play | string | **300-1000 chars**, newlines OK, **minimize emoji** | Yandex moderation flags emoji clutter. Use textual markers (•, —) instead of 🖱️📱💡. |

### Anti-CAPS rule

Title и subtitle MUST NOT contain all-caps words ≥4 chars (Cyrillic/Latin/Turkish). Acronyms OK (HTML, SDK, API, PC). Validator checks this via `noAllCaps: true` schema property.

Bad: `БАБКИН ЦЕХ`, `GRANNY'S STILL`, `YERALTI İMPARATORLUĞU`
Good: `Бабкин цех`, `Granny's Still`, `Yeraltı İmparatorluğu`

CAPS subtitles look like 2010-era SEO scam tactics. Yandex moderation can flag.

### FORBIDDEN fields — DO NOT emit:

```
❌ _comment, _notes, _removed_fields    — AI tries to explain itself. NO. Use separate notes.md.
❌ developer_comment                     — Not part of listing schema. Goes in moderation-notes.md.
❌ ageRating, age_rating                 — Stored в rodrik-import.json. Separate file.
❌ screenshots, icon, promo              — Asset refs go в promo.json or assets/. Listing is text-only.
❌ any field starting with underscore   — Always wrong. Skill validator rejects.
```

### Example output (correct schema, v4.10.26 fixed casing + lengths):

```json
{
  "lang": "ru",
  "title": "Самогонщик",
  "subtitle": "Бабкин цех — подпольная империя",
  "category": ["Экономические", "Симуляторы", "Казуальные"],
  "tags": [
    "тапалки", "бизнес", "магнат", "денежные", "с прокачкой",
    "мемы", "инди", "бесконечные", "без скачивания", "браузерные",
    "HTML5", "2D", "мобильные", "на русском"
  ],
  "keywords": [
    "симулятор самогонщика онлайн",
    "кликер бизнеса бесплатно",
    "идл игра про самогон",
    "построй подпольный цех",
    "тапалка с прокачкой 2026",
    "офлайн прогресс кликер",
    "браузерный idle симулятор",
    "клик для денег без скачивания"
  ],
  "seo_description": "Идл-кликер про подпольный самогонный бизнес. Тапай, найми бабку, развивай цех от подполья до межгалактики. Бесплатно в браузере.",
  "about": "Идл-кликер про подпольный самогонный бизнес в СНГ-эстетике. Гони первач из дедовских запасов, найми бабку-самогонщицу и Петровича, развивай цех от Советской подпольщины до межгалактической корпорации.\n\nПрокачивай снарягу — каждый апгрейд даёт постоянный бонус, не сбрасывается. Открывай рецепты в Лаборатории: 6 ползунков, кастомный рецепт каждый раз. Переживай события: свадьбы, налоговые рейды, нашествие соседского кота.\n\nКогда станешь слишком заметным — Налоговый рейд (prestige), начинай заново с самогонными духами (×1.25 навсегда за каждый). Пять эпох прогрессии, 30 ачивок, 20 предметов снаряги, 4 сезонных события.\n\nЛидерборд «Всего заработано», облачные сохранения через Яндекс ID. Доберёшься ли до галактики?",
  "how_to_play": "Управление (ПК):\n• ЛКМ или SPACE — тап по аппарату\n• Колесо мыши — переключение вкладок\n• B — открыть Лабораторию (после 1 М ₽)\n• P — Налоговый рейд\n\nУправление (мобильный):\n• Тап по аппарату — каждый тап даёт первач\n• Свайп вкладок — Цех / Рецепты / Снаряга / Касса / Лаба\n• Долгий тап на счётчике — детали\n\nСоветы для старта:\n• Найми бабку сразу — пассивный доход решает на первой минуте\n• Снаряга важнее рецептов на старте — постоянные бонусы\n• Прокачивай Бочку до 5 уровня — даёт ×5 за тап\n• Делай рейд каждые 24 часа — максимум духов за цикл\n• На 1 млрд рублей открывается эмиграция — новый этап + золотые чарки"
}
```

Length check (для этого примера):
- title: 10 ✓
- subtitle: 31 ✓ (нормальный регистр, не CAPS)
- seo: 124 ✓ (в пределах 50-160, начинается с жанра не приказа)
- about: 728 ✓ (в пределах 300-1000)
- how_to_play: 758 ✓ (в пределах 300-1000)

### ASO writing principles (v4.10.26)

**1. Hook says WHAT, not WHAT TO DO**
- ❌ `Тапай по аппарату...` (приказ — звучит pushy)
- ❌ `Это аркадная игра про...` (мета-нарратив)
- ✅ `Идл-кликер про подпольный самогонный бизнес...` (сразу жанр + сеттинг)
- ✅ `Survival-симулятор на плоту в открытом океане...`

**2. NO CAPS subtitles (v4.10.26 new rule)**
- ❌ `БАБКИН ЦЕХ — ПОДПОЛЬНАЯ ИМПЕРИЯ` (looks like 2010-era SEO scam)
- ❌ `GRANNY'S STILL — BACKWOODS EMPIRE`
- ✅ `Бабкин цех — подпольная империя`
- ✅ `Granny's Still — Backwoods Empire`

**3. Minimize emoji в how_to_play**
- ❌ `🖱️ Управление (ПК):` (Yandex moderation flags clutter)
- ❌ `🏆 30 ачивок, 💰 3 валюты`
- ✅ `Управление (ПК):` (text-only, professional)
- ✅ `30 ачивок, 3 валюты` (нumbers без icon noise)

**4. CTA elements в seo_description должны быть в первых 100 chars**
- Use: «бесплатно», «без скачивания», «прямо в браузере», «играй сейчас», «no install»

**5. Primary keyword density в about ~2-3%**
- В про игре про самогон, «самогон»/«самогонщик» должно встречаться ~3-5 раз
- Не stuffing, а natural использование

**6. Numbers and specifics > generic claims**
- ❌ «много контента» / «tons of features»
- ✅ `30 ачивок, 20 предметов снаряги, 4 сезонных события`
- ✅ `5 эпох: Советская подпольщина → ... → Межгалактическая корпорация`

**7. Match in-game title (REQ-5.1.3 — частый reject)**
- Если игра в RU версии называется «Самогонщик», то RU store-listing title = «Самогонщик»
- Если EN версия called «Samogonshchik» (transliterated), то EN title = «Samogonshchik»
- Не переименовывай «Самогонщик» → «Moonshine Tycoon» если в игре остался transliterated title

### Per-language workflow

### Per-language workflow

Generate **store-listing-{lang}.json** для каждого языка. Имя файла критично — validator ищет паттерн `store-listing-*.json` рекурсивно в StoreData/.

```bash
# Validate после генерации:
node scripts/check-store-listing.mjs StoreData/
```

Если validator показывает violations — fix и regenerate. Не commit к release пока не all PASS.

### ASO/SEO writing principles

Skill должен писать **не каталог фич, а search-targeted prose**:

1. **Primary keyword in first 5 words** — first sentence/seo_description должно содержать главное search phrase ("симулятор самогонщика", "выживание на плоту")
2. **Keyword density 2-3%** — primary keyword в about ~3-5 раз, естественно
3. **Long-tail в keywords array** — фразы типа "симулятор кликер 2026", "офлайн прогресс игра", "браузерная idle"  
4. **Emotional hooks в subtitle** — не "Симулятор бизнеса", а "БАБКИН ЦЕХ — ПОДПОЛЬНАЯ ИМПЕРИЯ"
5. **Conversion elements в seo_description** — "Играй бесплатно", "Без скачивания", "Прямо в браузере" (action CTA)
6. **Numbers and specifics в about** — "30 ачивок", "5 эпох", "100 000 м" — не "много контента"
7. **Mix tags и keywords intentionally** — tags single words for filters, keywords phrases for search

## Графика для консоли

| Ассет | Размер | Формат | Требования |
|-------|--------|--------|-----------|
| Иконка | 512x512 | PNG | Без прозрачности, без текста мельче 48px |
| Обложка | 800x470 | PNG | Геймплей 70%+, название игры, не скриншот |
| Скриншоты | 16:9 | PNG | Мин. 3 шт, реальный геймплей |
| Видео | 16:9 | MP4 | До 30 сек, опционально |

```
ПРАВИЛА ОБЛОЖКИ ЯНДЕКС:
- 70%+ обложки = геймплей или игровые элементы
- Название игры НА ОБЛОЖКЕ (модераторы проверяют совпадение)
- НЕ скриншот — а АРТ / промо с динамичной сценой
- Текст читается на превью (мелкий текст = отказ)
```

## Non-Negotiable
- [ ] Read `reference/yandex-categories-full.md`, `yandex-tags-full.md`, **`yandex-fields-constraints.md`** БЕФОРЕ генерации
- [ ] Все 13 языковых JSON-файлов созданы как `store-listing-{lang}.json`
- [ ] **`node scripts/check-store-listing.mjs StoreData/` returns exit 0 (zero violations)**
- [ ] **`node scripts/check-setup-guide.mjs <yandex-release-dir>/` returns exit 0** (all 17 sections, no placeholders, no invented tags/categories)
- [ ] Все 7 required fields present: lang, title, subtitle, category, tags, about, how_to_play
- [ ] Optional fields (keywords, seo_description) — include для consistency с RuStore/PWA
- [ ] NO forbidden fields: `_comment`, `_removed_fields`, `developer_comment`, `ageRating`
- [ ] **REAL Yandex constraints** (v4.10.26 fixed):
  - title ≤ 50 chars, no CAPS, matches in-game name
  - subtitle 20-70 chars, **NO CAPS** (Бабкин цех, not БАБКИН ЦЕХ)
  - seo_description 50-160 chars (NOT 80-200 as previous schema lied)
  - about 300-1000 chars (NOT 300-2000)
  - how_to_play 300-1000 chars (NOT 100-1500)
  - **emoji в how_to_play минимизируй** (Yandex moderation flags)
- [ ] `category` is **ARRAY of 1-3** items (даже если одна категория — `["Боевики"]`)
- [ ] Каждая категория ∈ yandex-categories-full.md (25 валидных)
- [ ] Каждый тег ∈ yandex-tags-full.md (700+ валидных, НЕ inventing 'idle', 'tycoon', 'СНГ')
- [ ] Hook в about says WHAT (жанр+сеттинг), NOT WHAT TO DO (приказы)
- [ ] CTA в seo_description в первых 100 chars
- [ ] Конкретные числа вместо "много контента"
- [ ] SETUP_GUIDE.md с лидербордами, IAP, рекламой
- [ ] rodrik-import.json создан (отдельный файл — там ageRating)
- [ ] Все файлы в StoreData/
- [ ] Промпты для арта через скил art-prompts

## 📋 SETUP_GUIDE — САМОДОСТАТОЧНЫЙ русский копипаст-документ (v4.30.9, полевые дефекты)

Два запрета и один порядок:

### Запрет 1: ссылки вместо содержимого
SETUP_GUIDE.md — документ для ЧЕЛОВЕКА, заполняющего Консоль руками. Каждое поле — ДОСЛОВНЫМ
значением на русском, готовым к Ctrl+C → Ctrl+V. «См. store-listing.json», «значения в JSON»,
любые отсылки к другим файлам — ЗАПРЕЩЕНЫ. JSON может существовать для машин, но гайд обязан
быть полным без него.

### Запрет 2: выдуманные категории и теги
Категории и теги в Консоли — ВЫБОР ИЗ СПИСКА Яндекса, не свободный текст. Поэтому ПЕРЕД
написанием гайда: сходи в живой каталог (yandex.ru/games — разделы каталога; актуальные
категории видны в самом каталоге и в форме черновика) и выпиши РЕАЛЬНЫЕ имена категорий.
Выдуманная категория = человек не найдёт её в дропдауне = гайд бесполезен. В гайде укажи
дату сверки списка.

### Обязательная структура SETUP_GUIDE.md (все поля Консоли по порядку заполнения)
```
# SETUP_GUIDE — {игра} (сверено с каталогом Яндекса: {дата})
1. Название: «{дословно}»
2. Об игре (описание): «{полный текст на русском}»
3. Как играть: «{полный текст}»
4. SEO-описание: «{текст — НЕ дублирует пп.2-3 (5.11!)}»
5. Ключевые слова: {список через запятую, русский}
6. Категории (выбрать из списка Консоли): {основная} + {доп.} — реальные имена из каталога
7. Теги: {реальные теги}
8. Возрастной рейтинг: {значение + почему}
9. Ориентация: {значение = поведению билда}
10. Языки: {только реально переведённые}
11. Иконка/обложка: {путь к файлу} (512×512 / 800×470 — проверено Step 4.5)
12. Скриншоты: десктоп {пути}, мобильные {пути} (наборы по правилам promo-screens)
13. Вкладка Инап-покупок: {пусто | список} — сверить с кодом (ловушка 1.13.6!)
14. Черновик → «Чеклист перед первой публикацией» (реальный список Консоли, 2026-07) —
    каждый пункт в SETUP_GUIDE со статусом ✓/✗ и ссылкой на наш чек:
    SDK из официального источника, init без ошибок (§1.1) · GameplayAPI в нужные моменты
    (§1.19.2) · язык через ysdk.environment.i18n.lang (§2.14) · ⚠️ ЗАПУСК В ЧЕРНОВИКЕ ДО
    ОТПРАВКИ — Яндекс проверяет ФАКТ запуска автоматически, техгейт (§1.14) · грузится без
    зависаний, нет JS-ошибок (§1.14), нет фризов (§1.15) · сейвы через ysdk.getPlayer()
    (§1.9) · корректный десктоп+мобайл (§1.10) · контекстное меню отключено (§1.6) · звук
    паузится при потере фокуса (§1.3) и под рекламой (§4.7) · реклама в логических паузах
    (§4.4) · rewarded — явное согласие перед показом (§4.5) · возраст (§2.7) · уникальное
    название (§5.12) · жанр/описание соответствуют (§2.3) · локализация (§2.10) · контент
    (§3.4/3.5/3.6).
14б. 🔴 РЕШЕНИЕ: поле «Использование ИИ при создании игры» (полностью / частично / не
    использовался). Отвечать ЧЕСТНО — наш конвейер это ИИ-инструменты: «частично», если
    пользователь вёл дизайн/арт-дирекшн/решения и правки; «полностью» при сквозной
    генерации. Выбор фиксируется в wiki (одинаковый ответ для всех игр студии).
```
Каждый пункт = значение, не инструкция «придумай сам». Языковые версии полей — для каждого
заявленного языка отдельным блоком.
