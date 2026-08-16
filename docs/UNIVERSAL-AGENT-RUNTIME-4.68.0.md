# Project Forge 4.68 — Universal Agent Runtime

## Цель

Forge больше не должен требовать отдельную копию 140+ workflows для каждого AI-клиента. Канонический workflow остаётся в `.claude/skills/<name>/SKILL.md`, а `FORGE.md` задаёт host-neutral правила исполнения.

## Hosts

| Host | Adapter | Skill entry | Notes |
|---|---|---|---|
| Claude Code | stable | `/skill` | canonical Claude layer |
| OpenAI Codex | stable | `$skill` | generated `.agents/skills` + `.codex/*` |
| GigaCode CLI | experimental | natural-language bridge to canonical SKILL.md | executable auto-detect or `FORGE_GIGACODE_CLI`; no undocumented permission flags |
| Other terminal/MCP agent | generic | read `FORGE.md` + canonical SKILL.md | capability translation only |

## Почему GigaCode experimental

Официальный GitVerse публично описывает GigaCode CLI как терминального агента, который работает с локальным репозиторием, редактирует код, запускает тесты/сборки и поддерживает агентные сценарии. Однако индексируемая публичная документация на момент 2026-08-14 не фиксирует стабильный executable name и unattended/permission CLI flags. Forge поэтому не выдумывает контракт: launcher ищет распространённые имена или использует явный `FORGE_GIGACODE_CLI`.

Для GigaCode-агента на GitVerse есть документированный rules surface: `.gitverse/pr_rules/*.md`. Forge синхронизирует `.gitverse/pr_rules/forge.md`.

## Universal launcher

```bash
node scripts/forge-agent.mjs list
node scripts/forge-agent.mjs doctor
node scripts/forge-agent.mjs launch claude --project ../game --full
node scripts/forge-agent.mjs launch codex --project ../game --full
node scripts/forge-agent.mjs launch gigacode --project ../game
node scripts/forge-agent.mjs prompt gigacode --skill phase-2-design --args .
```

`launch gigacode` запускает найденный executable в cwd проекта. Forge не передаёт GigaCode неописанные флаги.

## GigaChat provider

GigaChat API используется как отдельный AI Studio provider, независимо от GigaCode terminal agent.

Secrets:

- `GIGACHAT_AUTH_KEY` или `.gigachat_key` — authorization key;
- `GIGACHAT_ACCESS_TOKEN` или `.gigachat_token` — optional short-lived access token;
- `GIGACHAT_SCOPE` — `GIGACHAT_API_PERS` (default), `GIGACHAT_API_B2B` или `GIGACHAT_API_CORP`.

### Image

```bash
node scripts/gigachat-image.mjs \
  --prompt "low-poly refinery game icon, no text" \
  --output assets/generated/candidates/refinery/a.jpg
```

Flow: OAuth → `POST https://api.giga.chat/v1/chat/completions` with `function_call:auto` → built-in `text2image` → parse `<img src="...">` → `GET /v1/files/{id}/content` → JPG + provenance.

### 3D

```bash
node scripts/gigachat-3d.mjs \
  --prompt "low-poly oil pump prop for an isometric game" \
  --output assets/generated/candidates/pump/pump.fbx
```

Flow: `text2model3d` → parse `data-model-id` → file download → FBX + provenance.

Both helpers support `--dry-run`. Forge never disables TLS verification. If the environment does not trust the required certificate chain, fix the OS/runtime trust store using the official GigaChat certificate guidance.

## Phase integration

No Phase 10 is introduced.

- F1 Analyze: provider/agent availability may be inventoried; no mass generation.
- F2 Design: GigaCode can execute canonical design skills; GigaChat can compile/test prompt hypotheses without production approval.
- F3 Construct: terminal agent can implement bounded workstreams; agent parity is measured, not assumed.
- F4 Visual: host-native/OpenAI/GigaChat image backend can be selected per asset; same Art Director + Visual QA gate applies.
- F5 Tech: credentials/config/security checked; secrets never enter `.forge-ai.json`.
- F6 Listing: GigaChat image backend may produce creative candidates under the same listing gate.
- F7 Test: compare agent output and visual/runtime evidence.
- F8 Release: provider provenance and secret scan remain release gates.
- F9 Live: measured creative/agent experiments can feed later iterations.

## Forge Agent Benchmark

Recommended real test:

1. clone/copy one project at a fixed phase;
2. give Claude, Codex and GigaCode the same phase goal;
3. score: phase-gate compliance, STOP-point compliance, correct workspace, diff quality, verifier evidence, number of unnecessary edits, wiki/state accuracy, runtime evidence and user decisions invented/not invented;
4. never merge benchmark branches automatically.

This release provides the runtime bridge; it does not claim GigaCode quality parity until that benchmark is run on the user's machine/account.

## Official references used for the adapter design

- GigaCode feature/CLI overview: https://gitverse.ru/features/gigacode/
- GigaCode GitVerse agent and `.gitverse/pr_rules`: https://gitverse.ru/docs/ai/gigacode-on-gitverse/gigacode-agent
- GigaChat API auth: https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api
- GigaChat image generation: https://developers.sber.ru/docs/ru/gigachat/guides/images-generation
- GigaChat 3D generation: https://developers.sber.ru/docs/ru/gigachat/guides/3d-models-generation
- GigaChat OpenAI compatibility: https://developers.sber.ru/docs/ru/gigachat/guides/compatible-openai
