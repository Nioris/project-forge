---
id: Q3-008
title: Cost-aware native asset pipeline
status: planned
started: ""
deps: [Q3-004]
files:
  - .claude/skills/asset-generation/SKILL.md
  - scripts/asset-budget.mjs
  - schemas/asset-manifest.schema.json
  - wiki/plan/Q3-008-cost-aware-assets.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-008 — Cost-aware native asset pipeline

## What

Расширить существующую генерацию опциональными 3D/rig/animation providers с жёстким approval,
provenance, размером в игре и стоимостью в minor units.

## Why

Полезная часть Godogen — не конкретный провайдер, а защита от повторной оплаты и потери масштаба.

## Acceptance criteria

- [ ] До первой платной операции обязателен machine-readable approval и верхний бюджет.
- [ ] Повтор/resume не создаёт повторный платный job.
- [ ] Manifest хранит source, dimensions/scale, provider, model и cost в minor units.
- [ ] Ни один provider не является молчаливым fallback.

## Notes

Опциональная ветка; не блокирует базовую поддержку Godot.

