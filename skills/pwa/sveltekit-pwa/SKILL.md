---
name: sveltekit-pwa
description: >
  Full PWA setup for SvelteKit 2.x with @vite-pwa/sveltekit, service workers, manifest generation,
  offline shell, install prompts, and asset caching. Use this skill whenever someone asks about PWA,
  installable app, offline support, service workers, workbox, manifest, add to homescreen, or app shell
  in a SvelteKit context.
---

# SvelteKit PWA Skill

Production PWA on SvelteKit 2.x using `@vite-pwa/sveltekit`.

## Critical Decisions

- **adapter-static is preferred** for offline-first PWAs — all prerendered pages enter SW precache. adapter-node requires explicit caching of each route.
- Set `serviceWorker: { register: false }` in `svelte.config.js` to prevent double-registration with vite-pwa.
- Import `virtual:pwa-register` inside `onMount()` only (SSR incompatible).
- For hybrid apps: prerender content pages (`export const prerender = true`), keep auth/dashboard SSR.

## Strategy Selection

| Scenario | Strategy | Why |
|---|---|---|
| Content site, simple offline | `generateSW` | Zero-code Workbox |
| Offline-first app + Dexie + Background Sync | `injectManifest` | Full SW control |
| Capacitor hybrid | `injectManifest` | Deep linking + push |

## Workbox Caching Strategies

| Strategy | Use for | Example |
|---|---|---|
| **CacheFirst** | Versioned JS/CSS, fonts, images | Static assets with cache-busting |
| **NetworkFirst** | HTML pages, API data | Content that must be fresh when online |
| **StaleWhileRevalidate** | Avatars, non-critical | Slightly stale is acceptable |

## Russian PWA Manifest Notes

`short_name` displays on home screen — keep to **~12 Cyrillic characters** (wider glyphs than Latin). Set `lang: "ru"` and `dir: "ltr"` explicitly. Always include a **maskable icon** for Android adaptive icons.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — serviceWorker.register: false in svelte.config.js.** No double-registration. Vite-pwa handles it.
2. **E — Every static + prerendered asset precached.** `client/**` and `prerendered/**/*.html` in globPatterns. Verify in generated `sw.js`.
3. **R — Refresh prompt fires within 30 s on update.** Deploy v2, open existing tab, confirm toast appears.
4. **U — Under 100 ms offline TTI.** Lighthouse PWA audit ≥ 90. adapter-static used for offline-first.
5. **D — devOptions enabled for development.** `devOptions: { enabled: true }` in PWA config for SW testing.
6. **D — Dynamic API responses runtime-cached.** NetworkFirst for API, CacheFirst for images, StaleWhileRevalidate for fonts.
7. **A — All icons from single source.** `pwa-assets-generator` produces all sizes. Maskable icon included.

## References

- `references/setup.md` — Full vite.config.ts, svelte.config.js, ReloadPrompt, injectManifest SW, adapter-node post-build.
