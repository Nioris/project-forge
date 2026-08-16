---
name: subscription-design
kind: architectural
description: "Subscription monetization design — tiers, pricing, trial, paywall placement, churn prevention. Для apps это IS monetization (vs F2P+IAP в games). Без правильного дизайна…"
---

# Subscription Design — главный monetization pattern для apps

## Зачем

Apps монетизируются принципиально иначе чем games:
- Games: F2P + IAP + ads (transactional, per-session)
- Apps: subscription (recurring, lifetime value)

Subscription дизайн = архитектурное решение. Влияет на:
- Data model (Account, Subscription, Plan, Invoice)
- UI (paywall placement, trial flow, billing screens)
- Backend (Stripe/payment integration, webhook handling)
- Notifications (renewal reminder, payment failed, cancellation flow)
- Compliance (recurring billing rules, EU consumer rights, RUS-152)

Это **architectural skill** ([[decisions/010-architectural-vs-tactical-skills]]). Закладывать ДО написания premium features.

## Когда вызывать

- **SaaS apps** — обязательно
- **Productivity apps с premium tier** — обязательно
- **Health / Education / Finance apps с premium** — обязательно
- **Tools / reference apps** — рассмотреть (часто one-time IAP лучше)
- **Social apps** — обычно не нужно (ads instead)

Не вызывать если:
- Free-only app (ads only or donation-based)
- One-time purchase (used to be paid app — `$monetization-design` underself)

## Pipeline

### Шаг 1 — Read context

```
wiki/_map.md                      # category, target audience
wiki/architecture/metrics.md      # ARPU target, conversion target
wiki/research/{Project}-references.md  # competitors' pricing
```

### Шаг 2 — Choose subscription model

5 моделей:

#### Model 1: Freemium with feature gating

```
Free tier:
  - Basic features
  - Limited usage (5 projects, 50 tasks)
  - No advanced features

Premium ($X/month):
  - Unlimited
  - Advanced features (filters, export, integrations)
  - Priority support
```

Good for: productivity, tools, education.

#### Model 2: Free trial → paid

```
Free trial: 7-30 days, full access, no card required (или с card optional)

After trial: paid plan starts (auto-charge if card given) OR locked features
```

Good for: SaaS, business apps, B2B.

#### Model 3: Tiered (Free / Pro / Team / Enterprise)

```
Free       — limited individual use
Pro $X     — full individual features
Team $Y/seat — multi-user, collaboration features
Enterprise — custom pricing, SSO, SLA
```

Good for: SaaS targeting B2B + B2C, business apps.

#### Model 4: Usage-based

```
$X per Y events/units used
e.g.: $0.10 per API call
or:   $5 base + $0.50 per active user
```

Good for: API/dev tools, marketing platforms, enterprise SaaS.

#### Model 5: One-time + premium add-on

```
App is free + ads, OR $X one-time purchase ad-free
Premium subscription unlocks specific advanced features
```

Good for: utility apps, niche tools.

### Шаг 3 — Define tiers

For chosen model, define specific tiers:

```
| Tier | Price | Features | Limits | Target customer |
|---|---|---|---|---|
| Free | $0 | Basic | 5 projects, 50 tasks | Trial users, students |
| Pro | $9.99/mo | All features + sync | Unlimited | Individual professionals |
| Team | $5/seat/mo | Pro + collaboration | Per-org limits | Small teams (5-50) |
| Enterprise | Contact us | Team + SSO + SLA + dedicated support | Custom | Companies (50+) |
```

Pricing rules of thumb:
- **$ X.99 perception** — $9.99 feels less than $10
- **Annual discount 20%** — $9.99/mo or $95.99/yr (saves $24)
- **Team multiplier** — per-seat usually 50-70% of individual price
- **Enterprise = "contact sales"** — don't show price, qualify leads

### Шаг 4 — Trial design

Critical decisions:

#### How long?

| Use case | Trial length |
|---|---|
| Simple tool | 7 days |
| Productivity | 14 days |
| B2B SaaS | 14-30 days |
| Complex enterprise | 30+ days |

