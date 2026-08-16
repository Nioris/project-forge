---
name: education-foundation
kind: architectural
description: "Architectural foundation для education/learning apps. Поверх app-data-model + onboarding + subscription добавляет: pedagogy framework (Bloom's taxonomy, scaffolding), spaced…"
---

# Education Foundation — pedagogy + retention + child safety

## Зачем

Education apps — особая категория с **уникальными проблемами** которые generic app skills не покрывают:

- **Pedagogy framework** — без него app = "набор фактов", не learning experience. Bloom's taxonomy (remember → understand → apply → analyze → evaluate → create) определяет cognitive level каждого упражнения.
- **Spaced repetition** — flashcards без интервалов = краткосрочная зубрёжка. Algorithms (SM-2, FSRS, Leitner) дают long-term retention.
- **Progression curve** — слишком резкий = frustration, слишком плоский = boredom. Zone of Proximal Development (Vygotsky) — целевая complexity = "немного выше текущего уровня".
- **COPPA compliance** — если audience младше 13 лет, US федеральный закон требует parental consent + ограничения tracking. EU GDPR-K (children) — аналогичные требования.
- **Учительский режим** — class-based apps требуют teacher dashboard (assignment, grading, progress monitoring) принципиально отличный от student UX.
- **Assessment integrity** — quizzes/tests должны иметь anti-cheat measures если используются в gradeable context.
- **Content versioning** — учебный контент эволюционирует (исправления ошибок, обновления). Без versioning users получают inconsistent experience.

`$app-data-model` (Iter1) даёт generic data layer. `$subscription-design` даёт billing. Education-specific — это foundation поверх.

## Когда вызывать

После:
- `$i18n-foundation`
- `$app-data-model`
- `$app-onboarding-flow` (Level 3 personalized — onboarding для education = goal setting + skill assessment)
- `$subscription-design` (если есть premium tier)

Subcategories определяют compliance + design:

| Subcategory | Examples | Special |
|---|---|---|
| **Children's learning** (<13) | Counting, alphabet, kid-friendly | **COPPA mandatory**, no third-party ads, parental controls |
| **K-12 / school** | Math practice, science, history | Teacher mode often required, grade alignment |
| **Language learning** | Duolingo-like, vocabulary trainers | Spaced repetition central, voice/pronunciation |
| **Adult skills** | Coding, design, business | Project-based, portfolio building |
| **Test/exam prep** | SAT, GRE, IELTS, ЕГЭ | Practice tests, time pressure simulation, official patterns |
| **Microlearning** | Bite-size lessons (5-10 min) | Push notification cadence critical |
| **Reference / spaced** | Anki-like, knowledge bases | SM-2 / FSRS algorithm, custom decks |
| **Skills certification** | Professional certs, trades | Strict assessment, certificate generation |

## Pipeline

### Шаг 1 — Read context, classify

```
wiki/_map.md                       # category=education, sub-category
wiki/architecture/data-model.md
wiki/architecture/metrics.md       # education-specific KPIs
wiki/research/{Project}-references.md
```

Verify:
- Is target audience младше 13 лет? → **COPPA** flow (Шаг 7)
- Is teacher/admin layer needed? → multi-role architecture (Шаг 5)
- Is content static or user-generated? → versioning approach differs (Шаг 6)

### Шаг 2 — Pedagogy framework

Define cognitive levels per content item using **Bloom's taxonomy**:

```typescript
type BloomLevel =
  | 'remember'      // recall facts (e.g. "What is the capital of France?")
  | 'understand'    // explain concepts (e.g. "Why is Paris the capital?")
  | 'apply'         // use in new situation (e.g. "Plan a trip to Paris")
  | 'analyze'       // break into parts (e.g. "Compare Paris vs Berlin")
  | 'evaluate'      // judge (e.g. "Best European capital for...")
  | 'create';       // produce new (e.g. "Write a tour itinerary");

interface LessonItem {
  id: string;
  topic: string;
  bloomLevel: BloomLevel;
  prerequisites: string[];  // IDs of items that must be mastered first
  estimatedMinutes: number;
  // ...
}
```

Why это matters:
- Distribution of cognitive levels across course = quality signal
- Beginner content = mostly `remember`/`understand`
- Advanced = mostly `apply`/`analyze`/`evaluate`/`create`
- Linear all-`remember` = "fact dump", not learning

Document expected distribution:
```
Beginner module:  remember 40%, understand 40%, apply 20%
Intermediate:     understand 30%, apply 40%, analyze 30%
Advanced:         apply 30%, analyze 30%, evaluate 20%, create 20%
```

### Шаг 3 — Spaced repetition algorithm (если applicable)

