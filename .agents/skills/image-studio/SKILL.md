---
name: image-studio
kind: architectural
description: "Generate and edit real game/store images through the current host native image tool first, with direct OpenAI GPT Image 2 or GigaChat text2image backends for reproducible batch…"
---

# $image-studio <что создать> — host-native / OpenAI / GigaChat visual production loop

Главный image pipeline Forge 4.68. OpenRouter не используется как основной provider.

## Provider order

1. **host-native — default for interactive work.** Если текущий агент предоставляет реальный image-generation/edit tool, используй его прямо. Не предполагается, что это обязательно Codex.
2. **`openai-api`.** Для unattended/batch при наличии central `forge-data/secrets/openai.key`, `OPENAI_API_KEY` или legacy `.openai_key` вызови `scripts/openai-image.mjs` (GPT Image 2 по умолчанию).
3. **`gigachat-api`.** Для прямой генерации через GigaChat при наличии central `forge-data/secrets/gigachat.key`, `GIGACHAT_AUTH_KEY` или legacy `.gigachat_key` вызови `scripts/gigachat-image.mjs`; Forge использует встроенную `text2image` и сохраняет provenance.
4. Если доступного provider нет — создай/проверь prompt pack и ОСТАНОВИСЬ. Не рисуй фиктивный файл и не возвращайся молча к OpenRouter.

## Производственный цикл

1. `$prompt-compiler <asset>` → валидный `assets/prompts/<id>.json`.
2. Сверь reference paths и style bible.
3. До платного batch >3 изображений покажи объём пользователю и получи подтверждение бюджета.
4. Сгенерируй 1–3 варианта.
5. Сохрани реальные файлы в `assets/generated/candidates/<id>/`.
6. Вызови агента `art-director`: APPROVE / REVISE / REJECT с конкретной причиной.
7. APPROVE → нормализуй размер/alpha, перенеси в `assets/generated/approved/` или целевой game path.
8. Встрой ассет в игру и сними фактический gameplay screenshot.
9. `$visual-qa` проверяет уже встроенный результат, не только красивый исходник.
10. Добавь provenance line.

## Batch OpenAI API

Пример из корня проекта:

```bash
node ../project-forge/scripts/openai-image.mjs \
  --prompt-pack assets/prompts/hero-main.json \
  --output assets/generated/candidates/hero-main/a.png
```

Проверка без сетевого вызова:

```bash
node ../project-forge/scripts/openai-image.mjs --prompt-pack assets/prompts/hero-main.json --dry-run
```

Скрипт не печатает API key. `.openai_key` gitignored (`.*_key`).


## Batch GigaChat API

Проверка запроса без сети и без токенов:

```bash
node ../project-forge/scripts/gigachat-image.mjs \
  --prompt "oil refinery game icon, no text" \
  --output assets/generated/candidates/test/a.jpg \
  --dry-run
```

Реальный запуск использует central `forge-data/secrets/gigachat.key`, `GIGACHAT_AUTH_KEY` или legacy `.gigachat_key`; краткоживущий `GIGACHAT_ACCESS_TOKEN` также поддерживается. Forge не отключает TLS-проверку сертификатов.

Для 3D-прототипов доступен отдельный helper `scripts/gigachat-3d.mjs`, который сохраняет FBX и provenance. Это capability внутри соответствующей фазы/проекта, не новая фаза Forge.

## Редактирование существующего изображения

Если native ImageGen умеет image edit в текущем клиенте — передай исходник как reference и явно
перечисли, что сохранить неизменным. Batch helper 4.67.0 покрывает text-to-image; edit в CLI
делай native tool'ом. Если edit tool недоступен — не притворяйся, что изменение выполнено.

## Игровые правила

- sprites: проверяй silhouette на реальном игровом размере;
- UI: сначала layout, потом декоративная генерация;
- icon/cover: без текста внутри AI-картинки; текст/логотип накладывается отдельно;
- consistency важнее локальной красоты: один очень красивый ассет другого стиля = REJECT;
- source/reference rights должны быть известны; неизвестная лицензия = не использовать как input reference.

## Выход

Минимум:
- prompt pack;
- реальный image file;
- provenance entry;
- art-director verdict;
- screenshot в контексте игры для gameplay ассетов.
