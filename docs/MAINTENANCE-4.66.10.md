# Project Forge v4.66.10 — Windows Codex hook launcher repair

## Field failure

On Windows with Codex CLI 0.147.0, `$status` still ran, but Forge lifecycle hooks displayed:

- `SessionStart hook (failed) — hook exited with code 1`
- two `PreToolUse hook (failed)` entries for a shell command
- `PostToolUse hook (failed)`

The skill itself was readable; the failure was in the hook process launcher.

## Root cause

Forge generated `commandWindows` values that started a nested `powershell -Command` and embedded `$root` / `$null` inside a double-quoted command string. Codex already selects `commandWindows` on Windows and executes it through the Windows command runner. In a PowerShell-hosted path, the outer shell can expand those variables before the nested PowerShell receives its command, leaving malformed PowerShell and exit code 1.

## Fix

Every Forge Windows hook now calls Node directly from the workspace root:

```text
node ".\.claude\hooks\session-start.mjs"
node ".\.claude\hooks\block-dangerous.mjs"
node ".\.claude\hooks\approval-gate.mjs"
node ".\.codex\hooks\workspace-discipline.mjs"
node ".\.codex\hooks\plan-check.mjs"
node ".\.codex\hooks\post-tool-capture.mjs"
node ".\.claude\hooks\pre-claim-fixed.mjs"
node ".\.claude\hooks\stop-flush.mjs"
```

No nested PowerShell and no execution-policy bypass is needed. Dashboard-launched Codex sessions already use `-C <project>`, so project-local relative hook paths resolve from the project workspace.

## Release gate

`node scripts/check-codex-compat.mjs` now fails when:

- a command hook lacks `commandWindows`;
- a Windows hook nests `powershell` or `pwsh`;
- the Windows launcher is not a direct `.claude/hooks` or `.codex/hooks` Node target;
- that target does not exist.

## Skill metadata warning

The Codex message `Skill descriptions were shortened to fit the 2% skills context budget` is informational. It does not mean `$status` or other Forge skills are broken. Codex retains the discovered skills but shortens some descriptions. Forge v4.66.10 does not reduce the 140-skill catalog; that can be optimized separately without mixing it with the lifecycle-hook repair.
