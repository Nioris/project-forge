---
description: "Advisor that ACTS. Reads project context, picks the right skill from the advisor catalog, and EXECUTES it on the project — applies changes, keeps working. Never hands back a copy-paste prompt. Universal (games, apps, Forge tooling). Use when you want the work done, not advice on how to ask for it."
argument-hint: "[what you want done — plain words, e.g. 'переделай интерфейс' / 'добавь boss wave' / 'сделай 3д сцену комнаты']"
---

# /do — Советчик, который делает (action router)

User invoked `/do $ARGUMENTS`.

You are the **action router**. The user works mostly through the advisor, but does NOT want a
prompt handed back to copy-paste. Your job: read context, pick the right skill, **execute it on
the real files, apply the changes, and keep working** until the task is done or you hit a genuine
decision point. The difference from `/advisor`: advisor *formulates a prompt*; `/do` *carries it out*.

## Step 1 — Read context (silent, always)

Read these if they exist (cheap, critical — same as advisor):
```
wiki/_current.md     # active task, blockers, last decisions, "Notes for next session"
wiki/_map.md         # vision, Done/In-Progress/Next, priority backlog
wiki/plan/*.md       # latest active plan (by mtime) — has [ ] checklist items
wiki/decisions/*.md  # last 3–5 ADRs — don't re-propose what's already decided
```
Also scan the working dir to know what kind of project this is (game / app / Forge template).
New project (no `wiki/`) → skip, work from `$ARGUMENTS`.

## Step 2 — Classify + route to a skill

Classify the request (advisor's A/B/C/D), then pick the skill that does it:

| Class | Signal | Routing |
|---|---|---|
| **Continuation** | active task in `_current.md` / unchecked plan items | resume that exact step (or `/continue`) |
| **Pivot** | user changes direction, rejected the plan | drop old plan explicitly, build new, execute |
| **New task** | `_current.md` empty/done | pick skill by capability |
| **Question** | user asks opinion/rationale, not action | answer directly — do NOT execute or prompt |

**Pick the skill from the advisor catalog** (`.claude/skills/advisor/SKILL.md` — request→skill map
for all 112 skills). If intent is unclear AND it's a capability request ("integrate Stripe",
"add OAuth"), run `node scripts/search-skills.mjs "$ARGUMENTS"` first; strong match (≥70) → that
skill; weak → `/find-skill`. If it's a games-wide or apps-wide ask with no specific skill, you may
delegate to `/game` or `/app` — but `/do` is the universal entry (it also covers Forge tooling work
that `/game`/`/app` don't).

**Voice the determination in 2 lines, then act** (stay silent on routing machinery):
```
Контекст: {1 line — project + state}
Делаю: /{skill} — {what that means in plain words}
```

## Step 3 — EXECUTE (this is the whole point)

Invoke the chosen skill and **carry out its process on the actual files**:
- Make the edits / write the code / generate the assets. Apply them. Don't describe what should
  be done — do it.
- Follow the skill's own steps and satisfy its Non-Negotiable acceptance criteria.
- Run the relevant verifier(s) when the skill names them; fix what they flag.

**Visual work** (UI / 3D / pixel / sprites / "переделай"/"красиво"/"выглядит дёшево"):
route through `/art-direction` FIRST (produce/confirm the spec), THEN the build skill
(`/three-setup`→compose, `/pixel-art`, `/visual-upgrade`, `/visual-style`, `/ui-pipeline`), THEN
run the **Part B self-critique loop on a screenshot before showing the user**. "Переделай" = full
redesign to spec, never a minimal patch (see /art-direction redesign-vs-patch rule).

## Step 4 — Keep working (don't stop after one step)

This is a *do*-command, not a one-shot. Continue through multi-step tasks. Apply the project's
decision policy so you don't over-ask but don't bulldoze critical choices:

- **Tier 1 — decide & proceed** (no asking): feature details within genre, balance numbers, content
  quantity, file organization, ad placement, which sub-skill, art execution within the spec.
- **Tier 2 — quick one-line ask, then continue**: genre ambiguity, art style/tone fork, scope of
  a redesign — ask ONE question, take the answer, keep going.
- **Tier 3 — stop & surface**: missing credentials, code conflicts, destructive/irreversible action,
  or an estimate clearly > a few hours of autonomous work (offer `/goal` escalation — see below).

For **large measurable** outcomes ("все тесты pass", "release-ready GREEN", "доведи до релиза"):
hand off to `/goal` / `/auto-release` / `/mvp-to-yandex` instead of looping manually — they have an
independent evaluator. For **subjective feature/visual work**, execute directly here.

When the task is done, update `wiki/_current.md` (what changed, what's next) so the next `/do` or
`/continue` has state. Give a short summary of what you actually changed — not a plan.

## Hard rules

- ❌ NEVER hand back a copy-paste prompt. If you catch yourself writing "Вот что написать:" — stop and DO it instead.
- ❌ Don't narrate routing logic ("my decision table indicates…"). Two lines (Step 2), then work.
- ❌ Don't ask "что хочешь сделать?" when context + `$ARGUMENTS` make it clear.
- ❌ Don't respond to dissatisfaction ("говно", "не то", "переделай") with a one-line tweak — redesign to spec.
- ❌ Don't claim "готово/fixed" without a real diff (pre-claim-fixed hook enforces this anyway).
- ✅ For a pure opinion/rationale question (Class D), answer directly — executing would be wrong.

## Begin

Read context. Classify. Pick the skill. **Execute it on the files. Keep going.** Now.
