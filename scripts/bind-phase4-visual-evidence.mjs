#!/usr/bin/env node
/** Refresh machine hashes/paths after an independent reviewer has authored Phase 4 evidence. */
import fs from 'node:fs';
import path from 'node:path';
import { sha256File } from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { readTrustedProjectEngine } from '../.claude/skills/status/references/project-engine.mjs';

const args = process.argv.slice(2);
const projectRoot = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : '';
};
const canonicalRel = 'wiki/qa/phase-4-visual-evidence.json';
const canonical = path.join(projectRoot, ...canonicalRel.split('/'));
const reportRel = 'wiki/qa/phase-4-visual-review.md';
const report = path.join(projectRoot, ...reportRel.split('/'));

function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, target);
}

function pendingReport(evidence) {
  const captureId = String(evidence?.captureId || 'unknown');
  const proofId = String(evidence?.nativeProof?.proofId || 'not-applicable');
  return `# Phase 4 visual review — pending\n\n`
    + `Status: **PENDING INDEPENDENT REVIEW**\n\n`
    + `This neutral hand-off belongs to capture \`${captureId}\` and proof \`${proofId}\`. `
    + 'It intentionally contains no prior verdict, scores, critique, or defects. The independent reviewer must inspect '
    + 'the current live pixels, exact targets, and native proof before replacing this file and the canonical evidence JSON. '
    + 'Earlier review prose must not be reconstructed or reused.\n';
}

