#!/usr/bin/env node
/** Offline regression for evidence-bound phase completion. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import { loadPhaseContract, validatePhaseCompletion } from '../.claude/skills/status/references/phase-completion-gate.mjs';
import {
  captureReceiptPayload,
  computeVisualCaptureId,
  reviewReceiptPayload,
  sha256File,
  validatePhase4VisualEvidence,
} from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { appendImageProvenance } from '../.claude/skills/status/references/image-provenance.mjs';
import { pngCrc32 } from '../.claude/skills/status/references/png-integrity.mjs';
import { recordVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';
import { screenInventorySha256 } from '../.claude/skills/status/references/screen-flow-contract.mjs';

const ROOT = process.cwd();
const phaseState = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
const phaseVisualClaimHook = path.join(ROOT, '.claude', 'hooks', 'phase-visual-claim-gate.mjs');
const screenTargetsScript = path.join(ROOT, 'scripts', 'screen-targets.mjs');
const bindVisualEvidenceScript = path.join(ROOT, 'scripts', 'bind-phase4-visual-evidence.mjs');
const recordVisualReviewScript = path.join(ROOT, 'scripts', 'record-phase4-visual-review.mjs');
const openaiImageScript = path.join(ROOT, 'scripts', 'openai-image.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-phase-gate-'));
const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) failures.push(message);
};
const write = (root, rel, content) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};
const writeBuffer = (root, rel, content) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const prose = (heading, body) => `# ${heading}\n\n${(`${body} `).repeat(30)}\n`;
const pngCache = new Map();
const pngChunk = (type, payload) => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  typeBuffer.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, payload])), 8 + payload.length);
  return chunk;
};
const png = (width = 1280, height = 720, variant = 1) => {
  const key = `${width}x${height}:${variant}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 4] = variant % 251;
    row[2 + x * 4] = (variant * 3) % 251;
    row[3 + x * 4] = (variant * 7) % 251;
    row[4 + x * 4] = 255;
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) row.copy(raw, y * row.length);
  const comment = Buffer.concat([Buffer.from('Comment\0', 'latin1'), Buffer.alloc(1200, 65 + (variant % 25))]);
  const result = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('tEXt', comment), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  pngCache.set(key, result);
  return result;
};
const mp4 = () => { const data = Buffer.alloc(80); data.writeUInt32BE(24, 0); data.write('ftyp', 4, 'ascii'); return data; };
const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(160)]);
const validBrief = `# Бриф проекта

## Аудитория
**Возраст:** 12+
**Кто это:** игроки коротких браузерных сессий
**Следствия:** быстрый темп, минимум текста

## Амбиция
**Масштаб:** MVP за две недели
**Следствия для скоупа:** только исходный GDD

## Обещание игры
**Что игрок должен почувствовать:** ещё один рискованный поворот ради рекорда

## Отличие
**Чем не такая, как похожие в каталоге:** точное сенсорное управление

## История
**Что уже пробовал, что не сработало:** исходного прототипа нет
`;
const validMetrics = `# Метрики

D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.

## Контент-бюджет
| Горизонт | Есть | Дефицит |
|---|---|---|
| MVP | GDD | Реализация и проверка |

- [ ] Игра открывается и играбельна.
`;

const FLOW_STATES = [
  ['start', 'Start', 'start', 'dedicated', null],
  ['hq', 'Headquarters', 'hq', 'dedicated', null],
  ['map', 'Campaign map', 'map', 'dedicated', null],
  ['battle', 'Battle', 'gameplay', 'dedicated', null],
  ['result', 'Battle result', 'result', 'dedicated', null],
  ['settings', 'Settings', 'settings', 'inherited', 'hq'],
];

function writeScreenFlow(root) {
  const flow = {
    schemaVersion: 1,
    kind: 'forge.screen-flow',
    status: 'approved',
    entryState: 'start',
    qaAdapter: { global: '__FORGE_VISUAL_QA__', query: 'forgeVisualQa=1' },
    states: FLOW_STATES.map(([id, label, archetype, targetPolicy, inheritFrom]) => ({
      id, label, archetype, required: true, targetPolicy, inheritFrom,
      visualDescription: `${label} has a concrete player goal, primary focal area, responsive navigation hierarchy, and an explicit route to the next state.`,
      capture: { adapterState: id },
    })),
    transitions: [
      { from: 'start', to: 'hq', trigger: 'continue' },
      { from: 'hq', to: 'start', trigger: 'back' },
      { from: 'hq', to: 'map', trigger: 'play' },
      { from: 'map', to: 'battle', trigger: 'select mission' },
      { from: 'battle', to: 'result', trigger: 'finish battle' },
      { from: 'result', to: 'hq', trigger: 'collect reward' },
      { from: 'hq', to: 'settings', trigger: 'open settings' },
      { from: 'settings', to: 'hq', trigger: 'close settings' },
    ],
  };
  flow.approval = {
    decisionKey: 'phase2-screen-inventory',
    approvedBy: 'user',
    approvedAt: '2026-08-25T00:00:00.000Z',
    inventorySha256: screenInventorySha256(flow),
  };
  write(root, 'wiki/design/screen-flow.json', JSON.stringify(flow, null, 2));
  return flow;
}

function writePhase4Fixture(root, mutate = () => {}) {
  write(root, 'wiki/design/target-frame.md', prose('Target frame', 'Approved hierarchy palette composition typography and reference rationale.'));
  write(root, 'assets/style/STYLE-BIBLE.md', prose('Style Bible', 'Approved visual tokens palette type scale states effects and asset rules.'));
  writeBuffer(root, 'assets/target/target-frame.png', png(1920, 1080, 11));
  writeScreenFlow(root);
  const screenTargetByKey = new Map();
  const screenTargetStates = [];
  for (const [state, label, archetype, mode, inheritedFrom] of FLOW_STATES) {
    if (mode === 'inherited') continue;
    const references = {};
    for (const [viewport, width, height, variant] of [['mobile', 800, 1400, 21], ['desktop', 1600, 900, 22]]) {
      const rel = `assets/target/screens/${state}-${viewport}.png`;
      const packRel = `assets/prompts/screen-${state}-${viewport}.json`;
      writeBuffer(root, rel, png(width, height, variant + screenTargetStates.length * 10));
      write(root, packRel, JSON.stringify({
        schemaVersion: 1, id: `screen-${state}-${viewport}`, phase: 4, status: 'approved', purpose: 'screen-blueprint',
        provider: 'codex-native', model: 'gpt-image-2', state, viewport, size: `${width}x${height}`, quality: 'high', background: 'opaque',
        prompt: `Generate the ${label} interface blueprint using the approved master visual reference and a clear responsive game hierarchy.`,
        negativeConstraints: ['no watermark'], references: ['assets/target/target-frame.png'], output: rel,
        acceptance: ['screen hierarchy matches the approved master target'],
      }, null, 2));
      const provenance = appendImageProvenance({
        projectRoot: root, provider: 'codex-native', model: 'gpt-image-2', output: path.join(root, rel), promptPack: path.join(root, packRel),
        operation: { trust: 'host-attestation', mode: 'native-image-input', endpoint: 'codex.imagegen', usedMasterTarget: true },
      });
      references[viewport] = {
        path: rel,
        sha256: sha256File(path.join(root, rel)),
        provenance: { path: provenance.provenancePath, line: provenance.line, recordSha256: provenance.recordSha256 },
      };
      screenTargetByKey.set(`${state}::${viewport}`, references[viewport]);
    }
    screenTargetStates.push({
      state, archetype, mode, inheritedFrom: null,
      description: `Approved ${state} composition showing its primary scene, navigation hierarchy, responsive panels, and visual focus.`,
      references,
    });
  }
  const inheritedParent = screenTargetStates.find(item => item.state === 'hq');
  screenTargetStates.push({
    state: 'settings', archetype: 'settings', mode: 'inherited', inheritedFrom: 'hq',
    description: 'Settings intentionally inherits the approved headquarters shell while changing only its secondary controls and content.',
    references: inheritedParent.references,
  });
  for (const viewport of ['mobile', 'desktop']) screenTargetByKey.set(`settings::${viewport}`, inheritedParent.references[viewport]);
  const screenTargetManifest = {
    schemaVersion: 1,
    kind: 'forge.phase-4-screen-targets',
    masterTarget: { path: 'assets/target/target-frame.png', sha256: sha256File(path.join(root, 'assets/target/target-frame.png')) },
    screenFlow: { path: 'wiki/design/screen-flow.json', sha256: sha256File(path.join(root, 'wiki/design/screen-flow.json')) },
    states: screenTargetStates.sort((left, right) => left.state.localeCompare(right.state)),
  };
  write(root, 'assets/target/screens/manifest.json', JSON.stringify(screenTargetManifest, null, 2));
  writeBuffer(root, 'assets/ui/scene.png', png(1024, 1024, 91));
  write(root, 'WorkProgress/demo/index.html', '<!doctype html><link rel="stylesheet" href="styles.css"><main class="game"></main>');
  write(root, 'WorkProgress/demo/styles.css', '.game{background-image:url("../../assets/ui/scene.png");min-height:100vh;color:#fff;}');

  const frames = [];
  for (const [index, [state]] of FLOW_STATES.entries()) {
    for (const [viewport, width, height, variant] of [['mobile', 412, 915, 101], ['desktop', 1920, 1080, 102]]) {
      const rel = `WorkProgress/demo/screens/review/${viewport}-${String(index + 1).padStart(2, '0')}-${state}.png`;
      writeBuffer(root, rel, png(width, height, variant + index * 10));
      frames.push({
        state, viewport, file: rel, width, height, contentHeightRatio: 1, sha256: sha256File(path.join(root, rel)),
        stateProof: { mechanism: 'forge-runtime-adapter', requestedState: state, adapterState: state, reportedState: state },
      });
    }
  }
  const startedAt = new Date(Date.now() - 2000).toISOString();
  const capturedAt = new Date().toISOString();
  const stateIds = FLOW_STATES.map(([id]) => id);
  const capture = {
    schemaVersion: 1, kind: 'forge.visual-capture', generatedBy: 'screens-shoot.mjs', captureMode: 'forge-runtime-adapter',
    startedAt, capturedAt, captureId: computeVisualCaptureId({ capturedAt, captures: frames }), captureReceiptId: null,
    builder: { id: 'codex-builder', sessionId: 'builder-session-1' },
    screenFlow: { path: 'wiki/design/screen-flow.json', sha256: sha256File(path.join(root, 'wiki/design/screen-flow.json')) },
    stateAdapter: { global: '__FORGE_VISUAL_QA__', query: 'forgeVisualQa=1' },
    states: stateIds, requestedStates: stateIds, missingStates: [], runtimeErrors: [], captures: frames,
  };
  const report = prose('Phase 4 independent visual review', 'All captured states were opened at native scale and compared with their approved generated screen target. Composition hierarchy readability style and responsiveness are acceptable.');
  write(root, 'wiki/qa/phase-4-visual-review.md', report);
  const evidence = {
    schemaVersion: 1, kind: 'forge.phase-4-visual-evidence', phase: 4,
    captureManifest: 'WorkProgress/demo/screens/review/capture-manifest.json', captureId: capture.captureId, captureReceiptId: null,
    targetFrame: { path: 'assets/target/target-frame.png', sha256: sha256File(path.join(root, 'assets/target/target-frame.png')) },
    screenTargets: { path: 'assets/target/screens/manifest.json', sha256: sha256File(path.join(root, 'assets/target/screens/manifest.json')) },
    styleBible: { path: 'assets/style/STYLE-BIBLE.md', sha256: sha256File(path.join(root, 'assets/style/STYLE-BIBLE.md')) },
    report: { path: 'wiki/qa/phase-4-visual-review.md', sha256: sha256File(path.join(root, 'wiki/qa/phase-4-visual-review.md')) },
    builder: capture.builder, reviewer: { id: 'visual-qa', sessionId: 'review-session-2', mode: 'independent' },
    reviewedAt: new Date(Date.parse(capturedAt) + 1000).toISOString(),
    coverage: { expectedStates: stateIds, capturedStates: stateIds, missingStates: [], complete: true },
    minimumScore: 6, verdict: 'pass',
    summary: 'Independent review opened every native mobile and desktop frame and compared it to the state-specific approved target; composition, hierarchy, readability, style, and responsiveness all meet the acceptance floor.',
    verification: { command: 'node ../project-forge/scripts/screens-shoot.mjs .', exitCode: 0 },
    reviews: frames.map(frame => ({
      state: frame.state, viewport: frame.viewport, file: frame.file, sha256: frame.sha256, verdict: 'pass',
      scores: { composition: 7, hierarchy: 7, readability: 8, styleMatch: 7, responsiveness: 7 },
      targetComparison: {
        targetPath: screenTargetByKey.get(`${frame.state}::${frame.viewport}`).path,
        targetSha256: screenTargetByKey.get(`${frame.state}::${frame.viewport}`).sha256,
        distanceScore: 7,
        matches: ['The primary scene occupies the same dominant central region.', 'The action hierarchy follows the same focal path as the target.'],
        differences: ['The live frame uses slightly wider side margins than the approved composition.', 'Secondary panel material is flatter and less textured than the approved target frame.', 'Decorative lighting has lower contrast around the primary action than the target frame.'],
      },
      critique: `The ${frame.state} ${frame.viewport} frame has a clear primary scene, readable actions, deliberate spacing, consistent materials, and no visible clipping at native scale.`,
      defects: [{ severity: 'minor', description: 'One decorative accent can be polished after acceptance.' }],
    })),
  };
  mutate({ capture, evidence, frames });
  const captureReceipt = recordVisualReceipt({
    projectRoot: root, kind: 'capture', payload: captureReceiptPayload({ manifestPath: evidence.captureManifest, manifest: capture }),
  });
  capture.captureReceiptId = captureReceipt.receipt.receiptId;
  evidence.captureReceiptId = capture.captureReceiptId;
  evidence.builder = capture.builder;
  const reviewReceipt = recordVisualReceipt({ projectRoot: root, kind: 'review', payload: reviewReceiptPayload({ evidencePath: 'wiki/qa/phase-4-visual-evidence.json', evidence }) });
  evidence.reviewReceiptId = reviewReceipt.receipt.receiptId;
  write(root, 'WorkProgress/demo/screens/review/capture-manifest.json', JSON.stringify(capture, null, 2));
  write(root, 'wiki/qa/phase-4-visual-evidence.json', JSON.stringify(evidence, null, 2));
  return { capture, evidence, frames };
}

try {
  console.log('Project Forge phase completion gate audit');
  console.log('─────────────────────────────────────────');

  const missing = validatePhaseCompletion({ root: tmp, phase: 1, evidence: ['wiki/architecture/metrics.md'] });
  check(!missing.ok && missing.failures.some(item => /brief\.md/.test(item)), 'Phase 1 rejects missing canonical evidence');

  const placeholder = path.join(tmp, 'placeholder');
  write(placeholder, 'wiki/design/brief.md', '# Brief\nДата: <дата>\nЗаполняется в фазе 1\n');
  write(placeholder, 'wiki/architecture/metrics.md', validMetrics);
  let result = validatePhaseCompletion({ root: placeholder, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /template/.test(item)), 'untouched Phase 1 brief cannot become durable completion evidence');

  const invented = path.join(tmp, 'invented-kpi');
  write(invented, 'wiki/design/brief.md', validBrief);
  write(invented, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', 'D7 retention: 15% (industry benchmark).'));
  result = validatePhaseCompletion({ root: invented, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /KPI claim/.test(item)), 'numeric KPI facts require a URL citation or hypothesis label');

  const russianInvented = path.join(tmp, 'russian-invented-kpi');
  write(russianInvented, 'wiki/design/brief.md', validBrief);
  write(russianInvented, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', 'Удержание: 15% — отраслевой ориентир.'));
  result = validatePhaseCompletion({ root: russianInvented, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /KPI claim/.test(item)),
    'numeric KPI facts written in Cyrillic cannot bypass source validation');

  for (const [slug, label] of [
    ['russian-hypothesis', 'гипотеза'],
    ['russian-hypotheses', 'гипотезы'],
    ['russian-assumption', 'предположение'],
    ['english-hypothesis', 'hypothesis'],
  ]) {
    const hypothesis = path.join(tmp, slug);
    write(hypothesis, 'wiki/design/brief.md', validBrief);
    write(hypothesis, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', `Удержание: 15% — ${label}.`));
    result = validatePhaseCompletion({ root: hypothesis, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
    check(result.ok, `explicit ${label} label permits a numeric KPI hypothesis`);
  }

  const embeddedHypothesis = path.join(tmp, 'embedded-hypothesis');
  write(embeddedHypothesis, 'wiki/design/brief.md', validBrief);
  write(embeddedHypothesis, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', 'D7 retention: 15% — антигипотеза.'));
  result = validatePhaseCompletion({ root: embeddedHypothesis, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /KPI claim/.test(item)),
    'a hypothesis substring inside a larger Cyrillic word is not accepted as a label');

  const russianExternalFact = path.join(tmp, 'russian-external-fact');
  write(russianExternalFact, 'wiki/design/brief.md', validBrief);
  write(russianExternalFact, 'wiki/architecture/metrics.md', validMetrics);
  write(russianExternalFact, 'wiki/research/references.md', '# Исследование\n\nРынок требует монетизацию.\n');
  result = validatePhaseCompletion({ root: russianExternalFact, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'an uncited external-market fact written in Cyrillic is rejected');

  for (const [slug, claim] of [
    ['russian-competitors', 'Конкуренты требуют мета-прогрессию.'],
    ['russian-competitive-adjective', 'Конкурентные игры требуют мета-прогрессию.'],
    ['russian-platform-requirements', 'Требования платформы включают локализацию.'],
  ]) {
    const externalInflection = path.join(tmp, slug);
    write(externalInflection, 'wiki/design/brief.md', validBrief);
    write(externalInflection, 'wiki/architecture/metrics.md', validMetrics);
    write(externalInflection, 'wiki/research/references.md', `# Исследование\n\n${claim}\n`);
    result = validatePhaseCompletion({ root: externalInflection, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
    check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
      `an uncited inflected Cyrillic external claim is rejected: ${claim}`);
  }

  const russianNegation = path.join(tmp, 'russian-external-negation');
  write(russianNegation, 'wiki/design/brief.md', validBrief);
  write(russianNegation, 'wiki/architecture/metrics.md', validMetrics);
  write(russianNegation, 'wiki/research/references.md', '# Исследование\n\n## Конкурентное поле\n\nНет проверенных внешних источников: рынок не исследован.\n');
  result = validatePhaseCompletion({ root: russianNegation, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(result.ok, 'an explicit Cyrillic no-evidence statement remains valid');

  const internalRetentionHeading = path.join(tmp, 'internal-retention-heading');
  write(internalRetentionHeading, 'wiki/design/brief.md', validBrief);
  write(internalRetentionHeading, 'wiki/architecture/metrics.md', validMetrics);
  write(internalRetentionHeading, 'wiki/research/references.md', '# Research\n\nSource: https://example.com/benchmark\n\n### Retention hooks proposed\n\n- Internal mission ladder proposal.\n');
  result = validatePhaseCompletion({ root: internalRetentionHeading, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(result.ok, 'an internal retention section heading is not misclassified as an external factual line');

  const uncitedRetentionFact = path.join(tmp, 'uncited-retention-fact');
  write(uncitedRetentionFact, 'wiki/design/brief.md', validBrief);
  write(uncitedRetentionFact, 'wiki/architecture/metrics.md', validMetrics);
  write(uncitedRetentionFact, 'wiki/research/references.md', '# Research\n\nUnrelated source: https://example.com/catalog\n\nRetention is 15%.\n');
  result = validatePhaseCompletion({ root: uncitedRetentionFact, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'an unrelated document URL cannot launder an uncited retention fact on another line');

  const russianMixedClaim = path.join(tmp, 'russian-mixed-claim');
  write(russianMixedClaim, 'wiki/design/brief.md', validBrief);
  write(russianMixedClaim, 'wiki/architecture/metrics.md', validMetrics);
  write(russianMixedClaim, 'wiki/research/references.md', '# Исследование\n\nРынок: гипотеза, но требование подтверждено.\n');
  result = validatePhaseCompletion({ root: russianMixedClaim, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'a Cyrillic hypothesis label cannot mask a positive confirmed assertion on the same line');

  const falseAcceptance = path.join(tmp, 'false-acceptance');
  write(falseAcceptance, 'wiki/design/brief.md', validBrief);
  write(falseAcceptance, 'wiki/architecture/metrics.md', validMetrics.replace('- [ ] Игра открывается', '- [x] Игра открывается'));
  result = validatePhaseCompletion({ root: falseAcceptance, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /no implementation source/.test(item)), 'unbuilt runtime acceptance cannot be marked complete');

  const laundered = path.join(tmp, 'laundered-research');
  write(laundered, 'wiki/design/brief.md', validBrief);
  write(laundered, 'wiki/architecture/metrics.md', validMetrics);
  write(laundered, 'wiki/research/references.md', '# Research\n\nNo verified external sources found.\n\n### Historical reference: Nokia Snake (1998)\n- Slither.io is a modern multiplayer variant.\n');
  result = validatePhaseCompletion({ root: laundered, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'a document-level no-source disclaimer cannot launder uncited external facts below it');

  const mixedTbd = path.join(tmp, 'mixed-tbd-claim');
  write(mixedTbd, 'wiki/design/brief.md', validBrief);
  write(mixedTbd, 'wiki/architecture/metrics.md', validMetrics);
  write(mixedTbd, 'wiki/research/references.md', '# Research\n\nLocalization: TBD (verified only for Yandex Games as a future platform).\n');
  result = validatePhaseCompletion({ root: mixedTbd, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'TBD cannot mask an uncited positive verified/requires assertion on the same line');

  const contradictory = path.join(tmp, 'contradictory-status');
  write(contradictory, 'wiki/design/brief.md', validBrief);
  write(contradictory, 'wiki/architecture/metrics.md', `---\nstatus: qa_blocked\n---\n${validMetrics}`);
  result = validatePhaseCompletion({ root: contradictory, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /blocked or draft status/.test(item)),
    'a blocked evidence document cannot coexist with a complete phase marker');

  const rejected = spawnSync(process.execPath, [phaseState, 'complete', '1', 'wiki/architecture/metrics.md', 'wiki/design/brief.md'], { cwd: invented, encoding: 'utf8' });
  const rejectedMarker = JSON.parse(fs.readFileSync(path.join(invented, 'wiki', 'phases', 'phase-1.json'), 'utf8'));
  check(rejected.status !== 0 && rejectedMarker.state === 'blocked' && !fs.existsSync(path.join(invented, '.git')),
    'a rejected completion writes blocked state and performs no Git checkpoint');

  const valid = path.join(tmp, 'valid');
  write(valid, 'wiki/design/brief.md', validBrief);
  write(valid, 'wiki/architecture/metrics.md', validMetrics);
  write(valid, '.forge/agent.json', JSON.stringify({ agent: 'openrouter', model: 'openrouter/qwen/qwen3-coder-next', locked: true }));
  write(valid, '.forge-git.json', JSON.stringify({ github: { enabled: true, owner: 'Nioris', visibility: 'private', autoCreate: true, autoPush: true } }));
  const accepted = spawnSync(process.execPath, [phaseState, 'complete', '1', 'wiki/architecture/metrics.md', 'wiki/design/brief.md'], { cwd: valid, encoding: 'utf8' });
  const acceptedMarker = JSON.parse(fs.readFileSync(path.join(valid, 'wiki', 'phases', 'phase-1.json'), 'utf8'));
  check(accepted.status === 0 && acceptedMarker.state === 'complete' && acceptedMarker.completionGate?.status === 'passed',
    'valid evidence passes and records the mechanical gate result');
  check(/private remote deferred until Phase 8/.test(accepted.stdout) && fs.existsSync(path.join(valid, '.git')),
    'experimental whole-project host keeps early checkpoints local until Phase 8');

  const contracts = Array.from({ length: 9 }, (_, index) => loadPhaseContract(index + 1));
  check(contracts.length === 9 && contracts.every((contract, index) => contract.phase === index + 1),
    'all nine executable phase contracts load with canonical identity');
  const phaseSkills = [
    'phase-1-analyze', 'phase-2-design', 'phase-3-construct', 'phase-4-visual', 'phase-5-tech',
    'phase-6-listing', 'phase-7-test', 'phase-8-release', 'phase-9-live',
  ];
  const commandsAligned = phaseSkills.every((skill, index) => {
    const text = fs.readFileSync(path.join(ROOT, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    const phase = index + 1;
    const match = text.match(new RegExp(`phase-state\\.mjs complete ${phase}([^\\r\\n]*)`));
    if (!match) return false;
    const args = new Set(match[1].trim().split(/\s+/).filter(Boolean));
    return contracts[index].requiredEvidence.every(item => args.has(item.path));
  });
  check(commandsAligned, 'all canonical phase skill completion commands provide their contract evidence files');
  const codexHooks = JSON.parse(fs.readFileSync(path.join(ROOT, '.codex', 'hooks.json'), 'utf8'));
  const codexStopCommands = (codexHooks.hooks?.Stop || []).flatMap(group => group.hooks || []).map(item => item.commandWindows || item.command || '');
  check(codexStopCommands.some(command => /phase-visual-claim-gate\.mjs/u.test(command)),
    'Codex Stop lifecycle enforces the same fail-closed Phase 4 completion-claim gate');

  for (let phase = 2; phase <= 9; phase += 1) {
    const irrelevant = path.join(tmp, `phase-${phase}-irrelevant`);
    write(irrelevant, 'wiki/random.md', prose('Unrelated', 'This file is real but does not prove phase completion.'));
    const rejectedIrrelevant = validatePhaseCompletion({ root: irrelevant, phase, evidence: ['wiki/random.md'] });
    check(!rejectedIrrelevant.ok && rejectedIrrelevant.failures.some(item => /requires explicit evidence/.test(item)),
      `Phase ${phase} rejects an existing but irrelevant evidence file`);
  }

  const p2 = path.join(tmp, 'phase-2-valid');
  write(p2, 'wiki/design/gdd.md', prose('GDD', 'Core loop economy retention content ladder controls UX and acceptance.'));
  write(p2, 'wiki/plan/02-development-plan.md', prose('Development plan', 'Sprint task owner acceptance verifier dependency implementation.'));
  writeScreenFlow(p2);
  result = validatePhaseCompletion({ root: p2, phase: 2, evidence: ['wiki/design/gdd.md', 'wiki/plan/02-development-plan.md', 'wiki/design/screen-flow.json'] });
  check(result.ok && result.contract?.phase === 2, 'Phase 2 accepts its complete GDD + development-plan + approved screen inventory contract');

  const p2UnapprovedInventory = path.join(tmp, 'phase-2-unapproved-screen-inventory');
  write(p2UnapprovedInventory, 'wiki/design/gdd.md', prose('GDD', 'Core loop economy retention content ladder controls UX and acceptance.'));
  write(p2UnapprovedInventory, 'wiki/plan/02-development-plan.md', prose('Development plan', 'Sprint task owner acceptance verifier dependency implementation.'));
  const unapprovedFlow = writeScreenFlow(p2UnapprovedInventory);
  delete unapprovedFlow.approval;
  write(p2UnapprovedInventory, 'wiki/design/screen-flow.json', JSON.stringify(unapprovedFlow, null, 2));
  result = validatePhaseCompletion({ root: p2UnapprovedInventory, phase: 2, evidence: ['wiki/design/gdd.md', 'wiki/plan/02-development-plan.md', 'wiki/design/screen-flow.json'] });
  check(!result.ok && result.failures.some(item => /user inventory approval/u.test(item)),
    'Phase 2 rejects a self-declared screen inventory without an explicit user approval binding');

  const p3 = path.join(tmp, 'phase-3-valid');
  write(p3, 'wiki/plan/02-development-plan.md', prose('Development plan', 'Implemented sprint acceptance and verifier results.'));
  write(p3, 'wiki/testing.md', prose('Testing', 'PASS playtest produced real actions and zero runtime errors.'));
  write(p3, 'WorkProgress/demo/index.html', '<!doctype html><style>canvas{display:block}</style><canvas></canvas><script>requestAnimationFrame(()=>{});</script>');
  write(p3, 'WorkProgress/demo/playtest-out/report.json', JSON.stringify({ rafAlive: true, errors: [], actions: ['clicked start'] }));
  result = validatePhaseCompletion({ root: p3, phase: 3, evidence: ['wiki/plan/02-development-plan.md', 'wiki/testing.md'] });
  check(result.ok, 'Phase 3 requires implementation plus a clean machine playtest report');
  write(p3, 'WorkProgress/demo/playtest-out/report.json', JSON.stringify({ rafAlive: true, errors: ['boom'], actions: ['clicked start'] }));
  result = validatePhaseCompletion({ root: p3, phase: 3, evidence: ['wiki/plan/02-development-plan.md', 'wiki/testing.md'] });
  check(!result.ok && result.failures.some(item => /zero runtime errors/.test(item)), 'Phase 3 rejects counterfeit PASS text when playtest JSON has errors');

  const p4Evidence = ['wiki/design/target-frame.md', 'wiki/design/screen-flow.json', 'assets/target/target-frame.png', 'assets/target/screens/manifest.json', 'assets/style/STYLE-BIBLE.md', 'wiki/qa/phase-4-visual-review.md', 'wiki/qa/phase-4-visual-evidence.json'];
  const p4CssOnly = path.join(tmp, 'phase-4-css-only');
  write(p4CssOnly, 'wiki/design/target-frame.md', prose('Target frame', 'Approved hierarchy palette composition typography and reference rationale.'));
  writeScreenFlow(p4CssOnly);
  writeBuffer(p4CssOnly, 'assets/target/target-frame.png', png(1920, 1080, 1600));
  write(p4CssOnly, 'assets/target/screens/manifest.json', JSON.stringify({ schemaVersion: 1, kind: 'forge.phase-4-screen-targets', states: [] }));
  write(p4CssOnly, 'assets/style/STYLE-BIBLE.md', prose('Style Bible', 'Approved visual tokens palette type scale states effects and asset rules.'));
  write(p4CssOnly, 'wiki/qa/phase-4-visual-review.md', prose('Visual review', 'Claimed pass without screenshot evidence.'));
  write(p4CssOnly, 'wiki/qa/phase-4-visual-evidence.json', JSON.stringify({ schemaVersion: 1, kind: 'forge.phase-4-visual-evidence', phase: 4 }));
  write(p4CssOnly, 'WorkProgress/demo/styles.css', '.game{color:#fff;background:#111;padding:12px;border:2px solid #333;}'.repeat(8));
  result = validatePhaseCompletion({ root: p4CssOnly, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /CSS.*do not count|captureManifest/u.test(item)),
    'Phase 4 rejects the former CSS-only false acceptance path');

  const p4 = path.join(tmp, 'phase-4-valid');
  writePhase4Fixture(p4);
  result = validatePhaseCompletion({ root: p4, phase: 4, evidence: p4Evidence });
  check(result.ok, 'Phase 4 accepts only integrated art plus complete independent mobile/desktop visual evidence');

  const openaiReferenceDryRun = spawnSync(process.execPath, [
    openaiImageScript,
    '--project', '.',
    '--prompt-pack', 'assets/prompts/screen-start-mobile.json',
    '--dry-run',
  ], { cwd: p4, encoding: 'utf8' });
  check(openaiReferenceDryRun.status === 0
    && /POST \/v1\/images\/edits/u.test(openaiReferenceDryRun.stdout)
    && /edit-reference/u.test(openaiReferenceDryRun.stdout)
    && /assets\/target\/target-frame\.png/u.test(openaiReferenceDryRun.stdout),
  'OpenAI screen blueprint helper sends the approved master PNG through the image-edits reference endpoint');

  let textOnlyProvenanceRejected = false;
  try {
    appendImageProvenance({
      projectRoot: p4,
      provider: 'openai-api',
      model: 'gpt-image-2',
      output: path.join(p4, 'assets/target/screens/start-mobile.png'),
      promptPack: path.join(p4, 'assets/prompts/screen-start-mobile.json'),
    });
  } catch (error) {
    textOnlyProvenanceRejected = /real \/v1\/images\/edits reference-image operation/u.test(error.message);
  }
  check(textOnlyProvenanceRejected,
    'a text-only OpenAI request cannot claim master-image-conditioned screen blueprint provenance');

  const p4ShrunkInventory = path.join(tmp, 'phase-4-self-declared-shrink');
  writePhase4Fixture(p4ShrunkInventory, ({ capture, evidence }) => {
    const hidden = new Set(['hq', 'map', 'result']);
    capture.captures = capture.captures.filter(item => !hidden.has(item.state));
    capture.states = capture.states.filter(item => !hidden.has(item));
    capture.requestedStates = capture.requestedStates.filter(item => !hidden.has(item));
    capture.captureId = computeVisualCaptureId({ capturedAt: capture.capturedAt, captures: capture.captures });
    evidence.captureId = capture.captureId;
    evidence.coverage.expectedStates = capture.states;
    evidence.coverage.capturedStates = capture.states;
    evidence.reviews = evidence.reviews.filter(item => !hidden.has(item.state));
  });
  result = validatePhaseCompletion({ root: p4ShrunkInventory, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /complete approved screen flow|approved Phase 2 screen inventory/u.test(item)),
    'Phase 4 cannot hide HQ/map/result by shrinking its own capture inventory');

  const p4DuplicateStates = path.join(tmp, 'phase-4-identical-states');
  writePhase4Fixture(p4DuplicateStates, ({ capture, evidence }) => {
    const source = capture.captures.find(item => item.state === 'hq' && item.viewport === 'mobile');
    const target = capture.captures.find(item => item.state === 'battle' && item.viewport === 'mobile');
    Object.assign(target, { file: source.file, sha256: source.sha256, width: source.width, height: source.height });
    capture.captureId = computeVisualCaptureId({ capturedAt: capture.capturedAt, captures: capture.captures });
    evidence.captureId = capture.captureId;
    const review = evidence.reviews.find(item => item.state === 'battle' && item.viewport === 'mobile');
    Object.assign(review, { file: source.file, sha256: source.sha256 });
  });
  result = validatePhaseCompletion({ root: p4DuplicateStates, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /identical screenshot/u.test(item)),
    'Phase 4 rejects different runtime states that render the same screenshot');

  const p4UnsignedIdentity = path.join(tmp, 'phase-4-self-asserted-reviewer');
  writePhase4Fixture(p4UnsignedIdentity);
  const unsignedIdentityFile = path.join(p4UnsignedIdentity, 'wiki', 'qa', 'phase-4-visual-evidence.json');
  const unsignedIdentityEvidence = JSON.parse(fs.readFileSync(unsignedIdentityFile, 'utf8'));
  unsignedIdentityEvidence.reviewer = { id: 'invented-independent-reviewer', sessionId: 'invented-session', mode: 'independent' };
  fs.writeFileSync(unsignedIdentityFile, JSON.stringify(unsignedIdentityEvidence, null, 2));
  result = validatePhaseCompletion({ root: p4UnsignedIdentity, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /trusted independent review receipt rejected/u.test(item)),
    'editable reviewer strings cannot replace the engine-owned independent-review receipt');

  const p4CaptureTamper = path.join(tmp, 'phase-4-capture-receipt-tamper');
  writePhase4Fixture(p4CaptureTamper);
  const captureTamperFile = path.join(p4CaptureTamper, 'WorkProgress', 'demo', 'screens', 'review', 'capture-manifest.json');
  const captureTamper = JSON.parse(fs.readFileSync(captureTamperFile, 'utf8'));
  captureTamper.command = 'manually rewritten capture claim';
  fs.writeFileSync(captureTamperFile, JSON.stringify(captureTamper, null, 2));
  result = validatePhaseCompletion({ root: p4CaptureTamper, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /trusted capture receipt rejected/u.test(item)),
    'editing a project-local capture manifest invalidates its engine-owned receipt');

  const p4SameReviewer = path.join(tmp, 'phase-4-same-reviewer');
  writePhase4Fixture(p4SameReviewer, ({ evidence }) => { evidence.reviewer = { id: 'codex-builder', sessionId: 'builder-session-1', mode: 'independent' }; });
  result = validatePhaseCompletion({ root: p4SameReviewer, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /same builder session/u.test(item)), 'Phase 4 rejects builder self-acceptance');

  const p4LowScore = path.join(tmp, 'phase-4-low-score');
  writePhase4Fixture(p4LowScore, ({ evidence }) => { evidence.reviews[0].scores.composition = 5; });
  result = validatePhaseCompletion({ root: p4LowScore, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /below 6\/10/u.test(item)), 'Phase 4 rejects any frame criterion below 6/10');

  const p4FarFromTarget = path.join(tmp, 'phase-4-far-from-target');
  writePhase4Fixture(p4FarFromTarget, ({ evidence }) => { evidence.reviews[0].targetComparison.distanceScore = 4; });
  result = validatePhaseCompletion({ root: p4FarFromTarget, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /target distance is below 6\/10/u.test(item)), 'Phase 4 rejects a frame that is too far from the approved target');

  const p4NoComparison = path.join(tmp, 'phase-4-no-target-comparison');
  writePhase4Fixture(p4NoComparison, ({ evidence }) => { evidence.reviews[0].targetComparison.differences = ['Only one difference was named.']; });
  result = validatePhaseCompletion({ root: p4NoComparison, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /three concrete differences/u.test(item)), 'Phase 4 rejects a generic review that does not compare against the target');

  const p4MissingTarget = path.join(tmp, 'phase-4-missing-screen-target');
  writePhase4Fixture(p4MissingTarget);
  const missingTargetManifestPath = path.join(p4MissingTarget, 'assets', 'target', 'screens', 'manifest.json');
  const missingTargetManifest = JSON.parse(fs.readFileSync(missingTargetManifestPath, 'utf8'));
  missingTargetManifest.states = missingTargetManifest.states.filter(item => item.state !== 'battle');
  fs.writeFileSync(missingTargetManifestPath, JSON.stringify(missingTargetManifest, null, 2));
  const missingTargetEvidencePath = path.join(p4MissingTarget, 'wiki', 'qa', 'phase-4-visual-evidence.json');
  const missingTargetEvidence = JSON.parse(fs.readFileSync(missingTargetEvidencePath, 'utf8'));
  missingTargetEvidence.screenTargets.sha256 = sha256File(missingTargetManifestPath);
  fs.writeFileSync(missingTargetEvidencePath, JSON.stringify(missingTargetEvidence, null, 2));
  result = validatePhaseCompletion({ root: p4MissingTarget, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /map every approved screen-flow state/u.test(item)), 'Phase 4 rejects a screen-flow state without its own target mapping');

  const p4MissingProvenance = path.join(tmp, 'phase-4-missing-target-provenance');
  writePhase4Fixture(p4MissingProvenance);
  const provenanceManifestFile = path.join(p4MissingProvenance, 'assets', 'target', 'screens', 'manifest.json');
  const provenanceManifest = JSON.parse(fs.readFileSync(provenanceManifestFile, 'utf8'));
  delete provenanceManifest.states.find(item => item.state === 'battle').references.mobile.provenance;
  fs.writeFileSync(provenanceManifestFile, JSON.stringify(provenanceManifest, null, 2));
  const provenanceEvidenceFile = path.join(p4MissingProvenance, 'wiki', 'qa', 'phase-4-visual-evidence.json');
  const provenanceEvidence = JSON.parse(fs.readFileSync(provenanceEvidenceFile, 'utf8'));
  provenanceEvidence.screenTargets.sha256 = sha256File(provenanceManifestFile);
  fs.writeFileSync(provenanceEvidenceFile, JSON.stringify(provenanceEvidence, null, 2));
  result = validatePhaseCompletion({ root: p4MissingProvenance, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /GPT Image generation provenance/u.test(item)),
    'Phase 4 rejects a dedicated screen blueprint without prompt/master-bound generation provenance');

  const p4InheritedTarget = path.join(tmp, 'phase-4-inherited-screen-target');
  writePhase4Fixture(p4InheritedTarget);
  const inheritTarget = spawnSync(process.execPath, [screenTargetsScript, '.', '--state', 'settings', '--description', 'Settings intentionally inherits the approved headquarters shell while changing only secondary controls and content.', '--inherit-from', 'hq'], { cwd: p4InheritedTarget, encoding: 'utf8' });
  const bindInherited = spawnSync(process.execPath, [bindVisualEvidenceScript, '.'], { cwd: p4InheritedTarget, encoding: 'utf8' });
  const recordInherited = spawnSync(process.execPath, [recordVisualReviewScript, '.'], { cwd: p4InheritedTarget, encoding: 'utf8' });
  result = validatePhaseCompletion({ root: p4InheritedTarget, phase: 4, evidence: p4Evidence });
  if (!(inheritTarget.status === 0 && bindInherited.status === 0 && recordInherited.status === 0 && result.ok)) {
    console.log('    inherited helper diagnostics:', JSON.stringify({
      target: { status: inheritTarget.status, stdout: inheritTarget.stdout, stderr: inheritTarget.stderr },
      bind: { status: bindInherited.status, stdout: bindInherited.stdout, stderr: bindInherited.stderr },
      review: { status: recordInherited.status, stdout: recordInherited.stdout, stderr: recordInherited.stderr },
      failures: result.failures,
    }, null, 2));
  }
  check(inheritTarget.status === 0 && bindInherited.status === 0 && recordInherited.status === 0 && result.ok,
    'canonical helpers hash an explicitly inherited screen blueprint and rebind the independent review');

  const p4Major = path.join(tmp, 'phase-4-major-defect');
  writePhase4Fixture(p4Major, ({ evidence }) => { evidence.reviews[1].defects = [{ severity: 'major', description: 'Primary action is obscured.' }]; });
  result = validatePhaseCompletion({ root: p4Major, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /Critical or Major/u.test(item)), 'Phase 4 rejects an open Critical or Major visual defect');

  const p4MissingViewport = path.join(tmp, 'phase-4-missing-viewport');
  writePhase4Fixture(p4MissingViewport, ({ capture, evidence }) => {
    capture.captures = capture.captures.filter(item => !(item.state === 'battle' && item.viewport === 'mobile'));
    capture.captureId = computeVisualCaptureId({ capturedAt: capture.capturedAt, captures: capture.captures });
    evidence.captureId = capture.captureId;
    evidence.reviews = evidence.reviews.filter(item => !(item.state === 'battle' && item.viewport === 'mobile'));
  });
  result = validatePhaseCompletion({ root: p4MissingViewport, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /exactly one mobile and one desktop|lacks mobile or desktop/u.test(item)), 'Phase 4 rejects a state missing one required viewport');

  const p4Stale = path.join(tmp, 'phase-4-stale');
  writePhase4Fixture(p4Stale, ({ capture, evidence }) => {
    capture.capturedAt = new Date(Date.now() - 60_000).toISOString();
    capture.captureId = computeVisualCaptureId({ capturedAt: capture.capturedAt, captures: capture.captures });
    evidence.captureId = capture.captureId;
    evidence.reviewedAt = new Date(Date.now() - 30_000).toISOString();
  });
  result = validatePhaseCompletion({ root: p4Stale, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /screenshots are stale/u.test(item)), 'Phase 4 rejects screenshots captured before the latest UI/style change');

  const p4AssetStale = path.join(tmp, 'phase-4-production-asset-stale');
  writePhase4Fixture(p4AssetStale);
  const changedAsset = path.join(p4AssetStale, 'assets', 'ui', 'scene.png');
  writeBuffer(p4AssetStale, 'assets/ui/scene.png', png(1024, 1024, 199));
  const futureAssetTime = new Date(Date.now() + 15_000);
  fs.utimesSync(changedAsset, futureAssetTime, futureAssetTime);
  result = validatePhaseCompletion({ root: p4AssetStale, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /screenshots are stale/u.test(item)),
    'Phase 4 recaptures after a production image/font/data visual input changes, not only after CSS changes');

  const p4FutureCapture = path.join(tmp, 'phase-4-future-capture');
  writePhase4Fixture(p4FutureCapture, ({ capture, evidence }) => {
    capture.capturedAt = new Date(Date.now() + 60_000).toISOString();
    capture.captureId = computeVisualCaptureId({ capturedAt: capture.capturedAt, captures: capture.captures });
    evidence.captureId = capture.captureId;
    evidence.reviewedAt = new Date(Date.parse(capture.capturedAt) + 1000).toISOString();
  });
  result = validatePhaseCompletion({ root: p4FutureCapture, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /implausibly in the future/u.test(item)),
    'Phase 4 rejects future-dated capture/review evidence');

  const p4BrokenPng = path.join(tmp, 'phase-4-header-only-png');
  const broken = writePhase4Fixture(p4BrokenPng);
  const brokenFrame = broken.capture.captures[0];
  const headerOnly = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(headerOnly);
  headerOnly.writeUInt32BE(412, 16); headerOnly.writeUInt32BE(915, 20);
  writeBuffer(p4BrokenPng, brokenFrame.file, headerOnly);
  result = validatePhaseCompletion({ root: p4BrokenPng, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /not a valid dimensioned PNG/u.test(item)),
    'Phase 4 rejects a fabricated PNG header without valid chunks, CRC and IDAT pixels');

  const p4SymlinkProject = path.join(tmp, 'phase-4-symlink-project');
  const p4SymlinkOutside = path.join(tmp, 'phase-4-symlink-outside');
  fs.mkdirSync(path.join(p4SymlinkProject, 'wiki'), { recursive: true });
  write(p4SymlinkOutside, 'phase-4-visual-evidence.json', JSON.stringify({ schemaVersion: 1, kind: 'forge.phase-4-visual-evidence', phase: 4 }));
  let symlinkChecked = false;
  try {
    fs.symlinkSync(p4SymlinkOutside, path.join(p4SymlinkProject, 'wiki', 'qa'), process.platform === 'win32' ? 'junction' : 'dir');
    const symlinkResult = validatePhase4VisualEvidence({ root: p4SymlinkProject });
    check(!symlinkResult.ok && symlinkResult.failures.some(item => /evidence is missing/u.test(item)),
      'Phase 4 rejects project-relative evidence paths that resolve through a symlink outside the project');
    symlinkChecked = true;
  } catch (error) {
    console.log(`  · symlink escape regression unavailable on this host: ${error.code || error.message}`);
  }
  if (!symlinkChecked) check(process.platform === 'win32', 'symlink escape regression is guarded on hosts that deny link creation');

  const p4HashMismatch = path.join(tmp, 'phase-4-hash-mismatch');
  writePhase4Fixture(p4HashMismatch, ({ evidence }) => { evidence.reviews[2].sha256 = '0'.repeat(64); });
  result = validatePhaseCompletion({ root: p4HashMismatch, phase: 4, evidence: p4Evidence });
  check(!result.ok && result.failures.some(item => /not bound to its captured screenshot/u.test(item)), 'Phase 4 rejects review evidence bound to a different screenshot hash');

  write(p4CssOnly, 'wiki/phases/phase-4.json', JSON.stringify({ state: 'complete', completionGate: { status: 'passed' } }));
  const falseClaimHook = spawnSync(process.execPath, [phaseVisualClaimHook], {
    cwd: p4CssOnly,
    input: JSON.stringify({ last_assistant_message: 'Фаза 4 завершена и готова.' }),
    encoding: 'utf8',
  });
  const falseClaimDecision = JSON.parse(falseClaimHook.stdout);
  check(falseClaimDecision.decision === 'block' && /visual gate/u.test(falseClaimDecision.reason),
    'Stop hook blocks a Phase 4 completion claim even when a stale marker says complete');

  for (const claim of ['Визуал принят.', 'Phase 4 PASS.', 'Четвёртая фаза пройдена.']) {
    const variantClaim = spawnSync(process.execPath, [phaseVisualClaimHook], {
      cwd: p4CssOnly,
      input: JSON.stringify({ last_assistant_message: claim }),
      encoding: 'utf8',
      env: { ...process.env, FORGE_SKIP_PHASE4_CLAIM_GATE: '1' },
    });
    check(JSON.parse(variantClaim.stdout).decision === 'block', `Stop hook recognizes and blocks false completion wording: ${claim}`);
  }

  write(p4, 'wiki/phases/phase-4.json', JSON.stringify({ state: 'complete', completionGate: { status: 'passed' } }));
  const validClaimHook = spawnSync(process.execPath, [phaseVisualClaimHook], {
    cwd: p4,
    input: JSON.stringify({ last_assistant_message: 'Фаза 4 завершена и принята по визуальному гейту.' }),
    encoding: 'utf8',
  });
  check(JSON.parse(validClaimHook.stdout).continue === true, 'Stop hook permits a Phase 4 completion claim only after executable evidence passes');

  const negativeClaimHook = spawnSync(process.execPath, [phaseVisualClaimHook], {
    cwd: p4CssOnly,
    input: JSON.stringify({ last_assistant_message: 'Фаза 4 не завершена: визуальная приёмка отклонена.' }),
    encoding: 'utf8',
  });
  check(JSON.parse(negativeClaimHook.stdout).continue === true, 'Stop hook does not block an explicit rejection/status explanation');

  const p5 = path.join(tmp, 'phase-5-valid');
  write(p5, '.forge-ai.json', '{}\n');
  write(p5, 'wiki/qa/phase-5-tech.md', prose('Phase 5 technical gate', 'PASS SDK lifecycle ads mobile touch and AI configuration checks.'));
  write(p5, 'WorkProgress/demo/index.html', `<style>canvas{touch-action:none;padding-top:env(safe-area-inset-top)}</style><script>
    YaGames.init(); LoadingAPI.ready(); GameplayAPI.start(); GameplayAPI.stop();
    ysdk.adv.showRewardedVideo(); addEventListener('pointerdown',()=>{});
  </script>`);
  result = validatePhaseCompletion({ root: p5, phase: 5, evidence: ['.forge-ai.json', 'wiki/qa/phase-5-tech.md'] });
  check(result.ok, 'Phase 5 accepts only source-backed SDK/mobile/ads lifecycle evidence');

  const p6 = path.join(tmp, 'phase-6-valid');
  write(p6, 'SETUP_GUIDE.md', prose('SETUP GUIDE', 'Console upload languages listing category rating ads screenshots video checklist references.'));
  write(p6, 'wiki/qa/phase-6-listing.md', prose('Phase 6 listing gate', 'PASS listing schema screenshots promo video and i18n checks.'));
  write(p6, 'store-listing-ru.json', JSON.stringify({ lang: 'ru', title: 'Игра', subtitle: 'Короткое описание игры', description: 'Описание '.repeat(20), keywords: ['игра'] }));
  writeBuffer(p6, 'screens/store/screen-1.png', png());
  writeBuffer(p6, 'screens/video/promo.mp4', mp4());
  write(p6, 'WorkProgress/demo/app.js', `const I18N={ru:{start:'Старт'}}; function t(k){return I18N.ru[k]}`);
  result = validatePhaseCompletion({ root: p6, phase: 6, evidence: ['SETUP_GUIDE.md', 'wiki/qa/phase-6-listing.md'] });
  check(result.ok, 'Phase 6 requires listing JSON, real promo media and i18n implementation');

  const p7 = path.join(tmp, 'phase-7-valid');
  write(p7, 'wiki/testing.md', prose('Testing', 'PASS functional mobile runtime balance and persistence verification.'));
  write(p7, 'wiki/qa/phase-7-report.md', prose('Phase 7 QA', 'PASS visual QA playtest local stage and state diversity.'));
  write(p7, 'WorkProgress/demo/index.html', '<!doctype html><canvas></canvas><script>requestAnimationFrame(()=>{});</script>');
  write(p7, 'WorkProgress/demo/playtest-out/report.json', JSON.stringify({ rafAlive: true, errors: [], actions: ['clicked start'] }));
  write(p7, 'WorkProgress/demo/stage-out/rt.json', JSON.stringify({ errors: [], rt: { _readyCalled: true, _i18nRead: 'ru' } }));
  result = validatePhaseCompletion({ root: p7, phase: 7, evidence: ['wiki/testing.md', 'wiki/qa/phase-7-report.md'] });
  check(result.ok, 'Phase 7 accepts concrete reports backed by clean playtest and local-stage JSON');
  fs.mkdirSync(path.join(tmp, 'phase-7-directory', 'wiki', 'qa'), { recursive: true });
  result = validatePhaseCompletion({ root: path.join(tmp, 'phase-7-directory'), phase: 7, evidence: ['wiki/qa'] });
  check(!result.ok && result.failures.some(item => /not a regular file/.test(item)), 'Phase 7 no longer accepts a directory as completion evidence');

  const p8 = path.join(tmp, 'phase-8-valid');
  write(p8, 'wiki/deploy-log.md', prose('Deploy log', 'release-ready TOTAL: 84 pass, 0 fail, 2 warn. Manual checklist recorded.'));
  write(p8, 'SETUP_GUIDE.md', prose('SETUP GUIDE', 'Upload archive and complete the manual Console checklist after GREEN.'));
  for (const suffix of ['', '-debug', '-marketing']) writeBuffer(p8, `Release/demo/yandex/demo-v1.2.0${suffix}.zip`, zip());
  result = validatePhaseCompletion({ root: p8, phase: 8, evidence: ['wiki/deploy-log.md', 'SETUP_GUIDE.md'] });
  check(result.ok, 'Phase 8 requires exact GREEN evidence and one complete release ZIP trio');
  fs.rmSync(path.join(p8, 'Release', 'demo', 'yandex', 'demo-v1.2.0-marketing.zip'));
  result = validatePhaseCompletion({ root: p8, phase: 8, evidence: ['wiki/deploy-log.md', 'SETUP_GUIDE.md'] });
  check(!result.ok && result.failures.some(item => /ZIP trio/.test(item)), 'Phase 8 rejects an incomplete release variant set');

  const p9 = path.join(tmp, 'phase-9-valid');
  write(p9, 'wiki/metrics.md', prose('Live metrics', 'D7 plan 10% fact 9%. D30 plan 4% actual 3%. CTR and rating facts recorded.'));
  result = validatePhaseCompletion({ root: p9, phase: 9, evidence: ['wiki/metrics.md'] });
  check(result.ok, 'Phase 9 requires plan-vs-fact D7/D30 and CTR/rating evidence');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) process.exit(1);
console.log('\nPASS: phase completion is evidence-bound and early experimental checkpoints stay local');
