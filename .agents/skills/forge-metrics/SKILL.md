---
name: forge-metrics
kind: tactical
description: "Collect truthful Project Forge delivery metrics per release and across a portfolio: time-to-release, AI cost, repair cycles, pre-release defects, moderation pass rate and…"
contract_version: 1
phases:
  - 8
  - 9
modes:
  - phase
  - diagnose
  - release
requires: []
reads:
  - wiki/phases/**
  - wiki/diagnostics/codex-cost/**
  - wiki/qa/**
  - .forge/runs/**
  - .forge/git-checkpoints.json
  - .forge/metrics/**
writes:
  - .forge/metrics/**
verifiers: []
stop_points: []
risk_shell: write
risk_external: none
references:
  - references/measurement-contract.md
---
# $forge-metrics — измеримость релизного конвейера

Используй только trusted runtime `scripts/forge-metrics.mjs`. Не считай метрики по словам в чате,
Markdown-прозе или собственной оценке модели.

## Один проект

```powershell
node ../project-forge/scripts/forge-metrics.mjs snapshot --cwd .
```

Forge автоматически обновляет snapshot после переходов фаз. Ручная команда нужна для просмотра,
backfill проверяемого внешнего факта или диагностики coverage.

## Внешние факты

Стоимость без API receipt/invoice и результат модерации без ответа площадки остаются `unknown`.
Когда факт известен, записывай только bounded event-командой из usage `forge-metrics.mjs --help`.
Не помещай в событие ключ, prompt, полный ответ API, текст исходника или персональные данные.

## Портфель

```powershell
node project-forge/scripts/forge-metrics.mjs portfolio --root . --split-at 2026-09-01T00:00:00Z --minimum-cohort 10 --output forge-data/product-metrics.json
```

Публикуй improvement только для `eligibleMetrics`: обе когорты и sample конкретного KPI должны
достигнуть порога. Всегда указывай baseline/current `n`, split date, median и coverage.

Полные формулы, cost basis и ограничения: `references/measurement-contract.md`.
