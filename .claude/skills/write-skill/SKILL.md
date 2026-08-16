---
name: write-skill
kind: tactical
description: Create a new production-quality skill from plain-language description. Use when user says "write skill", "create skill", "новый скил", or when a needed skill doesn't exist.
---

# Write Skill

## Arguments
`$ARGUMENTS` — plain language description of what the skill should do.

## Skill Format

Every skill follows this structure:

```markdown
---
name: {kebab-case}
description: "{1-2 sentences. What it does and when to trigger it.}"
---

# {Skill Name}

## Purpose
{One paragraph. Just the main idea.}

## Instructions

### Step 1: {action}
{Exact instructions with code if needed.}

### Step 2: {action}
{Same precision.}

### Step 3: {action}
{Same precision.}

## Non-Negotiable Acceptance Criteria
- [ ] {Criterion 1 — must be verifiable}
- [ ] {Criterion 2}
- [ ] {Criterion 3}
```

## Key Principles

1. **Atomic tasks.** Each skill does ONE thing.
2. **YAML frontmatter required.** `name` and `description` fields.
3. **Description is trigger.** Make it "pushy" — include contexts when to use.
4. **Max 3 steps.** More = split into smaller skills.
5. **Code, not descriptions.** If function >5 lines, write the code.
6. **Supporting files welcome.** Put references in `references/`, scripts in `scripts/`.

## After Writing

Save to: `.claude/skills/{name}/SKILL.md`

If it has reference docs, create:
```
.claude/skills/{name}/
├── SKILL.md
├── references/
│   └── {detail}.md
└── scripts/
    └── {automation}.sh
```

Show summary:
```
Skill: {name}
Location: .claude/skills/{name}/SKILL.md
Steps: {N}
Acceptance criteria: {N}
Invoke: /{name} or auto-triggered by: {triggers}
```
