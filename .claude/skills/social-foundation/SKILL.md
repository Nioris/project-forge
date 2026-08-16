---
name: social-foundation
kind: architectural
description: "Architectural foundation для social/community apps. Поверх app-data-model + permissions + onboarding добавляет: content moderation pipeline (auto + human), abuse prevention (rate limiting, spam detection), real-time messaging (WebSocket / Server-Sent Events), trust & safety policies, community guidelines enforcement, age-gated features, GDPR-compliant blocking/reporting. Triggers on: social app, community, чат, форум, social network, comments, posts, feed, messaging, moderation, abuse, спам, harassment, trust safety, real-time, WebSocket."
---

# Social Foundation — moderation, safety, scale

## Зачем

Social apps имеют unique failure modes. Generic app skills их не покрывают:

- **Abuse / harassment** — без модерации app становится hostile space → mass uninstall, press disasters
- **Spam** — drives away real users, kills signal-to-noise
- **CSAM / illegal content** — legal exposure, immediate platform ban (Apple/Google)
- **Real-time messaging** — WebSocket scaling, presence, delivery guarantees — иначе UX broken
- **Trust** — без reputation/verification fake accounts dominate
- **Privacy** — DM leaks = lawsuit territory
- **Network effects** — если pre-launch не задумана retention механика, users одинокие → churn

Без foundation:
- 6 месяцев — moderation queue overflows, spam everywhere
- 12 месяцев — toxic culture entrenched, can't recover
- Apple/Google могут ban app в любой момент за UGC violations

`/app-permissions` (Iter1) даёт RBAC. `/app-data-model` — data layer. Social-specific = поверх.

## Когда вызывать

После:
- `/i18n-foundation`
- `/app-data-model` — entities (расширяется UGC + moderation tables)
- `/app-permissions` — roles (extended с moderator role)
- `/app-onboarding-flow` — Level 3 personalized + community guidelines acceptance

Subcategories:

| Subcategory | Examples | Special considerations |
|---|---|---|
| **Public chat / IM** | Telegram-like, Discord-clone | Real-time scaling, message history, presence |
| **Forum / discussion** | Reddit-clone, vBulletin-style | Threading, voting, sub-communities |
| **Microblogging / feed** | Twitter-clone, Mastodon | Algorithm choices, visibility, virality |
| **Photo/video sharing** | Instagram-clone | CSAM detection mandatory, image moderation |
| **Live streaming** | Twitch-like | Real-time + recording moderation, donation handling |
| **Community / groups** | Facebook Groups-clone | Per-group moderation, membership policies |
| **Dating / matchmaking** | Tinder-clone | Strict identity verification, harassment risk high, age gating |
| **Gaming social** | Discord для game | Anti-cheat coordination, voice chat moderation |

## Pipeline

### Шаг 1 — Read context, classify

```
wiki/_map.md                       # category=social, sub-category
wiki/architecture/data-model.md
wiki/architecture/metrics.md       # social-specific KPIs (DAU/MAU, network density)
wiki/research/{Project}-references.md
```

Verify:
- Target audience — adults only / включая teens / включая children?
- UGC types — text only / images / video / audio?
- Real-time vs async (chat vs forum)?
- Public vs private vs hybrid visibility?

### Шаг 2 — Trust & Safety architecture

**Three pillars** of T&S — must be designed together, not bolt-on:

```
1. PREVENTION
   - Rate limiting (anti-spam)
   - Account verification (anti-bot)
   - Community guidelines (clarity prevents misuse)

2. DETECTION
   - Auto-moderation (ML classifiers, regex filters, hash matching)
   - User reporting (in-context, low-friction)
   - Behavior analytics (patterns of abuse)

3. RESPONSE
   - Human review queue
   - Action ladder (warn → mute → temp ban → permanent ban)
   - Appeal process
   - Transparency report (per quarter)
```

Without all three — abusers win.

### Шаг 3 — Content moderation pipeline

#### Auto-moderation (first line of defense)

