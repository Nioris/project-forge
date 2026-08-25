---
name: visual-qa
kind: tactical
description: "Visual QA for games/apps: capture real mobile/desktop states, inspect clipping, hierarchy, readability, style consistency and target-frame distance; can use Codex Computer Use when available, with screenshot/playtest fallback. Triggers on: visual qa, визуальный тест, проверь скриншоты, clipping, сравни с референсом."
---

# /visual-qa — проверить то, что реально видит игрок

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
- distance до соответствующего mobile/desktop blueprint из `assets/target/screens/manifest.json`;
- общий `assets/target/target-frame.png` остаётся стилевым якорем, но не заменяет target конкретного state;
- generated asset в реальном масштабе: silhouette, фон, alpha, seams;
- до/после interaction — UI действительно меняется.

## Agent lane

Для большой игры делегируй read-heavy обзор агенту `visual-qa`. Он пишет находки, но не чинит
те же UI-файлы параллельно с builder. После отчёта один владелец вносит изменения и перегоняет.

Для приёмки Phase 4 reviewer **обязан быть другим sessionId**, чем builder. Если отдельный агент
недоступен, открой чистый review-сеанс и передай ему target frame, style bible, contact sheet и
все исходные PNG. Не выдавай смену роли внутри того же сеанса за независимую проверку.

## Отчёт

`wiki/qa/visual-qa-YYYY-MM-DD.md`:

```text
STATE | VIEWPORT | VERDICT | EVIDENCE | DEFECT | OWNER
```

Critical: экран нельзя использовать/прочитать, управление перекрыто, важный state не виден.
Major: заметно ломает иерархию/стиль/читабельность.
Minor: косметика без влияния на понимание/управление.

Фаза 7 не проходит при Critical или необъяснённом Major на основном gameplay/store flow.

Для Phase 4 канонический отчёт — `wiki/qa/phase-4-visual-review.md`, а машинная приёмка —
`wiki/qa/phase-4-visual-evidence.json`. Начни с созданного `screens/review/phase-4-visual-evidence.template.json`,
оцени **каждый** кадр по пяти полям `composition`, `hierarchy`, `readability`, `styleMatch`,
`responsiveness`, а в `targetComparison` — точный target SHA, минимум 2 совпадения, 3 конкретных
расхождения и `distanceScore`. Добавь конкретную критику и дефекты. Затем обнови SHA-256 отчёта и выполни:

```bash
node <движок>/scripts/bind-phase4-visual-evidence.mjs .
node <движок>/scripts/record-phase4-visual-review.mjs .
node <движок>/scripts/check-phase4-visual-evidence.mjs .
```

Последняя команда записи review запускается именно из независимого host task/session; она
сверяет tamper-evident capture receipt, фиксирует reviewer identity вне проекта и не подпишет
приёмку в builder-сеансе. Receipt выявляет последующую правку project evidence; процесс с полным
shell-доступом остаётся доверенной host-границей.

Любой балл ниже 6, Critical/Major, отсутствующий state/viewport или несовпавший хеш означает
`REJECT`: вернуть builder-у замечания, после исправлений обязательно сделать новый capture run.
