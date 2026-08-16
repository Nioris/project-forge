#!/usr/bin/env node
// Portable OpenAI GPT Image 2 helper copied by /asset-generation when a project wants batch generation.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
const a=process.argv.slice(2); const v=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null};
const promptFile=v('--prompt-file'); const output=v('--output');
if(!promptFile||!output){console.error('Usage: node generate_image.mjs --prompt-file prompt.txt --output image.png [--size 1024x1024]');process.exit(2)}
const prompt=readFileSync(resolve(promptFile),'utf8').trim();
let cur=process.cwd(), key=process.env.OPENAI_API_KEY?.trim();
for(let i=0;!key&&i<6;i++){const p=join(cur,'.openai_key');if(existsSync(p))key=readFileSync(p,'utf8').trim();const up=dirname(cur);if(up===cur)break;cur=up}
if(!key){console.error('[X] Missing OPENAI_API_KEY/.openai_key');process.exit(3)}
const body={model:v('--model')||'gpt-image-2',prompt,size:v('--size')||'1024x1024',quality:v('--quality')||'high'};
const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
const j=await r.json(); if(!r.ok){console.error('[X]',j?.error?.message||r.status);process.exit(4)}
const item=j?.data?.[0]; let buf;
if(item?.b64_json)buf=Buffer.from(item.b64_json,'base64');else if(item?.url){const ir=await fetch(item.url);buf=Buffer.from(await ir.arrayBuffer())}else{console.error('[X] no image data');process.exit(4)}
const out=resolve(output);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,buf);console.log(`[OK] ${out} (${buf.length} bytes)`);
