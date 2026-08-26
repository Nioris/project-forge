/**
 * Privacy-bounded Project Forge release telemetry.
 *
 * The collector derives what Forge can prove from durable phase markers, Task/RunResult history,
 * Codex cost reports and structured visual evidence. External facts (provider invoices and store
 * moderation outcomes) enter through a bounded append-only event ledger; they are never guessed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PRODUCT_TELEMETRY_SCHEMA_VERSION = 1;
const EVENT_TYPES = new Set(['ai_cost', 'moderation', 'defect', 'repair', 'manual_step', 'release']);
const FAILURE_RESULTS = new Set(['retryable_failure', 'blocked']);
const INFRA_RESULTS = new Set(['environment_failure', 'provider_failure']);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function iso(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function within(at, start, end) {
  const value = Date.parse(at || '');
  return Number.isFinite(value) && (!start || value >= Date.parse(start)) && (!end || value <= Date.parse(end));
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function safeId(value, label = 'id') {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(text)) throw new Error(`${label} must use only letters, digits, dot, underscore or dash`);
  return text;
}

function safeText(value, label, max = 160) {
  const text = String(value || '').trim();
  if (!text || text.length > max || /[\r\n\u0000]/.test(text)) throw new Error(`${label} must be a single bounded line`);
  return text;
}

function metricsDir(root) { return path.join(path.resolve(root), '.forge', 'metrics'); }

function ensureLocalExclude(root) {
  try {
    const dotGit = path.join(path.resolve(root), '.git');
    if (!fs.existsSync(dotGit)) return;
    let gitDir = dotGit;
    if (fs.statSync(dotGit).isFile()) {
      const match = /^gitdir:\s*(.+)$/i.exec(fs.readFileSync(dotGit, 'utf8').trim());
      if (!match) return;
      gitDir = path.resolve(root, match[1]);
      const commonDirFile = path.join(gitDir, 'commondir');
      if (fs.existsSync(commonDirFile)) {
        gitDir = path.resolve(gitDir, fs.readFileSync(commonDirFile, 'utf8').trim());
      }
    }
    const info = path.join(gitDir, 'info');
    const target = path.join(info, 'exclude');
    fs.mkdirSync(info, { recursive: true });
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (!current.split(/\r?\n/).includes('.forge/metrics/')) {
      fs.appendFileSync(target, `${current && !current.endsWith('\n') ? '\n' : ''}# Project Forge local product telemetry\n.forge/metrics/\n`, 'utf8');
    }
  } catch {}
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function phaseMarkers(root) {
  const result = [];
  for (let phase = 1; phase <= 9; phase++) {
    const marker = readJson(path.join(root, 'wiki', 'phases', `phase-${phase}.json`));
    if (marker && Number(marker.phase) === phase) result.push(marker);
  }
  return result;
}

function taskRuns(root) {
  const dir = path.join(root, '.forge', 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => readJson(path.join(dir, entry.name)))
    .filter(run => run?.schemaVersion === 1 && run.task && Array.isArray(run.events));
}

function costReports(root) {
  const dir = path.join(root, 'wiki', 'diagnostics', 'codex-cost');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(name => /^phase-\d+-.*\.json$/.test(name) && !/-latest\.json$/.test(name));
  const history = files.map(name => readJson(path.join(dir, name))).filter(Boolean);
  if (history.length) return history;
  return fs.readdirSync(dir).filter(name => /^phase-\d+-latest\.json$/.test(name))
    .map(name => readJson(path.join(dir, name))).filter(Boolean);
}

function exactKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => allowed.includes(key));
}

function validStoredEvent(event) {
  try {
    if (!exactKeys(event, ['schemaVersion', 'id', 'type', 'at', 'releaseId', 'data'])
      || event.schemaVersion !== 1 || !EVENT_TYPES.has(event.type) || !iso(event.at)) return false;
    safeId(event.id, 'event id');
    if (event.releaseId != null) safeId(event.releaseId, 'release id');
    const data = event.data;
    if (event.type === 'ai_cost') {
      if (!exactKeys(data, ['usd', 'provider', 'model', 'scope', 'source'])
        || !Number.isFinite(Number(data.usd)) || Number(data.usd) < 0 || Number(data.usd) > 1_000_000
        || !['request', 'phase', 'release-total'].includes(data.scope)
        || !['api', 'invoice', 'manual'].includes(data.source)) return false;
      safeText(data.provider, 'provider', 80);
      if (data.model != null) safeText(data.model, 'model', 120);
    } else if (event.type === 'moderation') {
      if (!exactKeys(data, ['platform', 'status', 'attemptId'])
        || !['submitted', 'passed', 'rejected'].includes(data.status)) return false;
      safeText(data.platform, 'platform', 80);
      safeId(data.attemptId, 'attempt id');
    } else if (event.type === 'defect') {
      if (!exactKeys(data, ['severity', 'stage', 'fingerprint', 'source'])
        || !['critical', 'major', 'minor', 'unclassified'].includes(data.severity)
        || !['pre_release', 'post_release'].includes(data.stage)) return false;
      safeText(data.fingerprint, 'defect fingerprint', 160);
      safeText(data.source, 'defect source', 80);
    } else if (event.type === 'repair') {
      if (!exactKeys(data, ['category', 'code', 'fingerprint'])
        || !['product', 'infrastructure'].includes(data.category)) return false;
      safeId(data.code, 'repair code');
      safeId(data.fingerprint, 'repair fingerprint');
    } else if (event.type === 'manual_step') {
      if (!exactKeys(data, ['count', 'category']) || !Number.isInteger(data.count)
        || data.count < 1 || data.count > 1000) return false;
      safeText(data.category, 'manual category', 80);
    } else {
      if (!event.releaseId || !exactKeys(data, ['releasedAt', 'cycleStartedAt', 'version', 'forgeVersion'])
        || !iso(data.releasedAt) || (data.cycleStartedAt != null && !iso(data.cycleStartedAt))) return false;
      if (data.version != null) safeText(data.version, 'release version', 80);
      if (data.forgeVersion != null) safeText(data.forgeVersion, 'Forge version', 40);
    }
    return true;
  } catch { return false; }
}

function readEvents(root) {
  const file = path.join(metricsDir(root), 'events.jsonl');
  if (!fs.existsSync(file)) return { events: [], invalid: 0 };
  const events = [];
  let invalid = 0;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (!validStoredEvent(event)) throw new Error('invalid event');
      events.push(event);
    } catch { invalid++; }
  }
  return { events, invalid };
}

function releaseDescriptor(root, markers, events, now) {
  const phaseOne = markers.find(item => Number(item.phase) === 1);
  const phaseEight = markers.find(item => Number(item.phase) === 8);
  const explicit = events.filter(event => event.type === 'release').sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
  const releasedAt = iso(explicit?.data?.releasedAt) || (phaseEight?.state === 'complete' ? iso(phaseEight.completedAt) : null);
  const cycleStartedAt = iso(explicit?.data?.cycleStartedAt) || iso(phaseOne?.startedAt)
    || markers.map(item => iso(item.startedAt)).filter(Boolean).sort()[0] || null;
  const forgeVersion = explicit?.data?.forgeVersion || phaseEight?.forgeVersion
    || markers.slice().sort((a, b) => Number(b.phase) - Number(a.phase)).find(item => item.forgeVersion)?.forgeVersion || null;
  const checkpoint = readJson(path.join(root, '.forge', 'git-checkpoints.json'))?.phases?.['8'] || null;
  const suffix = releasedAt ? releasedAt.replace(/\D/g, '').slice(0, 14) : 'current';
  const id = explicit?.releaseId || `release-${suffix}${checkpoint?.commit ? `-${String(checkpoint.commit).slice(0, 12)}` : ''}`;
  return {
    id: safeId(id, 'release id'),
    version: explicit?.data?.version || null,
    status: releasedAt ? 'released' : 'in_progress',
    cycleStartedAt,
    releasedAt,
    forgeVersion,
    gitCommit: checkpoint?.commit || null,
    privateRemotePublished: checkpoint?.pushed === true,
    measuredThrough: releasedAt || now,
  };
}

function pairedWaitMs(events, start, end, kind) {
  const opens = kind === 'user' ? new Set(['user_decision_required']) : INFRA_RESULTS;
  const closes = kind === 'user' ? event => event.code === 'USER_DECISION_RECEIVED' : event => event.code === 'PHASE_STARTED' || event.code === 'PHASE_REOPENED';
  let opened = null;
  let total = 0;
  for (const event of events.filter(item => within(item.at, start, end)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (!opened && opens.has(event.result)) opened = Date.parse(event.at);
    else if (opened && closes(event)) {
      total += Math.max(0, Date.parse(event.at) - opened);
      opened = null;
    }
  }
  if (opened && end) total += Math.max(0, Date.parse(end) - opened);
  return total;
}

function collectTiming(markers, runEvents, release) {
  const end = release.measuredThrough;
  const leadTimeMs = release.cycleStartedAt && release.releasedAt
    ? Math.max(0, Date.parse(release.releasedAt) - Date.parse(release.cycleStartedAt)) : null;
  let recordedPhaseSpanMs = 0;
  let phaseSpanCount = 0;
  for (const marker of markers) {
    const started = iso(marker.startedAt);
    const completed = iso(marker.completedAt) || (marker.state === 'in_progress' ? end : null);
    if (started && completed && within(started, release.cycleStartedAt, end)) {
      recordedPhaseSpanMs += Math.max(0, Date.parse(completed) - Date.parse(started));
      phaseSpanCount++;
    }
  }
  const userDecisionWaitMs = pairedWaitMs(runEvents, release.cycleStartedAt, end, 'user');
  const infrastructureWaitMs = pairedWaitMs(runEvents, release.cycleStartedAt, end, 'infrastructure');
  return {
    leadTimeMs,
    recordedPhaseSpanMs,
    trackedActiveMs: Math.max(0, recordedPhaseSpanMs - userDecisionWaitMs - infrastructureWaitMs),
    userDecisionWaitMs,
    infrastructureWaitMs,
    phaseSpanCount,
    definition: {
      leadTime: 'Phase 1 start to first Phase 8 completion; includes calendar gaps.',
      trackedActive: 'Recorded phase spans minus paired user-decision and infrastructure waits; excludes gaps between phases.',
    },
  };
}

function collectRepairs(runEvents, visualEvidence, metricEvents, start, end) {
  let product = 0;
  let infrastructure = 0;
  const codes = {};
  for (const event of runEvents.filter(item => within(item.at, start, end))) {
    if (FAILURE_RESULTS.has(event.result)) product++;
    else if (INFRA_RESULTS.has(event.result)) infrastructure++;
    else continue;
    const code = String(event.code || 'UNKNOWN');
    codes[code] = (codes[code] || 0) + 1;
  }
  const recordedRepairs = new Map(metricEvents.filter(event => event.type === 'repair' && within(event.at, start, end))
    .map(event => [event.data.fingerprint, event]));
  for (const event of recordedRepairs.values()) {
    if (event.data.category === 'infrastructure') infrastructure++;
    else product++;
    const code = String(event.data.code || 'RECORDED_REPAIR');
    codes[code] = (codes[code] || 0) + 1;
  }
  const recordedVisualRejects = [...recordedRepairs.values()].filter(event => event.data.code === 'PHASE4_VISUAL_REJECT').length;
  const visualReviewRejects = recordedVisualRejects || (
    visualEvidence?.verdict === 'reject' && within(visualEvidence.reviewedAt, start, end) ? 1 : 0
  );
  if (!recordedVisualRejects && visualReviewRejects) product++;
  return {
    total: product + infrastructure,
    product,
    infrastructure,
    visualReviewRejects,
    codes,
    definition: 'Failed/rejected workflow outcomes that require another implementation or infrastructure attempt; user approvals are excluded.',
  };
}

function defectKey(defect) {
  return crypto.createHash('sha256').update(`${defect.severity || 'unclassified'}\0${String(defect.summary || defect.message || '').trim().toLowerCase()}`).digest('hex').slice(0, 20);
}

function verificationIssueFingerprint(item, issue) {
  return crypto.createHash('sha256').update(`${item.id || ''}\0${issue.file || ''}\0${issue.line || ''}\0${issue.rule || ''}\0${issue.message || ''}`).digest('hex').slice(0, 20);
}

function reviewDefectFingerprint(severity, summary) {
  return crypto.createHash('sha256').update(`${severity}\0${summary}`).digest('hex').slice(0, 20);
}

function collectDefects(runs, visualEvidence, events, start, end) {
  const defects = [];
  for (const run of runs) {
    for (const event of run.events || []) {
      if (!within(event.at, start, end)) continue;
      for (const fingerprint of event.defectFingerprints || []) {
        defects.push({ severity: 'unclassified', summary: fingerprint, source: 'task-verifier-history' });
      }
    }
    const result = run.lastResult;
    if (!within(result?.createdAt, start, end)) continue;
    for (const item of result?.verification?.items || []) {
      for (const issue of item.issues || []) defects.push({
        severity: 'unclassified', summary: verificationIssueFingerprint(item, issue), source: `verifier:${item.id}`,
      });
    }
  }
  if (within(visualEvidence?.reviewedAt, start, end)) {
    for (const review of visualEvidence?.reviews || []) for (const defect of review.defects || []) {
      const severity = defect.severity || 'unclassified';
      defects.push({ severity, summary: reviewDefectFingerprint(severity, defect.summary), source: 'phase-4-review' });
    }
    for (const defect of visualEvidence?.proofReview?.defects || []) {
      const severity = defect.severity || 'unclassified';
      defects.push({ severity, summary: reviewDefectFingerprint(severity, defect.summary), source: 'phase-4-proof-review' });
    }
  }
  for (const event of events.filter(item => item.type === 'defect' && item.data?.stage === 'pre_release' && within(item.at, start, end))) {
    defects.push({ severity: event.data.severity || 'unclassified', summary: event.data.fingerprint, source: event.data.source });
  }
  const unique = new Map(defects.filter(item => item.summary).map(item => [defectKey(item), item]));
  const severity = { critical: 0, major: 0, minor: 0, unclassified: 0 };
  for (const defect of unique.values()) severity[defect.severity in severity ? defect.severity : 'unclassified']++;
  return {
    preRelease: unique.size,
    severity,
    structuredSources: [...new Set([...unique.values()].map(item => item.source))].sort(),
    definition: 'Unique structured verifier/reviewer defects detected before release; prose reports are never scraped for numbers.',
  };
}

function pricing(root) {
  const value = readJson(path.join(metricsDir(root), 'pricing.json'));
  return value?.schemaVersion === 1 && value.currency === 'USD' && value.models && typeof value.models === 'object' ? value : null;
}

function estimateReportCost(report, catalog) {
  const models = report.policy?.actualModels?.length ? report.policy.actualModels : [report.policy?.expectedModel].filter(Boolean);
  if (!catalog || models.length !== 1) return null;
  const price = catalog.models[models[0]];
  if (!price) return null;
  const input = finite(report.tokens?.input);
  const cached = finite(report.tokens?.cachedInput);
  const output = finite(report.tokens?.output);
  if (cached > 0 && !Number.isFinite(Number(price.cachedInputPerMillion))) return null;
  if (!Number.isFinite(Number(price.inputPerMillion)) || !Number.isFinite(Number(price.outputPerMillion))) return null;
  return ((Math.max(0, input - cached) * Number(price.inputPerMillion))
    + (cached * Number(price.cachedInputPerMillion || 0))
    + (output * Number(price.outputPerMillion))) / 1_000_000;
}

function collectAi(root, reports, events, releaseId, start, end) {
  // A phase cost report is written after the phase process exits, so its generatedAt may be a few
  // seconds later than Phase 8 completedAt. Attribute it by the measured phase start, not by that
  // bookkeeping timestamp.
  const scopedReports = reports.filter(report => within(
    report.timing?.startedAt || report.generatedAt || report.timing?.completedAt, start, end,
  ));
  const tokens = { input: 0, cachedInput: 0, output: 0, reasoningOutput: 0 };
  let exactFromReports = 0;
  let exactReportCount = 0;
  let estimatedUsd = 0;
  let estimatedReports = 0;
  const catalog = pricing(root);
  for (const report of scopedReports) {
    for (const key of Object.keys(tokens)) tokens[key] += finite(report.tokens?.[key]);
    const exact = Number(report.billing?.costUsd ?? report.cost?.totalUsd);
    if (Number.isFinite(exact) && exact >= 0) { exactFromReports += exact; exactReportCount++; }
    else {
      const estimate = estimateReportCost(report, catalog);
      if (estimate != null) { estimatedUsd += estimate; estimatedReports++; }
    }
  }
  const costEvents = events.filter(event => event.type === 'ai_cost'
    && (event.releaseId === releaseId || (!event.releaseId && within(event.at, start, end))));
  const exactEventsUsd = costEvents.reduce((sum, event) => sum + finite(event.data?.usd), 0);
  const releaseTotal = costEvents.filter(event => event.data?.scope === 'release-total').sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const allReportsPriced = scopedReports.length > 0 && exactReportCount + estimatedReports === scopedReports.length;
  let headlineUsd = null;
  let basis = 'unknown';
  if (releaseTotal) { headlineUsd = finite(releaseTotal.data.usd); basis = 'exact'; }
  else if (exactReportCount === scopedReports.length && scopedReports.length > 0) { headlineUsd = exactFromReports; basis = 'exact'; }
  else if (allReportsPriced) { headlineUsd = exactFromReports + estimatedUsd; basis = 'estimated'; }
  else if (exactEventsUsd > 0 || exactFromReports > 0 || estimatedUsd > 0) basis = 'partial';
  return {
    reports: scopedReports.length,
    tokens,
    costUsd: round(headlineUsd),
    costBasis: basis,
    // Exact request events and provider reports can describe the same calls. Pick one
    // complete source instead of adding them and silently double-counting spend.
    reportedExactUsd: round(releaseTotal
      ? finite(releaseTotal.data.usd)
      : (exactFromReports > 0 ? exactFromReports : exactEventsUsd)),
    estimatedUsd: round(estimatedUsd),
    pricedReports: exactReportCount + estimatedReports,
    pricingCoveragePct: scopedReports.length ? round(((exactReportCount + estimatedReports) / scopedReports.length) * 100, 2) : null,
    definition: 'Exact API receipts/invoices win. Token prices produce an estimate only with complete local USD pricing; otherwise cost stays partial/unknown.',
  };
}

function collectModeration(events, releaseId, start, end) {
  const moderation = events.filter(event => event.type === 'moderation'
    && (event.releaseId === releaseId || (!event.releaseId && within(event.at, start, end))));
  const attempts = new Map();
  for (const event of moderation.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const id = event.data.attemptId || `${event.data.platform}-default`;
    const key = `${event.data.platform}\0${id}`;
    if (!attempts.has(key)) attempts.set(key, {
      platform: event.data.platform, attemptId: id, submitted: false, outcome: null, firstAt: event.at,
    });
    const attempt = attempts.get(key);
    if (event.data.status === 'submitted') attempt.submitted = true;
    else attempt.outcome = event.data.status;
  }
  const ordered = [...attempts.values()].sort((a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt));
  const terminal = ordered.filter(item => item.outcome);
  const byPlatform = new Map();
  for (const attempt of ordered) {
    if (!byPlatform.has(attempt.platform)) byPlatform.set(attempt.platform, []);
    byPlatform.get(attempt.platform).push(attempt);
  }
  const platformOutcomes = [...byPlatform.values()].map(platformAttempts => {
    const first = platformAttempts[0];
    return {
      firstPass: first.outcome ? first.outcome === 'passed' : null,
      eventualPass: platformAttempts.some(item => item.outcome === 'passed')
        ? true
        : platformAttempts.some(item => !item.outcome) ? null : false,
    };
  });
  const firstPass = platformOutcomes.some(item => item.firstPass === false)
    ? false
    : platformOutcomes.length && platformOutcomes.every(item => item.firstPass === true) ? true : null;
  const eventualPass = platformOutcomes.some(item => item.eventualPass === false)
    ? false
    : platformOutcomes.length && platformOutcomes.every(item => item.eventualPass === true) ? true : null;
  return {
    attempts: attempts.size,
    decidedAttempts: terminal.length,
    passed: terminal.filter(item => item.outcome === 'passed').length,
    rejected: terminal.filter(item => item.outcome === 'rejected').length,
    firstPass,
    eventualPass,
    platforms: [...new Set([...attempts.values()].map(item => item.platform))].sort(),
    definition: 'A release passes moderation only when every recorded platform passes; first-attempt and unresolved platform outcomes remain explicit.',
  };
}

function collectAutomation(runEvents, events, start, end) {
  const scoped = runEvents.filter(item => within(item.at, start, end) && item.event === 'run_result');
  const manualDecisions = scoped.filter(item => item.code === 'USER_DECISION_RECEIVED').length;
  const manualOverrides = events.filter(item => item.type === 'manual_step' && within(item.at, start, end))
    .reduce((sum, event) => sum + Math.max(1, Math.floor(finite(event.data?.count, 1))), 0);
  const automatedTransitions = scoped.filter(item => item.result !== 'user_decision_required' && item.code !== 'USER_DECISION_RECEIVED').length;
  const manualTransitions = manualDecisions + manualOverrides;
  const tracked = automatedTransitions + manualTransitions;
  return {
    automatedTransitions,
    manualTransitions,
    percent: tracked ? round((automatedTransitions / tracked) * 100, 2) : null,
    basis: 'tracked workflow transitions',
    definition: 'Automated Task transitions divided by automated transitions plus user answers and explicitly recorded manual steps.',
  };
}

function flattenRunEvents(runs) {
  return runs.flatMap(run => run.events.map(event => ({ ...event, taskId: run.task.id, phase: run.task.phase })));
}

export function collectProductTelemetry(projectRoot, { now = new Date().toISOString() } = {}) {
  const root = path.resolve(projectRoot);
  const markers = phaseMarkers(root);
  const runs = taskRuns(root);
  const runEvents = flattenRunEvents(runs);
  const { events, invalid } = readEvents(root);
  const release = releaseDescriptor(root, markers, events, iso(now) || new Date().toISOString());
  const start = release.cycleStartedAt;
  const end = release.measuredThrough;
  const visualEvidence = readJson(path.join(root, 'wiki', 'qa', 'phase-4-visual-evidence.json'));
  const completedPhases = markers.filter(marker => marker.state === 'complete' || (Number(marker.phase) === 9 && marker.state === 'ongoing')).length;
  const report = {
    schemaVersion: PRODUCT_TELEMETRY_SCHEMA_VERSION,
    kind: 'forge.release-metrics',
    generatedAt: iso(now) || new Date().toISOString(),
    project: path.basename(root),
    release,
    workflow: {
      completedPhases,
      observedPhases: markers.length,
      engine: markers.slice().reverse().find(marker => marker.engineRuntime?.engine)?.engineRuntime?.engine || null,
      host: markers.slice().reverse().find(marker => marker.modelRuntime?.selection?.host)?.modelRuntime?.selection?.host || null,
    },
    time: collectTiming(markers, runEvents, release),
    ai: collectAi(root, costReports(root), events, release.id, start, end),
    repairs: collectRepairs(runEvents, visualEvidence, events, start, end),
    defects: collectDefects(runs, visualEvidence, events, start, end),
    moderation: collectModeration(events, release.id, start, end),
    automation: collectAutomation(runEvents, events, start, end),
    coverage: {
      timeToRelease: Boolean(release.cycleStartedAt && release.releasedAt),
      aiCost: null,
      repairs: runs.length > 0,
      defects: runs.length > 0 || Boolean(visualEvidence),
      moderation: events.some(event => event.type === 'moderation'),
      automation: runs.length > 0,
      invalidEventLines: invalid,
    },
    privacy: {
      localOnly: true,
      storesPrompts: false,
      storesMessages: false,
      storesSourceFiles: false,
      storesSecrets: false,
      storesAbsoluteProjectPath: false,
    },
  };
  report.coverage.aiCost = report.ai.costBasis !== 'unknown' && report.ai.costBasis !== 'partial';
  return report;
}

export function saveProductTelemetry(projectRoot, report = null) {
  const root = path.resolve(projectRoot);
  const value = report || collectProductTelemetry(root);
  const dir = metricsDir(root);
  ensureLocalExclude(root);
  atomicJson(path.join(dir, 'latest.json'), value);
  let releasePath = null;
  if (value.release.status === 'released') {
    releasePath = path.join(dir, 'releases', `${safeId(value.release.id, 'release id')}.json`);
    atomicJson(releasePath, value);
  }
  return { latestPath: path.join(dir, 'latest.json'), releasePath };
}

export function refreshProductTelemetry(projectRoot) {
  const report = collectProductTelemetry(projectRoot);
  const saved = saveProductTelemetry(projectRoot, report);
  return { report, ...saved };
}

export function appendProductTelemetryEvent(projectRoot, input) {
  const root = path.resolve(projectRoot);
  const type = String(input?.type || '').trim();
  if (!EVENT_TYPES.has(type)) throw new Error(`event type must be one of: ${[...EVENT_TYPES].join(', ')}`);
  const at = iso(input.at || new Date().toISOString());
  if (!at) throw new Error('event time must be an ISO date-time');
  const event = {
    schemaVersion: 1,
    id: safeId(input.id || `evt-${crypto.randomUUID()}`, 'event id'),
    type,
    at,
    releaseId: input.releaseId ? safeId(input.releaseId, 'release id') : null,
    data: {},
  };
  if (type === 'ai_cost') {
    const usd = Number(input.usd);
    if (!Number.isFinite(usd) || usd < 0 || usd > 1_000_000) throw new Error('ai_cost usd must be between 0 and 1000000');
    const scope = input.scope == null ? 'request' : input.scope;
    const source = input.source == null ? 'manual' : input.source;
    if (!['request', 'phase', 'release-total'].includes(scope)) throw new Error('ai_cost scope is invalid');
    if (!['api', 'invoice', 'manual'].includes(source)) throw new Error('ai_cost source is invalid');
    event.data = {
      usd: round(usd),
      provider: safeText(input.provider, 'provider', 80),
      model: input.model ? safeText(input.model, 'model', 120) : null,
      scope,
      source,
    };
  } else if (type === 'moderation') {
    if (!['submitted', 'passed', 'rejected'].includes(input.status)) throw new Error('moderation status must be submitted, passed or rejected');
    event.data = {
      platform: safeText(input.platform, 'platform', 80),
      status: input.status,
      attemptId: safeId(input.attemptId || `${input.platform}-${at.replace(/\D/g, '').slice(0, 14)}`, 'attempt id'),
    };
  } else if (type === 'defect') {
    if (!['critical', 'major', 'minor', 'unclassified'].includes(input.severity)) throw new Error('defect severity is invalid');
    if (!['pre_release', 'post_release'].includes(input.stage)) throw new Error('defect stage must be pre_release or post_release');
    event.data = {
      severity: input.severity,
      stage: input.stage,
      fingerprint: safeText(input.fingerprint, 'defect fingerprint', 160),
      source: safeText(input.source || 'manual', 'defect source', 80),
    };
  } else if (type === 'repair') {
    if (!['product', 'infrastructure'].includes(input.category)) throw new Error('repair category must be product or infrastructure');
    event.data = {
      category: input.category,
      code: safeId(input.code || 'RECORDED_REPAIR', 'repair code'),
      fingerprint: safeId(input.fingerprint || event.id, 'repair fingerprint'),
    };
  } else if (type === 'manual_step') {
    const count = input.count == null ? 1 : Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('manual_step count must be an integer 1..1000');
    event.data = { count, category: safeText(input.category || 'workflow', 'manual category', 80) };
  } else {
    event.releaseId = safeId(input.releaseId, 'release id');
    event.data = {
      releasedAt: iso(input.releasedAt || at),
      cycleStartedAt: input.cycleStartedAt ? iso(input.cycleStartedAt) : null,
      version: input.version ? safeText(input.version, 'release version', 80) : null,
      forgeVersion: input.forgeVersion ? safeText(input.forgeVersion, 'Forge version', 40) : null,
    };
    if (input.releasedAt && !event.data.releasedAt) throw new Error('releasedAt must be an ISO date-time');
    if (input.cycleStartedAt && !event.data.cycleStartedAt) throw new Error('cycleStartedAt must be an ISO date-time');
  }
  const dir = metricsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  ensureLocalExclude(root);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function median(values) {
  const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(records) {
  const released = records.filter(record => record?.release?.status === 'released');
  const metric = selector => {
    const values = released.map(selector).filter(value => Number.isFinite(value));
    return { median: round(median(values), 3), samples: values.length, coveragePct: released.length ? round(values.length / released.length * 100, 2) : 0 };
  };
  const moderationKnown = released.filter(record => record.moderation?.firstPass != null);
  return {
    releases: released.length,
    timeToReleaseMs: metric(record => record.time?.leadTimeMs),
    trackedActiveMs: metric(record => record.time?.trackedActiveMs),
    aiCostUsd: metric(record => record.ai?.costUsd),
    repairCycles: metric(record => record.repairs?.total),
    preReleaseDefects: metric(record => record.defects?.preRelease),
    automationPercent: metric(record => record.automation?.percent),
    moderation: {
      samples: moderationKnown.length,
      coveragePct: released.length ? round(moderationKnown.length / released.length * 100, 2) : 0,
      firstPassRatePct: moderationKnown.length ? round(moderationKnown.filter(record => record.moderation.firstPass).length / moderationKnown.length * 100, 2) : null,
      eventualPassRatePct: moderationKnown.length ? round(moderationKnown.filter(record => record.moderation.eventualPass).length / moderationKnown.length * 100, 2) : null,
    },
  };
}

function improvement(baseline, current, higherIsBetter) {
  if (!Number.isFinite(baseline) || !Number.isFinite(current) || baseline === 0) return null;
  const raw = ((current - baseline) / Math.abs(baseline)) * 100;
  return round(higherIsBetter ? raw : -raw, 2);
}

export function compareProductTelemetry(records, splitAt, { minimumCohort = 30 } = {}) {
  const split = Date.parse(splitAt || '');
  if (!Number.isFinite(split)) throw new Error('splitAt must be an ISO date-time');
  const released = records.filter(record => record?.release?.status === 'released' && iso(record.release.releasedAt));
  const baselineRecords = released.filter(record => Date.parse(record.release.releasedAt) < split);
  const currentRecords = released.filter(record => Date.parse(record.release.releasedAt) >= split);
  const baseline = summarize(baselineRecords);
  const current = summarize(currentRecords);
  const changes = {};
  for (const [key, higher] of [['timeToReleaseMs', false], ['trackedActiveMs', false], ['aiCostUsd', false], ['repairCycles', false], ['preReleaseDefects', false], ['automationPercent', true]]) {
    changes[key] = {
      improvementPct: improvement(baseline[key].median, current[key].median, higher),
      baselineSamples: baseline[key].samples,
      currentSamples: current[key].samples,
    };
  }
  changes.moderationFirstPassRate = {
    improvementPct: improvement(baseline.moderation.firstPassRatePct, current.moderation.firstPassRatePct, true),
    baselineSamples: baseline.moderation.samples,
    currentSamples: current.moderation.samples,
  };
  const cohortReady = baseline.releases >= minimumCohort && current.releases >= minimumCohort;
  for (const value of Object.values(changes)) value.claimEligible = cohortReady
    && value.improvementPct != null && value.baselineSamples >= minimumCohort && value.currentSamples >= minimumCohort;
  const eligibleMetrics = Object.entries(changes).filter(([, value]) => value.claimEligible).map(([key]) => key);
  const claimEligible = eligibleMetrics.length > 0;
  return {
    splitAt: new Date(split).toISOString(),
    minimumCohort,
    cohortReady,
    claimEligible,
    eligibleMetrics,
    baseline,
    current,
    changes,
    warning: !cohortReady
      ? `Need at least ${minimumCohort} released records in each cohort before claim-ready comparison.`
      : eligibleMetrics.length === Object.keys(changes).length ? null
        : 'Only metrics with complete minimum-sized samples are claim-ready; keep unknown/partial metrics out of public claims.',
  };
}

export function loadPortfolioTelemetry(fleetRoot) {
  const root = path.resolve(fleetRoot);
  if (!fs.existsSync(root)) return [];
  const records = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const project = path.join(root, entry.name);
    const releasesDir = path.join(project, '.forge', 'metrics', 'releases');
    if (!fs.existsSync(releasesDir)) continue;
    for (const file of fs.readdirSync(releasesDir).filter(name => name.endsWith('.json'))) {
      const record = readJson(path.join(releasesDir, file));
      if (record?.kind === 'forge.release-metrics') records.push(record);
    }
  }
  return records;
}

export function summarizeProductTelemetry(records) { return summarize(records); }

export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'n/a';
  const hours = ms / 3_600_000;
  if (hours >= 48) return `${round(hours / 24, 1)} d`;
  if (hours >= 1) return `${round(hours, 1)} h`;
  return `${round(ms / 60_000, 1)} min`;
}

export function formatProductTelemetry(report) {
  const lines = [
    `Forge product metrics — ${report.project} / ${report.release.id}`,
    `Status: ${report.release.status}${report.release.forgeVersion ? ` | Forge ${report.release.forgeVersion}` : ''}`,
    `Time-to-release: ${formatDuration(report.time.leadTimeMs)} | tracked active: ${formatDuration(report.time.trackedActiveMs)}`,
    `AI cost: ${report.ai.costUsd == null ? 'unknown' : `$${report.ai.costUsd.toFixed(4)}`} (${report.ai.costBasis}; ${report.ai.reports} report(s))`,
    `Repair cycles: ${report.repairs.total} (product ${report.repairs.product}, infrastructure ${report.repairs.infrastructure})`,
    `Pre-release defects: ${report.defects.preRelease}`,
    `Moderation: ${report.moderation.firstPass == null ? 'unknown' : report.moderation.firstPass ? 'first-pass PASS' : 'first-pass FAIL'}`,
    `Automated workflow: ${report.automation.percent == null ? 'unknown' : `${report.automation.percent}%`} (${report.automation.basis})`,
  ];
  return lines.join('\n');
}
