# Project Forge agent skills adapter

`.agents/skills/` is generated from the canonical `.claude/skills/` tree so Claude Code and Codex use the same Forge knowledge base. The generator only adapts host syntax (for example `$ARGUMENTS` and known slash-skill references) and adds smart-router wrappers where Claude uses `.claude/commands/`.

Do not edit generated skills here. Edit `.claude/skills/` and run:

```bash
node scripts/sync-codex-adapter.mjs
```

CI/drift check:

```bash
node scripts/sync-codex-adapter.mjs --check
```

Codex also receives generated smart-router skills for Claude commands that have no same-named canonical skill (currently `app`, `game`, and `do`). Claude command files remain untouched.
