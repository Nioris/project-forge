---
name: app-notifications
kind: tactical
description: "App notifications: local reminders, push setup, badge counters, in-app notification center, scheduled alerts, toast messages. Use when app needs reminders, alerts, or notification system. Triggers on: notification, уведомление, reminder, напоминание, alert, badge, push, toast, оповещение."
---

# App Notifications

## Purpose
Apps that remind users at the right time have 3x retention. This skill adds local notifications, in-app notification center, and push infrastructure.

## Step 1: In-App Toast System

```javascript
/**
 * Toast notification system — stacks from bottom
 * Types: success, error, warning, info
 */
const Toast = (() => {
  let container;
  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;max-width:360px;width:calc(100vw - 32px)';
      document.body.appendChild(container);
    }
    return container;
  }

  const STYLES = {
    success: { bg: '#065f46', icon: '✓', border: '#10b981' },
    error:   { bg: '#7f1d1d', icon: '✕', border: '#ef4444' },
    warning: { bg: '#78350f', icon: '⚠', border: '#f59e0b' },
    info:    { bg: '#1e3a5f', icon: 'ℹ', border: '#3b82f6' },
  };

  return {
    show(message, type = 'info', duration = 4000) {
      const s = STYLES[type] || STYLES.info;
      const el = document.createElement('div');
      el.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 16px;
        border-radius:12px;background:${s.bg};color:#fff;font-size:14px;
        pointer-events:auto;box-shadow:0 4px 16px rgba(0,0,0,0.3);
        border-left:3px solid ${s.border};
        transform:translateX(120%);transition:transform .3s cubic-bezier(0.34,1.56,0.64,1),opacity .2s`;
      el.innerHTML = `<span style="font-size:16px;flex-shrink:0">${s.icon}</span><span style="flex:1">${message}</span>`;

      getContainer().appendChild(el);
      requestAnimationFrame(() => el.style.transform = 'translateX(0)');

      setTimeout(() => {
        el.style.transform = 'translateX(120%)';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      }, duration);
    },
    success: (m, d) => Toast.show(m, 'success', d),
    error:   (m, d) => Toast.show(m, 'error', d),
    warning: (m, d) => Toast.show(m, 'warning', d),
    info:    (m, d) => Toast.show(m, 'info', d),
  };
})();

// Usage:
// Toast.success('Подписка добавлена');
// Toast.error('Не удалось сохранить');
// Toast.warning('Подписка истекает через 3 дня');
// Toast.info('Данные синхронизированы');
```

## Step 2: Local Scheduled Reminders

```javascript
/**
 * Reminder system using Notification API + localStorage scheduling
 * For: subscription renewal alerts, task deadlines, habit reminders
 */
const Reminders = {
  STORAGE_KEY: 'app_reminders',

  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  getAll() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; }
    catch { return []; }
  },

  /** Schedule a reminder */
  add(reminder) {
    const reminders = this.getAll();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    reminders.push({
      id,
      title: reminder.title,
      body: reminder.body,
      triggerAt: reminder.triggerAt, // ISO date string
      repeat: reminder.repeat || null, // 'daily' | 'weekly' | 'monthly' | null
      entityId: reminder.entityId || null, // link to subscription/note/task
      created: new Date().toISOString(),
    });
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reminders));
    return id;
  },

  /** Remove a reminder */
  remove(id) {
    const reminders = this.getAll().filter(r => r.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reminders));
  },

  /** Check and fire due reminders (call on app start + every minute) */
  checkDue() {
    const now = Date.now();
    const reminders = this.getAll();
    const due = reminders.filter(r => new Date(r.triggerAt).getTime() <= now);

    due.forEach(r => {
      // Show notification
      if (Notification.permission === 'granted') {
        new Notification(r.title, {
          body: r.body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: r.id,
        });
      }

      // Also show in-app toast
      Toast.warning(r.body);

      // Handle repeat
      if (r.repeat) {
        const next = new Date(r.triggerAt);
        if (r.repeat === 'daily') next.setDate(next.getDate() + 1);
        if (r.repeat === 'weekly') next.setDate(next.getDate() + 7);
        if (r.repeat === 'monthly') next.setMonth(next.getMonth() + 1);
        r.triggerAt = next.toISOString();
      } else {
        r._remove = true;
      }
    });

    // Update storage
    const remaining = reminders.filter(r => !r._remove);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(remaining));
  },

  /** Start periodic check */
  startPolling(intervalMs = 60000) {
    this.checkDue(); // check immediately
    setInterval(() => this.checkDue(), intervalMs);
  },
};

