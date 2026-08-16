---
name: health-app-foundation
kind: architectural
description: "Architectural foundation для health/wellness apps. Поверх app-data-model + onboarding + subscription добавляет: GDPR Article 9 (special category data), encryption at-rest, export/right-to-deletion, behavior design (streaks/habits/reminders), medical disclaimer compliance. Триггер: трекеры (фитнес/сон/настроение/симптомы), медитация, period tracking, mental health. Triggers on: health app, wellness, фитнес, медитация, трекер, period tracker, mental health, GDPR health, Article 9, sensitive data."
---

# Health App Foundation — privacy + behavior design

## Зачем

Health-приложения — особая категория. Данные пользователей о здоровье (вес, сон, настроение, симптомы, цикл, тренировки) попадают под:

- **GDPR Article 9** (special category personal data) — strictest rules
- **HIPAA** (если US market) — medical privacy
- **Российский ФЗ-152** + специальные правила для медданных
- **Apple HealthKit / Google Fit** — данные не покидают устройство без explicit user consent
- **Yandex Games / RuStore moderation** — health apps проходят дополнительный review

Технические требования:
- Encryption at-rest для sensitive fields
- Right to deletion (GDPR Article 17) — implementable за <30 days
- Right to export (Article 20) — JSON/CSV/PDF
- No tracking ad networks (или explicit opt-in)
- Medical disclaimer ("not medical advice")

