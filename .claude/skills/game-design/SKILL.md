---
name: game-design
kind: architectural
description: "Game design improvements: core loop, progression, difficulty curve, retention hooks, session length, onboarding, meta-game. Use when game feels flat, boring, too easy/hard, or has no reason to return. Triggers on: design, balance, progression, difficulty, boring, retention, hook, loop, level, onboarding, tutorial."
---

# Game Design — Making Games Fun

## Phase 0: Research references (v4.5+, MANDATORY unless user skips)

**Before making changes, understand what similar successful games/apps do.** This prevents blind reinvention and grounds decisions in real patterns.

Invoke: `/research-references {genre/category} {specific-aspect}`

This produces `wiki/research/{Project}-references.md` with 3-5 real competitors, extracted patterns, and UI/UX direction. Wait for user confirmation of the direction before applying changes below.

**Skip if:** user explicitly says "skip research" / "без research", or `wiki/research/{Project}-references.md` already exists and is <14 days old.

---

## Purpose
Games arrive functional but often flat. This skill adds depth: tighter core loop, better progression, smarter difficulty, reasons to return. All changes are CODE-ONLY in game logic — never touch SDK integration, ads, localization, or debug systems.

## ⚠️ SAFE ZONE — What You CAN Change
- Game mechanics, physics, timing, spawning
- Score formulas, XP curves, unlock conditions
- Level generation, enemy behavior, wave composition
- UI feedback (screenshake, particles, sounds)
- New game states (boss waves, bonus rounds)
- Balance numbers (damage, health, speed, cooldowns)
- Meta-progression (permanent upgrades between runs)

## 🚫 NEVER TOUCH — SDK Territory
- YandexSDK.* calls (ads, saves, purchases, leaderboards)
- I18N / t() / td() / localization system
- debugcheck.js, cheats.js
- LoadingAPI / GameplayAPI lifecycle
- Sound mute/unmute for ads (sfx.mute/unmute)
- analytics / event tracking

---

## Step 0.5: READ THE TARGETS FIRST — GDD считается от метрик, не от прототипа (MANDATORY)

Больной кейс (tyl-gdd v0.2): дизайнер выдал качественную ОПИСЬ ПРОТОТИПА (столпы, петли,
сеттинг) — и ноль упоминаний D7/D30 на весь документ. Это не GDD, это инвентаризация.
Задача геймдизайнера в Forge: спроектировать контент и фичи, РАССЧИТАННЫЕ на удержание до R30,
которое задал аналитик.

1. Прочитай `wiki/architecture/metrics.md`. Если его НЕТ — остановись и потребуй сначала
   /product-metrics. Проектировать без таргетов запрещено.
2. Обязательный раздел GDD — **«Математика удержания»**, таблица по возрастным корзинам:

| Корзина | Таргет (из metrics.md) | Что игрок ДЕЛАЕТ | Системы | ОБЪЁМ контента (числа!) | Часов игры |
|---|---|---|---|---|---|
| D0–D1 | D1 {из metrics} | первый вау ≤60с, первая цель | онбординг, петля | напр.: 6 заказов, 3 механики, 1 карта | 0.5–1ч |
| D2–D7 | D7 {..} | причина вернуться КАЖДЫЙ день | прогрессия, разработки, усложнение спроса | напр.: 20 заказов, 8 технологий, 2 сектора, 1 «сдвиг спроса» | 3–5ч |
| D8–D30 | D30 {..} | долгая цель + переменность | мета (кампания/престиж), события, редкие кризисы | напр.: 3 кампании, цикл событий /seasonal-event, ×N рестартабельность | 10ч+ |

   Каждая строка = ЧИСЛА, не прилагательные. «Глубокая прогрессия» — не ответ; «8 технологий
   по 15-25 мин каждая» — ответ.
3. **Acceptance-критерий GDD:** на каждый таргет из metrics.md указан набор фич + объём контента,
   который его обслуживает. Таргет без фич = дыра дизайна. Фича без таргета = кандидат на вылет.
4. Статус документа — «проект к постройке» (что ДОБАВИТЬ и сколько), не «опись реализованного».
   Реализованное — одна колонка «есть/нет» в таблицах, а не рамка всего документа.

## Step 1: Diagnose the Core Loop

Every game needs: **ACTION → CHALLENGE → REWARD → REPEAT**

Read the game code and check:

| Element | Signs It's Weak | Fix |
|---------|-----------------|-----|
| **Action** | Player waits, nothing to do between events | Add active mechanics: dodge while waiting, combo system, resource gathering |
| **Challenge** | Same difficulty throughout, no tension | Difficulty curve (see Step 2), wave escalation, timer pressure |
| **Reward** | Only score counter goes up | Add: screen flash, sound burst, particles, slow-mo on kills, combo counter, loot drops |
| **Repeat** | No reason to play again after game over | Meta-progression, unlockables, daily challenges, personal bests |

