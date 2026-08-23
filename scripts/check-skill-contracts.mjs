#!/usr/bin/env node
/** Validate declared SkillContract frontmatter and legacy/manual compatibility. */
import fs from 'node:fs';
import path from 'node:path';
import { inspectSkillContract, readSkillContract } from '../.claude/skills/status/references/skill-contract.mjs';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const ROOT = path.resolve(args.find(arg => !arg.startsWith('-')) || process.cwd());
const dir = path.join(ROOT, '.claude', 'skills');
if (!fs.existsSync(dir)) {
  console.error(JSON_MODE ? JSON.stringify({ ok: false, error: 'skills directory missing' }) : '[X] .claude/skills directory missing');
  process.exit(2);
}

const results = [];
for (const entry of fs.readdirSync(dir, { withFileTypes: true }).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!fs.existsSync(path.join(dir, entry.name, 'SKILL.md'))) continue;
  try { results.push(inspectSkillContract(ROOT, entry.name)); }
  catch (error) { results.push({ id: entry.name, status: 'invalid', errors: [error.message], contract: null }); }
}
const declared = results.filter(item => item.status === 'declared');
const legacy = results.filter(item => item.status === 'legacy');
const invalid = results.filter(item => item.errors?.length);
const required = ['status', ...Array.from({ length: 9 }, (_, index) => `phase-${index + 1}-${['analyze','design','construct','visual','tech','listing','test','release','live'][index]}`), 'gacha-meta'];
for (const id of required) {
  const item = results.find(value => value.id === id);
  if (!item || item.status !== 'declared' || item.errors?.length) invalid.push({ id, errors: [`required executable SkillContract is missing or invalid: ${id}`] });
}

const summary = { ok: invalid.length === 0, total: results.length, declared: declared.length, legacy: legacy.length, required, invalid: invalid.map(item => ({ id: item.id, errors: item.errors })) };
if (JSON_MODE) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`SkillContract audit: ${declared.length} declared executable, ${legacy.length} legacy/manual, ${results.length} total`);
  for (const item of declared) {
    const contract = readSkillContract(ROOT, item.id, { requireDeclared: true });
    console.log(`  [OK] ${item.id}: ${contract.modes.join(',')} / phases ${contract.phases.join(',') || 'neutral'} / ${contract.verifiers.length} verifier(s)`);
  }
  for (const item of invalid) console.log(`  [X] ${item.id}: ${(item.errors || []).join('; ')}`);
  console.log(invalid.length ? `[X] ${invalid.length} SkillContract problem(s)` : '[OK] Skill contracts are strict; legacy skills remain manual-only.');
}
process.exit(invalid.length ? 1 : 0);
