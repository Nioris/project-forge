#!/usr/bin/env node
/** Record the independent reviewer identity in the trusted engine store and close Phase 4 evidence. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  captureReceiptPayload,
  currentVisualRuntimeIdentity,
  proofReceiptPayload,
  reviewReceiptPayload,
  validatePhase4VisualEvidence,
} from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { recordVisualReceipt, verifyVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';
import { readTrustedProjectEngine } from '../.claude/skills/status/references/project-engine.mjs';
import { appendProductTelemetryEvent, refreshProductTelemetry } from '../.claude/skills/status/references/product-telemetry.mjs';

const projectRoot = fs.realpathSync(path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.'));
const evidenceRel = 'wiki/qa/phase-4-visual-evidence.json';
const evidenceFile = path.join(projectRoot, ...evidenceRel.split('/'));

function safeFile(rel) {
  const normalized = String(rel || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error(`Unsafe project-relative path: ${rel}`);
  const absolute = fs.realpathSync(path.resolve(projectRoot, normalized));
  const inside = path.relative(projectRoot, absolute);
  if (inside.startsWith('..') || path.isAbsolute(inside) || !fs.statSync(absolute).isFile()) throw new Error(`Missing project file: ${normalized}`);
  return { path: normalized, absolute };
}

try {
  const engine = readTrustedProjectEngine(projectRoot);
  const identity = currentVisualRuntimeIdentity();
  if (!identity) throw new Error('No trusted host session identity. Run the independent review from a Forge/Codex/Claude task, not an anonymous shell.');
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  const captureFile = safeFile(evidence.captureManifest);
  const capture = JSON.parse(fs.readFileSync(captureFile.absolute, 'utf8'));
  const captureReceipt = verifyVisualReceipt({
    projectRoot,
    kind: 'capture',
    receiptId: capture.captureReceiptId,
    expectedPayload: captureReceiptPayload({ manifestPath: captureFile.path, manifest: capture }),
  });
  if (!captureReceipt.ok) throw new Error(`Trusted capture receipt rejected: ${captureReceipt.failure || captureReceipt.code}`);
  if (String(capture.builder?.sessionId || '').toLowerCase() === identity.sessionId.toLowerCase()) {
    throw new Error('Independent review must run in a different host task/session from the builder capture.');
  }
  if (engine.engine === 'godot') {
    const proofFile = safeFile(evidence.nativeProof?.manifest?.path || 'screens/review/proof-video-manifest.json');
    const proof = JSON.parse(fs.readFileSync(proofFile.absolute, 'utf8'));
    const proofReceipt = verifyVisualReceipt({
      projectRoot,
      kind: 'proof',
      receiptId: proof.proofReceiptId,
      expectedPayload: proofReceiptPayload({ manifestPath: proofFile.path, manifest: proof }),
    });
    if (!proofReceipt.ok) throw new Error(`Trusted Godot proof receipt rejected: ${proofReceipt.failure || proofReceipt.code}`);
    if (evidence.nativeProof?.proofId !== proof.proofId || evidence.nativeProof?.proofReceiptId !== proof.proofReceiptId) {
      throw new Error('Godot review evidence is not bound to the current proof ID/receipt');
    }
    if (JSON.stringify(proof.builder || null) !== JSON.stringify(capture.builder || null)) {
      throw new Error('Godot capture and proof builder identities differ');
    }
    if (String(proof.builder?.sessionId || '').toLowerCase() === identity.sessionId.toLowerCase()) {
      throw new Error('Independent review must run in a different host task/session from the proof builder.');
    }
  }
  evidence.captureId = capture.captureId;
  evidence.captureReceiptId = capture.captureReceiptId;
  evidence.builder = capture.builder;
  evidence.reviewer = { ...identity, mode: 'independent' };
  evidence.reviewedAt = new Date().toISOString();
  delete evidence.reviewReceiptId;
  const payload = reviewReceiptPayload({ evidencePath: evidenceRel, evidence });
  const recorded = recordVisualReceipt({ projectRoot, kind: 'review', payload });
  evidence.reviewReceiptId = recorded.receipt.receiptId;
  const temp = `${evidenceFile}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, evidenceFile);

  const result = validatePhase4VisualEvidence({ root: projectRoot });
  try {
    const defects = [...(evidence.reviews || []).flatMap(review => review.defects || []), ...(evidence.proofReview?.defects || [])];
    const unique = new Map(defects.filter(defect => defect?.summary).map(defect => {
      const severity = ['critical', 'major', 'minor'].includes(String(defect.severity || '').toLowerCase())
        ? String(defect.severity).toLowerCase() : 'unclassified';
      const fingerprint = createHash('sha256').update(`${severity}\0${defect.summary}`).digest('hex').slice(0, 20);
      return [fingerprint, { severity, fingerprint }];
    }));
    for (const defect of unique.values()) appendProductTelemetryEvent(projectRoot, {
      type: 'defect', at: evidence.reviewedAt, severity: defect.severity, stage: 'pre_release',
      fingerprint: defect.fingerprint, source: 'phase-4-review',
    });
    if (evidence.verdict === 'reject' || !result.ok) appendProductTelemetryEvent(projectRoot, {
      type: 'repair', at: evidence.reviewedAt, category: 'product', code: 'PHASE4_VISUAL_REJECT',
      fingerprint: evidence.reviewReceiptId,
    });
    refreshProductTelemetry(projectRoot);
  } catch (error) {
    console.warn(`[Forge Metrics] visual review telemetry unavailable: ${String(error?.message || error).slice(0, 500)}`);
  }
  if (!result.ok) {
    console.error('[X] Review receipt recorded, but Phase 4 evidence is still rejected:');
    for (const failure of result.failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`[OK] Independent Phase 4 review receipt: ${evidence.reviewReceiptId}`);
  console.log(`     ${result.frames} frames across ${result.states.length} approved states`);
} catch (error) {
  console.error(`[X] ${error.message}`);
  process.exit(1);
}
