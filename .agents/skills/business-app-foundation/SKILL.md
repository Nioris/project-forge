---
name: business-app-foundation
kind: architectural
description: "Architectural foundation для business/B2B apps (CRM, ERP, project management, inventory). Поверх app-data-model + permissions добавляет: multi-tenant isolation (orgId scoping)…"
---

# Business App Foundation — multi-tenant, workflows, integrations

## Зачем

B2B приложения отличаются от B2C принципиально:

| Aspect | B2C app | B2B / Business app |
|---|---|---|
| Users | Individual | Org → Team → User |
| Permissions | Simple (4 roles ok) | Custom hierarchies + delegation |
| Audit | Optional | Mandatory (compliance, disputes) |
| Workflows | Linear | State machines с approvals |
| Customization | Theme | White-label brand + custom fields + custom workflows |
| Integrations | Few | Many (Slack, Zapier, webhooks, REST API) |
| Reporting | Basic | Critical (dashboards, exports) |
| Reliability | "Best effort" | SLA |

`$app-permissions` (4 базовых ролей) — недостаточно для business. Нужно глубже:
- Custom roles ("Sales Manager", "Procurement Officer")
- Hierarchical permissions (manager сейс subordinates' данные)
- Delegation (user X temporarily impersonates Y)
- Approval flows (request → review → approve)

## Когда вызывать

Категория business / B2B. После:
- `$i18n-foundation`
- `$app-data-model` — расширяется multi-tenant scoping
- `$app-permissions` — расширяется hierarchical RBAC
- `$app-onboarding-flow` — Level 3 personalized + role-based

## Pipeline

### Шаг 1 — Read context, classify

```
wiki/_map.md                       # category=business, sub-category
wiki/architecture/data-model.md
wiki/architecture/metrics.md       # B2B-specific KPIs
```

Subcategories:

| Subcategory | Examples | Special considerations |
|---|---|---|
| **CRM** | Salesforce-like, HubSpot-like | Pipeline stages, deal velocity, contact dedup |
| **ERP** | Inventory + Orders + Finance | Multi-module integration, complex permissions |
| **Project management** | Asana/Jira-like | Custom workflows, time tracking, reports |
| **HRM** | Personell, payroll, leave | Sensitive data, compliance |
| **Marketing platform** | Email, campaigns | Bulk ops, deliverability metrics |
| **Inventory / Warehouse** | Stock, locations, pickings | Real-time accuracy, barcode scanning |
| **Internal tool** | Custom company app | Lower compliance bar, customizable |

### Шаг 2 — Multi-tenant architecture

**Single-tenant** (one customer per deployment) vs **multi-tenant** (many customers, one app):

```
Multi-tenant patterns:

[A] Shared database, shared schema (most common)
    All tenants in same DB, queries scoped by orgId
    Pro: simple, cheap, easy to deploy features
    Con: noisy neighbor risk, blast radius на bug = all customers

[B] Shared database, separate schemas
    Each tenant has own schema (e.g. tenant_acme.tasks)
    Pro: better isolation, easier per-tenant migrations
    Con: harder to deploy schema changes, more complex queries

[C] Separate databases per tenant
    Each tenant в собственной БД
    Pro: maximum isolation, compliance friendly
    Con: expensive, complex deployments
```

Default for SMB target: **[A] shared schema**.

#### Mandatory orgId scoping

```typescript
// EVERY query MUST include orgId
// Don't trust client orgId — derive from authenticated user

class TaskRepository {
  constructor(private storage: IStorage, private currentOrgId: string) {}

  async list(filters?: QueryOpts): Promise<Task[]> {
    return this.storage.list('tasks', {
      ...filters,
      where: {
        ...filters?.where,
        orgId: this.currentOrgId,  // ENFORCED — никогда trusted from client
      },
    });
  }
}
```

Implement guard at storage layer: throw if query without orgId. Это **defense-in-depth**:

```typescript
// src/data/storage/multi-tenant-guard.ts
export class TenantScopedStorage implements IStorage {
  constructor(private inner: IStorage, private orgId: string) {}

  async list(table: string, opts: QueryOpts = {}): Promise<any[]> {
    if (!this.orgId) throw new Error('TenantScopedStorage missing orgId');
    if (!opts.where?.orgId) {
      opts.where = { ...opts.where, orgId: this.orgId };
    } else if (opts.where.orgId !== this.orgId) {
      throw new SecurityError(`Cross-tenant query attempt: ${opts.where.orgId}`);
    }
    return this.inner.list(table, opts);
  }
}
```

### Шаг 3 — Hierarchical RBAC

Beyond 4 roles из `$app-permissions`. Custom roles + hierarchy + delegation:

```typescript
// src/permissions/hierarchy.ts

interface CustomRole {
  id: string;
  name: string;          // "Sales Manager"
  orgId: string;
  permissions: Permission[];
  inheritsFrom?: string; // parent role
}

interface UserOrgMembership {
  userId: string;
  orgId: string;
  roleId: string;
  managerId?: string;    // hierarchy: this user reports to managerId
  delegatesTo?: string;  // temporary delegation (vacation)
  delegatesUntil?: number;
}
```

Permission resolution:

```typescript
function getEffectiveRole(user: User, orgId: string): EffectiveRole {
  const membership = getMembership(user.id, orgId);

  // 1. Check active delegation (someone delegated to this user)
  const delegations = getActiveDelegations(user.id, orgId);

  // 2. Resolve own role + inheritance chain
  const ownRole = resolveRoleWithInheritance(membership.roleId);

  // 3. Combine permissions (union of all)
  const effective = unionPermissions(ownRole, ...delegations.map(d => d.role));

  return effective;
}
```

#### Manager-subordinate visibility

Common pattern: "manager видит данные подчинённых":

```typescript
function canViewUserData(viewer: User, target: User, orgId: string): boolean {
  if (viewer.id === target.id) return true;
  if (isManagerOf(viewer.id, target.id, orgId)) return true;
  if (hasGlobalPermission(viewer, 'view_all_data', orgId)) return true;
  return false;
}

function isManagerOf(managerId: string, subordinateId: string, orgId: string): boolean {
  // Walk up the management chain
  let current = subordinateId;
  while (current) {
    const m = getMembership(current, orgId);
    if (m.managerId === managerId) return true;
    current = m.managerId;
  }
  return false;
}
```

### Шаг 4 — Workflows / state machines

Business apps часто имеют workflow:
- Order: Draft → Submitted → Approved → Shipped → Delivered → Closed
- Expense: Submitted → Manager-approved → Finance-approved → Paid
- Bug: Reported → Triaged → InProgress → Fixed → Verified → Closed

Не делай через ad-hoc `if (status === 'X' && action === 'Y')`. Используй **state machine pattern**:

```typescript
// src/workflow/state-machine.ts

interface State<TState extends string> {
  name: TState;
  transitions: Transition<TState>[];
}

interface Transition<TState extends string> {
  to: TState;
  action: string;             // 'submit', 'approve', 'reject'
  guard?: (ctx: any) => boolean;  // permission/condition check
  effect?: (ctx: any) => void;    // side effect (notification, audit)
}

class StateMachine<TState extends string> {
  constructor(private states: Map<TState, State<TState>>) {}

  canTransition(from: TState, action: string, ctx: any): boolean {
    const state = this.states.get(from);
    if (!state) return false;
    const transition = state.transitions.find(t => t.action === action);
    if (!transition) return false;
    if (transition.guard && !transition.guard(ctx)) return false;
    return true;
  }

  transition(from: TState, action: string, ctx: any): TState {
    if (!this.canTransition(from, action, ctx)) {
      throw new InvalidTransitionError(`Cannot ${action} from ${from}`);
    }
    const transition = this.states.get(from)!.transitions.find(t => t.action === action)!;
    transition.effect?.(ctx);
    return transition.to;
  }

  getAvailableActions(from: TState, ctx: any): string[] {
    return this.states.get(from)?.transitions
      .filter(t => !t.guard || t.guard(ctx))
      .map(t => t.action) ?? [];
  }
}
```

Example for expense approval:

```typescript
const expenseFlow = new StateMachine<ExpenseStatus>(new Map([
  ['draft', {
    name: 'draft',
    transitions: [
      { to: 'submitted', action: 'submit', guard: (ctx) => ctx.expense.amount.amount > 0n }
    ]
  }],
  ['submitted', {
    name: 'submitted',
    transitions: [
      {
        to: 'manager_approved',
        action: 'approve',
        guard: (ctx) => isManagerOf(ctx.user.id, ctx.expense.submittedBy, ctx.orgId),
        effect: (ctx) => notify(ctx.expense.submittedBy, 'expense_approved')
      },
      {
        to: 'rejected',
        action: 'reject',
        guard: (ctx) => isManagerOf(ctx.user.id, ctx.expense.submittedBy, ctx.orgId)
      }
    ]
  }],
  // ...
]));
```

UI gets `getAvailableActions(currentState, ctx)` → shows only relevant buttons.

### Шаг 5 — Advanced audit log

Beyond simple "user X did Y at Z" из `$app-permissions`. Add:

```typescript
interface BusinessAuditEntry {
  // Standard fields (from $app-permissions)
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  timestamp: number;

  // Business-specific
  orgId: string;
  before?: any;             // full snapshot of resource before
  after?: any;              // full snapshot after
  diff?: Record<string, { from: any; to: any }>;
  reason?: string;          // user-provided justification
  approvedBy?: string;      // если требовался approval
  delegatedFrom?: string;   // if action was delegation

  // Compliance
  retentionUntil: number;   // when can be deleted (e.g. now + 7 years)
  legalHold?: boolean;      // если в litigation, never delete
}
```

Retention policies vary:
- Financial records: 7 years
- HR records: varies (employee + 5 years typically)
- General business: 3-5 years
- Litigation hold: indefinite until hold released

```typescript
// src/audit/retention.ts
export async function purgeExpiredAudit() {
  const now = Date.now();
  const expired = await audit.list({
    where: {
      retentionUntil: { lt: now },
      legalHold: false,
    }
  });
  await audit.bulkDelete(expired.map(e => e.id));
  await metaAudit.log({ action: 'purged_audit', count: expired.length });
}
```

### Шаг 6 — Integrations layer

B2B apps живут в ecosystem. Need:

#### Webhooks (outbound)

```typescript
// src/integrations/webhooks.ts
interface WebhookEndpoint {
  id: string;
  orgId: string;
  url: string;
  secret: string;            // HMAC signing
  events: string[];          // ['expense.approved', 'order.shipped']
  active: boolean;
  failureCount: number;
}

export async function fireWebhook(orgId: string, event: string, payload: any) {
  const endpoints = await webhookRepo.list({
    where: { orgId, active: true, events: { contains: event } }
  });

  for (const ep of endpoints) {
    const sig = hmac(ep.secret, JSON.stringify(payload));
    try {
      await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': sig,
          'X-Webhook-Event': event,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      ep.failureCount = 0;
    } catch (e) {
      ep.failureCount++;
      if (ep.failureCount > 5) ep.active = false;  // auto-disable after 5 fails
      await retryQueue.add({ webhookId: ep.id, payload, attempt: 1 });
    }
    await webhookRepo.save(ep);
  }
}
```

#### REST API (inbound)

Document API endpoints. Use OpenAPI spec. Auth via API keys per org:

```typescript
// src/api/auth.ts
export async function authenticateApiKey(req: Request): Promise<{ orgId: string; user: User }> {
  const key = req.headers.get('X-API-Key');
  if (!key) throw new UnauthenticatedError();

  const apiKey = await apiKeyRepo.findByHash(hash(key));
  if (!apiKey || apiKey.revokedAt) throw new UnauthenticatedError();

  // Rate limit per key
  await rateLimiter.check(apiKey.id, 1000, 60_000);  // 1000/min

  await apiKeyRepo.touchLastUsed(apiKey.id);

  return { orgId: apiKey.orgId, user: apiKey.creator };
}
```

#### Common integrations

Pre-built adapters for:
- Slack (notifications, slash commands)
- Email (SendGrid / Mailgun / SES)
- Zapier (universal trigger)
- Google Workspace / Microsoft 365 (calendar, contacts)
- Stripe (billing webhooks if SaaS)

### Шаг 7 — White-label customization

For internal tools / B2B platforms supporting multiple brands:

```typescript
interface OrgBranding {
  orgId: string;
  logo: string;            // URL or base64
  primaryColor: string;
  secondaryColor: string;
  customDomain?: string;   // app.acme.com vs app.com/acme
  emailFromName: string;
  emailFromAddress?: string;  // (если verified DNS)
  customCss?: string;      // limited subset
  hideBranding: boolean;   // remove "Powered by X"
}
```

CSS variables approach:

```css
:root {
  --primary: var(--org-primary, #007bff);
  --secondary: var(--org-secondary, #6c757d);
}
```

Inject org-specific CSS variables on page load.

### Шаг 8 — Reporting + exports

Business apps need reports. Required from day 1:

- **List exports**: CSV/XLSX of any list view (with active filters)
- **Summary reports**: dashboards exportable to PDF
- **Scheduled reports**: weekly/monthly auto-email
- **Custom reports**: query builder for power users (later iteration)

```typescript
// src/reports/csv-export.ts
export async function exportListToCsv<T>(
  items: T[],
  columns: ColumnSpec<T>[],
  options?: { delimiter?: string; locale?: string }
): Promise<Blob> {
  const headers = columns.map(c => c.label);
  const rows = items.map(item => columns.map(c => c.format(item, options?.locale ?? 'en')));
  return generateCsv(headers, rows, options?.delimiter ?? ',');
}
```

### Шаг 9 — SLA + reliability features

B2B customers expect:
- **Uptime monitoring** + status page
- **Graceful degradation** (если webhook fails — retry queue, not silent fail)
- **Data backup** (daily automated, restorable)
- **Disaster recovery** plan documented
- **Incident communication** template

Even MVP B2B should have:
- Health check endpoint (`/api/health`)
- Status page (StatusPage.io / Hund / self-hosted)
- Email-based incident notifications

### Шаг 10 — Generate `src/business/` structure

```
src/business/
├── tenant/
│   ├── scoped-storage.ts    # TenantScopedStorage wrapper
│   ├── isolation-guard.ts   # cross-tenant query detection
│   └── context.ts           # current org/user context
├── permissions/
│   ├── hierarchy.ts         # custom roles + inheritance
│   ├── delegation.ts        # temporary impersonation
│   └── manager-subordinate.ts
├── workflow/
│   ├── state-machine.ts     # generic state machine
│   ├── audit-trail.ts       # workflow event log
│   └── flows/
│       ├── expense.ts
│       ├── order.ts
│       └── ...
├── audit/
│   ├── retention.ts         # purge policy
│   ├── legal-hold.ts        # disable purge
│   └── reports.ts           # auditor exports
├── integrations/
│   ├── webhooks.ts          # outbound webhooks
│   ├── api-keys.ts          # inbound API auth
│   ├── adapters/
│   │   ├── slack.ts
│   │   ├── email.ts
│   │   └── zapier.ts
│   └── retry-queue.ts
├── branding/
│   ├── theme.ts             # CSS variables per org
│   └── customization.ts     # logo, colors, domain
└── reports/
    ├── csv-export.ts
    ├── pdf-export.ts
    └── scheduled.ts
```

### Шаг 11 — Document

Save to `wiki/design/business-foundation.md`:

```markdown
# Business Foundation — {Project}

## Subcategory: {CRM / ERP / PM / HRM / etc.}

## Multi-tenancy: shared-schema

## Custom roles
[list per-org custom roles needed]

## Workflows
- Expense flow: Draft → Submitted → ManagerApproved → FinanceApproved → Paid
- [more flows...]

## Audit retention: 7 years (financial), 5 years (general), legal hold support

## Integrations needed (MVP)
- Slack notifications
- Email (transactional + scheduled reports)
- Webhooks (outbound)
- REST API (inbound)

## White-label: yes (logo, colors, custom domain)

## Reports: CSV exports for all lists, PDF dashboard summary, weekly email digest

## SLA targets: 99.9% uptime, <2h MTTR for P0
```

## Common pitfalls

1. **Forgot orgId scoping** — query без orgId returns другого tenant's data. **Catastrophic** breach. Defense: storage-layer guard.

2. **Hardcoded role names в коде** — `if (user.role === 'admin')` doesn't work с custom roles. Use permission checks always.

3. **No legal hold support** — litigation requires data preservation. Without legal hold flag, automated purge deletes evidence.

4. **Webhook без retry** — webhook fails once → silent data loss for customer. Always have retry queue.

5. **CSS variables не override'ятся** — white-label customization не работает потому что CSS specificity wrong. Test with multiple branding configs.

6. **Reports в memory для 100K rows** — generates OOM. Stream CSV generation row-by-row.

7. **No tenant deletion procedure** — customer cancels, data sits forever. Have explicit tenant deletion (with grace period + export option).

## Non-Negotiable

- [ ] Subcategory classified
- [ ] Multi-tenant architecture chosen (shared schema default)
- [ ] orgId scoping enforced at storage layer (with guard)
- [ ] Custom roles + permission inheritance
- [ ] Manager-subordinate visibility rules
- [ ] State machines для workflows (no ad-hoc if-status-then)
- [ ] Audit log with retention + legal hold
- [ ] Webhooks with HMAC signing + retry queue
- [ ] API key auth + rate limiting
- [ ] White-label CSS variables architecture (если нужно)
- [ ] CSV export для all list views
- [ ] Tenant deletion procedure documented
- [ ] Health check endpoint
- [ ] Document в `wiki/design/business-foundation.md`
- [ ] All strings через `t()` (i18n)
