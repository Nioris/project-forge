---
name: ai-integration
description: >
  Claude API + YandexGPT fallback for SvelteKit. Streaming responses, circuit breaker, prompt caching,
  token budgets, cost tracking, and tool use. Use this skill for AI chat, Claude API, YandexGPT, Anthropic SDK,
  streaming LLM, AI assistant, chatbot, or "ИИ-ассистент".
---

# AI Integration Skill

Claude Haiku 4.5 primary + YandexGPT fallback with circuit breaker.

## Cost Optimization

- **Claude Haiku 4.5**: $1/MTok input, $5/MTok output
- **Prompt caching**: 90% savings on repeated system prompts (5-min TTL)
- Route simple tasks to cheaper models. Cache complete responses after streaming.
- Set per-user daily token budgets.

## Circuit Breaker for YandexGPT Fallback

Track Claude failures. After **5 consecutive failures** → switch to YandexGPT for **60-second cooldown**.
Only fall back on transient errors (429, 5xx, timeouts) — **never on auth (401) or bad request (400)**.

YandexGPT endpoint: `https://llm.api.cloud.yandex.net/foundationModels/v1/completion`
Auth: `Api-Key` header. Model URI: `gpt://{folder_id}/yandexgpt-lite/latest`.
Message format uses `text` instead of Anthropic's `content` — translate between formats.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — API keys server-only.** Both `ANTHROPIC_API_KEY` and `YC_API_KEY` in `$env/static/private`.
2. **E — Every request has max_tokens + timeout.** `max_tokens: 4096`, `timeout: 15000`, `maxRetries: 2`.
3. **R — Response streamed via ReadableStream.** First token < 500 ms. SSE format.
4. **U — User daily budget enforced.** Token usage logged per user in PB `ai_logs`. Hard cap.
5. **D — Degradation via circuit breaker.** 5 failures → YandexGPT. 60 s cooldown. Auto-recovery.
6. **D — Data sanitized.** PII stripping option. System prompt injection prevented.
7. **A — Audit log complete.** Timestamp, user_id, model, input/output tokens, cost in PB.

## References

- `references/claude-integration.md` — Streaming route, circuit breaker, YandexGPT adapter, chat component, tool use.
