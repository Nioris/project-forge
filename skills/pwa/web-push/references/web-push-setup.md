# Web Push — Full Reference

## VAPID Key Generation

```bash
npx web-push generate-vapid-keys
# Save VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env
```

## Environment Variables

```env
PUBLIC_VAPID_KEY=BLxxxxxxx...
VAPID_PRIVATE_KEY=xxxxxxx...
VAPID_SUBJECT=mailto:admin@yourapp.ru
```

## Client Subscription

```ts
// src/lib/push.ts
import { PUBLIC_VAPID_KEY } from '$env/static/public';

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
  });

  // Send to server
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });

  return subscription;
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe();
    await fetch('/api/push/unsubscribe', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
```

## Server Push Sender

```ts
// src/lib/server/push-sender.ts
import webpush from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$env/static/private';
import { PUBLIC_VAPID_KEY } from '$env/static/public';

webpush.setVapidDetails(VAPID_SUBJECT, PUBLIC_VAPID_KEY, VAPID_PRIVATE_KEY);

export async function sendPush(subscription: webpush.PushSubscription, payload: {
  title: string; body: string; icon?: string; url?: string; tag?: string;
}) {
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 86400,
    urgency: 'normal',
  });
}
```

## Service Worker Push Handler (add to existing SW)

```ts
// Inside service-worker.ts
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'Уведомление', body: '' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/pwa-192x192.png',
      badge: '/badge-72x72.png',
      tag: data.tag || 'default',
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'Открыть' },
        { action: 'close', title: 'Закрыть' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```