For flashcard / vocabulary / fact-recall apps. Three options:

#### Option A: Leitner system (simplest)

5 boxes. Card moves to next box on correct answer, back to box 1 on wrong.

Review schedule: box 1 daily, box 2 every 2 days, box 3 weekly, box 4 bi-weekly, box 5 monthly.

Pros: simple, deterministic, good для children.
Cons: doesn't adapt к individual difficulty.

#### Option B: SM-2 (Anki algorithm)

```typescript
interface CardState {
  cardId: string;
  ease: number;          // 1.3 → 2.5+ (default 2.5)
  interval: number;      // days until next review
  repetitions: number;   // consecutive correct
  dueDate: number;       // timestamp
}

function reviewCard(card: CardState, quality: 0|1|2|3|4|5): CardState {
  // quality: 0=blackout, 1-2=fail, 3=correct hesitation, 4=correct, 5=perfect
  if (quality < 3) {
    // Failed — reset
    return { ...card, repetitions: 0, interval: 1, ease: Math.max(1.3, card.ease - 0.2), dueDate: Date.now() + ONE_DAY };
  }
  // Correct
  let interval, repetitions;
  if (card.repetitions === 0) interval = 1;
  else if (card.repetitions === 1) interval = 6;
  else interval = Math.round(card.interval * card.ease);

  const newEase = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  return {
    ...card,
    repetitions: card.repetitions + 1,
    interval,
    ease: newEase,
    dueDate: Date.now() + interval * ONE_DAY,
  };
}
```

Pros: industry standard, adapts to difficulty, optimal long-term retention.
Cons: complex, requires user self-grading 0-5.

#### Option C: FSRS (Free Spaced Repetition Scheduler — modern)

ML-based, more accurate than SM-2. Uses 17 parameters. Implementation: use `ts-fsrs` library.

Pros: best retention/effort ratio in current research.
Cons: dependency, more complex tuning.

**Default recommendation:** SM-2 for most apps. Leitner for children's apps. FSRS if optimization-critical.

### Шаг 4 — Progression curve

Design difficulty curve **explicitly**, not by trial-and-error:

```typescript
interface ProgressionCurve {
  // Difficulty as function of progress (0.0 to 1.0)
  difficultyAt(progress: number): number;

  // ZPD: items in "challenging but doable" range
  selectNextItem(userMastery: Map<string, number>, available: LessonItem[]): LessonItem;
}

// Example: gradual ramp with mastery checks
const ramp: ProgressionCurve = {
  difficultyAt(progress) {
    // Linear from 0.2 to 0.9
    return 0.2 + 0.7 * progress;
  },

  selectNextItem(mastery, available) {
    const targetDifficulty = this.difficultyAt(/* user progress */);
    // Filter to items where prerequisites met
    const ready = available.filter(item =>
      item.prerequisites.every(p => (mastery.get(p) ?? 0) >= 0.8)
    );
    // Pick item closest to target difficulty
    return ready.sort((a, b) =>
      Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty)
    )[0];
  },
};
```

ZPD principle (Vygotsky): target difficulty = "немного выше текущего уровня". Too low = boredom (skip). Too high = frustration (quit). Sweet spot = ~70-80% success rate.

Track per-user mastery per skill/topic. Adjust curve based on performance.

### Шаг 5 — Multi-role architecture (если class-based)

For school / classroom / corporate training:

```typescript
type Role = 'student' | 'teacher' | 'admin' | 'parent';

interface UserContext {
  userId: string;
  role: Role;
  classIds: string[];         // for teachers: their classes
  studentIds?: string[];      // for parents: their children
  permissions: Permission[];
}

// Teacher dashboard sees:
// - Class roster
// - Per-student progress
// - Aggregate class metrics (avg score, completion rate, struggling students)
// - Assignment creation tools
// - Grading queue

// Student sees:
// - Their assignments
// - Progress through course
// - Practice mode
// - Achievements

// Parent sees (if minor):
// - Child's progress
// - Weekly summary email
// - Time-limit settings
// - Privacy controls

// Admin sees:
// - User management
// - License usage (B2B contract)
// - System-wide analytics
```

Permissions enforced through `$app-permissions` foundation (RBAC).

### Шаг 6 — Content versioning

Учебный контент эволюционирует. Without versioning:
- User starts course at v1, returns 3 months later — content rewritten в v2 — progress confused
- Bug fix к ответу теста invalidates user's prior "wrong" answer
- A/B testing different content variants — analytics impossible

Strategy:

