---
date: 2026-04-26 (v4.7.5)
status: accepted
tags: [decision, advisor, workflow]
---

# 008: Context-aware advisor — reads wiki/ before formulating prompts

## Context

`/advisor` skill (v4.6+) formulated prompts for Claude Code based purely on user's text request. It didn't read project state.

Two problems emerged:
1. **Дубли работы.** advisor мог рекомендовать `/analyze-game` для проекта где analyze уже сделан и план в `wiki/plan/01-build-game.md` ждёт апрува.
2. **Игнорирование решений.** advisor не знал какие architecture decisions уже приняты, иногда предлагал альтернативы которые юзер уже отверг.

User explicit request: "давай сделаем /advisor умнее".

## Options Considered

1. **Improve description** — give advisor better trigger keywords. Cons: still vacuum mode.

2. **Force read of one file** — always read `wiki/_current.md` before formulating. Cons: might miss context elsewhere (decisions, plans).

3. **Read entire wiki/ before formulating** — read `_current.md`, `_map.md`, latest `plan/*.md`, `decisions/*.md`. Cons: more tokens spent. Pros: full context.

4. **Classify request type** — different handling for Continuation / Pivot / New task / Question. Pros: better match between request and prompt format.

## Decision

**Combination: read full wiki/ context + classify into 4 types.**

4-step workflow в `/advisor`:

1. **Read context** — `wiki/_current.md`, `_map.md`, latest `plan/*.md`, `decisions/*.md` (последние 3-5)
2. **Classify** — Continuation / Pivot / New task / Question
3. **Formulate** — prompt с реальными именами файлов, ссылками на план, учётом решений
4. **Output** — формат `Контекст: 1 строка\n\nПромпт: ...`

Classification rules:

| Class | Признак | Action |
|---|---|---|
| **Continuation** | active task в `_current.md`, открытый план | `/continue` + конкретный шаг плана |
| **Pivot** | юзер отвергает план / меняет направление | "забудь предыдущий план" + новый |
| **New task** | пусто или другой проект | `/start` или соответствующий orchestrator |
| **Question** | юзер просит мнения, не действия | прямой ответ, БЕЗ промпта |

Critical: для **Question** advisor больше **не пытается** дать промпт. Просто отвечает.

## Consequences

- **Pro**: Advisor никогда не предлагает уже отвергнутое (читает decisions/)
- **Pro**: Continuation cases получают шаги из existing plan/, не общие рекомендации
- **Pro**: Question cases отвечаются прямо — экономит шаг "взять prompt → запустить → получить ответ"
- **Con**: Token overhead (reading 4 files). Mitigated by usually-small wiki files.
- **Con**: Classification can be wrong — falls back gracefully to formulate-anyway

Recovered side-effect: When rewriting advisor in v4.7.5, accidentally lost 4 skills from catalog (`/convert`, `/convert-all`, `/plan`, `/rustore-publish`). Re-grep against filesystem caught it. Coverage restored to 79/79. Lesson: advisor catalog needs automated check (planned для v4.8 as `scripts/check-cross-refs.mjs`).

Lesson #25: Context-aware advisor требует chunked thinking — сначала read, потом classify, потом formulate. Раньше advisor jumped прямо к formulate. Это типичная LLM ошибка — too eager to produce output.