```typescript
// src/moderation/auto.ts

interface ModerationResult {
  decision: 'allow' | 'flag' | 'block';
  signals: ModerationSignal[];
  confidence: number;
  reviewerNeeded: boolean;
}

export async function moderateContent(content: UGC): Promise<ModerationResult> {
  const signals: ModerationSignal[] = [];

  // 1. Hash-based blocking (CSAM, known illegal content)
  // Use PhotoDNA / NCMEC hash database for images
  if (content.type === 'image') {
    const hash = await computePhotoHash(content.data);
    if (await isInBlocklist(hash, 'csam')) {
      // CSAM detection — IMMEDIATE block + report to NCMEC
      await reportToNCMEC(content);
      return { decision: 'block', signals: [{ type: 'csam', confidence: 1.0 }], confidence: 1.0, reviewerNeeded: false };
    }
  }

  // 2. Regex / keyword filters (slurs, threats, common spam)
  const textSignals = scanText(content.text || '');
  signals.push(...textSignals);

  // 3. ML classifiers (toxicity, hate speech, sexual content)
  // Perspective API, OpenAI Moderation API, AWS Rekognition for images
  const mlSignals = await runMLClassifiers(content);
  signals.push(...mlSignals);

  // 4. Behavior signals (account age, posting frequency, prior violations)
  const behaviorSignals = await getBehaviorSignals(content.authorId);
  signals.push(...behaviorSignals);

  // 5. Aggregate decision
  const totalScore = signals.reduce((s, sig) => s + sig.weight, 0);

  if (totalScore > BLOCK_THRESHOLD) return { decision: 'block', signals, confidence: 0.9, reviewerNeeded: false };
  if (totalScore > FLAG_THRESHOLD) return { decision: 'flag', signals, confidence: 0.7, reviewerNeeded: true };
  return { decision: 'allow', signals, confidence: 0.95, reviewerNeeded: false };
}
```

Tools to use:
- **Perspective API** (Google) — text toxicity, free tier
- **OpenAI Moderation API** — comprehensive, free
- **AWS Rekognition** — image moderation (NSFW, violence)
- **PhotoDNA** (Microsoft) — CSAM hash matching, free для qualified orgs
- **NCMEC CyberTipline** — required reporting US

#### Human review queue

```typescript
interface ModerationQueue {
  id: string;
  contentId: string;
  contentType: 'post' | 'comment' | 'message' | 'image' | 'video' | 'profile';
  submittedAt: number;
  flagSource: 'auto' | 'user_report' | 'admin';
  signals: ModerationSignal[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'reviewing' | 'actioned' | 'closed';
  assignedTo?: string;
  decisionAt?: number;
  decision?: 'allow' | 'remove' | 'remove_and_warn' | 'remove_and_ban';
  reviewerNotes?: string;
}

// SLA per priority
const SLA_HOURS = {
  critical: 1,    // CSAM, immediate threats
  high: 4,        // hate speech, harassment
  medium: 24,     // spam, off-topic
  low: 72,        // borderline cases
};
```

Critical items (CSAM, terrorism, immediate threats) — **bypass queue**, auto-block + immediate human review + law enforcement notification.

### Шаг 4 — User reporting

In-context, low-friction. Make easy to report, hard to abuse:

```typescript
// UI: report button on EVERY UGC
// Categories (matched к platform policies):
const REPORT_CATEGORIES = [
  { id: 'spam', label: 'Спам' },
  { id: 'harassment', label: 'Оскорбления / харасмент' },
  { id: 'hate_speech', label: 'Язык вражды' },
  { id: 'violence', label: 'Угрозы насилия' },
  { id: 'sexual', label: 'Сексуальный контент' },
  { id: 'csam', label: 'Эксплуатация детей' }, // routes ALWAYS critical
  { id: 'misinformation', label: 'Дезинформация' },
  { id: 'self_harm', label: 'Селф-харм / суицид' },
  { id: 'illegal', label: 'Незаконные действия' },
  { id: 'impersonation', label: 'Выдаёт себя за другого' },
  { id: 'other', label: 'Другое' },
];

// Anti-abuse of reporting:
// - Rate limit: 10 reports / hour / user
// - Track false report rate per user — if >50%, deprioritize their reports
// - "Mass report" detection — coordinated reporting attacks → flag for human review
```