```typescript
interface ContentItem {
  id: string;
  version: number;           // bumped on any meaningful change
  contentHash: string;       // sha-256 of content body (for invalidation)
  publishedAt: number;
  deprecatedAt?: number;     // when this version retired
  replacedBy?: string;       // new ID if completely replaced

  // Body
  title: string;
  body: string;
  // ... rest of content
}

interface UserProgress {
  userId: string;
  contentId: string;
  contentVersion: number;    // which version they completed
  completedAt: number;
  score?: number;
  // If contentVersion < current → show "updated since you saw it" badge
  // If contentVersion replaced → trigger re-completion if substantial change
}
```

Migration policy:
- **Minor edit** (typo, clarification) → bump version, no re-completion needed
- **Major edit** (changed answer key, new concept added) → require user to re-do
- **Removal** → mark deprecated, redirect to new ID

### Шаг 7 — COPPA compliance (если children <13)

US Children's Online Privacy Protection Act = strict for kids:

#### Mandatory requirements

1. **Parental consent BEFORE data collection**
   - Verifiable consent (email + credit card check OR signed form OR call)
   - Cannot proceed без consent
   - Easy revocation (parent dashboard)

2. **No behavioral advertising**
   - No third-party ad networks (AdSense, Mintegral, etc)
   - In-house ads only, не based on user behavior
   - No tracking pixels / analytics that profile

3. **Limited data collection**
   - Only what's strictly necessary для функция
   - No SSN, address, phone (unless parent provides for billing)
   - Photos only with explicit parental consent per upload

4. **No social features without supervision**
   - No public chat, public profiles, friend requests
   - No user-generated content visible to other kids
   - If multiplayer/social — moderated + approved by parent

5. **Parental dashboard**
   - View child's data
   - Export child's data
   - Delete child's account
   - Time limits / usage caps

```typescript
// src/compliance/coppa.ts

export function isCOPPAApplicable(targetAudience: AudienceConfig): boolean {
  return targetAudience.minAge < 13 ||
         targetAudience.kidsCategory === true;
}

export async function requireParentalConsent(userId: string): Promise<ConsentStatus> {
  const child = await childRepo.get(userId);
  if (!child.parentalConsent) {
    return { status: 'pending', method: 'email_with_credit_card' };
  }
  if (child.parentalConsent.revokedAt) {
    return { status: 'revoked', revokedAt: child.parentalConsent.revokedAt };
  }
  return { status: 'granted', grantedAt: child.parentalConsent.grantedAt };
}

// Block all data collection until consent granted
export async function gateDataCollection(userId: string, action: string): Promise<void> {
  if (!await isCOPPAApplicable(getAudienceConfig())) return;

  const consent = await requireParentalConsent(userId);
  if (consent.status !== 'granted') {
    throw new ConsentRequiredError(`Action ${action} blocked — parental consent ${consent.status}`);
  }
}
```

#### EU equivalent: GDPR-K

Children under 16 (varies by member state, can be lowered to 13 by national law). Similar parental consent requirements.

#### Russia ФЗ-152 + ФЗ-436

ФЗ-436 — "Information harmful to children". Apps for kids must:
- Age rating displayed
- No content unsuitable for age category
- Information about age rating service

### Шаг 8 — Assessment integrity (если testable)

For tests/quizzes that affect grades or certificates:

```typescript
interface TestSession {
  sessionId: string;
  userId: string;
  testId: string;
  startedAt: number;
  expiresAt: number;       // strict time limit
  questions: TestQuestion[];
  answers: Map<string, Answer>;
  flags: SessionFlag[];    // anti-cheat signals
}

// Anti-cheat measures (level depends on stakes):

// Low-stakes (practice quiz)
// - Random question order per session
// - Question variants (templates with parameters)

// Medium-stakes (homework)
// - All low-stakes
// - Time per question tracked
// - Tab switching detected (window.blur events)
// - Copy-paste blocked в answer fields
// - Single attempt or limited attempts

// High-stakes (exam, certificate)
// - All medium-stakes
// - Webcam proctoring (third-party service)
// - Browser lock-down mode
// - Plagiarism detection on essays (textual similarity)
// - Identity verification (photo ID + face match)
```

For Russia ЕГЭ-style: use established proctoring services, не roll your own.

### Шаг 9 — Generate `src/education/` structure

