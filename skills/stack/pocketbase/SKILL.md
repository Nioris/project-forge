---
name: pocketbase
description: "PocketBase 0.23.x: auth, collections, realtime, file storage. Triggers on: pocketbase, backend, auth, API, realtime, collections."
---
# PocketBase Backend

## Purpose
Lightweight backend on single VPS: auth, sync, files.

## Instructions

### Step 1: Client
```javascript
import PocketBase from 'pocketbase';
export const pb = new PocketBase('https://api.app.ru');
export const login = (email, pw) => pb.collection('users').authWithPassword(email, pw);
export const loginVK = () => pb.collection('users').authWithOAuth2({ provider: 'vk' });
export const register = (email, pw) => pb.collection('users').create({ email, password: pw, passwordConfirm: pw });
export const logout = () => pb.authStore.clear();
export const isLoggedIn = () => pb.authStore.isValid;
```

### Step 2: Realtime
```javascript
const unsub = pb.collection('items').subscribe('*', (e) => {
  if (e.action === 'create') addToLocalDB(e.record);
});
// On destroy: unsub();
```

## Non-Negotiable Acceptance Criteria
- [ ] Singleton PocketBase client
- [ ] Auth token auto-refresh
- [ ] Realtime subscriptions cleaned up on destroy
- [ ] Error handling: offline queue
