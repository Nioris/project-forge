// scripts/validators/emoji-compat.mjs
// EMOJI-COMPAT: emoji from Unicode 12.0+ render as `?` on older Android/iOS.
// Past bug (Driftworld): 🦪 (oyster, U+1F9AA, Unicode 13.0) used as the
// in-game pearl currency icon — 54 occurrences. On older devices users saw
// "?" everywhere instead of the icon. Same for 🪵 (wood) on the shop tab.
//
// Risk levels by Unicode codepoint:
//   U+1FA00-U+1FAFF (Symbols Extended-A): Unicode 12-14 → BLOCKER
//   U+1F900-U+1F9FF: Unicode 8-13, mixed → WARNING (manual review)
//   ≤ U+1F8FF: generally safe (Unicode ≤ 7.0 in most ranges) → no flag

import path from 'node:path';
import { LEVELS, walkFiles, readTextSafe, resolveGamePaths, runCli, isMain } from './_lib.mjs';

export const ID = 'emoji-compat';
export const REQUIREMENTS = ['EMOJI-COMPAT'];
export const URL = 'https://emojipedia.org/'; // reference site for Unicode versions

// Known-safe replacements suggested for common problematic emoji.
const SUGGEST = {
  '🦪': '💠 (white diamond, U+1F4A0, Unicode 6.0) — pearl-like',
  '🪵': '🚣 (rowboat, U+1F6A3, Unicode 6.0) — themed for raft games',
  '🛟': '🆘 (SOS, U+1F198, Unicode 6.0) — rescue context',
  '🪤': '🕸 (web, U+1F578, Unicode 7.0)',
  '🪢': '➰ (curly loop, U+27B0, Unicode 6.0)',
  '🪓': '⛏ (pick, U+26CF, Unicode 5.2)',
  '🩸': '🔴 (red circle, U+1F534, Unicode 6.0)',
  '🩹': '➕ (plus, U+2795, Unicode 6.0) — medical cross',
  '🥶': '❄ (snowflake, U+2744, Unicode 1.1)',
  '🦠': '☣ (biohazard, U+2623, Unicode 4.1)',
  '🧱': '📦 (package, U+1F4E6, Unicode 6.0)',
  '🧬': '⚕ (medical symbol, U+2695, Unicode 4.1)',
  '🧭': '🌐 (globe, U+1F310, Unicode 6.0)',
  '🤒': '😷 (face mask, U+1F637, Unicode 6.0)',
  '🤕': '😷',
  '🤢': '😷',
  '🧵': '👕 (t-shirt, U+1F455, Unicode 6.0) — cloth',
  '🧂': '⚪ (white circle, U+26AA, Unicode 4.1) — salt',
};