### Juice Checklist (game feel)
```javascript
// Every significant event should trigger 2-3 of these:
// 1. Screen shake
function shake(intensity, duration) {
  shakeTimer = duration;
  shakeIntensity = intensity;
}

// 2. Hitstop (freeze 2-4 frames on impact)
function hitstop(frames) {
  hitstopFrames = frames;
}
// In update: if (hitstopFrames > 0) { hitstopFrames--; return; }

// 3. Flash (white overlay 1 frame)
// 4. Particle burst (10-30 particles at point)
// 5. Sound with pitch variation (±10%)
// 6. Slow-motion (0.3x for 15 frames after big kill)
// 7. Number popup (+100, COMBO x3)
// 8. Scale bounce on pickup items

// RULE: If player does something and NOTHING visual/audio happens = broken feel
```

## Step 2: Difficulty Curve

**WRONG:** Constant difficulty. Or sudden spike.

**RIGHT:** Gradual ramp with breather moments:

```javascript
// Wave-based difficulty
function getWaveConfig(waveNum) {
  const base = {
    enemyCount: 3 + Math.floor(waveNum * 1.2),
    enemySpeed: 1.0 + waveNum * 0.05,
    enemyHP: 1 + Math.floor(waveNum / 5),
    spawnRate: Math.max(0.5, 2.0 - waveNum * 0.08),
  };
  
  // Every 5th wave = BOSS (spike)
  if (waveNum % 5 === 0) {
    return { ...base, boss: true, enemyCount: 1, enemyHP: base.enemyHP * 10 };
  }
  
  // Wave after boss = BREATHER (easy, lots of loot)
  if (waveNum % 5 === 1 && waveNum > 1) {
    return { ...base, enemyCount: Math.floor(base.enemyCount * 0.5), lootMultiplier: 3 };
  }
  
  return base;
}

// Dynamic difficulty (adapt to player skill)
function adaptDifficulty(player) {
  if (player.deaths > 3 && player.deaths > player.kills * 0.5) {
    difficultyMultiplier = Math.max(0.6, difficultyMultiplier - 0.05); // easier
  }
  if (player.killStreak > 10) {
    difficultyMultiplier = Math.min(1.5, difficultyMultiplier + 0.02); // harder
  }
}
```

### Session Length Targets
| Genre | Ideal Session | How to Enforce |
|-------|--------------|----------------|
| Arcade/Casual | 2-5 min | Limited lives, increasing speed |
| Shooter | 5-15 min | Wave limit, ammo economy |
| Strategy | 10-30 min | Turn limit, escalating threat |
| Puzzle | 1-3 min per level | Move limit, timer |
| Idle | 30s active + background | Auto-progression, check-in rewards |

## Step 2.5: First Session — the make-or-break 60 seconds (biggest D1 lever)

Most installs churn in **session one**, before any daily bonus or upgrade tree matters. The
retention mechanics in Step 3 only pay off if the player survives the first minute. Design
that minute deliberately — it's the highest-leverage work in the whole pipeline.

**The 60-second contract (genre-agnostic):**

| Beat | Timing | Goal |
|------|--------|------|
| First input does something satisfying | < 3 s | No menus/cutscenes first — player acts immediately |
| First reward (juice + number popup) | < 10 s | Teach "action → reward" before any rules |
| First real choice or escalation | < 30 s | Prove the game has depth, not just one button |
| First "I want to go again" moment | < 60 s | A near-miss, a tease of an unlock, or a new mechanic preview |

**Onboard by doing, not by reading.** Teach mechanics through forced-but-safe situations,
not text walls. A tutorial popup the player dismisses taught nothing.

```javascript
// Contextual, one-thing-at-a-time teaching — gated on the moment the mechanic matters,
// then never shown again. NOT a front-loaded tutorial screen.
const TEACH = [
  { id: 'move',   trigger: s => s.frame > 30 && !s.hasMoved,      hint: 'Свайп чтобы двигаться' },
  { id: 'dash',   trigger: s => s.enemyNear && !s.usedDash,        hint: 'Двойной тап — рывок' },
  { id: 'combo',  trigger: s => s.kills >= 3 && !s.seenComboHint,  hint: 'Бей подряд — комбо x2!' },
];
function maybeTeach(state) {
  for (const t of TEACH) {
    if (!state.taught.has(t.id) && t.trigger(state)) {
      showHint(t.hint);              // brief, diegetic, auto-dismissing
      state.taught.add(t.id);
      break;                          // one lesson at a time — never stack hints
    }
  }
}
```

**First-session difficulty:** the opening run should be winnable / survivable longer than
later runs. Ramp the curve from Step 2 *after* session one, not during it. A first-run wipe
in 15 seconds is the most common silent churn cause.

