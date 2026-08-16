// scripts/validators/i18n-completeness.mjs
//
// REQ-2.14, REQ-8.2.3 — language detection and translation completeness.
// Source: https://yandex.ru/dev/games/doc/ru/requirements/2/14
//         https://yandex.ru/dev/games/doc/ru/requirements/8/2/3
//
// Critical: this validator catches WHY YG Screenshot extension shows mixed
// languages on screenshots. If setLang() is called at runtime but elements
// remain in the original language, the extension cannot produce correct
// per-language screenshots, and moderators see "untranslated text".
//
// Five checks:
//   (1) English-looking words inside non-EN/RU language blocks
//       (e.g. "Hold" in I18N.tr.ctrl7 — will show as English on Turkish locale)
//   (2) t()/td() called at top level of a script (frozen to default _lang='ru')
//   (3) Each show*/render*/draw* function that calls t()/td() should also
//       register onLangChange(), otherwise setLang() won't refresh that screen.
//   (4) For every t('key') used in code, that key exists in EVERY declared
//       language block (not just RU/EN).
//   (5) Declared languages in store-listing-*.json are covered by I18N blocks.

import path from 'node:path';
import fs from 'node:fs';
import { LEVELS, SUPPORTED_LANGS, NON_LATIN_LANGS, resolveGamePaths, listFiles, walkFiles, readTextSafe, readJsonSafe, runCli, isMain } from './_lib.mjs';

export const ID = 'i18n-completeness';
export const REQUIREMENTS = ['REQ-2.14', 'REQ-8.2.3'];
export const URL_214 = 'https://yandex.ru/dev/games/doc/ru/requirements/2/14';
export const URL_823 = 'https://yandex.ru/dev/games/doc/ru/requirements/8/2/3';

// English stop-list — split into two tiers based on observed Yandex moderation behavior.
//
// TIER A ("always flag"): words moderation has rejected for in past — verbs/instructions/CTAs
// that MUST be translated. Past rejection: Block2048 had "Hold" in Turkish locale.
//
// TIER B ("loanword"): widely-accepted loanwords in Latin-script languages
// (fr/de/es/it/pt/tr/id). Real games (Yandex-approved) use "Menu", "Score", "Level",
// "Pause", "Bonus", "Combo" untranslated in fr/de/etc. Only flag these when the value
// appears in a NON-Latin-script block (ru/ar/ja/hi/zh) where any Latin = clearly forgotten.
const EN_STOP_WORDS_HARD = [
  'Try Again','Watch','Hold','Tap','Click','Swipe','Loading','Connect',
  'Login','Register','Help','About','Buy','Shop','Quit','Exit','Settings',
  'Language','Tutorial'
];
const EN_STOP_WORDS_SOFT = [
  'Play','Continue','Start','Pause','Resume','Restart','Menu','Back',
  'Next','Yes','No','OK','Close','Open','Save','Load','Reward',
  'Score','Level','Game Over','Sound','Music','Volume','High Score','Best',
  'Coins','Lives','Health','Bonus','Combo','Bomb','Magnet'
];

const EN_STOP_RE_HARD = new RegExp('\\b(' + EN_STOP_WORDS_HARD.map(w => w.replace(/\s+/g, '\\s+')).join('|') + ')\\b', 'i');
const EN_STOP_RE_SOFT = new RegExp('\\b(' + EN_STOP_WORDS_SOFT.map(w => w.replace(/\s+/g, '\\s+')).join('|') + ')\\b', 'i');
// Combined: used only inside non-Latin-script blocks (where any English is bad).
const EN_STOP_RE = new RegExp('\\b(' + [...EN_STOP_WORDS_HARD, ...EN_STOP_WORDS_SOFT].map(w => w.replace(/\s+/g, '\\s+')).join('|') + ')\\b', 'i');

// Languages where Latin-only text in I18N values almost certainly means "not translated".
// EN is excluded — its values ARE in Latin. PT/ES/FR/DE/IT/TR/ID also use Latin so for them
// we require *non-trivial* presence of language-specific marks (accents, ñ, ş, etc) to rule out
// English bleed-through.
const FLAG_LATIN_FOR_LANGS = new Set(NON_LATIN_LANGS); // ru, ar, ja, hi, zh

// Per-language script test: does the value contain at least some characters in that language's script?
function hasNativeScript(lang, value) {
  if (!value) return false;
  switch (lang) {
    case 'ru': return /[а-яёА-ЯЁ]/.test(value);
    case 'ar': return /[\u0600-\u06FF]/.test(value);
    case 'ja': return /[\u3040-\u30FF\u4E00-\u9FFF]/.test(value);
    case 'hi': return /[\u0900-\u097F]/.test(value);
    case 'zh': return /[\u4E00-\u9FFF]/.test(value);
    default: return true; // Latin langs — handled elsewhere
  }
}

