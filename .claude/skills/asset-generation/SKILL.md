---
name: asset-generation
kind: architectural
description: "Produce real game assets: visuals through Forge Image Studio (Codex-native ImageGen or direct OpenAI GPT Image 2), voice/SFX through ElevenLabs, and reproducible music prompt sheets. Builds an asset catalog, generates files, integrates them and verifies real dimensions/context. Triggers on: generate assets, сгенерировать ассеты, voice, SFX, музыка, icon, sprites, real assets."
---

# /asset-generation — реальные файлы, а не советы

Forge 4.67 разделяет responsibilities:

- **Visuals** → `/prompt-compiler` + `/image-studio` (Codex-native ImageGen default; OpenAI GPT Image 2 batch fallback).
- **Voice/SFX** → ElevenLabs references из этого skill.
- **Music** → воспроизводимые Suno prompt sheets (ручной generation step, пока нет штатного API в Forge).
- **Style/acceptance** → `/art-direction` + `art-director` + `/visual-qa`.

OpenRouter больше не является primary image provider этого pipeline.

## Prerequisites

Для native Codex ImageGen проектный API key не нужен. Для unattended OpenAI batch:

```text
<project-root>/.openai_key       ← optional OpenAI API key
<project-root>/.elevenlabs_key   ← only if voice/SFX generation selected
```

Можно использовать `OPENAI_API_KEY` вместо `.openai_key`. Никогда не выводи содержимое ключей.
`.gitignore` Forge содержит `.*_key`.

## Step 0 — готовая библиотека раньше генерации

Сначала:

```bash
node ../project-forge/scripts/asset-find.mjs "<жанр сеттинг объект>" --use <2d|3d>
```

Если готовый лицензированный ассет закрывает задачу без потери стиля — используй его. Генерация
нужна для hero assets, store creatives, уникальных персонажей/фонов и того, чего нет в библиотеке.

## Step 1 — asset production plan

Создай/обнови `wiki/ai/asset-plan.md`:

```text
ID | TYPE | PURPOSE | SOURCE | COUNT | PHASE | ACCEPTANCE | STATUS
```

SOURCE: `library | host-native | openai-api | gigachat-api | elevenlabs | suno-manual`.

Tier 2 ask перед дорогим объёмом: сколько вариантов/реплик/SFX действительно нужно. Массовый
paid batch без подтверждения бюджета запрещён.

## Step 2 — visuals

На каждый generated visual:

1. `/prompt-compiler <id>` → `assets/prompts/<id>.json`.
2. `/image-studio <id>` → реальные candidate files.
3. `art-director` → APPROVE/REVISE/REJECT.
4. approved file встраивается в игру.
5. `/visual-qa` смотрит его в реальном gameplay/store контексте.

Не создавай новый ad-hoc generator, если `scripts/openai-image.mjs` уже покрывает batch use case.

## Step 3 — voice/SFX

References в `references/` остаются каноническими:

- `generate_sfx.py`
- `generate_voice.py`
- `extract_says.js`
- `generate_voice_config.py`
- `run_voice_postprocess.bat`
- `voice_audition.example.py`

Копируй только нужные files в `tools/assets/`, не переписывай per-project.

Voice pipeline:

1. extract dialogue → structured list;
2. generate voice with stable per-role voice mapping;
3. post-process via ffmpeg and normalize loudness;
4. wire files into game with fallback if audio unavailable.

SFX: короткие конкретные prompts, никакого текста/речи внутри SFX, filenames machine-latin.

## Step 4 — music prompt sheets

Для каждой music role создай `assets/prompts/music_<id>.md`:

```text
ROLE: battle loop / menu / victory
STYLE: genre, tempo, instruments, mood, production constraints
STRUCTURE: intro → loop body → transition/outro
LYRICS: instrumental / explicit lyrics section
LOOP NOTES: where a clean loop should exist
TARGET PATH: assets/audio/music/<id>.mp3
```

Не делай вид, что файл музыки уже существует: manual generation/import остаётся explicit gate.

## Step 5 — фактическая приёмка

Для каждого raster file проверяй реальные dimensions/alpha после генерации, не имя файла.
Store art: текст не генерировать внутри картинки; overlay делается отдельно.
Gameplay art: обязательный screenshot после интеграции.

Финальная сводка:

```text
GENERATED: N
APPROVED: N
REVISED: N
MISSING/MANUAL: N
PROVENANCE: assets/generated/provenance.jsonl
VISUAL QA: <path/report>
```

## Decision policy

- Tier 1 auto: wording prompt, folders, технический размер в рамках утверждённого style/asset plan.
- Tier 2 ask: art-style fork, количество paid generations, голос/актерский стиль, большой asset scope.
- Tier 3 stop: missing required external key, неизвестная лицензия reference, budget ambiguity, изменение player-facing core art direction.

## Non-negotiable

- no OpenRouter fallback behind user's back;
- keys never in prompt packs/wiki/provenance;
- prompt pack + provenance for generated visuals;
- style bible before mass visual generation;
- real file + real integration screenshot before claiming visual asset complete.
