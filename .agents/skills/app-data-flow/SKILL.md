---
name: app-data-flow
kind: tactical
description: "App data management: search, filter, sort, pagination, virtual scroll, categories, tags, statistics/analytics dashboards. Makes data-heavy apps fast and navigable. Use when app…"
---

# App Data Flow

## Purpose
Apps with 10 items feel fine. Apps with 500 items need search, filters, sort, and smart rendering. This skill adds all of it with ready-to-use code.

## Step 1: Search (instant, fuzzy, highlight)

```javascript
/**
 * Instant search with debounce + result highlighting
 * Works on any array of objects
 */
function createSearch(items, searchFields, renderFn) {
  let timeout;

  return function onSearch(query) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (!query.trim()) { renderFn(items); return; }

      const q = query.toLowerCase().trim();
      const words = q.split(/\s+/);

      const results = items
        .map(item => {
          // Score: how many words match, and where
          let score = 0;
          for (const word of words) {
            for (const field of searchFields) {
              const val = String(item[field] || '').toLowerCase();
              if (val === word) score += 10;           // exact match
              else if (val.startsWith(word)) score += 5; // starts with
              else if (val.includes(word)) score += 2;   // contains
            }
          }
          return { item, score };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(r => r.item);

      renderFn(results, query);
    }, 150); // debounce 150ms
  };
}

/**
 * Highlight matching text in results
 */
function highlightMatch(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark style="background:#fef08a;padding:0 2px;border-radius:2px">$1</mark>');
}

// Usage:
// const search = createSearch(subscriptions, ['name', 'category'], renderList);
// searchInput.addEventListener('input', (e) => search(e.target.value));
```

## Step 2: Filter System

```javascript
/**
 * Multi-criteria filter — combine any filters
 * Returns new array (never mutates original)
 */
function createFilterSystem(items) {
  const activeFilters = {};

  return {
    /** Add/update a filter */
    set(key, filterFn) {
      if (filterFn === null) delete activeFilters[key];
      else activeFilters[key] = filterFn;
      return this.apply();
    },

    /** Remove a filter */
    remove(key) {
      delete activeFilters[key];
      return this.apply();
    },

    /** Clear all filters */
    clear() {
      Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
      return this.apply();
    },

    /** Apply all active filters */
    apply() {
      let result = items;
      for (const fn of Object.values(activeFilters)) {
        result = result.filter(fn);
      }
      return result;
    },

    /** Check if any filters are active */
    get hasFilters() { return Object.keys(activeFilters).length > 0; },
    get count() { return Object.keys(activeFilters).length; },
  };
}

// Usage for subscriptions app:
// const filters = createFilterSystem(subscriptions);
//
// // By category
// filters.set('category', s => s.category === 'Развлечения');
//
// // By price range
// filters.set('price', s => s.price >= 100 && s.price <= 500);
//
// // By status
// filters.set('active', s => s.active === true);
//
// // By date range
// filters.set('date', s => new Date(s.nextPayment) <= nextWeek);
//
// const filtered = filters.apply();
// renderList(filtered);

/**
 * Filter chips UI — shows active filters as removable chips
 */
function renderFilterChips(container, filters, onRemove) {
  container.innerHTML = Object.entries(filters).map(([key, label]) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;
      padding:6px 12px;border-radius:20px;font-size:13px;
      background:var(--accent-bg,#eff6ff);color:var(--accent,#3b82f6);
      border:1px solid var(--accent-border,#bfdbfe);cursor:pointer"
      onclick="(${onRemove})('${key}')">
      ${label}
      <span style="font-size:16px;line-height:1;margin-left:2px">×</span>
    </span>`
  ).join(' ');
}
```

## Step 3: Sort

```javascript
/**
 * Multi-field sort with direction toggle
 */
function createSortSystem() {
  let currentField = null;
  let direction = 'asc'; // asc | desc

  return {
    sort(items, field, customCompare = null) {
      if (field === currentField) {
        direction = direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentField = field;
        direction = 'asc';
      }

      return [...items].sort((a, b) => {
        if (customCompare) return customCompare(a, b) * (direction === 'desc' ? -1 : 1);

        let va = a[field], vb = b[field];
        // Auto-detect type
        if (va instanceof Date || !isNaN(Date.parse(va))) {
          va = new Date(va).getTime(); vb = new Date(vb).getTime();
        } else if (typeof va === 'string') {
          va = va.toLowerCase(); vb = vb.toLowerCase();
        }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === 'desc' ? -cmp : cmp;
      });
    },

    get field() { return currentField; },
    get dir() { return direction; },
  };
}

