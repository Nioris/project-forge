---
name: app-ux-polish
kind: tactical
description: "Polish app UX: user flows, empty states, error handling, loading states, confirmations, undo, micro-interactions. Transforms functional-but-raw apps into polished products. Use when app works but feels rough, unfinished, or 'programmer-grade'. Triggers on: UX, polish, пользовательский опыт, empty state, ошибка, loading, подтверждение, undo, отмена, flow."
---

# App UX Polish

## Purpose
App works but feels raw. This skill adds the 50+ micro-details that separate a prototype from a product users love. Every item has ready-to-use code.

## Step 1: The 7 States Every Screen Must Handle

Most developers build only the "happy path". Professional apps handle ALL states:

```
1. EMPTY      — no data yet (first launch, empty list)
2. LOADING    — data is being fetched
3. PARTIAL    — some data loaded, more available
4. IDEAL      — normal state with data (what devs usually build)
5. ERROR      — something went wrong
6. OFFLINE    — no internet connection
7. PERMISSION — needs user consent (notifications, camera, location)
```

### Empty States (NEVER show blank screen)
```javascript
/**
 * Empty state: illustration + explanation + action button
 * Shows when list/collection has zero items
 */
function renderEmptyState(container, config) {
  const { icon, title, subtitle, actionText, onAction } = config;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;padding:48px 24px;text-align:center;
                min-height:300px;opacity:0;animation:fadeIn .4s ease forwards">
      <div style="font-size:64px;margin-bottom:16px;
                  filter:grayscale(0.3);animation:float 3s ease-in-out infinite">${icon}</div>
      <h3 style="margin:0 0 8px;font-size:18px;font-weight:600;
                 color:var(--text-primary,#1a1a1a)">${title}</h3>
      <p style="margin:0 0 24px;font-size:14px;color:var(--text-secondary,#666);
                max-width:260px;line-height:1.5">${subtitle}</p>
      ${actionText ? `<button onclick="(${onAction})()" style="
        padding:12px 24px;border-radius:12px;border:none;
        background:var(--accent,#3b82f6);color:#fff;font-size:15px;
        font-weight:600;cursor:pointer;
        transition:transform .15s,box-shadow .15s;
        box-shadow:0 2px 8px rgba(59,130,246,0.3)"
        onmousedown="this.style.transform='scale(0.95)'"
        onmouseup="this.style.transform='scale(1)'"
      >${actionText}</button>` : ''}
    </div>`;
}

// Usage examples:
// Subscriptions app:
renderEmptyState(list, {
  icon: '📋', title: 'Нет подписок',
  subtitle: 'Добавьте первую подписку чтобы отслеживать расходы',
  actionText: '+ Добавить подписку', onAction: () => openAddForm()
});

// Notes app:
renderEmptyState(list, {
  icon: '📝', title: 'Записок пока нет',
  subtitle: 'Создайте первую заметку — она сохранится даже без интернета',
  actionText: 'Создать записку', onAction: () => createNote()
});

// Search with no results:
renderEmptyState(results, {
  icon: '🔍', title: 'Ничего не найдено',
  subtitle: `По запросу «${query}» ничего нет. Попробуйте другие слова`,
  actionText: 'Очистить поиск', onAction: () => clearSearch()
});
```

### Loading States
```javascript
/**
 * Skeleton loading — shows content shape while loading
 * Much better than spinners for lists/cards
 */
function renderSkeleton(container, type = 'list', count = 3) {
  const shimmer = `background:linear-gradient(90deg,
    var(--skeleton-base,#e0e0e0) 25%,
    var(--skeleton-shine,#f0f0f0) 50%,
    var(--skeleton-base,#e0e0e0) 75%);
    background-size:200% 100%;
    animation:shimmer 1.5s infinite;border-radius:8px`;

  const templates = {
    list: `<div style="padding:12px 16px;display:flex;gap:12px;align-items:center">
      <div style="width:44px;height:44px;border-radius:12px;${shimmer};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="height:14px;width:70%;margin-bottom:8px;${shimmer}"></div>
        <div style="height:12px;width:45%;${shimmer}"></div>
      </div>
    </div>`,
    card: `<div style="padding:16px;border-radius:16px;border:1px solid var(--border,#e5e5e5)">
      <div style="height:16px;width:60%;margin-bottom:12px;${shimmer}"></div>
      <div style="height:12px;width:90%;margin-bottom:8px;${shimmer}"></div>
      <div style="height:12px;width:75%;${shimmer}"></div>
    </div>`,
  };

  const style = `<style>@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}</style>`;

  container.innerHTML = style + Array(count).fill(templates[type]).join('');
}
```

### Error States
```javascript
/**
 * User-friendly error with retry
 * NEVER show technical errors to users
 */
