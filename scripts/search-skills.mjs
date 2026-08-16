#!/usr/bin/env node
/**
 * @file search-skills.mjs
 * @description Local skill search engine. Indexes all .claude/skills/X/SKILL.md
 *              files (frontmatter description + name + content keywords) и
 *              ranks by relevance to query.
 *
 * Algorithm:
 *   - Tokenize query (lowercase, strip punctuation, split на words)
 *   - For each skill: extract name, description, frontmatter triggers
 *   - Score: name match × 50, description term match × 10, trigger word × 20
 *   - Return top N matches with normalized 0-100 relevance
 *
 * Usage:
 *   node scripts/search-skills.mjs "валидация форм"
 *   node scripts/search-skills.mjs "stripe payment" --json
 *   node scripts/search-skills.mjs --top 10 "ui redesign"
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const topIdx = args.indexOf('--top');
const TOP_N = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) || 5 : 5;

// Build clean query string (strip flag args)
const queryWords = args.filter((a, i) => {
  if (a.startsWith('--')) return false;
  if (i > 0 && args[i - 1] === '--top') return false;
  return true;
});

if (queryWords.length === 0) {
  console.error('Usage: node scripts/search-skills.mjs "<query>"');
  process.exit(2);
}

const FORGE_ROOT = path.resolve(process.cwd());
const SKILLS_DIR = path.join(FORGE_ROOT, '.claude', 'skills');

if (!fs.existsSync(SKILLS_DIR)) {
  console.error('✗ No .claude/skills/ found. Run from Forge folder root.');
  process.exit(2);
}

/**
 * Parse SKILL.md frontmatter — extract name, kind, description.
 * Returns { name, kind, description, body } или null если broken.
 */
function parseSkillFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const match = raw.match(/^---\s*\n([\s\S]+?)\n---\s*\n([\s\S]*)$/);
    if (!match) return null;
    const fm = match[1];
    const body = match[2];

    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const kindMatch = fm.match(/^kind:\s*(.+)$/m);
    // description может быть multi-line с quotes
    const descMatch = fm.match(/^description:\s*"([\s\S]+?)"\s*$/m) ||
                      fm.match(/^description:\s*(.+)$/m);

    return {
      name: nameMatch ? nameMatch[1].trim() : path.basename(path.dirname(filePath)),
      kind: kindMatch ? kindMatch[1].trim() : 'unknown',
      description: descMatch ? descMatch[1].trim() : '',
      body: body.slice(0, 2000), // first 2KB body для secondary scoring
    };
  } catch {
    return null;
  }
}

/**
 * Extract triggers from description.
 * Convention в Forge: "Triggers on: foo, bar, baz" or "triggers: foo, bar".
 */
function extractTriggers(description) {
  const m = description.match(/[Tt]riggers?\s*on:?\s*([^.]+)/);
  if (!m) return [];
  return m[1]
    .split(/[,;]+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && t.length < 80);
}

/**
 * Tokenize text для matching. Lowercase, strip punctuation, split.
 * Cyrillic-aware (using Unicode regex).
 */
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
}

/**
 * Score skill against query tokens.
 * Returns 0+ raw score (later normalized to 0-100).
 */
function scoreSkill(skill, queryTokens) {
  let score = 0;
  const nameLower = skill.name.toLowerCase();
  const descLower = skill.description.toLowerCase();
  const bodyLower = skill.body.toLowerCase();
  const triggers = extractTriggers(skill.description);

  for (const token of queryTokens) {
    // Exact name match (highest weight)
    if (nameLower === token) score += 100;
    else if (nameLower.includes(token)) score += 50;

    // Trigger word match
    for (const trigger of triggers) {
      if (trigger === token) { score += 25; break; }
      if (trigger.includes(token)) { score += 15; break; }
    }

    // Description match (count occurrences, capped)
    const descMatches = (descLower.match(new RegExp(`\\b${escapeRegex(token)}`, 'gi')) || []).length;
    score += Math.min(descMatches, 3) * 10;

    // Body match (lower weight)
    const bodyMatches = (bodyLower.match(new RegExp(`\\b${escapeRegex(token)}`, 'gi')) || []).length;
    score += Math.min(bodyMatches, 2) * 3;
  }

  return score;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build index
const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(SKILLS_DIR, d.name, 'SKILL.md'))
  .filter(p => fs.existsSync(p));

const skills = skillDirs
  .map(parseSkillFile)
  .filter(Boolean);

if (skills.length === 0) {
  console.error('✗ No skills found in .claude/skills/');
  process.exit(2);
}

// Search
const queryStr = queryWords.join(' ');
const queryTokens = tokenize(queryStr);

if (queryTokens.length === 0) {
  console.error('✗ Query empty after tokenization');
  process.exit(2);
}

const scored = skills
  .map(skill => ({ skill, score: scoreSkill(skill, queryTokens) }))
  .filter(s => s.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, TOP_N);

// Normalize scores к 0-100 на абсолютной scale (не relative).
// Reasoning: для query без strong matches не должно показывать "100%" мусор.
// Scale: 100 = 100+ raw points (very strong), 50 = ~50 raw, 0 = 0.
// Cap raw score at 100 для normalization.
const normalized = scored.map(s => ({
  name: s.skill.name,
  kind: s.skill.kind,
  description: s.skill.description.slice(0, 200),
  raw_score: s.score,
  relevance: Math.min(100, s.score),  // direct mapping with cap
}));

if (JSON_MODE) {
  console.log(JSON.stringify({
    query: queryStr,
    total_skills: skills.length,
    matches: normalized,
  }, null, 2));
  process.exit(0);
}

// Human readable
console.log(`Query: "${queryStr}"`);
console.log(`Searched ${skills.length} skills, found ${normalized.length} match${normalized.length === 1 ? '' : 'es'}\n`);

if (normalized.length === 0) {
  console.log('No local matches. Consider marketplace search:');
  console.log(`  npx skills find "${queryStr}"`);
  process.exit(1);
}

normalized.forEach((s, i) => {
  const bar = '█'.repeat(Math.round(s.relevance / 10)) + '░'.repeat(10 - Math.round(s.relevance / 10));
  console.log(`${i + 1}. /${s.name}  ${bar} ${s.relevance}%  [${s.kind}]`);
  console.log(`   ${s.description.slice(0, 150)}${s.description.length > 150 ? '...' : ''}`);
  console.log('');
});

// Recommendation hint
const top = normalized[0];
if (top.relevance >= 70) {
  console.log(`✓ Strong match — use /${top.name} directly.`);
} else if (top.relevance >= 40) {
  console.log(`⚠ Moderate match. Consider /${top.name}, or try marketplace:`);
  console.log(`  npx skills find "${queryStr}"`);
} else {
  console.log('⚠ Weak matches. Likely better to search marketplace:');
  console.log(`  npx skills find "${queryStr}"`);
}
