#!/usr/bin/env node
import { resolve } from 'node:path';
import { applyDefaultSearchEnvironment, searchDoctor, webSearch, imageSearch } from './lib/forge-search.mjs';

applyDefaultSearchEnvironment();

const args=process.argv.slice(2);
const val=flag=>{const i=args.indexOf(flag); return i>=0?args[i+1]:null;};
const project=resolve(val('--project')||'.');
const query=val('--query');
const imageQuery=val('--image-query');
const count=Math.max(1,Math.min(10,Number(val('--count')||3)));

console.log(JSON.stringify(searchDoctor(project),null,2));
if(query){
  try{ console.log('\n[web-search]'); console.log(JSON.stringify(await webSearch(project,query,count),null,2)); }
  catch(e){ console.error(`[X] web search: ${e.message}`); process.exitCode=1; }
}
if(imageQuery){
  try{ console.log('\n[image-search]'); console.log(JSON.stringify(await imageSearch(project,imageQuery,count),null,2)); }
  catch(e){ console.error(`[X] image search: ${e.message}`); process.exitCode=1; }
}
