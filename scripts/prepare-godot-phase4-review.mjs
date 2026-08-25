#!/usr/bin/env node
/** Create a reject-by-default independent review template from current native Godot evidence. */
import fs from 'node:fs';
import path from 'node:path';
import { readTrustedProjectEngine } from '../.claude/skills/status/references/project-engine.mjs';
import {
  captureReceiptPayload,
  proofReceiptPayload,
  sha256File,
} from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { verifyVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';

const projectRoot = fs.realpathSync(path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.'));
const outputRel = 'screens/review/phase-4-visual-evidence.template.json';

function safeFile(rel, required = true) {
  const normalized = String(rel || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error(`Unsafe project-relative path: ${rel}`);
  try {
    const absolute = fs.realpathSync(path.resolve(projectRoot, normalized));
    const inside = path.relative(projectRoot, absolute);
    if (inside.startsWith('..') || path.isAbsolute(inside) || !fs.statSync(absolute).isFile()) throw new Error('outside project');
    return { path: normalized, absolute };
  } catch (error) {
    if (!required) return null;
    throw new Error(`Missing project file: ${normalized}`);
  }
}

function readJson(rel) {
  const file = safeFile(rel);
  try { return { file, value: JSON.parse(fs.readFileSync(file.absolute, 'utf8')) }; }
  catch (error) { throw new Error(`Invalid JSON ${file.path}: ${error.message}`); }
}

function binding(rel, required = true) {
  const file = safeFile(rel, required);
  return file ? { path: file.path, sha256: sha256File(file.absolute) } : { path: String(rel), sha256: '' };
}

try {
  const engine = readTrustedProjectEngine(projectRoot);
  if (engine.engine !== 'godot' || engine.capabilities?.visualCapture !== true || engine.capabilities?.proofVideo !== true) {
    throw new Error('Godot Phase 4 capture/proof capabilities are not installed');
  }
  const { file: captureFile, value: capture } = readJson('screens/review/capture-manifest.json');
  const { file: proofFile, value: proof } = readJson('screens/review/proof-video-manifest.json');
  const { value: targets } = readJson('assets/target/screens/manifest.json');
  if (capture.generatedBy !== 'godot-screens-shoot.mjs' || capture.captureMode !== 'forge-godot-runtime-adapter'
    || capture.engine?.name !== 'godot' || capture.engine?.testHarness !== false
    || !capture.captureReceiptId || capture.runtimeErrors?.length || capture.missingStates?.length) {
    throw new Error('Native Godot screenshot capture is incomplete or unreceipted');
  }
  if (proof.generatedBy !== 'godot-proof-video.mjs' || proof.kind !== 'forge.godot-proof-video'
    || proof.engine?.name !== 'godot' || proof.engine?.testHarness !== false
    || proof.verdict !== 'pass' || !proof.proofId || !proof.proofReceiptId || proof.runtimeErrors?.length
    || proof.video?.indexValidated !== true
    || proof.thresholds?.actualUniqueVideoFrames < proof.thresholds?.minimumUniqueVideoFrames) {
    throw new Error('Native Godot proof video is incomplete or unreceipted');
  }
  const captureReceipt = verifyVisualReceipt({ projectRoot, kind: 'capture', receiptId: capture.captureReceiptId,
    expectedPayload: captureReceiptPayload({ manifestPath: captureFile.path, manifest: capture }) });
  if (!captureReceipt.ok) throw new Error(`Native Godot capture receipt rejected: ${captureReceipt.failure || captureReceipt.code}`);
  const proofReceipt = verifyVisualReceipt({ projectRoot, kind: 'proof', receiptId: proof.proofReceiptId,
    expectedPayload: proofReceiptPayload({ manifestPath: proofFile.path, manifest: proof }) });
  if (!proofReceipt.ok) throw new Error(`Native Godot proof receipt rejected: ${proofReceipt.failure || proofReceipt.code}`);
  if (JSON.stringify(capture.builder || null) !== JSON.stringify(proof.builder || null)) throw new Error('Capture and proof builder identities differ');
  if (capture.implementationSnapshot?.sha256 !== proof.implementationSnapshot?.sha256) throw new Error('Capture and proof implementation snapshots differ');
  const targetFor = (state, viewport) => targets.states?.find(item => item?.state === state)?.references?.[viewport] || null;
  const captures = Array.isArray(capture.captures) ? capture.captures : [];
  for (const frame of captures) if (!targetFor(frame.state, frame.viewport)) throw new Error(`Missing approved target for ${frame.state}::${frame.viewport}`);

  const evidence = {
    schemaVersion: 1,
    kind: 'forge.phase-4-visual-evidence',
    phase: 4,
    captureManifest: 'screens/review/capture-manifest.json',
    captureId: capture.captureId,
    captureReceiptId: capture.captureReceiptId,
    nativeProof: {
      manifest: binding('screens/review/proof-video-manifest.json'),
      proofId: proof.proofId,
      proofReceiptId: proof.proofReceiptId,
      video: { path: proof.video.file, sha256: proof.video.sha256 },
      samples: (proof.samples || []).map(sample => ({ frame: sample.frame, state: sample.state, path: sample.file, sha256: sample.sha256 })),
    },
    targetFrame: binding('assets/target/target-frame.png'),
    screenTargets: binding('assets/target/screens/manifest.json'),
    styleBible: binding('assets/style/STYLE-BIBLE.md'),
    report: binding('wiki/qa/phase-4-visual-review.md', false),
    builder: capture.builder,
    reviewer: { id: '', sessionId: '', mode: 'independent' },
    reviewedAt: '',
    coverage: {
      expectedStates: capture.requestedStates || [],
      capturedStates: capture.states || [],
      missingStates: capture.missingStates || [],
      complete: !capture.missingStates?.length && (capture.states || []).length === (capture.requestedStates || []).length,
    },
    minimumScore: 6,
    verdict: 'reject',
    summary: '',
    verification: {
      capture: { command: capture.command, exitCode: 0 },
      proof: { command: proof.command, exitCode: 0 },
    },
    reviews: captures.map(frame => {
      const target = targetFor(frame.state, frame.viewport);
      return {
        state: frame.state,
        viewport: frame.viewport,
        file: frame.file,
        sha256: frame.sha256,
        verdict: 'reject',
        scores: { composition: 0, hierarchy: 0, readability: 0, styleMatch: 0, responsiveness: 0 },
        targetComparison: { targetPath: target.path, targetSha256: target.sha256, distanceScore: 0, matches: [], differences: [] },
        critique: '',
        defects: [],
      };
    }),
    proofReview: {
      verdict: 'reject',
      videoWatched: false,
      statesObserved: [],
      samplesReviewed: [],
      motionScore: 0,
      critique: '',
      defects: [],
    },
  };
  const output = path.join(projectRoot, ...outputRel.split('/'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(evidence, null, 2)}\n`);
  fs.renameSync(temp, output);
  console.log(`[OK] Godot Phase 4 independent review template: ${outputRel}`);
  console.log('     Template is reject-by-default; a different host session must inspect every frame, sample and proof video.');
} catch (error) {
  console.error(`[X] ${error.message}`);
  process.exit(1);
}
