# Project Forge v4.68.11 — Fleet Behavioral Diagnostics

This release adds a local, machine-readable incident channel for defects in Forge itself without mixing them with ordinary game or application bugs.

- Claude, Codex, generic terminal agents and GigaChat receive one reporting contract.
- GigaChat exposes `forge_diagnostic_report` and auto-reports runtime/transport and exhausted STOP-format recovery failures.
- Events are bounded, credential-redacted, project-relative, deduplicated by stable fingerprint and resolved only after verification.
- `$status` reports open incidents per project.
- `node scripts/audit-forge-diagnostics.mjs --since 30d` summarizes impact across all managed sibling projects.
- Diagnostic JSONL stays local through `.git/info/exclude` and new-project `.gitignore` defaults.
- `check-forge-diagnostics.mjs` release-gates reporting, redaction, grouping, resolution and fleet discovery.
