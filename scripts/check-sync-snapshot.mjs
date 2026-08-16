#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotPayload } from './forge-sync-spec.mjs';

const root = mkdtempSync(join(tmpdir(), 'forge-sync-snapshot-'));
try {
  mkdirSync(join(root, '.claude', 'skills', 'probe'), { recursive: true });
  const source = join(root, '.claude', 'skills', 'probe', 'SKILL.md');
  writeFileSync(source, 'snapshot-probe\n');
  const snap = snapshotPayload(root).find(x => x.destRel === '.claude/skills/probe/SKILL.md');
  if (!snap || snap.content.toString('utf8') !== 'snapshot-probe\n') throw new Error('snapshot did not capture source');
  unlinkSync(source);
  if (snap.content.toString('utf8') !== 'snapshot-probe\n') throw new Error('snapshot changed after source deletion');
  console.log('PASS: sync payload is buffered before sibling propagation');
} finally {
  rmSync(root, { recursive: true, force: true });
}
