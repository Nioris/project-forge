---
name: offline-maps
description: >
  Offline maps for SvelteKit PWA with Leaflet + leaflet.offline. Legal tile sources (self-hosted, Protomaps),
  IndexedDB tile cache, background GPS via Capacitor, trail recording, and storage planning. Use this skill
  for offline maps, Leaflet, tile caching, GPS tracking, trail recording, or "карты офлайн".
---

# Offline Maps Skill

Leaflet maps with legal offline tile caching.

## ⚠️ LEGAL: OSM Tile Usage Policy

**Bulk downloading from tile.openstreetmap.org is PROHIBITED** per their usage policy.
"Download for offline" features violate it.

### Legal Alternatives

1. **Self-hosted tile server** (switch2osm.org) — full control
2. **Protomaps PMTiles** — single-file format, serverless
3. **OpenMapTiles** — self-host or commercial
4. **Commercial providers** — MapTiler, Thunderforest, Stadia Maps

## Background GPS (Capacitor)

Use `@capacitor-community/background-geolocation` (free, open-source).
Set `distanceFilter: 10` meters. **CRITICAL**: `android.useLegacyBridge: true` in Capacitor config — without it, location halts after 5 minutes on Android.

## Trail Recording

- Filter inaccurate readings (reject accuracy > 30m)
- Distance: `L.latLng(a).distanceTo(L.latLng(b))` (Haversine)
- Store coords with altitude, speed, bearing, timestamp
- Export as GeoJSON LineString

## Storage Planning

Each additional zoom level **quadruples** tile count.
10km × 10km at zoom 10–14 ≈ 200–400 tiles ≈ 5–15 MB.
Limit offline to 4–5 zoom levels. Use `updateWhenIdle: true`, `keepBuffer: 2`.

## iOS Compass

`DeviceOrientationEvent.requestPermission()` **must** be called from user gesture on iOS 13+.
Otherwise compass silently fails.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Self-hosted or licensed tiles only.** No bulk download from OSM tile servers.
2. **E — Every viewed tile cached in IndexedDB.** leaflet.offline or custom Dexie store.
3. **R — Region pre-download with progress.** User selects area + zoom range. Max 4–5 zoom levels.
4. **U — Under 500 MB cache limit.** LRU eviction at 80%. User warned.
5. **D — Device GPS works offline.** `navigator.geolocation` + background plugin for Capacitor.
6. **D — Data layer cached in Dexie.** Markers, routes, POI available offline.
7. **A — Attribution displayed.** OSM attribution always visible per license.

## References

- `references/offline-maps-setup.md` — leaflet.offline, Protomaps, background GPS, trail recording, storage.