function renderError(container, config) {
  const { type = 'generic', onRetry } = config;

  const errors = {
    network: { icon: '📡', title: 'Нет соединения', sub: 'Проверьте интернет и попробуйте снова' },
    server:  { icon: '🔧', title: 'Сервер недоступен', sub: 'Мы уже чиним. Попробуйте через минуту' },
    generic: { icon: '😕', title: 'Что-то пошло не так', sub: 'Попробуйте обновить страницу' },
    timeout: { icon: '⏳', title: 'Слишком долго', sub: 'Запрос не прошёл. Попробуйте ещё раз' },
    notfound:{ icon: '🔍', title: 'Не найдено', sub: 'Возможно, это было удалено или перемещено' },
  };

  const e = errors[type] || errors.generic;
  container.innerHTML = `
    <div style="text-align:center;padding:48px 24px">
      <div style="font-size:48px;margin-bottom:12px">${e.icon}</div>
      <h3 style="margin:0 0 8px;font-size:16px;font-weight:600">${e.title}</h3>
      <p style="margin:0 0 20px;font-size:14px;color:var(--text-secondary,#666)">${e.sub}</p>
      ${onRetry ? `<button onclick="(${onRetry})()" style="
        padding:10px 20px;border-radius:10px;border:1px solid var(--border,#ddd);
        background:transparent;font-size:14px;cursor:pointer;font-weight:500">
        ↻ Попробовать снова</button>` : ''}
    </div>`;
}
```

## Step 2: Confirmation & Undo

```javascript
/**
 * Destructive actions: ALWAYS confirm OR provide undo
 * Rule: if action takes < 3 sec to undo → use undo toast
 *       if action is permanent → use confirmation dialog
 */

// UNDO TOAST — for delete, archive, mark-as-read
function showUndoToast(message, undoFn, duration = 5000) {
  const existing = document.querySelector('.undo-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span style="flex:1;font-size:14px">${message}</span>
    <button id="undo-btn" style="
      background:none;border:none;color:var(--accent,#3b82f6);
      font-weight:600;font-size:14px;cursor:pointer;padding:4px 8px">
      Отменить</button>`;
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);
    display:flex;align-items:center;gap:12px;padding:12px 16px;
    background:var(--toast-bg,#1a1a1a);color:#fff;border-radius:12px;
    box-shadow:0 4px 20px rgba(0,0,0,0.25);z-index:9999;
    max-width:calc(100vw - 32px);transition:transform .3s cubic-bezier(0.34,1.56,0.64,1)`;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.style.transform = 'translateX(-50%) translateY(0)');

  let undone = false;
  toast.querySelector('#undo-btn').onclick = () => { undone = true; undoFn(); dismiss(); };

  const dismiss = () => {
    toast.style.transform = 'translateX(-50%) translateY(100px)';
    setTimeout(() => toast.remove(), 300);
  };

  setTimeout(() => { if (!undone) dismiss(); }, duration);
}

// Usage:
// deleteSubscription(id);
// showUndoToast('Подписка удалена', () => restoreSubscription(id));


// CONFIRMATION DIALOG — for permanent actions
function showConfirm(config) {
  return new Promise((resolve) => {
    const { title, message, confirmText = 'Удалить', cancelText = 'Отмена', danger = true } = config;
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.4);
      z-index:9999;display:flex;align-items:center;justify-content:center;
      padding:16px;animation:fadeIn .2s ease`;
    overlay.innerHTML = `<div style="
      background:var(--bg,#fff);border-radius:16px;padding:24px;
      max-width:320px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.2);
      animation:slideUp .25s cubic-bezier(0.34,1.56,0.64,1)">
      <h3 style="margin:0 0 8px;font-size:17px;font-weight:600">${title}</h3>
      <p style="margin:0 0 20px;font-size:14px;color:var(--text-secondary,#666);line-height:1.5">${message}</p>
      <div style="display:flex;gap:8px">
        <button id="cancel-btn" style="flex:1;padding:12px;border-radius:10px;
          border:1px solid var(--border,#ddd);background:transparent;
          font-size:15px;font-weight:500;cursor:pointer">${cancelText}</button>
        <button id="confirm-btn" style="flex:1;padding:12px;border-radius:10px;border:none;
          background:${danger ? '#ef4444' : 'var(--accent,#3b82f6)'};color:#fff;
          font-size:15px;font-weight:600;cursor:pointer">${confirmText}</button>
      </div></div>`;

    overlay.querySelector('#cancel-btn').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#confirm-btn').onclick = () => { overlay.remove(); resolve(true); };
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    document.body.appendChild(overlay);
  });
}

// Usage:
// const ok = await showConfirm({
//   title: 'Удалить подписку?',
//   message: 'Netflix будет удалён. Это действие нельзя отменить.',
//   confirmText: 'Удалить'
// });
// if (ok) deleteForever(id);
```

## Step 3: Form Validation & Input UX

```javascript
/**
 * Real-time validation — validate as user types, not on submit
 * Show errors BELOW input, not in alert()
 */
const Validate = {
  required: (v) => v?.trim() ? null : 'Обязательное поле',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Некорректный email',
  minLength: (n) => (v) => v.length >= n ? null : `Минимум ${n} символов`,
  maxLength: (n) => (v) => v.length <= n ? null : `Максимум ${n} символов`,
  number: (v) => !isNaN(parseFloat(v)) ? null : 'Введите число',
  positiveNumber: (v) => parseFloat(v) > 0 ? null : 'Должно быть больше нуля',
  url: (v) => !v || /^https?:\/\//.test(v) ? null : 'Начните с https://',
  price: (v) => /^\d+([.,]\d{1,2})?$/.test(v) ? null : 'Формат: 199 или 199.99',
};

/**
 * Smart input — debounced validation, error display, auto-format
 */
function setupSmartInput(input, validators = [], opts = {}) {
  const { debounce = 300, formatFn = null } = opts;
  let timeout;

  const errorEl = document.createElement('div');
  errorEl.style.cssText = 'font-size:12px;color:#ef4444;margin-top:4px;min-height:16px;transition:opacity .2s';
  input.parentNode.insertBefore(errorEl, input.nextSibling);

  const validate = () => {
    const val = input.value;
    for (const v of validators) {
      const err = v(val);
      if (err) {
        errorEl.textContent = err;
        errorEl.style.opacity = '1';
        input.style.borderColor = '#ef4444';
        return false;
      }
    }
    errorEl.style.opacity = '0';
    input.style.borderColor = '';
    return true;
  };

  input.addEventListener('input', () => {
    if (formatFn) input.value = formatFn(input.value);
    clearTimeout(timeout);
    timeout = setTimeout(validate, debounce);
  });
  input.addEventListener('blur', validate);
  return validate;
}

// Usage:
// setupSmartInput(priceInput, [Validate.required, Validate.price], {
//   formatFn: (v) => v.replace(',', '.').replace(/[^\d.]/g, '')
// });
```

## Step 4: Micro-interactions

```javascript
/**
 * Haptic feedback (mobile vibration)
 */
function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  const patterns = { light: 10, medium: 20, heavy: 40, error: [30, 50, 30], success: [10, 30, 10] };
  navigator.vibrate(patterns[type] || 10);
}

/**
 * Pull-to-refresh
 */
function setupPullToRefresh(container, onRefresh) {
  let startY = 0, pulling = false, threshold = 80;
  const indicator = document.createElement('div');
  indicator.style.cssText = 'text-align:center;padding:12px;font-size:13px;color:var(--text-secondary,#999);overflow:hidden;height:0;transition:height .3s';
  container.prepend(indicator);

  container.addEventListener('touchstart', (e) => {
    if (container.scrollTop === 0) { startY = e.touches[0].clientY; pulling = true; }
  });
  container.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0 && dy < 150) {
      indicator.style.height = dy + 'px';
      indicator.textContent = dy > threshold ? '↑ Отпустите для обновления' : '↓ Потяните для обновления';
    }
  });
  container.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (parseInt(indicator.style.height) > threshold) {
      indicator.textContent = '⟳ Обновление...';
      indicator.style.height = '48px';
      haptic('medium');
      await onRefresh();
    }
    indicator.style.height = '0';
  });
}

/**
 * Swipe-to-delete on list items
 */
function setupSwipeToDelete(listItem, onDelete) {
  let startX = 0, currentX = 0, swiping = false;
  const deleteZone = document.createElement('div');
  deleteZone.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:80px;background:#ef4444;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;border-radius:0 12px 12px 0;opacity:0;transition:opacity .2s';
  deleteZone.textContent = 'Удалить';
  listItem.style.position = 'relative';
  listItem.style.overflow = 'hidden';
  listItem.appendChild(deleteZone);

  listItem.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; swiping = true; });
  listItem.addEventListener('touchmove', (e) => {
    if (!swiping) return;
    currentX = startX - e.touches[0].clientX;
    if (currentX > 0 && currentX < 100) {
      listItem.firstElementChild.style.transform = `translateX(-${currentX}px)`;
      deleteZone.style.opacity = currentX > 60 ? '1' : '0.5';
    }
  });
  listItem.addEventListener('touchend', () => {
    swiping = false;
    if (currentX > 60) { haptic('medium'); onDelete(); }
    else { listItem.firstElementChild.style.transform = ''; deleteZone.style.opacity = '0'; }
    currentX = 0;
  });
}
```

## Step 5: Data Persistence & Sync

```javascript
/**
 * Auto-save with debounce — never lose user's work
 */
function createAutoSave(key, saveInterval = 1000) {
  let timeout, lastSaved = null;

  return {
    save(data) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        try {
          const json = JSON.stringify(data);
          if (json !== lastSaved) {
            localStorage.setItem(key, json);
            lastSaved = json;
            // Visual indicator
            const dot = document.querySelector('.save-indicator');
            if (dot) { dot.textContent = '✓ Сохранено'; setTimeout(() => dot.textContent = '', 2000); }
          }
        } catch (e) {
          if (e.name === 'QuotaExceededError') {
            showUndoToast('Хранилище переполнено. Удалите старые данные', null, 5000);
          }
        }
      }, saveInterval);
    },
    load() {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    clear() { localStorage.removeItem(key); lastSaved = null; }
  };
}

/**
 * Data export/import (JSON, CSV)
 */
function exportData(data, filename, format = 'json') {
  let content, mime;
  if (format === 'json') {
    content = JSON.stringify(data, null, 2);
    mime = 'application/json';
  } else if (format === 'csv') {
    const keys = Object.keys(data[0] || {});
    content = keys.join(',') + '\n' + data.map(row => keys.map(k => `"${row[k] || ''}"`).join(',')).join('\n');
    mime = 'text/csv';
  }
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(accept = '.json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      const text = await file.text();
      try { resolve(JSON.parse(text)); } catch { resolve(null); }
    };
    input.click();
  });
}
```

## Non-Negotiable Acceptance Criteria
- [ ] Every list handles EMPTY state (icon + text + action button)
- [ ] Every async operation shows LOADING state (skeleton, not spinner)
- [ ] Every error shows user-friendly message with retry (not alert())
- [ ] Destructive actions have UNDO toast or confirmation dialog
- [ ] Form inputs validate in real-time (not on submit)
- [ ] Auto-save enabled (user never loses work)
- [ ] Data export available (JSON minimum)
- [ ] Pull-to-refresh on main lists (mobile)
- [ ] Swipe-to-delete on list items (mobile)
- [ ] Haptic feedback on significant actions (mobile)
