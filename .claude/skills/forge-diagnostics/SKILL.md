---
name: forge-diagnostics
description: Record a machine-readable incident when Forge itself behaves incorrectly: malformed phase or STOP output, adapter mismatch, hook/runtime failure, wrong capability mapping, validator contradiction, or unexpected Forge response. Do not use for ordinary bugs in the game or app.
---

# Forge behavioral diagnostics

Use this workflow as soon as you observe a defect in Forge's own orchestration, adapter, phase protocol, STOP-point, hook, validator, launcher, or returned format. Recording is fail-open: after logging, continue safe project work when possible. Do not modify the shared Forge engine from a managed sibling project.

Do not report ordinary game/app implementation bugs unless Forge caused them or misreported their state.

## Report

Run from the managed project root:

```bash
node .claude/skills/status/references/forge-event.mjs report --severity error --code STOP_FORMAT_WRONG --kind stop_protocol --component phase-1-analyze --operation ask-user --message "STOP response was malformed" --expected "One actionable acceptance phrase" --actual "Recommendations were rejected as incomplete" --phase 1 --host codex --evidence wiki/phases/phase-1.json
```

Use a stable uppercase `--code` for the same class of defect. The logger derives a stable fingerprint from code + component + operation, so repeated observations are grouped without losing their individual timestamps.

Allowed severities are `info`, `warn`, `error`, and `critical`. Prefer `warn` for recoverable protocol drift, `error` for a blocked workflow, and `critical` only for corruption, security exposure, or fleet-wide inability to work.

Evidence must be project-relative paths. Never put secrets, API keys, bearer tokens, prompts, full terminal output, or full file contents into the event. The logger redacts common credential patterns, bounds all fields, and replaces the project root, but the caller must still minimize data.

## Resolve

Only close an incident after verifying the correction:

```bash
node .claude/skills/status/references/forge-event.mjs resolve --fingerprint 0123456789abcdef0123 --message "Verified by repeating the phase gate" --host codex --evidence wiki/phases/phase-1.json
```

Inspect current unresolved incidents with:

```bash
node .claude/skills/status/references/forge-event.mjs list
```

The durable local log is `wiki/diagnostics/forge-events.jsonl`. It belongs to the project and is intentionally separate from human session notes. The logger adds it to the repository-local `.git/info/exclude` when possible; new Forge projects also ignore it in `.gitignore`, so diagnostics remain local instead of entering a final release commit.
