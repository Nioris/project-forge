#!/usr/bin/env node
/** Lightweight no-dependency validator for Forge AI prompt packs. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!file) { console.error('Usage: node scripts/validate-ai-prompt.mjs <assets/prompts/id.json>'); process.exit(2); }
const p = resolve(file);
if (!existsSync(p)) { console.error('[X] Prompt pack not found:', p); process.exit(2); }
let x;
try { x = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { console.error('[X] Invalid JSON:', e.message); process.exit(1); }
const errs=[];
const req=['schemaVersion','id','phase','status','purpose','provider','model','size','quality','prompt','output','acceptance'];
for (const k of req) if (x[k] === undefined || x[k] === null || x[k] === '') errs.push(`missing ${k}`);
if (x.schemaVersion !== 1) errs.push('schemaVersion must be 1');
if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(x.id||''))) errs.push('id must be lowercase latin/digit plus ._-');
if (!Number.isInteger(x.phase) || x.phase < 1 || x.phase > 9) errs.push('phase must be integer 1..9');
if (!['draft','approved'].includes(x.status)) errs.push('status must be draft|approved');
if (!['codex-native','openai-api','gigachat-api'].includes(x.provider)) errs.push('provider must be codex-native|openai-api|gigachat-api');
if (!['1024x1024','1024x1536','1536x1024'].includes(x.size)) errs.push('unsupported size');
if (!['low','medium','high','auto'].includes(x.quality)) errs.push('quality must be low|medium|high|auto');
if (x.background !== undefined && !['opaque','transparent','auto'].includes(x.background)) errs.push('background must be opaque|transparent|auto');
if (String(x.prompt||'').trim().length < 40) errs.push('prompt too short (<40 chars)');
if (!Array.isArray(x.acceptance) || !x.acceptance.length) errs.push('acceptance must be non-empty array');
if (Array.isArray(x.references) && x.references.some(r => typeof r !== 'string')) errs.push('references must contain strings');
if (/openrouter/i.test(JSON.stringify(x))) errs.push('OpenRouter is not allowed as an implicit AI Studio provider');
if (errs.length) {
  console.error(`[X] Prompt pack invalid: ${p}`);
  for (const e of errs) console.error('  -', e);
  process.exit(1);
}
console.log(`[OK] Prompt pack valid: ${p}`);
console.log(`  ${x.id} | phase ${x.phase} | ${x.provider}/${x.model} | ${x.size} ${x.quality}`);
