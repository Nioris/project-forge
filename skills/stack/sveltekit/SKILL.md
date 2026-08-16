---
name: sveltekit-pwa
description: "SvelteKit 2.x: routing, stores, SSR/SSG, PWA, Workbox, Svelte 5 runes. Triggers on: svelte, sveltekit, PWA, routing, stores, layout, page."
---
# SvelteKit PWA

## Purpose
Production SvelteKit with PWA, offline, file-based routing, Svelte 5 runes.

## Instructions

### Step 1: Project Structure
```
src/
├── routes/
│   ├── +layout.svelte      root layout: nav, bottom tabs
│   ├── +layout.js           export const ssr = false (SPA for PWA)
│   ├── +page.svelte         home dashboard
│   ├── catalog/
│   │   ├── +page.svelte     list
│   │   └── [id]/+page.svelte detail (dynamic route)
│   └── settings/+page.svelte
├── lib/
│   ├── components/          reusable UI
│   ├── stores/              Svelte stores
│   ├── db/                  Dexie.js
│   ├── api/                 PocketBase, weather, AI
│   └── utils/               format, validate
├── app.html                 template
├── app.css                  Tailwind imports
└── service-worker.js        Workbox
```

### Step 2: Svelte 5 Runes
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  let { data, onSave } = $props();
  $effect(() => { console.log(count); });
</script>
```

### Step 3: PWA Config (vite.config.js)
```javascript
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
export default {
  plugins: [sveltekit(), SvelteKitPWA({
    registerType: 'autoUpdate',
    workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] },
    manifest: { name: 'App', short_name: 'App', lang: 'ru', display: 'standalone' }
  })]
};
```

## Non-Negotiable Acceptance Criteria
- [ ] File-based routing (+page.svelte, +layout.svelte)
- [ ] SSR disabled for PWA (ssr = false)
- [ ] PWA manifest with Russian name
- [ ] Svelte 5 runes ($state, $derived, $props, $effect)
- [ ] $lib alias for imports
