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
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePhase4VisualEvidence } from './phase-4-visual-evidence.mjs';
import { validateScreenFlow } from './screen-flow-contract.mjs';
import { enginePhaseSupport, readTrustedProjectEngine } from './project-engine.mjs';
import { readTrustedProjectTargets } from './project-targets.mjs';
import { verifyVisualReceipt } from './visual-receipts.mjs';
import { WEB_PLAYTEST_PROTOCOL, readWebPlaytestContract, snapshotWebGameSource, webPlaytestReceiptPayload } from './web-playtest-contract.mjs';

const CONTRACT_SCHEMA_VERSION = 1;
const CONTRACT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'phase-contracts');
const PROJECT_CHECK_IDS = new Set([
  'phase-1-integrity',
  'engine-construct-capability',
  'engine-visual-capture-capability',
  'engine-tech-capability',
  'engine-playtest-capability',
  'engine-release-capability',
  'godot-native-tech',
  'godot-native-playtest',
  'godot-native-release',
  'non-placeholder-evidence',
  'implementation-source',
  'clean-playtest-report',
  'web-playtest-proof',
  'web-playtest-tech',
  'visual-integration',
  'phase-4-visual-evidence',
  'screen-flow-contract',
  'tech-runtime',
  'listing-output',
  'clean-local-stage-report',
  'release-green-report',
  'release-artifacts',
  'target-release-contract',
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

const UNICODE_WORD_LEFT = String.raw`(?<![\p{L}\p{M}\p{N}_])`;
const UNICODE_WORD_RIGHT = String.raw`(?![\p{L}\p{M}\p{N}_])`;
const unicodeTokenPattern = (source, flags = 'iu') => new RegExp(
  `${UNICODE_WORD_LEFT}(?:${source})${UNICODE_WORD_RIGHT}`,
  flags,
);
const RUSSIAN_EXTERNAL_TERM_SOURCE = String.raw`конкурент[\p{L}\p{M}]*|рын(?:ок|к[\p{L}\p{M}]*)|каталог[\p{L}\p{M}]*|бенчмарк[\p{L}\p{M}]*|отрасл[\p{L}\p{M}]*|монетизац[\p{L}\p{M}]*|локализац[\p{L}\p{M}]*|требовани[\p{L}\p{M}]*\s+платформ[\p{L}\p{M}]*`;
const EXTERNAL_FACT_TERM_SOURCE = String.raw`${RUSSIAN_EXTERNAL_TERM_SOURCE}|benchmark|industry|ARPDAU|retention`;
const EXTERNAL_TERM_SOURCE = EXTERNAL_FACT_TERM_SOURCE;
const NEGATED_EVIDENCE_SOURCE = String.raw`нет|без|не\s+(?:получ|найд|утверж|провер|использ)[\p{L}\p{M}]*|no\s+verified|no\s+reliable|without`;
const EXPLICIT_NO_EXTERNAL_SOURCE = String.raw`нет|без|не\s+получен[оы]?|не\s+найден[оы]?|не\s+утвержден[оы]?|единственн[\p{L}\p{M}]+\s+проверенн[\p{L}\p{M}]+\s+источник|no\s+verified|without\s+external`;
const NO_EXTERNAL_TARGET_SOURCE = String.raw`внешн[\p{L}\p{M}]*|источник[\p{L}\p{M}]*|benchmark|бенчмарк[\p{L}\p{M}]*|KPI`;

const KPI_PATTERN = unicodeTokenPattern(String.raw`D1|D7|D30|ARPDAU|ARPU|ARPPU|LTV|retention|удержани[ея]|конверси[яи]`);
const NUMBER_PATTERN = /(?:\d[\d.,]*\s*%|[$€₽]\s*\d|\d[\d.,]*\s*(?:руб\.?|долл\.?))/iu;
const NON_FACT_PATTERN = unicodeTokenPattern(String.raw`TBD|гипотез[аы]?|предположени[ея]|не\s+(?:получен[оы]?|утвержден[оы]?|проверен[оы]?|используется)|unverified|unknown|hypothesis`);
const EXTERNAL_CLAIM_PATTERN = unicodeTokenPattern(EXTERNAL_TERM_SOURCE);
const EXPLICIT_NO_EXTERNAL_PATTERN = new RegExp(
  `${UNICODE_WORD_LEFT}(?:${EXPLICIT_NO_EXTERNAL_SOURCE})${UNICODE_WORD_RIGHT}.{0,80}${UNICODE_WORD_LEFT}(?:${NO_EXTERNAL_TARGET_SOURCE})${UNICODE_WORD_RIGHT}`,
  'isu',
);
const EXTERNAL_FACT_LINE_PATTERN = unicodeTokenPattern(String.raw`${EXTERNAL_FACT_TERM_SOURCE}|table[- ]stakes|users? complain|historical reference|modern web variants?|verified\s+only|Nokia\s+Snake|Slither\.io|Snake\.io|Google\s+Snake|Yandex\s+Games|Wikipedia`);
const NEGATED_EXTERNAL_LINE_PATTERN = new RegExp(
  `${UNICODE_WORD_LEFT}(?:${NEGATED_EVIDENCE_SOURCE})${UNICODE_WORD_RIGHT}.*${UNICODE_WORD_LEFT}(?:${EXTERNAL_TERM_SOURCE}|${NO_EXTERNAL_TARGET_SOURCE}|source)${UNICODE_WORD_RIGHT}`,
  'iu',
);
const LOCAL_SOURCE_PATTERN = /(?:`[^`]*(?:GDD\.md|GameIntegration\/)[^`]*`|\b(?:GDD\.md|GameIntegration\/\S+))/iu;
const POSITIVE_EXTERNAL_ASSERTION_PATTERN = unicodeTokenPattern(String.raw`verified|confirmed|requires?|подтвержден[\p{L}\p{M}]*|проверен[\p{L}\p{M}]*|требует`);
const INTERNAL_RESEARCH_HEADING_PATTERN = /^\s*#{1,6}\s*(?:retention\s+hooks?\s+proposed|конкурентн[\p{L}\p{M}]*\s+поле)\s*$/iu;
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
  try {
    const realRoot = fs.realpathSync(path.resolve(root));
    const absolute = fs.realpathSync(path.resolve(realRoot, normalized));
    const relative = path.relative(realRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return fs.statSync(absolute).isFile() ? { normalized, absolute } : null;
  } catch {
    return null;
  }
}

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function safeProjectDirectory(root, rel) {
  const normalized = normalizeRelative(rel);
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) return null;
  try {
    const realRoot = fs.realpathSync(path.resolve(root));
    const absolute = fs.realpathSync(path.resolve(realRoot, normalized));
    const relative = path.relative(realRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return fs.statSync(absolute).isDirectory() ? { normalized, absolute } : null;
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
  // An explicit, validated web contract may select another project-contained game root.
  // Its runtime/source-bound proof is independently required by the phase contract.
  try { roots.push(readWebPlaytestContract(root).gameRoot); } catch {}
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

function godotImplementation(root) {
  const configFile = safeProjectFile(root, 'forge.godot.json');
  const config = configFile ? parseJson(configFile.absolute) : null;
  const directory = safeProjectDirectory(root, config?.projectPath);
  return directory ? { directory, config } : null;
}

function isGodotProductionFile(projectRoot, file) {
  const rel = normalizeRelative(path.relative(projectRoot, file));
  const segments = rel.split('/').map(part => part.toLowerCase());
  return !segments.some(part => ['test', 'tests', 'qa', 'fixtures', 'testdata', 'addons'].includes(part));
}

function stripGdNonCode(source) {
  let output = '';
  let quote = null;
  let triple = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\n') {
        output += '\n';
        if (!triple) { quote = null; escaped = false; }
        continue;
      }
      if (triple && source.slice(index, index + 3) === quote.repeat(3)) {
        output += '   ';
        index += 2;
        quote = null;
        triple = false;
        escaped = false;
        continue;
      }
      output += ' ';
      if (!triple && !escaped && char === quote) quote = null;
      escaped = !triple && !escaped && char === '\\';
      if (char !== '\\') escaped = false;
      continue;
    }
    if (char === '#') {
      while (index < source.length && source[index] !== '\n') { output += ' '; index += 1; }
      if (index < source.length) output += '\n';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      triple = source.slice(index, index + 3) === char.repeat(3);
      output += triple ? '   ' : ' ';
      if (triple) index += 2;
      continue;
    }
    output += char;
  }
  return output;
}

function projectSourceText(root, engineProfile = null) {
  if (engineProfile?.engine === 'godot') {
    const implementation = godotImplementation(root);
    if (!implementation) return '';
    return walkFiles(implementation.directory.absolute, file => path.extname(file).toLowerCase() === '.gd' && isGodotProductionFile(implementation.directory.absolute, file))
      .slice(0, 250)
      .map(file => stripGdNonCode(readLimited(file, 1024 * 1024)))
      .join('\n');
  }
  return projectFiles(root, file => IMPLEMENTATION_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .filter(file => {
      const rel = normalizeRelative(path.relative(root, file));
      return !rel.startsWith('GameIntegration/')
        && !/(?:^|\/)(?:debugcheck|cheats(?:-base)?)(?:\.min)?\.(?:m?js|cjs)$/iu.test(rel);
    })
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
      && !INTERNAL_RESEARCH_HEADING_PATTERN.test(line)
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
    // The declarative browser runner is the only web report that can become
    // completion evidence. Its receipt and current-source binding are
    // verified separately by checkWebPlaytestProof().
    if (report?.kind === 'forge.web-playtest-report') {
      return report.status === 'passed'
        && Array.isArray(report.runtime?.consoleErrors) && report.runtime.consoleErrors.length === 0
        && Array.isArray(report.steps) && report.steps.length > 0;
    }
    return report && report.rafAlive === true && Array.isArray(report.errors) && report.errors.length === 0
      && Array.isArray(report.actions) && report.actions.length > 0;
  });
  if (!clean) failures.push('phase requires a clean playtest-out/report.json with observed actions and zero runtime errors');
}

