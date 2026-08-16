# App UI Patterns Reference

> Reference база паттернов для разных категорий приложений. Используется skills `/info-hierarchy`, `/layout-system`, `/ui-review` для **категоро-специфических** decisions.
>
> Источники: Material Design 3, Apple HIG, Mobbin (10000+ apps), SaaSFrame (5000+ dashboards), Carbon Design System, Atlassian Design.

## Категории apps + их dominant patterns

| Категория | Primary task | Layout pattern | Density | Example apps |
|---|---|---|---|---|
| **Productivity** | Manage items (tasks, notes, files) | Sidebar + content | Default | Linear, Notion, Asana |
| **Health/wellness** | Track + log + reminders | Bottom-nav + cards | Sparse | Apple Health, MyFitnessPal |
| **Finance** | Show balance + transactions + actions | Top summary + list | Dense | Stripe, банковские apps |
| **Social** | Feed + profile + interactions | Bottom-nav + feed | Default | Instagram, Twitter |
| **Tools/reference** | Search + read | Search-first + content | Default | Wikipedia, Stack Overflow |
| **SaaS/dashboard** | Monitor metrics + take actions | Sidebar + KPI grid | Dense | Linear, Stripe, Grafana |
| **Education** | Learn + practice + progress | Lesson nav + content | Default | Duolingo, Khan Academy |
| **Communication** | Send/receive messages | List + thread | Dense | Slack, Telegram |
| **Media/entertainment** | Browse + consume | Hero + grid | Sparse | Netflix, Spotify |
| **E-commerce** | Browse + cart + checkout | Grid + filter + actions | Default | Amazon, Shopify storefronts |

## Navigation patterns по screen size

Из Material Design 3 (data-backed thresholds):

### Mobile (<600dp) — Bottom Nav

```
┌────────────────┐
│                │
│                │
│   CONTENT      │
│                │
│                │
│                │
├────────────────┤
│ 🏠  🔍  +  ❤  👤│  ← bottom nav, 3-5 items
└────────────────┘
```

- **3-5 destinations** (если 6+ — use drawer)
- Icon + label, или icon-only после первой недели use
- **Active state:** color + filled icon
- **Sticky** — never scrolls away
- Height: 56-80dp depending on safe area

### Tablet / medium (600-840dp) — Navigation Rail

```
┌──┬─────────────┐
│🏠│             │
│🔍│             │
│ +│   CONTENT   │
│❤ │             │
│👤│             │
└──┴─────────────┘
```

- Vertical strip on **leading edge** (left for LTR)
- Width: 80dp
- 3-7 destinations + optional FAB
- Selected: filled icon + indicator pill

### Desktop (840+dp) — Navigation Drawer / Sidebar

```
┌────────┬──────────────────┐
│ 🏠 Home │                  │
│ 🔍 Search│                 │
│ + Create │                 │
│ ❤ Saved │   CONTENT        │
│ 👤 Profile│                │
│         │                  │
│  ─────  │                  │
│ ⚙ Settings                 │
└────────┴──────────────────┘
```

- **240-280dp width** (256dp Tailwind default)
- 64-72dp collapsed (icon-only mode)
- 7+ destinations OK
- **Categorize** — group with dividers

### Web SaaS specifically

Из SaaSFrame analysis 5000+ dashboards (2026):
- **Sidebar wins over top nav** for SaaS — vertical scaling for sub-modules
- 240-280px expanded, 64-72px collapsed
- Below 240px — labels truncate ("Integrations", "Notifications")
- Above 300px — steals content space на 1366px laptops (22.4% of users)

## Dashboard patterns

### F-pattern layout (eye-tracking research backed)

```
┌────────────────────────────────────┐
│ [PRIMARY KPI]  [KPI 2]  [KPI 3]   │  ← top row: 3-5 metrics
├────────────────────────────────────┤
│ [Trend chart]      │ [Activity]    │
│                    │               │
│                    │               │
├────────────────────┤               │
│ [Secondary metric] │               │
└────────────────────────────────────┘
```

- **Top-left = most critical metric** (eyes go here first)
- Top row = 3-5 KPIs ("Is everything okay?" answers)
- Left column = secondary priorities
- Right column / bottom = drill-downs, details

### Dashboard types

| Type | Purpose | Density | Refresh | Example |
|---|---|---|---|---|
| **Strategic** | Executive overview, big picture | Sparse — big numbers, minimal clutter | Daily/weekly | Revenue dashboard |
| **Operational** | Day-to-day monitoring | Dense — many metrics, real-time | Live (5-30s) | Server monitoring, Stripe |
| **Analytical** | Deep dive, exploration | Default — filters + drill-downs | On-demand | GA, Mixpanel |
| **Tactical** | Specific decision support | Default | Hourly | Marketing campaign tracker |

