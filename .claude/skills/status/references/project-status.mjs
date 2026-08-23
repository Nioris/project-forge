#!/usr/bin/env node
/**
 * Project Forge phase-aware status snapshot (v4.67.1).
 * Read-only, dependency-free, cross-platform. It does NOT run browser/runtime/release tests.
 * Explicit wiki/phases/phase-N.json markers are authoritative when present; legacy projects
 * fall back to conservative artifact/code evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { summarizeForgeDiagnostics } from '../../../hooks/lib/forge-diagnostics.mjs';
import { listTaskRuns } from './execution-contract.mjs';

const PHASES = [
  [1, 'Analyze'], [2, 'Design'], [3, 'Construct'], [4, 'Visual'], [5, 'Tech'],
  [6, 'Listing'], [7, 'Test'], [8, 'Release'], [9, 'Live'],
];
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const rootArg = args.find(a => a !== '--json') || '.';
const root = path.resolve(rootArg);
const slash = p => p.replace(/\\/g, '/');
const rel = p => slash(path.relative(root, p));
const normRel = p => p ? (path.isAbsolute(p) ? rel(p) : slash(p)) : p;
const exists = p => fs.existsSync(path.join(root, p));
const stat = p => { try { return fs.statSync(p); } catch { return null; } };
const read = p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };
const globWalk = (baseRel, predicate = () => true, maxDepth = 6) => {
  const start = path.join(root, baseRel);
  const out = [];
  if (!fs.existsSync(start)) return out;
  const skip = new Set(['.git', 'node_modules', '.claude', '.agents', '.codex']);
  const walk = (p, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f, depth + 1);
      else if (e.isFile() && predicate(f)) out.push(f);
    }
  };
  walk(start, 0);
  return out;
};
const firstExisting = list => list.find(exists) || null;
const anyMatch = (files, re) => files.some(f => re.test(safeReadLimited(f)));
const safeReadLimited = (p, max = 1024 * 1024) => {
  try {
    const s = fs.statSync(p);
    if (s.size > max) return '';
    return fs.readFileSync(p, 'utf8');
  } catch { return ''; }
};
const newest = files => files.reduce((m, f) => Math.max(m, stat(f)?.mtimeMs || 0), 0);
const countFiles = (baseRel, predicate = () => true) => globWalk(baseRel, predicate).length;

let projectType = 'game';
const claude = read('CLAUDE.md');
const typeMatch = claude.match(/##\s*Project type\s*\r?\n\s*(game|app)\b/i);
if (typeMatch) projectType = typeMatch[1].toLowerCase();
else if (!exists('GameIntegration') && (exists('src') || exists('package.json'))) projectType = 'app';

let forgeVersion = null;
try { forgeVersion = JSON.parse(read('.forge-managed.json')).forgeVersion || null; } catch {}
const projectName = path.basename(root);

const sourceFiles = [
  ...globWalk('GameIntegration', f => /\.(html?|m?js|cjs|ts|tsx|jsx|css)$/i.test(f)),
  ...globWalk('WorkProgress', f => /\.(html?|m?js|cjs|ts|tsx|jsx|css)$/i.test(f)),
  ...globWalk('.', f => /\.(html?|m?js|cjs|ts|tsx|jsx|css)$/i.test(f), 2),
].filter((f, i, a) => a.indexOf(f) === i && !slash(f).includes('/Release/'));
const sourceText = sourceFiles.slice(0, 80).map(f => safeReadLimited(f, 512 * 1024)).join('\n');
const sourceMtime = newest(sourceFiles);
const wikiFiles = globWalk('wiki', f => /\.(md|json)$/i.test(f));
const wikiMtime = newest(wikiFiles);
const sessionFiles = globWalk('wiki/sessions', f => /\.md$/i.test(f));
const lastActivityMs = Math.max(newest(sessionFiles), sourceMtime, wikiMtime);
const wikiFresh = !sourceMtime || !wikiMtime || wikiMtime + 24 * 3600 * 1000 >= sourceMtime;

const analysisEvidence = firstExisting([
  'wiki/features/game-analysis.md', 'wiki/features/analysis.md', 'wiki/architecture/analysis.md',
]) || globWalk('WorkProgress', f => /ANALYSIS\.md$/i.test(f))[0] || null;
const metrics = firstExisting(['wiki/architecture/metrics.md', 'wiki/metrics.md']);
const brief = firstExisting(['wiki/design/brief.md']);
const gdd = firstExisting(projectType === 'game'
  ? ['wiki/design/gdd.md', 'wiki/features/game-design.md']
  : ['wiki/design/ia.md', 'wiki/design/data-model.md', 'wiki/design/design-system.md']);
const devPlan = firstExisting(['wiki/plan/02-development-plan.md']);
const designDocs = globWalk('wiki/design', f => /\.md$/i.test(f));
const artDirection = designDocs.find(f => /art-direction-|art-bible\.md$/i.test(path.basename(f))) || null;
const targetFrame = firstExisting(['wiki/design/target-frame.md']);
const setupGuide = globWalk('Release', f => /SETUP_GUIDE\.md$/i.test(f))[0] || firstExisting(['SETUP_GUIDE.md']);
const listingFiles = globWalk('Release', f => /store-listing-(ru|en)\.json$/i.test(f));
const builds = globWalk('Release', f => /\.zip$/i.test(f));
const qaReports = globWalk('wiki/qa', f => /\.(md|json)$/i.test(f));
const playtestReports = [
  ...globWalk('playtest-out', f => /report\.json$/i.test(f)),
  ...globWalk('WorkProgress', f => /playtest.*\.json$|report\.json$/i.test(f)),
];
const releaseReadyDocs = globWalk('wiki/plan', f => /release/i.test(path.basename(f)) && /\.md$/i.test(f));
const releaseReadyGreen = releaseReadyDocs.some(f => /TOTAL:\s*\d+\s+pass,\s*0\s+fail/i.test(safeReadLimited(f)));
const liveEvidence = [
  ...globWalk('wiki/decisions', f => /\.md$/i.test(f) && /ab|a-b|creative|ctr/i.test(path.basename(f))),
  ...globWalk('wiki', f => /metrics\.md$/i.test(f)),
].filter(f => /D7|D30|ctr_|conversion_to_play|rating/i.test(safeReadLimited(f)));

const aiConfig = exists('.forge-ai.json');
const styleBiblePath = firstExisting(['assets/style/STYLE-BIBLE.md']);
const styleBibleText = styleBiblePath ? read(styleBiblePath) : '';
const styleBibleState = !styleBiblePath ? 'missing' : (/status\s*:\s*draft|\bdraft\b/i.test(styleBibleText) ? 'draft' : 'present');
const promptCount = countFiles('assets/prompts', f => /\.(json|md|txt)$/i.test(f));
const candidateCount = countFiles('assets/generated/candidates', f => !/\.gitkeep$/i.test(f));
const approvedCount = countFiles('assets/generated/approved', f => !/\.gitkeep$/i.test(f));
const provenanceText = read('assets/generated/provenance.jsonl');
const provenanceCount = provenanceText ? provenanceText.split(/\r?\n/).filter(Boolean).length : 0;
const artReviewCount = countFiles('wiki/ai/art-reviews', f => /\.(md|json)$/i.test(f));
const visualQaCount = qaReports.filter(f => /visual/i.test(path.basename(f)) || /visual qa/i.test(safeReadLimited(f))).length;

const debugCandidates = ['debugcheck.js', 'templates/html5/debugcheck.js'];
let debugcheckVersion = null;
for (const d of debugCandidates) {
  const m = read(d).match(/Debug Checker v([\d.]+)/i);
  if (m) { debugcheckVersion = m[1]; break; }
}

const health = {
  viewport: /<meta[^>]+name=["']viewport["']/i.test(sourceText),
  touchAction: /touch-action\s*:/i.test(sourceText),
  yandexInit: /YaGames\.init\s*\(/.test(sourceText),
  loadingReady: /LoadingAPI[^\n]{0,100}ready\s*\(|LoadingAPI\.ready\s*\(/.test(sourceText),
  i18nRuntime: /environment\.i18n|detectLang|resolveGameLanguage/.test(sourceText),
  localizationArchitecture: /\bI18N\b|\bt\s*\(|data-i18n/.test(sourceText),
  debugcheckVersion,
  builds: builds.length,
  setupGuide: Boolean(setupGuide),
  storeListing: listingFiles.length,
  qaReports: qaReports.length,
};

const fallback = {
  1: { complete: Boolean(analysisEvidence && metrics), partial: Boolean(analysisEvidence || metrics), evidence: [analysisEvidence, metrics, brief].filter(Boolean).map(normRel) },
  2: { complete: Boolean(gdd && devPlan), partial: Boolean(gdd || devPlan || designDocs.length >= 3), evidence: [gdd, devPlan].filter(Boolean).map(normRel) },
  3: { complete: Boolean(artDirection && devPlan && sourceMtime > (stat(path.join(root, devPlan || ''))?.mtimeMs || 0)), partial: Boolean(devPlan && sourceMtime), evidence: [devPlan, ...playtestReports.slice(0, 2)].filter(Boolean).map(normRel) },
  4: { complete: Boolean(artDirection && (targetFrame || styleBibleState === 'present') && (approvedCount > 0 || sourceMtime > (stat(artDirection)?.mtimeMs || 0))), partial: Boolean(artDirection || targetFrame || approvedCount || promptCount), evidence: [artDirection, targetFrame].filter(Boolean).map(normRel) },
  5: { complete: health.viewport && health.touchAction && health.yandexInit && health.loadingReady && health.i18nRuntime, partial: health.viewport || health.touchAction || health.yandexInit || health.loadingReady || health.i18nRuntime, evidence: [] },
  6: { complete: Boolean(setupGuide && listingFiles.length && health.localizationArchitecture), partial: Boolean(setupGuide || listingFiles.length || health.localizationArchitecture), evidence: [setupGuide, ...listingFiles.slice(0, 2)].filter(Boolean).map(normRel) },
  7: { complete: Boolean(playtestReports.length && qaReports.length), partial: Boolean(playtestReports.length || qaReports.length), evidence: [...playtestReports.slice(0, 2), ...qaReports.slice(0, 2)].map(normRel) },
  8: { complete: Boolean(builds.length && setupGuide && releaseReadyGreen), partial: Boolean(builds.length || releaseReadyDocs.length), evidence: [...builds.slice(0, 2), ...releaseReadyDocs.slice(0, 2)].map(normRel) },
  9: { complete: false, partial: Boolean(liveEvidence.length || (builds.length && exists('wiki/deploy-log.md'))), evidence: liveEvidence.slice(0, 3).map(normRel) },
};

const explicit = new Map();
for (const [n, name] of PHASES) {
  const p = path.join(root, 'wiki', 'phases', `phase-${n}.json`);
  try {
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Number(r.phase) === n && ['in_progress', 'blocked', 'complete', 'ongoing'].includes(r.state)) explicit.set(n, r);
  } catch {}
}

const warnings = [];
const phaseRows = [];
const markerManaged = explicit.size > 0;
let currentPhase = 1;
let foundCurrent = false;
for (const [n, name] of PHASES) {
  const marker = explicit.get(n);
  const artifactState = fallback[n].complete ? (n === 9 ? 'ongoing' : 'complete')
    : fallback[n].partial ? 'partial' : 'pending';
  let state;
  let source = marker ? 'marker' : markerManaged ? 'marker-absent' : 'inferred';
  let reason = marker?.reason || null;
  const ev = marker?.evidence?.length ? marker.evidence : fallback[n].evidence;
  if (marker) state = marker.state;
  else if (markerManaged) state = 'pending';
  else state = artifactState;

  if (!foundCurrent && !['complete'].includes(state)) {
    currentPhase = n;
    foundCurrent = true;
  }
  phaseRows.push({ phase: n, name, state, source, reason, evidence: ev, artifactState });
}
if (!foundCurrent) currentPhase = 9;

// Do not report future-phase absences as defects. They are simply not reached yet.
for (const row of phaseRows) {
  if (row.phase > currentPhase && row.state === 'pending') row.state = 'not_reached';
  const artifactAheadOfGate = row.source === 'marker-absent'
    && ['partial', 'complete', 'ongoing'].includes(row.artifactState);
  if (row.phase > currentPhase && (['partial', 'complete', 'ongoing'].includes(row.state) || artifactAheadOfGate)) {
    warnings.push(`Phase ${row.phase} ${row.name} has downstream evidence while current phase is ${currentPhase}; keep the earlier gate authoritative.`);
    row.aheadOfGate = true;
  }
}

const currentRow = phaseRows.find(x => x.phase === currentPhase);
const diagnostics = summarizeForgeDiagnostics(root);
const taskRuns = listTaskRuns(root);
const activeTaskRun = taskRuns.find(run => ['running', 'waiting', 'blocked'].includes(run.task.status)) || null;
const latestTaskRun = taskRuns[0] || null;
let stopPoint = currentRow?.reason || null;
const currentWiki = read('wiki/_current.md');
if (!stopPoint && currentWiki) {
  const lines = currentWiki.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const stopLine = [...lines].reverse().find(s => /STOP|жд[её]м утверж|await|approval|утверд/i.test(s));
  if (stopLine) stopPoint = stopLine.slice(0, 500);
}

const result = {
  schemaVersion: 1,
  project: projectName,
  projectType,
  forgeVersion,
  currentPhase,
  currentPhaseName: currentRow?.name || null,
  currentState: currentRow?.state || null,
  stopPoint,
  lastActivity: lastActivityMs ? new Date(lastActivityMs).toISOString() : null,
  wikiFresh: wikiFresh ? 'fresh' : 'stale',
  phases: phaseRows,
  aiStudio: {
    activeFromPhase: 2,
    productionFromPhase: 4,
    config: aiConfig,
    styleBible: styleBibleState,
    promptPacks: promptCount,
    candidates: candidateCount,
    approved: approvedCount,
    provenance: provenanceCount,
    artReviews: artReviewCount,
    visualQaReports: visualQaCount,
  },
  health,
  diagnostics: {
    open: diagnostics.open.length,
    counts: diagnostics.counts,
    parseErrors: diagnostics.parseErrors.length,
    latest: diagnostics.open[0] || null,
  },
  execution: {
    activeTask: activeTaskRun ? {
      id: activeTaskRun.task.id,
      mode: activeTaskRun.task.mode,
      phase: activeTaskRun.task.phase,
      status: activeTaskRun.task.status,
      currentNode: activeTaskRun.state.currentNode,
      goal: activeTaskRun.task.goal,
      verifiers: activeTaskRun.task.verifiers,
      verificationTarget: activeTaskRun.task.verificationTarget || '.',
    } : null,
    latestResult: latestTaskRun?.lastResult ? {
      taskId: latestTaskRun.task.id,
      status: latestTaskRun.lastResult.status,
      code: latestTaskRun.lastResult.code,
      failureType: latestTaskRun.lastResult.failure?.type || null,
      verificationStatus: latestTaskRun.lastResult.verification?.status || null,
      verifierCount: latestTaskRun.lastResult.verification?.items?.length || 0,
      createdAt: latestTaskRun.lastResult.createdAt,
    } : null,
    source: '.forge/runs (supplemental; never phase progression)',
  },
  sources: {
    phaseMarkers: explicit.size,
    artifactFacts: true,
    wikiCurrent: exists('wiki/_current.md') ? 'supplemental' : 'missing',
    claudeState: 'ignored-for-progress',
  },
  warnings,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
const icon = s => s === 'complete' ? '[OK]' : s === 'blocked' ? '[BLOCKED]' : s === 'in_progress' || s === 'partial' ? '[..]' : s === 'ongoing' ? '[LIVE]' : '[ ]';
console.log(`Project Forge status snapshot: ${projectName}`);
console.log(`Forge: ${forgeVersion || 'unknown'} | type: ${projectType} | current: Phase ${currentPhase} ${currentRow?.name || ''} (${currentRow?.state || 'unknown'})`);
for (const p of phaseRows) console.log(`${icon(p.state)} ${p.phase} ${p.name}${p.source === 'marker' ? ' [marker]' : ''}`);
console.log(`AI Studio: config=${aiConfig ? 'yes' : 'no'} style=${styleBibleState} prompts=${promptCount} approved=${approvedCount} visualQA=${visualQaCount}`);
console.log(`Health: viewport=${health.viewport} touch=${health.touchAction} sdkInit=${health.yandexInit} ready=${health.loadingReady} i18n=${health.i18nRuntime} builds=${health.builds}`);
console.log(`Forge diagnostics: open=${diagnostics.open.length} critical=${diagnostics.counts.critical} error=${diagnostics.counts.error} warn=${diagnostics.counts.warn} parseErrors=${diagnostics.parseErrors.length}`);
if (activeTaskRun) console.log(`Task: ${activeTaskRun.task.id} mode=${activeTaskRun.task.mode} node=${activeTaskRun.state.currentNode} status=${activeTaskRun.task.status} verifiers=${activeTaskRun.task.verifiers.join(',') || 'none'}`);
if (latestTaskRun?.lastResult?.verification) console.log(`Task verification: ${latestTaskRun.lastResult.verification.status} checks=${latestTaskRun.lastResult.verification.items.length}`);
if (stopPoint) console.log(`STOP: ${stopPoint}`);
for (const w of warnings) console.log(`WARN: ${w}`);
