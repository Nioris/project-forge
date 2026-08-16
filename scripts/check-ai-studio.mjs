#!/usr/bin/env node
/** Self-audit for Project Forge 4.68 AI Studio surfaces. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let fails=0; const ok=m=>console.log('  ✓ '+m); const bad=m=>{console.log('  ✗ '+m);fails++;};
console.log('Forge AI Studio audit\n────────────────────────────────────────');
const skills=['studio','prompt-compiler','image-studio','visual-qa'];
const agents=['studio-director.md','prompt-architect.md','art-director.md','visual-qa.md'];
for (const s of skills) existsSync(join(ROOT,'.claude','skills',s,'SKILL.md')) ? ok(`skill ${s}`) : bad(`missing skill ${s}`);
for (const a of agents) existsSync(join(ROOT,'.claude','agents',a)) ? ok(`agent ${a}`) : bad(`missing agent ${a}`);
for (const f of ['scripts/ai-studio-init.mjs','scripts/openai-image.mjs','scripts/gigachat-image.mjs','scripts/gigachat-3d.mjs','scripts/lib/gigachat-api.mjs','scripts/validate-ai-prompt.mjs','schemas/ai-prompt.schema.json','templates/ai-studio/project-config.json'])
  existsSync(join(ROOT,f)) ? ok(f) : bad(`missing ${f}`);
const activeFiles=['.claude/skills/phase-4-visual/SKILL.md','.claude/skills/asset-generation/SKILL.md','.claude/skills/pixel-art-pipeline/SKILL.md','CLAUDE.md'];
for (const f of activeFiles) {
  const t=readFileSync(join(ROOT,f),'utf8');
  /\.openrouter_key|OpenRouter \(Gemini image\)|через OpenRouter/i.test(t) ? bad(`${f} still requires OpenRouter in active path`) : ok(`${f} primary path avoids mandatory OpenRouter`);
}
const phases=Array.from({length:9},(_,i)=>`phase-${i+1}-`);
const dirs=readdirSync(join(ROOT,'.claude','skills'),{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('phase-')).map(e=>e.name);
for (let n=1;n<=9;n++) {
  const d=dirs.find(x=>x.startsWith(`phase-${n}-`));
  if (!d) { bad(`phase ${n} missing`); continue; }
  const t=readFileSync(join(ROOT,'.claude','skills',d,'SKILL.md'),'utf8');
  /AI STUDIO 4\.67/.test(t) ? ok(`phase ${n} has AI Studio lane`) : bad(`phase ${n} missing AI Studio lane`);
}
const dry=spawnSync(process.execPath,['scripts/openai-image.mjs','--prompt','A production-ready stylized game icon with one strong silhouette, no text, no watermark','--output','assets/generated/test.png','--dry-run'],{cwd:ROOT,encoding:'utf8'});
dry.status===0 ? ok('OpenAI image helper dry-run') : bad('OpenAI image helper dry-run failed');
const gdry=spawnSync(process.execPath,['scripts/gigachat-image.mjs','--prompt','A stylized game icon with one strong silhouette and no text','--output','assets/generated/test.jpg','--dry-run'],{cwd:ROOT,encoding:'utf8'});
gdry.status===0 ? ok('GigaChat image helper dry-run') : bad('GigaChat image helper dry-run failed');
const g3dry=spawnSync(process.execPath,['scripts/gigachat-3d.mjs','--prompt','A low-poly industrial oil pump prop for an isometric game','--output','assets/generated/test.fbx','--dry-run'],{cwd:ROOT,encoding:'utf8'});
g3dry.status===0 ? ok('GigaChat 3D helper dry-run') : bad('GigaChat 3D helper dry-run failed');
console.log('────────────────────────────────────────');
if (fails) { console.log(`FAILED: ${fails} issue(s)`); process.exit(1); }
console.log('PASS: AI Studio phase/provider/agent surfaces are consistent');