**Match density к use frequency:**
- Used daily → can be dense, user knows layout
- Used weekly → medium density, label everything
- Used monthly+ → sparse, with re-orientation tooltips ("you're seeing March data")

### Color coding (data-backed)

- **Red** — alerts/critical only (don't dilute)
- **Green** — positive trends, success
- **Blue** — most critical KPIs (без trading-terminal vibe)
- **Orange** — negative trends (alternative к red)
- **Gray** — neutral metadata

**Avoid rainbow palette** — Stripe, Linear, GitHub все используют neutral base + 1-2 accents.

## Form patterns

### Single-column wins (Luke Wroblewski research)

```
┌──────────────────┐
│ Name *           │
│ [____________]   │
│                  │
│ Email *          │
│ [____________]   │
│                  │
│ Password *       │
│ [____________]   │
│                  │
│ [SUBMIT]         │
└──────────────────┘
```

- **Single column** for всё кроме paired fields (City + State, First + Last name)
- **Labels above** fields (no inside placeholder labels — disappear on focus)
- **Asterisk for required**, "(optional)" for non-required (consistent)
- **Inline validation on blur** (after user leaves field) — 22% completion increase, 22% fewer errors

### Multi-step forms

- **4-7 steps maximum** (more = abandon)
- **Progress indicator** (filled/total dots, или "Step 2 of 5")
- **Allow back navigation** (мust)
- **Group related fields** per step
- **Save progress** between steps

### Error messages (NN/g best practices)

```
✗ Invalid input
✗ Error: 1052
✓ Email must contain @ symbol (e.g., name@example.com)
✓ Password needs at least 8 characters and 1 number
```

- **Inline near field** (not summary at top)
- **Specific** what's wrong + how to fix
- **Plain language** (no error codes)
- **Real-time for complex fields** (passwords show strength meter as typing)
- **Polite** ("almost there" not "WRONG")

## Data display patterns

### Tables

```
┌────────┬──────────┬──────────┬─────┐
│ Name ↓ │ Status   │ Updated  │ ... │
├────────┼──────────┼──────────┼─────┤
│ Alpha  │ ● Active │ 2h ago   │ ... │
│ Beta   │ ◌ Idle   │ 1d ago   │ ... │
│ Gamma  │ ✗ Failed │ 5d ago   │ ... │
└────────┴──────────┴──────────┴─────┘
```

- **Sortable headers** (click to sort)
- **Status indicators** color + icon (not color alone — accessibility)
- **Relative time** ("2h ago" not "2026-05-03 14:32") for activity tables
- **Pagination** at 25-50 rows (mobile: 10-20)
- **Sticky header** on scroll

### Lists (mobile-friendly)

```
┌─────────────────────────────┐
│ [icon] Item Name            │
│        Subtitle / metadata  │
│                          ›  │  ← chevron = drilldown
├─────────────────────────────┤
│ [icon] Another Item         │
│        Sub                  │
│                          ›  │
└─────────────────────────────┘
```

- **Item height ≥ 44dp** for touch
- **Leading icon** для visual scanning
- **Two-line max** для дефолта (title + subtitle)
- **Trailing element** = action affordance (›, ✓, action button)

### Cards

- **All cards same height** within row (alignment broken otherwise — observable bug в Genetic Lab)
- **Min content** иначе "blank card" feel
- **Density consistent** в пределах region — не мешай sparse marketing cards с dense data cards

## Empty / Loading / Error states

**Mandatory для каждого data-bound component.** Не optional.

### Empty states (3 types)

```
A. INFORMATIVE — "Nothing here yet"
┌────────────────────┐
│                    │
│      📭            │
│                    │
│  No notifications  │
│   yet.             │
│                    │
└────────────────────┘

B. ACTION-FOCUSED — "Do this to populate"
┌────────────────────┐
│                    │
│      📝            │
│                    │
│  Create your first │
│  task to get going │
│                    │
│  [+ NEW TASK]      │
│                    │
└────────────────────┘

C. CELEBRATORY — "All done!"
┌────────────────────┐
│                    │
│      ✨ 🎉         │
│                    │
│   All caught up!   │
│   Inbox zero       │
│                    │
└────────────────────┘
```

**Pick based on context:**
- First-time use → action-focused (most important)
- Search no-results → informative + suggest filters
- Cleared inbox → celebratory

### Loading states (3 patterns)

**A. Skeleton (preferred)** — placeholders match final layout shape:
```
┌──────────────────────┐
│ ▒▒▒▒▒▒▒              │  ← title placeholder
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒       │  ← subtitle
│ ▒▒▒▒                 │  ← metadata
└──────────────────────┘
```

**B. Spinner** — small, transient operations only (<3s)
**C. Progress bar** — known duration, multi-step

**Rules:**
- Skeleton **after 200ms** delay (faster feels janky)
- Spinner only if duration < 3s
- Progress bar if > 3s and steps countable
- **Never** spinner for full-page loads — use skeleton

### Error states

```
┌─────────────────────────┐
│  ⚠ Something went wrong │
│                         │
│  We couldn't load your  │
│  data. Check connection │
│  and try again.         │
│                         │
│  [TRY AGAIN]  [SUPPORT] │
└─────────────────────────┘
```

- **What happened** + **what to do**
- **Recovery action** prominent
- **Don't blame user** ("you entered wrong" → "we couldn't process this")
- **No tech jargon** ("Error 500" → "Server unavailable, retry shortly")

## Onboarding patterns

3 approaches, choose based on app complexity:

### A. Guided walkthrough (high complexity)
- Linear steps, blocking
- Coach marks pointing к UI elements
- 3-5 steps max
- Skippable (not forcible)

### B. Progressive disclosure (medium)
- Empty states with CTAs guide
- Tooltips on first interaction
- Reveals features as needed

### C. Sample data (low)
- App opens **with example content**
- "Reset" option clear
- User explores, edits, learns

**Health/finance apps** — sometimes need verification first (KYC), but **never demand all info upfront**. Progressive registration wins (email → action → "now add phone for X").

## Touch targets / accessibility

| Standard | Target size | Spacing |
|---|---|---|
| iOS HIG | 44×44pt | 8pt min |
| Material Design | 48×48dp | 8dp min |
| WCAG 2.1 AA | 44×44 CSS px | 8px min |

**Не делай меньше**. Тоже **не больше 64dp** (тогда target невыглядит как target).

### Contrast (WCAG)

- Body text: 4.5:1 minimum
- Large text (18pt+): 3:1
- Decorative elements: no requirement

**Tertiary tier на белом #999** — NOT enough contrast. Use #757575 minimum.

## Common app anti-patterns

1. **Bottom nav with >5 items** — overflow into "more" hides functionality
2. **Hamburger as primary nav** — hides important destinations
3. **Modal hell** — modal в modal в modal. Max 1 deep.
4. **Floating action button at scale** — FAB in lists works; FAB in dashboards confuses
5. **Auto-rotating hero carousel** — hostile, hard to read at user pace
6. **Date picker without keyboard input** — types faster than tap-tap-tap
7. **Cards with click events on phantom areas** — entire card clickable but only icon highlights
8. **Sidebar collapsing on hover** — accidental triggers
9. **Search hidden in menu** — should be top, persistent

## Category-specific decisions

### Health/wellness apps
- **Big "Today" view** — what user did, what's next
- **Streak indicator** — habit reinforcement
- **Visual graph trends** > raw numbers
- **Reminder bell с badge count** prominent
- **Add-entry CTA** floating, always reachable

### Finance apps
- **Balance top, prominent** — primary "is my money safe?"
- **Recent transactions** dense list, scrollable
- **Action shortcuts** (Send / Receive / Pay) below balance
- **Hide sensitive data** option (eye icon to mask)
- **Confirm всё что меняет деньги** — modal с amount restated

### Social apps
- **Feed dominant** — 80%+ real estate
- **Top: profile/notifications**
- **Bottom: nav (Home/Search/Create/Activity/Profile)**
- **Compose = floating action button** (FAB) bottom-right

### Tools/reference
- **Search at top, persistent**
- **Recent searches** dropdown
- **Filters as chips** (removable, visible)
- **Result count** "47 results"
- **Empty search** = suggestions, not blank

### SaaS/B2B
- **Sidebar nav** (240-280px)
- **Workspace switcher** top-left if multi-workspace
- **User menu** top-right
- **Notifications** top-right (badge)
- **Dense data tables** (lots per screen)
- **Keyboard shortcuts** (Cmd+K command palette is gold standard)

## How to use в skills

`/info-hierarchy`:
- Determine category → use that pattern's tier mapping
- Default Tier 1 for category (e.g. Health = "Today's status")

`/layout-system`:
- Pick navigation per screen size from table above
- Apply density per category default

`/ui-review`:
- Compare against category anti-patterns list
- Flag deviations from category dominant pattern
- Specifically: dashboard без F-pattern? Form 8+ steps? Bottom nav 7 items?
