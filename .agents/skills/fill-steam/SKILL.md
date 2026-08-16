---
name: fill-steam
kind: tactical
description: "Заполнение Steam Store page: description (short + long), 5+ скриншотов 1280x720+, trailer, tags ≤10, system requirements, pricing per-region. Создаёт StoreData/steam/ с готовыми…"
---

# $fill-steam — Заполнение Steam Store page

Запускается параллельно с `$release-steam` (или после). Готовит все текстовые материалы и assets для Steam Store через Partner panel.

## Что делает

Создаёт `StoreData/steam/` со следующими файлами:
- `description-short.txt` — Short Description (до 300 chars, главная strapline)
- `description-long.md` — Long Description (HTML/BBCode допустим)
- `tags.md` — выбранные tags из официального списка Steam (макс 10)
- `system-requirements.md` — Minimum + Recommended specs
- `pricing.md` — рекомендованные price points per regional pricing
- `art-prompts.md` — промпты для capsule (header), library hero, library logo
- `screenshots-checklist.md` — 5+ скриншотов 1280x720+ с подсказками что показать
- `trailer-script.md` — outline для launch trailer (30-60 сек)
- `SUBMISSION_CHECKLIST.md` — финальный чеклист перед Submit

## Phase 0: Research

```
$research-references {жанр} Steam top-selling description tags genre конкуренты
```

Изучи 3-5 successful Steam pages в жанре. Отметь:
- Структура их long description (TL;DR в начале? Bullet list features?)
- Какие tags они выбрали (важно — tags driver discoverability)
- Pricing range
- Скриншоты — что показывают (gameplay vs UI vs cinematic)

## Phase 1: Description (short + long)

### Short (до 300 chars, появляется в search/listing)

Шаблон:
```
{Hook предложение — что игра в одной фразе}.
{Главный механика}, {уникальная фишка}, {еще одна фича}.
{Кому понравится}.
```

Пример:
> "Pixel-art roguelike about a programmer trapped in his own buggy code.
> Procedural levels, debuggable enemies, real keyboard combat.
> For Hotline Miami fans who code."

Правила:
- Без слова "game" в начале (Steam рекомендует)
- ≤300 chars (UTF-8, emoji считаются)
- Никаких caps lock, никаких "BEST GAME EVER"
- Конкретика > superlative

### Long Description

Структура (минимум):
```
[About the game one-paragraph hook]

[Key Features]
• Bullet 1 — конкретная фича
• Bullet 2 — gameplay loop
• Bullet 3 — replayability hook
• Bullet 4 — multiplayer/leaderboards если есть
• Bullet 5 — technical spec (e.g. "Native macOS support")

[Story / Setting]
[1-2 параграфа о мире/сюжете если есть]

[Why us]
[Что отличает игру от конкурентов]
```

BBCode allowed: `[h1]`, `[b]`, `[i]`, `[list]`, `[*]`, `[img]`, `[url=]`, `[/url]`. См. https://partner.steamgames.com/doc/store/page/description

## Phase 2: Tags (КРИТИЧНО для discoverability)

Steam tags **НЕ** свободные — есть фиксированный список. Полный: https://store.steampowered.com/tag/browse/

Правила:
- **Максимум 10 tags** (можно меньше, но 10 рекомендовано)
- Первые 5 weight больше — самые точные
- НЕ выбирай tags только потому что они popular — Steam алгоритм заметит mismatch и понизит игру

Tag categories:
- **Genre primary** (1) — Action / RPG / Strategy / Puzzle / Adventure / Simulation / Casual / Indie
- **Sub-genre** (2-3) — Roguelike, Metroidvania, Tower Defense, etc
- **Theme** (1-2) — Fantasy, Sci-Fi, Horror, Cyberpunk, Pixel Graphics, Hand-Drawn
- **Player perspective** (0-1) — First-Person, Top-Down, Side Scroller
- **Multiplayer** (0-1) — Online Co-Op, PvP, Singleplayer
- **Mood/Style** (1-2) — Atmospheric, Difficult, Funny, Story Rich, Choices Matter
- **Tech feature** (0-1) — VR, Steam Deck Verified

Output → `StoreData/steam/tags.md` с обоснованием каждого выбора.

## Phase 3: System Requirements

Шаблон:
```markdown
## Minimum
- OS: Windows 10 64-bit
- Processor: Intel Core i3-2100 / AMD FX-6300
- Memory: 4 GB RAM
- Graphics: Intel HD 4000 / GeForce GT 730
- Storage: 1 GB available space
- Additional: Requires Steam to run

## Recommended
- OS: Windows 11 64-bit
- Processor: Intel Core i5-7400 / AMD Ryzen 3 1200
- Memory: 8 GB RAM
- Graphics: GeForce GTX 1050 / Radeon RX 560
- Storage: 1 GB available space
```