#### Card upfront or no?

```
[A] No card required for trial
    Pro: more signups (3-5x), low friction
    Con: lower conversion (1-3%), more "tire kickers"
    Best for: B2C, productivity apps

[B] Card required, auto-convert
    Pro: higher conversion (15-25%), serious users
    Con: fewer signups, "trick to charge me" feeling
    Best for: B2B SaaS, enterprise

[C] Hybrid: optional card for "extended trial"
    Trial 7 days no card, +14 days with card
    Pro: balance both worlds
    Con: more complex
```

Default for B2C: A. Для B2B: B.

#### Trial ending flow

Day -3: notification "Trial ends in 3 days"
Day -1: notification "Trial ends tomorrow. Subscribe to keep your data accessible"
Day 0: trial ends → paywall on next interaction
Day +7: data still accessible read-only, "subscribe to edit"
Day +30: data archived (recoverable)
Day +90: data deleted (after warning)

### Шаг 5 — Paywall placement

Where + when to show paywall:

#### Strategic paywalls (preferred)

- **Feature gate**: user clicks premium feature → "This is a Pro feature [Upgrade]"
- **Limit reached**: user hits free limit → "5/5 projects used [Upgrade for unlimited]"
- **Time-based**: trial ended → "Trial ended [Subscribe]"
- **Value moment**: after first win/aha-moment → "Love this? Get more with Pro [Try free]"

#### Anti-patterns (avoid)

- **Open-app paywall** — kills D1 retention
- **Spam paywalls** — every other action shows upgrade prompt
- **Hidden paywalls** — feature looks free until last step

### Шаг 6 — Generate `src/subscription/` structure

```
src/subscription/
├── index.ts          # Public API: getCurrentPlan(), canUseFeature(), upgradeUrl()
├── tiers.ts          # TIER definitions (free, pro, team, enterprise)
├── feature-gates.ts  # FEATURE_FLAGS by tier
├── trial.ts          # Trial state, days remaining, expiration
├── billing.ts        # Stripe / payment provider integration
├── webhooks.ts       # Payment provider webhook handlers
└── ui/
    ├── paywall.ts        # Paywall component
    ├── pricing-page.ts   # Pricing comparison table
    ├── billing-page.ts   # Manage subscription, invoices
    └── upgrade-prompt.ts # Inline upgrade CTAs
```

Core API:

```typescript
// src/subscription/index.ts
export function canUseFeature(user: User, feature: string): boolean {
  const tier = getCurrentTier(user);
  return TIER_FEATURES[tier].includes(feature);
}

export function getRemainingLimit(user: User, resource: string): number {
  const tier = getCurrentTier(user);
  const limit = TIER_LIMITS[tier][resource] ?? Infinity;
  const used = countUsage(user, resource);
  return Math.max(0, limit - used);
}

export function showPaywall(reason: 'feature' | 'limit' | 'trial_ended', context?: any) {
  // Track analytics
  analytics.track('paywall_shown', { reason, context });
  // Render paywall UI
  renderPaywall(reason, context);
}
```

Usage everywhere:

```typescript
// In UI
if (canUseFeature(user, 'export_pdf')) {
  showExportButton();
} else {
  showUpgradeBadge();
}

// On user action
if (!canUseFeature(user, 'unlimited_projects')) {
  if (getRemainingLimit(user, 'projects') === 0) {
    showPaywall('limit', { resource: 'projects' });
    return;
  }
}
createProject();
```

### Шаг 7 — Churn prevention

3 layers:

#### Pre-cancellation
- "Pause subscription" option (1-3 months)
- Downgrade option (full → cheaper plan instead of cancel)
- "What's not working?" survey