**End the first session on an up-note:** never let the first game-over be a dead end. Show
the unlock that's one run away ("Next: 120 coins → new character") so the very first failure
already plants a reason to retry. This is the bridge into the Step 3 retention loop.

## Step 3: Retention — Reasons to Return

```javascript
// 1. DAILY BONUS (check once per calendar day)
function checkDailyBonus() {
  const today = new Date().toISOString().slice(0, 10);
  const lastLogin = saveData.lastLoginDate;
  if (today !== lastLogin) {
    const streak = (yesterday(today) === lastLogin) ? saveData.loginStreak + 1 : 1;
    const reward = DAILY_REWARDS[Math.min(streak - 1, DAILY_REWARDS.length - 1)];
    giveReward(reward);
    saveData.lastLoginDate = today;
    saveData.loginStreak = streak;
    showDailyBonusPopup(reward, streak);
  }
}
const DAILY_REWARDS = [
  { coins: 50 },   // Day 1
  { coins: 100 },  // Day 2
  { coins: 150 },  // Day 3
  { gems: 1 },     // Day 4
  { coins: 200 },  // Day 5
  { gems: 2 },     // Day 6
  { chest: 'rare' }, // Day 7 — big reward resets cycle
];

// 2. UNLOCK PROGRESSION (permanent upgrades between runs)
const UPGRADES = [
  { id: 'maxHP', name: 'Здоровье', levels: 10, cost: i => 50 * Math.pow(1.5, i), effect: i => 10 + i * 5 },
  { id: 'damage', name: 'Урон', levels: 10, cost: i => 75 * Math.pow(1.5, i), effect: i => 1 + i * 0.2 },
  { id: 'speed', name: 'Скорость', levels: 5, cost: i => 100 * Math.pow(2, i), effect: i => 1 + i * 0.1 },
  { id: 'luck', name: 'Удача', levels: 5, cost: i => 200 * Math.pow(2, i), effect: i => 1 + i * 0.15 },
];

// 3. ACHIEVEMENTS (dopamine hits)
const ACHIEVEMENTS = [
  { id: 'first_kill', name: 'Первая кровь', condition: s => s.totalKills >= 1 },
  { id: 'kill_100', name: 'Сотня', condition: s => s.totalKills >= 100 },
  { id: 'no_damage', name: 'Неуязвимый', condition: s => s.lastRunDamageTaken === 0 },
  { id: 'speedrun', name: 'Спидраннер', condition: s => s.lastRunTime < 120 },
  { id: 'streak_7', name: 'Неделя подряд', condition: s => s.loginStreak >= 7 },
];

// 4. PERSONAL BEST tracking
// Always show: "Your best: Wave 15" on game over
// If new record: big animation + "NEW RECORD!"
```

## Self-check before delivering (play it, don't just spec it)

A design on paper isn't a design that works. Before handing the loop over, **mentally play the
first 3 minutes** and score it against what you just designed. Anything that fails → fix before
delivery, don't ship it and wait for the user to find it.

| Question | Pass looks like | Fail (fix it) |
|---|---|---|
| **Is the core loop actually a loop?** | After a reward the player immediately wants the next action | Dead end / no pull to repeat |
| **First 60s** | Action <3s, reward <10s, a "go again" hook <60s | Menus first, slow start, first-run wipe |
| **Is there a real decision?** | Player chooses between meaningful options | One optimal path; clicking, not deciding |
| **Does difficulty breathe?** | Ramp + breather beats, first run forgiving | Flat, or spikes that wall the player |
| **Is there a reason to come back?** | ≥1 retention hook tied to the loop | Nothing pulls them to day 2 |
| **Juice on key events?** | Hits/rewards/levelups have feedback | Silent, weightless actions |

State a one-line self-verdict when delivering (e.g. "self-check: loop pulls, first-60s hook is the
near-miss revive, decision = which upgrade — breather beats every 5 waves"). If you can't name the
decision or the return hook, the design isn't done yet.

## Non-Negotiable Acceptance Criteria
- [ ] Core loop has all 4 elements: action, challenge, reward, repeat
- [ ] First input produces a satisfying result within 3s; first reward within 10s
- [ ] Onboarding teaches by doing (contextual one-at-a-time hints), not text walls
- [ ] First-run difficulty is forgiving; ramp applies after session one
- [ ] At least 3 juice effects on significant events (shake/flash/particles/sound)
- [ ] Difficulty increases gradually with breather moments
- [ ] Session length matches genre target
- [ ] At least 1 retention mechanic (daily bonus OR upgrades OR achievements)
- [ ] Personal best tracked and displayed
- [ ] ⚠️ ZERO changes to SDK calls, localization, ads, debug, or sound mute system
