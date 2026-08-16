#!/usr/bin/env node
/**
 * @file pre-submit.mjs
 * @description VK Play pre-submit gate. Runs 5 specialised validators against
 *              an iframe-based HTML5 game directory.
 *
 *              Same exit-code contract as other platforms: 0=ok, 1=blockers, 2=fatal.
 *
 *   Usage:
 *     node platforms/vkplay/scripts/pre-submit.mjs WorkProgress/{Project}/
 *     node platforms/vkplay/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const validatorsDir = path.resolve(here, '..', 'validators');

const VALIDATOR_FILES = [
  'iframe-init.mjs',
  'signature-check.mjs',
  'auth-params.mjs',
  'payment-flow.mjs',
  'https-only.mjs',
];

const LEVELS = { BLOCKER: 'blocker', WARNING: 'warning', INFO: 'info' };

async function main() {
  const args = process.argv.slice(2);
  const pos = args.filter(a => !a.startsWith('-'));
  const opts = { verbose: args.includes('--verbose') || args.includes('-v') };
  if (pos.length === 0) {
    console.error('Usage: node platforms/vkplay/scripts/pre-submit.mjs <gamePath> [--verbose]');
    process.exit(2);
  }
  const gamePath = path.resolve(pos[0]);
  if (!fs.existsSync(gamePath) || !fs.statSync(gamePath).isDirectory()) {
    console.error('Not a directory: ' + gamePath); process.exit(2);
  }

  const results = [];
  for (const file of VALIDATOR_FILES) {
    const full = path.join(validatorsDir, file);
    if (!fs.existsSync(full)) continue;
    const mod = await import('file://' + full.replace(/\\/g, '/'));
    try {
      results.push({ validator: { ID: mod.ID, REQUIREMENTS: mod.REQUIREMENTS }, ok: true, issues: mod.validate(gamePath) });
    } catch (e) {
      results.push({ validator: { ID: mod.ID || file }, ok: false, error: e.message });
    }
  }

  let b = 0, w = 0, f = 0;
  for (const r of results) {
    if (!r.ok) { f++; continue; }
    for (const i of r.issues) {
      if (i.level === LEVELS.BLOCKER) b++;
      else if (i.level === LEVELS.WARNING) w++;
    }
  }

  const bar = '=========================================================';
  console.log(bar);
  console.log('  VKPLAY PRE-SUBMIT: ' + path.basename(gamePath));
  console.log(bar);
  console.log('  TOTAL: ' + b + ' blockers, ' + w + ' warnings, ' + f + ' fatals');
  console.log('');

  for (const r of results) {
    if (!r.ok) { console.log('[FATAL] ' + r.validator.ID + ' - ' + r.error); continue; }
    const bb = r.issues.filter(i => i.level === LEVELS.BLOCKER).length;
    const ww = r.issues.filter(i => i.level === LEVELS.WARNING).length;
    const status = bb > 0 ? '[X]' : ww > 0 ? '[!]' : '[OK]';
    console.log(status + '  ' + r.validator.ID.padEnd(16) + '  b=' + bb + ' w=' + ww);
    for (const issue of r.issues) {
      if (!opts.verbose && issue.level !== LEVELS.BLOCKER) continue;
      const sym = issue.level === 'blocker' ? '[X]' : issue.level === 'warning' ? '[!]' : '[i]';
      let line = '    ' + sym + ' [' + issue.id + '] ' + issue.message;
      if (issue.file) {
        const rel = path.relative(gamePath, issue.file).replace(/\\/g, '/');
        line += '  (' + rel + (issue.line ? ':' + issue.line : '') + ')';
      }
      console.log(line);
      if (opts.verbose && issue.url) console.log('         ' + issue.url);
    }
  }
  console.log('');
  console.log(b > 0 ? 'BLOCKED - ' + b + ' blocker(s). Fix and re-run.' : f > 0 ? 'VALIDATOR ERRORS' : 'READY');
  console.log(bar);

  fs.writeFileSync(
    path.join(gamePath, '.pre-submit-vkplay.json'),
    JSON.stringify({ platform: 'vkplay', blockers: b, warnings: w, fatals: f, results, timestamp: new Date().toISOString() }, null, 2)
  );

  process.exit(b > 0 || f > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
