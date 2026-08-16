---
name: app-onboarding-flow
kind: architectural
description: "Architectural skill — заложить onboarding flow с самого начала: empty states, first-run experience, feature discovery, sample data. Без него apps теряют 30-50% юзеров на первой…"
---

# App Onboarding Flow — снизить churn первой минуты

## Зачем

Industry data: **30-50% юзеров уходят** в первые 60 секунд если app feels empty или confusing. Apps критичнее games в этом — у games есть встроенный feedback loop ("я нажал — что-то происходит"), у apps — пустой экран без user input.

Onboarding — это не tutorial. Это **архитектурный pattern**:
1. Welcome screen (что это за приложение)
2. Permission requests (только то что нужно)
3. Sample data (или dataset import)
4. First win (минимальное действие → видимый результат)
5. Feature discovery (постепенно, не всё сразу)

Заложить это в архитектуру = ~1 день. Retrofit потом = переписать UI flow.

## Когда вызывать

- **New apps**: после `$start` Step 6.5+ (i18n, data model) до first feature
- **Existing apps**: если analytics показывает D1 retention <30% — likely onboarding gap
- **Pivot**: если app меняет audience (B2C → B2B), onboarding нужен другой

## Pipeline

### Шаг 1 — Read context

```
wiki/_map.md                  # type, category
wiki/architecture/metrics.md  # D1 retention target
wiki/research/{Project}-references.md  # как у конкурентов
```

Бенчмарки D1 retention by category:
- Productivity: 50-70%
- Tools/reference: 30-50% (often single-use is OK)
- SaaS: 60-80% (paid trial period)
- Health: 40-60%
- Education: 50-70%

Если current/target D1 ниже benchmarka — onboarding фактор.

### Шаг 2 — Define onboarding strategy

3 levels of onboarding sophistication:

#### Level 1: Minimal (для tools/utility apps)

- Welcome screen 1 слайд → "Get started"
- Empty state с примером действия
- Tooltip on first action

Good for: calculator, converter, simple reference apps.

#### Level 2: Guided (для productivity/business)

- Welcome screen 2-3 слайда (что это, value prop, "Get started")
- Permission ask только при первом use (geolocation, notifications)
- Sample data (или import option)
- Progressive disclosure (сначала основная функция, потом advanced features unlock через 3 sessions)
- Feature spotlight (highlights for new features)

Good for: task managers, note apps, CRM, dashboards.

#### Level 3: Personalized (для SaaS/health/education)

- Welcome screen с questions (use case, goals, level)
- Personalized setup based on answers
- Goal-setting flow
- Reminder/notification preferences early
- First-week milestones plan
- Re-engagement after Day 2 (push notification or email)

Good for: meditation apps, habit trackers, learning platforms, complex SaaS.

### Шаг 3 — Define screen flow

For chosen level, generate flow:

```
[App opens for first time] -- localStorage.firstRun is null
  ↓
[Welcome 1: "Что это"] - illustration + 1 sentence about value
  ↓
[Welcome 2: "Как это работает"] - 1-3 key features with icons
  ↓
[Welcome 3 / Permission ask] - "We need X to do Y. [Allow] [Skip]"
  ↓ (skip OK — graceful degradation)
[Sample data / Empty state with example]
  ↓
[First action prompt] - inline coachmark "Tap here to add your first task"
  ↓
[Empty list now has 1 item — first win]
  ↓
[Set localStorage.firstRun = true]
  ↓
[Normal flow]
```

### Шаг 4 — Generate `src/onboarding/` structure

```
src/onboarding/
├── index.ts            # Public API: startOnboarding(), isOnboardingComplete()
├── steps/
│   ├── welcome.ts      # Component for welcome screens
│   ├── permissions.ts  # Permission ask logic
│   ├── sample-data.ts  # Sample data generator
│   └── first-action.ts # Coachmark over first action
├── state.ts            # Onboarding state management
├── analytics.ts        # Track step completions for funnel analysis
└── types.ts
```

