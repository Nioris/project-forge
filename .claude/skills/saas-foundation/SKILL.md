---
name: saas-foundation
kind: architectural
description: "Architectural foundation для SaaS apps. Поверх business-app-foundation + subscription-design добавляет: trial→paid conversion flow, admin panel, billing webhook handlers, plan upgrade/downgrade flows, dunning (failed payments), customer success metrics, churn analytics dashboard, in-product growth (referrals, viral loops). Triggers on: SaaS, subscription business, B2B SaaS, freemium SaaS, ARR, MRR, trial conversion, churn, admin panel, billing, dunning."
---

# SaaS Foundation — full SaaS platform architecture

## Зачем

SaaS — комбинация всего сложного из business + subscription + analytics. Что делает SaaS особенным:

| Aspect | Generic B2B | SaaS specifically |
|---|---|---|
| Pricing | Often one-time / per-seat license | Recurring (MRR/ARR mindset) |
| Onboarding | Sales-led | Product-led (self-serve trial → paid) |
| Customer success | Account managers | Automated workflows + signals |
| Metrics | Generic business | MRR, ARR, NDR, gross/net churn, LTV, CAC, magic number |
| Billing | Invoice-based | Automated subscriptions с dunning |
| Growth | Direct sales | Product-led growth, viral loops, referrals |
| Admin | Internal tools | Full-fledged admin panel for support |

`/subscription-design` (Iteration 1) дал basic subscription. SaaS добавляет:
- Self-serve **trial → paid conversion flow** (не просто "click upgrade")
- **Admin panel** for support team (impersonate, refund, override limits)
- **Billing infrastructure** (Stripe webhooks, dunning, proration)
- **Customer health scores** (predict churn before it happens)
- **Growth loops** (referrals, viral, network effects)

## Когда вызывать

После:
- `/i18n-foundation`
- `/app-data-model` — entities (расширяется billing entities)
- `/app-permissions` — RBAC
- `/business-app-foundation` — multi-tenant + workflows
- `/subscription-design` — basic subscription

Trigger: category=saas в `/start` или явный запрос "SaaS платформа".

## Pipeline

### Шаг 1 — Read context

```
wiki/_map.md                              # category=saas
wiki/architecture/data-model.md           # accounts, subscriptions
wiki/architecture/metrics.md              # SaaS KPIs (MRR, churn target)
wiki/design/subscription.md               # tiers, pricing
wiki/design/business-foundation.md        # multi-tenancy
```

### Шаг 2 — SaaS metric system

SaaS KPIs более сложные чем consumer apps:

```
MRR  (Monthly Recurring Revenue)  = sum of all monthly subscription value
ARR  (Annual Recurring Revenue)   = MRR × 12

Gross Churn  = (cancelled MRR / MRR start of period) × 100
Net Churn    = ((cancelled - upgrades - new) / MRR start) × 100
NDR          = ((MRR end - new) / MRR start) × 100  [Net Dollar Retention]
NRR target   = >100% (expansion > churn = healthy SaaS)

LTV  (Lifetime Value)  = ARPU × (1 / monthly_churn)
CAC  (Customer Acquisition Cost)  = sales+marketing / new customers
LTV/CAC ratio = >3 healthy

Trial→Paid conversion = (paid users from trial) / (trials started)
Magic Number = (MRR new from quarter × 4) / (sales+marketing prev quarter)
              >0.75 = good, >1.5 = great
```

Generate dashboard component:

```
src/saas/metrics/
├── mrr-calculator.ts        # rolling MRR per month
├── churn-analyzer.ts        # gross + net churn
├── cohort-retention.ts      # by signup month
├── conversion-funnel.ts     # trial → paid stages
└── dashboard.tsx            # admin view of all metrics
```

### Шаг 3 — Self-serve trial → paid flow

Critical SaaS flow. Без правильного UX trial→paid падает с 15% до 3%:

```
Stage 1: Sign up → trial active
  → [Setup wizard] (5 minutes max)
  → [Quick win demo] (use one feature successfully)
  → [Email day 0]: "Welcome, here's how to get started"

Stage 2: Activation (within 24-72 hours)
  Goal: User reaches "aha moment" (different per product)
  → Track activation events
  → If not activated by day 3: trigger "stuck" workflow
       - Email "Need help? Watch this 2-min video"
       - In-app prompt offer demo call
  → If activated: track for paid conversion likelihood

Stage 3: Engaged usage (days 3-10)
  Goal: User integrates into daily workflow
  → Show advanced features progressively
  → Send case studies от похожих customers
  → Highlight ROI ("you saved X hours this week")

Stage 4: Trial ending (days 11-14, depends on trial length)
  → Day -3: email "Trial ending, here's what you've accomplished"
  → Day -1: in-app "Trial ends tomorrow"
  → Day 0: paywall с pricing
  → Day +3: "Last chance" with discount offer (if not converted)
  → Day +7: "Come back" with extended trial offer

Stage 5: Conversion or churn
  → If converted: send congrats + onboarding to paid features
  → If churned: exit interview ("what didn't work?")
       - 1-month follow-up "we've added X" if reasonable feedback
```