/**
 * Browser phase evidence is accepted only when the installed runner issued an
 * engine-owned receipt for the current contract and current game source.
 * Project JSON is useful for diagnosis, but never grants completion by itself.
 */
function checkWebPlaytestProof(root, failures, { requireTech = false } = {}) {
  let contract;
  try { contract = readWebPlaytestContract(root); }
  catch (error) { failures.push(`Web playtest contract rejected: ${error.message}`); return; }
  const reportPath = path.join(contract.gameRoot, 'playtest-out', 'report.json');
  const reportRelative = normalizeRelative(path.relative(root, reportPath));
  const report = parseJson(reportPath);
  if (!report || report.kind !== 'forge.web-playtest-report' || report.protocol !== WEB_PLAYTEST_PROTOCOL || report.status !== 'passed') {
    failures.push('phase requires a passing engine-run browser playtest report');
    return;
  }
  if (report.contract?.path !== contract.fileRelative || report.contract?.sha256 !== contract.hash || report.gameRoot !== contract.gameRootRelative) {
    failures.push('web playtest report does not bind to the current contract/game root');
    return;
  }
  let currentSnapshot;
  try { currentSnapshot = snapshotWebGameSource(contract.gameRoot); }
  catch (error) { failures.push(`web playtest source snapshot failed: ${error.message}`); return; }
  if (report.sourceSnapshotSha256 !== currentSnapshot) {
    failures.push('web playtest report is stale for the current game source');
    return;
  }
  const expectedSteps = contract.steps;
  if (!Array.isArray(report.steps) || report.steps.length !== expectedSteps.length) {
    failures.push('web playtest report does not cover every declared core-flow step');
    return;
  }
  for (const [index, expected] of expectedSteps.entries()) {
    const actual = report.steps[index];
    if (actual?.id !== expected.id || actual?.afterState !== expected.expect.state || actual?.changed !== expected.expect.changed) {
      failures.push(`web playtest step ${index + 1} does not match its declared observable outcome`);
      return;
    }
    if (expected.expect.changed && (!/^[a-f0-9]{64}$/u.test(String(actual.beforeVisualSha256 || '')) || actual.beforeVisualSha256 === actual.afterVisualSha256)) {
      failures.push(`web playtest step ${index + 1} lacks evidence that the rendered UI changed`);
      return;
    }
  }
  if (contract.persistence.mode === 'required' && (report.persistence?.checked !== true || report.persistence?.state !== contract.persistence.expectState)) {
    failures.push('web playtest did not prove the declared save/reload state');
    return;
  }
  if (!report.receiptId) {
    failures.push('web playtest report lacks an engine-owned receipt');
    return;
  }
  const receipt = verifyVisualReceipt({ projectRoot: root, kind: 'web-playtest', receiptId: report.receiptId,
    expectedPayload: webPlaytestReceiptPayload({ reportPath: reportRelative, report }) });
  if (!receipt.ok) {
    failures.push(`web playtest receipt is invalid: ${receipt.failure}`);
    return;
  }
  if (requireTech) {
    if (!contract.tech?.required?.length) {
      failures.push('Phase 5 requires declared runtime technical facts in forge.web.playtest.json');
      return;
    }
    const missing = contract.tech.required.filter(item => report.runtime?.facts?.[item] !== true);
    if (missing.length) failures.push(`web playtest did not prove required technical facts: ${missing.join(', ')}`);
    let targets;
    try { targets = readTrustedProjectTargets(root); }
    catch (error) { failures.push(`Phase 5 could not read authoritative platform targets: ${error.message}`); return; }
    if (targets.configured && targets.targets.includes('yandex')) {
      const requiredYandexFacts = ['sdk-init', 'loading-ready', 'gameplay-start', 'gameplay-stop'];
      const missingDeclaration = requiredYandexFacts.filter(item => !contract.tech.required.includes(item));
      const missingObservation = requiredYandexFacts.filter(item => report.runtime?.facts?.[item] !== true);
      if (missingDeclaration.length) failures.push(`Yandex Phase 5 contract must declare SDK lifecycle facts: ${missingDeclaration.join(', ')}`);
      if (missingObservation.length) failures.push(`Yandex Phase 5 browser run did not observe SDK lifecycle facts: ${missingObservation.join(', ')}`);
    }
  }
}

