---
name: pwa-convert
kind: tactical
description: "Add PWA features (manifest, SW, offline) before wrapping."
---
# PWA Convert

## Add manifest.json
```json
{"name":"{App}","short_name":"{Short}","start_url":"/index.html",
 "display":"fullscreen","orientation":"{detect}",
 "background_color":"#0a0a12","theme_color":"#0a0a12",
 "icons":[{"src":"icon-192.png","sizes":"192x192"},
          {"src":"icon-512.png","sizes":"512x512"}]}
```

## Add sw.js
```javascript
const CACHE='v1';
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(['/','index.html',/*all assets*/]))));
self.addEventListener('fetch',e=>e.respondWith(
  caches.match(e.request).then(r=>r||fetch(e.request))));
```

## Link in index.html
```html
<link rel="manifest" href="manifest.json">
<script>navigator.serviceWorker?.register('sw.js')</script>
```

## Non-Negotiable
- [ ] manifest with start_url
- [ ] 192+512 icons
- [ ] SW caches all assets
- [ ] Works offline after first load
