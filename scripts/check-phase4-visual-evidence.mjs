#!/usr/bin/env node
/** Validate a project's executable Phase 4 visual acceptance evidence. */
import path from 'node:path';
import { validatePhase4VisualEvidence } from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const target = args.find(item => !item.startsWith('--')) || '.';
const result = validatePhase4VisualEvidence({ root: path.resolve(target) });

if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  console.log('Phase 4 visual evidence gate');
  console.log('────────────────────────────');
  if (result.ok) console.log(`PASS: ${result.states.length} states / ${result.frames} reviewed frames are evidence-bound`);
  else {
    console.log('BLOCKED: Phase 4 visual evidence is not acceptable');
    for (const failure of result.failures) console.log(`  - ${failure}`);
  }
}

process.exit(result.ok ? 0 : 1);
