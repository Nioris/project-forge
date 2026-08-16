---
name: improve
kind: tactical
description: Full game improvement pipeline — graphics, gamedesign, levels, sound, mobile, polish. Makes games JUICY. Use when user says "improve", "улучши", "сделай сочной", "доработай", "polish game", "make it better".
---

# Improve Game

## Arguments
`$ARGUMENTS`: game folder path (or empty = scan for first unprocessed)

## Pipeline

### 1. Analyze
Scan the game folder. Determine: genre, engine, current quality, what's missing.

### 2. Visual Upgrade
**Read skill:** visual-upgrade
- Define color palette by genre
- Replace flat fills with gradients
- Add shadows, glow, lighting
- Add particle system (6+ presets)
- Upgrade background (parallax layers)
- Generate AI sprite prompts

### 3. Game Design
**Read skill:** game-design
- Fix core loop (action→challenge→reward→repeat)
- Add juice (shake, hitstop, slowmo, flash)
- Balance difficulty curve
- Add retention (upgrades, achievements, personal best)

### 4. Level Design
**Read skill:** level-design
- Add proper level progression by genre
- Introduce mechanics gradually
- Boss every 5th level, breather after boss

### 5. Sound Design
**Read skill:** sound-design
- Add procedural SFX (12 presets via Web Audio API)
- Add background music (4 styles: chill/tense/epic/menu)
- Pitch variation on every sound (±10%)

### 6. Mobile Adaptation
**Read skill:** mobile-adapt + mobile-game-ui
- Detect genre → choose orientation
- Map all keyboard/mouse to touch controls
- Restructure UI: max 4-5 permanent buttons

### 7. Polish
**Read skill:** game-polish
- Add studio splash (3/9 GAMES)
- Loading screen with progress bar
- Screen transitions (fade, not instant cut)
- Onboarding (contextual hints)
- Floating damage/score numbers

### 8. Create Report
Create `IMPROVE_REPORT.md`:
```markdown
# Improvement Report: {game name}

## Changes Made
- Visual: {what changed}
- Gameplay: {what changed}
- Sound: {what added}
- Mobile: {orientation + controls}
- Polish: {what added}

## Quality Metrics
- Sound effects: {N}/12
- Particle presets: {N}/6
- Juice effects: {N}
- FPS on mobile: {estimate}
```

## Non-Negotiable
- [ ] NEVER modify original files — copy first
- [ ] All 7 skills read and applied
- [ ] At least 8 sound effects
- [ ] Particle effects on death, pickup, hit, levelup
- [ ] Screen transitions present (no instant cuts)
- [ ] Mobile controls match genre
- [ ] IMPROVE_REPORT.md created
