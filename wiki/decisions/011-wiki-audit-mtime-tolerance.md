---
date: 2026-04-28 (v4.8.0)
status: accepted
tags: [decision, hook, tolerance, wiki]
---

# 011: wiki-audit mtime tolerance — ±2 seconds

## Context

`wiki-audit.mjs` hook (used by stop-flush) checks that `wiki/_map.md` and `wiki/_current.md` were updated DURING the current session. It compares mtime of these files against mtime of today's session log.

**Bug observed in real Spiral Vigil session (v4.7.x track):**

User saved `wiki/_current.md` at 14:32:17.234. Session log was touched by post-tool-capture hook at 14:32:17.890. Strict comparison `wikiMtime >= logMtime` returned **false** despite wiki being updated literally 0.6 seconds before — gave "wiki out of sync" warning incorrectly.

User had to do `touch -d "+5 minutes" wiki/_current.md` workaround to silence the false alarm. This degraded trust in the audit hook.

## Root causes

Three sources of mtime drift can break strict comparison:

1. **Sub-second editing** — user saves wiki файл, then within seconds another tool writes session log. Wiki was first → mtime is older.

2. **FAT32 granularity** — Windows FAT32 stores mtime with 2-second granularity. Modify-then-immediately-modify-again can give same or earlier mtime depending on rounding.

3. **NFS / network filesystem clock skew** — timestamps may drift seconds between client and server depending on NTP sync.

## Options Considered

1. **Compare to "today's date" instead of mtime** — check `wiki._map.md` was modified today (date-only granularity). Cons: too loose — reopen old session next day, edits still register as "today".

2. **Use SHA hash вместо mtime** — store wiki hash в session start, compare at end. Pros: deterministic. Cons: significant complexity, requires session-state persistence.

3. **Add tolerance window to mtime comparison** — `wiki.mtime + tolerance >= log.mtime`. Pros: simple, addresses all three drift sources. Cons: tolerance value is judgment call.

4. **Disable wiki-audit hook** — give up on automated detection. Cons: drift goes unnoticed, defeats purpose.

## Decision

**Option 3: 2-second tolerance window.**

```javascript
const MTIME_TOLERANCE_MS = 2000;

function mapTouchedSinceSessionStart() {
  return statSync(map).mtimeMs + MTIME_TOLERANCE_MS >= statSync(log).mtimeMs;
}
```

Tolerance value rationale:
- **Covers FAT32 granularity** (2 sec rounding)
- **Covers typical NFS skew** (sub-second to ~1 sec on healthy networks)
- **Tight enough** to catch real "forgot to update wiki" cases (user edits at session start, never re-touches → mtime gap of minutes)
- **Round number** (2000 ms = 2 sec) — easy to remember, modify if needed

## Consequences

- **Pro:** False positive eliminated for sub-second edit-then-log scenarios (~95% of real-world cases)
- **Pro:** True positives preserved for "forgot to update wiki" (gaps >> 2 seconds)
- **Pro:** Workaround `touch -d "+5 minutes"` no longer needed
- **Con:** If user edits wiki at start of session, then makes many file changes spanning >2 sec without re-saving wiki — could miss audit warning. Acceptable trade-off; the 2-second window only helps on edge cases.
- **Con:** Tolerance value hardcoded — может потребовать tuning. Easy to find (one constant, two uses).

## Implementation

`.claude/hooks/wiki-audit.mjs` lines 126-127, 134, 142:
- Single constant declaration with explanatory comment
- Applied symmetrically in `mapTouchedSinceSessionStart()` and `currentTouchedSinceSessionStart()`

## Lesson

Strict equality comparisons of timestamps from different processes / filesystems are fragile. For "happened around the same time" semantics, use tolerance windows. 2 seconds is a reasonable default for filesystem operations.

For user-facing audit hooks: false positives are MORE damaging than false negatives, because they erode trust. Better to miss occasional drift than to nag falsely.
