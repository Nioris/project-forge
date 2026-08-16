# Yandex Games — Field Constraints Reference

> Source: Yandex Developer Console (snapshot 2026-05-14, verified through real-world
> moderation feedback from Самогонщик project).
>
> Эти constraints **физически enforced** Yandex Console formом — нельзя submit с
> violations. Проверяй ВСЕ перед отправкой store-listing-{lang}.json для каждого языка.
>
> **Не путать с RuStore / VK Play / iOS** — там свои constraints. Этот файл только для Yandex.

## Поля store-listing.json и их limits

### `title` — название игры

- **Длина:** ≤ 50 символов
- **CAPS:** запрещён (не all-caps слова ≥4 chars)
- **Match in-game:** название в store должно **совпадать** с тем что игрок видит при запуске игры на этом языке (clause 5.1.3 — частая причина reject)
- **Symbols/emoji:** запрещены в title (clause 8.2.1)

Пример OK: `Самогонщик`, `Tower Defense Heroes`, `Doğa Macera`
Пример BAD: `САМОГОНЩИК ⭐ TYCOON` (CAPS + emoji + не совпадает с in-game)

### `subtitle` — короткое описание (он же tagline)

- **Длина:** 20-70 символов (строго в этих границах)
- **CAPS:** запрещён
- **Emoji:** не рекомендуется, может flag модерацией
- **Назначение:** один эмоциональный hook, дополняющий title

Пример OK: `Бабкин цех — подпольная империя` (31 символ, нормальный регистр)
Пример BAD: `БАБКИН ЦЕХ — ПОДПОЛЬНАЯ ИМПЕРИЯ` (CAPS — было до v4.10.26)
Пример BAD: `Очень короткий` (14 < 20)
Пример BAD: длиннее 70 chars

### `seo_description` — SEO описание

- **Длина:** 50-160 символов
- **Format:** одна строка, без `\n`
- **Должен содержать:** primary keyword + main benefit + CTA element
- **CTA примеры:** «бесплатно», «без скачивания», «прямо в браузере», «играй сейчас»

Пример OK (158 chars): `Тапай по аппарату, найми бабку и Петровича, построй подпольный цех. Идл-кликер с СНГ-юмором — от Советской подпольщины до межгалактики. Бесплатно в браузере.`

Пример BAD: 172 символа (превышает 160 — было в исходном v4.10.22 Самогонщик)
Пример BAD: 30 символов (слишком короткий, < 50)

### `about` — описание игры

- **Длина:** 300-1000 символов
- **CAPS:** не используй для целых слов
- **Newlines:** разрешены (`\n` или реальные)
- **Структура:**
  - Sentence 1 — hook с primary keyword (что это, не что делать)
  - Paragraphs 2-3 — features с benefits
  - Optional — list/numbers (5 эпох, 30 ачивок, 3 валюты)
  - Closing — CTA

Anti-pattern: начинать с глагола-приказа («Тапай по...») — звучит pushy, скрывает что за игра.
Better: «Идл-кликер про подпольный самогонный бизнес...» — сразу видно жанр + сеттинг.

### `how_to_play` — как играть

- **Длина:** 300-1000 символов
- **CAPS:** не используй
- **Emoji:** **минимизируй** — Yandex модерация flags emoji как clutter. Текстовые маркеры лучше (•, —).
- **Структура:** Controls (PC + Mobile) → Tips → optional shortcuts

Пример anti-pattern: `🖱️📱💡` в начале каждой секции — clutter.
Better: текстовые секции «Управление ПК:», «Управление на мобильном:», «Советы».

### `category` — категории

- **Тип:** array (1-3 items)
- **Источник:** ТОЛЬКО из `yandex-categories-full.md` (25 валидных)
- **AI mistakes:** «Аркады», «Бродилки», «Клик-тап» — таких нет

### `tags` — теги поиска

- **Тип:** array, 5-15 items
- **Источник:** ТОЛЬКО из `yandex-tags-full.md` (~700 валидных)
- **AI mistakes:** «idle», «clicker», «tycoon», «СНГ» — инвентированы AI, нет в словаре

### `keywords` — ключевые слова

⚠️ **CORRECTION (v4.10.30):** v4.10.21-v4.10.29 incorrectly stated "Yandex Console этого поля НЕТ". Real behavior (user verified 2026-05-14): Yandex Console **имеет** поле "Ключевые слова через запятую" в **per-language карточке игры** (отдельно для RU/EN/TR/...).

- **Тип:** comma-separated string в Console UI (Forge stores as array, joins on submit)
- **Per language:** да — отдельные keywords для каждого языка карточки
- **Длина:** TBD (точные limits требуют real Console verification)
- **Содержание:** long-tail phrases 2-5 слов каждая
- **Recommended count:** 8-20 phrases per language
- **Dual purpose:** Yandex Console keywords + RuStore keywords + PWA meta + ASO tracking

Format examples (для store-listing-ru.json):
```json
"keywords": [
  "симулятор самогонщика онлайн",
  "идл кликер бесплатно",
  "тапалка с прокачкой",
  ...
]
```

Console submission: join с ", " → `симулятор самогонщика онлайн, идл кликер бесплатно, тапалка с прокачкой, ...`

### `leaderboards` — лидерборды (multi-language names)

