#!/usr/bin/env node
/**
 * @file pre-submit.mjs
 * @description Telegram Mini App pre-submit gate. Runs 4 validators and
 *              returns concrete blockers. Same exit-code contract as Yandex:
 *                0 = OK to build
 *                1 = blockers present, fix before submit
 *                2 = fatal (bug in validator)
 *
 *   Usage:
 *     node platforms/telegram/scripts/pre-submit.mjs WorkProgress/{Project}/
 *     node platforms/telegram/scripts/pre-submit.mjs WorkProgress/{Project}/ --verbose
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const validatorsDir = path.resolve(here, '..', 'validators');

const VALIDATOR_FILES = [
  'sdk-loaded.mjs',
  'ready-expand.mjs',
  'https-only.mjs',
  'viewport-initdata.mjs',
  'cloud-storage-constraints.mjs',
];

const LEVELS = { BLOCKER: 'blocker', WARNING: 'warning', INFO: 'info' };

async function loadValidators() {
  const out = [];
  for (const file of VALIDATOR_FILES) {
    const full = path.join(validatorsDir, file);
    if (!fs.existsSync(full)) {
      console.error('Missing validator:', full);
      continue;
    }
    const mod = await import('file://' + full.replace(/\\/g, '/'));
    out.push({ file, ID: mod.ID, REQUIREMENTS: mod.REQUIREMENTS || [], validate: mod.validate });
  }
  return out;
}

function summarize(results) {
  let b = 0, w = 0, i = 0, f = 0;
  for (const r of results) {
    if (!r.ok) { f++; continue; }
    for (const issue of r.issues) {
      if (issue.level === LEVELS.BLOCKER) b++;
      else if (issue.level === LEVELS.WARNING) w++;
      else i++;
    }
  }
  return { blockers: b, warnings: w, infos: i, fatals: f };
}

function printReport(gamePath, results, summary, opts) {
  const name = path.basename(path.resolve(gamePath));
  const bar = '=========================================================';
  console.log(bar);
  console.log('  TELEGRAM PRE-SUBMIT: ' + name);
  console.log('  Path: ' + gamePath);
  console.log(bar);
  console.log('  TOTAL: ' + summary.blockers + ' blockers, ' + summary.warnings + ' warnings, ' + summary.infos + ' infos, ' + summary.fatals + ' fatals');
  console.log('');

  for (const r of results) {
    if (!r.ok) {
      console.log('[FATAL]  ' + r.validator.ID + ' — ' + r.error.split('\n')[0]);
      continue;
    }
    const b = r.issues.filter(i => i.level === LEVELS.BLOCKER).length;
    const w = r.issues.filter(i => i.level === LEVELS.WARNING).length;
    const status = b > 0 ? '[X]' : w > 0 ? '[!]' : '[OK]';
    console.log(status + '  ' + r.validator.ID.padEnd(20) + '  blockers=' + b + '  warnings=' + w);
    for (const issue of r.issues) {
      if (!opts.verbose && issue.level !== LEVELS.BLOCKER) continue;
      const sym = issue.level === 'blocker' ? '[X]' : issue.level === 'warning' ? '[!]' : '[i]';
      let line = '    ' + sym + ' [' + issue.id + '] ' + issue.message;
      if (issue.file) {
        const rel = path.relative(path.resolve(gamePath), issue.file).replace(/\\/g, '/') || path.basename(issue.file);
        line += '  (' + rel + (issue.line ? ':' + issue.line : '') + ')';
      }
      console.log(line);
      if (opts.verbose && issue.url) console.log('         ' + issue.url);
    }
  }

  console.log('');
  if (summary.blockers > 0) {
    console.log('BLOCKED — ' + summary.blockers + ' blocker(s). Fix and re-run.');
  } else if (summary.fatals > 0) {
    console.log('VALIDATOR ERRORS — ' + summary.fatals + ' fatal(s).');
  } else {
    console.log('READY for Telegram deploy (' + summary.warnings + ' warnings — review).');
  }
  console.log(bar);
}

async function run(gamePath, opts) {
  if (!fs.existsSync(gamePath) || !fs.statSync(gamePath).isDirectory()) {
    console.error('Not a directory: ' + gamePath);
    process.exit(2);
  }
  const validators = await loadValidators();
  const results = [];
  for (const v of validators) {
    try {
      const issues = v.validate(gamePath);
      results.push({ validator: v, ok: true, issues });
    } catch (e) {
      results.push({ validator: v, ok: false, error: e.message + '\n' + (e.stack || '') });
    }
  }
  const summary = summarize(results);
  printReport(gamePath, results, summary, opts);

  // Write machine-readable report
  const out = {
    platform: 'telegram',
    game: path.basename(path.resolve(gamePath)),
    timestamp: new Date().toISOString(),
    summary,
    validators: results.map(r => ({
      id: r.validator.ID,
      requirements: r.validator.REQUIREMENTS,
      ok: r.ok,
      error: r.error || null,
      issues: r.issues || [],
    })),
  };
  fs.writeFileSync(
    path.join(path.resolve(gamePath), '.pre-submit-telegram.json'),
    JSON.stringify(out, null, 2)
  );

  process.exit(summary.blockers > 0 || summary.fatals > 0 ? 1 : 0);
}

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const opts = { verbose: args.includes('--verbose') || args.includes('-v') };

if (positional.length === 0) {
  console.error('Usage: node platforms/telegram/scripts/pre-submit.mjs <gamePath> [--verbose]');
  process.exit(2);
}
run(positional[0], opts);
