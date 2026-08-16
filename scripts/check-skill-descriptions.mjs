#!/usr/bin/env node
/** Guard: длина description в скилах. Claude Code режет листинг описаний на 1536
 *  символов (было 250 до июля 2026) — обрезанное описание = мёртвые триггеры. */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
const R = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const S = join(R, '.claude', 'skills'); const CAP = 1536; let bad = 0, warn = 0;
for (const d of readdirSync(S)) {
  const f = join(S, d, 'SKILL.md'); if (!existsSync(f)) continue;
  const t = readFileSync(f, 'utf8'); if (!t.startsWith('---')) continue;
  const m = /^description:\s*"?([\s\S]*?)"?\s*$/m.exec(t.split('---')[1] || ''); if (!m) continue;
  const n = m[1].length;
  if (n > CAP) { console.log(`  ✗ ${d}: description ${n} символов > ${CAP} — хвост с триггерами обрежется`); bad++; }
  else if (n > CAP * 0.85) { console.log(`  ⚠ ${d}: description ${n} — близко к лимиту ${CAP}`); warn++; }
}
console.log(bad ? `✗ ${bad} скил(ов) с обрезаемым описанием.` : `✓ Описания скилов в пределах ${CAP} символов${warn ? ` (${warn} близко к лимиту)` : ''}.`);
process.exit(bad ? 1 : 0);
