---
name: polish-app
kind: tactical
description: "Full app polish pipeline — UX, data flows, notifications, settings, theming. Makes functional apps feel like premium products. Use when user says 'polish', 'доведи до ума'…"
---

> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.

# Polish App — From Prototype to Product

## Purpose
App works but feels like a hackathon project. This pipeline transforms it into something users would pay for: proper states, data handling, notifications, settings, and 100+ micro-details.

## Arguments
`[INVOCATION_INPUT]`: app folder path (or empty = current project)

## Pipeline

### Phase 1: Audit (read code, don't change yet)

Scan the app and fill this checklist:

```
EMPTY STATES
  [ ] Main list — what shows when empty?
  [ ] Search results — what shows when nothing found?
  [ ] Filtered view — what shows when filter returns 0?

LOADING
  [ ] Initial load — skeleton or spinner?
  [ ] Data refresh — loading indicator?
  [ ] Button actions — loading state on button?

ERRORS
  [ ] Network error — user-friendly message + retry?
  [ ] Validation error — inline below input or alert()?
  [ ] Save error — data loss prevention?

DATA
  [ ] Auto-save — does user ever lose work?
  [ ] Search — instant? Debounced?
  [ ] Filter — can combine multiple?
  [ ] Sort — persistent? Toggle direction?

FEEDBACK
  [ ] Delete action — undo toast or confirmation?
  [ ] Save action — visual confirmation?
  [ ] Error action — clear error message?
  [ ] Success — toast notification?

SETTINGS
  [ ] Dark mode?
  [ ] Data export?
  [ ] About / version?
```

Report what's missing. Prioritize by impact.

### Phase 2: UX Polish
**Read skill:** app-ux-polish
- Add empty states (icon + text + action) to ALL lists
- Add skeleton loading to ALL async operations
- Add error states with retry
- Add undo toasts for destructive actions
- Add confirmation dialogs for permanent actions
- Add real-time form validation
- Add auto-save
- Add pull-to-refresh (mobile)
- Add swipe-to-delete on list items (mobile)

### Phase 3: Data Management
**Read skill:** app-data-flow
- Add instant search with highlighting
- Add multi-criteria filters with chips
- Add sort (toggle direction)
- Add statistics dashboard (totals, trends, categories)
- Add virtual scroll if 100+ items possible

### Phase 4: Notifications
**Read skill:** app-notifications
- Add toast system (success, error, warning, info)
- Add local reminders with scheduling
- Add notification center (bell icon + badge)
- Request notification permission (on user action, NOT on load)

### Phase 5: Settings & Theme
**Read skill:** app-settings
- Add dark/light/auto theme via CSS variables
- Add settings screen (theme, font size, notifications)
- Add data export/import (JSON)
- Add "clear all data" with confirmation
- Add about page (version, feedback link)

### Phase 6: Final Check

Run through the app as a new user:
1. First launch → empty state visible? Clear CTA?
2. Add first item → confirmation toast? Saved?
3. Add 5+ items → search works? Filter works?
4. Delete item → undo available?
5. Go offline → data still there? Editing works?
6. Switch to dark mode → all colors correct?
7. Open settings → all options work?
8. Export → import in new browser → data intact?

## Output: POLISH_REPORT.md
```markdown
# Polish Report: {app name}

## Applied
- UX: {list of improvements}
- Data: {search, filters, stats added}
- Notifications: {what added}
- Settings: {what added}

## Before / After
| Area | Before | After |
|------|--------|-------|
| Empty states | blank screen | icon + text + CTA |
| Errors | alert() or silent | inline + retry |
| Delete | instant, no undo | undo toast (5sec) |
| Search | none | instant with highlight |
| Theme | light only | dark/light/auto |
| Data safety | manual save | auto-save + export |
```

## Non-Negotiable Acceptance Criteria
- [ ] ALL 7 screen states handled (empty, loading, partial, ideal, error, offline, permission)
- [ ] Every destructive action has undo or confirmation
- [ ] Auto-save enabled — user never loses data
- [ ] Search + filter + sort all working
- [ ] Toast notifications on all user actions
- [ ] Dark/light theme with CSS variables
- [ ] Settings screen with export/import
- [ ] POLISH_REPORT.md created
- [ ] Tested: new user flow from empty → 10 items → delete → search → settings → export