// Code-point classification. Mapped explicitly to Unicode versions per
// https://emojipedia.org and the Unicode emoji-test.txt files. The Transport-
// and-Map block (1F6xx) interleaves old and new — must enumerate, not range.
export function checkCodepoint(cp) {
  // Symbols and Pictographs Extended-A — entire block is Unicode 12+
  if (cp >= 0x1FA70 && cp <= 0x1FAFF) return { level: LEVELS.BLOCKER, era: 'Unicode 12+ (2019+)' };
  // Specific Transport-and-Map symbols added in Unicode 12+
  // 1F6D5 hindu temple, 1F6D6 hut, 1F6D7 elevator (12-13)
  if (cp >= 0x1F6D5 && cp <= 0x1F6D7) return { level: LEVELS.BLOCKER, era: 'Unicode 12-13' };
  // 1F6DC-1F6DF: placard, wheel, ring buoy (14.0)
  if (cp >= 0x1F6DC && cp <= 0x1F6DF) return { level: LEVELS.BLOCKER, era: 'Unicode 14.0 (2021)' };
  // 1F6FA-1F6FC: auto rickshaw, pickup truck, roller skate (12-13)
  if (cp >= 0x1F6FA && cp <= 0x1F6FC) return { level: LEVELS.BLOCKER, era: 'Unicode 12-13' };
  // Faces 1F970–1F97A are ALL Unicode 11+ (🥰11 🥱12 🥲13 🥳11 🥴11 🥵11 🥶11 🥷13 🥸13 🥹14 🥺11).
  // (Was 1F976–1F97A — missed 🥲1F972 tear-smile etc. Widened to close the gap.)
  if (cp >= 0x1F970 && cp <= 0x1F97A) return { level: LEVELS.BLOCKER, era: 'Unicode 11-14' };
  // ── Supplemental Symbols & Pictographs animals/faces block (1F980–1F9FF) ──
  // Previously hand-enumerated with GAPS — 🦖1F996 🦘1F998 🦫1F9AB slipped through holes
  // between sub-ranges (v4.18.x parkour caught beaver/T-Rex/kangaroo). Rewritten to a gap-free
  // range with explicit safe carve-outs, so NEW emoji in this block can't re-open a hole.
  // Safe (Unicode 9.0 / 2016, widely supported): 1F980–1F984 crab..unicorn, 1F985–1F991 eagle..shrimp.
  // Unicode 10.0 (2017, broadly safe): 1F9D0–1F9DF faces/fantasy (genie, zombie, elf…).
  if (cp >= 0x1F9D0 && cp <= 0x1F9DF) return null;                       // Unicode 10.0 — safe
  if (cp >= 0x1F980 && cp <= 0x1F991) return null;                       // Unicode 8-9 animals — safe
  // Everything else in 1F992–1F9FF is Unicode 11+ (2018+) → flag.
  if (cp >= 0x1F992 && cp <= 0x1F9FF) {
    // 13.0 (2020) sub-ranges are the riskiest (least-supported on old devices) → BLOCKER;
    // the rest (Unicode 11-12) → WARNING. 13.0 animals/body: 1F9AB-1F9AF, 1F9BB-1F9BF, oyster 1F9AA.
    if ((cp >= 0x1F9AB && cp <= 0x1F9AF) || (cp >= 0x1F9BB && cp <= 0x1F9BF) || cp === 0x1F9AA)
      return { level: LEVELS.BLOCKER, era: 'Unicode 13.0 (2020)' };
    return { level: LEVELS.WARNING, era: 'Unicode 11-12 (2018-19)' };
  }
  if (cp >= 0x1F9C3 && cp <= 0x1F9CB) return { level: LEVELS.WARNING, era: 'Unicode 12.0' };
  if (cp === 0x1F9C2) return { level: LEVELS.WARNING, era: 'Unicode 11.0 (salt)' };
  return null;
}

export function validate(gamePath) {
  const { workPath } = resolveGamePaths(gamePath);
  const issues = [];
  const files = walkFiles(workPath, ['.html', '.js']);
  // Aggregate per-emoji to avoid 54 separate issues for the same character
  const seen = new Map(); // emoji → { count, severity, era, files: Set, firstFile, firstLine }

  for (const file of files) {
    const text = readTextSafe(file);
    if (!text) continue;
    const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
      const ch = m[0];
      const cp = ch.codePointAt(0);
      const sev = checkCodepoint(cp);
      if (!sev) continue;
      if (!seen.has(ch)) {
        const lineNo = text.slice(0, m.index).split('\n').length;
        seen.set(ch, { count: 0, severity: sev, ch, cp, files: new Set(), firstFile: file, firstLine: lineNo });
      }
      const e = seen.get(ch);
      e.count++;
      e.files.add(file);
    }
  }

  for (const [ch, e] of seen) {
    const suggest = SUGGEST[ch] ? ' Suggest: ' + SUGGEST[ch] : ' Consider replacing with an emoji from Unicode ≤7.0 (see emojipedia.org).';
    issues.push({
      id: 'EMOJI-COMPAT',
      level: e.severity.level,
      message: 'Emoji ' + ch + ' (U+' + e.cp.toString(16).toUpperCase() + ', ' + e.severity.era + ') used ' + e.count + 'x — older Android/iOS render as "?" or tofu.' + suggest,
      citation: 'Past bug (Driftworld): 🦪 used as pearl currency icon (54x) showed as "?" on older devices. Yandex moderation does not require emoji compatibility per se, but UX is broken.',
      url: URL,
      file: e.firstFile,
      line: e.firstLine
    });
  }
  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
