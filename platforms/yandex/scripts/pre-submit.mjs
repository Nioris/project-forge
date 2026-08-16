#!/usr/bin/env node
// pre-submit.mjs — orchestrator for ALL static validators.
// Runs every validator, aggregates issues, prints a human-readable report,
// and writes a machine-readable JSON to .pre-submit-report.json.
//
// Exit code:
//   0 = no blockers (warnings/info OK — moderation may pass)
//   1 = at least one blocker (do NOT submit)
//   2 = fatal error in a validator
//
// Usage:
//   node scripts/pre-submit.mjs WorkProgress/Metro/
//   node scripts/pre-submit.mjs WorkProgress/Metro/ --json    (only emit JSON, quiet console)
//   node scripts/pre-submit.mjs --all                          (run on every game in WorkProgress/)

import path from 'node:path';
import fs from 'node:fs';
import { LEVELS, resolveGamePaths } from '../validators/_lib.mjs';

// Load every validator module.
const validatorFiles = [
  // Phase A — base static
  'title-format.mjs',
  'store-listings.mjs',
  'trademarks.mjs',
  'scroll-prevention.mjs',
  'contextmenu.mjs',
  // Phase B — extended static
  'i18n-completeness.mjs',
  'sdk-timing.mjs',
  'ad-rules.mjs',
  'iap-flow.mjs',
  // Phase C — UX risks
  'emoji-compat.mjs'
];

async function loadValidators() {
  const validators = [];
  const validatorsDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/[A-Z]:/, m => m.slice(1))), '..', 'validators');
  for (const file of validatorFiles) {
    const full = path.join(validatorsDir, file);
    if (!fs.existsSync(full)) {
      console.error('Validator missing: ' + full);
      continue;
    }
    const mod = await import('file://' + full.replace(/\\/g, '/'));
    validators.push({ file, ID: mod.ID, REQUIREMENTS: mod.REQUIREMENTS || [], validate: mod.validate });
  }
  return validators;
}

function runValidator(validator, gamePath) {
  try {
    const issues = validator.validate(gamePath);
    return { ok: true, issues };
  } catch (e) {
    return { ok: false, error: e.message + '\n' + (e.stack || '') };
  }
}

function summarize(results) {
  let blockers = 0, warnings = 0, infos = 0, fatals = 0;
  for (const r of results) {
    if (!r.run.ok) { fatals++; continue; }
    for (const i of r.run.issues) {
      if (i.level === LEVELS.BLOCKER) blockers++;
      else if (i.level === LEVELS.WARNING) warnings++;
      else infos++;
    }
  }
  return { blockers, warnings, infos, fatals };
}

function printReport(gamePath, results, summary, opts) {
  const gameName = path.basename(path.resolve(gamePath));
  const banner = '=========================================================';

  console.log(banner);
  console.log('  PRE-SUBMIT REPORT: ' + gameName);
  console.log('  Path: ' + gamePath);
  console.log(banner);
  console.log('  TOTAL: ' + summary.blockers + ' blockers, ' + summary.warnings + ' warnings, ' + summary.infos + ' infos, ' + summary.fatals + ' fatals');
  console.log('');

  for (const r of results) {
    if (!r.run.ok) {
      console.log('[FATAL]  ' + r.validator.ID + ' — ' + r.run.error.split('\n')[0]);
      continue;
    }
    const issues = r.run.issues;
    const b = issues.filter(i => i.level === LEVELS.BLOCKER).length;
    const w = issues.filter(i => i.level === LEVELS.WARNING).length;
    const inf = issues.filter(i => i.level === LEVELS.INFO).length;
    const status = b > 0 ? '[X]' : w > 0 ? '[!]' : '[OK]';
    console.log(status + '  ' + r.validator.ID.padEnd(22) + '  blockers=' + b + '  warnings=' + w + '  infos=' + inf);
    if (opts.verbose || b > 0) {
      for (const i of issues) {
        if (!opts.verbose && i.level !== LEVELS.BLOCKER) continue;
        const sym = i.level === LEVELS.BLOCKER ? '[X]' : i.level === LEVELS.WARNING ? '[!]' : '[i]';
        let line = '    ' + sym + ' [' + i.id + '] ' + i.message;
        if (i.file) {
          const rel = path.relative(path.resolve(gamePath), i.file).replace(/\\/g, '/') || path.basename(i.file);
          line += '  (' + rel + (i.field ? ':' + i.field : '') + (i.line ? ':' + i.line : '') + ')';
        }
        console.log(line);
        if (opts.verbose && i.url) console.log('         ' + i.url);
      }
    }
  }

  console.log('');
  if (summary.blockers > 0) {
    console.log('SUBMISSION BLOCKED — ' + summary.blockers + ' blocker(s). Fix and re-run.');
  } else if (summary.fatals > 0) {
    console.log('VALIDATOR ERRORS — ' + summary.fatals + ' fatal(s). Inspect logs and fix.');
  } else {
    console.log('READY for submission (' + summary.warnings + ' warnings — review manually).');
  }
  console.log(banner);
}

