// scripts/validators/store-listings.mjs
// Field length validation (REQ-FIELD-*) + title identity across game and listings (REQ-5.1.3).
// Sources:
//   - https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft
//   - https://yandex.ru/dev/games/doc/ru/requirements/5/1/3

import path from 'node:path';
import { LEVELS, SUPPORTED_LANGS, resolveGamePaths, listFiles, readJsonSafe, readTextSafe, walkFiles, runCli, findLineNo, isMain } from './_lib.mjs';

export const ID = 'store-listings';
export const REQUIREMENTS = ['REQ-FIELD-TITLE', 'REQ-FIELD-SEO', 'REQ-FIELD-ABOUT', 'REQ-FIELD-HOWTO', 'REQ-FIELD-KEYWORDS', 'REQ-5.1.3', 'REQ-5.2'];

const LIMITS = {
  title: { min: 1, max: 50 },
  seo_description: { min: 50, max: 160 },
  about: { min: 100, max: 1000 },
  how_to_play: { min: 100, max: 1000 },
  keywords_total: { max: 100 },
  developer_comment: { max: 2048 }
};

const REQUIRED_FIELDS = ['lang', 'title', 'seo_description', 'about', 'how_to_play'];

function citationFor(field) {
  switch (field) {
    case 'title': return 'Максимальная длина — 50 символов (включая знаки препинания и пробелы)';
    case 'seo_description': return 'Минимальная длина текста — 50 символов; максимальная — 160';
    case 'about':
    case 'how_to_play': return 'Минимальная длина текста — 100 символов; максимальная — 1000';
    case 'keywords_total': return 'Maximum 100 characters total (keywords)';
    case 'developer_comment': return 'Maximum 2048 characters (developer comment)';
    default: return '';
  }
}

const URL_DRAFT = 'https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft';
const URL_513   = 'https://yandex.ru/dev/games/doc/ru/requirements/5/1/3';