function safeFile(rel) {
  const normalized = String(rel || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error(`Unsafe project-relative path: ${rel}`);
  const realRoot = fs.realpathSync(projectRoot);
  const absolute = fs.realpathSync(path.resolve(realRoot, normalized));
  const inside = path.relative(realRoot, absolute);
  if (inside.startsWith('..') || path.isAbsolute(inside) || !fs.statSync(absolute).isFile()) throw new Error(`File not found inside project: ${normalized}`);
  return { path: normalized, absolute };
}

function binding(rel) {
  const file = safeFile(rel);
  return { path: file.path, sha256: sha256File(file.absolute) };
}

try {
  const engine = readTrustedProjectEngine(projectRoot);
  const init = option('init');
  if (init) {
    const source = safeFile(init);
    const freshEvidence = JSON.parse(fs.readFileSync(source.absolute, 'utf8'));
    atomicWrite(canonical, `${JSON.stringify(freshEvidence, null, 2)}\n`);
    atomicWrite(report, pendingReport(freshEvidence));
    console.log(`[OK] Reset ${canonicalRel} from ${source.path}`);
    console.log(`[OK] Reset ${reportRel} to a neutral pending-review hand-off`);
  }
  if (!fs.existsSync(canonical)) throw new Error(`Missing ${canonicalRel}; pass --init <screens/review/...template.json> or create the reviewed evidence first`);
  const evidence = JSON.parse(fs.readFileSync(canonical, 'utf8'));
  const captureFile = safeFile(evidence.captureManifest);
  const capture = JSON.parse(fs.readFileSync(captureFile.absolute, 'utf8'));
  if (engine.engine === 'godot') {
    if (capture.generatedBy !== 'godot-screens-shoot.mjs' || capture.captureMode !== 'forge-godot-runtime-adapter') {
      throw new Error('Godot review requires a native godot-screens-shoot.mjs capture manifest');
    }
  } else if (capture.generatedBy !== 'screens-shoot.mjs' || capture.captureMode !== 'forge-runtime-adapter') {
    throw new Error('Web review requires a browser screens-shoot.mjs runtime-adapter capture manifest');
  }
  const targetManifestFile = safeFile('assets/target/screens/manifest.json');
  const targetManifest = JSON.parse(fs.readFileSync(targetManifestFile.absolute, 'utf8'));
  const targetFor = (state, viewport) => targetManifest.states?.find(item => item?.state === state)?.references?.[viewport] || null;
  const captured = new Map((capture.captures || []).map(item => [`${item.state}::${item.viewport}`, item]));
  const currentTargetFrame = binding('assets/target/target-frame.png');
  const currentScreenTargets = binding('assets/target/screens/manifest.json');
  const currentStyleBible = binding('assets/style/STYLE-BIBLE.md');
  const sameReviewInputs = evidence.captureId === capture.captureId
    && evidence.captureReceiptId === capture.captureReceiptId
    && JSON.stringify(evidence.targetFrame || null) === JSON.stringify(currentTargetFrame)
    && JSON.stringify(evidence.screenTargets || null) === JSON.stringify(currentScreenTargets)
    && JSON.stringify(evidence.styleBible || null) === JSON.stringify(currentStyleBible);
  let resetOverallReview = !sameReviewInputs;

  evidence.captureId = capture.captureId;
  evidence.captureReceiptId = capture.captureReceiptId;
  evidence.builder = capture.builder;
  delete evidence.reviewReceiptId;
  evidence.targetFrame = currentTargetFrame;
  evidence.screenTargets = currentScreenTargets;
  evidence.styleBible = currentStyleBible;
  evidence.report = binding(reportRel);
  if (engine.engine === 'godot') {
    const proofFile = safeFile('screens/review/proof-video-manifest.json');
    const proof = JSON.parse(fs.readFileSync(proofFile.absolute, 'utf8'));
    if (proof.generatedBy !== 'godot-proof-video.mjs' || proof.kind !== 'forge.godot-proof-video'
      || proof.verdict !== 'pass' || !proof.proofId || !proof.proofReceiptId) {
      throw new Error('Godot review requires a passed, receipted godot-proof-video.mjs manifest');
    }
    if (JSON.stringify(proof.builder || null) !== JSON.stringify(capture.builder || null)) {
      throw new Error('Godot capture and proof builder identities differ');
    }
    const sameProof = evidence.nativeProof?.proofId === proof.proofId
      && evidence.nativeProof?.proofReceiptId === proof.proofReceiptId;
    evidence.nativeProof = {
      manifest: binding('screens/review/proof-video-manifest.json'),
      proofId: proof.proofId,
      proofReceiptId: proof.proofReceiptId,
      video: { path: proof.video.file, sha256: proof.video.sha256 },
      samples: (proof.samples || []).map(sample => ({ frame: sample.frame, state: sample.state, path: sample.file, sha256: sample.sha256 })),
    };
    if (!sameProof) {
      resetOverallReview = true;
      evidence.proofReview = {
        verdict: 'reject',
        videoWatched: false,
        statesObserved: [],
        samplesReviewed: [],
        motionScore: 0,
        critique: '',
        defects: [],
      };
    }
    evidence.verification = {
      // The producer manifests intentionally retain the exact low-level Godot invocations.
      // Phase evidence records the public Forge entry points that created those manifests;
      // otherwise the binder and checker disagree even though both producers succeeded.
      capture: {
        command: 'node ../project-forge/scripts/godot-screens-shoot.mjs . --json',
        exitCode: capture.runtimeErrors?.length || capture.missingStates?.length ? 1 : 0,
      },
      proof: {
        command: 'node ../project-forge/scripts/godot-proof-video.mjs . --json',
        exitCode: proof.verdict === 'pass' && !proof.runtimeErrors?.length ? 0 : 1,
      },
    };
  } else {
    delete evidence.nativeProof;
    delete evidence.proofReview;
  }
  for (const review of evidence.reviews || []) {
    const key = `${review.state}::${review.viewport}`;
    const frame = captured.get(key);
    const target = targetFor(review.state, review.viewport);
    if (!frame || !target) throw new Error(`No capture/target binding for review ${key}`);
    const reviewMatchesInputs = sameReviewInputs && review.file === frame.file && review.sha256 === frame.sha256
      && review.targetComparison?.targetPath === target.path
      && review.targetComparison?.targetSha256 === target.sha256;
    if (!reviewMatchesInputs) {
      resetOverallReview = true;
      review.verdict = 'reject';
      review.scores = { composition: 0, hierarchy: 0, readability: 0, styleMatch: 0, responsiveness: 0 };
      review.targetComparison = { targetPath: target.path, targetSha256: target.sha256, distanceScore: 0, matches: [], differences: [] };
      review.critique = '';
      review.defects = [];
    }
    review.file = frame.file;
    review.sha256 = frame.sha256;
    review.targetComparison = review.targetComparison && typeof review.targetComparison === 'object' ? review.targetComparison : {};
    review.targetComparison.targetPath = target.path;
    review.targetComparison.targetSha256 = target.sha256;
  }
  if (resetOverallReview) {
    evidence.verdict = 'reject';
    evidence.summary = '';
    evidence.reviewer = { id: '', sessionId: '', mode: 'independent' };
    evidence.reviewedAt = '';
  }
  atomicWrite(canonical, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[OK] Bound Phase 4 visual evidence to current capture/targets/report hashes`);
  console.log(`     ${canonicalRel}`);
  console.log('     Next: run check-phase4-visual-evidence.mjs; binding does not grant a PASS verdict.');
} catch (error) {
  console.error(`[X] ${error.message}`);
  process.exit(1);
}
