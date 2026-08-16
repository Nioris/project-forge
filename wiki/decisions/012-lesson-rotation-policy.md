---
date: 2026-04-28 (v4.9.0)
status: accepted
tags: [decision, lessons, knowledge-management]
---

# 012: Lesson rotation policy — invariants vs incidents

## Context

Forge accumulates lessons across versions. As of v4.8.0 there are 30 numbered lessons + ~14 unnumbered older ones. Previous behavior:

- Lessons live в CLAUDE.md changelog sections
- When CLAUDE.md exceeds soft limit (30 KB), oldest sections rotate to `docs/CHANGELOG.md`
- Eventually lessons disappear from Claude's context (Claude в новой сессии reads CLAUDE.md, not docs/)

**Problem:** Some lessons are **principles** (timeless rules) that should never rotate out. Others are **incidents** (version-specific bug fixes) that legitimately can rotate to history.

**Without distinction**, principles rotate out and Claude repeats mistakes that we already learned. Lesson #20 (encoding rules) almost rotated out before being promoted to invariant.

Lesson #30 made this explicit: "lessons themselves should be promoted to invariants when proven."

## Options Considered

1. **Keep all lessons in CLAUDE.md forever** — straightforward. Cons: file grows unbounded, cache cost increases, eventually breaks.

2. **All lessons rotate equally** (current pre-policy behavior) — simple. Cons: principles lost.

3. **Manual promotion to "Architectural Invariants"** — done in v4.8.0 (12 invariants extracted). Cons: ad-hoc, unclear когда promote.

4. **Formal classification + policy** — categorize each lesson as principle / pattern / incident, apply different rotation rules.

## Decision

**Option 4: 3-tier classification with rotation policy.**

### Tier 1: PRINCIPLE → promote to Architectural Invariants section

A lesson is a principle if:
- Applies regardless of version / platform / specific bug
- Provides actionable guidance ("always do X" or "never do Y")
- Captures pattern-level wisdom, not implementation detail
- Same lesson conceptually appears in 2+ versions independently

**Lifecycle:** Lessons logged in changelog → if pattern repeats across versions OR explicitly proven important → promote to `## 🧭 ARCHITECTURAL INVARIANTS` in CLAUDE.md. **Stays forever.**

Examples:
- "Platform addition = ~18 files" → Invariant #4
- ".bat ASCII-only inside `()`" → Invariant #5
- "Money never `number`" → Invariant #6

### Tier 2: PATTERN → keep in changelog но reference from skill/decision

Pattern is principle that's specific enough to belong в a skill or ADR rather than top-level invariant.

**Lifecycle:** Logged in version's changelog. When CLAUDE.md rotates, **before rotation** check if lesson should be referenced from a skill SKILL.md или wiki/decisions/. If yes — copy reference there.

Examples:
- Lesson #25 (chunked thinking advisor) → referenced from `.claude/skills/advisor/SKILL.md`
- Lesson #29 (per-category architectural skills) → captured in [[decisions/010-architectural-vs-tactical-skills]]

### Tier 3: INCIDENT → rotate to docs/CHANGELOG.md, OK if forgotten

A lesson is an incident if:
- Specific to one version's bug or workaround
- Already addressed by a verifier or hook (so cannot recur silently)
- Would be confusing if applied generally

**Lifecycle:** Lives in changelog while version is recent, rotates with version's changelog to docs/CHANGELOG.md. May eventually be forgotten — that's OK because the technical fix prevents recurrence.

Examples:
- "v4.7.4 z-index regression" — fixed in code, cannot recur for that specific layout
- "v4.7.5 advisor lost 4 skills during rewrite" — now caught by `check-cross-refs.mjs`
- "v4.7.1 sync.bat parser crash" — fixed in code, prevented by `check-bat-encoding.mjs`

## Process — when adding a new lesson

In CLAUDE.md changelog, after Lesson is described:

```markdown
### Lesson #N

[lesson body]

**Tier:** principle / pattern / incident
**Action:** promote to Invariants / reference in {skill/ADR} / leave in changelog
```

If `principle` — at end of release, promote to Invariants section.
If `pattern` — at end of release, ensure reference exists in target skill/ADR.
If `incident` — leave in changelog, will rotate eventually.

## Process — periodic audit (every 5 lessons or при release)

Walk through last 5 lessons. For each:

1. Check classification was correct in hindsight
2. If principle was misclassified as pattern → promote retroactively
3. If pattern's reference missing → add it
4. If incident has actually recurred (i.e. wasn't truly fixed) → upgrade to pattern, ensure code fix exists

## Consequences

- **Pro:** Principles preserved permanently, cannot be lost via rotation
- **Pro:** Each lesson has explicit "what to do with it" instruction
- **Pro:** Audit cycle catches misclassification
- **Pro:** Reduces cognitive load — adding lesson now has clear template
- **Con:** Adds metadata burden to lesson logging (one extra line)
- **Con:** Periodic audit = work we have to remember to do
- **Con:** Retrospective tier assignment is judgment call — может ошибаться

## Retrospective application

Audit existing 30 lessons + ~14 unnumbered:

**Already promoted в v4.8.0 invariants (12 principles):**
- Lesson #17 → Invariant #4 (platform addition)
- Lesson #20 → Invariant #5 (encoding rules)
- Lesson #22 → Invariant #7 (UI migrations / 0-is-falsy)
- Lesson #23 → Invariant #8 (stacking context)
- Lesson #25 → Invariant #9 (chunked thinking)
- Lesson #26 → Invariant #2 (architectural vs tactical)
- Lesson #27 → Invariant #1 (3-layer enforcement)
- Lesson #28 → Invariant #10 (pipeline orchestrators)
- Plus implicit invariants: #3 (workspace discipline), #6 (money types), #11 (no manual audits), #12 (mtime tolerance)

**Patterns referenced in skills/ADRs:**
- Lesson #29 → ADR 010 (per-category foundations)
- Lesson #21 → tech-debt.md (localStorage migrations — not yet implemented but tracked)

**Incidents — keep in changelog:**
- Lessons 1-16 (mostly old format "Lesson logged" entries, no principles encoded — pure history)
- Lesson #18 (User pushing back is a feature) — meta-observation, not technical
- Lesson #30 (this very meta-lesson) — completed via this policy itself

**Newly identified for promotion (post-v4.8.0):**
- Lesson #18 should arguably be in CLAUDE.md as a meta-principle: "User pushback signals reveal architecture issues — listen and update plans, не argue." Will add в next CLAUDE.md update.

## Rules summary

| When you... | Do this |
|---|---|
| Add new lesson | Tag tier (principle / pattern / incident) |
| Find principle in changelog | Promote to Invariants |
| Find pattern in changelog | Reference from skill/ADR before rotation |
| Find incident in changelog | Leave it, rotate naturally |
| Release new version | Audit last 5 lessons for tier correctness |
| Notice repeated same lesson | Definite principle — promote |
