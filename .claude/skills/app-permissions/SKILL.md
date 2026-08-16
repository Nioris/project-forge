---
name: app-permissions
kind: architectural
description: "Roles + permissions для business/SaaS/multi-tenant apps. RBAC pattern, audit log, ownership rules. Без него refactor permissions на 100+ pages = недели. Triggers on: permissions, roles, RBAC, multi-tenant, права доступа, ACL, owner, admin, viewer, audit log."
---

# App Permissions — RBAC С НУЛЯ

## Зачем

Business/SaaS apps часто начинают как single-user. Потом приходит "ну а если несколько юзеров в команде?". И начинается:
- Owner vs members vs viewer
- Кто может удалять? Только owner или admins?
- Кто может приглашать новых?
- Что видит viewer но не редактирует?
- Audit log "кто что когда"

Если RBAC не заложен с самого начала — refactor 100+ pages чтобы добавить `if (currentUser.canEdit(item)) { ... }`. **Дни work**.

Заложить с начала: один pattern, одна функция, везде применяется.

## Когда вызывать

- **Business / B2B apps** — обязательно
- **SaaS apps** — обязательно (org/team layer)
- **Multi-user productivity apps** — если есть concept "share with team"
- **Tools / single-user productivity** — НЕ обязательно (skip)

## Pipeline

### Шаг 1 — Read context

```
wiki/_map.md                     # category, multi-user или нет
wiki/architecture/data-model.md  # entities to protect
```

### Шаг 2 — Define roles

Standard 4-role hierarchy:

```
Owner    — full control, can delete account, manage billing, transfer ownership
  ↓
Admin    — manage members, settings; cannot delete account
  ↓
Member   — create/edit/delete own items, view shared items
  ↓
Viewer   — read-only access
```

Plus optional roles per use case:
- **Guest** — limited time, restricted scope (single project)
- **Service account** — for API/integrations (no UI access)

### Шаг 3 — Define resources + actions

Matrix: who can do what?

```
Resource       | Owner | Admin | Member | Viewer | Notes
Account        | RWMD  | RW    | R      | R      | M=manage settings, D=delete
Members list   | RWMD  | RWM   | R      | R      | M=invite/remove
Project        | RWMD  | RWMD  | RWMD*  | R      | * = own projects only
Task           | RWMD  | RWMD  | RWMD*  | R      | * = task in own project OR assigned to member
Settings       | RWM   | R     | -      | -      | only owners change billing
Billing        | RWM   | -     | -      | -      | only owner
Audit log      | R     | R     | -      | -      | admins+ can review
```

Encode in code:

```typescript
type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Action = 'read' | 'write' | 'delete' | 'manage';
type Resource = 'account' | 'members' | 'project' | 'task' | 'settings' | 'billing' | 'audit';

const PERMISSIONS: Record<Role, Record<Resource, Action[]>> = {
  owner: {
    account: ['read', 'write', 'manage', 'delete'],
    billing: ['read', 'write', 'manage'],
    members: ['read', 'write', 'manage', 'delete'],
    // ... etc
  },
  admin: { /* ... */ },
  member: { /* ... */ },
  viewer: { /* ... */ },
};
```

### Шаг 4 — Generate `src/permissions/` structure

```
src/permissions/
├── index.ts          # Public API: can(user, action, resource, item?)
├── roles.ts          # Role definitions + PERMISSIONS matrix
├── policies.ts       # Resource-level policies (e.g. "user can edit own item")
├── enforce.ts        # Middleware: check permission, throw or return false
├── audit.ts          # Audit log writer
└── types.ts
```

Core API:

```typescript
// src/permissions/index.ts
export type CanResult = { allowed: boolean; reason?: string };

export function can(
  user: User,
  action: Action,
  resource: Resource,
  item?: { ownerId?: string; sharedWith?: string[] }
): CanResult {
  // 1. Check role-level permissions
  const allowedActions = PERMISSIONS[user.role]?.[resource] ?? [];
  if (!allowedActions.includes(action)) {
    return { allowed: false, reason: `role ${user.role} cannot ${action} ${resource}` };
  }

  // 2. Check ownership policy
  if (item?.ownerId && item.ownerId !== user.id && action !== 'read') {
    if (user.role === 'member') {
      return { allowed: false, reason: 'members can only modify own items' };
    }
  }

  // 3. Check sharing policy (for shared items)
  if (action === 'write' && item?.sharedWith && !item.sharedWith.includes(user.id)) {
    if (user.role === 'viewer' || user.role === 'member') {
      return { allowed: false, reason: 'item not shared with you' };
    }
  }

  return { allowed: true };
}
```

Usage everywhere:

