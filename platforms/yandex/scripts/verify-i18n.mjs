#!/usr/bin/env node
// verify-i18n.mjs — Проверка локализации
// Использование: node scripts/verify-i18n.mjs WorkProgress/{GameName}/
//            или: node scripts/verify-i18n.mjs WorkProgress/GameName/index.html
//
// Claude Code: запускай ПОСЛЕ КАЖДОГО ШАГА локализации.
// Исправь все ❌ FAIL перед следующим шагом.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const LANGS = ['ru','en','es','tr','pt','ar','id','fr','ja','it','de','hi','zh'];
const target = process.argv[2] || 'WorkProgress';

// ─── Collect files ───
function collect(p) {
  const out = [];
  if (statSync(p).isDirectory()) {
    (function walk(d) {
      for (const f of readdirSync(d)) {
        if (f === 'node_modules' || f.startsWith('.')) continue;
        const fp = join(d, f);
        if (statSync(fp).isDirectory()) walk(fp);
        else if (/\.(js|html|htm)$/i.test(f) && !/debugcheck|cheats|mobile-check/.test(f))
          out.push(fp);
      }
    })(p);
  } else out.push(p);
  return out;
}

const files = collect(target);
const allCode = files.map(f => readFileSync(f, 'utf-8')).join('\n');

let FAIL = 0, WARN = 0, PASS = 0;

console.log('══════════════════════════════════════════');
console.log('  I18N VERIFICATION');
console.log('══════════════════════════════════════════\n');