After report:
- Reporter gets confirmation (not status — privacy)
- Reported content NOT immediately removed (false flag risk)
- Goes to moderation queue с priority based on category

### Шаг 5 — Action ladder

Don't go directly from "first violation" to "permanent ban". Graduated response:

```typescript
type ActionLevel =
  | 'warn'          // visible warning, no functional limit
  | 'mute_24h'      // can't post for 24h
  | 'mute_7d'       // can't post for 7 days
  | 'shadowban'     // posts visible only to user themselves
  | 'temp_ban_30d'  // account suspended 30 days
  | 'perm_ban';     // permanent

interface UserViolations {
  userId: string;
  violations: Violation[];
  currentStatus: 'good' | ActionLevel;
  cooldownExpiresAt?: number;
}

// Auto-escalation logic
function determineAction(user: UserViolations, severity: 'minor' | 'major' | 'severe'): ActionLevel {
  const recentViolations = user.violations.filter(v => Date.now() - v.timestamp < 90 * DAY);

  if (severity === 'severe') return 'perm_ban';  // CSAM, terrorism — immediate

  if (severity === 'major') {
    if (recentViolations.length >= 3) return 'perm_ban';
    if (recentViolations.length >= 2) return 'temp_ban_30d';
    return 'mute_7d';
  }

  // minor
  if (recentViolations.length === 0) return 'warn';
  if (recentViolations.length === 1) return 'mute_24h';
  if (recentViolations.length === 2) return 'mute_7d';
  return 'temp_ban_30d';
}
```

#### Appeal process

User должен иметь возможность appeal:

```typescript
interface Appeal {
  appealId: string;
  userId: string;
  actionId: string;
  submittedAt: number;
  reason: string;        // free text
  status: 'pending' | 'upheld' | 'overturned';
  reviewedAt?: number;
  reviewerNotes?: string;
}

// SLA: appeals reviewed within 7 days
// Successful appeal → action reversed + violation removed from history
```

Без appeal process — false positives accumulate forever, и legitimate users uninstall.

### Шаг 6 — Anti-spam / abuse prevention

#### Rate limiting

Per-user, per-action, sliding windows:

```typescript
const RATE_LIMITS = {
  // Newcomers more restricted (anti-spam):
  new_account: {
    posts_per_hour: 3,
    comments_per_hour: 10,
    dms_per_day: 5,
    follows_per_day: 50,
  },
  // Established users:
  established: {  // > 30 days, > 50 posts, no recent violations
    posts_per_hour: 30,
    comments_per_hour: 100,
    dms_per_day: 100,
    follows_per_day: 500,
  },
  // Trusted (verified, long history):
  trusted: {
    posts_per_hour: 60,
    comments_per_hour: 200,
    dms_per_day: 500,
    follows_per_day: 1000,
  },
};

async function checkRateLimit(userId: string, action: string): Promise<RateLimitResult> {
  const tier = await getUserTier(userId);
  const limits = RATE_LIMITS[tier];
  const limit = limits[`${action}_per_hour`] ?? limits[`${action}_per_day`];
  const used = await countRecentActions(userId, action, /* window */);

  if (used >= limit) {
    return {
      allowed: false,
      retryAfter: getNextWindowReset(action),
      message: `Слишком много действий. Попробуй через ${formatTime(retryAfter)}.`,
    };
  }
  return { allowed: true };
}
```

#### Bot detection

- **CAPTCHA on signup** — hCaptcha / reCAPTCHA (privacy-friendlier than legacy)
- **Email verification** — required before posting
- **Phone verification** — for higher tier (e.g. DMs to non-followers)
- **Behavioral signals** — typing patterns, mouse movements, time between actions
- **Account age gates** — new accounts can't DM strangers, can't post links, can't tag many users

