---
name: store-listings-builder
description: Generate or update Yandex Games store listing files (13 store-listing-{lang}.json + store-listing.md + art-prompts.md + rodrik-import.json + SETUP_GUIDE.md). Validates field lengths and title format inline. Use when creating release metadata, translating descriptions, fixing rejected listings. Triggers on - store listing / описание игры / метаданные / каталог / переводы описаний / SEO / draft fields / создай release.
---

# store-listings-builder

Generates the full release metadata package for a Yandex game. Each game has 5 mandatory file types in `Release/{GameName}/`:

| File | Purpose | Validator |
|---|---|---|
| `store-listing-{lang}.json` × 13 | Per-language draft data: title, category, tags, keywords, seo_description, about, how_to_play | `store-listings.mjs`, `title-format.mjs`, `trademarks.mjs` |
| `store-listing.md` | Russian-language overview for human review | (manual) |
| `*-art-prompts.md` | Prompts for icon/cover/screenshot generation | (manual) |
| `rodrik-import.json` | Bulk-import format for Yandex partner cabinet | (manual) |
| `SETUP_GUIDE.md` | Build instructions for the game (versions, dependencies, IAP setup, leaderboard config) | (manual) |

## Languages (always 13)

`ru, en, es, tr, pt, ar, id, fr, ja, it, de, hi, zh`

## Field limits (HARD — validator blocks if violated)

| Field | Min | Max | Source |
|---|---|---|---|
| `title` | 1 | **50** | https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft |
| `seo_description` | **50** | **160** | (там же) |
| `about` | **100** | **1000** | (там же) |
| `how_to_play` | **100** | **1000** | (там же) |
| `keywords` (joined `, `) | — | **100** | (там же) |

## Title rules (REQ-8.2.1 + 5.1.3)

- **NOT all-CAPS.** "DriftWorld" OK. "DRIFTWORLD" — rejection.
- **No emoji** in title (`🎮`, `⭐`).
- **No age rating** (`16+`, `18+`).
- **MUST match** HTML `<title>` and I18N `metro_title`/`gameTitle` per language. Soft compare (case-insensitive trim) — but moderator may flag if word order or punctuation differs.
- **No trademark words** in title or keywords (Tetris, Minecraft, Mario, Sonic, Pokemon, Candy Crush, Fortnite, etc — see `trademarks.mjs` stop-list).

## Category (one main per language, English-style)

Use Yandex's accepted category list. Translate to local language if it makes sense.
Common: `Puzzles`, `Adventure`, `Action`, `Arcade`, `Simulation`, `Strategy`, `Casual`, `Racing`, `Sports`.

## File template — `store-listing-{lang}.json`

```json
{
  "lang": "en",
  "title": "Game Name (≤50 chars, NOT CAPS)",
  "category": "Puzzles",
  "tags": ["tag1", "tag2", "tag3", "..."],
  "keywords": ["kw1", "kw2", "kw3", "..."],
  "seo_description": "50-160 char SEO summary on the game's hook.",
  "about": "100-1000 char description: hook → mechanics → modes → CTA.",
  "how_to_play": "100-1000 char controls + rules + tips for both PC and mobile."
}
```

The `lang` field MUST match the filename (`store-listing-en.json` → `"lang": "en"`).

## Workflow

1. **Start from RU** (the source of truth). Write/refine `store-listing-ru.json` first.
2. **Translate to EN** — keep the same structure, adapt phrasing.
3. **For each remaining language** — translate from EN (more universal) keeping length bounds:
   - Russian original "about" tends to be longer than English. Don't pad short translations to hit min — trim Russian or restructure.
   - Asian languages (ja, zh, ar, hi) are shorter character-wise — easy to fit.
   - German (de) tends to be longer — watch the 1000-char ceiling.
4. **Title sync check:** every language's `title` must match the in-game title for that language. Don't translate to "TR Game" if the game shows "Game" on TR locale.
5. **Run validator after each file:**
   ```bash
   node scripts/validators/store-listings.mjs WorkProgress/{GameName}/
   node scripts/validators/title-format.mjs WorkProgress/{GameName}/
   node scripts/validators/trademarks.mjs WorkProgress/{GameName}/
   ```

## Russian special case (REQ-8.2.1 trap)

Russian title can have proper Cyrillic case ("Метро. Управление подземкой."). English title should be "Metro. Manage the Underground." — same structure, translated.

Don't write "METRO" as title for ANY language — moderation will reject CAPS for ALL of them, even though only Russian is the "primary" language.

## Common mistakes (from past rejections)

- ❌ "Block 2048" in catalog vs "Tetro Merge 2048" in-game → REQ-5.1.3 violation
- ❌ "Tetris meets 2048!" in seo_description → MOD-TM violation
- ❌ "Свайп вниз — сброс • Тап — поворот" in `how_to_play` for English locale → REQ-8.2.3 violation (Cyrillic in EN field)
- ❌ Title "ПРИЗРАК" / "DRIFTWORLD" → REQ-8.2.1-CAPS violation
- ❌ keywords array length 190 chars → REQ-FIELD-KEYWORDS violation (>100)

## After all 13 files exist

Run the full validator:

```bash
node scripts/pre-submit.mjs WorkProgress/{GameName}/
```

If `store-listings`, `title-format`, `trademarks`, `i18n-completeness` all show 0 blockers — the metadata is ready. Continue with ZIP build via `pre-submit-gate` skill.