Implementation:

```typescript
// src/saas/lifecycle/trial-stages.ts

interface TrialStage {
  trialId: string;
  currentStage: 'signup' | 'activation' | 'engaged' | 'ending' | 'converted' | 'churned';
  activationEvents: string[];  // user actions counting toward "aha moment"
  activatedAt?: number;
  endsAt: number;
  remindersScheduled: ReminderSchedule[];
}

export async function advanceStage(trial: Trial, event: TrialEvent): Promise<TrialStage> {
  // State machine transitions trial through stages
  // Each transition triggers appropriate emails/in-app messages
}
```

### Шаг 4 — Admin panel (operational tool)

Customer support + ops team нужен внутренний интерфейс:

#### Features required for MVP admin

```
[Search] customer by email / org name / ID
  ↓
[Customer detail view]:
  - Account info (org, owner, plan)
  - Subscription status (active, trial, past_due, cancelled)
  - Recent activity timeline
  - Open support tickets
  - [Actions] dropdown:
      - Impersonate (login as user, with audit)
      - Override limit (e.g. allow 1 more project this month)
      - Refund (full / partial)
      - Comp / extend trial
      - Apply discount code
      - Cancel subscription
      - Delete account (GDPR)
      - Export data
```

```typescript
// src/saas/admin/impersonate.ts

// Important: impersonation MUST be audited and limited
export async function startImpersonation(
  adminUser: User,
  targetUser: User,
  reason: string
): Promise<ImpersonationSession> {
  // 1. Permission check
  if (!can(adminUser, 'impersonate', 'user', targetUser).allowed) {
    throw new ForbiddenError();
  }

  // 2. Audit (mandatory)
  await audit.log({
    type: 'admin_impersonation_start',
    adminId: adminUser.id,
    targetUserId: targetUser.id,
    reason,
    timestamp: Date.now(),
    ipAddress: getRequestIp(),
  });

  // 3. Notification to target user
  await notify(targetUser, {
    type: 'admin_accessed_account',
    adminName: adminUser.name,
    reason,
  });

  // 4. Time-limited session (1 hour max)
  return {
    sessionId: uuid(),
    expiresAt: Date.now() + 60 * 60 * 1000,
    adminId: adminUser.id,
    targetUserId: targetUser.id,
    visualMarker: true,  // banner "ADMIN MODE — viewing as X"
  };
}
```

Critical:
- Impersonation always audited
- User notified of impersonation
- Visual indicator visible during session
- Time-limited (auto-end after 1 hour)
- Read-only mode option for safer access

#### Admin metrics dashboard

```
Top-level metrics:
  - MRR (current, month-over-month, YoY)
  - Active subscriptions (by plan)
  - Trial conversion rate (rolling 30 days)
  - Churn rate (gross + net)
  - Recent signups
  - Tickets backlog
  - System health
```

### Шаг 5 — Billing infrastructure

#### Stripe webhook handlers

```typescript
// src/saas/billing/stripe-webhooks.ts

const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.payment_succeeded': handlePaymentSucceeded,
  'invoice.payment_failed': handlePaymentFailed,
  'customer.subscription.trial_will_end': handleTrialEndingSoon,
};

export async function handleStripeWebhook(payload: any, signature: string) {
  // Verify signature
  const event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);

  // Idempotency — check if we've processed this event
  if (await processedWebhooks.has(event.id)) return;

  const handler = WEBHOOK_HANDLERS[event.type];
  if (!handler) return;  // ignore unhandled events

  await handler(event.data.object);
  await processedWebhooks.add(event.id);
}

async function handlePaymentFailed(invoice: any) {
  const sub = await subscriptionRepo.findByStripeId(invoice.subscription);

  sub.status = 'past_due';
  sub.gracePeriodEndsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;  // 7 days
  await subscriptionRepo.save(sub);

  // Trigger dunning workflow
  await dunningQueue.start(sub.id);

  // Email customer
  await emails.send(sub.ownerId, 'payment_failed', {
    amount: invoice.amount_due,
    nextRetry: invoice.next_payment_attempt,
    updatePaymentUrl: getBillingPortalUrl(sub.customerId),
  });
}
```

#### Dunning (failed payment recovery)

