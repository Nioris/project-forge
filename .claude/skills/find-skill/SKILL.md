---
name: find-skill
kind: tactical
description: "Discovery skill — помогает юзеру найти подходящий skill когда capability нужна, но юзер не знает что у нас уже есть для этого skill. Также подключается к npx skills marketplace если local не покрывает. Triggers on: как мне сделать, найди skill для, как добавить, могу ли я, помоги с, нужна функция, есть ли skill, find skill, search skill, install skill, marketplace, ecosystem, npx skills, как интегрировать, как реализовать."
---

# Find Skill — Discovery Workflow

## Purpose

Forge содержит 100+ skills. Юзер не должен помнить ни один из них. Этот skill **переводит** "wish for capability" → конкретный skill (local) или **install candidate** (marketplace).

Inspired by Vercel Labs `find-skills` — but adapted to Forge dual-tier architecture:
1. **Local-first** — 100+ Forge skills уже встроены, искать сначала их
2. **Marketplace-fallback** — если local нет, использовать `npx skills find` для public ecosystem

## When to invoke

Юзер saying:
- "как мне сделать X" / "как добавить Y" / "как реализовать Z"
- "есть ли skill для X" / "найди skill для X"
- "помоги с {domain}" — tooling, design, deployment, integration, testing, etc.
- "хочу интегрировать {service}" — Stripe, Discord, OAuth, etc.
- "нужна функция X" / "как сделать X в моём проекте"

NOT for:
- Specific simple bugs ("fix this typo") — just fix it
- Already-running skill workflows ("continue what we started") — use /continue
- Routing to known smart router ("новая игра") — use /game directly

## Process

### Step 1 — Understand the need

Identify:
1. **Domain** — what category (UI, data, deploy, testing, integration, design, monetization, performance, accessibility)
2. **Specific task** — concrete action ("validate forms", "add OAuth login", "create animations")
3. **Project context** — game / app / tool? Read `wiki/_map.md` if exists

Don't search blindly. Refine query first.

### Step 2 — Local search FIRST

```bash
node scripts/search-skills.mjs "{user query}"
```

Returns ranked matches by relevance score (description + triggers + name). Top 3-5 matches.

**Example:**
```
Query: "форма валидации"
Found:
  1. /app-data-model      (relevance: 85)  — schema, validation, persistence
  2. /find-or-make-skill  (relevance: 60)  — generic catalog/builder
  3. /app-ux-polish       (relevance: 45)  — flows, error states, validation UX
```

If top match has relevance ≥ 70 → **use it directly**. No marketplace needed.

If top match 40-70 → **suggest local + offer marketplace search**.

If all matches < 40 → **go to marketplace**.

### Step 3 — Marketplace fallback

When local doesn't fit, search public ecosystem:

```bash
npx skills find "{query}"
```

Vercel Labs Skills CLI выдаёт ranked results from public registry (skills.sh).

**Quality check before recommending:**
1. **Install count** — prefer 1K+ installs. Be cautious <100.
2. **Source reputation:**
   - ✅ Trusted: `vercel-labs/`, `anthropics/`, `microsoft/`, `openai/`
   - ⚠️ Caution: lesser-known, <100 stars
   - ❌ Reject: clearly malicious-looking names, no description
3. **Forge compatibility check** — read SKILL.md description. Does it use:
   - File system writes outside `.claude/skills/`? (sandbox escape)
   - Network calls? (note for offline users)
   - External CLI tools that might not be installed? (document)

### Step 4 — Present options

Present **max 3 options** к юзеру. Format:

```
🔍 Found these candidates for "{query}":

LOCAL (already in Forge):
  ① /app-data-model — schema validation, persistence, sync
     Trigger: "data structure", "validation", "schema"
     Use directly: just describe what data you need

MARKETPLACE (install required):
  ② vercel-labs/form-validation (45K installs, ✅ verified)
     Adds: client-side validation, error UX, accessibility
     Install: npx skills add vercel-labs/form-validation
  
  ③ anthropics/zod-schemas (12K installs, ✅ verified)
     Adds: Zod-based runtime validation для TypeScript
     Install: npx skills add anthropics/zod-schemas

Which one fits your need? [1/2/3/none]
```