```
src/education/
├── pedagogy/
│   ├── bloom.ts              # BloomLevel enum + classifier
│   ├── progression.ts        # ProgressionCurve interface + implementations
│   └── mastery.ts            # per-skill mastery tracking
├── repetition/
│   ├── leitner.ts            # 5-box system
│   ├── sm2.ts                # SuperMemo SM-2 algorithm
│   ├── fsrs.ts               # FSRS modern algorithm
│   └── scheduler.ts          # picks which cards due today
├── content/
│   ├── versioning.ts         # ContentItem versions, migration
│   ├── deprecation.ts        # retirement workflow
│   └── adaptation.ts         # personalize content per user
├── assessment/
│   ├── test-session.ts       # session lifecycle
│   ├── anti-cheat.ts         # signals + detection
│   ├── grading.ts            # scoring + feedback
│   └── proctoring.ts         # (если used) third-party integration
├── compliance/
│   ├── coppa.ts              # parental consent flow
│   ├── gdpr-k.ts             # EU children's privacy
│   └── age-rating.ts         # content rating per region
├── multi-role/
│   ├── teacher-dashboard.tsx # class roster, progress, grading
│   ├── parent-portal.tsx     # child progress, controls
│   └── student-view.tsx      # main learning UI
└── analytics/
    ├── learning-metrics.ts   # mastery curves, time-on-task
    └── outcomes.ts           # completion, certification, retention
```

### Шаг 10 — Education-specific metrics

Beyond standard `$product-metrics` for apps:

| Metric | What | Target (varies by subcategory) |
|---|---|---|
| **Lesson completion rate** | % of started lessons finished | 65%+ для good курса |
| **Mastery rate** | % users reaching mastery threshold (80% accuracy) | 50%+ |
| **Retention curve at week 1, 4, 12** | Active learners over time | varies |
| **Time-on-task vs estimate** | actual time / estimated time | ratio 0.8-1.5 = ok |
| **Drop-off points** | которые lesson IDs lose users | identify + fix |
| **Daily streak** | consecutive days active | 30+ день = highly engaged |
| **Knowledge retention** | quiz score 30 days после first learn | 70%+ для real learning |

Track per cohort + per subcategory.

### Шаг 11 — Document

Save to `wiki/design/education-foundation.md`:

```markdown
# Education Foundation — {Project}

## Subcategory: {language learning / K-12 / etc.}
## Target audience age: {range}

## Pedagogy: Bloom's taxonomy distribution

[Beginner / Intermediate / Advanced module mix]

## Spaced repetition: {Leitner / SM-2 / FSRS}

## Progression curve

[difficulty as function of progress]

## Multi-role architecture

[student / teacher / admin / parent if applicable]

## Content versioning policy

[minor edit / major edit / removal rules]

## COPPA / GDPR-K compliance (если applicable)

[parental consent flow, allowed data, parent dashboard]

## Assessment integrity level

[low / medium / high stakes — corresponding measures]

## Education-specific metrics targets

[completion rate, mastery, retention]
```

## Common pitfalls

1. **All `remember` content** — facts dump. Lerne app не teaches понимание. Distribute across Bloom levels.

2. **No spaced repetition** — флешкарты без интервалов = краткосрочно. Implement Leitner minimum.

3. **COPPA blindness** — app launches in US с под-13 audience без parental consent → FTC fines, app store removal. Identify audience early.

4. **Hardcoded progression** — same difficulty curve для всех. Adapt based on individual mastery.

5. **No content versioning** — bug в test answer found, fix breaks 1000 users' history. Version from day 1.

6. **Assessment без anti-cheat для high-stakes** — certificate becomes worthless. Match anti-cheat level к stakes.

7. **Teacher dashboard как afterthought** — bolted-on instead of designed-in. School/class apps need это as primary architecture.

8. **Forgot parental controls** — kids' app без parent dashboard = lost market (parents won't buy).

9. **Too long lessons** — adults give up after 20 min, kids after 10. Microlearning principle: bite-size + completion sense.

10. **No knowledge retention testing** — completion tracked, retention not. User passed quiz Day 1, forgot Day 30 — your app doesn't notice. Periodic recall checks.

## Non-Negotiable

- [ ] Subcategory classified (children's / K-12 / language / adult / exam / etc.)
- [ ] Target audience age determined → COPPA applicability assessed
- [ ] Pedagogy framework chosen (Bloom level distribution per module)
- [ ] Spaced repetition algorithm implemented (Leitner / SM-2 / FSRS)
- [ ] Progression curve explicit (not implicit/random)
- [ ] Mastery tracking per skill
- [ ] Multi-role architecture if class-based (student / teacher / parent / admin)
- [ ] Content versioning strategy from day 1
- [ ] Assessment integrity level matches stakes
- [ ] If children <13: COPPA flow (parental consent + restricted tracking + parent dashboard)
- [ ] Education-specific metrics tracked (completion, mastery, retention at intervals)
- [ ] Document в `wiki/design/education-foundation.md`
- [ ] All strings через `t()` (i18n)