function checkVisualIntegration(root, failures) {
  const visualAssets = projectFiles(root, (file, rel) => /\.(?:png|jpe?g|webp)$/iu.test(file)
    && /(?:^|\/)(?:assets|WorkProgress)\//iu.test(rel)
    && !/(?:^|\/)(?:refs|candidates|target|screens|playtest-out|stage-out)(?:\/|$)/iu.test(rel))
    .filter(validImage);
  const source = projectSourceText(root);
  const integrated = visualAssets.some(file => {
    const rel = normalizeRelative(path.relative(root, file));
    const base = path.basename(file);
    return source.includes(rel) || source.includes(base);
  });
  if (!integrated) failures.push('Phase 4 requires source-referenced production image assets; CSS, target frames, and review screenshots do not count as integration');
}

const GODOT_PROCEDURAL_DRAW_PRIMITIVE = /\b(draw_(?:arc|circle|colored_polygon|dashed_line|line|multiline|polygon|polyline|rect|string|style_box|texture|texture_rect|texture_rect_region))\s*\(/gu;

function stripProceduralSourceComments(value) {
  return String(value)
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/#.*$/gmu, '')
    .replace(/^[ \t]*\/\/.*$/gmu, '');
}

/**
 * Inspect production Godot visuals without confusing review media or test-only drawing with
 * integration. A substantial native CanvasItem drawing system is a valid production visual
 * asset: the signed pixel review remains responsible for judging its actual quality.
 */
export function inspectGodotProductionVisualIntegration(root) {
  const contractFile = safeProjectFile(root, 'forge.godot.json');
  const contract = contractFile ? parseJson(contractFile.absolute) : null;
  const projectPath = normalizeRelative(contract?.projectPath || '');
  if (!projectPath || path.isAbsolute(projectPath)
    || (projectPath !== '.' && projectPath.split('/').some(part => !part || part === '.' || part === '..'))) {
    return { integrated: false, reason: 'Godot Phase 4 requires a safe forge.godot.json projectPath for visual integration' };
  }
  const implementationRoot = path.resolve(root, projectPath);
  let realImplementation;
  try {
    realImplementation = fs.realpathSync(implementationRoot);
    const relative = path.relative(fs.realpathSync(root), realImplementation);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(realImplementation).isDirectory()) throw new Error('outside project');
  } catch {
    return { integrated: false, reason: 'Godot Phase 4 implementation root is missing or outside the project' };
  }
  const sourceExtensions = new Set(['.godot', '.tscn', '.tres', '.res', '.gd', '.cs', '.gdshader']);
  const assetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ttf', '.otf']);
  const excludedVisualPath = /(?:^|\/)(?:qa|tests?|screens\/review|refs|candidates|target|playtest-out|stage-out)(?:\/|$)/iu;
  const sourceFiles = walkFiles(realImplementation, file => sourceExtensions.has(path.extname(file).toLowerCase()))
    .filter(file => !excludedVisualPath.test(normalizeRelative(path.relative(realImplementation, file))))
    .slice(0, 500)
    .map(file => ({
      file,
      rel: normalizeRelative(path.relative(realImplementation, file)),
      text: readLimited(file, 2 * 1024 * 1024),
    }));
  const source = sourceFiles.map(item => item.text).join('\n');
  const assets = walkFiles(realImplementation, file => assetExtensions.has(path.extname(file).toLowerCase()))
    .filter(file => {
      const rel = normalizeRelative(path.relative(realImplementation, file));
      if (excludedVisualPath.test(rel)) return false;
      try { return fs.statSync(file).size >= 32 && (!/\.(?:png|jpe?g|webp)$/iu.test(file) || validImage(file)); }
      catch { return false; }
    });
  const integrated = assets.some(file => {
    const rel = normalizeRelative(path.relative(realImplementation, file));
    return source.includes(`res://${rel}`) || source.includes(rel) || source.includes(path.basename(file));
  });
  const proceduralFiles = sourceFiles.filter(item => path.extname(item.file).toLowerCase() === '.gd')
    .map(item => ({ ...item, text: stripProceduralSourceComments(item.text) }))
    .filter(item => /\bfunc\s+_draw\s*\(/u.test(item.text));
  const proceduralSource = proceduralFiles.map(item => item.text).join('\n');
  const primitiveCalls = [...proceduralSource.matchAll(GODOT_PROCEDURAL_DRAW_PRIMITIVE)].map(match => match[1]);
  const primitiveKinds = new Set(primitiveCalls);
  const helperCount = [...proceduralSource.matchAll(/\bfunc\s+_draw_[A-Za-z0-9_]+\s*\(/gu)].length;
  const stateSignalPatterns = [
    /\b(?:for|if|match)\b/u,
    /\b(?:model|level|state|progress)\b/u,
    /\bqueue_redraw\s*\(/u,
    /\b(?:frame|selected|locked|active|outcome)\b/u,
  ];
  const stateSignals = stateSignalPatterns.filter(pattern => pattern.test(proceduralSource)).length;
  const procedural = proceduralFiles.length >= 2 && primitiveCalls.length >= 24
    && primitiveKinds.size >= 5 && helperCount >= 4 && stateSignals >= 2;
  return {
    integrated: integrated || procedural,
    mode: integrated ? 'asset' : (procedural ? 'procedural' : null),
    assetCount: assets.length,
    procedural: {
      controls: proceduralFiles.length,
      primitiveCalls: primitiveCalls.length,
      primitiveKinds: primitiveKinds.size,
      helpers: helperCount,
      stateSignals,
    },
  };
}

function checkGodotVisualIntegration(root, failures) {
  const inspection = inspectGodotProductionVisualIntegration(root);
  if (inspection.reason) {
    failures.push(inspection.reason);
    return;
  }
  if (!inspection.integrated) failures.push('Godot Phase 4 requires either a source-referenced production image/font asset or substantive procedural production drawing (>=2 draw controls, >=24 primitive calls, >=5 primitive kinds, >=4 draw helpers, >=2 state/data signals); targets, QA/tests and review media do not count');
}

function checkPhase4VisualEvidence(root, failures) {
  const result = validatePhase4VisualEvidence({ root });
  if (!result.ok) failures.push(...result.failures.map(item => `Phase 4 visual gate: ${item}`));
}

function checkTechRuntime(root, failures) {
  // SDK lifecycle is runtime evidence from web-playtest-tech. Source tokens can
  // live in comments, strings, dead branches, or a copied helper and therefore
  // never prove that a player can actually start, pause, or return to a game.
  const config = safeProjectFile(root, '.forge-ai.json');
  const parsed = config ? parseJson(config.absolute) : null;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) failures.push('.forge-ai.json must be valid JSON configuration');
  else if (Object.keys(parsed).some(key => /(?:secret|token|api[_-]?key|password)/iu.test(key))) {
    failures.push('.forge-ai.json contains a credential-like field; secrets must stay outside the project');
  }
}

function checkGodotListingI18n(root, source, failures) {
  const implementation = godotImplementation(root);
  if (!implementation) {
    failures.push('Phase 6 Godot listing requires a valid forge.godot.json projectPath');
    return;
  }
  const projectFile = path.join(implementation.directory.absolute, 'project.godot');
  const projectText = readLimited(projectFile);
  const catalogRefs = [...projectText.matchAll(/res:\/\/([^"\r\n,)]+\.(?:po|translation|csv))/giu)]
    .map(match => match[1].replaceAll('/', path.sep));
  const catalogs = catalogRefs.map(rel => path.join(implementation.directory.absolute, rel)).filter(file => {
    try {
      const relative = path.relative(implementation.directory.absolute, fs.realpathSync(file));
      return !relative.startsWith('..') && !path.isAbsolute(relative) && fs.statSync(file).isFile() && fs.statSync(file).size >= 32;
    } catch { return false; }
  });
  if (!/\binternationalization\b/iu.test(projectText) || !catalogRefs.length || !catalogs.length) {
    failures.push('Phase 6 Godot listing requires project.godot internationalization with at least one real translation catalog');
  }
  if (!/\btr(?:_n)?\s*\(/u.test(source)) {
    failures.push('Phase 6 Godot listing requires production GDScript to resolve player-visible text through tr()/tr_n()');
  }
}

function checkListingOutput(root, failures, engineProfile) {
  const listings = projectFiles(root, (file, rel) => /store[-_]listing[-_].+\.json$/iu.test(rel))
    .filter(file => { try { return fs.statSync(file).size >= 80 && parseJson(file); } catch { return false; } });
  if (!listings.length) failures.push('Phase 6 requires at least one valid store-listing-*.json artifact');

  const screenshotPattern = engineProfile?.engine === 'godot'
    ? /(?:^|\/)screens\/store\/.+\.(?:png|jpe?g|webp)$/iu
    : /(?:^|\/)screens\/.+\.(?:png|jpe?g|webp)$/iu;
  const screenshots = projectFiles(root, (file, rel) => screenshotPattern.test(rel)).filter(validImage);
  if (!screenshots.length) failures.push(engineProfile?.engine === 'godot'
    ? 'Phase 6 Godot listing requires at least one valid promo screenshot under screens/store/'
    : 'Phase 6 requires at least one valid promo screenshot under screens/');

  const source = projectSourceText(root, engineProfile);
  if (engineProfile?.engine === 'godot') {
    const visual = validatePhase4VisualEvidence({ root });
    if (!visual.ok) failures.push(...visual.failures.map(item => `Phase 6 Godot promo media: ${item}`));
    const captureFile = visual.captureManifest ? safeProjectFile(root, visual.captureManifest) : null;
    const capture = captureFile ? parseJson(captureFile.absolute) : null;
    const currentDesktopHashes = new Set((Array.isArray(capture?.captures) ? capture.captures : [])
      .filter(item => item?.viewport === 'desktop' && /^[a-f0-9]{64}$/u.test(String(item.sha256 || '')))
      .map(item => item.sha256));
    if (!screenshots.some(file => currentDesktopHashes.has(sha256File(file)))) {
      failures.push('Phase 6 Godot store screenshot must be copied byte-for-byte from the current signed desktop capture');
    }
    checkGodotListingI18n(root, source, failures);
  } else {
    const videos = projectFiles(root, (file, rel) => /(?:^|\/)screens\/video\/promo\.mp4$/iu.test(rel)).filter(validMp4);
    if (!videos.length) failures.push('Phase 6 requires a valid screens/video/promo.mp4 artifact');
    if (!/(?:\bI18N\b|\bt\s*\(|data-i18n)/u.test(source)) {
      failures.push('Phase 6 requires an i18n dictionary/runtime in implementation source');
    }
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

function checkScreenFlow(root, failures) {
  const result = validateScreenFlow({ root });
  if (!result.ok) failures.push(...result.failures.map(item => `Screen flow: ${item}`));
}

function runGodotConstructVerifier(root, engineProfile, failures) {
  const script = path.join(engineProfile.engineRoot || '', 'scripts', 'check-godot-project.mjs');
  if (!engineProfile.engineRoot || !fs.existsSync(script)) {
    const message = 'Installed Godot construct verifier is missing';
    failures.push(message);
    return { id: 'godot-project', status: 'environment_failure', summary: message, toolchain: null, checks: [] };
  }
  const child = spawnSync(process.execPath, [script, root, '--json'], {
    cwd: engineProfile.engineRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  let report = null;
  try { report = JSON.parse(child.stdout || ''); } catch {}
  const status = report?.status || (child.status === 1 ? 'failed' : 'environment_failure');
  const summary = report?.summary || summarizeGodotInstalledVerifier({
    report,
    scriptName: 'check-godot-project.mjs',
    childError: child.error?.message || '',
    stderr: child.stderr || '',
  });
  const normalized = {
    id: 'godot-project',
    status,
    summary: String(summary).slice(0, 1000),
    toolchain: report?.toolchain || null,
    checks: Array.isArray(report?.checks) ? report.checks.map(item => ({
      id: String(item.id || '').slice(0, 120),
      status: item.status,
      message: String(item.message || '').slice(0, 500),
      durationMs: Number(item.durationMs) || 0,
    })).slice(0, 20) : [],
  };
  if (child.status !== 0 || status !== 'passed') {
    const details = Array.isArray(report?.issues)
      ? report.issues.slice(0, 3).map(item => item.message).filter(Boolean).join('; ')
      : '';
    failures.push(`Godot construct verifier ${status}: ${details || normalized.summary}`);
  }
  return normalized;
}

export function summarizeGodotInstalledVerifier({ report = null, scriptName = '', childError = '', stderr = '' } = {}) {
  const issueSummary = Array.isArray(report?.issues)
    ? report.issues.slice(0, 3).map(item => item?.message).filter(Boolean).join('; ')
    : '';
  if (issueSummary) return issueSummary;
  const reportSummary = String(report?.summary || '').trim();
  if (reportSummary) return reportSummary;
  if (report?.status === 'passed') {
    const displayServer = String(report?.proof?.renderer?.displayServer || '').trim();
    const renderer = String(report?.renderer || '').trim();
    const facts = [...new Set([displayServer, renderer].filter(Boolean))];
    return `${scriptName} passed${facts.length ? ` (${facts.join(', ')})` : ''}`;
  }
  return String(childError || '').trim() || String(stderr || '').trim() || `${scriptName} returned invalid output`;
}

function runGodotInstalledVerifier(root, engineProfile, failures, { id, scriptName, timeoutMs }) {
  const script = path.join(engineProfile.engineRoot || '', 'scripts', scriptName);
  if (!engineProfile.engineRoot || !fs.existsSync(script)) {
    const message = `Installed Godot verifier is missing: ${scriptName}`;
    failures.push(message);
    return { id, status: 'environment_failure', summary: message, toolchain: null, checks: [] };
  }
  const child = spawnSync(process.execPath, [script, root, '--json'], {
    cwd: engineProfile.engineRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  let report = null;
  try { report = JSON.parse(child.stdout || ''); } catch {}
  const status = report?.status || (child.status === 1 ? 'failed' : 'environment_failure');
  const summary = summarizeGodotInstalledVerifier({
    report,
    scriptName,
    childError: child.error?.message || '',
    stderr: child.stderr || '',
  });
  const normalized = {
    id,
    status,
    summary: String(summary).slice(0, 1000),
    toolchain: report?.engine || null,
    report: report ? {
      kind: report.kind || null,
      generatedAt: report.generatedAt || null,
      renderer: report.renderer || null,
      testHarness: report.testHarness === true,
      runtimeProcesses: Number(report.runtimeProcesses) || 0,
      manifest: report.manifest || null,
      version: report.version || null,
    } : null,
    checks: [],
  };
  if (child.status !== 0 || status !== 'passed' || report?.testHarness === true) {
    failures.push(`Godot ${id} verifier ${status}: ${normalized.summary}`);
  }
  return normalized;
}

function runPlatformReleaseVerifier(root, engineProfile, failures) {
  const scriptName = 'platform-release-verify.mjs';
  const script = path.join(engineProfile?.engineRoot || '', 'scripts', scriptName);
  if (!engineProfile?.engineRoot || !fs.existsSync(script)) {
    const summary = `Installed storefront release verifier is missing: ${scriptName}`;
    failures.push(summary);
    return { id: 'target-release', status: 'environment_failure', summary, version: null, targets: [], failures: [] };
  }
  const child = spawnSync(process.execPath, [script, root, '--level', 'submit', '--json'], {
    cwd: engineProfile.engineRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  let report = null;
  try { report = JSON.parse(child.stdout || ''); } catch {}
  const status = child.error || !report || child.status === 2
    ? 'environment_failure'
    : child.status === 0 && report.ok === true ? 'passed' : 'failed';
  const reportFailures = Array.isArray(report?.failures) ? report.failures.slice(0, 20).map(item => ({
    code: String(item?.code || 'PLATFORM_RELEASE').slice(0, 120),
    message: String(item?.message || '').slice(0, 500),
    target: item?.target ? String(item.target).slice(0, 80) : null,
  })) : [];
  const summary = status === 'passed'
    ? `all ${report.targets.length} selected storefronts are submit-ready at ${report.version}`
    : reportFailures.slice(0, 3).map(item => `${item.target ? `${item.target}: ` : ''}${item.message}`).filter(Boolean).join('; ')
      || String(child.error?.message || child.stderr || 'storefront verifier returned invalid output').trim();
  const normalized = {
    id: 'target-release',
    status,
    summary: String(summary).slice(0, 1000),
    version: report?.version || null,
    level: report?.level || 'submit',
    targets: Array.isArray(report?.targets) ? report.targets.slice(0, 32).map(item => ({
      target: item.target,
      version: item.version,
      artifactFamily: item.artifactFamily,
      readiness: item.readiness,
      candidate: item.candidate,
    })) : [],
    failures: reportFailures,
  };
  if (status !== 'passed') failures.push(`Storefront release verifier ${status}: ${normalized.summary}`);
  return normalized;
}

function runProjectCheck(id, root, contract, evidence, failures, engineSupport, engineProfile, engineVerification, platformVerification) {
  if (id === 'phase-1-integrity') validatePhase1(root, evidence, failures);
  else if (id.startsWith('engine-') && engineSupport && !engineSupport.supported) failures.push(engineSupport.message);
  else if (id === 'non-placeholder-evidence') checkNonPlaceholderEvidence(root, contract, failures);
  else if (id === 'implementation-source' && !hasImplementationSource(root)) failures.push(`Phase ${contract.phase} requires real implementation source`);
  else if (id === 'clean-playtest-report') checkCleanPlaytestReport(root, failures);
  else if (id === 'web-playtest-proof') checkWebPlaytestProof(root, failures);
  else if (id === 'web-playtest-tech') checkWebPlaytestProof(root, failures, { requireTech: true });
  else if (id === 'visual-integration') {
    if (engineProfile?.engine === 'godot') checkGodotVisualIntegration(root, failures);
    else checkVisualIntegration(root, failures);
  }
  else if (id === 'phase-4-visual-evidence') checkPhase4VisualEvidence(root, failures);
  else if (id === 'screen-flow-contract') checkScreenFlow(root, failures);
  else if (id === 'tech-runtime') checkTechRuntime(root, failures);
  else if (id === 'godot-native-tech' && engineProfile?.engine === 'godot' && engineVerification?.id !== 'native-tech') failures.push('Phase 5 requires the installed native Godot tech verifier');
  else if (id === 'godot-native-playtest' && engineProfile?.engine === 'godot' && engineVerification?.id !== 'native-playtest') failures.push('Phase 7 requires the installed two-process native Godot playtest');
  else if (id === 'godot-native-release' && engineProfile?.engine === 'godot' && engineVerification?.id !== 'native-release') failures.push('Phase 8 requires independent verification of the current immutable Godot release');
  else if (id === 'listing-output') checkListingOutput(root, failures, engineProfile);
  else if (id === 'clean-local-stage-report') checkCleanLocalStageReport(root, failures);
  else if (id === 'release-green-report') checkReleaseGreenReport(root, failures);
  else if (id === 'release-artifacts') checkReleaseArtifacts(root, failures);
  else if (id === 'target-release-contract' && platformVerification?.status !== 'passed') {
    failures.push('Phase 8 requires every explicitly selected storefront to pass the installed submit-level release verifier');
  }
  else if (id === 'live-metrics') checkLiveMetrics(root, failures);
}

export function validatePhaseCompletion({ root = process.cwd(), phase, evidence = [] } = {}) {
  const projectRoot = path.resolve(root);
  const failures = [];
  let engineProfile = null;
  let engineSupport = null;
  let engineVerification = null;
  let platformVerification = null;
  try {
    engineProfile = readTrustedProjectEngine(projectRoot);
    engineSupport = enginePhaseSupport(engineProfile, phase);
  } catch (error) {
    failures.push(`Engine profile rejected (${error.code || 'ENGINE_PROFILE'}): ${error.message}`);
  }
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
    const requiredEvidenceReady = contract.requiredEvidence.every(requirement => {
      const rel = normalizeRelative(requirement.path);
      const file = safeProjectFile(projectRoot, rel);
      if (!evidenceSet.has(rel) || !file) return false;
      try { return fs.statSync(file.absolute).size >= requirement.minBytes; } catch { return false; }
    });
    if (requiredEvidenceReady && Number(contract.phase) === 3 && engineProfile?.engine === 'godot' && engineSupport?.supported) {
      engineVerification = runGodotConstructVerifier(projectRoot, engineProfile, failures);
    }
    if (requiredEvidenceReady && engineProfile?.engine === 'godot' && engineSupport?.supported) {
      if (Number(contract.phase) === 5) {
        engineVerification = runGodotInstalledVerifier(projectRoot, engineProfile, failures, {
          id: 'native-tech', scriptName: 'godot-tech-check.mjs', timeoutMs: 120_000,
        });
      } else if (Number(contract.phase) === 7) {
        engineVerification = runGodotInstalledVerifier(projectRoot, engineProfile, failures, {
          id: 'native-playtest', scriptName: 'godot-playtest.mjs', timeoutMs: 240_000,
        });
      } else if (Number(contract.phase) === 8) {
        engineVerification = runGodotInstalledVerifier(projectRoot, engineProfile, failures, {
          id: 'native-release', scriptName: 'godot-release-verify.mjs', timeoutMs: 180_000,
        });
        platformVerification = runPlatformReleaseVerifier(projectRoot, engineProfile, failures);
      }
    } else if (requiredEvidenceReady && Number(contract.phase) === 8 && engineProfile) {
      platformVerification = runPlatformReleaseVerifier(projectRoot, engineProfile, failures);
    }
    const browserOnlyChecks = new Set(['implementation-source', 'clean-playtest-report', 'web-playtest-proof', 'web-playtest-tech', 'tech-runtime', 'clean-local-stage-report']);
    for (const id of contract.projectChecks) {
      if (engineProfile?.implementation !== 'browser' && browserOnlyChecks.has(id)) continue;
      runProjectCheck(id, projectRoot, contract, normalizedEvidence, failures, engineSupport, engineProfile, engineVerification, platformVerification);
    }
  }
  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    evidence: normalizedEvidence,
    engine: engineProfile ? {
      engine: engineProfile.engine,
      source: engineProfile.source,
      status: engineProfile.status,
      implementation: engineProfile.implementation,
      capture: engineProfile.capture,
      capability: engineSupport?.capability || null,
      supported: engineSupport?.supported ?? false,
    } : null,
    engineVerification,
    platformVerification,
    contract: contract ? { schemaVersion: contract.schemaVersion, phase: contract.phase, name: contract.name, projectChecks: contract.projectChecks } : null,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'))) {
  const [rawPhase, ...evidence] = process.argv.slice(2);
  const result = validatePhaseCompletion({ phase: Number(rawPhase), evidence });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
