#!/usr/bin/env node
// check-debugcheck-fixtures.mjs — guards against debugcheck FALSE POSITIVES.
//
// Loads the REAL static checks from debugcheck.js (via its Node export) and runs them against a
// known-CLEAN game fixture. A clean, spec-compliant game must produce ZERO hard FAILs. If any
// static check returns false on the clean fixture, it's a false-positive bug in that check —
// exactly the class that wasted a release cycle (keyboard 1.6.1.2, anti-gaming integrity).
//
// This converts "I promise to test new checks against a good game" into a machine guarantee.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DC_PATH = join(ROOT, 'platforms', 'yandex', 'templates', 'debugcheck.js');
const CLEAN = join(HERE, 'fixtures', 'clean-game.html');

// --- Stub the browser globals debugcheck touches at load time, so require() doesn't throw. ---
const noop = () => {};
const elementStub = new Proxy({}, { get: () => noop });
globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
globalThis.setTimeout = globalThis.setTimeout || ((fn) => { try { fn(); } catch (e) {} return 0; });
globalThis.setInterval = globalThis.setInterval || (() => 0);
globalThis.document = {
  addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, createElement: () => elementStub, body: elementStub,
  documentElement: elementStub, hidden: false, location: { href: '' }
};
try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'ru', userAgent: 'node' }, configurable: true }); } catch (e) {}
globalThis.location = { href: '', host: '', hostname: '' };
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = (cb) => cb(0);
globalThis.AudioContext = function () { return new Proxy({}, { get: () => noop }); };
globalThis.getComputedStyle = () => new Proxy({}, { get: () => '' });
globalThis.YaGames = { init: () => Promise.resolve({}) };

const require = createRequire(import.meta.url);
let CATS;
try {
  const mod = require(DC_PATH);
  CATS = mod && mod.__CATS;
} catch (e) {
  console.error('✗ Could not load debugcheck.js for fixture testing:', e.message);
  process.exit(1);
}
if (!Array.isArray(CATS)) {
  console.error('✗ debugcheck.js did not export __CATS — the Node export guard is missing.');
  process.exit(1);
}

const cleanSrc = readFileSync(CLEAN, 'utf8');

// Categories that are RUNTIME (need a live browser DOM/probe) — can't be judged in Node, skip them.
// Identified by the convention used in debugcheck: title contains "Runtime", "(v2.4)", or is the
// runtime-detection group. The fixture test only validates STATIC source checks.
const isRuntimeCat = (cat) => /runtime/i.test(cat.title || '') || /v2\.4/i.test(cat.title || '') || cat.id === 'runtime';

// Run every STATIC check (has .test(s)) against the clean fixture.
const falsePositives = [];
let staticCount = 0;
for (const cat of CATS) {
  if (isRuntimeCat(cat)) continue;                 // runtime checks need a browser — not testable here
  if (cat.optional) continue;                      // optional features (IAP, gameplay markup) may be absent
  for (const ch of (cat.checks || [])) {
    if (typeof ch.test !== 'function') continue;     // skip runtime-only checks
    if (ch.guard) continue;                          // guard checks pass-when-absent; not a clean-game signal
    if (ch.runtime || ch.runtimeOnly) continue;
    staticCount++;
    let r;
    try { r = ch.test(cleanSrc); } catch (e) { r = '(threw: ' + e.message + ')'; }
    // Acceptable on a clean game: true (pass) or 'warn' (soft). Anything else = false positive.
    const ok = (r === true || r === 'warn' ||
                (r && typeof r === 'object' && r.pass === true));
    if (!ok) falsePositives.push({ cat: cat.title || cat.name || '?', name: ch.name, got: JSON.stringify(r) });
  }
}

console.log(`Ran ${staticCount} static debugcheck checks against the clean-game fixture.`);
if (falsePositives.length) {
  console.error(`\n✗ ${falsePositives.length} FALSE POSITIVE(S) — these checks FAIL a known-clean game:`);
  for (const f of falsePositives) console.error(`   - [${f.cat}] ${f.name}  → returned ${f.got}`);
  console.error('\nA check that fails a spec-compliant game is a bug. Fix the check (PASS/N/A on clean input).');
  process.exit(1);
}
console.log('✓ No false positives — every static check passes (or warns on) the clean fixture.');
process.exit(0);
