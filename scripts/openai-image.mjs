#!/usr/bin/env node
/**
 * Optional unattended/batch image generator for Forge AI Studio.
 * A native image tool exposed by the current host is preferred for interactive work; this helper uses the direct OpenAI Images API for reproducible batch work.
 * No SDK dependency. Never logs the API key.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { getProviderSecret } from './lib/forge-secrets.mjs';

const args = process.argv.slice(2);
const val = flag => { const i=args.indexOf(flag); return i >= 0 ? args[i+1] : null; };
const DRY = args.includes('--dry-run');
const packArg = val('--prompt-pack');
const promptFile = val('--prompt-file');
const promptInline = val('--prompt');
let outputArg = val('--output');
const rootArg = val('--project');
const project = resolve(rootArg || '.');

let pack = null;
let prompt = promptInline || null;
if (packArg) {
  const pp = resolve(packArg);
  if (!existsSync(pp)) { console.error('[X] prompt pack not found:', pp); process.exit(2); }
  try { pack = JSON.parse(readFileSync(pp, 'utf8')); } catch (e) { console.error('[X] invalid prompt pack JSON:', e.message); process.exit(2); }
  prompt = pack.prompt;
  outputArg ||= pack.output;
}
if (!prompt && promptFile) {
  const pf=resolve(promptFile); if (!existsSync(pf)) { console.error('[X] prompt file not found:', pf); process.exit(2); }
  prompt=readFileSync(pf,'utf8').trim();
}
if (!prompt || prompt.length < 10) { console.error('[X] Provide --prompt-pack, --prompt-file or --prompt'); process.exit(2); }
if (!outputArg && !DRY) { console.error('[X] --output required unless prompt pack defines output'); process.exit(2); }

const model = val('--model') || pack?.model || 'gpt-image-2';
const size = val('--size') || pack?.size || '1024x1024';
const quality = val('--quality') || pack?.quality || 'high';
const background = val('--background') || pack?.background || 'auto';
const body = { model, prompt, size };
if (quality !== 'auto') body.quality = quality;
if (background !== 'auto') body.background = background;

if (DRY) {
  console.log('[DRY] OpenAI image request valid');
  console.log(JSON.stringify({ endpoint:'POST /v1/images/generations', model, size, quality, background, output: outputArg || '(from caller)', promptChars: prompt.length }, null, 2));
  process.exit(0);
}

function readKey() {
  return getProviderSecret('openai', project)?.value || null;
}
const key = readKey();
if (!key) {
  console.error('[X] OpenAI API key missing. Use the current host native image tool, set OPENAI_API_KEY, put it in forge-data/secrets/openai.key, or use legacy .openai_key.');
  process.exit(3);
}

const res = await fetch('https://api.openai.com/v1/images/generations', {
  method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' }, body:JSON.stringify(body),
});
let data;
try { data = await res.json(); } catch { data = null; }
if (!res.ok) {
  const msg = data?.error?.message || `HTTP ${res.status}`;
  console.error('[X] OpenAI image generation failed:', msg);
  process.exit(4);
}
const item = data?.data?.[0];
if (!item) { console.error('[X] OpenAI response has no image data'); process.exit(4); }
let bytes;
if (item.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
else if (item.url) {
  const ir = await fetch(item.url); if (!ir.ok) { console.error('[X] image URL download failed:', ir.status); process.exit(4); }
  bytes = Buffer.from(await ir.arrayBuffer());
} else { console.error('[X] OpenAI response has neither b64_json nor url'); process.exit(4); }

const out = resolve(outputArg);
mkdirSync(dirname(out), { recursive:true });
writeFileSync(out, bytes);
const provenance = join(project, 'assets', 'generated', 'provenance.jsonl');
mkdirSync(dirname(provenance), { recursive:true });
appendFileSync(provenance, JSON.stringify({
  ts:new Date().toISOString(), id:pack?.id || null, provider:'openai-api', model, size, quality,
  promptPack: packArg ? resolve(packArg) : null, output:out,
})+'\n','utf8');
console.log(`[OK] Image written: ${out} (${bytes.length} bytes)`);