// Usage for subscription app:
// Reminders.add({
//   title: 'Списание Netflix',
//   body: 'Завтра спишут 649 ₽ за Netflix',
//   triggerAt: dayBefore(subscription.nextPayment).toISOString(),
//   repeat: 'monthly',
//   entityId: subscription.id,
// });

// On app start:
// Reminders.startPolling();
```

## Step 3: In-App Notification Center

```javascript
/**
 * Notification center — bell icon with badge + dropdown
 * Stores history of events the user should know about
 */
const NotificationCenter = {
  STORAGE_KEY: 'app_notifications',
  MAX_ITEMS: 50,

  getAll() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; }
    catch { return []; }
  },

  add(notification) {
    const items = this.getAll();
    items.unshift({
      id: Date.now().toString(36),
      title: notification.title,
      body: notification.body,
      type: notification.type || 'info', // info | warning | success | action
      action: notification.action || null, // { label, handler } for actionable notifications
      read: false,
      createdAt: new Date().toISOString(),
    });
    if (items.length > this.MAX_ITEMS) items.length = this.MAX_ITEMS;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    this.updateBadge();
  },

  markRead(id) {
    const items = this.getAll();
    const item = items.find(i => i.id === id);
    if (item) { item.read = true; localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items)); }
    this.updateBadge();
  },

  markAllRead() {
    const items = this.getAll();
    items.forEach(i => i.read = true);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    this.updateBadge();
  },

  getUnreadCount() {
    return this.getAll().filter(i => !i.read).length;
  },

  updateBadge() {
    const count = this.getUnreadCount();
    const badge = document.querySelector('.notif-badge');
    if (badge) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
    // Update app badge (PWA)
    if (navigator.setAppBadge) {
      count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    }
  },
};

// Usage:
// NotificationCenter.add({
//   title: 'Подписка продлена',
//   body: 'Spotify — 169 ₽ списано',
//   type: 'info',
// });
// NotificationCenter.add({
//   title: 'Пробный период заканчивается',
//   body: 'YouTube Premium — осталось 3 дня',
//   type: 'warning',
//   action: { label: 'Отменить', handler: 'cancelSub("yt")' },
// });
```

## Step 4: Badge Counter

```javascript
/**
 * Animated badge on any element (bell icon, tab, button)
 */
function createBadge(parentEl) {
  const badge = document.createElement('span');
  badge.className = 'notif-badge';
  badge.style.cssText = `
    position:absolute;top:-4px;right:-4px;
    min-width:18px;height:18px;padding:0 5px;
    border-radius:9px;background:#ef4444;color:#fff;
    font-size:11px;font-weight:700;
    display:none;align-items:center;justify-content:center;
    box-shadow:0 1px 3px rgba(0,0,0,0.3);
    animation:badgePop .3s cubic-bezier(0.34,1.56,0.64,1)`;
  parentEl.style.position = 'relative';
  parentEl.appendChild(badge);

  const style = document.createElement('style');
  style.textContent = '@keyframes badgePop{0%{transform:scale(0)}100%{transform:scale(1)}}';
  document.head.appendChild(style);

  return badge;
}
```

## Non-Negotiable Acceptance Criteria
- [ ] Toast system with 4 types (success, error, warning, info)
- [ ] Toasts stack from bottom-right, auto-dismiss
- [ ] Reminder scheduling with repeat support (daily/weekly/monthly)
- [ ] Notification permission requested only on user action (not on page load)
- [ ] Notification center with unread count badge
- [ ] Badge animates on update (pop effect)
- [ ] All notifications persisted in localStorage
- [ ] PWA badge API used when available
- [ ] Reminders checked on app start + every 60 seconds
