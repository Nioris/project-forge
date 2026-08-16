#!/usr/bin/env node
/**
 * asset-shard.mjs — разрезать черновик скана на N частей для параллельных агентов.
 * Каждый агент получает свой файл и пишет рядом <имя>.done.json — в общую библиотеку
 * не лезет никто, слияние делает asset-merge.mjs (нет гонок за файл).
 *
 * Usage: node scripts/asset-shard.mjs [asset-scan-draft.json] [--shards 10] [--out-dir .]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const src = resolve(args.find(a => !a.startsWith('--')) || 'asset-scan-draft.json');
const N = Math.max(1, Math.min(parseInt(arg('shards', '10'), 10), 20));
const outDir = resolve(arg('out-dir', 'asset-shards'));

if (!existsSync(src)) { console.error('[X] Нет черновика:', src, '\n    Сначала: node scripts/asset-scan.mjs <папка>'); process.exit(2); }
const draft = JSON.parse(readFileSync(src, 'utf8'));
const items = draft.items || [];
if (!items.length) { console.error('[X] В черновике нет пакетов'); process.exit(2); }

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/^shard-\d+(\.done)?\.json$/.test(f)) unlinkSync(join(outDir, f));

// раскладываем по кругу — шарды получаются равными по объёму работы
const shards = Array.from({ length: Math.min(N, items.length) }, () => []);
items.forEach((it, i) => shards[i % shards.length].push(it));

const paths = [];
shards.forEach((list, i) => {
  const name = `shard-${String(i + 1).padStart(2, '0')}.json`;
  writeFileSync(join(outDir, name), JSON.stringify({
    format: 'forge-asset-shard', shard: i + 1, of: shards.length,
    scanned: draft.scanned, count: list.length, items: list,
  }, null, 2));
  paths.push(join(outDir, name));
});

console.log(`Пакетов: ${items.length} → шардов: ${shards.length} (по ~${Math.ceil(items.length / shards.length)})`);
paths.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
console.log('\nДальше: запусти по агенту на каждый шард, они пишут <shard-NN>.done.json');
console.log('Затем: node scripts/asset-merge.mjs');
