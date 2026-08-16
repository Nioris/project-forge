---
name: dexie-offline
description: >
  Offline-first data layer with Dexie.js 4.x + IndexedDB for SvelteKit. Schema design, compound indexes,
  sync queue to PocketBase, reactive liveQuery, conflict resolution, bulk operations, and storage management.
  Use this skill for offline data, IndexedDB, Dexie, local-first, data sync, or client-side database.
---

# Dexie Offline Skill

Build an offline-first data layer with Dexie.js 4.x.

## Schema Design Rules

- `++id` auto-increment — **NEVER use with sync** (IDs collide across clients). Use UUIDs.
- `&field` unique index, `*field` multi-entry (arrays), `[A+B]` compound index.
- Compound index `[A+B]` supports querying A alone but **NOT** B alone.
- Only index fields used in `.where()` queries — over-indexing wastes storage and slows writes.

## Performance Rules

- `bulkAdd`/`bulkPut` are **10–50x faster** than individual adds.
- Batch large datasets in chunks of 1000 with `setTimeout(0)` between batches to yield to UI.
- Use cursor-based pagination over offset-based for deep pages.
- Use `{ durability: 'relaxed' }` transaction option for write-heavy operations.
- Use `.where()` not `.filter()` on large tables (O(log n) vs O(n)).

## Svelte 5 Reactivity

`liveQuery()` returns a Svelte-compatible store. In Svelte 5:
```ts
let _friends = liveQuery(() => db.friends.toArray());
let friends = $derived($_friends);
```
Guard with `{#each ($todos || []) as todo}` for initial `undefined`.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Schema uses UUIDs, not auto-increment, for synced tables.** `$$id` or `crypto.randomUUID()`.
2. **E — Every CRUD wrapped in transaction with syncQueue.** Related writes atomic. `db.transaction('rw', ...)`.
3. **R — Reactive queries via liveQuery.** No manual invalidation. UI updates in < 16 ms on mutation.
4. **U — Unlimited offline writes with sync queue.** `syncQueue` table persists across restarts. Flush on `online` event.
5. **D — Durability relaxed for bulk ops.** `{ durability: 'relaxed' }` used where appropriate.
6. **D — Delta sync with retry + max 5 retries.** Failed items requeued with `retryCount`. Dead-letter after 5.
7. **A — Automatic storage quota check.** `navigator.storage.estimate()` before bulk writes. LRU eviction if < 50 MB.

## References

- `references/dexie-setup.md` — Full DB class, sync queue, reactive queries, bulk operations.
