---
name: productivity-app
description: "Create productivity web apps: todo lists, kanban boards, pomodoro timers, daily planners, goal setters, time trackers. Trigger on: todo, tasks, kanban, pomodoro, productivity, planner, goals, time tracking, organize, schedule, GTD."
---

# Productivity App Prototype

Productivity apps: reduce friction, show progress, satisfying completion.

## Sub-types

| Type | Method | Key UI |
|------|--------|--------|
| Todo list | Checkboxes | Quick-add, categories |
| Kanban board | Columns | Drag cards between |
| Pomodoro timer | 25/5 cycles | Big timer, stats |
| Daily planner | Time blocks | Timeline view |
| Goal tracker | Milestones | Progress bars |
| Time tracker | Log hours | Running timer, report |

## Visual Style
- Violet: `#6C5CE7, #A29BFE, #FAFBFC, #2D3436, #DFE6E9`
- Clean lines, minimal decoration
- Checkbox bounce animation
- Category colors

## Key Pattern: Satisfying Checkbox
```css
.checkbox { width:22px; height:22px; border:2px solid #E8ECF1; border-radius:6px; cursor:pointer; transition:all 0.2s; }
.checkbox.done { background:#6C5CE7; border-color:#6C5CE7; }
.checkbox.done::after { content:''; position:absolute; left:6px; top:2px; width:6px; height:12px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); animation:pop 0.3s ease; }
@keyframes pop { 0%{transform:rotate(45deg) scale(0)} 50%{transform:rotate(45deg) scale(1.2)} 100%{transform:rotate(45deg) scale(1)} }
```

## Checklist
- [ ] Adding items is FAST
- [ ] Completing is SATISFYING
- [ ] Persist in localStorage
- [ ] Delete/edit works
- [ ] Organization (categories, priority)
- [ ] Empty state with message
