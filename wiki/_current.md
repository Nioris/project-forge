# Current Session State

> Текущий пульс работы. Claude обновляет после каждого значимого шага.
> 20-30 строк max.
>
> Inject'ится в context на каждом старте сессии и после /compact.

## Session goal

_(idle — awaiting user request)_

Если приходишь после паузы — посмотри [[_map]] секции **Next** для backlog v4.8.

## Active task

_(нет активной задачи)_

При начале новой работы — обнови этот файл с конкретной задачей и checklist'ом из 3-7 шагов.

## Blockers

Нет.

## Last 3 decisions

- 2026-04-28: v4.9.1 hotfix — dashboard prompt paths fixed. Lesson: eat your own dog food (create one project через dashboard per release).
- 2026-04-28: v4.9.0 ship — 8-iteration release. Lesson rotation policy + skill categorization + auto-invocation chain + 3 new verifiers + dashboard visual regression + import generalization + MCP server. Lesson #31 — speculative work needs concrete use case.
- 2026-04-28: v4.9.0 Iteration 1 — lesson rotation policy ([[decisions/012-lesson-rotation-policy]]). 3-tier classification (principle / pattern / incident). +Invariant #13 (user pushback as signal).

## Not yet documented

_(пусто — после v4.7.10 всё в wiki)_

## Notes for next session

- Forge сам себе теперь имеет полный wiki/ structure обновлённый до v4.7.10.
- App Track foundation полный: 9 architectural app skills (5 universal + 4 per-category).
- Backlog v4.8 в [[_map]] секция Next — 10 пунктов приоритезированы. Top priority: education-foundation, social-foundation (per-category), скрипт check-bat-encoding, check-cross-refs.
- Для new feature — формулируй через `/advisor` (который теперь читает wiki/ first).
- Перед releaseом любой версии — обязательно `node scripts/check-platform-completeness.mjs` (PERFECT 9/9 = ok).

<!-- last updated 2026-04-27 после v4.7.10 ship + audit + wiki sync -->
