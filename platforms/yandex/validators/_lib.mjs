// scripts/validators/_lib.mjs
// Shared helpers for all validators.
//
// Issue format:
//   { id, level, message, citation, url, file?, field?, line? }
// Levels:
//   - 'blocker' = will fail moderation, must fix before submit
//   - 'warning' = risky, manual review needed
//   - 'info'    = note for future improvement

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Cross-platform "is this the entry script?" check.
// Use this in validators: if (isMain(import.meta.url)) runCli({...});
export function isMain(metaUrl) {
  try {
    return fileURLToPath(metaUrl) === path.resolve(process.argv[1] || '');
  } catch {
    return false;
  }
}

export const LEVELS = { BLOCKER: 'blocker', WARNING: 'warning', INFO: 'info' };

export const SUPPORTED_LANGS = ['ru', 'en', 'es', 'tr', 'pt', 'ar', 'id', 'fr', 'ja', 'it', 'de', 'hi', 'zh'];

// Languages where Latin script in title would be unusual (heuristic for 8.2.1).
export const NON_LATIN_LANGS = ['ru', 'ar', 'ja', 'hi', 'zh'];

// Locate per-game paths.
export function resolveGamePaths(gamePath) {
  const abs = path.resolve(gamePath);
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) throw new Error('gamePath must be a directory: ' + gamePath);

  // Detect: WorkProgress/{Game} or Release/{Game}
  const parent = path.basename(path.dirname(abs));
  const gameName = path.basename(abs);

  let workPath = abs;
  let releasePath = abs;

  // Find sibling Release / WorkProgress
  const projectRoot = path.dirname(path.dirname(abs)); // strip /{Game} and /{WorkProgress|Release}
  const candidateRelease = path.join(projectRoot, 'Release', gameName);
  const candidateWork = path.join(projectRoot, 'WorkProgress', gameName);
  if (parent === 'WorkProgress' && fs.existsSync(candidateRelease)) releasePath = candidateRelease;
  if (parent === 'Release' && fs.existsSync(candidateWork)) workPath = candidateWork;

  // Canonical Yandex staging uses WorkProgress/<game>-yandex while release
  // metadata and the three archives live in Release/<game>/yandex.
  if (parent === 'WorkProgress' && gameName.endsWith('-yandex')) {
    const baseName = gameName.slice(0, -'-yandex'.length);
    const candidateYandexRelease = path.join(projectRoot, 'Release', baseName, 'yandex');
    if (fs.existsSync(candidateYandexRelease)) releasePath = candidateYandexRelease;
  }

  return { workPath, releasePath, gameName };
}

// Find files matching glob-ish pattern (no recursive subdirs unless explicit).
export function listFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const all = fs.readdirSync(dir, { withFileTypes: true });
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  return all.filter(d => d.isFile() && re.test(d.name)).map(d => path.join(dir, d.name));
}

export function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { _error: e.message };
  }
}

export function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Recursively scan a directory for files matching extensions.
export function walkFiles(dir, extensions = ['.html', '.js', '.mjs']) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        // Skip massive node_modules / cheats / debug / __pycache__
        if (['node_modules', '.git', 'cheats', '__pycache__'].includes(e.name)) continue;
        stack.push(p);
      } else if (extensions.some(ext => e.name.endsWith(ext))) {
        out.push(p);
      }
    }
  }
  return out;
}

// Find line number of a substring in text.
export function findLineNo(text, needle) {
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  return text.slice(0, idx).split('\n').length;
}

// Pretty-print issues to console.
export function printIssues(validatorId, issues) {
  const blockers = issues.filter(i => i.level === LEVELS.BLOCKER);
  const warnings = issues.filter(i => i.level === LEVELS.WARNING);
  const infos = issues.filter(i => i.level === LEVELS.INFO);

  console.log('\n=== ' + validatorId + ' ===');
  console.log('  blockers: ' + blockers.length + ', warnings: ' + warnings.length + ', infos: ' + infos.length);

  for (const i of issues) {
    const sym = i.level === 'blocker' ? '[X]' : i.level === 'warning' ? '[!]' : '[i]';
    let line = sym + ' [' + i.id + '] ' + i.message;
    if (i.file) line += '  (' + path.basename(i.file) + (i.field ? ':' + i.field : '') + (i.line ? ':' + i.line : '') + ')';
    console.log('  ' + line);
    if (i.citation) console.log('       cite: ' + i.citation);
    if (i.url) console.log('       url:  ' + i.url);
  }

  return blockers.length;
}

// CLI runner helper. Each validator calls this in its main block.
export function runCli(validatorModule) {
  const gamePath = process.argv[2];
  if (!gamePath) {
    console.error('Usage: node ' + path.basename(process.argv[1]) + ' <gamePath>');
    process.exit(2);
  }
  try {
    const issues = validatorModule.validate(gamePath);
    const blockers = printIssues(validatorModule.ID, issues);
    process.exit(blockers > 0 ? 1 : 0);
  } catch (e) {
    console.error('FATAL: ' + e.message);
    process.exit(2);
  }
}
