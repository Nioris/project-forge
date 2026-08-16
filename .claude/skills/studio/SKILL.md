---
name: studio
kind: architectural
description: "Phase-aware AI Studio orchestrator: delegates bounded work to Forge agents, keeps phase gates intact, merges evidence, code, art and QA without skipping the 9-phase pipeline. Triggers on: studio, команда агентов, параллельно, subagents, сделай командой, оркестрация."
---

# /studio <цель> — AI Studio поверх текущей фазы

`/studio` — НЕ десятая фаза. Это кросс-фазовый оркестратор поверх существующих Ф1–Ф9.
Он ускоряет работу агентами, но никогда не перескакивает через решение пользователя, гейт или
артефакт текущей фазы.

## 0. Определи текущую фазу фактом

Прочитай `wiki/_current.md`, `wiki/_map.md`, активный task в `wiki/plan/` и `CLAUDE.md`.
Если фаза неясна — вызови `/status`. Затем работай ТОЛЬКО в пределах текущей фазы.

## 1. Разложи цель на независимые workstreams

Выбирай роли по фазе:

| Фаза | Агентные workstreams |
|---|---|
| Ф1 analyze | исследование прототипа, asset-baseline, конкуренты; write-merge делает главный агент |
| Ф2 design | `prompt-architect` + дизайн/монетизация; только документы, код игры не трогать |
| Ф3 construct | `builder` по непересекающимся файлам + `code-reviewer` + `qa-tester` после merge |
| Ф4 visual | `prompt-architect` → `art-director` → `/image-studio`; UI-код отдельно от генерации ассетов |
| Ф5 tech | SDK/build workstreams + `security-auditor` для секретов/интеграций |
| Ф6 listing | store copy + promo art; `prompt-architect` и `art-director` могут работать параллельно |
| Ф7 test | `qa-tester` + `visual-qa` + `moderation-auditor`; они не чинят один и тот же файл параллельно |
| Ф8 release | moderation/security/readiness — преимущественно read-only агенты |
| Ф9 live | креативы/CTR, метрики, сезонный контент; изменения снова проходят Ф2→Ф8 по необходимости |

## 2. Правило параллельности

Параллелить можно только независимые задачи.

- read-only аудиторы — свободно;
- writers — только разные файлы/директории или разные worktree;
- один файл = один владелец;
- главный агент собирает выводы и запускает общий verifier после merge;
- если два агента предлагают противоречащие решения — не усреднять: вынести развилку пользователю.

Codex: используй native subagents/custom agents из `.codex/agents/`.
Claude Code: используй соответствующие `.claude/agents/`/agent-team механизмы хоста.
GigaCode/другой host: используй нативную агентность только если она реально доступна в текущей среде; иначе выполни те же workstreams последовательно. Не симулируй несуществующих агентов.

## 3. Контракт результата

Каждый workstream возвращает только:

```text
ROLE: <роль>
SCOPE: <файлы/задача>
CHANGED: <файлы или none>
EVIDENCE: <команды/скриншоты/проверки>
BLOCKERS: <none или конкретно>
NEXT: <что должен сделать оркестратор>
```

Главный агент сверяет факты, обновляет wiki и только затем объявляет шаг завершённым.

## 4. AI Studio state

Если `.forge-ai.json` отсутствует:

```bash
node ../project-forge/scripts/ai-studio-init.mjs .
```

Файл хранит только настройки/пути, НИКОГДА ключи. OpenAI batch использует central `forge-data/secrets/openai.key`/`OPENAI_API_KEY` (legacy `.openai_key`); GigaChat direct backend — central `forge-data/secrets/gigachat.key`/`GIGACHAT_AUTH_KEY` (legacy `.gigachat_key`); native host image tool использует аутентификацию самого хоста.

## 5. Phase lock

`/studio` не меняет номер фазы сам. Завершение определяется только skill'ом текущей фазы.
Например, в Ф4 работа агентов не считается завершённой без style bible, утверждённых визуальных
эталонов и фактических файлов ассетов; в Ф7 — без тестовых evidence.
