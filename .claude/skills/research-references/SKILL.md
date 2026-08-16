---
name: research-references
kind: tactical
description: Research competitor projects, similar apps/games, UI/UX patterns, and industry conventions BEFORE planning or designing. Mandatory first step for any new project from TZ or analysis of existing project before major rework. Produces wiki/research/{Project}-references.md with links, extracted patterns, and differentiation opportunities. Trigger phrases "research references", "посмотри аналоги", "изучи конкурентов", "прежде чем планировать", or automatically invoked from /new-project and /analyze-project flows.
---

# Research References

## Purpose

Before building anything, understand what already exists in the space. A plan built without references repeats the generic AI-slop aesthetic and duplicates solved problems. This skill grounds the project in reality — real competitors, real UI patterns, real user expectations.

## When to invoke

- **Mandatory** at the start of any `/new-project` flow (TZ-only input)
- **Mandatory** before major rework of an existing project (`/analyze-project` → research → plan)
- **Optional** when the user asks "как делают конкуренты" or similar mid-flight

## Inputs

`$ARGUMENTS` — the project topic. Examples:
- "hypercasual timing game with obstacle course"
- "task manager PWA for small teams"
- "roguelike card battler like Slay the Spire"

If no ARGUMENTS — extract topic from `wiki/_current.md` or ask the user via `ask_user_input_v0`.

## Research plan

### Step 1: Genre / category reconnaissance

Web search queries (2-4 calls):
1. `top <genre> games <year> <platform>` (e.g. "top hypercasual timing games 2026 mobile")
2. `<genre> design patterns UI UX`
3. `<genre> monetization strategies` (if monetization is in scope)
4. `<genre> common mistakes` or `<genre> what users hate`

Read top 3-5 results per query. Focus on:
- Names of real competitors (not AI-generated "Game A")
- Quantified user feedback (reviews, retention numbers where available)
- Documented design mistakes to avoid

### Step 2: Platform-specific reconnaissance (if platform is known)

If targeting Yandex Games, VK, Telegram, MAX, RuStore — search:
- `top <platform> games <genre>` — what's popular there specifically
- `<platform> store listing best practices <year>`
- `<platform> moderation rejection reasons` — what gets games kicked out

Russian platforms have distinct conventions: Yandex wants vertical+horizontal ZIPs, MAX wants Russian-legal entity, VK Pay has specific amount rules, etc. Reference the platform README in `platforms/{name}/README.md` for ground truth on validators.

### Step 3: Visual / UX references

Use `image_search` for 3-5 queries when the project has a visible UI:
- `<genre> game UI screenshot mobile`
- `<specific concept> interface design`
- `<target aesthetic> <genre>` (e.g. "retro-futurist space shooter UI")

Goal: produce a visual reference board in the research doc. NOT to copy, but to give Claude a grounded starting point for the `frontend-design` skill later.

For apps: try Behance / Dribbble via search (`site:dribbble.com <app concept>`).

### Step 4: Feature extraction

From 3-5 competitor products, extract:
- **Core loop** — what's the 30-second player experience
- **Tier 1 features** — what every competitor has (= table stakes)
- **Tier 2 features** — what some have (= opportunity to differentiate)
- **Anti-features** — what competitors ship that users complain about

### Step 5: Output to wiki

Write `wiki/research/{Project}-references.md`:

```markdown
# {Project} — Reference Research

**Date:** {YYYY-MM-DD}
**Topic:** {genre/category}
**Platform focus:** {platforms if known}

## Competitor landscape

### Similar product 1: <Name>
- **Link:** <URL>
- **Platform:** <Yandex Games / VK / …>
- **Strengths:** <bullet list from reviews>
- **Weaknesses:** <bullet list from reviews>
- **Screenshots:** <if gathered>

### Similar product 2: <Name>
…

## Extracted patterns

### Core loop
…

### Table-stakes features (every competitor has)
- …

### Differentiation opportunities (some have, mixed reception)
- …

### Anti-features (users complain about)
- …

## UI / UX references

- <3-5 image links or screenshots from image_search, with one-line descriptors>

## Russian-market specifics (if applicable)

- <Platform-specific conventions from search>
- <Localization notes: 13 languages for Yandex, etc>

## Open questions for user

- <Things Claude couldn't determine from research — user decides>
```

### Step 6: Brief the user

After writing the file, produce a one-screen summary in chat:

```
📚 Research complete → wiki/research/{Project}-references.md

TOP 3 competitors found:
1. <Name> (<platform>) — <one-line takeaway>
2. <Name> (<platform>) — <one-line takeaway>
3. <Name> (<platform>) — <one-line takeaway>

TABLE-STAKES features (you need these to compete):
- <3-5 bullets>

DIFFERENTIATION opportunities:
- <2-3 bullets>

UI reference direction suggested: <brutalist / retro / editorial / …>

❓ Open questions:
- <0-3 items for user to confirm before planning>

Ready to move to planning? Or want me to dig deeper into <X>?
```

## CRITICAL — wiki cleanup before showing user questions

Per Architectural Invariant #14: before printing the summary block above and asking the user questions, **the last actions must be**:

1. Update `wiki/_current.md` — mark research as Done in active task list, log decision (e.g. "competitor landscape captured in wiki/research/{Project}-references.md")
2. Update `wiki/_map.md` — append to "Done" section: `- {date}: research references captured for {Project}`

This guarantees Stop hook is **clean** when user reads the summary. Otherwise hook blocks → forces additional tool calls → user questions get pushed off screen.

**Never** ask user questions while wiki is dirty. Order is **always**: do work → update wiki → ask user.

## Anti-patterns — do NOT

- **Do not fabricate competitors.** If web search returns nothing useful — say so. "No direct competitors found" is a valid output.
- **Do not copy screenshots verbatim as UI mockups.** References inform style, they don't become the design.
- **Do not spend 20 web searches on a small project.** 5-10 calls total is the right range. If you need more — check with user first.
- **Do not skip Step 5.** The file in `wiki/research/` is the actual artifact — a chat-only summary evaporates with the session.
- **Do not plan the project in this skill.** This is research. Planning happens after, in `/plan` or `/new-project`.

## Constraints

- Always uses web_search — no research from memory
- Cites real sources (URLs in the output doc)
- If the user corrects a fact — re-search, don't argue

## Related skills

- `/new-project` — calls this skill automatically as Phase 0
- `/analyze-project` — calls this before planning rework
- `/plan` — consumes the research doc to build `wiki/plan/{Project}.md`
- `frontend-design` (external Anthropic skill) — consumes the UI reference direction
