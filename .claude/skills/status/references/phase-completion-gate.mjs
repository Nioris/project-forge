#!/usr/bin/env node
/**
 * Mechanical evidence gate for Project Forge phase completion.
 *
 * This module deliberately validates facts that are cheap to establish locally. It does not
 * decide whether a design is good; it prevents a terminal model from turning missing files,
 * untouched templates, unsupported KPI numbers, or unbuilt acceptance criteria into a durable
 * `complete` marker.
 */
import fs from 'node:fs';
import path from 'node:path';

const PHASE_1_REQUIRED = [
  'wiki/architecture/metrics.md',
  'wiki/design/brief.md',
];

const PLACEHOLDER_PATTERNS = [
  /<дата>/iu,
  /<напр\.?[^>]*>/iu,
  /<кратко[^>]*>/iu,
  /<проба пера[^>]*>/iu,
  /<что закрываем[^>]*>/iu,
  /<одна фраза[^>]*>/iu,
  /<1-2 пункта>/iu,
  /<если прототип[^>]*>/iu,
  /<->/u,
  /заполняется в фазе 1/iu,
];

const KPI_PATTERN = /\b(?:D1|D7|D30|ARPDAU|ARPU|ARPPU|LTV|retention|удержани[ея]|конверси[яи])\b/iu;
const NUMBER_PATTERN = /(?:\d[\d.,]*\s*%|[$€₽]\s*\d|\d[\d.,]*\s*(?:руб\.?|долл\.?))/iu;
const NON_FACT_PATTERN = /\b(?:TBD|гипотез[аы]?|предположени[ея]|не\s+(?:получен[оы]?|утвержден[оы]?|проверен[оы]?|используется)|unverified|unknown|hypothesis)\b/iu;
const EXTERNAL_CLAIM_PATTERN = /\b(?:конкурент|рын(?:ок|ка)|каталог|бенчмарк|benchmark|industry|отрасл|монетизац|локализац|требовани[ея]\s+платформ|ARPDAU|retention)\b/iu;
const EXPLICIT_NO_EXTERNAL_PATTERN = /(?:нет|без|не\s+получен[оы]?|не\s+найден[оы]?|не\s+утвержден[оы]?|единственн\w+\s+проверенн\w+\s+источник|no\s+verified|without\s+external).{0,80}(?:внешн|источник|benchmark|бенчмарк|KPI)/isu;
const EXTERNAL_FACT_LINE_PATTERN = /(?:\b(?:конкурент|рын(?:ок|ка)|каталог|бенчмарк|benchmark|industry|отрасл|монетизац|локализац|требовани[ея]\s+платформ|table[- ]stakes|users? complain|historical reference|modern web variants?)\b|Nokia\s+Snake|Slither\.io|Snake\.io|Google\s+Snake|Wikipedia)/iu;
const NEGATED_EXTERNAL_LINE_PATTERN = /(?:\b(?:нет|без|не\s+(?:получ|найд|утверж|провер|использ)|no\s+verified|no\s+reliable|without)\b).*(?:конкурент|рын|каталог|benchmark|бенчмарк|источник|source|KPI|монетизац|локализац|требовани[ея])/iu;
const LOCAL_SOURCE_PATTERN = /(?:`[^`]*(?:GDD\.md|GameIntegration\/)[^`]*`|\b(?:GDD\.md|GameIntegration\/\S+))/iu;
const RUNTIME_CHECK_PATTERN = /(?:игра\s+(?:открывается|запускается|работает|играбельна)|работа(?:ют|ет)\s+(?:клавиатур|сенсор|пауза|сохран|рестарт)|проход(?:ит|ят)\s+(?:тест|проверк)|переживает\s+перезагруз|responsive|playable|keyboard|touch|localStorage)/iu;
const IMPLEMENTATION_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.css', '.vue', '.svelte']);

function normalizeRelative(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function safeProjectFile(root, rel) {
  const normalized = normalizeRelative(rel);
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) return null;
  const absolute = path.resolve(root, normalized);
  const prefix = path.resolve(root) + path.sep;
  if (absolute !== path.resolve(root) && !absolute.startsWith(prefix)) return null;
  try {
    return fs.statSync(absolute).isFile() ? { normalized, absolute } : null;
  } catch {
    return null;
  }
}

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(absolute, predicate, out);
    else if (entry.isFile() && predicate(absolute)) out.push(absolute);
  }
  return out;
}

