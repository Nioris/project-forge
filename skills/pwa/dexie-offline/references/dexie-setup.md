# Dexie Offline — Full Setup Reference

## Database Class

```ts
// src/lib/db.ts
import Dexie, { type EntityTable } from 'dexie';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  _synced: 0 | 1;
}

export interface SyncQueueItem {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  updatedAt: string;
}

class AppDatabase extends Dexie {
  todos!: EntityTable<Todo, 'id'>;
  profiles!: EntityTable<UserProfile, 'id'>;
  _syncQueue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('appDB');

    this.version(1).stores({
      todos: 'id, completed, createdAt, updatedAt, _synced',
      profiles: 'id, email',
      _syncQueue: 'id, table, createdAt',
    });

    // Example migration for v2
    // this.version(2).stores({
    //   todos: 'id, completed, createdAt, updatedAt, _synced, categoryId',
    // }).upgrade(tx => {
    //   return tx.table('todos').toCollection().modify(todo => {
    //     todo.categoryId = 'default';
    //   });
    // });
  }
}

export const db = new AppDatabase();
```

## CRUD Helpers with Sync Queue

```ts
// src/lib/db-helpers.ts
import { db, type SyncQueueItem } from './db';

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

async function enqueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retries'>) {
  await db._syncQueue.add({
    id: uuid(),
    createdAt: now(),
    retries: 0,
    ...item,
  });
}

export async function createTodo(title: string) {
  const todo = { id: uuid(), title, completed: false, createdAt: now(), updatedAt: now(), _synced: 0 as const };
  await db.todos.add(todo);
  await enqueue({ table: 'todos', operation: 'create', payload: todo });
  return todo;
}

export async function updateTodo(id: string, changes: Partial<Pick<import('./db').Todo, 'title' | 'completed'>>) {
  const patch = { ...changes, updatedAt: now(), _synced: 0 as const };
  await db.todos.update(id, patch);
  await enqueue({ table: 'todos', operation: 'update', payload: { id, ...patch } });
}

export async function deleteTodo(id: string) {
  await db.todos.delete(id);
  await enqueue({ table: 'todos', operation: 'delete', payload: { id } });
}
```

## Sync Manager

```ts
// src/lib/sync-manager.ts
import PocketBase from 'pocketbase';
import { db } from './db';

const MAX_RETRIES = 5;
const BATCH_SIZE = 50;

export class SyncManager {
  private pb: PocketBase;
  private flushing = false;

  constructor(pbUrl: string) {
    this.pb = new PocketBase(pbUrl);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flush());
    }
  }

  setPbAuth(token: string, model: unknown) {
    this.pb.authStore.save(token, model);
  }

  async flush() {
    if (this.flushing || !navigator.onLine) return;
    this.flushing = true;

    try {
      const items = await db._syncQueue
        .orderBy('createdAt')
        .limit(BATCH_SIZE)
        .toArray();

      for (const item of items) {
        try {
          await this.processItem(item);
          await db._syncQueue.delete(item.id);
        } catch (err) {
          if (item.retries >= MAX_RETRIES) {
            console.error(`Sync item ${item.id} exceeded max retries, removing`);
            await db._syncQueue.delete(item.id);
          } else {
            await db._syncQueue.update(item.id, { retries: item.retries + 1 });
          }
        }
      }

      // Continue if there are more items
      const remaining = await db._syncQueue.count();
      if (remaining > 0) await this.flush();
    } finally {
      this.flushing = false;
    }
  }

  private async processItem(item: import('./db').SyncQueueItem) {
    const collection = this.pb.collection(item.table);

    switch (item.operation) {
      case 'create':
        await collection.create(item.payload);
        break;
      case 'update': {
        const { id, ...data } = item.payload;
        await collection.update(id as string, data);
        break;
      }
      case 'delete':
        await collection.delete(item.payload.id as string);
        break;
    }

    // Mark local record as synced
    if (item.operation !== 'delete' && item.payload.id) {
      await db.table(item.table).update(item.payload.id as string, { _synced: 1 });
    }
  }

  async pullFromServer(table: string, lastSync?: string) {
    const filter = lastSync ? `updated > "${lastSync}"` : '';
    const records = await this.pb.collection(table).getFullList({ filter, sort: '-updated' });
    
    await db.transaction('rw', db.table(table), async () => {
      for (const record of records) {
        const local = await db.table(table).get(record.id);
        if (!local || new Date(record.updated) > new Date(local.updatedAt)) {
          await db.table(table).put({
            ...record,
            updatedAt: record.updated,
            _synced: 1,
          });
        }
      }
    });
  }
}
```

## Reactive Svelte 5 Integration

```ts
// src/lib/stores/reactive-query.svelte.ts
import { liveQuery, type Observable } from 'dexie';

export function useLiveQuery<T>(querier: () => T | Promise<T>, deps?: unknown[]) {
  let data = $state<T | undefined>(undefined);
  let error = $state<Error | undefined>(undefined);
  let loading = $state(true);

  $effect(() => {
    // Track deps for re-subscription
    void deps;
    loading = true;
    const observable = liveQuery(querier) as Observable<T>;
    const sub = observable.subscribe({
      next(value) {
        data = value;
        loading = false;
        error = undefined;
      },
      error(err) {
        error = err;
        loading = false;
      },
    });
    return () => sub.unsubscribe();
  });

  return {
    get data() { return data; },
    get error() { return error; },
    get loading() { return loading; },
  };
}
```

## Storage Quota Check

```ts
// src/lib/storage-check.ts
export async function checkStorageQuota(): Promise<{ usage: number; quota: number; percentUsed: number }> {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, percentUsed: 0 };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return {
    usage,
    quota,
    percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
  };
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
```