// =========================================================================
// AST-light: extract language blocks from a JS source.
// We rely on the existing convention: I18N = { ru: {...}, en: {...}, ... }
// or const RU_STRINGS = {...}; const EN_STRINGS = {...}
// Returns array of { lang, blockText, fileLine, file }
// =========================================================================
function extractLangBlocks(text, file) {
  const blocks = [];
  for (const lang of SUPPORTED_LANGS) {
    const LANG = lang.toUpperCase();
    // Patterns:
    //   A) ru:{ ... }  or "ru":{ ... }                     — UI block in I18N object literal
    //   B) DATA_RU = { ... } or NARRATIVE_RU = { ... }      — data/narrative top-level dict
    //   C) const STRINGS_RU = { ... }                        — alt convention
    //   D) I18N.ru = { ... } / LANG.ru = { ... }            — assignment style (samogonshchik)
    const patterns = [
      new RegExp("[\"']?" + lang + "[\"']?\\s*:\\s*\\{", 'g'),
      new RegExp("\\b(?:const|let|var)\\s+(?:DATA|NARRATIVE|STRINGS|I18N|LANG)_" + LANG + "\\s*=\\s*\\{", 'g'),
      new RegExp("\\b(?:DATA|NARRATIVE|STRINGS|I18N|LANG)_" + LANG + "\\s*=\\s*\\{", 'g'),
      new RegExp("\\b(?:I18N|LANG|STRINGS|DATA|NARRATIVE|L|T|TR|LOC|LOCALE)\\s*\\.\\s*" + lang + "\\s*=\\s*\\{", 'g'),
      new RegExp("\\b(?:I18N|LANG|STRINGS|DATA|NARRATIVE|L|T|TR|LOC|LOCALE)\\s*\\[\\s*[\"']" + lang + "[\"']\\s*\\]\\s*=\\s*\\{", 'g')
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const bracketStart = m.index + m[0].length - 1;
        const blockText = sliceMatchingBrace(text, bracketStart);
        if (!blockText) continue;
        const lineNo = text.slice(0, m.index).split('\n').length;
        blocks.push({ lang, blockText, file, fileLine: lineNo });
      }
    }
  }
  return blocks;
}

