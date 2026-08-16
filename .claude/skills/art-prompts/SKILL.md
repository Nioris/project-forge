---
name: art-prompts
kind: tactical
description: "Store/game art prompt planning for icons, covers and promo creatives. In Forge 4.67 it delegates reproducible production prompts to /prompt-compiler and generation to /image-studio instead of keeping provider-specific throwaway prompt variants. Triggers on: art prompts, иконка, обложка, promo, cover, feature graphic, промпт для картинки."
---

# /art-prompts — store creative brief → production prompt packs

Этот skill отвечает за **маркетинговую задачу** ассета. Сам provider/prompt serialization делает
`/prompt-compiler`, фактическое изображение — `/image-studio`.

## Store targets

| Площадка | Ассет | Финальный размер |
|---|---|---|
| RuStore | Icon | 512×512 |
| RuStore | Feature Graphic | 1024×500 |
| RuStore | Screenshots | 1080×1920, минимум по актуальным требованиям |
| Яндекс Игры | Icon | 512×512 |
| Яндекс Игры | Cover | 800×470 |
| Яндекс Игры | Screenshots | 16:9, количество сверить с актуальной документацией |

Размер API generation может быть 1024/1536-профиль; после генерации asset-generation обязан
нормализовать финальный store размер фактом.

## Сначала marketing hypothesis

На каждый icon/cover вариант запиши одну гипотезу:

```text
A: крупный герой + угроза сзади → быстро объясняет конфликт
B: главный ресурс/механика → быстро объясняет жанр
C: сильная эмоция персонажа → ставка на CTR
```

Не делай три варианта, отличающиеся только случайным seed.

## Правила

- один главный фокус, читаемый в маленькой карточке;
- no generated text/watermark;
- icon и cover не должны быть одним и тем же crop;
- стиль берётся из `assets/style/STYLE-BIBLE.md`, а не из шаблонов этого skill;
- аудитория/обещание — из `wiki/design/brief.md`;
- перед листингом сравни с реальной выдачей конкурентов текущей датой.

## Выполнение

```text
/art-prompts <asset>       → сформулировать hypothesis + store constraints
/prompt-compiler <asset>   → assets/prompts/<id>.json
/image-studio <asset>      → реальные candidates + art-director review
/visual-qa                 → проверить approved creative в нужном размере/контексте
```

Codex: `$art-prompts` → `$prompt-compiler` → `$image-studio`.
