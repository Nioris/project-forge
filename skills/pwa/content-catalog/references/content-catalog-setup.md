# Content Catalog — Full Reference

## PocketBase Schema

```json
[
  {
    "name": "catalog_items",
    "type": "base",
    "schema": [
      { "name": "title", "type": "text", "required": true },
      { "name": "slug", "type": "text", "required": true },
      { "name": "description", "type": "text" },
      { "name": "content", "type": "editor" },
      { "name": "category", "type": "relation", "options": { "collectionId": "categories" } },
      { "name": "tags", "type": "relation", "options": { "collectionId": "tags", "maxSelect": 10 } },
      { "name": "cover_image", "type": "file", "options": { "maxSelect": 1 } },
      { "name": "price", "type": "number" },
      { "name": "is_free", "type": "bool" },
      { "name": "status", "type": "select", "options": { "values": ["draft", "published", "archived"] } },
      { "name": "sort_order", "type": "number" }
    ],
    "indexes": ["CREATE INDEX idx_catalog_status ON catalog_items (status)", "CREATE INDEX idx_catalog_slug ON catalog_items (slug)"]
  },
  {
    "name": "categories",
    "type": "base",
    "schema": [
      { "name": "name", "type": "text" },
      { "name": "slug", "type": "text" },
      { "name": "icon", "type": "text" },
      { "name": "parent", "type": "relation", "options": { "collectionId": "categories" } }
    ]
  },
  {
    "name": "tags",
    "type": "base",
    "schema": [
      { "name": "name", "type": "text" },
      { "name": "slug", "type": "text" }
    ]
  },
  {
    "name": "favorites",
    "type": "base",
    "schema": [
      { "name": "user", "type": "relation", "options": { "collectionId": "users" } },
      { "name": "item", "type": "relation", "options": { "collectionId": "catalog_items" } }
    ]
  }
]
```

## Server Load with Filters

```ts
// src/routes/catalog/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const category = url.searchParams.get('category') || '';
  const tag = url.searchParams.get('tag') || '';
  const search = url.searchParams.get('q') || '';
  const page = Number(url.searchParams.get('page') || '1');
  const perPage = 20;

  const filters: string[] = ['status = "published"'];
  if (category) filters.push(`category.slug = "${category}"`);
  if (tag) filters.push(`tags.slug ?= "${tag}"`);
  if (search) filters.push(`(title ~ "${search}" || description ~ "${search}")`);

  const items = await locals.pb.collection('catalog_items').getList(page, perPage, {
    filter: filters.join(' && '),
    sort: '-created',
    expand: 'category,tags',
  });

  const categories = await locals.pb.collection('categories').getFullList({ sort: 'name' });
  const tags = await locals.pb.collection('tags').getFullList({ sort: 'name' });

  return {
    items: structuredClone(items),
    categories: structuredClone(categories),
    tags: structuredClone(tags),
    filters: { category, tag, search, page },
  };
};
```

## Filter Component

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { categories, tags, filters }: any = $props();

  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams($page.url.searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page'); // reset pagination
    goto(`?${params.toString()}`, { replaceState: true, noScroll: true });
  }
</script>

<div class="space-y-4">
  <!-- Search -->
  <input type="search" value={filters.search} placeholder="Поиск..."
    onchange={(e) => applyFilter('q', e.currentTarget.value)}
    class="w-full rounded-lg border px-4 py-3" />

  <!-- Categories -->
  <div class="flex flex-wrap gap-2">
    <button onclick={() => applyFilter('category', '')}
      class="rounded-full px-3 py-1 text-sm {!filters.category ? 'bg-blue-600 text-white' : 'bg-gray-100'}">
      Все
    </button>
    {#each categories as cat}
      <button onclick={() => applyFilter('category', cat.slug)}
        class="rounded-full px-3 py-1 text-sm {filters.category === cat.slug ? 'bg-blue-600 text-white' : 'bg-gray-100'}">
        {cat.name}
      </button>
    {/each}
  </div>
</div>
```