```typescript
// In UI
if (can(currentUser, 'delete', 'task', task).allowed) {
  showDeleteButton();
}

// In API/handlers
const result = can(currentUser, 'write', 'project', project);
if (!result.allowed) {
  throw new ForbiddenError(result.reason);
}
```

### Шаг 5 — Audit log

Every mutating action → audit entry:

```typescript
// src/permissions/audit.ts
interface AuditEntry {
  id: string;
  userId: string;
  userName: string;  // denormalized for display even if user deleted
  action: 'create' | 'update' | 'delete' | 'invite' | 'remove' | 'role_change';
  resource: Resource;
  resourceId: string;
  changes?: Record<string, { from: any; to: any }>;
  timestamp: number;
  ipAddress?: string;
}

export async function logAction(entry: AuditEntry): Promise<void> {
  await storage.save('audit_log', entry);
  // Also could ship to backend if cloud audit needed
}
```

UI:
- Admins+ can view audit log
- Filter by user / resource / date range
- Export to CSV (для compliance)

### Шаг 6 — Permission UI patterns

#### Hide vs disable vs error

```
Permission denied  →  options:

[A] HIDE the action (button, menu item)
    Best for: irreversible (delete), cosmetic (settings)
    Risk: user feels like feature missing

[B] DISABLE with tooltip "Только админ может это"
    Best for: contextual actions in lists/tables
    Pro: user knows feature exists

[C] SHOW + ERROR on click
    Best for: when permission depends on item state
    Risk: bad UX (wasted click)
```

Default: HIDE for clearly forbidden, DISABLE for "you don't have access right now".

#### Role badges

In lists:

```
[Member icon] John Doe       (you, owner)
[Member icon] Jane Smith     (admin)
[Member icon] Bob Wilson     (member)
[Viewer icon] Alice Reader   (viewer)
```

Visual indicators help users understand who can do what.

### Шаг 7 — Multi-tenant isolation

For SaaS apps with multiple orgs/teams:

```typescript
// Every query MUST include orgId filter
async function getTasks(orgId: string, userId: string) {
  // 1. Verify user belongs to org
  const membership = await getMembership(userId, orgId);
  if (!membership) throw new ForbiddenError();

  // 2. Query scoped to org
  return tasks.list({ orgId });
}
```

NEVER trust client-supplied orgId. Always verify membership server-side.

### Шаг 8 — Document

Save to `wiki/design/permissions.md`:

```markdown
# Permissions Design — {Project}

## Roles

| Role | Can do | Cannot do |
|---|---|---|
| Owner | All including billing, account deletion | — |
| Admin | All except account/billing | Delete account, change billing |
| Member | Create/edit/delete own items | Edit others' items, manage members |
| Viewer | Read everything | Anything else |

## Resources × Actions matrix

[the table from Step 3]

## Ownership policies

- Member can: read all in their org, write/delete only own
- Admin can: all CRUD on items in org
- Item ownership transferred when member removed (transfer to admin)

## Audit log

- Tracked: create, update, delete, invite, remove, role_change
- Retention: 90 days (or per regulation)
- Access: admins+ in UI, exportable to CSV

## UI rules

- Hide buttons for forbidden actions
- Show role badges in member lists
- Tooltips on disabled state

## Multi-tenant

- All queries scoped to orgId
- Membership verification on every request
- No client-supplied org ID without verification
```

## Common pitfalls

1. **Hardcoded role checks scattered** — `if (user.role === 'admin')` в 50 местах. Use `can()` everywhere instead.

2. **Frontend-only permission checks** — UI hides delete button, but API allows anyone to delete. **Server-side enforcement = MUST**.

3. **No audit log** — кто-то удалил критичный item, никто не знает кто. Log from day 1.

4. **Forgotten viewer role** — все features assume "member or higher". Viewer breaks edge cases ("I added a comment but can't see it").

5. **Cascading deletes без ownership transfer** — owner leaves org, all his items deleted. Have transfer-on-remove policy.

6. **No role change UI** — owner has to call DB directly to change member's role. Build admin UI from day 1.

7. **Permission errors leak data** — "Cannot read project 12345" reveals project 12345 exists. Generic "Access denied" instead.

## Non-Negotiable

- [ ] Define 4 roles minimum: owner / admin / member / viewer
- [ ] Resources × actions matrix documented
- [ ] `can()` function as single source of truth
- [ ] Server-side enforcement (frontend `can()` is for UX only)
- [ ] Audit log for all mutating actions
- [ ] Multi-tenant: orgId scoping on every query
- [ ] Role badges in member lists
- [ ] Hide vs disable vs error patterns chosen per action
- [ ] Document в `wiki/design/permissions.md`