// Sort presets for common app types:
const SORT_OPTIONS = {
  subscriptions: [
    { field: 'price', label: 'По цене' },
    { field: 'nextPayment', label: 'По дате списания' },
    { field: 'name', label: 'По названию' },
    { field: 'category', label: 'По категории' },
  ],
  notes: [
    { field: 'updatedAt', label: 'По изменению' },
    { field: 'createdAt', label: 'По дате создания' },
    { field: 'title', label: 'По названию' },
    { field: 'pinned', label: 'Закреплённые сверху' },
  ],
};
```

## Step 4: Statistics Dashboard

```javascript
/**
 * Simple analytics for any data collection
 * Generates summary cards + chart data
 */
function calculateStats(items, config) {
  const { valueField, dateField, categoryField, periodDays = 30 } = config;
  const now = Date.now();
  const periodMs = periodDays * 86400000;

  // Current period items
  const current = items.filter(i => now - new Date(i[dateField]).getTime() < periodMs);
  const previous = items.filter(i => {
    const t = now - new Date(i[dateField]).getTime();
    return t >= periodMs && t < periodMs * 2;
  });

  // Totals
  const total = items.reduce((s, i) => s + (parseFloat(i[valueField]) || 0), 0);
  const periodTotal = current.reduce((s, i) => s + (parseFloat(i[valueField]) || 0), 0);
  const prevTotal = previous.reduce((s, i) => s + (parseFloat(i[valueField]) || 0), 0);
  const change = prevTotal > 0 ? ((periodTotal - prevTotal) / prevTotal * 100).toFixed(0) : null;

  // By category
  const byCategory = {};
  items.forEach(i => {
    const cat = i[categoryField] || 'Другое';
    byCategory[cat] = (byCategory[cat] || 0) + (parseFloat(i[valueField]) || 0);
  });

  // By month (last 6 months)
  const byMonth = {};
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const key = d.toLocaleString('ru', { month: 'short' });
    byMonth[key] = 0;
  }
  items.forEach(i => {
    const d = new Date(i[dateField]);
    const key = d.toLocaleString('ru', { month: 'short' });
    if (key in byMonth) byMonth[key] += parseFloat(i[valueField]) || 0;
  });

  return {
    total, periodTotal, prevTotal, change,
    count: items.length,
    average: items.length ? (total / items.length).toFixed(0) : 0,
    byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
    byMonth,
  };
}

// Usage for subscriptions:
// const stats = calculateStats(subscriptions, {
//   valueField: 'price', dateField: 'startDate',
//   categoryField: 'category', periodDays: 30
// });
// → stats.total = 4850 ₽/мес
// → stats.byCategory = [['Развлечения', 1500], ['Музыка', 600], ...]
// → stats.byMonth = { 'окт': 4200, 'ноя': 4500, 'дек': 4850 }
// → stats.change = '+8' (% vs previous period)
```

## Step 5: Virtual Scroll (for 100+ items)

```javascript
/**
 * Virtual scroll — renders only visible items
 * Handles 10,000+ items at 60fps
 */
function createVirtualList(container, items, renderItem, itemHeight = 64) {
  const totalHeight = items.length * itemHeight;
  const viewport = container.clientHeight;
  const overscan = 5; // render N extra items above/below

  const inner = document.createElement('div');
  inner.style.height = totalHeight + 'px';
  inner.style.position = 'relative';
  container.innerHTML = '';
  container.appendChild(inner);
  container.style.overflow = 'auto';

  function render() {
    const scrollTop = container.scrollTop;
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIdx = Math.min(items.length, Math.ceil((scrollTop + viewport) / itemHeight) + overscan);

    // Remove out-of-view elements
    inner.querySelectorAll('[data-idx]').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      if (idx < startIdx || idx >= endIdx) el.remove();
    });

    // Add missing elements
    for (let i = startIdx; i < endIdx; i++) {
      if (inner.querySelector(`[data-idx="${i}"]`)) continue;
      const el = renderItem(items[i], i);
      el.dataset.idx = i;
      el.style.position = 'absolute';
      el.style.top = (i * itemHeight) + 'px';
      el.style.left = '0';
      el.style.right = '0';
      el.style.height = itemHeight + 'px';
      inner.appendChild(el);
    }
  }

  container.addEventListener('scroll', render, { passive: true });
  render();
  return { refresh: () => { inner.style.height = items.length * itemHeight + 'px'; render(); } };
}
```

## Non-Negotiable Acceptance Criteria
- [ ] Search works instantly (<200ms) with debounce
- [ ] Search highlights matching text in results
- [ ] Filter chips show active filters with × to remove
- [ ] Multiple filters combine (AND logic)
- [ ] Sort toggles direction on repeated tap
- [ ] Stats dashboard shows: total, period change %, by category, by month
- [ ] Lists with 100+ items use virtual scroll
- [ ] Empty search results show helpful message
- [ ] Filter/sort state persists (localStorage)
