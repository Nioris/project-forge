#!/usr/bin/env node
/**
 * @file check-store-listing.mjs
 * @description Validates store-listing-{lang}.json files against canonical schema.
 *
 *              Catches frequent AI failure mode: AI invents helpful-looking fields
 *              (_comment, _removed_fields, developer_comment, ageRating) which break
 *              import pipelines and look unprofessional in store consoles.
 *
 *              Also enforces required fields (lang, keywords, seo_description) which
 *              AI sometimes omits because it doesn't see them in Yandex Console form
 *              and decides they aren't needed. They ARE needed — for internal ASO
 *              tracking, share previews, PWA meta, search ranking.
 *
 *              Used as gate в release-ready and standalone audit.
 *
 * Usage:
 *   node scripts/check-store-listing.mjs <project-dir>
 *   node scripts/check-store-listing.mjs StoreData/
 *   node scripts/check-store-listing.mjs --json StoreData/
 *
 * Exit:
 *   0 = all store-listing files pass schema
 *   1 = one or more violations
 *   2 = invocation error
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const targetDir = args.find(a => !a.startsWith('--')) || '.';

const FORGE_ROOT = path.resolve(process.cwd());
const SCHEMA_PATH = path.join(FORGE_ROOT, 'schemas', 'store-listing.schema.json');

if (!fs.existsSync(SCHEMA_PATH)) {
  console.error('[X] Schema not found:', SCHEMA_PATH);
  console.error('    Run from Forge root or sibling project with synced schemas/');
  process.exit(2);
}

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
const FORBIDDEN_FIELDS = new Set(schema.$forbidden.fields);
const REQUIRED_FIELDS = new Set(schema.required);
const ALLOWED_FIELDS = new Set(Object.keys(schema.properties));

// Find all store-listing-*.json files в target dir recursively
function findListings(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      findListings(full, results);
    } else if (e.isFile() && /^store[-_]listing[-_].+\.json$/i.test(e.name)) {
      results.push(full);
    }
  }
  return results;
}

function validateFile(filePath) {
  const issues = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return {
      file: filePath,
      passed: false,
      issues: [`JSON parse error: ${e.message}`],
    };
  }

  // Check forbidden fields
  for (const key of Object.keys(data)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      issues.push(`FORBIDDEN field present: "${key}" — ${schema.$forbidden.rationale[key] || 'see schema'}`);
    } else if (!ALLOWED_FIELDS.has(key)) {
      issues.push(`UNKNOWN field: "${key}" — not in schema properties`);
    }
  }

  // Check required fields
  for (const req of REQUIRED_FIELDS) {
    if (!(req in data)) {
      issues.push(`MISSING required field: "${req}"`);
    } else if (data[req] === null || data[req] === '' || (Array.isArray(data[req]) && data[req].length === 0)) {
      issues.push(`EMPTY required field: "${req}" — must have content`);
    }
  }

  // Type checks per field
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    const propSchema = schema.properties[key];

    if (propSchema.type === 'string' && typeof value !== 'string') {
      issues.push(`WRONG TYPE: "${key}" should be string, got ${Array.isArray(value) ? 'array' : typeof value}` +
                  (key === 'category' && Array.isArray(value) ? ' (Yandex accepts ONE category per listing — split into separate localized listings if multi-category)' : ''));
      continue;
    }
    if (propSchema.type === 'array' && !Array.isArray(value)) {
      issues.push(`WRONG TYPE: "${key}" should be array, got ${typeof value}`);
      continue;
    }

    // String length
    if (typeof value === 'string') {
      if (propSchema.minLength && value.length < propSchema.minLength) {
        issues.push(`TOO SHORT: "${key}" is ${value.length} chars, min ${propSchema.minLength}`);
      }
      if (propSchema.maxLength && value.length > propSchema.maxLength) {
        issues.push(`TOO LONG: "${key}" is ${value.length} chars, max ${propSchema.maxLength}`);
      }
      if (propSchema.pattern && !new RegExp(propSchema.pattern).test(value)) {
        issues.push(`PATTERN FAIL: "${key}" doesn't match required pattern (${propSchema.pattern})`);
      }

      // CAPS detection (v4.10.26): fields tagged noAllCaps:true reject all-caps words >=4 chars
      if (propSchema.noAllCaps === true) {
        const capsRule = schema.$caps_rule || { minWordLength: 4, whitelist: [] };
        const whitelist = new Set(capsRule.whitelist || []);
        const minLen = capsRule.minWordLength || 4;
        // Note: \b (word boundary) doesn't work for Cyrillic в JS regex (only ASCII).
        // Workaround: split on whitespace + punctuation, then check each token.
        // This handles Cyrillic, Latin, Turkish с diacritics correctly.
        const tokens = value.split(/[\s.,!?;:—\-–"'`«»()\[\]{}\/\\]+/);
        const violations = [];
        for (const token of tokens) {
          if (token.length < minLen) continue;
          if (whitelist.has(token)) continue;
          // Check if entire token is uppercase letters (Latin/Cyrillic/Turkish с diacritics)
          // Strip apostrophes within tokens (e.g., "GRANNY'S" → "GRANNYS" for check)
          const stripped = token.replace(/['']/g, '');
          if (stripped.length < minLen) continue;
          // Must be all uppercase + at least one letter
          if (/^[A-ZА-ЯЁÇĞİÖŞÜÂÎÛ]+$/.test(stripped)) {
            violations.push(token);
          }
        }
        if (violations.length > 0) {
          const unique = [...new Set(violations)];
          issues.push(`ALL-CAPS WORDS: "${key}" has all-caps words >=${minLen} chars: ${unique.join(', ')}. Yandex doesn't allow CAPS subtitles (looks like SEO scam). Use sensible casing.`);
        }
      }
    }

    // Array constraints
    if (Array.isArray(value)) {
      if (propSchema.minItems && value.length < propSchema.minItems) {
        issues.push(`TOO FEW: "${key}" has ${value.length} items, min ${propSchema.minItems}`);
      }
      if (propSchema.maxItems && value.length > propSchema.maxItems) {
        issues.push(`TOO MANY: "${key}" has ${value.length} items, max ${propSchema.maxItems}`);
      }
      if (propSchema.uniqueItems) {
        const unique = new Set(value);
        if (unique.size < value.length) {
          issues.push(`DUPLICATES: "${key}" has duplicate items`);
        }
      }
    }
  }

  return {
    file: filePath,
    passed: issues.length === 0,
    issues,
    stats: {
      keywords_count: Array.isArray(data.keywords) ? data.keywords.length : 0,
      tags_count: Array.isArray(data.tags) ? data.tags.length : 0,
      seo_length: typeof data.seo_description === 'string' ? data.seo_description.length : 0,
      about_length: typeof data.about === 'string' ? data.about.length : 0,
    },
  };
}

const listings = findListings(path.resolve(targetDir));

if (listings.length === 0) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: true, files: [], note: 'No store-listing-*.json files found' }, null, 2));
  } else {
    console.log(`No store-listing-*.json files found in ${targetDir}`);
  }
  process.exit(0);
}

const reports = listings.map(validateFile);
const failures = reports.filter(r => !r.passed);

if (JSON_MODE) {
  console.log(JSON.stringify({
    ok: failures.length === 0,
    total: listings.length,
    failed: failures.length,
    reports
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

// Human readable
console.log(`Store listing validation — ${listings.length} file(s) checked\n`);

for (const r of reports) {
  const rel = path.relative(process.cwd(), r.file);
  if (r.passed) {
    console.log(`  ✓ ${rel}`);
    console.log(`      ${r.stats.tags_count} tags, ${r.stats.keywords_count} keywords, ` +
                `seo ${r.stats.seo_length} chars, about ${r.stats.about_length} chars`);
  } else {
    console.log(`  ✗ ${rel}`);
    for (const issue of r.issues) {
      console.log(`      - ${issue}`);
    }
  }
}

console.log('');
if (failures.length === 0) {
  console.log(`✓ All ${listings.length} store-listing files pass schema.`);
  process.exit(0);
} else {
  console.log(`✗ ${failures.length} of ${listings.length} store-listing files have schema violations.`);
  console.log('  Fix: review schema at schemas/store-listing.schema.json');
  console.log('  Regenerate via /fill-yandex or /store-listing skill following exact schema.');
  process.exit(1);
}
