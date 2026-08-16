---
date: 2026-04-22 (v4.6.3)
status: accepted
tags: [decision, workflow, research]
---

# 005: Auto-research as Phase 0a в /start, /analyze-game, /analyze-project

## Context

Pre-v4.4: `/start` jumped straight to "build the thing". Generated generic decisions ignoring real-world patterns.

User observation: "сначала смотри что у конкурентов" — before designing, look at what already works. Without this, every project re-invents the wheel and ships generic UX.

`/research-references` skill existed but was opt-in. Users forgot to call it. Result: same mistake repeatedly.

## Options Considered

1. **Document the recommendation** — say "we recommend running /research-references first" в README. Cons: users skip recommendations.

2. **Optional flag** — `/start --with-research`. Pros: explicit. Cons: forgotten.

3. **Mandatory Phase 0a** — `/start` ALWAYS runs `/research-references` first, with stop point before user proceeds. Skip only via explicit `wiki/decisions/000-skipped-research.md`.

## Decision

**Mandatory Phase 0a** in `/start`, `/analyze-game`, `/analyze-project`:

```
Phase 0a — Research references (MANDATORY, v4.6.3+)

Before parsing user's vision, understand the competitive landscape.
Skipping this step makes Step 1-3 produce generic decisions that ignore
real-world patterns.

Invoke /research-references with project topic extracted from $ARGUMENTS.

Output → wiki/research/{Project}-references.md with 3-5 real competitors,
table-stakes features, differentiation opportunities, UI/UX direction.

Stop after this phase. Show user one-screen summary, wait for confirmation
of direction before Step 1.

If user says "skip research" — log skip in
wiki/decisions/000-skipped-research.md and proceed.
```

Phase 0b adds skill-discovery for specialized needs (`/find-or-make-skill`).

## Consequences

- **Pro**: Every project starts with competitive context. Reduces "this is just a generic todo list with no differentiation" outcome.
- **Pro**: Forces stop-point — user reviews research before commitment to direction
- **Pro**: Skip is logged (not silent) — future audits show why research was bypassed
- **Con**: Adds 2-5 minutes to start of every project
- **Con**: Quality of research depends on web_search results — could be dated for niche topics
- **Con**: If user already researched, feels redundant — but logging skip is cheap

Counterpoint: For tiny utilities (e.g. "calculator app"), research returns generic results. User can `--skip-research` for these.

Implementations: `/start` Step 0 already has research before vision parsing. `/analyze-game` Phase 6 (post-analysis) for verification context. `/analyze-project` Step 3.5.