Don't show >3. Don't show items <100 installs without explicit warning.

### Step 5 — Install (only on user approval)

If user picks marketplace option:

```bash
npx skills add {owner/repo} -g -y
```

`-g` = global install (user-level), `-y` = no prompts.

After install, **verify** it landed correctly:
```bash
ls .claude/skills/{skill-name}/SKILL.md
```

If skill landed in different path (depends on `npx skills` behavior on this machine) — document for user where it is.

### Step 6 — Forge adaptation (for marketplace skills)

Public marketplace skills don't know Forge conventions:
- They don't read `wiki/_map.md`
- They don't update `wiki/_current.md`
- They don't trigger Forge hooks

**On first use** of installed skill — invoke wrapper:

```bash
node scripts/adapt-skill-to-forge.mjs {skill-name}
```

Wrapper:
1. Reads installed skill's SKILL.md
2. Adds Forge-specific triggers to description (if missing)
3. Adds wiki cleanup section (per Architectural Invariant #14)
4. Logs adaptation in `wiki/_current.md`

User can skip adaptation if skill is one-time use (read SKILL.md, do task, done).

### Step 7 — Update advisor catalog

After install, update `.claude/skills/advisor/SKILL.md` catalog so it reflects new capability. Otherwise advisor doesn't know skill exists.

```bash
node scripts/update-advisor-catalog.mjs
```

## Anti-patterns

- ❌ Don't search marketplace без local check — local skills уже verified, work с Forge
- ❌ Don't recommend skills <100 installs without flag warning
- ❌ Don't auto-install — always ask user approval
- ❌ Don't skip Forge adaptation — public skills break wiki/hooks integration
- ❌ Don't show >3 options — choice paralysis
- ❌ Don't search blindly если query unclear — ask one focused question

## Flow examples

### Example A — Local hit
```
User: "как валидировать форму"
AI: [search-skills.mjs "validation form"]
    → /app-data-model (relevance 85)
AI: "Я использую /app-data-model — он покрывает schema validation."
    [invoke /app-data-model]
```

### Example B — Marketplace fallback
```
User: "как интегрировать Stripe"
AI: [search-skills.mjs "stripe payment"]
    → No local matches >40
AI: [npx skills find stripe]
    → vercel-labs/stripe-checkout (28K installs)
    → anthropics/stripe-webhooks (8K installs)
AI: "Local нет. Из marketplace 2 кандидата. Какой?"
User: "первый"
AI: [npx skills add vercel-labs/stripe-checkout -g -y]
    [adapt-skill-to-forge.mjs stripe-checkout]
    [update-advisor-catalog.mjs]
AI: "Установлен. Используй: /stripe-checkout {your goal}"
```

### Example C — Hybrid
```
User: "хочу UI redesign и добавить animation library"
AI: [search-skills.mjs "ui redesign"] → /ui-pipeline (95)
    [search-skills.mjs "animation library"] → no good local match
AI: "/ui-pipeline сделает redesign. Для animations предложу из marketplace."
    [после ui-pipeline]
AI: [npx skills find animation framer-motion]
    → vercel-labs/framer-motion-skill (52K installs)
AI: "Установить?"
```

## CRITICAL — wiki cleanup

Per Architectural Invariant #14, после search/install/adaptation, до того как ask user next question:
1. Update `wiki/_current.md` — log что искалось/установлено
2. Update `wiki/_map.md` Done section если skill installed
3. Then print result

## Integration points

- `/game` and `/app` routers — invoke find-skill когда capability requested doesn't match known skill
- `advisor` skill — references find-skill в "когда не нашёл подходящий"
- `start` skill (new project) — после bootstrap suggest find-skill для project-specific capabilities

## Files this skill uses

- `scripts/search-skills.mjs` — local search engine
- `scripts/adapt-skill-to-forge.mjs` — wrapper для public skills
- `scripts/update-advisor-catalog.mjs` — sync advisor с installed
- `npx skills find/add` — Vercel Labs CLI (auto-installed via npx, no separate setup)
