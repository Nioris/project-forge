---
name: doc
kind: tactical
description: "Update project documentation — wiki pages, README, code comments. Use when user says \"doc\", \"update docs\", \"add comments\", \"документация\"."
---

# Update Documentation

## Arguments
- `all` — update everything
- `wiki` — update wiki/_map.md and feature pages based on current code state
- `arch` — regenerate wiki/architecture/ from actual file structure
- `comments` — add missing code comments only
- no args — same as `all`

## Instructions

### doc wiki
Read all source files. Compare with wiki/_map.md "Done" section.
Add missing features, remove deleted ones. Update status.

### doc arch
Walk the actual file tree. Update wiki/architecture/stack.md and wiki/architecture/data-flow.md:
- File tree with descriptions
- Data model (schemas, types)
- Key flows (user actions → function chains)
- API endpoints
- External dependencies with versions

### doc comments
Scan all source files. For each file:
1. Add missing `@file` header if absent
2. Add missing JSDoc to functions >5 lines
3. Add section markers to files >100 lines

## Non-Negotiable
- [ ] wiki/_map.md "Done" matches reality
- [ ] wiki/architecture/ matches actual code
- [ ] No function >5 lines without JSDoc
- [ ] No file without header comment
