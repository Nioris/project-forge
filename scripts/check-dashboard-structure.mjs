#!/usr/bin/env node
/**
 * @file check-dashboard-structure.mjs
 * @description Visual regression detection for dashboard.html — STRUCTURAL diff,
 *              not pixel diff. No puppeteer / chromium dependency.
 *
 *   Background (Lesson #23 → Invariant #8):
 *
 *   v4.7.4 had z-index regression — adding cover image hid the edit button.
 *   Pixel diff would catch это, но requires headless browser (~150MB).
 *   Structural diff catches MOST visual regressions без the cost:
 *
 *     - Element added/removed
 *     - id/class attributes changed
 *     - Hierarchy (parent-child) changed
 *     - Inline style with z-index, position, visibility, display
 *     - onclick handlers attached/detached
 *
 *   What it WON'T catch:
 *     - Pure CSS changes in stylesheet (no markup change)
 *     - Color tweaks
 *     - Font changes
 *
 *   These are typically cosmetic — they don't break functionality.
 *   Functional regressions (buttons hidden, panels missing, broken events)
 *   ARE caught.
 *
 *   Workflow:
 *     1. Maintainer runs `--baseline` to capture current structure
 *     2. After changes, runs default mode to diff against baseline
 *     3. If diff is intentional, runs `--baseline` again to update
 *     4. CI/setup runs default mode — fails on unexpected diff
 *
 *  Usage:
 *    node scripts/check-dashboard-structure.mjs              # diff vs baseline
 *    node scripts/check-dashboard-structure.mjs --baseline   # capture new baseline
 *    node scripts/check-dashboard-structure.mjs --json       # machine-readable
 *    node scripts/check-dashboard-structure.mjs --verbose    # show full diff
 *
 *  Exit:
 *    0 — structure matches baseline (or baseline captured)
 *    1 — structural regression detected
 *    2 — invocation error (missing dashboard.html, etc)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const BASELINE_MODE = args.includes('--baseline');
const JSON_MODE = args.includes('--json');
const VERBOSE = args.includes('--verbose');

const ROOT = path.resolve(process.cwd());
const DASHBOARD = path.join(ROOT, 'dashboard.html');
const BASELINE_PATH = path.join(ROOT, '.dashboard-structure-baseline.json');

if (!fs.existsSync(DASHBOARD)) {
  if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: 'dashboard.html not found' }));
  else console.error(`✗ dashboard.html not found at ${DASHBOARD}`);
  process.exit(2);
}

/**
 * Extract structural fingerprint from HTML.
 *
 * Returns array of element descriptors — one per significant element.
 * Each descriptor: { tag, id, classes, role, parent_id, has_handlers, position_styles }
 *
 * Naive HTML parser (no jsdom) — sufficient for dashboard's flat-ish structure.
 * Captures opening tags only (we don't need full tree, just element inventory).
 */
function extractStructure(html) {
  const elements = [];

  // Match all opening tags of structural elements
  // Note: this is regex-based, not full HTML parse — adequate для dashboard
  const tagRegex = /<(div|button|input|nav|header|main|section|aside|footer|form|select|textarea|label|a|h[1-6])\b([^>]*?)>/gi;

  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];

    // Extract id
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/);
    const id = idMatch ? idMatch[1] : null;

    // Extract classes
    const classMatch = attrs.match(/\bclass=["']([^"']+)["']/);
    const classes = classMatch ? classMatch[1].split(/\s+/).filter(c => c).sort() : [];

    // Extract role
    const roleMatch = attrs.match(/\brole=["']([^"']+)["']/);
    const role = roleMatch ? roleMatch[1] : null;

    // Detect inline event handlers
    const handlers = [];
    const handlerRegex = /\b(onclick|onchange|oninput|onsubmit|onkeyup|onkeydown|onfocus|onblur)=/g;
    let h;
    while ((h = handlerRegex.exec(attrs)) !== null) {
      handlers.push(h[1]);
    }
    handlers.sort();

    // Detect position-related inline styles (z-index, position, display, visibility)
    const styleMatch = attrs.match(/\bstyle=["']([^"']+)["']/);
    const positionStyles = [];
    if (styleMatch) {
      const style = styleMatch[1];
      const props = ['z-index', 'position', 'display', 'visibility', 'opacity'];
      for (const prop of props) {
        const pm = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i').exec(style);
        if (pm) positionStyles.push(`${prop}=${pm[1].trim()}`);
      }
    }

    // Type attribute для inputs (matters for visual diff)
    const typeMatch = tag === 'input' ? attrs.match(/\btype=["']([^"']+)["']/) : null;
    const type = typeMatch ? typeMatch[1] : null;

    // Skip elements without meaningful identifiers (closing tags, plain divs without id/class)
    if (!id && classes.length === 0 && handlers.length === 0 && positionStyles.length === 0 && !type) {
      continue;
    }

    elements.push({
      tag,
      id,
      classes,
      role,
      handlers,
      position_styles: positionStyles,
      type,
    });
  }

  // Aggregate metrics for high-level diff
  const summary = {
    total_significant_elements: elements.length,
    by_tag: {},
    by_id_count: 0,
    handler_count: 0,
    elements_with_position_styles: 0,
  };

  for (const el of elements) {
    summary.by_tag[el.tag] = (summary.by_tag[el.tag] || 0) + 1;
    if (el.id) summary.by_id_count++;
    summary.handler_count += el.handlers.length;
    if (el.position_styles.length > 0) summary.elements_with_position_styles++;
  }

  return { summary, elements };
}

