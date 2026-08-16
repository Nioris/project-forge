#!/usr/bin/env node
/**
 * @file check-setup-guide.mjs
 * @description Validates SETUP_GUIDE.md against template + consistency with
 *              store-listing JSON files в same directory.
 *
 *              Catches frequent AI failures when generating SETUP_GUIDE:
 *              - Missing sections (§7 leaderboards, §10 icon, §17 references)
 *              - Categories/tags не matching store-listing-ru.json (AI invented different)
 *              - Tags не из Yandex словаря (idle, tycoon, СНГ — AI invents)
 *              - Placeholder values left in ({N}, {Project}, {size})
 *              - Reference paths broken (links к reference files which не exist)
 *
 *              Used as gate в release-ready and standalone audit.
 *
 * Usage:
 *   node scripts/check-setup-guide.mjs <project-dir>
 *   node scripts/check-setup-guide.mjs Release/Samogonshchik/yandex/
 *
 * Exit:
 *   0 = SETUP_GUIDE passes all checks
 *   1 = violations found
 *   2 = invocation error
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const targetDir = args.find(a => !a.startsWith('--')) || '.';

const FORGE_ROOT = path.resolve(process.cwd());

// Required sections — exact heading patterns
const REQUIRED_SECTIONS = [
  { num: 1, pattern: /^## 1\.\s+Загрузка архива/m, name: 'Загрузка архива' },
  { num: 2, pattern: /^## 2\.\s+Языки/m, name: 'Языки' },
  { num: 3, pattern: /^## 3\.\s+(Карточка игры|Store listing)/m, name: 'Карточка игры — Store listing' },
  { num: 4, pattern: /^## 4\.\s+Категори/m, name: 'Категория и теги' },
  { num: 5, pattern: /^## 5\.\s+Возрастной/m, name: 'Возрастной рейтинг' },
  { num: 6, pattern: /^## 6\.\s+Cloud Saves/m, name: 'Cloud Saves' },
  { num: 7, pattern: /^## 7\.\s+Лидерборд/m, name: 'Лидерборды' },
  { num: 8, pattern: /^## 8\.\s+Покупки/m, name: 'Покупки (IAP)' },
  { num: 9, pattern: /^## 9\.\s+Реклама/m, name: 'Реклама' },
  { num: 10, pattern: /^## 10\.\s+Иконка/m, name: 'Иконка 1024×1024' },
  { num: 11, pattern: /^## 11\.\s+Скриншот/m, name: 'Скриншоты' },
  { num: 12, pattern: /^## 12\.\s+Промо/m, name: 'Промо-акции' },
  { num: 13, pattern: /^## 13\.\s+Чек-лист/m, name: 'Чек-лист перед загрузкой' },
  { num: 14, pattern: /^## 14\.\s+(Что делать|модератор)/m, name: 'Действия при отклонении модератором' },
  { num: 15, pattern: /^## 15\.\s+Версии ZIP/m, name: 'Версии ZIP' },
  { num: 16, pattern: /^## 16\.\s+После релиза/m, name: 'После релиза' },
  { num: 17, pattern: /^## 17\.\s+(Ссылки|reference)/m, name: 'Ссылки на reference-материалы' },
];

// Common AI-invented tags (not в Yandex dictionary)
const INVALID_TAGS = [
  'idle', 'clicker', 'tycoon', 'simulator', 'симулятор',
  'СНГ', 'cng', 'russian', 'humor', 'юмор',
  // 'multiplayer' is invalid в English form, but 'мультиплеер' is valid
];

// Categories that don't exist в Yandex (common AI mistakes)
const INVALID_CATEGORIES = [
  'Аркады', 'Бродилки', 'Клик-тап', 'Клик тап', 'Идл',
  'Кликеры', 'Тапалки',
];

// Valid 25 Yandex categories
const VALID_CATEGORIES = [
  'Боевики', 'Викторины', 'Головоломки', 'Гонки', 'Детские',
  'Для двоих', 'Для девочек', 'Для мальчиков', 'Игры .io', 'Казино',
  'Казуальные', 'Карточные', 'Мидкорные', 'Настольные', 'Новеллы',
  'Обучающие', 'Приключения', 'Ролевые', 'Симуляторы', 'Спорт',
  'Стратегии', 'Три в ряд', 'Хорроры', 'Шарики', 'Экономические',
];

function findSetupGuide(dir) {
  if (!fs.existsSync(dir)) return null;
  // Look for SETUP_GUIDE.md case-insensitive
  const entries = fs.readdirSync(dir);
  const match = entries.find(f => /^SETUP_GUIDE\.md$/i.test(f));
  if (match) return path.join(dir, match);
  // Recursive search
  for (const entry of entries) {
    const full = path.join(dir, entry);
    try {
      if (fs.statSync(full).isDirectory() && !['node_modules', '.git'].includes(entry)) {
        const found = findSetupGuide(full);
        if (found) return found;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function findStoreListings(dir) {
  const results = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (['node_modules', '.git'].includes(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && /^store[-_]listing[-_].+\.json$/i.test(e.name)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

const setupGuide = findSetupGuide(path.resolve(targetDir));
if (!setupGuide) {
  console.error('[X] SETUP_GUIDE.md not found in', targetDir);
  process.exit(2);
}

const content = fs.readFileSync(setupGuide, 'utf-8');
const violations = [];

// Check 1: All 17 required sections present
const missingSections = [];
for (const section of REQUIRED_SECTIONS) {
  if (!section.pattern.test(content)) {
    missingSections.push(`§${section.num} ${section.name}`);
  }
}
if (missingSections.length > 0) {
  violations.push({
    severity: 'CRITICAL',
    type: 'missing_sections',
    detail: `${missingSections.length} sections missing: ${missingSections.join(', ')}`,
  });
}

// Check 2: Placeholder values left in
const placeholders = content.match(/\{[A-Z_a-z]+\}|\{N\}|\{size\}|\{Project\}|\{ProjectName\}|\{GAME_NAME\}|\{name\}/g);
if (placeholders) {
  const unique = [...new Set(placeholders)];
  violations.push({
    severity: 'CRITICAL',
    type: 'placeholders',
    detail: `${unique.length} placeholder(s) left: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '...' : ''}`,
  });
}

// Check 3: AI-invented invalid tags MENTIONED AS ACTUAL TAGS (not prose).
// Tags appear in: bullet lists, comma-separated lines, "Теги:" sections, code blocks.
// Prose like "idle про деньги" or "симулятор самогоноварения" is legitimate use.
function isAntiPatternLine(line) {
  return /[❌✗]|НЕ\s+(ставь|использ|пиши|добавляй)|не\s+существ|don'?t\s+use|avoid|wrong|неправильно/i.test(line);
}

function tagInTagListContext(token) {
  // Match contexts where token appears as a tag, not prose:
  // - Line starts with bullet: "- idle"  or  "* idle"
  // - In comma list after "Теги:" / "tags:" / similar
  // - Inside backticks: `idle`
  // - Inside quotes preceded by colon: tags: ["idle", ...]
  // - Bold/standalone: **idle** at start of bullet
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isAntiPatternLine(line)) continue;

    // Skip if not relevant token
    const tokenRegex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
    if (!tokenRegex.test(line)) continue;

    // Check if в tag-list context:
    // a) Line is a code block or starts с code formatting
    if (/^[\s]*[`]/.test(line) || /[`]\w*[`]/.test(line.replace(tokenRegex, ''))) {
      // Token в code formatting context = likely tag list
      const inBackticks = new RegExp(`\`[^\`]*\\b${token}\\b[^\`]*\``, 'i').test(line);
      if (inBackticks) return true;
    }

    // b) Bullet point with token as item: "- idle" or "* idle" or "- **idle**" 
    if (/^[\s]*[-*]\s+(?:\*\*)?\b/i.test(line)) {
      // Check if token IS the bullet item (not in parens or description)
      const bulletMatch = line.match(/^[\s]*[-*]\s+(?:\*\*)?([^—()\n]+?)(?:\*\*)?(?:\s*←|\s*—|\s*\(|$)/);
      if (bulletMatch && tokenRegex.test(bulletMatch[1])) {
        return true;
      }
    }

    // c) After "Теги:" / "tags:" / "Tags:" line — check next few lines
    // (already handled через bullet/comma checks below)

    // d) Comma-separated tag list: line contains many short comma-separated items
    const commas = (line.match(/,/g) || []).length;
    if (commas >= 3) {
      // Looks like CSV tag list
      const items = line.split(',').map(s => s.trim().replace(/[`"'*]/g, ''));
      if (items.some(item => item.toLowerCase() === token.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

const foundInvalidTags = INVALID_TAGS.filter(tagInTagListContext);
if (foundInvalidTags.length > 0) {
  violations.push({
    severity: 'MAJOR',
    type: 'invalid_tags',
    detail: `Tags listed which не в Yandex dictionary: ${foundInvalidTags.join(', ')}. Replace per reference/yandex-tags-full.md (idle → тапалки, tycoon → магнат, СНГ → на русском+мемы). Note: validator only flags these в actual tag-list contexts (bullets, code blocks, comma lists), not prose descriptions.`,
  });
}

// Check 4: Invalid categories — same logic, must be в tag-list context
function categoryInListContext(cat) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isAntiPatternLine(line)) continue;
    if (!line.includes(cat)) continue;

    // Category mentions counted if в bullet, bold standalone, or table cell
    if (/^[\s]*[-*]\s+(?:\*\*)?\b/i.test(line)) {
      const bulletMatch = line.match(/^[\s]*[-*]\s+(?:\*\*)?([^—()\n]+?)(?:\*\*)?(?:\s*←|\s*—|\s*\(|$)/);
      if (bulletMatch && bulletMatch[1].includes(cat)) return true;
    }
    // Standalone bold: "**Аркады**"
    if (new RegExp(`\\*\\*${cat}\\*\\*`).test(line)) return true;
    // Table cell: "| Аркады |"
    if (new RegExp(`\\|\\s*${cat}\\s*\\|`).test(line)) return true;
  }
  return false;
}

const foundInvalidCats = INVALID_CATEGORIES.filter(categoryInListContext);
if (foundInvalidCats.length > 0) {
  violations.push({
    severity: 'CRITICAL',
    type: 'invalid_categories',
    detail: `Categories listed which не существуют в Yandex: ${foundInvalidCats.join(', ')}. Yandex has only 25 valid — see reference/yandex-categories-full.md.`,
  });
}

// Check 5: Consistency with store-listing JSON
const listings = findStoreListings(path.resolve(targetDir));
if (listings.length > 0) {
  // Try ru first, then en, then any
  const primaryListing = listings.find(l => /-ru\.json$/i.test(l)) ||
                          listings.find(l => /-en\.json$/i.test(l)) ||
                          listings[0];
  try {
    const listing = JSON.parse(fs.readFileSync(primaryListing, 'utf-8'));

    // Categories from listing should appear in guide
    if (Array.isArray(listing.category)) {
      for (const cat of listing.category) {
        if (!content.includes(cat)) {
          violations.push({
            severity: 'MAJOR',
            type: 'category_mismatch',
            detail: `Category "${cat}" из ${path.basename(primaryListing)} not mentioned в SETUP_GUIDE §4. Guide must dublicate listing.`,
          });
        }
      }
    }

    // At least majority of tags should appear in guide
    if (Array.isArray(listing.tags)) {
      const tagsInGuide = listing.tags.filter(tag => content.includes(tag));
      const coverage = tagsInGuide.length / listing.tags.length;
      if (coverage < 0.6) {
        violations.push({
          severity: 'MAJOR',
          type: 'tags_mismatch',
          detail: `Only ${tagsInGuide.length}/${listing.tags.length} tags из ${path.basename(primaryListing)} mentioned в SETUP_GUIDE §4 (coverage ${Math.round(coverage * 100)}%). Guide must list all tags from store-listing.`,
        });
      }
    }
  } catch (e) {
    violations.push({
      severity: 'MINOR',
      type: 'listing_parse_error',
      detail: `Couldn't parse ${primaryListing}: ${e.message}`,
    });
  }
}

// Check 6: Reference to reference files
const hasRefMention = /reference\/yandex-(categories|tags|fields-constraints)-full\.md/.test(content) ||
                       /reference\/yandex-(categories|tags|fields-constraints)\.md/.test(content);
if (!hasRefMention) {
  violations.push({
    severity: 'MAJOR',
    type: 'missing_reference_links',
    detail: 'SETUP_GUIDE doesn\'t reference reference/yandex-categories-full.md или yandex-tags-full.md или yandex-fields-constraints.md. Sections 4 and 17 should link к them.',
  });
}

// Check 6b (v4.10.30): §3 must mention keywords field per language
// Yandex Console имеет "Ключевые слова через запятую" — guide must say where they go
const hasKeywordsSection = /[Кк]лючевые\s+слова\s+через\s+запятую|keywords\s+(field|section)/i.test(content);
if (!hasKeywordsSection) {
  violations.push({
    severity: 'MAJOR',
    type: 'missing_keywords_section',
    detail: '§3 should mention "Ключевые слова через запятую" field — Yandex Console accepts comma-separated keywords per language. Reference store-listing-{lang}.json keywords array. Format: join с ", " for Console submission.',
  });
}

// Check 6b2 (v4.10.30): if guide claims keywords field doesn't exist — that's wrong
// Old skill output (v4.10.21-v4.10.29) said "Yandex Console этого поля нет"
// Real behavior (user verified 2026-05-14): field exists per language card
const wrongKeywordsClaim = /❌\s*«?Ключевые\s+слова\s+через\s+запятую»?|keywords[^.]*НЕТ|нет\s+полей[^.]*keywords/i.test(content);
if (wrongKeywordsClaim) {
  violations.push({
    severity: 'MAJOR',
    type: 'wrong_keywords_claim',
    detail: 'SETUP_GUIDE incorrectly claims "Yandex Console doesn\'t have keywords field". CORRECTION: field EXISTS per language card (user verified 2026-05-14). Remove the negative claim, add proper §3 keywords section with per-language joined strings из store-listing-{lang}.json.',
  });
}

// Check 6c (v4.10.30): §7 leaderboards must have multi-lang columns если leaderboards present
const hasLeaderboardSection = /## 7\.\s+Лидерборд/m.test(content);
if (hasLeaderboardSection) {
  // Look для leaderboard table within §7-§8 boundary
  const section7Match = content.match(/## 7\.\s+Лидерборд[\s\S]*?(?=## 8\.|$)/);
  if (section7Match) {
    const section7 = section7Match[0];
    const tableMatch = section7.match(/\|[^|\n]+\|[^|\n]+\|/);  // any table row
    if (tableMatch) {
      // Table exists — must have per-language columns
      const hasPerLangCols = /\bRU\b|\bEN\b|\bTR\b|Имя\s+RU|name_ru/.test(section7);
      if (!hasPerLangCols) {
        violations.push({
          severity: 'MAJOR',
          type: 'leaderboard_no_multilang',
          detail: '§7 leaderboard table missing per-language display names (RU/EN/TR/...). Yandex Console accepts display names для each game language. Add columns: Имя RU, Имя EN, Имя TR, descriptions per lang.',
        });
      }
    }
    // If no table BUT says "не используются" — OK
    else if (!/не использ/i.test(section7)) {
      violations.push({
        severity: 'MINOR',
        type: 'leaderboard_empty',
        detail: '§7 имеет header but no leaderboard table или "не используются" statement. Either add table или say "Лидерборды не используются".',
      });
    }
  }
}

// Check 7: Section §4 has "❌ НЕ ставь" anti-patterns warning
if (!/❌\s*НЕ\s+(ставь|использ)/i.test(content)) {
  violations.push({
    severity: 'MINOR',
    type: 'missing_anti_patterns',
    detail: '§4 should have "❌ НЕ ставь" section explaining common AI mistakes (idle, tycoon, СНГ) so future regeneration avoids them.',
  });
}

// Report
if (JSON_MODE) {
  console.log(JSON.stringify({
    ok: violations.length === 0,
    file: setupGuide,
    sections_found: REQUIRED_SECTIONS.length - missingSections.length,
    sections_total: REQUIRED_SECTIONS.length,
    violations,
  }, null, 2));
  process.exit(violations.length === 0 ? 0 : 1);
}

console.log(`SETUP_GUIDE.md validation — ${path.relative(process.cwd(), setupGuide)}\n`);
console.log(`  Sections found: ${REQUIRED_SECTIONS.length - missingSections.length}/${REQUIRED_SECTIONS.length}`);

if (violations.length === 0) {
  console.log('\n✓ SETUP_GUIDE.md passes all checks.');
  process.exit(0);
}

console.log(`\n✗ ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.log(`  [${v.severity}] ${v.type}`);
  console.log(`    ${v.detail}\n`);
}

console.log(`Fix: regenerate via /fill-yandex (reads reference files automatically)`);
console.log(`     ensure all sections present, no placeholders, tags из dictionary, consistency с store-listing-ru.json`);
process.exit(1);
