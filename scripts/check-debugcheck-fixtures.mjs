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

const findCheck = (name) => {
  for (const cat of CATS) {
    const found = (cat.checks || []).find((check) => check.name === name);
    if (found) return found;
  }
  throw new Error(`Missing debugcheck contract: ${name}`);
};

const contractFailures = [];
let contractCount = 0;
const expectResult = (name, source, expected, label) => {
  contractCount++;
  let got;
  try { got = findCheck(name).test(source); }
  catch (e) { got = `(threw: ${e.message})`; }
  if (got !== expected) contractFailures.push({ label, name, expected, got });
};

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

// Contract regressions: a token in an unrelated place must never turn a broken integration green.
expectResult(
  'Only Yandex ID authorization (п.1.2)',
  `google.accounts.id.initialize({client_id:'third-party'}); google.accounts.id.prompt();`,
  false,
  'explicit Google login is rejected'
);
expectResult(
  'Only Yandex ID authorization (п.1.2)',
  `// google.accounts.id.prompt();\nconst analyticsLabel = 'google analytics';`,
  true,
  'comments and analytics text do not trigger auth rejection'
);
expectResult(
  'Yandex ID dialog is user-initiated (п.1.2)',
  `YaGames.init().then(async sdk => { await sdk.auth.openAuthDialog(); });`,
  'warn',
  'automatic login dialog is not green'
);
const goodAuth = `<button id="login">Войти</button><p>Войдите, чтобы сохранять прогресс в облаке и продолжить на другом устройстве</p>
  <script>document.getElementById('login').addEventListener('click', function(){ ysdk.auth.openAuthDialog(); });<\/script>`;
expectResult('Yandex ID dialog is user-initiated (п.1.2)', goodAuth, true, 'click-bound login passes');
expectResult('Authorization offer explains its benefit (п.1.2.1)', goodAuth, true, 'benefit copy passes');
expectResult(
  'Authorization offer explains its benefit (п.1.2.1)',
  `<button>Войти</button><script>button.onclick=function(){ysdk.auth.openAuthDialog();};<\/script>`,
  'warn',
  'bare login CTA does not explain benefit'
);

const tokenOnlyAudio = `const ac = new AudioContext(); document.addEventListener('visibilitychange', function(){});`;
expectResult('visibilitychange actually mutes (п.1.3)', tokenOnlyAudio, 'warn', 'empty visibility handler is not green');
expectResult('Window blur/pagehide mutes sound (п.1.3)', tokenOnlyAudio, 'warn', 'missing blur handler is not green');
expectResult(
  'visibilitychange actually mutes (п.1.3)',
  `// AudioContext and visibilitychange are mentioned only in documentation`,
  true,
  'audio words in comments stay N/A'
);
const goodAudio = `const ac = new AudioContext(); function suspendAudio(){ac.suspend();}
  document.addEventListener('visibilitychange', function(){if(document.hidden){suspendAudio();}});
  window.addEventListener('blur', suspendAudio); window.addEventListener('pagehide', suspendAudio);`;
expectResult('visibilitychange actually mutes (п.1.3)', goodAudio, true, 'visibility mute passes');
expectResult('Window blur/pagehide mutes sound (п.1.3)', goodAudio, true, 'blur mute passes');
expectResult(
  'Window blur/pagehide mutes sound (п.1.3)',
  `const ac = new AudioContext(); window.addEventListener('blur', function(){ac.resume();});`,
  false,
  'explicit resume on blur fails'
);

expectResult(
  'Keyboard uses physical codes (п.1.6.2.4)',
  `addEventListener('keydown', e => { if(e.key === 'w') move(); }); addEventListener('keyup', e => console.log(e.code === 'KeyW'));`,
  'warn',
  'unrelated event.code cannot hide event.key WASD'
);
expectResult(
  'Keyboard uses physical codes (п.1.6.2.4)',
  `addEventListener('keydown', e => { if(e.code === 'KeyW' || e.code === 'ArrowUp') move(); });`,
  true,
  'physical code passes'
);

expectResult(
  'Rotation does not reset progress (п.1.9)',
  `window.addEventListener('orientationchange', function(){ resetGame(); });`,
  'warn',
  'destructive rotation without save/restore warns'
);
expectResult(
  'Rotation does not reset progress (п.1.9)',
  `function fit(){} window.addEventListener('orientationchange', fit);`,
  true,
  'non-destructive rotation passes'
);
expectResult(
  'Canvas resizes on orientation change (п.1.6.1.3/1.10.1)',
  `<canvas></canvas><script>window.addEventListener('resize', fit);<\/script>`,
  'warn',
  'canvas with resize only is not green'
);
expectResult(
  'Canvas resizes on orientation change (п.1.6.1.3/1.10.1)',
  `<canvas></canvas><script>window.addEventListener('resize', fit); window.addEventListener('orientationchange', function(){});<\/script>`,
  'warn',
  'empty orientation handler is not green'
);
expectResult(
  'Canvas resizes on orientation change (п.1.6.1.3/1.10.1)',
  `<canvas></canvas><script>window.addEventListener('resize', fit); window.addEventListener('orientationchange', fit);<\/script>`,
  true,
  'canvas resize plus orientation passes'
);

console.log(`Ran ${contractCount} focused debugcheck contract regressions.`);
if (contractFailures.length) {
  console.error(`\n✗ ${contractFailures.length} DEBUGCHECK CONTRACT REGRESSION(S):`);
  for (const f of contractFailures) {
    console.error(`   - ${f.label} [${f.name}] → expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.got)}`);
  }
  process.exit(1);
}
console.log('✓ Debugcheck contract regressions pass — broken integrations cannot pass on token presence alone.');
process.exit(0);