// Given text and index of an opening brace '{', return substring up to matching close.
function sliceMatchingBrace(text, openIdx) {
  if (text[openIdx] !== '{') return null;
  let depth = 0;
  let inStr = null; // null | "'" | '"' | '`'
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

// Extract key:value pairs from a single language block string.
// Returns array of { key, value, offset } where offset is position inside blockText.
function extractKeyValues(blockText) {
  const out = [];
  // Match: keyName: 'value'  OR  "keyName": "value"
  // Permit escaped quotes inside.
  // Simple state machine — sufficient for our hand-written I18N files.
  const re = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/g;
  let m;
  while ((m = re.exec(blockText)) !== null) {
    const key = m[1];
    const value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
    out.push({ key, value, offset: m.index });
  }
  return out;
}

// =========================================================================
// Main validate
// =========================================================================
export function validate(gamePath) {
  const { workPath, releasePath } = resolveGamePaths(gamePath);
  const issues = [];

  // Declared languages from store-listings.
  const declaredLangs = listFiles(releasePath, /^store-listing-([a-z]{2})\.json$/)
    .map(f => path.basename(f).match(/^store-listing-([a-z]{2})\.json$/)[1]);

  // Collect all language blocks across JS/HTML files.
  const jsFiles = walkFiles(workPath, ['.js', '.html']);
  const allBlocks = [];           // { lang, blockText, file, fileLine }
  const blocksByLang = new Map(); // lang -> [block]

  for (const file of jsFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    const blocks = extractLangBlocks(text, file);
    for (const b of blocks) {
      allBlocks.push(b);
      if (!blocksByLang.has(b.lang)) blocksByLang.set(b.lang, []);
      blocksByLang.get(b.lang).push(b);
    }
  }

  // === Check (5): declared langs are covered by I18N blocks ===
  for (const lang of declaredLangs) {
    if (!blocksByLang.has(lang)) {
      issues.push({
        id: 'REQ-8.2.3', level: LEVELS.BLOCKER,
        message: 'Language "' + lang + '" declared in store-listing but no I18N block found in code',
        citation: '"Тексты, которые меняются в зависимости от языка ... переведены на соответствующий язык" (8.2.3)',
        url: URL_823, file: 'store-listing-' + lang + '.json'
      });
    }
  }

  // === Check (1): English text leaks inside non-Latin language blocks ===
  // Past defect (Apr 2026, VirusClicker v8.7): RU block had `easy:'Easy'`,
  // `medium:'Medium'`, `hard:'Hard'`, `extreme:'Extreme'`, `prestige_tab:'🔮Prestige'`,
  // `tut8_t:'🔮 Prestige'`. Validator missed all because:
  //   1) RU was unconditionally skipped (`continue`) at the top of the loop,
  //   2) For other non-Latin langs, blocker fired ONLY for stop-words or
  //      "Capital Word + Capital Word" pairs — single English words like
  //      "Easy" or "Prestige" passed through.
  // Fixed: include RU; for any non-Latin lang, ANY all-Latin value with
  // ≥3 letters is a blocker — unless whitelisted as an obvious abbrev/code.
  //
  // Whitelist (case-sensitive regex against the trimmed value):
  //   - Pure ALL-CAPS abbreviations 2-5 chars (DNA, BP, RV, OK, NEW, HD, FX, XP, LV, MAX, IAP, SDK)
  //   - Bracket numbers/multipliers/percentages (handled by lettersOnly count)
  //   - Game-specific brand names like "Virus Clicker", "Driftworld" — must live
  //     in a per-game `.i18n-allow.json` to keep the validator generic.
  //     Optional file: <gamePath>/.i18n-allow.json with shape { ru: ["Brand", ...], ... }
  // ----------------------------------------------------------------------
  let perGameAllow = {};
  try {
    const allowPath = path.join(workPath, '.i18n-allow.json');
    if (fs.existsSync(allowPath)) perGameAllow = JSON.parse(fs.readFileSync(allowPath, 'utf8'));
  } catch (e) { /* ignore malformed */ }
  const isAbbreviation = (v) => /^[A-Z]{2,5}$/.test(v); // DNA, BP, RV, OK, NEW, MAX, etc
  const isAllowedFor = (lang, v) => {
    const list = perGameAllow[lang] || [];
    return list.includes(v);
  };

  // Auto-whitelist: if a key has the SAME value in EN and in the lang being
  // checked, that value is intentionally constant across languages (brand
  // names like "Driftworld", product placeholders like "Virus-X", titles per
  // REQ-5.1.3 which MUST be identical, codes/version strings).
  // EXCEPT — common English UI words (easy/hard/watch/play/menu) where same-
  // as-EN means "lazy untranslated", not "intentional brand".
  const enKeyValues = new Map();
  for (const block of allBlocks) {
    if (block.lang !== 'en') continue;
    for (const { key, value } of extractKeyValues(block.blockText)) {
      if (value && !enKeyValues.has(key)) enKeyValues.set(key, value);
    }
  }
  // Words that MUST be translated even if identical between EN and target.
  // These are common UI verbs/adjectives — if author left them unchanged in
  // RU/JA/etc, that's lazy untranslated, not intentional.
  const COMMON_EN_WORDS = new Set([
    'easy','medium','hard','extreme','normal','difficult','difficulty',
    'watch','click','tap','hold','press','swipe','drag',
    'play','pause','resume','stop','start','restart','reset','exit','quit','back','next','prev','skip',
    'menu','home','settings','options','help','about','close','open',
    'shop','store','buy','sell','price','cost','free',
    'level','score','high','best','top','rank','rating',
    'win','wins','lose','loses','victory','defeat','game','round','match',
    'new','old','more','less','all','none','any','any',
    'gold','gem','gems','coin','coins','money','cash','currency','dna',
    'life','lives','health','energy','time','timer',
    'tutorial','achievement','achievements','mission','missions','quest','quests',
    'daily','weekly','reward','rewards','bonus','extra','prize',
    'prestige','rebirth','reincarnate','upgrade','upgrades','evolution','mutation','mutations',
    'continue','again','retry','undo','redo','clear','delete','remove','add',
    'sound','music','volume','mute','language','lang',
    'yes','no','ok','cancel','save','load','share','export','import',
    'speed','power','strength','damage','defense','attack','defend',
    'leaderboard','ranking','friends','online','offline'
  ]);
  const isCommonWord = (cleaned) => {
    const lc = cleaned.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
    return COMMON_EN_WORDS.has(lc);
  };
  const matchesEn = (key, value) => {
    const en = enKeyValues.get(key);
    return en !== undefined && en === value;
  };

  for (const block of allBlocks) {
    const lang = block.lang;
    if (lang === 'en') continue; // English block is BY DEFINITION English
    if (lang === 'be' || lang === 'kk' || lang === 'uk' || lang === 'uz') continue; // out of scope
    const kvs = extractKeyValues(block.blockText);
    for (const { key, value, offset } of kvs) {
      if (!value) continue;
      // Allow short codes/keys/abbreviations: only flag values long enough to be a phrase.
      if (value.length < 3) continue;
      // Allow values that contain native-script characters somewhere (then EN word is incidental).
      if (FLAG_LATIN_FOR_LANGS.has(lang) && hasNativeScript(lang, value)) continue;
      // For non-Latin langs (ru/ar/ja/hi/zh) — strip emoji/punctuation/spaces
      // first, then check whether the *remaining* text is all Latin letters.
      // This catches `'🔮Prestige'` and `'🔮 Prestige'` which would otherwise
      // trip the `^[\x20-\x7E]+$` test (emoji are non-ASCII).
      if (FLAG_LATIN_FOR_LANGS.has(lang) && /[A-Za-z]/.test(value)) {
        // Strip emoji + symbols + whitespace — keep only letters/digits/punct.
        const cleaned = value.replace(/[\s\p{Extended_Pictographic}\p{So}\p{Sk}]+/gu, ' ').trim();
        // After cleaning, is the remaining content purely Latin letters/spaces/digits/punct?
        const cleanedIsAllLatin = /^[\x20-\x7E]+$/.test(cleaned);
        const lettersOnly = cleaned.replace(/[^A-Za-z]/g, '');
        if (cleanedIsAllLatin && lettersOnly.length >= 3) {
          // Pure abbreviation (DNA, BP, RV, OK, NEW, MAX) — allow.
          if (isAbbreviation(cleaned)) continue;
          // AUTO-WHITELIST: same value as EN for this key → intentionally
          // identical across langs (brand name like "Driftworld",
          // placeholder like "Virus-X", code like "BP", title per REQ-5.1.3).
          // EXCEPT common UI words (Easy/Hard/Menu/Score) — those MUST be
          // translated even if EN block has them too (lazy untranslated).
          if (matchesEn(key, value) && !isCommonWord(cleaned)) continue;
          // Per-game whitelist (rare overrides — brand names that differ
          // from the EN block, or stylized slogans).
          if (isAllowedFor(lang, value) || isAllowedFor(lang, cleaned)) continue;
          const lineNo = block.fileLine + block.blockText.slice(0, offset).split('\n').length - 1;
          issues.push({
            id: 'REQ-8.2.3', level: LEVELS.BLOCKER,
            message: 'I18N.' + lang + '.' + key + ' = "' + value + '" — Latin-only content in a "' + lang + '" block (likely English / untranslated)',
            citation: 'REQ-8.2.3: all language-dependent text must be translated. Auto-allowed if value matches EN[' + key + '] (intentional brand/title constant per REQ-5.1.3). Override via <gamePath>/.i18n-allow.json',
            url: URL_823, file: block.file, field: lang + '.' + key, line: lineNo
          });
        }
      }
      // For Latin-script langs (fr/de/es/it/pt/tr/id): only flag if value contains
      // a HARD stop-word ("Hold", "Tap", "Watch", etc) — verbs/instructions that
      // MUST be translated. Loanwords like "Menu", "Score", "Level", "Pause" are
      // routinely used untranslated in these languages — don't flag them.
      if (!FLAG_LATIN_FOR_LANGS.has(lang) && lang !== 'en') {
        if (EN_STOP_RE_HARD.test(value)) {
          // Confidence boost: check that value doesn't contain any chars typical for THIS language.
          const langDiacritics = {
            es: /[ñáéíóúü]/i, fr: /[àâçéèêëîïôûùüÿœ]/i, de: /[äöüß]/i,
            it: /[àèéìíîòóùú]/i, pt: /[ãõáéíóúâêôç]/i, tr: /[çğıöşü]/i, id: null
          };
          const dr = langDiacritics[lang];
          if (!dr || !dr.test(value)) {
            const lineNo = block.fileLine + block.blockText.slice(0, offset).split('\n').length - 1;
            issues.push({
              id: 'REQ-8.2.3', level: LEVELS.WARNING,
              message: 'I18N.' + lang + '.' + key + ' = "' + value + '" — English instruction/CTA in "' + lang + '" block (must translate)',
              citation: 'Past rejection: Block2048 had "Hold" in Turkish locale.',
              url: URL_823, file: block.file, field: lang + '.' + key, line: lineNo
            });
          }
        }
      }
    }
  }

  // === Check (4): every t('key') referenced in code exists in every declared language ===
  // Collect all keys used.
  const usedKeys = new Set();
  for (const file of jsFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    // t('key') or t("key") or td(...)
    const re = /\b(?:t|td|Plat\.t)\s*\(\s*['"]([A-Za-z0-9_]+)['"]\s*[,)]/g;
    let m;
    while ((m = re.exec(text)) !== null) usedKeys.add(m[1]);
  }

  // Collect available keys per language.
  // extractKeyValues only matches string-valued keys (key: 'val'). Many games
  // store keys with array/object/number values (e.g. nw: ['New virus', ...] —
  // a news ticker). Use a broader scan to know which keys are simply DEFINED
  // for presence-checking, regardless of value type.
  const availableByLang = new Map();
  for (const block of allBlocks) {
    if (!availableByLang.has(block.lang)) availableByLang.set(block.lang, new Set());
    for (const { key } of extractKeyValues(block.blockText)) {
      availableByLang.get(block.lang).add(key);
    }
    // Also catch array/object/number-valued keys: `key: [...]`, `key: {...}`,
    // `key: 123`, `key: true`. Avoids false-positive "missing nw" when nw is
    // an array of news strings.
    const reAny = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(?=[\[\{0-9tfn])/g;
    let m;
    while ((m = reAny.exec(block.blockText)) !== null) {
      availableByLang.get(block.lang).add(m[1]);
    }
  }

  // For each used key — must exist in every declared language with an I18N block.
  for (const lang of declaredLangs) {
    if (!blocksByLang.has(lang)) continue; // already flagged in check (5)
    const have = availableByLang.get(lang) || new Set();
    const missing = [];
    for (const k of usedKeys) {
      if (!have.has(k)) missing.push(k);
    }
    if (missing.length > 0) {
      const sample = missing.slice(0, 5).join(', ');
      const more = missing.length > 5 ? ' ... +' + (missing.length - 5) + ' more' : '';
      issues.push({
        id: 'REQ-8.2.3', level: LEVELS.BLOCKER,
        message: 'I18N.' + lang + ' missing ' + missing.length + ' keys used in code: ' + sample + more,
        citation: 'All used translation keys must be defined for every declared language.',
        url: URL_823, file: blocksByLang.get(lang)[0].file, field: lang
      });
    }
  }

  // === Check (2): t()/td() called at the top level of a script ===
  // Heuristic: find lines that start (after whitespace) with patterns like
  //   const X = t('foo');   const Y = [t('a'), t('b')];   document.getElementById(...).textContent = t('foo');
  // outside of any function/class definition. Reliable AST is hard — we use indentation + bracket counter.
  for (const file of jsFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    issues.push(...findTopLevelTCalls(text, file));
  }

  // === Check (3): show*/render*/draw* functions using t()/td() should call onLangChange ===
  for (const file of jsFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    issues.push(...findUnregisteredRenderers(text, file));
  }

  // === Check (6): hardcoded Cyrillic in HTML body text nodes ===
  // Catches Russian text sitting in <div>/<span>/<button>/etc that bypasses
  // applyStaticLang() entirely. YG Screenshot extension renders these — they
  // appear in non-RU screenshots as Russian → moderation rejection (Block2048
  // pattern, Circle 2048 v1.1 had it for "Итоговый счет:" and "Уровень 1 пройден").
  const htmlFiles = walkFiles(workPath, ['.html']);
  for (const file of htmlFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    issues.push(...findCyrillicInHtmlBody(text, file));
  }

  return issues;
}

// =========================================================================
// Find Cyrillic text in HTML body text nodes (outside <script>/<style>).
// Skips elements with id whose textContent gets overwritten in applyStaticLang
// (heuristic: scan for `getElementById('id').textContent` / `.innerHTML` calls).
// =========================================================================
function findCyrillicInHtmlBody(text, file) {
  const issues = [];
  // Strip <script>, <style>, and HTML comments — we don't care about Cyrillic inside them.
  const cleaned = text
    .replace(/<script[\s\S]*?<\/script>/gi, m => ' '.repeat(m.length))
    .replace(/<style[\s\S]*?<\/style>/gi, m => ' '.repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));

  // Collect element ids whose TEXT is rewritten in JS. Ids touched only for
  // class manipulation (e.g. classList.remove('show')) do NOT count — that
  // doesn't change visible text, so default Russian text would still leak.
  const updatedIds = new Set();
  let m;

  // Pattern 1: direct chain — getElementById('foo').textContent = ...
  const directRe = /getElementById\(\s*['"]([^'"]+)['"]\s*\)[^;{}]*\.(textContent|innerHTML|innerText)\s*=/g;
  while ((m = directRe.exec(text)) !== null) updatedIds.add(m[1]);

  // Pattern 2: variable indirection —
  //   var x = getElementById('foo');
  //   if (x) x.textContent = ...
  // Walk the file: build a map of var name → id (most recent assignment), then
  // when we see varName.textContent =, mark the corresponding id.
  const varToId = new Map();
  const varAssignRe = /\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*document\.getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = varAssignRe.exec(text)) !== null) varToId.set(m[1], m[2]);
  // Also: x = document.getElementById('foo'); (re-assign without var)
  const reassignRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*document\.getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reassignRe.exec(text)) !== null) varToId.set(m[1], m[2]);
  // Now find textContent assignments to those vars
  const varTextAssignRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.\s*(textContent|innerHTML|innerText)\s*=/g;
  while ((m = varTextAssignRe.exec(text)) !== null) {
    if (varToId.has(m[1])) updatedIds.add(varToId.get(m[1]));
  }

  // Pattern 3: querySelector('#foo').textContent = ...
  const qsIdRe = /querySelector\(\s*['"]#([^'"\s]+)['"]\s*\)[^;{}]*\.(textContent|innerHTML|innerText)\s*=/g;
  while ((m = qsIdRe.exec(text)) !== null) updatedIds.add(m[1]);

  // Class names batch-updated via querySelectorAll forEach OR direct querySelector('.cls')
  const updatedClasses = new Set();
  const qsaForEachRe = /querySelectorAll\(\s*['"]\.([^'"\s]+)['"]\s*\)\s*\.forEach/g;
  while ((m = qsaForEachRe.exec(text)) !== null) updatedClasses.add(m[1]);
  const qsClsRe = /querySelector(?:All)?\(\s*['"]\.([^'"\s]+)['"]\s*\)[^;{}]*\.(textContent|innerHTML|innerText)\s*=/g;
  while ((m = qsClsRe.exec(text)) !== null) updatedClasses.add(m[1]);

  // Also collect descendant-selector tuples:
  //   querySelector('#parent h1').textContent = ...   → { parentId:'parent', tag:'h1', cls:null }
  //   querySelector('#parent .child').textContent = ... → { parentId:'parent', tag:null, cls:'child' }
  // We only mark MATCHING children as managed (NOT the entire subtree — that
  // was my previous bug: <div class="final-score"> in #all-clear-screen got
  // skipped just because *some* h1/.sub under it was managed).
  const managedDescendants = []; // { parentId, tag, cls }
  const descRe = /querySelector(?:All)?\(\s*['"]#([a-zA-Z0-9_-]+)\s+([^'"]+?)['"]\s*\)[^;{}]*\.(textContent|innerHTML|innerText)\s*=/g;
  while ((m = descRe.exec(text)) !== null) {
    const parentId = m[1];
    const childPart = m[2].trim();
    // childPart can be "h1", ".cls", "h1.cls", ".cls1.cls2"
    let tag = null, cls = null;
    const tagMatch = childPart.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (tagMatch) tag = tagMatch[1].toLowerCase();
    const clsMatch = childPart.match(/\.([a-zA-Z0-9_-]+)/);
    if (clsMatch) cls = clsMatch[1];
    managedDescendants.push({ parentId, tag, cls });
  }

  // Walk HTML and build a parent-id stack so we can ask "is any ancestor a managed subtree root".
  // Naive serial parser — sufficient for hand-written HTML.
  const stack = []; // { id, classes, tag }
  const elementRe = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>([^<]*)/g;
  const VOID_TAGS = new Set(['br','meta','link','input','img','hr','source','area','base','col','embed','param','track','wbr']);
  let em;
  while ((em = elementRe.exec(cleaned)) !== null) {
    const isClose = !!em[1];
    const tag = em[2].toLowerCase();
    const attrs = em[3] || '';
    const content = em[4] || '';

    if (isClose) {
      // Pop stack until matching tag
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }

    const selfClosing = attrs.endsWith('/') || VOID_TAGS.has(tag);
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/);
    const classMatch = attrs.match(/\bclass\s*=\s*["']([^"']+)["']/);
    const id = idMatch ? idMatch[1] : null;
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];
    // applyStaticLang() translates every element matched by querySelectorAll('[data-i18n]')
    // (also [data-i18n-html], [data-i18n-attr]). An element (or any ancestor, for data-i18n-html
    // on a parent) carrying one of these IS managed at runtime — even with no id/class match.
    // Without this, elements like <div class="x" data-i18n="key">текст</div> were flagged as
    // hardcoded → 8 false BLOCKERs (goal-stat-lbl, lab.dna_editor, points-label, etc).
    const dataI18n = /\bdata-i18n(-[a-z]+)?\s*=/.test(attrs);

    // Check Cyrillic in this tag's immediate text content
    if (/[\u0410-\u044f\u0451\u0401]{3,}/.test(content)) {
      // Element + all ancestors form the chain. If self id covered, OR any ancestor's id is in
      // updatedIds (whole-element managed) OR managedSubtreeIds (subtree-managed) → skip.
      const chain = stack.slice();
      if (!selfClosing) chain.push({ id, classes, tag, dataI18n });
      const covered = chain.some((el, idx) => {
        if (el.dataI18n) return true; // element or ancestor has data-i18n* → applyStaticLang manages it
        if (el.id && updatedIds.has(el.id)) return true;
        if (el.classes.some(c => updatedClasses.has(c))) return true;
        // Descendant-selector match: this element matches { parentId, tag/cls }
        // where parentId is some ancestor in the chain.
        for (const desc of managedDescendants) {
          // Does any ancestor have id === desc.parentId?
          const hasParent = chain.slice(0, idx).some(a => a.id === desc.parentId);
          if (!hasParent) continue;
          // Does this element match the tag/class part?
          if (desc.tag && desc.tag !== el.tag) continue;
          if (desc.cls && !el.classes.includes(desc.cls)) continue;
          return true;
        }
        return false;
      });
      if (!covered) {
        const lineNo = cleaned.slice(0, em.index).split('\n').length;
        const snippet = content.trim().slice(0, 60);
        issues.push({
          id: 'REQ-8.2.3', level: LEVELS.BLOCKER,
          message: 'Hardcoded Russian text in HTML <' + tag + (id ? ' id="' + id + '"' : '') + (classes.length ? ' class="' + classes[0] + '"' : '') + '>: "' + snippet + '" — applyStaticLang() does NOT update this element. YG Screenshot extension will render Russian on non-RU locale → moderation rejection.',
          citation: 'Past rejection (Block 2048, Circle 2048 v1.1): Russian text leaked into screenshots of other languages. Wrap text in a child element with id, then update it in applyStaticLang(); or empty the default and fill via applyStaticLang().',
          url: URL_823, file, line: lineNo
        });
      }
    }

    if (!selfClosing) stack.push({ id, classes, tag, dataI18n });
  }

  // Cap to avoid spam — usually 1-3 real issues per game
  return issues.slice(0, 8);
}

