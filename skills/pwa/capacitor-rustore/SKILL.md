---
name: capacitor-rustore
description: >
  Capacitor 6.x build and RuStore publish for SvelteKit PWA. adapter-static with SPA fallback, Android
  signing, AAB build, RuStore Gradle plugin, deep links, and CI automation. Use this skill for RuStore,
  Android app Russia, Capacitor build, or alternative to Google Play.
---

# Capacitor RuStore Skill

Build and publish Capacitor 6.x SvelteKit app to RuStore.

## CRITICAL: SvelteKit for Capacitor

Switch to `adapter-static` with SPA fallback. Disable SSR:
```ts
// src/routes/+layout.ts
export const ssr = false;
export const prerender = true;
// svelte.config.js: adapter-static({ fallback: 'index.html' })
```

## Capacitor 6 Notes

- `androidScheme` defaults to `https` — set `http` when upgrading from v5 to avoid data loss.
- `webDir: 'build'` must match adapter-static output (not `dist`).
- Android 13+: push notifications and media require runtime permission requests.

## RuStore Requirements

- APK ≤ 5 GB, signed with consistent keystore, unique package name
- App name ≤ **30 characters**, icon **512×512px** with filled background
- Russian or English only
- RuStore **discourages pure WebView wrappers** — use Capacitor over TWA
- Moderation typically takes **~1 hour**

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Signing keystore not in Git.** Base64-encoded in CI secrets. Passwords in env vars.
2. **E — Every build uses adapter-static + ssr: false.** SPA mode with `fallback: 'index.html'`.
3. **R — RuStore publish via Gradle plugin or API.** `rustore-publish-gradle-plugin` in CI.
4. **U — Update flow: versionCode auto-incremented.** Never submit same versionCode twice.
5. **D — Deep links with assetlinks.json.** Served at `/.well-known/`. Intent filters in manifest.
6. **D — Data safety declaration completed.** Privacy policy URL. Data collection disclosure.
7. **A — APK tested on Android 8+ (API 26).** Real device test before submission.

## References

- `references/capacitor-rustore-setup.md` — Capacitor config, Gradle, signing, CI, deep links.
