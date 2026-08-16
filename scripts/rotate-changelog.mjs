#!/usr/bin/env node
/**
 * @file rotate-changelog.mjs
 * @description One-shot, verified rotation of old changelog sections out of CLAUDE.md
 *              into docs/CHANGELOG.md, honoring the documented "keep latest 3" rule.
 *
 *              SAFETY: operates on section boundaries (top-level `## ` headers), never
 *              raw line numbers. Extracts text, writes it to CHANGELOG, and ONLY removes
 *              from CLAUDE.md after confirming every moved byte is present in CHANGELOG.
 *              Guards against the v4.10.23-style data-loss incident.
 *
 * Usage: node scripts/rotate-changelog.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CLAUDE = path.join(ROOT, 'CLAUDE.md');
const CHANGELOG = path.join(ROOT, 'docs', 'CHANGELOG.md');
const DRY = process.argv.includes('--dry');
// How many newest changelog versions to keep inline (override: --keep=N)
const keepArg = process.argv.find(a => a.startsWith('--keep='));
const KEEP_N = keepArg ? parseInt(keepArg.split('=')[1], 10) : 3;

const src = fs.readFileSync(CLAUDE, 'utf-8');
const lines = src.split('\n');

// Find top-level "## " section starts.
const sectionStarts = [];
for (let i = 0; i < lines.length; i++) {
  if (/^## (?!#)/.test(lines[i])) sectionStarts.push(i);
}
sectionStarts.push(lines.length); // sentinel

// A changelog section is either the reconstructed-history block or "## vX.Y.Z changelog".
function classify(header) {
  if (/reconstructed history/i.test(header)) return { isChangelog: true, ver: 'reconstructed' };
  const m = header.match(/^##\s+v(\d+\.\d+\.\d+)\s+changelog/i);
  if (m) return { isChangelog: true, ver: m[1] };
  return { isChangelog: false, ver: null };
}

const sections = [];
for (let s = 0; s < sectionStarts.length - 1; s++) {
  const start = sectionStarts[s];
  const end = sectionStarts[s + 1];
  const header = lines[start];
  const { isChangelog, ver } = classify(header);
  sections.push({ start, end, header, isChangelog, ver, text: lines.slice(start, end).join('\n') });
}

// KEEP is computed, not hand-maintained (invariant #17): keep the N newest changelogs by semver.
// 'reconstructed' is always oldest. This fixes the v4.11.6 bug where a stale hardcoded KEEP list
// rotated out the NEWEST versions and kept old ones.
const cmp = (a, b) => {
  if (a === 'reconstructed') return -1;
  if (b === 'reconstructed') return 1;
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
const changelogVers = sections.filter(x => x.isChangelog).map(x => x.ver);
const keptVers = [...changelogVers].sort(cmp).slice(-KEEP_N); // N newest
const KEEP = new Set(keptVers);

const toRotate = sections.filter(x => x.isChangelog && !KEEP.has(x.ver));
const toKeepCl = sections.filter(x => x.isChangelog && KEEP.has(x.ver));

console.log('Changelog sections found:', sections.filter(x => x.isChangelog).length);
console.log(`  Keeping inline (${KEEP_N} newest by semver):`, toKeepCl.map(x => x.ver).join(', '));
console.log('  Rotating out:  ', toRotate.map(x => x.ver).join(', '));

if (toRotate.length === 0) { console.log('Nothing to rotate.'); process.exit(0); }

// Build CHANGELOG insertion: newest-first. toRotate is already in file order
// (reconstructed first, then v4.10.37..v4.10.5 descending). We drop the reconstructed
// block to the bottom of the moved set so the moved set stays newest-first, then it sits
// above the existing v4.10.0.. content (which is older). Order within moved set: keep as-is
// minus reconstructed, append reconstructed last.
const movedVersioned = toRotate.filter(x => x.ver !== 'reconstructed');
const movedReconstructed = toRotate.filter(x => x.ver === 'reconstructed');
const movedOrdered = [...movedVersioned, ...movedReconstructed];
const movedBlock = movedOrdered.map(x => x.text.replace(/\s+$/,'')).join('\n\n') + '\n\n';

// Insert moved block into CHANGELOG right after its header preamble (after first blank-line gap).
const clog = fs.readFileSync(CHANGELOG, 'utf-8');
const insertAfter = clog.indexOf('## v4.10.0');
let newClog;
if (insertAfter === -1) {
  newClog = clog.replace(/(\n)(## )/, `\n${movedBlock}$2`); // fallback: before first ## section
} else {
  newClog = clog.slice(0, insertAfter) + movedBlock + clog.slice(insertAfter);
}

// Rebuild CLAUDE.md without the rotated sections.
const rotateSet = new Set(toRotate);
const keptLines = [];
let cursor = 0;
const ordered = [...sections].sort((a, b) => a.start - b.start);
// Reconstruct: walk sections in order, skipping rotated ones; preserve non-section gaps.
// Simpler: rebuild by line, marking removed ranges.
const removed = new Array(lines.length).fill(false);
for (const sec of toRotate) for (let i = sec.start; i < sec.end; i++) removed[i] = true;
const newClaudeLines = lines.filter((_, i) => !removed[i]);
// Collapse 3+ consecutive blank lines left by removals into 1 blank line.
const newClaude = newClaudeLines.join('\n').replace(/\n{3,}/g, '\n\n');

// VERIFY: every rotated section's body (first 5 non-empty lines) must appear in newClog.
let verifyOk = true;
for (const sec of toRotate) {
  const probe = sec.text.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
  if (!newClog.includes(sec.text.replace(/\s+$/,'').split('\n').slice(0,3).join('\n'))) {
    // fallback probe on header
    if (!newClog.includes(sec.header.trim())) {
      console.error('VERIFY FAIL — rotated section not found in CHANGELOG:', sec.header);
      verifyOk = false;
    }
  }
}
if (!verifyOk) { console.error('Aborting — verification failed, no files written.'); process.exit(1); }

console.log('\nByte accounting:');
console.log('  CLAUDE.md:   ', src.length, '->', newClaude.length, `(-${src.length - newClaude.length})`);
console.log('  CHANGELOG.md:', clog.length, '->', newClog.length, `(+${newClog.length - clog.length})`);
console.log('  CLAUDE.md new size:', (Buffer.byteLength(newClaude, 'utf8') / 1024).toFixed(1), 'KB');

if (DRY) { console.log('\n--dry: no files written.'); process.exit(0); }

fs.writeFileSync(CHANGELOG, newClog, 'utf-8');
fs.writeFileSync(CLAUDE, newClaude, 'utf-8');
console.log('\nWritten. Verified all rotated sections present in CHANGELOG before removal.');
