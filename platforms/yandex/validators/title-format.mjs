// scripts/validators/title-format.mjs
// REQ-8.2.1-CAPS: Title in CAPS, with emoji or with age rating is forbidden.
// Source: п. 8.2.1 (modetator interpretation, confirmed by rejections of Prizrak and Driftworld):
//   "Некорректное название (содержит возрастной рейтинг, эмоджи или полностью КАПСом)"

import path from 'node:path';
import { LEVELS, SUPPORTED_LANGS, resolveGamePaths, listFiles, readJsonSafe, readTextSafe, walkFiles, runCli, findLineNo, isMain } from './_lib.mjs';

export const ID = 'title-format';
export const REQUIREMENTS = ['REQ-8.2.1-CAPS'];
export const URL = 'https://yandex.ru/dev/games/doc/ru/concepts/requirements#8';
export const CITATION = 'Тексты с соблюдением орфографии и пунктуации языка (п. 8.2.1). Модератор: «Некорректное название (содержит возрастной рейтинг, эмоджи или полностью КАПСом)»';

// Detect issues in a single title string.
function checkTitle(title, ctx) {
  const issues = [];
  if (!title || typeof title !== 'string') return issues;
  const t = title.trim();
  if (!t) return issues;

  // 1. Full CAPS (only meaningful if length > 3 to avoid false positives like "GO" or acronyms).
  // Strip non-letter chars first; check that the letter-content has both upper and lower variants.
  const letters = t.replace(/[^\p{L}]/gu, '');
  if (letters.length > 3) {
    const upper = letters.toLocaleUpperCase('ru-RU');
    const lower = letters.toLocaleLowerCase('ru-RU');
    if (upper !== lower && letters === upper) {
      issues.push({
        id: 'REQ-8.2.1-CAPS',
        level: LEVELS.BLOCKER,
        message: 'Title is fully UPPERCASE: "' + title + '"',
        citation: CITATION,
        url: URL,
        ...ctx
      });
    }
  }

  // 2. Emoji in title.
  // Match common emoji ranges + flags + ZWJ sequences. Avoid plain symbols like "&" or "+".
  const emojiRe = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;
  if (emojiRe.test(t)) {
    issues.push({
      id: 'REQ-8.2.1-CAPS',
      level: LEVELS.BLOCKER,
      message: 'Title contains emoji: "' + title + '"',
      citation: CITATION,
      url: URL,
      ...ctx
    });
  }

  // 3. Age rating like "16+", "18+", "12+" (with or without space before).
  // Don't match math like "2 + 2" — must be digit immediately followed by '+'.
  const ageRe = /\b\d{1,2}\+(?!\d)/;
  if (ageRe.test(t)) {
    issues.push({
      id: 'REQ-8.2.1-CAPS',
      level: LEVELS.BLOCKER,
      message: 'Title contains age rating: "' + title + '"',
      citation: CITATION,
      url: URL,
      ...ctx
    });
  }

  return issues;
}

export function validate(gamePath) {
  const { workPath, releasePath } = resolveGamePaths(gamePath);
  const issues = [];

  // Source 1: store-listing-{lang}.json (Release/{Game}/)
  const storeListings = listFiles(releasePath, /^store-listing-([a-z]{2})\.json$/);
  for (const file of storeListings) {
    const data = readJsonSafe(file);
    if (data._error) continue;
    issues.push(...checkTitle(data.title, { file, field: 'title' }));
  }

  // Source 2: <title>...</title> in HTML files.
  const htmlFiles = walkFiles(workPath, ['.html']);
  for (const file of htmlFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) {
      const title = m[1].trim();
      const lineNo = findLineNo(text, m[0]);
      issues.push(...checkTitle(title, { file, field: '<title>', line: lineNo }));
    }
  }

  // Source 3: I18N keys that look like a title (gameTitle, metro_title, title_name, mainTitle).
  // We scan JS files and pick string values for these keys.
  const jsFiles = walkFiles(workPath, ['.js', '.html']);
  const titleKeys = ['gameTitle', 'game_title', 'mainTitle', 'main_title', 'title_name', 'metro_title', 'app_title'];
  // Pattern:  key:'value'  or  "key":"value"   (no escapes inside).
  const reKey = (k) => new RegExp("\\b" + k + "\\s*:\\s*['\"]([^'\"]{1,60})['\"]", 'g');

  for (const file of jsFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    for (const key of titleKeys) {
      const re = reKey(key);
      let m;
      while ((m = re.exec(text)) !== null) {
        const val = m[1];
        const lineNo = text.slice(0, m.index).split('\n').length;
        issues.push(...checkTitle(val, { file, field: key, line: lineNo }));
      }
    }
  }

  return issues;
}

// CLI
if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
