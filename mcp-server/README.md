# Forge MCP Server

Forge как MCP (Model Context Protocol) server. Позволяет другим Claude инстансам — Claude Desktop, Claude Code в other folders — query Forge knowledge без copy-paste.

## What it exposes

### Resources (read-only knowledge)

- **`forge://skill/{name}`** — full content любого из текущих Forge skills (`/start`, `/i18n-foundation`, `/health-app-foundation`, etc.)
- **`forge://decision/{filename}`** — content of ADRs (`011-wiki-audit-mtime-tolerance`, `012-lesson-rotation-policy`, etc.)
- **`forge://invariants`** — distilled 13 Architectural Invariants

### Tools (callable verifiers)

10 Forge verifiers exposed как callable tools — каждый принимает optional `path` и `json` параметры:

- `check_cross_refs` — advisor catalog vs filesystem audit
- `check_bat_encoding` — cmd.exe parser safety
- `check_platform_completeness` — 18 × 9 platform integration audit
- `check_skill_kind` — skill categorization audit
- `check_inline_strings` — i18n discipline check
- `check_no_float_money` — finance precision check
- `check_workspace_discipline` — 3-folder discipline check
- `check_dashboard_structure` — visual regression diff
- `check_pipeline_state` — 7-step pipeline progress
- `check_claude_md_size` — context budget tracker

### Prompts (workflow templates)

- **`forge_advisor`** — given task, recommend which skills to invoke
- **`forge_start_project`** — bootstrap new project с Forge methodology
- **`forge_apply_invariants`** — review code/design against the current Architectural Invariants

## Setup

### 1. Run server

No npm install needed. Pure Node. Launch стандартно:

```bash
cd /path/to/project-forge
node mcp-server/index.mjs
```

Или с custom Forge path:

```bash
FORGE_PATH=/some/other/forge/install node mcp-server/index.mjs
```

### 2. Connect from Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "forge": {
      "command": "node",
      "args": ["/absolute/path/to/project-forge/mcp-server/index.mjs"],
      "env": {
        "FORGE_PATH": "/absolute/path/to/project-forge"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see "forge" в context menu для resource attaching, and tools available для invocation.

### 3. Connect from Claude Code

```bash
# Add MCP server в settings
claude mcp add forge node /absolute/path/to/project-forge/mcp-server/index.mjs
```

Then within Claude Code в **any project**:

> Use forge tools to check pipeline state в this project.
> Read forge://invariants и review my recent changes.

## Architecture

- **Pure Node.js, no SDK dependency** — single file index.mjs implementing JSON-RPC 2.0 over stdio
- **Read-only by default** — verifiers ARE callable but they're all read-only audits
- **No state mutation** — server doesn't modify Forge files
- **Per-session FORGE_PATH** — different sessions can target different Forge installs

## Testing

```bash
node mcp-server/test.mjs
# Expected: ✓ 20/20 tests passed
```

## Known limitations

- **stdio only** — no HTTP transport (use official `@modelcontextprotocol/sdk` if needed)
- **No auth** — assumes local trust (don't expose over network)
- **No Resources subscription** — clients can't watch for changes
- **Sync execution** — verifiers что run >30s timeout

## Why not use the official SDK?

The official `@modelcontextprotocol/sdk` adds:
- HTTP transport with auth
- Resource subscription
- Sampling helpers
- 1-2 MB of `node_modules`

For Forge's use case (local stdio, read-only knowledge), raw JSON-RPC is **simpler + lighter**. If you need HTTP/auth, fork this server и add `@modelcontextprotocol/sdk`.

## Use cases

### 1. Apply Forge knowledge to non-Forge project

You're working на legacy code in `/work/legacy-app/` через Claude Code. You want Forge's `/health-app-foundation` patterns applied. Без MCP — copy SKILL.md text into prompt. С MCP:

> Read forge://skill/health-app-foundation и apply patterns к my current project.

### 2. Cross-project verifier

You're debugging encoding bug в `/work/another-game/`. Run Forge's `.bat` validator:

> Use forge tool check_bat_encoding с path /work/another-game/

### 3. Architectural review

> Read forge://invariants then review src/storage.ts using forge_apply_invariants prompt.

This pulls the current invariant set + applies them as evaluation framework.


## AI Studio 4.67

Forge MCP exposes `check_ai_studio` automatically from `scripts/check-ai-studio.mjs` and the `forge_ai_studio` prompt. The prompt keeps the canonical 9-phase workflow: it can orchestrate studio agents, prompt packs, Image Studio and Visual QA, but it must not create a tenth phase or bypass phase STOP-points.
