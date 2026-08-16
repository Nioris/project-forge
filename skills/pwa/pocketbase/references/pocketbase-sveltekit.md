# PocketBase + SvelteKit — Full Reference

## hooks.server.ts — Per-request PB Instance

```ts
// src/hooks.server.ts
import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Create FRESH instance for every request
  event.locals.pb = new PocketBase(PUBLIC_PB_URL);

  // Load auth from cookie
  const cookie = event.request.headers.get('cookie') || '';
  event.locals.pb.authStore.loadFromCookie(cookie);

  // Auto-refresh token if valid but expiring
  try {
    if (event.locals.pb.authStore.isValid) {
      await event.locals.pb.collection('users').authRefresh();
      event.locals.user = event.locals.pb.authStore.record;
    }
  } catch {
    event.locals.pb.authStore.clear();
    event.locals.user = null;
  }

  const response = await resolve(event);

  // Always sync cookie back
  const pbCookie = event.locals.pb.authStore.exportToCookie({
    httpOnly: false, // false so client PB can read it
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  response.headers.append('set-cookie', pbCookie);

  return response;
};
```

## Type Definitions

```ts
// src/app.d.ts
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase;
      user: RecordModel | null;
    }
  }
}
```

## Client-side PB (browser only)

```ts
// src/lib/pocketbase.ts
import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';

function createClientPB() {
  const pb = new PocketBase(PUBLIC_PB_URL);
  pb.autoCancellation(false);
  return pb;
}

// Safe to be a singleton in browser context
export const pb = createClientPB();
```

## Layout Server — Pass User to Client

```ts
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user ? structuredClone(locals.user) : null,
  };
};
```

## Auth — Login / Register

```ts
// src/routes/auth/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
  login: async ({ request, locals }) => {
    const data = await request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;

    try {
      await locals.pb.collection('users').authWithPassword(email, password);
    } catch (err) {
      return fail(400, { email, error: 'Неверный email или пароль' });
    }

    throw redirect(303, '/dashboard');
  },

  register: async ({ request, locals }) => {
    const data = await request.formData();
    const body = {
      email: data.get('email') as string,
      password: data.get('password') as string,
      passwordConfirm: data.get('passwordConfirm') as string,
      name: data.get('name') as string,
    };

    try {
      await locals.pb.collection('users').create(body);
      await locals.pb.collection('users').authWithPassword(body.email, body.password);
    } catch (err: any) {
      return fail(400, { error: err.message });
    }

    throw redirect(303, '/dashboard');
  },

  logout: async ({ locals }) => {
    locals.pb.authStore.clear();
    throw redirect(303, '/');
  },
};
```

## Realtime Subscriptions (browser only)

```svelte
<script lang="ts">
  import { pb } from '$lib/pocketbase';
  import { onMount } from 'svelte';

  let messages = $state<any[]>([]);

  onMount(() => {
    // Subscribe to realtime changes
    const unsubscribe = pb.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create') {
        messages = [...messages, e.record];
      } else if (e.action === 'update') {
        messages = messages.map(m => m.id === e.record.id ? e.record : m);
      } else if (e.action === 'delete') {
        messages = messages.filter(m => m.id !== e.record.id);
      }
    });

    return () => { unsubscribe.then(fn => fn()); };
  });
</script>
```

## File Uploads

```ts
// Upload with FormData
async function uploadFile(todoId: string, file: File) {
  const formData = new FormData();
  formData.append('attachment', file);
  return pb.collection('todos').update(todoId, formData);
}

// Get file URL
function getFileUrl(record: RecordModel, filename: string, thumb?: string) {
  return pb.files.getURL(record, filename, { thumb });
}
// Usage: getFileUrl(record, record.avatar, '100x100')
```

## Collection Schema Example (JSON for import)

```json
[
  {
    "name": "users",
    "type": "auth",
    "schema": [
      { "name": "name", "type": "text", "required": true },
      { "name": "avatar", "type": "file", "options": { "maxSelect": 1, "maxSize": 5242880 } }
    ]
  },
  {
    "name": "todos",
    "type": "base",
    "schema": [
      { "name": "title", "type": "text", "required": true },
      { "name": "completed", "type": "bool" },
      { "name": "user", "type": "relation", "options": { "collectionId": "users", "cascadeDelete": false } },
      { "name": "attachment", "type": "file", "options": { "maxSelect": 3, "maxSize": 10485760 } }
    ],
    "listRule": "@request.auth.id = user",
    "viewRule": "@request.auth.id = user",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id = user",
    "deleteRule": "@request.auth.id = user"
  }
]
```

## Deployment with Docker

```dockerfile
FROM alpine:latest
ARG PB_VERSION=0.25.0
RUN apk add --no-cache unzip ca-certificates
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
```
