# platforms/ — адаптеры платформ

Каждая папка здесь — адаптер одной платформы публикации. Контракт одинаковый
для всех: Forge обращается к платформе через `/release <platform>` и получает
на выходе готовый билд в `Release/{Project}/{platform}/`.

## Контракт адаптера

```
platforms/<name>/
├── README.md              # Контракт: что делает, что требует, что выдаёт
├── validators/            # Статические проверки (REQ-контракт)
│   ├── _lib.mjs           # общие хэлперы (copy-paste из yandex или переиспользовать)
│   ├── <check>.mjs        # export { ID, REQUIREMENTS, validate(gamePath) }
│   └── ...
├── scripts/
│   ├── pre-submit.mjs     # оркестратор валидаторов (exit 0/1/2)
│   ├── runtime-test.mjs   # опционально: puppeteer probes
│   ├── smoke-test.mjs     # опционально: crash + freeze detection
│   └── build.mjs          # сборка финального бандла в Release/
├── templates/
│   ├── <platform>-sdk-wrapper.js
│   └── <snippets>
└── skills/
    └── <platform>-specific-skill/SKILL.md
```

## Единые правила для всех платформ

### Validators
- **Формат issue:** `{ id, level, message, citation, url, file?, field?, line? }`
- **Levels:** `blocker` (exit 1) / `warning` (inform, not blocking) / `info`
- **Citation:** прямая цитата из официальной документации или отказа модератора
- **Url:** ссылка на документ, где написано требование

### Exit codes скриптов
- `0` — чисто, можно собирать
- `1` — один или более blocker — НЕ собирать релиз
- `2` — фатальная ошибка в самом валидаторе

### Структура Release/
```
Release/{ProjectName}/
└── {platform}/
    ├── <builds>          # ZIP/APK/папка — зависит от платформы
    ├── store-listings/   # манифесты/описания для каталога
    └── SETUP_GUIDE.md    # инструкция по заливке в каталог
```

### Никогда
- Не изменяй `GameIntegration/{Project}/` после первого копирования
- Не редактируй файлы в `Release/` напрямую — только пересобирать
- Не собирай релиз если pre-submit вернул exit 1 — сначала исправь blockers
- Не понижай blocker до warning «потому что прошло на другой игре» —
  апрувнутые игры могут содержать blocker'ы, которые модератор пропустил

## Текущий статус адаптеров

| Платформа | Статус | Валидаторы | SDK-обёртка | Runtime-tests |
|---|---|---|---|---|
| yandex | **production** | 11 | ✓ | smoke + runtime-ads |
| vk | beta | 3 (из verify-vk) | ✓ (VK Bridge) | smoke |
| telegram | skeleton | 4 (базовые) | stub | — |
| ok | skeleton | 2 (базовые) | stub | — |
| rustore | beta | 1 (icons) | Capacitor | — |
| web | beta | — | — | — |

## `_shared/` — общие утилиты

Модуль добавляется в `_shared/` ТОЛЬКО когда появляется второй потребитель — не авансом.

- `static-server.mjs` — локальный HTTP для puppeteer runtime-test'ов (используется telegram + ok)

Каждый адаптер может импортировать из `_shared/`, но не обязан.
