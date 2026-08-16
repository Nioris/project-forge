---
name: find-or-make-skill
kind: tactical
description: "Before Claude attempts any specialized task (game physics, animation library, specific SDK, design system, monetization strategy, etc) — use this skill to find an existing skill…"
---

# Find-or-Make Skill

## Purpose

Prevent Claude from hallucinating solutions when a proper skill already exists somewhere in the ecosystem. Discovery-first, creation-last.

## Decision chain (execute in order — stop at first hit)

### Step 1: Local project skills (cheapest, most relevant)

```
Glob: .claude/skills/**/SKILL.md
```

Scan descriptions (not just names) for semantic match with the task. Don't just keyword-match — read the `description:` frontmatter field.

If a local skill matches → invoke it, STOP.

### Step 2: Local agents (platform builders + general helpers)

```
Glob: .claude/agents/*.md
```

If an agent's frontmatter `description:` matches the task → use it via Task tool, STOP.

### Step 3: Anthropic official skills (verified, high quality)

Web search these three sources:
1. `site:code.claude.com skill <topic>` — official docs
2. `github.com/anthropics/skills <topic>` — Anthropic's own skill repo
3. `github.com/anthropics/claude-plugins-official <topic>` — official plugin marketplace

If found and clearly matches → tell user the install command (`/plugin install …` or `git clone …` into `.claude/skills/`) and wait for approval. Don't install silently.

### Step 4: Community marketplaces (bigger surface, more variance)

Web search:
1. `site:claudepluginhub.com <topic>`
2. `site:buildwithclaude.com <topic>`
3. `github.com vercel-labs/agent-skills <topic>`
4. `github.com anthropics/skills <topic>` (in case Step 3 missed)

Report findings to user with links. Rule: community skills MUST be reviewed before install — read the SKILL.md content, check for network calls, external dependencies, etc. (per Anthropic security guidance for skills).

### Step 5: Fall back to $write-skill (local creation)

Only reach here if Steps 1-4 turned up nothing.

1. Call `$write-skill` with a plain-language description of what's needed.
2. Wait for it to produce a new skill in `.claude/skills/{new-skill}/SKILL.md`.
3. Report what was created.
4. Then invoke the new skill for the original task.

## Output format

Always produce a one-paragraph report:

```
🔍 Skill discovery for: <task>

Step 1 (local skills):      <found X relevant / none>
Step 2 (local agents):      <found / none>
Step 3 (Anthropic official): <found name + URL / none>
Step 4 (community):         <found name + URL / none>
Step 5 (creation):          <invoked $write-skill / skipped>

→ Using: <skill name + source>
```

## Anti-patterns — do NOT

- Don't skip Step 1 because "it's obvious there's no skill" — check the actual directory
- Don't hallucinate a marketplace URL — only list what search actually returned
- Don't install a community skill silently — user must see the SKILL.md first
- Don't create a new skill without going through Steps 1-4 — wasted work
- Don't check Step 5 first because it's easier — creation is LAST resort

## When NOT to use this skill

- Task is clearly general coding (fix bug, add button, write test) — no specialized skill needed
- User explicitly said what skill to use
- The relevant skill is obviously already loaded in context (Claude just saw it)

## Related skills

- `$write-skill` — actual skill creation (Step 5)
- `$research-references` — for research of competitor projects/designs, not skills
- `$learn-sdk` — for learning a specific SDK's API surface
