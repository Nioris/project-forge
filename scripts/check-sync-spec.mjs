#!/usr/bin/env node
/** Validate the single managed sibling-sync payload without touching sibling projects. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAYLOAD, expandPayload } from './forge-sync-spec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors=[]; const ok=[];
const expanded=expandPayload(ROOT);
const dests=new Set();

if (expanded.length < 300) errors.push(`managed payload unexpectedly small: ${expanded.length}`);
for (const item of expanded) {
  if (!fs.existsSync(item.sourceAbs) || !fs.statSync(item.sourceAbs).isFile()) errors.push(`source is not a file: ${item.sourceAbs}`);
  if (path.isAbsolute(item.destRel) || item.destRel.split(/[\\/]/).includes('..')) errors.push(`unsafe destination: ${item.destRel}`);
  if (dests.has(item.destRel)) errors.push(`duplicate managed destination: ${item.destRel}`);
  dests.add(item.destRel);
}
for (const [src,dst] of PAYLOAD) {
  const abs=path.join(ROOT,src);
  if (!fs.existsSync(abs)) errors.push(`declared payload source missing: ${src}`);
  else if (fs.statSync(abs).isFile() && !dests.has(dst.replace(/\\/g,'/'))) errors.push(`file payload was not expanded: ${src} -> ${dst}`);
}
for (const must of ['.claude/settings.json','.codex/hooks.json','.codex/config.toml','AGENTS.md','СПРАВОЧНИК-КОМАНД.md','debugcheck.js']) {
  if (!dests.has(must)) errors.push(`required managed destination missing: ${must}`);
}
if (!errors.length) ok.push(`${expanded.length} unique safe Forge-owned files expand from ${PAYLOAD.length} payload roots`);

console.log('\nManaged sync specification audit\n'+'─'.repeat(40));
for (const x of ok) console.log('  ✓ '+x);
for (const x of errors) console.log('  ✗ '+x);
console.log(errors.length ? `\nFAILED: ${errors.length} issue(s)` : '\nPASS: managed sync payload is structurally valid');
process.exit(errors.length?1:0);