#### Spam pattern detection

```typescript
// Common spam patterns:
const SPAM_PATTERNS = [
  // Same content posted multiple places
  { type: 'duplicate_content', threshold: 5, window: HOUR },

  // Fast follow + unfollow (follow farming)
  { type: 'follow_unfollow', threshold: 20, window: DAY },

  // Mass tagging (notification spam)
  { type: 'tag_spam', threshold: 10, window: HOUR },

  // Link in profile + posts (affiliate spam)
  { type: 'link_repetition', threshold: 5, window: DAY },

  // Coordinated posting (bot networks)
  { type: 'temporal_correlation', /* multi-account analysis */ },
];
```

### Шаг 7 — Real-time messaging (если applicable)

For chat / DMs / live updates:

#### Transport layer choice

| Method | Pros | Cons | Use case |
|---|---|---|---|
| **WebSocket** | Bidirectional, low latency | Requires persistent connection, scaling complex | Chat apps |
| **Server-Sent Events (SSE)** | Simple, HTTP-based, auto-reconnect | One-way (server → client) | Live feeds, notifications |
| **Polling** | Trivial implementation | Wasteful, latency | Fallback only |
| **Long polling** | Better than polling | Still wasteful | Legacy support |

**Default for chat:** WebSocket (через Socket.IO or native).
**Default for feeds:** SSE.

#### Architecture

```
Client ←→ Load Balancer ←→ WebSocket servers (multiple instances)
                                    ↓
                            Redis pub/sub (cross-server messaging)
                                    ↓
                            PostgreSQL (persistent storage)
                                    ↓
                            S3 (media files)
```

#### Message delivery guarantees

```typescript
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: number;
  deliveredAt?: number;     // when recipient's server received
  readAt?: number;          // when recipient opened
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
}

// Client-side optimistic UI:
// 1. User sends → message appears immediately (status='pending')
// 2. Server ACK → status='sent'
// 3. Recipient online → status='delivered'
// 4. Recipient reads → status='read'
// 5. If offline 3 days → push notification fallback
```

#### Presence

```typescript
interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: number;
  currentDevices: string[];  // multi-device support
}

// Updates via heartbeat (every 30 sec from active client)
// Marked 'away' after 5 min no activity
// Marked 'offline' after no heartbeat 1 min
```

### Шаг 8 — Privacy + DM safety

DMs are highest-risk privacy area. Architectural decisions:

#### Encryption

3 levels:

| Level | What | Trade-off |
|---|---|---|
| **Transport-only (TLS)** | Server can read messages | Easy, allows search/moderation |
| **At-rest encryption** | Encrypted in DB | Requires key management, server still reads in transit |
| **End-to-end (E2E)** | Only sender/recipient can read | Server can't moderate or recover, complex key exchange |

**Defaults by app type:**
- Public chat (Discord-style) → transport + at-rest
- Private messaging (WhatsApp-style) → E2E (Signal Protocol)
- Hybrid (Telegram-style) → optional E2E (Secret Chats)

E2E precludes server-side moderation. Trade-off: privacy vs safety.

#### Block / mute / restrict

```typescript
interface UserRelations {
  userId: string;
  blocked: string[];      // they never see anything from blocker
  muted: string[];        // blocker doesn't see their content but they don't know
  restricted: string[];   // soft block — limit interaction without revealing
}

// Effects:
// - Blocked: cannot DM, see profile, comment on posts
// - Muted: blocker hides their content, but they can still try interactions
// - Restricted: their comments hidden by default (visible to author only),
//   no notifications sent
```

#### "Right to be forgotten" (GDPR)

When user deletes account:
- Their content marked deleted (NOT hard-deleted immediately — preserves thread integrity)
- After 30-day grace period → hard delete (replaces with [deleted user])
- Their DMs to others — what happens?
  - Option A: their side deleted, recipient's side kept (most common)
  - Option B: full delete from both sides (Signal-style)