#### At cancellation
- Win-back offer (30% off for 3 months)
- Acknowledge reason from survey
- Confirm cancellation explicit (don't auto-cancel)

#### Post-cancellation
- Email after 30 days with win-back offer
- Email after 90 days "we miss you" with new features
- Keep data accessible read-only for 30+ days

### Шаг 8 — Compliance

#### EU Consumer Protection

- 14-day cooling-off period (cancel within 14 days of purchase, full refund)
- Clear pricing (incl VAT)
- Easy cancellation (one-click, no phone calls required)

#### Russian RUS-152 (personal data)

- Data localization for Russian users (servers in RU)
- Privacy policy in Russian
- Right to deletion clear

#### Stripe / payment provider rules

- Recurring billing: explicit consent
- Free trial: clear terms (when charged, how much)
- Failed payment: retry policy + grace period

### Шаг 9 — Document

Save to `wiki/design/subscription.md`:

```markdown
# Subscription Design — {Project}

## Model: Freemium with feature gating + Annual discount

## Tiers

[the table from Step 3]

## Trial: 14 days, no card required, soft data lock after expiration

## Paywall placement

| Trigger | UI | Conversion target |
|---|---|---|
| Click "Export to PDF" | Modal "Pro feature [Try free]" | 15% |
| Hit project limit | Inline banner "5/5 used [Upgrade]" | 25% |
| Trial Day 13 | Email "Trial ending tomorrow" | 30% |
| Trial Day 0 | Full-screen paywall on next action | 40% |

## Feature gates (free → pro)

| Feature | Free | Pro |
|---|---|---|
| Projects | 5 max | Unlimited |
| Tasks per project | 50 | Unlimited |
| Sync to cloud | — | ✓ |
| Export PDF/CSV | — | ✓ |
| Custom themes | — | ✓ |
| Priority support | — | ✓ |

## Churn prevention

- Pause: 1-3 months
- Downgrade: yes
- Win-back: 30% for 3 months at cancellation
- Email: 30/90 days after cancellation

## Analytics events

- `paywall_shown` — trigger, reason
- `pricing_page_viewed` — referrer
- `trial_started` — plan
- `trial_ending_soon` — days_remaining
- `trial_converted` — plan
- `subscription_canceled` — reason, lifetime_value
- `subscription_paused` — duration
- `winback_clicked` — offer
```

## Integration с другими skills

| Skill | Что делает с subscription info |
|---|---|
| `$app-data-model` | Account + Subscription entities |
| `$app-permissions` | role: 'free' vs 'pro' affects what user can do |
| `$app-onboarding-flow` | First-run experience differs for trial vs paid |
| `$product-metrics` | Conversion + churn = key KPIs |
| `$release-ready` | Verify pricing displayed correctly per platform/region |

## Common pitfalls

1. **Pricing changes after launch** — moving Free Pro from $9.99 to $14.99 enrages existing users. Add price grandfathering (existing users keep old price).

2. **No usage analytics on free tier** — can't see what features convert. Track usage per feature for free users — inform paywall placement.

3. **Hidden cancellation** — users who can't find cancel button file chargebacks. One-click cancel is industry standard. Hide it = chargeback risk.

4. **Trial without expiration warning** — silent auto-charge = chargebacks + churn. Always email Day -3 + Day -1.

5. **No grace period on payment failure** — card expired → instant lockout = lost customer. 7-day grace minimum, 14 days better.

6. **Dark patterns at cancellation** — "are you sure" 5 times, hide the cancel button. Backfires through reviews and word-of-mouth.

7. **Single tier ($X/month or nothing)** — leaves money on table. Have at least free + paid + annual.

## Non-Negotiable

- [ ] Choose model (freemium / trial / tiered / usage / hybrid)
- [ ] Define tiers с pricing, features, limits
- [ ] Trial design (length, card requirement, expiration flow)
- [ ] Paywall placement strategy (feature gate / limit / trial ended)
- [ ] Churn prevention (pause, downgrade, win-back)
- [ ] EU compliance (14-day cooling-off, easy cancellation)
- [ ] Pricing displayed in user's currency where possible
- [ ] Analytics events для funnel
- [ ] Document в `wiki/design/subscription.md`
- [ ] Grace period on payment failure (7-14 days)
- [ ] Price grandfathering policy for existing users
