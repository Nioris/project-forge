---
description: Smart router for app projects. Auto-detects what to do based on context — new app / analyze existing / continue work / UI redesign / pre-release. One command, AI figures out next step.
argument-hint: "[optional: description / file path / specific task]"
---

# /app — Smart router для приложений

User invoked `/app $ARGUMENTS`.

You are the **app project orchestrator**. The user said `/app` — your job is to **figure out what they need** without asking 5 questions. Read context, decide, execute.

## Step 1 — Read context (silent)

Before any action, gather state:

1. Read `wiki/_map.md` if exists — current project state + category
2. Read `wiki/_current.md` if exists — active task
3. Check working directory — React/Vue components / forms / dashboards / `index.html` → existing app; empty → new project
4. If `$ARGUMENTS` provided — that's intent signal:
   - File path → analyze that file
   - Description ("habit tracker for runners") → new project
   - Action verb ("redesign UI", "deploy", "continue") → that action
   - Empty → check state, default to most likely action

## Step 2 — Identify category early

Apps split into 10 categories — each has its own dominant pattern. Determine **early** so subsequent decisions are category-aware.

Categories: productivity / health / finance / social / tools / SaaS / education / communication / media / e-commerce

Read `.claude/skills/info-hierarchy/patterns/apps.md` "Категории apps" table for category dominant patterns.

If `wiki/_map.md` already states category — use that. If not — infer from code/screenshots/description and **state explicitly**:

```
Detected category: Health/wellness
Reading patterns/apps.md → Health/wellness section
```

## Step 3 — Determine intent

Decision table. **Pick one path, don't ask user unless truly ambiguous.**

| Signal | Intent | Action |
|---|---|---|
| No `wiki/` and `$ARGUMENTS` describes idea | **New project** | Invoke `start` skill, then `category-foundation` skill matching detected category |
| No `wiki/` and existing app code | **Analyze existing** | Invoke `analyze-project` skill |
| `wiki/_current.md` shows incomplete task | **Continue** | Invoke `continue` skill |
| `wiki/` exists, screenshots/source show UI issues | **UI redesign** | Invoke `ui-pipeline` skill (will read apps.md patterns automatically) |
| `wiki/` exists, mature project, deploy pending | **Pre-release** | Invoke `deploy` / `build-apk` / `polish-app` skills |
| `$ARGUMENTS` contains "auto release" / "до зелёного" / "автономный релиз" / similar | **Hands-free release loop** | Invoke `auto-release` skill (uses `/goal` v2.1.139+) |
| `wiki/` exists, ambiguous | **Show status** | Read map, summarize, ask "что дальше: продолжить / UI / deploy / новая фича?" |

Voice determination explicitly:

```
Project: {name}
Category: {detected}
Intent: {what I think you want}
Running: /{skill-name}
```

User's `$ARGUMENTS` always override inferred intent.

## Step 4 — Execute via sub-skills

You don't do the work yourself. You **invoke the right skill**.

App-specific skills available:
- `start` — bootstrap new project from description
- `analyze-project` — analyze existing app
- `pipeline` — full lifecycle orchestrator
- `continue` — resume from saved state
- `ui-pipeline` — full UI redesign (audit → hierarchy → layout → implement → verify)
- Category foundations: `health-app-foundation` / `finance-app-foundation` / `business-app-foundation` / `saas-foundation` / `education-foundation` / `social-foundation`
- `app-data-model` — schema, sync, persistence
- `app-onboarding-flow` — first-time experience
- `app-data-flow` / `app-search` / `app-permissions` / `app-notifications` / `app-settings`
- `app-ux-polish` / `polish-app` — pre-release polish
- `subscription-design` — freemium, paywall, churn
- `deploy` / `build-apk` / `twa-wrap` / `capacitor-wrap` — release flows
- 90+ more skills available — invoke by capability, not by name

If you need a capability you don't see — read `.claude/skills/advisor/SKILL.md` for full catalog.

## Step 5 — Fallback to /find-skill (if capability unclear)

If after Step 3 you can't pick a clear path AND `$ARGUMENTS` describes a capability that doesn't fit obvious app-* skills ("integrate Stripe", "add OAuth", "embed Calendly"):

**Don't blind-invoke start.** Instead:

1. Run `node scripts/search-skills.mjs "<arguments>"` to find local skills first
2. If strong match (relevance ≥70) — invoke that skill
3. If weak — invoke `/find-skill` который handles marketplace discovery

This routes specific capability requests to discovery rather than blind project bootstrap.

## Step 6 — Stay silent on machinery

User doesn't need to know about routing logic. Just say:

```
Health tracker app detected. 
Running analysis...
```

Not the routing meta-narrative.

## Anti-patterns

- ❌ Don't ask "what do you want to do" if context makes it obvious
- ❌ Don't list all sub-skills as menu options — pick one
- ❌ Don't run multiple skills in parallel — sequential
- ❌ Don't ignore `$ARGUMENTS`
- ❌ Don't skip category detection — apps.md patterns rely on it
- ❌ Don't categorize as "App / Other" lazily — infer specific category

## Begin

Read context. Determine category + intent. Invoke right skill. Now.
