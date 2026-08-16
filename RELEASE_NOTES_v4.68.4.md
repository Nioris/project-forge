# Project Forge v4.68.4 — Reliable Windows Update

## What changed

- The external one-click updater now prefers Windows `tar.exe` for reliable in-place extraction and retains a quiet, fail-fast `Expand-Archive` fallback.
- Reworked `upgrade.bat` as an ASCII-safe Windows entrypoint and added a non-mutating `/selftest` mode.
- Added `.gitattributes` CRLF enforcement for every shipped `.bat` file.
- Extended batch and update-surface gates to reject bare LF line endings and execute the real `cmd.exe` self-test on Windows.

## Why

An actual v4.68.3 in-place update exposed failures that static checks did not catch: archive extraction could stop before upgrade, and `cmd.exe` could misparse the LF-only/non-ASCII upgrade wrapper while reporting a misleading successful exit.

## Compatibility

Runtime behavior, the canonical 9-phase model, skills, agents and managed sibling payload semantics are unchanged. This patch hardens only the release/update path and its verification.
