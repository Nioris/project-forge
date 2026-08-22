# Project Forge 4.68.27 — Whole-project agents

## Goal

Run a complete Forge project with one selected terminal agent and one selected model, from the current phase through Release/Live. Phase-based model routing is intentionally out of scope for this release.

The lock is stored in project-local `.forge/agent.json`. A different agent or model cannot silently replace it; use `select` or an explicit `--reselect` operation.

## Agents

| Forge agent | Runtime | Default model | Authentication |
|---|---|---|---|
| `gemini` | official Gemini CLI | `gemini-3.7-flash` | native Google login |
| `qwen` | official Qwen Code | `qwen3-coder-plus` | Qwen OAuth or Alibaba Coding Plan |
| `kimi` | official Kimi Code | `kimi-k3` | native Kimi login |
| `deepseek` | OpenCode | `deepseek/deepseek-v4-flash` | DeepSeek API |
| `glm` | OpenCode | `zai/glm-5.3` | Z.ai API or Coding Plan |
| `minimax` | OpenCode | `minimax/MiniMax-M3` | MiniMax API or Token Plan |

Gemini and Qwen receive a startup prompt and remain interactive. Kimi Code 0.37 does not expose the same interactive-prompt flag, so Forge performs one headless bootstrap turn and then reopens that exact project session with `--continue`.

## Commands

```powershell
node scripts\forge-agent.mjs start qwen --project ..\my-game
node scripts\forge-agent.mjs profile --project ..\my-game
node scripts\forge-agent.mjs select qwen --model qwen3-coder-plus --project ..\my-game
```

Native login is performed once:

```powershell
gemini
qwen auth qwen-oauth
kimi login
```

OpenCode-provider secrets remain outside projects:

```powershell
node scripts\forge-secrets.mjs set deepseek --stdin
node scripts\forge-secrets.mjs set zai --stdin
node scripts\forge-secrets.mjs set minimax --stdin
```

Forge writes each central key into a provider-specific OpenCode credential store under `forge-data/runtime/`, removes provider key environment variables from the tool process, and never includes a secret in command arguments, prompts or logs.

## Verification boundary

Offline checks prove registry integrity, executable discovery, Windows npm shim selection, launch arguments, project locking, managed Gemini/Qwen rules, Dashboard routing, and credential isolation. Paid/full-project parity is not claimed until each provider has completed the same benchmark fixture with its own account and quota.
