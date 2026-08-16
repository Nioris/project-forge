# Project Forge 4.67.0 — AI Studio

## Почему фаз осталось 9

AI Studio не является отдельным этапом производства. Генерация изображений, prompt compilation,
subagents и visual QA нужны в нескольких местах конвейера. Добавление «Фазы 10 AI» заставило бы
сначала закончить игру, а потом возвращаться назад за артом/QA и снова создало бы миграцию
нумерации. Поэтому 4.67.0 сохраняет стабильные Ф1–Ф9 и встраивает AI capability в каждую фазу.

| Фаза | AI Studio responsibility |
|---|---|
| 1 Analyze | init `.forge-ai.json`, asset/visual baseline, определить что можно автоматизировать |
| 2 Design | prompt plan, art hypotheses, agent work packages; массовой генерации ещё нет |
| 3 Construct | phase-aware multi-agent coding через `/studio`, writers только по разным scopes |
| 4 Visual | Prompt Compiler → Image Studio → Art Director → integration screenshot |
| 5 Tech | provider/secret health, performance generated assets, SDK/security lanes |
| 6 Listing | store icon/cover/promo prompt packs + approved generated creatives |
| 7 Test | Visual QA + gameplay/browser QA + moderation audit |
| 8 Release | provenance/secrets/generated-asset release gate |
| 9 Live | A/B creative iteration and measured refresh loop |

## Providers

Primary interactive provider: **Codex-native ImageGen** when the current Codex client exposes it.
Unattended/batch fallback: **OpenAI API / GPT Image 2** using `.openai_key` or `OPENAI_API_KEY`.
OpenRouter is not part of the 4.67 primary image path.

The OpenAI API fallback is intentionally optional: a ChatGPT/Codex subscription credential is not
silently copied into project files and is not treated as an API key.

## New skills

- `/studio` — phase-aware orchestration over Forge agents/subagents.
- `/prompt-compiler` — reproducible JSON prompt packs from project context.
- `/image-studio` — generation/edit loop, provenance and art-director acceptance.
- `/visual-qa` — screenshot/browser/Computer Use visual acceptance with fallback.

Codex forms are `$studio`, `$prompt-compiler`, `$image-studio`, `$visual-qa`.

## New agents

- `studio-director`
- `prompt-architect`
- `art-director`
- `visual-qa`

## Generated artifacts

Per project:

```text
.forge-ai.json
assets/style/STYLE-BIBLE.md
assets/prompts/*.json
assets/generated/candidates/
assets/generated/approved/
assets/generated/provenance.jsonl
wiki/ai/
wiki/qa/
```

`.forge-ai.json` contains configuration only. Keys stay in `.openai_key`, environment variables,
or the native Codex host credential boundary.

## Codex skills context

4.67 also compacts descriptions only in generated `.agents/skills` frontmatter. Canonical Claude
skill descriptions remain intact. This reduces Codex skill-discovery context pressure while keeping
every skill discoverable.
