---
name: app-search
kind: architectural
description: "Search functionality для tools/reference apps. Local search (Fuse.js fuzzy / Lunr index), filter/sort, search history, autocomplete. ОБЯЗАТЕЛЬНО для tools/reference apps где…"
---

# App Search — поиск как primary interaction

## Зачем

Для **tools / reference apps** search is THE feature:
- Нумерология: search by number/name
- Садовник: search by plant
- Словарь: search by word
- Документация / wiki: search by topic

Без качественного search:
- D7 retention падает на 30-40% (юзер не находит → уходит)
- Search success rate < 70% = product failure для этой категории
- Каждая search query без result = потенциальная feature request

## Когда вызывать

- **Tools / reference apps** — обязательно после `$start` Step 6.5+
- **Any app with >50 records** — productivity apps, business apps когда списки большие
- **Existing apps** — если search есть но performance страдает или результаты плохие

## Pipeline

### Шаг 1 — Read context

```
wiki/_map.md                       # category, type
wiki/architecture/data-model.md    # what entities to search
wiki/architecture/metrics.md       # search success rate target
```

### Шаг 2 — Choose search strategy

3 levels по сложности:

#### Level 1: Linear filter (для <500 records)

```typescript
// Brute force, runs on every keystroke
function search(query: string, items: T[]): T[] {
  const q = query.toLowerCase();
  return items.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.description?.toLowerCase().includes(q)
  );
}
```

Pros: zero deps, instant, easy.
Cons: slow on >500 records, no fuzzy match (typo = no result).
Good for: small datasets (settings list, recent items).

#### Level 2: Fuse.js (fuzzy, для 500-10K records)

```typescript
import Fuse from 'fuse.js';

const fuse = new Fuse(items, {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'description', weight: 1 },
    { name: 'tags', weight: 0.5 },
  ],
  threshold: 0.4,  // 0 = exact, 1 = anything
  ignoreLocation: true,
  minMatchCharLength: 2,
});

const results = fuse.search(query).map(r => r.item);
```

Pros: typo tolerance, weighted fields, ranking.
Cons: dependency (~25KB), slower than Level 1.
Good for: most apps. Default choice.

#### Level 3: Lunr / FlexSearch / SQLite FTS (для 10K+ records)

```typescript
import lunr from 'lunr';

const idx = lunr(function() {
  this.ref('id');
  this.field('title', { boost: 10 });
  this.field('description');
  this.field('tags');

  items.forEach(item => this.add(item));
});

// Build once on app start, reuse
const results = idx.search(query).map(r => items.find(i => i.id === r.ref));
```

Pros: pre-built index, very fast, ranking, advanced query syntax (AND, OR, boost).
Cons: no fuzzy by default, more complex setup, larger dep.
Good for: large datasets, content-heavy apps (docs sites, knowledge bases).

### Шаг 3 — UI patterns

Generate search UI components:

#### Search input

```
┌─────────────────────────────────────┐
│ 🔍 Поиск...                    [⨯]  │
└─────────────────────────────────────┘
   ↓ (typing)
┌─────────────────────────────────────┐
│ 🔍 нумер|                      [⨯]  │
├─────────────────────────────────────┤
│ Recent: нумерология имени       │
│ Recent: нумер судьбы           │
│ Suggested: нумерология числа   │
└─────────────────────────────────────┘
```

Components:
- Search input with clear button (✕)
- Debounce input (300ms) to avoid running search on every keystroke
- Recent searches dropdown (from localStorage, last 5-10)
- Autocomplete suggestions (top matching titles)
- "No results" empty state with suggestions

#### Search results

```
[20 results found]
  ↑ count + sort options

[Result 1 — title with bold matched terms]
  Description preview... matched terms highlighted
  Category | Tags

[Result 2 — ...]

[Load more] OR [Pagination]
```

Components:
- Result count + active filters
- Sort options (relevance, date, alphabetical)
- Filter chips (category, tags, date range)
- Highlighted matches in title/description
- Empty state: "Ничего не найдено по запросу 'X'. Попробуй: ..."

### Шаг 4 — Generate `src/search/` structure

```
src/search/
├── index.ts           # Public API: search(query, options), addToHistory(), getHistory()
├── engine.ts          # Search engine (Fuse / Lunr / linear)
├── history.ts         # Recent searches via localStorage
├── highlights.ts      # Match highlighting in results
└── types.ts
```

### Шаг 5 — Performance considerations

For 1000+ records:
- **Build index ASYNC on app start** — don't block UI
- **Debounce input** (300ms) — don't search on every keystroke
- **Virtual scroll for results** — render only visible
- **Cache last query results** — instant re-render if same query
- **Web Worker for index** — for 10K+ records, move search off main thread

For data refresh (when records change):
- **Incremental index updates** — Fuse: rebuild Fuse instance only on bulk change
- **Lunr: rebuild index** only periodically (Lunr index is immutable)

### Шаг 6 — Search analytics

Track для funnel analysis:

```typescript
// On every search
analytics.track('search_query', {
  query: query,
  results_count: results.length,
  category: activeCategory,
});

// On result click
analytics.track('search_result_click', {
  query: query,
  result_position: index,
  result_id: result.id,
});

// On no results
analytics.track('search_no_results', {
  query: query,
  active_filters: filters,
});
```

Key metric: **search success rate** = (queries that led to result click) / (total queries).

Target: 70%+. Below 70% means:
- Index missing relevant data
- Synonyms not handled
- Typos/fuzzy not aggressive enough
- Results page UX bad (user не нашёл нужное в списке)

### Шаг 7 — Document

Save to `wiki/design/search.md`:

```markdown
# Search Design — {Project}

## Strategy: Level {1/2/3}

## Target metrics
- Search success rate: 70%+
- Median time-to-result: <2 seconds
- Average result position clicked: <5

## Indexed entities

| Entity | Fields indexed | Weights | Notes |
|---|---|---|---|
| Article | title, description, tags | 10 / 5 / 2 | Most important |
| ... |

## Synonyms (manually maintained)
- "то" → "это"
- "config" → "settings"
- ...

## Filter facets
- Category (8 options)
- Date range
- Tags (multi-select)

## Empty states
- "No results": suggest similar queries based on Levenshtein distance
- "First search": show popular searches or recent
```

## Common pitfalls

1. **Linear search for 5000+ items** — UI freezes. Use Fuse or Lunr.

2. **No debounce** — search runs on every keystroke, kills mobile devices. Always debounce 300ms.

3. **Synonyms not handled** — "settings" не находит "preferences". Maintain synonyms list manually.

4. **No "no results" recovery** — empty state without alternatives. Always suggest fallbacks.

5. **Search history privacy** — for sensitive apps (health, finance) don't store search history without explicit opt-in.

6. **Search не локализован** — поиск по русским словам не работает в английском словаре. Handle multi-lang search per current `setLang()`.

## Non-Negotiable

- [ ] Choose Level 1/2/3 based on dataset size
- [ ] Debounce input 300ms
- [ ] "No results" empty state with suggestions
- [ ] Search history (localStorage), max last 10 entries
- [ ] Analytics events: search_query, search_result_click, search_no_results
- [ ] Match highlighting in results
- [ ] All strings через `t()` (i18n)
- [ ] Document in `wiki/design/search.md`
- [ ] If sensitive app — opt-in for history
