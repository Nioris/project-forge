# Forge Codex model routing

`model-policy.json` is the canonical quality-first policy for Codex phases. Every primary phase and
every generated Codex subagent uses GPT-5.6 Sol. Claude aliases in skills remain valid for Claude Code.

## Rules

1. Standard service tier is mandatory by default. Fast is never selected by Forge automatically.
2. Max and Ultra are manual-only. A phase or subagent must not enable them automatically.
3. Reasoning follows the work: high for analysis, design, construction, visual direction, integrations
   and QA; medium for deterministic listing, normal release packaging and routine live metrics.
4. `xhigh` is a named deep-reasoning route only after a normal Sol/high attempt produced conflicting
   evidence or a reproducible unexplained failure. Changing effort never changes the Sol model family.
5. A phase may use no more than `maxSubagents`, and never more than the global limit. Generated Codex
   agents default to Sol/medium; review, security and architecture roles use Sol/high. Phase 4 builder
   is explicitly zero-subagent: its independent visual reviewer is launched by the authenticated parent
   as a separate host task after producer hand-off.
6. Preferred UX: start `node ../project-forge/scripts/codex-pipeline.mjs --cwd .` once. It resumes
   the same session for answers inside a phase, but replaces the session after `complete` while keeping
   one terminal window. `codex-phase.mjs <phase>` remains the manual single-phase launcher.
7. Keep model-facing tool output bounded. Inspect one high-detail image per turn, summarize large logs,
   and read only relevant file ranges. Never paste multi-megabyte tool output back into the model.
8. Without launcher evidence, phase state stores the recommendation separately and marks the actual
   model as `unreported`; it never invents a Codex selection for GigaChat or Claude.

## Examples

```bash
# Whole lifecycle in one terminal, with a fresh internal session per phase
node ../project-forge/scripts/codex-pipeline.mjs --cwd .

# Sol/xhigh only after the same technical gate failed twice
node ../project-forge/scripts/codex-phase.mjs 5 --route repeated-failure --cwd .

# Print the selected Sol/medium release command without launching Codex
node ../project-forge/scripts/codex-phase.mjs 8 --cwd . --dry-run
```