```typescript
// src/saas/billing/dunning.ts

const DUNNING_SCHEDULE = [
  { day: 0, action: 'email_payment_failed' },
  { day: 3, action: 'email_reminder_friendly' },
  { day: 5, action: 'in_app_banner' },
  { day: 7, action: 'email_final_warning' },
  { day: 10, action: 'restrict_access' },
  { day: 14, action: 'cancel_subscription' },
];

export async function runDunningStep(subscriptionId: string) {
  const sub = await subscriptionRepo.get(subscriptionId);
  const daysSinceFailed = daysSince(sub.firstFailedAt);

  const step = DUNNING_SCHEDULE.find(s => s.day === daysSinceFailed);
  if (!step) return;

  await executeStep(step.action, sub);
}
```

#### Plan changes (upgrade / downgrade / proration)

```typescript
// src/saas/billing/plan-change.ts

export async function changePlan(
  orgId: string,
  newPlanId: string,
  options: { proration: 'immediate' | 'next_period' | 'create_credit' }
): Promise<PlanChangeResult> {
  const sub = await subscriptionRepo.getByOrg(orgId);
  const oldPlan = await planRepo.get(sub.planId);
  const newPlan = await planRepo.get(newPlanId);

  // Determine direction
  const isUpgrade = newPlan.priceMonthly > oldPlan.priceMonthly;

  if (isUpgrade && options.proration === 'immediate') {
    // Charge difference now
    const proratedAmount = computeProration(sub, oldPlan, newPlan);
    await stripe.invoices.create({
      customer: sub.stripeCustomerId,
      items: [{ amount: proratedAmount, description: `Upgrade to ${newPlan.name}` }],
    });
    // Update subscription immediately
    await stripe.subscriptions.update(sub.stripeId, {
      items: [{ id: sub.stripeItemId, price: newPlan.stripePriceId }],
    });
    sub.planId = newPlanId;
  } else if (!isUpgrade) {
    // Downgrade — schedule for next period
    sub.scheduledPlanChange = { newPlanId, effectiveAt: sub.currentPeriodEnd };
  }

  await subscriptionRepo.save(sub);
  await audit.log({ type: 'plan_change', orgId, oldPlan: oldPlan.id, newPlan: newPlan.id });

  return { success: true, effectiveAt: isUpgrade ? Date.now() : sub.currentPeriodEnd };
}
```

### Шаг 6 — Customer health score

Predict churn before it happens. Score-based approach:

```typescript
// src/saas/customer-success/health-score.ts

interface HealthSignals {
  // Engagement
  daysActive7d: number;        // 0-7
  daysActive30d: number;       // 0-30
  featureBreadth: number;      // % of features used

  // Adoption
  hasIntegrations: boolean;
  teamSize: number;
  dataVolume: number;          // records, bytes

  // Risk
  daysSinceLastActive: number;
  recentNegativeFeedback: boolean;
  supportTicketsOpen: number;
  paymentFailureCount: number;
}

export function computeHealthScore(signals: HealthSignals): {
  score: number;       // 0-100
  category: 'red' | 'yellow' | 'green';
  topRisks: string[];
} {
  let score = 50;

  // Positive signals
  if (signals.daysActive7d >= 5) score += 15;
  if (signals.featureBreadth > 0.5) score += 10;
  if (signals.hasIntegrations) score += 10;
  if (signals.teamSize > 1) score += 10;

  // Negative signals
  if (signals.daysSinceLastActive > 14) score -= 30;
  if (signals.daysSinceLastActive > 30) score -= 20;
  if (signals.paymentFailureCount > 0) score -= 15;
  if (signals.recentNegativeFeedback) score -= 10;
  if (signals.supportTicketsOpen > 3) score -= 10;

  score = Math.max(0, Math.min(100, score));

  const category = score < 35 ? 'red' : score < 65 ? 'yellow' : 'green';
  const topRisks = identifyTopRisks(signals);

  return { score, category, topRisks };
}
```

Use score for:
- CSM (Customer Success Manager) priority queue
- Automated re-engagement campaigns
- Renewal forecasting

### Шаг 7 — Growth loops

In-product growth mechanisms (PLG):

#### Referral program

```typescript
interface ReferralProgram {
  // Referrer gets:
  referrerReward: { type: 'discount' | 'credit' | 'extension'; value: any };
  // Referee gets:
  refereeReward: { type: 'discount' | 'extended_trial' | 'free_month'; value: any };

  // Anti-abuse
  maxReferralsPerUser: number;
  refereeMustReachActivation: boolean;  // before reward unlocks
  rewardCap: { value: any; period: 'month' | 'lifetime' };
}
```

Each user gets unique referral link `app.com/?ref={uniqueCode}`. Track signups через cookie + attribute properly.

#### Network effects

For collaboration tools: when user invites teammate, both get value. Build invite UX:
- After signup: "Invite your team" prompt
- Pre-populated email template
- "X teammates already on platform" social proof

#### Viral loops

For tools producing public output (forms, dashboards, public pages):
- "Powered by {App}" footer на free tier (removable on paid)
- Public sharing automatically promotes app

