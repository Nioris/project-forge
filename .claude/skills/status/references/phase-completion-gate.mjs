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
import { fileURLToPath } from 'node:url';

const CONTRACT_SCHEMA_VERSION = 1;
const CONTRACT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'phase-contracts');
const PROJECT_CHECK_IDS = new Set([
  'phase-1-integrity',
  'non-placeholder-evidence',
  'implementation-source',
  'clean-playtest-report',
  'visual-integration',
  'tech-runtime',
  'listing-output',
  'clean-local-stage-report',
  'release-green-report',
  'release-artifacts',
  'live-metrics',
]);

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
const EXTERNAL_FACT_LINE_PATTERN = /(?:\b(?:конкурент|рын(?:ок|ка)|каталог|бенчмарк|benchmark|industry|отрасл|монетизац|локализац|требовани[ея]\s+платформ|table[- ]stakes|users? complain|historical reference|modern web variants?|verified\s+only)\b|Nokia\s+Snake|Slither\.io|Snake\.io|Google\s+Snake|Yandex\s+Games|Wikipedia)/iu;
const NEGATED_EXTERNAL_LINE_PATTERN = /(?:\b(?:нет|без|не\s+(?:получ|найд|утверж|провер|использ)|no\s+verified|no\s+reliable|without)\b).*(?:конкурент|рын|каталог|benchmark|бенчмарк|источник|source|KPI|монетизац|локализац|требовани[ея])/iu;
const LOCAL_SOURCE_PATTERN = /(?:`[^`]*(?:GDD\.md|GameIntegration\/)[^`]*`|\b(?:GDD\.md|GameIntegration\/\S+))/iu;
const POSITIVE_EXTERNAL_ASSERTION_PATTERN = /\b(?:verified|confirmed|requires?|подтвержден\w*|проверен\w*|требует)\b/iu;
const RUNTIME_CHECK_PATTERN = /(?:игра\s+(?:открывается|запускается|работает|играбельна)|работа(?:ют|ет)\s+(?:клавиатур|сенсор|пауза|сохран|рестарт)|проход(?:ит|ят)\s+(?:тест|проверк)|переживает\s+перезагруз|responsive|playable|keyboard|touch|localStorage)/iu;
const IMPLEMENTATION_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.css', '.vue', '.svelte']);
const SKIP_DIRS = new Set(['.git', '.claude', '.agents', '.codex', 'node_modules', 'vendor', 'dist', 'build']);
const GENERIC_PLACEHOLDER_PATTERN = /(?:<\s*(?:дата|описание|название|путь|результат|заполнить|todo|пример|указать)[^>]*>|\{\{?\s*(?:TODO|TBD|PLACEHOLDER)[^}\n]*\}?\}|\b(?:TODO|FIXME|PLACEHOLDER)\b)/iu;

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
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) walkFiles(absolute, predicate, out);
    else if (entry.isFile() && predicate(absolute)) out.push(absolute);
  }
  return out;
}

function hasImplementationSource(root) {
  const roots = [path.join(root, 'WorkProgress'), path.join(root, 'src')];
  for (const candidate of ['index.html', 'main.js', 'app.js', 'package.json']) {
    if (safeProjectFile(root, candidate)) roots.push(path.join(root, candidate));
  }
  return roots.some(item => {
    try {
      if (fs.statSync(item).isFile()) return IMPLEMENTATION_EXTENSIONS.has(path.extname(item).toLowerCase());
    } catch { return false; }
    return walkFiles(item, file => IMPLEMENTATION_EXTENSIONS.has(path.extname(file).toLowerCase())).length > 0;
  });
}