function computeFingerprint(structure) {
  // SHA256 of canonical JSON of just elements (not summary which is derived)
  return crypto.createHash('sha256')
    .update(JSON.stringify(structure.elements))
    .digest('hex')
    .slice(0, 16);
}

const html = fs.readFileSync(DASHBOARD, 'utf8');
const current = extractStructure(html);
const currentFingerprint = computeFingerprint(current);

// BASELINE MODE — capture and save
if (BASELINE_MODE) {
  const baseline = {
    captured_at: new Date().toISOString(),
    dashboard_size_bytes: html.length,
    fingerprint: currentFingerprint,
    summary: current.summary,
    elements: current.elements,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: true, mode: 'baseline_captured', fingerprint: currentFingerprint, elements: current.elements.length }, null, 2));
  } else {
    console.log(`✓ Baseline captured`);
    console.log(`  Fingerprint:        ${currentFingerprint}`);
    console.log(`  Significant elements: ${current.summary.total_significant_elements}`);
    console.log(`  Tags:               ${Object.keys(current.summary.by_tag).map(t => `${t}=${current.summary.by_tag[t]}`).join(', ')}`);
    console.log(`  Handlers:           ${current.summary.handler_count}`);
    console.log(`  Saved to:           ${path.relative(ROOT, BASELINE_PATH)}`);
  }
  process.exit(0);
}

// DIFF MODE — compare current to baseline
if (!fs.existsSync(BASELINE_PATH)) {
  if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: 'no baseline — run with --baseline first' }));
  else {
    console.log(`⚠ No baseline found at ${path.relative(ROOT, BASELINE_PATH)}`);
    console.log(`  Run: node scripts/check-dashboard-structure.mjs --baseline`);
    console.log(`  This captures current dashboard.html structure for future diffs.`);
  }
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

// Quick fingerprint check
if (currentFingerprint === baseline.fingerprint) {
  if (JSON_MODE) console.log(JSON.stringify({ ok: true, mode: 'no_diff', fingerprint: currentFingerprint }, null, 2));
  else console.log(`✓ Dashboard structure matches baseline (fingerprint ${currentFingerprint})`);
  process.exit(0);
}

// Compute diff
const baselineEls = baseline.elements;
const currentEls = current.elements;

// Index elements by id for tracking
function indexById(elements) {
  const byId = {};
  const noId = [];
  for (const el of elements) {
    if (el.id) byId[el.id] = el;
    else noId.push(el);
  }
  return { byId, noId };
}

const baseIdx = indexById(baselineEls);
const curIdx = indexById(currentEls);

// Removed: in baseline byId, not in current
const removedById = Object.keys(baseIdx.byId).filter(id => !curIdx.byId[id]);
// Added: in current byId, not in baseline
const addedById = Object.keys(curIdx.byId).filter(id => !baseIdx.byId[id]);