### Шаг 8 — Generate `src/saas/` structure

```
src/saas/
├── lifecycle/
│   ├── trial-stages.ts        # state machine for trial flow
│   ├── activation-events.ts   # track aha-moment events
│   ├── stuck-workflow.ts      # if user not activated in 3 days
│   └── churn-flow.ts          # exit interview, win-back
├── billing/
│   ├── stripe-webhooks.ts     # webhook handlers
│   ├── dunning.ts             # failed payment recovery
│   ├── plan-change.ts         # upgrade/downgrade/proration
│   ├── invoices.ts            # invoice generation
│   └── refunds.ts             # refund flow with audit
├── admin/
│   ├── impersonate.ts         # admin login-as-user
│   ├── overrides.ts           # limit overrides, comps
│   ├── search.ts              # customer/org search
│   └── ui/
│       ├── customer-detail.tsx
│       ├── metrics-dashboard.tsx
│       └── ticket-queue.tsx
├── metrics/
│   ├── mrr-calculator.ts
│   ├── churn-analyzer.ts
│   ├── cohort-retention.ts
│   ├── conversion-funnel.ts
│   └── magic-number.ts
├── customer-success/
│   ├── health-score.ts
│   ├── csm-queue.ts           # priority queue for at-risk accounts
│   └── re-engagement.ts       # automated workflows
├── growth/
│   ├── referrals.ts           # referral program
│   ├── invites.ts             # team invites
│   ├── viral-loops.ts         # public output attribution
│   └── attribution.ts         # track signup sources
└── support/
    ├── tickets.ts             # in-app support ticket system
    └── chat.ts                # if integrating Intercom/etc
```

### Шаг 9 — Document

Save to `wiki/design/saas-foundation.md`:

```markdown
# SaaS Foundation — {Project}

## Plan structure (from subscription-design):
- Free: ...
- Pro: $X/mo or $Y/yr (saves Z%)
- Team: $X per seat
- Enterprise: contact

## Trial → paid flow
- Length: 14 days
- Card required: no
- Activation event: "user invites first teammate" OR "creates first project"
- Stuck threshold: 72 hours без activation event
- Reminder schedule: day -3, -1, 0, +3 (last chance discount), +7 (extended)

## Admin panel features (MVP)
- Search by email / org / ID
- Customer detail view
- Impersonate (audited, time-limited)
- Refund / discount / comp
- Cancel + delete
- Metrics dashboard

## Billing
- Provider: Stripe (or Tinkoff for РФ)
- Dunning: 0/3/5/7/10/14 day schedule
- Failed payment grace period: 7 days
- Proration: immediate on upgrade, scheduled on downgrade

## Customer health
- Score components: engagement, adoption, risk
- CSM queue: <35 score = priority
- Re-engagement: automated email после 7d inactive

## Growth
- Referrals: 1 month free for both parties, capped 3 referrals/user
- Team invites: in-product, social proof
- Viral: "Powered by" on free tier output

## Metrics targets
- MRR: $X by month 6
- Trial conversion: 8% (industry avg)
- Net churn: <5%/mo
- LTV/CAC: >3
- NDR: >100% (expansion-friendly)
```

## Common pitfalls

1. **Webhook без idempotency** — Stripe retries, your handler runs twice, customer charged twice. Always check `processedWebhooks` first.

2. **Impersonation без audit** — security incident untraceable. Audit + notification + time limit.

3. **Failed payments → instant cancel** — losing customers с просто card expiry. 7+ day grace period.

4. **Health score без action** — score computed but no one looks. Build CSM queue + automated workflows.

5. **Trial conversion measured wrong** — "trial conversion" calculated as (paid / total signups) inflates conversion (some don't even start trial). Measure (paid / trial-active-day-2 minimum).

6. **Admin panel slow on customer search** — adding 100K customers, search becomes unusable. Index by email + add full-text search.

7. **No analytics for free tier** — can't see what features convert. Track usage even for free, key для paywall design.

8. **Pricing changes break existing customers** — moved Free Pro $9.99 → $14.99, existing rage. Always grandfather pricing.

## Non-Negotiable

- [ ] SaaS metric system (MRR, churn, NDR, LTV/CAC)
- [ ] Trial state machine (signup → activation → engaged → ending → converted/churned)
- [ ] Activation events tracked
- [ ] Stuck workflow (re-engagement если activation not reached)
- [ ] Admin panel with impersonation (audited, time-limited)
- [ ] Stripe webhook handlers (idempotent)
- [ ] Dunning workflow with grace period
- [ ] Plan change with proration
- [ ] Customer health score
- [ ] CSM priority queue based on health
- [ ] Referral program (or other PLG mechanism)
- [ ] Pricing grandfathering policy
- [ ] Document в `wiki/design/saas-foundation.md`
- [ ] All strings через `t()` (i18n)
