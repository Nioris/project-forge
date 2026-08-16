---
name: app-data-model
kind: architectural
description: "Architectural skill — заложить data model для приложения с самого начала. Schema, persistence, sync, migrations. Без этого retrofit стоит дни. Default: localStorage + IndexedDB…"
---

# App Data Model — заложить структуру данных С НУЛЯ

## Зачем

Приложения часто начинаются с "просто запишем в localStorage", потом данные растут и нужны:
- Migrations между версиями ("раньше было `tasks`, теперь `items` с `type:'task'`")
- Sync с сервером (если cloud feature добавляется)
- Search и фильтрация (плоский localStorage медленный для 10K+ записей)
- Backup / export
- Concurrent edits (если будут collaboration features)

Retrofit data model = переписывать всё что её использует. Заложить правильно сразу = неделя сэкономлена.

Это **architectural skill** ([[decisions/010-architectural-vs-tactical-skills]]).

## Когда вызывать

- **New apps**: после `$start` Step 6.5 (i18n) и до Step 7 (first feature)
- **Existing apps**: если localStorage используется напрямую, но данных уже >100 записей или нужны новые features (search, sync)
- **Migration trigger**: schema changed → нужно пройти через migration logic

## Pipeline

### Шаг 1 — Read context

```
wiki/_map.md          # type, category, target platforms
wiki/architecture/metrics.md  # сколько данных ожидается, sessions/day
wiki/research/{Project}-references.md  # что у конкурентов в plan tier vs free
```

### Шаг 2 — Define entities

В зависимости от category — список основных entities:

| Category | Typical entities |
|---|---|
| productivity | Task, Project, List, Tag, Reminder |
| tools / reference | Lookup record, Bookmark, History entry |
| business | User, Org, Item (depends), Permission, AuditLog |
| saas | Account, Subscription, Plan, Usage, Invoice |
| health | Entry, Streak, Goal, Reminder, Stats |
| finance | Account, Transaction, Category, Budget, Goal |
| education | Lesson, Progress, Score, Achievement, Content |
| social | User, Post, Comment, Like, Friendship |

Each entity has:
- Required fields
- Optional fields
- Relationships (belongsTo, hasMany)
- Indexes для search/filter
- Sensitive flag (для GDPR / privacy)

### Шаг 3 — Choose storage strategy

3 уровня decision:

#### Level 1: where to store

```
[ ] localStorage          — flat key-value, <5MB total. Simple, sync.
                            Good for: settings, small lists, single user.
                            Bad for: large data, complex queries, multi-user.

[ ] IndexedDB             — structured, async, large capacity (100MB+).
                            Good for: most apps with >100 records, search, indexes.
                            Default choice for non-trivial apps.
                            Use libraries: dexie (lightweight), idb (raw).

[ ] Backend (cloud)       — for collaboration, multi-device, multi-user.
                            See $choose-backend-stack для выбора.

[ ] Hybrid (local + cloud sync) — local-first, sync when online.
                            Good for: most modern apps. Best UX.
                            Patterns: CRDT (collab), simple sync (single-user multi-device).
```

#### Level 2: persistence layer architecture

```typescript
// Layer 1: Database adapter (interface)
interface IStorage {
  get<T>(table: string, id: string): Promise<T | null>;
  list<T>(table: string, query?: QueryOpts): Promise<T[]>;
  save<T>(table: string, item: T): Promise<void>;
  delete(table: string, id: string): Promise<void>;
}

// Layer 2: Concrete implementation
class IndexedDBStorage implements IStorage { /* uses dexie */ }
class CloudStorage implements IStorage { /* uses fetch */ }
class HybridStorage implements IStorage { /* local + sync */ }

// Layer 3: Repository per entity
class TaskRepository {
  constructor(private storage: IStorage) {}
  async getAll(): Promise<Task[]> { return this.storage.list('tasks'); }
  async byProject(projectId: string): Promise<Task[]> { /* ... */ }
  async create(task: Omit<Task, 'id'>): Promise<Task> { /* ... */ }
  // ...
}
```

This pattern allows:
- Swap storage without changing logic (test with memory storage)
- Add cloud sync later без переписывания всего
- Type safety at repository level

#### Level 3: schema versioning

```typescript
// src/data/schema.ts
export const SCHEMA_VERSION = 3;

export const MIGRATIONS = {
  1: (db) => {
    db.createObjectStore('tasks', { keyPath: 'id' });
  },
  2: (db) => {
    const store = db.transaction('tasks').objectStore('tasks');
    store.createIndex('by-project', 'projectId');
  },
  3: async (db) => {
    // Rename field: tasks.text → tasks.title
    const items = await db.transaction('tasks').objectStore('tasks').getAll();
    for (const item of items) {
      item.title = item.text;
      delete item.text;
      await db.transaction('tasks', 'readwrite').objectStore('tasks').put(item);
    }
  },
};
```

