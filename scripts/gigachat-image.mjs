#!/usr/bin/env node
/** Generate one image through GigaChat built-in text2image and preserve Forge provenance. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { getAccessToken, gigaJson, downloadGigaFile } from './lib/gigachat-api.mjs';

const args = process.argv.slice(2);
const val = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry-run');
const project = resolve(val('--project') || '.');
const packArg = val('--prompt-pack');
const promptFile = val('--prompt-file');
const promptInline = val('--prompt');
let outputArg = val('--output');
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
  const pf = resolve(promptFile); if (!existsSync(pf)) { console.error('[X] prompt file not found:', pf); process.exit(2); }
  prompt = readFileSync(pf, 'utf8').trim();
}
if (!prompt || prompt.length < 10) { console.error('[X] Provide --prompt-pack, --prompt-file or --prompt'); process.exit(2); }
if (!outputArg && !DRY) { console.error('[X] --output required unless prompt pack defines output'); process.exit(2); }
const model = val('--model') || pack?.model || 'GigaChat-2-Max';
const system = val('--system') || 'Ты арт-директор игровой production-команды. Создай изображение строго по заданному описанию без лишнего текста внутри изображения, если текст явно не требуется.';

if (DRY) {
  console.log('[DRY] GigaChat image request valid');
  console.log(JSON.stringify({ endpoint: 'POST https://api.giga.chat/v1/chat/completions', builtInFunction: 'text2image', model, promptChars: prompt.length, output: outputArg || '(from caller)' }, null, 2));
  process.exit(0);
}
try {
  const { token, source } = await getAccessToken(project);
  const data = await gigaJson(token, '/v1/chat/completions', {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    function_call: 'auto',
  });
  const content = data?.choices?.[0]?.message?.content || '';
  const m = content.match(/<img\s+[^>]*src=["']([0-9a-f-]{20,})["']/i);
  if (!m) throw new Error('GigaChat response did not contain an image file id. The model may have answered with text instead of invoking text2image.');
  const bytes = await downloadGigaFile(token, m[1], 'application/jpg');
  const out = resolve(outputArg);
  const ext = extname(out).toLowerCase();
  if (ext && !['.jpg', '.jpeg'].includes(ext)) console.warn('[!] GigaChat text2image currently returns JPG bytes; consider a .jpg output filename.');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  const provenance = join(project, 'assets', 'generated', 'provenance.jsonl');
  mkdirSync(dirname(provenance), { recursive: true });
  appendFileSync(provenance, JSON.stringify({ ts: new Date().toISOString(), id: pack?.id || null, provider: 'gigachat-api', model, builtInFunction: 'text2image', credentialSource: source, promptPack: packArg ? resolve(packArg) : null, output: out }) + '\n', 'utf8');
  console.log(`[OK] GigaChat image written: ${out} (${bytes.length} bytes)`);
} catch (e) {
  console.error('[X] GigaChat image generation failed:', e.message);
  process.exit(4);
}
