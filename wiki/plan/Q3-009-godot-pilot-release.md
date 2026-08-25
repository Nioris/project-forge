---
id: Q3-009
title: Godot pilot and Forge release
status: planned
started: ""
deps: [Q3-007]
files:
  - WorkProgress/godot-pilot/
  - RELEASE_NOTES_v4.68.52.md
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
- [ ] Версия поднята, ZIP проверен, установлен и синхронизирован только после GREEN.

## Notes

Godot C# не заявляется как Web/Yandex target; для web остаются HTML/Babylon paths.

