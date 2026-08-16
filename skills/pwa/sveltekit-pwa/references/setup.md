# SvelteKit PWA — Full Setup Reference

## Table of Contents
1. [Dependencies](#dependencies)
2. [vite.config.ts — generateSW](#vite-config-generatesw)
3. [vite.config.ts — injectManifest](#vite-config-injectmanifest)
4. [Service Worker (injectManifest)](#service-worker)
5. [ReloadPrompt.svelte](#reloadprompt)
6. [Layout integration](#layout-integration)
7. [PWA Assets generation](#pwa-assets)
8. [adapter-node post-build](#adapter-node)
9. [Manifest customization](#manifest)

---

## Dependencies

```bash
pnpm add -D @vite-pwa/sveltekit @vite-pwa/assets-generator workbox-window workbox-precaching workbox-routing workbox-strategies
```

---

## vite.config.ts — generateSW

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: 'generateSW',
      registerType: 'prompt',           // shows update toast
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'My PWA App',
        short_name: 'MyPWA',
        description: 'Offline-first SvelteKit PWA',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png',   sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
```

---

## vite.config.ts — injectManifest

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'My PWA App',
        short_name: 'MyPWA',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png',   sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
      },
    }),
  ],
});
```

---

## Service Worker (injectManifest)

```ts
// src/service-worker.ts
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

// Precache app shell
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// API calls — network first, fall back to cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 86400 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Images — cache first
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 }),
    ],
  })
);

// Google Fonts (if used)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts' })
);

// Listen for skip waiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

---

## ReloadPrompt.svelte

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let needRefresh = $state(false);
  let offlineReady = $state(false);
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

  onMount(async () => {
    const { useRegisterSW } = await import('virtual:pwa-register/svelte');
    const { needRefresh: nr, offlineReady: or, updateServiceWorker } = useRegisterSW({
      onRegistered(r: ServiceWorkerRegistration | undefined) {
        // Check for updates every hour
        if (r) setInterval(() => r.update(), 60 * 60 * 1000);
      },
      onRegisterError(error: Error) {
        console.error('SW registration error:', error);
      },
    });

    // Subscribe to stores
    nr.subscribe((v: boolean) => (needRefresh = v));
    or.subscribe((v: boolean) => (offlineReady = v));
    updateSW = updateServiceWorker;
  });

  function close() {
    offlineReady = false;
    needRefresh = false;
  }
</script>

{#if offlineReady || needRefresh}
  <div class="fixed bottom-4 right-4 z-50 rounded-xl bg-white p-4 shadow-2xl border border-gray-200 max-w-sm" role="alert">
    {#if offlineReady}
      <p class="text-sm text-gray-700">Приложение готово к работе офлайн</p>
    {:else}
      <p class="text-sm text-gray-700">Доступно обновление приложения</p>
    {/if}
    <div class="mt-3 flex gap-2">
      {#if needRefresh}
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onclick={() => updateSW?.(true)}
        >
          Обновить
        </button>
      {/if}
      <button
        class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        onclick={close}
      >
        Закрыть
      </button>
    </div>
  </div>
{/if}
```

---

## Layout integration

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import '../app.css';

  let { children } = $props();
</script>

{#if browser}
  {#await import('$lib/components/ReloadPrompt.svelte') then { default: ReloadPrompt }}
    <ReloadPrompt />
  {/await}
{/if}

{@render children()}
```

---

## PWA Assets generation

```ts
// pwa-assets.config.ts
import { defineConfig } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[64, 'favicon.ico']] },
    maskable: { sizes: [512] },
    apple: { sizes: [180] },
  },
  images: ['public/logo.svg'],   // single source image
});
```

Generate with:
```bash
pnpx @vite-pwa/assets-generator
```

---

## adapter-node post-build

When using `@sveltejs/adapter-node`, the SW must be rebuilt after the adapter finishes:

```js
// scripts/build-pwa.js
import { copyFileSync } from 'node:fs';
import { resolveConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

async function buildPwa() {
  const config = await resolveConfig(
    { plugins: [VitePWA({ /* same options as vite.config.ts */ })] },
    'build',
    'production'
  );
  const pwaPlugin = config.plugins.find(i => i.name === 'vite-plugin-pwa')?.api;
  if (pwaPlugin?.generateSW) {
    await pwaPlugin.generateSW();
    copyFileSync('.svelte-kit/output/client/sw.js', 'build/client/sw.js');
    copyFileSync('.svelte-kit/output/client/manifest.webmanifest', 'build/client/manifest.webmanifest');
  }
}

buildPwa();
```

Add to `package.json`:
```json
{
  "scripts": {
    "build": "vite build && node scripts/build-pwa.js"
  }
}
```

---

## Manifest customization

For Russian-locale apps, add `lang` and localized `name`:

```json
{
  "lang": "ru-RU",
  "name": "Моё Приложение",
  "short_name": "МоёПрил",
  "description": "Описание приложения",
  "categories": ["productivity", "utilities"],
  "screenshots": [
    { "src": "/screenshots/desktop.png", "sizes": "1280x720", "type": "image/png", "form_factor": "wide" },
    { "src": "/screenshots/mobile.png", "sizes": "750x1334", "type": "image/png", "form_factor": "narrow" }
  ]
}
```
