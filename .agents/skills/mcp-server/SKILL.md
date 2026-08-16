---
name: mcp-server
kind: tactical
description: "Setup и usage Forge MCP server. Exposes 96 skills, 12+ ADRs, 13 invariants, 10 verifiers, 3 prompt templates as MCP resources/tools/prompts to other Claude instances (Claude…"
---

# Forge MCP Server

## Зачем

Forge knowledge (96 skills, 13 invariants, ADRs, 10 verifiers) сейчас live в одном Forge install. Если у тебя другой проект (game, app, anything), Claude в другой session не имеет доступа к Forge knowledge → нужно copy-paste SKILL.md text в каждый prompt.

С MCP server — Forge становится **knowledge service** доступный из любой Claude session. Без npm install, без HTTP server, без auth. Pure stdio JSON-RPC.

## Когда использовать

- Работаешь на game project в `F:\Projects\my-game\` через Claude Code, хочешь применить Forge `$level-design` patterns без copy-paste
- Используешь Claude Desktop для review/architecture, хочешь reference Forge invariants
- Нужно run Forge verifier (`check-platform-completeness`, `check-bat-encoding`) на non-Forge project

## Quick setup

### 1. Запуск сервера

Server file: `mcp-server/index.mjs` в Forge install. **Pure Node, no install** required:

```bash
cd /path/to/project-forge
node mcp-server/index.mjs
```

### 2. Claude Desktop integration

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "forge": {
      "command": "node",
      "args": ["F:/ProjectForgeUniversal/project-forge/mcp-server/index.mjs"],
      "env": {
        "FORGE_PATH": "F:/ProjectForgeUniversal/project-forge"
      }
    }
  }
}
```

Restart Claude Desktop. "forge" появится в menu for resource attaching.

### 3. Claude Code integration

```bash
claude mcp add forge node /absolute/path/to/project-forge/mcp-server/index.mjs
```

Then в any project:

> Use forge tools to check encoding of my .bat files.
> Read forge://skill/finance-app-foundation и apply patterns.

## Что доступно

### Resources (read-only)

- `forge://skill/{name}` — any Forge skill content (95 available)
- `forge://decision/{name}` — ADR content (12+ decisions)
- `forge://invariants` — distilled 13 Architectural Invariants

### Tools (callable)

10 verifiers — каждый takes optional `path` and `json` params:

| Tool | Purpose |
|---|---|
| `check_cross_refs` | advisor catalog audit |
| `check_bat_encoding` | cmd.exe parser safety |
| `check_platform_completeness` | 18×9 platform integration |
| `check_skill_kind` | skill categorization |
| `check_inline_strings` | i18n discipline |
| `check_no_float_money` | finance precision |
| `check_workspace_discipline` | 3-folder discipline |
| `check_dashboard_structure` | visual regression |
| `check_pipeline_state` | pipeline progress |
| `check_claude_md_size` | context budget |

### Prompts (templates)

- `forge_advisor` — recommend skills given task
- `forge_start_project` — bootstrap new project
- `forge_apply_invariants` — review against 13 invariants

## Testing

```bash
cd mcp-server/
node test.mjs
# Expected: ✓ 20/20 tests passed
```

## Architecture notes

- **stdio JSON-RPC** — no HTTP/auth, assumes local trust
- **Read-only по умолчанию** — verifiers all audits, не modify files
- **No SDK dependency** — single file, ~400 lines
- **Per-session FORGE_PATH** — different MCP clients may target different Forge installs

## Limitations

- No HTTP transport (use official SDK if needed)
- No resource subscription
- Sync verifier execution с 30s timeout
- Don't expose над network (no auth)

## Triggers and flags

If user mentions:
- "MCP server" / "MCP integration" → `$mcp-server` (this skill)
- "expose Forge to other project" → `$mcp-server`
- "Claude Desktop + Forge" → `$mcp-server`

Documentation: see `mcp-server/README.md` для full setup details.
