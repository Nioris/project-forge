---
name: content-catalog
description: >
  Content catalog with offline search for SvelteKit PWA. MiniSearch fuzzy search (8KB), multi-entry indexes,
  seed data with delta updates, faceted filters, and image caching. Use this skill for content catalog,
  product listing, search and filter, offline search, or "каталог контента".
---

# Content Catalog Skill

Filterable, searchable, offline-ready catalog with MiniSearch.

## Offline Search: MiniSearch (Recommended)

MiniSearch (8KB, zero deps) — prefix, fuzzy, boosting, filters:
```ts
import MiniSearch from 'minisearch';
const miniSearch = new MiniSearch({
  fields: ['name', 'description'],
  storeFields: ['id', 'name', 'category', 'thumbnailUrl'],
  searchOptions: { boost: { name: 3 }, fuzzy: 0.2, prefix: true }
});
miniSearch.addAll(await db.items.toArray());
```
Build index once on app start (~100ms for 500 items). Rebuild on data changes.

## Multi-Entry Index for Search

```ts
db.version(1).stores({
  items: '++id, category, [category+subcategory], *tags, *searchWords, dataVersion'
});
```
`*searchWords` enables prefix search on arrays. Auto-generate via Dexie hooks.

## Seed Data Strategy

- First install: `bulkAdd` from bundled JSON via `db.on('ready')`
- Returning users: delta update from `/api/catalog/delta?since=version`
- Batch inserts in chunks of 500 with `setTimeout(0)` between

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Server-side filtering for SEO.** SSR with proper URLs `/catalog?category=X&tag=Y`.
2. **E — Every filter combo = unique URL.** Browser back/forward works. Shareable links.
3. **R — Results in < 200 ms.** MiniSearch for offline, PB indexed queries for online.
4. **U — Unlimited scroll or cursor pagination.** No full-table scans.
5. **D — Data seeded with versioning.** `dataVersion` field. Delta sync on app start.
6. **D — Dynamic facet counts.** Number of items per category/tag shown alongside filters.
7. **A — Accessible filter UI.** ARIA labels, keyboard navigable, screen reader friendly.

## References

- `references/content-catalog-setup.md` — PB schema, MiniSearch, filter component, seed data, delta sync.
