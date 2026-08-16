---
name: app-settings
kind: tactical
description: "App settings: dark/light theme, user preferences, font size, language, data management (export/import/clear), about page, feedback. Use when app needs settings screen or theme system. Triggers on: settings, настройки, theme, тема, dark mode, тёмная тема, preferences, export, экспорт, about, font size, язык."
---

# App Settings & Theming

## Step 1: Theme System (dark/light/auto)

```javascript
/**
 * Theme system — CSS variables + auto-detection + toggle
 * Applies to entire app via data-theme attribute on <html>
 */
const Theme = {
  STORAGE_KEY: 'app_theme',

  colors: {
    light: {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f5f5f5',
      '--bg-card': '#ffffff',
      '--text-primary': '#1a1a1a',
      '--text-secondary': '#666666',
      '--text-tertiary': '#999999',
      '--border': '#e5e5e5',
      '--accent': '#3b82f6',
      '--accent-bg': '#eff6ff',
      '--danger': '#ef4444',
      '--success': '#22c55e',
      '--warning': '#f59e0b',
      '--shadow': 'rgba(0,0,0,0.08)',
      '--toast-bg': '#1a1a1a',
      '--skeleton-base': '#e5e5e5',
      '--skeleton-shine': '#f5f5f5',
    },
    dark: {
      '--bg-primary': '#0f0f0f',
      '--bg-secondary': '#1a1a1a',
      '--bg-card': '#1e1e1e',
      '--text-primary': '#e5e5e5',
      '--text-secondary': '#999999',
      '--text-tertiary': '#666666',
      '--border': '#2a2a2a',
      '--accent': '#60a5fa',
      '--accent-bg': '#1e3a5f',
      '--danger': '#f87171',
      '--success': '#4ade80',
      '--warning': '#fbbf24',
      '--shadow': 'rgba(0,0,0,0.3)',
      '--toast-bg': '#2a2a2a',
      '--skeleton-base': '#2a2a2a',
      '--skeleton-shine': '#333333',
    }
  },

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY) || 'auto';
    this.set(saved);
    // Watch for system changes when mode is 'auto'
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (localStorage.getItem(this.STORAGE_KEY) === 'auto') this.set('auto');
    });
  },

  set(mode) {
    localStorage.setItem(this.STORAGE_KEY, mode);
    let theme;
    if (mode === 'auto') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      theme = mode;
    }
    document.documentElement.dataset.theme = theme;
    const vars = this.colors[theme];
    for (const [prop, val] of Object.entries(vars)) {
      document.documentElement.style.setProperty(prop, val);
    }
    // Update meta theme-color for mobile browser
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
      theme === 'dark' ? '#0f0f0f' : '#ffffff');
  },

  get current() {
    return localStorage.getItem(this.STORAGE_KEY) || 'auto';
  },

  toggle() {
    const modes = ['light', 'dark', 'auto'];
    const next = modes[(modes.indexOf(this.current) + 1) % modes.length];
    this.set(next);
    return next;
  },
};
```

## Step 2: User Preferences

```javascript
/**
 * Preferences manager — typed, with defaults, auto-persist
 */
function createPreferences(defaults) {
  const STORAGE_KEY = 'app_preferences';
  let prefs;

  try { prefs = { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
  catch { prefs = { ...defaults }; }

  const listeners = {};

  return {
    get(key) { return prefs[key]; },

    set(key, value) {
      const old = prefs[key];
      prefs[key] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      (listeners[key] || []).forEach(fn => fn(value, old));
    },

    /** Listen for preference changes */
    onChange(key, fn) {
      (listeners[key] = listeners[key] || []).push(fn);
    },

    getAll() { return { ...prefs }; },

    reset() {
      prefs = { ...defaults };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    },
  };
}

// Usage:
// const prefs = createPreferences({
//   theme: 'auto',
//   currency: 'RUB',
//   fontSize: 'normal',        // small | normal | large
//   notificationsEnabled: true,
//   reminderDaysBefore: 3,
//   showArchived: false,
//   sortBy: 'nextPayment',
//   sortDir: 'asc',
//   language: 'ru',
//   compactView: false,
// });
//
// prefs.onChange('fontSize', (size) => {
//   document.documentElement.style.fontSize =
//     { small: '14px', normal: '16px', large: '18px' }[size];
// });
```

## Step 3: Settings Screen Template