// =========================================================================
// Detect t()/td() at top level of script (NOT inside a function/IIFE/method).
// Top level = brace depth == 0 at the time of the call (excluding object literals).
// =========================================================================
function findTopLevelTCalls(text, file) {
  const issues = [];
  // Only scan inside <script>...</script> for HTML files.
  // For .js — entire file is "the script", and the file may itself be wrapped in IIFE.
  const isHtml = file.endsWith('.html');
  const scripts = [];
  if (isHtml) {
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      // Skip <script src="..."> — only inline.
      const opening = m[0].slice(0, m[0].indexOf('>') + 1);
      if (/\bsrc\s*=/i.test(opening)) continue;
      scripts.push({ body: m[1], offset: m.index + opening.length, source: file });
    }
  } else {
    scripts.push({ body: text, offset: 0, source: file });
  }

  for (const s of scripts) {
    let depth = 0;
    let i = 0;
    let inStr = null;
    let inLineComment = false;
    let inBlockComment = false;

    while (i < s.body.length) {
      const c = s.body[i];
      const c2 = s.body[i + 1];

      // Comments
      if (inLineComment) { if (c === '\n') inLineComment = false; i++; continue; }
      if (inBlockComment) { if (c === '*' && c2 === '/') { inBlockComment = false; i += 2; continue; } i++; continue; }
      if (c === '/' && c2 === '/') { inLineComment = true; i += 2; continue; }
      if (c === '/' && c2 === '*') { inBlockComment = true; i += 2; continue; }

      // Strings
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === inStr) inStr = null;
        i++; continue;
      }
      if (c === "'" || c === '"' || c === '`') { inStr = c; i++; continue; }

      // Brackets
      if (c === '{' || c === '(' || c === '[') { depth++; i++; continue; }
      if (c === '}' || c === ')' || c === ']') { depth--; i++; continue; }

      // Look for t( or td( at depth 0
      if (depth === 0 && (c === 't' || (c === 'P' && s.body.startsWith('Plat.t', i)))) {
        const sample = s.body.slice(i, i + 50);
        const m = sample.match(/^(?:t|td|Plat\.t)\s*\(\s*['"]([A-Za-z0-9_]+)['"]/);
        if (m) {
          // Confirm it's a "fresh" identifier — char before must not be alphanumeric.
          const before = i === 0 ? ' ' : s.body[i - 1];
          if (!/[A-Za-z0-9_$.]/.test(before)) {
            const absIdx = s.offset + i;
            const lineNo = text.slice(0, absIdx).split('\n').length;
            issues.push({
              id: 'REQ-8.2.3', level: LEVELS.BLOCKER,
              message: 'Top-level t/td call: "' + m[0] + '" — frozen at script load with default _lang. Move into a function.',
              citation: 'Top-level t() calls execute once at module load when _lang is still default. setLang() will not refresh them.',
              url: URL_823, file, line: lineNo
            });
          }
        }
      }

      i++;
    }
  }

  return issues;
}

