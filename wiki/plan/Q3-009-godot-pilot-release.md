---
id: Q3-009
title: Godot pilot and Forge release
status: in_progress
started: "2026-08-26"
deps: [Q3-007]
files:
  - scripts/codex-pipeline.mjs
  - scripts/check-codex-pipeline.mjs
  - .claude/skills/status/references/phase-state.mjs
  - scripts/check-execution-contract.mjs
  - wiki/bugs/codex-pipeline-inherited-read-only.md
  - RELEASE_NOTES_v4.68.54.md
  - wiki/plan/Q3-009-godot-pilot-release.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-009 — Godot pilot and Forge release

## What

Прогнать маленькую 2D-игру целиком на Codex, измерить сбои/токены/время/качество и только после
этого выпустить новую версию Forge с проверенной границей поддержки.

## Why

Декларативная поддержка без end-to-end пилота не является готовой возможностью.

## Acceptance criteria

- [ ] Пилот проходит Фазы 1–8 без browser verifier substitution.
- [ ] Зафиксированы ошибки Forge и их владельцы.
- [ ] Снимки, видео, playtest и release artifacts проверены независимо.
- [ ] Каждый corrective runtime release проходит собственные регрессии до установки; финальный статус
  Q3-009 и заявленная pilot-ready версия публикуются только после полного GREEN Фаз 1–8.

## Notes

Godot C# не заявляется как Web/Yandex target; для web остаются HTML/Babylon paths.

## Pilot run 01 — infrastructure block

- Date: 2026-08-26.
- Pilot: `F:\ProjectForgeUniversal\q3-009-godot-pilot`, Godot GDScript, Forge v4.68.52.
- Phase 1 reached its durable Task boundary and then failed closed before it could write the authorised
  evidence (`ANALYSIS.md`, `.forge-ai.json`, `wiki/**`, `assets/**`).
- Durable result: `PHASE1_WRITE_SCOPE_BLOCKED`, owner `infrastructure`, resume policy
  `environment_change`; diagnostic fingerprint `e082064537bb69ad2916`.
- Root cause: the Codex launcher inherited a read-only sandbox instead of selecting an explicit writable
  project sandbox. No false completion, evidence write or Git checkpoint occurred.
- A secondary defect let an invalid internal resume policy (`rerun`) reach contract construction and print
  a stack trace instead of returning a bounded validation error.

## v4.68.54 corrective scope

- The first Codex phase launch explicitly uses `workspace-write` with unattended approval disabled.
- Resume inherits the trusted policy of the original session; it receives no broad filesystem override.
- The pipeline does not bypass hook trust and does not use `danger-full-access`.
- `phase-state` documents and validates the allowed resume policies before any state mutation.
- Regressions prove writable launch selection, absence of broad bypass flags and clean rejection of an
  invalid resume policy without changing the durable marker.
- v4.68.53 was packaged but rejected before publication because its Russian README still linked to stale
  release notes. Its immutable ZIP is preserved and is not installed.
- Reopen and repeat Phase 1 only after v4.68.54 is packaged, installed and synchronized.
