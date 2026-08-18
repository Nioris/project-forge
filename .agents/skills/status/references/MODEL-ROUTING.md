# Forge Codex model routing

`model-policy.json` is the canonical economy policy for Codex phases. Claude model aliases in
individual skills remain valid for Claude Code; Codex must use the GPT-5.6 route from this policy.

## Rules

1. Standard service tier is mandatory by default. Fast is never selected by Forge automatically.
2. Max and Ultra are manual-only. A phase or subagent must not enable them automatically.
3. A normal phase uses its `base` model and reasoning effort.
4. A named route is allowed only when its documented `when` condition is true. Record the route in
   phase state; do not silently upgrade an entire phase to Sol.
5. A phase may use no more than `maxSubagents`, and never more than the global
   `limits.maxPhaseSubagents`. Custom Codex agents default to Terra/Medium.
6. The primary model cannot be reliably changed by prose inside an existing Codex task. Start a new
   phase through `node ../project-forge/scripts/codex-phase.mjs <phase> --cwd .`, or spawn one bounded
   custom agent with an explicit model for a route.
7. `$phase-*` remains valid inside an already-running task. Without launcher/CLI model evidence,
   phase state stores the Codex recommendation separately and marks the actual selection as
   `unreported`; it must never invent a Terra/Sol/Luna selection for GigaChat or Claude.

## Examples

```bash
# Phase 5 in the default Terra/High economy route
node ../project-forge/scripts/codex-phase.mjs 5 --cwd .

# A real payment/security escalation in Phase 5
node ../project-forge/scripts/codex-phase.mjs 5 --route payment-security --cwd .

# Print the command and selection without launching Codex
node ../project-forge/scripts/codex-phase.mjs 8 --route moderation-rejection --cwd . --dry-run
```
