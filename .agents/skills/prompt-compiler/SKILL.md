---
name: prompt-compiler
kind: architectural
description: "Compile reproducible image/promo prompts from the game's brief, style bible, target frame and asset constraints into validated JSON prompt packs for host-native ImageGen, OpenAI…"
---

# $prompt-compiler <asset-goal> — промпт как производственный артефакт

Не пиши одноразовый «красивый промпт» в чат. Компилируй воспроизводимый prompt pack из
контекста проекта и сохраняй его рядом с ассетами.

## Входы — читать по порядку

1. `wiki/design/brief.md` — аудитория, обещание, отличие.
2. `assets/style/STYLE-BIBLE.md` или актуальная спека `$art-direction`.
3. `assets/target/target-frame.png` и `assets/bible/selection.json`, если есть.
4. текущий экран/объект в коде — размер, роль, камера, состояния.
5. требования конкретного стора, если это иконка/обложка/промо.

Нет style bible в Ф4+ → остановись и верни в `$art-direction`. В Ф2 разрешён **draft pack**,
помеченный `status: draft`; генерировать массово по нему нельзя.

## Выход

Создай `assets/prompts/<id>.json`:

```json
{
  "schemaVersion": 1,
  "id": "hero-main",
  "phase": 4,
  "status": "approved",
  "purpose": "gameplay-sprite",
  "provider": "codex-native",
  "model": "gpt-image-2",
  "size": "1024x1024",
  "quality": "high",
  "background": "transparent",
  "prompt": "...",
  "negativeConstraints": ["no text", "no watermark", "no extra limbs"],
  "references": ["assets/target/target-frame.png"],
  "output": "assets/generated/hero-main.png",
  "acceptance": ["silhouette readable at gameplay size", "matches approved palette"]
}
```

Для визуального blueprint экрана используй отдельный pack на каждую пару state/viewport:
`purpose: "screen-blueprint"`, `state: "<id из wiki/design/screen-flow.json>"`,
`viewport: "mobile|desktop"`, а `references` обязательно содержит
`assets/target/target-frame.png`. Без этих полей `screen-targets.mjs` не примет PNG как эталон.

`provider` по умолчанию `codex-native` как обозначение native host path для совместимости. Для unattended batch допустимы `openai-api` и `gigachat-api`. GigaChat `text2image` может не гарантировать те же exact size/quality controls, поэтому `size`/`quality` в pack остаются target constraints и должны быть проверены после генерации. OpenRouter не является неявным production-provider.

## Формула production prompt

Порядок информации важен:

1. **роль ассета** и что игрок должен понять за 1 секунду;
2. **subject/action**;
3. **camera/composition**;
4. **style DNA** — только из утверждённой библии;
5. **palette/light/materials**;
6. **technical constraints** — фон, crop, aspect, safe zone;
7. **consistency anchors** — какие reference assets должны сохраняться;
8. **forbidden** — текст, watermark, случайные детали, нарушения silhouette.

Не вставляй взаимоисключающие стилевые слова. Не проси модель генерировать маркетинговый текст
внутри картинки — текст накладывается кодом/редактором после генерации.

## Валидация

После каждого pack:

```bash
node ../project-forge/scripts/validate-ai-prompt.mjs assets/prompts/<id>.json
```

FAIL → генерацию не запускать.

## Варианты

Для важного ассета компилируй максимум 3 осмысленные гипотезы A/B/C, а не 20 случайных seed.
Каждый вариант отличается одной гипотезой (композиция, эмоция или фокус), иначе нельзя понять,
почему один вариант лучше.

## Provenance

После генерации `$image-studio` дописывает `assets/generated/provenance.jsonl`: SHA-256 prompt-pack,
master target и output, provider/model, время и operation id. Native-запись является доверенной
host-attestation (не независимым доказательством провайдера). Для native GPT Image выполни
`node <движок>/scripts/record-image-provenance.mjs . --output <png> --prompt-pack <json> --provider codex-native --model gpt-image-2`;
OpenAI batch helper записывает тот же формат автоматически и для `screen-blueprint` обязан реально
вызвать `/v1/images/edits` с master PNG. GigaChat helper годится для обычных text2image-ассетов, но не
для screen blueprint, требующего сохранения image reference. Ключи/секреты в provenance не пишутся.
