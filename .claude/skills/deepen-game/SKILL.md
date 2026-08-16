---
name: deepen-game
kind: tactical
description: "Content expansion orchestrator for EXISTING games (not new builds). Takes a working game and makes it deeper: more levels, better progression, more retention hooks, better visuals — grounded in research of similar successful games. Four phases: research → gap analysis → plan → execute. Use when game is functional but feels thin / short / flat / boring. Triggers on: 'расширить игру', 'больше контента', 'сделать глубже', 'deeper', 'more content', 'feels thin', 'expand game', 'content expansion', 'добавить больше'."
---

# /deepen-game — Content Expansion for Existing Games

## Purpose

Games ship "technically complete" — SDK integrated, one level works, core loop functions. But they feel thin: 5 minutes of content, no reason to return, no progression depth, no surprise. Users rate 2 stars and leave.

This skill takes a **working** game in `WorkProgress/{Project}/` and methodically expands its depth. Not invention from scratch — research-grounded expansion targeting real gaps vs real competitors.

## ⚠️ When NOT to use

- Game is broken / doesn't run → fix first with `/game-polish` or `/fix-ui`
- Game is from-scratch new build → use `/new-project` + `/full-pipeline` instead
- Just want visual upgrade → `/visual-upgrade` (narrower scope)
- Balance/difficulty tuning only → `/game-design` directly

## Phase 1: Research (MANDATORY)

Invoke `/research-references` with the game's genre + platform + "content depth":

```
/research-references {genre} mobile games content depth progression retention
```

This produces `wiki/research/{Project}-references.md`. Expect to find:
- 3-5 successful games in same genre
- How long their "content tail" is (levels count, chapters, difficulty modes)
- Which retention features they ship (daily quests, battle pass, seasons, endless mode)
- UI density — are they minimalist or feature-rich?
- Common complaints — what users hated that you should avoid

**STOP after this phase.** Show summary → user confirms direction → Phase 2.

## Phase 2: Gap analysis (MANDATORY)

Compare current game state vs competitor references:

```
## Gap Analysis — {Project}

| Dimension | Current | Competitors avg | Gap |
|---|---|---|---|
| Levels/content | 5 levels | 30-50 + endless | -80% |
| Progression | None | XP + unlockables | 0% |
| Retention hooks | None | Daily quest + leaderboard | 0% |
| Visual polish | programmer-art | polished sprites | medium |
| Session length target | unclear | 3-5 min | unknown |
| Onboarding | none | 30sec tutorial | 0% |

## Biggest gaps to close (prioritized)

1. **Level count** — 5 → 20 minimum (5× expansion)
2. **Progression system** — add XP + unlockable characters/skins
3. **Retention** — add daily quest (3 simple objectives, 24h reset)

## Out of scope (flagged but not addressed)

- Multiplayer / social features (too large, separate project)
- Battle pass monetization (requires backend, separate decision)
```

Write this to `wiki/plan/{Project}-deepen.md`. Show to user. **Wait for prioritization** — user may strike some items, add others.

## Phase 3: Execution plan (MANDATORY stop before action)

Turn the prioritized gaps into an ordered action list. For each, identify which existing Forge skill executes it:

```
## Execution plan — {Project}

### Priority 1: Level count 5 → 20
- Skill: /level-design
- Target: procedural generator OR 15 new hand-tuned levels
- Estimated files touched: src/levels.js, src/game.js, data/levels.json
- Expected lines added: ~500-1000
- Stop point: after 10 levels implemented, user playtest

### Priority 2: Progression system (XP + unlocks)
- Skill: /game-design
- Target: XP curve + 5 unlockables gated by XP
- Estimated files: src/progression.js (new), src/ui.js, data/unlocks.json
- Expected lines added: ~300
- Stop point: after progression implemented, before visual of unlock screen

### Priority 3: Daily quest
- Skill: /game-design (retention section)
- Target: 3 rotating objectives, localStorage state, 24h reset
- Estimated files: src/dailyquest.js (new), src/hud.js
- Expected lines added: ~200
- Stop point: after integration, before localization of quest strings
```

Write to `wiki/plan/{Project}-deepen.md` (same file from Phase 2, append). Show to user. **Wait for "погнали" / "начнём с 1 и 3, 2 позже".**

## Phase 4: Execute (iteratively, with stops)

For each prioritized item:

