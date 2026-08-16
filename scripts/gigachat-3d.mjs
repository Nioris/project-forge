#!/usr/bin/env node
/** Generate one FBX model through GigaChat built-in text2model3d and preserve Forge provenance. */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { getAccessToken, gigaJson, downloadGigaFile } from './lib/gigachat-api.mjs';

const args = process.argv.slice(2);
const val = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry-run');
const project = resolve(val('--project') || '.');
const prompt = val('--prompt');
const outputArg = val('--output');
const model = val('--model') || 'GigaChat-2-Max';
if (!prompt || prompt.length < 10) { console.error('[X] --prompt required'); process.exit(2); }
if (!outputArg && !DRY) { console.error('[X] --output required'); process.exit(2); }
if (DRY) {
  console.log('[DRY] GigaChat 3D request valid');
  console.log(JSON.stringify({ endpoint: 'POST https://api.giga.chat/v1/chat/completions', builtInFunction: 'text2model3d', model, promptChars: prompt.length, output: outputArg || '(from caller)' }, null, 2));
  process.exit(0);
}
try {
  const { token, source } = await getAccessToken(project);
  const data = await gigaJson(token, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: prompt }],
    function_call: 'auto',
    functions: [{ name: 'text2model3d' }],
  }, 240000);
  const content = data?.choices?.[0]?.message?.content || '';
  const m = content.match(/data-model-id=["']([0-9a-f-]{20,})["']/i);
  if (!m) throw new Error('GigaChat response did not contain data-model-id. The model may not have invoked text2model3d.');
  const bytes = await downloadGigaFile(token, m[1], 'application/fbx', 240000);
  const out = resolve(outputArg);
  if (extname(out).toLowerCase() !== '.fbx') console.warn('[!] GigaChat text2model3d returns FBX; consider a .fbx output filename.');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  const provenance = join(project, 'assets', 'generated', 'provenance.jsonl');
  mkdirSync(dirname(provenance), { recursive: true });
  appendFileSync(provenance, JSON.stringify({ ts: new Date().toISOString(), provider: 'gigachat-api', model, builtInFunction: 'text2model3d', credentialSource: source, output: out }) + '\n', 'utf8');
  console.log(`[OK] GigaChat FBX written: ${out} (${bytes.length} bytes)`);
} catch (e) {
  console.error('[X] GigaChat 3D generation failed:', e.message);
  process.exit(4);
}
