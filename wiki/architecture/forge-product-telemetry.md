# Forge Product Telemetry — измеримый конвейер релизов

Цель — отвечать не «Forge кажется быстрее», а воспроизводимым портфельным отчётом: сколько занял
релиз, сколько стоила модельная работа, сколько возвратов потребовалось, сколько дефектов нашли до
публикации, как прошла модерация и какая доля отслеживаемых переходов не потребовала ручного шага.

## Единица измерения

Основная строка данных — **release record** (`forge.release-metrics`, schema v1). Автоматический
release ID создаётся при первом подтверждённом завершении Phase 8; дополнительный релиз можно
зафиксировать явным `release` event. Текущее состояние лежит в `.forge/metrics/latest.json`, а записи
релизов — в `.forge/metrics/releases/`. Каталог локальный и добавляется в Git exclude.

Отчёт не содержит промпты, сообщения, исходники, секреты и абсолютный путь проекта. Название проекта,
версия Forge, агрегированные числа и ограниченные машинные коды сохраняются локально.

## Формулы

| Метрика | Каноническая формула | Что не выдаём за факт |
|---|---|---|
| Time-to-release | `Phase 8 completedAt − Phase 1 startedAt` | Не вычитаем ночь/паузу, поэтому отдельно показываем tracked active time |
| Tracked active time | Сумма записанных интервалов фаз минус парные ожидания решения пользователя и инфраструктуры | Не называем рабочими часами разработчика |
| AI cost per release | Exact API receipt/invoice; иначе estimate только при 100% покрытии локальным price catalog | Токены без тарифа остаются `unknown`, partial не превращается в $0 |
| Repair cycles | Retry/blocked RunResult + environment/provider retry + каждый структурированный REJECT visual review | STOP с продуктовым решением не является repair |
| Defects before release | Уникальные fingerprint из verifier issues, visual review и bounded defect events до Phase 8 | Не считаем слова `bug/error` в Markdown |
| Moderation first-pass | Первая попытка прошла на каждой записанной площадке релиза | При отсутствии ответа хотя бы одной площадки остаётся `unknown` |
| Moderation eventual pass | Каждая записанная площадка в итоге получила `passed` | Не заменяет first-pass rate |
| Automated workflow % | Automated Task transitions / (automated transitions + user answers + recorded manual steps) | Это покрытие отслеживаемого workflow, не процент написанного ИИ кода |

Product repair и infrastructure repair публикуются раздельно. Иначе исправление игры и падение
провайдера смешиваются и команда оптимизирует не тот процесс.

## Источники и степень автоматизации

| Источник | Что собирается | Режим |
|---|---|---|
| `wiki/phases/phase-*.json` | цикл, версия Forge, движок, host | автоматически после каждой смены фазы |
| `.forge/runs/*.json` | transitions, STOP answers, failure type, verifier fingerprints | автоматически |
| `wiki/diagnostics/codex-cost/*.json` | токены, модель, сессии, tool traffic | автоматически для Codex pipeline |
| `wiki/qa/phase-4-visual-evidence.json` | REJECT/PASS и структурированные дефекты | автоматически; новые reviews также входят в append-only events |
| AI provider receipt/invoice | точная стоимость USD | автоматически, когда adapter возвращает cost; иначе bounded `ai-cost` event |
| Yandex/RuStore/VK/Steam moderation outcome | submitted/passed/rejected | автоматически при наличии API adapter; до этого одна bounded event-команда |

Внешний факт нельзя вывести из файлов проекта. Поэтому отсутствие API интеграции показывается как
coverage gap, а не маскируется оценкой модели.

## Команды

```powershell
# Текущий проект
node ..\project-forge\scripts\forge-metrics.mjs snapshot --cwd .

# Точный итог из API/invoice
node ..\project-forge\scripts\forge-metrics.mjs event ai-cost --cwd . --usd 4.25 --provider openrouter --scope release-total --source invoice --release-id RELEASE_ID

# Модерация одной попытки
node ..\project-forge\scripts\forge-metrics.mjs event moderation --cwd . --platform yandex --status submitted --attempt-id ya-1 --release-id RELEASE_ID
node ..\project-forge\scripts\forge-metrics.mjs event moderation --cwd . --platform yandex --status passed --attempt-id ya-1 --release-id RELEASE_ID

# Портфель и before/after cohort split
node project-forge\scripts\forge-metrics.mjs portfolio --root . --split-at 2026-09-01T00:00:00Z --minimum-cohort 30 --output forge-data\product-metrics.json
```

`pricing.json` опционален и локален:

```json
{
  "schemaVersion": 1,
  "currency": "USD",
  "models": {
    "provider/model": {
      "inputPerMillion": 1.0,
      "cachedInputPerMillion": 0.1,
      "outputPerMillion": 4.0
    }
  }
}
```

Если в одном отчёте обнаружено несколько моделей или цена cached input отсутствует, оценка этого
отчёта запрещена.

## Публичные сравнения

Portfolio report делит релизы по `--split-at`, считает медианы и указывает `n`/coverage для каждого
KPI. Сравнение становится claim-ready **по конкретной метрике**, только когда обе когорты достигли
`--minimum-cohort`, значение известно и baseline не равен нулю. Общий размер когорты не разрешает
публиковать AI cost, если стоимость измерена лишь у части релизов.

Порог по умолчанию — 30 baseline + 30 current. Это evidence gate, а не автоматическое доказательство
причинности: без рандомизации или matched-control корректная формулировка — «после внедрения Forge»,
а не «исключительно благодаря Forge».

Хорошая формулировка:

> На 60 релизах (30 baseline / 30 current) median time-to-release снизился на 72%; AI cost покрыт в
> 60/60 релизах и снизился на 40%. Методика: Forge release metrics schema v1, split 2026-09-01.

Плохая формулировка: «Forge экономит 72%» без периода, размера выборки, baseline и coverage.

## Следующие интеграции

1. Записывать request-level exact cost прямо из OpenRouter/provider adapters.
2. Добавить store adapters/webhooks для moderation outcomes.
3. Импортировать исторические релизы только из проверяемых фактов, помечая backfill отдельно.
4. После достаточной выборки фиксировать версию методики; не менять формулу посреди сравниваемых когорт.
