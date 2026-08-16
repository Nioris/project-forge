# Offline Maps — Full Reference

## Dependencies

```bash
pnpm add leaflet
pnpm add -D @types/leaflet
```

## Tile Cache (IndexedDB via Dexie)

```ts
// src/lib/maps/tile-cache.ts
import Dexie from 'dexie';

class TileCacheDB extends Dexie {
  tiles!: Dexie.Table<{ key: string; blob: Blob; cachedAt: number }, string>;

  constructor() {
    super('tileCache');
    this.version(1).stores({ tiles: 'key, cachedAt' });
  }
}

const db = new TileCacheDB();
const MAX_CACHE_MB = 500;

export async function getCachedTile(url: string): Promise<Blob | null> {
  const record = await db.tiles.get(url);
  return record?.blob || null;
}

export async function cacheTile(url: string, blob: Blob) {
  await checkQuota();
  await db.tiles.put({ key: url, blob, cachedAt: Date.now() });
}

async function checkQuota() {
  if (navigator.storage?.estimate) {
    const { usage = 0 } = await navigator.storage.estimate();
    const usageMB = usage / (1024 * 1024);
    if (usageMB > MAX_CACHE_MB * 0.8) {
      // Evict oldest tiles
      const oldest = await db.tiles.orderBy('cachedAt').limit(1000).toArray();
      await db.tiles.bulkDelete(oldest.map(t => t.key));
    }
  }
}

export async function getCacheSize(): Promise<number> {
  const count = await db.tiles.count();
  return count;
}

export async function clearTileCache() {
  await db.tiles.clear();
}
```

## Offline Tile Layer (Leaflet)

```ts
// src/lib/maps/offline-tile-layer.ts
import L from 'leaflet';
import { getCachedTile, cacheTile } from './tile-cache';

export class OfflineTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    const url = this.getTileUrl(coords);

    getCachedTile(url).then(async (cached) => {
      if (cached) {
        tile.src = URL.createObjectURL(cached);
        done(undefined, tile);
      } else {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          await cacheTile(url, blob);
          tile.src = URL.createObjectURL(blob);
          done(undefined, tile);
        } catch (err) {
          // If offline and no cache, show blank
          tile.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualIIAAAAASUVORK5CYII=';
          done(err as Error, tile);
        }
      }
    });

    return tile;
  }
}
```

## Region Download

```ts
// src/lib/maps/region-download.ts
import { cacheTile } from './tile-cache';

export interface DownloadProgress {
  total: number;
  downloaded: number;
  failed: number;
  percent: number;
}

export async function downloadRegion(
  bounds: { north: number; south: number; east: number; west: number },
  zoomRange: { min: number; max: number },
  tileUrlTemplate: string,
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  const tiles: { x: number; y: number; z: number }[] = [];

  for (let z = zoomRange.min; z <= zoomRange.max; z++) {
    const n = Math.pow(2, z);
    const xMin = Math.floor(((bounds.west + 180) / 360) * n);
    const xMax = Math.floor(((bounds.east + 180) / 360) * n);
    const yMin = Math.floor((1 - Math.log(Math.tan(bounds.north * Math.PI / 180) + 1 / Math.cos(bounds.north * Math.PI / 180)) / Math.PI) / 2 * n);
    const yMax = Math.floor((1 - Math.log(Math.tan(bounds.south * Math.PI / 180) + 1 / Math.cos(bounds.south * Math.PI / 180)) / Math.PI) / 2 * n);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ x, y, z });
      }
    }
  }

  const progress: DownloadProgress = { total: tiles.length, downloaded: 0, failed: 0, percent: 0 };
  const BATCH = 6; // concurrent downloads

  for (let i = 0; i < tiles.length; i += BATCH) {
    const batch = tiles.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async ({ x, y, z }) => {
      const url = tileUrlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        await cacheTile(url, blob);
        progress.downloaded++;
      } catch {
        progress.failed++;
      }
      progress.percent = ((progress.downloaded + progress.failed) / progress.total) * 100;
      onProgress({ ...progress });
    }));
  }
}
```

## Map Component

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let mapContainer: HTMLDivElement;
  let map: any;

  onMount(async () => {
    if (!browser) return;
    const L = await import('leaflet');
    const { OfflineTileLayer } = await import('$lib/maps/offline-tile-layer');
    await import('leaflet/dist/leaflet.css');

    map = L.map(mapContainer).setView([55.7558, 37.6173], 12); // Moscow

    new OfflineTileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    // GPS
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          L.marker([latitude, longitude]).addTo(map).bindPopup('Вы здесь');
        },
        (err) => console.warn('Geolocation error:', err),
        { enableHighAccuracy: true }
      );
    }
  });
</script>

<div bind:this={mapContainer} class="h-[400px] w-full rounded-xl"></div>
```