function writeJsonReport(gamePath, results, summary) {
  const out = {
    game: path.basename(path.resolve(gamePath)),
    path: path.resolve(gamePath),
    timestamp: new Date().toISOString(),
    summary,
    validators: results.map(r => ({
      id: r.validator.ID,
      requirements: r.validator.REQUIREMENTS,
      ok: r.run.ok,
      error: r.run.error || null,
      issues: r.run.issues || []
    }))
  };
  const target = path.join(path.resolve(gamePath), '.pre-submit-report.json');
  fs.writeFileSync(target, JSON.stringify(out, null, 2));
  return target;
}

async function runOnGame(gamePath, opts) {
  // Validate path.
  if (!fs.existsSync(gamePath) || !fs.statSync(gamePath).isDirectory()) {
    console.error('Not a directory: ' + gamePath);
    process.exit(2);
  }

  const validators = await loadValidators();
  const results = [];
  for (const v of validators) {
    const run = runValidator(v, gamePath);
    results.push({ validator: v, run });
  }

  const summary = summarize(results);

  if (!opts.json || opts.both) printReport(gamePath, results, summary, opts);
  const jsonPath = writeJsonReport(gamePath, results, summary);
  if (opts.json && !opts.both) console.log(jsonPath);

  return summary;
}

async function runOnAll(opts) {
  const wpRoot = path.resolve('WorkProgress');
  if (!fs.existsSync(wpRoot)) { console.error('WorkProgress/ not found'); process.exit(2); }
  const games = fs.readdirSync(wpRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(wpRoot, d.name));
  let worstBlockers = 0, worstFatals = 0;
  for (const g of games) {
    console.log('\n');
    const s = await runOnGame(g, opts);
    if (s.blockers > worstBlockers) worstBlockers = s.blockers;
    if (s.fatals > worstFatals) worstFatals = s.fatals;
  }
  return { blockers: worstBlockers, fatals: worstFatals };
}

// CLI
const args = process.argv.slice(2);
const opts = {
  json: args.includes('--json'),
  both: args.includes('--both'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  all: args.includes('--all')
};
const positional = args.filter(a => !a.startsWith('-'));

(async () => {
  if (opts.all) {
    const s = await runOnAll(opts);
    process.exit(s.blockers > 0 || s.fatals > 0 ? 1 : 0);
  }
  if (positional.length === 0) {
    console.error('Usage:');
    console.error('  node scripts/pre-submit.mjs <gamePath> [--verbose] [--json]');
    console.error('  node scripts/pre-submit.mjs --all');
    process.exit(2);
  }
  const summary = await runOnGame(positional[0], opts);
  process.exit(summary.blockers > 0 || summary.fatals > 0 ? 1 : 0);
})();