### Шаг 5 — Empty states pattern

**Empty state ≠ нет данных = пустой экран**. Empty state = guidance + action.

For each list/dataset in app, define empty state:

```typescript
interface EmptyState {
  illustration?: string;  // SVG or emoji fallback
  title: string;          // "У тебя ещё нет задач"
  description: string;    // "Создай первую задачу чтобы начать"
  action: {
    label: string;        // "Создать задачу"
    onClick: () => void;
  };
  secondaryAction?: {     // "Посмотреть пример"
    label: string;
    onClick: () => void;
  };
}
```

Each entity in app = its own empty state. Document in `wiki/design/empty-states.md`.

### Шаг 6 — Permission asks

Critical pattern: **never ask permissions on app open**. Ask ПРИ ПЕРВОМ use:

```
User taps "Set reminder" button
  → "We need notification permission for reminders. [Allow] [Skip]"
  → If [Allow]: ask system permission, then proceed
  → If [Skip]: explain что reminder won't work, offer manual fallback
```

System permissions (mobile):
- Notifications — only ask when user wants to set reminder
- Location — only ask when user wants location-based feature
- Camera — only ask when user wants to take photo
- Storage — only ask when user wants to save file outside app

Web permissions:
- Notifications — same pattern
- Geolocation — same pattern

### Шаг 7 — Document the flow

Save to `wiki/design/onboarding.md`:

```markdown
# Onboarding Flow — {Project}

## Strategy: Level {1/2/3} ({Minimal/Guided/Personalized})

## Target metrics

- D1 retention: target {X}% (industry: {Y}%)
- Onboarding completion rate: target 70%+
- Time to first action: target <60 seconds

## Flow

[diagram or step list]

## Empty states inventory

| Screen | Empty title | Empty description | Action | Secondary |
|---|---|---|---|---|
| Tasks list | "Нет задач" | "Добавь первую задачу" | "Добавить" | "Импортировать из CSV" |
| ... |

## Permission requests

| Permission | When asked | If denied (graceful) |
|---|---|---|
| Notifications | After user sets first reminder | Show in-app banner reminder |
| Geolocation | After user taps "Find nearby" | Manual address entry |
| ... |

## Re-engagement (optional, Level 3 only)

- Day 1 evening: push notification "Готов начать?"
- Day 3: email with progress summary (if signed up)
- Day 7: feature spotlight (new feature)
```

## Common pitfalls

1. **All-permissions-on-open** — пугает юзера, иногда вызывает immediate uninstall. Wait for context.

2. **No empty states** — экран `[]` = "сломалось?". Always have helpful empty state.

3. **Tutorial вместо onboarding** — tutorial = "вот 10 features, запомни". Onboarding = "вот один use case, попробуй". Tutorial usually skipped.

4. **Onboarding длинный** — >3 welcome screens = drop-off. Cut ruthlessly.

5. **Sample data slap** — random sample data confuses ("это мои данные?"). Either clear sample marker or skippable import flow.

6. **Forget about returning users** — flag firstRun = true означает что новые user'ы получают onboarding. Но что про users которые сменили device? Cloud sync detection: "Возвращайся, у нас есть твои данные с другого устройства?"

7. **Hardcoded English** — onboarding strings оборачивай через `t()` (см. `$i18n-foundation`). Иначе при добавлении языков retrofit.

## Non-Negotiable

- [ ] Choose Level 1/2/3 based on category and metrics target
- [ ] Document flow in `wiki/design/onboarding.md`
- [ ] Empty state для каждого list/dataset в app
- [ ] Permissions asked ПРИ first use, не на open
- [ ] Graceful degradation если permission denied
- [ ] All strings через `t()` (i18n)
- [ ] localStorage flag `firstRun` to skip onboarding for returning users
- [ ] Analytics events for funnel analysis (welcome_seen, permission_granted, first_action_completed)
- [ ] First win achievable in <60 seconds
