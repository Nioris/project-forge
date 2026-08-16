---
date: 2025-11 (v4.4 era)
status: accepted
tags: [decision, architecture, skills]
---

# 002: Two skills libraries — `.claude/skills/` (commands) vs `./skills/` (knowledge base)

## Context

By v4.4 Forge had ~50+ specialized markdown documents covering different concerns:
- **Slash commands** like `/release-yandex`, `/start`, `/advisor` — user invokes them
- **Reference docs** like "how to use Phaser correctly", "RuStore manifest format" — Claude reads them as needed

Putting everything in `.claude/skills/` gave Claude Code a 100+ skills bloat in slash-menu, much of it never directly invoked.

## Options Considered

1. **Everything in `.claude/skills/`** — all 100+ markdowns as slash commands. Pros: simple. Cons: bloated menu, hard to navigate, many "skills" не имеют semantic activation.

2. **Single library, sub-categorized** — folder structure inside `.claude/skills/`. Pros: less duplication. Cons: still loaded as commands, still bloats menu.

3. **Two libraries with clear separation** — `.claude/skills/` only for slash-commands, `./skills/` для knowledge base referenced by skills.

## Decision

Two libraries:

- **`.claude/skills/{name}/SKILL.md`** — slash commands (currently 81). Loaded by Claude Code, registered as `/name` in slash menu. User invokes directly.
- **`./skills/{category}/{name}/SKILL.md`** — knowledge base (currently 61). NOT loaded as commands. Referenced by command skills (`.claude/skills/start/` says "Read skills/core/visual-quality/SKILL.md before doing X").

Counter говорит "Skills KB: 61, Commands: 81" в setup output.

## Consequences

- **Pro**: Slash menu remains manageable (~80 commands instead of 140+)
- **Pro**: Knowledge base growable indefinitely without UI bloat
- **Pro**: Clear separation: "what user invokes" vs "what Claude consults"
- **Con**: User confusion ("why are there two skills folders?") — addressed in CLAUDE.md and GUIDE.md
- **Con**: When adding new skill, must decide which library — heuristic: "if user types `/this-name`, it's a command; if Claude reads it during a command, it's KB"

Note: Anthropic's Claude Code does support nested `.claude/skills/` structure if we wanted single library with sub-folders, but explicit two-library approach is more pedagogically clear.
