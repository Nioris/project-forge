---
name: review
kind: tactical
description: Review code quality, comments, and architecture. Use when user says "review", "check code", "проверь", "ревью", "quality check".
---

# Code Review

## Instructions

1. Read wiki/architecture/stack.md and wiki/architecture/data-flow.md to understand intended structure
2. Scan all source files
3. Check:

### Comments
- [ ] Every file has header comment
- [ ] Every function >5 lines has JSDoc
- [ ] Complex logic has inline comments
- [ ] No outdated/wrong comments

### Code Quality
- [ ] No functions >50 lines
- [ ] No nesting >3 levels
- [ ] No magic numbers
- [ ] No duplicate code (DRY)
- [ ] Error handling present

### Architecture
- [ ] File structure matches wiki/architecture/
- [ ] No circular dependencies
- [ ] Business logic separated from UI
- [ ] Data flow clear and documented

### Consistency
- [ ] Naming convention consistent
- [ ] Code style consistent
- [ ] Comment style consistent

Report findings with file:line references and suggest fixes.

## Non-Negotiable
- [ ] Every finding has file path and line number
- [ ] Severity: CRITICAL / MAJOR / MINOR
- [ ] Fix suggestion for each finding