```javascript
/**
 * Settings page generator — renders grouped settings with controls
 * Types: toggle, select, slider, action, link, header
 */
function renderSettings(container, sections) {
  container.innerHTML = sections.map(section => `
    <div style="margin-bottom:24px">
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;
        color:var(--text-tertiary);padding:0 16px;margin:0 0 8px;font-weight:600">
        ${section.title}</h3>
      <div style="background:var(--bg-card);border-radius:12px;
        border:1px solid var(--border);overflow:hidden">
        ${section.items.map((item, i) => renderSettingItem(item, i > 0)).join('')}
      </div>
    </div>
  `).join('');
}

function renderSettingItem(item, showDivider) {
  const divider = showDivider ? 'border-top:1px solid var(--border);' : '';
  const base = `padding:14px 16px;${divider}display:flex;align-items:center;gap:12px;`;

  switch (item.type) {
    case 'toggle':
      return `<div style="${base}cursor:pointer" onclick="${item.onChange}">
        <span style="flex:1;font-size:15px;color:var(--text-primary)">${item.label}</span>
        <div style="width:44px;height:26px;border-radius:13px;padding:2px;cursor:pointer;
          background:${item.value ? 'var(--accent)' : 'var(--border)'};transition:background .2s">
          <div style="width:22px;height:22px;border-radius:11px;background:#fff;
            transition:transform .2s;transform:translateX(${item.value ? '18px' : '0'});
            box-shadow:0 1px 3px rgba(0,0,0,0.2)"></div>
        </div>
      </div>`;

    case 'select':
      return `<div style="${base}">
        <span style="flex:1;font-size:15px;color:var(--text-primary)">${item.label}</span>
        <select onchange="${item.onChange}" style="
          padding:6px 12px;border-radius:8px;border:1px solid var(--border);
          background:var(--bg-secondary);color:var(--text-primary);font-size:14px">
          ${item.options.map(o => `<option value="${o.value}" ${o.value === item.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>`;

    case 'action':
      return `<div style="${base}cursor:pointer" onclick="${item.onClick}">
        <span style="flex:1;font-size:15px;color:${item.danger ? 'var(--danger)' : 'var(--text-primary)'}">
          ${item.label}</span>
        <span style="font-size:14px;color:var(--text-tertiary)">›</span>
      </div>`;

    case 'info':
      return `<div style="${base}">
        <span style="flex:1;font-size:15px;color:var(--text-primary)">${item.label}</span>
        <span style="font-size:14px;color:var(--text-secondary)">${item.value}</span>
      </div>`;
  }
}

// Usage:
// renderSettings(container, [
//   { title: 'Оформление', items: [
//     { type:'select', label:'Тема', value:'auto', onChange:'Theme.set(this.value)',
//       options:[{value:'light',label:'Светлая'},{value:'dark',label:'Тёмная'},{value:'auto',label:'Системная'}] },
//     { type:'select', label:'Размер шрифта', value:'normal', onChange:'setFontSize(this.value)',
//       options:[{value:'small',label:'Мелкий'},{value:'normal',label:'Обычный'},{value:'large',label:'Крупный'}] },
//   ]},
//   { title: 'Уведомления', items: [
//     { type:'toggle', label:'Push-уведомления', value:true, onChange:'toggleNotifications()' },
//     { type:'select', label:'Напоминать за', value:'3', onChange:'setRemindDays(this.value)',
//       options:[{value:'1',label:'1 день'},{value:'3',label:'3 дня'},{value:'7',label:'Неделю'}] },
//   ]},
//   { title: 'Данные', items: [
//     { type:'action', label:'Экспорт данных', onClick:'exportAllData()' },
//     { type:'action', label:'Импорт данных', onClick:'importData()' },
//     { type:'action', label:'Очистить все данные', onClick:'confirmClearData()', danger:true },
//   ]},
//   { title: 'О приложении', items: [
//     { type:'info', label:'Версия', value:'1.2.0' },
//     { type:'action', label:'Написать отзыв', onClick:'openReview()' },
//     { type:'action', label:'Политика конфиденциальности', onClick:'openPrivacy()' },
//   ]},
// ]);
```

## Non-Negotiable Acceptance Criteria
- [ ] Dark/light/auto theme with smooth transition
- [ ] Theme persists in localStorage
- [ ] CSS variables used for ALL colors (no hardcoded hex)
- [ ] meta theme-color updates with theme
- [ ] Settings screen with toggle, select, action controls
- [ ] Data export (JSON) available
- [ ] Data import with validation
- [ ] "Clear all data" with confirmation dialog
- [ ] Version number displayed
- [ ] Font size preference (small/normal/large)