function readLimited(file, maxBytes = 2 * 1024 * 1024) {
  try {
    if (fs.statSync(file).size > maxBytes) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function projectFiles(root, predicate) {
  return walkFiles(root, file => predicate(file, normalizeRelative(path.relative(root, file))));
}

function projectSourceText(root) {
  return projectFiles(root, file => IMPLEMENTATION_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .filter(file => !normalizeRelative(path.relative(root, file)).startsWith('GameIntegration/'))
    .slice(0, 250)
    .map(file => readLimited(file, 1024 * 1024))
    .join('\n');
}

function validImage(file) {
  try {
    const data = fs.readFileSync(file);
    if (data.length < 32) return false;
    const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
    const webp = data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    return png || jpeg || webp;
  } catch {
    return false;
  }
}

function validMp4(file) {
  try {
    const data = fs.readFileSync(file);
    return data.length >= 64 && data.subarray(4, 8).toString('ascii') === 'ftyp';
  } catch {
    return false;
  }
}

function validZip(file) {
  try {
    const data = fs.readFileSync(file);
    return data.length >= 128 && data[0] === 0x50 && data[1] === 0x4b
      && (data[2] === 0x03 || data[2] === 0x05 || data[2] === 0x07);
  } catch {
    return false;
  }
}

function parseJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function loadPhaseContract(phase) {
  const numericPhase = Number(phase);
  if (!Number.isInteger(numericPhase) || numericPhase < 1 || numericPhase > 9) {
    throw new Error(`Phase contract requires phase 1..9; got ${phase}`);
  }
  const file = path.join(CONTRACT_DIR, `phase-${numericPhase}.json`);
  let contract;
  try { contract = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Phase ${numericPhase} contract is missing or invalid JSON: ${error.message}`); }
  if (contract.schemaVersion !== CONTRACT_SCHEMA_VERSION || Number(contract.phase) !== numericPhase || !contract.name) {
    throw new Error(`Phase ${numericPhase} contract has invalid schema/version/identity`);
  }
  if (!Array.isArray(contract.requiredEvidence) || !contract.requiredEvidence.length) {
    throw new Error(`Phase ${numericPhase} contract must declare requiredEvidence`);
  }
  for (const item of contract.requiredEvidence) {
    if (!item || typeof item.path !== 'string' || !normalizeRelative(item.path) || path.isAbsolute(item.path)
      || normalizeRelative(item.path).split('/').includes('..') || !Number.isInteger(item.minBytes) || item.minBytes < 1) {
      throw new Error(`Phase ${numericPhase} contract has invalid requiredEvidence entry`);
    }
  }
  if (!Array.isArray(contract.projectChecks) || contract.projectChecks.some(id => !PROJECT_CHECK_IDS.has(id))) {
    throw new Error(`Phase ${numericPhase} contract contains an unknown project check`);
  }
  return contract;
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
  const brief = safeProjectFile(root, 'wiki/design/brief.md');
  if (brief) {
    const text = fs.readFileSync(brief.absolute, 'utf8');
    const placeholder = PLACEHOLDER_PATTERNS.find(pattern => pattern.test(text));
    if (placeholder) failures.push('wiki/design/brief.md is still an untouched or partially filled template');
  }

  const metrics = safeProjectFile(root, 'wiki/architecture/metrics.md');
  if (metrics) {
    const text = fs.readFileSync(metrics.absolute, 'utf8');
    if (/^status:\s*(?:qa[_-]?blocked|blocked|draft)\s*$/imu.test(text)) {
      failures.push('wiki/architecture/metrics.md still declares a blocked or draft status');
    }
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
      && !(NON_FACT_PATTERN.test(line) && !POSITIVE_EXTERNAL_ASSERTION_PATTERN.test(line))
      && !NEGATED_EXTERNAL_LINE_PATTERN.test(line));
    if (uncitedLine) {
      failures.push(`${normalizeRelative(path.relative(root, file))} contains an external factual line without a URL/local source or TBD/unverified label`);
    } else if (EXTERNAL_CLAIM_PATTERN.test(text) && !/https?:\/\/\S+/iu.test(text) && !EXPLICIT_NO_EXTERNAL_PATTERN.test(text)) {
      failures.push(`${normalizeRelative(path.relative(root, file))} contains external-market claims without a source URL or an explicit no-evidence declaration`);
    }
  }
}

function checkNonPlaceholderEvidence(root, contract, failures) {
  for (const requirement of contract.requiredEvidence) {
    const file = safeProjectFile(root, requirement.path);
    if (!file || !/\.(?:md|json|txt)$/iu.test(file.normalized)) continue;
    const text = readLimited(file.absolute);
    if (GENERIC_PLACEHOLDER_PATTERN.test(text)) {
      failures.push(`${file.normalized} contains unfinished placeholder content`);
    }
    if (/^status:\s*(?:blocked|qa[_-]?blocked|draft)\s*$/imu.test(text)) {
      failures.push(`${file.normalized} still declares a blocked or draft status`);
    }
  }
}

function checkCleanPlaytestReport(root, failures) {
  const reports = projectFiles(root, (file, rel) => /(?:^|\/)playtest-out\/report\.json$/iu.test(rel));
  const clean = reports.some(file => {
    const report = parseJson(file);
    return report && report.rafAlive === true && Array.isArray(report.errors) && report.errors.length === 0
      && Array.isArray(report.actions) && report.actions.length > 0;
  });
  if (!clean) failures.push('phase requires a real playtest-out/report.json with rafAlive=true, actions, and zero runtime errors');
}

function checkVisualIntegration(root, failures) {
  const visualAssets = projectFiles(root, (file, rel) => /\.(?:png|jpe?g|webp)$/iu.test(file)
    && /(?:^|\/)(?:assets|WorkProgress)\//iu.test(rel)
    && !/(?:^|\/)(?:refs|candidates)(?:\/|$)/iu.test(rel))
    .filter(validImage);
  const substantialCss = projectFiles(root, file => path.extname(file).toLowerCase() === '.css')
    .some(file => { try { return fs.statSync(file).size >= 256; } catch { return false; } });
  if (!visualAssets.length && !substantialCss) {
    failures.push('Phase 4 requires an integrated production image asset or substantial project CSS, not only visual documents');
  }
}

function checkTechRuntime(root, failures) {
  const source = projectSourceText(root);
  const checks = [
    [/YaGames\.init\s*\(/u, 'Yandex SDK initialization'],
    [/LoadingAPI\s*\.\s*ready\s*\(/u, 'LoadingAPI.ready lifecycle'],
    [/(?:GameplayAPI\s*\.\s*start|startGameplay)\s*\(/u, 'GameplayAPI start lifecycle'],
    [/(?:GameplayAPI\s*\.\s*stop|stopGameplay)\s*\(/u, 'GameplayAPI stop lifecycle'],
    [/(?:showRewardedVideo|showRewarded|showFullscreenAdv|showInterstitial)\s*\(/u, 'ads integration'],
    [/(?:touch-action\s*:|pointerdown|touchstart|safe-area-inset)/iu, 'mobile/touch adaptation'],
  ];
  for (const [pattern, label] of checks) if (!pattern.test(source)) failures.push(`Phase 5 requires ${label} in implementation source`);

  const config = safeProjectFile(root, '.forge-ai.json');
  const parsed = config ? parseJson(config.absolute) : null;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) failures.push('.forge-ai.json must be valid JSON configuration');
  else if (Object.keys(parsed).some(key => /(?:secret|token|api[_-]?key|password)/iu.test(key))) {
    failures.push('.forge-ai.json contains a credential-like field; secrets must stay outside the project');
  }
}

function checkListingOutput(root, failures) {
  const listings = projectFiles(root, (file, rel) => /store[-_]listing[-_].+\.json$/iu.test(rel))
    .filter(file => { try { return fs.statSync(file).size >= 80 && parseJson(file); } catch { return false; } });
  if (!listings.length) failures.push('Phase 6 requires at least one valid store-listing-*.json artifact');

  const screenshots = projectFiles(root, (file, rel) => /(?:^|\/)screens\/.+\.(?:png|jpe?g|webp)$/iu.test(rel)).filter(validImage);
  if (!screenshots.length) failures.push('Phase 6 requires at least one valid promo screenshot under screens/');

  const videos = projectFiles(root, (file, rel) => /(?:^|\/)screens\/video\/promo\.mp4$/iu.test(rel)).filter(validMp4);
  if (!videos.length) failures.push('Phase 6 requires a valid screens/video/promo.mp4 artifact');

  if (!/(?:\bI18N\b|\bt\s*\(|data-i18n)/u.test(projectSourceText(root))) {
    failures.push('Phase 6 requires an i18n dictionary/runtime in implementation source');
  }
}

function checkCleanLocalStageReport(root, failures) {
  const reports = projectFiles(root, (file, rel) => /(?:^|\/)stage-out\/rt\.json$/iu.test(rel));
  const clean = reports.some(file => {
    const report = parseJson(file);
    const rt = report?.rt;
    return report && Array.isArray(report.errors) && report.errors.length === 0 && rt
      && (rt._readyCalled === true || rt.readyCalled === true) && Boolean(rt._i18nRead);
  });
  if (!clean) failures.push('Phase 7 requires stage-out/rt.json with zero errors, readyCalled=true and i18nRead evidence');
}

function checkReleaseGreenReport(root, failures) {
  const docs = [
    ...projectFiles(root, (file, rel) => /^(?:wiki\/deploy-log\.md|wiki\/plan\/.+\.md)$/iu.test(rel)),
  ];
  if (!docs.some(file => /TOTAL:\s*\d+\s+pass,\s*0\s+fail/iu.test(readLimited(file)))) {
    failures.push('Phase 8 requires an exact release-ready TOTAL: N pass, 0 fail line in deploy evidence');
  }
}

function checkReleaseArtifacts(root, failures) {
  const groups = new Map();
  for (const file of projectFiles(root, (absolute, rel) => /^Release\/.+\.zip$/iu.test(rel))) {
    if (!validZip(file)) continue;
    const rel = normalizeRelative(path.relative(root, file));
    const match = path.basename(file).match(/^(.+)-v(\d+(?:\.\d+)*)(-debug|-marketing)?\.zip$/iu);
    if (!match) continue;
    const key = `${path.dirname(rel)}|${match[1]}|${match[2]}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(match[3] ? match[3].slice(1).toLowerCase() : 'production');
  }
  if (![...groups.values()].some(variants => ['production', 'debug', 'marketing'].every(item => variants.has(item)))) {
    failures.push('Phase 8 requires one non-empty production/debug/marketing ZIP trio of the same project version under Release/');
  }
}

function checkLiveMetrics(root, failures) {
  const metrics = safeProjectFile(root, 'wiki/metrics.md');
  const text = metrics ? readLimited(metrics.absolute) : '';
  if (!/\bD7\b/iu.test(text) || !/\bD30\b/iu.test(text) || !/(?:факт|actual)/iu.test(text)
    || !/(?:CTR|рейтинг|rating)/iu.test(text)) {
    failures.push('Phase 9 metrics must contain D7, D30, plan-vs-fact data, and CTR/rating evidence');
  }
}

function runProjectCheck(id, root, contract, evidence, failures) {
  if (id === 'phase-1-integrity') validatePhase1(root, evidence, failures);
  else if (id === 'non-placeholder-evidence') checkNonPlaceholderEvidence(root, contract, failures);
  else if (id === 'implementation-source' && !hasImplementationSource(root)) failures.push(`Phase ${contract.phase} requires real implementation source`);
  else if (id === 'clean-playtest-report') checkCleanPlaytestReport(root, failures);
  else if (id === 'visual-integration') checkVisualIntegration(root, failures);
  else if (id === 'tech-runtime') checkTechRuntime(root, failures);
  else if (id === 'listing-output') checkListingOutput(root, failures);
  else if (id === 'clean-local-stage-report') checkCleanLocalStageReport(root, failures);
  else if (id === 'release-green-report') checkReleaseGreenReport(root, failures);
  else if (id === 'release-artifacts') checkReleaseArtifacts(root, failures);
  else if (id === 'live-metrics') checkLiveMetrics(root, failures);
}

export function validatePhaseCompletion({ root = process.cwd(), phase, evidence = [] } = {}) {
  const projectRoot = path.resolve(root);
  const failures = [];
  const normalizedEvidence = [...new Set(evidence.map(normalizeRelative).filter(Boolean))];
  let contract = null;
  try { contract = loadPhaseContract(phase); }
  catch (error) { failures.push(error.message); }
  if (!normalizedEvidence.length) failures.push(`Phase ${phase} completion requires explicit evidence paths`);
  for (const rel of normalizedEvidence) {
    if (!safeProjectFile(projectRoot, rel)) failures.push(`evidence file is missing, outside the project, or not a regular file: ${rel}`);
  }
  if (contract) {
    const evidenceSet = new Set(normalizedEvidence);
    for (const requirement of contract.requiredEvidence) {
      const rel = normalizeRelative(requirement.path);
      if (!evidenceSet.has(rel)) failures.push(`Phase ${contract.phase} requires explicit evidence: ${rel}`);
      const file = safeProjectFile(projectRoot, rel);
      if (file) {
        try {
          if (fs.statSync(file.absolute).size < requirement.minBytes) {
            failures.push(`${rel} is too small for Phase ${contract.phase} evidence (minimum ${requirement.minBytes} bytes)`);
          }
        } catch {}
      }
    }
    for (const id of contract.projectChecks) runProjectCheck(id, projectRoot, contract, normalizedEvidence, failures);
  }
  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    evidence: normalizedEvidence,
    contract: contract ? { schemaVersion: contract.schemaVersion, phase: contract.phase, name: contract.name, projectChecks: contract.projectChecks } : null,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'))) {
  const [rawPhase, ...evidence] = process.argv.slice(2);
  const result = validatePhaseCompletion({ phase: Number(rawPhase), evidence });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
