---
name: web-push
description: >
  Web Push Notifications for SvelteKit PWA without Firebase. VAPID keys, soft-ask pattern, subscription
  management, PocketBase storage, SW push/click handlers, stale subscription cleanup, and RuStore Push
  alternative. Use this skill for push notifications, VAPID, web push, notification API, or Firebase-free push.
---

# Web Push Skill

VAPID push notifications — Firebase-free, works in Russia.

## Permission UX — CRITICAL

**Never ask on page load** — 90% of prompts dismissed. Use **soft-ask pattern**:
1. Show your own UI: "Хотите получать уведомления о новых заказах?"
2. User clicks "Да" → only then trigger browser `Notification.requestPermission()`.

## Russian Market Notes

- FCM endpoints may be **unreliable in Russia**.
- Web Push with VAPID works independently: Firefox (`push.services.mozilla.com`), Safari (`web.push.apple.com`).
- For native Android: use **RuStore Push** as FCM alternative (API mirrors FCM at `vkpns.rustore.ru`).

## Stale Subscription Cleanup

Handle **410 Gone** and **404** from push endpoints by deleting subscriptions from PocketBase.
Store: `push_subscriptions` collection with `endpoint` (unique), `keys_p256dh`, `keys_auth`, `segments` (JSON).

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — VAPID private key server-only.** Never rotated — rotation invalidates all subscriptions.
2. **E — Explicit soft-ask before browser prompt.** Custom UI first, browser API second.
3. **R — Re-subscription on pushsubscriptionchange.** SW handles and re-registers.
4. **U — Unsubscribe flow works.** User disables → subscription deleted from PB.
5. **D — Dead subscriptions cleaned.** 410/404 responses → delete from PB immediately.
6. **D — Delivery with TTL + urgency + topic.** `TTL: 86400`, `urgency: 'normal'`, `topic` for grouping.
7. **A — Action buttons work.** "Открыть" and "Закрыть" handled in SW `notificationclick`.

## References

- `references/web-push-setup.md` — VAPID gen, soft-ask component, server push, SW handler, RuStore Push.
