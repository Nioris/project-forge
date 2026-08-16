---
name: health-app
description: "Create health/fitness web apps: workout trackers, habit trackers, water intake, calorie counters, meditation timers, sleep logs, mood trackers, breathing exercises. Trigger on: health, fitness, workout, habit, water, calories, meditation, sleep, mood, BMI, breathing, weight."
---

# Health & Fitness App Prototype

Health apps need motivation (progress visible), gentleness (not judgmental), streaks.

## Sub-types

| Type | Tracks | Key UI |
|------|--------|--------|
| Workout log | Exercises, sets | Exercise list, history |
| Habit tracker | Daily habits | Grid calendar, streak |
| Water intake | Glasses per day | Water animation, goal ring |
| Calorie counter | Food + calories | Meal log, daily bar |
| Meditation timer | Session length | Breathing circle, ambient |
| Mood tracker | Daily mood | Emoji picker, mood chart |
| Breathing exercise | Guided breathing | Expanding circle |

## Visual Style
- Mint: `#1ABC9C, #2ECC71, #FAFBFC, #2D3436, #E8F8F5`
- Rounded shapes, soft shadows
- Progress rings (not just bars)
- Celebration when goal reached

## Key Code: Progress Ring
```javascript
function drawRing(canvas, progress, color) {
  const ctx = canvas.getContext('2d');
  const cx = canvas.width/2, cy = canvas.height/2, r = 60;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = '#E8ECF1'; ctx.lineWidth = 10; ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + Math.PI*2*progress);
  ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
  ctx.fillStyle = '#2D3436'; ctx.font = 'bold 24px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(progress*100) + '%', cx, cy+6);
}
```

## Checklist
- [ ] Progress visualization (ring or chart)
- [ ] Streak/history tracking
- [ ] Today status prominent
- [ ] Celebration when goal met
- [ ] Gentle encouraging tone
- [ ] localStorage persistence