// =========================================================================
// Find functions named show*/render*/draw*/update*/refresh* that call t()/td()
// but never reference onLangChange/_langListeners nearby — likely missing
// reactive registration.
// =========================================================================
function findUnregisteredRenderers(text, file) {
  const issues = [];
  // Match function declarations & expressions that look like renderers.
  // Patterns:
  //   function showFoo() { ... }
  //   const showFoo = () => { ... }
  //   showFoo: function() { ... }
  const fnNameRe = /\b(function\s+|const\s+|let\s+|var\s+|^\s*)((?:show|render|draw|update|refresh|fill)[A-Z]\w*)\s*[\(=:]/gm;
  let m;
  while ((m = fnNameRe.exec(text)) !== null) {
    const fnName = m[2];
    // Find the opening brace of the function body.
    const startIdx = m.index + m[0].length;
    // Skip ahead to find '{' that starts the function body (could be after arrow =>).
    let braceIdx = -1;
    for (let i = startIdx; i < Math.min(startIdx + 200, text.length); i++) {
      if (text[i] === '{') { braceIdx = i; break; }
      if (text[i] === ';' || text[i] === '\n' && i > startIdx + 5) break;
    }
    if (braceIdx < 0) continue;
    const body = sliceMatchingBrace(text, braceIdx);
    if (!body) continue;
    // Does the body call t() or td()?
    const usesT = /\b(t|td|Plat\.t)\s*\(\s*['"]/.test(body);
    if (!usesT) continue;
    // Does it register onLangChange or push to _langListeners — either inside body OR
    // anywhere in the same file (could be registered at init)?
    const registersInBody = /onLangChange\s*\(|_langListeners\s*\.\s*push/.test(body);
    // Match either: onLangChange(fnName) — direct ref
    //          OR : onLangChange(function(){ ... fnName(...) ... })  — inline cb that calls it
    //          OR : _langListeners.push(fnName)
    //          OR : _langListeners.push(function(){ ... fnName(...) ... })
    const onLangCb = new RegExp('onLangChange\\s*\\([^)]*\\b' + fnName + '\\b').test(text);
    const onLangCbMulti = new RegExp('onLangChange\\s*\\(\\s*function[^{]*\\{[\\s\\S]*?\\b' + fnName + '\\s*\\(').test(text);
    const onLangArrow = new RegExp('onLangChange\\s*\\(\\s*\\([^)]*\\)\\s*=>\\s*\\{?[\\s\\S]*?\\b' + fnName + '\\s*\\(').test(text);
    const pushCb = new RegExp('_langListeners\\s*\\.\\s*push\\s*\\([^)]*\\b' + fnName + '\\b').test(text);
    const pushCbMulti = new RegExp('_langListeners\\s*\\.\\s*push\\s*\\(\\s*function[^{]*\\{[\\s\\S]*?\\b' + fnName + '\\s*\\(').test(text);
    const registersInFile = onLangCb || onLangCbMulti || onLangArrow || pushCb || pushCbMulti;
    if (!registersInBody && !registersInFile) {
      const lineNo = text.slice(0, m.index).split('\n').length;
      issues.push({
        id: 'REQ-8.2.3', level: LEVELS.WARNING,
        message: 'Function "' + fnName + '" calls t()/td() but never registers via onLangChange — setLang() will not refresh this screen',
        citation: 'YG Screenshot extension switches lang at runtime via setLang(); unregistered renderers will keep the old language.',
        url: URL_823, file, field: fnName, line: lineNo
      });
    }
  }
  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
