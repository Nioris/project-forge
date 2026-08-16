# Gamification System — Full Reference

## PocketBase Collections

```json
[
  {
    "name": "user_progress",
    "type": "base",
    "schema": [
      { "name": "user", "type": "relation", "options": { "collectionId": "users" } },
      { "name": "xp", "type": "number", "options": { "min": 0 } },
      { "name": "level", "type": "number", "options": { "min": 1 } },
      { "name": "streak_days", "type": "number", "options": { "min": 0 } },
      { "name": "last_activity_date", "type": "text" },
      { "name": "streak_started_at", "type": "text" }
    ]
  },
  {
    "name": "achievements",
    "type": "base",
    "schema": [
      { "name": "key", "type": "text" },
      { "name": "title", "type": "text" },
      { "name": "description", "type": "text" },
      { "name": "icon", "type": "text" },
      { "name": "xp_reward", "type": "number" },
      { "name": "condition_type", "type": "select", "options": { "values": ["xp_total", "streak", "events_count", "level"] } },
      { "name": "condition_value", "type": "number" }
    ]
  },
  {
    "name": "user_achievements",
    "type": "base",
    "schema": [
      { "name": "user", "type": "relation", "options": { "collectionId": "users" } },
      { "name": "achievement", "type": "relation", "options": { "collectionId": "achievements" } },
      { "name": "unlocked_at", "type": "text" }
    ]
  },
  {
    "name": "xp_events",
    "type": "base",
    "schema": [
      { "name": "user", "type": "relation", "options": { "collectionId": "users" } },
      { "name": "event_type", "type": "text" },
      { "name": "xp_amount", "type": "number" },
      { "name": "metadata", "type": "json" }
    ]
  }
]
```

## XP Engine (Server)

```ts
// src/lib/server/gamification.ts
import type PocketBase from 'pocketbase';

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000];

export function calculateLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function xpForNextLevel(level: number): number {
  return LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] * 2;
}

export async function grantXP(pb: PocketBase, userId: string, eventType: string, amount: number, metadata?: any) {
  // Rate limit check
  const recentEvents = await pb.collection('xp_events').getList(1, 10, {
    filter: `user="${userId}" && created >= "${new Date(Date.now() - 60000).toISOString()}"`,
  });
  if (recentEvents.totalItems >= 10) throw new Error('Rate limited');

  // Duplicate check (5s window)
  const dupes = await pb.collection('xp_events').getList(1, 1, {
    filter: `user="${userId}" && event_type="${eventType}" && created >= "${new Date(Date.now() - 5000).toISOString()}"`,
  });
  if (dupes.totalItems > 0) return null;

  // Log event
  await pb.collection('xp_events').create({ user: userId, event_type: eventType, xp_amount: amount, metadata });

  // Update progress
  let progress;
  try {
    progress = await pb.collection('user_progress').getFirstListItem(`user="${userId}"`);
  } catch {
    progress = await pb.collection('user_progress').create({
      user: userId, xp: 0, level: 1, streak_days: 0,
      last_activity_date: '', streak_started_at: '',
    });
  }

  const newXp = progress.xp + amount;
  const newLevel = calculateLevel(newXp);
  const leveledUp = newLevel > progress.level;

  // Streak logic
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  let streakDays = progress.streak_days;
  let streakStarted = progress.streak_started_at;

  if (progress.last_activity_date === yesterday) {
    streakDays++;
  } else if (progress.last_activity_date !== today) {
    streakDays = 1;
    streakStarted = today;
  }

  await pb.collection('user_progress').update(progress.id, {
    xp: newXp, level: newLevel, streak_days: streakDays,
    last_activity_date: today, streak_started_at: streakStarted,
  });

  // Check achievements
  const unlocked = await checkAchievements(pb, userId, newXp, newLevel, streakDays);

  return { xp: newXp, level: newLevel, leveledUp, streakDays, unlocked };
}

async function checkAchievements(pb: PocketBase, userId: string, xp: number, level: number, streak: number) {
  const allAchievements = await pb.collection('achievements').getFullList();
  const userAchievements = await pb.collection('user_achievements').getFullList({ filter: `user="${userId}"` });
  const unlockedIds = new Set(userAchievements.map(ua => ua.achievement));

  const newlyUnlocked = [];
  for (const ach of allAchievements) {
    if (unlockedIds.has(ach.id)) continue;
    let earned = false;
    if (ach.condition_type === 'xp_total' && xp >= ach.condition_value) earned = true;
    if (ach.condition_type === 'level' && level >= ach.condition_value) earned = true;
    if (ach.condition_type === 'streak' && streak >= ach.condition_value) earned = true;

    if (earned) {
      await pb.collection('user_achievements').create({
        user: userId, achievement: ach.id, unlocked_at: new Date().toISOString(),
      });
      newlyUnlocked.push(ach);
    }
  }
  return newlyUnlocked;
}
```

## XP Progress Bar Component

```svelte
<script lang="ts">
  interface Props { xp: number; level: number; nextLevelXp: number; }
  let { xp, level, nextLevelXp }: Props = $props();
  const prevLevelXp = $derived(level > 1 ? nextLevelXp * 0.7 : 0); // simplified
  const progress = $derived(((xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100);
</script>

<div class="space-y-1">
  <div class="flex items-center justify-between text-sm">
    <span class="font-bold text-brand-600">Уровень {level}</span>
    <span class="text-gray-500">{xp} / {nextLevelXp} XP</span>
  </div>
  <div class="h-3 rounded-full bg-gray-200 overflow-hidden">
    <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-700"
      style="width: {Math.min(progress, 100)}%"></div>
  </div>
</div>
```
