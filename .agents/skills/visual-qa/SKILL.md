---
name: visual-qa
kind: tactical
description: "Visual QA for games/apps: capture real mobile/desktop states, inspect clipping, hierarchy, readability, style consistency and target-frame distance; can use Codex Computer Use…"
---

# $visual-qa — проверить то, что реально видит игрок

Это acceptance-проверка встроенного UI/арта, а не оценка исходной PNG в вакууме.

## Evidence first

Из корня игры:

```bash
node ../project-forge/scripts/screens-shoot.mjs .
node ../project-forge/scripts/playtest.mjs .
```

Если текущий Codex предоставляет Computer Use/browser interaction — дополнительно пройди реальные
flows (меню → gameplay → пауза → магазин/результат) и сохрани evidence. Если tool недоступен,
скриншоты + существующий browser harness являются штатным fallback; не симулируй клики текстом.

## Проверить каждый важный state

- mobile 412px + desktop;
- clipping/overflow/safe areas;
- tap targets и перекрытия;
- visual hierarchy: что видно первым;
- текст: контраст, размер, переносы;
- consistency с `assets/style/STYLE-BIBLE.md`;
- distance до `assets/target/target-frame.png`;
- generated asset в реальном масштабе: silhouette, фон, alpha, seams;
- до/после interaction — UI действительно меняется.

## Agent lane

Для большой игры делегируй read-heavy обзор агенту `visual-qa`. Он пишет находки, но не чинит
те же UI-файлы параллельно с builder. После отчёта один владелец вносит изменения и перегоняет.

## Отчёт

`wiki/qa/visual-qa-YYYY-MM-DD.md`:

```text
STATE | VIEWPORT | VERDICT | EVIDENCE | DEFECT | OWNER
```

Critical: экран нельзя использовать/прочитать, управление перекрыто, важный state не виден.
Major: заметно ломает иерархию/стиль/читабельность.
Minor: косметика без влияния на понимание/управление.

Фаза 7 не проходит при Critical или необъяснённом Major на основном gameplay/store flow.
