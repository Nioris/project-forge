---
name: deepapp-systems
description: "Systems for building complex multi-feature web apps: data management, charts, authentication UI, settings, onboarding, data export, dark mode, notifications, search, filtering, pagination. Use when building full apps with /evolve or complex prototypes."
---

# Deep App Systems

Reusable systems for complex web applications.

## Data Layer

```javascript
class DataStore {
  constructor(key) {
    this.key = key;
    this.data = JSON.parse(localStorage.getItem(key) || '{}');
    this.listeners = [];
  }
  get(path, fallback) {
    return path.split('.').reduce((o, k) => o?.[k], this.data) ?? fallback;
  }
  set(path, value) {
    const keys = path.split('.');
    let obj = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = obj[keys[i]] || {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
    this.notify();
  }
  save() { localStorage.setItem(this.key, JSON.stringify(this.data)); }
  onChange(fn) { this.listeners.push(fn); }
  notify() { this.listeners.forEach(fn => fn(this.data)); }
  export() { return JSON.stringify(this.data, null, 2); }
  import(json) { this.data = JSON.parse(json); this.save(); this.notify(); }
  clear() { this.data = {}; this.save(); this.notify(); }
}
```

## Chart System (Canvas)

Line, bar, pie, donut charts. See CLAUDE.md for drawLineChart code.

```javascript
function drawBarChart(canvas, data, options = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 40;
  const max = Math.max(...data.map(d => d.value));
  const barW = (W - 2 * pad) / data.length * 0.7;
  const gap = (W - 2 * pad) / data.length * 0.3;
  ctx.clearRect(0, 0, W, H);
  data.forEach((d, i) => {
    const x = pad + i * (barW + gap);
    const barH = (d.value / max) * (H - 2 * pad);
    const y = H - pad - barH;
    const grad = ctx.createLinearGradient(x, y, x, H - pad);
    grad.addColorStop(0, d.color || options.color || '#6C5CE7');
    grad.addColorStop(1, (d.color || options.color || '#6C5CE7') + '80');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#636E72'; ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barW/2, H - pad + 14);
  });
}
```

## Settings / Preferences

```javascript
const DEFAULTS = { darkMode: false, sound: true, currency: '$', language: 'en' };
function getSetting(key) { return store.get('settings.' + key, DEFAULTS[key]); }
function setSetting(key, val) { store.set('settings.' + key, val); applySettings(); }
function applySettings() {
  document.body.classList.toggle('dark', getSetting('darkMode'));
}
```

## Dark Mode

```css
body.dark {
  --bg: #1E1E2E;
  --surface: #2D2D3F;
  --border: #3D3D4F;
  --text: #E8E8F0;
  --text-secondary: #A0A0B0;
  --shadow: 0 2px 8px rgba(0,0,0,0.3);
}
```

## Onboarding / Tutorial

```javascript
const ONBOARDING_STEPS = [
  { target: '#add-btn', text: 'Tap here to add your first item', position: 'bottom' },
  { target: '#chart', text: 'Your progress shows here', position: 'top' },
];
function showOnboarding() {
  if (store.get('onboarding_done')) return;
  // Show tooltip pointing at target element, advance on click
}
```

## Search and Filter

```javascript
function filterItems(items, query, filters) {
  return items.filter(item => {
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.dateFrom && new Date(item.date) < filters.dateFrom) return false;
    return true;
  });
}
```

## Responsive Layout Patterns

```css
/* Card grid — auto-fills to screen width */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
/* Bottom nav on mobile */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .bottom-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1px solid var(--border); }
  .bottom-nav button { flex: 1; padding: 12px; text-align: center; }
}
@media (min-width: 769px) {
  .bottom-nav { display: none; }
  .sidebar { display: block; width: 240px; }
}
```

## Data Export

```javascript
function exportCSV(data, headers) {
  const csv = [headers.join(','), ...data.map(row => headers.map(h => row[h]).join(','))].join('\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'export.csv'; a.click();
}
```

## Category-System mapping

| Category | Key Systems |
|----------|------------|
| Finance | DataStore, Charts (line+pie), Export, Settings |
| Utility | Settings, Dark mode |
| Health | DataStore, Charts (ring+line), Streak calendar |
| Productivity | DataStore, Drag-and-drop, Filters, Search |
| Education | DataStore, Scoring, Spaced repetition |
| Social | Animations, Randomizers |
| Tools | Clipboard, Split-pane, Syntax highlight |
