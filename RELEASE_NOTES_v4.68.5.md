# Project Forge v4.68.5 — UTF-8 MANIFEST Safety

## What changed

- `upgrade.ps1` now reads `MANIFEST.txt` with explicit UTF-8 decoding under Windows PowerShell 5.1.
- `check-update-surface.mjs` rejects update code that drops the explicit UTF-8 contract.

## Why

The v4.68.4 fleet pass showed that Windows PowerShell's default ANSI decoding could corrupt Cyrillic MANIFEST entries. `СПРАВОЧНИК-КОМАНД.md` was then mistaken for an orphan, removed from the engine and temporarily omitted from the managed sibling payload. The final integrity gate stopped the updater rather than reporting false success.

Installing v4.68.5 restores the command reference before cleanup and returns sibling synchronization to the complete 424-file payload.

## Compatibility

No runtime, phase, skill, agent or platform behavior changed. This patch fixes Windows update correctness for non-ASCII managed paths.