⚠️ **GAP fixed v4.10.30:** прежний skill output only technical name (`totalEarned`). Yandex Console принимает **per-language display names** в leaderboards configuration.

Лидерборд в Console имеет:
- **Technical name** (technical_name): latin only, no spaces — `totalEarned`, `bestScore`
- **Type:** int / float / time
- **Sort order:** asc (lower better) / desc (higher better)
- **Display names per language:** РУС, ENG, TUR, ... — каждый язык игры
- **Description per language:** что показывает leaderboard

Generated в `rodrik-import.json`:
```json
{
  "leaderboards": [
    {
      "name": "totalEarned",
      "type": "int",
      "sort": "desc",
      "names": {
        "ru": "Всего заработано",
        "en": "Total Earned",
        "tr": "Toplam Kazanç"
      },
      "descriptions": {
        "ru": "Кумулятивный доход за всё время",
        "en": "Cumulative income across all runs",
        "tr": "Tüm zamanların kümülatif geliri"
      }
    }
  ]
}
```

Также в SETUP_GUIDE.md §7 — таблица с **всеми** localized names для копирования в Console.

### `lang` — код языка

- **Формат:** ISO 639-1 lowercase
- **Pattern:** `^[a-z]{2}(-[A-Z]{2})?$`
- **Examples:** `ru`, `en`, `tr`, `pt-BR`
- **Common mistake:** `RU`, `EN`, `TR` (uppercase) — pattern fail

## Запрещённые поля

В store-listing.json **никогда** не добавляй:
- `_comment`, `_notes`, `_removed_fields` — AI invents для self-explanation, схема rejects
- `developer_comment` — это `moderation-notes.md`, не listing
- `ageRating` / `age_rating` — это `rodrik-import.json`, не listing
- `screenshots`, `icon`, `promo` — это `promo.json` / `assets/`, не listing

## Чеклист перед submission

```
[ ] title ≤ 50 chars, matches in-game name, no CAPS, no emoji
[ ] subtitle 20-70 chars, no CAPS, sensible casing
[ ] seo_description 50-160 chars, single line, contains primary keyword + CTA
[ ] about 300-1000 chars, hook says WHAT (not WHAT TO DO), numbers/specifics
[ ] how_to_play 300-1000 chars, minimal emoji, Controls→Tips structure
[ ] category array (1-3), all values ∈ yandex-categories-full.md
[ ] tags array (5-15), all values ∈ yandex-tags-full.md
[ ] lang lowercase pattern
[ ] No forbidden fields
[ ] No all-CAPS words ≥ 4 chars в title/subtitle (visible fields)
```

Запусти validator перед submission:
```bash
node scripts/check-store-listing.mjs StoreData/
```

## Verification status per constraint

⚠️ **HONESTY DISCLAIMER:** I (Claude) made 4+ incorrect Yandex assumptions across v4.10.20-v4.10.29. Below — explicit status of every constraint claim:

| Constraint | Status | Source |
|---|---|---|
| title ≤ 50 chars | **VERIFIED** | User 2026-05-14 |
| subtitle 20-70 | **VERIFIED** | User 2026-05-14 |
| seo_description 50-160 | **VERIFIED** | User 2026-05-14 |
| about 300-1000 | **VERIFIED** | User 2026-05-14 |
| how_to_play 300-1000 | **VERIFIED** | User 2026-05-14 |
| NO CAPS title/subtitle | **VERIFIED** | User 2026-05-14 |
| category 1-3 items (array, multi-select) | **VERIFIED** | User 2026-05-13 + reference file |
| 25 valid categories | **VERIFIED** | User-shipped reference 2026-05-13 |
| 700+ tags closed dictionary | **VERIFIED** | User-shipped reference 2026-05-13 |
| keywords IS Console field (per-lang) | **VERIFIED** | User 2026-05-14 (correction of v4.10.21 mistake) |
| keywords length limit per field | **ASSUMED** | TBD pending Console verification |
| Leaderboard multi-lang display names | **VERIFIED** | User 2026-05-14 |
| Leaderboard length limits per name | **ASSUMED** | TBD |
| IAP fields (Catalog в Console) | **ASSUMED** | Skill writes к rodrik-import.json — TBD verification |
| Ad placements (Interstitial/Rewarded/Sticky) | **PARTIALLY VERIFIED** | Skill has REQ-4.4 refs, exact UI fields TBD |
| Cloud saves Console fields | **NONE** (works through SDK only) | Verified per setup-guide §6 |
| Promo events / Скидки и акции | **PARTIALLY VERIFIED** | yandex-promo-events.md template, exact Console UI TBD |
| Age rating (12+/16+/etc) | **ASSUMED** | Goes в rodrik-import.json, exact Console field TBD |

**ASSUMED** items: if user encounters Console rejection mentioning one of these, the skill assumption is wrong — flag it for fix.

## Verification protocol для future updates

When user uploads real Console snapshot (screenshot or exported data):
1. Diff against current reference
2. Update reference с new constraints
3. Mark previously-ASSUMED items as VERIFIED
4. Re-run validator на user's actual files
5. Bump version (this is **schema is contract** работа — Lesson #59)

## История изменений

- 2026-05-14 (v4.10.26) — initial. Constraints extracted из real Yandex Console snapshot + user feedback на Самогонщик rejected drafts.
- TBD — добавятся constraints для RuStore, VK Play по мере их обнаружения.