Schema version bumps when entities change. Migration runs on app startup.

### Шаг 4 — Generate `src/data/` structure

Create:

```
src/data/
├── schema.ts            # SCHEMA_VERSION + MIGRATIONS map
├── storage/
│   ├── index.ts         # Factory: returns appropriate IStorage
│   ├── types.ts         # IStorage interface, QueryOpts, etc
│   ├── indexeddb.ts     # IndexedDBStorage implementation
│   ├── memory.ts        # In-memory for tests
│   └── cloud.ts         # (optional) HTTP API client
├── entities/
│   ├── task.ts          # Task type + validation
│   ├── project.ts       # Project type + validation
│   └── ...
├── repositories/
│   ├── task-repo.ts     # TaskRepository class
│   ├── project-repo.ts  # ProjectRepository class
│   └── ...
└── sync/                # (optional, if cloud sync)
    ├── sync-manager.ts
    └── conflict-resolver.ts
```

### Шаг 5 — Bootstrap integration

In `src/main.ts` (or equivalent):

```typescript
import { createStorage } from './data/storage';
import { runMigrations } from './data/schema';
import { TaskRepository } from './data/repositories/task-repo';

async function bootstrap() {
  const storage = await createStorage();  // chooses IndexedDB by default
  await runMigrations(storage);

  const taskRepo = new TaskRepository(storage);
  // Pass repo to UI layer via DI / context

  startUI({ taskRepo, /* ... */ });
}
```

### Шаг 6 — Write data model document

Save to `wiki/design/data-model.md`:

```markdown
# Data Model — {Project}

## Entities

### Task
| Field | Type | Required | Indexed | Sensitive | Notes |
|---|---|---|---|---|---|
| id | string (uuid) | yes | yes | no | |
| title | string | yes | no | no | |
| projectId | string | no | yes | no | FK to Project |
| dueDate | string (ISO) | no | yes | no | |
| done | bool | yes | no | no | default false |
| createdAt | number (ts) | yes | no | no | |

### Project
...

## Relationships

```
Project 1 ── * Task (via projectId)
Project 1 ── * Tag  (via projectId)
Task    * ── * Tag  (via task_tags junction)
```

## Storage strategy

- Layer: IndexedDB via dexie
- Database: '{project}_db'
- Schema version: 1
- Sync: local-only (cloud sync planned for v2)

## Migration policy

Schema changes require:
1. Bump SCHEMA_VERSION
2. Add migration function in MIGRATIONS map
3. Test migration on snapshot of v(N-1) data
4. Document in wiki/changelog.md

## Sensitive data

(if applicable)
- Field X marked sensitive (GDPR Article 9 special category)
- Encryption: at-rest via SubtleCrypto (key derived from user password)
- Export: requires re-authentication
- Deletion: cascade delete + 30-day soft delete window
```

## Sync strategies (если cloud)

3 модели когда добавляешь cloud sync:

1. **Last-write-wins (simplest)** — server stores latest version. Client uploads on every change. Conflicts: server wins. Good for: single-user multi-device.

2. **Operational transform / CRDT** — for real-time collaboration (multiple editors at once). Complex. Use libraries (yjs, automerge). Good for: docs editing, kanban boards.

3. **Event sourcing** — store immutable events, reconstruct state. Good for: audit trail (finance, compliance), time travel (undo).

Choose based on use case. Default for "I'll add cloud sync someday" — Last-write-wins.

## Common pitfalls

1. **localStorage напрямую вместо репозиториев** — UI directly calls `localStorage.getItem('tasks')`. Refactor cost when switching to IndexedDB = touch every file. Layer the abstraction from day 1.

2. **No schema versioning** — first change to data shape breaks existing users. Add SCHEMA_VERSION = 1 from day 1, even before any migration.

3. **Sync без conflict resolution** — два устройства пишут одновременно — данные перезаписывают друг друга. Always have conflict policy, even if just "last write wins".

4. **Sensitive fields без encryption** — health/finance apps storing SSN/medical data plaintext в IndexedDB. Browser storage is NOT secure — encrypt sensitive fields.

5. **No export/backup story** — if user wants to leave the app, can they take their data? GDPR/RUS-152 require export. Build export from day 1.

6. **Indexes added late** — search becomes 100x slower on 1000+ records без index. Define indexes upfront в schema.

## Non-Negotiable

- [ ] Storage abstraction layer (IStorage interface)
- [ ] Repositories per entity (no UI calling storage directly)
- [ ] Schema version + migration map (even if v1 with no migrations yet)
- [ ] Document each entity's fields + indexes + sensitivity in `wiki/design/data-model.md`
- [ ] Migration test on v(N-1) snapshot before bumping version
- [ ] Export functionality from day 1 (даже basic JSON dump)
- [ ] If sensitive data — encrypt at-rest + re-auth для export
- [ ] If cloud sync — explicit conflict resolution policy
