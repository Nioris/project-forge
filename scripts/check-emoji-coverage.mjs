#!/usr/bin/env node
// check-emoji-coverage.mjs — guards against GAPS in the emoji-compat codepoint ranges.
//
// emoji-compat hand-classifies codepoints by Unicode era. Hand-maintained ranges grow holes
// (🦫1F9AB 🦘1F998 🦖1F996 slipped through gaps between sub-ranges). This asserts a curated list
// of KNOWN beyond-Yandex-spec emoji (Unicode 11+) are ALL flagged, and a list of KNOWN-SAFE
// emoji (Unicode ≤10) are NOT — so a future edit can't silently re-open a hole in either direction.

import { checkCodepoint } from '../platforms/yandex/validators/emoji-compat.mjs';

// Unicode 11+ (2018+) — these MUST be flagged (blocker or warning). Sampled across the 1F9xx
// block to cover the historically-gappy sub-ranges, plus a few from other blocks.
const MUST_FLAG = {
  '🦖 T-Rex': 0x1F996, '🦕 sauropod': 0x1F995, '🦘 kangaroo': 0x1F998, '🦙 llama': 0x1F999,
  '🦛 hippo': 0x1F99B, '🦜 parrot': 0x1F99C, '🦫 beaver': 0x1F9AB, '🦬 bison': 0x1F9AC,
  '🦣 mammoth': 0x1F9A3, '🦨 skunk': 0x1F9A8, '🦷 tooth': 0x1F9B7, '🦾 mech arm': 0x1F9BE,
  '🥲 tear-smile': 0x1F972, '🫠 melting': 0x1FAE0, '🩼 crutch': 0x1FA7C,
};
// Unicode ≤10 (≤2017) — broadly supported, must NOT be flagged.
const MUST_PASS = {
  '🦄 unicorn': 0x1F984, '🦅 eagle': 0x1F985, '🦐 shrimp': 0x1F990, '🦑 squid': 0x1F991,
  '🧐 monocle': 0x1F9D0, '🧞 genie': 0x1F9DE, '🧜 merperson': 0x1F9DC, '😀 grin': 0x1F600,
};

let failures = [];
for (const [name, cp] of Object.entries(MUST_FLAG)) {
  const r = checkCodepoint(cp);
  if (!r) failures.push(`MISSED (false-negative): ${name} U+${cp.toString(16).toUpperCase()} should be flagged but checkCodepoint returned null — a range gap reopened.`);
}
for (const [name, cp] of Object.entries(MUST_PASS)) {
  const r = checkCodepoint(cp);
  if (r) failures.push(`FALSE-POSITIVE: ${name} U+${cp.toString(16).toUpperCase()} is Unicode ≤10 (safe) but was flagged as ${r.level}/${r.era}.`);
}

const total = Object.keys(MUST_FLAG).length + Object.keys(MUST_PASS).length;
if (failures.length) {
  console.error(`✗ emoji-compat coverage: ${failures.length}/${total} wrong:`);
  failures.forEach(f => console.error('   - ' + f));
  process.exit(1);
}
console.log(`✓ emoji-compat coverage: all ${total} probes correct (${Object.keys(MUST_FLAG).length} flagged, ${Object.keys(MUST_PASS).length} clean — no range gaps).`);
process.exit(0);