1. Read the target skill file fully (`.claude/skills/<skill>/SKILL.md`)
2. Apply changes in its "SAFE ZONE" (never touch SDK, ads, localization, debug)
3. After each priority completes → report what changed → `bash scripts/verify.sh` → mandatory stop
4. User says "continue" → next priority

Update `wiki/plan/{Project}-deepen.md` priority status after each: `todo` → `in_progress` → `done`.

### Which skills are allowed in this phase

- `/game-design` — core loop, progression, retention
- `/level-design` — level count and variety
- `/visual-upgrade` — visual polish (only if it was a prioritized gap)
- `/app-ux-polish` — if app-like UI elements
- `/mobile-game-ui` — if UI density/layout needs rework
- `/sound-design` — if audio was a gap

### Which skills are forbidden in this phase

- `/yandex-sdk-integration`, `/vk-sdk-integration`, etc — that's a release activity, not content
- `/localize` — don't translate mid-expansion, wait until content is stable
- `/debugcheck-enhance` — dev tooling, not user-facing
- `/fill-yandex`, `/fill-vk` — store listing is release-phase
- Any `/release-*` — absolutely not

This skill is **content expansion only**. Release-phase skills break the separation.

## Phase 5: Final report (MANDATORY)

After all prioritized items done, output:

```
═══════════════════════════════════════
  /deepen-game complete: {Project}
═══════════════════════════════════════
  Starting state (before):
  - Levels: 5
  - Progression: none
  - Retention hooks: 0
  - Approximate content runtime: 10 minutes

  Ending state (after):
  - Levels: 20 hand-tuned + procedural endless mode
  - Progression: XP + 5 unlockables
  - Retention hooks: daily quest (3 rotating objectives)
  - Approximate content runtime: 45-60 minutes

  Files changed: 12
  Lines added: ~1400
  Skills applied (in order): /game-design, /level-design, /mobile-game-ui

  Next recommended:
  - /localize to translate new quest strings (13 languages if Yandex)
  - /visual-upgrade for new UI elements (if visual polish was a flagged gap)
  - /release-ready <platform> when ready to ship
═══════════════════════════════════════
```

## Self-check before delivering: is it deeper, or just bigger?

Added systems can create the *illusion* of depth (more menus, more numbers) without adding real
decisions. Before delivering each priority, verify it actually deepened the game:

- [ ] **It adds a decision, not just content** — does the player now make a meaningful choice they
      didn't before? More of the same (10 levels → 20 identical levels) is volume, not depth.
- [ ] **The new system interacts with the core loop** — it feeds back into the main action, not a
      bolted-on side screen the player ignores.
- [ ] **It's not just complexity** — complexity = more to track; depth = more interesting choices.
      If the player needs a wiki to understand it but the choices aren't richer, you added friction.
- [ ] **BEFORE/AFTER is honest** — the report's numbers reflect a real change in what the player does,
      not just "added 3 features".

One-line verdict per priority ("self-check: combo system adds a risk/reward decision mid-run, feeds
score multiplier back into the core loop — depth, not just a new meter").

## Non-Negotiable

- [ ] Phase 1 (research) MUST run — no skip even for "simple" games
- [ ] Phase 2 (gap analysis) goes to `wiki/plan/{Project}-deepen.md` (file, not just chat)
- [ ] Phase 3 (exec plan) has user approval BEFORE any code change
- [ ] Stops between priorities — never batch all in one go
- [ ] No SDK / ads / localization / release skills called during execution
- [ ] Final report shows BEFORE/AFTER state with numbers

## Anti-patterns

- ❌ "Let me also just quickly add SDK while I'm here" — no. Out of scope.
- ❌ Starting Phase 4 without explicit go-ahead from user on the prioritized list
- ❌ Implementing a feature that wasn't in the approved plan
- ❌ Skipping research because "the game is small" — small games benefit most from competitor study
- ❌ Doing "Priority 1 + 2 + 3" in one stop without reporting/verification between

## When a priority takes too long

If a single priority has been running for >3 edit batches without completion, that's a signal it's decomposed wrong. Stop, report what's been done, propose breaking the priority into sub-items. Don't force completion in one go.

## Related skills

- `/full-pipeline` — for raw-prototype → release-ready (includes SDK integration). Use for new builds.
- `/game-design` — individual skill called by Phase 4 of this orchestrator
- `/level-design` — same
- `/visual-upgrade` — same (optional, if visual is a gap)
- `/research-references` — mandatory Phase 1 input
- `/release-ready` — what to run AFTER /deepen-game finishes, before actual release
