#!/usr/bin/env node
/**
 * Optional unattended/batch image generator for Forge AI Studio.
 * A native image tool exposed by the current host is preferred for interactive work; this helper uses the direct OpenAI Images API for reproducible batch work.
 * No SDK dependency. Never logs the API key.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { basename, dirname, isAbsolute, resolve, join, relative } from 'node:path';
import crypto from 'node:crypto';
import { getProviderSecret } from './lib/forge-secrets.mjs';
import { appendImageProvenance } from '../.claude/skills/status/references/image-provenance.mjs';

const args = process.argv.slice(2);
const val = flag => { const i=args.indexOf(flag); return i >= 0 ? args[i+1] : null; };
const DRY = args.includes('--dry-run');
const packArg = val('--prompt-pack');
const promptFile = val('--prompt-file');
const promptInline = val('--prompt');
let outputArg = val('--output');
const rootArg = val('--project');
const project = resolve(rootArg || '.');
const fromProject = value => isAbsolute(value) ? resolve(value) : resolve(project, value);
const normalized = value => String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
const insideProject = candidate => {
  const root = realpathSync(project);
  const file = realpathSync(candidate);
  const rel = relative(root, file);
  if (rel.startsWith('..') || isAbsolute(rel) || !statSync(file).isFile()) throw new Error(`File must stay inside the project: ${candidate}`);
  return file;
};
const sha256File = file => crypto.createHash('sha256').update(readFileSync(file)).digest('hex');

let pack = null;
let prompt = promptInline || null;
if (packArg) {
  const pp = fromProject(packArg);
  if (!existsSync(pp)) { console.error('[X] prompt pack not found:', pp); process.exit(2); }
  try { pack = JSON.parse(readFileSync(pp, 'utf8')); } catch (e) { console.error('[X] invalid prompt pack JSON:', e.message); process.exit(2); }
  prompt = pack.prompt;
  outputArg ||= pack.output;
}
if (!prompt && promptFile) {
  const pf=fromProject(promptFile); if (!existsSync(pf)) { console.error('[X] prompt file not found:', pf); process.exit(2); }
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

let masterTarget = null;
try {
  if (pack?.purpose === 'screen-blueprint') {
    const requiredReference = 'assets/target/target-frame.png';
    if (!Array.isArray(pack.references) || !pack.references.map(normalized).includes(requiredReference)) {
      throw new Error(`screen-blueprint prompt pack must reference ${requiredReference}`);
    }
    masterTarget = insideProject(fromProject(requiredReference));
  }
} catch (error) {
  console.error('[X]', error.message);
  process.exit(2);
}
const requestMode = masterTarget ? 'edit-reference' : 'generation';
const endpoint = masterTarget ? '/v1/images/edits' : '/v1/images/generations';

if (DRY) {
  console.log('[DRY] OpenAI image request valid');
  console.log(JSON.stringify({
    endpoint: `POST ${endpoint}`,
    mode: requestMode,
    model,
    size,
    quality,
    background,
    inputReference: masterTarget ? {
      path: 'assets/target/target-frame.png',
      sha256: sha256File(masterTarget),
    } : null,
    output: outputArg || '(from caller)',
    promptChars: prompt.length,
  }, null, 2));
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

let requestBody;
let requestHeaders = { 'Authorization': `Bearer ${key}` };
if (masterTarget) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', size);
  if (quality !== 'auto') form.append('quality', quality);
  if (background !== 'auto') form.append('background', background);
  form.append('image[]', new Blob([readFileSync(masterTarget)], { type: 'image/png' }), basename(masterTarget));
  requestBody = form;
} else {
  requestHeaders = { ...requestHeaders, 'Content-Type': 'application/json' };
  requestBody = JSON.stringify(body);
}
const res = await fetch(`https://api.openai.com${endpoint}`, {
  method: 'POST', headers: requestHeaders, body: requestBody,
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

const out = fromProject(outputArg);
mkdirSync(dirname(out), { recursive:true });
writeFileSync(out, bytes);
const provenance = join(project, 'assets', 'generated', 'provenance.jsonl');
mkdirSync(dirname(provenance), { recursive:true });
if (packArg) {
  appendImageProvenance({
    projectRoot: project,
    provider: 'openai-api',
    model,
    output: out,
    promptPack: fromProject(packArg),
    operation: {
      trust: 'provider-request',
      mode: requestMode,
      endpoint,
      usedMasterTarget: Boolean(masterTarget),
      requestId: res.headers.get('x-request-id') || null,
      responseCreated: data?.created || null,
      usage: data?.usage || null,
    },
  });
} else {
  appendFileSync(provenance, JSON.stringify({ ts:new Date().toISOString(), id:null, provider:'openai-api', model, size, quality, promptPack:null, output:out })+'\n','utf8');
}
console.log(`[OK] Image written: ${out} (${bytes.length} bytes)`);
