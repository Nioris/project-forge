---
name: gate
kind: tactical
description: "Run pre-submit validation gate for the active platform. Auto-detects platform from wiki/_current.md or asks. Use when user says \"gate\", \"проверь\", \"pre-submit\", \"проверка…"
---

# $gate

Быстрая проверка готовности текущего проекта к релизу.

## Arguments
- no args — auto-detect платформы из `wiki/_current.md` или спросить
- `yandex` / `vk` / `telegram` / `ok` / `max` / `rustore` / `web` / `steam` / `vkplay` — явно указать
- `all` — прогнать gate для всех платформ которые есть в `Release/{Project}/`

## Процесс

### 1. Определить проект и платформу

Если в `wiki/_current.md` активная задача — взять из её `files:`.
Если нет — спросить через `ask_user_input_v0`:
1. Какой проект? (scan `WorkProgress/*` и список)
2. Какая платформа? (single-select)

### 2. Запустить gate

Для Yandex — 3 слоя:
```bash
node platforms/yandex/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
node platforms/yandex/scripts/smoke-test.mjs  WorkProgress/{Project}/
node platforms/yandex/scripts/runtime-test.mjs WorkProgress/{Project}/
```

Для Telegram — 1 слой:
```bash
node platforms/telegram/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
```

Для OK:
```bash
node platforms/ok/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
```

Для VK:
```bash
node platforms/vk/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
# Plus:
node scripts/verify-vk.mjs WorkProgress/{Project}/
```

Для Steam:
```bash
node platforms/steam/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
# Steam validators проверяют: steam_appid.txt, electron+steamworks.js setup,
# native binaries, cloud config, app_build VDF
```

Для VK Play (vkplay.ru, не путать с VK Mini Apps):
```bash
node platforms/vkplay/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
# VK Play validators проверяют: iframe SDK init, secret_key NOT in client,
# auth params handling, payment flow correctness, HTTPS-only
```

### 3. Интерпретация

Для каждого blocker:
1. Прочитать `citation` и `url`
2. Найти `file:line`
3. Исправить код или данные
4. Re-run gate до 0 blockers

НЕ понижать blocker до warning без подтверждения пользователя с цитатой на руках.

### 4. После 0 blockers

Скажи пользователю:
```
═══════════════════════════════════════
  GATE PASSED: {Project} / {Platform}
═══════════════════════════════════════
  0 blockers, {N} warnings, {N} infos.

  Готов к сборке релиза.
  Запусти: /release {platform}
═══════════════════════════════════════
```

## Non-Negotiable

- [ ] Запущен правильный pre-submit для платформы
- [ ] Exit code проверен (0 = OK, 1 = blockers, 2 = fatal)
- [ ] Все blockers исправлены перед сборкой ZIP
- [ ] Warnings просмотрены вручную — не проигнорированы
