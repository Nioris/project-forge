---
name: dexie-offline
description: "Dexie.js 4.x IndexedDB: schemas, CRUD, migrations, sync with PocketBase. Triggers on: dexie, indexeddb, offline, database, sync, migration."
---
# Dexie.js Offline-First

## Purpose
All data through IndexedDB first. Network sync is secondary.

## Instructions

### Step 1: Schema
```javascript
import Dexie from 'dexie';
export const db = new Dexie('appname');
db.version(1).stores({
  items: '++id, name, category, *tags',
  photos: '++id, entityType, entityId, createdAt',
  _sync: 'table, lastSyncedAt'
});
```

### Step 2: CRUD
```javascript
export const addItem = (item) => db.items.add({ ...item, createdAt: Date.now(), synced: false });
export const getItem = (id) => db.items.get(id);
export const updateItem = (id, changes) => db.items.update(id, { ...changes, synced: false });
export const deleteItem = (id) => db.items.delete(id);
export const search = (q) => db.items.where('name').startsWithIgnoreCase(q).toArray();
export const seed = async (data) => { if (await db.items.count() === 0) await db.items.bulkAdd(data); };
```

### Step 3: Sync
```javascript
export async function syncTable(name, pb) {
  const meta = await db._sync.get(name);
  const remote = await pb.collection(name).getFullList({ filter: 'updated > "' + (meta?.lastSyncedAt || '2000-01-01') + '"' });
  await db[name].bulkPut(remote.map(r => ({ ...r, synced: true })));
  const local = await db[name].where('synced').equals(false).toArray();
  for (const item of local) { await pb.collection(name).create(item); await db[name].update(item.id, { synced: true }); }
  await db._sync.put({ table: name, lastSyncedAt: new Date().toISOString() });
}
```

## Non-Negotiable Acceptance Criteria
- [ ] All reads from IndexedDB (never wait for network)
- [ ] Writes to IndexedDB first, sync flag set
- [ ] Schema versioned
- [ ] bulkAdd for seed data