Plus behavior design — health apps работают через **habit formation**, не через "flashy features":
- Streaks (don't break the chain)
- Daily reminders (gentle, not pushy)
- Progress visualization (week-over-week trends)
- Re-engagement after breaks (without shame)

## Когда вызывать

После `/start` для категории health, ПОСЛЕ универсальных архитектурных skills:
- `/i18n-foundation` — i18n setup
- `/app-data-model` — data model (теперь расширяется sensitive data layer)
- `/app-onboarding-flow` — onboarding (теперь Level 3 personalized + goal-setting)

ДО первой feature.

Пример trigger phrase в `/start`: "трекер веса", "медитация", "период", "симптом-чекер", "фитнес-журнал".

## Pipeline

### Шаг 1 — Read context

```
wiki/_map.md                       # category должна быть health
wiki/architecture/data-model.md    # entities (расширяем sensitive)
wiki/architecture/metrics.md       # streak retention targets
wiki/research/{Project}-references.md  # competitor practices on privacy
```

Если category != health → abort, neправильный skill.

### Шаг 2 — Classify subcategory

Health подкатегории отличаются по compliance + design:

| Subcategory | Compliance level | Examples | Special considerations |
|---|---|---|---|
| **General fitness** | Standard GDPR | Step counter, workout log | Step counts not sensitive (Apple HealthKit normalized) |
| **Body metrics** | Sensitive | Weight, body fat, measurements | Body image triggers — avoid public sharing |
| **Mental health** | Highly sensitive | Mood tracker, anxiety log, journaling | Crisis hotline integration mandatory |
| **Reproductive health** | Highly sensitive | Period tracking, fertility | Жесткие требования по приватности после Roe v. Wade |
| **Sleep / wellness** | Standard sensitive | Sleep tracker, meditation, breathing | Often OK to share (community features) |
| **Medical** | Regulated (HIPAA) | Symptom checker, medication reminder, telehealth | NOT a doctor — disclaimer required |
| **Nutrition** | Standard sensitive | Calorie counter, meal log | Disordered eating risk — avoid "obsessive" UX |

Спроси у юзера если непонятно. Subcategory влияет на compliance pattern.

### Шаг 3 — Sensitive data inventory

В `wiki/design/data-model.md` (создан `/app-data-model`) пометь поля sensitive:

```markdown
### Entry (mood log)
| Field | Type | Required | Indexed | **Sensitive** | Notes |
|---|---|---|---|---|---|
| id | string (uuid) | yes | yes | no | |
| userId | string | yes | yes | no | |
| mood | enum | yes | no | **YES** | category 9 GDPR |
| note | string | no | no | **YES** | free text — может содержать crisis keywords |
| location | string | no | no | **YES** | optional, encrypted |
| createdAt | timestamp | yes | yes | no | |
```

Для всех sensitive полей применяется encryption layer (Шаг 4).

### Шаг 4 — Encryption at-rest layer

Browser/mobile storage **не secure** — IndexedDB читается через DevTools, mobile filesystem доступен через jailbreak/root. Encrypt sensitive поля.

Add `src/data/encryption/`:

```typescript
// src/data/encryption/key.ts
import { PBKDF2 } from 'crypto-utils';

// Key derived from user-set passphrase + per-install salt
export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const salt = await getOrCreateSalt();  // localStorage 'crypto_salt'
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// src/data/encryption/cipher.ts
export async function encryptField(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return btoa(String.fromCharCode(...iv) + String.fromCharCode(...new Uint8Array(ct)));
}

export async function decryptField(ciphertext: string, key: CryptoKey): Promise<string> {
  const raw = atob(ciphertext);
  const iv = new Uint8Array(raw.slice(0, 12).split('').map(c => c.charCodeAt(0)));
  const ct = new Uint8Array(raw.slice(12).split('').map(c => c.charCodeAt(0)));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}
```

Wrap repository methods to auto-encrypt sensitive fields:

```typescript
// src/data/repositories/mood-repo.ts
class MoodRepository {
  constructor(private storage: IStorage, private cryptoKey: CryptoKey) {}

  async create(entry: Omit<MoodEntry, 'id'>) {
    const encrypted = {
      ...entry,
      mood: await encryptField(entry.mood, this.cryptoKey),
      note: entry.note ? await encryptField(entry.note, this.cryptoKey) : undefined,
    };
    return this.storage.save('moods', encrypted);
  }

  async getAll(): Promise<MoodEntry[]> {
    const records = await this.storage.list('moods');
    return Promise.all(records.map(async r => ({
      ...r,
      mood: await decryptField(r.mood, this.cryptoKey),
      note: r.note ? await decryptField(r.note, this.cryptoKey) : undefined,
    })));
  }
}
```

### Шаг 5 — Right to deletion + export

GDPR Article 17 (deletion) + Article 20 (portability):

```typescript
// src/data/privacy.ts

// Article 17: Right to erasure
export async function deleteAllUserData(userId: string): Promise<void> {
  // 1. Delete all entities
  for (const table of SENSITIVE_TABLES) {
    const items = await storage.list(table, { where: { userId } });
    for (const item of items) {
      await storage.delete(table, item.id);
    }
  }

  // 2. Delete cloud copies (if synced)
  if (cloudSyncEnabled) {
    await fetch('/api/user/delete', { method: 'DELETE', body: JSON.stringify({ userId }) });
  }

  // 3. Clear local storage
  localStorage.clear();
  sessionStorage.clear();

  // 4. Confirm deletion
  await logEvent('account_deleted', { userId, timestamp: Date.now() });
}

// Article 20: Right to portability
export async function exportAllUserData(userId: string, format: 'json' | 'csv' | 'pdf'): Promise<Blob> {
  // Re-authenticate user before export (sensitive operation)
  await requireReauth();

  const data = {
    user: await userRepo.get(userId),
    entries: await moodRepo.getAllByUser(userId),
    streaks: await streakRepo.getByUser(userId),
    // ... all entities
    exportedAt: new Date().toISOString(),
    format,
  };

  if (format === 'json') return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  if (format === 'csv') return generateCSV(data);
  if (format === 'pdf') return generatePDF(data);
}
```

UI: Settings → Privacy → Export data / Delete account. Both options always visible.

### Шаг 6 — Behavior design (streaks + habits + reminders)

Health apps живут на habit formation. Универсальный pattern:

```typescript
// src/behavior/streak.ts
interface Streak {
  userId: string;
  type: 'daily_log' | 'workout' | 'meditation';
  currentDays: number;
  longestDays: number;
  lastLoggedAt: number;  // timestamp
  startedAt: number;
}

export async function logActivity(userId: string, type: StreakType): Promise<Streak> {
  const streak = await streakRepo.get(userId, type);
  const today = startOfDay(Date.now());
  const lastLogDay = startOfDay(streak.lastLoggedAt);

  if (today === lastLogDay) {
    // Already logged today — no streak change
    return streak;
  }

  if (today === lastLogDay + ONE_DAY) {
    // Consecutive day
    streak.currentDays += 1;
    streak.longestDays = Math.max(streak.longestDays, streak.currentDays);
  } else {
    // Broken streak — reset, but keep longestDays
    streak.currentDays = 1;
  }

  streak.lastLoggedAt = Date.now();
  await streakRepo.save(streak);
  return streak;
}
```

Reminder pattern (gentle, not pushy):

```typescript
// src/behavior/reminders.ts

// Smart timing: based on user's typical log time
export async function scheduleReminder(userId: string) {
  const history = await getLogHistory(userId, { days: 30 });
  const avgHour = computeAverageLogHour(history);  // e.g. 21:00

  // Schedule notification 1h before usual time
  await notifications.schedule({
    at: tomorrow.setHours(avgHour - 1),
    title: 'Готов записать день?',
    body: getEncouragingMessage(streak.currentDays),
    actions: [
      { id: 'log_now', label: 'Записать' },
      { id: 'snooze', label: 'Через час' },
      { id: 'skip_today', label: 'Не сегодня' },  // GRACE — no shame
    ],
  });
}

function getEncouragingMessage(days: number): string {
  if (days === 0) return 'Начни новую серию';  // not "you broke your streak!"
  if (days < 7) return `Серия ${days} ${pluralize(days)}`;
  if (days < 30) return `Отличная серия — ${days} дней!`;
  return `Невероятно — ${days} дней подряд`;
}
```

**Anti-patterns** (do NOT implement):
- "You broke your streak!" с грустным эмодзи — shame-based, drives churn
- Push notification spam (>1/day) — uninstall trigger
- Public leaderboards для весов / mental health — privacy + comparison harm
- Streak freeze как paid feature — predatory (особенно в кризис)

### Шаг 7 — Crisis intervention (для mental health)

Если subcategory = mental health, ОБЯЗАТЕЛЬНО:

```typescript
// src/behavior/crisis.ts

const CRISIS_KEYWORDS_RU = [
  'покончить с собой', 'самоубийство', 'не хочу жить',
  'причинить себе вред', 'нет смысла', /* ... */
];

// Scan free-text fields (mood notes, journal entries)
export function detectCrisisLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS_RU.some(kw => lower.includes(kw));
}

// Soft intervention — non-judgmental, offers help
export function showCrisisSupport(): void {
  showModal({
    title: 'Если тебе тяжело сейчас',
    body: 'Иногда нужна поддержка. Линии помощи:',
    resources: [
      { name: 'Психологическая помощь МЧС', tel: '+74959898686', open: '24/7' },
      { name: 'Телефон доверия для подростков', tel: '+78002000122', open: '24/7' },
      // ... regional
    ],
    actions: [
      { label: 'Позвонить', tel: 'auto-pick first' },
      { label: 'Поговорить с близким', action: 'guide_to_contacts' },
      { label: 'Закрыть', action: 'dismiss' },
    ],
  });
}
```

Локализуй contacts — для России Психологическая помощь МЧС, для других стран — local equivalent.

### Шаг 8 — Medical disclaimer

ОБЯЗАТЕЛЬНО для всех health apps. На onboarding + в settings:

```markdown
# Это не медицинский совет

[App Name] — это инструмент для отслеживания {что}. Это **не замена**:
- Консультации с врачом
- Медицинской диагностики
- Лечения заболеваний

Если у тебя есть медицинские вопросы — обратись к врачу. В случае угрозы жизни — звони 103 (РФ) или местные службы экстренной помощи.

[Я понимаю] [Закрыть приложение]
```

Display once on first run + accessible always через Settings → About.

### Шаг 9 — Tracking + analytics (privacy-first)

Health apps — НЕ место для ad networks или behavioral tracking:

```typescript
// What we DO track (with explicit consent):
- App opened (timestamp only, no user ID)
- Feature used (anonymized)
- Crash reports (Sentry-style, no PII)
- Subscription events (for billing)

// What we DON'T track:
- Health data values (никогда в analytics)
- User identity in analytics events
- Third-party advertising IDs
- Behavioral profiles for ad targeting
```

Privacy policy must list this explicitly.

### Шаг 10 — Generate `src/health/` structure

```
src/health/
├── encryption/
│   ├── key.ts            # PBKDF2 key derivation
│   ├── cipher.ts         # AES-GCM encrypt/decrypt
│   └── reauth.ts         # Re-authentication for sensitive ops
├── privacy/
│   ├── export.ts         # GDPR Article 20 — data export (JSON/CSV/PDF)
│   ├── delete.ts         # GDPR Article 17 — right to erasure
│   └── consent.ts        # Consent tracking
├── behavior/
│   ├── streak.ts         # Habit streaks
│   ├── reminders.ts      # Smart reminder scheduling
│   ├── progress.ts       # Week/month/year trends
│   └── crisis.ts         # (mental health only) crisis detection + intervention
├── compliance/
│   ├── disclaimer.ts     # Medical disclaimer modal
│   └── audit.ts          # Privacy audit log
└── ui/
    ├── privacy-settings.tsx  # Export/delete UI
    └── crisis-modal.tsx      # (mental health only)
```

### Шаг 11 — Document

Save to `wiki/design/health-foundation.md`:

```markdown
# Health Foundation — {Project}

## Subcategory: {General fitness / Mental health / etc.}

## Sensitive data inventory

[список полей с sensitive=YES]

## Encryption strategy
- At-rest: AES-GCM with PBKDF2 derived key
- Key derivation: user passphrase + per-install salt
- Re-auth required for: data export, account deletion

## GDPR / RUS-152 compliance

### Article 17 (Right to erasure)
- Trigger: Settings → Privacy → Delete account
- SLA: <30 days
- Cascade: local storage + cloud + analytics references
- Confirmation: re-auth + 7-day grace period

### Article 20 (Right to portability)
- Formats: JSON (full), CSV (per-table), PDF (human-readable)
- Trigger: Settings → Privacy → Export data
- SLA: <30 days
- Re-auth required

## Behavior design
- Streak type: {daily_log / workout / meditation}
- Reminder strategy: smart timing based on user history
- Anti-shame language: encouraging, never blaming
- Re-engagement after gap: gentle, no shame

## Crisis intervention (if mental health)
- Keyword detection: ru list of N keywords
- Resources: МЧС, telephone line for teens, regional
- Trigger: detection in free-text + Settings → Get help

## Medical disclaimer
- Shown: first run, settings always
- Text: "не медицинский совет"

## Tracking policy
- Allowed: app opened, feature usage (anon), crashes, billing events
- Forbidden: health values, user identity in analytics, ad IDs

## Compliance checklist
- [ ] Encryption at-rest implemented
- [ ] Export functionality working (json/csv minimum)
- [ ] Delete account flow tested (30-day SLA)
- [ ] Privacy policy mentions all collected data
- [ ] Medical disclaimer on first run + always accessible
- [ ] (mental health) crisis resources localized
- [ ] No third-party ad SDKs unless explicit consent
```

## Common pitfalls

1. **Encryption ключ в коде** — hardcoded passphrase = no encryption. Always derive from user input or per-install random.

2. **Streak shame** — "you broke a 90-day streak!" = uninstall trigger. Frame as "start a new chain".

3. **Push notification spam** — 3 reminders/day = annoying. Max 1, smart timing, easy mute.

4. **Public sharing weight/mental health** — comparison harm. Default private, opt-in for sharing.

5. **Forgot medical disclaimer** — Apple/Google reject health apps без него. Add from day 1.

6. **Analytics tracking health values** — sending mood scores to Mixpanel/Sentry = compliance violation. Aggregate-only or skip.

7. **Streak freeze as paid feature** — penalizing crisis times = predatory. If you have it, give it free during crisis-keyword detection.

8. **No crisis resources** — for mental health, missing crisis hotline = potential liability + harm. Always include.

## Non-Negotiable

- [ ] Subcategory classified (general fitness / mental health / etc)
- [ ] Sensitive fields marked в data-model
- [ ] Encryption at-rest для sensitive fields
- [ ] Right to deletion + export implemented
- [ ] Re-auth for sensitive operations (export, delete)
- [ ] Behavior design (streaks без shame, smart reminders)
- [ ] Medical disclaimer on first run + always accessible
- [ ] (mental health) crisis intervention with localized resources
- [ ] Privacy-first analytics (no health values, no ad IDs)
- [ ] Document в `wiki/design/health-foundation.md`
- [ ] All strings через `t()` (i18n)