function hasImplementationSource(root) {
  const work = path.join(root, 'WorkProgress');
  return walkFiles(work, file => IMPLEMENTATION_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .some(file => !/(?:^|[\\/])(?:node_modules|vendor|dist|build)(?:[\\/]|$)/i.test(file));
}

function markdownReferences(text) {
  const refs = new Set();
  for (const match of text.matchAll(/^\s*\[([^\]]+)\]:\s*https?:\/\/\S+/gimu)) refs.add(match[1].toLowerCase());
  return refs;
}

function lineHasCitation(line, refs) {
  if (/https?:\/\/\S+/iu.test(line)) return true;
  for (const match of line.matchAll(/\[([^\]]+)\](?!\()/gu)) {
    if (refs.has(match[1].toLowerCase())) return true;
  }
  return false;
}

function validatePhase1(root, evidence, failures) {
  const evidenceSet = new Set(evidence.map(normalizeRelative));
  for (const required of PHASE_1_REQUIRED) {
    if (!evidenceSet.has(required)) failures.push(`Phase 1 requires explicit evidence: ${required}`);
  }

  const brief = safeProjectFile(root, 'wiki/design/brief.md');
  if (brief) {
    const text = fs.readFileSync(brief.absolute, 'utf8');
    const placeholder = PLACEHOLDER_PATTERNS.find(pattern => pattern.test(text));
    if (placeholder) failures.push('wiki/design/brief.md is still an untouched or partially filled template');
  }

  const metrics = safeProjectFile(root, 'wiki/architecture/metrics.md');
  if (metrics) {
    const text = fs.readFileSync(metrics.absolute, 'utf8');
    if (!/контент[- ]бюджет/iu.test(text) || !/дефицит/iu.test(text)) {
      failures.push('wiki/architecture/metrics.md must contain the Phase 1 content budget and deficit');
    }
    const refs = markdownReferences(text);
    const unsupported = text.split(/\r?\n/).find(line => KPI_PATTERN.test(line)
      && NUMBER_PATTERN.test(line)
      && !NON_FACT_PATTERN.test(line)
      && !lineHasCitation(line, refs));
    if (unsupported) failures.push('numeric KPI claim lacks a URL citation or an explicit hypothesis/TBD label');

    const checkedRuntime = text.split(/\r?\n/).find(line => /^\s*[-*]\s*\[[xX]\]/u.test(line) && RUNTIME_CHECK_PATTERN.test(line));
    if (checkedRuntime && !hasImplementationSource(root)) {
      failures.push('runtime acceptance criterion is checked, but WorkProgress contains no implementation source');
    }
  }

  const researchDir = path.join(root, 'wiki', 'research');
  for (const file of walkFiles(researchDir, item => item.toLowerCase().endsWith('.md'))) {
    const text = fs.readFileSync(file, 'utf8');
    const refs = markdownReferences(text);
    const uncitedLine = text.split(/\r?\n/).find(line => EXTERNAL_FACT_LINE_PATTERN.test(line)
      && !lineHasCitation(line, refs)
      && !LOCAL_SOURCE_PATTERN.test(line)
      && !NON_FACT_PATTERN.test(line)
      && !NEGATED_EXTERNAL_LINE_PATTERN.test(line));
    if (uncitedLine) {
      failures.push(`${normalizeRelative(path.relative(root, file))} contains an external factual line without a URL/local source or TBD/unverified label`);
    } else if (EXTERNAL_CLAIM_PATTERN.test(text) && !/https?:\/\/\S+/iu.test(text) && !EXPLICIT_NO_EXTERNAL_PATTERN.test(text)) {
      failures.push(`${normalizeRelative(path.relative(root, file))} contains external-market claims without a source URL or an explicit no-evidence declaration`);
    }
  }
}

export function validatePhaseCompletion({ root = process.cwd(), phase, evidence = [] } = {}) {
  const projectRoot = path.resolve(root);
  const failures = [];
  const normalizedEvidence = [...new Set(evidence.map(normalizeRelative).filter(Boolean))];
  if (!normalizedEvidence.length) failures.push(`Phase ${phase} completion requires explicit evidence paths`);
  for (const rel of normalizedEvidence) {
    if (!safeProjectFile(projectRoot, rel)) failures.push(`evidence file is missing, outside the project, or not a regular file: ${rel}`);
  }
  if (Number(phase) === 1) validatePhase1(projectRoot, normalizedEvidence, failures);
  return { ok: failures.length === 0, failures: [...new Set(failures)], evidence: normalizedEvidence };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'))) {
  const [rawPhase, ...evidence] = process.argv.slice(2);
  const result = validatePhaseCompletion({ phase: Number(rawPhase), evidence });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