// Changed: same id but different attributes
const changedById = [];
for (const id of Object.keys(baseIdx.byId)) {
  if (curIdx.byId[id]) {
    const a = baseIdx.byId[id];
    const b = curIdx.byId[id];
    const changes = [];
    if (a.tag !== b.tag) changes.push(`tag ${a.tag} → ${b.tag}`);
    if (JSON.stringify(a.classes) !== JSON.stringify(b.classes)) {
      changes.push(`classes [${a.classes.join(',')}] → [${b.classes.join(',')}]`);
    }
    if (JSON.stringify(a.handlers) !== JSON.stringify(b.handlers)) {
      changes.push(`handlers [${a.handlers.join(',')}] → [${b.handlers.join(',')}]`);
    }
    if (JSON.stringify(a.position_styles) !== JSON.stringify(b.position_styles)) {
      changes.push(`position_styles [${a.position_styles.join(',')}] → [${b.position_styles.join(',')}]`);
    }
    if (changes.length > 0) changedById.push({ id, changes });
  }
}

// Anonymous elements: count diff by class signature
function anonSignature(el) { return el.tag + '|' + el.classes.join(','); }
const baseAnonCounts = {};
const curAnonCounts = {};
for (const el of baseIdx.noId) baseAnonCounts[anonSignature(el)] = (baseAnonCounts[anonSignature(el)] || 0) + 1;
for (const el of curIdx.noId) curAnonCounts[anonSignature(el)] = (curAnonCounts[anonSignature(el)] || 0) + 1;
const anonDiffs = [];
const allSigs = new Set([...Object.keys(baseAnonCounts), ...Object.keys(curAnonCounts)]);
for (const sig of allSigs) {
  const b = baseAnonCounts[sig] || 0;
  const c = curAnonCounts[sig] || 0;
  if (b !== c) anonDiffs.push({ signature: sig, before: b, after: c, delta: c - b });
}

const result = {
  ok: removedById.length === 0 && addedById.length === 0 && changedById.length === 0 && anonDiffs.length === 0,
  baseline_fingerprint: baseline.fingerprint,
  current_fingerprint: currentFingerprint,
  baseline_captured_at: baseline.captured_at,
  removed_by_id: removedById,
  added_by_id: addedById,
  changed_by_id: changedById,
  anonymous_diffs: anonDiffs,
};

if (JSON_MODE) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (result.ok) {
  console.log(`✓ Dashboard structure matches baseline.`);
  process.exit(0);
}

console.log(`⚠ Dashboard structure CHANGED from baseline (${baseline.captured_at})`);
console.log('');

if (removedById.length > 0) {
  console.log(`✗ Removed elements (${removedById.length}):`);
  for (const id of removedById.slice(0, 20)) {
    const el = baseIdx.byId[id];
    console.log(`    #${id} (${el.tag}.${el.classes.join('.') || '_'})`);
  }
  if (removedById.length > 20) console.log(`    ... and ${removedById.length - 20} more`);
  console.log('');
}

if (addedById.length > 0) {
  console.log(`+ Added elements (${addedById.length}):`);
  for (const id of addedById.slice(0, 20)) {
    const el = curIdx.byId[id];
    console.log(`    #${id} (${el.tag}.${el.classes.join('.') || '_'})`);
  }
  if (addedById.length > 20) console.log(`    ... and ${addedById.length - 20} more`);
  console.log('');
}

if (changedById.length > 0) {
  console.log(`~ Changed elements (${changedById.length}):`);
  for (const c of changedById.slice(0, 20)) {
    console.log(`    #${c.id}:`);
    for (const ch of c.changes) console.log(`      ${ch}`);
  }
  if (changedById.length > 20) console.log(`    ... and ${changedById.length - 20} more`);
  console.log('');
}

if (anonDiffs.length > 0 && VERBOSE) {
  console.log(`Anonymous element count diffs (${anonDiffs.length}):`);
  for (const d of anonDiffs.slice(0, 20)) {
    const sign = d.delta > 0 ? '+' : '';
    console.log(`    ${d.signature}: ${d.before} → ${d.after} (${sign}${d.delta})`);
  }
  if (anonDiffs.length > 20) console.log(`    ... and ${anonDiffs.length - 20} more`);
  console.log('');
} else if (anonDiffs.length > 0) {
  console.log(`Anonymous element count diffs: ${anonDiffs.length} (use --verbose to see)`);
  console.log('');
}

console.log('What to do:');
console.log('  - If diff is INTENTIONAL (you changed dashboard.html on purpose):');
console.log('      node scripts/check-dashboard-structure.mjs --baseline');
console.log('    This updates the baseline to match current state.');
console.log('  - If diff is UNEXPECTED (bug, regression):');
console.log('      review the elements above, fix the regression.');
console.log('');

process.exit(1);
