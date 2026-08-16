---
name: ai-integration
description: "Claude Haiku + YandexGPT: API calls, streaming, prompt templates, cost control. Triggers on: AI, claude, yandex GPT, LLM, chat, analysis, prompt."
---
# AI Integration

## Purpose
AI features via Claude Haiku (main) + YandexGPT (fallback). Server-side only.

## Instructions
```javascript
// lib/api/ai.js (SERVER-SIDE ONLY)
export async function askAI(prompt, context) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }] })
    });
    return (await res.json()).content[0].text;
  } catch {
    return askYandexGPT(prompt); // fallback
  }
}
```

## Model selection (verify live IDs before shipping)

Use **exact** model IDs — guessed IDs throw API errors. Current catalog (mid-2026):

| Use case | Model ID | Why |
|---|---|---|
| High-volume, simple (chat replies, classification, hints) | `claude-haiku-4-5` | Fastest, cheapest — default for in-game AI |
| Balanced reasoning at practical cost | `claude-sonnet-4-6` | Near-Opus quality, 1M context |
| Hardest agentic / long-horizon work | `claude-opus-4-8` | Most capable; $5/$25 per 1M tok (standard) |

API-surface note (Opus 4.7+ / 4.8): **adaptive thinking only** — `budget_tokens` and
sampling params (`temperature`, `top_p`, `top_k`) were removed. Do not generate code that
sends them; pass `thinking: { type: "adaptive" }` if reasoning is needed, else omit. All
current models share a 1M context window.

**Effort (Opus 4.8):** the API exposes an `effort` capability (`low` … `high` … `max`). Opus 4.8
defaults to high. For an in-app feature you almost always want the cheap default — only raise
effort for genuinely hard one-off calls, since higher effort = more tokens = more cost per call.
Keep high-volume game/app calls on `claude-haiku-4-5` at default effort.

Always confirm IDs against the live Models Overview before release — catalog rotates.
Anchor: https://platform.claude.com/docs/en/about-claude/models/overview

## Non-Negotiable Acceptance Criteria
- [ ] API keys server-side only ($lib/server/)
- [ ] Fallback: Claude → YandexGPT
- [ ] Rate limiting (max N requests/user/day)
- [ ] Cost cap per user
- [ ] Model ID verified against live catalog (no guessed/legacy IDs)