Реальные значения определяй по тестам на разных машинах. Если HTML5+Electron — обычно: minimum 4 GB RAM, любая GPU поддерживающая WebGL2, 500 MB - 2 GB storage.

## Phase 4: Pricing

Steam recommends regional pricing. В Partner panel есть auto-suggestion на основе USD price. Используй её, но проверь:
- Россия (RUB) — скидка ~50% от USD по покупательной способности
- Турция (TRY), Аргентина (ARS), Бразилия (BRL) — еще больше discount
- EU (EUR) — обычно USD + 5-15%
- UK (GBP) — обычно ниже EUR

Output → `StoreData/steam/pricing.md` с таблицей рекомендованных price points.

## Phase 5: Visual Assets

### Required (без них Submit не пройдёт)
- **Header capsule** — 460×215 px PNG (game logo + key art)
- **Small capsule** — 231×87 px PNG (mini variant)
- **Main capsule** — 616×353 px PNG (для front page rotations)
- **Library hero** — 3840×1240 px PNG (огромный фон в Library)
- **Library capsule** — 600×900 px PNG (vertical poster)
- **Library logo** — 1280×720 PNG transparent (только лого без фона)

### Screenshots
- **Минимум 5**, **рекомендовано 8-12**
- 1280×720 минимум, **1920×1080 рекомендовано** (16:9)
- Показывают gameplay (не главное меню!)
- Первый screenshot — самый важный (preview thumbnail)

### Trailer (рекомендовано)
- 30-90 секунд для main trailer
- 1080p минимум, 1440p+ предпочтительно
- Format: H.264 mp4
- Загружается через Partner panel → Edit Steamworks Settings → Trailers

`$art-prompts` skill сгенерирует промпты для capsules. Скриншоты делаешь сам через Steam Overlay (Shift+F12).

## Phase 6: Final checklist

Создай `StoreData/steam/SUBMISSION_CHECKLIST.md`:

```markdown
## Pre-Submit Checklist

### Texts
- [ ] Short description ≤300 chars, hook compelling
- [ ] Long description structured (features → story → why)
- [ ] No banned words / caps lock / "BEST EVER"
- [ ] Localizations добавлены (English обязательно, Russian рекомендовано)

### Tags
- [ ] 10 tags выбрано
- [ ] Genre primary один
- [ ] Tags соответствуют игре (не "popularity gaming")

### Visuals
- [ ] Header capsule 460×215 ✅
- [ ] Small capsule 231×87 ✅
- [ ] Main capsule 616×353 ✅
- [ ] Library hero 3840×1240 ✅
- [ ] Library capsule 600×900 ✅
- [ ] Library logo 1280×720 transparent ✅
- [ ] 5+ screenshots 1080p+
- [ ] Trailer (recommended)

### Tech
- [ ] System requirements заполнены (min + recommended)
- [ ] Supported languages указаны
- [ ] Steam Cloud rules настроены (если игра использует cloud saves)
- [ ] Achievement icons (locked/unlocked) загружены
- [ ] Steam Input config (если есть controller support)

### Pricing & Release
- [ ] Pricing per-region OK (USD baseline + auto-regional)
- [ ] Release date выбран (firm or "Coming Soon")
- [ ] Pre-purchase / Demo решено

### Legal
- [ ] Content survey заполнен (violence/nudity/etc)
- [ ] Age rating региональный (German USK, Indonesia mandatory)
- [ ] Privacy policy URL (если игра собирает данные)
```

## Что НЕ делает

- **Не загружает assets** — Partner panel требует ручного upload через UI
- **Не пишет тексты за тебя** — генерирует структуру и hints, content от тебя
- **Не выбирает theme/genre** — это твоё креативное решение
- **Не управляет release date** — ты решаешь когда launch

## Related

- `$release-steam` — основной release pipeline
- `$art-prompts` — промпты для capsules
- `$promo-screens` — промо-карточки С ТЕКСТОМ
- `$store-listing` — общий store listing
- Docs: https://partner.steamgames.com/doc/store/page

## Non-Negotiable

- [ ] Phase 0 research предшествует description writing
- [ ] Description ≤300 chars (Steam HARD limit на short)
- [ ] Tags выбираются из officialного списка, НЕ свободно
- [ ] Visuals в правильных размерах (Partner panel rejects неверные)
- [ ] Submission checklist пройден ПЕРЕД нажатием Submit For Review
