---
name: utility-app
description: "Create utility web apps: calculators, converters, timers, stopwatches, notes, text tools, counters, clocks. Trigger on: calculator, converter, timer, stopwatch, notes, counter, clock, alarm, unit converter, BMI, word counter."
---

# Utility App Prototype

Utilities must be instant, obvious, satisfying. No instructions needed.

## Sub-types

| Type | Core | Key UI |
|------|------|--------|
| Calculator | Math ops | Big display, keypad grid |
| Unit converter | Convert units | Two fields, swap, categories |
| Timer/Stopwatch | Count time | Big digits, start/stop/reset |
| Notes | Save text | Textarea, list of notes |
| Counter | Count anything | Big number, +/- buttons |
| Text tools | Transform text | Input -> output |
| World clock | Time zones | Multiple clocks |

## Visual Style
- Slate: `#636E72, #00CEC9, #FAFBFC, #DFE6E9, #2D3436`
- Large typography 48-64px for primary values
- Monospace for numbers
- One accent color for interactive elements

## Key Pattern
```html
<div style="text-align:center; padding:40px;">
  <div style="font-size:14px; color:#636E72;">Timer</div>
  <div style="font-size:56px; font-weight:700; font-family:monospace; letter-spacing:2px;">02:34.56</div>
  <button style="background:#00CEC9; color:#fff; border:none; padding:14px 32px; border-radius:999px; font-size:16px; cursor:pointer;">Start</button>
</div>
```

## Checklist
- [ ] Core function works immediately
- [ ] Big readable primary value
- [ ] Satisfying button feedback
- [ ] Works offline
- [ ] Responsive
- [ ] Keyboard support