// Lightweight title normalizer for sync comparison.
// We allow case differences and trimming, per 5.1.3 ("Acceptable variations: case changes, punctuation").
function normalizeTitleSoft(s) {
  if (!s) return '';
  return String(s).trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

// Strict title normalization for the catalog identity check: collapse whitespace only.
function normalizeTitleStrict(s) {
  if (!s) return '';
  return String(s).trim().replace(/\s+/g, ' ');
}

export function validate(gamePath) {
  const { workPath, releasePath } = resolveGamePaths(gamePath);
  const issues = [];

  // === Field length checks per store-listing-{lang}.json ===
  const listings = listFiles(releasePath, /^store-listing-([a-z]{2})\.json$/);
  if (listings.length === 0) {
    issues.push({
      id: 'REQ-5.2',
      level: LEVELS.WARNING,
      message: 'No store-listing-{lang}.json files found in ' + path.basename(releasePath),
      citation: 'Все обязательные поля черновика заполнены (5.2)',
      url: URL_DRAFT,
      file: releasePath
    });
  }

  // Map: lang -> title (for sync check).
  const listingTitlesByLang = new Map();

  for (const file of listings) {
    const langMatch = path.basename(file).match(/^store-listing-([a-z]{2})\.json$/);
    const lang = langMatch ? langMatch[1] : '?';
    const data = readJsonSafe(file);
    if (data._error) {
      issues.push({
        id: 'REQ-5.2', level: LEVELS.BLOCKER,
        message: 'Invalid JSON: ' + data._error,
        url: URL_DRAFT, file
      });
      continue;
    }

    // Required fields presence
    for (const f of REQUIRED_FIELDS) {
      if (!data[f] || (typeof data[f] === 'string' && !data[f].trim())) {
        issues.push({
          id: 'REQ-5.2', level: LEVELS.BLOCKER,
          message: 'Missing required field: ' + f,
          url: URL_DRAFT, file, field: f
        });
      }
    }

    // Lang declared inside file must match filename.
    if (data.lang && data.lang !== lang) {
      issues.push({
        id: 'REQ-5.2', level: LEVELS.WARNING,
        message: 'lang field "' + data.lang + '" does not match filename language "' + lang + '"',
        url: URL_DRAFT, file, field: 'lang'
      });
    }

    // Title sync map.
    if (data.title) listingTitlesByLang.set(lang, data.title);

    // Length checks.
    const lengthChecks = [
      { field: 'title', value: data.title },
      { field: 'seo_description', value: data.seo_description },
      { field: 'about', value: data.about },
      { field: 'how_to_play', value: data.how_to_play }
    ];
    for (const c of lengthChecks) {
      if (typeof c.value !== 'string') continue;
      const len = c.value.length;
      const lim = LIMITS[c.field];
      if (lim.min !== undefined && len < lim.min) {
        issues.push({
          id: 'REQ-FIELD-' + c.field.toUpperCase().replace(/_/g, ''),
          level: LEVELS.BLOCKER,
          message: 'Field "' + c.field + '" too short: ' + len + ' chars (min ' + lim.min + ')',
          citation: citationFor(c.field), url: URL_DRAFT, file, field: c.field
        });
      }
      if (lim.max !== undefined && len > lim.max) {
        issues.push({
          id: 'REQ-FIELD-' + c.field.toUpperCase().replace(/_/g, ''),
          level: LEVELS.BLOCKER,
          message: 'Field "' + c.field + '" too long: ' + len + ' chars (max ' + lim.max + ')',
          citation: citationFor(c.field), url: URL_DRAFT, file, field: c.field
        });
      }
      // REQ-5.11: no character-padding to hit the minimum (repeated spaces/dashes/dots/etc).
      if (typeof c.value === 'string' && c.value.length) {
        if (/(.)\1{4,}/.test(c.value) || /([ \-_.,*•])\1{2,}/.test(c.value)) {
          issues.push({
            id: 'REQ-5.11', level: LEVELS.BLOCKER,
            message: 'Field "' + c.field + '" uses repeated/padding characters to pad length (forbidden by 5.11). Write real, meaningful text — no runs of spaces, dashes, dots or repeated letters.',
            citation: 'Requirement 5.11 — repeated characters to pass the minimum-length check are forbidden.',
            url: URL_DRAFT, file, field: c.field
          });
        }
      }
    }

    // REQ-5.11: seo_description and about must NOT be the same text (duplicate draft fields).
    const norm = (x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ').toLowerCase() : '');
    const seo = norm(data.seo_description), about = norm(data.about), how = norm(data.how_to_play);
    if (seo && about && seo === about) {
      issues.push({
        id: 'REQ-5.11', level: LEVELS.BLOCKER,
        message: 'seo_description and about are identical text — 5.11 forbids duplicate text across draft fields. Write distinct copy for each.',
        citation: 'Requirement 5.11 — no duplicate texts across draft fields.', url: URL_DRAFT, file, field: 'seo_description'
      });
    }
    if (about && how && about === how) {
      issues.push({
        id: 'REQ-5.11', level: LEVELS.BLOCKER,
        message: 'about and how_to_play are identical text — 5.11 forbids duplicate text across draft fields.',
        citation: 'Requirement 5.11 — no duplicate texts across draft fields.', url: URL_DRAFT, file, field: 'about'
      });
    }

    // Keywords aggregate length (joined by comma+space).
    if (Array.isArray(data.keywords)) {
      const total = data.keywords.join(', ').length;
      if (total > LIMITS.keywords_total.max) {
        issues.push({
          id: 'REQ-FIELD-KEYWORDS', level: LEVELS.BLOCKER,
          message: 'Keywords total length ' + total + ' chars exceeds ' + LIMITS.keywords_total.max,
          citation: citationFor('keywords_total'), url: URL_DRAFT, file, field: 'keywords'
        });
      }
    }
  }

  // === Title identity checks (REQ-5.1.3) ===
  // Collect titles from in-game sources per lang.
  // Source: I18N blocks in JS — keys gameTitle/metro_title/etc.
  const inGameTitles = collectInGameTitlesByLang(workPath);

  // Source: <title>...</title> in HTML.
  const htmlTitle = collectHtmlTitle(workPath);

  // For each store-listing lang, ensure there's a matching in-game title.
  for (const [lang, listingTitle] of listingTitlesByLang) {
    const ingame = inGameTitles.get(lang);
    if (!ingame) {
      issues.push({
        id: 'REQ-5.1.3', level: LEVELS.WARNING,
        message: 'No in-game title found for lang "' + lang + '" — cannot verify identity',
        citation: '"Title must be identical in the game itself and across all draft materials on each language" (5.1.3)',
        url: URL_513, file: 'store-listing-' + lang + '.json'
      });
      continue;
    }

    if (normalizeTitleSoft(listingTitle) !== normalizeTitleSoft(ingame.value)) {
      issues.push({
        id: 'REQ-5.1.3', level: LEVELS.BLOCKER,
        message: 'Title mismatch for lang "' + lang + '": store-listing="' + listingTitle + '" vs in-game="' + ingame.value + '"',
        citation: '"Title must be identical in the game itself and across all draft materials on each language" (5.1.3)',
        url: URL_513, file: ingame.file, field: ingame.key, line: ingame.line
      });
    }
  }

  // <title> tag is shown in browser tab — should match catalog title.
  if (htmlTitle && listingTitlesByLang.size > 0) {
    // Pick reference title — prefer the listing for the language that matches the HTML title most closely.
    // Heuristic: if normalized HTML title doesn't match ANY listing — flag once.
    const htmlNorm = normalizeTitleSoft(htmlTitle.value);
    const matchAny = [...listingTitlesByLang.values()].some(t => normalizeTitleSoft(t) === htmlNorm);
    if (!matchAny) {
      issues.push({
        id: 'REQ-5.1.3', level: LEVELS.WARNING,
        message: '<title>' + htmlTitle.value + '</title> does not match any store-listing title',
        citation: 'Title must be identical across all draft materials (5.1.3)',
        url: URL_513, file: htmlTitle.file, field: '<title>', line: htmlTitle.line
      });
    }
  }

  return issues;
}

// Collect in-game titles from JS I18N blocks. Returns Map<lang, {value, file, key, line}>.
function collectInGameTitlesByLang(workPath) {
  // Title key heuristic. Common naming patterns across our games.
  // 'title' is generic but safe here because it's matched ONLY inside an I18N
  // language block (lang:{...}), not at the file top level.
  const titleKeys = ['gameTitle', 'game_title', 'mainTitle', 'main_title', 'title_name', 'metro_title', 'app_title', 'title'];
  const result = new Map();
  const jsFiles = walkFiles(workPath, ['.js', '.html']);

  for (const file of jsFiles) {
    const text = readTextSafe(file);
    if (!text) continue;

    // Find language blocks: ru:{ ... } or "ru":{ ... }
    // Heuristic: look for lang key followed by '{' and then any of the title keys.
    for (const lang of SUPPORTED_LANGS) {
      // Match start of a language block — both object-literal (ru:{) and assignment
      // (I18N.ru = {, I18N["ru"] = {) styles. Assignment style was a blind spot that made
      // 5.1.3 falsely report "no in-game title found" (samogonshchik uses I18N.ru = {…}).
      const blockRe = new RegExp(
        "\\b" + lang + "\\s*:\\s*\\{" +
        "|\\b(?:I18N|LANG|STRINGS|DATA|NARRATIVE|L|T|TR|LOC|LOCALE)\\s*\\.\\s*" + lang + "\\s*=\\s*\\{" +
        "|\\b(?:I18N|LANG|STRINGS|DATA|NARRATIVE|L|T|TR|LOC|LOCALE)\\s*\\[\\s*[\"']" + lang + "[\"']\\s*\\]\\s*=\\s*\\{",
        'g');
      let mb;
      while ((mb = blockRe.exec(text)) !== null) {
        // Slice from block start; find matching closing brace via simple bracket counter.
        let depth = 0, start = mb.index + mb[0].length - 1, end = start;
        for (let i = start; i < Math.min(text.length, start + 40000); i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        const block = text.slice(start, end + 1);
        // Look for title keys within this block.
        for (const key of titleKeys) {
          const kRe = new RegExp("\\b" + key + "\\s*:\\s*['\"]([^'\"]{1,80})['\"]");
          const km = block.match(kRe);
          if (km) {
            // Already recorded? prefer first.
            if (!result.has(lang)) {
              const absIdx = start + (km.index || 0);
              const lineNo = text.slice(0, absIdx).split('\n').length;
              result.set(lang, { value: km[1], file, key: lang + '.' + key, line: lineNo });
            }
          }
        }
      }
    }
  }

  return result;
}

function collectHtmlTitle(workPath) {
  const htmlFiles = walkFiles(workPath, ['.html']);
  for (const file of htmlFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) {
      const lineNo = findLineNo(text, m[0]);
      return { value: m[1].trim(), file, line: lineNo };
    }
  }
  return null;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
