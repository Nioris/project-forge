---
date: 2026-04-22 (v4.6.2 PS BOM) + 2026-04-24 (v4.7.1 .bat ASCII)
status: accepted
tags: [decision, encoding, windows, bash, powershell]
---

# 004: Platform-specific encoding rules

## Context

Forge ships scripts for 3 shells (bash, PowerShell, cmd.exe) plus 2 file types touched by all (.json, .md). Each has subtly different Unicode handling rules. Two consecutive bug reports made this concrete:

**v4.6.1 → v4.6.2:** User got "Непредвиденная лексема" (unexpected token) running `.\setup.ps1` in Windows PowerShell 5.1. Root cause: `.ps1` had non-ASCII (Cyrillic, em-dash) without UTF-8 BOM. PS 5.1 defaults to system codepage (Windows-1251 on Russian Windows). PS 7+ defaults to UTF-8 — would have worked fine.

**v4.7.0 → v4.7.1:** User got `". was unexpected at this time."` running `scripts\sync.bat`. Root cause: `.bat` had em-dash (—) inside `if/else (...)` blocks. Even with `chcp 65001`, cmd.exe parser breaks on multi-byte chars **inside `()` groups**. `chcp` helps echo print, but parser tokenizes посимвольно before `chcp` takes effect.

## Options Considered

1. **All UTF-8 BOM, all files** — universal. Cons: BOMs break JSON parsers, break shebang detection in shell scripts.

2. **No non-ASCII anywhere** — pure ASCII. Cons: lose all Russian content/comments. Defeats Forge's Russian-friendly stance.

3. **Per-file-type rules** — encoding by extension. Cons: more complexity. Pros: each file type gets correct behavior.

## Decision

Per-file-type rules в CLAUDE.md "Platform-specific encoding rules" section:

| File type | Cyrillic OK? | Em-dash OK? | Box-drawing OK? | BOM? | EOL |
|---|---|---|---|---|---|
| `.ps1` Win PS 5.1 | yes (with BOM) | yes (with BOM) | yes (with BOM) | yes | CRLF |
| `.ps1` PS Core 7+ | yes | yes | yes | optional | CRLF |
| `.bat` outside `()` | yes (with `chcp 65001`) | yes | yes | no | CRLF |
| `.bat` **inside `()`** | **NO — parser bug** | **NO** | **NO** | no | CRLF |
| `.sh` (any cyrillic) | yes | yes | yes | no | LF |
| `.mjs` / `.js` (utf-8 explicit) | yes | yes | yes | no | LF |
| `.json` | strings can be cyrillic | yes | yes | **never** | LF |
| `.md` | yes | yes | yes | no | LF |
| `.html` | yes (with `<meta charset="utf-8">`) | yes | yes | no | LF |

Practical implications:
- For `.ps1` add BOM if non-ASCII content. Verify with `python3 -c "print(open(f,'rb').read().startswith(b'\\xef\\xbb\\xbf'))"`
- For `.bat` keep all comments inside `()` blocks pure ASCII. Russian text only in **echo** statements outside `()` blocks (and even then, `chcp 65001` first).
- Never use `sed -i` on `.ps1` without checking BOM survives — sed strips BOM by default. Use Python or careful `sed` patterns.

## Consequences

- **Pro**: Each file format works correctly on its target shell
- **Pro**: Bugs are caught early (verifier checks)
- **Con**: When bumping versions, must avoid regressing BOMs — automated check in `setup.ps1` validation
- **Con**: Adding new `.bat` features requires careful review of `()` blocks for accidentally-introduced non-ASCII (em-dashes from copy-paste are common)

Lesson #20: chcp 65001 ≠ полная UTF-8 поддержка в cmd.exe.