// ═══ 1. Найти все ключи t() в коде ═══
const tKeys = new Set();
for (const m of allCode.matchAll(/\bt\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) tKeys.add(m[1]);
console.log(`── t() keys used in code: ${tKeys.size} ──`);

// ═══ 2. Найти все ключи td() в коде ═══
const tdKeys = new Set();
for (const m of allCode.matchAll(/\btd\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) tdKeys.add(m[1]);
// td() часто вызывается с переменной, не строкой — ищем td(variable.name) паттерны тоже
const tdDynamic = (allCode.match(/\btd\(\s*[^'"`\s)][^)]*\)/g) || []).length;
console.log(`── td() keys in code: ${tdKeys.size} literal + ~${tdDynamic} dynamic ──\n`);

// ═══ 3. Найти какие языковые блоки I18N существуют ═══
console.log('── I18N Language Blocks ──');
const foundLangs = {};
const missingByLang = {};

for (const lang of LANGS) {
  // Ищем I18N.xx = { ... } или 'xx': { ... } внутри I18N = { ... }
  const pat1 = new RegExp(`I18N\\.${lang}\\s*=\\s*\\{`);
  const pat2 = new RegExp(`['"]?${lang}['"]?\\s*:\\s*\\{`);

  if (pat1.test(allCode) || pat2.test(allCode)) {
    // Извлечь ключи этого языка
    const keys = new Set();

    // Паттерн I18N.xx = { key: 'val', key2: 'val2' }
    const re1 = new RegExp(`I18N\\.${lang}\\s*=\\s*\\{([\\s\\S]*?)\\};`, 'g');
    for (const m of allCode.matchAll(re1)) {
      for (const km of m[1].matchAll(/['"]?(\w+)['"]?\s*:/g)) keys.add(km[1]);
    }

    // Паттерн внутри объекта: xx: { key: 'val' }
    // Более грубый — ищем блок после lang: {
    if (keys.size === 0) {
      const re2 = new RegExp(`(?<![a-zA-Z])['"]?${lang}['"]?\\s*:\\s*\\{([^}]+)\\}`, 'g');
      for (const m of allCode.matchAll(re2)) {
        for (const km of m[1].matchAll(/['"]?(\w+)['"]?\s*:/g)) keys.add(km[1]);
      }
    }

    foundLangs[lang] = keys;
  }
}

// Сравнить ключи каждого языка с I18N.ru (или первым найденным)
const baseLang = foundLangs['ru'] || foundLangs[Object.keys(foundLangs)[0]];
const baseLangName = foundLangs['ru'] ? 'ru' : Object.keys(foundLangs)[0] || '?';

if (!baseLang) {
  console.log('❌ FAIL: NO I18N blocks found at all!');
  console.log('   Claude must create I18N.ru = { ... }, I18N.en = { ... }, etc.');
  FAIL++;
} else {
  for (const lang of LANGS) {
    if (!foundLangs[lang]) {
      console.log(`❌ FAIL: I18N.${lang} — MISSING (entire language block not found)`);
      FAIL++;
      missingByLang[lang] = [...baseLang];
    } else {
      const missing = [...baseLang].filter(k => !foundLangs[lang].has(k));
      const extra = [...foundLangs[lang]].filter(k => !baseLang.has(k));
      if (missing.length === 0) {
        console.log(`✅ I18N.${lang}: ${foundLangs[lang].size} keys — OK`);
        PASS++;
      } else {
        console.log(`❌ FAIL: I18N.${lang}: missing ${missing.length} keys: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '...' : ''}`);
        FAIL++;
        missingByLang[lang] = missing;
      }
      if (extra.length > 0) {
        console.log(`   ⚠️ I18N.${lang} has ${extra.length} extra keys not in ${baseLangName}: ${extra.slice(0, 5).join(', ')}`);
      }
    }
  }
}

// Проверить: все t() ключи есть в базовом I18N?
if (baseLang && tKeys.size > 0) {
  const missingInBase = [...tKeys].filter(k => !baseLang.has(k));
  if (missingInBase.length > 0) {
    console.log(`\n❌ FAIL: ${missingInBase.length} t() keys used in code but NOT in I18N.${baseLangName}:`);
    missingInBase.forEach(k => console.log(`   - t('${k}')`));
    FAIL++;
  } else {
    console.log(`\n✅ All ${tKeys.size} t() keys found in I18N.${baseLangName}`);
    PASS++;
  }
}

// ═══ 3b. I18N VALUES — проверка что переводы реально переведены ═══
// Если I18N.zh содержит кириллический текст — значит Claude скопировал русский
console.log('\n── I18N value language check ──');
const cyrillicLangs = new Set(['ru', 'uk', 'be']); // Языки где кириллица допустима
const valCheckFails = [];

for (const lang of LANGS) {
  if (cyrillicLangs.has(lang)) continue; // Пропускаем кириллические языки
  
  // Извлечь весь блок I18N.{lang}
  const re1 = new RegExp(`I18N\\.${lang}\\s*=\\s*\\{([\\s\\S]*?)\\};`, 'g');
  const re2 = new RegExp(`(?<![a-zA-Z])['"]?${lang}['"]?\\s*:\\s*\\{([^}]+)\\}`, 'g');
  
  let blockContent = '';
  for (const m of allCode.matchAll(re1)) blockContent += m[1] + '\n';
  if (!blockContent) {
    for (const m of allCode.matchAll(re2)) blockContent += m[1] + '\n';
  }
  if (!blockContent) continue; // Блок не найден — уже поймано в секции 3
  
  // Найти значения с кириллицей (3+ символов подряд = точно русский текст, не случайный символ)
  // Паттерн: ключ: "значение с кириллицей"
  const valuesWithCyrillic = [];
  const valRe = /['"]?(\w+)['"]?\s*:\s*['"`]([^'"`]*[а-яА-ЯёЁ]{3,}[^'"`]*)['"`]/g;
  for (const vm of blockContent.matchAll(valRe)) {
    valuesWithCyrillic.push({ key: vm[1], sample: vm[2].slice(0, 50) });
  }
  
  if (valuesWithCyrillic.length > 0) {
    valCheckFails.push({ lang, items: valuesWithCyrillic });
  }
}

if (valCheckFails.length === 0) {
  console.log('✅ No Cyrillic text in non-Cyrillic language I18N values');
  PASS++;
} else {
  for (const f of valCheckFails) {
    console.log(`❌ FAIL: I18N.${f.lang} has ${f.items.length} values with Cyrillic (not translated!):`);
    f.items.slice(0, 8).forEach(it => {
      console.log(`   ${it.key}: "${it.sample}"`);
    });
    if (f.items.length > 8) console.log(`   ... and ${f.items.length - 8} more`);
  }
  FAIL++;
}

// ═══ 3c. Translation map VALUES — проверка что NARRATIVE_EN/DATA_EN/etc не содержат кириллицу ═══
// В translation map блоках ключи СПЕЦИАЛЬНО русские (lookup keys). Проверяем только VALUES.
console.log('\n── Translation map value language check ──');
const narrValFails = [];

for (const lang of LANGS) {
  if (cyrillicLangs.has(lang)) continue;
  const langUpper = lang.toUpperCase();
  // Ищем NARRATIVE_XX, DATA_XX, TRANSLATIONS_XX и т.д.
  const narrRe = new RegExp(`(?:var|let|const)?\\s*(?:NARRATIVE|DATA|TRANSLATIONS?|STRINGS|TEXTS?)_${langUpper}\\s*=\\s*\\{([\\s\\S]*?)\\};`, 'g');
  let narrContent = '';
  for (const m of allCode.matchAll(narrRe)) narrContent += m[1] + '\n';
  if (!narrContent) continue;
  
  // Парсим пары "ключ": "значение" — проверяем только ЗНАЧЕНИЯ
  const narrCyrItems = [];
  // Паттерн: "ключ" : "значение" — захватываем значение (группа 1)
  const pairRe = /['"`][^'"`]*['"`]\s*:\s*['"`]([^'"`]*)['"`]/g;
  for (const vm of narrContent.matchAll(pairRe)) {
    const value = vm[1];
    if (/[а-яА-ЯёЁ]{3,}/.test(value)) {
      narrCyrItems.push({ sample: value.slice(0, 60) });
    }
  }
  
  if (narrCyrItems.length > 0) {
    narrValFails.push({ lang: langUpper, count: narrCyrItems.length, samples: narrCyrItems.slice(0, 5) });
  }
}

if (narrValFails.length === 0) {
  console.log('✅ No Cyrillic text in non-Cyrillic NARRATIVE values');
  PASS++;
} else {
  for (const f of narrValFails) {
    console.log(`❌ FAIL: NARRATIVE_${f.lang} has ${f.count} values with Cyrillic:`);
    f.samples.forEach(s => console.log(`   "${s.sample}"`));
  }
  FAIL++;
}

// ═══ 4. DATA_EN проверка ═══
console.log('\n── DATA_EN / td() ──');
const hasDataEN = /DATA_EN\s*=\s*\{/.test(allCode) || /DATA_EN\[/.test(allCode);
if (tdKeys.size > 0 || tdDynamic > 0) {
  if (hasDataEN) {
    console.log(`✅ DATA_EN found (td() used ${tdKeys.size} literal + ~${tdDynamic} dynamic)`);
    PASS++;
  } else {
    console.log(`❌ FAIL: td() used in code but DATA_EN object not found`);
    FAIL++;
  }
} else {
  console.log('ℹ️ No td() calls found (OK if game has no translatable data strings)');
}

// ═══ 5. Хардкод кириллица в display-контекстах ═══
console.log('\n── Hardcoded Cyrillic in display contexts ──');
const hardcoded = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let inI18N = false; // Track if we're inside I18N block
  let inDataDef = false; // Track if inside data definition
  let inScript = false; // Track if inside <script> block (for HTML files)
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Track <script>/<style> blocks in HTML files
    if (/<script\b/i.test(line)) inScript = true;
    if (/<\/script>/i.test(line)) { inScript = false; continue; }

    // Track I18N/DATA/NARRATIVE blocks to skip them
    if (/^\s*(I18N\.\w+\s*=|var\s+I18N|let\s+I18N|const\s+I18N|DATA_\w+\s*=|var\s+(?:NARRATIVE|DATA|TRANSLATIONS?|STRINGS|TEXTS?)_)/.test(line)) {
      inI18N = true;
      braceDepth = 0;
    }
    // Track common game data definitions to skip
    if (/^\s*(const|var|let)\s+(BD|BUILDINGS|CONS|UPS|RPARTS|ARTIFACTS|BOSSES|MONSTERS|DEBUFF_INFO|QUEST_CHAINS|SINGLE_QUESTS|ECHO_EVENTS|DIAL|LV_UNLOCK|(?:NARRATIVE|DATA|TRANSLATIONS?|STRINGS|TEXTS?)_\w+)\s*=/.test(line)) {
      inDataDef = true;
      braceDepth = 0;
    }

    if (inI18N || inDataDef) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0 && (line.includes('};') || (braceDepth < 0))) {
        inI18N = false;
        inDataDef = false;
        braceDepth = 0;
      }
      continue;
    }

    // Skip console.log
    if (/console\.(log|warn|info|debug)/.test(line)) continue;

    // Check for Cyrillic (2+ chars) in display contexts
    // Strip t()/td() wrapped content first to catch mixed lines
    const lineStripped = line.replace(/\bt\(\s*['"`][^'"`]*['"`]\s*\)/g, '___T___').replace(/\btd\(\s*[^)]*\)/g, '___TD___');
    if (!/[а-яА-ЯёЁ]{2,}/.test(lineStripped)) continue;

    // Is it a display context?
    const displayRe = /\.(textContent|innerText|innerHTML|placeholder|title)\s*=|fillText\s*\(|strokeText\s*\(|spawnTxt\s*\(|showNotify\s*\(|showToast\s*\(|alert\s*\(/;

    if (displayRe.test(line)) {
      hardcoded.push({ file, line: i + 1, text: line.trim().substring(0, 100) });
    }

    // Also check: template literals with Cyrillic in display context
    if (/\.(textContent|innerText|innerHTML)\s*=\s*`/.test(line) && /[а-яА-ЯёЁ]{2,}/.test(lineStripped)) {
      if (!displayRe.test(line)) { // avoid duplicates with above
        hardcoded.push({ file, line: i + 1, text: line.trim().substring(0, 100) });
      }
    }

    // HTML hardcoded text (in .html files, NOT inside <script> blocks)
    if ((file.endsWith('.html') || file.endsWith('.htm')) && !inScript) {
      // Match Cyrillic ANYWHERE between > and < (not just right after >)
      if (/>[^<]*[а-яА-ЯёЁ]{2,}[^<]*</.test(line)) {
        if (!/<script|<style/i.test(line) && !inI18N && !inDataDef) {
          hardcoded.push({ file, line: i + 1, text: line.trim().substring(0, 100) });
        }
      }
    }
  }
}

if (hardcoded.length === 0) {
  console.log('✅ No hardcoded Cyrillic in display contexts');
  PASS++;
} else {
  console.log(`❌ FAIL: ${hardcoded.length} hardcoded Cyrillic strings found:`);
  hardcoded.slice(0, 20).forEach(h => {
    console.log(`   line ${h.line}: ${h.text}`);
  });
  if (hardcoded.length > 20) console.log(`   ... and ${hardcoded.length - 20} more`);
  console.log('   FIX: Remove Russian text from HTML. Render via JS in applyStaticLang():');
  console.log('     el=document.getElementById("xxx");if(el)el.innerHTML=t("key");');
  console.log('     For HTML attributes (onclick etc): move t() call into JS, not HTML attribute.');
  FAIL++;
}

// ═══ 5b. Кириллица в массивах данных (диалоги, квесты, катсцены) ═══
console.log('\n── Cyrillic in data arrays (dialogues, quests, cutscenes) ──');

// Find data arrays that contain Cyrillic and check they're translated
const dataPatterns = [
  // Common names for dialogue/quest/cutscene data
  /(?:const|var|let)\s+(DIAL|DIALOGUES?|CUTSCENES?|MISSIONS?|QUESTS?|QUEST_CHAINS|SINGLE_QUESTS|STORIES?|NARRATIVE|TEXTS?|MESSAGES|ECHO_EVENTS|HINTS?|TIPS|TUTORIAL_STEPS?|CHAPTERS?|SCENES?|BRIEFINGS?|CONVERSATIONS?)\s*=/gi,
  // Also catch: dialogueData, missionData, etc.
  /(?:const|var|let)\s+(\w*(?:dial|dialog|quest|mission|story|narrative|cutscene|scene|brief|chapter|conversation)\w*)\s*=/gi,
];

const dataArraysWithCyrillic = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  for (const pat of dataPatterns) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(content)) !== null) {
      const varName = m[1];
      // Extract the block after this definition (up to matching close)
      const startIdx = m.index;
      let depth = 0;
      let started = false;
      let endIdx = startIdx;
      for (let ci = startIdx; ci < Math.min(content.length, startIdx + 50000); ci++) {
        if (content[ci] === '{' || content[ci] === '[') { depth++; started = true; }
        if (content[ci] === '}' || content[ci] === ']') { depth--; }
        if (started && depth <= 0) { endIdx = ci; break; }
      }
      const block = content.slice(startIdx, endIdx + 1);

      // Count Cyrillic strings in this block
      const cyrStrings = block.match(/['"`][^'"`]*[а-яА-ЯёЁ]{3,}[^'"`]*['"`]/g) || [];
      if (cyrStrings.length > 0) {
        // Check: is this data accessed through td()?
        const varNameClean = varName.replace(/[^a-zA-Z0-9_]/g, '');
        const usedWithTd = new RegExp(`td\\s*\\(\\s*${varNameClean}|td\\s*\\(.*\\.text|td\\s*\\(.*\\.desc|td\\s*\\(.*\\.name`).test(content);
        // Check: are these strings in DATA_EN?
        const sampleStr = (cyrStrings[0].match(/[а-яА-ЯёЁ][^'"`]*/)||[''])[0].slice(0, 30);
        const inDataEN = hasDataEN && content.includes(sampleStr);

        if (!usedWithTd && !inDataEN) {
          dataArraysWithCyrillic.push({
            name: varNameClean,
            count: cyrStrings.length,
            sample: cyrStrings[0].slice(0, 60),
          });
        }
      }
    }
  }
}

// Also do a broad scan: find ANY large Cyrillic text blocks that look like game content
// (sentences with 10+ chars, not in I18N/DATA_EN blocks)
const broadCyrCheck = [];

// Check if td() function exists — if so, data arrays with Cyrillic are translated at runtime
const hasTdFunc = /function\s+td\b/.test(allCode);

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let inI18NBlock = false;
  let blockDepth = 0;

  // Find ranges of top-level data arrays/objects with Cyrillic (INTRO, GHOST_STORIES, etc.)
  // These are translated via td() at render time — skip in broad scan if td() exists
  const dataRanges = [];
  if (hasTdFunc) {
    for (let di = 0; di < lines.length; di++) {
      const dl = lines[di];
      // Match both arrays (= [) and objects (= {) — any variable name
      const arrMatch = dl.match(/^(?:var|const|let)\s+(\w+)\s*=\s*[\[{]/);
      if (!arrMatch) continue;
      // Skip I18N/translation blocks (handled separately)
      if (/^(I18N|NARRATIVE_|DATA_|TRANSLATIONS?_|STRINGS_|TEXTS_)/i.test(arrMatch[1])) continue;
      
      const opener = dl.includes('= [') || dl.includes('=[') ? '[' : '{';
      const closer = opener === '[' ? ']' : '}';
      let depth = 0; let hasCyr = false;
      for (let dj = di; dj < Math.min(lines.length, di + 500); dj++) {
        if (/[а-яА-ЯёЁ]{3,}/.test(lines[dj])) hasCyr = true;
        for (const ch of lines[dj]) { if (ch === opener) depth++; if (ch === closer) depth--; }
        if (depth <= 0) { if (hasCyr) dataRanges.push({ start: di, end: dj }); break; }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track I18N/translation map blocks
    if (/^\s*(I18N|DATA_\w+|const\s+I18N|var\s+I18N|(?:var|const|let)\s+(?:NARRATIVE|DATA|TRANSLATIONS?|STRINGS|TEXTS?)_\w+\s*=)/.test(line)) { inI18NBlock = true; blockDepth = 0; }
    if (inI18NBlock) {
      for (const ch of line) { if (ch === '{') blockDepth++; if (ch === '}') blockDepth--; }
      if (blockDepth <= 0 && line.includes('};')) { inI18NBlock = false; blockDepth = 0; }
      continue;
    }
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    if (/console\.(log|warn|info|debug)/.test(line)) continue;

    // Skip lines inside data arrays that are translated via td() at runtime
    if (dataRanges.some(r => i >= r.start && i <= r.end)) continue;

    // Skip HTML content lines (already caught by hardcoded Cyrillic check above)
    if (/<[a-z][\w-]*[\s>]|<\/[a-z]/i.test(line) && />[^<]*[а-яА-ЯёЁ]/.test(line)) continue;

    // Find strings with Cyrillic (4+ consecutive Cyrillic chars = likely game text)
    // First strip out t()/td() wrapped content to catch mixed lines like:
    //   el.innerHTML = t('key1') + ' — перемещение'
    const stripped = line
      .replace(/\/\/.*$/g, '') // strip inline comments (everything after //)
      .replace(/\bt\(\s*['"`][^'"`]*['"`]\s*\)/g, '')
      .replace(/\btd\(\s*[^)]*\)/g, '');
    const sentenceMatch = stripped.match(/['"`]([^'"`]*[а-яА-ЯёЁ]{4,}[^'"`]*)['"`]/);
    if (sentenceMatch) {
      broadCyrCheck.push({ line: i + 1, text: sentenceMatch[1].slice(0, 60) });
    }
    // Also check template literals and HTML content with Cyrillic
    if (/>[^<]*[а-яА-ЯёЁ]{4,}/.test(stripped) || /`[^`]*[а-яА-ЯёЁ]{4,}/.test(stripped)) {
      if (!sentenceMatch) { // avoid duplicates
        broadCyrCheck.push({ line: i + 1, text: stripped.trim().slice(0, 80) });
      }
    }
  }
}

if (dataArraysWithCyrillic.length === 0 && broadCyrCheck.length === 0) {
  console.log('✅ No untranslated data arrays found');
  PASS++;
} else {
  if (dataArraysWithCyrillic.length > 0) {
    console.log(`❌ FAIL: ${dataArraysWithCyrillic.length} data arrays with Cyrillic NOT wrapped in td():`);
    dataArraysWithCyrillic.forEach(d => {
      console.log(`   ${d.name}: ${d.count} strings, e.g. ${d.sample}`);
    });
    console.log('   These need td() wrapping or entries in DATA_EN');
    FAIL++;
  }
  if (broadCyrCheck.length > 0) {
    console.log(`❌ FAIL: ${broadCyrCheck.length} Cyrillic sentences not in t()/td():`);
    broadCyrCheck.slice(0, 10).forEach(b => {
      console.log(`   line ${b.line}: "${b.text}"`);
    });
    if (broadCyrCheck.length > 10) console.log(`   ... and ${broadCyrCheck.length - 10} more`);
    console.log('   DO NOT say "this is expected" — if text is visible on screen, it MUST be translated.');
    console.log('   Wrap in td() AND ensure setLang() re-renders the current screen (cutscene/tutorial/shop).');
    FAIL++;
  }
}

// ═══ 5c. Canvas fillText/strokeText with variable args ═══
console.log('\n── Canvas text (fillText/strokeText) ──');
const canvasTextIssues = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//')) continue;
    // Match fillText(variable, ...) where variable is NOT wrapped in t()/td()
    const fillMatch = line.match(/(?:fillText|strokeText)\s*\(/);
    if (!fillMatch) continue;
    // Skip if already uses t() or td()
    if (/\bt\(/.test(line) || /\btd\(/.test(line)) continue;
    // Skip if argument is a number or pure variable (like x, y coordinates on same line)
    // Check if there's a string property access (.name, .text, .desc, .title, .label) nearby
    if (/\.(name|text|desc|title|label|n|d|t)\b/.test(line) || /\[['"]?(name|text|desc)['"]?\]/.test(line)) {
      canvasTextIssues.push({ line: i + 1, text: line.trim().substring(0, 100) });
    }
  }
}
if (canvasTextIssues.length === 0) {
  console.log('✅ No untranslated canvas text detected');
  PASS++;
} else {
  console.log(`⚠️ WARN: ${canvasTextIssues.length} fillText/strokeText calls with property access (may need td()):`);
  canvasTextIssues.slice(0, 10).forEach(c => {
    console.log(`   line ${c.line}: ${c.text}`);
  });
  console.log('   Verify these render translated text, not raw Russian strings');
  WARN++;
}

// ═══ 5d. CSS content: pseudo-elements with Cyrillic ═══
console.log('\n── CSS content: (::before/::after) ──');
const cssContentIssues = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/content\s*:\s*['"]([^'"]*[а-яА-ЯёЁ]{2,}[^'"]*)['"/]/);
    if (m) {
      cssContentIssues.push({ line: i + 1, text: m[1].slice(0, 60) });
    }
  }
}
if (cssContentIssues.length === 0) {
  console.log('✅ No Cyrillic in CSS content:');
  PASS++;
} else {
  console.log(`❌ FAIL: ${cssContentIssues.length} CSS content: with Cyrillic (::before/::after):`);
  cssContentIssues.forEach(c => {
    console.log(`   line ${c.line}: content: "${c.text}"`);
  });
  console.log('   Move text to JS and use t() — CSS content: cannot be translated at runtime');
  FAIL++;
}

// ═══ 5e. String concatenation with Cyrillic fragments ═══
console.log('\n── String concatenation with Cyrillic ──');
const concatIssues = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let inI18NBlock2 = false;
  let bDepth2 = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(I18N|DATA_EN)\b/.test(line)) { inI18NBlock2 = true; bDepth2 = 0; }
    if (inI18NBlock2) {
      for (const ch of line) { if (ch === '{') bDepth2++; if (ch === '}') bDepth2--; }
      if (bDepth2 <= 0 && line.includes('};')) { inI18NBlock2 = false; bDepth2 = 0; }
      continue;
    }
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    if (/console\.(log|warn|info|debug)/.test(line)) continue;

    // Pattern: 'Cyrillic' + var  OR  var + 'Cyrillic'
    if (/['"`][^'"`]*[а-яА-ЯёЁ]{2,}[^'"`]*['"`]\s*\+/.test(line) ||
        /\+\s*['"`][^'"`]*[а-яА-ЯёЁ]{2,}/.test(line)) {
      if (/\bt\(/.test(line) || /\btd\(/.test(line)) continue;
      if (/^\s*(const|var|let)\s+\w+\s*=/.test(line) && !/textContent|innerHTML|innerText|fillText/.test(line)) continue;
      concatIssues.push({ line: i + 1, text: line.trim().substring(0, 100) });
    }
  }
}
if (concatIssues.length === 0) {
  console.log('✅ No Cyrillic in string concatenation');
  PASS++;
} else {
  console.log(`⚠️ WARN: ${concatIssues.length} string concatenations with Cyrillic:`);
  concatIssues.slice(0, 10).forEach(c => {
    console.log(`   line ${c.line}: ${c.text}`);
  });
  if (concatIssues.length > 10) console.log(`   ... and ${concatIssues.length - 10} more`);
  console.log('   Rewrite: t("level") + " " + level + " " + t("of") + " " + total');
  WARN++;
}

// ═══ 5f. HTML attributes with Cyrillic (placeholder, title, alt) ═══
console.log('\n── HTML attributes with Cyrillic ──');
const attrIssues = [];
for (const file of files) {
  if (!file.endsWith('.html') && !file.endsWith('.htm')) continue;
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/<script|<style/i.test(line)) continue;
    const attrRe = /(?:placeholder|title|alt|aria-label)\s*=\s*["']([^"']*[а-яА-ЯёЁ]{2,}[^"']*)["']/gi;
    let m;
    while ((m = attrRe.exec(line)) !== null) {
      attrIssues.push({ line: i + 1, attr: m[0].slice(0, 60) });
    }
  }
}
if (attrIssues.length === 0) {
  console.log('✅ No Cyrillic in HTML attributes');
  PASS++;
} else {
  console.log(`❌ FAIL: ${attrIssues.length} HTML attributes with hardcoded Cyrillic:`);
  attrIssues.forEach(a => {
    console.log(`   line ${a.line}: ${a.attr}`);
  });
  console.log('   Set in JS via applyStaticLang(): el.placeholder = t("key")');
  FAIL++;
}

// ═══ 5g. Ad button text with Cyrillic ═══
console.log('\n── Ad/reward button text ──');
const adBtnIssues = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//')) continue;
    if (!/реклам|[Rr]eward|[Вв]идео|[Сс]мотреть|[Пп]олучи/i.test(line)) continue;
    if (!/[а-яА-ЯёЁ]{3,}/.test(line)) continue;
    if (/\bt\(/.test(line) || /\btd\(/.test(line)) continue;
    if (/I18N\.\w+\s*=/.test(line)) continue;
    if (/^\s*\w+\s*:/.test(line.trim())) continue;
    adBtnIssues.push({ line: i + 1, text: line.trim().substring(0, 100) });
  }
}
if (adBtnIssues.length === 0) {
  console.log('✅ No hardcoded Cyrillic in ad/reward buttons');
  PASS++;
} else {
  console.log(`⚠️ WARN: ${adBtnIssues.length} ad/reward texts with Cyrillic:`);
  adBtnIssues.forEach(a => {
    console.log(`   line ${a.line}: ${a.text}`);
  });
  console.log('   Use: t("watch_ad") + " → +" + amount + " " + t("coins")');
  WARN++;
}

// ═══ 5h. Translation mapping key matching — do td() keys actually match source strings? ═══
console.log('\n── td() key matching (translation maps vs source data) ──');
const keyMismatch = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');

  // Auto-detect translation mapping objects: NARRATIVE_EN, DATA_EN, TRANSLATIONS_EN, etc.
  // Pattern: var SOMETHING_EN = { 'Cyrillic key': 'Latin value', ... }
  const mapDetectRe = /(?:var|const|let)\s+((?:NARRATIVE|DATA|TRANSLATIONS?|STRINGS|TEXTS?)_EN)\s*=\s*\{/g;
  let mapMatch;
  let translationMapName = null;
  let translationKeys = new Set();

  while ((mapMatch = mapDetectRe.exec(content)) !== null) {
    translationMapName = mapMatch[1];
    const fullMatch = content.match(new RegExp(`(?:var|const|let)\\s+${translationMapName}\\s*=\\s*\\{([^]*?)\\};`));
    if (!fullMatch) continue;

    const keyRe = /'((?:[^'\\]|\\.)*)'\s*:/g;
    let km;
    while ((km = keyRe.exec(fullMatch[1])) !== null) {
      translationKeys.add(km[1]);
    }
    break; // use first found
  }

  if (translationKeys.size === 0) continue;

  // Extract strings from data arrays that use td() for translation
  // Auto-detect: find all top-level arrays that contain Cyrillic strings
  const dataArrayNames = [];
  const arrayDetectRe = /(?:var|const|let)\s+([A-Z_][A-Z_0-9]*)\s*=\s*\[/g;
  let adm;
  while ((adm = arrayDetectRe.exec(content)) !== null) {
    const name = adm[1];
    // Skip translation maps and I18N
    if (/^(I18N|NARRATIVE_|DATA_|TRANSLATIONS?_|SUPPORTED)/.test(name)) continue;
    // Check if array contains Cyrillic strings
    const arrRe = new RegExp(`(?:var|const|let)\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
    const arrM = content.match(arrRe);
    if (arrM && /[а-яА-ЯёЁ]{4,}/.test(arrM[1])) {
      dataArrayNames.push(name);
    }
  }
  for (const arrName of dataArrayNames) {
    const arrRe = new RegExp(`(?:var|const|let)\\s+${arrName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
    const arrMatch = content.match(arrRe);
    if (!arrMatch) continue;

    // Find text:'...' patterns in the array
    const textRe = /text\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    let tm;
    while ((tm = textRe.exec(arrMatch[1])) !== null) {
      const sourceText = tm[1];
      // Check: does this key exist in translation map?
      if (sourceText.length > 5 && /[а-яА-ЯёЁ]{3,}/.test(sourceText)) {
        // Try exact match
        if (!translationKeys.has(sourceText)) {
          // Try with \n normalization (the most common mismatch)
          const normalized = sourceText.replace(/\\n/g, '\n');
          const denormalized = sourceText.replace(/\n/g, '\\n');
          if (!translationKeys.has(normalized) && !translationKeys.has(denormalized)) {
            keyMismatch.push({
              array: arrName,
              key: sourceText.substring(0, 60),
              reason: 'not found in ' + (translationMapName || 'translation map')
            });
          } else {
            keyMismatch.push({
              array: arrName,
              key: sourceText.substring(0, 60),
              reason: '\\n mismatch — source uses real newlines but translation key uses \\\\n (or vice versa)'
            });
          }
        }
      }
    }
  }
}

if (keyMismatch.length === 0) {
  console.log('✅ All data array strings have matching NARRATIVE keys');
  PASS++;
} else {
  const newlineMismatches = keyMismatch.filter(k => k.reason.includes('\\n mismatch'));
  const missingKeys = keyMismatch.filter(k => !k.reason.includes('\\n mismatch'));

  if (newlineMismatches.length > 0) {
    // Check if td() already normalizes newlines — if so, this is handled at runtime
    const tdNormalizes = /replace\s*\(\s*\/\\n\/g?\s*,\s*['"]\\\\n['"]\s*\)/.test(allCode) ||
                         /replace\s*\(\s*\/\\\\n\/g?\s*,\s*['"]\\n['"]\s*\)/.test(allCode) ||
                         /replace\s*\(\s*\/\\n\/g?\s*,\s*['"`]/.test(allCode);
    if (tdNormalizes) {
      console.log(`✅ ${newlineMismatches.length} strings have \\n mismatch in keys, but td() normalizes at runtime — OK`);
      PASS++;
    } else {
      console.log(`❌ FAIL: ${newlineMismatches.length} strings have \\n/newline mismatch in NARRATIVE keys:`);
      newlineMismatches.slice(0, 5).forEach(k => {
        console.log(`   ${k.array}: "${k.key}..."`);
      });
      console.log('   Fix td(): normalize newlines before lookup, or fix NARRATIVE keys to match source.');
      console.log('   Quick fix: in td(), add: var key = text.replace(/\\n/g, "\\\\n");');
      FAIL++;
    }
  }
  if (missingKeys.length > 0) {
    console.log(`❌ FAIL: ${missingKeys.length} data strings have NO translation in NARRATIVE_EN:`);
    missingKeys.slice(0, 5).forEach(k => {
      console.log(`   ${k.array}: "${k.key}..."`);
    });
    console.log('   These strings will show Russian text on all non-RU languages!');
    console.log('   FIX: Check td() function — likely \\n mismatch (real newline vs literal \\\\n in key).');
    console.log('   Either fix td() to normalize: key=text.replace(/\\n/g,"\\\\n")');
    console.log('   Or regenerate NARRATIVE keys to match actual strings in INTRO/OUTRO/etc arrays.');
    FAIL++;
  }
}

console.log('\n── Language variable declaration ──');
const hasLetLang = /\blet\s+_lang\b/.test(allCode);
const hasVarLang = /\bvar\s+_lang\b/.test(allCode);
const hasConstLang = /\bconst\s+_lang\b/.test(allCode);

if (hasLetLang && !hasVarLang) {
  console.log('❌ FAIL: "let _lang" found — must be "var _lang"');
  console.log('   (let does not create window._lang → cheat panel and YG extension cannot switch language)');
  FAIL++;
} else if (hasConstLang) {
  console.log('❌ FAIL: "const _lang" found — must be "var _lang" (needs to be reassignable)');
  FAIL++;
} else if (hasVarLang) {
  console.log('✅ "var _lang" — cheat panel and extension can switch via window._lang');
  PASS++;
} else {
  console.log('⚠️ WARN: _lang variable not found — check how language is stored');
  console.log('   (must be accessible as window._lang for cheat panel / YG extension)');
  WARN++;
}

// ═══ 7. setLang / applyStaticLang exists ═══
console.log('\n── Language switching infrastructure ──');

const hasSetLang = /function\s+setLang|setLang\s*=\s*function|const\s+setLang\s*=/.test(allCode);
const hasApplyStatic = /function\s+applyStaticLang|applyStaticLang\s*=/.test(allCode);
const hasDetectLang = /function\s+detectLang|detectLang\s*=/.test(allCode);

if (hasSetLang || hasApplyStatic) {
  console.log('✅ Language switching function found');
  PASS++;
} else {
  console.log('❌ FAIL: No setLang() or applyStaticLang() function');
  console.log('   (needed for cheat panel cycleLang() and YG extension to work)');
  FAIL++;
}

if (hasDetectLang) {
  console.log('✅ detectLang() found');
  PASS++;

  // Check it uses SDK i18n.lang (п. 2.14 — обязательно)
  const usesSDKLang = /i18n\.lang|environment\.i18n|ysdk\.environment/.test(allCode);
  const onlyNavigator = /navigator\.language/.test(allCode) && !usesSDKLang;
  if (usesSDKLang) {
    console.log('✅ Uses ysdk.environment.i18n.lang (п. 2.14)');
    PASS++;
  } else if (onlyNavigator) {
    console.log('❌ FAIL: detectLang uses only navigator.language, not SDK');
    console.log('   п. 2.14: автоопределение ОБЯЗАТЕЛЬНО через ysdk.environment.i18n.lang');
    FAIL++;
  }
} else {
  console.log('⚠️ WARN: No detectLang() — check language is detected from SDK (п. 2.14)');
  WARN++;
}

// UI cache reset check
const hasUICache = /lastUIHash/.test(allCode);
if (hasUICache) {
  const hasReset = /lastUIHash\s*=\s*['"`]['"`]|lastUIHash\s*=\s*(null|0|''|"")/.test(allCode);
  if (hasReset) {
    console.log('✅ UI cache (lastUIHash) reset found');
    PASS++;
  } else {
    console.log('❌ FAIL: lastUIHash exists but never reset in setLang/applyStaticLang');
    console.log('   Language switch will show stale UI. Add: lastUIHash = ""');
    FAIL++;
  }
}

// setLang() must re-render dynamic content (cutscenes, tutorial, shop, etc.)
const hasDynamicContent = /DIAL|INTRO|OUTRO|CUTSCENE|TUTORIAL|GHOST_STORIES|MISSIONS|NARRATIVE|SCENES/i.test(allCode);

// Check for listener pattern: _langListeners + onLangChange()
const hasLangListeners = /_langListeners/.test(allCode);
const hasOnLangChange = /function\s+onLangChange|onLangChange\s*=/.test(allCode);
const onLangChangeUsages = (allCode.match(/onLangChange\s*\(/g) || []).length;
// Subtract definition(s) — count only actual registrations
const onLangChangeRegistrations = Math.max(0, onLangChangeUsages - 1);

if (hasLangListeners && hasOnLangChange) {
  if (onLangChangeRegistrations > 0) {
    console.log(`✅ setLang() uses listener pattern (${onLangChangeRegistrations} onLangChange registrations)`);
  } else {
    console.log('⚠️ WARN: onLangChange() defined but never used — register screen renderers');
    console.log('   Every function that shows t()/td() text must call onLangChange(updateFn)');
    WARN++;
  }
  PASS++;
} else if (hasDynamicContent && hasSetLang) {
  // Fallback: check old-style hardcoded re-renders
  const setLangBlock = allCode.match(/function\s+setLang[^{]*\{([\s\S]{0,2000}?)(?=\nfunction\s|\n\w+\s*=\s*function)/);
  const slBody = setLangBlock ? setLangBlock[1] : '';
  const reRendersScreen =
    /renderCut|renderScene|renderDialog|renderTutorial|showStep|updateCutscene|updateDialog|_refreshLang/i.test(slBody) ||
    /currentStep|currentSlide|activeScene|activeCut|showingTutorial|tutorialStep/i.test(slBody);

  if (reRendersScreen) {
    console.log('✅ setLang() re-renders dynamic content (cutscene/tutorial)');
    console.log('   ⚠️ Consider using onLangChange() listener pattern for reliability');
    PASS++;
  } else {
    console.log('❌ FAIL: Game has cutscenes/tutorial/narrative but setLang() does NOT re-render them');
    console.log('   When user switches language, current screen stays in old language.');
    console.log('   FIX: Add listener pattern to setLang():');
    console.log('     var _langListeners = [];');
    console.log('     function onLangChange(fn) { _langListeners.push(fn); }');
    console.log('     In setLang(): _langListeners.forEach(function(fn){try{fn();}catch(e){}});');
    console.log('     Each screen: onLangChange(myRenderFunction);');
    FAIL++;
  }
} else if (hasDynamicContent) {
  console.log('⚠️ WARN: Game has dynamic content but no setLang() — language switch will not update screens');
  WARN++;
}

// ═══ 8. RTL / CJK ═══
console.log('\n── RTL and CJK support ──');

const hasRTL = /dir\s*=\s*['"]rtl['"]|\.dir\s*=\s*['"]rtl|setAttribute\s*\(\s*['"]dir['"]/.test(allCode);
if (hasRTL) {
  console.log('✅ RTL (Arabic) support found');
  PASS++;
} else {
  console.log('⚠️ WARN: No RTL support for Arabic (dir="rtl")');
  WARN++;
}

const hasCJK = /font-family.*sans-serif|Noto|CJK|system-ui|SimSun|MS Gothic|Malgun/i.test(allCode);
if (hasCJK) {
  console.log('✅ CJK font fallback found');
  PASS++;
} else {
  console.log('⚠️ WARN: No CJK font fallback (Japanese/Chinese may render incorrectly)');
  WARN++;
}

// ═══ 8b. Yandex fallback: be/kk/uk/uz → ru (requirement) ═══
console.log('\n── Yandex language fallback ──');
const hasFallbackLogic = /be.*ru|kk.*ru|uk.*ru|uz.*ru|LANG_FALLBACK|langFallback|fallback.*ru/i.test(allCode);
if (hasFallbackLogic) {
  console.log('✅ Fallback logic found (be/kk/uk/uz → ru)');
  PASS++;
} else {
  console.log('⚠️ WARN: No explicit fallback for be/kk/uk/uz → ru');
  console.log('   Yandex docs: "ru для be, kk, uk, uz; en для остальных"');
  WARN++;
}

// ═══ 9. ?lang= URL параметр ═══
console.log('\n── URL parameter support ──');
const hasLangParam = /[?&]lang=|searchParams.*lang|URLSearchParams.*lang|location\.search.*lang/.test(allCode);
if (hasLangParam) {
  console.log('✅ ?lang=xx URL parameter support found');
  PASS++;
} else {
  console.log('⚠️ WARN: No ?lang=xx URL parameter support (useful for testing)');
  WARN++;
}

// ═══ 5i. I18N key completeness — every key in ru must exist in ALL other langs ═══
console.log('\n── I18N key completeness (cross-check all languages) ──');
{
  // Parse I18N blocks from the code
  const i18nRe = /I18N\s*=\s*\{|I18N\s*\[\s*['"](\w+)['"]\s*\]\s*=|I18N\.(\w+)\s*=/g;
  let i18nKeysByLang = {};
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    
    // Strategy: find "var I18N={" then parse sub-objects like "ru:{...}, en:{...}"
    // OR find individual "I18N.ru = {...}" assignments
    
    // Method 1: Single I18N object with language sub-keys
    const i18nMatch = content.match(/var\s+I18N\s*=\s*\{/);
    if (i18nMatch) {
      // Find each language block: "ru:{...}" or "'ru':{...}"
      const langBlockRe = /(?:^|,|\{)\s*['"]?(\w{2})['"]?\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
      // Simpler: just find each "key:'value'" inside each lang block
      // Use a different approach — find lines with lang keys
      const lines = content.split('\n');
      let currentLang = null;
      let depth = 0;
      let mainDepth = 0;
      let insideI18N = false;
      
      for (const line of lines) {
        if (/var\s+I18N\s*=\s*\{/.test(line)) { insideI18N = true; mainDepth = 0; }
        if (!insideI18N) continue;
        
        // Track braces at main level to find language sub-objects
        for (let ci = 0; ci < line.length; ci++) {
          if (line[ci] === '{') mainDepth++;
          if (line[ci] === '}') mainDepth--;
        }
        
        // Detect language block start: "ru:{" or "en:{"
        const langStart = line.match(/^\s*['"]?([a-z]{2})['"]?\s*:\s*\{/);
        if (langStart && mainDepth >= 2) {
          currentLang = langStart[1];
          if (!i18nKeysByLang[currentLang]) i18nKeysByLang[currentLang] = new Set();
        }
        
        // Also detect language block starting inline
        if (!currentLang) {
          const inlineLang = line.match(/[,{]\s*['"]?([a-z]{2})['"]?\s*:\s*\{/);
          if (inlineLang && mainDepth >= 2) {
            currentLang = inlineLang[1];
            if (!i18nKeysByLang[currentLang]) i18nKeysByLang[currentLang] = new Set();
          }
        }
        
        if (currentLang) {
          // Extract keys from this line: "key_name:'value'" or "key_name:\"value\""
          const keyRe = /(\w+)\s*:\s*['"`]/g;
          let km;
          while ((km = keyRe.exec(line)) !== null) {
            const k = km[1];
            // Skip language codes themselves and common non-key patterns
            if (k.length >= 2 && !/^(ru|en|es|tr|pt|ar|id|fr|ja|it|de|hi|zh|ko)$/.test(k)) {
              i18nKeysByLang[currentLang].add(k);
            }
          }
        }
        
        if (mainDepth <= 0 && insideI18N) { insideI18N = false; currentLang = null; break; }
        if (mainDepth <= 1) currentLang = null; // Exited lang sub-object
      }
    }
  }
  
  const langs = Object.keys(i18nKeysByLang);
  if (langs.length >= 2 && i18nKeysByLang['ru']) {
    const ruKeys = i18nKeysByLang['ru'];
    let missingTotal = 0;
    const missingReport = [];
    
    for (const lang of langs) {
      if (lang === 'ru') continue;
      const langKeys = i18nKeysByLang[lang];
      const missing = [...ruKeys].filter(k => !langKeys.has(k));
      if (missing.length > 0) {
        missingTotal += missing.length;
        missingReport.push({ lang, count: missing.length, keys: missing.slice(0, 5) });
      }
    }
    
    if (missingTotal === 0) {
      console.log(`✅ All ${ruKeys.size} I18N keys present in ${langs.length} languages`);
      PASS++;
    } else {
      console.log(`❌ FAIL: I18N keys missing in some languages:`);
      missingReport.forEach(r => {
        console.log(`   I18N.${r.lang}: ${r.count} missing — ${r.keys.join(', ')}${r.count > 5 ? '...' : ''}`);
      });
      console.log('   If t() cannot find a key, it falls back to Russian = user sees untranslated text.');
      FAIL++;
    }
  } else if (langs.length === 0) {
    console.log('⚠️ WARN: Could not parse I18N structure for key completeness check');
    WARN++;
  } else {
    console.log(`✅ I18N key completeness: only ${langs.length} lang(s) found, skipping cross-check`);
    PASS++;
  }
}



// ═══ 5j. Top-level t()/td() calls (frozen at load time) ═══
console.log('\n── Top-level t()/td() calls (frozen at load, never update) ──');
{
  const topLevelCalls = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    // Phase 1: find all top-level const/let ARRAY declarations
    const topLevelArrayRanges = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.match(/^(\s*)/)[1].length;
      if (indent > 0) continue;
      const m = line.match(/^(const|let)\s+(\w+)\s*=\s*\[/);
      if (m && !line.includes('];')) {
        const name = m[2];
        let depth = 0;
        for (let j = i; j < Math.min(lines.length, i + 100); j++) {
          for (const ch of lines[j]) { if (ch === '[') depth++; if (ch === ']') depth--; }
          if (depth <= 0) {
            topLevelArrayRanges.push({ start: i, end: j, name });
            break;
          }
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!(/\bt\(\s*'[^']+'\s*\)|\btd\(/.test(line))) continue;
      if (line.trim().startsWith('//')) continue;

      // Skip I18N infrastructure
      if (/^\s*(function\s+t\b|function\s+td\b|function\s+applyStaticLang|function\s+setLang|function\s+detectLang|var\s+I18N|var\s+NARRATIVE_|var\s+_narrativeMaps)/.test(line)) continue;

      const indent = line.match(/^(\s*)/)[1].length;
      if (indent > 0) continue; // Only check indent-0 lines

      // Skip function declarations
      if (/^\s*function\s/.test(line)) continue;
      if (/^(var|const|let)\s+(I18N|NARRATIVE_?\w*|DATA_\w+|TRANSLATIONS?_\w+|_lang|_narrativeMaps)\s*=/.test(line)) continue;

      // Check if inside a top-level array range
      const inArray = topLevelArrayRanges.find(r => i >= r.start && i <= r.end);
      if (inArray) {
        topLevelCalls.push({ line: i + 1, text: '[in top-level const ' + inArray.name + '] ' + line.trim().substring(0, 80) });
        continue;
      }

      // Backward brace-balance scan: are we inside a function body?
      let insideFunc = false;
      let bal = 0;
      for (let j = i - 1; j >= Math.max(0, i - 300); j--) {
        const prev = lines[j];
        for (let ci = prev.length - 1; ci >= 0; ci--) {
          if (prev[ci] === '}') bal++;
          if (prev[ci] === '{') bal--;
        }
        if (bal < 0) {
          if (/\bfunction\s|=>\s*\{/.test(prev)) insideFunc = true;
          break;
        }
      }

      if (!insideFunc) {
        topLevelCalls.push({ line: i + 1, text: line.trim().substring(0, 100) });
      }
    }
  }

  if (topLevelCalls.length === 0) {
    console.log('✅ No top-level t()/td() calls found');
    PASS++;
  } else {
    console.log('❌ FAIL: ' + topLevelCalls.length + ' t()/td() calls at top-level scope (frozen at load, ignore setLang):');
    topLevelCalls.slice(0, 15).forEach(c => {
      console.log('   line ' + c.line + ': ' + c.text);
    });
    if (topLevelCalls.length > 15) console.log('   ... and ' + (topLevelCalls.length - 15) + ' more');
    console.log('   PROBLEM: t() at top level runs ONCE when _lang="ru" (default). Result is frozen.');
    console.log('   setLang() CANNOT update these values — they are already computed and stored.');
    console.log('   FIX each pattern:');
    console.log('     const arr=[{h:t("x")}]  ->  function getArr(){return [{h:t("x")}];}');
    console.log('       then use getArr()[i] instead of arr[i] in render functions');
    console.log('     el.innerHTML=t("x")  ->  move into a function, call from setLang()/applyStaticLang()');
    console.log('     onclick="fn(t(x))"   ->  remove t() from HTML attr, set via JS in applyStaticLang()');
    FAIL++;
  }
}
// ═══ RESULT ═══
console.log('\n══════════════════════════════════════════');
console.log(`  RESULT: ${PASS} passed, ${FAIL} failed, ${WARN} warnings`);
console.log('══════════════════════════════════════════');

if (FAIL > 0) {
  console.log(`  ❌ LOCALIZATION NOT COMPLETE — fix ${FAIL} issues`);

  if (Object.keys(missingByLang).length > 0) {
    console.log('\n  Missing keys summary:');
    for (const [lang, keys] of Object.entries(missingByLang)) {
      if (Array.isArray(keys) && keys.length > 0) {
        console.log(`    I18N.${lang}: ${keys.length} missing — ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
      } else {
        console.log(`    I18N.${lang}: ENTIRE BLOCK MISSING`);
      }
    }
  }

  console.log('\n  Run again after fixes: node scripts/verify-i18n.mjs ' + target);
  process.exit(1);
} else {
  console.log('  ✅ LOCALIZATION COMPLETE');
  process.exit(0);
}
