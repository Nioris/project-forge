---
name: education-app
description: "Create educational web apps: flashcards, quizzes, vocabulary trainers, math practice, typing tutors, trivia, spaced repetition. Trigger on: education, learn, study, flashcards, quiz, vocabulary, math, typing, language, trivia, test, exam."
---

# Education App Prototype

Education apps need progress feedback, gamification, smart repetition.

## Sub-types

| Type | Mechanic | Content |
|------|----------|---------|
| Flashcards | Flip + grade | Card deck |
| Quiz | Multiple choice | Questions |
| Vocabulary | Word + translation | Word list |
| Math practice | Generate problems | Operations |
| Typing tutor | Type text | WPM, accuracy |
| Trivia | Random questions | Categories |

## Visual Style
- Indigo: `#3F51B5, #7986CB, #FAFBFC, #2D3436, #E8EAF6`
- Card flip animations (3D CSS)
- Progress bar across session
- Score with combo
- Confetti at milestones

## Key Pattern: Flashcard Flip
```css
.card { width:300px; height:200px; perspective:1000px; cursor:pointer; }
.card-inner { width:100%; height:100%; transition:transform 0.5s; transform-style:preserve-3d; }
.card.flipped .card-inner { transform:rotateY(180deg); }
.card-front, .card-back { position:absolute; width:100%; height:100%; backface-visibility:hidden; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 4px 16px rgba(0,0,0,0.1); }
.card-front { background:#fff; }
.card-back { background:#3F51B5; color:#fff; transform:rotateY(180deg); }
```

## Checklist
- [ ] Content correct and useful
- [ ] Progress tracked (score, streak)
- [ ] Difficulty adapts
- [ ] Satisfying correct-answer feedback
- [ ] Session summary
- [ ] Data persists