Document choice explicitly in privacy policy.

### Шаг 9 — Age gating + minor protection

If teens / kids on platform:

```typescript
interface AgeRestriction {
  feature: string;
  minAge: number;
  enforcement: 'self_attest' | 'verified';
}

const AGE_GATES = [
  { feature: 'create_account', minAge: 13, enforcement: 'self_attest' },  // COPPA
  { feature: 'public_profile', minAge: 13, enforcement: 'self_attest' },
  { feature: 'send_dm_to_strangers', minAge: 18, enforcement: 'verified' },
  { feature: 'view_age_restricted_content', minAge: 18, enforcement: 'verified' },
  { feature: 'live_streaming', minAge: 16, enforcement: 'self_attest' },
];
```

**Required for minor users (<18):**
- Default privacy: friends-only profile
- DM от strangers off by default
- No location sharing
- Reduced ad targeting (или вообще disabled — COPPA если <13)
- Parental notification options
- Limited search visibility

Apple App Store / Google Play actively enforce these — non-compliance = removal.

### Шаг 10 — Network effects + retention

Social apps die без critical mass. Architectural patterns to address:

#### Onboarding network bootstrap

- **Find friends** flow during onboarding (contacts import, social graph)
- **Suggested follows** based on initial interests
- **Default subscriptions** to popular content (feed not empty)

#### Engagement loops

```
Notification → click → see new content/activity → engage → produce content →
  → triggers notification to others → loop
```

Key: notifications must be **valuable**, not spam:
- Actual interactions (reply, mention, DM)
- New content from people you actively engage with
- NOT "X liked your post from 6 months ago"
- NOT generic "see what's new"

#### Network density visualization

Track для metrics:
- DAU/MAU ratio (sticky factor) — target 50%+ для healthy social
- Avg connections per user
- % users with at least N active connections (not just zombie account)
- Time-to-value: how fast new user reaches Nth connection / first message

### Шаг 11 — Generate `src/social/` structure

```
src/social/
├── moderation/
│   ├── auto.ts              # ML classifiers, regex filters, hash matching
│   ├── queue.ts             # human review queue, SLA tracking
│   ├── actions.ts           # action ladder (warn → ban)
│   ├── appeals.ts           # appeal process
│   └── reporting.ts         # user reports + abuse detection
├── safety/
│   ├── csam.ts              # CSAM detection + NCMEC reporting
│   ├── rate-limit.ts        # per-user rate limiting
│   ├── bot-detection.ts     # CAPTCHA + behavioral signals
│   ├── spam-patterns.ts     # pattern detection
│   └── transparency.ts      # public transparency report
├── messaging/  // если real-time
│   ├── transport.ts         # WebSocket / SSE setup
│   ├── presence.ts          # online status tracking
│   ├── delivery.ts          # message status (sent/delivered/read)
│   ├── encryption.ts        # E2E if applicable
│   └── notifications.ts     # push fallback for offline
├── relations/
│   ├── follow.ts            # follow/unfollow logic
│   ├── block.ts             # block/mute/restrict
│   └── privacy.ts           # visibility rules
├── feed/  // если timeline
│   ├── algorithm.ts         # ranking / filtering
│   ├── personalization.ts   # per-user adjustments
│   └── safety-filter.ts     # remove blocked/muted from feed
├── compliance/
│   ├── age-gating.ts        # minor protection
│   ├── gdpr-deletion.ts     # right to be forgotten
│   └── data-export.ts       # user data download
└── analytics/
    ├── engagement.ts        # DAU/MAU, time-on-app, depth
    ├── network-density.ts   # connections, isolation detection
    └── safety-metrics.ts    # report rate, action rate, appeal rate
```

### Шаг 12 — Document

Save to `wiki/design/social-foundation.md`:

```markdown
# Social Foundation — {Project}

## Subcategory: {chat / forum / feed / etc.}
## Target audience: {age range, demographics}
## UGC types: {text / images / video / audio}

## Trust & Safety pillars
- Prevention: rate limits, account verification, community guidelines
- Detection: ML auto-mod (Perspective + OpenAI Mod API), user reports
- Response: human queue (SLA по priority), action ladder, appeals

## Moderation tools
- Auto: {Perspective API, OpenAI Mod, PhotoDNA для images}
- Human queue priorities: {critical 1h, high 4h, medium 24h, low 72h}
- Action ladder: warn → mute 24h → mute 7d → temp ban 30d → perm ban
- Appeal: 7-day SLA

## Anti-spam
- Rate limits: {tiered by account age}
- Bot detection: hCaptcha + email verify + behavioral
- Spam patterns: {duplicate content, follow farming, mass tagging}

## Real-time (если applicable)
- Transport: WebSocket для chat, SSE для feed
- Delivery guarantees: at-least-once, dedup at client
- Presence: heartbeat 30s, away 5min, offline 1min
- Encryption: {transport / at-rest / E2E — choose}

## Privacy
- Block / mute / restrict semantics defined
- DM encryption level: {transport / at-rest / E2E}
- GDPR deletion: 30-day soft delete + hard delete

## Age gating
- Min account age: 13 (COPPA)
- Minor protections: {default privacy, DM restrictions, location off}

## Network effects
- Find friends flow: {contacts import / social graph}
- Suggested content / follows: {algorithm}
- Engagement loops: {notification → content → response}

## Metrics targets
- DAU/MAU: 50%+
- Avg connections: {target}
- Report-to-action rate: 30-50% (signal of accurate reports)
- Appeal-overturn rate: 5-15% (signal of accurate moderation)
```

## Common pitfalls

1. **No moderation at launch** — "we'll add it when we have users". By the time you "have users", toxicity is entrenched. Day 1.

2. **Over-reliance на ML** — Perspective API misclassifies cultural context. Human review essential для нетривиальных cases.

3. **No appeal process** — false positives accumulate, legitimate users banned, support tickets explode. Always have appeal.

4. **Ignoring CSAM** — even tiny social apps get CSAM uploads. PhotoDNA hash check is FREE для qualified orgs. Use it. Reporting to NCMEC is REQUIRED in US.

5. **No rate limiting** — spambots will find you in days, not weeks. Default conservative.

6. **DMs to strangers по умолчанию** — harassment vector. Default opt-in или follow-required.

7. **Real-time без offline fallback** — phone дёрнул out of WiFi → message lost. Push notifications + queued delivery.

8. **Block doesn't fully block** — blocked user creates new account → continues harassment. Layer detection: device fingerprint, IP, similar handle.

9. **No transparency report** — users wonder if action is fair. Quarterly transparency report (action counts, appeal stats) builds trust.

10. **Ignore age gating** — Apple/Google reviewers actively check. Missing age gate = removal.

11. **No moderator UI** — moderators using DB tools = slow + error-prone. Build dashboard from day 1.

12. **One person doing all moderation** — burns out fast. Plan для community moderators (vetted volunteers) early.

## Non-Negotiable

- [ ] Subcategory classified
- [ ] T&S three pillars implemented (prevention + detection + response)
- [ ] Auto-moderation pipeline (regex + ML + hash matching for CSAM)
- [ ] Human review queue с SLA per priority
- [ ] Action ladder (warn → ban)
- [ ] Appeal process с 7-day SLA
- [ ] User reporting in-context (low friction)
- [ ] Rate limiting per-user, tiered by account age
- [ ] CAPTCHA + email verify for new accounts
- [ ] CSAM detection (PhotoDNA) — REQUIRED для image-supporting apps
- [ ] Block / mute / restrict semantics
- [ ] Age gating (13 min, COPPA-compliant если targeting kids)
- [ ] GDPR deletion flow (soft + hard)
- [ ] If real-time: WebSocket + presence + delivery guarantees + offline fallback
- [ ] Transparency report quarterly
- [ ] Document в `wiki/design/social-foundation.md`
- [ ] All strings через `t()` (i18n)
