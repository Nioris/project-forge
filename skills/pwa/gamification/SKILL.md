---
name: gamification
description: >
  Gamification engine for SvelteKit PWA — exponential XP curve, achievements, streak freeze, leaderboards,
  share cards, and gacha mechanics with pity system. Uses PocketBase + Dexie offline cache. Use this skill
  for gamification, XP system, achievements, badges, streaks, leaderboards, gacha, or user engagement.
---

# Gamification Skill

Full gamification: XP → levels → achievements → streaks → gacha → share cards.

## Exponential Level Curve

```ts
const XP_PER_LEVEL = (level: number) => Math.floor(100 * Math.pow(1.5, level - 1));
// Level 1: 100, Level 5: 506, Level 10: 3844, Level 20: 296489
```

## Streak Freeze

1 free miss per week. `freezesRemaining` counter, weekly cron reset.
If `today !== lastDate + 1` && `freezesRemaining > 0` → decrement freeze, keep streak.

## Share Cards (Canvas API)

Generate 1080×1080 PNG share card with level, XP, streak. Share to VK/Telegram via Web Share API.

## Gacha Mechanics

Weighted random with **pity system**: guaranteed rare after N pulls. `pullsSinceLastRare` counter.
**Publish drop rates transparently** per Russian consumer protection norms.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Server-side XP only.** Client displays, server calculates. `grantXP(userId, event, amount)`.
2. **E — Event-driven.** Single entry point for all XP grants. Events: lesson_complete, quiz_pass, daily_login.
3. **R — Real-time level-up notification.** Toast/animation within 1 s. SSE or polling.
4. **U — Unique achievements once only.** Compound unique constraint `(user, achievement)` in PB.
5. **D — Daily streak with freeze.** UTC-based. 1 free miss/week. Reset counter weekly.
6. **D — Data cached offline.** Dexie stores XP, level, achievements. Syncs on reconnect.
7. **A — Anti-cheat: rate limit 10 XP events/min/user.** Duplicate within 5 s ignored.

## References

- `references/gamification-system.md` — XP engine, streak freeze, share card, gacha, PB schema.
