---
id: Q3-001
title: Engine profile authority
status: done
started: 2026-08-25
deps: []
files:
  - adapters/engine-profiles.json
  - schemas/engine-profile.schema.json
  - scripts/engine-profile.mjs
  - scripts/check-engine-profiles.mjs
  - scripts/check-drift.mjs
  - mcp-server/verifiers.json
  - wiki/research/godogen-engine-profiles.md
  - wiki/decisions/036-engine-profile-authority.md
  - wiki/plan/Q3-001-engine-profile-authority.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-001 — Engine profile authority

## What

Добавить host-neutral реестр движков и единый project-level контракт `forge.engine.json`.
Существующие проекты без контракта должны детерминированно оставаться `web` без миграции.

## Why

Forge умеет выбирать ИИ-исполнителя, но пока не отделяет его от среды исполнения игры.
Это основание для Godot/Babylon/Bevy без дублирования девяти фаз и без подмены host adapter.

## Acceptance criteria

- [x] Реестр содержит стабильный `web` и экспериментальный `godot` без исполняемых команд из проекта.
- [x] `forge.engine.json` валидируется строгой схемой; неизвестный движок отклоняется.
- [x] Отсутствующий контракт возвращает `web` и `source: default`.
- [x] Reader/checker имеет отдельные positive/negative/legacy regressions.
- [x] Архитектурное решение и исследование Godogen зафиксированы с первичными источниками.

## Notes

В этом срезе не заявляется работоспособность Godot: только безопасная authority-модель.
Task/RunResult schemas и `.forge-ai.json` не меняются.

Verified: `node scripts/check-engine-profiles.mjs` — 22 passed.

Related: [[../decisions/036-engine-profile-authority]]
