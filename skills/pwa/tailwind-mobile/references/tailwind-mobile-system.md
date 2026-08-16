# Tailwind Mobile Design System

## tailwind.config.ts

```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a5f' },
        surface: { light: '#ffffff', dark: '#1a1a2e' },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      minHeight: { 'touch': '44px' },
      minWidth: { 'touch': '44px' },
    },
  },
  plugins: [],
} satisfies Config;
```

## App Shell Layout

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  let { children } = $props();
</script>

<div class="flex min-h-screen flex-col bg-surface-light dark:bg-surface-dark">
  <!-- Status bar spacer for Capacitor -->
  <div class="h-safe-top bg-brand-600 dark:bg-brand-900"></div>

  <!-- Main content area -->
  <main class="flex-1 overflow-y-auto px-safe-left pr-safe-right pb-20">
    {@render children()}
  </main>

  <!-- Bottom Navigation -->
  <nav class="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white pb-safe-bottom dark:border-gray-700 dark:bg-gray-900">
    <div class="flex items-center justify-around py-2">
      <a href="/" class="flex min-h-touch min-w-touch flex-col items-center justify-center p-2 text-xs">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
        </svg>
        <span>Главная</span>
      </a>
      <!-- repeat for other tabs -->
    </div>
  </nav>
</div>
```

## Dark Mode Toggle

```svelte
<script lang="ts">
  import { browser } from '$app/environment';

  let dark = $state(false);

  if (browser) {
    dark = localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }

  function toggle() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }
</script>

<button onclick={toggle} class="min-h-touch min-w-touch rounded-full p-2" aria-label="Toggle dark mode">
  {dark ? '☀️' : '🌙'}
</button>
```

## Pull-to-Refresh

```svelte
<script lang="ts">
  let startY = 0;
  let pulling = $state(false);
  let refreshing = $state(false);

  function onTouchStart(e: TouchEvent) { startY = e.touches[0].clientY; }
  function onTouchMove(e: TouchEvent) {
    if (window.scrollY === 0 && e.touches[0].clientY - startY > 60) pulling = true;
  }
  async function onTouchEnd() {
    if (pulling) {
      refreshing = true;
      pulling = false;
      await new Promise(r => setTimeout(r, 1000)); // replace with actual fetch
      refreshing = false;
    }
  }
</script>

<div ontouchstart={onTouchStart} ontouchmove={onTouchMove} ontouchend={onTouchEnd}>
  {#if refreshing}
    <div class="flex justify-center py-4">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></div>
    </div>
  {/if}
  <slot />
</div>
```
